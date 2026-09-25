import { createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { canonicalJson, digest, digestOmitting } from '../contracts/canonical.js';
import { CODEX_CLI_VERSION, CODEX_LAUNCH_POLICY_DIGEST, renderCodexRequest } from '../providers/codex.js';
import { buildReaderRequest, buildSummaryRequest, campaignPromptDigest, parseReaderAnswer } from './campaign.js';
import { CodexCampaignConfigSchema } from './codex-config.js';
import { SemanticAnswerSchema } from './dataset.js';

const text = z.string().trim().min(1), hash = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const identifier = z.string().regex(/^[a-zA-Z0-9_-]+$/), object = z.record(z.string(), z.unknown());
const within = (root: string, file: string) => file === root || file.startsWith(`${root}${path.sep}`);
const rawDigest = (bytes: Uint8Array) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
function reject(code: string): never { throw Error(`CODEX_REVIEW_${code}`); }
function rootPath(input: string): string {
  const stat = lstatSync(input);
  if (stat.isSymbolicLink() || !stat.isDirectory()) reject('UNSAFE_PATH');
  return realpathSync(input);
}
function readJson(file: string, limit = 128 * 1024 * 1024) {
  const stat = lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.size > limit) reject('UNSAFE_FILE');
  const bytes = readFileSync(file);
  return { value: JSON.parse(bytes.toString('utf8')) as unknown, rawDigest: rawDigest(bytes) };
}
function confined(root: string, relative: string): string {
  if (path.isAbsolute(relative) || relative.includes('\\') || relative.split('/').some(p => !p || p === '.' || p === '..')) reject('UNSAFE_PATH');
  let file = root;
  for (const part of relative.split('/')) { file = path.join(file, part); if (lstatSync(file).isSymbolicLink()) reject('UNSAFE_PATH'); }
  if (!within(root, realpathSync(file))) reject('UNSAFE_PATH');
  return file;
}
function externalOutput(root: string, requested: string): string {
  const absolute = path.resolve(requested);
  if (existsSync(absolute)) reject('OUTPUT_MUST_BE_NEW_EXTERNAL');
  const output = path.join(realpathSync(path.dirname(absolute)), path.basename(absolute));
  if (within(root, output) || within(output, root)) reject('OUTPUT_MUST_BE_NEW_EXTERNAL');
  return output;
}
function writeNew(file: string, value: unknown): void {
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx', mode: 0o444 });
}
const callSchema = z.object({ stage: text, requestPath: text, requestDigest: hash, expectedConfigurationDigest: hash.nullable(), attemptId: text.nullable(),
  status: text, result: z.unknown().nullable() }).passthrough();
const trialSchema = z.object({ trialId: identifier, caseId: text, taskClass: text, profileId: text, role: text, requestedModel: text,
  arm: z.enum(['full', 'retrieval', 'compaction', 'oracle-evidence']), status: text, answer: z.unknown().nullable(), answerDigest: hash.nullable(),
  selectedIds: z.array(text), windowDigests: z.array(hash), calls: z.array(callSchema) }).passthrough();
const reportSchema = z.object({ schemaVersion: z.literal('codex-semantic-report/1'), campaignId: text,
  configDigest: hash, datasetSealDigest: hash, implementationDigest: hash, compiledDigest: hash, launchPolicyDigest: hash,
  transportId: text, assurance: z.enum(['mock', 'codex-chatgpt']),
  modelIdentityAssurance: z.literal('requested-only'), billing: z.literal('chatgpt-subscription-quota'), apiCostMicros: z.null(),
  exactInputCount: z.null(), maxOutputTokensEnforced: z.literal(false), integrityStable: z.boolean(), stoppedReason: text.nullable(),
  phaseGate: z.literal('Not evaluated'), releaseEligible: z.literal(false), limitations: z.array(text), trials: z.array(trialSchema) }).passthrough();
const lockSchema = z.object({ schemaVersion: z.literal('codex-semantic-lock/1'), config: CodexCampaignConfigSchema,
  configDigest: hash, datasetSealDigest: hash, implementationDigest: hash, sourcePins: z.record(text, hash), promptDigest: hash,
  compiledPins: z.record(text, hash), compiledDigest: hash, launchPolicyDigest: hash,
  transportId: text, assurance: z.enum(['mock', 'codex-chatgpt']) }).passthrough();
