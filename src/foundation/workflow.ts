import type { ContractMap, PlanPackage, TaskSpec, ToolCall, ToolResult } from '../contracts/schemas.js';
import { parseContract } from '../contracts/schemas.js';
import { auditContractBundle, type AuditAuthority, type ConformanceReport } from './audit.js';

export interface ModelAdapter { plan(task: TaskSpec): Promise<PlanPackage> }
export interface ToolAdapter { inspect(call: ToolCall): Promise<ToolResult> }
export interface EvalHarness { audit(bundle: unknown, authority: AuditAuthority): ConformanceReport }
export interface WorkflowRequest { bundle: ContractMap; authority: AuditAuthority }
export interface WorkflowResult {
  mode: 'offline-fixture';
  steps: string[];
  conformance: ConformanceReport;
  dispatchAuthorized: false;
}
export interface WorkflowRunner { run(request: WorkflowRequest): Promise<WorkflowResult> }

export const contractEvalHarness: EvalHarness = { audit: auditContractBundle };

/** Bounded bootstrap smoke only. This is not a persistent scheduler or production runner. */
export class MockWorkflowRunner implements WorkflowRunner {
  constructor(private readonly model: ModelAdapter, private readonly tool: ToolAdapter,
    private readonly evaluator: EvalHarness = contractEvalHarness) {}

  async run(request: WorkflowRequest): Promise<WorkflowResult> {
    const preflight = this.evaluator.audit(request.bundle, request.authority);
    if (!preflight.valid) return { mode: 'offline-fixture', steps: ['contract-preflight-failed'], conformance: preflight, dispatchAuthorized: false };
    const bundle = structuredClone(request.bundle);
    const plan = parseContract('PlanPackage', await this.model.plan(structuredClone(bundle.TaskSpec)));
    bundle.PlanPackage = plan;
    const afterPlan = this.evaluator.audit(bundle, request.authority);
    if (!afterPlan.valid) return { mode: 'offline-fixture', steps: ['contract-preflight', 'fake-plan', 'plan-binding-failed'], conformance: afterPlan, dispatchAuthorized: false };
    if (bundle.ToolCall.recoveryMode !== 'readOnly') throw new Error('Mock workflow only accepts read-only fixture operations');
    bundle.ToolResult = parseContract('ToolResult', await this.tool.inspect(structuredClone(bundle.ToolCall)));
    return { mode: 'offline-fixture', steps: ['contract-preflight', 'fake-plan', 'fake-read-only-inspection', 'contract-audit'],
      conformance: this.evaluator.audit(bundle, request.authority), dispatchAuthorized: false };
  }
}

/** Fixed results make the smoke reproducible. No subprocess, network, model or Unity call. */
export function createFixtureWorkflow(bundle: ContractMap): WorkflowRunner {
  const expected = structuredClone(bundle);
  return new MockWorkflowRunner(
    { async plan(task) {
      if (task.taskId !== expected.TaskSpec.taskId) throw new Error('Unexpected fixture task');
      return structuredClone(expected.PlanPackage);
    } },
    { async inspect(call) {
      if (call.operationId !== expected.ToolCall.operationId || call.argumentsHash !== expected.ToolCall.argumentsHash) throw new Error('Unexpected fixture operation');
      return structuredClone(expected.ToolResult);
    } },
  );
}
