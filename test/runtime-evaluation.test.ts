import assert from 'node:assert/strict';
import test from 'node:test';
import { createRuntimeEvaluationFixture } from '../fixtures/runtime-authority.js';
import { digest, digestOmitting } from '../src/contracts/canonical.js';
import { schemas, type CheckResult } from '../src/contracts/schemas.js';
import { calculateBenchmark, rateInterval, planningInputs, evaluatePlanningReadiness, validatePolicyRelease, evaluateVerifierReport,
  deterministicCheckResult, issueStageGate, lookupStageGate, type GateRequest, type EvaluationResult, type VerifierReport } from '../src/runtime/evaluation.js';

type Fixture = ReturnType<typeof createRuntimeEvaluationFixture>;
const rejects = (r: EvaluationResult, code?: string): void => { assert.notEqual(r.outcome, 'pass', JSON.stringify(r)); if (code) assert.ok(r.issues.some(x => x.code === code), JSON.stringify(r)); };
function repinPlanning(f: Fixture): void {
  f.records.plan.hash = digestOmitting(f.records.plan, 'hash');
  f.records.manifest.taskSpecDigest = digest(f.records.task);
  f.records.manifest.manifestDigest = digestOmitting(f.records.manifest, 'manifestDigest');
  f.records.context.manifestDigest = f.records.manifest.manifestDigest;
  f.authority.planning.taskDigest = digest(f.records.task); f.authority.planning.expectedInputs = planningInputs(f.records);
}
function request(f: Fixture, result: CheckResult = f.planningCheck): GateRequest {
  return { gateReportId: 'gate:mechanical', stage: 'planning', taskClass: 'runtime.fixture', subjectDigest: f.records.plan.hash,
    inputVersions: planningInputs(f.records), policyReleaseId: f.policy.releaseId, checkResults: [result] };
}
function register(f: Fixture, result: CheckResult = f.planningCheck): void { f.authority.gate.trustedCheckResults = [{ stage: 'planning', result: structuredClone(result) }]; }

test('planning readiness has no dependency on a completed operation or future execution evidence', () => {
  const f = createRuntimeEvaluationFixture();
  assert.deepEqual(Object.keys(f.records).sort(), ['context', 'manifest', 'plan', 'task']);
  assert.equal(f.records.context.evidenceItems.length, 0);
  assert.deepEqual(evaluatePlanningReadiness(f.records, f.authority.planning), { outcome: 'pass', issues: [] });
  assert.equal(f.authority.gate.trustedCheckResults.length, 0, 'Fixture must not install example post-execution checks');
});

test('self-sealed planning records cannot replace reviewed input pins', () => {
  const f = createRuntimeEvaluationFixture();
  f.records.task.goal = 'Changed after review';
  f.records.manifest.taskSpecDigest = digest(f.records.task);
  f.records.manifest.manifestDigest = digestOmitting(f.records.manifest, 'manifestDigest'); f.records.context.manifestDigest = f.records.manifest.manifestDigest;
  rejects(evaluatePlanningReadiness(f.records, f.authority.planning), 'planning.taskPin');
});

const planningCases: [string, string, (f: Fixture) => void][] = [
  ['cyclic DAG', 'planning.cycle', f => { f.records.plan.subplans[0]!.steps[0]!.dependsOn = ['step-1']; }],
  ['dangling dependency', 'planning.missingDependency', f => { f.records.plan.subplans[0]!.dependencies = ['absent']; }],
  ['broad context class', 'planning.scope', f => { f.records.manifest.scope.taskClasses.push('gameplay.mutate'); }],
  ['broad path', 'planning.scope', f => { f.records.plan.subplans[0]!.scope.allowedPaths = ['policy']; }],
  ['coverage names a check no linked step performs', 'planning.coverage', f => { f.records.plan.subplans[0]!.steps[0]!.verificationChecks = [f.checks.planning.checkId]; }],
  ['unknown check', 'planning.stepCheck', f => { f.records.plan.subplans[0]!.steps[0]!.verificationChecks = ['missing-check']; }],
  ['duplicate constraint binding', 'planning.constraintDuplicate', f => { f.records.manifest.constraintBindings.push(structuredClone(f.records.manifest.constraintBindings[0]!)); }],
];
for (const [label, code, change] of planningCases) test(`planning rejects ${label} even with refreshed trusted pins`, () => {
  const f = createRuntimeEvaluationFixture(); change(f); repinPlanning(f); rejects(evaluatePlanningReadiness(f.records, f.authority.planning), code);
});
test('critical unknown and unresolved subplan blocker are BLOCKED, not readiness PASS', () => {
  const f = createRuntimeEvaluationFixture();
  f.records.context.unknowns.push({ id: 'missing-target', description: 'Target is unknown', critical: true }); repinPlanning(f);
  assert.equal(evaluatePlanningReadiness(f.records, f.authority.planning).outcome, 'blocked');
  f.records.context.unknowns = []; f.records.plan.subplans[0]!.unresolvedItems.push({ id: 'blocked', description: 'API absent', blocking: true }); repinPlanning(f);
  assert.equal(evaluatePlanningReadiness(f.records, f.authority.planning).outcome, 'blocked');
});
test('unsupported assumption remains UNKNOWN despite structurally valid references', () => {
  const f = createRuntimeEvaluationFixture(); f.records.plan.assumptions.push({ id: 'unknown', statement: 'Unverified', status: 'unverified', evidenceRefs: [] }); repinPlanning(f);
  assert.equal(evaluatePlanningReadiness(f.records, f.authority.planning).outcome, 'unknown');
});

