import { z } from 'zod';
import { digest, digestOmitting, canonicalJson } from '../contracts/canonical.js';
import { SCHEMA_VERSION, schemas, type TaskSpec, type PlanPackage, type ContextManifest, type ContextBundle,
  type CheckDefinition, type CheckResult, type PolicyRelease, type GateReport } from '../contracts/schemas.js';
import { isWithinScope, isSafeRelativePath } from '../foundation/permissions.js';

export type EvaluationStage = 'planning' | 'pre-dispatch' | 'post-execution';
export type EvaluationOutcome = 'pass' | 'fail' | 'unknown' | 'blocked';
export interface EvaluationIssue { code: string; path: string; message: string }
export interface EvaluationResult { outcome: EvaluationOutcome; issues: EvaluationIssue[] }
export interface PlanningRecords { task: TaskSpec; plan: PlanPackage; manifest: ContextManifest; context: ContextBundle }
export interface PlanningAuthority {
  taskDigest: string; expectedInputs: GateReport['inputVersions']; snapshotId: string; memoryVersion: string;
  checks: readonly CheckDefinition[];
  evidence: readonly { evidenceId: string; contentHash: string; sourceRef: string; sourceRevision: string }[];
}
export interface PinnedArtifact { ref: string; contentDigest: string; content: unknown }
export interface BenchmarkTrial {
  trialId: string; scenarioId: string; failureClass: string; expectedAccept: boolean;
  attempts: EvaluationOutcome[];
}
export interface RateInterval { count: number; denominator: number; rate: number | null; lower: number | null; upper: number | null; confidence: number }
export interface FamilyMetrics {
  failureClass: string; truePositive: number; trueNegative: number; falsePositive: number; falseNegative: number;
  trials: number; firstAttemptSuccesses: number; wholeWorkflowSuccesses: number; unknownAttempts: number;
  falseAcceptance: RateInterval; falseRejection: RateInterval;
}
export interface BenchmarkSummary {
  kind: 'mechanical-fixture-calibration'; families: FamilyMetrics[]; trials: number; confidence: number;
  interpretation: 'descriptive-fixture-counts-only'; populationInference: false;
  intervalInterpretation: 'binomial-formula-reference-assumptions-not-verified';
}
export interface CalibrationManifest {
  releaseId: string; kind: 'mechanical-fixture'; stages: EvaluationStage[];
  datasetRef: string; trialsRef: string; checkSetRef: string; configRef: string; rubricRef: string;
  modelRef: string | null; promptRef: string | null;
  requiredFailureClasses: string[]; minTrialsPerFamily: number; minPositivePerFamily: number; minNegativePerFamily: number;
  criterionEvidenceRefs: string[];
  artifactPins: { ref: string; contentDigest: string }[]; confidence: 0.9 | 0.95 | 0.99;
  maxAttemptsPerTrial: number; maxFalseRejectRate: number;
}
export interface PolicyAuthority {
  releases: readonly PolicyRelease[]; artifacts: readonly PinnedArtifact[]; calibrations: readonly CalibrationManifest[];
  policyOwnerIds: readonly string[];
}
export interface StageCheckDefinition { stage: EvaluationStage; definition: CheckDefinition }
export interface StageCheckResult { stage: EvaluationStage; result: CheckResult }
export interface GateAuthority {
  issuerId: string; verifierIds: readonly string[]; checks: readonly StageCheckDefinition[];
  /** Results enter this protected registry only after the independent verifier/receipt was checked. */
  trustedCheckResults: readonly StageCheckResult[];
}
export interface RuntimeAuthorityConfig { schemaVersion: 'runtime-authority/1'; planning: PlanningAuthority; policy: PolicyAuthority; gate: GateAuthority }
export interface VerifierReport {
  schemaVersion: 'verifier-report/1'; reportId: string; runId: string; operationId: string;
  subjectDigest: string; checkSetDigest: string; environmentDigest: string;
  startedAt: string; finishedAt: string; adapterStatus: 'completed' | 'error'; error?: string;
  total: number; tests: { testId: string; outcome: 'pass' | 'fail' | 'skipped' | 'unknown' }[];
}
export interface VerifierExpectation {
  reportId: string; runId: string; operationId: string; subjectDigest: string; checkSetDigest: string;
  environmentDigest: string; expectedTestIds: readonly string[]; notBefore: string; now: string;
  runnerId: string; principalId: string; runnerVersion: string; configDigest: string;
}
/** Obtained from the protected runner invocation, never parsed from candidate stdout as authority. */
export interface TrustedVerifierReceipt {
  reportId: string; reportDigest: string; runnerId: string; principalId: string; runnerVersion: string;
  configDigest: string; runId: string; operationId: string; subjectDigest: string; checkSetDigest: string;
  environmentDigest: string; recordedAt: string;
}
export interface GateRequest {
  gateReportId: string; stage: EvaluationStage; taskClass: string; subjectDigest: string;
  inputVersions: GateReport['inputVersions']; policyReleaseId: string; checkResults: CheckResult[];
  dimensionScores?: GateReport['dimensionScores'];
}
export interface StageGateEnvelope {
  schemaVersion: 'stage-gate/1'; stage: EvaluationStage; taskClass: string; policyDigest: string;
  report: GateReport; reportDigest: string; envelopeDigest: string;
}
export interface GateIssueResult extends EvaluationResult { gate: StageGateEnvelope | null }
export interface GateExpectation { stage: EvaluationStage; taskClass: string; subjectDigest: string; inputVersions: GateReport['inputVersions']; policyReleaseId: string }

