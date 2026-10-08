import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, symlinkSync, linkSync, renameSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bootstrapProject } from '../src/portable/project.js';
import { ProjectBrain, type HydratedPlan, type PortableTask } from '../src/portable/brain.js';
import { portableTask, taskOne, TASK_ONE_PLAN } from '../fixtures/portable-session.js';
import { sourceContentDigest } from '../src/memory/index.js';
import { digest } from '../src/contracts/canonical.js';
import { READY_CHECK_IDS } from '../src/contracts/brain-planning.js';

/** Fresh Unity-shaped fixture; nothing here launches Unity, a model or a native tool. */
function project(t:test.TestContext):string {
  const root = mkdtempSync(path.join(tmpdir(),'architect-durability-'));
  for (const name of ['Assets','Packages','ProjectSettings']) mkdirSync(path.join(root,name));
  writeFileSync(path.join(root,'Packages/manifest.json'),JSON.stringify({ dependencies:{} }));
  writeFileSync(path.join(root,'ProjectSettings/ProjectVersion.txt'),'m_EditorVersion: 6000.0.84f1\n');
  bootstrapProject(root);
  writeFileSync(path.join(root,'.architect/plans/fixture-evidence.md'),'Offline compile fixture passed; Android build was not run.');
  t.after(() => rmSync(root,{ recursive:true,force:true })); return root;
}
async function withBrain<T>(root:string, action:(brain:ProjectBrain) => T|Promise<T>): Promise<T> {
  const brain = new ProjectBrain(root);
  try { return await action(brain); } finally { brain.close(); }
}
/** Simulates a process that committed only the canonical Memory transaction, then crashed. */
function canonicalOnly(brain:ProjectBrain, relative:string, sourceId:string): string {
  const content = readFileSync(path.join(brain.root,relative),'utf8'), hash = sourceContentDigest(content);
  return brain.memory.ingest({ namespace:{ ...brain.namespace,allowedPaths:[relative] },purpose:'knowledge',provenance:{ kind:'primary',originId:`project-file:${relative}` },content,
    record:{ schemaVersion:'0.5.0',sourceId,sourceType:'document',sourceRef:relative,sourceRevision:hash,contentDigest:hash,observedAt:new Date().toISOString(),freshnessPolicy:'pinned',freshness:'fresh' } },'host:ingest').id;
}
const sessionDb = (root:string):string => path.join(root,'.architect/data/session/runtime.sqlite');
const hydrate = (root:string): { state:string;issues:string[];plans:HydratedPlan[];handoff:{ tasks:{ planArtifactRef:string }[] }|null;executionAuthorized:boolean } => {
  const script = fileURLToPath(new URL('../fixtures/portable-session.js',import.meta.url));
  const run = spawnSync(process.execPath,[script,'hydrate',root],{ encoding:'utf8',timeout:10000 });
  assert.equal(run.status,0,run.stderr); return JSON.parse(run.stdout);
};

test('a failed secondary session write after canonical ingest cannot keep changed file bytes usable after reopen',async t => {
  const root = project(t), relative = '.architect/plans/gdd.md';
  writeFileSync(path.join(root,relative),'REVISION ONE: rule A.');
  const id = await withBrain(root,b => {
    b.state.write = () => { throw Error('INJECTED_SESSION_WRITE_FAILURE'); };
    try { return b.ingestFile(relative,'durable:gdd').id; }
    catch { return b.memory.exportSnapshot(b.namespace).nodes.find(n => n.kind === 'source' && n.label === 'durable:gdd')!.id; }
  });
  writeFileSync(path.join(root,relative),'REVISION TWO: rule B.');
  await withBrain(root,async b => {
    assert.deepEqual(b.reconcileSources(),['durable:gdd']);
    const node = b.memory.getNode(id,b.namespace)!;
    assert.equal(node.status.freshness,'stale'); assert.equal(node.status.validity,'invalidated');
    assert.equal(b.knowledge().some(n => n.id === id),false);
    assert.equal((await b.context(portableTask(b),[id])).status,'blocked');
  });
});

