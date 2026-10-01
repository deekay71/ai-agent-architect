import test from 'node:test';
import assert from 'node:assert/strict';
import { checkWalkingSkeletonQuota } from '../src/unity/quota-gate.js';
const now = Date.parse('2026-10-01T05:00:00Z');
for (const [used, limit, forecast, expected] of [
  [44, 47, 1.147, 'within-current-weekly-budget'],
  [46.9, 47, 0.2, 'forecast-exceeds-remaining-quota'],
  [47, 47, 0, 'weekly-hard-stop'],
  [43, 40, 0, 'quota-policy-mismatch'],
  [33, 34, 0, 'quota-policy-mismatch'],
] as const) test(`weekly quota ${used}/${limit} forecast ${forecast}`, () => {
  const decision = checkWalkingSkeletonQuota({ weeklyUsedPercent: used, hardStopUsedPercent: limit, observedAt: new Date(now).toISOString() }, forecast, now);
  assert.equal(decision.reason, expected);
  assert.equal(decision.allowed, expected === 'within-current-weekly-budget');
  assert.equal(decision.hardStopUsedPercent, 47);
});
test('unknown or stale quota cannot dispatch', () => {
  assert.equal(checkWalkingSkeletonQuota(null, 0, now).allowed, false);
  assert.equal(checkWalkingSkeletonQuota({ weeklyUsedPercent: 43, hardStopUsedPercent: 47, observedAt: new Date(now - 60_001).toISOString() }, 0, now).allowed, false);
});
