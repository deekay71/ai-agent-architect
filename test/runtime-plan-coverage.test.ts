import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runtimeFixture } from '../fixtures/runtime.js';
import { digest, digestOmitting } from '../src/contracts/canonical.js';
import { planningInputs } from '../src/runtime/evaluation.js';
import { PersistentWorkflowRunner } from '../src/runtime/runner.js';

async function setup(t: test.TestContext) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'architect-plan-coverage-'));
  const workspace = path.join(root, 'candidate'); mkdirSync(path.join(workspace, 'src'), { recursive: true });
  const runner = new PersistentWorkflowRunner(workspace, path.join(root, 'control'));
  const fixture = runtimeFixture();
  const steps = fixture.request.records.plan.subplans[0]!.steps;
  steps.push({ ...structuredClone(steps[0]!), stepId: 'step-2', dependsOn: ['step-1'] });
  fixture.request.records.plan.requirementCoverage[0]!.stepRefs.push('step-2');
  fixture.request.records.plan.hash = digestOmitting(fixture.request.records.plan, 'hash');
  fixture.config.authority.planning.expectedInputs = planningInputs(fixture.request.records);
  await runner.configure(fixture.config);
  t.after(async () => { await runner.close(); rmSync(root, { recursive: true, force: true }); });
  return { runner, workspace, ...fixture };
}

function repin(f: ReturnType<typeof runtimeFixture>): void {
  f.request.records.plan.hash = digestOmitting(f.request.records.plan, 'hash');
  f.request.records.manifest.taskSpecDigest = digest(f.request.records.task);
  f.request.records.manifest.manifestDigest = digestOmitting(f.request.records.manifest, 'manifestDigest');
  f.request.records.context.manifestDigest = f.request.records.manifest.manifestDigest;
  f.config.authority.planning.expectedInputs = planningInputs(f.request.records);
}

test('submission cannot omit a required step from an approved multi-step plan', async t => {
  const { runner, request } = await setup(t);
  await assert.rejects(runner.submit(request), /PLAN_STEP_COVERAGE/);
  assert.equal(runner.store.list('operation').length, 0);
  assert.equal(runner.store.list('run').length, 0);
});

test('repeating one step cannot substitute for a different required step', async t => {
  const { runner, request } = await setup(t);
  request.operations.push({ ...request.operations[0]!, operationId: 'second-write', target: 'src/second.txt' });
  await assert.rejects(runner.submit(request), /PLAN_STEP_COVERAGE/);
  assert.equal(runner.store.list('operation').length, 0);
});

test('complete dependency-ordered step coverage can execute each approved operation once', async t => {
  const { runner, request } = await setup(t);
  request.operations.push({ ...request.operations[0]!, operationId: 'second-write', stepId: 'step-2', target: 'src/second.txt' });
  await runner.submit(request);
  const status = await runner.resume(request.runId);
  assert.equal(status.run.state, 'completed', status.run.reason ?? undefined);
  assert.deepEqual(status.operations.map(x => x.state), ['COMMITTED', 'COMMITTED']);
  assert.equal(status.budget.dispatches, 2);
});

test('complete coverage cannot ignore a declared dependency order', async t => {
  const { runner, request } = await setup(t);
  request.operations.unshift({ ...request.operations[0]!, operationId: 'second-write', stepId: 'step-2', target: 'src/second.txt' });
  await assert.rejects(runner.submit(request), /TOOL_PLAN_DENIED/);
  assert.equal(runner.store.list('operation').length, 0);
});

for (const scope of ['manifest', 'subplan'] as const) test(`operation target must respect the narrower approved ${scope} scope`, async t => {
  const f = await setup(t);
  mkdirSync(path.join(f.workspace, 'src/approved'));
  if (scope === 'manifest') f.request.records.manifest.scope.allowedPaths = ['src/approved'];
  else f.request.records.plan.subplans[0]!.scope.allowedPaths = ['src/approved'];
  f.request.operations.push({ ...f.request.operations[0]!, operationId: 'second-write', stepId: 'step-2', target: 'src/second.txt' });
  repin(f); await f.runner.configure(f.config);
  await assert.rejects(f.runner.submit(f.request), /SCOPE|PATH/);
  assert.equal(f.runner.store.list('operation').length, 0);
});

test('subplan dependency order applies even when individual steps do not repeat it', async t => {
  const f = await setup(t);
  const first = f.request.records.plan.subplans[0]!, secondStep = first.steps.pop()!;
  secondStep.dependsOn = [];
  f.request.records.plan.subplans.push({ ...structuredClone(first), planId: 'subplan-2', dependencies: [first.planId], steps: [secondStep] });
  f.request.operations.unshift({ ...f.request.operations[0]!, operationId: 'second-write', stepId: 'step-2', target: 'src/second.txt' });
  repin(f); await f.runner.configure(f.config);
  await assert.rejects(f.runner.submit(f.request), /SUBPLAN_DEPENDENCY_DENIED/);
  assert.equal(f.runner.store.list('operation').length, 0);
});

test('a supported validator ID cannot silently request an unsupported evidence kind', async t => {
  const f = await setup(t);
  f.request.operations.push({ ...f.request.operations[0]!, operationId: 'second-write', stepId: 'step-2', target: 'src/second.txt' });
  f.config.authority.gate.checks.find(x => x.stage === 'planning')!.definition.requiredEvidenceKinds = ['image-review'];
  await f.runner.configure(f.config); await f.runner.submit(f.request);
  const result = await f.runner.resume(f.request.runId);
  assert.equal(result.run.state, 'blocked');
  assert.equal(result.run.reason, 'GATE_CHECK_UNSUPPORTED');
  assert.equal(result.budget.dispatches, 0);
  assert.equal(result.operations.length, 0);
});
