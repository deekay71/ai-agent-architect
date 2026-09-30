import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { randomUUID, createHash } from 'node:crypto';
import { digest } from '../dist/src/contracts/canonical.js';
import { ReadyChecklistSchema } from '../dist/src/contracts/brain-planning.js';
import { creditMicrosForUsage } from '../dist/src/contracts/credit-usage.js';
import { runUnityComparison, UNITY_COMPARISON_FORECAST } from '../dist/src/unity/comparison.js';
import { runNativeCodexUnityTask } from '../dist/src/unity/native-codex.js';
import { createCurrentCodexTransport, renderCodexRequest } from '../dist/src/providers/codex.js';
import { UNITY_TASK_MANIFEST, proposeVerifiedUnityObservation } from '../dist/src/unity/walking-skeleton.js';
import { MemoryStore } from '../dist/src/memory/index.js';
const repo=path.resolve(import.meta.dirname,'..');
const template=path.join(repo,'unity/walking-skeleton');
const output=path.resolve(process.argv[2]??'.local/unity-comparison-20260930');
const live=process.argv.includes('--live');
if(fs.existsSync(output)) throw Error('Comparison output must be new');
fs.mkdirSync(output,{recursive:true});
const save=(name,data)=>fs.writeFileSync(path.join(output,name),JSON.stringify(data,null,2)+'\n',{flag:'wx'});
const diskTasks=JSON.parse(fs.readFileSync(path.join(template,'tasks.json'),'utf8'));
const taskById=new Map(diskTasks.map(t=>[t.id,t]));
const skill=fs.readFileSync(path.join(template,'execution-recipe.md'),'utf8');
const protocolText=fs.readFileSync(path.join(repo,'docs/s2-brain-comparison-protocol.md'),'utf8');
const tasks=UNITY_TASK_MANIFEST.map(t=>({...t,requirement:taskById.get(t.taskId).requirement}));
const smoke={
 'integer-clamp':'Assert.AreEqual(5, IntegerClamp.Clamp(5, 0, 10));',
 'cell-bounds':'Assert.IsTrue(CellBounds.Contains(0, 0, 2, 2));',
 'coordinate-index':'Assert.AreEqual(3, CoordinateIndex.ToIndex(1, 1, 2, 2));',
 'row-full':'Assert.IsTrue(RowFull.IsFull(new[] { true, true }));',
 'deterministic-seed':'Assert.GreaterOrEqual(DeterministicSeed.FromText("hello"), 0);',
 'score-accumulation':'Assert.AreEqual(5, ScoreAccumulation.Add(2, 3));',
 'json-state-roundtrip':'Assert.Throws<System.ArgumentNullException>(() => JsonStateRoundtrip.RoundTrip(null));',
 'vector2-grid-position':'Assert.AreEqual(new Vector2(2, 4), Vector2GridPosition.ToWorld(1, 2, 2));',
 'duplicate-position':'Assert.IsFalse(DuplicatePosition.HasDuplicate(null));',
 'placement-bounds':'Assert.IsTrue(PlacementBounds.CanPlace(Vector2Int.zero, Vector2Int.one, new Vector2Int(3, 3)));',
};
function preparePublic(task,arm,reference=false){
 const project=path.join(output,arm,task.taskId,'public'); fs.mkdirSync(project,{recursive:true});
 for(const folder of ['Packages','ProjectSettings'])fs.cpSync(path.join(template,folder),path.join(project,folder),{recursive:true});
 const asset=path.join(project,'Assets/WalkingSkeleton');fs.mkdirSync(path.join(asset,'Tasks'),{recursive:true});
 fs.copyFileSync(path.join(template,'Assets/WalkingSkeleton/WalkingSkeleton.asmdef'),path.join(asset,'WalkingSkeleton.asmdef'));
 for(const item of diskTasks)fs.writeFileSync(path.join(project,item.targetFile),reference&&item.id===task.taskId?fs.readFileSync(path.join(template,item.targetFile)):item.stub);
 const tests=path.join(project,'Assets/PublicTests');fs.mkdirSync(tests,{recursive:true});
 fs.copyFileSync(path.join(template,'Assets/Tests/Editor/WalkingSkeleton.Tests.asmdef'),path.join(tests,'Public.Tests.asmdef'));
 fs.writeFileSync(path.join(tests,'PublicSmoke.cs'),`using NUnit.Framework; using UnityEngine; using WalkingSkeleton.Tasks; public class PublicSmoke { [Test] public void RequirementSmoke() { ${smoke[task.taskId]} } }`);
 const target=path.join(project,task.targetFile),artifacts=path.join(output,arm,task.taskId,'artifacts');fs.mkdirSync(artifacts,{recursive:true});
 const result=spawnSync('/usr/bin/python3',['-c','import importlib.util,sys; from pathlib import Path; s=importlib.util.spec_from_file_location("bridge",sys.argv[1]);m=importlib.util.module_from_spec(s);s.loader.exec_module(m);print(m.snapshot(Path(sys.argv[2]),Path(sys.argv[3])))',path.join(repo,'scripts/unity-test-mcp.py'),project,target],{encoding:'utf8'});
 if(result.status!==0)throw Error('Broker snapshot failed');
 const evalProject=path.join(output,arm,task.taskId,'private-eval');fs.mkdirSync(evalProject,{recursive:true});
 for(const folder of ['Assets','Packages','ProjectSettings'])fs.cpSync(path.join(project,folder),path.join(evalProject,folder),{recursive:true});
 fs.rmSync(path.join(evalProject,'Assets/PublicTests'),{recursive:true});
 fs.cpSync(path.join(template,'Assets/Tests'),path.join(evalProject,'Assets/Tests'),{recursive:true});
 const d=taskById.get(task.taskId);
 const args=[path.join(repo,'scripts/unity-test-mcp.py'),project,target,result.stdout.trim(),path.join(artifacts,'unity'),evalProject,d.testFilter,String(d.expectedTestCount),arm==='C'?'0':'1'];
 const fixedMcpConfig=['mcp_servers.unity_public.command="/usr/bin/python3"',`mcp_servers.unity_public.args=${JSON.stringify(args)}`,'mcp_servers.unity_public.startup_timeout_sec=20','mcp_servers.unity_public.tool_timeout_sec=210'];
 return {project,target,artifacts,args,fixedMcpConfig,evalProject};
}
// Probe the broker with a known-correct implementation in a throwaway PUBLIC fixture.
// This project is never handed to a model and no reference DLL/cache is copied forward.
const probe=preparePublic(tasks[0],'preflight-only',true);
const requests=[{jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2024-11-05'}},{jsonrpc:'2.0',id:2,method:'tools/list'},{jsonrpc:'2.0',id:3,method:'tools/call',params:{name:'unity_compile_test',arguments:{}}}];
const check=spawnSync('/usr/bin/python3',probe.args,{input:requests.map(r=>JSON.stringify(r)).join('\n')+'\n',encoding:'utf8',timeout:220000,maxBuffer:100000});
if(check.status!==0)throw Error('Broker preflight process failed');
const messages=check.stdout.trim().split('\n').map(x=>JSON.parse(x));
const receipt=JSON.parse(messages.find(m=>m.id===3).result.content[0].text);
save('broker-preflight.json',{outcome:receipt.outcome,tests:receipt.tests,commandInterface:'fixed private evaluation of sole public candidate; identical feedback across arms',hiddenOracleInPublicProject:false});
if(receipt.outcome!=='pass')throw Error('Broker preflight did not pass');
if(!live){console.log(JSON.stringify({preflight:'pass',output,modelsInvoked:0}));process.exit(0);}
const ready=JSON.parse(fs.readFileSync(path.join(repo,'docs/evidence/planning-r3/s2-module-ready-records.json'),'utf8'));
ReadyChecklistSchema.parse(ready.records.readyChecklist);
if(ready.records.readyChecklist.outcome!=='ready'||ready.records.readyChecklist.plan.digest!=='sha256:'+createHash('sha256').update(protocolText).digest('hex'))throw Error('READY_PROTOCOL_BINDING_REQUIRED');
const nativeProofFile=path.join(repo,'docs/evidence/unity-s1-20260930/native-offline-preflight.json');
if(!fs.existsSync(nativeProofFile)||JSON.parse(fs.readFileSync(nativeProofFile,'utf8')).status!=='pass')throw Error('NATIVE_COMPARISON_PREFLIGHT_REQUIRED');
const s1=JSON.parse(fs.readFileSync(path.join(repo,'docs/evidence/unity-s1-20260930/results.json'),'utf8'));
if(s1.status!=='Pass')throw Error('S1_REQUIRED');
const permissionShape={sandbox:'root-deny-minimal-read-public-project-write',unityTool:'fixed-private-evaluation-host-CLI',hiddenTests:'source-inaccessible-results-shared',target:'sole task target',sameArms:true};
const sourceMaterial=['scripts/unity-comparison-local.mjs','scripts/unity-test-mcp.py','src/unity/comparison.ts','src/unity/native-codex.ts','src/unity/walking-skeleton.ts'].map(file=>({file,digest:digest(fs.readFileSync(path.join(repo,file),'utf8'))}));
const base=spawnSync('git',['rev-parse','HEAD'],{cwd:repo,encoding:'utf8'});if(base.status!==0)throw Error('BASE_REVISION_REQUIRED');
const material={protocol:{text:protocolText,baseRevision:base.stdout.trim(),purpose:'phase-acceptance',phaseCapWeeklyPoints:10,authorization:'owner-R3-accepted-2026-09-30-conditional-S1-lock-forecast',forecast:UNITY_COMPARISON_FORECAST,permissionShape},skills:skill,source:sourceMaterial};
const lock={locked:true,protocolDigest:digest(material.protocol),tasksDigest:digest(tasks),skillsDigest:digest(skill),sourceDigest:digest(sourceMaterial),modelsDigest:digest({planner:'gpt-6-sol',critic:'gpt-6-sol',executor:'gpt-5.6-terra',c:'gpt-5.6-terra'}),unityCliPermissionsDigest:digest(permissionShape)};
save('lock.json',{lock,material,tasks,taskDiskDigest:digest(diskTasks),hiddenOracleDigest:digest(fs.readFileSync(path.join(template,'Assets/Tests/Editor/WalkingSkeletonFixtureTests.cs'),'utf8')),nativePreflight:JSON.parse(fs.readFileSync(nativeProofFile,'utf8'))});
const publicProjects=new Map(); const brainArtifacts=new Map(); const latestBrokerRoots=new Map();
const namespace={repoId:'unity-comparison',branchId:'round1',lineageId:lock.protocolDigest,allowedPaths:['unity/comparison'],taskClasses:['unity.microtask']};
const memory=new MemoryStore(path.join(output,'memory'),{namespaces:[namespace],principals:[{id:'executor',role:'executor',projectIds:[namespace.repoId]},{id:'critic',role:'critic',projectIds:[namespace.repoId]},{id:'verifier',role:'verificationRunner',projectIds:[namespace.repoId]},{id:'promoter',role:'memoryPromoter',projectIds:[namespace.repoId]}]});
function projectFor(task,arm){const key=arm+':'+task.taskId;if(!publicProjects.has(key))publicProjects.set(key,preparePublic(task,arm));return publicProjects.get(key);}
const transport=createCurrentCodexTransport({maxRequestBytes:16000,timeoutMs:180000});
const planSchema={type:'object',properties:{steps:{type:'array',items:{type:'string'}},acceptance:{type:'array',items:{type:'string'}}},required:['steps','acceptance'],additionalProperties:false};
const criticSchema={type:'object',properties:{approved:{type:'boolean'},findings:{type:'array',items:{type:'string'}}},required:['approved','findings'],additionalProperties:false};
async function native(task,arm,budget,extra){
 const p=projectFor(task,arm);const run=path.join(p.artifacts,randomUUID());
 const brokerRoot=path.join(run,'unity');latestBrokerRoots.set(arm+':'+task.taskId,brokerRoot);const args=[...p.args];args[4]=brokerRoot;
 const fixedMcpConfig=p.fixedMcpConfig.map(v=>v.startsWith('mcp_servers.unity_public.args=')?'mcp_servers.unity_public.args='+JSON.stringify(args):v);
 const prompt=skill+'\nTask: '+task.requirement+'\nOnly implementation file: '+task.targetFile+'\nUse unity_public.unity_compile_test for Unity (direct shell Unity is unavailable in this sandbox). The supplied public smoke test is immutable; you may add no other code/files in Assets, Packages, ProjectSettings. The broker returns the pinned test results, but test source is outside your workspace.\n'+extra;
 const r=await runNativeCodexUnityTask({projectPath:p.project,targetFile:task.targetFile,prompt,artifactDirectory:run,maxCreditMicros:budget,fixedMcpConfig});
 let violation;
 if(arm!=='C'&&fs.existsSync(brokerRoot)){
  const receipts=brokerReceipts(brokerRoot);
  if(receipts.length>1||(receipts.length===1&&receipts[0].sourceSha256!==createHash('sha256').update(r.source??'').digest('hex')))violation='infrastructure: one-candidate protocol violated after verification';
 }
 // An interrupted turn can have an in-flight response beyond the latest counter.
 // Preserve that observed counter in the native receipt, but never settle it as final.
 const usage=r.status==='failed'?{model:r.model,inputTokens:null,cachedInputTokens:null,outputTokens:null}:r.usage;
 return {...r,usage,status:violation?'failed':r.status,error:violation??r.error??undefined,artifact:{sourceDigest:r.sourceDigest,eventLogDigest:r.eventLogDigest,observedUsage:r.usage}};
}
const model={async runAStage({task,stage,priorStages,maxTaskCreditMicros}){
 const spent=creditMicrosForUsage(priorStages.map(r=>r.usage));if(spent===null)throw Error('UNKNOWN_PRIOR_USAGE');
 if(stage==='executor'){brainArtifacts.set(task.taskId,priorStages.map(r=>r.artifact));return native(task,'A',maxTaskCreditMicros-spent,'Use the checked plan below. Produce one implementation candidate only. You may compile/test that candidate once; do not repair after seeing test output in arm A. End the turn after reporting the result. Plan and critic: '+JSON.stringify(priorStages.map(r=>r.artifact)));}
 const p=projectFor(task,'A'),schema=stage==='planner'?planSchema:criticSchema;
 const input={requirement:task.requirement,stub:taskById.get(task.taskId).stub,skill,priorStages:priorStages.map(r=>r.artifact),context:memory.query({namespace,limit:2}).filter(n=>n.kind==='claim').map(n=>({id:n.id,content:n.content}))};
 const req={model:'gpt-6-sol',reasoningEffort:'medium',maxOutputTokens:2000,instructions:'You are the '+stage+' in a Unity microtask chain. Return the requested JSON. Do not use tools. Plan fully covers requirements; critic independently approves or rejects.',input:JSON.stringify(input),schema,schemaName:'unity_'+stage};
 if(Buffer.byteLength(renderCodexRequest(req))>16000||maxTaskCreditMicros-spent<866700)throw Error('PLAN_RESERVATION_UNAVAILABLE');
 const r=await transport.respond(req);save('call-'+randomUUID()+'.json',r);
 brainArtifacts.set(task.taskId,[...priorStages.map(receipt=>receipt.artifact),r.output??null]);
 const usage=r.usage?{model:'gpt-6-sol',inputTokens:r.usage.inputTokens,cachedInputTokens:r.usage.cachedInputTokens,outputTokens:r.usage.outputTokens}:{model:'gpt-6-sol',inputTokens:null,cachedInputTokens:null,outputTokens:null};
 return {receiptId:r.requestDigest+':'+randomUUID(),model:'gpt-6-sol',usage,elapsedMs:r.elapsedMs,status:r.status==='completed'&&r.issues.length===0?'completed':'failed',artifact:r.output??null,toolProofRefs:[],...(stage==='critic'?{criticApproved:r.output?.approved===true}:{}),error:r.issues.join(',')||undefined};
},async repairB({task,attempt,previousSource,feedback,maxCreditMicros}){
 const p=projectFor(task,'B');fs.writeFileSync(p.target,previousSource||taskById.get(task.taskId).stub);
 return native(task,'B',Math.min(maxCreditMicros,966700),'Repair attempt '+attempt+' of at most two. Produce one corrected candidate then stop after one compile/test. Reused A plan and critic: '+JSON.stringify(brainArtifacts.get(task.taskId))+' Prior verification feedback: '+feedback);
}};
function brokerReceipts(root){
 if(!fs.existsSync(root))return [];
 return fs.readdirSync(root).map(id=>path.join(root,id,'receipt.json')).filter(f=>fs.existsSync(f)).map(f=>({...JSON.parse(fs.readFileSync(f,'utf8')),receiptFile:f})).sort((a,b)=>fs.statSync(a.receiptFile).mtimeMs-fs.statSync(b.receiptFile).mtimeMs);
}
const verifier={async verify({arm,task,source}){
 const p=projectFor(task,arm);fs.writeFileSync(p.target,source);
 let brokerRoot=latestBrokerRoots.get(arm+':'+task.taskId),list=brokerRoot?brokerReceipts(brokerRoot):[];
 const sourceHash=createHash('sha256').update(source).digest('hex');
 let result=list.at(-1);
 if(!result||result.sourceSha256!==sourceHash){
  // C can edit after its last tool call. A/B can arrive here without making a tool call.
  brokerRoot=path.join(p.artifacts,'final-'+randomUUID());const args=[...p.args];args[4]=brokerRoot;
  const run=spawnSync('/usr/bin/python3',args,{input:JSON.stringify(requests[2])+'\n',encoding:'utf8',timeout:220000,maxBuffer:100000});
  if(run.status!==0) return {outcome:'unknown',feedback:'Infrastructure failure: verifier broker unavailable',evidenceId:'broker:'+randomUUID(),hiddenPass:false,manualOwnerFixes:0};
  result=JSON.parse(JSON.parse(run.stdout.trim()).result.content[0].text);
 }
 const outcome=result.outcome==='pass'?'pass':result.outcome==='model'?'fail':'unknown';
 const feedback=(outcome==='fail'?'Compile/test failed: ':outcome==='unknown'?'Infrastructure failure: ':'')+JSON.stringify(result);
 const prior=brainArtifacts.get(task.taskId),planDigest=digest({task:task.taskId,arm,artifacts:arm==='C'?null:prior});
 const summary={total:result.tests?.length??0,passed:0,failed:0,skipped:0,inconclusive:0};
 for(const t of result.tests??[]) {const key={Passed:'passed',Failed:'failed',Skipped:'skipped',Inconclusive:'inconclusive'}[t.result];if(key)summary[key]++;}
 const evidence={schemaVersion:'unity-evidence/1',evidenceId:'unity:'+randomUUID(),projectPath:p.evalProject,unityVersion:'6000.0.84f1',unityCliVersion:'1.0.0-beta.8',sourceSnapshotDigest:digest({sourceHash,protected:result.protectedBeforeDigest}),sourceSnapshotAfterDigest:digest({sourceHash,protected:result.protectedAfterDigest}),commandDigest:'sha256:'+result.commandDigest,testXmlDigest:'sha256:'+result.xmlDigest,logDigest:'sha256:'+result.logDigest,testSummary:summary,outcome,checkedPlanDigest:planDigest,executionDigest:digest(source)};
 save('evidence-'+randomUUID()+'.json',{evidence,broker:result});
 if(outcome==='pass'&&arm!=='C'){
  const proposal=proposeVerifiedUnityObservation({store:memory,namespace,evidence,executorId:'executor',verifierId:'verifier',promoterId:'promoter'});
  const review=memory.validate(proposal.delta.deltaId,{reviewRef:proposal.delta.promotionReviewRef,decision:'approve',reason:'Finite observed Unity test result; pinned source and hidden suite passed.'},'critic');
  if(!review.valid)throw Error('MEMORY_REVIEW_FAILED');memory.promote(proposal.delta.deltaId,'promoter');
 }
 return {outcome,feedback,evidenceId:evidence.evidenceId,hiddenPass:outcome==='pass',manualOwnerFixes:0};
}};
const cExecutor={kind:'ordinary-codex',model:'gpt-5.6-terra',toolEnabled:true,skillsDigest:lock.skillsDigest,unityCliPermissionsDigest:lock.unityCliPermissionsDigest,
 async runCToolEnabled({task,maxCreditMicros}){return native(task,'C',maxCreditMicros,'Implement the requirement using your normal Codex workflow. You may inspect the public project, edit the target, run Unity through the supplied tool, and fix your work until satisfied or the credit allowance is near exhausted. No Brain planner/critic is provided.');}};
const rows=[];
const report=await runUnityComparison({mode:'live',tasks,lock,lockMaterial:material,admission:{conditionalAuthorizationRef:material.protocol.authorization,s1Passed:true,lockedProtocol:true,forecastWeeklyQuotaPercent:UNITY_COMPARISON_FORECAST.weeklyQuotaPercent},model,verifier,cExecutor,
 onResult(arm,row){rows.push({arm,row});fs.writeFileSync(path.join(output,'progress.json'),JSON.stringify(rows,null,2));process.stdout.write(JSON.stringify({arm,taskId:row.taskId,outcome:row.outcome,credits:row.creditMicros===null?null:row.creditMicros/1e6})+'\n');},
 shouldStop(){return fs.existsSync(path.join(output,'STOP'));}});
save('report.json',report);save('memory-snapshot.json',memory.writeMarkdownSnapshot(namespace).snapshot);memory.close();console.log(JSON.stringify({output,stoppedReason:report.stoppedReason,summary:report.summary,decision:report.decision}));
