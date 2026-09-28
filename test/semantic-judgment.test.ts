import test from 'node:test';
import assert from 'node:assert/strict';
import { loadEvaluatorOracle, loadPublicDataset } from '../src/evaluation/dataset.js';
import { assessSemanticJudgment, buildBatchedJudgmentRequest, buildSemanticJudgmentRequest, parseBatchedJudgments, summarizeCalibration, summarizeCaseQuality, type JudgmentInput, type SemanticJudgment } from '../src/evaluation/semantic-judgment.js';

const data = loadPublicDataset('fixtures/semantic-benchmark'), gold = loadEvaluatorOracle('fixtures/semantic-benchmark');
const judge = { id: 'independent-sol', model: 'gpt-6-sol', role: 'planner' as const, reasoningEffort: 'medium' as const };
function input(): JudgmentInput {
  const task = data.cases.find(c => c.id === 'sem-001')!, g = gold.find(g => g.caseId === task.id)!;
  return { id: 'control-a', task, gold: g, readerModel: 'gpt-5.6-terra', documents: data.documents.filter(d => g.requiredEvidenceIds.includes(d.id)),
    answer: { disposition: 'answer', answer: 'The worker should exchange a short-lived workload identity token with audience artifacts.internal. Never put a static service key in CI.',
      evidenceIds: [...g.requiredEvidenceIds], revisions: { ...g.expectedRevision }, constraints: [...g.expectedConstraints], confidence: 0.9 } };
}
const good: SemanticJudgment = { addressesQuestion: true, supportedByEvidence: true, respectsConstraintMeaning: true,
  abstentionAppropriate: false, rationale: 'The source explicitly supports the token, audience and prohibition.', unsupportedClaims: [], violatedConstraintIds: [] };

