import { z } from 'zod';
import { canonicalJson } from './canonical.js';
import { PlanLevelSchema, PLANNING_SCHEMA_VERSION, brainPlanningSchemas } from './brain-planning.js';

export const SCHEMA_VERSION = '0.5.0' as const;
const version = z.literal(SCHEMA_VERSION);
const text = z.string().min(1).refine((value) => value.trim().length > 0, 'Expected non-blank text');
const count = z.number().int().nonnegative().safe();
const positive = z.number().int().positive().safe();
const amount = z.number().nonnegative().finite();
const timestamp = z.iso.datetime({ offset: true });
export const DigestSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const digestRef = DigestSchema;
const refs = z.array(text);
const uniqueRefs = refs.refine((items) => new Set(items).size === items.length, 'Duplicate references');
export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
export const JsonValueSchema = z.custom<JsonValue>((input) => {
  try { canonicalJson(input); return true; } catch { return false; }
}, 'Expected JSON data without cycles, accessors or non-JSON values');
const JsonRecordSchema = z.record(z.string(), JsonValueSchema);

const ScopeSchema = z.strictObject({ repoId: text, allowedPaths: uniqueRefs, taskClasses: uniqueRefs });
const ApplicabilitySchema = z.strictObject({ taskClasses: uniqueRefs, required: z.boolean(), reason: text });
const BudgetSpentSchema = z.strictObject({
  tokens: count.nullable(), cost: amount.nullable(), currency: text,
  status: z.enum(['unknown', 'estimated', 'measured']), sourceRef: text.nullable(),
}).superRefine((value, ctx) => {
  if (value.status === 'unknown' && (value.tokens !== null || value.cost !== null)) {
    ctx.addIssue({ code: 'custom', message: 'Unknown usage must not report a numeric value' });
  }
  if (value.status !== 'unknown' && (value.sourceRef === null || value.tokens === null || value.cost === null)) {
    ctx.addIssue({ code: 'custom', message: 'Known usage requires numbers and provenance' });
  }
});
const VersionBindingSchema = z.strictObject({ ref: text, version: text, digest: digestRef });
const ErrorSchema = z.strictObject({ code: text, message: text, retryable: z.boolean() });
const ArtifactSchema = z.strictObject({ artifactId: text, uri: z.url(), hash: digestRef, kind: text });
const CapabilityBindingSchema = z.strictObject({
  capability: text, implementationRef: text, implementationDigest: digestRef, targetProjectId: text,
});
const ResourceSchema = z.strictObject({ path: text, kind: z.enum(['body', 'reference', 'script']), contentHash: digestRef });
const PackageSchema = z.strictObject({ name: text, version: text });
const recoveryMode = z.enum(['readOnly', 'idempotent', 'reconcilable', 'nonRetryable']);
const toolStatus = z.enum(['succeeded', 'failed', 'timed_out', 'cancelled', 'unknown']);
const outcome = z.enum(['pass', 'fail', 'blocked', 'unknown', 'not_applicable']);
const method = z.enum(['deterministic', 'model', 'human']);

