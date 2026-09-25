import { SemanticAnswerSchema, SemanticDocumentSchema, SemanticGoldSchema, type SemanticAnswer, type SemanticDocument, type SemanticGold } from './dataset.js';

export interface GatheringEvidenceScore {
  gatheredCount: number;
  requiredCount: number;
  requiredMatchedCount: number;
  /** All eligible supporting sources, including optional sources pinned by the oracle. */
  eligibleMatchedCount: number;
  /** Required evidence coverage; null means the case has no required evidence. */
  recall: number | null;
  /** Eligible supporting sources / distinct gathered IDs; null means nothing was gathered. */
  precision: number | null;
  /** Required evidence is present at its pinned revision; null means not applicable. */
  sufficient: boolean | null;
  missingRequiredIds: string[];
  staleIds: string[];
  revokedIds: string[];
  revisionMismatchIds: string[];
  unsupportedIds: string[];
  /** Known gathered sources that are not eligible supporting evidence. */
  ineligibleIds: string[];
  unknownIds: string[];
}

/**
 * Evaluator-only gathering score, independent of any reader response. Call after gathering
 * and reader execution; neither this score nor gold may enter model/context inputs.
 * expectedRevision is the validated oracle's in-scope supporting-source allowlist. It can
 * contain optional sources beyond requiredEvidenceIds. Sufficiency measures coverage only:
 * irrelevant extra material reduces precision without hiding complete required evidence.
 * This diagnostic never establishes reader correctness or a release gate.
 */
export function scoreGatheringEvidence(goldInput: SemanticGold, ids: readonly string[], visibleDocuments: readonly SemanticDocument[]): GatheringEvidenceScore {
  const gold = SemanticGoldSchema.parse(goldInput);
  if (ids.some(id => typeof id !== 'string' || !id.trim() || id !== id.trim())) throw new Error('Gathered evidence IDs must be nonblank canonical strings');
  const gathered = [...new Set(ids)], documents = new Map<string, SemanticDocument>();
  for (const input of visibleDocuments) {
    const document = SemanticDocumentSchema.parse(input);
    if (documents.has(document.id)) throw new Error('Gathering evidence documents contain duplicate IDs');
    documents.set(document.id, document);
  }
  const matched = new Set<string>(), staleIds: string[] = [], revokedIds: string[] = [], revisionMismatchIds: string[] = [],
    unsupportedIds: string[] = [], ineligibleIds: string[] = [], unknownIds: string[] = [];
  for (const id of gathered) {
    const document = documents.get(id);
    if (!document) { unknownIds.push(id); continue; }
    const supported = Object.hasOwn(gold.expectedRevision, id);
    if (document.freshness === 'stale') staleIds.push(id);
    if (document.lifecycle === 'revoked') revokedIds.push(id);
    if (!supported) unsupportedIds.push(id);
    const revisionMatches = supported && document.revision === gold.expectedRevision[id];
    if (supported && !revisionMatches) revisionMismatchIds.push(id);
    if (supported && revisionMatches && document.freshness === 'fresh' && document.lifecycle === 'active' && !document.distractor) matched.add(id);
    else ineligibleIds.push(id);
  }
  const missingRequiredIds = gold.requiredEvidenceIds.filter(id => !matched.has(id));
  const requiredCount = gold.requiredEvidenceIds.length, requiredMatchedCount = requiredCount - missingRequiredIds.length;
  return {
    gatheredCount: gathered.length, requiredCount, requiredMatchedCount, eligibleMatchedCount: matched.size,
    recall: requiredCount ? requiredMatchedCount / requiredCount : null,
    precision: gathered.length ? matched.size / gathered.length : null,
    sufficient: requiredCount ? missingRequiredIds.length === 0 : null,
    missingRequiredIds, staleIds, revokedIds, revisionMismatchIds, unsupportedIds, ineligibleIds, unknownIds,
  };
}

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
  // expectedRevision is a supporting-source allowlist, not a requirement to cite optional evidence.
  // Every required source and every source actually cited still needs its exact visible revision.
  const revisionBound = (id: string): boolean => Object.hasOwn(gold.expectedRevision, id)
    && answer.revisions[id] === gold.expectedRevision[id] && (!visible || visible.get(id)?.revision === gold.expectedRevision[id]);
  const revisionCorrect = gold.requiredEvidenceIds.every(id => answer.evidenceIds.includes(id) && revisionBound(id))
    && answer.evidenceIds.every(revisionBound)
    && Object.keys(answer.revisions).every(id => answer.evidenceIds.includes(id) && revisionBound(id));
  if (!revisionCorrect) reasons.push('revision-missing-stale-or-unbound');
  const constraintsPreserved = gold.expectedConstraints.every(id => answer.constraints.includes(id));
  if (!constraintsPreserved) reasons.push('required-constraint-dropped');
  const strictPass = answerCorrect && evidenceSatisfied && revisionCorrect && constraintsPreserved;
  return { answerCorrect, evidenceSatisfied, revisionCorrect, constraintsPreserved,
    falseAcceptance: answered && !strictPass, falseRejection: expectsAnswer && !answered, strictPass, reasons };
}
