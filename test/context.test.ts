import test from 'node:test';
import assert from 'node:assert/strict';
import { createContractFixtures } from '../fixtures/contracts.js';
import { canonicalJson, digest, digestOmitting } from '../src/contracts/canonical.js';
import { resourceDigest } from '../src/skills/catalog.js';
import { buildContextWindow, compactContextWindow, validateContextWindow, validateContextHandoff, exportContextTrace, serializeContextPacket,
  utf8ByteCounter, pinContextPredecessor, type ContextAuthority, type ContextResourcePin, type ContextWindow, type ContextCounter } from '../src/context/engine.js';
import type { HandoffPacket } from '../src/contracts/schemas.js';

function fixture() {
  const task = createContractFixtures().TaskSpec;
  task.taskId = 'task:context'; task.goal = 'Review a local compiler observation without inventing a platform build result.';
  task.budget.inputLimit = 50000; task.budget.outputReserve = 1000; task.budget.headroom = 1000;
  task.budget.tokenAccountingPolicy = { version: 'context-accounting/1', tokenizer: 'utf8-bytes/1', includeToolOutputs: true };
  const description = 'C17: A successful C# compile does not prove an Android build succeeded.';
  task.constraints = [{ id: 'C17', description, sourceRevision: 'rules-r1', contentHash: digest(description), applicability: { taskClasses: [task.taskClass], required: true, reason: 'Preserve platform evidence boundaries' } }];
  task.acceptanceCriteria = [{ criterionId: 'AC1', description: 'Retain the compiler observation and explicitly retain unknown Android status.', checkRefs: ['check:platform-evidence'] }];
  const scope = { repoId: task.repoId, allowedPaths: ['src'], taskClasses: [task.taskClass] };
  const contents: Record<string, string> = { 'source:compile': 'A local C# compile fixture returned zero errors. Android build was not invoked.', 'source:other': 'Unrelated editor reference.' };
  const pin = (ref: string): ContextResourcePin => ({ ref, revision: 'r1', contentHash: resourceDigest(contents[ref]!), kind: 'evidence', scope,
    branchId: 'main', lineageId: 'run:1', status: 'active', trust: 'untrusted-data', sourceRefs: [`origin:${ref}`], dependencies: [] });
  const authority: ContextAuthority = { task, contextPolicyVersion: 'context-policy/1', snapshotId: 'snapshot:1', memoryVersion: 'memory:1',
    model: { modelConfigVersion: task.budget.modelConfigVersion, inputLimit: 50000, maxOutputTokens: 4000 },
    agents: [{ agentId: 'planner:a', role: 'planner', scope, branchId: 'main', lineageId: 'run:1', budget: structuredClone(task.budget), mandatoryResourceRefs: [], unknowns: [] }],
    resources: Object.keys(contents).map(pin) };
  const loads: string[] = [];
  const loader = (pin: Readonly<ContextResourcePin>): string => { loads.push(pin.ref); if (!(pin.ref in contents)) throw new Error('Missing'); return contents[pin.ref]!; };
  const request = { windowId: 'window:1', agentId: 'planner:a', resourceRefs: [{ ref: 'source:compile', required: true }], history: 'Prior planning notes.' };
  return { authority, request, loader, contents, loads };
}
function reseal(w: ContextWindow): void {
  w.packetDigest = digest(w.packet); w.windowDigest = digestOmitting(w, 'windowDigest');
}
function handoff(w: ContextWindow): HandoffPacket {
  const p = w.packet;
  return { schemaVersion: '0.5.0', handoffId: 'handoff:1', approvedArtifact: { artifactRef: 'plan:1', hash: digest('approved-plan') }, gateReportRef: 'gate:protected-store',
    sourceVersions: [{ ref: p.task.taskId, version: p.task.baseRevision, digest: digest(p.task) }, ...p.resources.map(x => ({ ref: x.pin.ref, version: x.pin.revision, digest: x.pin.contentHash }))],
    contextManifestRef: p.manifest.manifestId, contextManifestDigest: p.manifest.manifestDigest, allowedScope: p.scope, downstreamAcceptance: ['check:platform-evidence'] };
}
function rejects(w: ContextWindow, authority: ContextAuthority, code: string): void {
  const r = validateContextWindow(w, authority); assert.equal(r.status, 'blocked'); assert.ok(r.issues.some(x => x.code === code), JSON.stringify(r));
}

