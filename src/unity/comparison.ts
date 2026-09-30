import { creditMicrosForUsage, type ModelCreditUsage } from '../contracts/credit-usage.js';
import { digest } from '../contracts/canonical.js';
import type { UnityTaskManifest } from './walking-skeleton.js';

/** The approved observational forecast. It is an admission bound, not an invoice. */
export const UNITY_COMPARISON_FORECAST = Object.freeze({
  aCredits: 27.001,
  bMaximumIncrementalCredits: 19.334,
  cCredits: 46.335,
  totalCredits: 92.67,
  weeklyCreditsPerPercent: 10.46132,
  weeklyQuotaPercent: 8.85835,
});
export const A_TASK_CREDIT_CAP_MICROS = 2_700_100;
export const B_TASK_CUMULATIVE_CREDIT_CAP_MICROS = 4_633_500;

/** Tool completion metadata is insufficient: require the host broker's durable receipt. */
export function auditNativeUnityExecution(arm: 'A' | 'B' | 'C', sourceSha256: string,
  receipts: readonly { sourceSha256: string }[]): string | null {
  if (!receipts.length) return 'infrastructure: native Unity tool produced no execution receipt';
  if (arm !== 'C' && (receipts.length !== 1 || receipts[0]!.sourceSha256 !== sourceSha256))
    return 'infrastructure: one-candidate protocol violated after verification';
  return null;
}

export type ComparisonFailureClass = 'model' | 'infrastructure' | 'unknown';
export type ComparisonOutcome = 'pass' | 'fail' | 'unknown';
export type AStage = 'planner' | 'critic' | 'executor';

export interface ComparisonReceipt {
  readonly receiptId: string;
  readonly model: 'gpt-6-sol' | 'gpt-5.6-terra';
  /** Null counts are deliberately admitted into the seam so the runner can fail closed. */
  readonly usage: ModelCreditUsage;
  readonly elapsedMs: number;
  readonly status: 'completed' | 'failed';
  readonly source?: string;
  readonly error?: string;
  /** Native C must bind its claimed tool use to durable event/turn evidence. */
  readonly toolProofRefs: readonly string[];
  /** Pinned stage output. Executor receives the planner and critic artifacts explicitly. */
  readonly artifact: unknown;
  readonly criticApproved?: boolean;
}

export interface UnityComparisonProtocolLock {
  readonly locked: true;
  readonly protocolDigest: string;
  readonly tasksDigest: string;
  readonly skillsDigest: string;
  readonly modelsDigest: string;
  readonly sourceDigest: string;
  readonly unityCliPermissionsDigest: string;
}

export interface UnityComparisonAdmission {
  readonly conditionalAuthorizationRef: string;
  readonly s1Passed: true;
  readonly lockedProtocol: true;
  readonly forecastWeeklyQuotaPercent: number | null;
}

export interface UnityComparisonModelAdapter {
  /** Implementations reserve this cap before dispatch, settle it from the receipt, and never dispatch on an unknown reservation. */
  runAStage(input: { task: UnityTaskManifest; stage: AStage; priorStages: readonly ComparisonReceipt[]; maxTaskCreditMicros: number; lock: UnityComparisonProtocolLock }): Promise<ComparisonReceipt>;
  /** B receives A's stored output and local test feedback. It must never call A again. */
  repairB(input: { task: UnityTaskManifest; a: ATaskResult; attempt: 1 | 2; previousSource: string; feedback: string; maxCreditMicros: number; lock: UnityComparisonProtocolLock }): Promise<ComparisonReceipt>;
}

/** A separate interface prevents a JSON-only Codex request from being presented as ordinary tool-enabled Codex. */
export interface ToolEnabledUnityCodexExecutor {
  readonly kind: 'ordinary-codex';
  readonly model: 'gpt-5.6-terra';
  readonly toolEnabled: true;
  readonly unityCliPermissionsDigest: string;
  readonly skillsDigest: string;
  runCToolEnabled(input: { task: UnityTaskManifest; maxCreditMicros: number; lock: UnityComparisonProtocolLock }): Promise<ComparisonReceipt>;
}

