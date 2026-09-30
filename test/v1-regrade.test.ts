import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { digest } from '../src/contracts/canonical.js';
import { CODEX_CLI_VERSION, CODEX_LAUNCH_POLICY_DIGEST, renderCodexRequest, type CodexResult, type CodexTransport } from '../src/providers/codex.js';
import { loadEvaluatorOracle, loadPublicDataset } from '../src/evaluation/dataset.js';
import { estimateV1Regrade, runV1Regrade } from '../src/evaluation/v1-regrade.js';
import type { JudgmentInput } from '../src/evaluation/semantic-judgment.js';

const data = loadPublicDataset('fixtures/semantic-benchmark');
const task = data.cases.find(item => item.id === 'sem-001')!;
const gold = loadEvaluatorOracle('fixtures/semantic-benchmark').find(item => item.caseId === task.id)!;
function fixture(t: test.TestContext) {
  const root = mkdtempSync(path.join(tmpdir(), 'v1-regrade-')); t.after(() => rmSync(root, { recursive: true, force: true }));
  const source = path.join(root, 'archived-inputs.json');
  const input: JudgmentInput = { id: 'archived-0', task, gold, readerModel: 'gpt-5.6-terra',
    documents: data.documents.filter(document => gold.requiredEvidenceIds.includes(document.id)),
    answer: { disposition: 'answer', answer: gold.acceptableAlternatives[0]!, evidenceIds: gold.requiredEvidenceIds,
      revisions: gold.expectedRevision, constraints: gold.expectedConstraints, confidence: 0.9 } };
  const inputs = Array.from({ length: 300 }, (_, index) => ({ ...input, id: `archived-${index}` }));
  writeFileSync(source, JSON.stringify(inputs)); mkdirSync(path.join(root, 'usage'));
  return { root, source, inputs, options: { repositoryRoot: root, sourceFile: source, outputRoot: path.join(root, 'new-regrade'), usageRoot: path.join(root, 'usage'),
    budgetApproval: { schemaVersion: 'v1-regrade-budget-approval/1' as const, approvalId: 'test-approved', explicitlyAuthorized: true as const,
      authorization: { authorizationId: `fresh-v1-regrade-${path.basename(root)}`, maxInvocations: 150, maxReportedTokens: 2_000_000, maxWallTimeMs: 60_000 },
      maxAggregateTokenEstimate: 20_000_000 },
    judge: { id: 'independent', model: 'gpt-6-sol', role: 'planner' as const, reasoningEffort: 'medium' as const }, timeoutMs: 10_000, maxRequestBytes: 1_000_000 } };
}
function fake(mode: 'complete' | 'partial' | 'invalid' | 'exhausted') {
  let calls = 0;
  const transport: CodexTransport = { id: 'codex-chatgpt-exec/1', assurance: 'mock', launchPolicyDigest: CODEX_LAUNCH_POLICY_DIGEST,
    configurationDigest: request => digest({ model: request.model, effort: request.reasoningEffort }),
    async respond(request) {
      calls++; const ids = (JSON.parse(request.input) as { items: { id: string }[] }).items.map(item => item.id);
      const included = mode === 'exhausted' && calls <= 3 ? [] : mode === 'partial' && calls === 1 ? ids.slice(0, 5) : ids;
      const judgments = Object.fromEntries(included.map(id => [id, { addressesQuestion: true, supportedByEvidence: true, respectsConstraintMeaning: true,
        abstentionAppropriate: false, rationale: 'Evidence supports the answer.', unsupportedClaims: [], violatedConstraintIds: [] }]));
      const output = mode === 'invalid' ? { judgments: { ...judgments, extra: judgments[ids[0]!] } } : { judgments };
      const result: CodexResult = { status: 'completed', output, requestedModel: request.model, requestDigest: digest(request), renderedRequestDigest: digest(renderCodexRequest(request)),
        launchPolicyDigest: CODEX_LAUNCH_POLICY_DIGEST, configurationDigest: transport.configurationDigest(request), usage: { inputTokens: 10, cachedInputTokens: 0, outputTokens: 1, totalTokens: 11, reasoningTokens: null },
        elapsedMs: 1, cliVersion: CODEX_CLI_VERSION, threadId: 'mock', issues: [], apiCostMicros: null, exactInputCount: null, modelIdentityAssurance: 'requested-only',
        maxOutputTokensEnforced: false, isolationAssurance: 'capability-flags-and-event-audit' };
      return result;
    } };
  return { transport, calls: () => calls };
}

