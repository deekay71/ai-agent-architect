import { z } from 'zod';
import { creditMicrosForUsage, ModelCreditUsageSchema } from './credit-usage.js';

/** R3 data contracts only. Parsing never authorizes a planner or executor. */
export const PLANNING_SCHEMA_VERSION = '0.6.0' as const;
const version = z.literal(PLANNING_SCHEMA_VERSION);
const text = z.string().min(1).refine(value => value.trim().length > 0, 'Expected nonblank text');
const count = z.number().int().nonnegative().safe();
const positive = z.number().int().positive().safe();
const refs = z.array(text).refine(x => new Set(x).size === x.length, 'Duplicate references');
export const PlanLevelSchema = z.enum(['game_epic', 'module', 'task']);
const pin = z.strictObject({ ref: text, version: positive, digest: z.string().regex(/^sha256:[a-f0-9]{64}$/) });
const check = z.strictObject({ outcome: z.enum(['pass', 'fail']), evidenceRefs: refs, reason: text })
  .refine(x => x.outcome !== 'pass' || x.evidenceRefs.length > 0, 'Passing item needs evidence');
export const READY_CHECK_IDS = ['requirementCoverage', 'interfaceCompatibility', 'testableAcceptance', 'highRiskSpikes', 'budgetFit', 'acyclicDependencies', 'clearGoalAndAcceptance'] as const;
const checks = z.strictObject({ requirementCoverage: check, interfaceCompatibility: check, testableAcceptance: check,
  highRiskSpikes: check, budgetFit: check, acyclicDependencies: check, clearGoalAndAcceptance: check });
export const ReadyChecklistSchema = z.strictObject({ schemaVersion: version, checklistId: text, plan: pin,
  checks, openGoalOrAcceptanceQuestions: refs, outcome: z.enum(['ready', 'not_ready']), reviewedBy: text,
  reviewedAt: z.iso.datetime({ offset: true }) }).superRefine((x, ctx) => {
  const ready = READY_CHECK_IDS.every(k => x.checks[k].outcome === 'pass') && !x.openGoalOrAcceptanceQuestions.length;
  if ((x.outcome === 'ready') !== ready) ctx.addIssue({ code: 'custom', message: 'Ready must equal the complete binary checklist; unresolved questions require owner input' });
});
export const SpikeTaskSchema = z.strictObject({ schemaVersion: version, taskId: text, kind: z.literal('spike'), level: PlanLevelSchema,
  question: text, timeboxMinutes: positive, rawTokenCap: positive, stopConditions: refs.min(1),
  decisionRecordRef: text, blocksTaskRefs: refs, codeDisposition: z.literal('do_not_merge'),
  status: z.enum(['planned', 'running', 'answered', 'timeboxed_out']),
  result: z.strictObject({ answer: text, evidenceRefs: refs.min(1), decision: text }).nullable() })
  .refine(x => (x.status === 'answered') === (x.result !== null), 'Only answered spikes carry a supported decision');
export const InterfaceApprovalSchema = z.strictObject({ schemaVersion: version, interfaceId: text, version: positive,
  producer: text, consumers: refs.min(1), inputs: refs, outputs: refs.min(1), ownership: text,
  invariants: refs.min(1), errorContract: text, compatibilityCheckRefs: refs.min(1),
  state: z.enum(['draft', 'approved', 'superseded']), mainPlannerRef: text, decisionRecordRef: text.nullable() })
  .refine(x => x.state === 'draft' || x.decisionRecordRef !== null, 'Locked interface needs a decision record');
