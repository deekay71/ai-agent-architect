import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { canonicalJson, digest, digestOmitting } from '../src/contracts/canonical.js';
import { exportOutcomeReview, importOutcomeReview, type OutcomeReviewInput } from '../src/evaluation/outcome-review.js';
import { CampaignConfigSchema } from '../src/evaluation/config.js';
import { buildReaderRequest, campaignPromptDigest } from '../src/evaluation/campaign.js';

const rawDigest = (file: string): string => `sha256:${createHash('sha256').update(readFileSync(file)).digest('hex')}`;
const json = (file: string, value: unknown): void => writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
function setup(t: test.TestContext, assurance: 'mock' | 'provider' = 'mock') {
  const root = mkdtempSync(path.join(tmpdir(), 'semantic-output-review-')), campaign = path.join(root, 'campaign');
  mkdirSync(path.join(campaign, 'packets'), { recursive: true });
  t.after(() => rmSync(root, { recursive: true, force: true }));
  // All data, provider receipts and human attestations in this test are synthetic local fixtures.
  const config = CampaignConfigSchema.parse({
    ...JSON.parse(readFileSync('fixtures/semantic-config/dev-smoke-draft.json', 'utf8')),
    campaignId: 'local-review-fixture', provider: assurance === 'mock' ? 'mock' : 'openai', caseIds: ['case-1'],
    profiles: [{ id: 'reader', model: 'local-fixture-model', role: 'executor', reasoningEffort: 'low', inputTokenLimit: 100000,
      modelContextLimit: 100000, maxModelOutputTokens: 4000,
      pricing: { model: 'local-fixture-model', inputPerMillionUsd: 1, cachedInputPerMillionUsd: 1, outputPerMillionUsd: 1,
        source: 'https://developers.openai.com/api/docs/pricing', observedAt: '2026-09-25' } }],
  });
  const profile = config.profiles[0]!;
  const sourcePins = { 'src/fixture.ts': digest('source') }, lock = { config, configDigest: digest(config), datasetSealDigest: digest('dataset'),
    implementationDigest: digest(sourcePins), sourcePins, promptDigest: campaignPromptDigest(), providerId: 'synthetic-fixture', assurance };
  const answer = { disposition: 'answer', answer: 'Public evidence answer', evidenceIds: ['source-1'], revisions: { 'source-1': 'r1' }, constraints: ['C1'], confidence: 0.8 };
  const packet = { task: { taskId: 'case-1', goal: 'Find the public evidence.' }, model: { modelConfigVersion: digest(profile) }, generation: 0,
    resources: [{ pin: { ref: 'source-1' }, content: 'Public evidence answer' }], history: { content: 'Public history only' }, bundle: { unknowns: [] } };
  const windowBody = { packet, packetDigest: digest(packet), status: 'ready', issues: [] }, window = { ...windowBody, windowDigest: digest(windowBody) };
  const requestDigest = digest(buildReaderRequest(canonicalJson(packet), profile, config.maxOutputTokens));
  const trial = { trialId: 'trial-00000', caseId: 'case-1', profileId: profile.id, model: profile.model, role: profile.role,
    split: 'dev', arm: 'full', status: 'completed', answer, answerDigest: digest(answer),
    score: { answerCorrect: true, evidenceSatisfied: true, revisionCorrect: true, constraintsPreserved: true, falseAcceptance: false, falseRejection: false, strictPass: true, reasons: [] },
    selectedIds: ['source-1'], windowDigests: [window.windowDigest], calls: [{ stage: 'reader', status: 'completed', requestDigest,
      result: { status: 'completed', model: profile.model, responseId: 'test-only-response', requestDigest,
        output: { ...answer, revisions: [{ sourceId: 'source-1', revision: 'r1' }] } } }] };
  const blocked = { ...trial, trialId: 'trial-00001', status: 'context-blocked', answer: null, answerDigest: null, score: null, calls: [], windowDigests: [] };
  const report = { schemaVersion: 'semantic-campaign-report/2', campaignId: config.campaignId, configDigest: lock.configDigest,
    datasetSealDigest: lock.datasetSealDigest, implementationDigest: lock.implementationDigest, providerId: lock.providerId,
    assurance, modelQualityMeasured: assurance === 'provider', campaignIntegrityStable: true, stoppedReason: null, trials: [trial, blocked] };
  json(path.join(campaign, 'campaign-lock.json'), lock); json(path.join(campaign, 'report.json'), report);
  json(path.join(campaign, 'packets', 'trial-00000-0.json'), window);
  // A canary next to campaign data must never enter the review export.
  mkdirSync(path.join(campaign, 'evaluator'));
  json(path.join(campaign, 'evaluator', 'oracle.json'), { secret: 'ORACLE_CANARY_NEVER_EXPORT' });
  const evidence = path.join(root, 'external-human-fixture.txt');
  writeFileSync(evidence, 'SYNTHETIC TEST ATTESTATION ONLY, not an actual human decision.');
  const exported = () => exportOutcomeReview(campaign, path.join(root, 'bundle'));
  const review = (): OutcomeReviewInput => {
    const bundle = exported().bundle;
    return { schemaVersion: 'semantic-outcome-review/1', bundleDigest: bundle.bundleDigest, campaign: bundle.campaign,
      reviewerId: 'synthetic-test-reviewer', reviewerKind: 'human', method: 'external-manual-review', reviewedAt: '2026-09-25T12:00:00Z',
      evidenceRefs: [{ path: evidence, digest: rawDigest(evidence) }],
      judgments: bundle.items.map(item => ({ trialId: item.trialId, answerDigest: item.answerDigest, judgment: 'accept', rationale: 'SYNTHETIC TEST decision for pinned public evidence.' })) };
  };
  return { root, campaign, evidence, report, lock, trial, window, exported, review, output: path.join(root, 'reviewed.json') };
}