class Findings {
  issues: EvaluationIssue[] = [];
  outcome: EvaluationOutcome = 'pass';
  add(code: string, path: string, message: string, outcome: EvaluationOutcome = 'fail'): void {
    this.issues.push({ code, path, message });
    const rank = { pass: 0, blocked: 1, unknown: 2, fail: 3 };
    if (rank[outcome] > rank[this.outcome]) this.outcome = outcome;
  }
  require(condition: boolean, code: string, path: string, message: string, outcome: EvaluationOutcome = 'fail'): void {
    if (!condition) this.add(code, path, message, outcome);
  }
  merge(result: EvaluationResult): void { for (const issue of result.issues) this.add(issue.code, issue.path, issue.message, result.outcome); }
  result(): EvaluationResult { return { outcome: this.outcome, issues: this.issues }; }
}
const same = (a: unknown, b: unknown): boolean => {
  try { return digest(a) === digest(b); } catch { return false; }
};
const unique = (values: readonly string[]): boolean => new Set(values).size === values.length;
const validTime = (value: string): boolean => z.iso.datetime({ offset: true }).safeParse(value).success;
const stages: readonly EvaluationStage[] = ['planning', 'pre-dispatch', 'post-execution'];

/** Only inputs available now: no completed operation, execution Evidence or future test report. */
export function planningInputs(records: PlanningRecords): GateReport['inputVersions'] {
  return [
    { ref: records.task.taskId, version: records.task.baseRevision, digest: digest(records.task) },
    { ref: records.plan.planId, version: String(records.plan.version), digest: digestOmitting(records.plan, 'hash') },
    { ref: records.manifest.manifestId, version: records.manifest.contextPolicyVersion, digest: digestOmitting(records.manifest, 'manifestDigest') },
    { ref: records.context.bundleId, version: records.context.schemaVersion, digest: digest(records.context) },
  ];
}

