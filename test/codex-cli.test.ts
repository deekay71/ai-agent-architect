import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import { loadPublicDataset } from '../src/evaluation/dataset.js';

const datasetRoot = path.resolve('fixtures/semantic-benchmark');
const configFile = path.resolve('fixtures/semantic-config/codex-dev-smoke.json');
const cliModule = pathToFileURL(path.resolve('dist/src/evaluation/cli.js')).href;
const config = () => JSON.parse(readFileSync(configFile, 'utf8'));
function temporary(t: { after: (fn: () => void) => void }): string {
  const root = mkdtempSync(path.join(tmpdir(), 'codex-cli-test-'));
  t.after(() => rmSync(root, { recursive: true, force: true })); return root;
}

/** Block model processes, credential access and fetch before entering the real CLI handler. */
function guarded(args: string[]) {
  const script = `
    import childProcess from 'node:child_process';
    import { syncBuiltinESMExports } from 'node:module';
    const { runEvaluationCli } = await import(${JSON.stringify(cliModule)});
    for (const name of ['spawn','spawnSync','exec','execSync','execFile','execFileSync']) {
      childProcess[name] = () => { throw Error('SUBPROCESS_FORBIDDEN'); };
    }
    syncBuiltinESMExports();
    process.env = new Proxy(process.env, { get(target, key) {
      if (['OPENAI_API_KEY','CODEX_HOME','HOME'].includes(key)) throw Error('AUTH_ACCESS_FORBIDDEN');
      return Reflect.get(target, key);
    }});
    globalThis.fetch = async () => { throw Error('NETWORK_FORBIDDEN'); };
    try { const handled = await runEvaluationCli(${JSON.stringify(args)});
      if (!handled) process.stdout.write(JSON.stringify({handled})+'\\n');
    } catch(error) { process.stdout.write(JSON.stringify({error:error.message})+'\\n'); process.exitCode=1; }
  `;
  return spawnSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf8', timeout: 20_000 });
}

test('Codex preflight uses neither credentials, subprocesses nor network and makes no acceptance or API-price claim', () => {
  const result = guarded(['semantic-codex-preflight', datasetRoot, configFile]);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const value = JSON.parse(result.stdout);
  assert.equal(value.schemaVersion, 'codex-semantic-preflight/1');
  assert.deepEqual(value.selectedCaseIds, ['sem-001']);
  assert.equal(value.plannedTrials, 6); assert.equal(value.plannedControls, 2); assert.equal(value.maxInvocations, 10);
  assert.equal(value.apiCostMicros, null); assert.equal(value.exactInputCount, null);
  assert.equal(value.dispatchAuthorized, false); assert.equal(value.acceptanceReady, false);
  assert.equal(value.modelAvailabilityVerified, false); assert.equal(value.phaseGate, 'Not evaluated');
});

test('Codex commands reject unknown names, missing live opt-in and a caller-supplied budget directory before dispatch', t => {
  const root = temporary(t), output = path.join(root, 'output'), ledgerOverride = path.join(root, 'reset-budget');
  assert.deepEqual(JSON.parse(guarded(['unrelated']).stdout), { handled: false });
  assert.match(guarded(['semantic-codex-unknown']).stdout, /CODEX_CLI_UNKNOWN_COMMAND/);
  for (const args of [
    ['semantic-codex-preflight'],
    ['semantic-codex-run', datasetRoot, configFile, output],
    ['semantic-codex-run', datasetRoot, configFile, output, '--mock'],
    ['semantic-codex-run', datasetRoot, configFile, output, ledgerOverride, '--live'],
    ['semantic-codex-judge-resume', path.join(root, 'inputs.json'), path.join(root, 'config.json'), path.join(root, 'parent'), output],
  ]) {
    const result = guarded(args); assert.equal(result.status, 1); assert.match(result.stdout, /CODEX_CLI_USAGE/);
    assert.doesNotMatch(result.stdout, /AUTH_ACCESS_FORBIDDEN|SUBPROCESS_FORBIDDEN|NETWORK_FORBIDDEN/);
  }
  assert.deepEqual(readdirSync(root), []);
});

test('Codex judgment resume rejects malformed DEV input before constructing a live transport', t => {
  const root = temporary(t), inputs = path.join(root, 'inputs.json'), config = path.join(root, 'config.json');
  writeFileSync(inputs, '[]');
  writeFileSync(config, JSON.stringify({ judge: { id: 'sol', model: 'gpt-6-sol', role: 'planner', reasoningEffort: 'medium' },
    maxRequestBytes: 100_000, timeoutMs: 10_000,
    authorization: { authorizationId: 'test', maxInvocations: 2, maxReportedTokens: 1000, maxWallTimeMs: 10_000 } }));
  const result = guarded(['semantic-codex-judge-resume', inputs, config, path.join(root, 'parent'), path.join(root, 'new-output'), '--live']);
  assert.equal(result.status, 1); assert.match(result.stdout, /Too small/);
  assert.doesNotMatch(result.stdout, /AUTH_ACCESS_FORBIDDEN|SUBPROCESS_FORBIDDEN|NETWORK_FORBIDDEN/);
  assert.equal(existsSync(path.join(root, 'new-output')), false);
});

