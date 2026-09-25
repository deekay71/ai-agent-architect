import { fileURLToPath } from 'node:url';
import { digest } from '../src/contracts/canonical.js';
import { PersistentWorkflowRunner, type RunRequest, type RuntimeConfig } from '../src/runtime/runner.js';
import { createRuntimeEvaluationFixture } from './runtime-authority.js';

export function recoveryCase(timeoutMs = 2000): { config: RuntimeConfig; request: RunRequest } {
  // A fixed past campaign clock is deterministic across restarts and precedes the live runtime clock.
  const fixture = createRuntimeEvaluationFixture('2026-09-24T09:00:00.000Z');
  return {
    config: { schemaVersion: 'runtime-config/1', authority: fixture.authority, policyReleaseId: fixture.policy.releaseId,
      ...PersistentWorkflowRunner.implementationPins(), environmentDigest: digest('local'),
      limits: { maxDispatches: 3, maxAttemptsPerOperation: 2, maxReplans: 1, maxPlannerAttempts: 6, timeoutMs } },
    request: { runId: 'run-recovery', records: fixture.records,
      operations: [{ operationId: 'op-recovery', stepId: fixture.records.plan.subplans[0]!.steps[0]!.stepId, target: 'src/output.txt', content: 'done' }] },
  };
}

const waitForever = (): Promise<never> => new Promise(() => { setInterval(() => {}, 1000); });
const write = (value: unknown): void => { process.stdout.write(JSON.stringify(value) + '\n'); };

async function main(): Promise<void> {
  const [workspace, control, action] = process.argv.slice(2);
  if (!workspace || !control || !action) throw new Error('CHILD_ARGUMENTS');
  const runner = new PersistentWorkflowRunner(workspace, control);
  const { config, request } = recoveryCase();
  try {
    if (action.startsWith('crash-') || action === 'submit-only' || action === 'branch-partial') {
      await runner.configure(config); await runner.submit(request);
    } else { await runner.recoverOwnership(); }
    if (action === 'submit-only') { write({ status: runner.status(request.runId) }); return; }
    if (action === 'branch-partial' || action === 'resume-branches') {
      const partial = action === 'branch-partial';
      const result = await runner.planBranches(request.runId, [
        { branchId: 'a', inputDigest: digest('input-a'), plan: async () => {
          if (!partial) throw new Error('COMMITTED_BRANCH_MUST_NOT_REPEAT');
          return { content: 'durable-branch-a' };
        } },
        { branchId: 'b', inputDigest: digest('input-b'), plan: async () => {
          if (!partial) return { content: 'resumed-branch-b' };
          const key = digest({ runId: request.runId, branchId: 'a' });
          while (!runner.store.read('branch', key)) await new Promise(resolve => setTimeout(resolve, 10));
          write({ ready: 'branch-partial', lockRoot: runner.lockRoot }); await waitForever();
        } },
      ]);
      write({ branches: result, status: runner.status(request.runId) }); return;
    }
    const crashEvent = action.startsWith('crash-') ? action.slice('crash-'.length) : null;
    const status = await runner.resume(request.runId, { observe: async event => {
      if (event === crashEvent) { write({ ready: event, lockRoot: runner.lockRoot }); await waitForever(); }
    } });
    write({ status });
  } finally { await runner.close(); }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(error => { process.stderr.write(`${error instanceof Error ? error.message : 'CHILD_FAILED'}\n`); process.exitCode = 1; });
}
