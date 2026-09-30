import { digest } from '../src/contracts/canonical.js';
import { brainPlanningSchemas, PLANNING_SCHEMA_VERSION as schemaVersion } from '../src/contracts/brain-planning.js';

/** Synthetic structural fixtures, never a trusted Ready/owner approval. */
export function createBrainPlanningFixtures() {
  const plan = { ref: 'plan-1', version: 1, digest: digest('synthetic-plan') };
  const pass = { outcome: 'pass', evidenceRefs: ['synthetic-check'], reason: 'Structural fixture only' };
  return {
    ReadyChecklist: brainPlanningSchemas.ReadyChecklist.parse({ schemaVersion, checklistId: 'fixture-ready', plan,
      checks: { requirementCoverage: pass, interfaceCompatibility: pass, testableAcceptance: pass, highRiskSpikes: pass, budgetFit: pass, acyclicDependencies: pass, clearGoalAndAcceptance: pass },
      openGoalOrAcceptanceQuestions: [], outcome: 'ready', reviewedBy: 'fixture-critic', reviewedAt: '2026-09-30T00:00:00Z' }),
    SpikeTask: brainPlanningSchemas.SpikeTask.parse({ schemaVersion, taskId: 'spike-1', kind: 'spike', level: 'module',
      question: 'Can the pinned CLI return exact test results?', timeboxMinutes: 60, rawTokenCap: 50000, stopConditions: ['Time or token cap reached'],
      decisionRecordRef: 'decision-spike', blocksTaskRefs: ['skeleton'], codeDisposition: 'do_not_merge', status: 'planned', result: null }),
    InterfaceApproval: brainPlanningSchemas.InterfaceApproval.parse({ schemaVersion, interfaceId: 'interface-1', version: 1,
      producer: 'module-a', consumers: ['module-b'], inputs: ['input'], outputs: ['result'], ownership: 'module-a',
      invariants: ['valid result'], errorContract: 'typed error', compatibilityCheckRefs: ['check-1'],
      state: 'draft', mainPlannerRef: 'main-planner', decisionRecordRef: null }),
    ChangeRequest: brainPlanningSchemas.ChangeRequest.parse({ schemaVersion, changeRequestId: 'change-1', taskId: 'task-1', plan,
      kind: 'plan_defect', causeLevel: 'module', returnToLevel: 'module', description: 'Missing interface requirement', evidenceRefs: ['finding-1'],
      affectedPlanRefs: ['plan-1'], interfaceChanged: true, invalidatedHandoffRefs: ['handoff-1'], status: 'proposed', decisionRecordRef: null }),
    PlanningTaskLog: brainPlanningSchemas.PlanningTaskLog.parse({ schemaVersion, taskId: 'task-1', cohortId: 'fixture',
      level: 'task', initialPlanVersion: 1, currentPlanVersion: 1, readyChecklistRef: 'fixture-ready', readyOutcome: 'not_ready', spikeRefs: [],
      executionOutcome: 'not_started', replanCount: 0, returnToLevels: [], ownerManualCorrections: 0, planningDefectRefs: [], modelUsage: [], creditMicros: null, usageEvidenceRefs: [] }),
    GameEpicBrief: brainPlanningSchemas.GameEpicBrief.parse({ schemaVersion, briefId: 'brief-1', plan, goal: 'Pilot after platform gate',
      inScope: ['core game'], outOfScope: ['production billing'], keyDecisions: ['local first'], interfaces: [], risks: ['performance'], spikeRefs: ['spike-1'],
      rawTokenBudget: 300000, timeBudgetHours: 10, ownerDecision: 'pending', ownerDecisionRef: null }),
    PlanningWorkItem: brainPlanningSchemas.PlanningWorkItem.parse({ schemaVersion, taskId: 'task-1', level: 'task',
      kind: 'implementation', horizon: 'next_milestone', goal: 'One bounded fix', parentRef: null, requirementRefs: ['ac-1'],
      interfaceApprovalRefs: [], dependencies: [], childTaskRefs: [], oneAgentSession: true, ownerReviewMinutes: 30,
      automatedCheckRefs: ['check-1'], acceptanceCriteria: ['Fixture matches expected result'] }),
  };
}
