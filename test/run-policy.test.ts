import test from 'node:test';
import assert from 'node:assert/strict';
import { requireModelRunAdmission, reviewModelRun, type ModelRunPolicy, type ModelRunForecast } from '../src/evaluation/run-policy.js';
const policy: ModelRunPolicy = { schemaVersion: 'weighted-model-run-policy/1', approvalThreshold: 300000, devCap: 1500000,
  phaseAcceptanceCap: 3000000, weights: { terra: 1, sol: null, astra: 5 } };
const forecast: ModelRunForecast = { purpose: 'dev', cases: 10, calls: 30, tokens: { terra: 0, sol: 0, astra: 60001 },
  decision: 'Measure single-planner baseline before enabling experiments', weeklyQuotaPercent: null, weeklyQuotaBasis: 'Provider does not publish a token denominator' };
test('Astra counts five times Terra and crossing 300k requires recorded approval', () => {
  assert.equal(reviewModelRun(policy, forecast).weightedTokens, 300005);
  assert.throws(() => requireModelRunAdmission(policy, forecast), /USER_APPROVAL/);
  assert.equal(requireModelRunAdmission(policy, forecast, { reference: 'user-decision', maxWeightedTokens: 300005 }).withinCap, true);
});
test('DEV and phase caps cannot be overridden by an ordinary run approval', () => {
  assert.throws(() => requireModelRunAdmission(policy, { ...forecast, tokens: { terra: 1500001, sol: 0, astra: 0 } }, { reference: 'prior', maxWeightedTokens: 4000000 }), /SCOPE_CAP/);
  assert.throws(() => requireModelRunAdmission(policy, { ...forecast, purpose: 'phase-acceptance', tokens: { terra: 3000001, sol: 0, astra: 0 } }, { reference: 'prior', maxWeightedTokens: 4000000 }), /SCOPE_CAP/);
});
test('Sol weight must be supplied; unknown weekly percentage is not fabricated', () => {
  assert.throws(() => reviewModelRun(policy, { ...forecast, tokens: { terra: 0, sol: 1, astra: 0 } }), /SOL_WEIGHT_REQUIRED/);
  assert.equal(reviewModelRun(policy, forecast).weeklyQuotaPercent, null);
});
