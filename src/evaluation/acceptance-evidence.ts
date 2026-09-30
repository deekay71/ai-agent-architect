import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { canonicalJson, digest } from '../contracts/canonical.js';
import { CODEX_CLI_VERSION, CODEX_LAUNCH_POLICY_DIGEST, createCodexTransport, renderCodexRequest } from '../providers/codex.js';
import { CodexReceiptSchema, validCodexTokens } from './codex-receipt.js';
import { CodexProfileSchema, type CodexProfile } from './codex-config.js';
import { loadEvaluatorOracle, loadPublicDataset } from './dataset.js';
import { loadCodexReviewBundle } from './codex-review.js';
import { freezeCodexAcceptanceProtocol, frozenAcceptanceCampaignConfig, type FrozenCodexAcceptanceProtocol } from './acceptance-runner.js';
import { buildBatchedFrozenHoldoutJudgmentRequest, buildBatchedJudgmentRequest, JudgmentInputSchema, parseBatchedJudgments,
  SEMANTIC_RUBRIC_DIGEST, type JudgmentInput } from './semantic-judgment.js';
import type { SubscriptionAuthorization } from './subscription-budget.js';
import { wilsonInterval } from '../benchmark/engine.js';
import { semanticTaskSpec } from './context-arms.js';
import { summarizeCalibration } from './semantic-judgment.js';
import { neutralAcceptanceHistory } from './codex-campaign.js';
import { ExposureRegistry } from './exposure.js';
import { diagnoseAcceptanceJudgments, JudgmentReviewIssueSchema } from './acceptance-diagnostics.js';

const text = z.string().min(1), hash = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const rawDigest = (raw: Uint8Array | string) => `sha256:${createHash('sha256').update(raw).digest('hex')}`;
function read(file: string, pins: Record<string, string>) {
  const stat = lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.size > 128 * 1024 * 1024) throw Error('ACCEPTANCE_EVIDENCE_UNSAFE_FILE');
  const raw = readFileSync(file); pins[file] = rawDigest(raw); return raw.toString('utf8');
}
const object = z.record(z.string(), z.unknown());
const authorizationSchema = z.strictObject({ authorizationId: text, maxInvocations: z.number().int().positive(),
  maxReportedTokens: z.number().int().positive(), maxWallTimeMs: z.number().int().positive() });
const continuationSchema = z.strictObject({ parentRoot: text, parentLockDigest: hash, parentReportDigest: hash, parentCheckpointDigest: hash,
  continuedBatchIndexes: z.array(z.number().int().nonnegative()), failedBatchIndexes: z.array(z.number().int().nonnegative()) });
const lockSchema = z.object({ schemaVersion: z.enum(['codex-semantic-judge-lock/1', 'codex-semantic-judge-lock/2', 'codex-semantic-judge-continuation-lock/2']),
  pins: z.strictObject({ source: z.record(text, hash), compiled: z.record(text, hash) }), pinDigest: hash, inputDigest: hash,
  rubricDigest: hash, requestDigests: z.array(hash), judge: CodexProfileSchema, assurance: z.enum(['mock', 'codex-chatgpt']),
  authorization: authorizationSchema, maxRequestBytes: z.number(), timeoutMs: z.number(), batchSize: z.literal(6),
  continuation: continuationSchema.optional() }).passthrough();
const checkpointSchema = z.strictObject({ schemaVersion: z.literal('codex-semantic-judge-checkpoint/2'), inputDigest: hash, pinDigest: hash,
  rubricDigest: hash, authorizationDigest: hash, lockDigest: hash,
  batches: z.array(z.strictObject({ index: z.number().int().nonnegative(), inputIds: z.array(text), requestDigest: hash })) });
const checkpointEventSchema = z.strictObject({ schemaVersion: z.literal('codex-semantic-judge-checkpoint-event/2'),
  index: z.number().int().nonnegative(), attemptId: text, requestDigest: hash, inputIds: z.array(text), state: z.literal('dispatch-reserved'), at: text });
const callSchema = z.object({ index: z.number().int().nonnegative(), attemptId: text, requestDigest: hash,
  expectedConfigurationDigest: hash.optional(), result: z.unknown().nullable(), status: text }).passthrough();
const calibrationReviewSchema = z.strictObject({ schemaVersion: z.literal('codex-calibration-independent-review/1'), reviewerKind: z.literal('ai'),
  humanAttestation: z.null(), method: z.literal('independent-model-review'), reviewerModel: text, reviewedAt: z.iso.datetime({ offset: true }),
  inputsDigest: hash, labelsDigest: hash, lockDigest: hash, rubricDigest: hash,
  rawFileDigests: z.strictObject({ inputs: hash, labels: hash, lock: hash }),
  judgments: z.array(z.strictObject({ id: text, labelDigest: hash, judgment: z.enum(['accept', 'reject']), rationale: text })).length(32),
  coverage: z.strictObject({ planned: z.literal(32), reviewed: z.literal(32) }), phaseGate: z.literal('Not evaluated'), releaseEligible: z.literal(false) });