test('window includes canonical task, acceptance and exact loaded bytes with local accounting', async () => {
  const f = fixture(), w = await buildContextWindow(f.authority, f.request, f.loader);
  assert.equal(w.status, 'ready'); assert.deepEqual(validateContextWindow(w, f.authority), { status: 'ready', issues: [] });
  assert.deepEqual(w.packet.task, f.authority.task);
  assert.equal(w.packet.acceptanceBindings[0]!.contentHash, digest(f.authority.task.acceptanceCriteria[0]));
  assert.equal(w.packet.resources[0]!.instructionAuthority, 'none');
  assert.equal(w.packet.bundle.tokenCount, Buffer.byteLength(serializeContextPacket(w), 'utf8'));
  assert.equal(w.packet.budgetReport.packetUtf8Bytes, Buffer.byteLength(canonicalJson(w.packet), 'utf8'));
  assert.equal(w.packet.budgetReport.actualProviderTokens, null);
  assert.equal(w.packet.budgetReport.unit, 'utf8-byte-units');
  assert.ok(w.packet.budgetReport.packetUnits > Buffer.byteLength(f.contents['source:compile']!));
  const trace = exportContextTrace(w), entry = trace.entries[0]!;
  assert.equal(entry.state, 'loaded'); assert.ok(entry.receiptRef); assert.ok(entry.receiptDigest);
  assert.equal(entry.actualDigest, resourceDigest(f.contents['source:compile']!));
  assert.equal(w.packet.loadReceipts[0]!.assurance, 'serialized-local-payload-not-provider-read');
});

test('unknown agent cannot borrow a different registered window', async () => {
  const f = fixture(); await assert.rejects(buildContextWindow(f.authority, { ...f.request, agentId: 'other' }, f.loader), /CONTEXT_AGENT_UNKNOWN/);
});

for (const dimension of ['repo', 'path', 'class', 'branch', 'lineage'] as const) test(`resource ${dimension} scope is checked before loading bytes`, async () => {
  const f = fixture(), pin = f.authority.resources[0]!;
  if (dimension === 'repo') pin.scope = { ...pin.scope, repoId: 'other-project' };
  if (dimension === 'path') pin.scope = { ...pin.scope, allowedPaths: ['private'] };
  if (dimension === 'class') pin.scope = { ...pin.scope, taskClasses: ['other-task'] };
  if (dimension === 'branch') pin.branchId = 'other-branch';
  if (dimension === 'lineage') pin.lineageId = 'other-lineage';
  const w = await buildContextWindow(f.authority, f.request, f.loader);
  assert.equal(w.status, 'blocked'); assert.deepEqual(f.loads, []); assert.equal(w.packet.resources.length, 0);
  assert.equal(w.packet.loadPlan[0]!.reason, 'context.resourceScope');
});

test('two agent windows do not share history, role or namespace state', async () => {
  const f = fixture();
  f.authority.agents.push({ ...structuredClone(f.authority.agents[0]!), agentId: 'critic:b', role: 'critic', branchId: 'critic' });
  const a = await buildContextWindow(f.authority, f.request, f.loader);
  const b = await buildContextWindow(f.authority, { windowId: 'b', agentId: 'critic:b', history: 'Critic-only note', resourceRefs: [{ ref: 'source:compile', required: false }] }, f.loader);
  assert.equal(a.packet.history.content, 'Prior planning notes.'); assert.equal(b.packet.history.content, 'Critic-only note');
  assert.equal(b.packet.role, 'critic'); assert.equal(b.packet.resources.length, 0); assert.equal(b.packet.loadPlan[0]!.state, 'excluded');
  assert.deepEqual(f.loads, ['source:compile']);
});

