import assert from 'node:assert/strict';
import test from 'node:test';
import { digest } from '../src/contracts/canonical.js';
import type { ModelCreditUsage } from '../src/contracts/credit-usage.js';
import { B_TASK_CUMULATIVE_CREDIT_CAP_MICROS, classifyUnityComparisonFailure, auditNativeUnityExecution, type AStage, type ComparisonReceipt, type ToolEnabledUnityCodexExecutor, type UnityComparisonModelAdapter, type UnityComparisonOptions, type UnityComparisonVerifier, runUnityComparison } from '../src/unity/comparison.js';
import { UNITY_TASK_MANIFEST } from '../src/unity/walking-skeleton.js';

const tasks = UNITY_TASK_MANIFEST;
const lockMaterial = { protocol: { revision: 'locked-protocol-1' }, skills: { unity: 'unity-cli-v1' }, source: { revision: 'source-r1' } };
const lock = {
  locked: true as const,
  protocolDigest: digest(lockMaterial.protocol), tasksDigest: digest(tasks), skillsDigest: digest(lockMaterial.skills),
  modelsDigest: digest({ planner: 'gpt-6-sol', critic: 'gpt-6-sol', executor: 'gpt-5.6-terra', c: 'gpt-5.6-terra' }),
  sourceDigest: digest(lockMaterial.source), unityCliPermissionsDigest: 'sha256:unity-cli-permissions',
};
const usage = (model: ComparisonReceipt['model'], patch: Partial<ModelCreditUsage> = {}): ModelCreditUsage => ({ model, inputTokens: 10, cachedInputTokens: 0, outputTokens: 10, ...patch });
function receipt(id: string, model: ComparisonReceipt['model'], source: string, patch: Partial<ComparisonReceipt> = {}): ComparisonReceipt {
  return { receiptId: id, model, usage: usage(model), elapsedMs: 1, status: 'completed', source, toolProofRefs: [], artifact: { source }, ...patch };
}

function fixture(options: { aFailures?: ReadonlyMap<string, string>; cFailures?: ReadonlySet<string>; cUsage?: ModelCreditUsage } = {}) {
  const aCalls: string[] = [], repairs: string[] = [], cCalls: string[] = [];
  const model: UnityComparisonModelAdapter = {
    async runAStage({ task, stage, priorStages }) { aCalls.push(`${task.taskId}:${stage}`); assert.equal(priorStages.length, stage === 'planner' ? 0 : stage === 'critic' ? 1 : 2); return receipt(`a:${task.taskId}:${stage}`, stage === 'executor' ? 'gpt-5.6-terra' : 'gpt-6-sol', `${task.taskId}:a`, stage === 'critic' ? { criticApproved: true } : {}); },
    async repairB({ task }) { repairs.push(task.taskId); return receipt(`b:${task.taskId}`, 'gpt-5.6-terra', `${task.taskId}:b`); },
  };
  const verifier: UnityComparisonVerifier = { async verify({ arm, task }) {
    const error = arm === 'A' ? options.aFailures?.get(task.taskId) : arm === 'C' && options.cFailures?.has(task.taskId) ? 'test assertion failed' : undefined;
    return error === undefined ? { outcome: 'pass', feedback: '', evidenceId: `${arm}:${task.taskId}`, hiddenPass: true }
      : { outcome: 'fail', feedback: error, evidenceId: `${arm}:${task.taskId}` };
  } };
  const cExecutor: ToolEnabledUnityCodexExecutor = {
    kind: 'ordinary-codex', model: 'gpt-5.6-terra', toolEnabled: true, unityCliPermissionsDigest: lock.unityCliPermissionsDigest, skillsDigest: lock.skillsDigest,
    async runCToolEnabled({ task }) { cCalls.push(task.taskId); return { ...receipt(`c:${task.taskId}`, 'gpt-5.6-terra', `${task.taskId}:c`), usage: options.cUsage ?? usage('gpt-5.6-terra'), toolProofRefs: [`turn:${task.taskId}`] }; },
  };
  const base: UnityComparisonOptions = { tasks, lock, lockMaterial, admission: { conditionalAuthorizationRef: 'user:conditional-comparison', s1Passed: true, lockedProtocol: true, forecastWeeklyQuotaPercent: 8.85835 }, model, verifier };
  return { ...base, cExecutor, aCalls, repairs, cCalls };
}