test('calibration computes family confusion matrices, retry-inclusive results and nonzero uncertainty', () => {
  const r = calculateBenchmark([
    { trialId: '1', scenarioId: 'a', failureClass: 'f', expectedAccept: true, attempts: ['fail', 'pass'] },
    { trialId: '2', scenarioId: 'b', failureClass: 'f', expectedAccept: false, attempts: ['pass'] },
    { trialId: '3', scenarioId: 'c', failureClass: 'f', expectedAccept: true, attempts: ['unknown'] },
    { trialId: '4', scenarioId: 'd', failureClass: 'f', expectedAccept: false, attempts: ['fail'] },
  ]);
  const m = r.families[0]!;
  assert.deepEqual([m.truePositive, m.trueNegative, m.falsePositive, m.falseNegative], [1, 1, 1, 1]);
  assert.equal(m.firstAttemptSuccesses, 1); assert.equal(m.wholeWorkflowSuccesses, 2); assert.equal(m.unknownAttempts, 1);
  assert.equal(m.falseAcceptance.rate, 0.5); assert.equal(m.falseRejection.rate, 0.5);
  assert.ok(rateInterval(0, 20).upper! > 0, 'Zero observed errors never means zero risk');
  assert.equal(rateInterval(0, 0).rate, null);
  assert.throws(() => calculateBenchmark([{ trialId: 'x', scenarioId: 'a', failureClass: 'f', expectedAccept: true, attempts: ['pass'] }, { trialId: 'x', scenarioId: 'a', failureClass: 'f', expectedAccept: true, attempts: ['pass'] }]));
  assert.throws(() => rateInterval(2, 1));
});

test('mechanical policy resolves real pinned artifacts and measured fixture outcomes only', () => {
  const f = createRuntimeEvaluationFixture();
  for (const stage of ['planning', 'pre-dispatch', 'post-execution'] as const) assert.equal(validatePolicyRelease(f.policy.releaseId, 'runtime.fixture', stage, f.authority.policy, f.now).outcome, 'pass');
  assert.equal(f.summary.trials, 80); assert.ok(f.summary.families.every(x => x.falseAcceptance.upper! > 0));
  assert.equal(f.summary.populationInference, false);
  assert.equal(f.summary.interpretation, 'descriptive-fixture-counts-only');
  rejects(validatePolicyRelease(f.policy.releaseId, 'unity.build', 'planning', f.authority.policy, f.now), 'policy.taskClass');
  rejects(validatePolicyRelease('invented', 'runtime.fixture', 'planning', f.authority.policy, f.now), 'policy.lookup');
});

test('a false acceptance cannot be hidden by a later rejection in the same trial', () => {
  const summary = calculateBenchmark([{ trialId: 'false-then-reject', scenarioId: 'bad-plan', failureClass: 'planning-input', expectedAccept: false, attempts: ['pass', 'fail'] }]);
  assert.equal(summary.families[0]!.falsePositive, 1);
  assert.equal(summary.families[0]!.wholeWorkflowSuccesses, 0);
  assert.equal(summary.families[0]!.falseAcceptance.rate, 1);
});