export interface UnityComparisonVerifier {
  verify(input: { arm: 'A' | 'B' | 'C'; task: UnityTaskManifest; source: string; lock: UnityComparisonProtocolLock }): Promise<{
    outcome: ComparisonOutcome;
    feedback: string;
    evidenceId: string;
    /** Model-hidden test suite passed. This is recorded, never inferred. */
    hiddenPass?: boolean;
    /** Actual owner edits outside the arm. Omit only when there were none. */
    manualOwnerFixes?: number;
  }>;
}

export interface ATaskResult {
  readonly taskId: string;
  readonly receipts: readonly ComparisonReceipt[];
  readonly outcome: ComparisonOutcome;
  readonly classification: ComparisonFailureClass | null;
  readonly source: string;
  readonly feedback: string;
  readonly evidenceId: string | null;
  readonly creditMicros: number | null;
  readonly elapsedMs: number;
  readonly hiddenPass: boolean;
  readonly manualOwnerFixes: number;
}

export interface ComparisonTaskResult {
  readonly taskId: string;
  readonly outcome: ComparisonOutcome;
  readonly classification: ComparisonFailureClass | null;
  readonly receipts: readonly ComparisonReceipt[];
  readonly creditMicros: number | null;
  readonly elapsedMs: number;
  readonly hiddenPass: boolean;
  readonly manualOwnerFixes: number;
  readonly evidenceId: string | null;
  readonly reusedAResult: boolean;
}

export interface UnityComparisonOptions {
  /** `live` refuses to begin A unless ordinary tool-enabled C is already verified. */
  readonly mode?: 'dry-run' | 'live';
  readonly tasks: readonly UnityTaskManifest[];
  readonly lock: UnityComparisonProtocolLock;
  readonly lockMaterial: { readonly protocol: unknown; readonly skills: unknown; readonly source: unknown };
  readonly admission: UnityComparisonAdmission;
  readonly model: UnityComparisonModelAdapter;
  readonly verifier: UnityComparisonVerifier;
  readonly onResult?: (arm: 'A' | 'B' | 'C', row: ATaskResult | ComparisonTaskResult) => void;
  readonly shouldStop?: (arm: 'A' | 'B' | 'C', row: ATaskResult | ComparisonTaskResult) => boolean;
  /** Undefined means native tool-enabled Codex has not yet been verified; C is not dispatched. */
  readonly cExecutor?: ToolEnabledUnityCodexExecutor;
}

function nonblank(value: string, error: string): void { if (!value.trim()) throw Error(error); }
function usageMicros(receipts: readonly ComparisonReceipt[]): number | null {
  if (receipts.some(receipt => receipt.usage.model !== receipt.model)) throw Error('UNITY_COMPARISON_USAGE_RECEIPT_INVALID');
  return creditMicrosForUsage(receipts.map(receipt => receipt.usage));
}
function sumMicros(rows: readonly { creditMicros: number | null }[]): number | null {
  let total = 0;
  for (const row of rows) { if (row.creditMicros === null) return null; total += row.creditMicros; }
  return total;
}
function sumNumber(rows: readonly { elapsedMs: number }[]): number { return rows.reduce((total, row) => total + row.elapsedMs, 0); }

/** Classify the actual failure evidence. Missing/ambiguous evidence is never upgraded to a model failure. */
export function classifyUnityComparisonFailure(error: string | undefined, outcome: ComparisonOutcome): ComparisonFailureClass {
  const text = (error ?? '').toLowerCase();
  if (/infrastructure|license|licen[cs]e|timeout|timed out|missing.*xml|xml.*missing|executable.*missing|not found|unavailable|spawn|network|connection/.test(text)) return 'infrastructure';
  if (outcome === 'unknown' || !text.trim()) return 'unknown';
  if (/\bcs\d+\b|compile|compilation|syntax|json|schema|invalid output|test.*fail|assert/.test(text)) return 'model';
  return 'unknown';
}

