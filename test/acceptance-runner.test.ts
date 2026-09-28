import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { freezeCodexAcceptanceProtocol } from '../src/evaluation/acceptance-runner.js';
import { loadPublicDataset } from '../src/evaluation/dataset.js';

const repo = path.resolve('.'), datasetRoot = path.resolve('fixtures/semantic-benchmark');
const sha = (value: unknown) => { const raw = Buffer.from(JSON.stringify(value)); return `sha256:${createHash('sha256').update(raw).digest('hex')}`; };
function fixture(root: string) {
  const write = (name: string, value: unknown) => { const file = path.join(root, name); writeFileSync(file, JSON.stringify(value)); return { path: file, digest: sha(value) }; };
  const thresholdArtifact = write('threshold.json', { schemaVersion: 'codex-acceptance-thresholds/1', thresholds: {
    caseSuccessMinimum: .9, allRepeatsRequired: true, allRequiredAbstentions: true, maxHardGateViolations: 0,
    calibrationPositiveMinimum: .9, calibrationNegativeMinimum: .9, maxCriticalFalseAccepts: 0, minimumPerStratumCases: 10 }, phaseGate: 'Not evaluated', releaseEligible: false });
  const calibrationArtifact = write('calibration.json', { schemaVersion: 'codex-judge-calibration/1', reviewerKind: 'ai', method: 'independent-model-review', model: 'gpt-6-sol', rows: [{}], humanAttestation: null });
  const independentReviewArtifact = write('review.json', { schemaVersion: 'codex-independent-review/1', reviewerKind: 'ai', method: 'independent-model-review', model: 'gpt-6-sol', assessments: [{}], humanAttestation: null, phaseGate: 'Not evaluated', releaseEligible: false });
  const caseIds = loadPublicDataset(datasetRoot).cases.filter(c => c.split === 'holdout').map(c => c.id);
  const protocolDocumentArtifact = write('protocol-document.json', { synthetic: 'Local regression only' });
  const feasibilityArtifact = write('feasibility.json', { schemaVersion: 'dev-request-feasibility/1', modelCalls: 0, stressBytes: 20480,
    stressDigest: 'sha256:b270da49414b81c4605d5009876d48664c46a29d48ad28fd46fd06c13954a0c0', rows: Array.from({ length: 120 }, () => ({ requestBytes: 1000 })) });
  const protocol = { schemaVersion: 'phase3-subscription-starter/1', protocolId: 'phase3-test', measurementMode: 'local-regression', userRequest: 'implement5closureitems+delegate', datasetRoot, repositoryRoot: repo, usageRoot: root,
    caseIds, visibleByteAllowances: [64000, 80000, 160000], repeats: 2, arms: ['F', 'R', 'C1', 'C3'], control: 'G',
    reader: { id: 'terra-reader', role: 'executor', model: 'gpt-5.6-terra', reasoningEffort: 'medium' }, judge: { id: 'sol-judge', role: 'planner', model: 'gpt-6-sol', reasoningEffort: 'medium' },
    topK: 3, outputTokenHint: 512, perTrialReportedTokenStop: 200000, perCallTimeoutMs: 30000, authorization: { authorizationId: `test-${path.basename(root)}`, maxInvocations: 540, maxReportedTokens: 8000000, maxWallTimeMs: 3600000 }, maxCalls: 540,
    thresholdArtifact, calibrationArtifact, independentReviewArtifact, protocolDocumentArtifact, feasibilityArtifact };
  const protocolFile = path.join(root, 'protocol.json'); writeFileSync(protocolFile, JSON.stringify(protocol)); return { protocolFile, protocol };
}

test('freeze requires a replayable calibration evidence envelope, never a label-review placeholder', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'acceptance-runner-'));
  try {
    const { protocolFile } = fixture(root);
    assert.throws(() => freezeCodexAcceptanceProtocol(protocolFile), /ACCEPTANCE_ARTIFACT_INVALID/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('threshold artifacts cannot weaken the frozen case success criterion', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'acceptance-runner-'));
  try {
    const { protocolFile, protocol } = fixture(root);
    const threshold = JSON.parse(readFileSync(protocol.thresholdArtifact.path, 'utf8')) as { thresholds: { caseSuccessMinimum: number } };
    threshold.thresholds.caseSuccessMinimum = 0.8;
    writeFileSync(protocol.thresholdArtifact.path, JSON.stringify(threshold)); protocol.thresholdArtifact.digest = sha(threshold);
    writeFileSync(protocolFile, JSON.stringify(protocol));
    assert.throws(() => freezeCodexAcceptanceProtocol(protocolFile), /ACCEPTANCE_ARTIFACT_INVALID/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
