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
  retrievalDiagnostics: { retrieved10Ids: string[]; candidateIds: string[]; selectionPolicy: 'public-critical-raw-anchor-mmr/1';
    selectionMode: 'critical-unknown-lexical' | 'anchored-query-question-mmr'; rawAnchorCount: number;
    connectionColdMs: number; warmMs: number[]; cacheScope: 'fresh-sqlite-connection-not-os-cold' };
}
export function eligibleDocuments(documents: readonly SemanticDocument[], task: SemanticCase, distractors: number): SemanticDocument[] {
  let used = 0;
  return documents.filter(d => d.repoId === task.repoId && d.taskClass === task.taskClass && isWithinScope(d.path, task.allowedPaths)
    && d.lifecycle === 'active' && d.freshness === 'fresh' && (!d.distractor || used++ < distractors));
}
/** Shared construction lets acceptance recheck every stored generation against the canonical task. */
export function semanticTaskSpec(task: SemanticCase, modelConfigVersion: string) {
  const canonical = createContractFixtures().TaskSpec;
  canonical.taskId = task.id; canonical.repoId = task.repoId; canonical.taskClass = task.taskClass;
  canonical.allowedPaths = task.allowedPaths; canonical.baseRevision = 'sealed-semantic-candidate'; canonical.goal = task.question;
  canonical.constraints = task.constraints.map(c => ({ id: c.id, description: c.description, sourceRevision: c.revision,
    contentHash: digest(c.description), applicability: { taskClasses: [task.taskClass], required: true, reason: 'Canonical public task constraint' } }));
  canonical.acceptanceCriteria = [{ criterionId: 'evidence-grounded-answer', description: 'Answer only with applicable fresh evidence; preserve constraints and abstain on unresolved evidence.', checkRefs: ['semantic-score', 'independent-human-review'] }];
  canonical.budget = { schemaVersion: '0.5.0', modelConfigVersion, inputLimit: 1_000_000, outputReserve: 1000, headroom: 1000,
    tokenAccountingPolicy: { version: 'local-wire-safety/1', tokenizer: 'utf8-bytes/1', includeToolOutputs: true }, taskSpendLimit: { amount: 0, currency: 'USD' } };
  return canonical;
}
const publicTerms = (text: string): Set<string> => new Set((text.toLocaleLowerCase().match(/[\p{L}\p{N}_]+/gu) ?? []));
const overlap = (left: ReadonlySet<string>, right: ReadonlySet<string>): number => {
  let shared = 0;
  for (const term of left) if (right.has(term)) shared++;
  return shared;
};
const jaccard = (left: ReadonlySet<string>, right: ReadonlySet<string>): number => {
  if (!left.size && !right.size) return 0;
  return overlap(left, right) / new Set([...left, ...right]).size;
};
/** Selects complementary public source text without evaluator labels or source metadata. */
export function selectPublicEvidence(candidates: readonly SemanticDocument[], query: string, limit: number, question = '', rawAnchorCount = 0): SemanticDocument[] {
  const queryTerms = publicTerms(`${query} ${question}`), tokenSets = new Map(candidates.map(document => [document, publicTerms(document.text)]));
  const selected = candidates.slice(0, Math.min(limit, rawAnchorCount)), remaining = candidates.slice(selected.length);
  while (selected.length < limit && remaining.length) {
    let bestIndex = 0, bestScore = -Infinity;
    for (let index = 0; index < remaining.length; index++) {
      const document = remaining[index]!, terms = tokenSets.get(document)!;
      const relevance = queryTerms.size ? overlap(queryTerms, terms) / queryTerms.size : 0;
      const redundancy = selected.length ? Math.max(...selected.map(previous => jaccard(terms, tokenSets.get(previous)!))) : 0;
      // Reserve most weight for novel public facts after preserving the configured lexical anchors.
      const score = 0.4 * relevance - 0.6 * redundancy;
      const best = remaining[bestIndex]!;
      if (score > bestScore || (score === bestScore && digest(document.text) < digest(best.text))) { bestScore = score; bestIndex = index; }
    }
    selected.push(remaining.splice(bestIndex, 1)[0]!);
  }
  return selected;
}
/** Corpus-only Memory ingestion. The oracle and answer labels cannot cross this interface. */
export async function prepareContext(options: {
  root: string; documents: readonly SemanticDocument[]; task: SemanticCase; arm: ContextArm;
  role: 'planner' | 'executor'; modelConfigVersion: string; distractors: number; topK: number; trialId: string;
  evidencePlacement?: 'start' | 'middle' | 'end';
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
    // Measure a fresh read connection separately from warm queries. No OS cache claim is made.
    const reader = new MemoryStore(options.root, { namespaces: [namespace], principals: [{ id: 'fixture-importer', role: 'memoryPromoter', projectIds: [task.repoId] }] });
    let retrieved: ReturnType<MemoryStore['query']>, candidates: ReturnType<MemoryStore['query']>;
    let retrievalDiagnostics: PreparedContext['retrievalDiagnostics'];
    try {
      const started = performance.now(), first = reader.query({ namespace, text: task.query, limit: 10, expandHops: 0 });
      const connectionColdMs = performance.now() - started, warmMs: number[] = [];
      for (let n = 0; n < 3; n++) { const start = performance.now(); reader.query({ namespace, text: task.query, limit: 10, expandHops: 0 }); warmMs.push(performance.now() - start); }
      candidates = reader.query({ namespace, text: task.query, limit: Math.max(10, options.topK), expandHops: 0 });
      retrieved = candidates.slice(0, options.topK);
      const criticalUnknown = task.unknowns.some(unknown => unknown.critical);
      const rawAnchorCount = criticalUnknown ? options.topK : Math.min(2, options.topK);
      retrievalDiagnostics = { retrieved10Ids: first.map(n => sourceByRef.get(n.id)!.id), candidateIds: candidates.map(n => sourceByRef.get(n.id)!.id),
        selectionPolicy: 'public-critical-raw-anchor-mmr/1', selectionMode: criticalUnknown ? 'critical-unknown-lexical' : 'anchored-query-question-mmr', rawAnchorCount,
        connectionColdMs, warmMs, cacheScope: 'fresh-sqlite-connection-not-os-cold' };
    } finally { reader.close(); }
    const rawAnchorCount = task.unknowns.some(unknown => unknown.critical) ? options.topK : Math.min(2, options.topK);
    let selected = options.arm === 'full' ? eligible : selectPublicEvidence(candidates.map(n => sourceByRef.get(n.id)!), task.query, options.topK, task.question, rawAnchorCount);
    if (options.evidencePlacement) {
      const evidence = selected.filter(d => !d.distractor), noise = selected.filter(d => d.distractor);
      if (evidence.length) {
        const pivot = options.evidencePlacement === 'start' ? 0 : options.evidencePlacement === 'middle' ? Math.ceil(noise.length / 2) : noise.length;
        selected = [...noise.slice(0, pivot), ...evidence, ...noise.slice(pivot)];
      }
    }
    const canonical = semanticTaskSpec(task, options.modelConfigVersion);
    const scope = { repoId: namespace.repoId, allowedPaths: namespace.allowedPaths, taskClasses: namespace.taskClasses };
    const authority: ContextAuthority = { task: canonical, contextPolicyVersion: 'semantic-context-comparison/2',
      snapshotId: digest(eligible), memoryVersion: memory.memoryVersion,
      model: { modelConfigVersion: options.modelConfigVersion, inputLimit: 1_000_000, maxOutputTokens: 1000 },
      agents: [{ agentId: options.role, role: options.role, scope, branchId: namespace.branchId, lineageId: namespace.lineageId,
        budget: canonical.budget, mandatoryResourceRefs: [], unknowns: task.unknowns }],
      resources: selected.map(d => ({ ref: d.id, revision: d.revision, contentHash: sourceContentDigest(d.text), kind: 'evidence',
        scope, branchId: namespace.branchId, lineageId: namespace.lineageId, status: 'active', trust: 'untrusted-data', sourceRefs: [d.id], dependencies: [] })),
    };
    const window = await buildContextWindow(authority, { windowId: `${options.trialId}:window:0`, agentId: options.role,
      resourceRefs: selected.map(d => ({ ref: d.id, required: true })), history: task.history }, p => selected.find(d => d.id === p.ref)!.text);
    return { window, authority, selected, eligibleIds: eligible.map(d => d.id), retrievedIds: retrieved.map(n => sourceByRef.get(n.id)!.id), sourceByRef, retrievalDiagnostics };
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