test('canonical-only file sources reconcile deleted, symlink-relinked and hardlinked paths after restart; unchanged files stay usable',async t => {
  const root = project(t), files = ['deleted','relinked','hard','same'];
  for (const name of files) writeFileSync(path.join(root,`Assets/${name}.md`),`Bytes for ${name}.`);
  const ids = await withBrain(root,b => Object.fromEntries(files.map(name => [name,canonicalOnly(b,`Assets/${name}.md`,`file:${name}`)])));
  rmSync(path.join(root,'Assets/deleted.md'));
  renameSync(path.join(root,'Assets/relinked.md'),path.join(root,'Assets/relinked-target.md'));
  symlinkSync(path.join(root,'Assets/relinked-target.md'),path.join(root,'Assets/relinked.md'));
  linkSync(path.join(root,'Assets/hard.md'),path.join(root,'Assets/hard-alias.md'));
  await withBrain(root,async b => {
    assert.deepEqual(b.reconcileSources(),['file:deleted','file:hard','file:relinked']);
    const usable = new Set(b.knowledge().map(n => n.id));
    assert.equal(usable.has(ids.same!),true);
    for (const name of ['deleted','relinked','hard']) {
      assert.equal(usable.has(ids[name]!),false,name);
      assert.equal((await b.context(portableTask(b),[ids[name]!])).status,'blocked',name);
    }
    assert.equal((await b.context(portableTask(b),[ids.same!])).status,'ready');
  });
});

test('ingest retry is idempotent and restoring old bytes never silently reapproves a stale revision',async t => {
  const root = project(t), relative = 'Assets/rules.md', original = 'Rule revision A.';
  writeFileSync(path.join(root,relative),original);
  const id = await withBrain(root,b => {
    const first = b.ingestFile(relative,'rules'), version = b.memory.memoryVersion;
    assert.equal(b.ingestFile(relative,'rules').id,first.id); assert.equal(b.memory.memoryVersion,version);
    return first.id;
  });
  writeFileSync(path.join(root,relative),'Rule revision B.');
  await withBrain(root,b => { assert.deepEqual(b.reconcileSources(),['rules']); });
  writeFileSync(path.join(root,relative),original);
  await withBrain(root,async b => {
    assert.deepEqual(b.reconcileSources(),[]);
    assert.equal(b.memory.getNode(id,b.namespace)!.status.freshness,'stale');
    assert.throws(() => b.ingestFile(relative,'rules'),/REVISION_NOT_CURRENT/);
    assert.equal((await b.context(portableTask(b),[id])).status,'blocked');
  });
});

test('generic Memory sources with non-file provenance are not treated as filesystem sources',async t => {
  const root = project(t);
  const id = await withBrain(root,b => {
    const content = 'Unity evidence summary from an external broker.', hash = sourceContentDigest(content);
    return b.memory.ingest({ namespace:{ ...b.namespace,allowedPaths:['Assets'] },purpose:'knowledge',provenance:{ kind:'primary',originId:'unity-evidence:fixture' },content,
      record:{ schemaVersion:'0.5.0',sourceId:'unity:fixture',sourceType:'evidence',sourceRef:'Assets/not-a-project-file.md',sourceRevision:'r1',contentDigest:hash,observedAt:new Date().toISOString(),freshnessPolicy:'pinned',freshness:'fresh' } },'host:ingest').id;
  });
  await withBrain(root,b => {
    assert.deepEqual(b.reconcileSources(),[]);
    assert.equal(b.knowledge().some(n => n.id === id),true);
  });
});

test('a new process recovers exact plan bytes, artifact/version, lineage and TaskSpec budget through normal resume',async t => {
  const root = project(t);
  const ids = await withBrain(root,b => ({ ...taskOne(b),task:portableTask(b) }));
  // Disposable projections are not authority; removing or corrupting them must not matter.
  writeFileSync(path.join(root,'.architect/SESSION_HANDOFF.json'),'{"not":"authority"}');
  const resumed = hydrate(root);
  assert.equal(resumed.state,'resumable',JSON.stringify(resumed.issues)); assert.deepEqual(resumed.issues,[]);
  assert.equal(resumed.plans.length,1); const plan = resumed.plans[0]!;
  assert.equal(plan.content,TASK_ONE_PLAN); assert.equal(plan.contentDigest,sourceContentDigest(TASK_ONE_PLAN));
  assert.equal(plan.planVersion,1); assert.equal(plan.supersedesPlanRef,null);
  assert.match(plan.planArtifactRef,/^sha256:[a-f0-9]{64}$/); assert.equal(resumed.handoff!.tasks[0]!.planArtifactRef,plan.planArtifactRef);
  assert.deepEqual(plan.task,ids.task); assert.deepEqual(plan.budget,ids.task.budget);
  assert.equal(plan.dependsOn.length,1); assert.equal(plan.dependsOn[0]!.nodeId,ids.claimId); assert.ok(plan.dependsOn[0]!.sourceRefs.includes(ids.sourceNodeId));
  assert.equal(plan.executionAuthorized,false); assert.equal(plan.executionOutcome,'not_started'); assert.equal(resumed.executionAuthorized,false);
});

