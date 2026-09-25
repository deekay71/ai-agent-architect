import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readdirSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createContractFixtures } from '../fixtures/contracts.js';
import { digest } from '../src/contracts/canonical.js';
import { buildContextWindow, validateContextWindow, type ContextAuthority, type ContextResourcePin } from '../src/context/engine.js';
import { MemoryStore, sourceContentDigest } from '../src/memory/store.js';
import type { MemoryNamespace } from '../src/memory/types.js';

test('real memory revision/revocation selectively invalidates loaded context and downstream handoff dependencies', async t => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'architect-context-memory-'));
  const fixture = createContractFixtures(), task = fixture.TaskSpec;
  task.budget.inputLimit = 50000; task.budget.outputReserve = 1000; task.budget.headroom = 1000;
  task.budget.tokenAccountingPolicy = { version: 'local-accounting/1', tokenizer: 'utf8-bytes/1', includeToolOutputs: true };
  const scope = { repoId: task.repoId, allowedPaths: ['src'], taskClasses: [task.taskClass] };
  const namespace: MemoryNamespace = { ...scope, branchId: 'main', lineageId: 'lineage:context' };
  const store = new MemoryStore(root, { now: () => '2026-09-25T12:00:00.000Z', namespaces: [namespace],
    principals: [{ id: 'promoter', role: 'memoryPromoter', projectIds: [task.repoId] }, { id: 'planner', role: 'planner', projectIds: [task.repoId] }] });
  t.after(() => { store.close(); rmSync(root, { recursive: true, force: true }); });
  const ingest = (sourceId: string, revision: string, content: string) => store.ingest({ namespace, purpose: 'knowledge', provenance: { kind: 'primary', originId: sourceId }, content,
    record: { ...fixture.SourceRecord, sourceId, sourceRevision: revision, sourceRef: `fixture://${sourceId}`, observedAt: '2026-09-25T09:00:00.000Z', contentDigest: sourceContentDigest(content) } }, 'promoter');
  const a = ingest('compiler-log', 'r1', 'Compiler fixture passed; no Android build was executed.');
  const b = ingest('unrelated-guide', 'r1', 'Unrelated formatting guide.');
  const pins = (): ContextResourcePin[] => store.query({ namespace, limit: 100 }).filter(x => x.kind === 'source' || x.kind === 'claim').map(x => ({
    ref: x.id, revision: x.revision, contentHash: x.contentDigest, kind: 'evidence', scope: x.scope, branchId: x.branchId, lineageId: x.lineageId,
    status: 'active', trust: 'untrusted-data', sourceRefs: x.kind === 'source' ? [x.id] : x.provenance.sourceRefs, dependencies: [],
  }));
  const authority = (): ContextAuthority => ({ task, snapshotId: 'snapshot:fixture', memoryVersion: store.memoryVersion, contextPolicyVersion: 'context-policy/1',
    model: { modelConfigVersion: task.budget.modelConfigVersion, inputLimit: 50000, maxOutputTokens: 4000 },
    agents: [{ agentId: 'planner', role: 'planner', scope, branchId: namespace.branchId, lineageId: namespace.lineageId, budget: structuredClone(task.budget), mandatoryResourceRefs: [], unknowns: [] }], resources: pins() });
  const window = await buildContextWindow(authority(), { windowId: 'context:a', agentId: 'planner', resourceRefs: [{ ref: a.id, required: true }] }, pin => store.getNode(pin.ref, namespace)!.content);
  assert.equal(window.status, 'ready');
  const context = store.registerDependency({ id: 'context:a', kind: 'context', label: 'Compiler window', contentDigest: window.packetDigest, namespace,
    dependsOn: [{ nodeId: a.id, contentDigest: a.contentDigest }], provenanceRef: 'context-engine:fixture' }, 'planner');
  const plan = store.registerDependency({ id: 'plan:a', kind: 'plan', label: 'Reviewed fixture plan', contentDigest: digest('plan-a'), namespace,
    dependsOn: [{ nodeId: context.id, contentDigest: context.contentDigest }], provenanceRef: 'planner:fixture' }, 'planner');
  store.registerDependency({ id: 'handoff:a', kind: 'handoff', label: 'Fixture handoff', contentDigest: digest('handoff-a'), namespace,
    dependsOn: [{ nodeId: plan.id, contentDigest: plan.contentDigest }], provenanceRef: 'handoff:fixture' }, 'planner');
  ingest('unrelated-guide', 'r2', 'Revised unrelated formatting guide.');
  assert.notEqual(authority().memoryVersion, window.packet.bundle.memoryVersion);
  assert.equal(validateContextWindow(window, authority()).status, 'ready');
  assert.equal(store.getNode('handoff:a', namespace)!.status.validity, 'valid');
  assert.equal(store.getNode(b.id, namespace)!.current, false);
  store.transitionSource({ sourceId: 'compiler-log', namespace, to: 'revoked', reason: 'Fixture source withdrawn' }, 'promoter');
  assert.equal(validateContextWindow(window, authority()).status, 'blocked');
  for (const id of ['context:a', 'plan:a', 'handoff:a']) assert.equal(store.getNode(id, namespace)!.status.validity, 'invalidated');
  assert.equal(store.query({ namespace, text: 'formatting' })[0]!.status.validity, 'valid');
});

