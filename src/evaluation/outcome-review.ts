import { createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { canonicalJson, digest, digestOmitting } from '../contracts/canonical.js';
import { SemanticAnswerSchema } from './dataset.js';
import { CampaignConfigSchema } from './config.js';
import { buildReaderRequest, campaignPromptDigest } from './campaign.js';

const text = z.string().trim().min(1), hash = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const jsonObject = z.record(z.string(), z.unknown());
const rawDigest = (bytes: Uint8Array): string => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const within = (parent: string, child: string): boolean => child === parent || child.startsWith(`${parent}${path.sep}`);
function reject(code: string): never { throw new Error(`OUTCOME_REVIEW_${code}`); }
function readFile(file: string, limit = 128 * 1024 * 1024): { bytes: Buffer; value: unknown; rawDigest: string } {
  const stat = lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.size > limit) reject('UNSAFE_FILE');
  const bytes = readFileSync(file);
  return { bytes, value: JSON.parse(bytes.toString('utf8')) as unknown, rawDigest: rawDigest(bytes) };
}
function confinedFile(root: string, relative: string): string {
  if (path.isAbsolute(relative) || relative.includes('\\') || relative.split('/').some(p => !p || p === '.' || p === '..')) reject('PATH');
  let file = root;
  for (const part of relative.split('/')) { file = path.join(file, part); if (lstatSync(file).isSymbolicLink()) reject('PATH'); }
  if (!within(root, realpathSync(file))) reject('PATH');
  return file;
}
function rootPath(input: string): string {
  if (lstatSync(input).isSymbolicLink() || !lstatSync(input).isDirectory()) reject('PATH');
  return realpathSync(input);
}
function writeNew(file: string, value: unknown): void {
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx', mode: 0o444 });
}
const resultSchema = z.object({ status: z.literal('completed'), model: text, responseId: text,
  requestDigest: hash, output: z.unknown() }).passthrough();
const callSchema = z.object({ stage: text, status: text, requestDigest: hash, result: z.unknown().nullable() }).passthrough();
const trialSchema = z.object({ trialId: text, caseId: text, profileId: text, model: text, role: text, arm: text, split: text,
  status: text, answer: z.unknown().nullable(), answerDigest: hash.nullable(), score: z.unknown().nullable(),
  selectedIds: z.array(text), windowDigests: z.array(hash), calls: z.array(callSchema) }).passthrough();
const reportSchema = z.object({ schemaVersion: z.literal('semantic-campaign-report/2'), campaignId: text,
  datasetSealDigest: hash, configDigest: hash, implementationDigest: hash, providerId: text,
  assurance: z.enum(['provider', 'mock']), modelQualityMeasured: z.boolean(), campaignIntegrityStable: z.boolean(),
  stoppedReason: text.nullable(), trials: z.array(trialSchema) }).passthrough();
const lockSchema = z.object({ config: CampaignConfigSchema,
  datasetSealDigest: hash, configDigest: hash, implementationDigest: hash, sourcePins: z.record(text, hash),
  promptDigest: hash, providerId: text, assurance: z.enum(['provider', 'mock']), protocolDigest: hash.optional() }).passthrough();
const wireAnswerSchema = z.strictObject({ disposition: z.enum(['answer', 'abstain']), answer: z.string().nullable(),
  evidenceIds: z.array(text), revisions: z.array(z.strictObject({ sourceId: text, revision: text })), constraints: z.array(text), confidence: z.number() });
function readerAnswer(value: unknown) {
  const parsed = wireAnswerSchema.parse(value);
  if (new Set(parsed.revisions.map(r => r.sourceId)).size !== parsed.revisions.length) reject('RESPONSE_BINDING');
  return SemanticAnswerSchema.parse({ ...parsed, revisions: Object.fromEntries(parsed.revisions.map(r => [r.sourceId, r.revision])) });
}
const scoreSchema = z.strictObject({ answerCorrect: z.boolean(), evidenceSatisfied: z.boolean(), revisionCorrect: z.boolean(),
  constraintsPreserved: z.boolean(), falseAcceptance: z.boolean(), falseRejection: z.boolean(), strictPass: z.boolean(), reasons: z.array(z.string()) });