/** The same label bindings are checked before blind dispatch and again during acceptance. */
export function loadReviewedCalibration(options: { calibrationRoot: string; reviewPath: string }) {
  const pins: Record<string, string> = {}, readJson = (file: string) => JSON.parse(read(file, pins)) as unknown;
  const root = path.resolve(options.calibrationRoot), inputs = z.array(JudgmentInputSchema).length(32).parse(readJson(path.join(root, 'inputs.json')));
  const labels = z.array(z.strictObject({ id: text, family: text, expectedPass: z.boolean(), criticalFalseAcceptanceRisk: z.boolean(),
    coverageTags: z.array(text).min(1), rationale: text, authorId: text, reviewStatus: text })).length(32).parse(readJson(path.join(root, 'evaluator/labels.json')));
  const lock = readJson(path.join(root, 'check.lock.json')), review = calibrationReviewSchema.parse(readJson(path.resolve(options.reviewPath)));
  if (new Set(labels.map(x => x.id)).size !== 32 || digest(inputs) !== review.inputsDigest || digest(labels) !== review.labelsDigest || digest(lock) !== review.lockDigest
    || review.rubricDigest !== SEMANTIC_RUBRIC_DIGEST || review.rawFileDigests.inputs !== pins[path.join(root, 'inputs.json')]
    || review.rawFileDigests.labels !== pins[path.join(root, 'evaluator/labels.json')] || review.rawFileDigests.lock !== pins[path.join(root, 'check.lock.json')]
    || new Set(review.judgments.map(j => j.id)).size !== 32 || review.judgments.some(j => j.judgment !== 'accept' || !labels.some(l => l.id === j.id && digest(l) === j.labelDigest))
    || new Set(inputs.map(i => i.id)).size !== 32 || inputs.some(i => i.task.split !== 'dev' || !labels.some(l => l.id === i.id && l.family === i.task.family))) throw Error('ACCEPTANCE_CALIBRATION_REVIEW_BINDING');
  return { inputs, labels, review, pins };
}
/** Validates files and replayed blind assessments; neither a label-review nor a report PASS string can satisfy calibration. */
export function validateFrozenCalibration(options: { calibrationRoot: string; reviewPath: string; judgmentRoot: string;
  judge: CodexProfile; authorization: SubscriptionAuthorization; pinDigest: string; usageRoot: string }) {
  const { inputs, labels, review, pins } = loadReviewedCalibration(options);
  const replay = replayCodexJudgments({ root: options.judgmentRoot, inputs, judge: options.judge, pinDigest: options.pinDigest, authorization: options.authorization });
  const admitted = z.object({ purpose: z.literal('fresh-independent-calibration'), usageRoot: text,
    calibrationAdmission: z.strictObject({ schemaVersion: z.literal('fresh-calibration-admission/1'), reviewDigest: hash,
      preparationPins: z.record(text, hash), priorExposureMatches: z.literal(0) }) }).passthrough().parse(replay.lock);
  if (realpathSync(admitted.usageRoot) !== realpathSync(options.usageRoot) || admitted.calibrationAdmission.reviewDigest !== digest(review)
    || digest(admitted.calibrationAdmission.preparationPins) !== digest(pins)) throw Error('ACCEPTANCE_CALIBRATION_ADMISSION_BINDING');
  const registry = new ExposureRegistry(options.usageRoot);
  try {
    for (const input of inputs) {
      const records = registry.inspect(input.task).records;
      if (!records.length || records.some(record => !replay.attempts.some(attempt => record.attemptId.startsWith(`${attempt.attemptId}:`)
        && record.requestDigest === attempt.requestDigest) || record.inputSnapshotDigest !== digest(inputs)
        || record.campaignId !== `judge:${digest(inputs)}` || record.assurance !== replay.lock.assurance)) throw Error('ACCEPTANCE_CALIBRATION_REUSED_OR_UNBOUND_EXPOSURE');
    }
  } finally { registry.close(); }
  const assessments = new Map(replay.assessments.map(row => [row.id, row.assessment.advisoryPass]));
  const summary = summarizeCalibration(labels.map(label => ({ id: label.id, family: label.family, expectedPass: label.expectedPass,
    actualPass: assessments.has(label.id) ? assessments.get(label.id)! : null })));
  const positives = labels.filter(l => l.expectedPass), negatives = labels.filter(l => !l.expectedPass);
  const positiveAgreement = positives.filter(l => assessments.get(l.id) === true).length, negativeAgreement = negatives.filter(l => assessments.get(l.id) === false).length;
  const criticalFalseAccepts = labels.filter(l => l.criticalFalseAcceptanceRisk && assessments.get(l.id) === true).length;
  const requiredCategories = ['paraphrase', 'unsupported-execution', 'false-premise', 'conflict', 'missing-source', 'revision', 'constraint-meaning', 'correct-abstention'];
  const categories = Object.fromEntries(requiredCategories.map(tag => [tag, labels.filter(l => l.coverageTags.includes(tag)).length]));
  const correctAbstentions = labels.filter(l => l.expectedPass && inputs.find(i => i.id === l.id)?.answer.disposition === 'abstain');
  const criteriaPass = replay.complete && positives.length === 16 && negatives.length === 16
    && new Set(labels.map(l => l.family)).size === 8 && negatives.every(l => l.criticalFalseAcceptanceRisk)
    && Object.values(categories).every(count => count > 0) && correctAbstentions.length > 0 && correctAbstentions.every(l => assessments.get(l.id) === true)
    && positiveAgreement >= 15 && negativeAgreement >= 15 && criticalFalseAccepts === 0;
  return { reviewDigest: digest(review), replayDigest: replay.evidenceDigest, summary, positiveAgreement, negativeAgreement, criticalFalseAccepts,
    categories, correctAbstentions: correctAbstentions.length, correctAbstentionsPassed: correctAbstentions.filter(l => assessments.get(l.id) === true).length,
    criteriaPass, assurance: replay.lock.assurance, pass: criteriaPass && replay.lock.assurance === 'codex-chatgpt', phaseGate: 'Not evaluated' as const, releaseEligible: false as const };
}