test('output bundle contains pinned actual outputs and public selected context, excludes gold and automated scores', t => {
  const f = setup(t), result = f.exported();
  assert.equal(result.bundle.coverage.requiredOutputs, 1); assert.equal(result.bundle.coverage.totalTrials, 2);
  assert.deepEqual(result.bundle.coverage.excludedTrials, [{ trialId: 'trial-00001', status: 'context-blocked' }]);
  assert.equal(result.bundle.campaign.reportRawDigest, rawDigest(path.join(f.campaign, 'report.json')));
  assert.equal(result.bundle.campaign.lockRawDigest, rawDigest(path.join(f.campaign, 'campaign-lock.json')));
  assert.equal(result.bundle.items[0]!.answerDigest, f.trial.answerDigest);
  assert.equal(result.bundle.items[0]!.requestBinding, 'complete-reader-request-reconstructed-and-matched');
  const combined = [result.bundlePath, result.markdownPath, result.decisionsPath].map(p => readFileSync(p, 'utf8')).join('\n');
  assert.equal(combined.includes('ORACLE_CANARY'), false); assert.equal(combined.includes('strictPass'), false);
  assert.equal(combined.includes('Public evidence answer'), true);
  const pending: unknown = JSON.parse(readFileSync(result.decisionsPath, 'utf8'));
  assert.throws(() => importOutcomeReview(f.campaign, pending, f.output));
  assert.throws(() => exportOutcomeReview(f.campaign, path.join(f.root, 'bundle')), /OUTPUT_MUST_BE_NEW/);
});

test('mock review imports actual complete decisions but cannot grant acceptance or hide excluded outputs', t => {
  const f = setup(t), result = importOutcomeReview(f.campaign, f.review(), f.output);
  assert.equal(result.status, 'reviewed'); assert.equal(result.releaseEligible, false); assert.equal(result.phaseGate, 'Not evaluated');
  assert.equal(result.acceptanceStatus, 'not-acceptance-mock-provider'); assert.equal(result.coverage.excludedTrials.length, 1);
  assert.equal(result.identityAssurance, 'external-attestation-not-authenticated');
  assert.equal(JSON.parse(readFileSync(f.output, 'utf8')).artifactDigest, result.artifactDigest);
});

test('provider observation plus human attestation still requires the acceptance protocol gate', t => {
  const f = setup(t, 'provider'), result = importOutcomeReview(f.campaign, f.review(), f.output);
  assert.equal(result.acceptanceStatus, 'external-attestation-requires-protocol-gate');
  assert.equal(result.releaseEligible, false); assert.equal(result.phaseGate, 'Not evaluated');
});

for (const mutation of ['missing', 'duplicate', 'foreign', 'answer-digest'] as const) {
  test(`output review rejects ${mutation} judgment coverage`, t => {
    const f = setup(t), input = f.review();
    if (mutation === 'missing') input.judgments = [];
    if (mutation === 'duplicate') input.judgments.push(structuredClone(input.judgments[0]!));
    if (mutation === 'foreign') input.judgments[0]!.trialId = 'trial-missing';
    if (mutation === 'answer-digest') input.judgments[0]!.answerDigest = digest('forged');
    assert.throws(() => importOutcomeReview(f.campaign, input, f.output));
  });
}

