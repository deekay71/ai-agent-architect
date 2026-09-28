import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { digest } from '../contracts/canonical.js';
import { implementationPins, campaignPromptDigest } from './campaign.js';
import { CodexProfileSchema } from './codex-config.js';
import { loadPublicDataset, verifyDatasetSeal } from './dataset.js';
import { ExposureRegistry } from './exposure.js';
import { runCodexCampaign } from './codex-campaign.js';
import type { CodexTransport } from '../providers/codex.js';
import { validateFrozenCalibration } from './acceptance-evidence.js';

const text = z.string().trim().min(1), hash = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const absolute = z.string().refine(path.isAbsolute, 'absolute path required');
const artifact = z.strictObject({ path: absolute, digest: hash });
const authorization = z.strictObject({ authorizationId: text, maxInvocations: z.number().int().positive().max(604),
  maxReportedTokens: z.number().int().positive().max(10_000_000), maxWallTimeMs: z.number().int().positive().max(10_800_000) });

/** An intentionally narrow capability: it permits one sealed, finite holdout measurement, never a release. */
export const CodexAcceptanceProtocolSchema = z.strictObject({
  schemaVersion: z.literal('phase3-subscription-starter/1'), protocolId: text, userRequest: text,
  measurementMode: z.enum(['native', 'local-regression']).default('native'),
  datasetRoot: absolute, repositoryRoot: absolute, usageRoot: absolute, caseIds: z.array(text).length(10).refine(x => new Set(x).size === x.length),
  visibleByteAllowances: z.array(z.number().int().min(1024)).length(3).refine(x => new Set(x).size === x.length),
  repeats: z.literal(2), arms: z.tuple([z.literal('F'), z.literal('R'), z.literal('C1'), z.literal('C3')]),
  control: z.literal('G'), reader: CodexProfileSchema, judge: CodexProfileSchema, topK: z.number().int().min(1).max(100),
  outputTokenHint: z.number().int().min(64).max(4000), perTrialReportedTokenStop: z.number().int().min(1024).max(1_000_000),
  perCallTimeoutMs: z.number().int().min(1000).max(120000),
  authorization, maxCalls: z.number().int().min(1).max(540), thresholdArtifact: artifact,
  calibrationArtifact: artifact, independentReviewArtifact: artifact, protocolDocumentArtifact: artifact, feasibilityArtifact: artifact,
});
export type CodexAcceptanceProtocol = z.infer<typeof CodexAcceptanceProtocolSchema>;

const reviewSchema = z.object({ schemaVersion: z.literal('independent-ai-holdout-label-review/1'), reviewerId: text, authorId: text,
  reviewerKind: z.literal('ai'), humanAttestation: z.null(), sealDigest: hash, status: z.literal('pass-ai-design-review'),
  reviewedHoldoutCases: z.literal(10), caseChecks: z.array(z.object({ caseId: text }).passthrough()).length(10),
  reviewedRawFileDigests: z.record(text, hash), phaseGate: z.literal('Not evaluated'), releaseEligible: z.literal(false), blockers: z.array(z.unknown()).length(0),
  issues: z.array(z.unknown()).length(0), sourceProvenancePins: z.literal('pass'), sealIntegrity: z.literal('pass') }).passthrough();
const calibrationSchema = z.strictObject({ schemaVersion: z.literal('codex-calibration-evidence/1'), calibrationRoot: absolute,
  reviewPath: absolute, judgmentRoot: absolute });
const thresholdSchema = z.strictObject({ schemaVersion: z.literal('codex-acceptance-thresholds/1'), thresholds: z.strictObject({
  caseSuccessMinimum: z.literal(0.9), allRepeatsRequired: z.literal(true), allRequiredAbstentions: z.literal(true), maxHardGateViolations: z.literal(0),
  calibrationPositiveMinimum: z.literal(0.9), calibrationNegativeMinimum: z.literal(0.9), maxCriticalFalseAccepts: z.literal(0), minimumPerStratumCases: z.literal(10) }),
  phaseGate: z.literal('Not evaluated'), releaseEligible: z.literal(false) });