interface ReplayedJudgments {
  assessments: ReturnType<typeof parseBatchedJudgments>; pins: Record<string, string>; lock: z.infer<typeof lockSchema>;
  stoppedReason: string | null; budget: Record<string, unknown>; attempts: { attemptId: string; requestDigest: string }[];
  reservedBatchIndexes: number[]; failedBatchIndexes: number[]; complete: boolean; evidenceDigest: string;
}
/** Replays receipts; a continuation cannot salvage a malformed parent batch or mint acceptance. */
export function replayCodexJudgments(options: { root: string; inputs: readonly JudgmentInput[]; judge: CodexProfile;
  pinDigest: string; authorization: SubscriptionAuthorization; frozenProtocolDigest?: string }): ReplayedJudgments {
  const pins: Record<string, string> = {}, readJson = (name: string) => JSON.parse(read(path.join(options.root, name), pins)) as unknown;
  const inputs = z.array(JudgmentInputSchema).parse(readJson('inputs.json'));
  const lock = lockSchema.parse(readJson('lock.json'));
  const report = z.object({ inputDigest: hash, pinDigest: hash, rubricDigest: hash, judge: CodexProfileSchema,
    assurance: z.enum(['mock', 'codex-chatgpt']), planned: z.number().int(), assessed: z.number().int(), stoppedReason: text.nullable(),
    assessments: z.array(object), budget: object }).passthrough().parse(readJson('report.json'));
  if (digest(inputs) !== digest(options.inputs) || lock.inputDigest !== digest(inputs) || report.inputDigest !== lock.inputDigest
    || lock.pinDigest !== digest(lock.pins) || lock.pinDigest !== options.pinDigest || report.pinDigest !== lock.pinDigest
    || lock.rubricDigest !== SEMANTIC_RUBRIC_DIGEST || report.rubricDigest !== lock.rubricDigest
    || digest(lock.judge) !== digest(options.judge) || digest(report.judge) !== digest(lock.judge)
    || report.assurance !== lock.assurance || digest(lock.authorization) !== digest(options.authorization)) throw Error('ACCEPTANCE_JUDGE_BINDING');
  const batches = Array.from({ length: Math.ceil(inputs.length / 6) }, (_, index) => inputs.slice(index * 6, index * 6 + 6));
  const requests = batches.map(batch => options.frozenProtocolDigest
    ? buildBatchedFrozenHoldoutJudgmentRequest(batch, options.judge, options.frozenProtocolDigest)
    : buildBatchedJudgmentRequest(batch, options.judge));
  if (digest(requests.map(digest)) !== digest(lock.requestDigests)) throw Error('ACCEPTANCE_JUDGE_REQUEST_BINDING');
  const readLines = (name: string) => existsSync(path.join(options.root, name))
    ? read(path.join(options.root, name), pins).trim().split('\n').filter(Boolean).map(line => JSON.parse(line) as unknown) : [];
  const continued = lock.schemaVersion === 'codex-semantic-judge-continuation-lock/2';
  let parent: ReplayedJudgments | null = null, plannedIndexes = batches.map((_, index) => index);
  if (continued) {
    const c = lock.continuation;
    if (!c || options.frozenProtocolDigest || lock.purpose !== 'advisory-dev-calibration'
      || realpathSync(c.parentRoot) === realpathSync(options.root)) throw Error('ACCEPTANCE_JUDGE_CONTINUATION_SCOPE');
    const parentLock = lockSchema.parse(JSON.parse(read(path.join(c.parentRoot, 'lock.json'), pins)));
    const parentReport = JSON.parse(read(path.join(c.parentRoot, 'report.json'), pins)) as unknown;
    const parentCheckpoint = JSON.parse(read(path.join(c.parentRoot, 'checkpoint.json'), pins)) as unknown;
    if (parentLock.schemaVersion !== 'codex-semantic-judge-lock/2' || parentLock.continuation
      || digest(parentLock) !== c.parentLockDigest || digest(parentReport) !== c.parentReportDigest
      || digest(parentCheckpoint) !== c.parentCheckpointDigest || parentLock.usageRoot !== lock.usageRoot
      || digest({ ...parentLock, schemaVersion: lock.schemaVersion, continuation: c }) !== digest(lock)) throw Error('ACCEPTANCE_JUDGE_PARENT_BINDING');
    parent = replayCodexJudgments({ ...options, root: c.parentRoot });
    Object.assign(pins, parent.pins);
    plannedIndexes = plannedIndexes.filter(index => !parent!.reservedBatchIndexes.includes(index));
    if (digest(c.continuedBatchIndexes) !== digest(plannedIndexes) || digest(c.failedBatchIndexes) !== digest(parent.failedBatchIndexes)
      || digest(report.continuation) !== digest(c)) throw Error('ACCEPTANCE_JUDGE_CONTINUATION_COVERAGE');
    const usageRoot = z.string().parse(lock.usageRoot);
    const claimPath = path.join(usageRoot, `judgment-continuation-${digest({ parentRoot: realpathSync(c.parentRoot), checkpoint: c.parentCheckpointDigest }).slice(7)}.json`);
    const claim = z.strictObject({ schemaVersion: z.literal('codex-semantic-judge-continuation-claim/2'), parentRoot: text,
      parentCheckpointDigest: hash, parentReportDigest: hash, childRoot: text }).parse(JSON.parse(read(claimPath, pins)));
    if (realpathSync(claim.parentRoot) !== realpathSync(c.parentRoot) || claim.parentCheckpointDigest !== c.parentCheckpointDigest
      || claim.parentReportDigest !== c.parentReportDigest || realpathSync(claim.childRoot) !== realpathSync(options.root)) throw Error('ACCEPTANCE_JUDGE_CONTINUATION_CLAIM');
  } else if (lock.continuation) throw Error('ACCEPTANCE_JUDGE_CONTINUATION_SCOPE');
  if (lock.schemaVersion === 'codex-semantic-judge-lock/2') {
    const checkpoint = checkpointSchema.parse(readJson('checkpoint.json'));
    const expectedBatches = batches.map((batch, index) => ({ index, inputIds: batch.map(input => input.id), requestDigest: digest(requests[index]!) }));
    if (checkpoint.inputDigest !== lock.inputDigest || checkpoint.pinDigest !== lock.pinDigest || checkpoint.rubricDigest !== lock.rubricDigest
      || checkpoint.authorizationDigest !== digest(lock.authorization) || checkpoint.lockDigest !== digest(lock)
      || digest(checkpoint.batches) !== digest(expectedBatches)) throw Error('ACCEPTANCE_JUDGE_CHECKPOINT_BINDING');
  }
  const calls = readLines('calls.jsonl').map(row => callSchema.parse(row));
  if (new Set(calls.map(c => c.index)).size !== calls.length || new Set(calls.map(c => c.attemptId)).size !== calls.length
    || calls.some((c, index) => c.index !== plannedIndexes[index] || c.index >= batches.length)
    || calls.some(c => parent?.attempts.some(p => p.attemptId === c.attemptId))) throw Error('ACCEPTANCE_JUDGE_CALL_COVERAGE');
  if (lock.schemaVersion !== 'codex-semantic-judge-lock/1') {
    const events = readLines('checkpoint-events.jsonl').map(row => checkpointEventSchema.parse(row));
    const exposures = readLines('exposure.jsonl').map(row => z.object({ index: z.number().int().nonnegative(), attemptId: text,
      requestDigest: hash, inputIds: z.array(text), status: z.literal('possibly-exposed') }).passthrough().parse(row));
    if (events.length !== calls.length || exposures.length !== calls.length || calls.some((call, index) => {
      const e = events[index]!, x = exposures[index]!;
      return e.index !== call.index || e.attemptId !== call.attemptId || e.requestDigest !== call.requestDigest
        || digest(e.inputIds) !== digest(batches[call.index]!.map(i => i.id)) || x.index !== e.index || x.attemptId !== e.attemptId
        || x.requestDigest !== e.requestDigest || digest(x.inputIds) !== digest(e.inputIds);
    })) throw Error('ACCEPTANCE_JUDGE_DISPATCH_HISTORY');
  }
  const native = createCodexTransport({ timeoutMs: lock.timeoutMs, maxRequestBytes: lock.maxRequestBytes });
  const assessments: ReturnType<typeof parseBatchedJudgments> = [...(parent?.assessments ?? [])];
  const ownAssessments: ReturnType<typeof parseBatchedJudgments> = [], validBatchIndexes: number[] = [];
  const assessmentJournal: { index: number; requestDigest: string; assessments: ReturnType<typeof parseBatchedJudgments> }[] = [];
  for (const call of calls) {
    const request = requests[call.index]!;
    if (digest(readJson(`request-${call.index}.json`)) !== digest(request) || call.requestDigest !== digest(request)) throw Error('ACCEPTANCE_JUDGE_REQUEST_DRIFT');
    if (call.result === null) continue;
    const result = CodexReceiptSchema.parse(call.result);
    if (result.requestDigest !== digest(request) || result.requestedModel !== options.judge.model
      || result.renderedRequestDigest !== digest(renderCodexRequest(request)) || result.launchPolicyDigest !== CODEX_LAUNCH_POLICY_DIGEST
      || result.configurationDigest !== call.expectedConfigurationDigest
      || (lock.assurance === 'codex-chatgpt' && result.configurationDigest !== native.configurationDigest(request))) throw Error('ACCEPTANCE_JUDGE_RECEIPT_BINDING');
    if (call.status !== 'completed') continue;
    if (result.status !== 'completed' || !validCodexTokens(result) || result.cliVersion !== CODEX_CLI_VERSION || result.issues.length) throw Error('ACCEPTANCE_JUDGE_COMPLETION_INVALID');
    // Invalid structured judgments remain unassessed; they cannot be repaired during replay.
    try {
      const batch = parseBatchedJudgments(batches[call.index]!, result.output);
      assessments.push(...batch); ownAssessments.push(...batch); validBatchIndexes.push(call.index);
      assessmentJournal.push({ index: call.index, requestDigest: call.requestDigest, assessments: batch });
    } catch { /* report must retain missing assessments */ }
  }
  if (lock.schemaVersion !== 'codex-semantic-judge-lock/1' && digest(readLines('assessments.jsonl')) !== digest(assessmentJournal)) throw Error('ACCEPTANCE_JUDGE_ASSESSMENT_JOURNAL_DRIFT');
  const reservedBatchIndexes = [...(parent?.reservedBatchIndexes ?? []), ...calls.map(call => call.index)].sort((a, b) => a - b);
  const failedBatchIndexes = [...(parent?.failedBatchIndexes ?? []), ...calls.filter(call => !validBatchIndexes.includes(call.index)).map(call => call.index)].sort((a, b) => a - b);
  if (continued && (digest(report.failedBatchIndexes) !== digest(failedBatchIndexes) || report.ownAssessed !== ownAssessments.length
    || report.complete !== false)) throw Error('ACCEPTANCE_JUDGE_CONTINUATION_REPORT');
  if (report.planned !== inputs.length || report.assessed !== assessments.length || digest(report.assessments) !== digest(assessments)) throw Error('ACCEPTANCE_JUDGE_ASSESSMENT_DRIFT');
  return { assessments, pins, lock, stoppedReason: report.stoppedReason, budget: report.budget,
    attempts: [...(parent?.attempts ?? []), ...calls.map(call => ({ attemptId: call.attemptId, requestDigest: call.requestDigest }))],
    reservedBatchIndexes, failedBatchIndexes,
    complete: !continued && report.stoppedReason === null && assessments.length === inputs.length && calls.length === requests.length,
    evidenceDigest: digest({ pins, assessments, stoppedReason: report.stoppedReason }) };
}

