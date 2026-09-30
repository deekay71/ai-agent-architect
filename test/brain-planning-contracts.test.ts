import assert from 'node:assert/strict';
import test from 'node:test';
import { digest } from '../src/contracts/canonical.js';
import { createContractFixtures } from '../fixtures/contracts.js';
import { schemas } from '../src/contracts/schemas.js';
import { brainPlanningSchemas, READY_CHECK_IDS, PLANNING_SCHEMA_VERSION as schemaVersion } from '../src/contracts/brain-planning.js';
import { createBrainPlanningFixtures } from '../fixtures/brain-planning.js';

const plan = { ref: 'plan-module', version: 1, digest: digest('reviewed-plan') };
const checks = Object.fromEntries(READY_CHECK_IDS.map(id => [id, { outcome: 'pass', evidenceRefs: ['evidence:' + id], reason: 'Checked current artifact' }]));
const ready = () => ({ schemaVersion, checklistId: 'ready-1', plan, checks: structuredClone(checks), openGoalOrAcceptanceQuestions: [], outcome: 'ready', reviewedBy: 'critic', reviewedAt: '2026-09-30T00:00:00Z' });
const spike = () => ({ schemaVersion, taskId: 'cli-spike', kind: 'spike', level: 'module', question: 'Does CLI reliably return exact EditMode test results on this host?', timeboxMinutes: 60, rawTokenCap: 50000, stopConditions: ['60 minutes or cap reached'], decisionRecordRef: 'decision:cli', blocksTaskRefs: ['skeleton'], codeDisposition: 'do_not_merge', status: 'planned', result: null });
const change = () => ({ schemaVersion, changeRequestId: 'change-1', taskId: 'save', plan, kind: 'plan_defect', causeLevel: 'module', returnToLevel: 'module', description: 'Save interface omitted migrations', evidenceRefs: ['test:migration'], affectedPlanRefs: ['plan-module'], interfaceChanged: true, invalidatedHandoffRefs: ['handoff-save'], status: 'proposed', decisionRecordRef: null });
const work = () => ({ schemaVersion, taskId: 'save-atomic', level: 'task', kind: 'implementation', horizon: 'next_milestone', goal: 'Persist and reload versioned state', parentRef: 'save-module', requirementRefs: ['persist-state'], interfaceApprovalRefs: ['save-v1'], dependencies: [], childTaskRefs: [], oneAgentSession: true, ownerReviewMinutes: 30, automatedCheckRefs: ['roundtrip-test'], acceptanceCriteria: ['Reloaded state equals input'] });