function scopedStore(t: test.TestContext) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'architect-context-scope-')), fixture = createContractFixtures();
  const full: MemoryNamespace = { repoId: fixture.TaskSpec.repoId, allowedPaths: ['src'], taskClasses: [fixture.TaskSpec.taskClass], branchId: 'main', lineageId: 'same-lineage' };
  const publicScope = { ...full, allowedPaths: ['src/public'] }, privateScope = { ...full, allowedPaths: ['src/private'] };
  const store = new MemoryStore(root, { now: () => '2026-09-25T12:00:00.000Z', namespaces: [full],
    principals: [{ id: 'promoter', role: 'memoryPromoter', projectIds: [full.repoId] }, { id: 'planner', role: 'planner', projectIds: [full.repoId] }] });
  t.after(() => { store.close(); rmSync(root, { recursive: true, force: true }); });
  const ingest = (sourceId: string, namespace: MemoryNamespace, content: string) => store.ingest({ namespace, purpose: 'knowledge', provenance: { kind: 'primary', originId: sourceId }, content,
    record: { ...fixture.SourceRecord, sourceId, sourceRevision: 'r1', observedAt: '2026-09-25T09:00:00.000Z', contentDigest: sourceContentDigest(content) } }, 'promoter');
  const hidden = ingest('private-source', privateScope, 'PRIVATE_SCOPE_CONTENT'), visible = ingest('public-source', publicScope, 'Public context evidence');
  return { store, fixture, full, publicScope, privateScope, hidden, visible };
}

test('narrow context namespace cannot derive or register dependencies through a hidden source', t => {
  const f = scopedStore(t);
  assert.throws(() => f.store.registerDependency({ id: 'context:hidden-parent', kind: 'context', label: 'Must reject', contentDigest: digest('context'), namespace: f.publicScope,
    dependsOn: [{ nodeId: f.hidden.id, contentDigest: f.hidden.contentDigest }], provenanceRef: 'review-fixture' }, 'planner'), /MEMORY_DEPENDENCY_UNUSABLE/);
  assert.throws(() => f.store.ingest({ namespace: f.publicScope, purpose: 'knowledge', content: 'Derived text',
    record: { ...f.fixture.SourceRecord, sourceId: 'derived-public', sourceRevision: 'r1', contentDigest: sourceContentDigest('Derived text') },
    provenance: { kind: 'derived', originId: 'derived-public', derivedFrom: [{ sourceId: 'private-source', sourceRevision: 'r1', contentDigest: f.hidden.contentDigest }] } }, 'promoter'), /MEMORY_SOURCE_PIN_MISMATCH/);
  assert.equal(f.store.getNode(f.hidden.id, f.publicScope), undefined);
});

test('claim proposals cannot smuggle private source pins into a narrow context namespace', t => {
  const f = scopedStore(t), claim = { ...f.fixture.MemoryDelta.claimsAdded[0]!, claimId: 'public-claim', applicableScope: { repoId: f.publicScope.repoId, allowedPaths: f.publicScope.allowedPaths, taskClasses: f.publicScope.taskClasses },
    sourceRefs: ['private-source'] };
  assert.throws(() => f.store.propose({ ...f.fixture.MemoryDelta, deltaId: 'private-ref', expectedMemoryVersion: f.store.memoryVersion, claimsAdded: [claim] }, f.publicScope, 'planner'), /MEMORY_SOURCE_MISSING/);
});

test('narrow ingestion cannot supersede an existing source head outside its requested scope', t => {
  const f = scopedStore(t), content = 'Public source impersonating a hidden source revision';
  assert.throws(() => f.store.ingest({ namespace: f.publicScope, purpose: 'knowledge', content,
    record: { ...f.fixture.SourceRecord, sourceId: 'private-source', sourceRevision: 'r2', contentDigest: sourceContentDigest(content) },
    provenance: { kind: 'primary', originId: 'private-source' } }, 'promoter'), /MEMORY_SOURCE_SCOPE_CONFLICT/);
  assert.equal(f.store.getNode(f.hidden.id, f.privateScope)!.current, true);
  assert.equal(f.store.getNode(f.hidden.id, f.privateScope)!.status.validity, 'valid');
});

test('dependency edge labels cannot disable invalidation for context nodes', t => {
  const f = scopedStore(t);
  for (const type of ['supersedes', 'conflicts_with'] as const) {
    assert.throws(() => f.store.registerDependency({ id: `context:${type}`, kind: 'context', label: 'Invalid dependency label', contentDigest: digest(type), namespace: f.publicScope,
      dependsOn: [{ nodeId: f.visible.id, contentDigest: f.visible.contentDigest, type }], provenanceRef: 'review-fixture' }, 'planner'), /MEMORY_DEPENDENCY_INVALID/);
  }
});

test('narrow Markdown export does not inherit files from an earlier broad-scope export', t => {
  const f = scopedStore(t), broad = f.store.writeMarkdownSnapshot(f.full), narrow = f.store.writeMarkdownSnapshot(f.publicScope);
  assert.notEqual(broad.directory, narrow.directory);
  const files = readdirSync(narrow.directory, { recursive: true }).filter(x => typeof x === 'string' && x.endsWith('.md'));
  assert.ok(files.length > 0);
  for (const file of files) assert.equal(readFileSync(path.join(narrow.directory, String(file)), 'utf8').includes('PRIVATE_SCOPE_CONTENT'), false);
});
