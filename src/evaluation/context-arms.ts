import { digest } from '../contracts/canonical.js';
import { createContractFixtures } from '../../fixtures/contracts.js';
import { MemoryStore, sourceContentDigest, type MemoryNamespace } from '../memory/index.js';
import { buildContextWindow, compactContextWindow, pinContextPredecessor, validateContextWindow, type ContextAuthority, type ContextWindow } from '../context/engine.js';
import { isWithinScope } from '../foundation/permissions.js';
import type { SemanticCase, SemanticDocument } from './dataset.js';

export type ContextArm = 'full' | 'retrieval' | 'compaction';
export interface PreparedContext {
  window: ContextWindow; authority: ContextAuthority; selected: SemanticDocument[];
  eligibleIds: string[]; retrievedIds: string[]; sourceByRef: Map<string, SemanticDocument>;
}
export function eligibleDocuments(documents: readonly SemanticDocument[], task: SemanticCase, distractors: number): SemanticDocument[] {
  let used = 0;
  return documents.filter(d => d.repoId === task.repoId && d.taskClass === task.taskClass && isWithinScope(d.path, task.allowedPaths)
    && d.lifecycle === 'active' && d.freshness === 'fresh' && (!d.distractor || used++ < distractors));
}
/** Corpus-only Memory ingestion. The oracle and answer labels cannot cross this interface. */
export async function prepareContext(options: {
  root: string; documents: readonly SemanticDocument[]; task: SemanticCase; arm: ContextArm;
  role: 'planner' | 'executor'; modelConfigVersion: string; distractors: number; topK: number; trialId: string;
}): Promise<PreparedContext> {
  const { task } = options;
  const eligible = eligibleDocuments(options.documents, task, options.distractors);
  const namespace: MemoryNamespace = { repoId: task.repoId, branchId: 'semantic-fixture', lineageId: options.trialId,
    allowedPaths: task.allowedPaths, taskClasses: [task.taskClass] };
  const memory = new MemoryStore(options.root, { namespaces: [namespace],
    principals: [{ id: 'fixture-importer', role: 'memoryPromoter', projectIds: [task.repoId] }] });
  const sourceByRef = new Map<string, SemanticDocument>();
  try {
    for (const d of eligible) {
      const n = memory.ingest({ record: { schemaVersion: '0.5.0', sourceId: d.id, sourceType: 'document', sourceRef: d.path,
        sourceRevision: d.revision, contentDigest: sourceContentDigest(d.text), observedAt: '2026-09-25T00:00:00.000Z', freshnessPolicy: 'pinned', freshness: 'fresh' },
      content: d.text, namespace, provenance: { kind: 'primary', originId: d.id }, purpose: 'knowledge' }, 'fixture-importer');
      sourceByRef.set(n.id, d);
    }
    const retrieved = memory.query({ namespace, text: task.query, limit: options.topK, expandHops: 0 });
    const selected = options.arm === 'full' ? eligible : retrieved.map(n => sourceByRef.get(n.id)!);
    const canonical = createContractFixtures().TaskSpec;
    canonical.taskId = task.id; canonical.repoId = task.repoId; canonical.taskClass = task.taskClass;
    canonical.allowedPaths = task.allowedPaths; canonical.baseRevision = 'sealed-semantic-candidate'; canonical.goal = task.question;
    canonical.constraints = task.constraints.map(c => ({ id: c.id, description: c.description, sourceRevision: c.revision,
      contentHash: digest(c.description), applicability: { taskClasses: [task.taskClass], required: true, reason: 'Canonical public task constraint' } }));
    canonical.acceptanceCriteria = [{ criterionId: 'evidence-grounded-answer', description: 'Answer only with applicable fresh evidence; preserve constraints and abstain on unresolved evidence.', checkRefs: ['semantic-score', 'independent-human-review'] }];
    // A local safety ceiling only. Exact provider counting of the whole wire payload happens before every request.
    canonical.budget = { schemaVersion: '0.5.0', modelConfigVersion: options.modelConfigVersion,
      inputLimit: 1_000_000, outputReserve: 1000, headroom: 1000,
      tokenAccountingPolicy: { version: 'local-wire-safety/1', tokenizer: 'utf8-bytes/1', includeToolOutputs: true }, taskSpendLimit: { amount: 0, currency: 'USD' } };
    const scope = { repoId: namespace.repoId, allowedPaths: namespace.allowedPaths, taskClasses: namespace.taskClasses };
    const authority: ContextAuthority = { task: canonical, contextPolicyVersion: 'semantic-context-comparison/1',
      snapshotId: digest(eligible), memoryVersion: memory.memoryVersion,
      model: { modelConfigVersion: options.modelConfigVersion, inputLimit: 1_000_000, maxOutputTokens: 1000 },
      agents: [{ agentId: options.role, role: options.role, scope, branchId: namespace.branchId, lineageId: namespace.lineageId,
        budget: canonical.budget, mandatoryResourceRefs: [], unknowns: task.unknowns }],
      resources: selected.map(d => ({ ref: d.id, revision: d.revision, contentHash: sourceContentDigest(d.text), kind: 'evidence',
        scope, branchId: namespace.branchId, lineageId: namespace.lineageId, status: 'active', trust: 'untrusted-data', sourceRefs: [d.id], dependencies: [] })),
    };
    const window = await buildContextWindow(authority, { windowId: `${options.trialId}:window:0`, agentId: options.role,
      resourceRefs: selected.map(d => ({ ref: d.id, required: true })), history: task.history }, p => selected.find(d => d.id === p.ref)!.text);
    return { window, authority, selected, eligibleIds: eligible.map(d => d.id), retrievedIds: retrieved.map(n => sourceByRef.get(n.id)!.id), sourceByRef };
  } finally { memory.close(); }
}

export async function applyCompaction(prepared: PreparedContext, summary: string, windowId: string): Promise<PreparedContext> {
  const authority = structuredClone(prepared.authority);
  authority.predecessors = [pinContextPredecessor(prepared.window)];
  const window = await compactContextWindow(prepared.window, authority, { summary, windowId }, p => prepared.selected.find(d => d.id === p.ref)!.text);
  const checked = validateContextWindow(window, authority);
  if (checked.status !== window.status) throw new Error('COMPACTION_VALIDATION_DRIFT');
  return { ...prepared, authority, window };
}
