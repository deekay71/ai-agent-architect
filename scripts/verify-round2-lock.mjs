import fs from 'node:fs';import {createHash} from 'node:crypto';
import {ReadyChecklistSchema} from '../dist/src/contracts/brain-planning.js';
import {validateRound2BudgetPolicy,admitRound2Pair} from '../dist/src/unity/round2-admission.js';
const root='docs/evidence/round2-preparation-20261001';
const hash=bytes=>'sha256:'+createHash('sha256').update(bytes).digest('hex');
const lock=JSON.parse(fs.readFileSync(root+'/lock.json')),bytes=fs.readFileSync(root+'/protocol.json'),p=JSON.parse(bytes);
if(hash(bytes)!==lock.protocolDigest||!p.locked)throw Error('PROTOCOL_DRIFT');
if(hash(fs.readFileSync(p.instructionsRef))!==p.instructionsDigest)throw Error('INSTRUCTIONS_DRIFT');
for(const f of p.fixtureManifest)if(createHash('sha256').update(fs.readFileSync(f.path)).digest('hex')!==f.sha256)throw Error('FIXTURE_DRIFT:'+f.path);
validateRound2BudgetPolicy(p.policy);
const ready=ReadyChecklistSchema.parse(JSON.parse(fs.readFileSync(root+'/ready.json')));
if(ready.plan.digest!==lock.protocolDigest||ready.outcome!=='ready')throw Error('READY_NOT_BOUND');
if(p.tasks.length!==6||p.tasks.reduce((s,t)=>s+t.hiddenCases.reduce((a,b)=>a+b,0),0)!==30)throw Error('TASK_COVERAGE');
for(const t of p.tasks)if(t.sessions!==t.sessionCaps.length||t.sessionCaps.reduce((a,b)=>a+b,0)!==t.creditCapPerArm||t.sessions!==t.allowedPaths.length)throw Error('SESSION_CREDIT_OR_SCOPE');
for(const [name,count,result] of [['baseline-edit',25,'Failed'],['baseline-play',5,'Failed'],['positive-edit',25,'Passed'],['positive-play',5,'Passed']]){
 const summary=JSON.parse(fs.readFileSync(root+'/'+name+'/summary.json'));
 if(summary.tests.length!==count||summary.tests.some(t=>t.result!==result)||summary.infrastructure)throw Error('FIXTURE_PROOF:'+name);
}
const now=Date.now(),s={weeklyUsedPercent:49,hardStopUsedPercent:85,observedAt:new Date(now).toISOString(),resetsAt:p.policy.resetAt,step:4,stepStartUsedPercent:49,admissionUnit:'pair'};
if(!admitRound2Pair(s,6e6,6e6,18e6,p.forecast.creditsPerWeeklyPoint,now).allowed)throw Error('FORECAST_NOT_FIT');
console.log(JSON.stringify({status:'pass',protocolDigest:lock.protocolDigest,checks:7,hiddenCases:30,modelsInvoked:0,executionReady:false}));