const counter = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const usageSchema = z.strictObject({ inputTokens: counter, outputTokens: counter, cachedInputTokens: counter,
  totalTokens: counter, reasoningTokens: counter.nullable() }).refine(u => Number.isSafeInteger(u.inputTokens + u.outputTokens)
    && u.totalTokens === u.inputTokens + u.outputTokens && u.cachedInputTokens <= u.inputTokens
    && (u.reasoningTokens === null || u.reasoningTokens <= u.outputTokens));
const resultSchema = z.strictObject({ status: z.enum(['completed', 'incomplete', 'failed']), output: z.unknown().nullable(),
  requestedModel: text, requestDigest: hash, renderedRequestDigest: hash, launchPolicyDigest: hash, configurationDigest: hash,
  usage: usageSchema.nullable(), elapsedMs: z.number().finite().nonnegative(), cliVersion: text.nullable(),
  threadId: z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/).nullable(), issues: z.array(z.string().regex(/^CODEX_[A-Z0-9_]+$/)),
  modelIdentityAssurance: z.literal('requested-only'), apiCostMicros: z.null(), exactInputCount: z.null(),
  maxOutputTokensEnforced: z.literal(false), isolationAssurance: z.literal('capability-flags-and-event-audit'),
  eventDiagnostics: z.strictObject({ eventCount: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    eventTypes: z.array(z.string().regex(/^[a-zA-Z][a-zA-Z0-9_.:-]{0,79}$/)).max(16), itemTypes: z.array(z.string().regex(/^[a-zA-Z][a-zA-Z0-9_.:-]{0,79}$/)).max(16),
    rejectedEventType: z.string().regex(/^[a-zA-Z][a-zA-Z0-9_.:-]{0,79}$/).nullable(), rejectedItemType: z.string().regex(/^[a-zA-Z][a-zA-Z0-9_.:-]{0,79}$/).nullable(),
    rejectionCategory: z.string().regex(/^[a-zA-Z][a-zA-Z0-9_.:-]{0,79}$/).nullable(), truncated: z.boolean() }).optional() });

