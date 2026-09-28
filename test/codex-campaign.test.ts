import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { digest } from '../src/contracts/canonical.js';
import { runCodexCampaign } from '../src/evaluation/codex-campaign.js';
import { CodexCampaignConfigSchema, codexCampaignPreflight } from '../src/evaluation/codex-config.js';
import { loadPublicDataset, verifyDatasetSeal } from '../src/evaluation/dataset.js';
import { CODEX_CLI_VERSION, CODEX_LAUNCH_POLICY_DIGEST, renderCodexRequest, type CodexResult, type CodexTransport } from '../src/providers/codex.js';
import type { ModelRequest } from '../src/providers/types.js';

const datasetRoot = path.resolve('fixtures/semantic-benchmark');
const dataset = loadPublicDataset(datasetRoot);
const selected = dataset.cases.find(c => c.split === 'dev' && !c.unknowns.some(u => u.critical))!.id;
const initialSeal = verifyDatasetSeal(datasetRoot);

function config() {
  return CodexCampaignConfigSchema.parse({ schemaVersion: 'codex-semantic-config/1', campaignId: 'codex-mock-test',
    provider: 'codex-chatgpt', purpose: 'dev-smoke', split: 'dev', caseIds: [selected],
    profiles: [{ id: 'planner', role: 'planner', model: 'gpt-6-astra', reasoningEffort: 'high' },
      { id: 'executor', role: 'executor', model: 'gpt-6-luna', reasoningEffort: 'medium' }],
    distractorLimits: [0], compactionRounds: [1], repeats: 1, topK: 8, outputTokenHint: 4000,
    maxVisibleRequestBytes: 100_000, perTrialReportedTokenStop: 100_000, perCallTimeoutMs: 30_000,
    authorization: { authorizationId: 'INJECTED-LOCAL-NO-AUTH-NO-NETWORK', maxInvocations: 10,
      maxReportedTokens: 400_000, maxWallTimeMs: 600_000 } });
}

function workspace() {
  const root = mkdtempSync(path.join(tmpdir(), 'codex-campaign-test-')), repositoryRoot = path.join(root, 'repo');
  mkdirSync(path.join(repositoryRoot, 'src'), { recursive: true }); mkdirSync(path.join(repositoryRoot, 'fixtures'));
  for (const filename of ['src/pin.ts', 'fixtures/contracts.ts', 'package.json', 'pnpm-lock.yaml', 'tsconfig.json']) {
    writeFileSync(path.join(repositoryRoot, filename), '{}\n');
  }
  return { root, repositoryRoot, outputRoot: path.join(root, 'campaign'), usageRoot: path.join(root, 'shared-authorization-ledgers') };
}

/** The answer fixture reads public packet constraints only; it does not read evaluator labels. */
const configurationDigest = (request: ModelRequest): string => digest({ fixture: 'mock-receipt', model: request.model, effort: request.reasoningEffort });
function receipt(request: ModelRequest, tokens = 100): CodexResult {
  const packet = JSON.parse(request.input) as { task: { constraints: { id: string }[] } };
  return { status: 'completed', requestedModel: request.model, requestDigest: digest(request),
    renderedRequestDigest: digest(renderCodexRequest(request)), launchPolicyDigest: CODEX_LAUNCH_POLICY_DIGEST,
    configurationDigest: configurationDigest(request),
    output: request.schemaName === 'context_summary' ? { summary: 'Untrusted synthetic history summary.' }
      : { disposition: 'abstain', answer: null, evidenceIds: [], revisions: [], confidence: 0.5,
        constraints: packet.task.constraints.map(c => c.id) },
    usage: { inputTokens: tokens - 1, cachedInputTokens: 0, outputTokens: 1, totalTokens: tokens, reasoningTokens: null },
    elapsedMs: 1, cliVersion: CODEX_CLI_VERSION, threadId: 'mock-thread', issues: [], apiCostMicros: null,
    exactInputCount: null, modelIdentityAssurance: 'requested-only', maxOutputTokensEnforced: false,
    isolationAssurance: 'capability-flags-and-event-audit' };
}

function fakeTransport(change?: (request: ModelRequest, result: CodexResult, index: number) => void) {
  const requests: ModelRequest[] = [];
  const transport: CodexTransport = { id: 'codex-chatgpt-exec/1', assurance: 'mock', launchPolicyDigest: CODEX_LAUNCH_POLICY_DIGEST, configurationDigest,
    async respond(request) {
      requests.push(structuredClone(request)); const result = receipt(request);
      change?.(request, result, requests.length - 1); return result;
    } };
  return { transport, requests };
}

