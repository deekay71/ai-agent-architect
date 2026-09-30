import { z } from 'zod';

/** Current planning estimates only; historical weighted-token receipts retain their original policy. */
export const MODEL_CREDIT_RATES = {
  'gpt-5.6-terra': { uncachedInput: 50, cachedInput: 5, output: 300 },
  'gpt-6-sol': { uncachedInput: 50, cachedInput: 5, output: 250 },
  'gpt-6-astra': { uncachedInput: 250, cachedInput: 25, output: 1250 },
} as const;
export const CreditModelSchema = z.enum(['gpt-5.6-terra', 'gpt-6-sol', 'gpt-6-astra']);
const tokens = z.number().int().nonnegative().safe().nullable();
export const ModelCreditUsageSchema = z.strictObject({
  model: CreditModelSchema, inputTokens: tokens, cachedInputTokens: tokens, outputTokens: tokens,
}).superRefine((usage, ctx) => {
  if (usage.inputTokens !== null && usage.cachedInputTokens !== null && usage.cachedInputTokens > usage.inputTokens)
    ctx.addIssue({ code: 'custom', path: ['cachedInputTokens'], message: 'Cached input is a subset of total input' });
});
export type ModelCreditUsage = z.infer<typeof ModelCreditUsageSchema>;

/** Integer millionths of a credit; null means at least one required count is unknown. */
export function creditMicrosForUsage(usage: readonly ModelCreditUsage[]): number | null {
  let total = 0;
  for (const row of usage) {
    const parsed = ModelCreditUsageSchema.parse(row);
    if (parsed.inputTokens === null || parsed.cachedInputTokens === null || parsed.outputTokens === null) return null;
    const rate = MODEL_CREDIT_RATES[parsed.model];
    const next = (parsed.inputTokens - parsed.cachedInputTokens) * rate.uncachedInput
      + parsed.cachedInputTokens * rate.cachedInput + parsed.outputTokens * rate.output;
    if (!Number.isSafeInteger(next) || !Number.isSafeInteger(total + next)) throw Error('CREDIT_ESTIMATE_OVERFLOW');
    total += next;
  }
  return total;
}
