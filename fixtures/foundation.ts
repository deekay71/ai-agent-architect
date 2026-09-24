import { createContractFixtures } from './contracts.js';
import { type ContractMap } from '../src/contracts/schemas.js';
import { type AuditAuthority } from '../src/foundation/audit.js';
import { type Principal } from '../src/foundation/permissions.js';
import { digest } from '../src/contracts/canonical.js';

/** Authority fixtures are synthetic and separate from the mutable candidate bundle. */
export function createFoundationScenario(): { bundle: ContractMap; authority: AuditAuthority } {
  // Serialize once so each record behaves like an independently loaded store record,
  // rather than sharing nested object references with other fixture records.
  const bundle = JSON.parse(JSON.stringify(createContractFixtures())) as ContractMap;
  const principals: Principal[] = [
    { id: 'fixture-runner', role: 'verificationRunner', projectIds: [bundle.TaskSpec.repoId] },
    { id: bundle.RunnerAttestation.principalId, role: 'verificationRunner', projectIds: [bundle.TaskSpec.repoId] },
    { id: 'fixture-policy-owner', role: 'policyOwner', projectIds: [bundle.TaskSpec.repoId] },
    { id: 'fixture-gate-controller', role: 'gateController', projectIds: [bundle.TaskSpec.repoId] },
    { id: 'fixture-memory-promoter', role: 'memoryPromoter', projectIds: [bundle.TaskSpec.repoId] },
    { id: 'fixture-executor', role: 'executor', projectIds: [bundle.TaskSpec.repoId] },
    { id: 'fixture-critic', role: 'critic', projectIds: [bundle.TaskSpec.repoId] },
  ];
  const authority: AuditAuthority = structuredClone({
    projectId: bundle.TaskSpec.repoId, taskClass: bundle.TaskSpec.taskClass,
    baseRevision: bundle.TaskSpec.baseRevision, taskDigest: digest(bundle.TaskSpec), now: '2026-09-24T09:00:00.000Z',
    workspaceDigest: bundle.ToolCall.expectedWorkspaceDigest,
    environmentDigest: bundle.Evidence.environmentDigest,
    memoryVersion: bundle.ContextBundle.memoryVersion,
    workflowDefinitionVersion: bundle.Checkpoint.workflowDefinitionVersion,
    principals, constraints: bundle.TaskSpec.constraints, expectedInputs: bundle.GateReport.inputVersions,
    policies: [bundle.PolicyRelease], checks: [bundle.CheckDefinition], gateReports: [bundle.GateReport],
    approvedClaims: [bundle.Claim], evidence: [bundle.Evidence], attestations: [bundle.RunnerAttestation],
    sources: [bundle.SourceRecord], capabilities: bundle.SkillBinding.capabilityBindings,
    skillDescriptors: [bundle.SkillDescriptor], projectProfiles: [bundle.ProjectProfile], skillSelections: [bundle.SkillBinding],
    selectedSnapshotId: bundle.ContextBundle.snapshotId,
    snapshots: [{ snapshotId: bundle.ContextBundle.snapshotId, digest: bundle.ToolCall.expectedWorkspaceDigest,
      projectId: bundle.TaskSpec.repoId, sourceRevision: bundle.TaskSpec.baseRevision }],
    evidenceSources: [{ evidenceId: bundle.Evidence.evidenceId, sourceId: bundle.SourceRecord.sourceId, sourceRevision: bundle.SourceRecord.sourceRevision }],
    toolPolicies: [{ capability: bundle.ToolCall.capability, toolRef: bundle.ToolCall.toolRef,
      toolVersion: bundle.ToolCall.toolVersion, implementationDigest: bundle.ToolCall.implementationDigest,
      targetProjectId: bundle.ToolCall.targetProjectId, recoveryMode: bundle.ToolCall.recoveryMode,
      permissionScope: bundle.ToolCall.permissionScope, pathArgumentKeys: ['path'] }],
    workflowNodes: [{ nodeId: 'step-1', kind: 'planStep' as const, planStepRef: 'step-1' }],
    referenceRegistry: { contextBundleRefs: [bundle.ContextBundle.bundleId], planPackageRefs: [bundle.PlanPackage.planId],
      invocationReceiptRefs: [...bundle.Checkpoint.invocationReceiptRefs], checkpointRefs: [bundle.Checkpoint.checkpointId],
      branchIds: [bundle.Checkpoint.branchId], promptConfigHashes: [...bundle.Checkpoint.promptConfigHashes] },
    artifacts: { [bundle.Evidence.artifactUri]: { hash: bundle.Evidence.artifactHash, kind: bundle.Evidence.kind } },
  });
  return { bundle, authority };
}
