import { z } from 'zod';
import { creditMicrosForUsage, MODEL_CREDIT_RATES, ModelCreditUsageSchema } from '../contracts/credit-usage.js';

const nonblank = z.string().min(1).refine(value => value.trim().length > 0);
const count = z.number().int().nonnegative().safe();
export const CreditRunPolicySchema = z.strictObject({
  schemaVersion: z.literal('model-credit-run-policy/1'),
  pricingVersion: z.literal('codex-model-credits-2026-09-30/1'),
  ratesPerMillion: z.strictObject({
    'gpt-5.6-terra': z.strictObject({ uncachedInput: z.literal(50), cachedInput: z.literal(5), output: z.literal(300) }),
    'gpt-6-sol': z.strictObject({ uncachedInput: z.literal(50), cachedInput: z.literal(5), output: z.literal(250) }),
    'gpt-6-astra': z.strictObject({ uncachedInput: z.literal(250), cachedInput: z.literal(25), output: z.literal(1250) }),
  }),
  approvalRawTokenThreshold: z.literal(300_000),
  devWeeklyQuotaPercentCap: z.literal(5),
  phaseWeeklyQuotaPercentCap: z.literal(10),
});
export type CreditRunPolicy = z.infer<typeof CreditRunPolicySchema>;
export const CURRENT_CREDIT_RUN_POLICY: CreditRunPolicy = {
  schemaVersion: 'model-credit-run-policy/1', pricingVersion: 'codex-model-credits-2026-09-30/1', approvalRawTokenThreshold: 300_000,
  ratesPerMillion: MODEL_CREDIT_RATES, devWeeklyQuotaPercentCap: 5, phaseWeeklyQuotaPercentCap: 10,
};
export const WeeklyQuotaCalibrationSchema = z.strictObject({
  estimatedWeeklyCreditAllowance: z.number().positive().finite(),
  alreadySpentCreditsForPurpose: z.number().nonnegative().finite(),
  sourceRef: nonblank, observedAt: z.iso.datetime({ offset: true }),
  estimationMethod: nonblank,
});
export const CreditRunForecastSchema = z.strictObject({
  purpose: z.enum(['dev', 'phase-acceptance']), cases: count.positive(), calls: count.positive(),
  usage: z.array(ModelCreditUsageSchema).min(1), decision: nonblank,
  quotaCalibration: WeeklyQuotaCalibrationSchema.nullable(),
}).refine(value => new Set(value.usage.map(row => row.model)).size === value.usage.length,
  'Aggregate usage must contain each model at most once');
export type CreditRunForecast = z.infer<typeof CreditRunForecastSchema>;
export interface CreditRunApproval { reference: string; maxRawTokens: number }

export function reviewCreditRun(policyInput: CreditRunPolicy, forecastInput: CreditRunForecast) {
  const policy = CreditRunPolicySchema.parse(policyInput), forecast = CreditRunForecastSchema.parse(forecastInput);
  let rawTokens = 0;
  for (const row of forecast.usage) {
    if (row.inputTokens === null || row.outputTokens === null) { rawTokens = -1; break; }
    const next = rawTokens + row.inputTokens + row.outputTokens;
    if (!Number.isSafeInteger(next)) throw Error('CREDIT_RAW_TOKEN_OVERFLOW');
    rawTokens = next;
  }
  const rawTotal = rawTokens < 0 ? null : rawTokens;
  const creditMicros = creditMicrosForUsage(forecast.usage);
  const estimatedCredits = creditMicros === null ? null : creditMicros / 1_000_000;
  const calibration = forecast.quotaCalibration;
  const estimatedRunQuotaPercent = estimatedCredits === null || calibration === null ? null
    : estimatedCredits / calibration.estimatedWeeklyCreditAllowance * 100;
  const projectedPurposeQuotaPercent = estimatedCredits === null || calibration === null ? null
    : (calibration.alreadySpentCreditsForPurpose + estimatedCredits) / calibration.estimatedWeeklyCreditAllowance * 100;
  if (estimatedRunQuotaPercent !== null && (!Number.isFinite(estimatedRunQuotaPercent) || !Number.isFinite(projectedPurposeQuotaPercent)))
    throw Error('CREDIT_QUOTA_ESTIMATE_OVERFLOW');
  const quotaCapPercent = forecast.purpose === 'dev' ? policy.devWeeklyQuotaPercentCap : policy.phaseWeeklyQuotaPercentCap;
  return { forecast, rawTokens: rawTotal, creditMicros, estimatedCredits, estimatedRunQuotaPercent,
    projectedPurposeQuotaPercent, quotaCapPercent, withinQuota: projectedPurposeQuotaPercent === null ? null : projectedPurposeQuotaPercent <= quotaCapPercent,
    approvalRequired: rawTotal === null ? null : rawTotal > policy.approvalRawTokenThreshold,
    quotaIsExact: false as const };
}

/** No dispatch when usage or weekly-quota calibration is missing. */
export function requireCreditRunAdmission(policy: CreditRunPolicy, forecast: CreditRunForecast, approval?: CreditRunApproval) {
  const review = reviewCreditRun(policy, forecast);
  if (review.rawTokens === null || review.estimatedCredits === null || review.withinQuota === null) throw Error('MODEL_CREDIT_ESTIMATE_UNKNOWN');
  if (!review.withinQuota) throw Error('MODEL_WEEKLY_QUOTA_CAP_EXCEEDED');
  if (review.approvalRequired && (!approval?.reference.trim() || !Number.isSafeInteger(approval.maxRawTokens)
    || approval.maxRawTokens < review.rawTokens)) throw Error('MODEL_RAW_TOKEN_APPROVAL_REQUIRED');
  return review;
}
