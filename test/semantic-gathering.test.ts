import assert from 'node:assert/strict';
import test from 'node:test';
import type { SemanticAnswer, SemanticDocument, SemanticGold } from '../src/evaluation/dataset.js';
import { scoreGatheringEvidence, scoreSemanticAnswer } from '../src/evaluation/scoring.js';

function document(id: string, change: Partial<SemanticDocument> = {}): SemanticDocument {
  return { id, revision: 'r2', repoId: 'fixture-repo', path: `infrastructure/${id}.md`,
    taskClass: 'infrastructure.operations', lifecycle: 'active', freshness: 'fresh',
    text: 'Use the pinned offline mirror.', distractor: false, ...change };
}
const first = document('required-a'), second = document('required-b'), optional = document('optional');
const gold: SemanticGold = { caseId: 'gathering-fixture', requiredEvidenceIds: [first.id, second.id],
  acceptableAlternatives: ['Use the pinned offline mirror.'], answerability: 'answerable',
  expectedRevision: { [first.id]: 'r2', [second.id]: 'r2' }, expectedConstraints: ['network-disabled'] };
const answer: SemanticAnswer = { disposition: 'answer', answer: 'Use the pinned offline mirror.',
  evidenceIds: [first.id, second.id], revisions: gold.expectedRevision, constraints: ['network-disabled'], confidence: 0.9 };

test('gathering reports missing required evidence independently of a correct reader answer', () => {
  const gathered = scoreGatheringEvidence(gold, [first.id], [first, second]);
  assert.equal(gathered.requiredCount, 2);
  assert.equal(gathered.requiredMatchedCount, 1);
  assert.equal(gathered.eligibleMatchedCount, 1);
  assert.equal(gathered.recall, 0.5);
  assert.equal(gathered.precision, 1);
  assert.equal(gathered.sufficient, false);
  assert.deepEqual(gathered.missingRequiredIds, [second.id]);
  const reader = scoreSemanticAnswer(gold, answer, [first]);
  assert.equal(reader.answerCorrect, true);
  assert.equal(reader.evidenceSatisfied, false);
  assert.equal(reader.strictPass, false);
});

test('complete gathering stays sufficient when reader abstains and falsely rejects the case', () => {
  const gathered = scoreGatheringEvidence(gold, [first.id, second.id], [first, second]);
  const reader = scoreSemanticAnswer(gold, { disposition: 'abstain', answer: null,
    evidenceIds: [], revisions: {}, constraints: ['network-disabled'], confidence: 0.6 }, [first, second]);
  assert.equal(gathered.recall, 1);
  assert.equal(gathered.precision, 1);
  assert.equal(gathered.sufficient, true);
  assert.deepEqual(gathered.missingRequiredIds, []);
  assert.equal(reader.falseRejection, true);
  assert.equal(reader.strictPass, false);
});

test('optional pinned supporting evidence increases precision without being required for recall', () => {
  const withOptional: SemanticGold = { ...gold, expectedRevision: { ...gold.expectedRevision, [optional.id]: 'r2' } };
  const docs = [first, second, optional];
  const withoutOptional = scoreGatheringEvidence(withOptional, [first.id, second.id], docs);
  assert.equal(withoutOptional.recall, 1);
  assert.equal(withoutOptional.precision, 1);
  assert.equal(withoutOptional.sufficient, true);
  const withAll = scoreGatheringEvidence(withOptional, [first.id, second.id, optional.id], docs);
  assert.equal(withAll.requiredMatchedCount, 2);
  assert.equal(withAll.eligibleMatchedCount, 3);
  assert.equal(withAll.precision, 1);
  assert.deepEqual(withAll.unsupportedIds, []);
});

test('irrelevant and unknown gathered sources reduce precision without erasing complete evidence', () => {
  const irrelevant = document('irrelevant'), distractor = document('distractor', { distractor: true });
  const result = scoreGatheringEvidence(gold, [first.id, second.id, irrelevant.id, distractor.id, 'invented'], [first, second, irrelevant, distractor]);
  assert.equal(result.gatheredCount, 5);
  assert.equal(result.recall, 1);
  assert.equal(result.precision, 2 / 5);
  assert.equal(result.sufficient, true);
  assert.deepEqual(result.unsupportedIds, [irrelevant.id, distractor.id]);
  assert.deepEqual(result.ineligibleIds, [irrelevant.id, distractor.id]);
  assert.deepEqual(result.unknownIds, ['invented']);
});

