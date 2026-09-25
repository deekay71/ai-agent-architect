import { randomUUID } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { canonicalJson, digest } from '../contracts/canonical.js';
import { assertRuntimeContextGuard, evaluateRuntimeContextGuard, parseContextGuardPin, type ContextGuardPin, type RuntimeContextGuard } from '../context/runtime-guard.js';
import { parseContract, SCHEMA_VERSION, type Checkpoint, type CheckResult, type OperationRecord, type ToolCall, type SkillBinding } from '../contracts/schemas.js';
import { isWithinScope } from '../foundation/permissions.js';
import { createSkillBinding, discoverSkills, loadSkillCatalog, loadSkillResource, resolveSkill,
  type LoadSkillCatalogOptions, type SkillResolutionContext } from '../skills/catalog.js';
import { evaluatePlanningReadiness, evaluateVerifierReport, issueStageGate, lookupStageGate, planningInputs,
  type EvaluationStage, type PlanningRecords, type RuntimeAuthorityConfig, type StageGateEnvelope,
  type TrustedVerifierReceipt, type VerifierExpectation, type VerifierReport } from './evaluation.js';
import { runIsolated, type IsolatedRunResult } from './isolation.js';
import { acquireProjectLock, recoverProjectLock, type ProjectLock } from './lock.js';
import { RuntimeStore } from './store.js';
import { bytesDigest, workspaceDigest, workspacePath, workspaceSnapshot } from './workspace.js';

export const WORKFLOW_VERSION = 'durable-fixture/1';
const toolScript = fileURLToPath(new URL('./tool-worker.js', import.meta.url));
const verifierScript = fileURLToPath(new URL('./verifier-worker.js', import.meta.url));
const id = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,150}$/);
const operationSchema = z.strictObject({ operationId: id, stepId: id, target: z.string().min(1), content: z.string().max(512 * 1024) });
export type RuntimeOperation = z.infer<typeof operationSchema>;
export interface RunRequest { runId: string; records: PlanningRecords; operations: RuntimeOperation[] }
export interface RuntimeConfig {
  schemaVersion: 'runtime-config/1'; authority: RuntimeAuthorityConfig; policyReleaseId: string;
  toolDigest: string; verifierDigest: string; environmentDigest: string;
  limits: { maxDispatches: number; maxAttemptsPerOperation: number; maxReplans: number; maxPlannerAttempts: number; timeoutMs: number };
  /** Operator-owned catalog registration. Skills are inert guidance; they never broaden tool permissions. */
  skill?: { catalog: LoadSkillCatalogOptions; context: SkillResolutionContext; skillId: string; version: string; resources: string[]; bindingDigest: string };
  /** Operator-installed requirement. Candidate runs cannot replace or remove it. */
  contextGuard?: ContextGuardPin;
}
export type RunState = 'queued' | 'running' | 'paused' | 'blocked' | 'cancelled' | 'completed';
export interface RunRecord {
  runId: string; lineageId: string; parentRunId: string | null; mode: 'new' | 'replay' | 'replan';
  workflowVersion: string; schemaVersion: typeof SCHEMA_VERSION; requestDigest: string; request: RunRequest;
  state: RunState; reason: string | null; checkpointRef: string | null; workspaceDigest: string;
  cancelRequested: boolean; createdAt: string; updatedAt: string;
  /** Absent only for historical Phase 2 fixture records. Null explicitly means limited fixture mode. */
  contextGuardPin?: ContextGuardPin | null;
}
interface LedgerEntry { payloadDigest: string; baselineRef: string; skillBindingRef: string | null; call: ToolCall; record: OperationRecord }
interface LineageBudget { dispatches: number; replans: number; plannerAttempts: number }
export interface RuntimeStatus { run: RunRecord; operations: OperationRecord[]; budget: LineageBudget; checkpoint: Checkpoint | null }
export interface ExecutionOptions {
  signal?: AbortSignal;
  /** Operator/test-only fault seam. Never loaded from a candidate or tool response. */
  observe?: (event: 'prepared' | 'started' | 'after-worker' | 'before-commit', operationId: string) => void | Promise<void>;
  fixtureFault?: 'after-effect' | 'hang-after-effect';
}
const spent: OperationRecord['budgetSpent'] = { tokens: 0, cost: 0, currency: 'USD', status: 'measured', sourceRef: 'local-fixed-adapter:no-model-call' };
const now = (): string => new Date().toISOString();
const within = (a: string, b: string): boolean => b === a || b.startsWith(a + path.sep);
function reason(error: unknown): string {
  // Candidate text, filesystem paths, provider bodies and worker stdout never enter audit logs.
  const message = error instanceof Error ? error.message : '';
  return /^[A-Z][A-Z0-9_:-]{1,100}$/.test(message) ? message : 'RUNTIME_STOPPED';
}