test('B reuses A passes, repairs only model failures, and accounts A plus repair cumulatively', async () => {
  const f = fixture({ aFailures: new Map([['integer-clamp', 'CS1002 compilation error']]) });
  const { cExecutor: _noC, ...withoutC } = f;
  const report = await runUnityComparison(withoutC);
  assert.equal(f.aCalls.length, 30);
  assert.deepEqual(f.repairs, ['integer-clamp']);
  assert.equal(report.b[0]!.reusedAResult, false);
  assert.equal(report.b[1]!.reusedAResult, true);
  assert.equal(report.a[0]!.creditMicros, 9_500);
  assert.equal(report.b[0]!.creditMicros, 13_000);
  assert.equal(report.summary.b!.creditMicros, 98_500);
  assert.equal(report.stoppedReason, 'c-tool-transport-unavailable');
});

test('B carries the latest compile/test feedback into at most two Terra repairs', async () => {
  const f = fixture({ aFailures: new Map([['integer-clamp', 'CS1002 compilation error']]) });
  const repairInputs: { attempt: number; previousSource: string; feedback: string }[] = [];
  const model: UnityComparisonModelAdapter = { ...f.model, async repairB(input) { repairInputs.push(input); return f.model.repairB(input); } };
  let bChecks = 0;
  const verifier: UnityComparisonVerifier = { async verify(input) {
    if (input.arm === 'B' && input.task.taskId === 'integer-clamp' && bChecks++ === 0) return { outcome: 'fail', feedback: 'CS1513 compile error', evidenceId: 'b:first' };
    return f.verifier.verify(input);
  } };
  const { cExecutor: _noC, ...withoutC } = f;
  const report = await runUnityComparison({ ...withoutC, model, verifier });
  assert.deepEqual(repairInputs.map(input => input.attempt), [1, 2]);
  assert.equal(repairInputs[1]!.previousSource, 'integer-clamp:b');
  assert.equal(repairInputs[1]!.feedback, 'CS1513 compile error');
  assert.equal(report.b[0]!.receipts.length, 5);
});

test('two A infrastructure failures stop before B and C dispatch', async () => {
  const f = fixture({ aFailures: new Map([['integer-clamp', 'Unity license unavailable'], ['cell-bounds', 'missing NUnit XML']]) });
  const report = await runUnityComparison({ ...f, cExecutor: f.cExecutor });
  assert.equal(report.stoppedReason, 'a-infrastructure-failures');
  assert.equal(report.infrastructureFailures, 2);
  assert.equal(f.aCalls.length, 6);
  assert.deepEqual(f.repairs, []);
  assert.deepEqual(f.cCalls, []);
});

test('C requires a matching tool-enabled ordinary Codex executor and keeps B when it wins by two passes', async () => {
  const f = fixture({ cFailures: new Set(['integer-clamp', 'cell-bounds']), cUsage: usage('gpt-5.6-terra', { inputTokens: 0, cachedInputTokens: 0, outputTokens: 15_000 }) });
  const report = await runUnityComparison({ ...f, cExecutor: f.cExecutor });
  assert.equal(f.cCalls.length, 10);
  assert.equal(report.decision!.decision, 'keep-B');
  assert.equal(report.summary.b!.manualOwnerFixes, 0);
  assert.equal(report.summary.c!.manualOwnerFixes, 0);
  const mismatched = fixture();
  const unavailable = await runUnityComparison({ ...mismatched, cExecutor: { ...mismatched.cExecutor, skillsDigest: 'sha256:other' } });
  assert.equal(unavailable.stoppedReason, 'c-tool-transport-unavailable');
  assert.deepEqual(mismatched.cCalls, []);
  const live = fixture();
  const { cExecutor: _missingC, ...liveWithoutC } = live;
  await assert.rejects(runUnityComparison({ ...liveWithoutC, mode: 'live' }), /UNITY_COMPARISON_C_TOOL_TRANSPORT_REQUIRED/);
  assert.deepEqual(live.aCalls, []);
});