test('tampered or missing plan artifacts and tampered task records fail closed on resume',async t => {
  for (const fault of ['tamper-artifact','delete-artifact','tamper-record'] as const) {
    const root = project(t);
    const artifactRef = await withBrain(root,b => { taskOne(b); return b.resume().plans[0]!.planArtifactRef; });
    const db = new DatabaseSync(sessionDb(root));
    try {
      if (fault === 'delete-artifact') db.prepare('DELETE FROM artifacts WHERE hash=?').run(artifactRef);
      else if (fault === 'tamper-artifact') {
        const body = JSON.parse(String(db.prepare('SELECT body FROM artifacts WHERE hash=?').get(artifactRef)!.body));
        body.content = 'Silently replaced plan.'; db.prepare('UPDATE artifacts SET body=? WHERE hash=?').run(JSON.stringify(body),artifactRef);
      } else {
        const row = db.prepare("SELECT body FROM records WHERE kind='task' AND id='fixture:task-one'").get()!;
        const body = JSON.parse(String(row.body)); body.task.budget.inputLimit = 999999;
        db.prepare("UPDATE records SET body=? WHERE kind='task' AND id='fixture:task-one'").run(JSON.stringify(body));
      }
    } finally { db.close(); }
    const resumed = hydrate(root);
    assert.equal(resumed.state,'blocked',fault); assert.equal(resumed.plans.length,0,fault); assert.ok(resumed.issues.length > 0,fault);
    assert.equal(JSON.stringify(resumed.plans).includes('Silently replaced plan.'),false);
  }
});

test('plan supersession blocks old handoffs; a new handoff hydrates the next version with lineage',async t => {
  const root = project(t);
  const first = await withBrain(root,b => {
    const one = taskOne(b), before = b.resume().plans[0]!;
    b.recordPlan(portableTask(b),'Revised task-one plan bytes.',[one.claimId]);
    const old = b.resume(); assert.equal(old.state,'blocked'); assert.equal(old.plans.length,0); assert.ok(old.issues.some(x => x.includes('fixture:task-one')));
    b.handoff(['fixture:task-one'],'Continue with revised plan.');
    return before;
  });
  const resumed = hydrate(root);
  assert.equal(resumed.state,'resumable'); const plan = resumed.plans[0]!;
  assert.equal(plan.content,'Revised task-one plan bytes.'); assert.equal(plan.planVersion,2);
  assert.equal(plan.supersedesPlanRef,first.planRef); assert.notEqual(plan.planArtifactRef,first.planArtifactRef);
  // Re-recording identical bytes is idempotent and does not mint a new version.
  await withBrain(root,b => {
    const again = b.recordPlan(portableTask(b),'Revised task-one plan bytes.',[plan.dependsOn[0]!.nodeId]);
    assert.equal(again.planVersion,2); assert.equal(again.planArtifactRef,plan.planArtifactRef); assert.equal(b.resume().state,'resumable');
  });
});

/** Ready-recorded plan input for record-integrity checks; the checklist is structural fixture data only. */
function readyInput(b:ProjectBrain, claimId:string, content:string) {
  const task = portableTask(b); task.taskId = 'fixture:record-integrity';
  const checklist = { schemaVersion:'0.6.0',checklistId:'fixture:integrity-ready',plan:{ ref:'fixture:integrity-plan',version:1,digest:digest({ task,content }) },
    checks:Object.fromEntries(READY_CHECK_IDS.map(key => [key,{ outcome:'pass',evidenceRefs:[claimId],reason:'Offline structural fixture only.' }])),
    openGoalOrAcceptanceQuestions:[],outcome:'ready',reviewedBy:'fixture:critic',reviewedAt:new Date().toISOString() };
  return { task,content,checklist };
}

