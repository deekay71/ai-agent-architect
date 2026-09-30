import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { digest } from '../src/contracts/canonical.js';
import { CODEX_CLI_VERSION, CODEX_LAUNCH_POLICY_DIGEST, renderCodexRequest, type CodexResult, type CodexTransport } from '../src/providers/codex.js';
import { resumeCodexJudgments, runCodexJudgments } from '../src/evaluation/codex-judgment.js';
import { loadEvaluatorOracle, loadPublicDataset } from '../src/evaluation/dataset.js';
import { SubscriptionBudget } from '../src/evaluation/subscription-budget.js';
import { ExposureRegistry } from '../src/evaluation/exposure.js';
import type { JudgmentInput } from '../src/evaluation/semantic-judgment.js';
import { replayCodexJudgments } from '../src/evaluation/acceptance-evidence.js';

const data = loadPublicDataset('fixtures/semantic-benchmark'), task = data.cases.find(c => c.id === 'sem-001')!;
const gold = loadEvaluatorOracle('fixtures/semantic-benchmark').find(g => g.caseId === task.id)!;
function setup(t: test.TestContext) {
  const root = mkdtempSync(path.join(tmpdir(), 'codex-judge-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const dir of ['src', 'fixtures', 'dist/src', 'dist/fixtures']) mkdirSync(path.join(root, dir), { recursive: true });
  for (const file of ['src/pin.ts', 'fixtures/contracts.ts', 'dist/src/pin.js', 'dist/fixtures/contracts.js', 'package.json', 'pnpm-lock.yaml', 'tsconfig.json']) writeFileSync(path.join(root, file), '{}');
  const input: JudgmentInput = { id: 'a', task, gold, readerModel: 'gpt-5.6-terra', documents: data.documents.filter(d => gold.requiredEvidenceIds.includes(d.id)),
    answer: { disposition: 'answer', answer: gold.acceptableAlternatives[0]!, evidenceIds: gold.requiredEvidenceIds, revisions: gold.expectedRevision, constraints: gold.expectedConstraints, confidence: 0.9 } };
  const options = { inputs: [input], judge: { id: 'sol', model: 'gpt-6-sol', role: 'planner' as const, reasoningEffort: 'medium' as const },
    repositoryRoot: root, outputRoot: path.join(root, 'output'), usageRoot: path.join(root, 'usage'), maxRequestBytes: 100_000, timeoutMs: 10_000,
    authorization: { authorizationId: 'mock-only', maxInvocations: 10, maxReportedTokens: 100_000, maxWallTimeMs: 60_000 } };
  return { root, options };
}
function fake(change?: (result: CodexResult, count: number) => void) {
  let calls = 0;
  const transport: CodexTransport = { id: 'codex-chatgpt-exec/1', assurance: 'mock', launchPolicyDigest: CODEX_LAUNCH_POLICY_DIGEST,
    configurationDigest: r => digest({ model: r.model, effort: r.reasoningEffort }),
    async respond(request) {
      calls++;
      const result: CodexResult = { status: 'completed', requestedModel: request.model, requestDigest: digest(request),
        renderedRequestDigest: digest(renderCodexRequest(request)), launchPolicyDigest: CODEX_LAUNCH_POLICY_DIGEST,
        configurationDigest: transport.configurationDigest(request),
        output: { judgments: (JSON.parse(request.input) as { items: { id: string }[] }).items.map(i => ({ id: i.id,
          addressesQuestion: true, supportedByEvidence: true, respectsConstraintMeaning: true, abstentionAppropriate: false,
          rationale: 'Source supports this answer.', unsupportedClaims: [], violatedConstraintIds: [] })) },
        usage: { inputTokens: 99, outputTokens: 1, cachedInputTokens: 0, totalTokens: 100, reasoningTokens: null },
        elapsedMs: 1, cliVersion: CODEX_CLI_VERSION, threadId: 'mock', issues: [], apiCostMicros: null,
        exactInputCount: null, modelIdentityAssurance: 'requested-only', maxOutputTokensEnforced: false,
        isolationAssurance: 'capability-flags-and-event-audit' };
      change?.(result, calls); return result;
    } };
  return { transport, count: () => calls };
}
test('advisory native runner binds every request/output, charges usage and writes exact coverage', async t => {
  const w = setup(t), f = fake();
  const inputs = Array.from({ length: 7 }, (_, n) => ({ ...w.options.inputs[0]!, id: `item-${n}` }));
  const report = await runCodexJudgments({ ...w.options, inputs, transport: f.transport });
  assert.equal(report.assessed, 7); assert.equal(f.count(), 2); assert.equal(report.budget.reportedTokens, 200);
  assert.equal(report.humanReviewed, false); assert.equal(report.releaseEligible, false); assert.equal(report.stoppedReason, null);
  assert.equal(readFileSync(path.join(w.options.outputRoot, 'exposure.jsonl'), 'utf8').trim().split('\n').length, 2);
  await assert.rejects(runCodexJudgments({ ...w.options, transport: f.transport })); assert.equal(f.count(), 2);
});
test('judgment replay reconstructs requests and ignores fabricated report pass flags', async t => {
  const w = setup(t), f = fake();
  const report = await runCodexJudgments({ ...w.options, transport: f.transport });
  const replayOptions = { root: w.options.outputRoot, inputs: w.options.inputs, judge: w.options.judge,
    pinDigest: report.pinDigest, authorization: w.options.authorization };
  const replay = replayCodexJudgments(replayOptions);
  assert.equal(replay.complete, true); assert.equal(replay.assessments[0]!.assessment.advisoryPass, true);
  const reportFile = path.join(w.options.outputRoot, 'report.json');
  const altered = structuredClone(report); altered.assessments[0]!.assessment.advisoryPass = false;
  writeFileSync(reportFile, JSON.stringify(altered));
  assert.throws(() => replayCodexJudgments(replayOptions), /ASSESSMENT_DRIFT/);
  writeFileSync(reportFile, JSON.stringify(report));
  const requestFile = path.join(w.options.outputRoot, 'request-0.json');
  const request = JSON.parse(readFileSync(requestFile, 'utf8')) as { input: string }; request.input += ' '; writeFileSync(requestFile, JSON.stringify(request));
  assert.throws(() => replayCodexJudgments(replayOptions), /REQUEST_DRIFT/);
});
test('unbound or missing usage freezes the authorization; a renamed output cannot retry', async t => {
  const w = setup(t), f = fake(r => { r.requestDigest = digest('forged'); });
  const r = await runCodexJudgments({ ...w.options, transport: f.transport });
  assert.equal(r.assessed, 0); assert.equal(r.budget.unknownAttempts, 1); assert.equal(r.stoppedReason, 'unknown-usage');
  const second = await runCodexJudgments({ ...w.options, outputRoot: path.join(w.root, 'renamed'), transport: f.transport });
  assert.equal(f.count(), 1); assert.equal(second.assessed, 0); assert.equal(second.stoppedReason, 'unknown-usage');
});
test('malformed semantic batch stays failed with settled usage, never an accepted partial result', async t => {
  const w = setup(t), f = fake(r => { r.output = { judgments: [] }; });
  const r = await runCodexJudgments({ ...w.options, transport: f.transport });
  assert.equal(r.assessed, 0); assert.equal(r.stoppedReason, 'invalid-judge-output'); assert.equal(r.budget.reportedTokens, 100);
});
test('a settled malformed request cannot be retried through a new output root', async t => {
  const w = setup(t), f = fake(r => { r.output = { judgments: [] }; });
  const failed = await runCodexJudgments({ ...w.options, transport: f.transport });
  const retried = await runCodexJudgments({ ...w.options, outputRoot: path.join(w.root, 'renamed'), transport: f.transport });
  assert.equal(f.count(), 1); assert.equal(failed.budget.reportedTokens, 100);
  assert.equal(retried.stoppedReason, 'already-dispatched'); assert.equal(retried.planned, 1); assert.equal(retried.assessed, 0);
  assert.equal(retried.budget.reportedTokens, 100);
});
test('a five-of-six completed response stays an immutable failed attempt while recovery can only continue an undispatched later batch', async t => {
  const w = setup(t), f = fake(r => {
    const judgments = (r.output as { judgments: unknown[] }).judgments;
    r.output = { judgments: judgments.slice(0, 5) };
  });
  const inputs = Array.from({ length: 7 }, (_, n) => ({ ...w.options.inputs[0]!, id: `item-${n}` }));
  const failed = await runCodexJudgments({ ...w.options, inputs, transport: f.transport });
  assert.equal(failed.assessed, 0); assert.equal(failed.planned, 7); assert.equal(failed.stoppedReason, 'invalid-judge-output');
  const reportFile = path.join(w.options.outputRoot, 'report.json'), eventFile = path.join(w.options.outputRoot, 'checkpoint-events.jsonl'),
    callsFile = path.join(w.options.outputRoot, 'calls.jsonl'), exposureFile = path.join(w.options.outputRoot, 'exposure.jsonl');
  const originalReport = readFileSync(reportFile, 'utf8'), originalEvents = readFileSync(eventFile, 'utf8'),
    originalCalls = readFileSync(callsFile, 'utf8'), originalExposure = readFileSync(exposureFile, 'utf8');
  const forged = { ...failed, assessed: 1, assessments: [{ id: 'item-0', assessment: 'forged' }] };
  writeFileSync(reportFile, JSON.stringify(forged));
  await assert.rejects(resumeCodexJudgments({ ...w.options, parentRoot: w.options.outputRoot, outputRoot: path.join(w.root, 'forged-report'), inputs, transport: fake().transport }), /ACCEPTANCE_JUDGE_ASSESSMENT_(DRIFT|JOURNAL_DRIFT)/);
  writeFileSync(reportFile, originalReport); writeFileSync(eventFile, '');
  await assert.rejects(resumeCodexJudgments({ ...w.options, parentRoot: w.options.outputRoot, outputRoot: path.join(w.root, 'missing-event'), inputs, transport: fake().transport }), /ACCEPTANCE_JUDGE_DISPATCH_HISTORY/);
  writeFileSync(eventFile, originalEvents); writeFileSync(callsFile, originalCalls); writeFileSync(exposureFile, originalExposure);
  const continued = await resumeCodexJudgments({ ...w.options, parentRoot: w.options.outputRoot, outputRoot: path.join(w.root, 'continuation'), inputs, transport: fake().transport });
  assert.equal(continued.assessed, 1);
  assert.equal(continued.failedBatchIndexes[0], 0);
  assert.equal(existsSync(path.join(w.root, 'continuation', 'request-0.json')), false);
  const replayOptions = { root: path.join(w.root, 'continuation'), inputs, judge: w.options.judge, pinDigest: failed.pinDigest, authorization: w.options.authorization };
  const replay = replayCodexJudgments(replayOptions);
  assert.equal(replay.assessments.length, 1); assert.deepEqual(replay.failedBatchIndexes, [0]); assert.equal(replay.complete, false);
  const childReportFile = path.join(w.root, 'continuation', 'report.json'), childLockFile = path.join(w.root, 'continuation', 'lock.json');
  const childReport = readFileSync(childReportFile, 'utf8'), childLock = readFileSync(childLockFile, 'utf8');
  const alteredReport = { ...JSON.parse(childReport), assessed: 0 };
  writeFileSync(childReportFile, JSON.stringify(alteredReport));
  assert.throws(() => replayCodexJudgments(replayOptions), /ASSESSMENT_DRIFT/);
  writeFileSync(childReportFile, childReport);
  const alteredLock = JSON.parse(childLock) as { continuation: { parentLockDigest: string; parentCheckpointDigest: string } };
  alteredLock.continuation.parentLockDigest = digest('forged-parent-lock'); writeFileSync(childLockFile, JSON.stringify(alteredLock));
  assert.throws(() => replayCodexJudgments(replayOptions), /PARENT_BINDING/);
  writeFileSync(childLockFile, childLock);
  const child = JSON.parse(childLock) as { continuation: { parentCheckpointDigest: string } };
  const claimFile = path.join(w.options.usageRoot, `judgment-continuation-${digest({ parentRoot: realpathSync(w.options.outputRoot), checkpoint: child.continuation.parentCheckpointDigest }).slice(7)}.json`);
  const claim = readFileSync(claimFile, 'utf8'); writeFileSync(claimFile, JSON.stringify({ ...JSON.parse(claim), childRoot: path.join(w.root, 'forged-child') }));
  assert.throws(() => replayCodexJudgments(replayOptions));
  writeFileSync(claimFile, claim);
  await assert.rejects(resumeCodexJudgments({ ...w.options, parentRoot: w.options.outputRoot, outputRoot: path.join(w.root, 'second-continuation'), inputs, transport: fake().transport }), /JUDGMENT_CONTINUATION_CLAIM_EXISTS/);
});
test('erasing every parent journal cannot reopen a settled batch because the authorization ledger remains', async t => {
  const w = setup(t), f = fake(r => { r.output = { judgments: (r.output as { judgments: unknown[] }).judgments.slice(0, 5) }; });
  const inputs = Array.from({ length: 7 }, (_, n) => ({ ...w.options.inputs[0]!, id: `ledger-${n}` }));
  await runCodexJudgments({ ...w.options, inputs, transport: f.transport });
  for (const name of ['checkpoint-events.jsonl', 'calls.jsonl', 'exposure.jsonl']) writeFileSync(path.join(w.options.outputRoot, name), '');
  await assert.rejects(resumeCodexJudgments({ ...w.options, parentRoot: w.options.outputRoot, outputRoot: path.join(w.root, 'erased'), inputs, transport: fake().transport }), /JUDGMENT_RESUME_LEDGER_BINDING/);
  assert.equal(readdirSync(w.options.usageRoot).some(name => name.startsWith('judgment-continuation-')), false);
});
test('continuation discards a response when mutable limits drift during its call', async t => {
  const w = setup(t), malformed = fake(r => { r.output = { judgments: (r.output as { judgments: unknown[] }).judgments.slice(0, 5) }; });
  const inputs = Array.from({ length: 7 }, (_, n) => ({ ...w.options.inputs[0]!, id: `drift-${n}` }));
  await runCodexJudgments({ ...w.options, inputs, transport: malformed.transport });
  const continuation = { ...w.options, parentRoot: w.options.outputRoot, outputRoot: path.join(w.root, 'drift-continuation'), inputs, transport: fake(() => { continuation.timeoutMs++; }).transport };
  const result = await resumeCodexJudgments(continuation);
  assert.equal(result.stoppedReason, 'binding-drift'); assert.equal(result.ownAssessed, 0);
});
test('continuation discards a response when a parent artifact changes during its call', async t => {
  const w = setup(t), malformed = fake(r => { r.output = { judgments: (r.output as { judgments: unknown[] }).judgments.slice(0, 5) }; });
  const inputs = Array.from({ length: 7 }, (_, n) => ({ ...w.options.inputs[0]!, id: `parent-drift-${n}` }));
  await runCodexJudgments({ ...w.options, inputs, transport: malformed.transport });
  const reportFile = path.join(w.options.outputRoot, 'report.json');
  const continuation = await resumeCodexJudgments({ ...w.options, parentRoot: w.options.outputRoot, outputRoot: path.join(w.root, 'parent-drift-continuation'),
    inputs, transport: fake(() => writeFileSync(reportFile, `${readFileSync(reportFile, 'utf8')} `)).transport });
  assert.equal(continuation.stoppedReason, 'binding-drift'); assert.equal(continuation.ownAssessed, 0);
});
test('a forged empty parent assessment journal cannot make a malformed batch look assessed', async t => {
  const w = setup(t), malformed = fake(r => { r.output = { judgments: (r.output as { judgments: unknown[] }).judgments.slice(0, 5) }; });
  const inputs = Array.from({ length: 7 }, (_, n) => ({ ...w.options.inputs[0]!, id: `journal-${n}` }));
  await runCodexJudgments({ ...w.options, inputs, transport: malformed.transport });
  writeFileSync(path.join(w.options.outputRoot, 'assessments.jsonl'), JSON.stringify({ index: 0, requestDigest: digest('forged'), assessments: [] }) + '\n');
  await assert.rejects(resumeCodexJudgments({ ...w.options, parentRoot: w.options.outputRoot, outputRoot: path.join(w.root, 'forged-journal'), inputs, transport: fake().transport }), /ACCEPTANCE_JUDGE_ASSESSMENT_(DRIFT|JOURNAL_DRIFT)/);
});
test('source drift observed after a completed call blocks grading while preserving consumed usage', async t => {
  const w = setup(t), f = fake(() => writeFileSync(path.join(w.root, 'src/pin.ts'), 'changed'));
  const r = await runCodexJudgments({ ...w.options, transport: f.transport });
  assert.equal(r.stoppedReason, 'binding-drift'); assert.equal(r.assessed, 0); assert.equal(r.budget.reportedTokens, 100);
});
test('transport failure is sanitized and durable unknown; pending never survives as available budget', async t => {
  const w = setup(t), f = fake(); f.transport.respond = async () => { throw Error('secret-token-not-for-logs'); };
  const r = await runCodexJudgments({ ...w.options, transport: f.transport });
  assert.equal(r.budget.unknownAttempts, 1); assert.equal(r.budget.pendingAttempts, 0);
  assert.equal(readFileSync(path.join(w.options.outputRoot, 'calls.jsonl'), 'utf8').includes('secret-token'), false);
  const budget = new SubscriptionBudget(w.options.usageRoot, w.options.authorization);
  try { assert.equal(budget.snapshot().frozen, true); } finally { budget.close(); }
});
test('self review and byte-cap failure refuse before transport calls', async t => {
  const w = setup(t), f = fake();
  await assert.rejects(runCodexJudgments({ ...w.options, inputs: [{ ...w.options.inputs[0]!, readerModel: 'gpt-6-sol' }], transport: f.transport }), /SELF_JUDGMENT/);
  await assert.rejects(runCodexJudgments({ ...w.options, maxRequestBytes: 1024, transport: f.transport }), /PREFLIGHT_LIMIT/);
  assert.equal(f.count(), 0);
});
test('holdout is denied and judge exposure is durable before the first transport call', async t => {
  const w = setup(t);
  const f = fake(() => {
    const registry = new ExposureRegistry(w.options.usageRoot);
    try { assert.equal(registry.inspect(task).reusableAsFresh, false); } finally { registry.close(); }
  });
  await assert.rejects(runCodexJudgments({ ...w.options, inputs: [{ ...w.options.inputs[0]!, task: { ...task, split: 'holdout' } }], transport: f.transport }), /DEV_ONLY/);
  assert.equal(f.count(), 0);
  const r = await runCodexJudgments({ ...w.options, transport: f.transport });
  assert.equal(r.stoppedReason, null);
  const registry = new ExposureRegistry(w.options.usageRoot);
  try { assert.equal(registry.inspect({ ...task, id: 'renamed', family: 'changed', split: 'holdout' }).reusableAsFresh, false); }
  finally { registry.close(); }
});
test('changing timeout or authorization after one batch stops subsequent dispatch', async t => {
  const w = setup(t), f = fake();
  const options = { ...w.options, inputs: Array.from({ length: 7 }, (_, n) => ({ ...w.options.inputs[0]!, id: `x-${n}` })), transport: f.transport,
    onProgress() { options.timeoutMs++; } };
  const r = await runCodexJudgments(options);
  assert.equal(f.count(), 1); assert.equal(r.stoppedReason, 'binding-drift'); assert.equal(r.assessed, 6);
});

// Every transport in these regressions is an in-process fake; native assurance is
// deliberately forged to exercise admission, without launching the native adapter.
test('continuation rejects paired native configuration forgery before claiming or dispatching', async t => {
  const w = setup(t), malformed = fake(r => { r.output = { judgments: [] }; });
  malformed.transport.assurance = 'codex-chatgpt';
  const inputs = Array.from({ length: 7 }, (_, n) => ({ ...w.options.inputs[0]!, id: `native-forgery-${n}` }));
  await runCodexJudgments({ ...w.options, inputs, transport: malformed.transport });
  const child = fake(); child.transport.assurance = 'codex-chatgpt';
  await assert.rejects(resumeCodexJudgments({ ...w.options, inputs, parentRoot: w.options.outputRoot,
    outputRoot: path.join(w.root, 'forged-native-child'), transport: child.transport }), /ACCEPTANCE_JUDGE_RECEIPT_BINDING/);
  assert.equal(child.count(), 0);
  assert.equal(readdirSync(w.options.usageRoot).some(name => name.startsWith('judgment-continuation-')), false);
});

test('continuation rejects reordered parent calls and invalid completion before claiming', async t => {
  const w = setup(t), malformed = fake((r, n) => { if (n === 2) r.output = { judgments: [] }; });
  const inputs = Array.from({ length: 13 }, (_, n) => ({ ...w.options.inputs[0]!, id: `order-${n}` }));
  await runCodexJudgments({ ...w.options, inputs, transport: malformed.transport });
  const file = path.join(w.options.outputRoot, 'calls.jsonl'), original = readFileSync(file, 'utf8');
  const child = fake(), options = { ...w.options, inputs, parentRoot: w.options.outputRoot, outputRoot: path.join(w.root, 'corrupt-child'), transport: child.transport };
  writeFileSync(file, original.trim().split('\n').reverse().join('\n') + '\n');
  await assert.rejects(resumeCodexJudgments(options), /ACCEPTANCE_JUDGE_CALL_COVERAGE/);
  const calls = original.trim().split('\n').map(line => JSON.parse(line));
  calls[0].result.cliVersion = 'invalid-cli-version';
  writeFileSync(file, calls.map(call => JSON.stringify(call)).join('\n') + '\n');
  await assert.rejects(resumeCodexJudgments(options), /ACCEPTANCE_JUDGE_COMPLETION_INVALID/);
  assert.equal(child.count(), 0);
  assert.equal(readdirSync(w.options.usageRoot).some(name => name.startsWith('judgment-continuation-')), false);
});
