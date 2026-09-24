import { createHash } from 'node:crypto';
import { digest, digestOmitting } from '../src/contracts/canonical.js';
import { SCHEMA_VERSION, type ContractMap } from '../src/contracts/schemas.js';
import { currentGateInputs } from '../src/foundation/audit.js';

/** Entirely synthetic data: an active fixture is NOT an activated runtime policy. */
export type FixtureFactory = () => ContractMap;
const now = '2026-09-24T09:00:00.000Z';
const hash = digest('synthetic-fixture');
const schemaVersion = SCHEMA_VERSION;

/** Recompute linked digest fields only. Semantic ID/scope relationships remain testable. */
export function resealContractFixtures(fixtures: ContractMap): ContractMap {
  for (const constraint of fixtures.TaskSpec.constraints) constraint.contentHash = digest(constraint.description);
  fixtures.ContextManifest.taskSpecDigest = digest(fixtures.TaskSpec);
  fixtures.PlanPackage.hash = digestOmitting(fixtures.PlanPackage, 'hash');
  const checkSetDigest = digest([fixtures.CheckDefinition]);
  fixtures.PolicyRelease.checkSetDigest = checkSetDigest;
  fixtures.ToolCall.argumentsHash = digest(fixtures.ToolCall.arguments);
  fixtures.OperationRecord.argumentsHash = fixtures.ToolCall.argumentsHash;
  fixtures.CheckResult.definitionDigest = digest(fixtures.CheckDefinition);
  fixtures.CheckResult.subjectDigest = fixtures.PlanPackage.hash;
  fixtures.Evidence.subjectDigest = fixtures.PlanPackage.hash;
  fixtures.Evidence.checkSetDigest = checkSetDigest;
  fixtures.RunnerAttestation.subjectDigest = fixtures.PlanPackage.hash;
  fixtures.RunnerAttestation.checkSetDigest = checkSetDigest;
  for (const binding of fixtures.ContextManifest.evidenceBindings) {
    if (binding.evidenceId === fixtures.Evidence.evidenceId) binding.contentHash = digest(fixtures.Evidence);
  }
  fixtures.ContextManifest.manifestDigest = digestOmitting(fixtures.ContextManifest, 'manifestDigest');
  fixtures.ContextBundle.manifestDigest = fixtures.ContextManifest.manifestDigest;
  for (const item of fixtures.ContextBundle.evidenceItems) {
    if (item.evidenceId === fixtures.Evidence.evidenceId) item.contentHash = digest(fixtures.Evidence);
  }
  fixtures.GateReport.artifactHash = fixtures.PlanPackage.hash;
  fixtures.GateReport.checkResults = [structuredClone(fixtures.CheckResult)];
  fixtures.HandoffPacket.approvedArtifact.hash = fixtures.PlanPackage.hash;
  fixtures.HandoffPacket.contextManifestDigest = fixtures.ContextManifest.manifestDigest;
  fixtures.SkillDescriptor.contentDigest = digest(fixtures.SkillDescriptor.resources);
  fixtures.SkillBinding.descriptorDigest = digest(fixtures.SkillDescriptor);
  fixtures.SkillBinding.projectProfileDigest = digest(fixtures.ProjectProfile);
  fixtures.SkillBinding.artifactHash = fixtures.PlanPackage.hash;
  fixtures.SkillBinding.contextManifestDigest = fixtures.ContextManifest.manifestDigest;
  const currentInputs = currentGateInputs(fixtures);
  for (const entry of [...fixtures.GateReport.inputVersions, ...fixtures.HandoffPacket.sourceVersions]) {
    const current = currentInputs.find(x => x.ref === entry.ref);
    if (current) entry.digest = current.digest;
  }
  return fixtures;
}

