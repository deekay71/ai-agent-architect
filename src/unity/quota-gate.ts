/** Owner authorization of 01/10: includes orchestration, never crosses reset. */
export const WALKING_SKELETON_WEEKLY_STOP = 85;
export const STEP_WEEKLY_POINTS = { 1: 2, 2: 5, 3: 6 } as const;
export const AUTHORIZED_RESET_AT = 1791343381;
export function checkWalkingSkeletonQuota(snapshot: unknown, forecastPoints: number, now = Date.now()) {
  const s = snapshot as { weeklyUsedPercent?: unknown; hardStopUsedPercent?: unknown; observedAt?: unknown; resetsAt?: unknown; step?: unknown; stepStartUsedPercent?: unknown; admissionUnit?: unknown } | null;
  const stop = (reason: string) => ({ allowed: false, reason, hardStopUsedPercent: WALKING_SKELETON_WEEKLY_STOP });
  if (!s || s.hardStopUsedPercent !== 85) return stop('quota-policy-mismatch');
  if (s.resetsAt !== AUTHORIZED_RESET_AT || now >= AUTHORIZED_RESET_AT * 1000) return stop('weekly-reset-stop');
  if (typeof s.weeklyUsedPercent !== 'number' || !Number.isFinite(s.weeklyUsedPercent) || s.weeklyUsedPercent < 0 || s.weeklyUsedPercent > 100) return stop('quota-unknown');
  const observed = typeof s.observedAt === 'string' ? Date.parse(s.observedAt) : NaN;
  if (!Number.isFinite(observed) || now - observed > 60_000 || observed > now) return stop('quota-snapshot-stale');
  if (!Number.isFinite(forecastPoints) || forecastPoints < 0) return stop('quota-forecast-unknown');
  if (![1, 2, 3, 4].includes(s.step as number) || typeof s.stepStartUsedPercent !== 'number' || !Number.isFinite(s.stepStartUsedPercent) || s.stepStartUsedPercent < 0 || s.stepStartUsedPercent > s.weeklyUsedPercent) return stop('step-budget-unknown');
  if (s.step === 4 && s.admissionUnit !== 'pair') return stop('paired-reservation-required');
  if (s.weeklyUsedPercent >= 85) return stop('weekly-hard-stop');
  if (forecastPoints > 85 - s.weeklyUsedPercent) return stop('forecast-exceeds-remaining-quota');
  if (s.step !== 4 && s.weeklyUsedPercent + forecastPoints > s.stepStartUsedPercent + STEP_WEEKLY_POINTS[s.step as 1 | 2 | 3]) return stop('step-budget-exceeded');
  return { allowed: true, reason: 'within-current-weekly-budget', hardStopUsedPercent: 85 };
}