export const ChangeRequestSchema = z.strictObject({ schemaVersion: version, changeRequestId: text, taskId: text, plan: pin,
  kind: z.enum(['plan_defect', 'implementation_defect', 'requirement_change']), causeLevel: PlanLevelSchema.nullable(),
  returnToLevel: PlanLevelSchema.nullable(), description: text, evidenceRefs: refs.min(1),
  affectedPlanRefs: refs.min(1), interfaceChanged: z.boolean(), invalidatedHandoffRefs: refs,
  noAffectedHandoffReason: text.optional(),
  status: z.enum(['proposed', 'accepted', 'rejected']), decisionRecordRef: text.nullable() }).superRefine((x, ctx) => {
  if (x.kind !== 'implementation_defect' && (x.causeLevel === null || x.returnToLevel !== x.causeLevel))
    ctx.addIssue({ code: 'custom', message: 'Plan defect returns to its causal level' });
  if (x.kind === 'implementation_defect' && (x.causeLevel !== null || x.returnToLevel !== null))
    ctx.addIssue({ code: 'custom', message: 'Implementation defects return to execution, not planning' });
  if (x.status !== 'proposed' && x.decisionRecordRef === null)
    ctx.addIssue({ code: 'custom', message: 'Resolved change needs a decision record' });
  if (x.status === 'accepted' && x.interfaceChanged && !x.invalidatedHandoffRefs.length && !x.noAffectedHandoffReason)
    ctx.addIssue({ code: 'custom', message: 'Interface changes need invalidation references or an explicit no-impact reason' });
});
export const PlanningTaskLogSchema = z.strictObject({ schemaVersion: version, taskId: text, cohortId: text, level: PlanLevelSchema,
  initialPlanVersion: positive, currentPlanVersion: positive, readyChecklistRef: text,
  readyOutcome: z.enum(['ready', 'not_ready']), spikeRefs: refs,
  executionOutcome: z.enum(['not_started', 'running', 'passed', 'failed', 'blocked']),
  replanCount: count, returnToLevels: z.array(PlanLevelSchema), ownerManualCorrections: count,
  planningDefectRefs: refs, modelUsage: z.array(ModelCreditUsageSchema), creditMicros: count.nullable(), usageEvidenceRefs: refs }).superRefine((x, ctx) => {
  if (x.currentPlanVersion < x.initialPlanVersion) ctx.addIssue({ code: 'custom', message: 'Plan lineage cannot move backward' });
  if (new Set(x.modelUsage.map(row => row.model)).size !== x.modelUsage.length) ctx.addIssue({ code: 'custom', message: 'Model usage must be aggregated by model' });
  if (x.modelUsage.length && !x.usageEvidenceRefs.length) ctx.addIssue({ code: 'custom', message: 'Reported usage needs receipts' });
  try {
    const calculated = x.modelUsage.length ? creditMicrosForUsage(x.modelUsage) : null;
    if (x.creditMicros !== calculated) ctx.addIssue({ code: 'custom', message: 'Credit estimate must match known uncached, cached and output usage; unknown usage stays null' });
  } catch {
    ctx.addIssue({ code: 'custom', message: 'Credit estimate exceeds the safe integer range' });
  }
  if (x.replanCount !== x.returnToLevels.length) ctx.addIssue({ code: 'custom', message: 'Every replan must retain its return level' });
});
export const GameEpicBriefSchema = z.strictObject({ schemaVersion: version, briefId: text, plan: pin,
  goal: text, inScope: refs.min(1), outOfScope: refs.min(1), keyDecisions: refs.min(1), interfaces: refs,
  risks: refs, spikeRefs: refs, rawTokenBudget: positive, timeBudgetHours: positive,
  ownerDecision: z.enum(['pending', 'approved', 'changes_requested']), ownerDecisionRef: text.nullable() })
  .refine(x => x.ownerDecision === 'pending' || x.ownerDecisionRef !== null, 'Game/Epic gate needs an owner decision');
export const PlanningWorkItemSchema = z.strictObject({ schemaVersion: version, taskId: text, level: PlanLevelSchema,
  kind: z.enum(['implementation', 'work_package']), horizon: z.enum(['next_milestone', 'outline']),
  goal: text, parentRef: text.nullable(), requirementRefs: refs.min(1), interfaceApprovalRefs: refs,
  dependencies: refs, childTaskRefs: refs, oneAgentSession: z.boolean(), ownerReviewMinutes: positive,
  automatedCheckRefs: refs, acceptanceCriteria: refs }).superRefine((x, ctx) => {
  if (x.dependencies.includes(x.taskId)) ctx.addIssue({ code: 'custom', message: 'Self dependency' });
  if (x.kind === 'implementation' && (x.level !== 'task' || x.childTaskRefs.length))
    ctx.addIssue({ code: 'custom', message: 'Implementation is a leaf Task; standalone bug tasks may omit a parent' });
  if (x.level === 'game_epic' && x.parentRef !== null)
    ctx.addIssue({ code: 'custom', message: 'Game/Epic is the top level' });
  if (x.kind === 'implementation' && (!x.oneAgentSession || x.ownerReviewMinutes > 30 || !x.automatedCheckRefs.length || !x.acceptanceCriteria.length || x.horizon !== 'next_milestone'))
    ctx.addIssue({ code: 'custom', message: 'Executable tasks need a one-session scope, review <=30 minutes and automated acceptance' });
  if (x.kind === 'work_package' && x.level === 'task') ctx.addIssue({ code: 'custom', message: 'Multi-session work packages belong above Task' });
});
export const brainPlanningSchemas = { ReadyChecklist: ReadyChecklistSchema, SpikeTask: SpikeTaskSchema,
  InterfaceApproval: InterfaceApprovalSchema, ChangeRequest: ChangeRequestSchema,
  PlanningTaskLog: PlanningTaskLogSchema, GameEpicBrief: GameEpicBriefSchema, PlanningWorkItem: PlanningWorkItemSchema } as const;