test('C cap counts cached input and has no raw-token substitute cap', async () => {
  const f = fixture({ cUsage: usage('gpt-5.6-terra', { inputTokens: 50_000, cachedInputTokens: 50_000, outputTokens: 15_000 }) });
  const report = await runUnityComparison({ ...f, cExecutor: f.cExecutor });
  assert.equal(report.stoppedReason, 'credit-cap');
  assert.equal(report.c.length, 1);
  assert.ok(B_TASK_CUMULATIVE_CREDIT_CAP_MICROS < 4_750_000);
});

test('unknown token usage and missing admission evidence fail closed', async () => {
  const f = fixture();
  const unknownModel: UnityComparisonModelAdapter = { ...f.model, async runAStage({ task, stage, priorStages }: { task: typeof tasks[number]; stage: AStage; priorStages: readonly ComparisonReceipt[] }) {
    const result = await f.model.runAStage({ task, stage, priorStages, maxTaskCreditMicros: 2_700_100, lock });
    return { ...result, usage: { ...result.usage, inputTokens: null } };
  } };
  const { cExecutor: _noC, ...withoutC } = f;
  assert.equal((await runUnityComparison({ ...withoutC, model: unknownModel })).stoppedReason, 'unknown-usage');
  await assert.rejects(runUnityComparison({ ...withoutC, admission: { ...withoutC.admission, forecastWeeklyQuotaPercent: null } }), /UNITY_COMPARISON_FORECAST_UNKNOWN/);
  await assert.rejects(runUnityComparison({ ...withoutC, admission: { ...withoutC.admission, forecastWeeklyQuotaPercent: -0.1 } }), /UNITY_COMPARISON_FORECAST_QUOTA_EXCEEDED/);
});

test('C at least as successful as B requests the separately approved feature and multi-session batch 2', async () => {
  const f = fixture();
  const report = await runUnityComparison({ ...f, cExecutor: f.cExecutor });
  assert.equal(report.decision!.decision, 'batch2-separate-approval-required');
  assert.deepEqual(report.decision!.batch2, { featureTasks: 4, multiSessionTasks: 2, instruction: 'run-feature-and-multi-session-comparison', approvalRequired: true });
});

test('duplicate receipts and quota stops preserve the completed row for durable progress recording', async () => {
  const f = fixture();
  const model: UnityComparisonModelAdapter = { ...f.model, async runAStage(input) {
    const result = await f.model.runAStage(input);
    return input.task.taskId === 'cell-bounds' && input.stage === 'planner' ? { ...result, receiptId: 'a:integer-clamp:planner' } : result;
  } };
  const saved: string[] = [];
  const { cExecutor: _noC, ...withoutC } = f;
  const duplicate = await runUnityComparison({ ...withoutC, model, onResult: (arm, row) => saved.push(`${arm}:${row.taskId}`) });
  assert.equal(duplicate.stoppedReason, 'duplicate-receipt');
  assert.deepEqual(saved, ['A:integer-clamp', 'A:cell-bounds']);
  const quota = fixture();
  const { cExecutor: _alsoNoC, ...quotaWithoutC } = quota;
  const quotaStop = await runUnityComparison({ ...quotaWithoutC, shouldStop: arm => arm === 'A' });
  assert.equal(quotaStop.stoppedReason, 'quota-stop');
  assert.equal(quotaStop.a.length, 1);
});

test("broker infrastructure evidence is never classified as a model failure", () => {
  assert.equal(classifyUnityComparisonFailure("Infrastructure failure: test count mismatch", "unknown"), "infrastructure");
  assert.equal(classifyUnityComparisonFailure("Compile/test failed: assertion", "fail"), "model");
});

test('native Unity proof requires a durable receipt and a single bound A/B candidate', () => {
  assert.match(auditNativeUnityExecution('A', 'a', [])!, /infrastructure/);
  assert.match(auditNativeUnityExecution('C', 'a', [])!, /infrastructure/);
  assert.match(auditNativeUnityExecution('B', 'a', [{sourceSha256:'b'}])!, /one-candidate/);
  assert.match(auditNativeUnityExecution('A', 'a', [{sourceSha256:'a'}, {sourceSha256:'a'}])!, /one-candidate/);
  assert.equal(auditNativeUnityExecution('A', 'a', [{sourceSha256:'a'}]), null);
  assert.equal(auditNativeUnityExecution('C', 'b', [{sourceSha256:'a'}]), null); // Final changed C candidate still needs verification.
});