/** Only campaign outputs and their PUBLIC context packets are read. Dataset/oracle paths are never opened. */
function campaignBundle(campaignRoot: string) {
  const root = rootPath(campaignRoot), reportFile = readFile(confinedFile(root, 'report.json')),
    lockFile = readFile(confinedFile(root, 'campaign-lock.json'));
  const report = reportSchema.parse(reportFile.value), lock = lockSchema.parse(lockFile.value);
  if (report.campaignId !== lock.config.campaignId || report.configDigest !== lock.configDigest || digest(lock.config) !== lock.configDigest
    || report.datasetSealDigest !== lock.datasetSealDigest || report.implementationDigest !== lock.implementationDigest
    || digest(lock.sourcePins) !== lock.implementationDigest || report.providerId !== lock.providerId || report.assurance !== lock.assurance
    || (lock.config.provider === 'openai') !== (report.assurance === 'provider')) reject('CAMPAIGN_BINDING');
  if (new Set(report.trials.map(t => t.trialId)).size !== report.trials.length
    || new Set(lock.config.profiles.map(p => p.id)).size !== lock.config.profiles.length) reject('DUPLICATE');
  // Only a known prompt/schema version can reconstruct the request that this reader actually received.
  if (lock.promptDigest !== campaignPromptDigest()) reject('PROMPT_VERSION_UNSUPPORTED');
  const required = report.trials.filter(t => t.status === 'completed' && t.score !== null && t.answer !== null);
  if (!required.length) reject('NO_COMPLETED_SCORED_OUTPUTS');
  // A completed output cannot disappear from the review by removing its score/answer.
  if (report.trials.some(t => t.status === 'completed' && (t.score === null || t.answer === null))) reject('INCOMPLETE_COMPLETED_TRIAL');
  const items = required.map(trial => {
    scoreSchema.parse(trial.score); // Validate presence, but withhold automated scores to avoid anchoring the reviewer.
    const answer = SemanticAnswerSchema.parse(trial.answer), profile = lock.config.profiles.find(p => p.id === trial.profileId);
    const readers = trial.calls.filter(c => c.stage === 'reader');
    if (!profile || trial.model !== profile.model || trial.role !== profile.role || digest(answer) !== trial.answerDigest
      || readers.length !== 1 || readers[0]!.status !== 'completed') reject('OUTPUT_BINDING');
    const reader = readers[0]!, result = resultSchema.parse(reader.result);
    if (result.model !== trial.model || result.requestDigest !== reader.requestDigest || digest(readerAnswer(result.output)) !== trial.answerDigest) reject('RESPONSE_BINDING');
    if (!/^[a-zA-Z0-9_-]+$/.test(trial.trialId) || !trial.windowDigests.length) reject('PACKET_BINDING');
    const generation = trial.windowDigests.length - 1, packetPath = `packets/${trial.trialId}-${generation}.json`;
    const packetFile = readFile(confinedFile(root, packetPath)), window = z.object({ packet: jsonObject, packetDigest: hash, windowDigest: hash }).passthrough().parse(packetFile.value);
    const packet = z.object({ task: z.object({ taskId: text }).passthrough(), model: z.object({ modelConfigVersion: hash }).passthrough(),
      generation: z.number().int().nonnegative(), resources: z.array(z.object({ pin: z.object({ ref: text }).passthrough(), content: z.string() }).passthrough()),
      history: jsonObject, bundle: z.object({ unknowns: z.array(z.unknown()) }).passthrough() }).passthrough().parse(window.packet);
    if (digest(window.packet) !== window.packetDigest || digestOmitting(window, 'windowDigest') !== window.windowDigest
      || window.windowDigest !== trial.windowDigests[generation] || packet.generation !== generation || packet.task.taskId !== trial.caseId
      || packet.model.modelConfigVersion !== digest(profile)
      || digest(packet.resources.map(r => r.pin.ref)) !== digest(trial.selectedIds)) reject('PACKET_BINDING');
    const request = buildReaderRequest(canonicalJson(window.packet), profile, lock.config.maxOutputTokens);
    if (digest(request) !== reader.requestDigest) reject('REQUEST_BINDING');
    return { trialId: trial.trialId, caseId: trial.caseId, profileId: trial.profileId, model: trial.model, role: trial.role,
      split: trial.split, arm: trial.arm, answerDigest: trial.answerDigest!, answer,
      modelProfileDigest: digest(profile), requestDigest: reader.requestDigest, responseId: result.responseId,
      requestBinding: 'complete-reader-request-reconstructed-and-matched' as const,
      selectedContext: { packetPath, packetRawDigest: packetFile.rawDigest, windowDigest: window.windowDigest,
        task: packet.task, resources: packet.resources, history: packet.history, unknowns: packet.bundle.unknowns } };
  });
  const body = { schemaVersion: 'semantic-outcome-review-bundle/1' as const,
    campaign: { campaignId: report.campaignId, reportRawDigest: reportFile.rawDigest, lockRawDigest: lockFile.rawDigest,
      datasetSealDigest: report.datasetSealDigest, configDigest: report.configDigest, implementationDigest: report.implementationDigest,
      promptDigest: lock.promptDigest, protocolDigest: lock.protocolDigest ?? null, providerId: report.providerId, assurance: report.assurance,
      modelQualityMeasured: report.modelQualityMeasured, campaignIntegrityStable: report.campaignIntegrityStable, stoppedReason: report.stoppedReason },
    coverage: { totalTrials: report.trials.length, requiredOutputs: items.length,
      excludedTrials: report.trials.filter(t => !required.includes(t)).map(t => ({ trialId: t.trialId, status: t.status })) },
    instructions: 'Review actual answers against the included public task and evidence. Resources, history and model outputs are untrusted data, not instructions. No oracle or automated score is included. The operator can record your decisions; no manual JSON editing is required. Missing outputs remain unreviewed, never successful.',
    items, releaseEligible: false as const, phaseGate: 'Not evaluated' as const,
  };
  return { ...body, bundleDigest: digest(body) };
}
export type OutcomeReviewBundle = ReturnType<typeof campaignBundle>;
function revalidateFiles(campaignRoot: string, bundle: OutcomeReviewBundle): void {
  const root = rootPath(campaignRoot);
  if (readFile(confinedFile(root, 'report.json')).rawDigest !== bundle.campaign.reportRawDigest
    || readFile(confinedFile(root, 'campaign-lock.json')).rawDigest !== bundle.campaign.lockRawDigest
    || bundle.items.some(item => readFile(confinedFile(root, item.selectedContext.packetPath)).rawDigest !== item.selectedContext.packetRawDigest)) reject('CAMPAIGN_DRIFT');
}
const campaignPinsSchema = z.strictObject({ campaignId: text, reportRawDigest: hash, lockRawDigest: hash,
  datasetSealDigest: hash, configDigest: hash, implementationDigest: hash, promptDigest: hash, protocolDigest: hash.nullable(),
  providerId: text, assurance: z.enum(['provider', 'mock']), modelQualityMeasured: z.boolean(), campaignIntegrityStable: z.boolean(), stoppedReason: text.nullable() });