test('identical recordPlan retry returns the verified canonical record and keeps artifact/version; changed plans still version',async t => {
  const root = project(t);
  await withBrain(root,b => {
    const one = taskOne(b), input = readyInput(b,one.claimId,'Integrity plan v1.');
    const canonical = b.recordPlan(input.task,input.content,[one.claimId],input.checklist);
    assert.equal(canonical.planVersion,1); assert.equal(canonical.readiness,'recorded_ready'); assert.equal(canonical.executionAuthorized,false);
    const retry = b.recordPlan(input.task,input.content,[one.claimId],input.checklist);
    assert.deepEqual(retry,canonical); assert.equal(retry.planArtifactRef,canonical.planArtifactRef); assert.equal(retry.planVersion,1);
    const changed = readyInput(b,one.claimId,'Integrity plan v2.'), second = b.recordPlan(changed.task,changed.content,[one.claimId],changed.checklist);
    assert.equal(second.planVersion,2); assert.equal(second.supersedesPlanRef,canonical.planRef); assert.notEqual(second.planArtifactRef,canonical.planArtifactRef);
    assert.deepEqual(b.recordPlan(changed.task,changed.content,[one.claimId],changed.checklist),second);
  });
});

test('identical recordPlan retry never returns a mutated stored task row',async t => {
  const faults: Record<string,(row:PortableTask) => unknown> = {
    goal:row => ({ ...row,task:{ ...row.task,goal:'SUBSTITUTED GOAL' } }),
    executionFlag:row => ({ ...row,executionAuthorized:true }),
    planDigest:row => ({ ...row,planDigest:digest('forged plan digest') }),
    readiness:row => ({ ...row,readiness:'not_ready' }),
    readyChecklist:row => ({ ...row,readyChecklist:null }),
    planVersion:row => ({ ...row,planVersion:7 }),
  };
  for (const [name,mutate] of Object.entries(faults)) {
    const root = project(t);
    await withBrain(root,b => {
      const one = taskOne(b), input = readyInput(b,one.claimId,'Integrity plan v1.');
      const canonical = b.recordPlan(input.task,input.content,[one.claimId],input.checklist);
      // Private fixture data fault in the mutable session row; the immutable artifact is untouched.
      b.state.write('task',input.task.taskId,mutate(b.state.read<PortableTask>('task',input.task.taskId)!));
      let returned: PortableTask | undefined, error: string | undefined;
      try { returned = b.recordPlan(input.task,input.content,[one.claimId],input.checklist); } catch (e) { error = (e as Error).message; }
      assert.equal(returned,undefined,`${name}: mutated row must not be returned`);
      assert.equal(error,'PORTABLE_PLAN_RECORD_UNVERIFIED',name);
      assert.notEqual(b.state.read<PortableTask>('task',input.task.taskId),undefined);
      assert.ok(b.state.artifactValue(canonical.planArtifactRef) !== undefined,name);
      assert.throws(() => b.handoff([input.task.taskId],'Must not hand off a corrupted record.'),/PORTABLE_HANDOFF_PLAN_UNVERIFIED/,name);
    });
  }
});

test('handoff projection is written only after the canonical session commit and is never read as authority',async t => {
  const root = project(t);
  await withBrain(root,b => {
    taskOne(b); const before = b.resume().handoff!.digest;
    b.state.transaction = () => { throw Error('INJECTED_SESSION_COMMIT_FAILURE'); };
    rmSync(path.join(root,'.architect/SESSION_HANDOFF.json'));
    assert.throws(() => b.handoff(['fixture:task-one'],'Must not appear anywhere.'),/INJECTED_SESSION_COMMIT_FAILURE/);
    assert.equal(existsSync(path.join(root,'.architect/SESSION_HANDOFF.json')),false);
    return before;
  });
  assert.equal(hydrate(root).state,'resumable');
});

test('legacy unpinned handoff packets fail closed instead of hydrating mutable records',async t => {
  const root = project(t);
  await withBrain(root,b => {
    taskOne(b); const current = b.resume().handoff!;
    const legacy = { schemaVersion:'architect-session/1',projectId:b.config.projectId,taskIds:current.taskIds,planRefs:current.planRefs,
      nextStep:'Legacy',dependencyRef:current.dependencyRef,executionAuthorized:false,digest:current.digest };
    b.state.transaction(() => { const ref = b.state.artifact(legacy); b.state.write('session','latest',{ ref }); });
    const resumed = b.resume(); assert.equal(resumed.state,'blocked'); assert.deepEqual(resumed.plans,[]); assert.ok(resumed.issues.includes('handoff-legacy-unpinned'));
  });
});