for (const state of ['stale', 'revoked', 'quarantined'] as const) test(`${state} resources cannot be loaded or promoted by their content`, async () => {
  const f = fixture(); f.authority.resources[0]!.status = state;
  const w = await buildContextWindow(f.authority, f.request, f.loader);
  assert.equal(w.status, 'blocked'); assert.deepEqual(f.loads, []);
  assert.equal(w.packet.loadPlan[0]!.reason, 'context.resourceInactive');
});

test('loader errors and wrong bytes never produce actual-load receipts', async () => {
  const f = fixture();
  for (const loader of [() => { throw new Error('secret raw source error'); }, () => 'tampered']) {
    const w = await buildContextWindow(f.authority, f.request, loader);
    assert.equal(w.status, 'blocked'); assert.equal(w.packet.loadReceipts.length, 0); assert.equal(w.packet.resources.length, 0);
    assert.equal(w.packet.loadPlan[0]!.actualDigest, null); assert.equal(JSON.stringify(w).includes('secret raw source error'), false);
  }
});

test('optional load omission remains explicit and cannot masquerade as loaded', async () => {
  const f = fixture(); f.request.resourceRefs = [{ ref: 'missing', required: false }];
  const w = await buildContextWindow(f.authority, f.request, f.loader);
  assert.equal(w.status, 'ready'); assert.equal(w.packet.loadPlan[0]!.state, 'excluded');
  assert.equal(w.packet.bundle.excludedItems[0]!.ref, 'missing'); assert.deepEqual(validateContextWindow(w, f.authority).status, 'ready');
  w.packet.loadPlan[0]!.state = 'loaded'; reseal(w); rejects(w, f.authority, 'context.loadCompleteness');
});

test('mandatory registry resources cannot be omitted or downgraded by request', async () => {
  const f = fixture(); f.authority.agents[0]!.mandatoryResourceRefs = ['source:compile'];
  const w = await buildContextWindow(f.authority, { ...f.request, resourceRefs: [] }, f.loader);
  assert.equal(w.status, 'ready'); assert.equal(w.packet.loadPlan[0]!.required, true);
  assert.equal(w.packet.resources[0]!.pin.ref, 'source:compile');
});

test('optional large material is excluded to fit without dropping metadata or mandatory rules', async () => {
  const f = fixture(); f.contents['source:compile'] = 'large '.repeat(6000);
  f.authority.resources[0]!.contentHash = resourceDigest(f.contents['source:compile']);
  f.authority.agents[0]!.budget.inputLimit = 12000;
  const w = await buildContextWindow(f.authority, { ...f.request, resourceRefs: [{ ref: 'source:compile', required: false }] }, f.loader);
  assert.equal(w.status, 'ready'); assert.equal(w.packet.resources.length, 0); assert.equal(w.packet.loadPlan[0]!.reason, 'context.optionalBudget');
  assert.deepEqual(w.packet.task.constraints, f.authority.task.constraints); assert.deepEqual(w.packet.task.acceptanceCriteria, f.authority.task.acceptanceCriteria);
  assert.equal(w.packet.bundle.tokenCount, Buffer.byteLength(serializeContextPacket(w), 'utf8'));
});

test('bundle exclusion reasons cannot disagree with the load trace after same-length rehashing', async () => {
  const f = fixture(), w = await buildContextWindow(f.authority, { ...f.request, resourceRefs: [{ ref: 'missing', required: false }] }, f.loader);
  assert.equal(w.status, 'ready');
  const excluded = w.packet.bundle.excludedItems[0]!; excluded.reason = 'x'.repeat(excluded.reason.length);
  reseal(w); rejects(w, f.authority, 'context.bundle');
});

test('mandatory payload over budget remains intact and BLOCKED', async () => {
  const f = fixture(); f.authority.agents[0]!.budget.inputLimit = 3000;
  const w = await buildContextWindow(f.authority, f.request, f.loader);
  assert.equal(w.status, 'blocked'); assert.ok(w.issues.some(x => x.code === 'context.budgetExceeded'));
  assert.deepEqual(w.packet.task.constraints, f.authority.task.constraints); assert.deepEqual(w.packet.task.acceptanceCriteria, f.authority.task.acceptanceCriteria);
  assert.equal(w.packet.resources.length, 1); assert.equal(w.packet.budgetReport.fits, false);
});

