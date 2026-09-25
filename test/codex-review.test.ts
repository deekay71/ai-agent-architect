import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { canonicalJson, digest } from '../src/contracts/canonical.js';
import { CODEX_CLI_VERSION, CODEX_LAUNCH_POLICY_DIGEST, renderCodexRequest } from '../src/providers/codex.js';
import { buildReaderRequest, campaignPromptDigest } from '../src/evaluation/campaign.js';
import { CodexCampaignConfigSchema } from '../src/evaluation/codex-config.js';
import { exportCodexReview, importCodexReview, type CodexReviewInput } from '../src/evaluation/codex-review.js';
import { exportOutcomeReview } from '../src/evaluation/outcome-review.js';

const json = (file: string, value: unknown) => writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
const raw = (file: string) => `sha256:${createHash('sha256').update(readFileSync(file)).digest('hex')}`;
function setup(t: test.TestContext) {
  const root = mkdtempSync(path.join(tmpdir(), 'codex-review-fixture-')), campaign = path.join(root, 'campaign');
  for (const directory of ['packets', 'requests', 'evaluator']) mkdirSync(path.join(campaign, directory), { recursive: true });
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const config = CodexCampaignConfigSchema.parse({ ...JSON.parse(readFileSync('fixtures/semantic-config/codex-dev-smoke.json', 'utf8')),
    campaignId: 'synthetic-review-only', caseIds: ['case-1'] });
  const profile = config.profiles[0]!;
  const sourcePins = { 'src/fixture.ts': digest('synthetic source') }, compiledPins = {};
  const lock = { schemaVersion: 'codex-semantic-lock/1', config, configDigest: digest(config), datasetSealDigest: digest('synthetic dataset'),
    sourcePins, implementationDigest: digest(sourcePins), compiledPins, compiledDigest: digest(compiledPins), launchPolicyDigest: CODEX_LAUNCH_POLICY_DIGEST,
    promptDigest: campaignPromptDigest(), transportId: 'codex-chatgpt-exec/1', assurance: 'mock' };
  const packet = { task: { taskId: 'case-1', taskClass: 'infrastructure.operations', goal: 'Use public context.' }, model: { modelConfigVersion: digest(profile) },
    generation: 0, resources: [{ pin: { ref: 'source-1' }, content: 'Public fixture evidence.' }], history: { content: 'Public history.' }, bundle: { unknowns: [] } };
  const windowBody = { packet, packetDigest: digest(packet), status: 'ready', issues: [] }, window = { ...windowBody, windowDigest: digest(windowBody) };
  const request = buildReaderRequest(canonicalJson(packet), profile, config.outputTokenHint);
  const answer = { disposition: 'answer', answer: 'Public fixture evidence.', evidenceIds: ['source-1'], revisions: { 'source-1': 'r1' }, constraints: ['C1'], confidence: .8 };
  const result = { status: 'completed', output: { ...answer, revisions: [{ sourceId: 'source-1', revision: 'r1' }] }, requestedModel: profile.model,
    requestDigest: digest(request), renderedRequestDigest: digest(renderCodexRequest(request)), launchPolicyDigest: CODEX_LAUNCH_POLICY_DIGEST, configurationDigest: digest('configuration fixture'), elapsedMs: 1,
    usage: { inputTokens: 10, outputTokens: 10, cachedInputTokens: 0, totalTokens: 20, reasoningTokens: null }, cliVersion: CODEX_CLI_VERSION,
    threadId: 'synthetic-thread', issues: [], apiCostMicros: null, exactInputCount: null, modelIdentityAssurance: 'requested-only',
    maxOutputTokensEnforced: false, isolationAssurance: 'capability-flags-and-event-audit' };
  const trial = { trialId: 'codex-00001', caseId: 'case-1', taskClass: 'infrastructure.operations', profileId: profile.id, role: profile.role,
    requestedModel: profile.model, arm: 'full', status: 'completed', answer, answerDigest: digest(answer), selectedIds: ['source-1'], windowDigests: [window.windowDigest],
    score: { secret: 'AUTOMATED_SCORE_CANARY' }, gathering: { secret: 'GATHERING_CANARY' },
    calls: [{ stage: 'reader', requestPath: 'requests/codex-00001-reader.json', requestDigest: digest(request), expectedConfigurationDigest: result.configurationDigest,
      attemptId: 'fixture-1', status: 'completed', result }] };
  const failed = { ...trial, trialId: 'codex-00002', status: 'incomplete', answer: null, answerDigest: null,
    calls: [{ ...trial.calls[0]!, requestPath: 'requests/codex-00002-reader.json', attemptId: 'fixture-2', status: 'incomplete',
      result: { ...result, status: 'incomplete', output: { partial: 'Actual partial fixture output.' }, issues: ['CODEX_SYNTHETIC_INCOMPLETE'] } }] };
  const blocked = { ...trial, trialId: 'codex-00003', status: 'context-blocked', answer: null, answerDigest: null, calls: [], windowDigests: [] };
  const report = { schemaVersion: 'codex-semantic-report/1', campaignId: config.campaignId, configDigest: lock.configDigest,
    datasetSealDigest: lock.datasetSealDigest, implementationDigest: lock.implementationDigest, compiledDigest: lock.compiledDigest,
    launchPolicyDigest: lock.launchPolicyDigest, transportId: lock.transportId, assurance: 'mock',
    modelIdentityAssurance: 'requested-only', billing: 'chatgpt-subscription-quota', apiCostMicros: null, exactInputCount: null,
    maxOutputTokensEnforced: false, integrityStable: true, stoppedReason: 'synthetic-incomplete', phaseGate: 'Not evaluated', releaseEligible: false,
    limitations: ['Synthetic fixture, not model evidence.'], trials: [trial, failed, blocked] };
  json(path.join(campaign, 'campaign-lock.json'), lock); json(path.join(campaign, 'report.json'), report);
  for (const id of ['codex-00001', 'codex-00002']) {
    json(path.join(campaign, 'packets', `${id}-0.json`), window); json(path.join(campaign, 'requests', `${id}-reader.json`), request);
  }
  json(path.join(campaign, 'evaluator/oracle.json'), { secret: 'ORACLE_CANARY_NEVER_OPEN' });
  const evidence = path.join(root, 'human-fixture.txt'); writeFileSync(evidence, 'Synthetic external attestation only; not an actual human decision.');
  const exported = () => exportCodexReview(campaign, path.join(root, 'review'));
  const decisions = (): CodexReviewInput => {
    const bundle = exported().bundle;
    return { schemaVersion: 'codex-outcome-review/1', bundleDigest: bundle.bundleDigest, campaign: bundle.campaign,
      reviewerId: 'synthetic-external-reviewer', reviewerKind: 'human', method: 'external-manual-review', reviewedAt: '2026-09-25T12:00:00Z',
      evidenceRefs: [{ path: evidence, digest: raw(evidence) }], judgments: bundle.items.map(i => ({ trialId: i.trialId, itemDigest: i.itemDigest,
        answerDigest: i.answerDigest, judgment: i.answer === null ? 'reject' : 'accept', rationale: 'Synthetic fixture judgment only.' })) };
  };
  const importReview = (value: CodexReviewInput) => {
    const decisionsPath = path.join(root, 'decisions.json'); json(decisionsPath, value);
    return importCodexReview(campaign, decisionsPath, path.join(root, 'reviewed.json'));
  };
  return { root, campaign, config, lock, report, trial, failed, blocked, request, window, evidence, exported, decisions, importReview };
}

