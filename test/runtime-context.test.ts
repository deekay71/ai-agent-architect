import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runtimeFixture } from '../fixtures/runtime.js';
import { createContractFixtures } from '../fixtures/contracts.js';
import { digest, digestOmitting } from '../src/contracts/canonical.js';
import { buildContextWindow, type ContextAuthority, type ContextResourcePin } from '../src/context/engine.js';
import { createRuntimeContextGuard, type RuntimeContextGuard } from '../src/context/runtime-guard.js';
import { MemoryStore, sourceContentDigest } from '../src/memory/store.js';
import type { MemoryNamespace } from '../src/memory/types.js';
import { planningInputs } from '../src/runtime/evaluation.js';
import { PersistentWorkflowRunner } from '../src/runtime/runner.js';

async function setup(t: test.TestContext, twoOperations = false) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'architect-runtime-context-'));
  const workspace = path.join(root, 'candidate'), control = path.join(root, 'control');
  mkdirSync(path.join(workspace, 'src'), { recursive: true });
  const runner = new PersistentWorkflowRunner(workspace, control), f = runtimeFixture();
  const task = f.request.records.task;
  task.budget.inputLimit = 50000; task.budget.outputReserve = 1000; task.budget.headroom = 1000;
  task.budget.tokenAccountingPolicy = { version: 'local-accounting/1', tokenizer: 'utf8-bytes/1', includeToolOutputs: true };
  const scope = { repoId: task.repoId, allowedPaths: ['src'], taskClasses: [task.taskClass] };
  const namespace: MemoryNamespace = { ...scope, branchId: 'main', lineageId: 'fixture-lineage' };
  const memory = new MemoryStore(path.join(root, 'memory'), { namespaces: [namespace], now: () => '2026-09-25T12:00:00.000Z',
    principals: [{ id: 'promoter', role: 'memoryPromoter', projectIds: [task.repoId] }] });
  const ingest = (sourceId: string, revision = 'r1', content = 'Approved fixture write instructions.') => memory.ingest({ namespace, purpose: 'knowledge', content,
    provenance: { kind: 'primary', originId: sourceId }, record: { ...createContractFixtures().SourceRecord, sourceId, sourceRevision: revision,
      observedAt: '2026-09-25T09:00:00.000Z', contentDigest: sourceContentDigest(content) } }, 'promoter');
  const source = ingest('required-source');
  const authority = (): ContextAuthority => ({ task, snapshotId: 'snapshot:runtime-context', memoryVersion: memory.memoryVersion, contextPolicyVersion: 'context-policy/1',
    model: { modelConfigVersion: task.budget.modelConfigVersion, inputLimit: 50000, maxOutputTokens: 4000 },
    agents: [{ agentId: 'executor-context', role: 'executor', scope, branchId: namespace.branchId, lineageId: namespace.lineageId,
      budget: structuredClone(task.budget), mandatoryResourceRefs: [source.id], unknowns: [] }],
    resources: memory.query({ namespace, limit: 100 }).filter(x => x.kind === 'source' || x.kind === 'claim').map((x): ContextResourcePin => ({
      ref: x.id, revision: x.revision, contentHash: x.contentDigest, kind: 'evidence', scope: x.scope, branchId: x.branchId, lineageId: x.lineageId,
      status: 'active', trust: 'untrusted-data', sourceRefs: x.kind === 'source' ? [x.id] : x.provenance.sourceRefs, dependencies: [],
    })) });
  const window = await buildContextWindow(authority(), { windowId: 'runtime-window', agentId: 'executor-context' }, pin => memory.getNode(pin.ref, namespace)!.content);
  assert.equal(window.status, 'ready', JSON.stringify(window.issues));
  f.request.records.manifest = window.packet.manifest; f.request.records.context = window.packet.bundle;
  if (twoOperations) {
    const steps = f.request.records.plan.subplans[0]!.steps;
    steps.push({ ...structuredClone(steps[0]!), stepId: 'step-2', dependsOn: [steps[0]!.stepId] });
    f.request.records.plan.requirementCoverage[0]!.stepRefs.push('step-2');
    f.request.records.plan.hash = digestOmitting(f.request.records.plan, 'hash');
    f.request.operations.push({ ...f.request.operations[0]!, stepId: 'step-2', operationId: 'write:second', target: 'src/second.txt' });
  }
  Object.assign(f.config.authority.planning, { taskDigest: digest(task), expectedInputs: planningInputs(f.request.records),
    snapshotId: window.packet.bundle.snapshotId, memoryVersion: window.packet.bundle.memoryVersion,
    evidence: window.packet.resources.map(x => ({ evidenceId: x.pin.ref, contentHash: x.pin.contentHash, sourceRef: x.pin.sourceRefs[0]!, sourceRevision: x.pin.revision })) });
  const guard = createRuntimeContextGuard({ guardId: 'runtime-context', window, currentAuthority: authority });
  f.config.contextGuard = guard.pin; runner.attachContextGuard(guard); await runner.configure(f.config);
  let closed = false;
  const close = async () => { if (!closed) { await runner.close(); closed = true; } };
  t.after(async () => { await close(); memory.close(); rmSync(root, { recursive: true, force: true }); });
  return { ...f, root, workspace, control, runner, memory, namespace, source, ingest, authority, guard, window, close };
}

