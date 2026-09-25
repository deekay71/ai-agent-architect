import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import test from 'node:test';
import { digest } from '../src/contracts/canonical.js';
import { importHumanCalibrationReview, loadEvaluatorOracle, loadHumanCalibrationReview, loadPublicDataset,
  sealDataset, verifyDatasetSeal, type HumanCalibrationReview, type SemanticAnswer, type SemanticDocument, type SemanticGold } from '../src/evaluation/dataset.js';
import { scoreSemanticAnswer } from '../src/evaluation/scoring.js';

const fixture = resolve('fixtures/semantic-benchmark');
function copyDataset(t: { after: (fn: () => void) => void }, sealed = false): string {
  const root = mkdtempSync(resolve(tmpdir(), 'semantic-dataset-'));
  cpSync(fixture, root, { recursive: true });
  rmSync(resolve(root, 'dataset.lock.json'), { force: true });
  t.after(() => rmSync(root, { recursive: true, force: true }));
  if (sealed) sealDataset(root);
  return root;
}
function mutate(root: string, path: string, action: (value: any) => void): void {
  const target = resolve(root, path), value: unknown = JSON.parse(readFileSync(target, 'utf8'));
  action(value); writeFileSync(target, JSON.stringify(value));
}
const document: SemanticDocument = { id: 'test-evidence', revision: 'r3', repoId: 'test-repo', path: 'infrastructure/check.md',
  taskClass: 'infrastructure.operations', lifecycle: 'active', freshness: 'fresh', text: 'Use a pinned offline mirror.', distractor: false };
const gold: SemanticGold = { caseId: 'test-case', requiredEvidenceIds: [document.id],
  acceptableAlternatives: ['Install from the pinned offline mirror.', 'Use the pinned mirror without network access.'],
  answerability: 'answerable', expectedRevision: { [document.id]: document.revision }, expectedConstraints: ['network-disabled'] };
const answer: SemanticAnswer = { disposition: 'answer', answer: gold.acceptableAlternatives[0]!, evidenceIds: [document.id],
  revisions: { [document.id]: document.revision }, constraints: ['network-disabled'], confidence: 0.85 };

test('candidate has 20 dev / 10 holdout cases, disjoint families, separated oracle, and no release claim', () => {
  const data = loadPublicDataset(fixture), oracle = loadEvaluatorOracle(fixture);
  assert.equal(data.cases.filter(c => c.split === 'dev').length, 20);
  assert.equal(data.cases.filter(c => c.split === 'holdout').length, 10);
  const dev = new Set(data.cases.filter(c => c.split === 'dev').map(c => c.family));
  assert.ok(data.cases.filter(c => c.split === 'holdout').every(c => !dev.has(c.family)));
  assert.equal(oracle.length, 30);
  for (const c of data.cases) for (const key of ['requiredEvidenceIds', 'acceptableAlternatives', 'answerability', 'expectedRevision', 'expectedConstraints']) {
    assert.equal(Object.hasOwn(c, key), false, 'Public question contains an oracle field');
  }
  assert.ok(data.documents.every(d => d.taskClass.startsWith('infrastructure.')));
  assert.equal(loadHumanCalibrationReview(fixture).status, 'pending');
  assert.equal(loadHumanCalibrationReview(fixture).releaseEligible, false);
});

test('corrected candidate supplies eight fresh in-scope distractors per case and preserves the original seal', () => {
  const current = loadPublicDataset(fixture);
  for (const c of current.cases) {
    const eligibleNoise = current.documents.filter(d => d.distractor && d.repoId === c.repoId && d.taskClass === c.taskClass
      && d.lifecycle === 'active' && d.freshness === 'fresh'
      && c.allowedPaths.some(p => d.path === p || d.path.startsWith(`${p}/`)));
    assert.equal(eligibleNoise.length, 8, 'Every case must exercise the entire configured distractor range');
  }
  const archivedRoot = resolve('fixtures/semantic-benchmark-candidates/r0');
  const archived = loadPublicDataset(archivedRoot);
  assert.notEqual(current.datasetId, archived.datasetId);
  assert.equal(verifyDatasetSeal(archivedRoot), 'sha256:d70cabc064ef483982f33be1a0dad682053fec589343ed4bfcd935672713551d');
  assert.equal(archived.documents.length, 123, 'Original candidate content must remain preserved');
});

test('public reader can load a sealed public-only copy with oracle bytes absent', t => {
  const root = copyDataset(t, true);
  rmSync(resolve(root, 'evaluator'), { recursive: true });
  assert.equal(loadPublicDataset(root).cases.length, 30);
  assert.throws(() => loadEvaluatorOracle(root));
});