test('Codex review exports exact public requests and actual answers including partial failures without oracle or scores', t => {
  const f = setup(t), result = f.exported(), b = result.bundle;
  assert.equal(b.schemaVersion, 'codex-outcome-review-bundle/1');
  assert.equal(b.coverage.observedTrials, 3); assert.equal(b.coverage.completedAnswers, 1); assert.equal(b.coverage.partialOrFailed.length, 2);
  assert.equal(b.items[0]!.answerDigest, f.trial.answerDigest);
  assert.deepEqual(b.items[0]!.calls[0]!.request, f.request);
  assert.deepEqual(b.items[1]!.calls[0]!.result!.output, { partial: 'Actual partial fixture output.' });
  assert.equal(b.items[2]!.answer, null); assert.deepEqual(b.items[2]!.calls, []);
  assert.equal(b.accounting.modelIdentityAssurance, 'requested-only'); assert.equal(b.accounting.apiCostMicros, null);
  const text = [result.bundlePath, result.decisionsPath, result.markdownPath].map(p => readFileSync(p, 'utf8')).join('\n');
  for (const marker of ['ORACLE_CANARY', 'AUTOMATED_SCORE_CANARY', 'GATHERING_CANARY']) assert.equal(text.includes(marker), false);
  assert.throws(() => importCodexReview(f.campaign, result.decisionsPath, path.join(f.root, 'invalid.json')));
});