const policyCases: [string, string, (f: Fixture) => void][] = [
  ['revoked release', 'policy.inactive', f => { f.policy.status = 'revoked'; }],
  ['invented issuer', 'policy.owner', f => { f.policy.approvedBy = 'executor'; }],
  ['false metric', 'policy.metrics', f => { f.policy.metricsByFailureClass[0]!.falsePositive = 99; }],
  ['changed dataset bytes', 'policy.artifact', f => { f.authority.policy.artifacts.find(x => x.ref === f.calibration.datasetRef)!.content = { kind: 'mechanical-fixture', cases: [] }; }],
  ['self-resealed artifact after calibration', 'policy.pin', f => { const a = f.authority.policy.artifacts.find(x => x.ref === f.calibration.trialsRef)!; a.content = []; a.contentDigest = digest(a.content); }],
  ['missing uncertainty report', 'policy.artifact', f => { f.authority.policy.artifacts = f.authority.policy.artifacts.filter(x => x.ref !== f.policy.uncertaintyReportRef); }],
  ['wrong rubric version', 'policy.rubric', f => { f.policy.rubricVersion = 'changed'; }],
  ['wrong locked check set', 'policy.checkSet', f => { f.policy.checkSetDigest = digest('different'); }],
  ['risk ceiling below observed uncertainty', 'policy.risk', f => { f.policy.riskTargets[0]!.maxFalseAcceptRate = 0; }],
  ['missing family risk target', 'policy.familyCoverage', f => { f.policy.riskTargets.pop(); }],
  ['model declaration cannot activate semantic policy', 'policy.semanticShadow', f => { f.policy.checkMethods = ['model']; f.policy.modelVersion = 'model/1'; f.policy.promptHash = digest('prompt'); delete f.policy.modelNotApplicableReason; }],
];
for (const [label, code, change] of policyCases) test(`release rejects ${label}`, () => {
  const f = createRuntimeEvaluationFixture(); change(f); rejects(validatePolicyRelease(f.policy.releaseId, 'runtime.fixture', 'planning', f.authority.policy, f.now), code);
});

const verifierCases: [string, string, (r: VerifierReport) => void][] = [
  ['zero tests', 'verifier.count', r => { r.tests = []; r.total = 0; }],
  ['missing required test', 'verifier.testSet', r => { r.tests.pop(); r.total--; }],
  ['duplicate test', 'verifier.duplicate', r => { r.tests[1] = structuredClone(r.tests[0]!); }],
  ['skipped required test', 'verifier.skipped', r => { r.tests[0]!.outcome = 'skipped'; }],
  ['failed test', 'verifier.failed', r => { r.tests[0]!.outcome = 'fail'; }],
  ['false count', 'verifier.count', r => { r.total = 100; }],
  ['stale run', 'verifier.binding', r => { r.runId = 'old-run'; }],
  ['stale subject', 'verifier.binding', r => { r.subjectDigest = digest('old-snapshot'); }],
  ['future timestamp', 'verifier.time', r => { r.finishedAt = '2099-01-01T00:00:00.000Z'; }],
];
for (const [label, code, change] of verifierCases) test(`verifier rejects ${label} even with a correct content receipt`, () => {
  const f = createRuntimeEvaluationFixture(); change(f.verifierReport);
  rejects(evaluateVerifierReport(f.verifierReport, f.verifierExpectation, { ...f.verifierReceipt, reportDigest: digest(f.verifierReport) }), code);
});
test('verifier requires independently selected issuer and a matching protected receipt', () => {
  const f = createRuntimeEvaluationFixture();
  assert.equal(evaluateVerifierReport(f.verifierReport, f.verifierExpectation, f.verifierReceipt).outcome, 'pass');
  rejects(evaluateVerifierReport(f.verifierReport, f.verifierExpectation, null), 'verifier.reportHash');
  rejects(evaluateVerifierReport(f.verifierReport, f.verifierExpectation, { ...f.verifierReceipt, principalId: 'executor' }), 'verifier.provenance');
  rejects(evaluateVerifierReport({ ...f.verifierReport, total: 99 }, f.verifierExpectation, f.verifierReceipt), 'verifier.reportHash');
  rejects(evaluateVerifierReport(null, f.verifierExpectation, f.verifierReceipt), 'verifier.schema');
});
test('adapter failure and unknown test result are UNKNOWN, never success', () => {
  const f = createRuntimeEvaluationFixture();
  const error: VerifierReport = { ...f.verifierReport, adapterStatus: 'error', error: 'Runner unavailable', tests: [], total: 0 };
  assert.equal(evaluateVerifierReport(error, f.verifierExpectation, { ...f.verifierReceipt, reportDigest: digest(error) }).outcome, 'unknown');
  f.verifierReport.tests[0]!.outcome = 'unknown';
  assert.equal(evaluateVerifierReport(f.verifierReport, f.verifierExpectation, { ...f.verifierReceipt, reportDigest: digest(f.verifierReport) }).outcome, 'unknown');
});

