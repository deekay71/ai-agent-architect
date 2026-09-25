import test from 'node:test';
import assert from 'node:assert/strict';
import type { SemanticTrial } from '../src/evaluation/campaign.js';
import type { SemanticScore } from '../src/evaluation/scoring.js';
import { summarizePairedTrials } from '../src/evaluation/paired-statistics.js';

function trial(arm: SemanticTrial['arm'], caseId: string, strictPass: boolean | null, extra: Partial<SemanticTrial> = {}): SemanticTrial {
  const score: SemanticScore | null = strictPass === null ? null : {
    answerCorrect: strictPass, evidenceSatisfied: true, revisionCorrect: true, constraintsPreserved: true,
    falseAcceptance: false, falseRejection: !strictPass, strictPass, reasons: [],
  };
  return { trialId: `${caseId}-${arm}-${extra.repeat ?? 0}`, caseId, family: caseId, taskClass: 'read-only', split: 'dev',
    profileId: 'profile', role: 'executor', model: 'fixture', arm, compactionRounds: arm === 'compaction' ? 1 : 0,
    distractors: 0, totalTokenBudget: 8192, repeat: 0, status: strictPass === null ? 'malformed-answer' : 'completed',
    calls: [], unitsUsed: 0, providerTokens: null, costMicros: null, latencyMs: 0, windowDigests: [],
    selectedIds: [], eligibleIds: [], retrievedIds: [], eligibleInputDigest: 'fixture', actualDistractors: 0,
    canonicalPreserved: true, answer: null, answerDigest: null, score, gathering: null,
    evaluatorAnswerability: 'answerable', ...extra };
}

test('paired diagnostic keeps missing counterparts and unscored pairs visible', () => {
  const result = summarizePairedTrials([
    trial('full', 'matched', true), trial('retrieval', 'matched', false),
    trial('full', 'only-full', true), trial('retrieval', 'only-retrieval', true),
    trial('full', 'unscored', true), trial('retrieval', 'unscored', null),
  ]);
  const group = result.groups[0]!;
  assert.equal(group.observedPairKeys, 4); assert.equal(group.completePairs, 2);
  assert.equal(group.missingBaselinePairs, 1); assert.equal(group.missingComparatorPairs, 1);
  assert.equal(group.scoredPairs, 1); assert.equal(group.unscoredCompletePairs, 1);
  assert.equal(group.comparatorPresentUnscored, 1); assert.equal(group.uniqueCaseCount, 1);
  assert.equal(group.observedUniqueCaseCount, 4); assert.equal(group.caseWeightedReaderDelta, -1);
  assert.equal(result.acceptanceDecision, null); assert.equal(group.interval, null);
});

test('repeats are averaged within each case rather than counted as independent cases', () => {
  const values: SemanticTrial[] = [];
  for (let repeat = 0; repeat < 4; repeat++) {
    values.push(trial('full', 'repeated', false, { repeat }), trial('retrieval', 'repeated', true, { repeat }));
  }
  values.push(trial('full', 'single', true), trial('retrieval', 'single', false));
  const group = summarizePairedTrials(values).groups[0]!;
  assert.equal(group.scoredPairs, 5); assert.equal(group.uniqueCaseCount, 2);
  assert.equal(group.caseWeightedReaderDelta, 0);
  assert.equal(group.caseWeightedBaselineStrictPassRate, .5); assert.equal(group.caseWeightedComparatorStrictPassRate, .5);
  assert.deepEqual(group.pairedCaseDeltas.map(c => [c.caseId, c.pairedRepeats, c.delta]), [['repeated', 4, 1], ['single', 1, -1]]);
});

test('matching is exact on case and repeat without pairing different repeated attempts', () => {
  const group = summarizePairedTrials([trial('full', 'case', true, { repeat: 0 }),
    trial('retrieval', 'case', true, { repeat: 1 })]).groups[0]!;
  assert.equal(group.observedPairKeys, 2); assert.equal(group.completePairs, 0);
  assert.equal(group.missingBaselinePairs, 1); assert.equal(group.missingComparatorPairs, 1);
  assert.equal(group.uniqueCaseCount, 0); assert.equal(group.caseWeightedReaderDelta, null);
});

test('profile budget density task class and compaction depth never cross comparison groups', () => {
  const values: SemanticTrial[] = [];
  for (const extra of [{}, { profileId: 'another' }, { totalTokenBudget: 16384 }, { distractors: 8 }, { taskClass: 'other' }]) {
    values.push(trial('full', 'case', true, extra), trial('retrieval', 'case', true, extra),
      trial('compaction', 'case', false, extra), trial('compaction', 'case', true, { ...extra, compactionRounds: 3 }));
  }
  const result = summarizePairedTrials(values);
  assert.equal(result.groups.length, 15); assert.equal(result.observedComparatorCount, 3);
  assert.ok(result.groups.every(g => g.completePairs === 1));
  assert.ok(result.groups.filter(g => g.dimensions.comparator.compactionRounds === 1).every(g => g.caseWeightedReaderDelta === -1));
  assert.ok(result.groups.filter(g => g.dimensions.comparator.compactionRounds === 3).every(g => g.caseWeightedReaderDelta === 0));
});