export function evaluatePlanningReadiness(input: PlanningRecords, authority: PlanningAuthority): EvaluationResult {
  const f = new Findings();
  try { canonicalJson(input); } catch { f.add('planning.invalidJson', '$', 'Planning input must be plain JSON'); return f.result(); }
  const parsed = {
    task: schemas.TaskSpec.safeParse(input.task), plan: schemas.PlanPackage.safeParse(input.plan),
    manifest: schemas.ContextManifest.safeParse(input.manifest), context: schemas.ContextBundle.safeParse(input.context),
  };
  if (!parsed.task.success || !parsed.plan.success || !parsed.manifest.success || !parsed.context.success) {
    f.add('planning.schema', '$', 'Invalid or unsupported planning contract'); return f.result();
  }
  const task = parsed.task.data, plan = parsed.plan.data, manifest = parsed.manifest.data, context = parsed.context.data;
  const records = { task, plan, manifest, context };
  f.require(digest(task) === authority.taskDigest, 'planning.taskPin', 'task', 'Task differs from the approved task');
  const inputs = planningInputs(records);
  f.require(unique(inputs.map(x => x.ref)) && unique(authority.expectedInputs.map(x => x.ref)) &&
    inputs.length === authority.expectedInputs.length && inputs.every(x => authority.expectedInputs.some(y => same(x, y))),
  'planning.inputPins', '$', 'Planning inputs differ from their current trusted pins');
  f.require(plan.hash === digestOmitting(plan, 'hash'), 'planning.planDigest', 'plan.hash', 'Plan digest mismatch');
  f.require(manifest.manifestDigest === digestOmitting(manifest, 'manifestDigest') && manifest.taskSpecDigest === digest(task),
    'planning.manifestDigest', 'manifest', 'Manifest does not bind current task/content');
  f.require(task.allowedPaths.every(isSafeRelativePath), 'planning.path', 'task.allowedPaths', 'Invalid allowed path roots');
  const scopeFits = (scope: typeof manifest.scope): boolean => scope.repoId === task.repoId &&
    scope.taskClasses.length > 0 && scope.taskClasses.every(x => x === task.taskClass) &&
    scope.allowedPaths.length > 0 && scope.allowedPaths.every(x => isWithinScope(x, task.allowedPaths));
  f.require(scopeFits(manifest.scope), 'planning.scope', 'manifest.scope', 'Manifest broadens task scope');
  f.require(unique(task.constraints.map(x => x.id)) && unique(manifest.constraintBindings.map(x => x.id)),
    'planning.constraintDuplicate', 'manifest.constraintBindings', 'Duplicate constraint identity');
  f.require(task.constraints.every(x => x.contentHash === digest(x.description)) &&
    same(manifest.constraintBindings, task.constraints.map(({ description: _description, ...binding }) => binding)),
  'planning.constraints', 'manifest.constraintBindings', 'Constraint content/revision/applicability changed');
  f.require(context.taskId === task.taskId && context.manifestRef === manifest.manifestId && context.manifestDigest === manifest.manifestDigest,
    'planning.contextBinding', 'context', 'Context is not bound to task and manifest');
  f.require(context.snapshotId === authority.snapshotId && context.memoryVersion === authority.memoryVersion,
    'planning.contextVersion', 'context', 'Context snapshot or memory pin is stale');
  f.require(manifest.modelConfigVersion === task.budget.modelConfigVersion &&
    context.tokenCount <= task.budget.inputLimit - task.budget.headroom - task.budget.outputReserve,
  'planning.contextBudget', 'context', 'Context exceeds or differs from its configured budget');
  f.require(!context.unknowns.some(x => x.critical), 'planning.criticalUnknown', 'context.unknowns', 'Critical unknown blocks readiness', 'blocked');
  f.require(unique(context.evidenceItems.map(x => x.evidenceId)) && unique(manifest.evidenceBindings.map(x => x.evidenceId)),
    'planning.evidenceDuplicate', 'context.evidenceItems', 'Duplicate evidence references');
  f.require(context.evidenceItems.length === manifest.evidenceBindings.length, 'planning.evidenceBinding', 'context', 'Unbound or omitted context evidence');
  for (const binding of manifest.evidenceBindings) {
    const item = context.evidenceItems.find(x => x.evidenceId === binding.evidenceId);
    f.require(!!item && authority.evidence.some(x => x.evidenceId === binding.evidenceId && x.contentHash === binding.contentHash &&
      x.contentHash === item.contentHash && x.sourceRef === item.sourceRef && x.sourceRevision === binding.sourceRevision),
    'planning.evidenceBinding', 'context.evidenceItems', 'Context evidence has no matching current provenance');
  }
  const subIds = plan.subplans.map(x => x.planId), steps = plan.subplans.flatMap(x => x.steps), stepIds = steps.map(x => x.stepId);
  f.require(unique(subIds) && unique(stepIds), 'planning.duplicateNode', 'plan', 'Duplicate planning node IDs');
  const dag = (nodes: { id: string; dependencies: string[] }[], path: string): void => {
    const map = new Map(nodes.map(x => [x.id, x.dependencies])), visiting = new Set<string>(), done = new Set<string>();
    const visit = (id: string): void => {
      if (visiting.has(id)) { f.add('planning.cycle', path, 'Dependency cycle'); return; }
      if (done.has(id)) return;
      const dependencies = map.get(id);
      if (!dependencies) { f.add('planning.missingDependency', path, `Unknown dependency ${id}`); return; }
      visiting.add(id); for (const dependency of dependencies) visit(dependency); visiting.delete(id); done.add(id);
    };
    for (const node of nodes) visit(node.id);
  };
  dag(plan.subplans.map(x => ({ id: x.planId, dependencies: x.dependencies })), 'plan.subplans');
  dag(steps.map(x => ({ id: x.stepId, dependencies: x.dependsOn })), 'plan.steps');
  const criterionIds = task.acceptanceCriteria.map(x => x.criterionId), constraintIds = task.constraints.map(x => x.id);
  f.require(unique(criterionIds) && task.acceptanceCriteria.every(x => x.checkRefs.length > 0), 'planning.acceptance', 'task.acceptanceCriteria', 'Acceptance IDs/check mappings are missing or duplicated');
  f.require(unique(authority.checks.map(x => x.checkId)), 'planning.checkRegistry', '$authority.checks', 'Ambiguous check registry');
  for (const sub of plan.subplans) {
    f.require(scopeFits(sub.scope), 'planning.scope', 'plan.subplans.scope', 'Subplan broadens task scope');
    f.require(!sub.unresolvedItems.some(x => x.blocking), 'planning.blocker', 'plan.subplans', 'Unresolved subplan blocker', 'blocked');
    f.require(sub.requirementRefs.every(x => criterionIds.includes(x)), 'planning.requirementRef', 'plan.subplans', 'Unknown requirement reference');
    f.require(sub.evidenceRefs.every(x => authority.evidence.some(e => e.evidenceId === x)), 'planning.evidenceRef', 'plan.subplans', 'Untrusted supporting evidence');
  }
  for (const contract of [...plan.integrationContracts, ...plan.subplans.flatMap(x => x.contracts)]) {
    f.require(subIds.includes(contract.producerRef) && subIds.includes(contract.consumerRef) && contract.invariantRefs.every(x => constraintIds.includes(x)),
      'planning.integrationRef', 'plan.integrationContracts', 'Unknown producer, consumer or invariant');
  }
  f.require(unique(plan.requirementCoverage.map(x => x.requirementRef)), 'planning.coverageDuplicate', 'plan.requirementCoverage', 'Duplicate coverage');
  for (const criterion of task.acceptanceCriteria) {
    const coverage = plan.requirementCoverage.find(x => x.requirementRef === criterion.criterionId);
    f.require(!!coverage && criterion.checkRefs.every(check => coverage.checkRefs.includes(check)) &&
      coverage.stepRefs.every(id => steps.some(step => step.stepId === id)) &&
      coverage.checkRefs.every(check => coverage.stepRefs.some(id => steps.find(step => step.stepId === id)?.verificationChecks.includes(check))),
    'planning.coverage', 'plan.requirementCoverage', 'Requirement/checks are not linked to existing verifying steps');
  }
  f.require(plan.requirementCoverage.every(x => criterionIds.includes(x.requirementRef)), 'planning.coverageUnknown', 'plan.requirementCoverage', 'Unknown requirement');
  for (const step of steps) f.require(step.allowedTools.length > 0 && step.verificationChecks.every(x => authority.checks.some(check => check.checkId === x)),
    'planning.stepCheck', 'plan.steps', 'Step has no tool or references an unknown check');
  for (const assumption of plan.assumptions) f.require(assumption.status === 'supported' && assumption.evidenceRefs.length > 0 && assumption.evidenceRefs.every(x => authority.evidence.some(e => e.evidenceId === x)),
    'planning.assumption', 'plan.assumptions', 'Unsupported assumption', 'unknown');
  return f.result();
}

const outcomeSchema = z.enum(['pass', 'fail', 'unknown', 'blocked']);
const trialSchema = z.strictObject({ trialId: z.string().min(1), scenarioId: z.string().min(1), failureClass: z.string().min(1), expectedAccept: z.boolean(), attempts: z.array(outcomeSchema).min(1) });
const zScores: Readonly<Record<string, number>> = { '0.9': 1.6448536269514722, '0.95': 1.959963984540054, '0.99': 2.5758293035489004 };
/** Two-sided Wilson interval. Null denominator is unknown, never zero risk. */
export function rateInterval(count: number, denominator: number, confidence = 0.95): RateInterval {
  if (!Number.isSafeInteger(count) || !Number.isSafeInteger(denominator) || count < 0 || denominator < count || !zScores[String(confidence)]) throw new Error('Invalid binomial rate inputs/confidence');
  if (denominator === 0) return { count, denominator, rate: null, lower: null, upper: null, confidence };
  const z = zScores[String(confidence)]!, p = count / denominator, z2 = z * z, d = 1 + z2 / denominator;
  const center = (p + z2 / (2 * denominator)) / d;
  const margin = z * Math.sqrt(p * (1 - p) / denominator + z2 / (4 * denominator * denominator)) / d;
  return { count, denominator, rate: p, lower: Math.max(0, center - margin), upper: Math.min(1, center + margin), confidence };
}