export const ContextBudgetSchema = z.strictObject({
  schemaVersion: version, modelConfigVersion: text, inputLimit: positive,
  outputReserve: count, headroom: count,
  tokenAccountingPolicy: z.strictObject({ version: text, tokenizer: text, includeToolOutputs: z.boolean() }),
  taskSpendLimit: z.strictObject({ amount, currency: text }),
}).superRefine((value, ctx) => {
  if (value.outputReserve + value.headroom >= value.inputLimit) {
    ctx.addIssue({ code: 'custom', path: ['inputLimit'], message: 'Budget must leave room for input' });
  }
});
export const TaskSpecSchema = z.strictObject({
  schemaVersion: version, taskId: text, taskClass: text, goal: text,
  acceptanceCriteria: z.array(z.strictObject({ criterionId: text, description: text, checkRefs: uniqueRefs })).min(1),
  repoId: text, baseRevision: text, allowedPaths: uniqueRefs.min(1),
  constraints: z.array(z.strictObject({ id: text, description: text, sourceRevision: text, contentHash: digestRef, applicability: ApplicabilitySchema })),
  budget: ContextBudgetSchema,
});
export const ContextManifestSchema = z.strictObject({
  schemaVersion: version, manifestId: text, manifestDigest: digestRef, taskSpecDigest: digestRef,
  role: text, scope: ScopeSchema,
  constraintBindings: z.array(z.strictObject({ id: text, sourceRevision: text, contentHash: digestRef, applicability: ApplicabilitySchema })),
  evidenceBindings: z.array(z.strictObject({ evidenceId: text, sourceRevision: text, contentHash: digestRef })),
  contextPolicyVersion: text, modelConfigVersion: text, budgetReportRef: text,
});
export const ContextBundleSchema = z.strictObject({
  schemaVersion: version, bundleId: text, taskId: text, snapshotId: text, memoryVersion: text,
  manifestRef: text, manifestDigest: digestRef,
  evidenceItems: z.array(z.strictObject({ evidenceId: text, contentHash: digestRef, sourceRef: text })),
  unknowns: z.array(z.strictObject({ id: text, description: text, critical: z.boolean() })),
  excludedItems: z.array(z.strictObject({ ref: text, reason: text })), tokenCount: count,
});
export const PlanStepSchema = z.strictObject({
  schemaVersion: version, stepId: text, dependsOn: uniqueRefs, capability: text,
  inputs: uniqueRefs, outputs: uniqueRefs, allowedTools: uniqueRefs,
  verificationChecks: uniqueRefs.min(1), stopCondition: text,
});
const IntegrationContractSchema = z.strictObject({ contractId: text, producerRef: text, consumerRef: text, schemaRef: text, invariantRefs: uniqueRefs });
export const SubPlanSchema = z.strictObject({
  schemaVersion: version, planId: text, scope: ScopeSchema, requirementRefs: uniqueRefs,
  contracts: z.array(IntegrationContractSchema), dependencies: uniqueRefs, evidenceRefs: uniqueRefs,
  unresolvedItems: z.array(z.strictObject({ id: text, description: text, blocking: z.boolean() })),
  steps: z.array(PlanStepSchema).min(1),
});
export const PlanPackageSchema = z.strictObject({
  schemaVersion: z.literal(PLANNING_SCHEMA_VERSION), planId: text, version: positive, hash: digestRef,
  level: PlanLevelSchema, parentPlanRef: text.nullable(), milestoneRef: text,
  interfaceApprovalRefs: uniqueRefs, readyChecklistRef: text, changeRequestRefs: uniqueRefs, spikeRefs: uniqueRefs,
  subplans: z.array(SubPlanSchema).min(1), integrationContracts: z.array(IntegrationContractSchema),
  requirementCoverage: z.array(z.strictObject({ requirementRef: text, stepRefs: uniqueRefs.min(1), checkRefs: uniqueRefs.min(1) })).min(1),
  assumptions: z.array(z.strictObject({ id: text, statement: text, evidenceRefs: uniqueRefs, status: z.enum(['unverified', 'supported', 'rejected']) })),
  risks: z.array(z.strictObject({ id: text, description: text, mitigation: text, severity: z.enum(['low', 'medium', 'high', 'critical']) })),
  planningModeDecisionRef: text,
});
export const ToolCallSchema = z.strictObject({
  schemaVersion: version, callId: text, operationId: text, attemptId: text, runId: text, stepId: text,
  capability: text, toolRef: text, implementationDigest: digestRef, targetProjectId: text,
  toolVersion: text, arguments: JsonRecordSchema, argumentsHash: digestRef, idempotencyKey: text,
  expectedWorkspaceDigest: digestRef, recoveryMode, timeoutMs: positive,
  permissionScope: z.strictObject({ allowedPaths: uniqueRefs, allowedCommands: uniqueRefs, networkDestinations: uniqueRefs }),
});
export const ToolResultSchema = z.strictObject({
  schemaVersion: version, callId: text, operationId: text, attemptId: text, status: toolStatus,
  startedAt: timestamp, finishedAt: timestamp, exitCode: z.number().int().optional(),
  receiptRef: text.optional(), postconditionRefs: uniqueRefs, artifacts: z.array(ArtifactSchema),
  errors: z.array(ErrorSchema), workspaceSnapshot: z.strictObject({ snapshotId: text, digest: digestRef }),
}).superRefine((value, ctx) => {
  if (Date.parse(value.finishedAt) < Date.parse(value.startedAt)) ctx.addIssue({ code: 'custom', message: 'Finished before started' });
  if (value.status === 'succeeded' && (value.errors.length > 0 || (value.exitCode !== undefined && value.exitCode !== 0))) {
    ctx.addIssue({ code: 'custom', message: 'Succeeded result cannot contain errors or nonzero exit code' });
  }
  if (value.status !== 'succeeded' && value.errors.length === 0) ctx.addIssue({ code: 'custom', message: 'Unsuccessful result requires diagnostic error' });
});
const checkDefinitionBase = {
  schemaVersion: version, checkId: text, version: text, requirementRefs: uniqueRefs.min(1),
  verifierVersion: text, requiredEvidenceKinds: uniqueRefs.min(1), critical: z.boolean(), applicability: ApplicabilitySchema,
};
export const CheckDefinitionSchema = z.discriminatedUnion('method', [
  z.strictObject({ ...checkDefinitionBase, method: z.literal('deterministic'), validatorRef: text }),
  z.strictObject({ ...checkDefinitionBase, method: z.literal('model'), rubricRef: text, judgeConfigRef: text }),
  z.strictObject({ ...checkDefinitionBase, method: z.literal('human'), reviewerRole: text }),
]);
const checkResultBase = {
  schemaVersion: version, checkId: text, definitionDigest: digestRef, verifierVersion: text,
  subjectDigest: digestRef, evidenceRefs: uniqueRefs, outcome,
  unknownReason: text.optional(), blockerRef: text.optional(), notApplicableReason: text.optional(),
  producedBy: text, producedAt: timestamp,
};
export const CheckResultSchema = z.discriminatedUnion('method', [
  z.strictObject({ ...checkResultBase, method: z.literal('deterministic'), validatorRef: text }),
  z.strictObject({ ...checkResultBase, method: z.literal('model'), rubricRef: text, judgeConfigRef: text, policyReleaseId: text }),
  z.strictObject({ ...checkResultBase, method: z.literal('human'), reviewerRole: text, reviewRecordRef: text }),
]).superRefine((value, ctx) => {
  const reasons = { unknown: 'unknownReason', blocked: 'blockerRef', not_applicable: 'notApplicableReason' } as const;
  for (const [status, key] of Object.entries(reasons)) {
    if ((value.outcome === status) !== (value[key as keyof typeof value] !== undefined)) {
      ctx.addIssue({ code: 'custom', path: [key], message: `${key} is required only for ${status}` });
    }
  }
  if (value.outcome === 'pass' && value.evidenceRefs.length === 0) ctx.addIssue({ code: 'custom', path: ['evidenceRefs'], message: 'PASS requires evidence references' });
});
const FailureMetricSchema = z.strictObject({
  failureClass: text, truePositive: count, trueNegative: count, falsePositive: count, falseNegative: count,
  trials: positive, firstAttemptSuccesses: count, wholeWorkflowSuccesses: count,
});
export const PolicyReleaseSchema = z.strictObject({
  schemaVersion: version, releaseId: text, version: text,
  checkMethods: z.array(method).min(1), modelVersion: text.nullable(), promptHash: digestRef.nullable(),
  modelNotApplicableReason: text.optional(), fixtureEvidenceRefs: uniqueRefs,
  checkSetDigest: digestRef, configHash: digestRef, rubricVersion: text, datasetSplitHash: digestRef,
  humanLabelSetRef: text, metricsByFailureClass: z.array(FailureMetricSchema), uncertaintyReportRef: text,
  permittedTaskClasses: uniqueRefs.min(1),
  riskTargets: z.array(z.strictObject({ failureClass: text, maxFalseAcceptRate: z.number().min(0).max(1), confidence: z.number().gt(0).lt(1) })).min(1),
  releaseCriteria: z.array(z.strictObject({ criterionId: text, description: text, checkRef: text })).min(1),
  ownerId: text, approvedBy: text.optional(), status: z.enum(['draft', 'calibrating', 'shadow', 'active', 'revoked']), activatedAt: timestamp.optional(),
}).superRefine((value, ctx) => {
  const hasModel = value.checkMethods.includes('model');
  if (hasModel && (value.modelVersion === null || value.promptHash === null || value.modelNotApplicableReason !== undefined)) {
    ctx.addIssue({ code: 'custom', message: 'Model checks require model/prompt identity and cannot claim not applicable' });
  }
  if (!hasModel && (value.modelVersion !== null || value.promptHash !== null || !value.modelNotApplicableReason)) {
    ctx.addIssue({ code: 'custom', message: 'Non-model release requires null model/prompt and explicit applicability reason' });
  }
  if (value.status === 'active' && (!value.approvedBy || !value.activatedAt || !value.fixtureEvidenceRefs.length || !value.metricsByFailureClass.length)) {
    ctx.addIssue({ code: 'custom', message: 'Active release requires approval, activation and evaluation evidence' });
  }
  if (!['active', 'revoked'].includes(value.status) && (value.approvedBy !== undefined || value.activatedAt !== undefined)) {
    ctx.addIssue({ code: 'custom', message: 'Unreleased policy cannot claim activation' });
  }
});
export const PlanningModeDecisionSchema = z.strictObject({
  schemaVersion: z.literal(PLANNING_SCHEMA_VERSION), decisionId: text, taskClass: text,
  mode: z.enum(['single+critic', 'hierarchical+critic']), decompositionEvidence: uniqueRefs.min(1),
  sharedInvariants: uniqueRefs, dependencies: uniqueRefs, fanOut: positive,
  budget: ContextBudgetSchema, benchmarkProfileRef: text, policyReleaseId: text,
}).superRefine((value, ctx) => {
  if (value.mode === 'single+critic' && value.fanOut !== 1) {
    ctx.addIssue({ code: 'custom', path: ['fanOut'], message: 'Fan-out must match planning mode' });
  }
});
export const GateReportSchema = z.strictObject({
  schemaVersion: z.literal(PLANNING_SCHEMA_VERSION), gateReportId: text, artifactHash: digestRef, rubricVersion: text, policyReleaseId: text,
  inputVersions: z.array(VersionBindingSchema).min(1), checkResults: z.array(CheckResultSchema).min(1),
  evidenceRefs: uniqueRefs, defects: z.array(z.strictObject({ defectId: text, checkRef: text, severity: z.enum(['low', 'medium', 'high', 'critical']), description: text })),
  verdict: z.enum(['PASS', 'FAIL', 'UNKNOWN', 'BLOCKED']), issuerId: text, issuedAt: timestamp,
}).superRefine((value, ctx) => {
  if (value.verdict === 'PASS' && (value.checkResults.some((r) => !['pass', 'not_applicable'].includes(r.outcome)) || value.defects.length > 0)) {
    ctx.addIssue({ code: 'custom', message: 'PASS cannot contain failed, blocked, unknown checks or unresolved defects' });
  }
});
export const HandoffPacketSchema = z.strictObject({
  schemaVersion: version, handoffId: text,
  approvedArtifact: z.strictObject({ artifactRef: text, hash: digestRef }), gateReportRef: text,
  sourceVersions: z.array(VersionBindingSchema).min(1), contextManifestRef: text, contextManifestDigest: digestRef,
  allowedScope: ScopeSchema, downstreamAcceptance: uniqueRefs.min(1),
});
export const ClaimSchema = z.strictObject({
  schemaVersion: version, claimId: text, statement: text, assertionType: z.enum(['observed', 'inferred', 'decision']),
  sourceRefs: uniqueRefs.min(1), applicableScope: ScopeSchema,
  evidenceStatus: z.enum(['unverified', 'supported', 'insufficient', 'contradicted']),
  lifecycle: z.enum(['proposed', 'validated', 'approved', 'quarantined', 'revoked', 'superseded']),
  freshness: z.enum(['fresh', 'stale', 'unknown']), reviewRef: text.optional(), approvedBy: text.optional(),
  promotionEvidenceRefs: uniqueRefs, supersedes: text.optional(), dependentRefs: uniqueRefs,
  decisionBy: text.optional(),
}).superRefine((value, ctx) => {
  if (value.lifecycle === 'approved' && (!value.reviewRef || !value.approvedBy || value.evidenceStatus !== 'supported' || !value.promotionEvidenceRefs.length)) {
    ctx.addIssue({ code: 'custom', message: 'Approved claim requires supported evidence, review and approving actor' });
  }
  if (value.assertionType === 'decision' && !value.decisionBy) ctx.addIssue({ code: 'custom', path: ['decisionBy'], message: 'Decision requires deciding actor' });
  if (value.assertionType !== 'decision' && value.decisionBy) ctx.addIssue({ code: 'custom', path: ['decisionBy'], message: 'Only a decision carries deciding actor' });
});
export const SourceRecordSchema = z.strictObject({
  schemaVersion: version, sourceId: text, sourceType: z.enum(['repository', 'document', 'web', 'evidence', 'decision']),
  sourceRef: text, sourceRevision: text, contentDigest: digestRef, observedAt: timestamp,
  freshnessPolicy: z.enum(['pinned', 'live', 'revalidateBeforeUse']), maxAge: positive.optional(),
  effectiveFrom: timestamp.optional(), effectiveUntil: timestamp.optional(), freshness: z.enum(['fresh', 'stale', 'unknown']),
}).superRefine((value, ctx) => {
  if (value.freshnessPolicy === 'live' && !value.maxAge) ctx.addIssue({ code: 'custom', path: ['maxAge'], message: 'Live source requires maxAge in seconds' });
  if (value.effectiveFrom && value.effectiveUntil && Date.parse(value.effectiveUntil) < Date.parse(value.effectiveFrom)) {
    ctx.addIssue({ code: 'custom', message: 'Source effective interval is reversed' });
  }
});
export const MemoryDeltaSchema = z.strictObject({
  schemaVersion: version, deltaId: text, sourceEvidenceIds: uniqueRefs, expectedMemoryVersion: text,
  claimsAdded: z.array(ClaimSchema), claimsSuperseded: uniqueRefs, claimsQuarantined: uniqueRefs,
  claimsRevoked: uniqueRefs, affectedPages: uniqueRefs, promotionReviewRef: text,
}).superRefine((value, ctx) => {
  if (value.claimsAdded.some((claim) => claim.lifecycle !== 'proposed')) ctx.addIssue({ code: 'custom', path: ['claimsAdded'], message: 'A delta proposes claims; it cannot promote them' });
});
export const EvidenceSchema = z.strictObject({
  schemaVersion: version, evidenceId: text, runId: text, checkId: text, kind: text, subjectDigest: digestRef,
  checkSetDigest: digestRef, runnerAttestationRef: text, toolVersion: text, environmentDigest: digestRef,
  outcome, artifactUri: z.url(), artifactHash: digestRef,
});
const AttemptSchema = z.strictObject({
  attemptId: text, callId: text, startedAt: timestamp, finishedAt: timestamp.optional(),
  status: z.enum(['started', 'succeeded', 'failed', 'timed_out', 'cancelled', 'unknown']), resultRef: text.optional(),
}).superRefine((value, ctx) => {
  if (value.status !== 'started' && !value.finishedAt) ctx.addIssue({ code: 'custom', message: 'Terminal attempt requires finishedAt' });
  if (value.status === 'started' && (value.finishedAt || value.resultRef)) ctx.addIssue({ code: 'custom', message: 'Started attempt cannot claim terminal fields' });
  if (value.finishedAt && Date.parse(value.finishedAt) < Date.parse(value.startedAt)) ctx.addIssue({ code: 'custom', message: 'Attempt interval is reversed' });
});
export const OperationRecordSchema = z.strictObject({
  schemaVersion: version, operationId: text, runId: text, stepId: text, argumentsHash: digestRef,
  recoveryMode, expectedWorkspaceDigest: digestRef, state: z.enum(['PREPARED', 'STARTED', 'OBSERVED', 'COMMITTED', 'UNKNOWN']),
  attempts: z.array(AttemptSchema), receiptRef: text.optional(), postconditionRefs: uniqueRefs,
  resultRef: text.optional(), budgetSpent: BudgetSpentSchema,
}).superRefine((value, ctx) => {
  if (value.state === 'PREPARED' && value.attempts.length > 0) ctx.addIssue({ code: 'custom', message: 'Prepared intent cannot contain dispatched attempts' });
  if (value.state !== 'PREPARED' && !value.attempts.length) ctx.addIssue({ code: 'custom', message: 'Dispatched operation requires attempt history' });
  if (value.state === 'COMMITTED' && (!value.resultRef || (!value.receiptRef && !value.postconditionRefs.length))) {
    ctx.addIssue({ code: 'custom', message: 'Committed operation requires result and receipt or postcondition' });
  }
  if (value.state === 'UNKNOWN' && value.resultRef) ctx.addIssue({ code: 'custom', message: 'Unknown operation cannot claim committed result' });
  if (new Set(value.attempts.map((a) => a.attemptId)).size !== value.attempts.length || new Set(value.attempts.map((a) => a.callId)).size !== value.attempts.length) {
    ctx.addIssue({ code: 'custom', message: 'Attempt and call identities must be unique' });
  }
});
export const OwnershipRecordSchema = z.strictObject({
  schemaVersion: version, resourceId: text, ownerRunId: text, ownerEpoch: count,
  processIdentity: z.strictObject({ hostId: text, pid: positive, startedAt: timestamp }),
  acquiredAt: timestamp, lastHeartbeatAt: timestamp, state: z.enum(['owned', 'quarantined', 'released']), releaseReason: text.optional(),
}).superRefine((value, ctx) => {
  if ((value.state === 'released') !== (value.releaseReason !== undefined)) ctx.addIssue({ code: 'custom', message: 'Release reason is required only when released' });
  if (Date.parse(value.lastHeartbeatAt) < Date.parse(value.acquiredAt)) ctx.addIssue({ code: 'custom', message: 'Heartbeat precedes acquisition' });
});
export const CheckpointSchema = z.strictObject({
  schemaVersion: version, checkpointId: text, workflowDefinitionVersion: text, runId: text, branchId: text,
  parentCheckpointRef: text.optional(), completedNodeIds: uniqueRefs, pendingNodeIds: uniqueRefs,
  contextBundleRefs: uniqueRefs, planPackageRefs: uniqueRefs, invocationReceiptRefs: uniqueRefs,
  promptConfigHashes: z.array(digestRef), budgetSpent: BudgetSpentSchema, operationLedgerCursor: count, createdAt: timestamp,
}).superRefine((value, ctx) => {
  if (value.completedNodeIds.some((id) => value.pendingNodeIds.includes(id))) ctx.addIssue({ code: 'custom', message: 'A node cannot be both completed and pending' });
});
export const RunnerAttestationSchema = z.strictObject({
  schemaVersion: version, attestationId: text, runnerId: text, principalId: text, runnerVersion: text,
  configDigest: digestRef, checkSetDigest: digestRef, environmentDigest: digestRef,
  subjectDigest: digestRef, operationId: text, evidenceRefs: uniqueRefs.min(1), issuedAt: timestamp,
});
export const ProjectProfileSchema = z.strictObject({
  schemaVersion: version, profileId: text, repoId: text, profileKind: z.enum(['target', 'observed']),
  editorVersion: text.nullable(), operatingSystem: text.nullable(), buildTarget: text.nullable(),
  packageLockDigest: digestRef.nullable(), packages: z.array(PackageSchema), renderPipeline: text.nullable(),
  uiSystem: text.nullable(), inputSystem: text.nullable(), codeRoots: uniqueRefs, assetRoots: uniqueRefs,
  unknowns: uniqueRefs,
}).superRefine((value, ctx) => {
  const nullableFields = ['editorVersion', 'operatingSystem', 'buildTarget', 'packageLockDigest', 'renderPipeline', 'uiSystem', 'inputSystem'] as const;
  for (const key of nullableFields) {
    if ((value[key] === null) !== value.unknowns.includes(key)) ctx.addIssue({ code: 'custom', path: [key], message: 'Null fields must match explicit unknown field names' });
  }
});
export const SkillDescriptorSchema = z.strictObject({
  schemaVersion: version, skillId: text, version: text, name: text,
  source: z.strictObject({ repository: z.url(), revision: text, path: text, license: text }),
  contentDigest: digestRef, resources: z.array(ResourceSchema).min(1), supportedTaskClasses: uniqueRefs.min(1),
  compatibility: z.strictObject({ editorVersions: uniqueRefs, operatingSystems: uniqueRefs, buildTargets: uniqueRefs, requiredPackages: z.array(PackageSchema) }),
  requiredCapabilities: uniqueRefs, inputRefs: uniqueRefs, outputRefs: uniqueRefs, checkRefs: uniqueRefs.min(1),
  lifecycle: z.enum(['candidate', 'reviewed', 'tested', 'released', 'revoked', 'superseded']),
}).superRefine((value, ctx) => {
  if (value.resources.filter((r) => r.kind === 'body').length !== 1) ctx.addIssue({ code: 'custom', path: ['resources'], message: 'Exactly one skill body is required' });
  if (new Set(value.resources.map((r) => r.path)).size !== value.resources.length) ctx.addIssue({ code: 'custom', message: 'Resource paths must be unique' });
});
export const SkillBindingSchema = z.strictObject({
  schemaVersion: version, bindingId: text, taskId: text, planId: text, artifactHash: digestRef,
  skillId: text, skillVersion: text, descriptorDigest: digestRef, projectProfileDigest: digestRef,
  environmentDigest: digestRef, loadedResources: z.array(ResourceSchema).min(1),
  capabilityBindings: z.array(CapabilityBindingSchema), contextManifestRef: text, contextManifestDigest: digestRef,
  certificationEvidenceRefs: uniqueRefs, policyReleaseId: text.nullable(),
}).superRefine((value, ctx) => {
  if (new Set(value.loadedResources.map((r) => r.path)).size !== value.loadedResources.length) ctx.addIssue({ code: 'custom', message: 'Loaded resource paths must be unique' });
  if (new Set(value.capabilityBindings.map((c) => c.capability)).size !== value.capabilityBindings.length) ctx.addIssue({ code: 'custom', message: 'Capability bindings must be unique' });
});