export interface AcceptanceOutcome { trialId: string; caseId: string; arm: 'F' | 'R' | 'C1' | 'C3' | 'G';
  visibleByteAllowance: number; repeat: number; pass: boolean; canonicalPreserved: boolean; hardGateFailure: boolean }
type PlannedTrial = FrozenCodexAcceptanceProtocol['trialManifest'][number];
const key = (row: Pick<AcceptanceOutcome, 'caseId' | 'arm' | 'visibleByteAllowance' | 'repeat'>) => canonicalJson([row.caseId, row.arm, row.visibleByteAllowance, row.repeat]);

/** All-planned denominators. Missing cases, strata and repeats never disappear from the result. */
export function assessPlannedAcceptance(manifest: readonly PlannedTrial[], outcomes: readonly AcceptanceOutcome[],
  answerability: Readonly<Record<string, 'answerable' | 'unanswerable' | 'conflict'>>) {
  if (!manifest.length || new Set(manifest.map(key)).size !== manifest.length || new Set(outcomes.map(key)).size !== outcomes.length
    || outcomes.some(row => !manifest.some(p => key(p) === key(row)))) throw Error('ACCEPTANCE_OUTCOME_COVERAGE');
  const cases = [...new Set(manifest.map(row => row.caseId))];
  if (cases.some(id => !Object.hasOwn(answerability, id))) throw Error('ACCEPTANCE_ANSWERABILITY_COVERAGE');
  const allowances = [...new Set(manifest.map(row => row.visibleByteAllowance))], byKey = new Map(outcomes.map(row => [key(row), row]));
  const rows = manifest.map(row => ({ ...row, outcome: byKey.get(key(row)) ?? null }));
  const strata = allowances.flatMap(allowance => (['F', 'R', 'C1', 'C3'] as const).map(arm => {
    const planned = rows.filter(row => row.visibleByteAllowance === allowance && row.arm === arm);
    const passedCaseIds = cases.filter(id => { const repeats = planned.filter(row => row.caseId === id);
      return repeats.length === 2 && new Set(repeats.map(row => row.repeat)).size === 2
        && repeats.every(row => row.outcome?.pass === true && row.outcome.canonicalPreserved && !row.outcome.hardGateFailure); });
    const requiredAbstentionCaseIds = cases.filter(id => answerability[id] !== 'answerable');
    const missing = planned.filter(row => !row.outcome).length;
    return { arm, visibleByteAllowance: allowance, planned: planned.length, missing, uniqueCases: cases.length,
      passedCases: passedCaseIds.length, requiredAbstentionCases: requiredAbstentionCaseIds.length,
      passedAbstentionCases: requiredAbstentionCaseIds.filter(id => passedCaseIds.includes(id)).length,
      successRate: passedCaseIds.length / cases.length, interval: wilsonInterval(passedCaseIds.length, cases.length),
      pass: planned.length === cases.length * 2 && passedCaseIds.length / cases.length >= 0.9
        && requiredAbstentionCaseIds.every(id => passedCaseIds.includes(id)) };
  }));
  const main = rows.filter(row => row.arm !== 'G'), controls = rows.filter(row => row.arm === 'G');
  const hardGateFailures = rows.filter(row => row.outcome?.hardGateFailure || (row.outcome && !row.outcome.canonicalPreserved)).length;
  return { strata, planned: rows.length, observed: outcomes.length, missing: rows.filter(row => !row.outcome).length,
    mainPassed: main.filter(row => row.outcome?.pass).length, controlsPassed: controls.filter(row => row.outcome?.pass).length,
    controlsPlanned: controls.length, hardGateFailures,
    pass: cases.length === 10 && allowances.length === 3 && main.length === 240 && controls.length === 60
      && strata.every(s => s.pass) && hardGateFailures === 0,
    intervalInterpretation: 'Descriptive reference for ten authored families, not a population reliability estimate' };
}