test('present but stale, revoked, distractor or wrong-revision evidence does not satisfy requirements', () => {
  for (const change of [{ freshness: 'stale' as const }, { lifecycle: 'revoked' as const }, { distractor: true }, { revision: 'r1' }]) {
    const result = scoreGatheringEvidence(gold, [first.id, second.id], [{ ...first, ...change }, second]);
    assert.equal(result.requiredMatchedCount, 1);
    assert.equal(result.eligibleMatchedCount, 1);
    assert.equal(result.recall, 0.5);
    assert.equal(result.precision, 0.5);
    assert.equal(result.sufficient, false);
    assert.deepEqual(result.missingRequiredIds, [first.id]);
    assert.deepEqual(result.ineligibleIds, [first.id]);
    assert.deepEqual(result.staleIds, 'freshness' in change ? [first.id] : []);
    assert.deepEqual(result.revokedIds, 'lifecycle' in change ? [first.id] : []);
    assert.deepEqual(result.revisionMismatchIds, 'revision' in change ? [first.id] : []);
  }
});

test('a gathered required ID absent from visible documents remains unknown and missing', () => {
  const result = scoreGatheringEvidence(gold, [first.id, second.id], [first]);
  assert.equal(result.recall, 0.5);
  assert.equal(result.precision, 0.5);
  assert.equal(result.sufficient, false);
  assert.deepEqual(result.unknownIds, [second.id]);
  assert.deepEqual(result.ineligibleIds, []);
  assert.deepEqual(result.missingRequiredIds, [second.id]);
});

test('empty gathering is zero recall for required evidence and has undefined precision', () => {
  const result = scoreGatheringEvidence(gold, [], [first, second]);
  assert.equal(result.gatheredCount, 0);
  assert.equal(result.eligibleMatchedCount, 0);
  assert.equal(result.recall, 0);
  assert.equal(result.precision, null);
  assert.equal(result.sufficient, false);
  assert.deepEqual(result.missingRequiredIds, gold.requiredEvidenceIds);
});

test('no required evidence is not automatically perfect recall or sufficient gathering', () => {
  const unknown: SemanticGold = { ...gold, requiredEvidenceIds: [], acceptableAlternatives: [],
    answerability: 'unanswerable', expectedRevision: {} };
  const empty = scoreGatheringEvidence(unknown, [], [first]);
  assert.equal(empty.requiredCount, 0);
  assert.equal(empty.recall, null);
  assert.equal(empty.precision, null);
  assert.equal(empty.sufficient, null);
  const noisy = scoreGatheringEvidence(unknown, [first.id, 'invented'], [first]);
  assert.equal(noisy.recall, null);
  assert.equal(noisy.precision, 0);
  assert.equal(noisy.sufficient, null);
  assert.deepEqual(noisy.ineligibleIds, [first.id]);
  assert.deepEqual(noisy.unknownIds, ['invented']);
});

test('conflict gathering requires both sources even when the expected reader action is abstention', () => {
  const conflict: SemanticGold = { ...gold, answerability: 'conflict', acceptableAlternatives: [] };
  assert.equal(scoreGatheringEvidence(conflict, [first.id], [first, second]).sufficient, false);
  assert.equal(scoreGatheringEvidence(conflict, [first.id, second.id], [first, second]).sufficient, true);
});

test('gathering duplicates cannot inflate metrics, and ambiguous source identity is rejected', () => {
  const result = scoreGatheringEvidence(gold, [first.id, first.id, second.id], [first, second]);
  assert.equal(result.gatheredCount, 2);
  assert.equal(result.requiredMatchedCount, 2);
  assert.equal(result.precision, 1);
  assert.throws(() => scoreGatheringEvidence(gold, [first.id], [first, { ...first, revision: 'r1' }]), /duplicate IDs/);
  assert.throws(() => scoreGatheringEvidence(gold, ['  '], [first]), /nonblank canonical/);
});

test('gathering diagnostics contain no expected answer, constraint text, or oracle revision map', () => {
  const result = scoreGatheringEvidence(gold, [first.id], [first, second]);
  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes(gold.acceptableAlternatives[0]!), false);
  for (const key of ['acceptableAlternatives', 'expectedRevision', 'expectedConstraints', 'answerability']) {
    assert.equal(Object.hasOwn(result, key), false);
  }
});