async function zeroEffects(f: Awaited<ReturnType<typeof setup>>, expectedReason: string) {
  const result = await f.runner.resume(f.request.runId);
  assert.equal(result.run.state, 'blocked'); assert.equal(result.run.reason, expectedReason);
  assert.equal(result.budget.dispatches, 0); assert.equal(result.operations.length, 0);
  assert.equal(existsSync(path.join(f.workspace, 'src/result.txt')), false);
}

test('live Memory context guard permits a fresh exact window through actual isolated execution', async t => {
  const f = await setup(t); await f.runner.submit(f.request);
  const status = await f.runner.resume(f.request.runId);
  assert.equal(status.run.state, 'completed', status.run.reason ?? undefined); assert.equal(status.budget.dispatches, 1);
  assert.deepEqual(status.run.contextGuardPin, f.guard.pin);
  assert.equal(f.runner.store.list('gate').length, 3); // Existing ledger only, no parallel context gate.
});

for (const mutation of ['revoke', 'revision', 'missing', 'scope', 'provider-error'] as const) test(`context ${mutation} after submit blocks with zero effects`, async t => {
  const f = await setup(t); await f.runner.submit(f.request);
  if (mutation === 'revoke') f.memory.transitionSource({ sourceId: 'required-source', namespace: f.namespace, to: 'revoked', reason: 'Fixture withdrawal' }, 'promoter');
  if (mutation === 'revision') f.ingest('required-source', 'r2', 'New instructions supersede the loaded version.');
  if (['missing', 'scope', 'provider-error'].includes(mutation)) f.runner.attachContextGuard(createRuntimeContextGuard({ guardId: f.guard.pin.guardId, window: f.window, currentAuthority: () => {
    if (mutation === 'provider-error') throw new Error('No available trusted registry');
    const a = f.authority(); if (mutation === 'missing') a.resources = []; else a.resources[0]!.scope.allowedPaths = ['private']; return a;
  } }));
  await zeroEffects(f, 'CONTEXT_NOT_READY');
});

test('an unrelated Memory revision does not invalidate an exact loaded dependency', async t => {
  const f = await setup(t); f.ingest('unrelated', 'r1', 'Unrelated source'); await f.runner.submit(f.request);
  f.ingest('unrelated', 'r2', 'Revised unrelated source');
  const status = await f.runner.resume(f.request.runId);
  assert.equal(status.run.state, 'completed', status.run.reason ?? undefined); assert.equal(status.budget.dispatches, 1);
});

