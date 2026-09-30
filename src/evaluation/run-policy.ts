import { z } from 'zod';

export const ModelRunPolicySchema = z.strictObject({
  schemaVersion: z.literal('weighted-model-run-policy/1'),
  approvalThreshold: z.literal(300000), devCap: z.literal(1500000), phaseAcceptanceCap: z.literal(3000000),
  weights: z.strictObject({ terra: z.literal(1), sol: z.number().positive().nullable(), astra: z.literal(5) }),
});
export type ModelRunPolicy = z.infer<typeof ModelRunPolicySchema>;
export interface ModelRunForecast {
  purpose: 'dev' | 'phase-acceptance'; cases: number; calls: number;
  /** Include the input, output and every allowed retry in each family's reserve. */
  tokens: { terra: number; sol: number; astra: number };
  decision: string;
  weeklyQuotaPercent: number | null;
  weeklyQuotaBasis: string;
}
export function reviewModelRun(policyInput: ModelRunPolicy, forecast: ModelRunForecast) {
  const policy = ModelRunPolicySchema.parse(policyInput);
  if (!Number.isSafeInteger(forecast.cases) || forecast.cases < 1 || !Number.isSafeInteger(forecast.calls) || forecast.calls < 1
    || !forecast.decision.trim() || !forecast.weeklyQuotaBasis.trim()
    || Object.values(forecast.tokens).some(value => !Number.isSafeInteger(value) || value < 0)
    || (forecast.weeklyQuotaPercent !== null && (!Number.isFinite(forecast.weeklyQuotaPercent) || forecast.weeklyQuotaPercent < 0))) throw Error('MODEL_FORECAST_INVALID');
  if (forecast.tokens.sol > 0 && policy.weights.sol === null) throw Error('SOL_WEIGHT_REQUIRED');
  const rawTokens = forecast.tokens.terra + forecast.tokens.sol + forecast.tokens.astra;
  const weightedTokens = forecast.tokens.terra + forecast.tokens.sol * (policy.weights.sol ?? 0) + forecast.tokens.astra * 5;
  const cap = forecast.purpose === 'dev' ? policy.devCap : policy.phaseAcceptanceCap;
  return { ...forecast, rawTokens, weightedTokens, cap, withinCap: weightedTokens <= cap,
    approvalRequired: weightedTokens > policy.approvalThreshold, quotaIsExact: false };
}

export function requireModelRunAdmission(policy: ModelRunPolicy, forecast: ModelRunForecast,
  approval?: { reference: string; maxWeightedTokens: number }) {
  const review = reviewModelRun(policy, forecast);
  if (!review.withinCap) throw Error('MODEL_RUN_SCOPE_CAP_EXCEEDED');
  if (review.approvalRequired && (!approval?.reference.trim() || approval.maxWeightedTokens < review.weightedTokens)) throw Error('MODEL_RUN_USER_APPROVAL_REQUIRED');
  return review;
}
