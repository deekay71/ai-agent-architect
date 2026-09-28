import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { sealDataset, verifyDatasetSeal, loadPublicDataset, loadEvaluatorOracle } from '../src/evaluation/dataset.js';
import { digest } from '../src/contracts/canonical.js';
import { freezeCodexAcceptanceProtocol, runCodexAcceptanceCampaign } from '../src/evaluation/acceptance-runner.js';
import { prepareAcceptanceJudgmentInputs, adjudicateCodexAcceptance } from '../src/evaluation/acceptance-evidence.js';
import { runCodexJudgments } from '../src/evaluation/codex-judgment.js';
import { CODEX_CLI_VERSION, CODEX_LAUNCH_POLICY_DIGEST, renderCodexRequest, type CodexResult, type CodexTransport } from '../src/providers/codex.js';
import type { ModelRequest } from '../src/providers/types.js';

// Explicit local debugging switch; these fixtures contain synthetic data only.
function cleanupFixture(t: test.TestContext, root: string): void {
  if (process.env.ARCHITECT_KEEP_SYNTHETIC_FIXTURES === '1') t.diagnostic(`Synthetic fixture retained: ${root}`);
  else t.after(() => rmSync(root, { recursive: true, force: true }));
}

/** Synthetic local-regression corpus. It contains no production or private holdout material. */
function syntheticDataset(t: test.TestContext): string {
  const root = mkdtempSync(path.join(os.tmpdir(), 'acceptance-local-regression-'));
  cleanupFixture(t, root);
  mkdirSync(path.join(root, 'public')); mkdirSync(path.join(root, 'evaluator'));
  const cases = Array.from({ length: 30 }, (_, index) => {
    const split = index < 20 ? 'dev' as const : 'holdout' as const, id = `${split}-${index + 1}`;
    return { id, family: split === 'dev' ? `dev-family-${index % 8 + 1}` : `holdout-family-${index + 1}`, split, question: `Synthetic isolated request ${index + 1}: report source ${id}.`, query: `synthetic-${id}`,
      repoId: 'synthetic-repo', allowedPaths: ['src'], taskClass: `infrastructure.synthetic.${id}`, constraints: [{ id: `constraint-${id}`, description: `Only inspect ${id}.`, revision: 'r1' }],
      history: `Synthetic history for ${id}.`, unknowns: [] };
  });
  const documents = cases.map(c => ({ id: `doc-${c.id}`, revision: 'r1', repoId: c.repoId, path: `src/${c.id}.md`, taskClass: c.taskClass,
    lifecycle: 'active' as const, freshness: 'fresh' as const, text: `Synthetic evidence for ${c.id}.`, distractor: false }));
  const oracle = cases.map((c, index) => ({ caseId: c.id, requiredEvidenceIds: [`doc-${c.id}`], acceptableAlternatives: index % 5 === 0 ? [] : [`Synthetic answer ${c.id}`],
    answerability: index % 5 === 0 ? 'unanswerable' as const : 'answerable' as const, expectedRevision: { [`doc-${c.id}`]: 'r1' }, expectedConstraints: [`constraint-${c.id}`] }));
  const write = (file: string, value: unknown) => writeFileSync(path.join(root, file), JSON.stringify(value));
  write('manifest.json', { schemaVersion: 'semantic-candidate-v1', datasetId: 'synthetic-local-regression-v1', status: 'candidate-new', reviewStatus: 'unreviewed',
    authorIds: ['local-test-author'], provenance: 'synthetic local regression fixture', createdAt: '2026-09-28T00:00:00.000Z', splitCounts: { dev: 20, holdout: 10 }, releaseEligible: false, limitations: ['synthetic local regression only'] });
  write('public/cases.json', cases); write('public/documents.json', documents); write('evaluator/oracle.json', oracle); sealDataset(root); return root;
}

test('local-regression fixture seals a disjoint 20 DEV / 10 holdout corpus without exposing oracle through public loading', t => {
  const root = syntheticDataset(t), publicData = loadPublicDataset(root), oracle = loadEvaluatorOracle(root);
  assert.equal(publicData.cases.filter(c => c.split === 'dev').length, 20);
  assert.equal(publicData.cases.filter(c => c.split === 'holdout').length, 10);
  assert.equal(oracle.length, 30); assert.match(verifyDatasetSeal(root), /^sha256:/);
});

const rawDigest = (value: string | Buffer) => `sha256:${createHash('sha256').update(value).digest('hex')}`;
const writeJson = (file: string, value: unknown) => writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
const artifact = (file: string, value: unknown) => { writeJson(file, value); return { path: file, digest: rawDigest(readFileSync(file)) }; };