function assertNoEvaluatorFields(value: unknown): void {
  if (typeof value === 'string') {
    for (const key of ['acceptableAlternatives', 'requiredEvidenceIds', 'expectedRevision', 'expectedConstraints', 'answerability']) {
      assert.ok(!value.includes(`"${key}"`), `Evaluator field ${key} leaked into provider payload`);
    }
    return;
  }
  if (Array.isArray(value)) for (const item of value) assertNoEvaluatorFields(item);
  else if (value !== null && typeof value === 'object') for (const item of Object.values(value)) assertNoEvaluatorFields(item);
}

test('DEV preserves every distractor density while running G only once per profile', async () => {
  const w = workspace(), fake = fakeTransport(), c = config();
  c.distractorLimits = [0, 8]; c.authorization.maxInvocations = 30;
  try {
    const report = await runCodexCampaign({ ...w, datasetRoot, config: c, transport: fake.transport });
    assert.equal(report.stoppedReason, null);
    assert.equal(report.comparisonCoverage.observed, report.plannedTrials);
    assert.equal(report.controlCoverage.observed, report.plannedControls);
    const main = report.trials.filter(t => t.arm !== 'oracle-evidence');
    assert.deepEqual([...new Set(main.map(t => t.distractors))].sort(), [0, 8]);
    assert.equal(report.controlCoverage.observed, c.profiles.length * c.repeats);
    assert.equal(fake.requests.length, 18);
  } finally { rmSync(w.root, { recursive: true, force: true }); }
});

test('one selected dev case and two profiles produce six comparisons then two G controls with ten bound calls', async () => {
  const w = workspace(), c = config(), fake = fakeTransport();
  try {
    const preflight = codexCampaignPreflight(datasetRoot, c);
    assert.deepEqual(preflight.selectedCaseIds, [selected]);
    assert.equal(preflight.plannedTrials, 6); assert.equal(preflight.plannedControls, 2); assert.equal(preflight.maxInvocations, 10);
    assert.equal(preflight.dispatchAuthorized, false); assert.equal(preflight.acceptanceReady, false);
    const report = await runCodexCampaign({ ...w, datasetRoot, config: c, transport: fake.transport });
    assert.equal(fake.requests.length, 10); assert.equal(report.trials.length, 8);
    assert.equal(report.comparisonCoverage.observed, 6); assert.equal(report.comparisonCoverage.scored, 6);
    assert.equal(report.controlCoverage.observed, 2); assert.equal(report.controlCoverage.scored, 2);
    assert.deepEqual(report.trials.map(t => t.arm), ['full', 'retrieval', 'compaction', 'full', 'retrieval', 'compaction', 'oracle-evidence', 'oracle-evidence']);
    assert.ok(report.trials.every(t => t.caseId === selected && t.status === 'completed' && t.canonicalPreserved));
    assert.deepEqual(fake.requests.map(r => r.schemaName), ['evidence_answer', 'evidence_answer', 'context_summary', 'evidence_answer',
      'evidence_answer', 'evidence_answer', 'context_summary', 'evidence_answer', 'evidence_answer', 'evidence_answer']);
    for (const request of fake.requests) {
      assert.equal((JSON.parse(request.input) as { task: { taskId: string } }).task.taskId, selected);
      assertNoEvaluatorFields(request);
    }
    const exposures = readFileSync(path.join(w.outputRoot, 'exposure.jsonl'), 'utf8').trim().split('\n').map(line => JSON.parse(line));
    assert.equal(exposures.length, 10);
    assert.ok(exposures.every(e => e.caseId === selected && e.split === 'dev' && e.assurance === 'mock' && e.status === 'possibly-exposed'));
    assert.deepEqual(exposures.map(e => e.requestDigest), fake.requests.map(r => digest(r)));
    assert.equal(report.budget.usedInvocations, 10); assert.equal(report.budget.reportedTokens, 1000);
    assert.equal(report.budget.unknownAttempts, 0); assert.equal(report.budget.frozen, false);
    assert.equal(report.integrityStable, true); assert.equal(report.stoppedReason, null);
    assert.equal(report.assurance, 'mock'); assert.equal(report.modelOutputsObserved, false);
    assert.equal(report.phaseGate, 'Not evaluated'); assert.equal(report.releaseEligible, false);
    assert.equal(report.apiCostMicros, null); assert.equal(report.exactInputCount, null);
    assert.equal(report.maxOutputTokensEnforced, false); assert.equal(report.modelIdentityAssurance, 'requested-only');
    assert.equal(report.pairedDiagnostics.acceptanceDecision, null);
    assert.equal(report.pairedDiagnostics.excludedControlTrials, 2);
    assert.equal(report.pairedDiagnostics.accountingBasis, 'same-post-call-stop-rule-not-equal-hard-provider-token-budget');
    assert.ok(report.pairedDiagnostics.groups.every(g => !Object.hasOwn(g.dimensions, 'totalTokenBudget')));
    assert.equal(verifyDatasetSeal(datasetRoot), initialSeal);
  } finally { rmSync(w.root, { recursive: true, force: true }); }
});

