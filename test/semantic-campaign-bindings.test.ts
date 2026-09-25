import test from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { digest } from '../src/contracts/canonical.js';
import { runSemanticCampaign } from '../src/evaluation/campaign.js';
import { importHumanCalibrationReview, loadPublicDataset, verifyDatasetSeal } from '../src/evaluation/dataset.js';
import { OpenAIProviderError } from '../src/providers/openai.js';
import type { ModelProvider, ModelRequest, ModelResult } from '../src/providers/types.js';

function setup(reviewed = true) {
  const root = mkdtempSync(path.join(tmpdir(), 'campaign-binding-fix-'));
  const datasetRoot = path.join(root, 'dataset'), repositoryRoot = path.join(root, 'repository');
  cpSync(path.resolve('fixtures/semantic-benchmark'), datasetRoot, { recursive: true });
  mkdirSync(path.join(repositoryRoot, 'src'), { recursive: true });
  mkdirSync(path.join(repositoryRoot, 'fixtures'));
  for (const f of ['src/pin.ts', 'fixtures/contracts.ts', 'package.json', 'pnpm-lock.yaml', 'tsconfig.json']) writeFileSync(path.join(repositoryRoot, f), '{}\n');
  const evidence = path.join(root, 'external-review.txt');
  writeFileSync(evidence, 'SYNTHETIC TEST ATTESTATION ONLY; not an actual human review.');
  if (reviewed) {
    const caseIds = loadPublicDataset(datasetRoot).cases.filter(c => c.split === 'holdout').map(c => c.id);
    importHumanCalibrationReview(datasetRoot, { schemaVersion: 'semantic-human-review-v1', datasetSealDigest: verifyDatasetSeal(datasetRoot),
      reviewerId: 'synthetic-external-reviewer', reviewerKind: 'human', method: 'external-manual-review', reviewedAt: '2026-09-25T00:00:00.000Z',
      caseIds, evidenceRefs: [{ path: evidence, digest: `sha256:${createHash('sha256').update(readFileSync(evidence)).digest('hex')}` }],
      judgments: caseIds.map(caseId => ({ caseId, answerDigest: digest('synthetic-only'), judgment: 'reject', rationale: 'Local fixture, no semantic acceptance.' })) });
  }
  const config = { schemaVersion: 'semantic-campaign-config/1', campaignId: 'binding-fix', provider: 'mock', split: reviewed ? 'holdout' : 'dev',
    profiles: [{ id: 'mock-executor', role: 'executor', model: 'mock', inputTokenLimit: 10_000, reasoningEffort: 'low',
      pricing: { model: 'mock', inputPerMillionUsd: 1, cachedInputPerMillionUsd: 1, outputPerMillionUsd: 1,
        source: 'https://developers.openai.com/api/docs/pricing', observedAt: '2026-09-25' } }],
    totalTokenBudgets: [1024], distractorLimits: [0], compactionRounds: [1], repeats: 1, topK: 8, maxOutputTokens: 64, headroomTokens: 0,
    authorization: { authorizationId: 'local-zero', maxCostMicros: 0 },
    thresholds: { maxFalseAcceptance: 0, maxConstraintLoss: 0, maxInvalidCitations: 0, minimumStrictPassRate: .9, calibrationStatus: 'provisional' } };
  return { root, datasetRoot, repositoryRoot, evidence, config, outputRoot: path.join(root, 'run'), spendRoot: path.join(root, 'spend') };
}
function answer(r: ModelRequest): ModelResult {
  const packet = JSON.parse(r.input);
  return { status: 'completed', model: r.model, requestDigest: digest(r), responseId: 'mock-fixture', requestId: null, latencyMs: 0,
    usage: { inputTokens: 10, outputTokens: 10, totalTokens: 20, cachedInputTokens: 0, reasoningTokens: 0 },
    output: r.schemaName === 'context_summary' ? { summary: 'Untrusted local fixture summary' }
      : { disposition: 'abstain', answer: null, evidenceIds: [], revisions: [], constraints: packet.task.constraints.map((c: { id: string }) => c.id), confidence: .5 } };
}
function mock(overrides: Partial<ModelProvider> = {}): ModelProvider {
  return { id: 'local-fixture', assurance: 'mock', async countInput(r) { return { inputTokens: 10, requestDigest: digest(r), counterId: 'synthetic' }; },
    async respond(r) { return answer(r); }, ...overrides };
}

test('review evidence changed during counting blocks dispatch and preserves pinned reviewer evidence', async () => {
  const s = setup(); let counts = 0, responses = 0;
  try {
    const report = await runSemanticCampaign({ ...s, provider: mock({
      async countInput(r) { counts++; writeFileSync(s.evidence, 'changed'); return { inputTokens: 10, requestDigest: digest(r), counterId: 'synthetic' }; },
      async respond(r) { responses++; return answer(r); },
    }) });
    assert.equal(counts, 1); assert.equal(responses, 0);
    assert.equal(report.stoppedReason, 'human-review-drift');
    const lock = JSON.parse(readFileSync(path.join(s.outputRoot, 'campaign-lock.json'), 'utf8'));
    assert.match(lock.humanReview.reviewDigest, /^sha256:/);
    assert.equal(lock.humanReview.reviewerId, 'synthetic-external-reviewer');
    assert.equal(lock.humanReview.evidenceRefs[0].path, s.evidence);
    const final = JSON.parse(readFileSync(path.join(s.outputRoot, 'report.json'), 'utf8'));
    assert.equal(final.reviewEvidenceStable, false); assert.equal(final.campaignIntegrityStable, false);
  } finally { rmSync(s.root, { recursive: true, force: true }); }
});

