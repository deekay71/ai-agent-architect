import { digest, digestOmitting, canonicalJson } from '../contracts/canonical.js';
import { schemas, type ContractMap, type ContractName, type GateReport, type PolicyRelease,
  type CheckDefinition, type Evidence, type RunnerAttestation, type SourceRecord,
  type TaskSpec, type SkillBinding, type Claim, type SkillDescriptor, type ProjectProfile, type ToolCall } from '../contracts/schemas.js';
import { canWrite, isSafeRelativePath, isWithinScope, type Principal } from './permissions.js';
import { evaluateSkillEligibility } from '../skills/catalog.js';

export interface AuditIssue { code: string; path: string; message: string }
export interface ConformanceReport {
  kind: 'foundation-contract-conformance';
  valid: boolean;
  dispatchAuthorized: false;
  checkedContracts: number;
  issues: AuditIssue[];
}

/** Supplied by the caller's trusted store in the future runtime; fixture-only here. */
export interface AuditAuthority {
  projectId: string;
  taskClass: string;
  baseRevision: string;
  taskDigest: string;
  now: string;
  workspaceDigest: string;
  environmentDigest: string;
  memoryVersion: string;
  workflowDefinitionVersion: string;
  principals: readonly Principal[];
  constraints: TaskSpec['constraints'];
  expectedInputs: GateReport['inputVersions'];
  policies: readonly PolicyRelease[];
  checks: readonly CheckDefinition[];
  gateReports: readonly GateReport[];
  approvedClaims: readonly Claim[];
  evidence: readonly Evidence[];
  attestations: readonly RunnerAttestation[];
  sources: readonly SourceRecord[];
  artifacts: Readonly<Record<string, { hash: string; kind: string }>>;
  capabilities: SkillBinding['capabilityBindings'];
  skillDescriptors: readonly SkillDescriptor[];
  projectProfiles: readonly ProjectProfile[];
  /** Separately recorded, body-loaded catalog selections. Never supplied by the candidate. */
  skillSelections: readonly SkillBinding[];
  selectedSnapshotId: string;
  snapshots: readonly { snapshotId: string; digest: string; projectId: string; sourceRevision: string; operationId?: string }[];
  evidenceSources: readonly { evidenceId: string; sourceId: string; sourceRevision: string }[];
  toolPolicies: readonly (Pick<ToolCall, 'capability' | 'toolRef' | 'toolVersion' | 'implementationDigest' | 'targetProjectId' | 'recoveryMode' | 'permissionScope'> & { pathArgumentKeys: readonly string[] })[];
  workflowNodes: readonly ({ nodeId: string; kind: 'planStep'; planStepRef: string } | { nodeId: string; kind: 'workflow' })[];
  referenceRegistry: {
    contextBundleRefs: readonly string[]; planPackageRefs: readonly string[];
    invocationReceiptRefs: readonly string[]; checkpointRefs: readonly string[];
    branchIds: readonly string[]; promptConfigHashes: readonly string[];
  };
}

const names = Object.keys(schemas) as ContractName[];

/** Required current inputs, including the actual body-loaded skill selection receipt. */
export function currentGateInputs(b: ContractMap): GateReport['inputVersions'] {
  return [
    { ref: b.TaskSpec.taskId, version: b.TaskSpec.baseRevision, digest: digest(b.TaskSpec) },
    { ref: b.ContextManifest.manifestId, version: b.ContextManifest.contextPolicyVersion, digest: digestOmitting(b.ContextManifest, 'manifestDigest') },
    { ref: b.PlanPackage.planId, version: String(b.PlanPackage.version), digest: digestOmitting(b.PlanPackage, 'hash') },
    { ref: `skill:${b.SkillDescriptor.skillId}`, version: b.SkillDescriptor.version, digest: digest(b.SkillDescriptor) },
    { ref: b.ProjectProfile.profileId, version: b.ProjectProfile.schemaVersion, digest: digest(b.ProjectProfile) },
    { ref: b.SkillBinding.bindingId, version: b.SkillBinding.schemaVersion, digest: digest(b.SkillBinding) },
    { ref: `environment:${b.TaskSpec.repoId}`, version: b.SkillBinding.schemaVersion, digest: b.SkillBinding.environmentDigest },
  ];
}