test('holdout, missing case, and duplicate matrix selectors never reach a transport', async () => {
  const holdout = dataset.cases.find(c => c.split === 'holdout')!.id;
  for (const caseIds of [[holdout], ['missing-case'], [selected, selected]]) {
    const w = workspace(), fake = fakeTransport();
    try {
      await assert.rejects(runCodexCampaign({ ...w, datasetRoot, config: { ...config(), caseIds }, transport: fake.transport }));
      assert.equal(fake.requests.length, 0); assert.equal(existsSync(w.outputRoot), false); assert.equal(existsSync(w.usageRoot), false);
    } finally { rmSync(w.root, { recursive: true, force: true }); }
  }
});

test('unknown usage stops and freezes the shared authorization so a renamed campaign gets no free retry', async () => {
  const w = workspace(), c = config(), fake = fakeTransport((_request, result) => { result.usage = null; result.status = 'incomplete'; });
  try {
    const first = await runCodexCampaign({ ...w, datasetRoot, config: c, transport: fake.transport });
    assert.equal(fake.requests.length, 1); assert.equal(first.trials.length, 1);
    assert.equal(first.budget.usedInvocations, 1); assert.equal(first.budget.unknownAttempts, 1); assert.equal(first.budget.frozen, true);
    assert.equal(first.trials[0]!.score, null); assert.equal(first.trials[0]!.answer, null);
    assert.equal(first.stoppedReason, 'unknown-usage');
    const second = await runCodexCampaign({ ...w, outputRoot: path.join(w.root, 'renamed-campaign'), datasetRoot,
      config: { ...c, campaignId: 'renamed-campaign' }, transport: fake.transport });
    assert.equal(fake.requests.length, 1); assert.equal(second.budget.usedInvocations, 1);
    assert.equal(second.budget.unknownAttempts, 1); assert.equal(second.stoppedReason, 'unknown-usage');
    assert.ok(second.trials.every(t => t.answer === null && t.score === null));
  } finally { rmSync(w.root, { recursive: true, force: true }); }
});

test('known incomplete usage remains charged without being reclassified as unknown or as an answer', async () => {
  const w = workspace(), fake = fakeTransport((_request, result) => { result.status = 'incomplete'; result.output = null; });
  try {
    const report = await runCodexCampaign({ ...w, datasetRoot, config: config(), transport: fake.transport });
    assert.equal(fake.requests.length, 1); assert.equal(report.budget.reportedTokens, 100);
    assert.equal(report.budget.unknownAttempts, 0); assert.equal(report.budget.frozen, false);
    assert.equal(report.stoppedReason, 'codex-invocation-not-completed');
    assert.equal(report.trials[0]!.status, 'incomplete'); assert.equal(report.trials[0]!.score, null);
  } finally { rmSync(w.root, { recursive: true, force: true }); }
});

