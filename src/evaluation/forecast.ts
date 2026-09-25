import { CampaignConfigSchema, type CampaignConfig, type ModelProfile } from './config.js';
import { reserveCostMicros } from '../providers/pricing.js';

export interface TrialCostForecast {
  profileId: string;
  arm: 'full' | 'retrieval' | 'compaction' | 'oracle-evidence';
  compactionRounds: number;
  totalTokenBudget: number;
  trials: number;
  maxGenerationCallsPerTrial: number;
  generationCostUpperBoundPerTrialMicros: number;
  generationCostUpperBoundMicros: number;
}

const safe = (value: number): number => {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error('FORECAST_VALUE_UNSAFE');
  return value;
};

/** Linear relaxation of a trial's cumulative token ceiling. Admission can only lower this bound. */
function trialUpperBound(config: CampaignConfig, profile: ModelProfile, budget: number, calls: number): number {
  const usable = Math.max(0, budget - config.headroomTokens);
  const outputCapacity = calls * config.maxOutputTokens;
  const inputPerCall = Math.max(0, Math.min(profile.inputTokenLimit,
    profile.modelContextLimit === undefined ? profile.inputTokenLimit
      : profile.modelContextLimit - config.maxOutputTokens - config.headroomTokens));
  const inputCapacity = calls * inputPerCall;
  const inputRate = Math.max(profile.pricing.inputPerMillionUsd, profile.pricing.cachedInputPerMillionUsd);
  let input: number, output: number;
  if (profile.pricing.outputPerMillionUsd >= inputRate) {
    output = Math.min(outputCapacity, usable); input = Math.min(inputCapacity, usable - output);
  } else {
    input = Math.min(inputCapacity, usable); output = Math.min(outputCapacity, usable - input);
  }
  // The ledger rounds every request up to USD micros, so aggregate rounding alone is insufficient.
  return safe(reserveCostMicros(input, output, profile.pricing) + calls - 1);
}

/** Read-only planning estimate. A numeric cap/config is not evidence of owner approval or model availability. */
export function forecastCampaign(configInput: CampaignConfig, caseCount: number) {
  const config = CampaignConfigSchema.parse(configInput);
  if (!Number.isSafeInteger(caseCount) || caseCount <= 0 || (config.caseIds && config.caseIds.length !== caseCount)) {
    throw new Error('FORECAST_CASE_COUNT_INVALID');
  }
  const trialsPerCell = safe(caseCount * config.repeats), rows: TrialCostForecast[] = [];
  for (const profile of config.profiles) for (const budget of config.totalTokenBudgets) {
    const arms = [
      { arm: 'full' as const, rounds: 0, densities: config.distractorLimits.length },
      { arm: 'retrieval' as const, rounds: 0, densities: config.distractorLimits.length },
      ...config.compactionRounds.map(rounds => ({ arm: 'compaction' as const, rounds, densities: config.distractorLimits.length })),
      { arm: 'oracle-evidence' as const, rounds: 0, densities: 1 },
    ];
    for (const { arm, rounds, densities } of arms) {
      const trials = safe(trialsPerCell * densities), calls = rounds + 1;
      const perTrial = trialUpperBound(config, profile, budget, calls);
      rows.push({ profileId: profile.id, arm, compactionRounds: rounds, totalTokenBudget: budget, trials,
        maxGenerationCallsPerTrial: calls, generationCostUpperBoundPerTrialMicros: perTrial,
        generationCostUpperBoundMicros: safe(perTrial * trials) });
    }
  }
  const sum = (values: readonly number[]) => safe(values.reduce((a, b) => a + b, 0));
  const maxGenerationCalls = sum(rows.map(r => r.trials * r.maxGenerationCallsPerTrial));
  const totalGenerationCostUpperBoundMicros = sum(rows.map(r => r.generationCostUpperBoundMicros));
  return {
    schemaVersion: 'semantic-campaign-forecast/1' as const,
    selectedCaseCount: caseCount,
    plannedTrials: sum(rows.filter(r => r.arm !== 'oracle-evidence').map(r => r.trials)),
    plannedControlTrials: sum(rows.filter(r => r.arm === 'oracle-evidence').map(r => r.trials)),
    maxGenerationCalls, maxCountCalls: maxGenerationCalls,
    totalGenerationCostUpperBoundMicros,
    configuredCapMicros: config.authorization.maxCostMicros,
    generationTariffFitsConfiguredCap: totalGenerationCostUpperBoundMicros <= config.authorization.maxCostMicros,
    referenceOnly: true as const, dispatchAuthorized: false as const,
    basis: 'cumulative-trial-token-ceiling-pinned-standard-tariffs-no-cache-discount' as const,
    exclusions: ['Count-endpoint charges if any', 'Taxes, external tools and provider surcharges', 'Pricing or capabilities not verified by this forecast'],
    limitations: ['Planned calls are maxima; context/token/budget admission may block earlier',
      'Per-request integer-micro rounding is included conservatively',
      'Bounds assume provider input usage matches admission counts and output respects the request limit',
      'Mock forecasts describe hypothetical provider tariffs, not mock spend'],
    rows,
  };
}