/** A pure static audit. It never issues a production GateReport or executes a tool. */
export function auditContractBundle(input: unknown, authority: AuditAuthority): ConformanceReport {
  const issues: AuditIssue[] = [];
  const issue = (code: string, path: string, message: string) => issues.push({ code, path, message });
  const require = (condition: boolean, code: string, path: string, message: string) => {
    if (!condition) issue(code, path, message);
  };
  const report = (checkedContracts: number): ConformanceReport => ({
    kind: 'foundation-contract-conformance', valid: issues.length === 0,
    dispatchAuthorized: false, checkedContracts, issues,
  });
  try { canonicalJson(input); } catch { issue('schema.json', '$', 'Expected finite, plain JSON input'); return report(0); }
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    issue('schema.bundle', '$', 'Expected a named contract fixture bundle'); return report(0);
  }
  const raw = input as Record<string, unknown>;
  for (const name of Object.keys(raw)) if (!names.includes(name as ContractName)) issue('schema.extra', name, 'Unknown contract name');
  const parsed: Partial<ContractMap> = {};
  for (const name of names) {
    const result = schemas[name].safeParse(raw[name]);
    if (!result.success) {
      for (const error of result.error.issues) issue('schema.invalid', `${name}.${error.path.join('.')}`, error.message);
    } else Object.assign(parsed, { [name]: result.data });
  }
  if (issues.length) return report(Object.keys(parsed).length);
  const b = parsed as ContractMap;
  const task = b.TaskSpec, plan = b.PlanPackage, manifest = b.ContextManifest;
  const gate = b.GateReport, handoff = b.HandoffPacket, call = b.ToolCall;
  const principal = (id: string) => authority.principals.find(actor => actor.id === id);
  const inScope = (scope: { repoId: string; allowedPaths: string[]; taskClasses: string[] }) =>
    scope.repoId === task.repoId && scope.taskClasses.includes(task.taskClass) &&
    scope.allowedPaths.length > 0 && scope.allowedPaths.every(path => isWithinScope(path, task.allowedPaths));
  const equal = (a: unknown, c: unknown) => digest(a) === digest(c);
  const same = (a: unknown, c: unknown, code: string, path: string) => require(equal(a, c), code, path, 'Content or reference does not match its canonical binding');
  const now = Date.parse(authority.now);
  require(Number.isFinite(now), 'authority.time', '$authority.now', 'Invalid audit clock');
  require(task.repoId === authority.projectId && task.taskClass === authority.taskClass && task.baseRevision === authority.baseRevision,
    'task.scope', 'TaskSpec', 'Task project, class or base revision differs from the configured scope');
  require(digest(task) === authority.taskDigest, 'task.authority', 'TaskSpec', 'Current task content differs from the reviewed task');
  require(task.allowedPaths.every(isSafeRelativePath), 'task.paths', 'TaskSpec.allowedPaths', 'Scopes must be normalized relative roots');
  same(task.budget, b.ContextBudget, 'budget.binding', 'TaskSpec.budget');
  same(task.constraints, authority.constraints, 'constraint.authority', 'TaskSpec.constraints');
  for (const constraint of task.constraints) {
    require(constraint.contentHash === digest(constraint.description), 'constraint.content', `TaskSpec.constraints.${constraint.id}`, 'Constraint content changed while preserving its ID');
  }
  const constraintIds = task.constraints.map(x => x.id);
  require(new Set(constraintIds).size === constraintIds.length, 'constraint.duplicate', 'TaskSpec.constraints', 'Duplicate constraint IDs');
  const bindings = manifest.constraintBindings;
  require(new Set(bindings.map(x => x.id)).size === bindings.length, 'constraint.duplicate', 'ContextManifest.constraintBindings', 'Duplicate bindings');
  same(bindings, task.constraints.map(({ description: _description, ...binding }) => binding), 'constraint.binding', 'ContextManifest.constraintBindings');
  require(manifest.taskSpecDigest === digest(task), 'context.taskDigest', 'ContextManifest.taskSpecDigest', 'Manifest is not bound to this task content');
  require(manifest.manifestDigest === digestOmitting(manifest, 'manifestDigest'), 'context.digest', 'ContextManifest.manifestDigest', 'Manifest digest mismatch');
  require(inScope(manifest.scope), 'context.scope', 'ContextManifest.scope', 'Manifest exceeds task scope');
  const context = b.ContextBundle;
  require(context.taskId === task.taskId && context.manifestRef === manifest.manifestId && context.manifestDigest === manifest.manifestDigest,
    'context.binding', 'ContextBundle', 'Context is not bound to this task and manifest');
  require(context.memoryVersion === authority.memoryVersion, 'context.memory', 'ContextBundle.memoryVersion', 'Context uses a stale memory version');
  const selectedSnapshot = authority.snapshots.find(x => x.snapshotId === authority.selectedSnapshotId);
  require(!!selectedSnapshot && context.snapshotId === selectedSnapshot.snapshotId && selectedSnapshot.digest === authority.workspaceDigest &&
    selectedSnapshot.projectId === task.repoId && selectedSnapshot.sourceRevision === task.baseRevision,
  'context.snapshot', 'ContextBundle.snapshotId', 'Context is not bound to the selected project/revision/workspace snapshot');
  require(context.tokenCount <= task.budget.inputLimit - task.budget.outputReserve - task.budget.headroom,
    'context.budget', 'ContextBundle.tokenCount', 'Context exceeds its reserved input budget');
  require(context.unknowns.every(x => !x.critical), 'context.criticalUnknown', 'ContextBundle.unknowns', 'Critical unknown prevents handoff');
  require(manifest.modelConfigVersion === task.budget.modelConfigVersion, 'context.modelConfig', 'ContextManifest.modelConfigVersion', 'Model budget config drift');
  for (const binding of manifest.evidenceBindings) {
    const evidence = authority.evidence.find(x => x.evidenceId === binding.evidenceId);
    require(!!evidence && digest(evidence) === binding.contentHash, 'context.evidence', 'ContextManifest.evidenceBindings', 'Evidence binding is absent or changed');
    const item = context.evidenceItems.find(x => x.evidenceId === binding.evidenceId);
    require(!!item && item.contentHash === binding.contentHash, 'context.evidence', 'ContextBundle.evidenceItems', 'Context omitted or changed bound evidence');
    const provenance = authority.evidenceSources.find(x => x.evidenceId === binding.evidenceId && x.sourceId === item?.sourceRef && x.sourceRevision === binding.sourceRevision);
    const source = provenance && authority.sources.find(x => x.sourceId === provenance.sourceId && x.sourceRevision === provenance.sourceRevision);
    require(!!source, 'context.provenance', 'ContextManifest.evidenceBindings', 'Evidence source ID/revision is not registered in its canonical provenance');
  }
  require(new Set(manifest.evidenceBindings.map(x => x.evidenceId)).size === manifest.evidenceBindings.length && new Set(context.evidenceItems.map(x => x.evidenceId)).size === context.evidenceItems.length,
    'context.duplicateEvidence', 'ContextManifest.evidenceBindings', 'Evidence references must be unique');
  for (const item of context.evidenceItems) require(manifest.evidenceBindings.some(x => x.evidenceId === item.evidenceId && x.contentHash === item.contentHash),
    'context.unboundEvidence', 'ContextBundle.evidenceItems', 'Context contains unbound evidence');

  require(plan.hash === digestOmitting(plan, 'hash'), 'plan.digest', 'PlanPackage.hash', 'Plan digest mismatch');
  const subIds = plan.subplans.map(x => x.planId);
  require(new Set(subIds).size === subIds.length, 'plan.duplicate', 'PlanPackage.subplans', 'Duplicate subplan IDs');
  const steps = plan.subplans.flatMap(x => x.steps);
  const stepIds = steps.map(x => x.stepId);
  require(new Set(stepIds).size === stepIds.length, 'plan.duplicate', 'PlanPackage.subplans.steps', 'Duplicate step IDs');
  for (const subplan of plan.subplans) {
    require(inScope(subplan.scope), 'plan.scope', 'SubPlan.scope', 'Subplan exceeds task scope');
    require(!subplan.unresolvedItems.some(x => x.blocking), 'plan.blocker', 'SubPlan.unresolvedItems', 'Unresolved blocking item');
    for (const dependency of subplan.dependencies) require(subIds.includes(dependency), 'plan.reference', 'SubPlan.dependencies', 'Missing subplan dependency');
  }
  checkDag(plan.subplans.map(x => ({ id: x.planId, dependencies: x.dependencies })), 'subplan', issue);
  checkDag(steps.map(x => ({ id: x.stepId, dependencies: x.dependsOn })), 'step', issue);
  same(b.SubPlan, plan.subplans.find(x => x.planId === b.SubPlan.planId) ?? null, 'plan.subplanBinding', 'SubPlan');
  same(b.PlanStep, steps.find(x => x.stepId === b.PlanStep.stepId) ?? null, 'plan.stepBinding', 'PlanStep');
  const criterionIds = task.acceptanceCriteria.map(x => x.criterionId);
  require(new Set(criterionIds).size === criterionIds.length, 'task.duplicate', 'TaskSpec.acceptanceCriteria', 'Duplicate acceptance IDs');
  require(new Set(plan.requirementCoverage.map(x => x.requirementRef)).size === plan.requirementCoverage.length, 'plan.coverageDuplicate', 'PlanPackage.requirementCoverage', 'Duplicate coverage entry');
  for (const criterion of task.acceptanceCriteria) {
    const coverage = plan.requirementCoverage.find(x => x.requirementRef === criterion.criterionId);
    require(!!coverage && coverage.stepRefs.every(x => stepIds.includes(x)) && criterion.checkRefs.every(x => coverage.checkRefs.includes(x)),
      'plan.coverage', 'PlanPackage.requirementCoverage', 'Missing acceptance-to-step/check mapping');
  }
  for (const coverage of plan.requirementCoverage) require(criterionIds.includes(coverage.requirementRef), 'plan.coverageUnknown', 'PlanPackage.requirementCoverage', 'Coverage references an unknown acceptance criterion');
  for (const step of steps) for (const check of step.verificationChecks) require(authority.checks.some(x => x.checkId === check), 'plan.checkReference', `PlanStep.${step.stepId}`, 'Step references an unknown check');
  for (const assumption of plan.assumptions) require(assumption.status === 'supported' && assumption.evidenceRefs.length > 0 && assumption.evidenceRefs.every(ref => authority.evidence.some(x => x.evidenceId === ref)),
    'plan.assumption', 'PlanPackage.assumptions', 'Unsupported assumption cannot establish readiness');
  const mode = b.PlanningModeDecision;
  require(plan.planningModeDecisionRef === mode.decisionId && mode.taskClass === task.taskClass && mode.policyReleaseId === gate.policyReleaseId,
    'planning.modeBinding', 'PlanningModeDecision', 'Planning decision does not match task/plan/policy');

  const policy = authority.policies.find(x => x.releaseId === gate.policyReleaseId);
  require(!!policy, 'policy.untrusted', 'GateReport.policyReleaseId', 'Policy is absent from the authority snapshot');
  if (policy) {
    same(b.PolicyRelease, policy, 'policy.changed', 'PolicyRelease');
    require(policy.status === 'active', 'policy.inactive', 'PolicyRelease.status', 'Only active policy can support a PASS handoff');
    require(policy.permittedTaskClasses.includes(task.taskClass), 'policy.scope', 'PolicyRelease.permittedTaskClasses', 'Task class is outside release scope');
    require(canWrite(principal(policy.ownerId), 'policy', task.repoId) && canWrite(principal(policy.approvedBy ?? ''), 'policy', task.repoId),
      'policy.issuer', 'PolicyRelease.approvedBy', 'Release lacks an authorized owner/approver');
    require(!!policy.activatedAt && Date.parse(policy.activatedAt) <= now, 'policy.activation', 'PolicyRelease.activatedAt', 'Policy is not active at the audit time');
    same(policy.checkSetDigest, digest(authority.checks), 'policy.checkSet', 'PolicyRelease.checkSetDigest');
    require(gate.rubricVersion === policy.rubricVersion, 'gate.rubric', 'GateReport.rubricVersion', 'Rubric version drift');
  }
  require(canWrite(principal(gate.issuerId), 'verdict', task.repoId), 'gate.issuer', 'GateReport.issuerId', 'Untrusted gate issuer');
  same(gate, authority.gateReports.find(x => x.gateReportId === gate.gateReportId) ?? null, 'gate.untrusted', 'GateReport');
  require(Date.parse(gate.issuedAt) <= now, 'gate.future', 'GateReport.issuedAt', 'Future gate report');
  require(gate.verdict === 'PASS', 'gate.notPass', 'GateReport.verdict', 'Handoff requires a current PASS');
  require(gate.artifactHash === plan.hash, 'gate.subject', 'GateReport.artifactHash', 'Gate references a different artifact');
  same(gate.inputVersions, authority.expectedInputs, 'gate.inputs', 'GateReport.inputVersions');
  const currentInputs = currentGateInputs(b);
  require(new Set(gate.inputVersions.map(x => x.ref)).size === gate.inputVersions.length && new Set(currentInputs.map(x => x.ref)).size === currentInputs.length,
    'gate.duplicateInput', 'GateReport.inputVersions', 'Gate input references must be unique');
  require(gate.inputVersions.length === currentInputs.length && currentInputs.every(current => gate.inputVersions.some(input => equal(input, current))),
    'gate.currentInputs', 'GateReport.inputVersions', 'Gate inputs omit or differ from the current task/context/plan/skill/profile/selection/environment');
  require(new Set(gate.checkResults.map(x => x.checkId)).size === gate.checkResults.length, 'gate.duplicateCheck', 'GateReport.checkResults', 'Duplicate check result IDs');
  const requiredCheckIds = new Set(task.acceptanceCriteria.flatMap(x => x.checkRefs));
  for (const definition of authority.checks) if (definition.applicability.taskClasses.includes(task.taskClass) && (definition.critical || definition.applicability.required)) requiredCheckIds.add(definition.checkId);
  for (const checkId of requiredCheckIds) require(gate.checkResults.some(x => x.checkId === checkId && x.outcome === 'pass'), 'gate.missingCheck', 'GateReport.checkResults', `Required check ${checkId} is not PASS`);
  same(b.CheckDefinition, authority.checks.find(x => x.checkId === b.CheckDefinition.checkId) ?? null, 'check.definition', 'CheckDefinition');
  same(b.CheckResult, gate.checkResults.find(x => x.checkId === b.CheckResult.checkId) ?? null, 'check.resultBinding', 'CheckResult');
  for (const result of gate.checkResults) {
    const def = authority.checks.find(x => x.checkId === result.checkId);
    if (!def) { issue('check.unregistered', 'GateReport.checkResults', 'Unknown check definition'); continue; }
    require(result.definitionDigest === digest(def) && result.method === def.method && result.verifierVersion === def.verifierVersion,
      'check.definition', 'CheckResult', 'Check method/version/digest drift');
    require(result.subjectDigest === plan.hash, 'check.subject', 'CheckResult.subjectDigest', 'Check was run against a different artifact');
    require(Date.parse(result.producedAt) <= now && Date.parse(result.producedAt) <= Date.parse(gate.issuedAt), 'check.time', 'CheckResult.producedAt', 'Result timestamp is invalid for the gate');
    const actor = principal(result.producedBy);
    require(!!actor && actor.projectIds.includes(task.repoId) && (result.method === 'human' ? actor.role === 'critic' : actor.role === 'verificationRunner'),
      'check.issuer', 'CheckResult.producedBy', 'Check result issuer is not authorized for its method');
    if (result.method === 'deterministic' && def.method === 'deterministic') require(result.validatorRef === def.validatorRef, 'check.validator', 'CheckResult.validatorRef', 'Wrong validator');
    if (result.method === 'model' && def.method === 'model') require(result.rubricRef === def.rubricRef && result.judgeConfigRef === def.judgeConfigRef && result.policyReleaseId === gate.policyReleaseId,
      'check.judge', 'CheckResult', 'Unbound judge or rubric');
    if (result.method === 'human' && def.method === 'human') require(result.reviewerRole === def.reviewerRole, 'check.reviewer', 'CheckResult.reviewerRole', 'Wrong reviewer role');
    if (result.outcome === 'not_applicable') require(!def.applicability.taskClasses.includes(task.taskClass), 'check.falseNA', 'CheckResult.outcome', 'Applicable check cannot be waived as N/A');
    for (const ref of result.evidenceRefs) require(gate.evidenceRefs.includes(ref), 'gate.evidenceReference', 'GateReport.evidenceRefs', 'Gate omitted check evidence');
    for (const kind of def.requiredEvidenceKinds) require(result.evidenceRefs.some(ref => authority.evidence.some(e => e.evidenceId === ref && e.kind === kind && e.checkId === result.checkId && e.subjectDigest === plan.hash && e.outcome === result.outcome)),
      'check.evidenceKind', 'CheckResult.evidenceRefs', `Missing trusted ${kind} evidence for this check/subject/outcome`);
  }
  for (const ref of gate.evidenceRefs) require(authority.evidence.some(x => x.evidenceId === ref), 'gate.untrustedEvidence', 'GateReport.evidenceRefs', 'Gate contains untrusted evidence');
  require(handoff.approvedArtifact.artifactRef === plan.planId && handoff.approvedArtifact.hash === plan.hash && handoff.gateReportRef === gate.gateReportId,
    'handoff.binding', 'HandoffPacket', 'Handoff references a different artifact or report');
  require(handoff.contextManifestRef === manifest.manifestId && handoff.contextManifestDigest === manifest.manifestDigest,
    'handoff.context', 'HandoffPacket', 'Handoff references a different context');
  same(handoff.sourceVersions, gate.inputVersions, 'handoff.versions', 'HandoffPacket.sourceVersions');
  require(inScope(handoff.allowedScope), 'handoff.scope', 'HandoffPacket.allowedScope', 'Handoff broadens task scope');
  require(criterionIds.every(id => handoff.downstreamAcceptance.includes(id)) && handoff.downstreamAcceptance.every(id => criterionIds.includes(id)),
    'handoff.acceptance', 'HandoffPacket.downstreamAcceptance', 'Downstream acceptance omitted or invented criteria');

  require(call.argumentsHash === digest(call.arguments), 'operation.arguments', 'ToolCall.argumentsHash', 'Arguments do not match their digest');
  require(call.expectedWorkspaceDigest === authority.workspaceDigest, 'operation.workspace', 'ToolCall.expectedWorkspaceDigest', 'Workspace drift before operation');
  require(stepIds.includes(call.stepId), 'operation.step', 'ToolCall.stepId', 'Operation references a missing plan step');
  require(call.permissionScope.allowedPaths.every(path => isWithinScope(path, handoff.allowedScope.allowedPaths)), 'operation.scope', 'ToolCall.permissionScope', 'Tool call exceeds handoff scope');
  const calledStep = steps.find(x => x.stepId === call.stepId);
  require(!!calledStep && call.capability === calledStep.capability && calledStep.allowedTools.includes(call.toolRef),
    'operation.stepCapability', 'ToolCall', 'Call capability/tool is not approved by the plan step');
  const capability = authority.capabilities.find(x => x.capability === call.capability && x.targetProjectId === call.targetProjectId);
  require(call.targetProjectId === task.repoId && !!capability && capability.implementationRef === call.toolRef && capability.implementationDigest === call.implementationDigest &&
    b.SkillBinding.capabilityBindings.some(x => equal(x, capability)),
  'operation.capability', 'ToolCall', 'Call tool implementation/target is not the selected registered capability');
  const toolPolicy = authority.toolPolicies.find(x => x.capability === call.capability && x.toolRef === call.toolRef && x.targetProjectId === call.targetProjectId);
  require(!!toolPolicy && toolPolicy.toolVersion === call.toolVersion && toolPolicy.implementationDigest === call.implementationDigest && toolPolicy.recoveryMode === call.recoveryMode,
    'operation.toolPolicy', 'ToolCall', 'Tool version, implementation or recovery mode is not registered');
  if (toolPolicy) {
    require(call.permissionScope.allowedPaths.every(x => isWithinScope(x, toolPolicy.permissionScope.allowedPaths)) &&
      call.permissionScope.allowedCommands.every(x => toolPolicy.permissionScope.allowedCommands.includes(x) && !!calledStep?.allowedTools.includes(x)) &&
      call.permissionScope.allowedCommands.includes(call.toolRef) &&
      call.permissionScope.networkDestinations.every(x => toolPolicy.permissionScope.networkDestinations.includes(x)),
    'operation.permissions', 'ToolCall.permissionScope', 'Call paths, commands or network scope exceed the approved tool policy');
    for (const key of toolPolicy.pathArgumentKeys) {
      const argument = call.arguments[key];
      require(typeof argument === 'string' && isWithinScope(argument, call.permissionScope.allowedPaths),
        'operation.argumentScope', `ToolCall.arguments.${key}`, 'Tool path argument exceeds its permission scope');
    }
  }
  const op = b.OperationRecord, result = b.ToolResult;
  require(op.operationId === call.operationId && op.runId === call.runId && op.stepId === call.stepId && op.argumentsHash === call.argumentsHash && op.recoveryMode === call.recoveryMode && op.expectedWorkspaceDigest === call.expectedWorkspaceDigest,
    'operation.binding', 'OperationRecord', 'Logical operation identity or payload drift');
  require(op.attempts.some(a => a.attemptId === call.attemptId && a.callId === call.callId), 'operation.attempt', 'OperationRecord.attempts', 'Call is absent from attempt history');
  const attempt = op.attempts.find(a => a.attemptId === call.attemptId && a.callId === call.callId);
  require(result.callId === call.callId && result.operationId === call.operationId && result.attemptId === call.attemptId,
    'operation.result', 'ToolResult', 'Result belongs to a different operation/attempt');
  if (op.state === 'COMMITTED') {
    require(result.status === 'succeeded', 'operation.commit', 'OperationRecord.state', 'Cannot commit an unknown/failed tool result as successful');
    require(op.resultRef === result.callId && op.receiptRef === result.receiptRef && equal(op.postconditionRefs, result.postconditionRefs),
      'operation.receipt', 'OperationRecord', 'Committed result/receipt binding mismatch');
  }
  require(!!attempt && attempt.status === result.status && attempt.startedAt === result.startedAt && attempt.finishedAt === result.finishedAt && attempt.resultRef === result.callId,
    'operation.attemptResult', 'OperationRecord.attempts', 'Attempt terminal status, times or result reference contradict the ToolResult');
  const resultSnapshot = authority.snapshots.find(x => x.snapshotId === result.workspaceSnapshot.snapshotId && x.digest === result.workspaceSnapshot.digest);
  require(!!resultSnapshot && resultSnapshot.projectId === task.repoId,
    'operation.resultSnapshot', 'ToolResult.workspaceSnapshot', 'Result snapshot is absent from the selected project snapshot registry');
  if (call.recoveryMode === 'readOnly') {
    require(result.workspaceSnapshot.snapshotId === context.snapshotId && result.workspaceSnapshot.digest === call.expectedWorkspaceDigest,
      'operation.readOnlyWorkspace', 'ToolResult.workspaceSnapshot', 'Read-only operation changed the workspace snapshot');
  } else {
    require(resultSnapshot?.operationId === call.operationId, 'operation.mutationSnapshot', 'ToolResult.workspaceSnapshot', 'Mutation outcome snapshot lacks its operation binding');
  }
  require(b.OwnershipRecord.ownerRunId === call.runId, 'ownership.run', 'OwnershipRecord.ownerRunId', 'Resource belongs to another run');
  require(b.OwnershipRecord.resourceId === task.repoId && b.OwnershipRecord.resourceId === call.targetProjectId,
    'ownership.resource', 'OwnershipRecord.resourceId', 'Ownership is for a different project resource');
  require(b.OwnershipRecord.state === 'owned', 'ownership.notOwned', 'OwnershipRecord.state', 'Quarantined/released resource cannot support dispatch');
  const checkpoint = b.Checkpoint;
  require(checkpoint.runId === call.runId && checkpoint.workflowDefinitionVersion === authority.workflowDefinitionVersion,
    'checkpoint.version', 'Checkpoint', 'Run/workflow version mismatch; migration required');
  require(checkpoint.contextBundleRefs.includes(context.bundleId) && checkpoint.planPackageRefs.includes(plan.planId),
    'checkpoint.bindings', 'Checkpoint', 'Checkpoint omits context/plan references');
  const allowedNodes = new Map(authority.workflowNodes.map(node => [node.nodeId, node]));
  require(allowedNodes.size === authority.workflowNodes.length, 'checkpoint.nodeRegistry', '$authority.workflowNodes', 'Duplicate workflow node identity');
  for (const id of [...checkpoint.completedNodeIds, ...checkpoint.pendingNodeIds]) {
    const node = allowedNodes.get(id);
    require(!!node && (node.kind === 'workflow' || stepIds.includes(node.planStepRef)),
      'checkpoint.node', 'Checkpoint', 'Checkpoint node is outside the registered workflow/plan');
    if (node?.kind === 'planStep' && node.planStepRef === call.stepId && checkpoint.completedNodeIds.includes(id)) {
      require(op.state === 'COMMITTED' && result.status === 'succeeded', 'checkpoint.uncommittedNode', 'Checkpoint.completedNodeIds', 'Completed plan node has no committed result');
    }
  }
  for (const field of ['contextBundleRefs', 'planPackageRefs', 'invocationReceiptRefs', 'promptConfigHashes'] as const) {
    require(checkpoint[field].every(ref => authority.referenceRegistry[field].includes(ref)), 'checkpoint.reference', `Checkpoint.${field}`, 'Checkpoint contains an unregistered reference');
  }
  require(authority.referenceRegistry.checkpointRefs.includes(checkpoint.checkpointId) && authority.referenceRegistry.branchIds.includes(checkpoint.branchId) &&
    (checkpoint.parentCheckpointRef === undefined || authority.referenceRegistry.checkpointRefs.includes(checkpoint.parentCheckpointRef)),
  'checkpoint.reference', 'Checkpoint', 'Checkpoint/parent/branch is not in the trusted lineage registry');
  if (op.state === 'COMMITTED' && op.receiptRef) require(checkpoint.invocationReceiptRefs.includes(op.receiptRef), 'checkpoint.receipt', 'Checkpoint.invocationReceiptRefs', 'Committed operation receipt is missing from checkpoint');

  const evidence = b.Evidence, attestation = b.RunnerAttestation;
  same(evidence, authority.evidence.find(x => x.evidenceId === evidence.evidenceId) ?? null, 'evidence.untrusted', 'Evidence');
  same(attestation, authority.attestations.find(x => x.attestationId === attestation.attestationId) ?? null, 'evidence.attestation', 'RunnerAttestation');
  require(canWrite(principal(attestation.principalId), 'evidence', task.repoId), 'evidence.issuer', 'RunnerAttestation.principalId', 'Untrusted evidence writer');
  require(evidence.runnerAttestationRef === attestation.attestationId && attestation.evidenceRefs.includes(evidence.evidenceId) && attestation.operationId === call.operationId,
    'evidence.attestationBinding', 'Evidence', 'Evidence attestation/operation mismatch');
  require(evidence.subjectDigest === plan.hash && attestation.subjectDigest === plan.hash && evidence.runId === call.runId,
    'evidence.subject', 'Evidence', 'Evidence belongs to a different subject/run');
  require(evidence.checkSetDigest === policy?.checkSetDigest && attestation.checkSetDigest === evidence.checkSetDigest,
    'evidence.checkSet', 'Evidence', 'Wrong verification checkset');
  require(evidence.environmentDigest === authority.environmentDigest && attestation.environmentDigest === authority.environmentDigest,
    'evidence.environment', 'Evidence', 'Evidence environment differs from the configured environment');
  const artifact = authority.artifacts[evidence.artifactUri];
  require(!!artifact && artifact.hash === evidence.artifactHash && artifact.kind === evidence.kind, 'evidence.artifact', 'Evidence.artifactHash', 'Evidence file content/kind is not verified');

  const source = b.SourceRecord;
  same(source, authority.sources.find(x => x.sourceId === source.sourceId) ?? null, 'source.untrusted', 'SourceRecord');
  require(source.freshness === 'fresh' && Date.parse(source.observedAt) <= now, 'source.freshness', 'SourceRecord', 'Source is stale, unknown or from the future');
  if (source.effectiveFrom) require(Date.parse(source.effectiveFrom) <= now, 'source.effective', 'SourceRecord.effectiveFrom', 'Source is not yet effective');
  if (source.effectiveUntil) require(Date.parse(source.effectiveUntil) >= now, 'source.effective', 'SourceRecord.effectiveUntil', 'Source has expired');
  if (source.freshnessPolicy === 'live') require(now - Date.parse(source.observedAt) <= (source.maxAge ?? 0) * 1000, 'source.expired', 'SourceRecord.maxAge', 'Source requires revalidation');
  if (source.freshnessPolicy === 'revalidateBeforeUse') require(Date.parse(source.observedAt) === now, 'source.revalidate', 'SourceRecord.observedAt', 'Critical source has not been revalidated for this audit');
  // Follow every actually consumed source, not only the representative SourceRecord in the bundle.
  const usedEvidenceIds = new Set([
    ...context.evidenceItems.map(x => x.evidenceId), ...gate.evidenceRefs,
    ...b.Claim.promotionEvidenceRefs, ...b.MemoryDelta.sourceEvidenceIds, ...b.SkillBinding.certificationEvidenceRefs,
  ]);
  const usedSourceIds = new Set([...context.evidenceItems.map(x => x.sourceRef), ...b.Claim.sourceRefs,
    ...b.MemoryDelta.claimsAdded.flatMap(x => x.sourceRefs)]);
  for (const evidenceId of usedEvidenceIds) {
    const provenance = authority.evidenceSources.filter(x => x.evidenceId === evidenceId);
    require(provenance.length > 0, 'source.evidenceProvenance', `Evidence.${evidenceId}`, 'Used evidence has no canonical source provenance');
    for (const link of provenance) {
      usedSourceIds.add(link.sourceId);
      require(authority.sources.some(x => x.sourceId === link.sourceId && x.sourceRevision === link.sourceRevision),
        'source.revision', `Evidence.${evidenceId}`, 'Evidence source revision is unavailable');
    }
    const usedEvidence = authority.evidence.find(x => x.evidenceId === evidenceId);
    const usedAttestation = usedEvidence && authority.attestations.find(x => x.attestationId === usedEvidence.runnerAttestationRef);
    require(!!usedEvidence && !!usedAttestation && usedAttestation.evidenceRefs.includes(evidenceId) &&
      usedAttestation.subjectDigest === usedEvidence.subjectDigest && usedAttestation.checkSetDigest === usedEvidence.checkSetDigest &&
      usedAttestation.environmentDigest === usedEvidence.environmentDigest &&
      canWrite(principal(usedAttestation.principalId), 'evidence', task.repoId),
    'evidence.usedAttestation', `Evidence.${evidenceId}`, 'Used evidence has no coherent authorized runner attestation');
    const usedArtifact = usedEvidence && authority.artifacts[usedEvidence.artifactUri];
    require(!!usedEvidence && !!usedArtifact && usedArtifact.hash === usedEvidence.artifactHash && usedArtifact.kind === usedEvidence.kind,
      'evidence.usedArtifact', `Evidence.${evidenceId}`, 'Used evidence artifact is not verified');
  }
  for (const sourceId of usedSourceIds) {
    const usedSource = authority.sources.find(x => x.sourceId === sourceId);
    require(!!usedSource, 'source.reference', `SourceRecord.${sourceId}`, 'Used source is absent');
    if (!usedSource) continue;
    const observed = Date.parse(usedSource.observedAt);
    require(usedSource.freshness === 'fresh' && observed <= now &&
      (!usedSource.effectiveFrom || Date.parse(usedSource.effectiveFrom) <= now) &&
      (!usedSource.effectiveUntil || Date.parse(usedSource.effectiveUntil) >= now) &&
      (usedSource.freshnessPolicy !== 'live' || now - observed <= (usedSource.maxAge ?? 0) * 1000) &&
      (usedSource.freshnessPolicy !== 'revalidateBeforeUse' || observed === now),
    'source.usedFreshness', `SourceRecord.${sourceId}`, 'Used source is stale, expired or not revalidated');
  }
  const claim = b.Claim;
  same(claim, authority.approvedClaims.find(x => x.claimId === claim.claimId) ?? null, 'claim.untrusted', 'Claim');
  require(claim.lifecycle === 'approved' && claim.evidenceStatus === 'supported' && claim.freshness === 'fresh',
    'claim.notUsable', 'Claim', 'Only approved, supported and fresh claims may support this handoff');
  require(inScope(claim.applicableScope), 'claim.scope', 'Claim.applicableScope', 'Claim does not support this scope');
  require(claim.sourceRefs.every(ref => authority.sources.some(x => x.sourceId === ref && x.freshness === 'fresh')), 'claim.source', 'Claim.sourceRefs', 'Claim references an unavailable source');
  require(canWrite(principal(claim.approvedBy ?? ''), 'promotedMemory', task.repoId), 'claim.approver', 'Claim.approvedBy', 'Untrusted memory promotion');
  require(claim.promotionEvidenceRefs.every(ref => authority.evidence.some(x => x.evidenceId === ref && x.outcome === 'pass')), 'claim.promotion', 'Claim.promotionEvidenceRefs', 'Promotion lacks trusted passing evidence');
  const delta = b.MemoryDelta;
  require(delta.expectedMemoryVersion === authority.memoryVersion, 'memory.version', 'MemoryDelta.expectedMemoryVersion', 'Memory optimistic version mismatch');
  require(delta.sourceEvidenceIds.every(ref => authority.evidence.some(x => x.evidenceId === ref)), 'memory.evidence', 'MemoryDelta.sourceEvidenceIds', 'Untrusted source evidence');
  require(delta.claimsAdded.every(x => inScope(x.applicableScope) && x.sourceRefs.every(ref => authority.sources.some(s => s.sourceId === ref))), 'memory.claim', 'MemoryDelta.claimsAdded', 'Proposed claim has invalid scope/source');

  const descriptor = b.SkillDescriptor, binding = b.SkillBinding;
  same(descriptor, authority.skillDescriptors.find(x => x.skillId === descriptor.skillId && x.version === descriptor.version) ?? null, 'skill.untrustedDescriptor', 'SkillDescriptor');
  same(b.ProjectProfile, authority.projectProfiles.find(x => x.profileId === b.ProjectProfile.profileId) ?? null, 'skill.untrustedProfile', 'ProjectProfile');
  same(binding, authority.skillSelections.find(x => x.bindingId === binding.bindingId) ?? null, 'skill.untrustedSelection', 'SkillBinding');
  require(descriptor.contentDigest === digest(descriptor.resources), 'skill.packageDigest', 'SkillDescriptor.contentDigest', 'Resource inventory digest mismatch');
  require(['reviewed', 'tested', 'released'].includes(descriptor.lifecycle), 'skill.lifecycle', 'SkillDescriptor.lifecycle', 'Skill is not eligible for a completed invocation');
  require(descriptor.supportedTaskClasses.includes(task.taskClass), 'skill.taskClass', 'SkillDescriptor.supportedTaskClasses', 'Skill does not support this task');
  require(binding.taskId === task.taskId && binding.planId === plan.planId && binding.artifactHash === plan.hash && binding.skillId === descriptor.skillId && binding.skillVersion === descriptor.version,
    'skill.binding', 'SkillBinding', 'Skill binding belongs to a different task/plan/version');
  require(binding.descriptorDigest === digest(descriptor) && binding.projectProfileDigest === digest(b.ProjectProfile) && binding.environmentDigest === authority.environmentDigest,
    'skill.digest', 'SkillBinding', 'Skill descriptor/project/environment drift');
  require(binding.contextManifestRef === manifest.manifestId && binding.contextManifestDigest === manifest.manifestDigest,
    'skill.context', 'SkillBinding', 'Skill is bound to a different context');
  require(b.ProjectProfile.repoId === task.repoId, 'skill.project', 'ProjectProfile.repoId', 'Wrong target project');
  require(b.ProjectProfile.profileKind === 'observed',
    'skill.profileUnknown', 'ProjectProfile', 'Completed invocation requires an observed prerequisite profile');
  try {
    const eligibility = evaluateSkillEligibility(descriptor, { taskClass: task.taskClass, projectProfile: b.ProjectProfile,
      environmentDigest: authority.environmentDigest, capabilities: authority.capabilities.map(x => ({ ...x, availability: 'available' as const })) });
    require(eligibility.status === 'eligible', 'skill.ineligible', 'SkillDescriptor.compatibility', eligibility.reasons.map(x => x.message).join('; '));
    same(binding.capabilityBindings, eligibility.capabilityBindings, 'skill.selectionCapabilities', 'SkillBinding.capabilityBindings');
  } catch { issue('skill.ineligible', 'SkillDescriptor.compatibility', 'Invalid or ambiguous eligibility context'); }
  const body = descriptor.resources.find(x => x.kind === 'body');
  require(!!body && binding.loadedResources.some(x => equal(x, body)), 'skill.bodyNotLoaded', 'SkillBinding.loadedResources', 'The pinned skill body is not represented as loaded');
  for (const resource of binding.loadedResources) require(descriptor.resources.some(x => equal(x, resource)), 'skill.resource', 'SkillBinding.loadedResources', 'Loaded resource not covered by the pinned descriptor');
  for (const capability of descriptor.requiredCapabilities) require(binding.capabilityBindings.some(x => x.capability === capability), 'skill.missingCapability', 'SkillBinding.capabilityBindings', 'Missing required capability binding');
  for (const capability of binding.capabilityBindings) require(capability.targetProjectId === task.repoId && authority.capabilities.some(x => equal(x, capability)),
    'skill.capability', 'SkillBinding.capabilityBindings', 'Implementation identity or target differs from the approved registry');
  if (binding.policyReleaseId !== null) require(binding.policyReleaseId === gate.policyReleaseId, 'skill.policy', 'SkillBinding.policyReleaseId', 'Skill refers to a different release');
  require(binding.certificationEvidenceRefs.every(ref => authority.evidence.some(x => x.evidenceId === ref)), 'skill.certification', 'SkillBinding.certificationEvidenceRefs', 'Untrusted certification evidence');
  return report(names.length);
}

function checkDag(nodes: { id: string; dependencies: string[] }[], label: string,
  issue: (code: string, path: string, message: string) => void): void {
  const map = new Map(nodes.map(node => [node.id, node.dependencies]));
  const visiting = new Set<string>(), visited = new Set<string>();
  const visit = (id: string): void => {
    if (visiting.has(id)) { issue('plan.cycle', label, 'Dependency graph contains a cycle'); return; }
    if (visited.has(id)) return;
    const dependencies = map.get(id);
    if (!dependencies) { issue('plan.reference', label, `Unknown dependency ${id}`); return; }
    visiting.add(id);
    for (const dependency of dependencies) visit(dependency);
    visiting.delete(id); visited.add(id);
  };
  for (const node of nodes) visit(node.id);
}