function validateAdmission(options: UnityComparisonOptions): void {
  const { admission, lock, tasks, lockMaterial } = options;
  nonblank(admission.conditionalAuthorizationRef, 'UNITY_COMPARISON_AUTHORIZATION_REQUIRED');
  if (admission.s1Passed !== true) throw Error('UNITY_COMPARISON_S1_REQUIRED');
  if (admission.lockedProtocol !== true || lock.locked !== true) throw Error('UNITY_COMPARISON_LOCKED_PROTOCOL_REQUIRED');
  if (admission.forecastWeeklyQuotaPercent === null || !Number.isFinite(admission.forecastWeeklyQuotaPercent)) throw Error('UNITY_COMPARISON_FORECAST_UNKNOWN');
  if (admission.forecastWeeklyQuotaPercent < 0 || admission.forecastWeeklyQuotaPercent > 10) throw Error('UNITY_COMPARISON_FORECAST_QUOTA_EXCEEDED');
  if (tasks.length !== 10 || new Set(tasks.map(task => task.taskId)).size !== 10) throw Error('UNITY_COMPARISON_TASK_SET_REQUIRED');
  for (const value of [lock.protocolDigest, lock.tasksDigest, lock.skillsDigest, lock.modelsDigest, lock.sourceDigest, lock.unityCliPermissionsDigest]) nonblank(value, 'UNITY_COMPARISON_LOCK_INCOMPLETE');
  const expectedModels = digest({ planner: 'gpt-6-sol', critic: 'gpt-6-sol', executor: 'gpt-5.6-terra', c: 'gpt-5.6-terra' });
  if (lock.modelsDigest !== expectedModels) throw Error('UNITY_COMPARISON_MODEL_LOCK_MISMATCH');
  if (lock.tasksDigest !== digest(tasks)) throw Error('UNITY_COMPARISON_TASK_LOCK_MISMATCH');
  if (lock.protocolDigest !== digest(lockMaterial.protocol) || lock.skillsDigest !== digest(lockMaterial.skills) || lock.sourceDigest !== digest(lockMaterial.source)) throw Error('UNITY_COMPARISON_IMMUTABLE_LOCK_MISMATCH');
}

function stageFailure(receipt: ComparisonReceipt): ComparisonFailureClass | null {
  if (receipt.status === 'completed') return null;
  return classifyUnityComparisonFailure(receipt.error, 'fail');
}
function receiptSource(receipt: ComparisonReceipt | undefined): string { return receipt?.source ?? ''; }
interface ReceiptAudit { seen: Set<string>; duplicateReceiptId: string | null }
function recordReceipt(audit: ReceiptAudit, receipt: ComparisonReceipt): boolean {
  if (!receipt.receiptId.trim()) throw Error('UNITY_COMPARISON_RECEIPT_ID_INVALID');
  if (audit.seen.has(receipt.receiptId)) { audit.duplicateReceiptId = receipt.receiptId; return false; }
  audit.seen.add(receipt.receiptId); return true;
}
function verifyResult(result: Awaited<ReturnType<UnityComparisonVerifier['verify']>>) {
  const hiddenPass = result.hiddenPass ?? false, manualOwnerFixes = result.manualOwnerFixes ?? 0;
  if (!Number.isSafeInteger(manualOwnerFixes) || manualOwnerFixes < 0) throw Error('UNITY_COMPARISON_VERIFIER_METRICS_INVALID');
  return { ...result, hiddenPass, manualOwnerFixes };
}

