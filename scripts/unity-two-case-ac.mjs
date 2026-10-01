// Two-case A→C admission record. Deliberately inert: Root supplies --live only after review.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
const repo=path.resolve(import.meta.dirname,'..'), out=path.resolve(process.argv[2]??'.local/unity-two-case-ac');
const approvalIndex=process.argv.indexOf('--approval-ref'), approvalRef=approvalIndex<0?null:process.argv[approvalIndex+1]??null;
if(fs.existsSync(out))throw Error('TWO_CASE_OUTPUT_MUST_BE_NEW'); fs.mkdirSync(out,{recursive:true,mode:0o700});
const all=JSON.parse(fs.readFileSync(path.join(repo,'unity/walking-skeleton/tasks.json'),'utf8'));
const tasks=all.filter(t=>t.id==='integer-clamp'||t.id==='cell-bounds');
if(tasks.length!==2||tasks.some(t=>t.expectedTestCount!==3))throw Error('TWO_CASE_MANIFEST_REQUIRED');
const observedRaw=322866;
const plan={schemaVersion:'unity-two-case-ac/1',status:approvalRef?'ready-for-root-live':'budget-approval-required',tasks:tasks.map(t=>({id:t.id,targetFile:t.targetFile,expectedTestCount:t.expectedTestCount})),schedule:[...tasks.map(t=>({arm:'A',taskId:t.id,stages:['planner','critic','executor']})),...tasks.map(t=>({arm:'C',taskId:t.id,stages:['ordinary-codex']}))],policy:{order:'A then C',arms:['A','C'],b:false,maxCreditsPerTask:3_000_000,retries:0,stopAfterInfrastructureFailures:2,missingBrokerReceipt:'infrastructure',hostFallback:false,model:'gpt-5.6-terra',runtime:'isolated-codex-0.159.0',unityTool:'unity_compile_test only',stopFile:path.join(out,'STOP')},forecast:{calls:8,observedRawTokens:observedRaw,rawTokens:387439,contingencyPercent:20,rawDefinition:'input plus output; cached input is included in input and not added again',underApprovalThreshold:false,creditsUpperBound:12,weeklyQuotaPercent:1.147,uncertainty:'quota conversion is noisy and not trusted'},moduleReady:{status:approvalRef?'ready':'pending-owner-budget-approval',approvalRef,receiptAttestations:['native event log','broker receipt','hook admission log'],protocolDigest:null}};
plan.protocolDigest='sha256:'+createHash('sha256').update(JSON.stringify(plan)).digest('hex');
fs.writeFileSync(path.join(out,'protocol.json'),JSON.stringify(plan,null,2)+'\n',{mode:0o600});
if(process.argv.includes('--live'))throw Error(approvalRef?'TWO_CASE_LIVE_RUNNER_NOT_ADMITTED: Root must attach the reviewed adapter before dispatch':'TWO_CASE_OWNER_BUDGET_APPROVAL_REQUIRED');
console.log(JSON.stringify({status:'dry-ready',output:out,modelsInvoked:0,forecast:plan.forecast}));
