import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { creditMicrosForUsage } from '../src/contracts/credit-usage.js';
import { CreditRunPolicySchema, CURRENT_CREDIT_RUN_POLICY, requireCreditRunAdmission, reviewCreditRun, type CreditRunForecast } from '../src/evaluation/credit-policy.js';

const calibration = { estimatedWeeklyCreditAllowance: 1_000, alreadySpentCreditsForPurpose: 0,
  sourceRef: 'observed-weekly-quota', observedAt: '2026-09-30T00:00:00Z', estimationMethod: 'Observed usage divided by quota percentage change' };
const forecast = (patch: Partial<CreditRunForecast> = {}): CreditRunForecast => ({ purpose: 'dev', cases: 1, calls: 1,
  usage: [{ model: 'gpt-6-sol', inputTokens: 100, cachedInputTokens: 20, outputTokens: 10 }],
  decision: 'Bounded DEV run', quotaCalibration: calibration, ...patch });

test('current policy data pins all credit rates and weekly caps', () => {
  assert.deepEqual(CreditRunPolicySchema.parse(JSON.parse(readFileSync('docs/model-run-policy.json', 'utf8'))), CURRENT_CREDIT_RUN_POLICY);
});

test('credits use uncached input, cached input and output once at each pinned model rate', () => {
  const usage = [
    { model: 'gpt-5.6-terra' as const, inputTokens: 100, cachedInputTokens: 20, outputTokens: 10 },
    { model: 'gpt-6-sol' as const, inputTokens: 100, cachedInputTokens: 20, outputTokens: 10 },
    { model: 'gpt-6-astra' as const, inputTokens: 100, cachedInputTokens: 20, outputTokens: 10 },
  ];
  assert.equal(creditMicrosForUsage(usage), 7_100 + 6_600 + 33_000);
  const review = reviewCreditRun(CURRENT_CREDIT_RUN_POLICY, forecast({ usage }));
  assert.equal(review.rawTokens, 330);
  assert.equal(review.estimatedCredits, 0.0467);
});

test('raw approval counts input plus output, including cached input exactly once', () => {
  const under = forecast({ usage: [{ model: 'gpt-6-sol', inputTokens: 290_000, cachedInputTokens: 280_000, outputTokens: 10_000 }] });
  assert.equal(reviewCreditRun(CURRENT_CREDIT_RUN_POLICY, under).rawTokens, 300_000);
  assert.equal(reviewCreditRun(CURRENT_CREDIT_RUN_POLICY, under).approvalRequired, false);
  const over = forecast({ ...under, usage: [{ ...under.usage[0]!, outputTokens: 10_001 }] });
  assert.equal(reviewCreditRun(CURRENT_CREDIT_RUN_POLICY, over).approvalRequired, true);
  assert.throws(() => requireCreditRunAdmission(CURRENT_CREDIT_RUN_POLICY, over), /MODEL_RAW_TOKEN_APPROVAL_REQUIRED/);
  assert.equal(requireCreditRunAdmission(CURRENT_CREDIT_RUN_POLICY, over, { reference: 'owner:1', maxRawTokens: 300_001 }).rawTokens, 300_001);
});

test('weekly DEV 5% and phase 10% caps include prior purpose spend', () => {
  const near = forecast({ usage: [{ model: 'gpt-6-sol', inputTokens: 100_000, cachedInputTokens: 0, outputTokens: 0 }],
    quotaCalibration: { ...calibration, alreadySpentCreditsForPurpose: 44 } });
  assert.equal(reviewCreditRun(CURRENT_CREDIT_RUN_POLICY, near).projectedPurposeQuotaPercent, 4.9);
  assert.doesNotThrow(() => requireCreditRunAdmission(CURRENT_CREDIT_RUN_POLICY, near));
  const exceeded = forecast({ ...near, quotaCalibration: { ...calibration, alreadySpentCreditsForPurpose: 46 } });
  assert.throws(() => requireCreditRunAdmission(CURRENT_CREDIT_RUN_POLICY, exceeded), /MODEL_WEEKLY_QUOTA_CAP_EXCEEDED/);
  const phase = forecast({ ...exceeded, purpose: 'phase-acceptance' });
  assert.doesNotThrow(() => requireCreditRunAdmission(CURRENT_CREDIT_RUN_POLICY, phase));
});

test('missing cache, input, output or calibration cannot invent credits or admit dispatch', () => {
  for (const key of ['inputTokens', 'cachedInputTokens', 'outputTokens'] as const) {
    const unknown = forecast({ usage: [{ ...forecast().usage[0]!, [key]: null }] });
    assert.equal(reviewCreditRun(CURRENT_CREDIT_RUN_POLICY, unknown).estimatedCredits, null);
    assert.throws(() => requireCreditRunAdmission(CURRENT_CREDIT_RUN_POLICY, unknown), /MODEL_CREDIT_ESTIMATE_UNKNOWN/);
  }
  assert.throws(() => requireCreditRunAdmission(CURRENT_CREDIT_RUN_POLICY, forecast({ quotaCalibration: null })), /MODEL_CREDIT_ESTIMATE_UNKNOWN/);
  assert.throws(() => reviewCreditRun(CURRENT_CREDIT_RUN_POLICY, forecast({ usage: [{ model: 'gpt-6-sol', inputTokens: 10, cachedInputTokens: 11, outputTokens: 0 }] })));
});