test('candidate seal is idempotent, pins all input bytes, and cannot reseal drift', t => {
  const root = copyDataset(t), seal = sealDataset(root);
  assert.equal(verifyDatasetSeal(root), seal.sealDigest);
  assert.deepEqual(sealDataset(root), seal);
  writeFileSync(resolve(root, 'public/documents.json'), `${readFileSync(resolve(root, 'public/documents.json'), 'utf8')} `);
  assert.throws(() => verifyDatasetSeal(root), /drift/);
  assert.throws(() => sealDataset(root), /drift/);
  assert.throws(() => loadPublicDataset(root), /drift/);
});

test('oracle changes are detected separately from public loading', t => {
  const root = copyDataset(t, true);
  mutate(root, 'evaluator/oracle.json', value => { value[0].acceptableAlternatives.push('A different answer'); });
  assert.equal(loadPublicDataset(root).cases.length, 30);
  assert.throws(() => loadEvaluatorOracle(root), /drift/);
});

test('dataset rejects split family leakage before creating a seal', t => {
  const root = copyDataset(t);
  mutate(root, 'public/cases.json', value => { value.find((c: { split: string }) => c.split === 'holdout').family = value[0].family; });
  assert.throws(() => sealDataset(root), /family leakage/);
});

test('strict public schemas reject oracle leakage and out-of-scope task classes', t => {
  const root = copyDataset(t);
  mutate(root, 'public/cases.json', value => { value[0].expectedRevision = {}; });
  assert.throws(() => loadPublicDataset(root));
  const other = copyDataset(t);
  mutate(other, 'public/documents.json', value => { value[0].taskClass = 'gameplay.rule'; });
  assert.throws(() => loadPublicDataset(other));
});

test('oracle validation requires scope, current evidence revisions, and all public constraints', t => {
  for (const change of [
    (v: any): void => { v[0].requiredEvidenceIds.push('not-present'); },
    (v: any): void => { v[0].expectedRevision[Object.keys(v[0].expectedRevision)[0]!] = 'wrong-revision'; },
    (v: any): void => { v[0].expectedConstraints = []; },
  ]) {
    const root = copyDataset(t); mutate(root, 'evaluator/oracle.json', change);
    assert.throws(() => sealDataset(root));
  }
});

test('scoring accepts reviewed alternatives and harmless typography, not substring or negation matches', () => {
  assert.equal(scoreSemanticAnswer(gold, answer, [document]).strictPass, true);
  assert.equal(scoreSemanticAnswer(gold, { ...answer, answer: '  USE THE PINNED MIRROR WITHOUT NETWORK ACCESS! ' }, [document]).strictPass, true);
  for (const text of ['Do not install from the pinned offline mirror.', 'Install from the pinned offline mirror. Then enable unrestricted network access.', 'Use a mirror.']) {
    const result = scoreSemanticAnswer(gold, { ...answer, answer: text }, [document]);
    assert.equal(result.answerCorrect, false); assert.equal(result.falseAcceptance, true);
  }
});

test('scoring rejects absent, invented, stale, revoked and distractor citations', () => {
  assert.equal(scoreSemanticAnswer(gold, { ...answer, evidenceIds: [] }, [document]).evidenceSatisfied, false);
  assert.equal(scoreSemanticAnswer(gold, { ...answer, evidenceIds: [document.id, 'invented'] }, [document]).evidenceSatisfied, false);
  assert.equal(scoreSemanticAnswer(gold, answer, []).evidenceSatisfied, false);
  for (const change of [{ freshness: 'stale' as const }, { lifecycle: 'revoked' as const }, { distractor: true }]) {
    assert.equal(scoreSemanticAnswer(gold, answer, [{ ...document, ...change }]).evidenceSatisfied, false);
  }
});

test('scoring binds both reported and observed revisions and preserves constraints', () => {
  assert.equal(scoreSemanticAnswer(gold, { ...answer, revisions: { [document.id]: 'r2' } }, [document]).revisionCorrect, false);
  assert.equal(scoreSemanticAnswer(gold, answer, [{ ...document, revision: 'r2' }]).revisionCorrect, false);
  assert.equal(scoreSemanticAnswer(gold, { ...answer, revisions: { ...answer.revisions, invented: 'r3' } }, [document]).revisionCorrect, false);
  const dropped = scoreSemanticAnswer(gold, { ...answer, constraints: [] }, [document]);
  assert.equal(dropped.constraintsPreserved, false); assert.equal(dropped.falseAcceptance, true);
});