/** Evaluator-only bridge. Oracle stays in host memory; the native judgment builder strips it. */
export function prepareAcceptanceJudgmentInputs(campaignRoot: string, frozen: FrozenCodexAcceptanceProtocol) {
  const bundle = loadCodexReviewBundle(campaignRoot), dataset = loadPublicDataset(frozen.protocol.datasetRoot), oracle = loadEvaluatorOracle(frozen.protocol.datasetRoot);
  if (bundle.campaign.datasetSealDigest !== frozen.datasetSealDigest || bundle.campaign.implementationDigest !== digest(frozen.sourcePins)
    || bundle.campaign.compiledDigest !== digest(frozen.compiledPins) || bundle.campaign.configDigest !== digest(frozenAcceptanceCampaignConfig(frozen))) throw Error('ACCEPTANCE_CAMPAIGN_BINDING');
  const reportPins: Record<string, string> = {}, reportPath = path.join(campaignRoot, 'report.json');
  const report = z.object({ trials: z.array(z.object({ trialId: text, caseId: text, arm: z.enum(['full', 'retrieval', 'compaction', 'oracle-evidence']),
    compactionRounds: z.number().int().nonnegative(), repeat: z.number().int(), visibleByteAllowance: z.number().int(),
    canonicalPreserved: z.boolean(), status: text }).passthrough()) }).passthrough().parse(JSON.parse(read(reportPath, reportPins)));
  if (reportPins[reportPath] !== bundle.campaign.reportRawDigest || report.trials.length !== bundle.items.length) throw Error('ACCEPTANCE_REPORT_REREAD_DRIFT');
  const native = createCodexTransport({ timeoutMs: frozen.protocol.perCallTimeoutMs, maxRequestBytes: Math.max(...frozen.protocol.visibleByteAllowances) });
  const mappings: { id: string; trialId: string }[] = [], inputs: JudgmentInput[] = [];
  const canonicalRetention: Record<string, boolean> = {};
  for (const [index, item] of bundle.items.entries()) {
    const trial = report.trials[index]!, planned = frozen.trialManifest[index];
    const arm = trial.arm === 'full' ? 'F' : trial.arm === 'retrieval' ? 'R' : trial.arm === 'oracle-evidence' ? 'G' : `C${trial.compactionRounds}`;
    if (!planned || item.trialId !== trial.trialId || item.trialId !== `codex-${String(index + 1).padStart(5, '0')}`
      || arm !== planned.arm || trial.caseId !== planned.caseId || trial.visibleByteAllowance !== planned.visibleByteAllowance
      || trial.compactionRounds !== planned.compactionRounds || trial.repeat !== planned.repeat) throw Error('ACCEPTANCE_OBSERVED_MANIFEST_BINDING');
    const original = dataset.cases.find(c => c.id === item.caseId), gold = oracle.find(g => g.caseId === item.caseId);
    if (!original || !gold || original.split !== 'holdout' || !frozen.protocol.caseIds.includes(original.id)) throw Error('ACCEPTANCE_INPUT_CASE_BINDING');
    const expectedTask = semanticTaskSpec(original, digest(frozen.protocol.reader));
    const expectedHistory = `${original.history}\n${neutralAcceptanceHistory()}`;
    const scope = { repoId: original.repoId, allowedPaths: original.allowedPaths, taskClasses: [original.taskClass] };
    const contexts = item.publicContext.map((entry, generation) => {
      const packet = z.object({ task: object, scope: object, role: text, generation: z.number(), parentWindowDigest: hash.nullable(),
        bundle: z.object({ unknowns: z.array(object) }), history: z.object({ content: z.string(), trust: z.literal('untrusted-data'), originalHistoryDigest: hash }),
        resources: z.array(z.object({ instructionAuthority: z.literal('none'), content: z.string(), pin: z.object({ ref: text, revision: text, contentHash: hash,
          status: z.literal('active'), trust: z.literal('untrusted-data'), scope: object }) })) }).passthrough().parse(entry.packet);
      if (digest(packet.task) !== digest(expectedTask) || digest(packet.bundle.unknowns) !== digest(original.unknowns)
        || digest(packet.scope) !== digest(scope) || packet.role !== frozen.protocol.reader.role || packet.generation !== generation
        || packet.parentWindowDigest !== (generation === 0 ? null : item.publicContext[generation - 1]!.windowDigest)
        || packet.history.originalHistoryDigest !== rawDigest(expectedHistory) || (generation === 0 && packet.history.content !== expectedHistory)) throw Error('ACCEPTANCE_CANONICAL_RETENTION');
      for (const resource of packet.resources) {
        const document = dataset.documents.find(d => d.id === resource.pin.ref);
        if (!document || document.repoId !== original.repoId || document.taskClass !== original.taskClass || document.lifecycle !== 'active' || document.freshness !== 'fresh'
          || !original.allowedPaths.some(p => document.path === p || document.path.startsWith(`${p}/`)) || document.text !== resource.content
          || document.revision !== resource.pin.revision || rawDigest(document.text) !== resource.pin.contentHash || digest(resource.pin.scope) !== digest(scope)) throw Error('ACCEPTANCE_RESOURCE_BINDING');
      }
      if (generation > 0 && digest(entry.packet.resources) !== digest(item.publicContext[0]!.packet.resources)) throw Error('ACCEPTANCE_REHYDRATION_DRIFT');
      return packet;
    });
    canonicalRetention[item.trialId] = contexts.length > 0;
    if (item.status === 'completed' && (contexts.length !== planned.compactionRounds + 1
      || digest(item.calls.map(call => call.stage)) !== digest([...Array.from({ length: planned.compactionRounds }, (_, n) => `compact-${n}`), 'reader']))) throw Error('ACCEPTANCE_CHECKPOINT_COVERAGE');
    for (const call of item.calls) {
      if (call.result && bundle.campaign.assurance === 'codex-chatgpt' && call.result.configurationDigest !== native.configurationDigest(call.request)) throw Error('ACCEPTANCE_READER_CONFIGURATION_BINDING');
      if (call.status === 'completed' && Math.max(Buffer.byteLength(canonicalJson(call.request)), Buffer.byteLength(renderCodexRequest(call.request))) > planned.visibleByteAllowance) throw Error('ACCEPTANCE_VISIBLE_ALLOWANCE_BYPASS');
    }
    if (item.answer === null) continue;
    const packet = z.object({ history: z.object({ content: z.string() }), resources: z.array(z.object({ pin: z.object({ ref: text }), content: z.string() })) }).passthrough()
      .parse(item.publicContext.at(-1)?.packet);
    const documents = packet.resources.map(resource => {
      const document = dataset.documents.find(d => d.id === resource.pin.ref);
      if (!document || document.text !== resource.content) throw Error('ACCEPTANCE_INPUT_DOCUMENT_BINDING'); return document;
    });
    const id = `item-${digest(item.trialId).slice(7, 31)}`;
    inputs.push(JudgmentInputSchema.parse({ id, task: { ...original, history: packet.history.content }, documents,
      answer: item.answer, gold, readerModel: item.requestedModel })); mappings.push({ id, trialId: item.trialId });
  }
  return { bundle, inputs, mappings, trials: report.trials, canonicalRetention };
}

