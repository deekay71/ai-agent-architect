import { appendFileSync, closeSync, existsSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, writeFileSync } from 'node:fs';
import { realpathSync } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { canonicalJson, digest } from '../contracts/canonical.js';
import { CODEX_CLI_VERSION, CODEX_LAUNCH_POLICY_DIGEST, renderCodexRequest, type CodexTransport } from '../providers/codex.js';
import { implementationPins } from './campaign.js';
import { CodexProfileSchema, type CodexProfile } from './codex-config.js';
import { CodexReceiptSchema, validCodexTokens } from './codex-receipt.js';
import { SubscriptionBudget, type SubscriptionAuthorization } from './subscription-budget.js';
import { JudgmentInputSchema, SEMANTIC_RUBRIC_DIGEST, buildBatchedJudgmentRequest, buildBatchedFrozenHoldoutJudgmentRequest, parseBatchedJudgments, type JudgmentInput } from './semantic-judgment.js';
import { ExposureRegistry, caseExposureFingerprint } from './exposure.js';
import { freezeCodexAcceptanceProtocol, type FrozenCodexAcceptanceProtocol } from './acceptance-runner.js';
import { loadReviewedCalibration, prepareAcceptanceJudgmentInputs, replayCodexJudgments } from './acceptance-evidence.js';

function writeNew(file: string, value: unknown) { writeFileSync(file, JSON.stringify(value, null, 2) + '\n', { flag: 'wx', mode: 0o600 }); }
function journal(file: string, value: unknown) {
  const fd = openSync(file, 'a', 0o600);
  try { appendFileSync(fd, JSON.stringify(value) + '\n'); fsyncSync(fd); } finally { closeSync(fd); }
}
type CodexJudgmentOptions = { inputs: readonly JudgmentInput[]; judge: CodexProfile;
  repositoryRoot: string; outputRoot: string; usageRoot: string; authorization: SubscriptionAuthorization;
  transport: CodexTransport; maxRequestBytes: number; timeoutMs: number; frozenAcceptance?: { protocolFile: string; frozen: FrozenCodexAcceptanceProtocol; campaignRoot: string };
  calibrationCheck?: { calibrationRoot: string; reviewPath: string };
  onProgress?: (done: number, total: number) => void };
type CheckpointBatch = { index: number; inputIds: string[]; requestDigest: string };
function readTrusted(file: string): string {
  const stat = lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.size > 128 * 1024 * 1024) throw Error('JUDGMENT_RESUME_UNSAFE_FILE');
  return readFileSync(file, 'utf8');
}
const readJson = (file: string): unknown => JSON.parse(readTrusted(file));

