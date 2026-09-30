import test from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { digest } from '../src/contracts/canonical.js';
import { CURRENT_CODEX_CLI_VERSION, CURRENT_CODEX_LAUNCH_POLICY_DIGEST, renderCodexRequest, type CodexTransport } from '../src/providers/codex.js';
import { estimateSkeletonCampaign, loadSkeletonTasks, runSkeletonCampaign } from '../src/unity/campaign.js';
import type { UnityRunner } from '../src/unity/walking-skeleton.js';

function setup(t: test.TestContext, mode: 'pass' | 'critic-reject' | 'unity-fail' | 'unknown') {
  const root = mkdtempSync(path.join(os.tmpdir(), 'unity-campaign-')); t.after(() => rmSync(root, { recursive: true, force: true }));
  const closure = path.join(root, 'closure.json'); writeFileSync(closure, JSON.stringify({ status: 'Pass có điều kiện', scope: 'phase3-administrative-closure' }));
  const templateRoot = path.resolve('unity/walking-skeleton'); let calls = 0, unityCalls = 0;
  const transport: CodexTransport = { id: 'codex-chatgpt-exec/1', assurance: 'mock', cliVersion: CURRENT_CODEX_CLI_VERSION,
    launchPolicyDigest: CURRENT_CODEX_LAUNCH_POLICY_DIGEST, configurationDigest: request => digest(request.model),
    async respond(request) {
      calls++;
      const output = request.schemaName === 'unity_planner' ? { steps: ['Implement the required function'], acceptance: ['Pass boundary tests'] }
        : request.schemaName === 'unity_critic' ? { approved: mode !== 'critic-reject', findings: [] }
        : { content: (JSON.parse(request.input) as { requirement: { stub: string } }).requirement.stub, explanation: 'fixture only' };
      return { status: 'completed', output, requestedModel: request.model, requestDigest: digest(request), renderedRequestDigest: digest(renderCodexRequest(request)),
        launchPolicyDigest: transport.launchPolicyDigest, configurationDigest: transport.configurationDigest(request),
        usage: mode === 'unknown' ? null : { inputTokens: 10, cachedInputTokens: 0, outputTokens: 10, totalTokens: 20, reasoningTokens: null },
        elapsedMs: 1, cliVersion: transport.cliVersion!, threadId: 'mock', issues: [], apiCostMicros: null, exactInputCount: null,
        modelIdentityAssurance: 'requested-only', maxOutputTokensEnforced: false, isolationAssurance: 'capability-flags-and-event-audit' };
    } };
  const unity: UnityRunner = { run(project, artifacts, outputRoot, options) {
    unityCalls++; const count = options!.expectedTestCount!;
    return { artifactDirectory: outputRoot, command: [], stdout: '', stderr: '', exitCode: mode === 'unity-fail' ? 1 : 0,
      evidence: { schemaVersion: 'unity-evidence/1', evidenceId: `fixture-${unityCalls}`, projectPath: project, unityVersion: '6000.0.84f1', unityCliVersion: '1.0.0-beta.8', sourceSnapshotDigest: digest('fixture'),
        sourceSnapshotAfterDigest: digest('fixture'), commandDigest: digest('command'), testXmlDigest: digest('xml'), logDigest: digest('log'),
        testSummary: { total: count, passed: mode === 'unity-fail' ? 0 : count, failed: mode === 'unity-fail' ? count : 0, skipped: 0, inconclusive: 0 },
        outcome: mode === 'unity-fail' ? 'fail' : 'pass', checkedPlanDigest: artifacts.plan.digest, executionDigest: artifacts.execution.digest } };
  } };
  return { root, calls: () => calls, unityCalls: () => unityCalls, options: { templateRoot, outputRoot: path.join(root, 'run'), usageRoot: path.join(root, 'usage'),
    phase3ClosureFile: closure, overrideApproval: { reference: 'fixture-approval', maxEstimatedTokens: 700000 }, authorization: { authorizationId: `fixture-${path.basename(root)}`, maxInvocations: 30, maxReportedTokens: 300000, maxWallTimeMs: 60000 }, transport, unity } };
}

test('ten independent requirement cycles create ten observed Memory claims while retaining mock assurance', async t => {
  const f = setup(t, 'pass'), result = await runSkeletonCampaign(f.options);
  assert.equal(result.assurance, 'mock'); assert.equal(result.passed, 10); assert.equal(result.memoryClaims, 10);
  assert.equal(f.calls(), 30); assert.equal(f.unityCalls(), 10); assert.equal(result.releaseEligible, false);
});
test('critic rejection prevents execution, Unity and Memory promotion', async t => {
  const f = setup(t, 'critic-reject'), result = await runSkeletonCampaign(f.options);
  assert.equal(f.calls(), 20); assert.equal(f.unityCalls(), 0); assert.equal(result.memoryClaims, 0);
});
test('native test failures never promote Memory observations', async t => {
  const f = setup(t, 'unity-fail'), result = await runSkeletonCampaign(f.options);
  assert.equal(result.passed, 0); assert.equal(result.memoryClaims, 0); assert.equal(f.unityCalls(), 10);
});
test('unknown usage freezes the entire campaign after one attempt', async t => {
  const f = setup(t, 'unknown'), result = await runSkeletonCampaign(f.options);
  assert.equal(f.calls(), 1); assert.equal(result.budget.unknownAttempts, 1); assert.equal(result.memoryClaims, 0);
});
test('manifest rejects target traversal before any model call', t => {
  const f = setup(t, 'pass'), manifest = path.join(f.root, 'tasks.json'); cpSync(path.join(f.options.templateRoot, 'tasks.json'), manifest);
  const rows = JSON.parse(readFileSync(manifest, 'utf8')); rows[0].targetFile = '../outside.cs'; writeFileSync(manifest, JSON.stringify(rows));
  assert.throws(() => loadSkeletonTasks(manifest)); assert.equal(f.calls(), 0);
});
test('whole campaign estimate includes Sol weighting and requires approval', () => {
  const estimate = estimateSkeletonCampaign(); assert.equal(estimate.modelCalls, 30); assert.equal(estimate.retries, 0);
  assert.equal(estimate.estimatedAggregateTokens, 280020); assert.equal(estimate.weightedTokens, 653380); assert.equal(estimate.exact, false);
});