test('R3 planning schemas accept all seven bounded record types and reject unknown fields', () => {
  const fixtures = {
    ReadyChecklist: ready(), SpikeTask: spike(), ChangeRequest: change(), PlanningWorkItem: work(),
    InterfaceApproval: { schemaVersion, interfaceId: 'save', version: 1, producer: 'save-module', consumers: ['level-module'], inputs: ['state'], outputs: ['receipt'], ownership: 'save-module', invariants: ['versioned state'], errorContract: 'typed error', compatibilityCheckRefs: ['compatibility-test'], state: 'approved', mainPlannerRef: 'main-planner', decisionRecordRef: 'decision-save' },
    PlanningTaskLog: { schemaVersion, taskId: 'save', cohortId: 'round1-brain', level: 'task', initialPlanVersion: 1, currentPlanVersion: 2, readyChecklistRef: 'ready-2', readyOutcome: 'ready', spikeRefs: [], executionOutcome: 'passed', replanCount: 1, returnToLevels: ['task'], ownerManualCorrections: 0, planningDefectRefs: ['defect-1'], modelUsage: [{ model: 'gpt-6-sol', inputTokens: 100, cachedInputTokens: 10, outputTokens: 20 }], creditMicros: 9550, usageEvidenceRefs: ['receipt-1'] },
    GameEpicBrief: { schemaVersion, briefId: 'game-brief', plan, goal: 'Block puzzle pilot', inScope: ['offline core loop'], outOfScope: ['live billing'], keyDecisions: ['grid rules'], interfaces: ['save-v1'], risks: ['target-device performance'], spikeRefs: ['performance'], rawTokenBudget: 300000, timeBudgetHours: 10, ownerDecision: 'pending', ownerDecisionRef: null },
  };
  for (const name of Object.keys(brainPlanningSchemas) as (keyof typeof brainPlanningSchemas)[]) {
    assert.ok(brainPlanningSchemas[name].safeParse(fixtures[name]).success, name);
    assert.equal(brainPlanningSchemas[name].safeParse({ ...fixtures[name], score: 100 }).success, false, name);
  }
});
test('Ready rejects missing checks, failed checks, unevidenced passes and open goal questions', () => {
  assert.equal(brainPlanningSchemas.ReadyChecklist.safeParse({ ...ready(), checks: {} }).success, false);
  assert.equal(brainPlanningSchemas.ReadyChecklist.safeParse({ ...ready(), openGoalOrAcceptanceQuestions: ['Which save data is required?'] }).success, false);
  for (const id of READY_CHECK_IDS) {
    const value = ready(); value.checks[id]!.outcome = 'fail';
    assert.equal(brainPlanningSchemas.ReadyChecklist.safeParse(value).success, false, id);
    value.outcome = 'not_ready'; assert.ok(brainPlanningSchemas.ReadyChecklist.safeParse(value).success);
    value.checks[id]!.outcome = 'pass'; value.checks[id]!.evidenceRefs = [];
    assert.equal(brainPlanningSchemas.ReadyChecklist.safeParse(value).success, false, id);
  }
});
test('spikes cannot merge code, omit bounds or claim an answer without decision evidence', () => {
  for (const patch of [{ codeDisposition: 'merge' }, { timeboxMinutes: 0 }, { rawTokenCap: 0 }, { question: '' }, { stopConditions: [] }, { status: 'answered' }])
    assert.equal(brainPlanningSchemas.SpikeTask.safeParse({ ...spike(), ...patch }).success, false);
  assert.equal(brainPlanningSchemas.SpikeTask.safeParse({ ...spike(), weightedTokenCap: 50000 }).success, false);
});
test('change requests return to the causal tier and separate implementation defects', () => {
  assert.equal(brainPlanningSchemas.ChangeRequest.safeParse({ ...change(), returnToLevel: 'task' }).success, false);
  assert.equal(brainPlanningSchemas.ChangeRequest.safeParse({ ...change(), kind: 'implementation_defect' }).success, false);
  assert.ok(brainPlanningSchemas.ChangeRequest.safeParse({ ...change(), kind: 'implementation_defect', causeLevel: null, returnToLevel: null }).success);
  assert.equal(brainPlanningSchemas.ChangeRequest.safeParse({ ...change(), status: 'accepted' }).success, false);
});
test('atomic work must be one session, automated, bounded for owner review and near-term', () => {
  for (const patch of [{ oneAgentSession: false }, { ownerReviewMinutes: 31 }, { automatedCheckRefs: [] }, { acceptanceCriteria: [] }, { horizon: 'outline' }, { dependencies: ['save-atomic'] }])
    assert.equal(brainPlanningSchemas.PlanningWorkItem.safeParse({ ...work(), ...patch }).success, false);
  assert.ok(brainPlanningSchemas.PlanningWorkItem.safeParse({ ...work(), level: 'module', kind: 'work_package', horizon: 'outline', oneAgentSession: false, automatedCheckRefs: [], acceptanceCriteria: [] }).success);
});
test('planning contract migration rejects numeric scores and old parallel-merge mode', () => {
  const f = createContractFixtures();
  assert.equal(f.PlanPackage.schemaVersion, '0.6.0'); assert.equal(f.TaskSpec.schemaVersion, '0.5.0');
  assert.equal(schemas.GateReport.safeParse({ ...f.GateReport, dimensionScores: [] }).success, false);
  assert.equal(schemas.GateReport.safeParse({ ...f.GateReport, schemaVersion: '0.5.0' }).success, false);
  assert.equal(schemas.PlanningModeDecision.safeParse({ ...f.PlanningModeDecision, mode: 'multi+synthesizer+critic', fanOut: 3 }).success, false);
  assert.ok(schemas.PlanningModeDecision.safeParse({ ...f.PlanningModeDecision, mode: 'hierarchical+critic', fanOut: 1 }).success);
  const { level: _level, ...missingLevel } = f.PlanPackage;
  assert.equal(schemas.PlanPackage.safeParse(missingLevel).success, false);
});
test('pinned planning text is preserved and execution leaves cannot masquerade as Epic work', () => {
  const original = { ...work(), taskId: '  intentional-id  ' };
  assert.equal(brainPlanningSchemas.PlanningWorkItem.parse(original).taskId, original.taskId);
  assert.equal(brainPlanningSchemas.PlanningWorkItem.safeParse({ ...work(), level: 'game_epic' }).success, false);
  assert.equal(brainPlanningSchemas.PlanningWorkItem.safeParse({ ...work(), childTaskRefs: ['child'] }).success, false);
});
test('interface and Game/Epic approval require decision references', () => {
  const f = createBrainPlanningFixtures();
  assert.equal(brainPlanningSchemas.InterfaceApproval.safeParse({ ...f.InterfaceApproval, state: 'approved' }).success, false);
  assert.equal(brainPlanningSchemas.GameEpicBrief.safeParse({ ...f.GameEpicBrief, ownerDecision: 'approved' }).success, false);
  assert.equal(brainPlanningSchemas.ChangeRequest.safeParse({ ...change(), status: 'accepted', decisionRecordRef: 'decision', invalidatedHandoffRefs: [] }).success, false);
  assert.ok(brainPlanningSchemas.ChangeRequest.safeParse({ ...change(), status: 'accepted', decisionRecordRef: 'decision', invalidatedHandoffRefs: [], noAffectedHandoffReason: 'No downstream handoff has been issued' }).success);
});
test('planning logs retain every return tier and exact credit usage', () => {
  const log = createBrainPlanningFixtures().PlanningTaskLog;
  assert.equal(brainPlanningSchemas.PlanningTaskLog.safeParse({ ...log, replanCount: 1 }).success, false);
  const usage = [{ model: 'gpt-6-sol', inputTokens: 100, cachedInputTokens: 10, outputTokens: 20 }] as const;
  assert.ok(brainPlanningSchemas.PlanningTaskLog.safeParse({ ...log, modelUsage: usage, creditMicros: 9550, usageEvidenceRefs: ['receipt'] }).success);
  assert.equal(brainPlanningSchemas.PlanningTaskLog.safeParse({ ...log, modelUsage: usage, creditMicros: 9000, usageEvidenceRefs: ['receipt'] }).success, false);
  assert.equal(brainPlanningSchemas.PlanningTaskLog.safeParse({ ...log, modelUsage: usage, creditMicros: 9550 }).success, false);
  assert.ok(brainPlanningSchemas.PlanningTaskLog.safeParse({ ...log, modelUsage: [{ ...usage[0], cachedInputTokens: null }], creditMicros: null, usageEvidenceRefs: ['receipt'] }).success);
  assert.equal(brainPlanningSchemas.PlanningTaskLog.safeParse({ ...log, modelUsage: [{ ...usage[0], cachedInputTokens: null }], creditMicros: 9550, usageEvidenceRefs: ['receipt'] }).success, false);
  assert.equal(brainPlanningSchemas.PlanningTaskLog.safeParse({ ...log, modelUsage: [{ ...usage[0], outputTokens: Number.MAX_SAFE_INTEGER }], creditMicros: null, usageEvidenceRefs: ['receipt'] }).success, false);
});