/** Separate advisory evaluator. It never imports human decisions or changes reader/gate evidence. */
export async function runCodexJudgments(options: CodexJudgmentOptions) {
  const inputs = options.inputs.map(i => JudgmentInputSchema.parse(i)), judge = CodexProfileSchema.parse(options.judge);
  if (!inputs.length || new Set(inputs.map(i => i.id)).size !== inputs.length) throw Error('JUDGMENT_INPUT_COVERAGE');
  if (!Number.isSafeInteger(options.maxRequestBytes) || options.maxRequestBytes < 1024 || options.maxRequestBytes > 1_000_000
    || !Number.isSafeInteger(options.timeoutMs) || options.timeoutMs < 1000 || options.timeoutMs > 120_000) throw Error('JUDGMENT_LIMIT_INVALID');
  const acceptance = options.frozenAcceptance;
  const calibration = options.calibrationCheck ? loadReviewedCalibration(options.calibrationCheck) : null;
  if (acceptance && calibration) throw Error('JUDGMENT_CALIBRATION_ACCEPTANCE_EXCLUSIVE');
  if (calibration && (digest(inputs) !== digest(calibration.inputs) || inputs.some(i => i.task.split !== 'dev'))) throw Error('JUDGMENT_CALIBRATION_INPUT_BINDING');
  const acceptanceDigest = acceptance ? digest(acceptance.frozen) : null;
  let campaignPins: Record<string, string> = {};
  if (acceptance) {
    const reread = freezeCodexAcceptanceProtocol(acceptance.protocolFile);
    if (digest(reread) !== acceptanceDigest || digest(judge) !== digest(acceptance.frozen.protocol.judge)
      || inputs.some(i => i.task.split !== 'holdout' || !acceptance.frozen.protocol.caseIds.includes(i.task.id))) throw Error('JUDGMENT_ACCEPTANCE_FREEZE_BINDING');
    if (realpathSync(options.usageRoot) !== realpathSync(acceptance.frozen.protocol.usageRoot)
      || realpathSync(options.repositoryRoot) !== realpathSync(acceptance.frozen.protocol.repositoryRoot)
      || options.maxRequestBytes !== 1_000_000 || options.timeoutMs !== acceptance.frozen.protocol.perCallTimeoutMs
      || digest(options.authorization) !== digest(acceptance.frozen.protocol.authorization)) throw Error('JUDGMENT_ACCEPTANCE_AUTHORIZATION_BINDING');
    if ((acceptance.frozen.protocol.measurementMode === 'native' && options.transport.assurance !== 'codex-chatgpt')
      || (acceptance.frozen.protocol.measurementMode === 'local-regression' && options.transport.assurance !== 'mock')) throw Error('JUDGMENT_ACCEPTANCE_TRANSPORT_MODE_BINDING');
    const prepared = prepareAcceptanceJudgmentInputs(acceptance.campaignRoot, acceptance.frozen);
    if (digest(prepared.inputs) !== digest(inputs)) throw Error('JUDGMENT_ACCEPTANCE_CAMPAIGN_INPUT_BINDING');
    campaignPins = prepared.bundle.artifactPins;
  } else if (inputs.some(i => i.task.split !== 'dev')) throw Error('JUDGMENT_DEV_ONLY');
  const batches = Array.from({ length: Math.ceil(inputs.length / 6) }, (_, n) => inputs.slice(n * 6, n * 6 + 6));
  const requests = batches.map(batch => acceptance ? buildBatchedFrozenHoldoutJudgmentRequest(batch, judge, acceptance.frozen.freezeDigest) : buildBatchedJudgmentRequest(batch, judge));
  if (requests.length > options.authorization.maxInvocations || requests.some(r =>
    Math.max(Buffer.byteLength(canonicalJson(r)), Buffer.byteLength(renderCodexRequest(r))) > options.maxRequestBytes)) throw Error('JUDGMENT_PREFLIGHT_LIMIT');
  const { transport } = options, { respond, configurationDigest, assurance } = transport;
  if (transport.id !== 'codex-chatgpt-exec/1' || !['mock', 'codex-chatgpt'].includes(assurance)
    || transport.launchPolicyDigest !== CODEX_LAUNCH_POLICY_DIGEST) throw Error('JUDGMENT_TRANSPORT_INVALID');
  const runtimePins = () => {
    const source = implementationPins(options.repositoryRoot);
    const compiled = Object.fromEntries(Object.keys(source).filter(p => p.endsWith('.ts')).map(p => {
      const file = `dist/${p.replace(/\.ts$/, '.js')}`;
      return [file, `sha256:${createHash('sha256').update(readFileSync(path.join(options.repositoryRoot, file))).digest('hex')}`];
    }));
    return { source, compiled };
  };
  const pins = runtimePins(), inputDigest = digest(inputs), pinDigest = digest(pins);
  const limitsDigest = digest({ authorization: options.authorization, maxRequestBytes: options.maxRequestBytes, timeoutMs: options.timeoutMs });
  const calibrationDigest = calibration ? digest(calibration.review) : null, calibrationPins = calibration?.pins ?? {};
  const stable = () => { try { return digest(runtimePins()) === pinDigest && digest(options.inputs) === inputDigest
    && digest({ authorization: options.authorization, maxRequestBytes: options.maxRequestBytes, timeoutMs: options.timeoutMs }) === limitsDigest
    && digest(options.judge) === digest(judge) && transport.respond === respond && transport.configurationDigest === configurationDigest
    && transport.assurance === assurance && transport.id === 'codex-chatgpt-exec/1' && transport.launchPolicyDigest === CODEX_LAUNCH_POLICY_DIGEST
    && (!acceptance || (digest(acceptance.frozen) === acceptanceDigest && digest(freezeCodexAcceptanceProtocol(acceptance.protocolFile)) === acceptanceDigest
      && Object.entries(campaignPins).every(([file, expected]) => `sha256:${createHash('sha256').update(readFileSync(path.join(acceptance.campaignRoot, file))).digest('hex')}` === expected)))
    && (!calibration || (digest(loadReviewedCalibration(options.calibrationCheck!).review) === calibrationDigest
      && digest(loadReviewedCalibration(options.calibrationCheck!).pins) === digest(calibrationPins)));
  } catch { return false; } };
  // Creating the output first rejects reuse before opening the shared authorization ledger.
  mkdirSync(options.outputRoot, { recursive: false, mode: 0o700 });
  const budget = new SubscriptionBudget(options.usageRoot, options.authorization);
  let exposure: ExposureRegistry | undefined;
  const assessments: ReturnType<typeof parseBatchedJudgments> = [];
  let stoppedReason: string | null = null;
  try {
    exposure = new ExposureRegistry(options.usageRoot);
    if (calibration && inputs.some(i => exposure!.inspect(i.task).recordedExposures !== 0)) throw Error('JUDGMENT_CALIBRATION_PREVIOUSLY_EXPOSED');
    writeNew(path.join(options.outputRoot, 'inputs.json'), inputs);
    const lock = { schemaVersion: 'codex-semantic-judge-lock/2', pins, pinDigest, inputDigest,
      rubricDigest: SEMANTIC_RUBRIC_DIGEST, requestDigests: requests.map(digest), judge, assurance, usageRoot: realpathSync(options.usageRoot),
      authorization: options.authorization, maxRequestBytes: options.maxRequestBytes, timeoutMs: options.timeoutMs,
      batchSize: 6, createdAt: new Date().toISOString(), purpose: acceptance ? 'advisory-frozen-holdout' : calibration ? 'fresh-independent-calibration' : 'advisory-dev-calibration',
      ...(acceptance ? { frozenAcceptanceDigest: acceptance.frozen.freezeDigest } : {}),
      ...(calibration ? { calibrationAdmission: { schemaVersion: 'fresh-calibration-admission/1', reviewDigest: calibrationDigest, preparationPins: calibrationPins, priorExposureMatches: 0 } } : {}), releaseEligible: false };
    writeNew(path.join(options.outputRoot, 'lock.json'), lock);
    const checkpointBatches: CheckpointBatch[] = batches.map((batch, index) => ({ index, inputIds: batch.map(input => input.id), requestDigest: digest(requests[index]!) }));
    writeNew(path.join(options.outputRoot, 'checkpoint.json'), { schemaVersion: 'codex-semantic-judge-checkpoint/2', inputDigest, pinDigest,
      rubricDigest: SEMANTIC_RUBRIC_DIGEST, authorizationDigest: digest(options.authorization), lockDigest: digest(lock), batches: checkpointBatches });
    for (const [index, request] of requests.entries()) {
      if (!stable()) { stoppedReason = 'binding-drift'; break; }
      const snapshot = budget.snapshot();
      if (snapshot.stopReason) { stoppedReason = snapshot.stopReason; break; }
      const requestDigest = digest(request), expectedConfigurationDigest = configurationDigest(request);
      if (budget.attempts().some(attempt => attempt.requestDigest === requestDigest)) { stoppedReason = 'already-dispatched'; break; }
      writeNew(path.join(options.outputRoot, `request-${index}.json`), request);
      const attemptId = budget.reserve(requestDigest);
      journal(path.join(options.outputRoot, 'checkpoint-events.jsonl'), { schemaVersion: 'codex-semantic-judge-checkpoint-event/2', index, attemptId,
        requestDigest, inputIds: batches[index]!.map(input => input.id), state: 'dispatch-reserved', at: new Date().toISOString() });
      journal(path.join(options.outputRoot, 'exposure.jsonl'), { index, attemptId, requestDigest, inputIds: batches[index]!.map(i => i.id), status: 'possibly-exposed', at: new Date().toISOString() });
      const cases = new Map(batches[index]!.map(i => [caseExposureFingerprint(i.task), i.task]));
      for (const [fingerprint, task] of cases) exposure.record({ attemptId: `${attemptId}:${fingerprint.slice(7)}`,
        requestDigest, datasetSealDigest: null, inputSnapshotDigest: inputDigest, campaignId: `judge:${inputDigest}`,
        caseId: task.id, family: task.family, contentFingerprint: fingerprint, split: task.split, assurance, at: new Date().toISOString() });
      const controller = new AbortController(), timer = setTimeout(() => controller.abort(), Math.min(options.timeoutMs, snapshot.timeRemainingMs));
      try {
        const parsed = CodexReceiptSchema.safeParse(await respond(structuredClone(request), controller.signal));
        const result = parsed.success ? parsed.data : null;
        const bound = result !== null && result.requestDigest === requestDigest && result.requestedModel === judge.model
          && result.renderedRequestDigest === digest(renderCodexRequest(request)) && result.launchPolicyDigest === CODEX_LAUNCH_POLICY_DIGEST
          && result.configurationDigest === expectedConfigurationDigest;
        const known = bound && validCodexTokens(result);
        if (known) budget.settle(attemptId, result!.usage!.totalTokens);
        else budget.markUnknown(attemptId, 'unbound-or-unknown-judge-usage');
        journal(path.join(options.outputRoot, 'calls.jsonl'), { index, attemptId, requestDigest, expectedConfigurationDigest,
          result: bound ? result : null, status: known ? result!.status : 'unknown-usage' });
        if (!known) { stoppedReason = 'unknown-usage'; break; }
        if (!stable()) { stoppedReason = 'binding-drift'; break; }
        if (result!.status !== 'completed' || result!.cliVersion !== CODEX_CLI_VERSION || result!.issues.length) { stoppedReason = 'judge-not-completed'; break; }
        try {
          const batch = parseBatchedJudgments(batches[index]!, result!.output);
          assessments.push(...batch); journal(path.join(options.outputRoot, 'assessments.jsonl'), { index, requestDigest, assessments: batch });
        } catch { stoppedReason = 'invalid-judge-output'; break; }
      } catch {
        if (budget.snapshot().pendingAttempts) budget.markUnknown(attemptId, 'judge-transport-error');
        journal(path.join(options.outputRoot, 'calls.jsonl'), { index, attemptId, requestDigest, status: 'judge-transport-error', result: null });
        stoppedReason = 'judge-transport-error'; break;
      } finally { clearTimeout(timer); }
      options.onProgress?.(assessments.length, inputs.length);
    }
    if (!stable()) stoppedReason = 'binding-drift';
    const report = { schemaVersion: 'codex-semantic-judge-report/1', inputDigest, pinDigest, rubricDigest: SEMANTIC_RUBRIC_DIGEST,
      judge, assurance, planned: inputs.length, assessed: assessments.length, stoppedReason, assessments, budget: budget.snapshot(),
      independentModel: true, humanReviewed: false, phaseGate: 'Not evaluated', releaseEligible: false,
      limitations: ['Model judgments require independent calibration and adjudication', 'Batch judgments may be correlated',
        'Subscription reported usage; no API dollar cost or exact pre-count', 'Independent requested model is not independent human review'] };
    writeNew(path.join(options.outputRoot, 'report.json'), report); return report;
  } finally { try { exposure?.close(); } finally { budget.close(); } }
}

