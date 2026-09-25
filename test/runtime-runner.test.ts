import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, linkSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PersistentWorkflowRunner } from '../src/runtime/runner.js';
import { runtimeFixture } from '../fixtures/runtime.js';
import { digest } from '../src/contracts/canonical.js';

async function setup(t: test.TestContext) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'architect-runtime-'));
  const workspace = path.join(root, 'candidate'); mkdirSync(path.join(workspace, 'src'), { recursive: true });
  const runner = new PersistentWorkflowRunner(workspace, path.join(root, 'control'));
  const scenario = runtimeFixture(); await runner.configure(scenario.config);
  t.after(async () => { await runner.close(); rmSync(root, { recursive: true, force: true }); });
  return { root, workspace, runner, ...scenario };
}

test('durable runner issues current stage gates and commits independently verified result once', async t => {
  const { runner, request, workspace } = await setup(t);
  await runner.submit(request);
  const result = await runner.resume(request.runId);
  assert.equal(result.run.state, 'completed', result.run.reason ?? undefined);
  assert.equal(result.operations[0]?.state, 'COMMITTED');
  assert.equal(result.budget.dispatches, 1);
  assert.equal(result.checkpoint?.completedNodeIds.length, 1);
  assert.equal(readFileSync(path.join(workspace, 'src/result.txt'), 'utf8'), request.operations[0]!.content);
  const again = await runner.resume(request.runId);
  assert.equal(again.budget.dispatches, 1);
  assert.equal(runner.store.list('gate').length, 3);
});

test('untrusted authority and embedded PASS are rejected at candidate boundary', async t => {
  const { runner, request } = await setup(t);
  await assert.rejects(runner.submit({ ...request, authority: {} } as typeof request));
  await assert.rejects(runner.submit({ ...request, gate: { verdict: 'PASS' } } as typeof request));
  assert.equal(runner.store.list('operation').length, 0);
});

test('changed payload under same run ID is rejected before any effect', async t => {
  const { runner, request } = await setup(t); await runner.submit(request);
  const changed = structuredClone(request); changed.operations[0]!.content = 'other';
  await assert.rejects(runner.submit(changed), /RUN_ID_CONFLICT/);
  assert.equal(runner.status(request.runId).budget.dispatches, 0);
});

test('revoking the active release after submit blocks dispatch', async t => {
  const { runner, request, config, workspace } = await setup(t); await runner.submit(request);
  config.authority.policy.releases[0]!.status = 'revoked'; await runner.configure(config);
  const result = await runner.resume(request.runId);
  assert.equal(result.run.state, 'blocked'); assert.equal(result.budget.dispatches, 0);
  assert.throws(() => readFileSync(path.join(workspace, 'src/result.txt')));
});

test('dispatch budget survives replan; explicit replay gets a new lineage', async t => {
  const { runner, request, config } = await setup(t);
  config.limits.maxDispatches = 1; await runner.configure(config); await runner.submit(request);
  assert.equal((await runner.resume(request.runId)).run.state, 'completed');
  const replan = structuredClone(request); replan.runId = 'replan'; replan.operations[0]!.operationId = 'replan:write'; replan.operations[0]!.target = 'src/replan.txt';
  assert.equal((await runner.replan(request.runId, replan)).budget.dispatches, 1);
  const blocked = await runner.resume(replan.runId); assert.equal(blocked.run.reason, 'DISPATCH_BUDGET_EXHAUSTED');
  const extra = structuredClone(replan); extra.runId = 'replan2'; extra.operations[0]!.operationId = 'replan2:write';
  await assert.rejects(runner.replan(replan.runId, extra), /REPLAN_BUDGET_EXHAUSTED/);
  const replay = structuredClone(request); replay.runId = 'replay'; replay.operations[0]!.operationId = 'replay:write'; replay.operations[0]!.target = 'src/replay.txt';
  assert.equal((await runner.replay(request.runId, replay)).run.lineageId, replay.runId);
  assert.equal((await runner.resume(replay.runId)).run.state, 'completed');
});

test('no blind retry for a STARTED operation even when target is absent', async t => {
  const { runner, request } = await setup(t); await runner.submit(request);
  const result = await runner.resume(request.runId, { observe(event) { if (event === 'started') throw new Error('INJECTED_CRASH'); } });
  assert.equal(result.operations[0]?.state, 'STARTED');
  await assert.rejects(runner.retryAttempt(request.runId), /RECONCILIATION_REQUIRED/);
  const resumed = await runner.resume(request.runId);
  assert.equal(resumed.run.reason, 'RECONCILIATION_REQUIRED'); assert.equal(resumed.budget.dispatches, 1);
});