async function runA(task: UnityTaskManifest, options: UnityComparisonOptions, audit: ReceiptAudit): Promise<ATaskResult> {
  const started = Date.now(), receipts: ComparisonReceipt[] = [];
  for (const stage of ['planner', 'critic', 'executor'] as const) {
    const receipt = await options.model.runAStage({ task, stage, priorStages: receipts, maxTaskCreditMicros: A_TASK_CREDIT_CAP_MICROS, lock: options.lock });
    if (receipt.model !== (stage === 'executor' ? 'gpt-5.6-terra' : 'gpt-6-sol') || receipt.artifact === undefined) throw Error('UNITY_COMPARISON_A_ROLE_RECEIPT_INVALID');
    if (stage === 'critic' && typeof receipt.criticApproved !== 'boolean') throw Error('UNITY_COMPARISON_CRITIC_ARTIFACT_INVALID');
    receipts.push(receipt);
    if (!recordReceipt(audit, receipt)) break;
    if (stage === 'critic' && receipt.status === 'completed' && !receipt.criticApproved) break;
    if (receipt.status !== 'completed') break;
  }
  const creditMicros = usageMicros(receipts);
  if (creditMicros === null) return { taskId: task.taskId, receipts, outcome: 'unknown', classification: 'unknown', source: receiptSource(receipts.at(-1)!), feedback: 'usage receipt is unknown', evidenceId: null,
    creditMicros: null, elapsedMs: Date.now() - started, hiddenPass: false, manualOwnerFixes: 0 };
  if (audit.duplicateReceiptId !== null) return { taskId: task.taskId, receipts, outcome: 'unknown', classification: 'unknown', source: receiptSource(receipts.at(-1)), feedback: `duplicate receipt ${audit.duplicateReceiptId}`, evidenceId: null,
    creditMicros, elapsedMs: Date.now() - started, hiddenPass: false, manualOwnerFixes: 0 };
  if (creditMicros > A_TASK_CREDIT_CAP_MICROS) return { taskId: task.taskId, receipts, outcome: 'fail', classification: 'model', source: receiptSource(receipts.at(-1)), feedback: 'A credit cap exceeded', evidenceId: null,
    creditMicros, elapsedMs: Date.now() - started, hiddenPass: false, manualOwnerFixes: 0 };
  const critic = receipts.find(receipt => receipt.criticApproved !== undefined);
  if (critic?.status === 'completed' && critic.criticApproved === false) return { taskId: task.taskId, receipts, outcome: 'fail', classification: 'model', source: '', feedback: 'critic rejected the plan', evidenceId: null,
    creditMicros, elapsedMs: Date.now() - started, hiddenPass: false, manualOwnerFixes: 0 };
  const failed = receipts.find(receipt => receipt.status !== 'completed');
  if (failed) return { taskId: task.taskId, receipts, outcome: 'fail', classification: stageFailure(failed), source: receiptSource(receipts.at(-1)), feedback: failed.error ?? '', evidenceId: null,
    creditMicros, elapsedMs: Date.now() - started, hiddenPass: false, manualOwnerFixes: 0 };
  const source = receiptSource(receipts[2]!);
  if (!source) return { taskId: task.taskId, receipts, outcome: 'fail', classification: 'model', source, feedback: 'executor returned no source', evidenceId: null,
    creditMicros, elapsedMs: Date.now() - started, hiddenPass: false, manualOwnerFixes: 0 };
  const verified = verifyResult(await options.verifier.verify({ arm: 'A', task, source, lock: options.lock }));
  return { taskId: task.taskId, receipts, outcome: verified.outcome, classification: verified.outcome === 'pass' ? null : classifyUnityComparisonFailure(verified.feedback, verified.outcome), source, feedback: verified.feedback,
    evidenceId: verified.evidenceId, creditMicros, elapsedMs: Date.now() - started, hiddenPass: verified.hiddenPass, manualOwnerFixes: verified.manualOwnerFixes };
}