test('regrades the immutable 300 archived inputs in initial batches of six and records advisory-only completion', async t => {
  const f = fixture(t), provider = fake('complete');
  const report = await runV1Regrade({ ...f.options, transport: provider.transport });
  assert.equal(report.assessed, 300); assert.equal(provider.calls(), 50); assert.equal(report.administrativeClosure.verifiedPassCapability, false);
  const request = JSON.parse(readFileSync(path.join(f.options.outputRoot, 'request-0-0.json'), 'utf8')) as { schema: { properties: { judgments: { required: string[] } } } };
  assert.equal(request.schema.properties.judgments.required.length, 6);
  assert.equal(JSON.parse(readFileSync(f.source, 'utf8')).length, 300);
});

test('only a well-formed partial subset is retried, and accepted IDs are pinned', async t => {
  const f = fixture(t), provider = fake('partial');
  const report = await runV1Regrade({ ...f.options, transport: provider.transport });
  assert.equal(provider.calls(), 51); assert.equal(report.assessed, 300);
  const calls = readFileSync(path.join(f.options.outputRoot, 'calls.jsonl'), 'utf8').trim().split('\n').map(line => JSON.parse(line) as { status: string; inputIds: string[] });
  assert.equal(calls[0]!.status, 'infrastructure-error-partial-output'); assert.deepEqual(calls[1]!.inputIds, ['archived-5']);
});

test('an unknown extra ID is invalid and is never salvaged or retried', async t => {
  const f = fixture(t), provider = fake('invalid');
  const report = await runV1Regrade({ ...f.options, transport: provider.transport });
  assert.equal(provider.calls(), 1); assert.equal(report.assessed, 0); assert.equal(report.stoppedReason, 'invalid-output');
});

test('prospective estimate includes two worst-case retries and output reserve without claiming exact counts', t => {
  const f = fixture(t), estimate = estimateV1Regrade(f.inputs, f.options.judge);
  assert.equal(estimate.initialCalls, 50); assert.equal(estimate.worstCaseCalls, 150); assert.equal(estimate.outputTokenReserveWorstCase, 435_000);
  assert.match(estimate.method, /not an exact provider token count/);
});

test('a threshold is required and a 300k aggregate ceiling cannot silently authorize this full regrade', async t => {
  const f = fixture(t), provider = fake('complete');
  await assert.rejects(runV1Regrade({ ...f.options, transport: provider.transport,
    budgetApproval: { ...f.options.budgetApproval, maxAggregateTokenEstimate: 300_000 } }), /V1_REGRADE_BUDGET_PREFLIGHT/);
  await assert.rejects(runV1Regrade({ ...f.options, transport: provider.transport, budgetApproval: {} as never }));
  assert.equal(provider.calls(), 0);
});


test('missing IDs receive at most two retries and remain explicitly unassessed afterward', async t => {
  const f = fixture(t), provider = fake('exhausted');
  const report = await runV1Regrade({ ...f.options, transport: provider.transport });
  assert.equal(provider.calls(), 52); assert.equal(report.assessed, 294); assert.equal(report.unassessed, 6);
  const calls = readFileSync(path.join(f.options.outputRoot, 'calls.jsonl'), 'utf8').trim().split('\n').map(line => JSON.parse(line));
  assert.deepEqual(calls.slice(0, 3).map(call => call.retryNumber), [0, 1, 2]);
  assert.ok(calls.slice(0, 3).every(call => call.status === 'infrastructure-error-partial-output'));
});
