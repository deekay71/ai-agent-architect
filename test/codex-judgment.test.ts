import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { digest } from '../src/contracts/canonical.js';
import { CODEX_CLI_VERSION, CODEX_LAUNCH_POLICY_DIGEST, renderCodexRequest, type CodexResult, type CodexTransport } from '../src/providers/codex.js';
import { runCodexJudgments } from '../src/evaluation/codex-judgment.js';
import { loadEvaluatorOracle, loadPublicDataset } from '../src/evaluation/dataset.js';
import { SubscriptionBudget } from '../src/evaluation/subscription-budget.js';
import type { JudgmentInput } from '../src/evaluation/semantic-judgment.js';

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
