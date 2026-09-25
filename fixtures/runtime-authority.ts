import { createContractFixtures } from './contracts.js';
import { digest, digestOmitting } from '../src/contracts/canonical.js';
import { SCHEMA_VERSION, type CheckDefinition, type PolicyRelease } from '../src/contracts/schemas.js';
import { calculateBenchmark, deterministicCheckResult, evaluatePlanningReadiness, evaluateVerifierReport, planningInputs,
  type PlanningRecords, type RuntimeAuthorityConfig, type CalibrationManifest, type PinnedArtifact,
  type VerifierReport, type VerifierExpectation, type TrustedVerifierReceipt, type BenchmarkTrial, type EvaluationStage } from '../src/runtime/evaluation.js';

/** Mechanical in-process fixture only. It does not certify a model, Unity or production dispatch. */
export function createRuntimeEvaluationFixture(now = '2026-09-25T09:00:00.000Z') {
  const initial = createContractFixtures();
  const records: PlanningRecords = structuredClone({ task: initial.TaskSpec, plan: initial.PlanPackage, manifest: initial.ContextManifest, context: initial.ContextBundle });
  records.task.taskClass = 'runtime.fixture'; records.task.goal = 'Write a bounded mechanical fixture once and independently verify it.';
  const scope = { repoId: records.task.repoId, allowedPaths: ['src'], taskClasses: ['runtime.fixture'] };
  const applicability = { taskClasses: ['runtime.fixture'], required: true, reason: 'Narrow mechanical fixture only' };
  records.task.constraints.forEach(x => {
    x.description = 'Write only the approved synthetic src fixture once; verify it independently before committing the result.';
    x.applicability = applicability; x.contentHash = digest(x.description);
  });
  const makeCheck = (stage: EvaluationStage): CheckDefinition => ({ schemaVersion: SCHEMA_VERSION,
    checkId: `runtime.fixture.${stage}`, version: '1', requirementRefs: ['ac-1'], method: 'deterministic', verifierVersion: 'mechanical-verifier/1',
    requiredEvidenceKinds: ['mechanical-report'], critical: true, applicability, validatorRef: `validator:${stage}:1` });
  const checks = { planning: makeCheck('planning'), preDispatch: makeCheck('pre-dispatch'), postExecution: makeCheck('post-execution') };
  records.task.acceptanceCriteria[0]!.description = 'Every approved fixture output matches its expected content hash, verified independently before commit.';
  records.task.acceptanceCriteria[0]!.checkRefs = [checks.postExecution.checkId];
  records.manifest.scope = scope; records.manifest.evidenceBindings = [];
  records.manifest.constraintBindings = records.task.constraints.map(({ description: _description, ...binding }) => structuredClone(binding));
  records.context.evidenceItems = [];
  for (const sub of records.plan.subplans) {
    sub.scope = scope; sub.evidenceRefs = [];
    for (const step of sub.steps) { step.capability = 'fixture.write-once'; step.allowedTools = ['fixture.write-once']; step.verificationChecks = [checks.postExecution.checkId]; }
  }
  records.plan.requirementCoverage[0]!.checkRefs = [checks.postExecution.checkId];
  records.plan.hash = digestOmitting(records.plan, 'hash');
  records.manifest.taskSpecDigest = digest(records.task); records.manifest.manifestDigest = digestOmitting(records.manifest, 'manifestDigest');
  records.context.manifestDigest = records.manifest.manifestDigest;
  const allChecks = [checks.planning, checks.preDispatch, checks.postExecution];
  const authority: RuntimeAuthorityConfig = { schemaVersion: 'runtime-authority/1',
    planning: { taskDigest: digest(records.task), expectedInputs: planningInputs(records), snapshotId: records.context.snapshotId,
      memoryVersion: records.context.memoryVersion, checks: allChecks, evidence: [] },
    policy: { releases: [], artifacts: [], calibrations: [], policyOwnerIds: ['runtime-policy-owner'] },
    gate: { issuerId: 'runtime-gate-controller', verifierIds: ['runtime-verifier'],
      checks: [{ stage: 'planning', definition: checks.planning }, { stage: 'pre-dispatch', definition: checks.preDispatch }, { stage: 'post-execution', definition: checks.postExecution }], trustedCheckResults: [] },
  };
  const verifierReport: VerifierReport = { schemaVersion: 'verifier-report/1', reportId: 'report:fixture', runId: 'run:fixture', operationId: 'operation:fixture',
    subjectDigest: digest({ runId: 'run:fixture', operationId: 'operation:fixture', snapshot: 'fixture-output' }),
    checkSetDigest: digest({ tests: ['output.exists', 'output.content'] }), environmentDigest: digest('mechanical-environment/1'),
    startedAt: now, finishedAt: now, adapterStatus: 'completed', total: 2, tests: [{ testId: 'output.exists', outcome: 'pass' }, { testId: 'output.content', outcome: 'pass' }] };
  const verifierExpectation: VerifierExpectation = { reportId: verifierReport.reportId, runId: verifierReport.runId, operationId: verifierReport.operationId,
    subjectDigest: verifierReport.subjectDigest, checkSetDigest: verifierReport.checkSetDigest, environmentDigest: verifierReport.environmentDigest,
    expectedTestIds: ['output.exists', 'output.content'], notBefore: now, now, runnerId: 'mechanical-runner', principalId: 'runtime-verifier', runnerVersion: '1', configDigest: digest('mechanical-runner-config/1') };
  const verifierReceipt: TrustedVerifierReceipt = { reportId: verifierReport.reportId, reportDigest: digest(verifierReport),
    runnerId: verifierExpectation.runnerId, principalId: verifierExpectation.principalId, runnerVersion: verifierExpectation.runnerVersion, configDigest: verifierExpectation.configDigest,
    runId: verifierReport.runId, operationId: verifierReport.operationId, subjectDigest: verifierReport.subjectDigest, checkSetDigest: verifierReport.checkSetDigest,
    environmentDigest: verifierReport.environmentDigest, recordedAt: now };

  // Trial outcomes are measured by the real pure validators; labels come from the predefined mutation oracle.
  // These deterministic cases exercise mechanical rejection; they are not independent samples of model quality.
  const cases: { scenarioId: string; failureClass: string; expectedAccept: boolean; split: 'holdout'; taskClass: 'runtime.fixture' }[] = [];
  const trials: BenchmarkTrial[] = [];
  for (const failureClass of ['planning-input', 'verifier-completeness']) for (let i = 0; i < 40; i++) {
    const expectedAccept = i < 20, scenarioId = `${failureClass}:${i}`;
    cases.push({ scenarioId, failureClass, expectedAccept, split: 'holdout', taskClass: 'runtime.fixture' });
    let outcome;
    if (failureClass === 'planning-input') {
      const candidate = structuredClone(records);
      if (!expectedAccept) candidate.task.goal = `Unreviewed goal ${i}`;
      outcome = evaluatePlanningReadiness(candidate, authority.planning).outcome;
    } else {
      const report = structuredClone(verifierReport);
      if (!expectedAccept) { report.total = 0; report.tests = []; }
      outcome = evaluateVerifierReport(report, verifierExpectation, { ...verifierReceipt, reportDigest: digest(report) }).outcome;
    }
    trials.push({ trialId: `trial:${scenarioId}`, scenarioId, failureClass, expectedAccept, attempts: [outcome] });
  }
  const summary = calculateBenchmark(trials, 0.95);
  const artifacts: PinnedArtifact[] = [];
  const put = (ref: string, content: unknown): PinnedArtifact => { const artifact = { ref, content: structuredClone(content), contentDigest: digest(content) }; artifacts.push(artifact); return artifact; };
  const dataset = put('fixture:dataset', { kind: 'mechanical-fixture', cases });
  put('fixture:trials', trials);
  const checkSet = put('fixture:checkset', { checks: authority.gate.checks });
  put('fixture:labels', { kind: 'mechanical-oracle', labels: cases.map(({ scenarioId, expectedAccept }) => ({ scenarioId, expectedAccept })) });
  put('fixture:uncertainty', summary);
  const criteria = [{ criterionId: 'mechanical-calibration', checkRef: checks.planning.checkId }];
  put('fixture:rubric', { version: 'mechanical-rubric/1', criteria });
  put('fixture:criterion-evidence', { kind: 'mechanical-fixture', ...criteria[0], outcome: 'pass', reportDigest: digest(summary) });
  const calibration: CalibrationManifest = { releaseId: 'runtime-fixture-policy/1', kind: 'mechanical-fixture', stages: ['planning', 'pre-dispatch', 'post-execution'],
    datasetRef: dataset.ref, trialsRef: 'fixture:trials', checkSetRef: checkSet.ref, configRef: 'fixture:config', rubricRef: 'fixture:rubric', modelRef: null, promptRef: null,
    requiredFailureClasses: ['planning-input', 'verifier-completeness'], minTrialsPerFamily: 40, minPositivePerFamily: 20, minNegativePerFamily: 20,
    criterionEvidenceRefs: ['fixture:criterion-evidence'], artifactPins: artifacts.map(({ ref, contentDigest }) => ({ ref, contentDigest })), confidence: 0.95, maxAttemptsPerTrial: 2, maxFalseRejectRate: 0.2 };
  const config = put(calibration.configRef, calibration);
  const policy: PolicyRelease = { schemaVersion: SCHEMA_VERSION, releaseId: calibration.releaseId, version: '1', checkMethods: ['deterministic'], modelVersion: null, promptHash: null,
    modelNotApplicableReason: 'Mechanical validator fixture only; no model, semantic calibration or Unity was invoked.', fixtureEvidenceRefs: calibration.criterionEvidenceRefs,
    checkSetDigest: checkSet.contentDigest, configHash: config.contentDigest, rubricVersion: 'mechanical-rubric/1', datasetSplitHash: dataset.contentDigest, humanLabelSetRef: 'fixture:labels',
    metricsByFailureClass: summary.families.map(({ failureClass, truePositive, trueNegative, falsePositive, falseNegative, trials, firstAttemptSuccesses, wholeWorkflowSuccesses }) =>
      ({ failureClass, truePositive, trueNegative, falsePositive, falseNegative, trials, firstAttemptSuccesses, wholeWorkflowSuccesses })),
    uncertaintyReportRef: 'fixture:uncertainty', permittedTaskClasses: ['runtime.fixture'], riskTargets: summary.families.map(x => ({ failureClass: x.failureClass, maxFalseAcceptRate: 0.2, confidence: 0.95 })),
    releaseCriteria: [{ ...criteria[0]!, description: 'Mechanical fixture checks and pinned campaign artifacts agree; no semantic reliability claim.' }],
    ownerId: 'runtime-policy-owner', approvedBy: 'runtime-policy-owner', status: 'active', activatedAt: now };
  authority.policy = { releases: [policy], artifacts, calibrations: [calibration], policyOwnerIds: ['runtime-policy-owner'] };
  const readiness = evaluatePlanningReadiness(records, authority.planning);
  const planningCheck = deterministicCheckResult(checks.planning, records.plan.hash, readiness, 'evidence:planning', 'runtime-verifier', now);
  const preDispatchCheck = deterministicCheckResult(checks.preDispatch, records.plan.hash, readiness, 'evidence:pre-dispatch', 'runtime-verifier', now);
  const executionCheck = deterministicCheckResult(checks.postExecution, verifierReport.subjectDigest, evaluateVerifierReport(verifierReport, verifierExpectation, verifierReceipt), 'evidence:execution', 'runtime-verifier', now);
  // Example results are deliberately not installed into the trusted gate result registry.
  return { records, authority, now, checks, policy, calibration, summary, verifierReport, verifierExpectation, verifierReceipt, planningCheck, preDispatchCheck, executionCheck };
}