/** Descriptive fixture measurements; repeated scenarios are not evidence of semantic generalization. */
export function calculateBenchmark(trialsInput: readonly BenchmarkTrial[], confidence = 0.95): BenchmarkSummary {
  const trials = z.array(trialSchema).min(1).parse(trialsInput);
  if (!unique(trials.map(x => x.trialId))) throw new Error('Duplicate trial ID');
  rateInterval(0, 0, confidence);
  const classes = [...new Set(trials.map(x => x.failureClass))].sort();
  const families = classes.map(failureClass => {
    const selected = trials.filter(x => x.failureClass === failureClass);
    let truePositive = 0, trueNegative = 0, falsePositive = 0, falseNegative = 0, firstAttemptSuccesses = 0, wholeWorkflowSuccesses = 0, unknownAttempts = 0;
    for (const trial of selected) {
      // A false handoff on an earlier attempt cannot be erased by a later rejection.
      const first = trial.attempts[0] === 'pass', accepted = trial.attempts.some(x => x === 'pass');
      if (trial.expectedAccept && accepted) truePositive++;
      else if (!trial.expectedAccept && !accepted) trueNegative++;
      else if (!trial.expectedAccept && accepted) falsePositive++;
      else falseNegative++;
      if (first === trial.expectedAccept) firstAttemptSuccesses++;
      if (accepted === trial.expectedAccept) wholeWorkflowSuccesses++;
      unknownAttempts += trial.attempts.filter(x => x === 'unknown').length;
    }
    return { failureClass, truePositive, trueNegative, falsePositive, falseNegative, trials: selected.length, firstAttemptSuccesses, wholeWorkflowSuccesses, unknownAttempts,
      falseAcceptance: rateInterval(falsePositive, falsePositive + trueNegative, confidence), falseRejection: rateInterval(falseNegative, falseNegative + truePositive, confidence) };
  });
  return { kind: 'mechanical-fixture-calibration', families, trials: trials.length, confidence,
    interpretation: 'descriptive-fixture-counts-only', populationInference: false,
    intervalInterpretation: 'binomial-formula-reference-assumptions-not-verified' };
}

const datasetSchema = z.strictObject({ kind: z.literal('mechanical-fixture'), cases: z.array(z.strictObject({
  scenarioId: z.string().min(1), failureClass: z.string().min(1), expectedAccept: z.boolean(), split: z.literal('holdout'), taskClass: z.literal('runtime.fixture'),
})).min(1) });
const labelsSchema = z.strictObject({ kind: z.literal('mechanical-oracle'), labels: z.array(z.strictObject({ scenarioId: z.string().min(1), expectedAccept: z.boolean() })).min(1) });
const checkSetSchema = z.strictObject({ checks: z.array(z.strictObject({ stage: z.enum(['planning', 'pre-dispatch', 'post-execution']), definition: schemas.CheckDefinition })).min(1) });
const projection = (m: FamilyMetrics): PolicyRelease['metricsByFailureClass'][number] => ({ failureClass: m.failureClass,
  truePositive: m.truePositive, trueNegative: m.trueNegative, falsePositive: m.falsePositive, falseNegative: m.falseNegative,
  trials: m.trials, firstAttemptSuccesses: m.firstAttemptSuccesses, wholeWorkflowSuccesses: m.wholeWorkflowSuccesses });