export const schemas = {
  ...brainPlanningSchemas,
  TaskSpec: TaskSpecSchema, ContextBudget: ContextBudgetSchema, ContextBundle: ContextBundleSchema,
  ContextManifest: ContextManifestSchema, PlanStep: PlanStepSchema, SubPlan: SubPlanSchema,
  PlanPackage: PlanPackageSchema, ToolCall: ToolCallSchema, ToolResult: ToolResultSchema,
  CheckDefinition: CheckDefinitionSchema, CheckResult: CheckResultSchema, PolicyRelease: PolicyReleaseSchema,
  PlanningModeDecision: PlanningModeDecisionSchema, GateReport: GateReportSchema, HandoffPacket: HandoffPacketSchema,
  Claim: ClaimSchema, SourceRecord: SourceRecordSchema, MemoryDelta: MemoryDeltaSchema, Evidence: EvidenceSchema,
  OperationRecord: OperationRecordSchema, OwnershipRecord: OwnershipRecordSchema, Checkpoint: CheckpointSchema,
  RunnerAttestation: RunnerAttestationSchema, ProjectProfile: ProjectProfileSchema,
  SkillDescriptor: SkillDescriptorSchema, SkillBinding: SkillBindingSchema,
} as const;
export type ContractName = keyof typeof schemas;
export type ContractMap = { [K in ContractName]: z.infer<(typeof schemas)[K]> };
export function parseContract<K extends ContractName>(name: K, input: unknown): ContractMap[K] {
  const schema = schemas[name];
  if (!schema) throw new TypeError(`Unknown contract: ${String(name)}`);
  return schema.parse(input) as ContractMap[K];
}
export type TaskSpec = ContractMap['TaskSpec'];
export type ContextBudget = ContractMap['ContextBudget'];
export type ContextBundle = ContractMap['ContextBundle'];
export type ContextManifest = ContractMap['ContextManifest'];
export type PlanStep = ContractMap['PlanStep'];
export type SubPlan = ContractMap['SubPlan'];
export type PlanPackage = ContractMap['PlanPackage'];
export type ToolCall = ContractMap['ToolCall'];
export type ToolResult = ContractMap['ToolResult'];
export type CheckDefinition = ContractMap['CheckDefinition'];
export type CheckResult = ContractMap['CheckResult'];
export type PolicyRelease = ContractMap['PolicyRelease'];
export type PlanningModeDecision = ContractMap['PlanningModeDecision'];
export type GateReport = ContractMap['GateReport'];
export type HandoffPacket = ContractMap['HandoffPacket'];
export type Claim = ContractMap['Claim'];
export type SourceRecord = ContractMap['SourceRecord'];
export type MemoryDelta = ContractMap['MemoryDelta'];
export type Evidence = ContractMap['Evidence'];
export type OperationRecord = ContractMap['OperationRecord'];
export type OwnershipRecord = ContractMap['OwnershipRecord'];
export type Checkpoint = ContractMap['Checkpoint'];
export type RunnerAttestation = ContractMap['RunnerAttestation'];
export type ProjectProfile = ContractMap['ProjectProfile'];
export type SkillDescriptor = ContractMap['SkillDescriptor'];
export type SkillBinding = ContractMap['SkillBinding'];