test('stage gate is canonical and lookup requires protected report/current inputs/current release', () => {
  const f = createRuntimeEvaluationFixture(); register(f);
  const q = request(f), issued = issueStageGate(q, f.authority, f.now); assert.equal(issued.outcome, 'pass'); assert.ok(issued.gate);
  assert.equal(schemas.GateReport.safeParse(issued.gate.report).success, true);
  const expectation = { stage: q.stage, taskClass: q.taskClass, subjectDigest: q.subjectDigest, inputVersions: q.inputVersions, policyReleaseId: q.policyReleaseId };
  assert.equal(lookupStageGate(q.gateReportId, expectation, [issued.gate], f.authority, f.now).outcome, 'pass');
  rejects(lookupStageGate('forged', expectation, [issued.gate], f.authority, f.now), 'gate.lookup');
  rejects(lookupStageGate(q.gateReportId, { ...expectation, stage: 'post-execution' }, [issued.gate], f.authority, f.now), 'gate.stage');
  rejects(lookupStageGate(q.gateReportId, { ...expectation, subjectDigest: digest('new-snapshot') }, [issued.gate], f.authority, f.now), 'gate.stale');
  const forged = structuredClone(issued.gate); forged.report.issuerId = 'executor';
  rejects(lookupStageGate(q.gateReportId, expectation, [forged], f.authority, f.now), 'gate.envelopeDigest');
  f.policy.status = 'revoked'; rejects(lookupStageGate(q.gateReportId, expectation, [issued.gate], f.authority, f.now), 'gate.policyDrift');
});
test('high score cannot override failed or unknown hard checks', () => {
  const f = createRuntimeEvaluationFixture();
  for (const outcome of ['fail', 'unknown'] as const) {
    const result = deterministicCheckResult(f.checks.planning, f.records.plan.hash,
      { outcome, issues: [{ code: 'fixture.defect', path: 'plan', message: 'Controlled mechanical failure' }] }, 'evidence:failure', 'runtime-verifier', f.now);
    register(f, result);
    const issued = issueStageGate({ ...request(f, result), dimensionScores: [{ dimension: 'all', score: 100, maximum: 100 }] }, f.authority, f.now);
    assert.equal(issued.outcome, outcome); assert.notEqual(issued.gate?.report.verdict, 'PASS');
  }
});
test('self-declared check or wrong-stage result cannot be used to issue PASS', () => {
  const f = createRuntimeEvaluationFixture();
  rejects(issueStageGate(request(f), f.authority, f.now), 'gate.untrustedCheck');
  f.authority.gate.trustedCheckResults = [{ stage: 'post-execution', result: f.planningCheck }];
  rejects(issueStageGate(request(f), f.authority, f.now), 'gate.untrustedCheck');
  const missing = issueStageGate({ ...request(f), checkResults: [] }, f.authority, f.now);
  assert.equal(missing.outcome, 'unknown'); assert.equal(missing.gate, null);
});
test('gate issuance and lookup revalidate current authority inputs, not only caller expectations', () => {
  const f = createRuntimeEvaluationFixture(); register(f);
  const q = request(f), issued = issueStageGate(q, f.authority, f.now);
  assert.equal(issued.outcome, 'pass'); assert.ok(issued.gate);
  f.authority.planning.expectedInputs[0]!.digest = digest('new-task-revision');
  rejects(issueStageGate(q, f.authority, f.now), 'gate.inputPins');
  rejects(lookupStageGate(q.gateReportId, q, [issued.gate], f.authority, f.now), 'gate.inputPins');
});
test('pre-dispatch and post-execution have independent subjects and mandatory checksets', () => {
  const f = createRuntimeEvaluationFixture();
  const composite = digest({ plan: f.records.plan.hash, call: 'call:v1', workspace: 'before' });
  const before = deterministicCheckResult(f.checks.preDispatch, composite, { outcome: 'pass', issues: [] }, 'evidence:pre', 'runtime-verifier', f.now);
  f.authority.gate.trustedCheckResults = [{ stage: 'pre-dispatch', result: before }, { stage: 'post-execution', result: f.executionCheck }];
  const pre = issueStageGate({ ...request(f), stage: 'pre-dispatch', subjectDigest: composite, checkResults: [before] }, f.authority, f.now);
  assert.equal(pre.outcome, 'pass');
  const post = issueStageGate({ ...request(f), stage: 'post-execution', subjectDigest: f.verifierReport.subjectDigest, checkResults: [f.executionCheck] }, f.authority, f.now);
  assert.equal(post.outcome, 'pass');
  rejects(issueStageGate({ ...request(f), stage: 'post-execution', subjectDigest: composite, checkResults: [before] }, f.authority, f.now));
});