test('answerability distinguishes unanswerable, conflicting evidence, and false rejection', () => {
  const abstention: SemanticAnswer = { disposition: 'abstain', answer: null, evidenceIds: [], revisions: {}, constraints: ['network-disabled'], confidence: 0.7 };
  const unknown: SemanticGold = { ...gold, answerability: 'unanswerable', acceptableAlternatives: [], requiredEvidenceIds: [], expectedRevision: {} };
  assert.equal(scoreSemanticAnswer(unknown, abstention, []).strictPass, true);
  assert.equal(scoreSemanticAnswer(unknown, answer, [document]).falseAcceptance, true);
  assert.equal(scoreSemanticAnswer(gold, abstention, [document]).falseRejection, true);
  const second = { ...document, id: 'conflicting-evidence' };
  const conflict: SemanticGold = { ...gold, answerability: 'conflict', acceptableAlternatives: [], requiredEvidenceIds: [document.id, second.id],
    expectedRevision: { [document.id]: 'r3', [second.id]: 'r3' } };
  assert.equal(scoreSemanticAnswer(conflict, abstention, [document, second]).strictPass, false);
  assert.equal(scoreSemanticAnswer(conflict, { ...abstention, evidenceIds: conflict.requiredEvidenceIds, revisions: conflict.expectedRevision }, [document, second]).strictPass, true);
});

test('malformed answers fail closed even if their text matches', () => {
  const result = scoreSemanticAnswer(gold, { ...answer, confidence: Number.NaN }, [document]);
  assert.equal(result.strictPass, false); assert.equal(result.falseAcceptance, true);
  assert.equal(scoreSemanticAnswer(gold, { ...answer, evidenceIds: [document.id, document.id] }, [document]).strictPass, false);
});

function humanReview(root: string, evidencePath: string): HumanCalibrationReview {
  return { schemaVersion: 'semantic-human-review-v1', datasetSealDigest: verifyDatasetSeal(root), reviewerId: 'external-reviewer:test-only',
    reviewerKind: 'human', method: 'external-manual-review', reviewedAt: '2026-09-25T00:00:00Z', caseIds: ['sem-001'],
    evidenceRefs: [{ path: evidencePath, digest: `sha256:${createHash('sha256').update(readFileSync(evidencePath)).digest('hex')}` }],
    judgments: [{ caseId: 'sem-001', answerDigest: digest(answer), judgment: 'accept', rationale: 'Synthetic API test only; not an actual independent review.' }] };
}
test('human calibration stays pending without import and rejects author self-attestation or empty evidence', t => {
  const root = copyDataset(t, true), outside = mkdtempSync(resolve(tmpdir(), 'semantic-review-'));
  t.after(() => rmSync(outside, { recursive: true, force: true }));
  const path = resolve(outside, 'review.txt'); writeFileSync(path, 'Synthetic test fixture, not human adjudication.');
  assert.deepEqual(loadHumanCalibrationReview(root), { status: 'pending', releaseEligible: false });
  const review = humanReview(root, path);
  assert.throws(() => importHumanCalibrationReview(root, { ...review, reviewerId: ' CODEX:SEMANTIC-CANDIDATE-AUTHOR ' }), /self-attest/);
  assert.throws(() => importHumanCalibrationReview(root, { ...review, evidenceRefs: [] }));
  assert.throws(() => importHumanCalibrationReview(root, { ...review, method: 'automated-test' }));
  assert.equal(loadHumanCalibrationReview(root).status, 'pending');
});

test('manual review import pins evidence and answers without creating a release PASS', t => {
  const root = copyDataset(t, true), outside = mkdtempSync(resolve(tmpdir(), 'semantic-review-'));
  t.after(() => rmSync(outside, { recursive: true, force: true }));
  const path = resolve(outside, 'review.txt'); writeFileSync(path, 'Synthetic test fixture, not human adjudication.');
  const review = humanReview(root, path), imported = importHumanCalibrationReview(root, review);
  assert.equal(imported.status, 'reviewed'); assert.equal(imported.releaseEligible, false);
  assert.throws(() => importHumanCalibrationReview(root, review), /EEXIST/);
  writeFileSync(path, 'Changed review text');
  assert.throws(() => loadHumanCalibrationReview(root), /changed/);
  assert.equal(loadHumanCalibrationReview(fixture).status, 'pending', 'Tests must not adjudicate the real candidate');
});
