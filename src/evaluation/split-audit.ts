import { digest } from '../contracts/canonical.js';
import type { SemanticCase } from './dataset.js';

/** A lexical leakage screen, not a semantic-independence or human-review certificate. */
export const SEMANTIC_SPLIT_AUDIT_POLICY = Object.freeze({
  version: 'semantic-split-audit/1' as const,
  normalization: 'NFKC + lowercase + Unicode letter/number tokens' as const,
  similarity: 'set Dice over tokens and adjacent token bigrams' as const,
  minimumNearQuestionTokens: 6,
  minimumNearHistoryTokens: 6,
  nearQuestionTokenDice: 0.85,
  nearQuestionBigramDice: 0.65,
  nearHistoryBigramDice: 0.85,
  reviewQuestionTokenDice: 0.65,
  reviewQuestionBigramDice: 0.35,
  reviewHistoryBigramDice: 0.5,
});

export interface SplitSuspectedPair {
  devCaseId: string;
  holdoutCaseId: string;
  classification: 'exact-clone' | 'near-clone' | 'semantic-review';
  questionExact: boolean;
  historyExact: boolean;
  questionSimilarity: { tokenDice: number; bigramDice: number };
  historySimilarity: { tokenDice: number; bigramDice: number };
}
export interface SemanticSplitAudit {
  policy: typeof SEMANTIC_SPLIT_AUDIT_POLICY;
  publicCaseDigest: string;
  status: 'clear' | 'review-required' | 'rejected';
  comparedPairs: number;
  suspectedPairs: SplitSuspectedPair[];
  humanSemanticReviewRequired: true;
  auditDigest: string;
}

function tokens(value: string): string[] {
  return value.normalize('NFKC').toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
}
function bigrams(words: string[]): Set<string> {
  return new Set(words.slice(1).map((word, index) => `${words[index]}\u0000${word}`));
}
function dice(left: Set<string>, right: Set<string>): number {
  if (!left.size || !right.size) return 0;
  const common = [...left].filter(value => right.has(value)).length;
  return (2 * common) / (left.size + right.size);
}
function fingerprint(value: string): { normalized: string; count: number; words: Set<string>; bigrams: Set<string> } {
  const words = tokens(value);
  return { normalized: words.join(' '), count: words.length, words: new Set(words), bigrams: bigrams(words) };
}
function rounded(value: number): number { return Math.round(value * 1_000_000) / 1_000_000; }

/**
 * Uses only public question/history prose. IDs are diagnostic labels, never similarity features;
 * family, query, shared constraints, source IDs, and evaluator answers do not affect matching.
 * Exact normalized copies and conservative near copies reject; broader overlap is advisory.
 * Unrelated wording can express the same scenario and escape this screen: human review remains required.
 */
export function auditSemanticSplits(cases: readonly SemanticCase[]): SemanticSplitAudit {
  const policy = SEMANTIC_SPLIT_AUDIT_POLICY;
  const indexed = cases.map(c => ({ c, question: fingerprint(c.question), history: fingerprint(c.history) }));
  const dev = indexed.filter(x => x.c.split === 'dev'), holdout = indexed.filter(x => x.c.split === 'holdout');
  const suspectedPairs: SplitSuspectedPair[] = [];
  for (const left of dev) for (const right of holdout) {
    const questionExact = left.question.normalized.length > 0 && left.question.normalized === right.question.normalized;
    const historyExact = left.history.normalized === right.history.normalized;
    const qt = dice(left.question.words, right.question.words), qb = dice(left.question.bigrams, right.question.bigrams);
    const ht = dice(left.history.words, right.history.words), hb = dice(left.history.bigrams, right.history.bigrams);
    const sufficientlyLong = left.question.count >= policy.minimumNearQuestionTokens && right.question.count >= policy.minimumNearQuestionTokens;
    const comparableHistory = historyExact || (left.history.count >= policy.minimumNearHistoryTokens
      && right.history.count >= policy.minimumNearHistoryTokens && hb >= policy.nearHistoryBigramDice);
    let classification: SplitSuspectedPair['classification'] | undefined;
    if (questionExact && historyExact) classification = 'exact-clone';
    else if (sufficientlyLong && qt >= policy.nearQuestionTokenDice && qb >= policy.nearQuestionBigramDice
      && comparableHistory) classification = 'near-clone';
    else if (questionExact || (qt >= policy.reviewQuestionTokenDice && qb >= policy.reviewQuestionBigramDice
      && hb >= policy.reviewHistoryBigramDice)) classification = 'semantic-review';
    if (classification) suspectedPairs.push({
      devCaseId: left.c.id, holdoutCaseId: right.c.id, classification, questionExact, historyExact,
      questionSimilarity: { tokenDice: rounded(qt), bigramDice: rounded(qb) },
      historySimilarity: { tokenDice: rounded(ht), bigramDice: rounded(hb) },
    });
  }
  suspectedPairs.sort((a, b) => a.devCaseId < b.devCaseId ? -1 : a.devCaseId > b.devCaseId ? 1
    : a.holdoutCaseId < b.holdoutCaseId ? -1 : a.holdoutCaseId > b.holdoutCaseId ? 1 : 0);
  const body = {
    policy: { ...policy }, publicCaseDigest: digest(cases),
    status: suspectedPairs.some(p => p.classification !== 'semantic-review') ? 'rejected' as const
      : suspectedPairs.length ? 'review-required' as const : 'clear' as const,
    comparedPairs: dev.length * holdout.length, suspectedPairs, humanSemanticReviewRequired: true as const,
  };
  return { ...body, auditDigest: digest(body) };
}
