import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import { runEvaluationCli } from '../src/evaluation/cli.js';
import { CampaignConfigSchema } from '../src/evaluation/config.js';
import { createHash } from 'node:crypto';

const fixture = path.resolve('fixtures/semantic-benchmark');
const configPath = path.resolve('fixtures/semantic-config/local.json');
const config = () => CampaignConfigSchema.parse(JSON.parse(readFileSync(configPath, 'utf8')));
function run(args: string[]) {
  const script = `import { runEvaluationCli } from ${JSON.stringify(pathToFileURL(path.resolve('dist/src/evaluation/cli.js')).href)};
    process.env = new Proxy(process.env, { get(target, key) {
      if (key === 'OPENAI_API_KEY') throw new Error('CREDENTIAL_READ_FORBIDDEN'); return Reflect.get(target, key);
    }});
    globalThis.fetch = async () => { throw new Error('NETWORK_FORBIDDEN'); };
    try { const handled = await runEvaluationCli(${JSON.stringify(args)}); if (!handled) process.stdout.write(JSON.stringify({handled}) + '\\n'); }
    catch (error) { process.stdout.write(JSON.stringify({error:error.message}) + '\\n'); process.exitCode = 1; }`;
  return spawnSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf8', timeout: 30_000 });
}
function temporary(t: { after: (fn: () => void) => void }): string {
  const root = mkdtempSync(path.join(tmpdir(), 'semantic-cli-'));
  t.after(() => rmSync(root, { recursive: true, force: true })); return root;
}

test('semantic CLI declines unrelated commands and rejects malformed known commands', async () => {
  assert.equal(await runEvaluationCli(['unrelated']), false);
  await assert.rejects(runEvaluationCli(['semantic-preflight']), /SEMANTIC_CLI_USAGE/);
  await assert.rejects(runEvaluationCli(['semantic-run', fixture, configPath, 'output', 'spend', '--unexpected']), /SEMANTIC_CLI_USAGE/);
});

test('local configuration pins the requested mock-only model routing and provisional matrix', () => {
  const c = config();
  assert.equal(c.provider, 'mock'); assert.equal(c.split, 'dev'); assert.equal(c.authorization.maxCostMicros, 0);
  assert.deepEqual(c.profiles.map(p => [p.role, p.model, p.reasoningEffort, p.inputTokenLimit]),
    [['planner', 'gpt-6-astra', 'high', 100_000], ['executor', 'gpt-6-luna', 'medium', 100_000]]);
  assert.deepEqual(c.totalTokenBudgets, [8192, 16384, 32768]); assert.deepEqual(c.distractorLimits, [0, 8]);
  assert.deepEqual(c.compactionRounds, [1, 3]); assert.equal(c.thresholds.calibrationStatus, 'provisional');
});

test('semantic preflight reads no credential and makes no network call', () => {
  const result = run(['semantic-preflight', fixture, configPath]);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const value = JSON.parse(result.stdout) as { liveReady: boolean; caseCount: number; plannedTrials: number; plannedControlTrials: number; phaseGate: string };
  assert.equal(value.liveReady, false); assert.equal(value.caseCount, 20); assert.equal(value.plannedTrials, 960);
  assert.equal(value.plannedControlTrials, 120);
  assert.equal(value.phaseGate, 'Not evaluated');
});

test('live opt-in and independent review are checked before reading credentials or creating output', t => {
  const root = temporary(t), file = path.join(root, 'live-config.json'), c = config();
  c.provider = 'openai'; c.authorization.maxCostMicros = 1_000_000;
  writeFileSync(file, JSON.stringify(c));
  const base = ['semantic-run', fixture, file, path.join(root, 'output'), path.join(root, 'spend')];
  const noOptIn = run(base), unreviewed = run([...base, '--live']);
  assert.equal(noOptIn.status, 1); assert.match(noOptIn.stdout, /LIVE_EXPLICIT_OPT_IN_REQUIRED/);
  assert.equal(unreviewed.status, 1); assert.match(unreviewed.stdout, /LIVE_PREFLIGHT_NOT_READY/);
  assert.equal(existsSync(path.join(root, 'output')), false); assert.equal(existsSync(path.join(root, 'spend')), false);
  assert.equal(readdirSync(root).length, 1, 'Denied live attempts must not create scratch workspaces');
});

test('mock configuration cannot be promoted with a live flag or expose unreviewed holdout', t => {
  const root = temporary(t), file = path.join(root, 'holdout.json'), c = config(); c.split = 'holdout';
  writeFileSync(file, JSON.stringify(c));
  const paths = [path.join(root, 'output'), path.join(root, 'spend')];
  assert.match(run(['semantic-run', fixture, configPath, ...paths, '--live']).stdout, /LIVE_FLAG_REQUIRES_OPENAI_CONFIG/);
  assert.match(run(['semantic-run', fixture, file, ...paths]).stdout, /HOLDOUT_REQUIRES_INDEPENDENT_REVIEW/);
  assert.equal(existsSync(paths[0]!), false);
});

