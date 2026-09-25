import test from 'node:test';
import assert from 'node:assert/strict';
import { appendFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { digest } from '../src/contracts/canonical.js';
import { campaignPreflight, runSemanticCampaign } from '../src/evaluation/campaign.js';
import { importHumanCalibrationReview, loadEvaluatorOracle, loadPublicDataset, verifyDatasetSeal } from '../src/evaluation/dataset.js';
import type { ContextPacket } from '../src/context/engine.js';
import type { ModelProvider, ModelRequest, ModelResult } from '../src/providers/types.js';

function setup() {
  const root = mkdtempSync(path.join(tmpdir(), 'semantic-independent-review-'));
  const datasetRoot = path.join(root, 'dataset'), repositoryRoot = path.join(root, 'repository');
  cpSync(path.resolve('fixtures/semantic-benchmark'), datasetRoot, { recursive: true });
  mkdirSync(path.join(repositoryRoot, 'src'), { recursive: true });
  mkdirSync(path.join(repositoryRoot, 'fixtures'), { recursive: true });
  writeFileSync(path.join(repositoryRoot, 'fixtures', 'contracts.ts'), 'export const fixture = true;\n');
  writeFileSync(path.join(repositoryRoot, 'src', 'source.ts'), 'export const pinned = true;\n');
  for (const file of ['package.json', 'pnpm-lock.yaml', 'tsconfig.json']) writeFileSync(path.join(repositoryRoot, file), '{}\n');
  const config = {
    schemaVersion: 'semantic-campaign-config/1', campaignId: 'review-local-only', provider: 'openai', split: 'dev',
    purpose: 'dev-calibration', caseIds: loadPublicDataset(datasetRoot).cases.filter(c => c.split === 'dev').map(c => c.id),
    profiles: [{ id: 'reader', role: 'executor', model: 'review-test-model', inputTokenLimit: 100_000, modelContextLimit: 100_000, maxModelOutputTokens: 4000, reasoningEffort: 'low',
      pricing: { model: 'review-test-model', inputPerMillionUsd: 1, cachedInputPerMillionUsd: 1, outputPerMillionUsd: 1,
        source: 'https://developers.openai.com/api/docs/pricing', observedAt: '2026-09-25' } }],
    totalTokenBudgets: [100_000], distractorLimits: [0], compactionRounds: [1], repeats: 1, topK: 10,
    maxOutputTokens: 64, headroomTokens: 0,
    authorization: { authorizationId: 'review:test-only', maxCostMicros: 1_000_000 },
    thresholds: { maxFalseAcceptance: 0, maxConstraintLoss: 0, maxInvalidCitations: 0, minimumStrictPassRate: 1, calibrationStatus: 'provisional' },
  };
  return { root, datasetRoot, repositoryRoot, config, outputRoot: path.join(root, 'output'), spendRoot: path.join(root, 'spend') };
}

function answer(request: ModelRequest): ModelResult {
  return {
    status: 'completed', output: { disposition: 'abstain', answer: null, evidenceIds: [], revisions: [], constraints: [], confidence: 0 },
    model: request.model, responseId: 'adversarial-local-fixture', requestId: null,
    requestDigest: digest(request), latencyMs: 0,
    usage: { inputTokens: 100, outputTokens: 10, cachedInputTokens: 0, reasoningTokens: 0, totalTokens: 110 },
  };
}

test('independent review: provider identity/assurance drift cannot replace a priced reservation with a free mock call', async () => {
  const context = setup(); let responses = 0, counts = 0;
  // Deliberately lying test double. No production API, credentials or network calls.
  const provider: ModelProvider = {
    id: 'review-provider', assurance: 'provider',
    async countInput(request) {
      counts++;
      provider.assurance = 'mock';
      return { inputTokens: 100, requestDigest: digest(request), counterId: 'adversarial-local-count' };
    },
    async respond(request) { responses++; return answer(request); },
  };
  context.config.authorization.maxCostMicros = 1; // Honest reservation would require 164 micros.
  try {
    try { await runSemanticCampaign({ ...context, provider, onProgress: () => { throw new Error('LOCAL_REVIEW_STOP'); } }); }
    catch { /* Either explicit admission failure or audit-only callback stop is acceptable here. */ }
    assert.equal(counts, 1, 'the reproduction must reach the count boundary');
    assert.equal(responses, 0, 'no generation may dispatch after provider metadata changes during count');
  } finally { rmSync(context.root, { recursive: true, force: true }); }
});

test('independent review: source pin drift during counting blocks generation before side effects', async () => {
  const context = setup(); let responses = 0, counts = 0;
  const provider: ModelProvider = {
    id: 'review-provider', assurance: 'provider',
    async countInput(request) {
      counts++;
      writeFileSync(path.join(context.repositoryRoot, 'src', 'source.ts'), 'export const pinned = false;\n');
      return { inputTokens: 100, requestDigest: digest(request), counterId: 'adversarial-local-count' };
    },
    async respond(request) { responses++; return answer(request); },
  };
  try {
    try { await runSemanticCampaign({ ...context, provider, onProgress: () => { throw new Error('LOCAL_REVIEW_STOP'); } }); }
    catch { /* The campaign may fail with a pinned-source error. */ }
    assert.equal(counts, 1, 'the reproduction must reach the count boundary');
    assert.equal(responses, 0, 'changed implementation must not consume a previously admitted request');
  } finally { rmSync(context.root, { recursive: true, force: true }); }
});

test('independent review: review of one development case cannot open the entire holdout', async () => {
  const context = setup(); let calls = 0;
  try {
    const evidence = path.join(context.root, 'manual-review-fixture.txt');
    writeFileSync(evidence, 'LOCAL TEST FIXTURE ONLY: reviewed one development answer.\n');
    const dev = loadPublicDataset(context.datasetRoot).cases.find(c => c.split === 'dev')!;
    importHumanCalibrationReview(context.datasetRoot, {
      schemaVersion: 'semantic-human-review-v1', datasetSealDigest: verifyDatasetSeal(context.datasetRoot),
      reviewerId: 'test-external-human', reviewerKind: 'human', method: 'external-manual-review', reviewedAt: '2026-09-25T00:00:00.000Z',
      caseIds: [dev.id], evidenceRefs: [{ path: evidence, digest: `sha256:${createHash('sha256').update(readFileSync(evidence)).digest('hex')}` }],
      judgments: [{ caseId: dev.id, answerDigest: digest('test-only-manual-answer'), judgment: 'accept', rationale: 'Local test attestation, not a real calibration.' }],
    });
    const config = { ...context.config, split: 'holdout', purpose: 'acceptance', caseIds: loadPublicDataset(context.datasetRoot).cases.filter(c => c.split === 'holdout').map(c => c.id), thresholds: { ...context.config.thresholds, calibrationStatus: 'human-calibrated' } };
    assert.equal(campaignPreflight(context.datasetRoot, config).liveReady, false, 'review must cover the selected holdout cases');
    const provider: ModelProvider = { id: 'review', assurance: 'provider',
      async countInput(request) { calls++; return { inputTokens: 100, requestDigest: digest(request), counterId: 'mock' }; },
      async respond(request) { calls++; return answer(request); } };
    await assert.rejects(runSemanticCampaign({ ...context, config, provider }), /HOLDOUT|REVIEW|COVERAGE/);
    assert.equal(calls, 0);
  } finally { rmSync(context.root, { recursive: true, force: true }); }
});

test('independent review: rejected response binding retains unknown trial totals instead of reporting zero billed usage', async () => {
  const context = setup();
  const provider: ModelProvider = {
    id: 'review-provider', assurance: 'provider',
    async countInput(request) { return { inputTokens: 100, requestDigest: digest(request), counterId: 'adversarial-local-count' }; },
    async respond(request) { return { ...answer(request), requestDigest: digest('different request') }; },
  };
  try {
    const report = await runSemanticCampaign({ ...context, provider });
    assert.equal(report.budget.frozen, true);
    assert.equal(report.budget.uncertainAttempts, 1);
    assert.equal(report.completedTrials, 1);
    assert.equal(report.trials[0]!.providerTokens, null, 'unbound provider tokens are unknown');
    assert.equal(report.trials[0]!.costMicros, null, 'unbound usage cannot become a measured zero-cost trial');
  } finally { rmSync(context.root, { recursive: true, force: true }); }
});

test('independent review: a broken provider token ceiling stops later calls even when cache discounts avoid cost overrun', async () => {
  const context = setup(); let responses = 0;
  context.config.profiles[0]!.pricing.cachedInputPerMillionUsd = 0;
  const provider: ModelProvider = {
    id: 'review-provider', assurance: 'provider',
    async countInput(request) { return { inputTokens: 100, requestDigest: digest(request), counterId: 'adversarial-local-count' }; },
    async respond(request) {
      responses++;
      if (responses > 1) throw new Error('LOCAL_REVIEW_STOP_AFTER_UNEXPECTED_REDISPATCH');
      return { ...answer(request), usage: { inputTokens: 100, outputTokens: 65, cachedInputTokens: 100, reasoningTokens: 0, totalTokens: 165 } };
    },
  };
  try {
    const report = await runSemanticCampaign({ ...context, provider });
    assert.equal(responses, 1, 'the provider exceeded the output ceiling and must not be called again');
    assert.ok(report.stoppedReason);
    assert.equal(report.trials[0]!.status, 'provider-budget-mismatch');
  } finally { rmSync(context.root, { recursive: true, force: true }); }
});

test('independent review: mock usage must obey the same arithmetic invariant as provider usage', async () => {
  const context = setup(); let responses = 0;
  context.config.provider = 'mock'; context.config.authorization.maxCostMicros = 0;
  const provider: ModelProvider = {
    id: 'review-mock', assurance: 'mock',
    async countInput(request) { return { inputTokens: 100, requestDigest: digest(request), counterId: 'mock' }; },
    async respond(request) {
      responses++;
      if (responses > 1) throw new Error('LOCAL_REVIEW_STOP_AFTER_UNEXPECTED_REDISPATCH');
      return { ...answer(request), usage: { inputTokens: 100, outputTokens: 10, cachedInputTokens: 0, reasoningTokens: 0, totalTokens: 0 } };
    },
  };
  try {
    const report = await runSemanticCampaign({ ...context, provider });
    assert.equal(responses, 1, 'mock totals cannot bypass whole-trial token accounting');
    assert.equal(report.budget.frozen, true);
    assert.equal(report.trials[0]!.status, 'usage-unknown');
  } finally { rmSync(context.root, { recursive: true, force: true }); }
});

test('independent review: dataset drift after a response preserves partial journals and a nonpassing report', async () => {
  const context = setup(); let responses = 0;
  const provider: ModelProvider = {
    id: 'review-provider', assurance: 'provider',
    async countInput(request) { return { inputTokens: 100, requestDigest: digest(request), counterId: 'adversarial-local-count' }; },
    async respond(request) {
      responses++;
      appendFileSync(path.join(context.datasetRoot, 'public', 'documents.json'), '\n');
      return answer(request);
    },
  };
  try {
    const report = await runSemanticCampaign({ ...context, provider });
    assert.equal(responses, 1);
    assert.equal(report.configAndSourceStable, false);
    assert.equal(report.stoppedReason, 'source-or-dataset-drift');
    assert.equal(report.trials[0]!.answer, null);
    assert.notEqual(report.phaseGate, 'Pass');
    assert.ok(existsSync(path.join(context.outputRoot, 'report.json')));
    assert.equal(readFileSync(path.join(context.outputRoot, 'trials.jsonl'), 'utf8').trim().split('\n').length, 1);
    const events = readFileSync(path.join(context.outputRoot, 'calls.jsonl'), 'utf8').trim().split('\n').map(line => JSON.parse(line) as { event: string });
    assert.deepEqual(events.map(e => e.event), ['reserved-before-request', 'request-outcome']);
  } finally { rmSync(context.root, { recursive: true, force: true }); }
});

test('independent review: oracle-evidence control runs after comparison arms, stays separate, and shares counted spend', async () => {
  const context = setup();
  const requests = new Map<string, ModelRequest>();
  const publicDocuments = new Map(loadPublicDataset(context.datasetRoot).documents.map(d => [d.id, d]));
  const forbidden = new Set(['acceptableAlternatives', 'requiredEvidenceIds', 'answerability', 'expectedRevision', 'expectedConstraints']);
  const checkNoLabels = (value: unknown): void => {
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) { assert.equal(forbidden.has(key), false, `evaluator field leaked: ${key}`); checkNoLabels(child); }
  };
  let counts = 0, responses = 0;
  const provider: ModelProvider = {
    id: 'review-provider', assurance: 'provider',
    async countInput(request) { counts++; return { inputTokens: 100, requestDigest: digest(request), counterId: 'adversarial-local-count' }; },
    async respond(request) {
      responses++; requests.set(digest(request), structuredClone(request));
      const packet = JSON.parse(request.input) as ContextPacket;
      checkNoLabels(packet);
      for (const resource of packet.resources) assert.equal(resource.content, publicDocuments.get(resource.pin.ref)?.text, 'only unchanged public evidence may enter a reader');
      return { ...answer(request), output: request.schemaName === 'context_summary'
        ? { summary: 'Untrusted local test summary. Unknowns stay in the canonical packet.' }
        : { disposition: 'abstain', answer: null, evidenceIds: [], revisions: [], constraints: packet.task.constraints.map(c => c.id), confidence: 0 } };
    },
  };
  try {
    const report = await runSemanticCampaign({ ...context, provider });
    assert.equal(report.stoppedReason, null);
    assert.equal(report.completedTrials, 60);
    assert.equal(report.completedControlTrials, 20);
    assert.equal(report.plannedControlTrials, 20);
    assert.ok(report.trials.slice(0, 60).every(t => t.arm !== 'oracle-evidence'));
    assert.ok(report.trials.slice(60).every(t => t.arm === 'oracle-evidence'));
    // Canonical critical unknowns legitimately block some cases before any model call.
    const recordedCalls = report.trials.reduce((total, t) => total + t.calls.length, 0);
    assert.equal(counts, recordedCalls); assert.equal(responses, recordedCalls);
    assert.ok(report.trials.some(t => t.arm === 'compaction' && t.calls.length === 2));
    assert.ok(report.trials.some(t => t.arm === 'oracle-evidence' && t.calls.length === 1));
    assert.equal(report.budget.chargedMicros, responses * 110); // All comparison AND G calls settle known usage.
    assert.equal(report.budget.reservedAttempts, 0);
    assert.ok(report.summaries.every(s => (s.dimensions as unknown[])[1] !== 'oracle-evidence'));
    assert.ok(report.controlSummaries.every(s => (s.dimensions as unknown[])[1] === 'oracle-evidence'));
    const gold = new Map(loadEvaluatorOracle(context.datasetRoot).map(g => [g.caseId, g]));
    for (const trial of report.trials.filter(t => t.arm === 'oracle-evidence')) {
      assert.deepEqual([...trial.selectedIds].sort(), [...gold.get(trial.caseId)!.requiredEvidenceIds].sort());
      if (trial.calls.length === 0) { assert.equal(trial.status, 'context-blocked'); continue; }
      assert.equal(trial.calls.length, 1);
      assert.equal(trial.calls[0]!.countedInputTokens, 100);
      assert.equal(trial.calls[0]!.reservedMicros, 164);
      assert.equal(trial.calls[0]!.measuredMicros, 110);
      const payload = JSON.parse(requests.get(trial.calls[0]!.requestDigest)!.input) as ContextPacket;
      assert.deepEqual(payload.resources.map(r => r.pin.ref).sort(), [...trial.selectedIds].sort());
    }
  } finally { rmSync(context.root, { recursive: true, force: true }); }
});