test('critical unknown is canonical mandatory content and survives repeated compaction', async () => {
  const f = fixture(); f.authority.agents[0]!.unknowns = [{ id: 'android', description: 'Android build has not been verified.', critical: true }];
  let w = await buildContextWindow(f.authority, f.request, f.loader);
  for (let i = 0; i < 3; i++) {
    const previous = w; f.authority.predecessors = [pinContextPredecessor(previous)];
    w = await compactContextWindow(w, f.authority, { windowId: `compact:${i}`, summary: 'Untrusted summary claims Android passed.' }, f.loader);
    assert.equal(w.status, 'blocked'); assert.deepEqual(w.packet.bundle.unknowns, f.authority.agents[0]!.unknowns);
    assert.deepEqual(w.packet.task.constraints, f.authority.task.constraints); assert.deepEqual(w.packet.task.acceptanceCriteria, f.authority.task.acceptanceCriteria);
    assert.equal(w.packet.history.trust, 'untrusted-data'); assert.equal(w.packet.resources[0]!.content, f.contents['source:compile']);
    assert.equal(w.packet.generation, i + 1); assert.equal(w.packet.parentWindowDigest, previous.windowDigest);
  }
});

test('candidate cannot downgrade a canonical critical unknown', async () => {
  const f = fixture(); f.authority.agents[0]!.unknowns = [{ id: 'android', description: 'Unverified build', critical: true }];
  const w = await buildContextWindow(f.authority, { ...f.request, unknowns: [{ id: 'android', description: 'Verified', critical: false }] }, f.loader);
  assert.equal(w.status, 'blocked'); assert.ok(w.issues.some(x => x.code === 'context.unknownConflict'));
  assert.equal(w.packet.bundle.unknowns[0]!.critical, true);
});

test('negating C17 with the same ID and recomputing hashes cannot replace canonical instruction', async () => {
  const f = fixture(), w = await buildContextWindow(f.authority, f.request, f.loader);
  w.packet.task.constraints[0]!.description = 'C17: A successful C# compile proves an Android build succeeded.';
  w.packet.task.constraints[0]!.contentHash = digest(w.packet.task.constraints[0]!.description);
  reseal(w); rejects(w, f.authority, 'context.canonicalTask');
});

test('dropping acceptance criteria or rewriting source revision is rejected', async () => {
  const f = fixture(), original = await buildContextWindow(f.authority, f.request, f.loader);
  const ac = structuredClone(original); ac.packet.task.acceptanceCriteria[0]!.description = 'No evidence needed'; reseal(ac); rejects(ac, f.authority, 'context.canonicalTask');
  const revision = structuredClone(original); revision.packet.task.constraints[0]!.sourceRevision = 'invented'; reseal(revision); rejects(revision, f.authority, 'context.canonicalTask');
});

test('resource revision updates invalidate only contexts which actually loaded that source', async () => {
  const f = fixture(), w = await buildContextWindow(f.authority, f.request, f.loader), h = handoff(w);
  assert.equal(validateContextHandoff(h, w, f.authority).status, 'ready');
  f.authority.memoryVersion = 'memory:2'; f.authority.snapshotId = 'snapshot:2'; f.authority.resources[1]!.revision = 'r2';
  assert.equal(validateContextHandoff(h, w, f.authority).status, 'ready');
  f.authority.resources[0]!.revision = 'r2';
  assert.equal(validateContextHandoff(h, w, f.authority).status, 'blocked');
  rejects(w, f.authority, 'context.resourceStale');
});

test('handoff must bind exact manifest, source versions, acceptance and narrowed scope', async () => {
  const f = fixture(), w = await buildContextWindow(f.authority, f.request, f.loader);
  const cases: ((h: HandoffPacket) => void)[] = [h => { h.contextManifestDigest = digest('old'); }, h => { h.sourceVersions.pop(); },
    h => { h.downstreamAcceptance = []; }, h => { h.allowedScope.allowedPaths = ['private']; }];
  for (const mutate of cases) { const h = structuredClone(handoff(w)); mutate(h); assert.equal(validateContextHandoff(h, w, f.authority).status, 'blocked'); }
});