test('raw report whitespace mutation invalidates an exported review even when parsed JSON is unchanged', t => {
  const f = setup(t), input = f.review();
  writeFileSync(path.join(f.campaign, 'report.json'), JSON.stringify(f.report));
  assert.throws(() => importOutcomeReview(f.campaign, input, f.output), /CAMPAIGN_DRIFT/);
});

test('raw lock mutation and selected packet content mutation invalidate pinned review', t => {
  const f = setup(t), input = f.review();
  writeFileSync(path.join(f.campaign, 'campaign-lock.json'), JSON.stringify(f.lock));
  assert.throws(() => importOutcomeReview(f.campaign, input, f.output), /CAMPAIGN_DRIFT/);
  json(path.join(f.campaign, 'campaign-lock.json'), f.lock);
  f.window.packet.resources[0]!.content = 'Tampered context';
  json(path.join(f.campaign, 'packets', 'trial-00000-0.json'), f.window);
  assert.throws(() => importOutcomeReview(f.campaign, input, f.output), /PACKET_BINDING/);
});

test('wrong returned model or forged actual answer is rejected before a review can be exported', t => {
  const f = setup(t); f.trial.calls[0]!.result.model = 'different-model'; json(path.join(f.campaign, 'report.json'), f.report);
  assert.throws(f.exported, /RESPONSE_BINDING/);
  f.trial.calls[0]!.result.model = f.trial.model;
  f.trial.calls[0]!.result.output.answer = 'Forged actual response'; json(path.join(f.campaign, 'report.json'), f.report);
  assert.throws(f.exported, /RESPONSE_BINDING/);
});

test('a self-consistently resealed context cannot be exported as the input of an unchanged reader request', t => {
  const f = setup(t);
  f.window.packet.resources[0]!.content = 'Replacement evidence the reader never received';
  f.window.packetDigest = digest(f.window.packet);
  f.window.windowDigest = digestOmitting(f.window, 'windowDigest');
  f.trial.windowDigests[0] = f.window.windowDigest;
  json(path.join(f.campaign, 'report.json'), f.report);
  json(path.join(f.campaign, 'packets', 'trial-00000-0.json'), f.window);
  assert.throws(f.exported, /REQUEST_BINDING/);
});

test('matching invented request digests do not establish the complete reader request binding', t => {
  const f = setup(t);
  f.trial.calls[0]!.requestDigest = digest('invented-request');
  f.trial.calls[0]!.result.requestDigest = digest('invented-request');
  json(path.join(f.campaign, 'report.json'), f.report);
  assert.throws(f.exported, /REQUEST_BINDING/);
});

test('unknown prompt versions are refused rather than labeled verified legacy requests', t => {
  const f = setup(t); f.lock.promptDigest = digest('unsupported-legacy-prompt');
  json(path.join(f.campaign, 'campaign-lock.json'), f.lock);
  assert.throws(f.exported, /PROMPT_VERSION_UNSUPPORTED/);
});

test('output reserve changes cannot be resealed into an unchanged model response', t => {
  const f = setup(t); f.lock.config.maxOutputTokens--;
  f.lock.configDigest = digest(f.lock.config); f.report.configDigest = f.lock.configDigest;
  json(path.join(f.campaign, 'report.json'), f.report); json(path.join(f.campaign, 'campaign-lock.json'), f.lock);
  assert.throws(f.exported, /REQUEST_BINDING/);
});

test('review rejects altered evidence, campaign-local evidence and empty rationales', t => {
  const f = setup(t), input = f.review();
  writeFileSync(f.evidence, 'changed'); assert.throws(() => importOutcomeReview(f.campaign, input, f.output), /EVIDENCE_DRIFT/);
  input.evidenceRefs = [{ path: path.join(f.campaign, 'report.json'), digest: rawDigest(path.join(f.campaign, 'report.json')) }];
  assert.throws(() => importOutcomeReview(f.campaign, input, f.output), /EXTERNAL_EVIDENCE_REQUIRED/);
  input.evidenceRefs = [{ path: f.evidence, digest: rawDigest(f.evidence) }]; input.judgments[0]!.rationale = '  ';
  assert.throws(() => importOutcomeReview(f.campaign, input, f.output));
});

test('review cannot overwrite campaign bytes or inject a release claim', t => {
  const f = setup(t), input = f.review();
  assert.throws(() => importOutcomeReview(f.campaign, { ...input, releaseEligible: true }, f.output));
  assert.throws(() => importOutcomeReview(f.campaign, input, path.join(f.campaign, 'reviewed.json')), /OUTPUT_MUST_BE_NEW/);
  importOutcomeReview(f.campaign, input, f.output);
  assert.throws(() => importOutcomeReview(f.campaign, input, f.output), /OUTPUT_MUST_BE_NEW/);
});