function bytes(file: string): Buffer {
  const stat = lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) throw Error('ACCEPTANCE_UNSAFE_ARTIFACT');
  return readFileSync(file);
}
function readArtifact(input: z.infer<typeof artifact>, schema: z.ZodType): unknown {
  const file = realpathSync(input.path), raw = bytes(file);
  if (`sha256:${createHash('sha256').update(raw).digest('hex')}` !== input.digest) throw Error('ACCEPTANCE_ARTIFACT_DRIFT');
  try { return schema.parse(JSON.parse(raw.toString('utf8'))); } catch { throw Error('ACCEPTANCE_ARTIFACT_INVALID'); }
}
function verifyRawArtifact(input: z.infer<typeof artifact>): void {
  if (`sha256:${createHash('sha256').update(bytes(input.path)).digest('hex')}` !== input.digest) throw Error('ACCEPTANCE_ARTIFACT_DRIFT');
}
function compiledPins(root: string, source: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.keys(source).filter(p => p.endsWith('.ts')).map(p => {
    const compiled = `dist/${p.replace(/\.ts$/, '.js')}`, file = path.join(root, compiled);
    if (!existsSync(file) || lstatSync(file).isSymbolicLink()) throw Error('ACCEPTANCE_COMPILED_SOURCE_MISSING');
    return [compiled, `sha256:${createHash('sha256').update(readFileSync(file)).digest('hex')}`];
  }));
}
export interface FrozenCodexAcceptanceProtocol {
  readonly schemaVersion: 'frozen-codex-holdout-acceptance/1'; readonly protocol: CodexAcceptanceProtocol;
  readonly protocolFileDigest: string; readonly datasetSealDigest: string; readonly sourcePins: Record<string, string>;
  readonly compiledPins: Record<string, string>; readonly promptDigest: string; readonly matrix: { comparisons: number; controls: number; readerSummaryCalls: number };
  readonly trialManifest: readonly { id: string; caseId: string; visibleByteAllowance: number; repeat: number; arm: 'F' | 'R' | 'C1' | 'C3' | 'G'; compactionRounds: number }[];
  readonly freezeDigest: string; readonly phaseGate: 'Not evaluated'; readonly releaseEligible: false;
  readonly calibrationEvidenceDigest: string;
}

/** No task text is returned. This is the complete, auditable order frozen before the first holdout exposure. */
export function frozenAcceptanceTrialManifest(protocol: CodexAcceptanceProtocol) {
  const main: { id: string; caseId: string; visibleByteAllowance: number; repeat: number; arm: 'F' | 'R' | 'C1' | 'C3' | 'G'; compactionRounds: number }[] = [];
  const arms = [['F', 0], ['R', 0], ['C1', 1], ['C3', 3]] as const;
  for (let repeat = 0; repeat < protocol.repeats; repeat++) for (const caseId of protocol.caseIds) for (const visibleByteAllowance of protocol.visibleByteAllowances) {
    const ordered = (repeat + protocol.caseIds.indexOf(caseId)) % 2 ? [...arms].reverse() : arms;
    for (const [arm, compactionRounds] of ordered) main.push({ id: `main-${main.length + 1}`, caseId, visibleByteAllowance, repeat, arm, compactionRounds });
  }
  for (let repeat = 0; repeat < protocol.repeats; repeat++) for (const caseId of protocol.caseIds) for (const visibleByteAllowance of protocol.visibleByteAllowances)
    main.push({ id: `control-${main.length + 1}`, caseId, visibleByteAllowance, repeat, arm: 'G', compactionRounds: 0 });
  return main;
}