/** The argument is the broker's protected snapshot, not authority declared by a task. */
export function validatePolicyRelease(releaseId: string, taskClass: string, stage: EvaluationStage, authority: PolicyAuthority, now: string): EvaluationResult {
  const f = new Findings();
  const releases = authority.releases.filter(x => x.releaseId === releaseId);
  f.require(releases.length === 1, 'policy.lookup', 'releaseId', 'Missing or ambiguous trusted policy release');
  if (releases.length !== 1) return f.result();
  const parsed = schemas.PolicyRelease.safeParse(releases[0]);
  if (!parsed.success) { f.add('policy.schema', 'release', 'Invalid release contract'); return f.result(); }
  const policy = parsed.data;
  f.require(policy.status === 'active', 'policy.inactive', 'release.status', 'Only active releases permit a handoff', 'blocked');
  f.require(validTime(now) && !!policy.activatedAt && Date.parse(policy.activatedAt) <= Date.parse(now), 'policy.time', 'release.activatedAt', 'Invalid/future activation time');
  f.require(authority.policyOwnerIds.includes(policy.ownerId) && authority.policyOwnerIds.includes(policy.approvedBy ?? ''), 'policy.owner', 'release.approvedBy', 'Unauthorized release owner/approver');
  f.require(taskClass === 'runtime.fixture' && policy.permittedTaskClasses.length === 1 && policy.permittedTaskClasses[0] === taskClass,
    'policy.taskClass', 'release.permittedTaskClasses', 'Phase 2 release is restricted to the mechanical runtime.fixture class');
  const manifests = authority.calibrations.filter(x => x.releaseId === releaseId);
  f.require(manifests.length === 1, 'policy.calibration', 'calibration', 'Missing or ambiguous calibration manifest');
  if (manifests.length !== 1) return f.result();
  const manifest = manifests[0]!;
  f.require(manifest.kind === 'mechanical-fixture' && unique(manifest.stages) && stages.includes(stage) && manifest.stages.includes(stage),
    'policy.stage', 'calibration.stages', 'Release does not cover this stage');
  f.require(unique(manifest.requiredFailureClasses) && manifest.requiredFailureClasses.length > 0 &&
    [manifest.minTrialsPerFamily, manifest.minPositivePerFamily, manifest.minNegativePerFamily, manifest.maxAttemptsPerTrial].every(x => Number.isSafeInteger(x) && x > 0) &&
    Number.isFinite(manifest.maxFalseRejectRate) && manifest.maxFalseRejectRate >= 0 && manifest.maxFalseRejectRate <= 1 && !!zScores[String(manifest.confidence)],
  'policy.limits', 'calibration', 'Invalid or absent locked sampling/risk limits');
  const artifact = (ref: string): PinnedArtifact | undefined => {
    const matches = authority.artifacts.filter(x => x.ref === ref);
    const value = matches[0];
    f.require(matches.length === 1 && !!value && same(value.contentDigest, digestSafely(value.content)), 'policy.artifact', ref, 'Missing, ambiguous or tampered trusted artifact');
    return matches.length === 1 && value && value.contentDigest === digestSafely(value.content) ? value : undefined;
  };
  f.require(unique(manifest.artifactPins.map(x => x.ref)) && !manifest.artifactPins.some(x => x.ref === manifest.configRef), 'policy.artifactPins', 'calibration.artifactPins', 'Pins must be unique and cannot self-pin config');
  for (const pin of manifest.artifactPins) f.require(artifact(pin.ref)?.contentDigest === pin.contentDigest, 'policy.pin', pin.ref, 'Referenced artifact drifted after calibration');
  const requiredRefs = [manifest.datasetRef, manifest.trialsRef, manifest.checkSetRef, manifest.rubricRef, policy.humanLabelSetRef, policy.uncertaintyReportRef,
    ...manifest.criterionEvidenceRefs, ...policy.fixtureEvidenceRefs, ...(manifest.modelRef ? [manifest.modelRef] : []), ...(manifest.promptRef ? [manifest.promptRef] : [])];
  f.require(requiredRefs.every(ref => manifest.artifactPins.some(x => x.ref === ref)), 'policy.pinMissing', 'calibration.artifactPins', 'Every referenced release artifact must have a locked digest');
  const config = artifact(manifest.configRef), dataset = artifact(manifest.datasetRef), checksArtifact = artifact(manifest.checkSetRef), rubric = artifact(manifest.rubricRef);
  f.require(config?.contentDigest === policy.configHash && same(config?.content, manifest), 'policy.config', 'release.configHash', 'Config differs from the locked calibration manifest');
  f.require(dataset?.contentDigest === policy.datasetSplitHash, 'policy.dataset', 'release.datasetSplitHash', 'Dataset/split digest mismatch');
  f.require(checksArtifact?.contentDigest === policy.checkSetDigest, 'policy.checkSet', 'release.checkSetDigest', 'Checkset digest mismatch');
  const checks = checkSetSchema.safeParse(checksArtifact?.content);
  f.require(checks.success, 'policy.checkDefinitions', 'checkSet', 'Invalid referenced check definitions');
  if (checks.success) {
    f.require(unique(checks.data.checks.map(x => `${x.stage}:${x.definition.checkId}`)), 'policy.checkDuplicate', 'checkSet', 'Ambiguous stage check definitions');
    const methods = [...new Set(checks.data.checks.map(x => x.definition.method))].sort();
    f.require(same([...policy.checkMethods].sort(), methods), 'policy.methods', 'release.checkMethods', 'Method declaration differs from actual checks');
    f.require(checks.data.checks.every(x => x.definition.method === 'deterministic'), 'policy.semanticShadow', 'checkSet', 'Semantic model/human release remains shadow until separately calibrated in T20', 'blocked');
    f.require(manifest.stages.every(s => checks.data.checks.some(x => x.stage === s)), 'policy.stageChecks', 'checkSet', 'A released stage has no check definition');
    f.require(policy.releaseCriteria.every(x => checks.data.checks.some(y => y.definition.checkId === x.checkRef)), 'policy.criterionCheck', 'release.releaseCriteria', 'Release criterion references an absent check');
  }
  const rubricParsed = z.strictObject({ version: z.string().min(1), criteria: z.array(z.strictObject({ criterionId: z.string().min(1), checkRef: z.string().min(1) })).min(1) }).safeParse(rubric?.content);
  f.require(rubricParsed.success && rubricParsed.data.version === policy.rubricVersion && same(rubricParsed.data.criteria,
    policy.releaseCriteria.map(({ criterionId, checkRef }) => ({ criterionId, checkRef }))), 'policy.rubric', 'release.rubricVersion', 'Rubric or criteria identity mismatch');
  if (policy.checkMethods.includes('model')) {
    const model = manifest.modelRef ? artifact(manifest.modelRef) : undefined, prompt = manifest.promptRef ? artifact(manifest.promptRef) : undefined;
    f.require(!!model && same(model.content, { version: policy.modelVersion }) && prompt?.contentDigest === policy.promptHash,
      'policy.modelPins', 'release', 'Model/prompt declaration lacks matching content pins');
    f.add('policy.semanticShadow', 'release', 'Model checks cannot auto-release in Phase 2', 'blocked');
  } else f.require(manifest.modelRef === null && manifest.promptRef === null && policy.modelVersion === null && policy.promptHash === null,
    'policy.modelPins', 'calibration', 'Mechanical-only release cannot invent model/prompt pins');
  const data = datasetSchema.safeParse(dataset?.content), labels = labelsSchema.safeParse(artifact(policy.humanLabelSetRef)?.content);
  f.require(data.success && labels.success, 'policy.labels', 'dataset', 'Missing locked scenario/independent mechanical oracle labels');
  if (!data.success || !labels.success) return f.result();
  f.require(unique(data.data.cases.map(x => x.scenarioId)) && unique(labels.data.labels.map(x => x.scenarioId)) && data.data.cases.length === labels.data.labels.length &&
    data.data.cases.every(x => labels.data.labels.some(y => y.scenarioId === x.scenarioId && y.expectedAccept === x.expectedAccept)),
  'policy.labels', 'dataset', 'Scenario identities or oracle labels disagree');
  const trials = z.array(trialSchema).min(1).safeParse(artifact(manifest.trialsRef)?.content);
  if (!trials.success) { f.add('policy.trials', 'trials', 'Invalid or absent measured trial records'); return f.result(); }
  f.require(unique(trials.data.map(x => x.scenarioId)) && trials.data.every(x => x.attempts.length <= manifest.maxAttemptsPerTrial && data.data.cases.some(y => y.scenarioId === x.scenarioId && y.failureClass === x.failureClass && y.expectedAccept === x.expectedAccept)) &&
    data.data.cases.every(x => trials.data.some(y => y.scenarioId === x.scenarioId)),
  'policy.trialCoverage', 'trials', 'Unknown/omitted scenario, mismatched label, or exceeded attempt budget');
  let summary: BenchmarkSummary;
  try { summary = calculateBenchmark(trials.data, manifest.confidence); }
  catch { f.add('policy.trials', 'trials', 'Duplicate or invalid measured trials'); return f.result(); }
  f.require(same(policy.metricsByFailureClass, summary.families.map(projection)), 'policy.metrics', 'release.metricsByFailureClass', 'Self-reported metrics differ from measured trials');
  f.require(same(artifact(policy.uncertaintyReportRef)?.content, summary), 'policy.uncertainty', 'release.uncertaintyReportRef', 'Uncertainty report does not describe the actual measured trials');
  f.require(unique(policy.riskTargets.map(x => x.failureClass)) && same([...manifest.requiredFailureClasses].sort(), summary.families.map(x => x.failureClass)) &&
    same([...manifest.requiredFailureClasses].sort(), policy.riskTargets.map(x => x.failureClass).sort()),
  'policy.familyCoverage', 'calibration', 'Failure families or risk targets are missing/duplicated');
  for (const family of summary.families) {
    const risk = policy.riskTargets.find(x => x.failureClass === family.failureClass);
    f.require(family.trials >= manifest.minTrialsPerFamily && family.falseAcceptance.denominator >= manifest.minNegativePerFamily && family.falseRejection.denominator >= manifest.minPositivePerFamily,
      'policy.sampleSize', family.failureClass, 'Insufficient positive/negative calibration cases');
    f.require(family.unknownAttempts === 0, 'policy.unknownTrials', family.failureClass, 'Adapter/unknown outcomes are not release evidence');
    f.require(!!risk && risk.confidence === manifest.confidence && family.falseAcceptance.upper !== null && family.falseAcceptance.upper <= risk.maxFalseAcceptRate &&
      family.falseRejection.upper !== null && family.falseRejection.upper <= manifest.maxFalseRejectRate,
    'policy.risk', family.failureClass, 'Measured uncertainty exceeds locked acceptance/rejection risk targets');
  }
  f.require(unique(manifest.criterionEvidenceRefs) && policy.releaseCriteria.length === manifest.criterionEvidenceRefs.length &&
    same([...policy.fixtureEvidenceRefs].sort(), [...manifest.criterionEvidenceRefs].sort()), 'policy.criteria', 'calibration', 'Release criteria lack exact evidence coverage');
  for (const criterion of policy.releaseCriteria) {
    f.require(manifest.criterionEvidenceRefs.some(ref => same(artifact(ref)?.content,
      { kind: 'mechanical-fixture', criterionId: criterion.criterionId, checkRef: criterion.checkRef, outcome: 'pass', reportDigest: digest(summary) })),
    'policy.criterionEvidence', criterion.criterionId, 'Criterion has no passing evidence bound to this measured campaign');
  }
  return f.result();
}
const digestSafely = (content: unknown): string | null => { try { return digest(content); } catch { return null; } };

