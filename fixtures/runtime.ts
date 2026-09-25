import { digest } from '../src/contracts/canonical.js';
import { PersistentWorkflowRunner, type RunRequest, type RuntimeConfig } from '../src/runtime/runner.js';
import { createRuntimeEvaluationFixture } from './runtime-authority.js';

/** Explicit demo/test authority installation, never selected by candidate input. */
export function runtimeFixture(runId = 'fixture-run') {
  const fixture = createRuntimeEvaluationFixture(new Date().toISOString());
  const config: RuntimeConfig = { schemaVersion: 'runtime-config/1', authority: fixture.authority,
    policyReleaseId: fixture.policy.releaseId, ...PersistentWorkflowRunner.implementationPins(),
    environmentDigest: digest({ node: process.version, platform: process.platform, arch: process.arch, adapter: 'fixture/1' }),
    limits: { maxDispatches: 4, maxAttemptsPerOperation: 2, maxReplans: 1, maxPlannerAttempts: 6, timeoutMs: 3000 } };
  const request: RunRequest = { runId, records: fixture.records, operations: [{ operationId: `${runId}:write`, stepId: fixture.records.plan.subplans[0]!.steps[0]!.stepId,
    target: 'src/result.txt', content: 'AI Agent Architect: verified local fixture.\n' }] };
  return { config, request, fixture };
}
