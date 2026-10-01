import fs from 'node:fs';
import path from 'node:path';
import { nativeCodexAppServerConnection, nativeCodexAppServerArgs, HARNESS_CODEX_HOME, HARNESS_WORKSPACE } from '../dist/src/unity/native-codex.js';
import { CURRENT_CODEX_BINARY_PATH, codexChildEnvironment } from '../dist/src/providers/codex.js';
const connection = await nativeCodexAppServerConnection.open({binaryPath:CURRENT_CODEX_BINARY_PATH,args:nativeCodexAppServerArgs([]),cwd:HARNESS_WORKSPACE,env:{...codexChildEnvironment(),CODEX_HOME:HARNESS_CODEX_HOME},rawLogDirectory:HARNESS_CODEX_HOME});
const timer=setTimeout(()=>{void connection.close();process.exitCode=1;},15000);
try {
 await connection.request('initialize',{clientInfo:{name:'harness-hook-status',version:'1'},capabilities:{}});await connection.notify('initialized',{});
 const inventory=await connection.request('hooks/list',{cwd:HARNESS_WORKSPACE});
 const hook=inventory.data?.flatMap(row=>row.hooks??[]).find(h=>h.sourcePath===path.join(HARNESS_CODEX_HOME,'hooks.json'));
 const summary={modelsInvoked:0,trusted:hook?.enabled===true&&hook?.trustStatus==='trusted',hook:hook??null,inventory};
 console.log(JSON.stringify(summary));
 if(process.argv[2])fs.writeFileSync(process.argv[2],JSON.stringify(summary,null,2)+'\n');
} finally {clearTimeout(timer);await connection.close();}