/** Reads all protocol bytes itself; digest strings supplied by an operator are only pins to verify. */
export function freezeCodexAcceptanceProtocol(protocolFile: string): FrozenCodexAcceptanceProtocol {
  const raw = bytes(protocolFile), protocolFileDigest = `sha256:${createHash('sha256').update(raw).digest('hex')}`;
  const protocol = CodexAcceptanceProtocolSchema.parse(JSON.parse(raw.toString('utf8'))), datasetRoot = realpathSync(protocol.datasetRoot), repositoryRoot = realpathSync(protocol.repositoryRoot);
  if (protocol.userRequest !== 'implement5closureitems+delegate') throw Error('ACCEPTANCE_USER_REQUEST_BINDING');
  if (protocol.measurementMode === 'native' && realpathSync(protocol.usageRoot) !== realpathSync(path.join(repositoryRoot, '.local/codex-subscription-usage'))) throw Error('ACCEPTANCE_SHARED_REGISTRY_REQUIRED');
  if (protocol.reader.model === protocol.judge.model) throw Error('ACCEPTANCE_SELF_JUDGMENT_DENIED');
  const datasetSealDigest = verifyDatasetSeal(datasetRoot), dataset = loadPublicDataset(datasetRoot);
  const selected = protocol.caseIds.map(id => dataset.cases.find(c => c.id === id));
  if (selected.some(c => !c || c.split !== 'holdout')) throw Error('ACCEPTANCE_HOLDOUT_SELECTION_INVALID');
  // Four comparison arms have 1, 1, 2 and 4 calls respectively; G is one reader call.
  const cells = protocol.caseIds.length * protocol.visibleByteAllowances.length * protocol.repeats;
  const matrix = { comparisons: cells * protocol.arms.length, controls: cells,
    readerSummaryCalls: cells * 8 + cells };
  if (matrix.comparisons !== 240 || matrix.controls !== 60 || matrix.readerSummaryCalls > protocol.maxCalls || protocol.authorization.maxInvocations < matrix.readerSummaryCalls)
    throw Error('ACCEPTANCE_MATRIX_OR_CAP_INVALID');
  readArtifact(protocol.thresholdArtifact, thresholdSchema);
  verifyRawArtifact(protocol.protocolDocumentArtifact);
  const feasibility = readArtifact(protocol.feasibilityArtifact, z.object({ schemaVersion: z.literal('dev-request-feasibility/1'), modelCalls: z.literal(0), stressBytes: z.literal(20480),
    stressDigest: z.literal('sha256:b270da49414b81c4605d5009876d48664c46a29d48ad28fd46fd06c13954a0c0'),
    rows: z.array(z.object({ requestBytes: z.number().int().positive() }).passthrough()).length(120) }).passthrough()) as { rows: { requestBytes: number }[] };
  if (feasibility.rows.some(row => row.requestBytes > Math.min(...protocol.visibleByteAllowances))) throw Error('ACCEPTANCE_DEV_ALLOWANCE_INFEASIBLE');
  const calibration = readArtifact(protocol.calibrationArtifact, calibrationSchema) as z.infer<typeof calibrationSchema>;
  const calibrationResult = validateFrozenCalibration({ ...calibration, judge: protocol.judge, authorization: protocol.authorization, usageRoot: protocol.usageRoot,
    pinDigest: digest({ source: implementationPins(repositoryRoot), compiled: compiledPins(repositoryRoot, implementationPins(repositoryRoot)) }) });
  const calibrationReady = protocol.measurementMode === 'native' ? calibrationResult.pass
    : calibrationResult.criteriaPass && calibrationResult.assurance === 'mock';
  if (!calibrationReady) throw Error('ACCEPTANCE_CALIBRATION_NOT_READY');
  const review = readArtifact(protocol.independentReviewArtifact, reviewSchema) as z.infer<typeof reviewSchema>;
  const reviewFiles = ['manifest.json', 'public/cases.json', 'public/documents.json', 'evaluator/oracle.json', 'dataset.lock.json'];
  if (review.reviewerId === review.authorId || review.sealDigest !== datasetSealDigest || new Set(review.caseChecks.map(c => c.caseId)).size !== 10
    || selected.some(c => !review.caseChecks.some(check => check.caseId === c!.id)) || reviewFiles.some(name => !review.reviewedRawFileDigests[name])
    || Object.entries(review.reviewedRawFileDigests).some(([name, expected]) => {
      if (path.isAbsolute(name) || name.includes('\\') || name.split('/').some(part => !part || part === '.' || part === '..')) return true;
      const file = path.join(datasetRoot, name); if (!realpathSync(file).startsWith(`${datasetRoot}${path.sep}`)) return true;
      return `sha256:${createHash('sha256').update(bytes(file)).digest('hex')}` !== expected;
    })) throw Error('ACCEPTANCE_INDEPENDENT_REVIEW_BINDING');
  const sourcePins = implementationPins(repositoryRoot), compiled = compiledPins(repositoryRoot, sourcePins);
  const trialManifest = frozenAcceptanceTrialManifest(protocol);
  const body = { schemaVersion: 'frozen-codex-holdout-acceptance/1' as const, protocol, protocolFileDigest, datasetSealDigest,
    sourcePins, compiledPins: compiled, promptDigest: campaignPromptDigest(), matrix, trialManifest, calibrationEvidenceDigest: digest(calibrationResult),
    phaseGate: 'Not evaluated' as const, releaseEligible: false as const };
  return { ...body, freezeDigest: digest(body) };
}

