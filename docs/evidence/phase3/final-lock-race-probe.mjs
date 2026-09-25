// Diagnostic-only probe: changes generated fixture scheduling, not repository/runtime code.
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const verification=JSON.parse(await readFile('docs/evidence/phase3/final-verification.json','utf8'));
const lockModule=pathToFileURL(path.join(verification.cleanDirectory,'dist/src/runtime/lock.js')).href;
const {acquireProjectLock}=await import(lockModule);
async function probe(handlerBeforeReady) {
 const root=await mkdtemp(path.join(tmpdir(),'architect-lock-race-probe-'));
 const install=`process.on('SIGTERM', async () => { await lock.release(); process.exit(0); });`;
 const ready=`console.log('ready'); await new Promise(resolve=>setTimeout(resolve,500));`;
 const script=`import {acquireProjectLock} from ${JSON.stringify(lockModule)}; const lock=await acquireProjectLock(process.argv[1]); ${handlerBeforeReady?install+ready:ready+install} setInterval(()=>{},1000);`;
 const child=spawn(process.execPath,['--input-type=module','-e',script,root],{stdio:['pipe','pipe','pipe']});
 const exited=new Promise(resolve=>child.once('close',(code,signal)=>resolve({code,signal})));
 try {
  await new Promise((resolve,reject)=>{child.once('error',reject);child.stdout.once('data',resolve);});
  child.kill('SIGSTOP');
  let contender;try {const b=await acquireProjectLock(root,{timeoutMs:100});await b.release();contender='unexpected-acquire';}catch(e){contender=e.code;}
  child.kill('SIGCONT');child.kill('SIGTERM');const exit=await exited;
  let next;try {const b=await acquireProjectLock(root);await b.release();next='acquired';}catch(e){next=e.code;}
  return {handlerBeforeReady,contender,exit,next};
 } finally {child.kill('SIGCONT');child.kill('SIGKILL');await exited;await rm(root,{recursive:true,force:true});}
}
const results=[];for(let i=0;i<3;i++){results.push(await probe(false));results.push(await probe(true));}
const report={diagnostic:'ready announcement before SIGTERM handler registration',controlledDelayMs:500,results,confirmed:results.filter(r=>!r.handlerBeforeReady).every(r=>r.next==='LOCK_QUARANTINED'&&r.exit.signal==='SIGTERM')&&results.filter(r=>r.handlerBeforeReady).every(r=>r.next==='acquired'&&r.exit.code===0)};
await writeFile('docs/evidence/phase3/final-lock-race-probe.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