test('Codex CLI rejects holdout, missing cases and insufficient invocation authorization before live setup', t => {
  const root = temporary(t), file = path.join(root, 'config.json'), output = path.join(root, 'output');
  const holdout = loadPublicDataset(datasetRoot).cases.find(c => c.split === 'holdout')!.id;
  for (const caseId of [holdout, 'missing-case']) {
    writeFileSync(file, JSON.stringify({ ...config(), caseIds: [caseId] }));
    const result = guarded(['semantic-codex-run', datasetRoot, file, output, '--live']);
    assert.equal(result.status, 1); assert.match(result.stdout, /CODEX_DEV_CASE_SELECTION_INVALID/);
  }
  const c = config(); c.authorization.maxInvocations = 1; writeFileSync(file, JSON.stringify(c));
  const capped = guarded(['semantic-codex-run', datasetRoot, file, output, '--live']);
  assert.equal(capped.status, 1); assert.match(capped.stdout, /CODEX_INVOCATION_CAP_BELOW_PLANNED_MATRIX/);
  assert.equal(existsSync(output), false); assert.deepEqual(readdirSync(root), ['config.json']);
});

test('Codex CLI preserves existing campaign output and rejects a missing output parent before live setup', t => {
  const root = temporary(t), existing = path.join(root, 'existing'); mkdirSync(existing);
  const sentinel = path.join(existing, 'report.json'); writeFileSync(sentinel, 'preserve original evidence');
  const overwritten = guarded(['semantic-codex-run', datasetRoot, configFile, existing, '--live']);
  assert.equal(overwritten.status, 1); assert.match(overwritten.stdout, /CODEX_OUTPUT_MUST_BE_NEW/);
  assert.equal(readFileSync(sentinel, 'utf8'), 'preserve original evidence');
  const missing = guarded(['semantic-codex-run', datasetRoot, configFile, path.join(root, 'missing-parent', 'output'), '--live']);
  assert.equal(missing.status, 1); assert.match(missing.stdout, /ENOENT/);
  assert.doesNotMatch(missing.stdout, /AUTH_ACCESS_FORBIDDEN|SUBPROCESS_FORBIDDEN|NETWORK_FORBIDDEN/);
  assert.deepEqual(readdirSync(root), ['existing']);
});

test('Codex CLI limits JSON inputs before parsing or dispatch', t => {
  const root = temporary(t), file = path.join(root, 'oversized.json'); writeFileSync(file, ' '.repeat(2 * 1024 * 1024 + 1));
  const result = guarded(['semantic-codex-preflight', datasetRoot, file]);
  assert.equal(result.status, 1); assert.match(result.stdout, /CODEX_CLI_INPUT_TOO_LARGE/);
});

test('renamed Codex CLI campaigns always receive the same repository-level ledger path', t => {
  const root = temporary(t), repo = path.join(root, 'repo'), cli = path.join(repo, 'dist', 'src', 'evaluation', 'codex-cli.js');
  mkdirSync(path.dirname(cli), { recursive: true }); writeFileSync(path.join(repo, 'package.json'), '{"type":"module"}');
  copyFileSync('dist/src/evaluation/codex-cli.js', cli);
  const installedCliUrl = pathToFileURL(realpathSync(cli)).href;
  const first = path.join(root, 'first.json'), second = path.join(root, 'second.json');
  const original = config(); writeFileSync(first, JSON.stringify(original));
  writeFileSync(second, JSON.stringify({ ...original, campaignId: 'renamed-campaign' }));
  const configModule = pathToFileURL(path.resolve('dist/src/evaluation/codex-config.js')).href;
  // Intercept only model/campaign dependencies, while executing the actual CLI
  // routing and path logic from a temporary installed repository. No provider runs.
  const script = `
    import { registerHooks } from 'node:module';
    const calls=[];
    globalThis.__codexCliTestCalls=calls;
    registerHooks({
      resolve(specifier, context, next) {
        if(context.parentURL===${JSON.stringify(installedCliUrl)}) {
          if(specifier==='./codex-config.js') return {url:${JSON.stringify(configModule)},shortCircuit:true};
          if(specifier==='./codex-campaign.js') return {url:'test:campaign',shortCircuit:true};
          if(specifier==='../providers/codex.js') return {url:'test:transport',shortCircuit:true};
        }
        return next(specifier,context);
      },
      load(url,context,next) {
        if(url==='test:transport') return {format:'module',shortCircuit:true,source:
          'export function createCodexTransport(options){return {assurance:"mock",options};}'};
        if(url==='test:campaign') return {format:'module',shortCircuit:true,source:
          'export async function runCodexCampaign(options){globalThis.__codexCliTestCalls.push({usageRoot:options.usageRoot,outputRoot:options.outputRoot,authorizationId:options.config.authorization.authorizationId}); return {campaignId:options.config.campaignId,assurance:"mock",comparisonCoverage:{scored:6},controlCoverage:{scored:2},plannedTrials:6,plannedControls:2,budget:{},stoppedReason:null,modelOutputsObserved:false,phaseGate:"Not evaluated"};}'};
        return next(url,context);
      }
    });
    const {runCodexEvaluationCli}=await import(${JSON.stringify(installedCliUrl)});
    await runCodexEvaluationCli(${JSON.stringify(['semantic-codex-run', datasetRoot, first, path.join(root, 'output-one'), '--live'])});
    await runCodexEvaluationCli(${JSON.stringify(['semantic-codex-run', datasetRoot, second, path.join(root, 'output-two'), '--live'])});
    process.stdout.write(JSON.stringify({calls})+'\\n');
  `;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf8', timeout: 20_000 });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const value = JSON.parse(result.stdout.trim().split('\n').at(-1)!);
  assert.equal(value.calls.length, 2);
  const expected = path.join(realpathSync(repo), '.local', 'codex-subscription-usage');
  assert.equal(value.calls[0].usageRoot, expected); assert.equal(value.calls[1].usageRoot, expected);
  assert.equal(value.calls[0].authorizationId, value.calls[1].authorizationId);
  assert.notEqual(value.calls[0].outputRoot, value.calls[1].outputRoot);
});