/**
 * Starts one immutable continuation for batches that have no durable reservation
 * in the parent. Reserved, unknown, malformed, and otherwise failed batches are
 * deliberately retained as missing evidence and are never retried here.
 */
export async function resumeCodexJudgments(options: CodexJudgmentOptions & { parentRoot: string }) {
  const parentRoot = realpathSync(options.parentRoot), outputRoot = path.resolve(options.outputRoot);
  if (existsSync(outputRoot)) throw Error('JUDGMENT_CONTINUATION_OUTPUT_EXISTS');
  const inputs = options.inputs.map(input => JudgmentInputSchema.parse(input)), judge = CodexProfileSchema.parse(options.judge);
  const parentInputs = readJson(path.join(parentRoot, 'inputs.json'));
  const lock = readJson(path.join(parentRoot, 'lock.json')) as Record<string, unknown>;
  const checkpoint = readJson(path.join(parentRoot, 'checkpoint.json')) as Record<string, unknown>;
  const parentReport = readJson(path.join(parentRoot, 'report.json')) as Record<string, unknown>;
  if (lock.schemaVersion !== 'codex-semantic-judge-lock/2' || checkpoint.schemaVersion !== 'codex-semantic-judge-checkpoint/2'
    || digest(parentInputs) !== digest(inputs) || lock.inputDigest !== digest(inputs) || checkpoint.inputDigest !== digest(inputs)
    || lock.rubricDigest !== SEMANTIC_RUBRIC_DIGEST || checkpoint.rubricDigest !== SEMANTIC_RUBRIC_DIGEST
    || digest(lock) !== checkpoint.lockDigest || digest(lock.authorization) !== digest(options.authorization)
    || checkpoint.authorizationDigest !== digest(options.authorization) || digest(lock.judge) !== digest(judge)
    || lock.usageRoot !== realpathSync(options.usageRoot) || lock.purpose !== 'advisory-dev-calibration' || parentReport.inputDigest !== lock.inputDigest
    || !Array.isArray(checkpoint.batches) || !Array.isArray(lock.requestDigests)) throw Error('JUDGMENT_RESUME_BINDING');
  if (!Number.isSafeInteger(options.maxRequestBytes) || options.maxRequestBytes < 1024 || options.maxRequestBytes > 1_000_000
    || !Number.isSafeInteger(options.timeoutMs) || options.timeoutMs < 1000 || options.timeoutMs > 120_000
    || lock.maxRequestBytes !== options.maxRequestBytes || lock.timeoutMs !== options.timeoutMs) throw Error('JUDGMENT_RESUME_LIMIT_BINDING');
  if (options.frozenAcceptance || options.calibrationCheck) throw Error('JUDGMENT_RESUME_SPECIAL_BINDING_UNSUPPORTED');
  if (inputs.some(input => input.task.split !== 'dev')) throw Error('JUDGMENT_DEV_ONLY');
  const batches = Array.from({ length: Math.ceil(inputs.length / 6) }, (_, index) => inputs.slice(index * 6, index * 6 + 6));
  const requests = batches.map(batch => buildBatchedJudgmentRequest(batch, judge));
  const parentArtifactPaths = [
    ['inputs', path.join(parentRoot, 'inputs.json')], ['lock', path.join(parentRoot, 'lock.json')],
    ['checkpoint', path.join(parentRoot, 'checkpoint.json')], ['report', path.join(parentRoot, 'report.json')],
    ['events', path.join(parentRoot, 'checkpoint-events.jsonl')], ['calls', path.join(parentRoot, 'calls.jsonl')],
    ['exposure', path.join(parentRoot, 'exposure.jsonl')], ['assessments', path.join(parentRoot, 'assessments.jsonl')],
    ...batches.map((_, index) => [`request-${index}`, path.join(parentRoot, `request-${index}.json`)]),
  ] as const;
  const parentArtifactPins = () => Object.fromEntries(parentArtifactPaths.map(([name, file]) => [name, existsSync(file) ? digest(readTrusted(file)) : null]));
  const parentPinDigest = digest(parentArtifactPins());
  const checkpointBatches = checkpoint.batches as CheckpointBatch[];
  if (checkpointBatches.length !== batches.length || checkpointBatches.some((batch, index) => batch.index !== index
    || digest(batch.inputIds) !== digest(batches[index]!.map(input => input.id)) || batch.requestDigest !== digest(requests[index]!))
    || digest(lock.requestDigests) !== digest(requests.map(digest))) throw Error('JUDGMENT_RESUME_REQUEST_BINDING');
  const runtimePins = () => {
    const source = implementationPins(options.repositoryRoot);
    const compiled = Object.fromEntries(Object.keys(source).filter(file => file.endsWith('.ts')).map(file => {
      const compiledFile = `dist/${file.replace(/\.ts$/, '.js')}`;
      return [compiledFile, `sha256:${createHash('sha256').update(readFileSync(path.join(options.repositoryRoot, compiledFile))).digest('hex')}`];
    }));
    return { source, compiled };
  };
  if (digest(runtimePins()) !== lock.pinDigest || checkpoint.pinDigest !== lock.pinDigest) throw Error('JUDGMENT_RESUME_SOURCE_BINDING');
  // Admission and downstream evidence replay share one verifier. Invalid receipts,
  // ordered journals, native configuration and exact assessments must agree before dispatch.
  const parentReplay = replayCodexJudgments({ root: parentRoot, inputs, judge,
    pinDigest: checkpoint.pinDigest as string, authorization: options.authorization });
  const reserved = new Set(parentReplay.reservedBatchIndexes);
  const parentAssessments = parentReplay.assessments;
  const calls = parentReplay.attempts;
  const continuedBatchIndexes = checkpointBatches.map(batch => batch.index).filter(index => !reserved.has(index));
  if (!continuedBatchIndexes.length) throw Error('JUDGMENT_RESUME_NOTHING_UNDISPATCHED');
  const { transport } = options, { respond, configurationDigest, assurance } = transport;
  if (transport.id !== 'codex-chatgpt-exec/1' || !['mock', 'codex-chatgpt'].includes(assurance)
    || transport.launchPolicyDigest !== CODEX_LAUNCH_POLICY_DIGEST || assurance !== lock.assurance) throw Error('JUDGMENT_TRANSPORT_INVALID');
  const limitsDigest = digest({ authorization: options.authorization, maxRequestBytes: options.maxRequestBytes, timeoutMs: options.timeoutMs });
  const stable = () => {
    try { return digest(runtimePins()) === lock.pinDigest && digest(options.inputs) === digest(inputs)
      && digest(parentArtifactPins()) === parentPinDigest
      && digest(options.judge) === digest(judge) && digest({ authorization: options.authorization, maxRequestBytes: options.maxRequestBytes, timeoutMs: options.timeoutMs }) === limitsDigest
      && transport.respond === respond && transport.configurationDigest === configurationDigest && transport.assurance === assurance
      && transport.id === 'codex-chatgpt-exec/1' && transport.launchPolicyDigest === CODEX_LAUNCH_POLICY_DIGEST; }
    catch { return false; }
  };
  const budget = new SubscriptionBudget(options.usageRoot, options.authorization);
  let exposure: ExposureRegistry | undefined;
  try {
    const ledger = budget.snapshot();
    if (ledger.stopReason) throw Error('JUDGMENT_RESUME_LEDGER_STOPPED');
    const claim = path.join(options.usageRoot, `judgment-continuation-${digest({ parentRoot, checkpoint: digest(checkpoint) }).slice(7)}.json`);
    if (existsSync(claim)) throw Error('JUDGMENT_CONTINUATION_CLAIM_EXISTS');
    const plannedRequestDigests = new Set(requests.map(digest));
    const ledgerAttempts = budget.attempts().filter(attempt => plannedRequestDigests.has(attempt.requestDigest));
    const reportedBudget = parentReport.budget as Record<string, unknown> | undefined;
    const reportedUsed = reportedBudget?.usedInvocations, reportedTokens = reportedBudget?.reportedTokens;
    if (ledgerAttempts.length !== calls.length || new Set(ledgerAttempts.map(attempt => attempt.attemptId)).size !== ledgerAttempts.length
      || calls.some(call => !ledgerAttempts.some(attempt => attempt.attemptId === call.attemptId && attempt.requestDigest === call.requestDigest))
      || ledgerAttempts.some(attempt => attempt.state !== 'settled')
      || !Number.isSafeInteger(reportedUsed) || !Number.isSafeInteger(reportedTokens)
      || (reportedUsed as number) > ledger.usedInvocations || (reportedTokens as number) > ledger.reportedTokens) throw Error('JUDGMENT_RESUME_LEDGER_BINDING');
    if (existsSync(outputRoot)) throw Error('JUDGMENT_CONTINUATION_OUTPUT_EXISTS');
    realpathSync(path.dirname(outputRoot));
    writeNew(claim, { schemaVersion: 'codex-semantic-judge-continuation-claim/2', parentRoot, parentCheckpointDigest: digest(checkpoint),
      parentReportDigest: digest(parentReport), childRoot: outputRoot });
    mkdirSync(outputRoot, { recursive: false, mode: 0o700 });
    const continuation = { parentRoot, parentLockDigest: digest(lock), parentReportDigest: digest(parentReport), parentCheckpointDigest: digest(checkpoint),
      continuedBatchIndexes, failedBatchIndexes: parentReplay.failedBatchIndexes };
    const childLock = { ...lock, schemaVersion: 'codex-semantic-judge-continuation-lock/2', continuation };
    writeNew(path.join(outputRoot, 'inputs.json'), inputs); writeNew(path.join(outputRoot, 'lock.json'), childLock);
    const ownAssessments: ReturnType<typeof parseBatchedJudgments> = [];
    const ownReservedIndexes = new Set<number>();
    let stoppedReason: string | null = null;
    exposure = new ExposureRegistry(options.usageRoot);
    for (const index of continuedBatchIndexes) {
      if (!stable()) { stoppedReason = 'binding-drift'; break; }
      const snapshot = budget.snapshot();
      if (snapshot.stopReason) { stoppedReason = snapshot.stopReason; break; }
      const request = requests[index]!, requestDigest = digest(request), expectedConfigurationDigest = configurationDigest(request);
      if (budget.attempts().some(attempt => attempt.requestDigest === requestDigest)) { stoppedReason = 'already-dispatched'; break; }
      writeNew(path.join(outputRoot, `request-${index}.json`), request);
      const attemptId = budget.reserve(requestDigest);
      ownReservedIndexes.add(index);
      journal(path.join(outputRoot, 'checkpoint-events.jsonl'), { schemaVersion: 'codex-semantic-judge-checkpoint-event/2', index, attemptId,
        requestDigest, inputIds: batches[index]!.map(input => input.id), state: 'dispatch-reserved', at: new Date().toISOString() });
      journal(path.join(outputRoot, 'exposure.jsonl'), { index, attemptId, requestDigest, inputIds: batches[index]!.map(input => input.id), status: 'possibly-exposed', at: new Date().toISOString() });
      const cases = new Map(batches[index]!.map(input => [caseExposureFingerprint(input.task), input.task]));
      for (const [fingerprint, task] of cases) exposure.record({ attemptId: `${attemptId}:${fingerprint.slice(7)}`, requestDigest, datasetSealDigest: null,
        inputSnapshotDigest: digest(inputs), campaignId: `judge:${digest(inputs)}`, caseId: task.id, family: task.family, contentFingerprint: fingerprint,
        split: task.split, assurance, at: new Date().toISOString() });
      const controller = new AbortController(), timer = setTimeout(() => controller.abort(), Math.min(options.timeoutMs, snapshot.timeRemainingMs));
      try {
        const parsed = CodexReceiptSchema.safeParse(await respond(structuredClone(request), controller.signal)), result = parsed.success ? parsed.data : null;
        const bound = result !== null && result.requestDigest === requestDigest && result.requestedModel === judge.model
          && result.renderedRequestDigest === digest(renderCodexRequest(request)) && result.launchPolicyDigest === CODEX_LAUNCH_POLICY_DIGEST
          && result.configurationDigest === expectedConfigurationDigest;
        const known = bound && validCodexTokens(result);
        if (known) budget.settle(attemptId, result!.usage!.totalTokens); else budget.markUnknown(attemptId, 'unbound-or-unknown-judge-usage');
        journal(path.join(outputRoot, 'calls.jsonl'), { index, attemptId, requestDigest, expectedConfigurationDigest, result: bound ? result : null,
          status: known ? result!.status : 'unknown-usage' });
        if (!known) { stoppedReason = 'unknown-usage'; break; }
        if (!stable()) { stoppedReason = 'binding-drift'; break; }
        if (result!.status !== 'completed' || result!.cliVersion !== CODEX_CLI_VERSION || result!.issues.length) { stoppedReason = 'judge-not-completed'; break; }
        try { const batch = parseBatchedJudgments(batches[index]!, result!.output); ownAssessments.push(...batch);
          journal(path.join(outputRoot, 'assessments.jsonl'), { index, requestDigest, assessments: batch });
        } catch { stoppedReason = 'invalid-judge-output'; break; }
      } catch {
        if (budget.snapshot().pendingAttempts) budget.markUnknown(attemptId, 'judge-transport-error');
        journal(path.join(outputRoot, 'calls.jsonl'), { index, attemptId, requestDigest, status: 'judge-transport-error', result: null });
        stoppedReason = 'judge-transport-error'; break;
      } finally { clearTimeout(timer); }
    }
    if (!stable()) stoppedReason = 'binding-drift';
    const failedBatchIndexes = [...new Set([...continuation.failedBatchIndexes, ...[...ownReservedIndexes].filter(index => !ownAssessments.some(assessment => batches[index]!.some(input => input.id === assessment.id)))])].sort((a, b) => a - b);
    if (stoppedReason === null && failedBatchIndexes.length) stoppedReason = 'prior-batch-failed';
    const assessments = [...parentAssessments, ...ownAssessments];
    const report = { schemaVersion: 'codex-semantic-judge-continuation-report/2', inputDigest: digest(inputs), pinDigest: lock.pinDigest,
      rubricDigest: SEMANTIC_RUBRIC_DIGEST, judge, assurance, planned: inputs.length, assessed: assessments.length, ownAssessed: ownAssessments.length,
      failedBatchIndexes, stoppedReason, assessments, budget: budget.snapshot(), continuation, complete: false, independentModel: true,
      humanReviewed: false, phaseGate: 'Not evaluated', releaseEligible: false };
    writeNew(path.join(outputRoot, 'report.json'), report); return report;
  } finally { try { exposure?.close(); } finally { budget.close(); } }
}