export interface VerifiedAcceptanceEvidence {
  readonly schemaVersion: 'verified-starter-acceptance/1'; readonly scope: 'finite-authored-infrastructure-starter';
  readonly t11ArtifactVersion: string; readonly t19ArtifactVersion: string; readonly implementationPin: string; readonly protocolDigest: string;
  readonly receiptDigest: string; readonly modelOutputDigest: string; readonly assessmentDigest: string;
  readonly sourceRevision: string; readonly sourceBytes: string; readonly sourceBytesSha256: string; readonly trialId: string;
  readonly answerDisposition: 'answer' | 'abstain'; readonly gate: 'PASS'; readonly reviewerKind: 'ai';
  readonly humanAttestation: null; readonly releaseEligible: false;
}
const verified = new WeakSet<object>();
export function isVerifiedAcceptanceEvidence(value: unknown): value is VerifiedAcceptanceEvidence {
  return typeof value === 'object' && value !== null && verified.has(value);
}

/** Issues only a finite measurement capability. JSON reloading or a caller's PASS flag cannot mint it. */
export function adjudicateCodexAcceptance(options: { protocolFile: string; frozen: FrozenCodexAcceptanceProtocol; campaignRoot: string; judgmentRoot: string }) {
  const current = freezeCodexAcceptanceProtocol(options.protocolFile);
  if (current.freezeDigest !== options.frozen.freezeDigest) throw Error('ACCEPTANCE_FINAL_FREEZE_DRIFT');
  const { bundle, inputs, mappings, trials, canonicalRetention } = prepareAcceptanceJudgmentInputs(options.campaignRoot, current);
  const judgments = replayCodexJudgments({ root: options.judgmentRoot, inputs, judge: current.protocol.judge,
    pinDigest: digest({ source: current.sourcePins, compiled: current.compiledPins }), authorization: current.protocol.authorization, frozenProtocolDigest: current.freezeDigest });
  const assessments = new Map(judgments.assessments.map(row => [row.id, row.assessment]));
  const reviewIssuePath = path.join(options.judgmentRoot, 'review-issues.json');
  const issueFileExists = () => {
    try { lstatSync(reviewIssuePath); return true; }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false; throw error; }
  };
  const hadIssueFile = issueFileExists();
  const reportedIssues = hadIssueFile
    ? z.array(JudgmentReviewIssueSchema).parse(JSON.parse(read(reviewIssuePath, judgments.pins))) : [];
  const diagnostics = diagnoseAcceptanceJudgments(inputs, judgments.assessments, { protocolDigest: current.freezeDigest,
    sourcePinDigest: digest({ source: current.sourcePins, compiled: current.compiledPins }), judgmentEvidenceDigest: judgments.evidenceDigest }, reportedIssues);
  const outcomes: AcceptanceOutcome[] = trials.map(trial => {
    const mapping = mappings.find(m => m.trialId === trial.trialId), assessment = mapping ? assessments.get(mapping.id) : undefined;
    const arm = trial.arm === 'full' ? 'F' : trial.arm === 'retrieval' ? 'R' : trial.arm === 'oracle-evidence' ? 'G' : trial.compactionRounds === 1 ? 'C1' : trial.compactionRounds === 3 ? 'C3' : null;
    if (!arm) throw Error('ACCEPTANCE_ARM_BINDING');
    return { trialId: trial.trialId, caseId: trial.caseId, arm, visibleByteAllowance: trial.visibleByteAllowance, repeat: trial.repeat,
      pass: trial.status === 'completed' && assessment?.advisoryPass === true, canonicalPreserved: canonicalRetention[trial.trialId] === true,
      hardGateFailure: !!assessment && (!assessment.hardChecksPass || !assessment.judgment.respectsConstraintMeaning) };
  });
  const oracle = loadEvaluatorOracle(current.protocol.datasetRoot), quality = assessPlannedAcceptance(current.trialManifest, outcomes,
    Object.fromEntries(oracle.map(g => [g.caseId, g.answerability])));
  const nativeEvidence = current.protocol.measurementMode === 'native' && bundle.campaign.assurance === 'codex-chatgpt' && judgments.lock.assurance === 'codex-chatgpt';
  const pass = quality.pass && nativeEvidence && bundle.campaign.integrityStable && bundle.campaign.stoppedReason === null && judgments.complete
    && diagnostics.reviewIssues.length === 0;
  const body = { schemaVersion: 'codex-starter-acceptance-result/1', scope: 'finite-authored-infrastructure-starter',
    protocolDigest: current.freezeDigest, campaign: bundle.campaign, judgmentEvidenceDigest: judgments.evidenceDigest,
    nativeEvidence, quality, diagnostics, humanAttestation: null, reviewerKind: 'ai', t19: pass ? 'PASS' : 'Replan', t11: pass ? 'PASS' : 'Replan',
    phaseGate: 'Not evaluated', t14: 'Not evaluated', releaseEligible: false,
    limitations: ['Finite authored baseline only; no population or production claim', 'Requested model identity; backend version unknown',
      'AI reviews are not human attestations', 'Local file and principal trust; hashes do not authenticate the host operator'] };
  const report = { ...body, artifactDigest: digest(body) };
  // Recheck every consumed file and protocol immediately before minting a capability.
  for (const [file, expected] of Object.entries(bundle.artifactPins)) if (rawDigest(readFileSync(path.join(options.campaignRoot, file))) !== expected) throw Error('ACCEPTANCE_FINAL_CAMPAIGN_DRIFT');
  for (const [file, expected] of Object.entries(judgments.pins)) if (rawDigest(readFileSync(file)) !== expected) throw Error('ACCEPTANCE_FINAL_JUDGMENT_DRIFT');
  if (issueFileExists() !== hadIssueFile) throw Error('ACCEPTANCE_FINAL_REVIEW_ISSUES_DRIFT');
  if (freezeCodexAcceptanceProtocol(options.protocolFile).freezeDigest !== current.freezeDigest) throw Error('ACCEPTANCE_FINAL_FREEZE_DRIFT');
  let evidence: VerifiedAcceptanceEvidence | null = null;
  if (pass) {
    const chosen = outcomes.find(row => row.arm !== 'G' && row.pass)!, item = bundle.items.find(row => row.trialId === chosen.trialId)!;
    const reader = item.calls.find(call => call.stage === 'reader')!, mapping = mappings.find(m => m.trialId === chosen.trialId)!;
    const assessment = assessments.get(mapping.id)!;
    const metadata = { schemaVersion: 'accepted-measurement-observation/1', trialId: item.trialId, requestedModel: item.requestedModel,
      requestDigest: reader.requestDigest, modelOutputDigest: item.answerDigest!, receiptDigest: digest(reader.result), assessmentDigest: digest(assessment),
      protocolDigest: current.freezeDigest, acceptanceArtifact: report.artifactDigest, scope: body.scope,
      observation: 'A native candidate output and independent AI assessment were recorded for this finite infrastructure benchmark.',
      humanAttestation: null, releaseEligible: false };
    const sourceBytes = canonicalJson(metadata);
    evidence = Object.freeze({ schemaVersion: 'verified-starter-acceptance/1', scope: 'finite-authored-infrastructure-starter',
      t11ArtifactVersion: report.artifactDigest, t19ArtifactVersion: report.artifactDigest, implementationPin: bundle.campaign.implementationDigest,
      protocolDigest: current.freezeDigest, receiptDigest: metadata.receiptDigest, modelOutputDigest: metadata.modelOutputDigest,
      assessmentDigest: metadata.assessmentDigest, sourceRevision: current.freezeDigest, sourceBytes, sourceBytesSha256: rawDigest(sourceBytes),
      trialId: item.trialId, answerDisposition: item.answer!.disposition, gate: 'PASS', reviewerKind: 'ai', humanAttestation: null, releaseEligible: false });
    verified.add(evidence);
  }
  return { report, evidence };
}