/** It answers only from the request packet; evaluator labels and oracle data never enter this transport. */
function fixtureTransport(): CodexTransport {
  const configurationDigest = (request: ModelRequest) => digest({ fixture: 'acceptance-local-regression', model: request.model, effort: request.reasoningEffort });
  const result = (request: ModelRequest, output: unknown): CodexResult => ({ status: 'completed', requestedModel: request.model,
    requestDigest: digest(request), renderedRequestDigest: digest(renderCodexRequest(request)), launchPolicyDigest: CODEX_LAUNCH_POLICY_DIGEST,
    configurationDigest: configurationDigest(request), output, usage: { inputTokens: 9, cachedInputTokens: 0, outputTokens: 1, totalTokens: 10, reasoningTokens: null },
    elapsedMs: 1, cliVersion: CODEX_CLI_VERSION, threadId: 'synthetic-local-regression', issues: [], apiCostMicros: null,
    exactInputCount: null, modelIdentityAssurance: 'requested-only', maxOutputTokensEnforced: false, isolationAssurance: 'capability-flags-and-event-audit' });
  return { id: 'codex-chatgpt-exec/1', assurance: 'mock', launchPolicyDigest: CODEX_LAUNCH_POLICY_DIGEST, configurationDigest,
    async respond(request) {
      if (request.schemaName === 'context_summary') return result(request, { summary: 'Synthetic untrusted history summary.' });
      if (request.schemaName === 'evidence_meaning_batch') {
        const items = (JSON.parse(request.input) as { items: { id: string, answer: { disposition: string } }[] }).items;
        return result(request, { judgments: items.map(({ id, answer }) => ({ id, addressesQuestion: true, supportedByEvidence: true,
          respectsConstraintMeaning: true, abstentionAppropriate: answer.disposition === 'abstain', rationale: 'Synthetic packet review.', unsupportedClaims: [], violatedConstraintIds: [] })) });
      }
      const packet = JSON.parse(request.input) as { task: { taskId: string, constraints: { id: string }[] } };
      const id = packet.task.taskId, number = Number(id.split('-').at(-1));
      return result(request, { disposition: number % 5 === 1 ? 'abstain' : 'answer', answer: number % 5 === 1 ? null : `Synthetic answer ${id}`,
        evidenceIds: [`doc-${id}`], revisions: [{ sourceId: `doc-${id}`, revision: 'r1' }], confidence: 0.9,
        constraints: packet.task.constraints.map(c => c.id) });
    } };
}

function syntheticRepository(t: test.TestContext): string {
  const root = mkdtempSync(path.join(os.tmpdir(), 'acceptance-pinned-repository-'));
  cleanupFixture(t, root);
  mkdirSync(path.join(root, 'src')); mkdirSync(path.join(root, 'fixtures')); mkdirSync(path.join(root, 'dist/src'), { recursive: true }); mkdirSync(path.join(root, 'dist/fixtures'));
  for (const name of ['src/a.ts', 'fixtures/contracts.ts', 'package.json', 'pnpm-lock.yaml', 'tsconfig.json']) {
    writeFileSync(path.join(root, name), '{}\n');
    if (name.endsWith('.ts')) writeFileSync(path.join(root, `dist/${name.slice(0, -3)}.js`), '{}\n');
  }
  return root;
}

