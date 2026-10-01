/** Current owner limit, in absolute weekly percentage points, including orchestration. */
export const WALKING_SKELETON_WEEKLY_STOP = 47;
export function checkWalkingSkeletonQuota(snapshot: unknown, forecastPoints: number, now = Date.now()) {
  const s = snapshot as { weeklyUsedPercent?: unknown; hardStopUsedPercent?: unknown; observedAt?: unknown } | null;
  const stop = (reason: string) => ({ allowed: false, reason, hardStopUsedPercent: WALKING_SKELETON_WEEKLY_STOP });
  if (!s || s.hardStopUsedPercent !== WALKING_SKELETON_WEEKLY_STOP) return stop('quota-policy-mismatch');
  if (typeof s.weeklyUsedPercent !== 'number' || !Number.isFinite(s.weeklyUsedPercent) || s.weeklyUsedPercent < 0 || s.weeklyUsedPercent > 100) return stop('quota-unknown');
  const observed = typeof s.observedAt === 'string' ? Date.parse(s.observedAt) : NaN;
  if (!Number.isFinite(observed) || now - observed > 60_000 || observed > now) return stop('quota-snapshot-stale');
  if (!Number.isFinite(forecastPoints) || forecastPoints < 0) return stop('quota-forecast-unknown');
  if (s.weeklyUsedPercent >= WALKING_SKELETON_WEEKLY_STOP) return stop('weekly-hard-stop');
  if (forecastPoints > WALKING_SKELETON_WEEKLY_STOP - s.weeklyUsedPercent) return stop('forecast-exceeds-remaining-quota');
  return { allowed: true, reason: 'within-current-weekly-budget', hardStopUsedPercent: WALKING_SKELETON_WEEKLY_STOP };
}