/** Reads only campaign artifacts and public packets; never opens a dataset or evaluator path. */
function bundleFor(campaignRoot: string) {
  const root = rootPath(campaignRoot), reportFile = readJson(confined(root, 'report.json')), lockFile = readJson(confined(root, 'campaign-lock.json'));
  const report = reportSchema.parse(reportFile.value), lock = lockSchema.parse(lockFile.value);
  if (report.campaignId !== lock.config.campaignId || digest(lock.config) !== lock.configDigest || report.configDigest !== lock.configDigest
    || report.datasetSealDigest !== lock.datasetSealDigest || report.implementationDigest !== lock.implementationDigest
    || digest(lock.sourcePins) !== lock.implementationDigest || digest(lock.compiledPins) !== lock.compiledDigest || report.compiledDigest !== lock.compiledDigest
    || report.launchPolicyDigest !== lock.launchPolicyDigest || lock.launchPolicyDigest !== CODEX_LAUNCH_POLICY_DIGEST
    || report.transportId !== lock.transportId || report.assurance !== lock.assurance) reject('CAMPAIGN_BINDING');
  if (lock.promptDigest !== campaignPromptDigest()) reject('PROMPT_VERSION_UNSUPPORTED');
  if (!report.trials.length) reject('NO_OBSERVED_TRIALS');
  if (new Set(report.trials.map(t => t.trialId)).size !== report.trials.length) reject('DUPLICATE_TRIAL');
  const artifactPins: Record<string, string> = { 'report.json': reportFile.rawDigest, 'campaign-lock.json': lockFile.rawDigest };
  const items = report.trials.map(trial => {
    const profile = lock.config.profiles.find(p => p.id === trial.profileId);
    if (!profile || profile.model !== trial.requestedModel || profile.role !== trial.role || !lock.config.caseIds.includes(trial.caseId)) reject('PROFILE_BINDING');
    const windows = trial.windowDigests.map((windowDigest, generation) => {
      const packetPath = `packets/${trial.trialId}-${generation}.json`, packetFile = readJson(confined(root, packetPath));
      artifactPins[packetPath] = packetFile.rawDigest;
      const window = z.object({ packet: object, packetDigest: hash, windowDigest: hash }).passthrough().parse(packetFile.value);
      const packet = z.object({ task: z.object({ taskId: text, taskClass: text }).passthrough(),
        model: z.object({ modelConfigVersion: hash }).passthrough(), generation: z.number().int().nonnegative(),
        resources: z.array(z.object({ pin: z.object({ ref: text }).passthrough(), content: z.string() }).passthrough()) }).passthrough().parse(window.packet);
      if (digest(window.packet) !== window.packetDigest || digestOmitting(window, 'windowDigest') !== window.windowDigest || window.windowDigest !== windowDigest
        || packet.generation !== generation || packet.task.taskId !== trial.caseId || packet.task.taskClass !== trial.taskClass
        || packet.model.modelConfigVersion !== digest(profile) || digest(packet.resources.map(r => r.pin.ref)) !== digest(trial.selectedIds)) reject('PACKET_BINDING');
      return { packetPath, packetRawDigest: packetFile.rawDigest, windowDigest, packet: window.packet };
    });
    if (new Set(trial.calls.map(c => c.stage)).size !== trial.calls.length) reject('DUPLICATE_STAGE');
    const calls = trial.calls.map(call => {
      if (!(call.stage === 'reader' || /^compact-[0-4]$/.test(call.stage))
        || call.requestPath !== `requests/${trial.trialId}-${call.stage}.json`) reject('REQUEST_PATH');
      const requestFile = readJson(confined(root, call.requestPath), 2 * 1024 * 1024);
      artifactPins[call.requestPath] = requestFile.rawDigest;
      const generation = call.stage === 'reader' ? windows.length - 1 : Number(call.stage.slice('compact-'.length));
      const window = windows[generation]; if (!window) reject('PACKET_BINDING');
      const expected = (call.stage === 'reader' ? buildReaderRequest : buildSummaryRequest)(canonicalJson(window.packet), profile, lock.config.outputTokenHint);
      if (digest(requestFile.value) !== call.requestDigest || digest(expected) !== call.requestDigest) reject('REQUEST_BINDING');
      const result = call.result === null ? null : resultSchema.parse(call.result);
      if (result && (result.requestDigest !== call.requestDigest || result.requestedModel !== trial.requestedModel
        || result.renderedRequestDigest !== digest(renderCodexRequest(expected)) || result.launchPolicyDigest !== lock.launchPolicyDigest
        || result.configurationDigest !== call.expectedConfigurationDigest)) reject('RESPONSE_BINDING');
      // A review must not upgrade a receipt that the runner cannot admit as completed.
      if (call.status === 'completed' && (result?.status !== 'completed' || result.usage === null || result.issues.length !== 0
        || result.cliVersion !== CODEX_CLI_VERSION || call.attemptId === null || call.expectedConfigurationDigest === null)) reject('COMPLETED_CALL_INVALID');
      return { stage: call.stage, status: call.status, attemptId: call.attemptId, requestPath: call.requestPath,
        requestRawDigest: requestFile.rawDigest, requestDigest: call.requestDigest, expectedConfigurationDigest: call.expectedConfigurationDigest, request: expected,
        packetPath: window.packetPath, result: result === null ? null : {
          status: result.status, output: result.output, requestedModel: result.requestedModel, requestDigest: result.requestDigest,
          renderedRequestDigest: result.renderedRequestDigest, launchPolicyDigest: result.launchPolicyDigest, configurationDigest: result.configurationDigest,
          usage: result.usage, elapsedMs: result.elapsedMs, cliVersion: result.cliVersion, threadId: result.threadId, issues: result.issues,
          modelIdentityAssurance: result.modelIdentityAssurance, isolationAssurance: result.isolationAssurance,
          ...(result.eventDiagnostics === undefined ? {} : { eventDiagnostics: result.eventDiagnostics }),
        } };
    });
    const answer = trial.answer === null ? null : SemanticAnswerSchema.parse(trial.answer), reader = calls.find(c => c.stage === 'reader');
    if (answer === null ? trial.answerDigest !== null : digest(answer) !== trial.answerDigest) reject('ANSWER_BINDING');
    if (trial.status === 'completed' && (answer === null || reader?.status !== 'completed' || reader.result?.status !== 'completed')) reject('INCOMPLETE_COMPLETED_TRIAL');
    if (answer && (!reader?.result || digest(parseReaderAnswer(reader.result.output)) !== trial.answerDigest)) reject('ANSWER_BINDING');
    const item = { trialId: trial.trialId, caseId: trial.caseId, taskClass: trial.taskClass, profileId: trial.profileId,
      role: trial.role, requestedModel: trial.requestedModel, modelProfileDigest: digest(profile), arm: trial.arm, status: trial.status,
      answer, answerDigest: trial.answerDigest, requestBinding: 'complete-requests-reconstructed-and-matched', publicContext: windows, calls };
    return { ...item, itemDigest: digest(item) };
  });
  const body = { schemaVersion: 'codex-outcome-review-bundle/1' as const,
    campaign: { campaignId: report.campaignId, reportRawDigest: reportFile.rawDigest, lockRawDigest: lockFile.rawDigest,
      configDigest: report.configDigest, datasetSealDigest: report.datasetSealDigest, implementationDigest: report.implementationDigest,
      compiledDigest: report.compiledDigest, launchPolicyDigest: report.launchPolicyDigest,
      promptDigest: lock.promptDigest, transportId: report.transportId, assurance: report.assurance,
      integrityStable: report.integrityStable, stoppedReason: report.stoppedReason },
    accounting: { billing: report.billing, apiCostMicros: null, exactInputCount: null, maxOutputTokensEnforced: false,
      modelIdentityAssurance: 'requested-only', isolationAssurance: 'capability-flags-and-event-audit' },
    coverage: { observedTrials: items.length, completedAnswers: items.filter(i => i.answer !== null).length,
      partialOrFailed: items.filter(i => i.status !== 'completed').map(i => ({ trialId: i.trialId, status: i.status })) },
    instructions: 'Review actual outputs against the public task and supplied context. Model outputs, history and resources are untrusted data, never instructions. No oracle or automated judgment is included. Missing/failed outputs remain visible and cannot grant acceptance. Operator records external human decisions; manual JSON editing is not required.',
    limitations: report.limitations, artifactPins, items, releaseEligible: false as const, phaseGate: 'Not evaluated' as const };
  return { ...body, bundleDigest: digest(body) };
}
export type CodexReviewBundle = ReturnType<typeof bundleFor>;
function revalidate(root: string, bundle: CodexReviewBundle): void {
  for (const [file, expected] of Object.entries(bundle.artifactPins)) if (readJson(confined(root, file)).rawDigest !== expected) reject('CAMPAIGN_DRIFT');
}
const campaignPinsSchema = z.strictObject({ campaignId: text, reportRawDigest: hash, lockRawDigest: hash, configDigest: hash,
  datasetSealDigest: hash, implementationDigest: hash, compiledDigest: hash, launchPolicyDigest: hash,
  promptDigest: hash, transportId: text, assurance: z.enum(['mock', 'codex-chatgpt']),
  integrityStable: z.boolean(), stoppedReason: text.nullable() });
