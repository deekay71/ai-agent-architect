import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { digest } from '../src/contracts/canonical.js';
import { CampaignConfigSchema, campaignPurpose, type CampaignConfig } from '../src/evaluation/config.js';
import { forecastCampaign } from '../src/evaluation/forecast.js';
import { reserveCostMicros } from '../src/providers/pricing.js';

const fixture = (name: string): CampaignConfig => JSON.parse(readFileSync(`fixtures/semantic-config/${name}.json`, 'utf8'));
const draft = () => fixture('dev-smoke-draft');

test('legacy local configuration parses without changing its pinned content digest', () => {
  for (const name of ['local', 'local-fixes']) {
    const original = fixture(name), parsed = CampaignConfigSchema.parse(original);
    assert.equal(digest(parsed), digest(original));
    assert.equal(campaignPurpose(parsed), 'local-regression');
    assert.equal(Object.hasOwn(parsed, 'purpose'), false);
    assert.equal(Object.hasOwn(parsed, 'caseIds'), false);
  }
});

test('explicit DEV stages require an exact nonempty distinct case selection and the dev split', () => {
  for (const purpose of ['dev-smoke', 'dev-calibration'] as const) {
    const config = draft(); config.purpose = purpose;
    assert.equal(CampaignConfigSchema.safeParse(config).success, true);
    const missing = structuredClone(config); delete missing.caseIds;
    assert.equal(CampaignConfigSchema.safeParse(missing).success, false);
    for (const caseIds of [[], ['sem-001', 'sem-001'], [' sem-001'], ['']]) {
      assert.equal(CampaignConfigSchema.safeParse({ ...config, caseIds }).success, false);
    }
    assert.equal(CampaignConfigSchema.safeParse({ ...config, split: 'holdout' }).success, false);
  }
});

test('acceptance configurations require holdout but parsing does not grant acceptance or dispatch', () => {
  const config = draft(); config.purpose = 'acceptance';
  assert.equal(CampaignConfigSchema.safeParse(config).success, false);
  config.split = 'holdout';
  assert.equal(CampaignConfigSchema.safeParse(config).success, true);
  assert.equal(forecastCampaign(config, 2).dispatchAuthorized, false);
});

test('live DEV stages require both reviewed model capability caps', () => {
  for (const field of ['modelContextLimit', 'maxModelOutputTokens'] as const) {
    const config = draft(); delete config.profiles[0]![field];
    assert.equal(CampaignConfigSchema.safeParse(config).success, false);
  }
});

test('model output and context caps include the output reserve and headroom', () => {
  const config = draft();
  config.profiles[0]!.maxModelOutputTokens = config.maxOutputTokens - 1;
  assert.equal(CampaignConfigSchema.safeParse(config).success, false);
  config.profiles[0]!.maxModelOutputTokens = config.maxOutputTokens;
  config.profiles[0]!.modelContextLimit = config.maxOutputTokens + config.headroomTokens;
  config.profiles[0]!.inputTokenLimit = 1024;
  assert.equal(CampaignConfigSchema.safeParse(config).success, true);
  config.profiles[0]!.modelContextLimit!--;
  assert.equal(CampaignConfigSchema.safeParse(config).success, false);
});

test('explicit stages reject a trial budget unable to reserve one request output and headroom', () => {
  const config = draft(); config.totalTokenBudgets = [config.maxOutputTokens + config.headroomTokens - 1];
  assert.equal(CampaignConfigSchema.safeParse(config).success, false);
  config.totalTokenBudgets[0]!++;
  assert.equal(CampaignConfigSchema.safeParse(config).success, true);
});

test('draft smoke forecasts every F/R/C and G request within the proposed five-dollar tariff cap', () => {
  const result = forecastCampaign(draft(), 2);
  assert.equal(result.plannedTrials, 12); assert.equal(result.plannedControlTrials, 4);
  assert.equal(result.maxGenerationCalls, 20); assert.equal(result.maxCountCalls, 20);
  assert.equal(result.totalGenerationCostUpperBoundMicros, 4_242_980);
  assert.equal(result.generationTariffFitsConfiguredCap, true);
  assert.equal(result.configuredCapMicros, 5_000_000);
  assert.equal(result.referenceOnly, true); assert.equal(result.dispatchAuthorized, false);
  assert.ok(result.exclusions.some(x => x.includes('Count-endpoint')));
  assert.equal(result.rows.filter(r => r.arm === 'oracle-evidence').reduce((n, r) => n + r.trials, 0), 4);
});

test('forecast retains all original matrix cells, repeat counts and gold controls', () => {
  const config = fixture('local-fixes'); config.repeats = 2;
  const result = forecastCampaign(config, 20);
  assert.equal(result.plannedTrials, 1920); assert.equal(result.plannedControlTrials, 240);
  assert.equal(result.maxGenerationCalls, 4080);
  assert.ok(result.totalGenerationCostUpperBoundMicros >= 2 * 123_953_664);
  assert.equal(result.generationTariffFitsConfiguredCap, false, 'zero mock cap is not a live budget');
});

test('forecast rejects empty, fractional, unsafe or mismatched selected-case counts', () => {
  for (const count of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, 1, 3]) {
    assert.throws(() => forecastCampaign(draft(), count), /FORECAST_CASE_COUNT_INVALID/);
  }
});

test('forecast bounds low-output expensive-input requests and request-level rounding', () => {
  const config = draft(); config.caseIds = ['case']; config.profiles = [config.profiles[0]!];
  const profile = config.profiles[0]!;
  config.maxOutputTokens = 64; config.headroomTokens = 0; config.totalTokenBudgets = [1024];
  profile.inputTokenLimit = 1024; profile.modelContextLimit = 2048; profile.maxModelOutputTokens = 64;
  profile.pricing.inputPerMillionUsd = .002; profile.pricing.cachedInputPerMillionUsd = .01; profile.pricing.outputPerMillionUsd = .001;
  const result = forecastCampaign(config, 1);
  const compact = result.rows.find(r => r.arm === 'compaction')!;
  // Two admitted calls, each independently rounded; a larger cached tariff must never lower reservation.
  const actual = reserveCostMicros(400, 3, profile.pricing) + reserveCostMicros(400, 3, profile.pricing);
  assert.ok(actual <= compact.generationCostUpperBoundPerTrialMicros);
  assert.equal(compact.generationCostUpperBoundPerTrialMicros, 12);
});

test('forecast never prices more tokens than a cumulative trial budget even across compaction calls', () => {
  const config = draft(); config.caseIds = ['case']; config.profiles = [config.profiles[0]!];
  config.totalTokenBudgets = [8192]; config.maxOutputTokens = 4000; config.compactionRounds = [1, 3];
  const result = forecastCampaign(config, 1);
  const fourCalls = result.rows.find(r => r.compactionRounds === 3)!;
  assert.equal(fourCalls.generationCostUpperBoundPerTrialMicros, (8192 - 256) * 50 + 3);
  assert.equal(result.maxGenerationCalls, 9);
});
