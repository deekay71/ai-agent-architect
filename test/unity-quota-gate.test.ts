import test from 'node:test';
import assert from 'node:assert/strict';
import { checkWalkingSkeletonQuota, AUTHORIZED_RESET_AT } from '../src/unity/quota-gate.js';
const now = Date.parse('2026-10-01T05:00:00Z');
const base = { weeklyUsedPercent: 49, hardStopUsedPercent: 85, observedAt: new Date(now).toISOString(), resetsAt: AUTHORIZED_RESET_AT, step: 1, stepStartUsedPercent: 49 };
for (const old of [40, 45, 47]) test(`reject superseded authorization ${old}`, () => assert.equal(checkWalkingSkeletonQuota({ ...base, hardStopUsedPercent: old }, 0, now).reason, 'quota-policy-mismatch'));
for (const [step, cap] of ([[1, 2], [2, 5], [3, 6]] as const)) test(`step ${step} includes orchestration`, () => {
  assert.equal(checkWalkingSkeletonQuota({ ...base, step }, cap, now).allowed, true);
  assert.equal(checkWalkingSkeletonQuota({ ...base, step }, cap + 0.01, now).reason, 'step-budget-exceeded');
});
test('pair admission reserves both arms and refuses a partial pair', () => {
  const pair = { ...base, step: 4, weeklyUsedPercent: 84, admissionUnit: 'pair' };
  assert.equal(checkWalkingSkeletonQuota(pair, 1, now).allowed, true);
  assert.equal(checkWalkingSkeletonQuota(pair, 1.1, now).allowed, false);
  assert.equal(checkWalkingSkeletonQuota({ ...pair, admissionUnit: 'arm' }, 0.5, now).allowed, false);
  assert.equal(checkWalkingSkeletonQuota({ ...pair, weeklyUsedPercent: 85 }, 0, now).reason, 'weekly-hard-stop');
});
test('unknown, stale and reset telemetry fail closed', () => {
  assert.equal(checkWalkingSkeletonQuota(null, 0, now).allowed, false);
  assert.equal(checkWalkingSkeletonQuota({ ...base, observedAt: new Date(now - 60001).toISOString() }, 0, now).allowed, false);
  assert.equal(checkWalkingSkeletonQuota({ ...base, resetsAt: AUTHORIZED_RESET_AT + 604800 }, 0, now).allowed, false);
  assert.equal(checkWalkingSkeletonQuota(base, 0, AUTHORIZED_RESET_AT * 1000).reason, 'weekly-reset-stop');
});
