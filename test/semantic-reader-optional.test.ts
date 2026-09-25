import assert from 'node:assert/strict';
import test from 'node:test';
import type { SemanticAnswer, SemanticDocument, SemanticGold } from '../src/evaluation/dataset.js';
import { scoreGatheringEvidence, scoreSemanticAnswer } from '../src/evaluation/scoring.js';

const required: SemanticDocument = { id: 'required', revision: 'r2', repoId: 'fixture', path: 'infrastructure/required.md',
  taskClass: 'infrastructure.operations', lifecycle: 'active', freshness: 'fresh', text: 'Synthetic supporting source.', distractor: false };
const optional: SemanticDocument = { ...required, id: 'optional', path: 'infrastructure/optional.md' };
const gold: SemanticGold = { caseId: 'synthetic-optional-evidence', requiredEvidenceIds: [required.id],
  acceptableAlternatives: ['Synthetic accepted answer.'], answerability: 'answerable',
  expectedRevision: { required: 'r2', optional: 'r2' }, expectedConstraints: ['preserve-policy'] };
const answer: SemanticAnswer = { disposition: 'answer', answer: 'Synthetic accepted answer.', evidenceIds: [required.id],
  revisions: { required: 'r2' }, constraints: ['preserve-policy'], confidence: 0.9 };

test('omitting an optional supporting source preserves reader correctness and gathering sufficiency', () => {
  const gathering = scoreGatheringEvidence(gold, [required.id], [required]);
  const reader = scoreSemanticAnswer(gold, answer, [required]);
  assert.equal(gathering.sufficient, true);
  assert.equal(reader.evidenceSatisfied, true);
  assert.equal(reader.revisionCorrect, true);
  assert.equal(reader.strictPass, true);
  assert.deepEqual(reader.reasons, []);
});

test('a cited optional source must bind its declared and visible revisions', () => {
  const cited = { ...answer, evidenceIds: [required.id, optional.id], revisions: { required: 'r2', optional: 'r2' } };
  assert.equal(scoreSemanticAnswer(gold, cited, [required, optional]).strictPass, true);
  for (const revisions of [{ required: 'r2' }, { required: 'r2', optional: 'r1' }]) {
    const score = scoreSemanticAnswer(gold, { ...cited, revisions }, [required, optional]);
    assert.equal(score.revisionCorrect, false); assert.equal(score.strictPass, false);
  }
  for (const docs of [[required], [required, { ...optional, revision: 'r1' }]]) {
    const score = scoreSemanticAnswer(gold, cited, docs);
    assert.equal(score.revisionCorrect, false); assert.equal(score.strictPass, false);
  }
});

test('unknown or uncited revision entries cannot be hidden alongside valid required evidence', () => {
  for (const revisions of [{ required: 'r2', invented: 'r2' }, { required: 'r2', optional: 'r2' }]) {
    const score = scoreSemanticAnswer(gold, { ...answer, revisions }, [required, optional]);
    assert.equal(score.revisionCorrect, false); assert.equal(score.strictPass, false);
  }
  const unknown = { ...required, id: 'unknown', path: 'infrastructure/unknown.md' };
  const score = scoreSemanticAnswer(gold, { ...answer, evidenceIds: [required.id, unknown.id],
    revisions: { required: 'r2', unknown: 'r2' } }, [required, unknown]);
  assert.equal(score.evidenceSatisfied, false);
  assert.equal(score.revisionCorrect, false);
  assert.equal(score.strictPass, false);
});

test('optional evidence cannot replace missing required evidence or its revision binding', () => {
  const optionalOnly = scoreSemanticAnswer(gold, { ...answer, evidenceIds: [optional.id], revisions: { optional: 'r2' } }, [optional]);
  assert.equal(optionalOnly.evidenceSatisfied, false);
  assert.equal(optionalOnly.revisionCorrect, false);
  assert.equal(optionalOnly.strictPass, false);
  const requiredUnbound = scoreSemanticAnswer(gold, { ...answer, revisions: {} }, [required]);
  assert.equal(requiredUnbound.revisionCorrect, false);
  assert.equal(requiredUnbound.strictPass, false);
});