test('G controls never supply a missing baseline or influence the reader delta', () => {
  const result = summarizePairedTrials([trial('retrieval', 'case', false), trial('oracle-evidence', 'case', true)]);
  assert.equal(result.comparisonTrials, 1); assert.equal(result.excludedControlTrials, 1);
  assert.equal(result.groups[0]!.missingBaselinePairs, 1); assert.equal(result.groups[0]!.scoredPairs, 0);
});

test('asymmetric system blocks retain their side and cannot become correct reader abstention', () => {
  const group = summarizePairedTrials([
    trial('full', 'context', null, { status: 'context-blocked' }), trial('retrieval', 'context', true),
    trial('full', 'token', true), trial('retrieval', 'token', null, { status: 'token-budget-blocked' }),
    trial('full', 'refusal', true), trial('retrieval', 'refusal', null, { status: 'refused' }),
  ]).groups[0]!;
  assert.equal(group.systemBlockedPairs, 2);
  assert.equal(group.baselineSystemBlockedTrials, 1); assert.equal(group.comparatorSystemBlockedTrials, 1);
  assert.equal(group.unscoredCompletePairs, 3); assert.equal(group.scoredPairs, 0);
  assert.equal(group.caseWeightedReaderDelta, null); assert.equal(group.uniqueCaseCount, 0);
});

test('asymmetric model context admission blocks remain system failures rather than reader scores', () => {
  const result = summarizePairedTrials([
    trial('full', 'baseline-capacity', null, { status: 'model-context-blocked' }), trial('retrieval', 'baseline-capacity', true),
    trial('full', 'comparator-capacity', true), trial('retrieval', 'comparator-capacity', null, { status: 'model-context-blocked' }),
  ]);
  const group = result.groups[0]!;
  assert.equal(group.systemBlockedPairs, 2);
  assert.equal(group.baselineSystemBlockedTrials, 1); assert.equal(group.comparatorSystemBlockedTrials, 1);
  assert.equal(group.unscoredCompletePairs, 2); assert.equal(group.scoredPairs, 0);
  assert.equal(group.caseWeightedReaderDelta, null); assert.equal(group.uniqueCaseCount, 0);
  assert.ok(result.systemBlockedStatuses.includes('model-context-blocked'));
  assert.equal(result.acceptanceDecision, null);
});

test('duplicate comparison trial identities throw rather than silently overwriting a failed attempt', () => {
  for (const arm of ['full', 'retrieval', 'compaction'] as const) {
    assert.throws(() => summarizePairedTrials([trial(arm, 'case', true), trial(arm, 'case', false, { trialId: 'replacement' })]),
      /PAIRED_DUPLICATE_TRIAL_KEY/);
  }
});

test('comparator observed elsewhere exposes an absent counterpart in a baseline-only group', () => {
  const result = summarizePairedTrials([trial('full', 'case', true),
    trial('full', 'case', true, { totalTokenBudget: 16384 }), trial('compaction', 'case', true, { totalTokenBudget: 16384 })]);
  const missing = result.groups.find(g => g.dimensions.totalTokenBudget === 8192)!;
  assert.equal(missing.missingComparatorPairs, 1); assert.equal(missing.scoredPairs, 0);
});

test('empty input and entirely absent comparator arms do not manufacture comparison evidence', () => {
  assert.deepEqual(summarizePairedTrials([]).groups, []);
  const result = summarizePairedTrials([trial('full', 'case', true)]);
  assert.equal(result.comparisonTrials, 1); assert.equal(result.observedComparatorCount, 0);
  assert.deepEqual(result.groups, []);
  assert.ok(result.limitations.some(x => x.includes('Entirely absent')));
});

test('nonintegral repeat indexes and invalid arm depths are rejected', () => {
  assert.throws(() => summarizePairedTrials([trial('full', 'case', true, { repeat: .5 })]), /PAIRED_TRIAL_DIMENSION_INVALID/);
  assert.throws(() => summarizePairedTrials([trial('retrieval', 'case', true, { compactionRounds: 1 })]), /PAIRED_TRIAL_DIMENSION_INVALID/);
  assert.throws(() => summarizePairedTrials([trial('compaction', 'case', true, { compactionRounds: 0 })]), /PAIRED_TRIAL_DIMENSION_INVALID/);
});
