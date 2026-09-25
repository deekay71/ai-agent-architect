import { SemanticAnswerSchema, SemanticGoldSchema, type SemanticAnswer, type SemanticDocument, type SemanticGold } from './dataset.js';

export interface SemanticScore {
  answerCorrect: boolean;
  evidenceSatisfied: boolean;
  revisionCorrect: boolean;
  constraintsPreserved: boolean;
  falseAcceptance: boolean;
  falseRejection: boolean;
  strictPass: boolean;
  reasons: string[];
}

// Deliberately conservative equivalence: enumerated alternatives, typography and case only.
// This does not claim that lexical matching establishes general semantic correctness.
function normalize(value: string): string {
  return value.normalize('NFKC').trim().toLowerCase().replace(/[“”]/g, '"').replace(/[‘’]/g, "'")
    .replace(/\s+/g, ' ').replace(/[.!?]+$/, '');
}

export function scoreSemanticAnswer(goldInput: SemanticGold, answerInput: SemanticAnswer, visibleDocuments?: readonly SemanticDocument[]): SemanticScore {
  const gold = SemanticGoldSchema.parse(goldInput), parsed = SemanticAnswerSchema.safeParse(answerInput);
  const expectsAnswer = gold.answerability === 'answerable';
  if (!parsed.success) return { answerCorrect: false, evidenceSatisfied: false, revisionCorrect: false,
    constraintsPreserved: false, falseAcceptance: answerInput?.disposition === 'answer',
    falseRejection: expectsAnswer && answerInput?.disposition === 'abstain', strictPass: false, reasons: ['malformed-answer'] };
  const answer = parsed.data, answered = answer.disposition === 'answer', reasons: string[] = [];
  const answerCorrect = expectsAnswer
    ? answered && answer.answer !== null && gold.acceptableAlternatives.some(a => normalize(a) === normalize(answer.answer!))
    : !answered && answer.answer === null;
  if (!answerCorrect) reasons.push(expectsAnswer ? 'answer-missing-or-not-an-accepted-alternative' : `${gold.answerability}-requires-abstention`);
  const visible = visibleDocuments === undefined ? undefined : new Map(visibleDocuments.map(d => [d.id, d]));
  const validCitation = (id: string): boolean => {
    if (!Object.hasOwn(gold.expectedRevision, id)) return false;
    if (!visible) return true;
    const doc = visible.get(id);
    return doc !== undefined && doc.lifecycle === 'active' && doc.freshness === 'fresh' && !doc.distractor;
  };
  const evidenceSatisfied = gold.requiredEvidenceIds.every(id => answer.evidenceIds.includes(id)) && answer.evidenceIds.every(validCitation);
  if (!evidenceSatisfied) reasons.push('required-evidence-missing-or-citation-ineligible');
  const revisionCorrect = Object.entries(gold.expectedRevision).every(([id, revision]) =>
    answer.evidenceIds.includes(id) && answer.revisions[id] === revision && (!visible || visible.get(id)?.revision === revision))
    && Object.keys(answer.revisions).every(id => answer.evidenceIds.includes(id) && answer.revisions[id] === gold.expectedRevision[id]);
  if (!revisionCorrect) reasons.push('revision-missing-stale-or-unbound');
  const constraintsPreserved = gold.expectedConstraints.every(id => answer.constraints.includes(id));
  if (!constraintsPreserved) reasons.push('required-constraint-dropped');
  const strictPass = answerCorrect && evidenceSatisfied && revisionCorrect && constraintsPreserved;
  return { answerCorrect, evidenceSatisfied, revisionCorrect, constraintsPreserved,
    falseAcceptance: answered && !strictPass, falseRejection: expectsAnswer && !answered, strictPass, reasons };
}
