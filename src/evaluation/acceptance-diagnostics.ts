import { z } from 'zod';
import { digest } from '../contracts/canonical.js';
import { scoreGatheringEvidence } from './scoring.js';
import { assessSemanticJudgment, type JudgmentInput, type parseBatchedJudgments } from './semantic-judgment.js';

const hash = z.string().regex(/^sha256:[a-f0-9]{64}$/), text = z.string().trim().min(1);
export const JudgmentReviewIssueSchema = z.strictObject({
  schemaVersion: z.literal('judgment-review-issue/1'), itemId: text,
  kind: z.enum(['boolean-rationale-disagreement', 'judgment-contract-inconsistent', 'missing-judgment']),
  reason: text, reportedBy: text, status: z.literal('pending'),
  inputDigest: hash, answerDigest: hash, assessmentDigest: hash.nullable(),
  judgmentEvidenceDigest: hash, sourcePinDigest: hash, protocolDigest: hash,
});
export type JudgmentReviewIssue = z.infer<typeof JudgmentReviewIssueSchema>;
type Provenance = Pick<JudgmentReviewIssue, 'judgmentEvidenceDigest' | 'sourcePinDigest' | 'protocolDigest'>;

/** Evaluator-only diagnosis; missing selected evidence must not be called a reader false acceptance. */
export function diagnoseAcceptanceJudgments(inputs: readonly JudgmentInput[], assessments: ReturnType<typeof parseBatchedJudgments>,
  provenance: Provenance, reportedIssues: readonly JudgmentReviewIssue[] = []) {
  if (new Set(inputs.map(i => i.id)).size !== inputs.length || new Set(assessments.map(a => a.id)).size !== assessments.length
    || assessments.some(a => !inputs.some(i => i.id === a.id))) throw Error('ACCEPTANCE_DIAGNOSTIC_COVERAGE');
  const byId = new Map(assessments.map(a => [a.id, a.assessment]));
  const rows = inputs.map(input => {
    const assessment = byId.get(input.id);
    if (assessment && digest(assessSemanticJudgment(input, assessment.judgment)) !== digest(assessment)) throw Error('ACCEPTANCE_DIAGNOSTIC_ASSESSMENT_BINDING');
    const selected = scoreGatheringEvidence(input.gold, input.documents.map(d => d.id), input.documents);
    return { id: input.id, assessed: !!assessment, gatheringFailure: selected.sufficient === false,
      dispositionFailure: !!assessment && !assessment.dispositionCorrect,
      citationFailure: !!assessment && !assessment.lexical.evidenceSatisfied,
      revisionFailure: !!assessment && !assessment.lexical.revisionCorrect,
      unsupportedAnswer: !!assessment && input.answer.disposition === 'answer'
        && (!assessment.judgment.supportedByEvidence || assessment.judgment.unsupportedClaims.length > 0),
      abstainedWithMissingEvidence: input.answer.disposition === 'abstain' && selected.sufficient === false,
      judgeApprovesAbstention: !!assessment && input.answer.disposition === 'abstain' && assessment.judgment.abstentionAppropriate,
    };
  });
  const binding = (input: JudgmentInput) => ({ inputDigest: digest(input), answerDigest: digest(input.answer),
    assessmentDigest: byId.has(input.id) ? digest(byId.get(input.id)) : null, ...provenance });
  const reviewIssues: JudgmentReviewIssue[] = inputs.flatMap(input => {
    const assessment = byId.get(input.id);
    if (assessment?.judgmentConsistent) return [];
    return [JudgmentReviewIssueSchema.parse({ schemaVersion: 'judgment-review-issue/1', itemId: input.id,
      kind: assessment ? 'judgment-contract-inconsistent' : 'missing-judgment', status: 'pending',
      reason: assessment ? 'Structured judgment fields contradict the contract.' : 'No valid complete-batch judgment exists for this input.',
      reportedBy: 'deterministic-acceptance-replay', ...binding(input) })];
  });
  for (const raw of reportedIssues) {
    const issue = JudgmentReviewIssueSchema.parse(raw), input = inputs.find(i => i.id === issue.itemId);
    if (!input || Object.entries(binding(input)).some(([key, expected]) => issue[key as keyof JudgmentReviewIssue] !== expected)) throw Error('ACCEPTANCE_REVIEW_ISSUE_BINDING');
    reviewIssues.push(issue);
  }
  return { planned: inputs.length, assessed: assessments.length, unassessed: inputs.length - assessments.length,
    counts: Object.fromEntries((['gatheringFailure', 'dispositionFailure', 'citationFailure', 'revisionFailure',
      'unsupportedAnswer', 'abstainedWithMissingEvidence', 'judgeApprovesAbstention'] as const).map(key => [key, rows.filter(row => row[key]).length])),
    reviewIssues, adjudicationStatus: reviewIssues.length ? 'pending' as const : 'not-required-by-recorded-issues' as const,
    note: 'Categories overlap. Abstention with missing selected evidence is not automatically a false accept. Rationale semantics require independent review; no prose-based automatic repair.',
  };
}