async function runB(task: UnityTaskManifest, a: ATaskResult, options: UnityComparisonOptions, audit: ReceiptAudit): Promise<ComparisonTaskResult> {
  if (a.classification !== 'model') return { taskId: task.taskId, outcome: a.outcome, classification: a.classification, receipts: a.receipts, creditMicros: a.creditMicros,
    elapsedMs: a.elapsedMs, hiddenPass: a.hiddenPass, manualOwnerFixes: a.manualOwnerFixes, evidenceId: a.evidenceId, reusedAResult: true };
  const started = Date.now(), repairs: ComparisonReceipt[] = [];
  let source = a.source, feedback = a.feedback;
  for (const attempt of [1, 2] as const) {
    const spent = usageMicros([...a.receipts, ...repairs]);
    if (spent === null) throw Error('UNITY_COMPARISON_UNKNOWN_USAGE');
    const repair = await options.model.repairB({ task, a, attempt, previousSource: source, feedback, maxCreditMicros: B_TASK_CUMULATIVE_CREDIT_CAP_MICROS - spent, lock: options.lock });
    if (repair.model !== 'gpt-5.6-terra' || repair.artifact === undefined) throw Error('UNITY_COMPARISON_B_ROLE_RECEIPT_INVALID');
    repairs.push(repair);
    const receipts = [...a.receipts, ...repairs], creditMicros = usageMicros(receipts);
    if (creditMicros === null) return { taskId: task.taskId, outcome: 'unknown', classification: 'unknown', receipts, creditMicros: null,
      elapsedMs: Date.now() - started + a.elapsedMs, hiddenPass: a.hiddenPass, manualOwnerFixes: a.manualOwnerFixes, evidenceId: null, reusedAResult: false };
    if (!recordReceipt(audit, repair)) return { taskId: task.taskId, outcome: 'unknown', classification: 'unknown', receipts, creditMicros,
      elapsedMs: Date.now() - started + a.elapsedMs, hiddenPass: a.hiddenPass, manualOwnerFixes: a.manualOwnerFixes, evidenceId: null, reusedAResult: false };
    if (creditMicros > B_TASK_CUMULATIVE_CREDIT_CAP_MICROS) return { taskId: task.taskId, outcome: 'fail', classification: 'model', receipts, creditMicros,
      elapsedMs: Date.now() - started + a.elapsedMs, hiddenPass: a.hiddenPass, manualOwnerFixes: a.manualOwnerFixes, evidenceId: null, reusedAResult: false };
    if (repair.status !== 'completed' || !receiptSource(repair)) return { taskId: task.taskId, outcome: 'fail', classification: stageFailure(repair) ?? 'model', receipts, creditMicros,
      elapsedMs: Date.now() - started + a.elapsedMs, hiddenPass: a.hiddenPass, manualOwnerFixes: a.manualOwnerFixes, evidenceId: null, reusedAResult: false };
    source = receiptSource(repair);
    const verified = verifyResult(await options.verifier.verify({ arm: 'B', task, source, lock: options.lock }));
    if (verified.outcome === 'pass' || classifyUnityComparisonFailure(verified.feedback, verified.outcome) !== 'model' || attempt === 2) return { taskId: task.taskId, outcome: verified.outcome,
      classification: verified.outcome === 'pass' ? null : classifyUnityComparisonFailure(verified.feedback, verified.outcome), receipts, creditMicros, elapsedMs: Date.now() - started + a.elapsedMs,
      hiddenPass: verified.hiddenPass, manualOwnerFixes: verified.manualOwnerFixes, evidenceId: verified.evidenceId, reusedAResult: false };
    feedback = verified.feedback;
  }
  throw Error('UNITY_COMPARISON_B_REPAIR_LOOP');
}

function validCExecutor(c: ToolEnabledUnityCodexExecutor | undefined, lock: UnityComparisonProtocolLock): c is ToolEnabledUnityCodexExecutor {
  return c?.kind === 'ordinary-codex' && c.model === 'gpt-5.6-terra' && c.toolEnabled === true
    && c.unityCliPermissionsDigest === lock.unityCliPermissionsDigest && c.skillsDigest === lock.skillsDigest;
}

async function runC(task: UnityTaskManifest, executor: ToolEnabledUnityCodexExecutor, options: UnityComparisonOptions, audit: ReceiptAudit): Promise<ComparisonTaskResult> {
  const started = Date.now(), receipt = await executor.runCToolEnabled({ task, maxCreditMicros: B_TASK_CUMULATIVE_CREDIT_CAP_MICROS, lock: options.lock });
  if (receipt.model !== 'gpt-5.6-terra' || receipt.artifact === undefined) throw Error('UNITY_COMPARISON_C_ROLE_RECEIPT_INVALID');
  if (!receipt.toolProofRefs.length || receipt.toolProofRefs.some(ref => !ref.trim())) throw Error('UNITY_COMPARISON_C_TOOL_PROOF_REQUIRED');
  const creditMicros = usageMicros([receipt]);
  if (creditMicros === null) return { taskId: task.taskId, outcome: 'unknown', classification: 'unknown', receipts: [receipt], creditMicros: null,
    elapsedMs: Date.now() - started, hiddenPass: false, manualOwnerFixes: 0, evidenceId: null, reusedAResult: false };
  if (!recordReceipt(audit, receipt)) return { taskId: task.taskId, outcome: 'unknown', classification: 'unknown', receipts: [receipt], creditMicros,
    elapsedMs: Date.now() - started, hiddenPass: false, manualOwnerFixes: 0, evidenceId: null, reusedAResult: false };
  if (creditMicros > B_TASK_CUMULATIVE_CREDIT_CAP_MICROS) return { taskId: task.taskId, outcome: 'fail', classification: 'model', receipts: [receipt], creditMicros,
    elapsedMs: Date.now() - started, hiddenPass: false, manualOwnerFixes: 0, evidenceId: null, reusedAResult: false };
  if (receipt.status !== 'completed' || !receiptSource(receipt)) return { taskId: task.taskId, outcome: 'fail', classification: stageFailure(receipt) ?? 'model', receipts: [receipt], creditMicros,
    elapsedMs: Date.now() - started, hiddenPass: false, manualOwnerFixes: 0, evidenceId: null, reusedAResult: false };
  const verified = verifyResult(await options.verifier.verify({ arm: 'C', task, source: receiptSource(receipt), lock: options.lock }));
  return { taskId: task.taskId, outcome: verified.outcome, classification: verified.outcome === 'pass' ? null : classifyUnityComparisonFailure(verified.feedback, verified.outcome), receipts: [receipt], creditMicros,
    elapsedMs: Date.now() - started, hiddenPass: verified.hiddenPass, manualOwnerFixes: verified.manualOwnerFixes, evidenceId: verified.evidenceId, reusedAResult: false };
}