test('local-regression executes frozen 300-trial acceptance and produces mock-only Replan evidence', async t => {
  const datasetRoot = syntheticDataset(t), repositoryRoot = syntheticRepository(t), root = mkdtempSync(path.join(os.tmpdir(), 'acceptance-pipeline-'));
  cleanupFixture(t, root);
  const usageRoot = path.join(root, 'usage'), calibrationRoot = path.join(root, 'calibration'), calibrationJudgments = path.join(root, 'calibration-judgments');
  mkdirSync(calibrationRoot); mkdirSync(path.join(calibrationRoot, 'evaluator'));
  const data = loadPublicDataset(datasetRoot), gold = loadEvaluatorOracle(datasetRoot), reader = { id: 'reader', role: 'executor' as const, model: 'gpt-6-luna', reasoningEffort: 'low' as const }, judge = { id: 'judge', role: 'planner' as const, model: 'gpt-6-astra', reasoningEffort: 'medium' as const };
  const answerFor = (task: typeof data.cases[number], valid: boolean) => {
    const g = gold.find(x => x.caseId === task.id)!;
    return valid ? (g.answerability === 'answerable'
      ? { disposition: 'answer' as const, answer: `Synthetic answer ${task.id}`, evidenceIds: g.requiredEvidenceIds, revisions: g.expectedRevision, constraints: g.expectedConstraints, confidence: .9 }
      : { disposition: 'abstain' as const, answer: null, evidenceIds: g.requiredEvidenceIds, revisions: g.expectedRevision, constraints: g.expectedConstraints, confidence: .9 })
      : { disposition: 'answer' as const, answer: `Synthetic answer ${task.id}`, evidenceIds: g.requiredEvidenceIds, revisions: g.expectedRevision, constraints: [], confidence: .9 };
  };
  const calibrationInputs = Array.from({ length: 32 }, (_, n) => {
    const task = data.cases[n % 20]!, valid = n < 16;
    return { id: `calibration-${n + 1}`, task, documents: data.documents.filter(d => d.repoId === task.repoId && d.taskClass === task.taskClass), answer: answerFor(task, valid), gold: gold.find(g => g.caseId === task.id)!, readerModel: reader.model };
  });
  const labels = calibrationInputs.map((input, n) => ({ id: input.id, family: input.task.family, expectedPass: n < 16,
    criticalFalseAcceptanceRisk: n >= 16, coverageTags: [['paraphrase', 'unsupported-execution', 'false-premise', 'conflict', 'missing-source', 'revision', 'constraint-meaning', 'correct-abstention'][n % 8]!],
    rationale: 'Synthetic calibration control.', authorId: 'synthetic-test-author', reviewStatus: 'accepted-synthetic-test-provenance' }));
  writeJson(path.join(calibrationRoot, 'inputs.json'), calibrationInputs); writeJson(path.join(calibrationRoot, 'evaluator/labels.json'), labels);
  writeJson(path.join(calibrationRoot, 'check.lock.json'), { schemaVersion: 'synthetic-calibration-lock/1', provenance: 'synthetic-test-provenance' });
  const calibrationReview = path.join(root, 'calibration-review.json');
  artifact(calibrationReview, { schemaVersion: 'codex-calibration-independent-review/1', reviewerKind: 'ai', humanAttestation: null,
    method: 'independent-model-review', reviewerModel: 'synthetic-independent-reviewer', reviewedAt: '2026-09-28T00:00:00.000Z', inputsDigest: digest(calibrationInputs), labelsDigest: digest(labels),
    lockDigest: digest(JSON.parse(readFileSync(path.join(calibrationRoot, 'check.lock.json'), 'utf8'))), rubricDigest: (await import('../src/evaluation/semantic-judgment.js')).SEMANTIC_RUBRIC_DIGEST,
    rawFileDigests: { inputs: rawDigest(readFileSync(path.join(calibrationRoot, 'inputs.json'))), labels: rawDigest(readFileSync(path.join(calibrationRoot, 'evaluator/labels.json'))), lock: rawDigest(readFileSync(path.join(calibrationRoot, 'check.lock.json'))) },
    judgments: labels.map(label => ({ id: label.id, labelDigest: digest(label), judgment: 'accept', rationale: 'Synthetic independent label review.' })), coverage: { planned: 32, reviewed: 32 }, phaseGate: 'Not evaluated', releaseEligible: false });
  const authorization = { authorizationId: 'synthetic-local-regression-no-auth', maxInvocations: 600, maxReportedTokens: 100_000, maxWallTimeMs: 3_600_000 };
  const calibrationReport = await runCodexJudgments({ inputs: calibrationInputs, judge, repositoryRoot, outputRoot: calibrationJudgments, usageRoot, authorization,
    transport: fixtureTransport(), maxRequestBytes: 64_000, timeoutMs: 30_000, calibrationCheck: { calibrationRoot, reviewPath: calibrationReview } });
  assert.equal(calibrationReport.assessed, 32);
  const thresholds = artifact(path.join(root, 'thresholds.json'), { schemaVersion: 'codex-acceptance-thresholds/1', thresholds: { caseSuccessMinimum: .9, allRepeatsRequired: true, allRequiredAbstentions: true, maxHardGateViolations: 0, calibrationPositiveMinimum: .9, calibrationNegativeMinimum: .9, maxCriticalFalseAccepts: 0, minimumPerStratumCases: 10 }, phaseGate: 'Not evaluated', releaseEligible: false });
  const feasibility = artifact(path.join(root, 'feasibility.json'), { schemaVersion: 'dev-request-feasibility/1', modelCalls: 0, stressBytes: 20480, stressDigest: 'sha256:b270da49414b81c4605d5009876d48664c46a29d48ad28fd46fd06c13954a0c0', rows: Array.from({ length: 120 }, () => ({ requestBytes: 60000 })), provenance: 'synthetic-test-provenance' });
  const reviewFiles = ['manifest.json', 'public/cases.json', 'public/documents.json', 'evaluator/oracle.json', 'dataset.lock.json'];
  const independentReview = artifact(path.join(root, 'independent-review.json'), { schemaVersion: 'independent-ai-holdout-label-review/1', reviewerId: 'synthetic-independent-ai', authorId: 'synthetic-test-author', reviewerKind: 'ai', humanAttestation: null, sealDigest: verifyDatasetSeal(datasetRoot), status: 'pass-ai-design-review', reviewedHoldoutCases: 10,
    caseChecks: data.cases.filter(c => c.split === 'holdout').map(c => ({ caseId: c.id })), reviewedRawFileDigests: Object.fromEntries(reviewFiles.map(f => [f, rawDigest(readFileSync(path.join(datasetRoot, f)))])), phaseGate: 'Not evaluated', releaseEligible: false, blockers: [], issues: [], sourceProvenancePins: 'pass', sealIntegrity: 'pass' });
  const protocolDocument = path.join(root, 'protocol.md'); writeFileSync(protocolDocument, '# Synthetic local-regression acceptance protocol\n');
  const protocolFile = path.join(root, 'protocol.json');
  artifact(protocolFile, { schemaVersion: 'phase3-subscription-starter/1', protocolId: 'synthetic-local-regression-acceptance', userRequest: 'implement5closureitems+delegate', measurementMode: 'local-regression', datasetRoot, repositoryRoot, usageRoot,
    caseIds: data.cases.filter(c => c.split === 'holdout').map(c => c.id), visibleByteAllowances: [60000, 62000, 64000], repeats: 2, arms: ['F', 'R', 'C1', 'C3'], control: 'G', reader, judge, topK: 1, outputTokenHint: 64, perTrialReportedTokenStop: 1024, perCallTimeoutMs: 30_000, authorization, maxCalls: 540,
    thresholdArtifact: thresholds, calibrationArtifact: { path: path.join(root, 'calibration-evidence.json'), digest: '' }, independentReviewArtifact: independentReview, protocolDocumentArtifact: { path: protocolDocument, digest: rawDigest(readFileSync(protocolDocument)) }, feasibilityArtifact: feasibility });
  const calibrationEvidence = artifact(path.join(root, 'calibration-evidence.json'), { schemaVersion: 'codex-calibration-evidence/1', calibrationRoot, reviewPath: calibrationReview, judgmentRoot: calibrationJudgments });
  const protocol = JSON.parse(readFileSync(protocolFile, 'utf8')); protocol.calibrationArtifact = calibrationEvidence; writeJson(protocolFile, protocol);
  const frozen = freezeCodexAcceptanceProtocol(protocolFile); assert.equal(frozen.trialManifest.length, 300);
  const campaignProgress: number[] = [], judgmentProgress: number[] = [];
  const campaignRoot = path.join(root, 'campaign'); const campaign = await runCodexAcceptanceCampaign({ protocolFile, frozen, outputRoot: campaignRoot, usageRoot, transport: fixtureTransport(), onProgress(completed, planned) {
    if (completed % 100 === 0 || completed === planned) { campaignProgress.push(completed); console.log(`mock acceptance campaign ${completed}/${planned}`); }
  } });
  assert.equal(campaign.result.trials.length, 300); assert.equal(campaign.result.assurance, 'mock');
  assert.deepEqual(campaignProgress, [100, 200, 300]);
  const prepared = prepareAcceptanceJudgmentInputs(campaignRoot, frozen); assert.equal(prepared.inputs.length, 300);
  const judgments = await runCodexJudgments({ inputs: prepared.inputs, judge, repositoryRoot, outputRoot: path.join(root, 'acceptance-judgments'), usageRoot, authorization, transport: fixtureTransport(), maxRequestBytes: 1_000_000, timeoutMs: 30_000, frozenAcceptance: { protocolFile, frozen, campaignRoot }, onProgress(done, total) {
    if (done % 60 === 0 || done === total) { judgmentProgress.push(done); console.log(`mock acceptance judgment batches ${done / 6}/${total / 6}`); }
  } });
  assert.equal(judgments.assessed, 300);
  assert.deepEqual(judgmentProgress, [60, 120, 180, 240, 300]);
  const final = adjudicateCodexAcceptance({ protocolFile, frozen, campaignRoot, judgmentRoot: path.join(root, 'acceptance-judgments') });
  assert.equal(final.report.quality.pass, true); assert.equal(final.report.nativeEvidence, false); assert.equal(final.report.t19, 'Replan'); assert.equal(final.evidence, null);
});