export const createContractFixtures: FixtureFactory = () => {
  const scope = { repoId: 'fixture-repo', allowedPaths: ['src'], taskClasses: ['fixture.inspect'] };
  const applicability = { taskClasses: ['fixture.inspect'], required: true, reason: 'Required by the synthetic fixture' };
  const budget: ContractMap['ContextBudget'] = {
    schemaVersion, modelConfigVersion: 'fixture-model-config-v1', inputLimit: 8000,
    outputReserve: 1000, headroom: 500,
    tokenAccountingPolicy: { version: 'v1', tokenizer: 'fixture-tokenizer', includeToolOutputs: true },
    taskSpendLimit: { amount: 1, currency: 'USD' },
  };
  const spent: ContractMap['Checkpoint']['budgetSpent'] = { tokens: null, cost: null, currency: 'USD', status: 'unknown', sourceRef: null };
  const constraint = {
    id: 'constraint-1', description: 'Only inspect the synthetic src fixture.', sourceRevision: 'fixture-revision-1',
    contentHash: digest('Only inspect the synthetic src fixture.'), applicability,
  };
  const planStep: ContractMap['PlanStep'] = {
    schemaVersion, stepId: 'step-1', dependsOn: [], capability: 'inspect_fixture',
    inputs: ['fixture-source'], outputs: ['fixture-report'], allowedTools: ['fixture-inspector'],
    verificationChecks: ['check-1'], stopCondition: 'Stop if the fixture is unavailable or any check is not PASS.',
  };
  const subplan: ContractMap['SubPlan'] = {
    schemaVersion, planId: 'subplan-1', scope, requirementRefs: ['ac-1'], contracts: [],
    dependencies: [], evidenceRefs: ['evidence-1'], unresolvedItems: [], steps: [planStep],
  };
  const check: ContractMap['CheckDefinition'] = {
    schemaVersion, checkId: 'check-1', version: 'v1', requirementRefs: ['ac-1'], method: 'deterministic',
    verifierVersion: 'fixture-verifier-v1', requiredEvidenceKinds: ['test-report'], critical: true,
    applicability, validatorRef: 'fixture-validator',
  };
  const checkResult: ContractMap['CheckResult'] = {
    schemaVersion, checkId: 'check-1', definitionDigest: hash, method: 'deterministic',
    verifierVersion: 'fixture-verifier-v1', validatorRef: 'fixture-validator', subjectDigest: hash,
    evidenceRefs: ['evidence-1'], outcome: 'pass', producedBy: 'fixture-runner', producedAt: now,
  };
  const claim: ContractMap['Claim'] = {
    schemaVersion, claimId: 'claim-1', statement: 'The fixture is a synthetic source, not an executed Unity project.',
    assertionType: 'observed', sourceRefs: ['source-1'], applicableScope: scope, evidenceStatus: 'unverified',
    lifecycle: 'proposed', freshness: 'unknown', promotionEvidenceRefs: [], dependentRefs: [],
  };
  const bodyHash = `sha256:${createHash('sha256').update('# Synthetic fixture skill\nRead the fixture.\n').digest('hex')}`;
  const resources: ContractMap['SkillDescriptor']['resources'] = [{ path: 'SKILL.md', kind: 'body', contentHash: bodyHash }];
  const inputVersions = [
    { ref: 'task-1', version: 'fixture-revision-1', digest: hash },
    { ref: 'manifest-1', version: 'fixture-context-v1', digest: hash },
    { ref: 'plan-1', version: '1', digest: hash },
    { ref: 'skill:fixture.inspect', version: '1.0.0', digest: hash },
    { ref: 'profile-1', version: schemaVersion, digest: hash },
    { ref: 'binding-1', version: schemaVersion, digest: hash },
    { ref: 'environment:fixture-repo', version: schemaVersion, digest: hash },
  ];
  const fixtures: ContractMap = {
    ContextBudget: budget,
    TaskSpec: {
      schemaVersion, taskId: 'task-1', taskClass: 'fixture.inspect', goal: 'Inspect a synthetic fixture',
      acceptanceCriteria: [{ criterionId: 'ac-1', description: 'The expected fixture is inspected.', checkRefs: ['check-1'] }],
      repoId: 'fixture-repo', baseRevision: 'fixture-revision-1', allowedPaths: ['src'], constraints: [constraint], budget,
    },
    ContextManifest: {
      schemaVersion, manifestId: 'manifest-1', manifestDigest: hash, taskSpecDigest: hash,
      role: 'executor', scope,
      constraintBindings: [{ id: constraint.id, sourceRevision: constraint.sourceRevision, contentHash: constraint.contentHash, applicability }],
      evidenceBindings: [{ evidenceId: 'evidence-1', sourceRevision: 'fixture-revision-1', contentHash: hash }],
      contextPolicyVersion: 'fixture-context-v1', modelConfigVersion: 'fixture-model-config-v1', budgetReportRef: 'fixture-budget-report',
    },
    ContextBundle: {
      schemaVersion, bundleId: 'bundle-1', taskId: 'task-1', snapshotId: 'snapshot-1', memoryVersion: 'memory-v1',
      manifestRef: 'manifest-1', manifestDigest: hash,
      evidenceItems: [{ evidenceId: 'evidence-1', contentHash: hash, sourceRef: 'source-1' }],
      unknowns: [], excludedItems: [], tokenCount: 128,
    },
    PlanStep: planStep,
    SubPlan: subplan,
    PlanPackage: {
      schemaVersion, planId: 'plan-1', version: 1, hash, subplans: [subplan], integrationContracts: [],
      requirementCoverage: [{ requirementRef: 'ac-1', stepRefs: ['step-1'], checkRefs: ['check-1'] }],
      assumptions: [], risks: [], planningModeDecisionRef: 'mode-1',
    },
    ToolCall: {
      schemaVersion, callId: 'call-1', operationId: 'operation-1', attemptId: 'attempt-1', runId: 'run-1', stepId: 'step-1',
      capability: 'inspect_fixture', toolRef: 'fixture-inspector', implementationDigest: digest('fixture-inspector-v1'), targetProjectId: 'fixture-repo',
      toolVersion: 'fixture-inspector-v1', arguments: { path: 'src' }, argumentsHash: hash, idempotencyKey: 'operation-1',
      expectedWorkspaceDigest: digest('fixture-workspace'), recoveryMode: 'readOnly', timeoutMs: 1000,
      permissionScope: { allowedPaths: ['src'], allowedCommands: ['fixture-inspector'], networkDestinations: [] },
    },
    ToolResult: {
      schemaVersion, callId: 'call-1', operationId: 'operation-1', attemptId: 'attempt-1', status: 'succeeded',
      startedAt: now, finishedAt: now, exitCode: 0, receiptRef: 'receipt-1', postconditionRefs: ['postcondition-1'],
      artifacts: [{ artifactId: 'fixture-report', uri: 'fixture://report', hash, kind: 'test-report' }], errors: [],
      workspaceSnapshot: { snapshotId: 'snapshot-1', digest: digest('fixture-workspace') },
    },
    CheckDefinition: check,
    CheckResult: checkResult,
    PolicyRelease: {
      schemaVersion, releaseId: 'policy-1', version: 'v1', checkMethods: ['deterministic'], modelVersion: null, promptHash: null,
      modelNotApplicableReason: 'Synthetic deterministic fixture; no model was invoked.', fixtureEvidenceRefs: ['evidence-1'],
      checkSetDigest: hash, configHash: digest('fixture-policy-config'), rubricVersion: 'fixture-rubric-v1',
      datasetSplitHash: digest('fixture-split'), humanLabelSetRef: 'fixture-labels',
      metricsByFailureClass: [{ failureClass: 'synthetic', truePositive: 1, trueNegative: 1, falsePositive: 0, falseNegative: 0, trials: 2, firstAttemptSuccesses: 2, wholeWorkflowSuccesses: 2 }],
      uncertaintyReportRef: 'fixture-uncertainty', permittedTaskClasses: ['fixture.inspect'],
      riskTargets: [{ failureClass: 'synthetic', maxFalseAcceptRate: 0.1, confidence: 0.95 }],
      releaseCriteria: [{ criterionId: 'release-criterion-1', description: 'Synthetic schema fixture only.', checkRef: 'check-1' }],
      ownerId: 'fixture-policy-owner', approvedBy: 'fixture-policy-owner', status: 'active', activatedAt: now,
    },
    PlanningModeDecision: {
      schemaVersion, decisionId: 'mode-1', taskClass: 'fixture.inspect', mode: 'single+critic',
      decompositionEvidence: ['evidence-1'], sharedInvariants: ['constraint-1'], dependencies: [], fanOut: 1,
      budget, benchmarkProfileRef: 'fixture-benchmark', policyReleaseId: 'policy-1',
    },
    GateReport: {
      schemaVersion, gateReportId: 'gate-1', artifactHash: hash, rubricVersion: 'fixture-rubric-v1', policyReleaseId: 'policy-1',
      inputVersions,
      checkResults: [checkResult], dimensionScores: [{ dimension: 'synthetic', score: 1, maximum: 1 }],
      evidenceRefs: ['evidence-1'], defects: [], verdict: 'PASS', issuerId: 'fixture-gate-controller', issuedAt: now,
    },
    HandoffPacket: {
      schemaVersion, handoffId: 'handoff-1', approvedArtifact: { artifactRef: 'plan-1', hash }, gateReportRef: 'gate-1',
      sourceVersions: structuredClone(inputVersions),
      contextManifestRef: 'manifest-1', contextManifestDigest: hash, allowedScope: scope, downstreamAcceptance: ['ac-1'],
    },
    Claim: {
      ...claim, lifecycle: 'approved', evidenceStatus: 'supported', freshness: 'fresh',
      reviewRef: 'fixture-memory-review', approvedBy: 'fixture-memory-promoter', promotionEvidenceRefs: ['evidence-1'],
    },
    SourceRecord: {
      schemaVersion, sourceId: 'source-1', sourceType: 'document', sourceRef: 'fixture://source',
      sourceRevision: 'fixture-revision-1', contentDigest: digest(constraint.description), observedAt: now,
      freshnessPolicy: 'pinned', freshness: 'fresh',
    },
    MemoryDelta: {
      schemaVersion, deltaId: 'delta-1', sourceEvidenceIds: ['evidence-1'], expectedMemoryVersion: 'memory-v1',
      claimsAdded: [claim], claimsSuperseded: [], claimsQuarantined: [], claimsRevoked: [],
      affectedPages: ['fixture-wiki'], promotionReviewRef: 'fixture-pending-review',
    },
    Evidence: {
      schemaVersion, evidenceId: 'evidence-1', runId: 'run-1', checkId: 'check-1', kind: 'test-report', subjectDigest: hash,
      checkSetDigest: hash, runnerAttestationRef: 'attestation-1', toolVersion: 'fixture-inspector-v1',
      environmentDigest: digest('fixture-environment'), outcome: 'pass', artifactUri: 'fixture://report', artifactHash: hash,
    },
    OperationRecord: {
      schemaVersion, operationId: 'operation-1', runId: 'run-1', stepId: 'step-1', argumentsHash: hash,
      recoveryMode: 'readOnly', expectedWorkspaceDigest: digest('fixture-workspace'), state: 'COMMITTED',
      attempts: [{ attemptId: 'attempt-1', callId: 'call-1', startedAt: now, finishedAt: now, status: 'succeeded', resultRef: 'call-1' }],
      receiptRef: 'receipt-1', postconditionRefs: ['postcondition-1'], resultRef: 'call-1', budgetSpent: spent,
    },
    OwnershipRecord: {
      schemaVersion, resourceId: 'fixture-repo', ownerRunId: 'run-1', ownerEpoch: 1,
      processIdentity: { hostId: 'fixture-host', pid: 1, startedAt: now }, acquiredAt: now, lastHeartbeatAt: now, state: 'owned',
    },
    Checkpoint: {
      schemaVersion, checkpointId: 'checkpoint-1', workflowDefinitionVersion: 'fixture-workflow-v1', runId: 'run-1', branchId: 'branch-1',
      completedNodeIds: ['step-1'], pendingNodeIds: [], contextBundleRefs: ['bundle-1'], planPackageRefs: ['plan-1'],
      invocationReceiptRefs: ['receipt-1'], promptConfigHashes: [], budgetSpent: spent, operationLedgerCursor: 1, createdAt: now,
    },
    RunnerAttestation: {
      schemaVersion, attestationId: 'attestation-1', runnerId: 'fixture-runner', principalId: 'fixture-runner-principal', runnerVersion: 'fixture-runner-v1',
      configDigest: digest('fixture-runner-config'), checkSetDigest: hash, environmentDigest: digest('fixture-environment'),
      subjectDigest: hash, operationId: 'operation-1', evidenceRefs: ['evidence-1'], issuedAt: now,
    },
    ProjectProfile: {
      schemaVersion, profileId: 'profile-1', repoId: 'fixture-repo', profileKind: 'observed',
      editorVersion: '6000.0.0f1', operatingSystem: 'macos', buildTarget: 'StandaloneOSX',
      packageLockDigest: digest('fixture-packages'), packages: [{ name: 'com.unity.test-framework', version: '1.1.33' }],
      renderPipeline: 'built-in', uiSystem: 'ugui', inputSystem: 'legacy', codeRoots: ['src'], assetRoots: ['Assets'], unknowns: [],
    },
    SkillDescriptor: {
      schemaVersion, skillId: 'fixture.inspect', version: '1.0.0', name: 'Synthetic fixture inspection',
      source: { repository: 'https://example.invalid/fixture', revision: '0'.repeat(40), path: 'SKILL.md', license: 'MIT' },
      contentDigest: hash, resources, supportedTaskClasses: ['fixture.inspect'],
      compatibility: { editorVersions: ['6000.0.0f1'], operatingSystems: ['macos'], buildTargets: ['StandaloneOSX'], requiredPackages: [{ name: 'com.unity.test-framework', version: '1.1.33' }] },
      requiredCapabilities: ['inspect_fixture'], inputRefs: ['fixture-source'], outputRefs: ['fixture-report'], checkRefs: ['check-1'], lifecycle: 'released',
    },
    SkillBinding: {
      schemaVersion, bindingId: 'binding-1', taskId: 'task-1', planId: 'plan-1', artifactHash: hash,
      skillId: 'fixture.inspect', skillVersion: '1.0.0', descriptorDigest: hash, projectProfileDigest: hash,
      environmentDigest: digest('fixture-environment'), loadedResources: resources,
      capabilityBindings: [{ capability: 'inspect_fixture', implementationRef: 'fixture-inspector', implementationDigest: digest('fixture-inspector-v1'), targetProjectId: 'fixture-repo' }],
      contextManifestRef: 'manifest-1', contextManifestDigest: hash, certificationEvidenceRefs: ['evidence-1'], policyReleaseId: 'policy-1',
    },
  };
  return resealContractFixtures(structuredClone(fixtures));
};