/** A trusted local broker; its API is not exposed to executor code. One canonical project lock, durable state. */
export class PersistentWorkflowRunner {
  readonly workspace: string;
  readonly store: RuntimeStore;
  readonly lockRoot: string;
  private queue: Promise<unknown> = Promise.resolve();
  private active = new Map<string, AbortController>();
  private contextGuard: RuntimeContextGuard | undefined;
  constructor(workspace: string, controlRoot: string) {
    this.workspace = realpathSync(workspace);
    mkdirSync(controlRoot, { recursive: true, mode: 0o700 });
    const control = realpathSync(controlRoot);
    if (within(this.workspace, control) || within(control, this.workspace)) throw new Error('CONTROL_WORKSPACE_OVERLAP');
    this.store = new RuntimeStore(control);
    // A second broker cannot bypass ownership by choosing a different state directory.
    this.lockRoot = path.join(os.homedir(), '.local', 'state', 'ai-agent-architect', 'project-locks', digest(this.workspace).slice(7));
    mkdirSync(this.lockRoot, { recursive: true, mode: 0o700 });
    const binding = this.store.read<string>('metadata', 'workspace');
    if (binding && binding !== this.workspace) { this.store.close(); throw new Error('STORE_PROJECT_MISMATCH'); }
    this.store.write('metadata', 'workspace', this.workspace);
  }
  async close(): Promise<void> { await this.queue; this.store.close(); }
  private serialized<T>(action: (lock: ProjectLock) => Promise<T>): Promise<T> {
    const next = this.queue.then(async () => {
      const lock = await acquireProjectLock(this.lockRoot);
      try { return await action(lock); }
      finally { try { await lock.release(); } catch (error) { await lock.quarantine(); throw error; } }
    });
    this.queue = next.catch(() => undefined); return next;
  }
  async recoverOwnership(): Promise<{ recovered: boolean }> { return recoverProjectLock(this.lockRoot); }
  /** Trusted host-only attachment; never deserialized from candidate input. */
  attachContextGuard(guard: RuntimeContextGuard): void { assertRuntimeContextGuard(guard); this.contextGuard = guard; }
  /** Installation is a trusted operator action, separate from run submission. Updates invalidate old gates. */
  async configure(config: RuntimeConfig): Promise<void> {
    canonicalJson(config);
    if (config.contextGuard !== undefined) parseContextGuardPin(config.contextGuard);
    if (config.schemaVersion !== 'runtime-config/1' || config.authority.schemaVersion !== 'runtime-authority/1' ||
      Object.values(config.limits).some(x => !Number.isSafeInteger(x) || x <= 0) || config.limits.timeoutMs > 3_600_000 ||
      config.toolDigest !== bytesDigest(readFileSync(toolScript)) || config.verifierDigest !== bytesDigest(readFileSync(verifierScript))) throw new Error('CONFIG_INVALID');
    await this.serialized(async () => { this.store.write('config', 'active', config); });
  }
  config(): RuntimeConfig { const config = this.store.read<RuntimeConfig>('config', 'active'); if (!config) throw new Error('CONFIG_MISSING'); return config; }
  static implementationPins(): { toolDigest: string; verifierDigest: string } {
    return { toolDigest: bytesDigest(readFileSync(toolScript)), verifierDigest: bytesDigest(readFileSync(verifierScript)) };
  }
  private requireRun(runId: string): RunRecord {
    const run = this.store.read<RunRecord>('run', runId); if (!run) throw new Error('RUN_MISSING');
    if (run.workflowVersion !== WORKFLOW_VERSION || run.schemaVersion !== SCHEMA_VERSION) throw new Error('CHECKPOINT_VERSION_MISMATCH');
    if (digest(run.request) !== run.requestDigest) throw new Error('RUN_REQUEST_TAMPERED');
    if (run.checkpointRef) {
      const checkpoint = parseContract('Checkpoint', this.store.artifactValue(run.checkpointRef));
      if (checkpoint.workflowDefinitionVersion !== WORKFLOW_VERSION || checkpoint.runId !== runId) throw new Error('CHECKPOINT_VERSION_MISMATCH');
    }
    return run;
  }
  status(runId: string): RuntimeStatus {
    const run = this.requireRun(runId);
    return { run, operations: run.request.operations.flatMap(x => { const entry = this.store.read<LedgerEntry>('operation', x.operationId); return entry ? [entry.record] : []; }),
      budget: this.store.read<LineageBudget>('budget', run.lineageId)!,
      checkpoint: run.checkpointRef ? parseContract('Checkpoint', this.store.artifactValue(run.checkpointRef)) : null };
  }
  private persist(run: RunRecord, state: RunState, code: string | null): void {
    run.state = state; run.reason = code; run.updatedAt = now();
    this.store.write('run', run.runId, run);
    this.store.event(run.runId, { kind: 'state', state, reason: code, at: run.updatedAt });
  }
  private checkpoint(run: RunRecord): void {
    const complete = run.request.operations.filter(x => this.store.read<LedgerEntry>('operation', x.operationId)?.record.state === 'COMMITTED').map(x => x.operationId);
    const branches = this.store.read<{ branchId: string; inputDigest: string }[]>('branch-manifest', run.runId) ?? [];
    const branchDone = branches.filter(x => this.store.read('branch', digest({ runId: run.runId, branchId: x.branchId }))).map(x => `planner:${x.branchId}`);
    const budget = this.store.read<LineageBudget>('budget', run.lineageId)!;
    const checkpoint = parseContract('Checkpoint', {
      schemaVersion: SCHEMA_VERSION, checkpointId: randomUUID(), workflowDefinitionVersion: WORKFLOW_VERSION, runId: run.runId, branchId: run.lineageId,
      ...(run.checkpointRef ? { parentCheckpointRef: run.checkpointRef } : {}), completedNodeIds: [...complete, ...branchDone],
      pendingNodeIds: [...run.request.operations.map(x => x.operationId).filter(x => !complete.includes(x)), ...branches.map(x => `planner:${x.branchId}`).filter(x => !branchDone.includes(x))],
      contextBundleRefs: [this.store.artifact(run.request.records.context)], planPackageRefs: [this.store.artifact(run.request.records.plan)],
      invocationReceiptRefs: complete.flatMap(x => this.store.read<LedgerEntry>('operation', x)!.record.postconditionRefs),
      promptConfigHashes: [digest(this.config())], budgetSpent: budget.plannerAttempts ? { tokens: null, cost: null, currency: 'USD', status: 'unknown', sourceRef: null } : spent,
      operationLedgerCursor: this.store.event(run.runId, { kind: 'checkpoint', completed: [...complete, ...branchDone], budget }), createdAt: now(),
    });
    run.checkpointRef = this.store.artifact(checkpoint); this.store.write('run', run.runId, run);
  }
  private validateRequest(value: RunRequest): RunRequest {
    canonicalJson(value);
    const input = z.strictObject({ runId: id, records: z.strictObject({ task: z.unknown(), plan: z.unknown(), manifest: z.unknown(), context: z.unknown() }), operations: z.array(operationSchema).min(1).max(100) }).parse(value);
    const records: PlanningRecords = { task: parseContract('TaskSpec', input.records.task), plan: parseContract('PlanPackage', input.records.plan),
      manifest: parseContract('ContextManifest', input.records.manifest), context: parseContract('ContextBundle', input.records.context) };
    if (new Set(input.operations.map(x => x.operationId)).size !== input.operations.length) throw new Error('OPERATION_DUPLICATE');
    const steps = records.plan.subplans.flatMap(x => x.steps), previous: string[] = [];
    if (input.operations.length !== steps.length || new Set(input.operations.map(x => x.stepId)).size !== steps.length ||
      !steps.every(x => input.operations.some(op => op.stepId === x.stepId))) throw new Error('PLAN_STEP_COVERAGE');
    for (const op of input.operations) {
      const step = steps.find(x => x.stepId === op.stepId);
      const subplan = records.plan.subplans.find(x => x.steps.some(s => s.stepId === op.stepId));
      if (!step || step.capability !== 'fixture.write-once' || !step.allowedTools.includes('fixture.write-once') ||
        step.dependsOn.some(x => !previous.includes(x))) throw new Error('TOOL_PLAN_DENIED');
      if (subplan?.dependencies.some(dependency => {
        const dependencyPlan = records.plan.subplans.find(x => x.planId === dependency);
        return !dependencyPlan || dependencyPlan.steps.some(x => !previous.includes(x.stepId));
      })) throw new Error('SUBPLAN_DEPENDENCY_DENIED');
      workspacePath(this.workspace, op.target, records.task.allowedPaths);
      const parent = path.posix.dirname(op.target);
      if (!subplan || ![records.manifest.scope.allowedPaths, subplan.scope.allowedPaths].every(roots =>
        isWithinScope(op.target, roots) && isWithinScope(parent, roots))) throw new Error('TOOL_SCOPE_DENIED');
      if (!isWithinScope(parent, records.task.allowedPaths) || !lstatSync(workspacePath(this.workspace, parent, records.task.allowedPaths)).isDirectory()) throw new Error('TOOL_PARENT_DENIED');
      if (Buffer.byteLength(op.content) > 512 * 1024) throw new Error('TOOL_INPUT_LIMIT');
      previous.push(op.stepId);
    }
    return { runId: input.runId, records, operations: input.operations };
  }
  async submit(request: RunRequest): Promise<RuntimeStatus> {
    return this.serialized(async () => this.submitLocked(request, null, 'new'));
  }
  private submitLocked(value: RunRequest, parent: RunRecord | null, mode: RunRecord['mode']): RuntimeStatus {
    const request = this.validateRequest(value), existing = this.store.read<RunRecord>('run', request.runId);
    if (existing) { if (existing.requestDigest !== digest(request)) throw new Error('RUN_ID_CONFLICT'); return this.status(request.runId); }
    if (request.operations.some(x => this.store.read('operation', x.operationId))) throw new Error('OPERATION_ID_CONFLICT');
    const config = this.config(), readiness = evaluatePlanningReadiness(request.records, config.authority.planning);
    if (readiness.outcome !== 'pass') throw new Error('PLAN_NOT_READY');
    const lineageId = mode === 'replan' && parent ? parent.lineageId : request.runId;
    const budget = this.store.read<LineageBudget>('budget', lineageId) ?? { dispatches: 0, replans: 0, plannerAttempts: 0 };
    if (mode === 'replan' && ++budget.replans > config.limits.maxReplans) throw new Error('REPLAN_BUDGET_EXHAUSTED');
    const run: RunRecord = { runId: request.runId, lineageId, parentRunId: parent?.runId ?? null, mode, workflowVersion: WORKFLOW_VERSION, schemaVersion: SCHEMA_VERSION,
      requestDigest: digest(request), request, contextGuardPin: config.contextGuard ?? null, state: 'queued', reason: null, checkpointRef: null, workspaceDigest: workspaceDigest(this.workspace), cancelRequested: false, createdAt: now(), updatedAt: now() };
    this.store.transaction(() => { this.store.insert('run', run.runId, run); this.store.write('budget', lineageId, budget); this.checkpoint(run); });
    return this.status(run.runId);
  }
  /** Explicit new lineage and new operation IDs. Existing targets still require matching postconditions. */
  async replay(runId: string, next: RunRequest): Promise<RuntimeStatus> {
    return this.serialized(async () => this.submitLocked(next, this.requireRun(runId), 'replay'));
  }
  /** New plan revision shares all spent budgets. Uncertain old effects must be reconciled first. */
  async replan(runId: string, next: RunRequest): Promise<RuntimeStatus> {
    return this.serialized(async () => {
      const parent = this.requireRun(runId);
      if (this.status(runId).operations.some(x => x.state !== 'COMMITTED' && x.state !== 'PREPARED')) throw new Error('RECONCILIATION_REQUIRED');
      return this.submitLocked(next, parent, 'replan');
    });
  }
  /** Can interrupt this broker's current worker. Foreign owners are stopped through their owning process. */
  async cancel(runId: string): Promise<void> {
    this.active.get(runId)?.abort();
    await this.serialized(async () => { const run = this.requireRun(runId); if (run.state === 'completed') return;
      run.cancelRequested = true; this.persist(run, 'cancelled', 'CANCELLED'); });
  }
  private async worker(lock: ProjectLock, options: Parameters<typeof runIsolated>[0]): Promise<IsolatedRunResult> {
    await lock.beginWorker();
    let registered: number | undefined;
    let result: IsolatedRunResult;
    try {
      result = await runIsolated({ ...options, onSpawn: async pid => {
        await lock.registerWorker(pid); registered = pid;
        await options.onSpawn?.(pid); // Admission completes before the fixed worker receives stdin.
      } });
    } catch (error) {
      // runIsolated rejects a failed handshake only after reaping the child. clearWorker
      // independently verifies PID/process-group absence; uncertain ownership stays quarantined.
      if (registered !== undefined) await lock.clearWorker(registered);
      throw error;
    }
    if (!result.stopped) throw new Error('WORKER_NOT_STOPPED');
    await lock.clearWorker(result.pid); return result;
  }
  private async skill(config: RuntimeConfig, run: RunRecord): Promise<SkillBinding | null> {
    const skill = config.skill; if (!skill) return null;
    if (skill.context.taskClass !== run.request.records.task.taskClass || skill.context.environmentDigest !== config.environmentDigest || skill.context.projectProfile.repoId !== run.request.records.task.repoId) throw new Error('SKILL_SCOPE_DRIFT');
    const catalog = await loadSkillCatalog(skill.catalog), resolution = resolveSkill(catalog, { ...skill.context, skillId: skill.skillId, version: skill.version });
    if (resolution.status !== 'eligible') throw new Error('SKILL_UNAVAILABLE');
    for (const resource of skill.resources) {
      const loaded = await loadSkillResource(catalog, resolution.selection, resource, skill.context);
      this.store.write('skill-resource', loaded.contentHash, { artifactRef: this.store.artifact(loaded) });
    }
    const binding = await createSkillBinding(catalog, resolution.selection, { bindingId: 'runtime-skill', taskId: run.request.records.task.taskId, planId: run.request.records.plan.planId,
      artifactHash: run.request.records.plan.hash, contextManifestRef: run.request.records.manifest.manifestId, contextManifestDigest: run.request.records.manifest.manifestDigest,
      policyReleaseId: config.policyReleaseId, certificationEvidenceRefs: [] }, skill.context);
    if (digest(binding) !== skill.bindingDigest) throw new Error('SKILL_BINDING_DRIFT');
    if (!binding.capabilityBindings.length || binding.capabilityBindings.some(x => x.capability !== 'fixture.write-once' ||
      x.implementationRef !== 'fixture.write-once' || x.implementationDigest !== config.toolDigest || x.targetProjectId !== run.request.records.task.repoId)) throw new Error('SKILL_CAPABILITY_DRIFT');
    const descriptor = discoverSkills(catalog).find(x => x.skillId === binding.skillId && x.version === binding.skillVersion)!;
    if (this.store.artifact(descriptor) !== binding.descriptorDigest || this.store.artifact(skill.context.projectProfile) !== binding.projectProfileDigest) throw new Error('SKILL_ARTIFACT_DRIFT');
    this.store.artifact(binding); return binding;
  }
  private async currentContext(run: RunRecord, config: RuntimeConfig): Promise<ContextGuardPin | null> {
    const required = run.contextGuardPin ?? null;
    if (digest(required) !== digest(config.contextGuard ?? null)) throw new Error('CONTEXT_GUARD_CONFIG_DRIFT');
    if (!required) return null; // Legacy Phase 2 mechanical fixture; no live Memory admission claim.
    if (!this.contextGuard) throw new Error('CONTEXT_GUARD_MISSING');
    const result = await evaluateRuntimeContextGuard(this.contextGuard, required, run.request.records);
    if (result.status !== 'ready') {
      this.store.event(run.runId, { kind: 'context-blocked', reasonCodes: result.issues.map(x => x.code) });
      throw new Error(result.issues[0]?.code.startsWith('CONTEXT_GUARD_') ? result.issues[0].code : 'CONTEXT_NOT_READY');
    }
    return required;
  }
  private gate(run: RunRecord, stage: EvaluationStage, subject: string, evidence: unknown, skill: SkillBinding | null = null): StageGateEnvelope {
    const config = this.config(), authority = structuredClone(config.authority), at = now();
    const definitions = authority.gate.checks.filter(x => x.stage === stage).map(x => x.definition);
    if (definitions.length !== 1 || definitions.some(x => x.method !== 'deterministic' || x.checkId !== `runtime.fixture.${stage}` ||
      x.verifierVersion !== 'mechanical-verifier/1' || x.version !== '1' || x.validatorRef !== `validator:${stage}:1` ||
      digest(x.requiredEvidenceKinds) !== digest(['mechanical-report']) || !x.critical || !x.applicability.required ||
      digest(x.applicability.taskClasses) !== digest(['runtime.fixture']))) throw new Error('GATE_CHECK_UNSUPPORTED');
    const evidenceRef = this.store.artifact({ kind: 'mechanical-report', stage, subjectDigest: subject, evidence });
    const checks: CheckResult[] = definitions.map(def => parseContract('CheckResult', { schemaVersion: SCHEMA_VERSION, checkId: def.checkId,
      definitionDigest: digest(def), verifierVersion: def.verifierVersion, subjectDigest: subject, evidenceRefs: [evidenceRef], outcome: 'pass',
      producedBy: authority.gate.verifierIds[0], producedAt: at, method: 'deterministic', validatorRef: def.method === 'deterministic' ? def.validatorRef : '' }));
    authority.gate.trustedCheckResults = [...authority.gate.trustedCheckResults, ...checks.map(result => ({ stage, result }))];
    const expected = { stage, taskClass: run.request.records.task.taskClass, subjectDigest: subject,
      inputVersions: [...planningInputs(run.request.records), ...(skill ? [{ ref: skill.bindingId, version: skill.skillVersion, digest: digest(skill) }] : [])], policyReleaseId: config.policyReleaseId };
    // This dependency is admitted by the broker's pinned skill loader, never from candidate gate input.
    if (skill) authority.planning.expectedInputs = [...authority.planning.expectedInputs, { ref: skill.bindingId, version: skill.skillVersion, digest: digest(skill) }];
    const issued = issueStageGate({ gateReportId: randomUUID(), ...expected, checkResults: checks }, authority, at);
    if (issued.outcome !== 'pass' || !issued.gate) throw new Error('GATE_NOT_PASS');
    this.store.write('trusted-checks', issued.gate.report.gateReportId, authority.gate.trustedCheckResults);
    this.store.insert('gate', issued.gate.report.gateReportId, issued.gate);
    const verified = lookupStageGate(issued.gate.report.gateReportId, expected, [this.store.read<StageGateEnvelope>('gate', issued.gate.report.gateReportId)!], authority, at);
    if (verified.outcome !== 'pass') throw new Error('GATE_LOOKUP_REJECTED');
    return issued.gate;
  }
  private call(run: RunRecord, op: RuntimeOperation, config: RuntimeConfig): ToolCall {
    return parseContract('ToolCall', { schemaVersion: SCHEMA_VERSION, callId: randomUUID(), operationId: op.operationId, attemptId: randomUUID(), runId: run.runId, stepId: op.stepId,
      capability: 'fixture.write-once', toolRef: 'fixture.write-once', implementationDigest: config.toolDigest, targetProjectId: run.request.records.task.repoId, toolVersion: '1',
      arguments: { target: op.target, content: op.content }, argumentsHash: digest({ target: op.target, content: op.content }), idempotencyKey: op.operationId,
      expectedWorkspaceDigest: run.workspaceDigest, recoveryMode: 'reconcilable', timeoutMs: config.limits.timeoutMs,
      permissionScope: { allowedPaths: run.request.records.task.allowedPaths, allowedCommands: ['fixture.write-once'], networkDestinations: [] } });
  }
  private async verify(lock: ProjectLock, run: RunRecord, op: RuntimeOperation, subject: string, config: RuntimeConfig): Promise<{ report: VerifierReport; receipt: TrustedVerifierReceipt }> {
    if (bytesDigest(readFileSync(verifierScript)) !== config.verifierDigest) throw new Error('VERIFIER_IMPLEMENTATION_DRIFT');
    const target = workspacePath(this.workspace, op.target, run.request.records.task.allowedPaths), reportId = randomUUID();
    const base = { schemaVersion: 'verifier-report/1', reportId, runId: run.runId, operationId: op.operationId, subjectDigest: subject,
      checkSetDigest: digest(['content-hash']), environmentDigest: config.environmentDigest };
    const started = now();
    const result = await this.worker(lock, { scriptPath: verifierScript, workspace: this.workspace, readRoots: [target], writeRoots: [], timeoutMs: config.limits.timeoutMs,
      input: canonicalJson({ target, expectedHash: bytesDigest(op.content), report: base }) });
    if (result.exitCode !== 0 || result.termination !== 'exited' || result.outputTruncated) throw new Error('VERIFIER_UNKNOWN');
    let report: VerifierReport;
    try { report = JSON.parse(result.stdout) as VerifierReport; } catch { throw new Error('VERIFIER_UNKNOWN'); }
    const expectation: VerifierExpectation = { ...base, expectedTestIds: ['content-hash'], notBefore: started, now: now(), runnerId: 'fixture-verifier', principalId: config.authority.gate.verifierIds[0]!, runnerVersion: '1', configDigest: config.verifierDigest };
    const receipt: TrustedVerifierReceipt = { reportId, reportDigest: digest(report), runnerId: expectation.runnerId, principalId: expectation.principalId, runnerVersion: '1',
      configDigest: config.verifierDigest, runId: run.runId, operationId: op.operationId, subjectDigest: subject, checkSetDigest: base.checkSetDigest, environmentDigest: config.environmentDigest, recordedAt: expectation.now };
    if (evaluateVerifierReport(report, expectation, receipt).outcome !== 'pass') throw new Error('VERIFIER_NOT_PASS');
    return { report, receipt };
  }
  private async commitEffect(lock: ProjectLock, run: RunRecord, op: RuntimeOperation, entry: LedgerEntry, config: RuntimeConfig, options: ExecutionOptions): Promise<void> {
    // A postcondition is stronger than the candidate's claimed exit code/receipt. Recovery never trusts stdout.
    await this.currentContext(run, config);
    const target = workspacePath(this.workspace, op.target, run.request.records.task.allowedPaths);
    const currentSkill = await this.skill(config, run);
    if ((currentSkill ? digest(currentSkill) : null) !== entry.skillBindingRef) throw new Error('SKILL_BINDING_DRIFT');
    if (!existsSync(target) || !lstatSync(target).isFile() || bytesDigest(readFileSync(target)) !== bytesDigest(op.content)) {
      entry.record.state = 'UNKNOWN'; this.store.write('operation', op.operationId, entry); throw new Error('RECONCILIATION_REQUIRED');
    }
    const before = this.store.artifactValue(entry.baselineRef) as ReturnType<typeof workspaceSnapshot>;
    const after = workspaceSnapshot(this.workspace);
    if (!Array.isArray(before) || digest(before) !== entry.call.expectedWorkspaceDigest ||
      digest(before.filter(x => x.path !== op.target)) !== digest(after.filter(x => x.path !== op.target))) throw new Error('UNEXPECTED_WORKSPACE_EFFECT');
    const snapshot = digest(after), subject = digest({ runId: run.runId, operationId: op.operationId, snapshot, argumentsHash: entry.call.argumentsHash });
    const verification = await this.verify(lock, run, op, subject, config);
    const boundSkill = entry.skillBindingRef ? parseContract('SkillBinding', this.store.artifactValue(entry.skillBindingRef)) : null;
    await options.observe?.('before-commit', op.operationId);
    await this.currentContext(run, config);
    const gate = this.gate(run, 'post-execution', subject, verification, boundSkill);
    this.store.transaction(() => {
      const receiptRef = this.store.artifact(verification.receipt), reportRef = this.store.artifact(verification.report), gateRef = this.store.artifact(gate);
      const last = entry.record.attempts.at(-1)!;
      if (last.status === 'started') { last.status = 'unknown'; last.finishedAt = now(); }
      entry.record = parseContract('OperationRecord', { ...entry.record, state: 'COMMITTED', receiptRef, postconditionRefs: [reportRef, gateRef], resultRef: reportRef });
      this.store.write('operation', op.operationId, entry); run.workspaceDigest = snapshot; this.checkpoint(run);
    });
  }
  /** Resume reuses committed results, reconciles uncertain effects, and dispatches only never-started intents. */
  async resume(runId: string, options: ExecutionOptions = {}): Promise<RuntimeStatus> {
    return this.serialized(async lock => {
      const run = this.requireRun(runId);
      if (run.state === 'completed' || run.cancelRequested) return this.status(runId);
      const abort = new AbortController(); this.active.set(runId, abort);
      const signal = options.signal ? AbortSignal.any([abort.signal, options.signal]) : abort.signal;
      try {
        const config = this.config();
        await this.currentContext(run, config);
        if (this.store.read<LineageBudget>('budget', run.lineageId)!.plannerAttempts > 0) throw new Error('PLANNER_USAGE_UNMETERED');
        if (evaluatePlanningReadiness(run.request.records, config.authority.planning).outcome !== 'pass') throw new Error('PLAN_NOT_READY');
        this.gate(run, 'planning', run.request.records.plan.hash, { readiness: 'pass', inputs: planningInputs(run.request.records) });
        this.persist(run, 'running', null);
        for (const op of run.request.operations) {
          if (signal.aborted) { this.persist(run, 'cancelled', 'CANCELLED'); break; }
          const payloadDigest = digest({ runId, op, toolDigest: config.toolDigest });
          let entry = this.store.read<LedgerEntry>('operation', op.operationId);
          if (entry && entry.payloadDigest !== payloadDigest) throw new Error('OPERATION_ID_CONFLICT');
          if (entry?.record.state === 'COMMITTED') continue;
          if (entry && entry.record.state !== 'PREPARED') {
            await this.commitEffect(lock, run, op, entry, config, options); continue;
          }
          if (workspaceDigest(this.workspace) !== run.workspaceDigest) throw new Error('WORKSPACE_DRIFT');
          if (bytesDigest(readFileSync(toolScript)) !== config.toolDigest) throw new Error('TOOL_IMPLEMENTATION_DRIFT');
          const skill = await this.skill(config, run);
          const skillBindingRef = skill ? digest(skill) : null;
          if (entry && entry.skillBindingRef !== skillBindingRef) throw new Error('SKILL_BINDING_DRIFT');
          const call = entry?.call ?? this.call(run, op, config);
          const contextGuardPin = await this.currentContext(run, config);
          const subject = digest({ planHash: run.request.records.plan.hash, call, workspace: run.workspaceDigest, skillBindingRef, contextGuardPin });
          this.gate(run, 'pre-dispatch', subject, { readiness: 'pass', callDigest: digest(call), workspace: run.workspaceDigest, skillBindingRef, contextGuardPin }, skill);
          const budget = this.store.read<LineageBudget>('budget', run.lineageId)!;
          if (budget.dispatches >= config.limits.maxDispatches) throw new Error('DISPATCH_BUDGET_EXHAUSTED');
          if (!entry) {
            entry = { payloadDigest, baselineRef: this.store.artifact(workspaceSnapshot(this.workspace)), skillBindingRef, call, record: parseContract('OperationRecord', { schemaVersion: SCHEMA_VERSION, operationId: op.operationId, runId, stepId: op.stepId,
              argumentsHash: call.argumentsHash, recoveryMode: call.recoveryMode, expectedWorkspaceDigest: call.expectedWorkspaceDigest, state: 'PREPARED', attempts: [], postconditionRefs: [], budgetSpent: spent }) };
            this.store.insert('operation', op.operationId, entry);
          }
          await options.observe?.('prepared', op.operationId);
          await this.currentContext(run, config);
          if (entry.record.attempts.length >= config.limits.maxAttemptsPerOperation) throw new Error('ATTEMPT_BUDGET_EXHAUSTED');
          this.store.transaction(() => {
            budget.dispatches++; this.store.write('budget', run.lineageId, budget);
            entry!.record.state = 'STARTED'; entry!.record.attempts.push({ attemptId: call.attemptId, callId: call.callId, startedAt: now(), status: 'started' });
            this.store.write('operation', op.operationId, entry); this.checkpoint(run);
          });
          const target = workspacePath(this.workspace, op.target, run.request.records.task.allowedPaths);
          const result = await this.worker(lock, { scriptPath: toolScript, workspace: this.workspace, readRoots: [], writeRoots: [path.dirname(target)], timeoutMs: call.timeoutMs, signal,
            onSpawn: async () => { await options.observe?.('started', op.operationId); await this.currentContext(run, config); },
            input: canonicalJson({ tool: 'fixture.write-once', target, content: op.content, operationId: op.operationId, ...(options.fixtureFault ? { fault: options.fixtureFault } : {}) }) });
          await options.observe?.('after-worker', op.operationId);
          const attempt = entry.record.attempts.at(-1)!; attempt.finishedAt = now();
          attempt.status = result.termination === 'exited' ? (result.exitCode === 0 ? 'succeeded' : 'failed') : result.termination;
          entry.record.state = 'OBSERVED'; this.store.write('operation', op.operationId, entry);
          if (result.termination !== 'exited') { this.persist(run, result.termination === 'cancelled' ? 'cancelled' : 'paused', result.termination.toUpperCase()); break; }
          await this.commitEffect(lock, run, op, entry, config, options);
        }
        if (this.status(runId).operations.length === run.request.operations.length && this.status(runId).operations.every(x => x.state === 'COMMITTED')) this.persist(run, 'completed', null);
      } catch (error) { this.persist(run, 'blocked', reason(error)); }
      finally { this.active.delete(runId); }
      return this.status(runId);
    });
  }
  /** Retrying a tool requires positive absence proof; this reconcilable adapter deliberately has no automatic retry. */
  async retryAttempt(runId: string): Promise<RuntimeStatus> {
    if (this.status(runId).operations.some(x => x.state !== 'PREPARED' && x.state !== 'COMMITTED')) throw new Error('RECONCILIATION_REQUIRED');
    return this.resume(runId);
  }
  /** Explicit recovery after cancellation: checks prior effects only, never starts another operation. */
  async reconcile(runId: string): Promise<RuntimeStatus> {
    return this.serialized(async lock => {
      const run = this.requireRun(runId), config = this.config();
      try {
        for (const op of run.request.operations) {
          const entry = this.store.read<LedgerEntry>('operation', op.operationId);
          if (entry && entry.record.state !== 'PREPARED' && entry.record.state !== 'COMMITTED') await this.commitEffect(lock, run, op, entry, config, {});
        }
        this.persist(run, run.cancelRequested ? 'cancelled' : 'paused', run.cancelRequested ? 'CANCELLED_RECONCILED' : 'RECONCILED');
      } catch (error) { this.persist(run, 'blocked', reason(error)); }
      return this.status(runId);
    });
  }
  /** Read-only planning fan-out. Each successful branch is durably committed as soon as it finishes. */
  async planBranches(runId: string, branches: readonly { branchId: string; inputDigest: string; plan: (signal: AbortSignal) => Promise<unknown> }[]): Promise<{ complete: boolean; results: Record<string, unknown> }> {
    return this.serialized(async () => {
      const run = this.requireRun(runId), config = this.config();
      if (!branches.length || branches.length > 32 || new Set(branches.map(x => x.branchId)).size !== branches.length ||
        branches.some(x => !id.safeParse(x.branchId).success || !/^sha256:[a-f0-9]{64}$/.test(x.inputDigest))) throw new Error('BRANCH_IDS_INVALID');
      const manifest = branches.map(({ branchId, inputDigest }) => ({ branchId, inputDigest }));
      const pinned = this.store.read('branch-manifest', runId);
      if (pinned && digest(pinned) !== digest(manifest)) throw new Error('BRANCH_INPUT_DRIFT');
      this.store.write('branch-manifest', runId, manifest);
      this.checkpoint(run);
      const results: Record<string, unknown> = {};
      const settled = await Promise.allSettled(branches.map(async branch => {
        const key = digest({ runId, branchId: branch.branchId });
        const prior = this.store.read<{ resultRef: string }>('branch', key);
        if (prior) { results[branch.branchId] = this.store.artifactValue(prior.resultRef); return; }
        const budget = this.store.read<LineageBudget>('budget', run.lineageId)!;
        if (budget.plannerAttempts >= config.limits.maxPlannerAttempts) throw new Error('PLANNER_BUDGET_EXHAUSTED');
        budget.plannerAttempts++; this.store.write('budget', run.lineageId, budget); this.checkpoint(run);
        const controller = new AbortController();
        let timer: NodeJS.Timeout | undefined;
        let result: unknown;
        try { result = await Promise.race([branch.plan(controller.signal), new Promise((_, reject) => {
          timer = setTimeout(() => { controller.abort(); reject(new Error('PLANNER_TIMEOUT')); }, config.limits.timeoutMs);
        })]); } finally { if (timer) clearTimeout(timer); }
        canonicalJson(result);
        this.store.transaction(() => { this.store.write('branch', key, { resultRef: this.store.artifact(result) });
          this.store.event(runId, { kind: 'branch-committed', branchId: branch.branchId }); this.checkpoint(run); });
        results[branch.branchId] = result;
      }));
      return { complete: settled.every(x => x.status === 'fulfilled'), results };
    });
  }
}
