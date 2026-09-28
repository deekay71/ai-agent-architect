import {createCodexTransport,runCodexProcess} from '../../dist/src/providers/codex.js';
const notices=[];
const runner=async inv=>{
 const original=inv.onStdoutLine;
 return runCodexProcess({...inv,binary:'/usr/bin/sandbox-exec',args:['-p','(version 1)(allow default)(deny network*)',inv.binary,...inv.args],timeoutMs:5000,onStdoutLine:original?line=>{
  let e;try{e=JSON.parse(line)}catch{return original(line)}
  if(e.type==='item.completed'&&e.item?.type==='error'){
   const message=String(e.item.message??e.item.text??'');
   notices.push(message.replace(/https?:\/\/\S+/g,'[URL]').replace(/\/Users\/[^\s]+/g,'[PATH]').slice(0,1200));
  }
  return original(line);
 }:undefined});
};
const result=await createCodexTransport({runner,timeoutMs:5000}).respond({model:'gpt-5.6-terra',reasoningEffort:'medium',instructions:'Return the supplied literal JSON.',input:'{"answer":"READY"}',maxOutputTokens:100,schema:{type:'object',properties:{answer:{type:'string'}},required:['answer'],additionalProperties:false},schemaName:'offline_probe'});
console.log(JSON.stringify({scope:'Offline startup diagnostic; macOS sandbox denies all network; injected runner is mock assurance, never semantic evidence',notices,result},null,2));
