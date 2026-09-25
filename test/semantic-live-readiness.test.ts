import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { digest } from '../src/contracts/canonical.js';
import { CampaignConfigSchema } from '../src/evaluation/config.js';
import { campaignPreflight, runSemanticCampaign } from '../src/evaluation/campaign.js';
import { loadPublicDataset } from '../src/evaluation/dataset.js';
import type { ModelProvider } from '../src/providers/types.js';

const datasetRoot = path.resolve('fixtures/semantic-benchmark');
const cases = loadPublicDataset(datasetRoot).cases;
const selected = cases.find(c => c.split === 'dev' && !c.unknowns.some(u => u.critical))!.id;
function config() {
  const base = JSON.parse(readFileSync('fixtures/semantic-config/local.json', 'utf8'));
  return CampaignConfigSchema.parse({ ...base, campaignId: 'dev-readiness-test', provider: 'openai',
    purpose: 'dev-smoke', caseIds: [selected], profiles: [{ ...base.profiles[0], inputTokenLimit: 1024,
      modelContextLimit: 1024, maxModelOutputTokens: 4000 }], totalTokenBudgets: [100_000], distractorLimits: [0],
    compactionRounds: [1], maxOutputTokens: 64, headroomTokens: 0,
    authorization: { authorizationId: 'FAKE-TRANSPORT-LOCAL-TEST', maxCostMicros: 1_000_000 } });
}
function workspace() {
  const root = mkdtempSync(path.join(tmpdir(), 'semantic-dev-readiness-')), repositoryRoot = path.join(root, 'repo');
  mkdirSync(path.join(repositoryRoot, 'src'), { recursive: true }); mkdirSync(path.join(repositoryRoot, 'fixtures'));
  for (const name of ['src/pin.ts', 'fixtures/contracts.ts', 'package.json', 'pnpm-lock.yaml', 'tsconfig.json']) writeFileSync(path.join(repositoryRoot, name), '{}\n');
  return { root, repositoryRoot, outputRoot: path.join(root, 'campaign'), spendRoot: path.join(root, 'spend') };
}
function provider(tokens: number, onResponse: () => void): ModelProvider {
  return { id: 'INJECTED-LOCAL-TEST-NO-NETWORK', assurance: 'provider',
    async countInput(request) { return { inputTokens: tokens, requestDigest: digest(request), counterId: 'synthetic' }; },
    async respond(request) {
      onResponse(); const packet = JSON.parse(request.input);
      return { status: 'completed', model: request.model, requestDigest: digest(request), responseId: 'test', requestId: null, latencyMs: 0,
        usage: { inputTokens: tokens, outputTokens: 1, cachedInputTokens: 0, reasoningTokens: 0, totalTokens: tokens + 1 },
        output: request.schemaName === 'context_summary' ? { summary: 'Untrusted synthetic summary' }
          : { disposition: 'abstain', answer: null, evidenceIds: [], revisions: [], constraints: packet.task.constraints.map((c: { id: string }) => c.id), confidence: .5 } };
    } };
}

test('explicit dev smoke does not require pretending that human calibration has finished', () => {
  const c = config(), preflight = campaignPreflight(datasetRoot, c);
  assert.equal(c.thresholds.calibrationStatus, 'provisional');
  assert.equal(preflight.datasetReview, 'pending'); assert.equal(preflight.liveReady, true);
  assert.equal(preflight.acceptanceReady, false); assert.equal(preflight.dispatchAuthorized, false);
  assert.equal(preflight.caseCount, 1); assert.deepEqual(preflight.selectedCaseIds, [selected]);
  assert.equal(preflight.plannedTrials, 3); assert.equal(preflight.plannedControlTrials, 1);
});

test('declaring human-calibrated on a legacy config cannot open provider dispatch', async () => {
  const c = config(); delete c.purpose; delete c.caseIds; c.thresholds.calibrationStatus = 'human-calibrated';
  const p = campaignPreflight(datasetRoot, c); assert.equal(p.liveReady, false);
  const w = workspace(); let count = 0;
  try {
    const fake = provider(100, () => { throw Error('MUST_NOT_SEND'); });
    fake.countInput = async () => { count++; throw Error('MUST_NOT_COUNT'); };
    await assert.rejects(runSemanticCampaign({ ...w, datasetRoot, config: c, provider: fake }), /LIVE_PREFLIGHT_NOT_READY/);
    assert.equal(count, 0); assert.equal(existsSync(w.outputRoot), false); assert.equal(existsSync(w.spendRoot), false);
  } finally { rmSync(w.root, { recursive: true, force: true }); }
});

test('case selection must resolve every ID in the frozen split', () => {
  for (const caseId of ['missing-case', cases.find(c => c.split === 'holdout')!.id]) {
    assert.throws(() => campaignPreflight(datasetRoot, { ...config(), caseIds: [caseId] }), /CASE_SELECTION_INVALID/);
  }
});

test('profile context capacity includes reserved output independently of a large task budget', async () => {
  const w = workspace(); let responses = 0;
  try {
    const report = await runSemanticCampaign({ ...w, datasetRoot, config: config(), provider: provider(1000, () => responses++) });
    assert.equal(responses, 0); assert.equal(report.trials.length, 4);
    assert.ok(report.trials.every(t => t.status === 'model-context-blocked'));
    assert.equal(report.comparisonCoverage.modelContextBlocked, 3);
    assert.equal(report.budget.reservedAttempts, 0); assert.equal(report.budget.chargedMicros, 0);
    assert.equal(report.acceptanceReady, false);
  } finally { rmSync(w.root, { recursive: true, force: true }); }
});

test('exact model capacity boundary admits selected dev cases and preserves complete counted costs', async () => {
  const w = workspace(); let responses = 0;
  try {
    const report = await runSemanticCampaign({ ...w, datasetRoot, config: config(), provider: provider(960, () => responses++) });
    assert.equal(responses, 5); assert.equal(report.completedTrials, 3); assert.equal(report.completedControlTrials, 1);
    assert.ok(report.trials.every(t => t.caseId === selected && t.status === 'completed'));
    assert.equal(report.campaignIntegrityStable, true); assert.ok(report.budget.chargedMicros > 0);
    assert.equal(report.acceptanceReady, false); assert.notEqual(report.phaseGate, 'Pass');
  } finally { rmSync(w.root, { recursive: true, force: true }); }
});