test('Codex human attestation remains nongating and preserves every observed trial', t => {
  const f = setup(t), result = f.importReview(f.decisions());
  assert.equal(result.status, 'reviewed'); assert.equal(result.releaseEligible, false); assert.equal(result.phaseGate, 'Not evaluated');
  assert.equal(result.identityAssurance, 'external-attestation-not-authenticated'); assert.equal(result.coverage.observedTrials, 3);
  assert.equal(result.review.judgments.length, 3);
});

test('Codex campaign cannot be mislabeled as legacy API review input', t => {
  const f = setup(t);
  assert.throws(() => exportOutcomeReview(f.campaign, path.join(f.root, 'legacy')));
  json(path.join(f.campaign, 'report.json'), { ...f.report, schemaVersion: 'semantic-campaign-report/2' });
  assert.throws(() => f.exported());
});

test('review export rejects changed request bytes and request/packet disagreement even after packet resealing', t => {
  const f = setup(t);
  const changedPacket = { ...f.window.packet, history: { content: 'Replaced public history.' } };
  const body = { ...f.window, packet: changedPacket, packetDigest: digest(changedPacket) };
  const { windowDigest: _old, ...unsigned } = body;
  const changedWindow = { ...unsigned, windowDigest: digest(unsigned) };
  json(path.join(f.campaign, 'packets/codex-00001-0.json'), changedWindow);
  f.report.trials[0]!.windowDigests = [changedWindow.windowDigest]; json(path.join(f.campaign, 'report.json'), f.report);
  assert.throws(() => f.exported(), /REQUEST_BINDING/);
  json(path.join(f.campaign, 'packets/codex-00001-0.json'), f.window);
  f.report.trials[0]!.windowDigests = [f.window.windowDigest]; json(path.join(f.campaign, 'report.json'), f.report);
  json(path.join(f.campaign, 'requests/codex-00001-reader.json'), { ...f.request, instructions: 'Substituted instruction.' });
  assert.throws(() => f.exported(), /REQUEST_BINDING/);
});

test('review export rejects source, config, prompt and model substitution', t => {
  const f = setup(t);
  for (const lock of [{ ...f.lock, sourcePins: { substituted: digest('bad') } }, { ...f.lock, configDigest: digest('bad') },
    { ...f.lock, promptDigest: digest('unknown-prompt') }, { ...f.lock, compiledPins: { substituted: digest('bad') } },
    { ...f.lock, launchPolicyDigest: digest('unknown-policy') }]) {
    json(path.join(f.campaign, 'campaign-lock.json'), lock); assert.throws(() => f.exported());
  }
  json(path.join(f.campaign, 'campaign-lock.json'), f.lock);
  f.trial.requestedModel = 'substituted-model'; json(path.join(f.campaign, 'report.json'), f.report);
  assert.throws(() => f.exported(), /PROFILE_BINDING/);
});

test('Codex review rejects substituted rendered prompt, launch policy, configuration and malformed receipt usage', t => {
  const f = setup(t), original = structuredClone(f.trial.calls[0]!.result);
  for (const receipt of [
    { ...original, renderedRequestDigest: digest('substituted wrapper') },
    { ...original, launchPolicyDigest: digest('substituted policy') },
    { ...original, configurationDigest: digest('substituted limits') },
    { ...original, usage: { ...original.usage, totalTokens: 21 } },
  ]) {
    f.trial.calls[0]!.result = receipt; json(path.join(f.campaign, 'report.json'), f.report);
    assert.throws(() => f.exported());
  }
});