test('source, config and every transport binding mutation stop the campaign', async () => {
  for (const mutation of ['source', 'config', 'policy', 'method', 'configuration-method', 'id', 'assurance'] as const) {
    const w = workspace(), c = config();
    const fake = fakeTransport((_request, _result, index) => {
      if (index !== 0) return;
      if (mutation === 'source') writeFileSync(path.join(w.repositoryRoot, 'src/pin.ts'), '// changed implementation\n');
      if (mutation === 'config') c.campaignId = 'changed-config';
      if (mutation === 'policy') fake.transport.launchPolicyDigest = digest('changed-policy');
      if (mutation === 'method') fake.transport.respond = async request => receipt(request);
      if (mutation === 'configuration-method') fake.transport.configurationDigest = () => digest('changed-options');
      if (mutation === 'id') Reflect.set(fake.transport, 'id', 'changed-transport');
      if (mutation === 'assurance') fake.transport.assurance = 'codex-chatgpt';
    });
    try {
      const report = await runCodexCampaign({ ...w, datasetRoot, config: c, transport: fake.transport });
      assert.equal(fake.requests.length, 1, mutation); assert.equal(report.budget.usedInvocations, 1, mutation);
      assert.equal(report.integrityStable, false, mutation); assert.equal(report.stoppedReason, 'binding-drift', mutation);
      assert.equal(report.trials[0]!.answer, null, mutation); assert.equal(report.trials[0]!.score, null, mutation);
      assert.equal(report.phaseGate, 'Not evaluated'); assert.equal(report.releaseEligible, false);
    } finally { rmSync(w.root, { recursive: true, force: true }); }
  }
});

test('an observed binding drift stays invalid even if a later callback restores the original source bytes', async () => {
  const w = workspace(), pin = path.join(w.repositoryRoot, 'src/pin.ts'), original = readFileSync(pin, 'utf8');
  const fake = fakeTransport(() => { writeFileSync(pin, '// temporary but observed source drift\n'); });
  try {
    const report = await runCodexCampaign({ ...w, datasetRoot, config: config(), transport: fake.transport,
      onProgress() { writeFileSync(pin, original); } });
    assert.equal(readFileSync(pin, 'utf8'), original);
    assert.equal(fake.requests.length, 1); assert.equal(report.stoppedReason, 'binding-drift');
    assert.equal(report.integrityStable, false); assert.equal(report.trials[0]!.answer, null);
    assert.equal(report.phaseGate, 'Not evaluated'); assert.equal(report.releaseEligible, false);
  } finally { rmSync(w.root, { recursive: true, force: true }); }
});

test('a transport exception leaves an unknown attempted invocation and cannot become a zero-usage retry', async () => {
  const w = workspace(), fake = fakeTransport(() => { throw Error('synthetic interrupted process'); });
  try {
    const report = await runCodexCampaign({ ...w, datasetRoot, config: config(), transport: fake.transport });
    assert.equal(fake.requests.length, 1); assert.equal(report.budget.usedInvocations, 1);
    assert.equal(report.budget.unknownAttempts, 1); assert.equal(report.budget.frozen, true);
    assert.equal(report.stoppedReason, 'transport-error'); assert.equal(report.trials[0]!.score, null);
    const log = readFileSync(path.join(w.outputRoot, 'calls.jsonl'), 'utf8').trim().split('\n').map(line => JSON.parse(line));
    assert.equal(log.length, 1); assert.equal(log[0].status, 'transport-error');
  } finally { rmSync(w.root, { recursive: true, force: true }); }
});

test('a smaller authorized invocation cap stops the matrix before another call or any G control', async () => {
  const w = workspace(), c = config(), fake = fakeTransport(); c.authorization.maxInvocations = 1;
  try {
    assert.equal(codexCampaignPreflight(datasetRoot, c).invocationCapFitsMatrix, false);
    const report = await runCodexCampaign({ ...w, datasetRoot, config: c, transport: fake.transport });
    assert.equal(fake.requests.length, 1); assert.equal(report.budget.usedInvocations, 1);
    assert.equal(report.budget.reportedTokens, 100); assert.equal(report.budget.unknownAttempts, 0);
    assert.equal(report.stoppedReason, 'invocation-limit'); assert.equal(report.comparisonCoverage.scored, 1);
    assert.equal(report.controlCoverage.observed, 0); assert.equal(report.phaseGate, 'Not evaluated');
  } finally { rmSync(w.root, { recursive: true, force: true }); }
});