function aggregate(rows: readonly ComparisonTaskResult[] | readonly ATaskResult[]) {
  return { passes: rows.filter(row => row.outcome === 'pass').length, hiddenPassTasks: rows.filter(row => row.hiddenPass).length,
    manualOwnerFixes: rows.reduce((total, row) => total + row.manualOwnerFixes, 0), creditMicros: sumMicros(rows), elapsedMs: sumNumber(rows) };
}

export function decideUnityComparison(b: ReturnType<typeof aggregate>, c: ReturnType<typeof aggregate>) {
  if (b.creditMicros === null || c.creditMicros === null) throw Error('UNITY_COMPARISON_UNKNOWN_USAGE');
  const keepB = (b.hiddenPassTasks >= c.hiddenPassTasks + 2 || (b.hiddenPassTasks === c.hiddenPassTasks && b.manualOwnerFixes < c.manualOwnerFixes)) && b.creditMicros <= 2 * c.creditMicros;
  if (keepB) return { decision: 'keep-B' as const, batch2: null };
  if (c.hiddenPassTasks >= b.hiddenPassTasks) return { decision: 'batch2-separate-approval-required' as const,
    batch2: { featureTasks: 4, multiSessionTasks: 2, instruction: 'run-feature-and-multi-session-comparison', approvalRequired: true as const } };
  return { decision: 'inconclusive-owner-review' as const, batch2: null };
}