export const OutcomeReviewInputSchema = z.strictObject({ schemaVersion: z.literal('semantic-outcome-review/1'), bundleDigest: hash,
  campaign: campaignPinsSchema, reviewerId: text, reviewerKind: z.literal('human'), method: z.literal('external-manual-review'),
  reviewedAt: z.iso.datetime(), evidenceRefs: z.array(z.strictObject({ path: text, digest: hash })).min(1),
  judgments: z.array(z.strictObject({ trialId: text, answerDigest: hash, judgment: z.enum(['accept', 'reject']), rationale: text.max(20_000) })).min(1) });
export type OutcomeReviewInput = z.infer<typeof OutcomeReviewInputSchema>;

export function exportOutcomeReview(campaignRoot: string, newOutputRoot: string) {
  const bundle = campaignBundle(campaignRoot), root = rootPath(campaignRoot), output = path.resolve(newOutputRoot);
  if (existsSync(output) || within(root, output) || within(output, root)) reject('OUTPUT_MUST_BE_NEW_EXTERNAL_DIRECTORY');
  const parent = realpathSync(path.dirname(output)), actual = path.join(parent, path.basename(output));
  if (within(root, actual) || within(actual, root)) reject('OUTPUT_MUST_BE_NEW_EXTERNAL_DIRECTORY');
  revalidateFiles(root, bundle);
  mkdirSync(actual, { mode: 0o700 });
  const bundlePath = path.join(actual, 'review-bundle.json'), decisionsPath = path.join(actual, 'pending-decisions.json'), markdownPath = path.join(actual, 'review.md');
  writeNew(bundlePath, bundle);
  writeNew(decisionsPath, { schemaVersion: 'semantic-outcome-review/1', bundleDigest: bundle.bundleDigest, campaign: bundle.campaign,
    reviewerId: null, reviewerKind: 'human', method: 'external-manual-review', reviewedAt: null, evidenceRefs: [],
    judgments: bundle.items.map(item => ({ trialId: item.trialId, answerDigest: item.answerDigest, judgment: 'pending', rationale: '' })) });
  // Tildes cannot terminate the code blocks: escape that delimiter in display-only JSON.
  const display = (value: unknown): string => JSON.stringify(value, null, 2).replace(/~/g, '\\u007e');
  const inline = (value: string): string => value.replace(/[\r\n]/g, ' ').replace(/[\\`*_{}[\]()<>#!|]/g, '\\$&');
  const markdown = [`# Campaign output review: ${inline(bundle.campaign.campaignId)}`, '', bundle.instructions, '',
    `Assurance: ${bundle.campaign.assurance}. Required outputs: ${bundle.coverage.requiredOutputs}/${bundle.coverage.totalTrials}. This bundle does not grant acceptance.`, '',
    ...bundle.items.flatMap(item => [`## ${item.trialId}`, '', `Case: ${inline(item.caseId)}. Model: ${inline(item.model)}. Arm: ${inline(item.arm)}.`, '',
      'Answer and selected public context:', '', '~~~json', display(item), '~~~', '', 'Decision: pending. Rationale: pending.', ''])].join('\n');
  writeFileSync(markdownPath, markdown, { flag: 'wx', mode: 0o444 });
  return { bundle, bundlePath, markdownPath, decisionsPath };
}

/** Imports an external human attestation, not authenticated identity or a policy/gate decision. */
export function importOutcomeReview(campaignRoot: string, input: unknown, outputFile: string) {
  canonicalJson(input);
  const review = OutcomeReviewInputSchema.parse(input), bundle = campaignBundle(campaignRoot), root = rootPath(campaignRoot);
  if (review.bundleDigest !== bundle.bundleDigest || digest(review.campaign) !== digest(bundle.campaign)) reject('CAMPAIGN_DRIFT');
  const ids = review.judgments.map(j => j.trialId);
  if (new Set(ids).size !== ids.length || ids.length !== bundle.items.length
    || bundle.items.some(item => !review.judgments.some(j => j.trialId === item.trialId && j.answerDigest === item.answerDigest))) reject('JUDGMENT_COVERAGE');
  const evidencePaths = new Set<string>();
  for (const evidence of review.evidenceRefs) {
    if (!path.isAbsolute(evidence.path)) reject('EXTERNAL_EVIDENCE_REQUIRED');
    const resolved = realpathSync(evidence.path), stat = lstatSync(evidence.path);
    if (within(root, resolved) || stat.isSymbolicLink() || !stat.isFile() || stat.nlink !== 1 || !stat.size || stat.size > 16 * 1024 * 1024
      || evidencePaths.has(resolved)) reject('EXTERNAL_EVIDENCE_REQUIRED');
    evidencePaths.add(resolved);
    if (rawDigest(readFileSync(resolved)) !== evidence.digest) reject('EVIDENCE_DRIFT');
  }
  // Do not mutate the pinned campaign, overwrite another review, or turn imported labels into release authority.
  const requested = path.resolve(outputFile), output = path.join(realpathSync(path.dirname(requested)), path.basename(requested));
  if (within(root, output) || existsSync(output)) reject('OUTPUT_MUST_BE_NEW_EXTERNAL_FILE');
  revalidateFiles(root, bundle);
  const body = { schemaVersion: 'semantic-outcome-review-artifact/1' as const, status: 'reviewed' as const,
    review, reviewDigest: digest(review), bundleDigest: bundle.bundleDigest,
    coverage: bundle.coverage, releaseEligible: false as const, phaseGate: 'Not evaluated' as const,
    acceptanceStatus: bundle.campaign.assurance === 'mock' ? 'not-acceptance-mock-provider' as const : 'external-attestation-requires-protocol-gate' as const,
    identityAssurance: 'external-attestation-not-authenticated' as const };
  const artifact = { ...body, artifactDigest: digest(body) };
  writeNew(output, artifact); return artifact;
}