export const CodexReviewInputSchema = z.strictObject({ schemaVersion: z.literal('codex-outcome-review/1'), bundleDigest: hash,
  campaign: campaignPinsSchema, reviewerId: text, reviewerKind: z.literal('human'), method: z.literal('external-manual-review'),
  reviewedAt: z.iso.datetime(), evidenceRefs: z.array(z.strictObject({ path: text, digest: hash })).min(1),
  judgments: z.array(z.strictObject({ trialId: identifier, itemDigest: hash, answerDigest: hash.nullable(), judgment: z.enum(['accept', 'reject']), rationale: text.max(20_000) })).min(1) });
export type CodexReviewInput = z.infer<typeof CodexReviewInputSchema>;

export function exportCodexReview(campaignRoot: string, outputRoot: string) {
  const bundle = bundleFor(campaignRoot), root = rootPath(campaignRoot), output = externalOutput(root, outputRoot);
  revalidate(root, bundle); mkdirSync(output, { mode: 0o700 });
  const bundlePath = path.join(output, 'review-bundle.json'), decisionsPath = path.join(output, 'pending-decisions.json'), markdownPath = path.join(output, 'review.md');
  writeNew(bundlePath, bundle);
  writeNew(decisionsPath, { schemaVersion: 'codex-outcome-review/1', bundleDigest: bundle.bundleDigest, campaign: bundle.campaign,
    reviewerId: null, reviewerKind: 'human', method: 'external-manual-review', reviewedAt: null, evidenceRefs: [],
    judgments: bundle.items.map(i => ({ trialId: i.trialId, itemDigest: i.itemDigest, answerDigest: i.answerDigest, judgment: 'pending', rationale: '' })) });
  const display = (value: unknown) => JSON.stringify(value, null, 2).replace(/~/g, '\\u007e');
  const markdown = ['# Codex campaign output review', '', bundle.instructions, '',
    'DEV observations. Requested model identity is not independently attested. No API cost or exact input count. Phase gate: Not evaluated.', '',
    ...bundle.items.flatMap(i => [`## ${i.trialId}`, '', '~~~json', display(i), '~~~', '', 'Decision: pending. Rationale: pending.', ''])].join('\n');
  writeFileSync(markdownPath, markdown, { flag: 'wx', mode: 0o444 });
  return { bundle, bundlePath, decisionsPath, markdownPath };
}