test('summary usage participates in the post-call trial stop and overshoot is recorded without a fictional hard token cap', async () => {
  const w = workspace(), c = config(); c.perTrialReportedTokenStop = 1024;
  const fake = fakeTransport((request, result) => { result.usage = receipt(request, request.schemaName === 'context_summary' ? 2000 : 700).usage; });
  try {
    const report = await runCodexCampaign({ ...w, datasetRoot, config: c, transport: fake.transport });
    assert.equal(fake.requests.length, 8); assert.equal(report.budget.usedInvocations, 8); assert.equal(report.budget.reportedTokens, 8200);
    const compacted = report.trials.filter(t => t.arm === 'compaction');
    assert.equal(compacted.length, 2);
    for (const trial of compacted) {
      assert.equal(trial.status, 'reported-token-stop'); assert.equal(trial.reportedTokens, 2000);
      assert.equal(trial.reportedTokenStopExceeded, true); assert.equal(trial.answer, null);
      assert.equal(trial.calls[0]!.status, 'completed'); assert.equal(trial.calls[1]!.stage, 'reader');
      assert.equal(trial.calls[1]!.attemptId, null); assert.equal(trial.calls[1]!.result, null);
    }
    assert.equal(report.comparisonCoverage.scored, 4); assert.equal(report.controlCoverage.scored, 2);
    assert.equal(report.stoppedReason, null); assert.equal(report.maxOutputTokensEnforced, false);
    assert.equal(report.pairedDiagnostics.accountingBasis, 'same-post-call-stop-rule-not-equal-hard-provider-token-budget');
    assert.equal(report.pairedDiagnostics.groups.filter(g => g.dimensions.comparator.arm === 'compaction').reduce((n, g) => n + g.systemBlockedPairs, 0), 2);
  } finally { rmSync(w.root, { recursive: true, force: true }); }
});

test('visible request guard prevents exposure and quota reservation without pretending to count provider tokens', async () => {
  const w = workspace(), c = config(), fake = fakeTransport(); c.maxVisibleRequestBytes = 1024;
  try {
    const report = await runCodexCampaign({ ...w, datasetRoot, config: c, transport: fake.transport });
    assert.equal(fake.requests.length, 0); assert.equal(report.trials.length, 8);
    assert.equal(report.budget.usedInvocations, 0); assert.equal(report.budget.reportedTokens, 0);
    assert.equal(existsSync(path.join(w.outputRoot, 'exposure.jsonl')), false);
    assert.ok(report.trials.every(t => t.status === 'visible-request-blocked' && t.answer === null && t.calls.every(c => c.attemptId === null)));
    assert.equal(report.exactInputCount, null); assert.equal(report.comparisonCoverage.scored, 0);
    assert.equal(report.controlCoverage.scored, 0); assert.equal(report.phaseGate, 'Not evaluated');
  } finally { rmSync(w.root, { recursive: true, force: true }); }
});

test('receipt identity and policy mismatches cannot settle usage or produce scored answers', async () => {
  for (const field of ['requestDigest', 'renderedRequestDigest', 'launchPolicyDigest', 'configurationDigest', 'requestedModel'] as const) {
    const w = workspace(), fake = fakeTransport((_request, result) => { result[field] = digest('another-request-or-policy'); });
    try {
      const report = await runCodexCampaign({ ...w, datasetRoot, config: config(), transport: fake.transport });
      assert.equal(fake.requests.length, 1, field); assert.equal(report.stoppedReason, 'receipt-binding-error', field);
      assert.equal(report.budget.unknownAttempts, 1, field); assert.equal(report.budget.frozen, true, field);
      assert.equal(report.trials[0]!.calls[0]!.result, null, field); assert.equal(report.trials[0]!.answer, null, field);
    } finally { rmSync(w.root, { recursive: true, force: true }); }
  }
});

test('invalid or inconsistent usage counters cannot be silently charged as known usage', async () => {
  for (const field of ['inputTokens', 'cachedInputTokens', 'totalTokens', 'reasoningTokens'] as const) {
    const w = workspace(), fake = fakeTransport((_request, result) => {
      if (field === 'inputTokens') result.usage![field] = NaN;
      if (field === 'cachedInputTokens') result.usage![field] = result.usage!.inputTokens + 1;
      if (field === 'totalTokens') result.usage![field] += 1;
      if (field === 'reasoningTokens') result.usage![field] = result.usage!.outputTokens + 1;
    });
    try {
      const report = await runCodexCampaign({ ...w, datasetRoot, config: config(), transport: fake.transport });
      assert.equal(fake.requests.length, 1, field);
      assert.equal(report.stoppedReason, field === 'inputTokens' ? 'receipt-binding-error' : 'unknown-usage', field);
      assert.equal(report.budget.unknownAttempts, 1, field); assert.equal(report.budget.frozen, true, field);
      assert.equal(report.trials[0]!.score, null, field); assert.equal(report.trials[0]!.answer, null, field);
    } finally { rmSync(w.root, { recursive: true, force: true }); }
  }
});