test('compaction rehydrates changed canonical revision and reloads source bytes under new pins', async () => {
  const f = fixture(), first = await buildContextWindow(f.authority, f.request, f.loader);
  f.authority.predecessors = [pinContextPredecessor(first)];
  f.authority.task.constraints[0]!.sourceRevision = 'rules-r2';
  f.contents['source:compile'] += ' Test count: 9.'; f.authority.resources[0]!.contentHash = resourceDigest(f.contents['source:compile']!); f.authority.resources[0]!.revision = 'r2';
  const next = await compactContextWindow(first, f.authority, { windowId: 'window:2', summary: 'Prior history compressed.' }, f.loader);
  assert.equal(next.status, 'ready'); assert.equal(next.packet.task.constraints[0]!.sourceRevision, 'rules-r2');
  assert.equal(next.packet.resources[0]!.pin.revision, 'r2'); assert.deepEqual(f.loads, ['source:compile', 'source:compile']);
  assert.equal(validateContextWindow(next, f.authority).status, 'ready');
  f.authority.predecessors.push(pinContextPredecessor(next));
  await assert.rejects(compactContextWindow(next, f.authority, { windowId: 'window:2', summary: '' }, f.loader), /CONTEXT_WINDOW_ID_REUSED/);
});

test('compaction requires an issued predecessor pin and cannot silently lose request-level critical unknowns', async () => {
  const f = fixture(), first = await buildContextWindow(f.authority, { ...f.request, unknowns: [{ id: 'request-unknown', description: 'The source has a critical unresolved question.', critical: true }] }, f.loader);
  await assert.rejects(compactContextWindow(first, f.authority, { windowId: 'next', summary: '' }, f.loader), /CONTEXT_PREDECESSOR_UNTRUSTED/);
  f.authority.predecessors = [pinContextPredecessor(first)];
  const forged = structuredClone(first); forged.packet.bundle.unknowns = []; forged.status = 'ready'; forged.issues = []; reseal(forged);
  await assert.rejects(compactContextWindow(forged, f.authority, { windowId: 'next', summary: '' }, f.loader), /CONTEXT_PREDECESSOR_UNTRUSTED/);
  const next = await compactContextWindow(first, f.authority, { windowId: 'next', summary: 'Summary omits the unknown.' }, f.loader);
  assert.equal(next.packet.bundle.unknowns[0]!.id, 'request-unknown'); assert.equal(next.status, 'blocked');
  next.packet.bundle.unknowns = []; next.status = 'ready'; next.issues = []; reseal(next);
  rejects(next, f.authority, 'context.predecessor');
});

test('a history summary cannot carry context into a different agent scope or namespace', async () => {
  const f = fixture(), first = await buildContextWindow(f.authority, f.request, f.loader);
  f.authority.predecessors = [pinContextPredecessor(first)]; f.authority.agents[0]!.branchId = 'other';
  await assert.rejects(compactContextWindow(first, f.authority, { windowId: 'next', summary: 'Old branch notes' }, f.loader), /CONTEXT_COMPACTION_NAMESPACE_CHANGE/);
});

test('trace export rejects invented actual-load receipts even after outer digest is resealed', async () => {
  const f = fixture(), first = await buildContextWindow(f.authority, f.request, f.loader);
  first.packet.loadReceipts[0]!.resourceDigest = digest('imaginary payload');
  first.packet.loadPlan[0]!.receiptDigest = digest(first.packet.loadReceipts[0]); reseal(first);
  assert.throws(() => exportContextTrace(first), /CONTEXT_TRACE_RECEIPT_INVALID/);
});