const verifierReportSchema = z.strictObject({
  schemaVersion: z.literal('verifier-report/1'), reportId: z.string().min(1), runId: z.string().min(1), operationId: z.string().min(1),
  subjectDigest: z.string().regex(/^sha256:[a-f0-9]{64}$/), checkSetDigest: z.string().regex(/^sha256:[a-f0-9]{64}$/), environmentDigest: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  startedAt: z.iso.datetime({ offset: true }), finishedAt: z.iso.datetime({ offset: true }), adapterStatus: z.enum(['completed', 'error']), error: z.string().min(1).optional(),
  total: z.number().int().nonnegative().safe(), tests: z.array(z.strictObject({ testId: z.string().min(1), outcome: z.enum(['pass', 'fail', 'skipped', 'unknown']) })),
});

export function evaluateVerifierReport(input: unknown, expected: VerifierExpectation, receipt: TrustedVerifierReceipt | null): EvaluationResult {
  const f = new Findings(), parsed = verifierReportSchema.safeParse(input);
  if (!parsed.success) { f.add('verifier.schema', '$', 'Missing or malformed verifier report'); return f.result(); }
  const report = parsed.data;
  f.require(!!receipt && receipt.reportDigest === digest(report), 'verifier.reportHash', 'receipt', 'Report bytes are not bound to a protected runner receipt');
  for (const key of ['reportId', 'runId', 'operationId', 'subjectDigest', 'checkSetDigest', 'environmentDigest'] as const) {
    f.require(report[key] === expected[key] && receipt?.[key] === expected[key], 'verifier.binding', key, 'Report or receipt is stale or belongs to a different run/subject');
  }
  for (const key of ['runnerId', 'principalId', 'runnerVersion', 'configDigest'] as const) {
    f.require(receipt?.[key] === expected[key], 'verifier.provenance', key, 'Receipt issuer/config is not the independently selected runner');
  }
  f.require(validTime(expected.now) && validTime(expected.notBefore) && !!receipt && validTime(receipt.recordedAt) &&
    Date.parse(report.startedAt) >= Date.parse(expected.notBefore) && Date.parse(report.finishedAt) >= Date.parse(report.startedAt) &&
    Date.parse(report.finishedAt) <= Date.parse(expected.now) && Date.parse(receipt.recordedAt) >= Date.parse(report.finishedAt) && Date.parse(receipt.recordedAt) <= Date.parse(expected.now),
  'verifier.time', 'report', 'Stale, future or contradictory runner timestamps');
  if (report.adapterStatus === 'error') {
    f.require(!!report.error, 'verifier.adapterErrorDetails', 'error', 'Adapter error requires diagnostics');
    f.add('verifier.adapterError', 'adapterStatus', 'Verifier adapter failed; no correctness conclusion is available', 'unknown');
    return f.result();
  }
  f.require(report.error === undefined, 'verifier.errorState', 'error', 'Completed report contains adapter error');
  f.require(expected.expectedTestIds.length > 0 && unique(expected.expectedTestIds), 'verifier.expectedTests', '$expected', 'Expected test IDs must be nonempty and unique');
  f.require(report.total > 0 && report.total === report.tests.length, 'verifier.count', 'total', 'Zero tests or count mismatch');
  f.require(unique(report.tests.map(x => x.testId)), 'verifier.duplicate', 'tests', 'Duplicate test results');
  f.require(report.tests.length === expected.expectedTestIds.length && report.tests.every(x => expected.expectedTestIds.includes(x.testId)) &&
    expected.expectedTestIds.every(id => report.tests.some(x => x.testId === id)), 'verifier.testSet', 'tests', 'Missing or unexpected tests');
  for (const result of report.tests) {
    if (result.outcome === 'skipped') f.add('verifier.skipped', result.testId, 'A required test was skipped');
    if (result.outcome === 'fail') f.add('verifier.failed', result.testId, 'A required test failed');
    if (result.outcome === 'unknown') f.add('verifier.unknown', result.testId, 'A required test has no known result', 'unknown');
  }
  return f.result();
}