test('mock run exercises local CLI accounting under a blocking token budget with no credential access', t => {
  const root = temporary(t), file = path.join(root, 'small-config.json'), c = config();
  c.campaignId = 'semantic-cli-test-only'; c.profiles = [c.profiles[0]!]; c.totalTokenBudgets = [1024];
  c.distractorLimits = [0]; c.compactionRounds = [1];
  // Output reservation + headroom already uses the full budget: every count is blocked before respond.
  c.maxOutputTokens = 512; c.headroomTokens = 512;
  writeFileSync(file, JSON.stringify(c));
  const target = path.join(root, 'output'), result = run(['semantic-run', fixture, file, target, path.join(root, 'spend')]);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const report = JSON.parse(readFileSync(path.join(target, 'report.json'), 'utf8')) as {
    assurance: string; modelQualityMeasured: boolean; phaseGate: string; trials: { status: string; calls: { result: unknown }[] }[];
  };
  assert.equal(report.assurance, 'mock'); assert.equal(report.modelQualityMeasured, false); assert.equal(report.phaseGate, 'Not evaluated');
  assert.equal(report.trials.length, 80); assert.ok(report.trials.some(t => t.status === 'token-budget-blocked'));
  assert.ok(report.trials.every(t => t.calls.every(c => c.result === null)), 'No response may run without remaining token capacity');
  const summary = JSON.parse(result.stdout) as { completedTrials: number; completedControlTrials: number };
  assert.equal(summary.completedTrials, 60); assert.equal(summary.completedControlTrials, 20);
  assert.ok(readdirSync(root).every(name => !name.startsWith('.semantic-mock-worker-')), 'Private scratch workspace must be removed');
  assert.match(run(['semantic-run', fixture, file, target, path.join(root, 'spend')]).stdout, /SEMANTIC_OUTPUT_MUST_BE_NEW/);
});

test('CLI binds output review to a local campaign and never promotes it to phase acceptance', t => {
  const root = temporary(t), file = path.join(root, 'smoke.json');
  const c = CampaignConfigSchema.parse(JSON.parse(readFileSync('fixtures/semantic-config/dev-smoke-draft.json', 'utf8')));
  c.provider = 'mock'; c.authorization.maxCostMicros = 0; c.campaignId = 'cli-review-fixture';
  c.caseIds = ['sem-001']; c.profiles = [c.profiles[0]!];
  writeFileSync(file, JSON.stringify(c));
  const campaign = path.join(root, 'campaign'), reviewDir = path.join(root, 'review');
  const result = run(['semantic-run', fixture, file, campaign, path.join(root, 'spend')]);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const report = JSON.parse(readFileSync(path.join(campaign, 'report.json'), 'utf8'));
  assert.equal(report.pairedDiagnostics.groups.length, 2);
  assert.equal(report.pairedDiagnostics.excludedControlTrials, 1);
  assert.equal(report.pairedDiagnostics.acceptanceDecision, null);
  assert.ok(report.pairedDiagnostics.groups.every((g: { scoredPairs: number; uniqueCaseCount: number }) => g.scoredPairs === 1 && g.uniqueCaseCount === 1));
  const exported = run(['semantic-review-export', campaign, reviewDir]);
  assert.equal(exported.status, 0, exported.stdout + exported.stderr);
  const pendingPath = path.join(reviewDir, 'pending-decisions.json');
  const denied = run(['semantic-outcome-review-import', campaign, pendingPath, path.join(root, 'denied.json')]);
  assert.equal(denied.status, 1); assert.equal(existsSync(path.join(root, 'denied.json')), false);
  const evidence = path.join(root, 'fixture-evidence.txt');
  writeFileSync(evidence, 'Synthetic CLI test attestation only; not an actual human review.');
  const decisions = JSON.parse(readFileSync(pendingPath, 'utf8'));
  Object.assign(decisions, { reviewerId: 'test-human-fixture', reviewedAt: new Date().toISOString(),
    evidenceRefs: [{ path: evidence, digest: `sha256:${createHash('sha256').update(readFileSync(evidence)).digest('hex')}` }],
    judgments: decisions.judgments.map((j: { trialId: string; answerDigest: string }) => ({ ...j, judgment: 'reject', rationale: 'Synthetic test only.' })) });
  const decisionsPath = path.join(root, 'test-decisions.json'); writeFileSync(decisionsPath, JSON.stringify(decisions));
  const imported = run(['semantic-outcome-review-import', campaign, decisionsPath, path.join(root, 'reviewed.json')]);
  assert.equal(imported.status, 0, imported.stdout + imported.stderr);
  const summary = JSON.parse(imported.stdout);
  assert.equal(summary.acceptanceStatus, 'not-acceptance-mock-provider');
  assert.equal(summary.releaseEligible, false); assert.equal(summary.phaseGate, 'Not evaluated');
});