/** Executes the locked A → B → C comparison. There is intentionally no native JSON-only C fallback. */
export async function runUnityComparison(options: UnityComparisonOptions) {
  validateAdmission(options);
  if (options.mode === 'live' && !validCExecutor(options.cExecutor, options.lock)) throw Error('UNITY_COMPARISON_C_TOOL_TRANSPORT_REQUIRED');
  const a: ATaskResult[] = [], audit: ReceiptAudit = { seen: new Set(), duplicateReceiptId: null };
  for (const task of options.tasks) {
    const result = await runA(task, options, audit); a.push(result); options.onResult?.('A', result);
    if (result.creditMicros === null) return { schemaVersion: 'unity-comparison/1' as const, lock: options.lock, forecast: UNITY_COMPARISON_FORECAST, a, b: [] as ComparisonTaskResult[], c: [] as ComparisonTaskResult[],
      stoppedReason: 'unknown-usage' as const, infrastructureFailures: 0, decision: null, summary: { a: aggregate(a), b: null, c: null } };
    if (audit.duplicateReceiptId !== null || result.creditMicros > A_TASK_CREDIT_CAP_MICROS || options.shouldStop?.('A', result)) return { schemaVersion: 'unity-comparison/1' as const, lock: options.lock, forecast: UNITY_COMPARISON_FORECAST, a, b: [] as ComparisonTaskResult[], c: [] as ComparisonTaskResult[],
      stoppedReason: audit.duplicateReceiptId !== null ? 'duplicate-receipt' as const : result.creditMicros > A_TASK_CREDIT_CAP_MICROS ? 'credit-cap' as const : 'quota-stop' as const, infrastructureFailures: a.filter(row => row.classification === 'infrastructure').length, decision: null, summary: { a: aggregate(a), b: null, c: null } };
    if (a.filter(row => row.classification === 'infrastructure').length >= 2) return { schemaVersion: 'unity-comparison/1' as const, lock: options.lock, forecast: UNITY_COMPARISON_FORECAST, a, b: [] as ComparisonTaskResult[], c: [] as ComparisonTaskResult[],
      stoppedReason: 'a-infrastructure-failures' as const, infrastructureFailures: 2, decision: null, summary: { a: aggregate(a), b: null, c: null } };
  }
  const infrastructureFailures = a.filter(row => row.classification === 'infrastructure').length;
  if (infrastructureFailures >= 2) return { schemaVersion: 'unity-comparison/1' as const, lock: options.lock, forecast: UNITY_COMPARISON_FORECAST, a, b: [] as ComparisonTaskResult[], c: [] as ComparisonTaskResult[],
    stoppedReason: 'a-infrastructure-failures' as const, infrastructureFailures, decision: null, summary: { a: aggregate(a), b: null, c: null } };
  const b: ComparisonTaskResult[] = [];
  for (const task of options.tasks) {
    const result = await runB(task, a.find(row => row.taskId === task.taskId)!, options, audit); b.push(result); options.onResult?.('B', result);
    if (result.creditMicros === null) return { schemaVersion: 'unity-comparison/1' as const, lock: options.lock, forecast: UNITY_COMPARISON_FORECAST, a, b, c: [] as ComparisonTaskResult[],
      stoppedReason: 'unknown-usage' as const, infrastructureFailures, decision: null, summary: { a: aggregate(a), b: aggregate(b), c: null } };
    if (audit.duplicateReceiptId !== null || result.creditMicros > B_TASK_CUMULATIVE_CREDIT_CAP_MICROS || options.shouldStop?.('B', result)) return { schemaVersion: 'unity-comparison/1' as const, lock: options.lock, forecast: UNITY_COMPARISON_FORECAST, a, b, c: [] as ComparisonTaskResult[],
      stoppedReason: audit.duplicateReceiptId !== null ? 'duplicate-receipt' as const : result.creditMicros > B_TASK_CUMULATIVE_CREDIT_CAP_MICROS ? 'credit-cap' as const : 'quota-stop' as const, infrastructureFailures, decision: null, summary: { a: aggregate(a), b: aggregate(b), c: null } };
  }
  if (!validCExecutor(options.cExecutor, options.lock)) return { schemaVersion: 'unity-comparison/1' as const, lock: options.lock, forecast: UNITY_COMPARISON_FORECAST, a, b, c: [] as ComparisonTaskResult[],
    stoppedReason: 'c-tool-transport-unavailable' as const, infrastructureFailures, decision: null, summary: { a: aggregate(a), b: aggregate(b), c: null } };
  const c: ComparisonTaskResult[] = [];
  for (const task of options.tasks) {
    const result = await runC(task, options.cExecutor, options, audit); c.push(result); options.onResult?.('C', result);
    if (result.creditMicros === null) return { schemaVersion: 'unity-comparison/1' as const, lock: options.lock, forecast: UNITY_COMPARISON_FORECAST, a, b, c,
      stoppedReason: 'unknown-usage' as const, infrastructureFailures, decision: null, summary: { a: aggregate(a), b: aggregate(b), c: aggregate(c) } };
    if (audit.duplicateReceiptId !== null || result.creditMicros > B_TASK_CUMULATIVE_CREDIT_CAP_MICROS || options.shouldStop?.('C', result)) return { schemaVersion: 'unity-comparison/1' as const, lock: options.lock, forecast: UNITY_COMPARISON_FORECAST, a, b, c,
      stoppedReason: audit.duplicateReceiptId !== null ? 'duplicate-receipt' as const : result.creditMicros > B_TASK_CUMULATIVE_CREDIT_CAP_MICROS ? 'credit-cap' as const : 'quota-stop' as const, infrastructureFailures, decision: null, summary: { a: aggregate(a), b: aggregate(b), c: aggregate(c) } };
  }
  const bSummary = aggregate(b), cSummary = aggregate(c);
  return { schemaVersion: 'unity-comparison/1' as const, lock: options.lock, forecast: UNITY_COMPARISON_FORECAST, a, b, c, stoppedReason: null, infrastructureFailures,
    decision: decideUnityComparison(bSummary, cSummary), summary: { a: aggregate(a), b: bSummary, c: cSummary } };
}