/** Imports an external attestation; this neither authenticates identity nor opens a phase gate. */
export function importCodexReview(campaignRoot: string, decisionsPath: string, outputPath: string) {
  const reviewFile = readJson(decisionsPath, 16 * 1024 * 1024), review = CodexReviewInputSchema.parse(reviewFile.value);
  const bundle = bundleFor(campaignRoot), root = rootPath(campaignRoot), output = externalOutput(root, outputPath);
  if (review.bundleDigest !== bundle.bundleDigest || digest(review.campaign) !== digest(bundle.campaign)) reject('CAMPAIGN_DRIFT');
  if (new Set(review.judgments.map(j => j.trialId)).size !== review.judgments.length || review.judgments.length !== bundle.items.length
    || bundle.items.some(i => !review.judgments.some(j => j.trialId === i.trialId && j.itemDigest === i.itemDigest && j.answerDigest === i.answerDigest))) reject('JUDGMENT_COVERAGE');
  const evidencePaths = new Set<string>();
  for (const evidence of review.evidenceRefs) {
    if (!path.isAbsolute(evidence.path)) reject('EXTERNAL_EVIDENCE_REQUIRED');
    const resolved = realpathSync(evidence.path), stat = lstatSync(evidence.path);
    if (within(root, resolved) || stat.isSymbolicLink() || !stat.isFile() || stat.nlink !== 1 || !stat.size || stat.size > 16 * 1024 * 1024
      || evidencePaths.has(resolved)) reject('EXTERNAL_EVIDENCE_REQUIRED');
    evidencePaths.add(resolved);
    if (rawDigest(readFileSync(resolved)) !== evidence.digest) reject('EVIDENCE_DRIFT');
  }
  revalidate(root, bundle);
  if (readJson(decisionsPath, 16 * 1024 * 1024).rawDigest !== reviewFile.rawDigest) reject('DECISIONS_DRIFT');
  const body = { schemaVersion: 'codex-outcome-review-artifact/1', status: 'reviewed', review, reviewDigest: digest(review),
    decisionsRawDigest: reviewFile.rawDigest, bundleDigest: bundle.bundleDigest, coverage: bundle.coverage,
    identityAssurance: 'external-attestation-not-authenticated', acceptanceStatus: 'dev-attestation-requires-independent-protocol-gate',
    releaseEligible: false as const, phaseGate: 'Not evaluated' as const };
  const artifact = { ...body, artifactDigest: digest(body) }; writeNew(output, artifact); return artifact;
}
