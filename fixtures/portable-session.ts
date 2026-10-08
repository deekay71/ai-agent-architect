import { ProjectBrain } from '../src/portable/brain.js';
import { createContractFixtures } from './contracts.js';
import { claimAssertionDigest } from '../src/memory/index.js';
import { digest } from '../src/contracts/canonical.js';
import type { Claim, TaskSpec } from '../src/contracts/schemas.js';

export function portableTask(brain:ProjectBrain): TaskSpec {
  const task = createContractFixtures().TaskSpec;
  task.repoId = brain.config.projectId; task.taskId = 'fixture:task-one'; task.taskClass = 'unity.coding';
  task.goal = 'Continue from verified fixture Knowledge without inventing Android acceptance.';
  task.allowedPaths = brain.config.allowedPaths; task.baseRevision = digest('portable-offline-fixture');
  task.budget = { ...task.budget,inputLimit:90000,outputReserve:2048,headroom:1024,
    tokenAccountingPolicy:{ version:'local-accounting/1',tokenizer:'utf8-bytes/1',includeToolOutputs:true } };
  task.constraints = [{ id:'C17',description:'A local compile fixture does not establish an Android build.',sourceRevision:'fixture:r1',
    contentHash:digest('A local compile fixture does not establish an Android build.'),applicability:{ taskClasses:[task.taskClass],required:true,reason:'Truthful evidence boundaries' } }];
  task.acceptanceCriteria = [{ criterionId:'fixture:AC1',description:'Retain Knowledge and Android unknown in a fresh process.',checkRefs:['portable:fresh-session'] }];
  return task;
}

export const TASK_ONE_PLAN = 'Fixture task-one plan; native execution remains pending.';

/** Synthetic role-separated fixture only. Not an authenticated live promoter or model-driven Brain run. */
export function taskOne(brain:ProjectBrain): { claimId:string;sourceNodeId:string } {
  const source = brain.ingestFile('.architect/plans/fixture-evidence.md','fixture:compile','evidence');
  const scope = { repoId:brain.namespace.repoId,allowedPaths:brain.namespace.allowedPaths,taskClasses:brain.namespace.taskClasses };
  const claim: Claim = { schemaVersion:'0.5.0',claimId:'fixture:knowledge',statement:'The offline compile fixture passed; Android build was not run.',assertionType:'observed',
    sourceRefs:['fixture:compile'],applicableScope:scope,evidenceStatus:'unverified',lifecycle:'proposed',freshness:'unknown',promotionEvidenceRefs:[],dependentRefs:[] };
  const proposal = brain.memory.propose({ schemaVersion:'0.5.0',deltaId:'fixture:delta',sourceEvidenceIds:['fixture:verification'],expectedMemoryVersion:brain.memory.memoryVersion,
    claimsAdded:[claim],claimsSuperseded:[],claimsQuarantined:[],claimsRevoked:[],affectedPages:['fixture/compile'],promotionReviewRef:'fixture:critic-review' },brain.namespace,'agent:planner');
  brain.memory.recordEvidence({ evidenceId:'fixture:verification',claimId:claim.claimId,assertionDigest:claimAssertionDigest(claim),assertionType:claim.assertionType,
    namespace:brain.namespace,sourceBindings:proposal.sourceBindings[0]!.sources,conclusion:'supported',attestationRef:'synthetic-offline-fixture-only' },'host:verifier');
  const review = brain.memory.validate('fixture:delta',{ reviewRef:'fixture:critic-review',decision:'approve',reason:'Independent fixture role checked the exact source and assertion.' },'host:critic');
  if (!review.valid) throw Error('PORTABLE_FIXTURE_PROMOTION_REVIEW');
  const promoted = brain.memory.promote('fixture:delta','host:promoter');
  brain.recordPlan(portableTask(brain),TASK_ONE_PLAN,[promoted.claimIds[0]!]);
  brain.handoff(['fixture:task-one'],'Task two: build fresh context from fixture Knowledge; keep Android unknown.');
  return { claimId:promoted.claimIds[0]!,sourceNodeId:source.id };
}

if (process.argv[2] === 'one' || process.argv[2] === 'two' || process.argv[2] === 'hydrate') {
  const brain = new ProjectBrain(process.argv[3]!);
  try {
    // Normal public resume only: no event traversal, raw database reads or transcript.
    if (process.argv[2] === 'hydrate') process.stdout.write(JSON.stringify({ ...brain.resume(),pid:process.pid,unityInvoked:false,modelInvoked:false })+'\n');
    else if (process.argv[2] === 'one') process.stdout.write(JSON.stringify({ ...taskOne(brain),projectId:brain.config.projectId,pid:process.pid,unityInvoked:false,modelInvoked:false })+'\n');
    else {
      const resumed = brain.resume(), claim = resumed.knowledge.find(x => x.kind === 'claim');
      if (resumed.state !== 'resumable' || !claim) throw Error('PORTABLE_FIXTURE_RESUME');
      const context = await brain.context(portableTask(brain),[claim.id]);
      process.stdout.write(JSON.stringify({ state:resumed.state,projectId:brain.config.projectId,pid:process.pid,contextStatus:context.status,
        claim:claim.content,resourceRefs:context.packet.resources.map(x => x.pin.ref),contextAssurance:context.packet.budgetReport.assurance,
        executionAuthorized:false,unityInvoked:false,modelInvoked:false })+'\n');
    }
  } finally { brain.close(); }
}
