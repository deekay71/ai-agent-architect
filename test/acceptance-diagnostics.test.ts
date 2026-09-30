import test from 'node:test';
import assert from 'node:assert/strict';
import { digest } from '../src/contracts/canonical.js';
import { loadEvaluatorOracle, loadPublicDataset } from '../src/evaluation/dataset.js';
import { assessSemanticJudgment, type JudgmentInput, type SemanticJudgment } from '../src/evaluation/semantic-judgment.js';
import { diagnoseAcceptanceJudgments, type JudgmentReviewIssue } from '../src/evaluation/acceptance-diagnostics.js';

const data = loadPublicDataset('fixtures/semantic-benchmark'), gold = loadEvaluatorOracle('fixtures/semantic-benchmark').find(g => g.caseId === 'sem-001')!;
const provenance = { sourcePinDigest: digest('source'), protocolDigest: digest('protocol'), judgmentEvidenceDigest: digest('receipts') };
const judgment: SemanticJudgment = { addressesQuestion: true, supportedByEvidence: true, respectsConstraintMeaning: true,
  abstentionAppropriate: false, rationale: 'The visible source supports the proposed answer.', unsupportedClaims: [], violatedConstraintIds: [] };
function input(id: string): JudgmentInput {
  return { id, task: data.cases.find(c => c.id === gold.caseId)!, gold, readerModel: 'gpt-5.6-terra',
    documents: data.documents.filter(d => gold.requiredEvidenceIds.includes(d.id)),
    answer: { disposition: 'answer', answer: gold.acceptableAlternatives[0]!, evidenceIds: gold.requiredEvidenceIds,
      revisions: gold.expectedRevision, constraints: gold.expectedConstraints, confidence: 0.5 } };
}
test('missing gathered evidence distinguishes abstention from an unsupported answer without changing hard failures', () => {
  const abstention = input('abstain'), unsupported = input('unsupported'), unassessed = input('unassessed');
  abstention.documents = []; abstention.answer = { ...abstention.answer, disposition: 'abstain', answer: null, evidenceIds: [], revisions: {} };
  unsupported.documents = []; unsupported.answer = { ...unsupported.answer, evidenceIds: [], revisions: {} };
  const a = assessSemanticJudgment(abstention, { ...judgment, addressesQuestion: false, abstentionAppropriate: true });
  const b = assessSemanticJudgment(unsupported, { ...judgment, supportedByEvidence: false, unsupportedClaims: ['Claim lacks visible support.'] });
  const result = diagnoseAcceptanceJudgments([abstention, unsupported, unassessed], [{ id: abstention.id, assessment: a }, { id: unsupported.id, assessment: b }], provenance);
  assert.equal(a.hardChecksPass, false); assert.equal(b.hardChecksPass, false);
  assert.equal(result.counts.gatheringFailure, 2); assert.equal(result.counts.citationFailure, 2);
  assert.equal(result.counts.abstainedWithMissingEvidence, 1); assert.equal(result.counts.unsupportedAnswer, 1);
  assert.equal(result.unassessed, 1); assert.equal(result.adjudicationStatus, 'pending');
  assert.equal(result.reviewIssues[0]!.kind, 'missing-judgment');
});
test('an independently reported rationale disagreement stays pending and is bound to exact assessment and receipts', () => {
  const i = input('reviewed'), assessment = assessSemanticJudgment(i, judgment);
  const issue: JudgmentReviewIssue = { schemaVersion: 'judgment-review-issue/1', itemId: i.id,
    kind: 'boolean-rationale-disagreement', reason: 'Independent reviewer requests adjudication of the rationale.', reportedBy: 'independent-critic', status: 'pending',
    inputDigest: digest(i), answerDigest: digest(i.answer), assessmentDigest: digest(assessment), ...provenance };
  const result = diagnoseAcceptanceJudgments([i], [{ id: i.id, assessment }], provenance, [issue]);
  assert.equal(result.adjudicationStatus, 'pending'); assert.equal(result.reviewIssues.length, 1);
  assert.equal(assessment.advisoryPass, true);
  assert.throws(() => diagnoseAcceptanceJudgments([i], [{ id: i.id, assessment }], provenance, [{ ...issue, answerDigest: digest('other') }]), /REVIEW_ISSUE_BINDING/);
  assert.throws(() => diagnoseAcceptanceJudgments([i], [{ id: i.id, assessment: { ...assessment, advisoryPass: false } }], provenance), /ASSESSMENT_BINDING/);
});
test('structured judge disagreement is explicit; clean assessments do not manufacture a review issue', () => {
  const i = input('structured'), inconsistent = assessSemanticJudgment(i, { ...judgment, unsupportedClaims: ['Contradiction with supportedByEvidence=true.'] });
  const result = diagnoseAcceptanceJudgments([i], [{ id: i.id, assessment: inconsistent }], provenance);
  assert.equal(result.reviewIssues[0]!.kind, 'judgment-contract-inconsistent');
  assert.equal(diagnoseAcceptanceJudgments([i], [{ id: i.id, assessment: assessSemanticJudgment(i, judgment) }], provenance).reviewIssues.length, 0);
});