test('Codex review cannot upgrade inadmissible receipts or unreserved calls into completed observations', t => {
  const f = setup(t), call = f.trial.calls[0]!, receipt = call.result;
  const badCalls = [
    { ...call, result: null },
    { ...call, result: { ...receipt, status: 'incomplete' } },
    { ...call, result: { ...receipt, usage: null } },
    { ...call, result: { ...receipt, issues: ['CODEX_USAGE_UNKNOWN'] } },
    { ...call, result: { ...receipt, cliVersion: null } },
    { ...call, result: { ...receipt, cliVersion: 'unsupported-cli' } },
    { ...call, attemptId: null },
    { ...call, expectedConfigurationDigest: null },
  ];
  for (const bad of badCalls) {
    json(path.join(f.campaign, 'report.json'), { ...f.report, trials: [{ ...f.trial, calls: [bad] }, f.failed, f.blocked] });
    assert.throws(() => f.exported(), /COMPLETED_CALL_INVALID|RESPONSE_BINDING/);
  }
  // Unknown usage and failure diagnostics remain reviewable when labelled partial.
  const partial = { ...f.failed, calls: [{ ...f.failed.calls[0]!, result: { ...f.failed.calls[0]!.result, usage: null, cliVersion: null } }] };
  json(path.join(f.campaign, 'report.json'), { ...f.report, trials: [f.trial, partial, f.blocked] });
  const exported = f.exported();
  assert.equal(exported.bundle.items[1]!.calls[0]!.result!.usage, null);
  assert.equal(exported.bundle.items[1]!.status, 'incomplete');
});

test('review rejects answer substitution and incomplete completed outputs', t => {
  const f = setup(t);
  f.trial.answer.answer = 'Changed answer'; f.trial.answerDigest = digest(f.trial.answer); json(path.join(f.campaign, 'report.json'), f.report);
  assert.throws(() => f.exported(), /ANSWER_BINDING/);
  f.report.trials[0] = { ...f.blocked, trialId: 'codex-00001', status: 'completed' }; json(path.join(f.campaign, 'report.json'), f.report);
  assert.throws(() => f.exported(), /INCOMPLETE_COMPLETED_TRIAL/);
});

test('Codex review import rejects changed campaign or packet after export', t => {
  const f = setup(t), decisions = f.decisions();
  // Raw-byte reformatting also invalidates the exported review evidence.
  writeFileSync(path.join(f.campaign, 'report.json'), JSON.stringify(f.report));
  assert.throws(() => f.importReview(decisions), /CAMPAIGN_DRIFT/);
});

test('Codex review requires complete unique per-item judgments and external unchanged evidence', t => {
  const f = setup(t), decisions = f.decisions();
  for (const judgments of [decisions.judgments.slice(1), [decisions.judgments[0]!, decisions.judgments[0]!, decisions.judgments[2]!],
    decisions.judgments.map((j, i) => i === 0 ? { ...j, itemDigest: digest('substitute') } : j)]) {
    assert.throws(() => f.importReview({ ...decisions, judgments }), /JUDGMENT_COVERAGE/);
  }
  writeFileSync(f.evidence, 'Changed evidence'); assert.throws(() => f.importReview(decisions), /EVIDENCE_DRIFT/);
});

test('Codex review refuses traversal, symlink artifacts and outputs inside campaign', t => {
  const f = setup(t);
  assert.throws(() => exportCodexReview(f.campaign, path.join(f.campaign, 'review')), /OUTPUT_MUST_BE_NEW_EXTERNAL/);
  f.trial.calls[0]!.requestPath = '../outside.json'; json(path.join(f.campaign, 'report.json'), f.report);
  assert.throws(() => f.exported(), /REQUEST_PATH/);
  f.trial.calls[0]!.requestPath = 'requests/codex-00001-reader.json'; json(path.join(f.campaign, 'report.json'), f.report);
  const file = path.join(f.campaign, 'requests/codex-00001-reader.json'), external = path.join(f.root, 'request.json');
  json(external, f.request); rmSync(file); symlinkSync(external, file);
  assert.throws(() => f.exported(), /UNSAFE_PATH/);
});

test('Codex review artifacts are created exclusively and cannot overwrite a prior export/import', t => {
  const f = setup(t), decisions = f.decisions();
  assert.throws(() => f.exported(), /OUTPUT_MUST_BE_NEW_EXTERNAL/);
  f.importReview(decisions); assert.throws(() => f.importReview(decisions), /OUTPUT_MUST_BE_NEW_EXTERNAL/);
});