/** Used by the independent verifier/controller only, after storing its evaluation evidence. */
export function deterministicCheckResult(definition: CheckDefinition, subjectDigest: string, evaluation: EvaluationResult,
  evidenceRef: string, producedBy: string, producedAt: string): CheckResult {
  if (definition.method !== 'deterministic') throw new Error('Phase 2 only issues deterministic mechanical results');
  return schemas.CheckResult.parse({ schemaVersion: SCHEMA_VERSION, checkId: definition.checkId, definitionDigest: digest(definition),
    method: 'deterministic', verifierVersion: definition.verifierVersion, validatorRef: definition.validatorRef,
    subjectDigest, evidenceRefs: evidenceRef ? [evidenceRef] : [], outcome: evaluation.outcome, producedBy, producedAt,
    ...(evaluation.outcome === 'unknown' ? { unknownReason: evaluation.issues.map(x => x.code).join(', ') || 'Unknown evaluation' } : {}),
    ...(evaluation.outcome === 'blocked' ? { blockerRef: evidenceRef || 'evaluation-blocker' } : {}),
  });
}

function evaluateGateChecks(request: GateRequest, authority: RuntimeAuthorityConfig, now: string): EvaluationResult {
  const f = new Findings();
  f.merge(validatePolicyRelease(request.policyReleaseId, request.taskClass, request.stage, authority.policy, now));
  f.require(stages.includes(request.stage) && unique(request.inputVersions.map(x => x.ref)) && request.inputVersions.length > 0,
    'gate.inputs', 'inputVersions', 'Stage/current input references are absent or ambiguous');
  f.require(request.inputVersions.length === authority.planning.expectedInputs.length &&
    request.inputVersions.every(x => authority.planning.expectedInputs.some(y => same(x, y))),
  'gate.inputPins', 'inputVersions', 'Gate inputs differ from current protected planning pins');
  const stageChecks = authority.gate.checks.filter(x => x.stage === request.stage && x.definition.applicability.taskClasses.includes(request.taskClass));
  f.require(stageChecks.length > 0 && unique(stageChecks.map(x => x.definition.checkId)), 'gate.checkRegistry', 'checks', 'No unique stage-specific checkset');
  const manifest = authority.policy.calibrations.find(x => x.releaseId === request.policyReleaseId);
  const checkSet = manifest && authority.policy.artifacts.find(x => x.ref === manifest.checkSetRef);
  const registered = checkSetSchema.safeParse(checkSet?.content);
  f.require(registered.success && authority.gate.checks.every(x => registered.data.checks.some(y => same(x, y))) &&
    registered.data.checks.every(x => authority.gate.checks.some(y => same(x, y))),
  'gate.checkSetDrift', 'checks', 'Runtime stage checks differ from released checkset');
  f.require(unique(request.checkResults.map(x => x.checkId)), 'gate.duplicateCheck', 'checkResults', 'Duplicate check results');
  for (const { definition } of stageChecks) {
    if (definition.critical || definition.applicability.required) {
      const result = request.checkResults.find(x => x.checkId === definition.checkId);
      f.require(!!result, 'gate.missingCheck', definition.checkId, 'Required stage check is missing', 'unknown');
    }
  }
  for (const candidate of request.checkResults) {
    const parsed = schemas.CheckResult.safeParse(candidate);
    if (!parsed.success) { f.add('gate.checkSchema', 'checkResults', 'Invalid check result'); continue; }
    const result = parsed.data, def = stageChecks.find(x => x.definition.checkId === result.checkId)?.definition;
    f.require(!!def && result.definitionDigest === digest(def) && result.method === def.method && result.verifierVersion === def.verifierVersion,
      'gate.definition', result.checkId, 'Unregistered or stale check definition');
    f.require(authority.gate.trustedCheckResults.some(x => x.stage === request.stage && same(x.result, result)),
      'gate.untrustedCheck', result.checkId, 'Check result was not independently recorded for this stage');
    f.require(authority.gate.verifierIds.includes(result.producedBy), 'gate.checkIssuer', result.checkId, 'Executor/self-declared producer is not a trusted verifier');
    f.require(result.subjectDigest === request.subjectDigest && validTime(now) && Date.parse(result.producedAt) <= Date.parse(now),
      'gate.checkBinding', result.checkId, 'Result subject or time is stale');
    if (result.method === 'deterministic' && def?.method === 'deterministic') f.require(result.validatorRef === def.validatorRef,
      'gate.validator', result.checkId, 'Verifier identity drift');
    if (result.outcome !== 'pass') f.add(`gate.check.${result.outcome}`, result.checkId, 'Required/applicable stage checks cannot be skipped or overridden by score',
      result.outcome === 'unknown' ? 'unknown' : result.outcome === 'blocked' ? 'blocked' : 'fail');
  }
  return f.result();
}