test('actual receipt, manifest and packet changes fail even when candidate reseals outer digest', async () => {
  const f = fixture(), original = await buildContextWindow(f.authority, f.request, f.loader);
  const mutations: [string, (w: ContextWindow) => void][] = [
    ['context.loadReceipt', w => { w.packet.loadReceipts[0]!.agentId = 'other'; }],
    ['context.resourceBytes', w => { w.packet.resources[0]!.content = 'forged'; }],
    ['context.manifest', w => { w.packet.manifest.evidenceBindings = []; }],
    ['context.accounting', w => { w.packet.budgetReport.packetUnits = 1; w.packet.bundle.tokenCount = 1; }],
    ['context.agentBinding', w => { w.packet.role = 'administrator'; }],
  ];
  for (const [code, mutate] of mutations) { const w = structuredClone(original); mutate(w); reseal(w); rejects(w, f.authority, code); }
});

test('model max output, reserve/headroom and configured accounting method are enforced', async () => {
  for (const mutate of [
    (a: ContextAuthority) => { a.model.maxOutputTokens = 500; },
    (a: ContextAuthority) => { a.agents[0]!.budget.outputReserve = 999; },
    (a: ContextAuthority) => { a.agents[0]!.budget.headroom = 999; },
    (a: ContextAuthority) => { a.agents[0]!.budget.tokenAccountingPolicy.includeToolOutputs = false; },
    (a: ContextAuthority) => { a.agents[0]!.budget.tokenAccountingPolicy.tokenizer = 'invented-tokenizer'; },
  ]) { const f = fixture(); mutate(f.authority); const w = await buildContextWindow(f.authority, f.request, f.loader); assert.equal(w.status, 'blocked'); }
});

test('an explicit model-bound local tokenizer counts the complete packet but does not claim provider usage', async () => {
  const f = fixture(); const counter: ContextCounter = { id: 'test-unicode-counter/1', unit: 'tokenizer-units', modelConfigVersion: f.authority.model.modelConfigVersion,
    count: text => Array.from(text).length };
  f.authority.agents[0]!.budget.tokenAccountingPolicy.tokenizer = counter.id;
  const w = await buildContextWindow(f.authority, { ...f.request, history: 'Tiếng Việt 🧩' }, f.loader, counter);
  assert.equal(w.status, 'ready'); assert.equal(w.packet.budgetReport.actualProviderTokens, null);
  assert.equal(w.packet.budgetReport.packetUnits, Array.from(canonicalJson(w.packet)).length);
  assert.equal(validateContextWindow(w, f.authority, counter).status, 'ready');
  assert.equal(validateContextWindow(w, f.authority, utf8ByteCounter).status, 'blocked');
});

test('progressive loading records descriptor, body and reference separately and keeps their pins', async () => {
  const f = fixture();
  const refs = ['skill:descriptor', 'skill:body', 'skill:reference'];
  for (let i = 0; i < refs.length; i++) {
    const ref = refs[i]!; f.contents[ref] = `Pinned skill section ${i}`;
    f.authority.resources.push({ ...structuredClone(f.authority.resources[0]!), ref, contentHash: resourceDigest(f.contents[ref]!),
      kind: (['skill-descriptor', 'skill-body', 'skill-reference'] as const)[i]!, dependencies: i ? [refs[i - 1]!] : [],
      skill: { skillId: 'fixture-skill', version: '1', descriptorDigest: digest('descriptor'), selectionDigest: digest('selected-profile'), resourcePath: i ? `${i}.md` : 'descriptor.json' } });
  }
  const discovery = await buildContextWindow(f.authority, { ...f.request, resourceRefs: [{ ref: refs[0]!, required: true }] }, f.loader);
  assert.equal(discovery.packet.resources.length, 1); assert.equal(discovery.packet.resources[0]!.pin.kind, 'skill-descriptor');
  const missingBody = await buildContextWindow(f.authority, { ...f.request, resourceRefs: [{ ref: refs[2]!, required: true }] }, f.loader);
  assert.equal(missingBody.status, 'blocked'); assert.equal(missingBody.packet.loadPlan[0]!.reason, 'context.resourceDependency');
  const complete = await buildContextWindow(f.authority, { ...f.request, resourceRefs: refs.map(ref => ({ ref, required: true })) }, f.loader);
  assert.equal(complete.status, 'ready'); assert.equal(complete.packet.loadReceipts.length, 3);
  assert.equal(validateContextWindow(complete, f.authority).status, 'ready');
});