test('same-broker runs are queued and a later stale snapshot cannot dispatch', async t => {
  const { runner, request } = await setup(t); await runner.submit(request);
  const next = structuredClone(request); next.runId = 'second'; next.operations[0]!.operationId = 'second:write'; next.operations[0]!.target = 'src/second.txt'; await runner.submit(next);
  const results = await Promise.all([runner.resume(request.runId), runner.resume(next.runId)]);
  assert.equal(results[0]!.run.state, 'completed'); assert.equal(results[1]!.run.reason, 'WORKSPACE_DRIFT');
  assert.equal(results[1]!.budget.dispatches, 0);
});

test('executor output can resemble a secret but raw tool output and arguments stay out of event log', async t => {
  const { runner, request } = await setup(t); request.operations[0]!.content = 'FAKE_SECRET_DO_NOT_LOG_7612';
  await runner.submit(request); assert.equal((await runner.resume(request.runId)).run.state, 'completed');
  assert.equal(JSON.stringify(runner.store.events(request.runId)).includes('FAKE_SECRET'), false);
});

test('workspace symlink and path escape are rejected before dispatch', async t => {
  const { runner, request } = await setup(t);
  request.operations[0]!.target = '../outside';
  await assert.rejects(runner.submit(request), /PATH_SCOPE_DENIED/);
});

test('tampered checkpoint artifact fails closed', async t => {
  const { runner, request } = await setup(t); await runner.submit(request);
  const run = runner.status(request.runId).run;
  run.checkpointRef = runner.store.artifact({ ...runner.status(request.runId).checkpoint, workflowDefinitionVersion: 'other/2' });
  runner.store.write('run', run.runId, run);
  await assert.rejects(runner.resume(run.runId), /CHECKPOINT_VERSION_MISMATCH/);
});

test('workspace hardlinks cannot alias an external protected file', async t => {
  const { root, workspace, runner, request } = await setup(t);
  writeFileSync(path.join(root, 'protected.txt'), 'oracle');
  linkSync(path.join(root, 'protected.txt'), path.join(workspace, 'src/oracle.txt'));
  await assert.rejects(runner.submit(request), /WORKSPACE_HARDLINK/);
  assert.equal(runner.store.list('operation').length, 0);
});

test('planning results persist in checkpoint but unmetered usage cannot authorize execution', async t => {
  const { runner, request } = await setup(t); await runner.submit(request);
  const result = await runner.planBranches(request.runId, [{ branchId: 'planner', inputDigest: digest('input'), plan: async () => ({ proposed: true }) }]);
  assert.equal(result.complete, true);
  assert.ok(runner.status(request.runId).checkpoint?.completedNodeIds.includes('planner:planner'));
  assert.equal(runner.status(request.runId).checkpoint?.budgetSpent.status, 'unknown');
  const blocked = await runner.resume(request.runId);
  assert.equal(blocked.run.reason, 'PLANNER_USAGE_UNMETERED'); assert.equal(blocked.budget.dispatches, 0);
});

test('planner timeout cannot commit a late result or reset its attempt budget', async t => {
  const { runner, request, config } = await setup(t); config.limits.timeoutMs = 30; config.limits.maxPlannerAttempts = 1;
  await runner.configure(config); await runner.submit(request);
  const branches = [{ branchId: 'slow', inputDigest: digest('slow'), plan: async () => { await new Promise(resolve => setTimeout(resolve, 80)); return { late: true }; } }];
  assert.equal((await runner.planBranches(request.runId, branches)).complete, false);
  await new Promise(resolve => setTimeout(resolve, 90));
  assert.equal(runner.store.list('branch').length, 0);
  assert.equal((await runner.planBranches(request.runId, branches)).complete, false);
  assert.equal(runner.status(request.runId).budget.plannerAttempts, 1);
});

test('cancelled effect can be explicitly reconciled without redispatch or uncancelling the run', async t => {
  const { runner, request, config } = await setup(t); config.limits.timeoutMs = 500;
  await runner.configure(config); await runner.submit(request);
  const paused = await runner.resume(request.runId, { fixtureFault: 'hang-after-effect' });
  assert.equal(paused.run.state, 'paused'); await runner.cancel(request.runId);
  const result = await runner.reconcile(request.runId);
  assert.equal(result.run.state, 'cancelled', result.run.reason ?? undefined);
  assert.equal(result.run.reason, 'CANCELLED_RECONCILED'); assert.equal(result.operations[0]?.state, 'COMMITTED');
  assert.equal(result.budget.dispatches, 1); assert.equal((await runner.resume(request.runId)).run.state, 'cancelled');
});