export function issueStageGate(request: GateRequest, authority: RuntimeAuthorityConfig, now: string): GateIssueResult {
  const evaluated = evaluateGateChecks(request, authority, now);
  const policy = authority.policy.releases.find(x => x.releaseId === request.policyReleaseId);
  if (!policy || request.checkResults.length === 0 || request.checkResults.some(x => !schemas.CheckResult.safeParse(x).success)) return { ...evaluated, gate: null };
  const verdict = { pass: 'PASS', fail: 'FAIL', unknown: 'UNKNOWN', blocked: 'BLOCKED' } as const;
  const reportParsed = schemas.GateReport.safeParse({ schemaVersion: SCHEMA_VERSION, gateReportId: request.gateReportId,
    artifactHash: request.subjectDigest, rubricVersion: policy.rubricVersion, policyReleaseId: policy.releaseId,
    inputVersions: request.inputVersions, checkResults: request.checkResults, dimensionScores: request.dimensionScores ?? [],
    evidenceRefs: [...new Set(request.checkResults.flatMap(x => x.evidenceRefs))],
    defects: evaluated.issues.map((x, i) => ({ defectId: `${request.gateReportId}:defect:${i}`, checkRef: x.path || '$', severity: 'critical' as const, description: `${x.code}: ${x.message}` })),
    verdict: verdict[evaluated.outcome], issuerId: authority.gate.issuerId, issuedAt: now,
  });
  if (!reportParsed.success) return { outcome: 'fail', issues: [...evaluated.issues, { code: 'gate.schema', path: '$', message: 'GateReport contract rejected the output' }], gate: null };
  const base = { schemaVersion: 'stage-gate/1' as const, stage: request.stage, taskClass: request.taskClass,
    policyDigest: digest(policy), report: reportParsed.data, reportDigest: digest(reportParsed.data) };
  return { ...evaluated, gate: { ...base, envelopeDigest: digest(base) } };
}

/** Lookup by ID from the protected store. Candidate-provided embedded PASS is never consulted. */
export function lookupStageGate(gateId: string, expected: GateExpectation, trustedEnvelopes: readonly StageGateEnvelope[], authority: RuntimeAuthorityConfig, now: string): EvaluationResult {
  const f = new Findings(), matches = trustedEnvelopes.filter(x => x.report.gateReportId === gateId);
  f.require(matches.length === 1, 'gate.lookup', 'gateReportId', 'Missing or ambiguous protected gate');
  if (matches.length !== 1) return f.result();
  const envelope = matches[0]!, parsed = schemas.GateReport.safeParse(envelope.report);
  if (!parsed.success) { f.add('gate.schema', 'report', 'Protected record is malformed'); return f.result(); }
  const report = parsed.data, { envelopeDigest: _digest, ...base } = envelope;
  f.require(envelope.schemaVersion === 'stage-gate/1' && digest(base) === envelope.envelopeDigest && digest(report) === envelope.reportDigest,
    'gate.envelopeDigest', '$', 'Stage envelope or report content was tampered');
  f.require(envelope.stage === expected.stage && envelope.taskClass === expected.taskClass, 'gate.stage', 'stage', 'Gate is for a different stage/class');
  const policy = authority.policy.releases.find(x => x.releaseId === expected.policyReleaseId);
  f.require(!!policy && envelope.policyDigest === digest(policy) && report.policyReleaseId === expected.policyReleaseId,
    'gate.policyDrift', 'policyReleaseId', 'Release changed/revoked since gate issuance');
  f.require(report.issuerId === authority.gate.issuerId, 'gate.issuer', 'issuerId', 'Untrusted Gate Controller');
  f.require(report.verdict === 'PASS' && report.artifactHash === expected.subjectDigest && same(report.inputVersions, expected.inputVersions),
    'gate.stale', 'report', 'Gate is not PASS for the current subject/input versions');
  f.require(validTime(now) && Date.parse(report.issuedAt) <= Date.parse(now), 'gate.time', 'issuedAt', 'Future or invalid gate clock');
  f.merge(evaluateGateChecks({ gateReportId: gateId, stage: expected.stage, taskClass: expected.taskClass,
    subjectDigest: expected.subjectDigest, inputVersions: expected.inputVersions, policyReleaseId: expected.policyReleaseId, checkResults: report.checkResults }, authority, now));
  return f.result();
}