test('review drift after provider response rejects the answer but retains known usage settlement', async () => {
  const s = setup(); let responses = 0;
  try {
    const report = await runSemanticCampaign({ ...s, provider: mock({ async respond(r) { responses++; writeFileSync(s.evidence, 'revoked'); return answer(r); } }) });
    assert.equal(responses, 1); assert.equal(report.stoppedReason, 'human-review-drift');
    assert.equal(report.trials[0]!.answer, null);
    assert.equal(report.budget.uncertainAttempts, 0); assert.equal(report.budget.reservedAttempts, 0);
    assert.equal(report.trials[0]!.unitsUsed, 20);
  } finally { rmSync(s.root, { recursive: true, force: true }); }
});

test('review removal after last trial prevents an integrity-clean final report', async () => {
  const s = setup();
  try {
    const report = await runSemanticCampaign({ ...s, provider: mock(), onProgress(n, planned) {
      if (n === planned) rmSync(path.join(s.datasetRoot, 'human-calibration-review.json'));
    } });
    assert.equal(report.completedTrials, report.plannedTrials);
    assert.equal(report.stoppedReason, 'human-review-drift');
    const final = JSON.parse(readFileSync(path.join(s.outputRoot, 'report.json'), 'utf8'));
    assert.equal(final.reviewEvidenceStable, false);
  } finally { rmSync(s.root, { recursive: true, force: true }); }
});

for (const [code, httpStatus] of [['OPENAI_HTTP_ERROR', 401], ['OPENAI_HTTP_ERROR', 429], ['OPENAI_HTTP_ERROR', 503], ['OPENAI_TIMEOUT', null]] as const) {
  test(`generation failure ${code}/${httpStatus} retains sanitized diagnostics and unknown reservation`, async () => {
    const s = setup(false);
    try {
      const report = await runSemanticCampaign({ ...s, provider: mock({ async respond() { throw new OpenAIProviderError(code, httpStatus, 'req_local_fixture'); } }) });
      assert.equal(report.budget.frozen, true); assert.equal(report.budget.uncertainAttempts, 1);
      const events = readFileSync(path.join(s.outputRoot, 'calls.jsonl'), 'utf8').trim().split('\n').map(x => JSON.parse(x));
      const terminal = events.find(e => e.event === 'request-outcome');
      assert.deepEqual(terminal.error, { kind: 'provider', code, httpStatus, requestId: 'req_local_fixture', boundary: 'generation' });
      assert.match(terminal.errorDigest, /^sha256:/);
    } finally { rmSync(s.root, { recursive: true, force: true }); }
  });
}

test('count failure records safe diagnostics without creating a billed generation attempt', async () => {
  const s = setup(false); let responses = 0;
  try {
    const report = await runSemanticCampaign({ ...s, provider: mock({
      async countInput() { throw new OpenAIProviderError('OPENAI_HTTP_ERROR', 429, 'req_count_fixture'); },
      async respond(r) { responses++; return answer(r); },
    }) });
    assert.equal(responses, 0); assert.equal(report.budget.frozen, false); assert.equal(report.budget.uncertainAttempts, 0);
    const event = JSON.parse(readFileSync(path.join(s.outputRoot, 'calls.jsonl'), 'utf8').trim());
    assert.deepEqual(event.error, { kind: 'provider', code: 'OPENAI_HTTP_ERROR', httpStatus: 429, requestId: 'req_count_fixture', boundary: 'count' });
  } finally { rmSync(s.root, { recursive: true, force: true }); }
});

test('untrusted exception payloads never enter error receipts or report', async () => {
  const s = setup(false); const marker = 'SENSITIVE_FAKE_MARKER_NEVER_LOG';
  try {
    await runSemanticCampaign({ ...s, provider: mock({ async respond() { throw new OpenAIProviderError(marker, -1, `req_${marker} secret whitespace`); } }) });
    const raw = readFileSync(path.join(s.outputRoot, 'calls.jsonl'), 'utf8') + readFileSync(path.join(s.outputRoot, 'report.json'), 'utf8');
    assert.equal(raw.includes(marker), false);
    const event = JSON.parse(readFileSync(path.join(s.outputRoot, 'calls.jsonl'), 'utf8').trim().split('\n').at(-1)!);
    assert.deepEqual(event.error, { kind: 'provider', code: 'OPENAI_ERROR', httpStatus: null, requestId: null, boundary: 'generation' });
  } finally { rmSync(s.root, { recursive: true, force: true }); }
});
