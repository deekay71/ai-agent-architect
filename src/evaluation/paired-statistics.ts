import { canonicalJson } from '../contracts/canonical.js';
import type { SemanticTrial } from './campaign.js';

export interface Comparator { arm: 'retrieval' | 'compaction'; compactionRounds: number }
export interface Dimensions { profileId: string; totalTokenBudget: number; distractors: number; taskClass: string; visibleByteAllowance?: number }
export type PairableTrial = Pick<SemanticTrial, 'profileId' | 'totalTokenBudget' | 'distractors' | 'taskClass' | 'arm' | 'repeat' | 'compactionRounds' | 'caseId' | 'trialId' | 'status' | 'score'> & { visibleByteAllowance?: number };
const key = (value: unknown) => canonicalJson(value);
const systemBlockedStatuses = ['context-blocked', 'token-budget-blocked', 'model-context-blocked'] as const;
const mean = (values: readonly number[]): number | null => values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;

/** Conditional reader diagnostics only. Planned matrix coverage and acceptance remain separate responsibilities. */
export function summarizePairedTrials(trials: readonly PairableTrial[], additionalBlockedStatuses: readonly string[] = []) {
  const statuses = [...systemBlockedStatuses, ...additionalBlockedStatuses];
  const blocked = (trial: PairableTrial | undefined) => trial !== undefined && statuses.includes(trial.status);
  const dimensions = new Map<string, { value: Dimensions; arms: Map<string, Map<string, PairableTrial>> }>();
  const comparators = new Map<string, Comparator>();
  const baselineKey = key(['full', 0]);
  let comparisonTrials = 0, excludedControlTrials = 0;
  for (const trial of trials) {
    if (trial.arm === 'oracle-evidence') { excludedControlTrials++; continue; }
    if (!Number.isSafeInteger(trial.repeat) || trial.repeat < 0 ||
        !Number.isSafeInteger(trial.compactionRounds) || trial.compactionRounds < 0 ||
        (trial.arm !== 'compaction' && trial.compactionRounds !== 0) ||
        (trial.arm === 'compaction' && trial.compactionRounds === 0)) throw new Error('PAIRED_TRIAL_DIMENSION_INVALID');
    comparisonTrials++;
    const value = { profileId: trial.profileId, totalTokenBudget: trial.totalTokenBudget, distractors: trial.distractors, taskClass: trial.taskClass,
      ...(trial.visibleByteAllowance === undefined ? {} : { visibleByteAllowance: trial.visibleByteAllowance }) };
    const dimensionKey = key(value), armKey = key([trial.arm, trial.compactionRounds]);
    if (trial.arm !== 'full') comparators.set(armKey, { arm: trial.arm, compactionRounds: trial.compactionRounds });
    let group = dimensions.get(dimensionKey);
    if (!group) { group = { value, arms: new Map() }; dimensions.set(dimensionKey, group); }
    let arm = group.arms.get(armKey);
    if (!arm) { arm = new Map(); group.arms.set(armKey, arm); }
    const pairKey = key([trial.caseId, trial.repeat]);
    if (arm.has(pairKey)) throw new Error('PAIRED_DUPLICATE_TRIAL_KEY');
    arm.set(pairKey, trial);
  }
  const groups = [...dimensions.entries()].sort(([a], [b]) => a.localeCompare(b)).flatMap(([, group]) =>
    [...comparators.entries()].sort(([a], [b]) => a.localeCompare(b)).flatMap(([armKey, comparator]) => {
      const baseline = group.arms.get(baselineKey) ?? new Map<string, PairableTrial>();
      const candidate = group.arms.get(armKey) ?? new Map<string, PairableTrial>();
      if (!baseline.size && !candidate.size) return [];
      const pairKeys = [...new Set([...baseline.keys(), ...candidate.keys()])].sort();
      const pairs = pairKeys.map(pairKey => {
        const base = baseline.get(pairKey), other = candidate.get(pairKey), identity = base ?? other!;
        const bothScored = base?.score !== null && base?.score !== undefined && other?.score !== null && other?.score !== undefined;
        return { caseId: identity.caseId, repeat: identity.repeat, baselineTrialId: base?.trialId ?? null,
          comparatorTrialId: other?.trialId ?? null, baselinePresent: base !== undefined, comparatorPresent: other !== undefined,
          baselineStatus: base?.status ?? null, comparatorStatus: other?.status ?? null,
          baselineScored: base?.score !== null && base?.score !== undefined,
          comparatorScored: other?.score !== null && other?.score !== undefined,
          baselineSystemBlocked: blocked(base), comparatorSystemBlocked: blocked(other),
          baselineStrictPass: bothScored ? base!.score!.strictPass : null,
          comparatorStrictPass: bothScored ? other!.score!.strictPass : null,
          readerDelta: bothScored ? Number(other!.score!.strictPass) - Number(base!.score!.strictPass) : null };
      });
      const scored = pairs.filter(p => p.readerDelta !== null);
      const caseIds = [...new Set(scored.map(p => p.caseId))].sort();
      const pairedCaseDeltas = caseIds.map(caseId => {
        const samples = scored.filter(p => p.caseId === caseId);
        return { caseId, pairedRepeats: samples.length,
          baselineStrictPassRate: mean(samples.map(p => Number(p.baselineStrictPass)))!,
          comparatorStrictPassRate: mean(samples.map(p => Number(p.comparatorStrictPass)))!,
          delta: mean(samples.map(p => p.readerDelta!))! };
      });
      return [{ dimensions: { ...group.value, comparator },
        observedPairKeys: pairs.length, observedUniqueCaseCount: new Set(pairs.map(p => p.caseId)).size,
        completePairs: pairs.filter(p => p.baselinePresent && p.comparatorPresent).length,
        missingBaselinePairs: pairs.filter(p => !p.baselinePresent).length,
        missingComparatorPairs: pairs.filter(p => !p.comparatorPresent).length,
        scoredPairs: scored.length,
        unscoredCompletePairs: pairs.filter(p => p.baselinePresent && p.comparatorPresent && p.readerDelta === null).length,
        baselinePresentUnscored: pairs.filter(p => p.baselinePresent && !p.baselineScored).length,
        comparatorPresentUnscored: pairs.filter(p => p.comparatorPresent && !p.comparatorScored).length,
        systemBlockedPairs: pairs.filter(p => p.baselineSystemBlocked || p.comparatorSystemBlocked).length,
        baselineSystemBlockedTrials: pairs.filter(p => p.baselineSystemBlocked).length,
        comparatorSystemBlockedTrials: pairs.filter(p => p.comparatorSystemBlocked).length,
        uniqueCaseCount: pairedCaseDeltas.length,
        caseWeightedReaderDelta: mean(pairedCaseDeltas.map(c => c.delta)),
        caseWeightedBaselineStrictPassRate: mean(pairedCaseDeltas.map(c => c.baselineStrictPassRate)),
        caseWeightedComparatorStrictPassRate: mean(pairedCaseDeltas.map(c => c.comparatorStrictPassRate)),
        interval: null, intervalReason: 'Authored cases are not a random population sample; an acceptance uncertainty protocol is not frozen',
        pairedCaseDeltas, pairs }];
    }));
  return { schemaVersion: 'semantic-paired-diagnostics/1' as const, interpretation: 'descriptive-only' as const,
    acceptanceDecision: null, comparisonTrials, excludedControlTrials, observedComparatorCount: comparators.size,
    denominator: 'Both reader outputs scored; repeats averaged within each unique case, then cases equally weighted' as const,
    systemBlockedStatuses: statuses,
    limitations: ['Missing/unscored/system-blocked counts are overlapping diagnostics, not mutually exclusive outcomes',
      'Entirely absent comparator arms or cases cannot be inferred from observed trials; use planned matrix coverage',
      'Evaluator strictPass is a diagnostic score, not an independent semantic truth label or phase acceptance'], groups };
}
