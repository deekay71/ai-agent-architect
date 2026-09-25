import type { ModelPricing, ModelUsage } from './types.js';

const SCALE = 1_000_000_000n;

function fail(): never { throw new Error('MODEL_COST_INPUT_INVALID'); }

function tokens(value: number): bigint {
  if (!Number.isSafeInteger(value) || value < 0) return fail();
  return BigInt(value);
}

/** Decimal USD/million to a fixed nine-place integer; no floating point totals. */
function rate(value: number): bigint {
  if (!Number.isFinite(value) || value < 0 || value > 1_000_000) return fail();
  const match = /^(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/.exec(String(value));
  if (!match) return fail();
  const fraction = match[2] ?? '';
  const exponent = Number(match[3] ?? '0');
  const places = 9 + exponent - fraction.length;
  if (places < 0 || places > 30) return fail();
  return BigInt(`${match[1]}${fraction}`) * 10n ** BigInt(places);
}

export function validateModelPricing(pricing: ModelPricing): void {
  if (!pricing || typeof pricing.model !== 'string' || !pricing.model.trim() ||
      typeof pricing.source !== 'string' || !pricing.source.startsWith('https://') ||
      typeof pricing.observedAt !== 'string' || !Number.isFinite(Date.parse(pricing.observedAt))) fail();
  try {
    const source = new URL(pricing.source);
    if (source.protocol !== 'https:' || !source.hostname || source.username || source.password) fail();
  } catch { fail(); }
  rate(pricing.inputPerMillionUsd); rate(pricing.cachedInputPerMillionUsd); rate(pricing.outputPerMillionUsd);
}

export function isValidModelUsage(usage: ModelUsage): boolean {
  return usage !== null && typeof usage === 'object' &&
    [usage.inputTokens, usage.outputTokens, usage.cachedInputTokens, usage.reasoningTokens, usage.totalTokens]
    .every(value => Number.isSafeInteger(value) && value >= 0) &&
    usage.cachedInputTokens <= usage.inputTokens && usage.reasoningTokens <= usage.outputTokens &&
    usage.totalTokens === usage.inputTokens + usage.outputTokens && Number.isSafeInteger(usage.inputTokens + usage.outputTokens);
}

function micros(numerator: bigint): number {
  const rounded = (numerator + SCALE - 1n) / SCALE;
  if (rounded > BigInt(Number.MAX_SAFE_INTEGER)) return fail();
  return Number(rounded);
}

/** Standard text token tariff estimate, rounded up once to integer USD micros.
 * The caller pins the pricing model/tier and reconciles any provider surcharges.
 */
export function estimateCostMicros(usage: ModelUsage, pricing: ModelPricing): number {
  validateModelPricing(pricing);
  if (!isValidModelUsage(usage)) return fail();
  return micros(tokens(usage.inputTokens - usage.cachedInputTokens) * rate(pricing.inputPerMillionUsd) +
    tokens(usage.cachedInputTokens) * rate(pricing.cachedInputPerMillionUsd) +
    tokens(usage.outputTokens) * rate(pricing.outputPerMillionUsd));
}

/** Conservative reservation: no cache discount and every allowed output token. */
export function reserveCostMicros(inputTokens: number, maxOutputTokens: number, pricing: ModelPricing): number {
  validateModelPricing(pricing);
  // A custom cache tariff may exceed ordinary input pricing; reserve the larger.
  const inputRate = rate(Math.max(pricing.inputPerMillionUsd, pricing.cachedInputPerMillionUsd));
  return micros(tokens(inputTokens) * inputRate + tokens(maxOutputTokens) * rate(pricing.outputPerMillionUsd));
}