test('required guard cannot disappear on restart, and explicit reattachment restores a valid run', async t => {
  const f = await setup(t); await f.runner.submit(f.request); await f.close();
  const restarted = new PersistentWorkflowRunner(f.workspace, f.control);
  try {
    const blocked = await restarted.resume(f.request.runId);
    assert.equal(blocked.run.reason, 'CONTEXT_GUARD_MISSING'); assert.equal(blocked.budget.dispatches, 0);
    assert.equal(existsSync(path.join(f.workspace, 'src/result.txt')), false);
    restarted.attachContextGuard(f.guard);
    assert.equal((await restarted.resume(f.request.runId)).run.state, 'completed');
  } finally { await restarted.close(); }
});

test('run-pinned guard requirement survives later operator config removal', async t => {
  const f = await setup(t); await f.runner.submit(f.request);
  delete f.config.contextGuard; await f.runner.configure(f.config);
  await zeroEffects(f, 'CONTEXT_GUARD_CONFIG_DRIFT');
});

test('a different installed window cannot satisfy the durable required guard pin', async t => {
  const f = await setup(t); await f.runner.submit(f.request);
  f.runner.attachContextGuard(createRuntimeContextGuard({ guardId: 'other-guard', window: f.window, currentAuthority: f.authority }));
  await zeroEffects(f, 'CONTEXT_GUARD_MISMATCH');
});

test('exact TaskSpec, manifest and bundle must match the installed context even if planning authority is repinned', async t => {
  const f = await setup(t);
  f.request.records.context.bundleId = 'different-bundle';
  f.config.authority.planning.expectedInputs = planningInputs(f.request.records);
  await f.runner.configure(f.config); await f.runner.submit(f.request);
  await zeroEffects(f, 'CONTEXT_GUARD_RECORD_MISMATCH');
});

test('every new dispatch checks current sources after an earlier operation committed', async t => {
  const f = await setup(t, true); await f.runner.submit(f.request);
  const status = await f.runner.resume(f.request.runId, { observe(event, operationId) {
    if (event === 'prepared' && operationId === f.request.operations[1]!.operationId)
      f.memory.transitionSource({ sourceId: 'required-source', namespace: f.namespace, to: 'revoked', reason: 'Withdrawn between operations' }, 'promoter');
  } });
  assert.equal(status.run.reason, 'CONTEXT_NOT_READY'); assert.equal(status.budget.dispatches, 1);
  assert.equal(status.operations[0]!.state, 'COMMITTED'); assert.equal(status.operations[1]!.state, 'PREPARED');
  assert.equal(existsSync(path.join(f.workspace, 'src/second.txt')), false);
});

for (const boundary of ['prepared', 'started', 'before-commit'] as const) test(`source revocation at awaited ${boundary} boundary cannot reuse earlier admission`, async t => {
  const f = await setup(t); await f.runner.submit(f.request);
  const status = await f.runner.resume(f.request.runId, { observe(event) {
    if (event === boundary) f.memory.transitionSource({ sourceId: 'required-source', namespace: f.namespace, to: 'revoked', reason: 'Withdrawn at asynchronous boundary' }, 'promoter');
  } });
  assert.equal(status.run.state, 'blocked'); assert.equal(status.run.reason, 'CONTEXT_NOT_READY');
  assert.equal(status.operations[0]!.state, boundary === 'prepared' ? 'PREPARED' : boundary === 'started' ? 'STARTED' : 'OBSERVED');
  assert.equal(existsSync(path.join(f.workspace, 'src/result.txt')), boundary === 'before-commit');
  assert.equal(f.runner.store.list<{ stage: string }>('gate').some(g => g.stage === 'post-execution'), false);
  // A denied spawned-worker handshake must clear its stopped PID, so the broker remains usable.
  assert.equal((await f.runner.resume(f.request.runId)).run.reason, 'CONTEXT_NOT_READY');
});

test('a candidate-shaped guard cannot install a self-declared PASS callback', async t => {
  const f = await setup(t);
  assert.throws(() => f.runner.attachContextGuard({ pin: f.guard.pin, evaluate: () => ({ status: 'ready' }) } as RuntimeContextGuard), /CONTEXT_GUARD_UNTRUSTED/);
  await assert.rejects(f.runner.submit({ ...f.request, contextGuard: f.guard.pin } as typeof f.request));
});