test('paraphrase assessment is separate from immutable lexical score and cannot grant release', () => {
  const result = assessSemanticJudgment(input(), good);
  assert.equal(result.lexical.answerCorrect, false); assert.equal(result.advisoryPass, true);
  assert.equal(result.releaseEligible, false); assert.equal(result.phaseGate, 'Not evaluated');
});
test('confident judge cannot override missing evidence, revision, constraint or critical unknown', () => {
  const mutations: ((i: JudgmentInput) => void)[] = [i => { i.answer.evidenceIds = []; }, i => { i.answer.revisions = {}; },
    i => { i.answer.constraints = []; }, i => { i.answer.constraints.push('invented'); },
    i => { i.task.unknowns.push({ id: 'missing-critical', description: 'Operation scope unknown', critical: true }); },
    i => { i.documents[0]!.freshness = 'stale'; }, i => { i.documents[0]!.lifecycle = 'revoked'; }];
  for (const mutate of mutations) { const i = structuredClone(input()); mutate(i); assert.equal(assessSemanticJudgment(i, good).advisoryPass, false); }
});
test('meaning violation with unchanged IDs and a fabricated execution observation fails', () => {
  const i = input(); i.answer.answer = 'Persist a static service key; the production release has already succeeded.';
  const result = assessSemanticJudgment(i, { ...good, respectsConstraintMeaning: false, supportedByEvidence: false,
    violatedConstraintIds: i.gold.expectedConstraints, unsupportedClaims: ['Production release succeeded.'] });
  assert.equal(result.hardChecksPass, true); assert.equal(result.advisoryPass, false);
});
test('inconsistent or fabricated judge evidence cannot pass', () => {
  assert.equal(assessSemanticJudgment(input(), { ...good, unsupportedClaims: ['unsupported'] }).advisoryPass, false);
  assert.equal(assessSemanticJudgment(input(), { ...good, violatedConstraintIds: ['nonexistent'] }).advisoryPass, false);
  assert.throws(() => assessSemanticJudgment(input(), { ...good, confidence: 1 }));
});
test('false abstention is distinct from correct insufficient-evidence abstention', () => {
  const i = input(); i.answer = { ...i.answer, disposition: 'abstain', answer: null };
  const j = { ...good, addressesQuestion: false, abstentionAppropriate: true };
  assert.equal(assessSemanticJudgment(i, j).advisoryPass, false);
  i.gold = { ...i.gold, answerability: 'unanswerable', acceptableAlternatives: [], requiredEvidenceIds: [], expectedRevision: {} };
  i.answer.evidenceIds = []; i.answer.revisions = {}; i.documents = [];
  assert.equal(assessSemanticJudgment(i, j).advisoryPass, true);
  assert.equal(assessSemanticJudgment(i, { ...j, abstentionAppropriate: false }).advisoryPass, false);
});
test('judge payload omits gold, expected labels, confidence and arm/model cues; same model self review rejected', () => {
  const request = buildSemanticJudgmentRequest(input(), judge);
  for (const name of ['acceptableAlternatives', 'expectedConstraints', 'requiredEvidenceIds', 'answerability', 'confidence', 'readerModel', 'expectedPass']) assert.equal(request.input.includes(`"${name}"`), false);
  assert.equal(request.input.includes('Do not disclose or persist credential values.'), true);
  assert.throws(() => buildSemanticJudgmentRequest({ ...input(), readerModel: judge.model }, judge), /SELF_JUDGMENT/);
});
test('batch output has exact coverage and cannot add duplicate, extra or missing judgments', () => {
  const inputs = [input(), { ...input(), id: 'control-b' }];
  const output = { judgments: inputs.map(i => ({ id: i.id, ...good })) };
  assert.equal(parseBatchedJudgments(inputs, output).length, 2);
  assert.throws(() => parseBatchedJudgments(inputs, { judgments: [output.judgments[0]] }), /COVERAGE/);
  assert.throws(() => parseBatchedJudgments(inputs, { judgments: [output.judgments[0], output.judgments[0]] }), /COVERAGE/);
  assert.throws(() => parseBatchedJudgments(inputs, { judgments: [...output.judgments, { ...good, id: 'extra' }] }), /COVERAGE/);
  assert.throws(() => buildBatchedJudgmentRequest([input(), input()], judge), /BATCH_INVALID/);
});
test('scope and oracle mismatches are rejected before a judgment request', () => {
  const i = structuredClone(input()); i.documents[0]!.path = 'private/secret';
  assert.throws(() => buildSemanticJudgmentRequest(i, judge), /binding mismatch/);
  assert.throws(() => buildSemanticJudgmentRequest({ ...input(), gold: { ...input().gold, caseId: 'other' } }, judge), /binding mismatch/);
});
test('missing judgments remain unknown, not agreement or true rejection; synthetic mutations do not create independent samples', () => {
  const r = summarizeCalibration([{ id: 'p', family: 'one', expectedPass: true, actualPass: null }, { id: 'n', family: 'one', expectedPass: false, actualPass: false }]);
  assert.equal(r.unknowns, 1); assert.equal(r.agreement, 0.5); assert.equal(r.falseRejects, 0);
  assert.equal(r.uniqueFamilies, 1); assert.equal(r.interval, null); assert.equal(r.readyForIndependentReview, false);
  assert.equal(summarizeCalibration([]).agreement, null);
  assert.throws(() => summarizeCalibration([{ id: 'a', family: 'x', expectedPass: true, actualPass: true }, { id: 'a', family: 'x', expectedPass: true, actualPass: true }]));
});
test('quality summary counts unique cases and does not erase failed or missing repeats', () => {
  const r = summarizeCaseQuality([{ caseId: 'a', pass: true }, { caseId: 'a', pass: true }, { caseId: 'b', pass: null }]);
  assert.equal(r.uniqueCases, 2); assert.equal(r.passedCases, 1); assert.equal(r.rate, 0.5);
  assert.equal(summarizeCaseQuality([]).interval, null);
});