/** Pre-dispatch verification. Exposure is checked before a holdout packet can be constructed or sent. */
export function preflightFrozenCodexAcceptance(protocolFile: string, frozen: FrozenCodexAcceptanceProtocol, usageRoot: string) {
  const reread = freezeCodexAcceptanceProtocol(protocolFile);
  if (digest(reread) !== digest(frozen)) throw Error('ACCEPTANCE_FREEZE_DRIFT');
  if (realpathSync(usageRoot) !== realpathSync(frozen.protocol.usageRoot)) throw Error('ACCEPTANCE_USAGE_ROOT_BINDING');
  const registry = new ExposureRegistry(usageRoot);
  try {
    const data = loadPublicDataset(frozen.protocol.datasetRoot), exposed = frozen.protocol.caseIds.flatMap(id => {
      const task = data.cases.find(c => c.id === id)!; return registry.inspect(task).records;
    });
    if (exposed.length) throw Error('ACCEPTANCE_HOLDOUT_PREVIOUSLY_EXPOSED');
  } finally { registry.close(); }
  return { protocolDigest: frozen.freezeDigest, authorizedCapability: 'sealed-holdout-measurement-only' as const,
    phaseGate: 'Not evaluated' as const, releaseEligible: false as const };
}

/** Machine-derived only: callers cannot hand-author a holdout campaign configuration. */
export function frozenAcceptanceCampaignConfig(frozen: FrozenCodexAcceptanceProtocol) {
  const p = frozen.protocol;
  return { schemaVersion: 'codex-semantic-config/1' as const, campaignId: `acceptance-${frozen.freezeDigest.slice(7, 23)}`,
    provider: 'codex-chatgpt' as const, purpose: 'acceptance' as const, split: 'holdout' as const, caseIds: p.caseIds,
    profiles: [p.reader], distractorLimits: [0], compactionRounds: [1, 3], repeats: 2, topK: p.topK,
    outputTokenHint: p.outputTokenHint, maxVisibleRequestBytes: Math.max(...p.visibleByteAllowances),
    visibleByteAllowances: p.visibleByteAllowances, perTrialReportedTokenStop: p.perTrialReportedTokenStop,
    perCallTimeoutMs: p.perCallTimeoutMs, authorization: p.authorization };
}

/** The only holdout dispatch entrypoint. It rechecks file bytes and exposure, then uses the durable campaign loop. */
export async function runCodexAcceptanceCampaign(options: { protocolFile: string; frozen: FrozenCodexAcceptanceProtocol;
  outputRoot: string; usageRoot: string; transport: CodexTransport; onProgress?: (completed: number, planned: number) => void }) {
  const preflight = preflightFrozenCodexAcceptance(options.protocolFile, options.frozen, options.usageRoot);
  const result = await runCodexCampaign({ datasetRoot: options.frozen.protocol.datasetRoot, repositoryRoot: options.frozen.protocol.repositoryRoot,
    outputRoot: options.outputRoot, usageRoot: options.usageRoot, config: frozenAcceptanceCampaignConfig(options.frozen),
    transport: options.transport, frozenAcceptance: options.frozen, acceptanceProtocolFile: options.protocolFile, ...(options.onProgress ? { onProgress: options.onProgress } : {}) });
  return { preflight, result };
}
