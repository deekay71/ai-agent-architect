import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { runNativeCodexUnityTask, type NativeCodexNotification } from '../src/unity/native-codex.js';
test('1.5 cap interrupts, preserves final file and last counter for hidden grading', async () => {
 const root=mkdtempSync(path.join(tmpdir(),'hard-cap-')), project=path.join(root,'public'); mkdirSync(project); writeFileSync(path.join(project,'Task.cs'),'final state');
 let listener: (n: NativeCodexNotification)=>void = ()=>{}; let interrupts=0;
 const emit=(method:string, params:unknown)=>listener({method,params});
 const receipt=await runNativeCodexUnityTask({projectPath:project,targetFile:'Task.cs',prompt:'task',artifactDirectory:path.join(root,'artifacts'),maxCreditMicros:1000,connectionFactory:{async open(){return {
  async request(method:string){
   if(method==='initialize')return {};
   if(method==='mcpServerStatus/list')return {data:[{name:'unity_public',tools:{unity_compile_test:{}}}],nextCursor:null};
   if(method==='thread/start')return {thread:{id:'thread-1'}};
   if(method==='turn/start'){setTimeout(()=>{emit('turn/started',{turn:{id:'turn-1'}});emit('thread/tokenUsage/updated',{threadId:'thread-1',turnId:'turn-1',tokenUsage:{total:{inputTokens:40,cachedInputTokens:0,outputTokens:0}}});},0);return {turn:{id:'turn-1'}};}
   if(method==='turn/interrupt'){interrupts++;queueMicrotask(()=>emit('turn/completed',{turn:{id:'turn-1',status:'interrupted'}}));return {};}
   return {};
  },async notify(){},onNotification(fn){listener=fn;return ()=>{};},async close(){}
 };}}});
 assert.equal(interrupts,1);assert.equal(receipt.hardStopCreditMicros,1500);assert.equal(receipt.creditMicros,2000);assert.equal(receipt.usageSettlement,'unsettled');assert.equal(receipt.source,'final state');assert.equal(receipt.error,'NATIVE_CODEX_HARD_CREDIT_STOP');
 assert.equal(readFileSync(path.join(root,'artifacts/tool-admission.flag'),'utf8').trim(),'closed');
});
