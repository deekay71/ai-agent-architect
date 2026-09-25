import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { digest } from '../contracts/canonical.js';
import { MemoryStore } from '../memory/store.js';
import { BENCHMARK_READER_POLICY, loadBenchmarkInputs, runMemoryBenchmark, verifyBenchmarkLock } from './engine.js';
import { createMemoryBenchmarkAdapter } from './memory-adapter.js';
import { parseCSharpFixture, rawDigest } from './parser.js';
import { runCompactionProbe } from './context-probe.js';

function implementationPins(repoRoot:string):Record<string,string> {
  const files:string[]=[];
  for(const sub of ['src/benchmark','src/memory','src/context','src/contracts']) {
    for(const entry of readdirSync(join(repoRoot,sub),{withFileTypes:true}))if(entry.isFile()&&entry.name.endsWith('.ts'))files.push(`${sub}/${entry.name}`);
  }
  files.push('fixtures/contracts.ts','src/foundation/permissions.ts','src/skills/catalog.ts','package.json','pnpm-lock.yaml','tsconfig.json');
  return Object.fromEntries(files.sort().map(file=>[file,rawDigest(readFileSync(join(repoRoot,file)))]));
}
export async function runBenchmarkCampaign(repoRoot:string,outputPath:string) {
  const root=resolve(repoRoot),fixtureRoot=join(root,'fixtures/memory-benchmark'),output=resolve(outputPath);
  if(existsSync(output)||existsSync(`${output}.manifest.json`)||existsSync(`${output}.trials.jsonl`))throw new Error('Evidence already exists; choose a new output path to preserve every attempt');
  const fixtureLockDigest=verifyBenchmarkLock(fixtureRoot),pins=implementationPins(root),startedAt=new Date().toISOString();
  mkdirSync(dirname(output),{recursive:true});
  writeFileSync(`${output}.manifest.json`,JSON.stringify({startedAt,fixtureLockDigest,evaluationPolicy:BENCHMARK_READER_POLICY,implementationPins:pins,implementationDigest:digest(pins),holdoutPolicy:'No tuning after holdout; preserve every run including failed thresholds.'},null,2)+'\n',{flag:'wx'});
  writeFileSync(`${output}.trials.jsonl`,'',{flag:'wx'});
  let completedTrials=0;
  const database=mkdtempSync(join(tmpdir(),'phase3-memory-benchmark-'));
  try {
    const inputs=loadBenchmarkInputs(fixtureRoot);
    const adapter=createMemoryBenchmarkAdapter(fixtureRoot,database,(dir,options)=>new MemoryStore(dir,options));
    const benchmark=runMemoryBenchmark(inputs,adapter,fixtureLockDigest,trial=>{appendFileSync(`${output}.trials.jsonl`,JSON.stringify(trial)+'\n');completedTrials++;});
    const codeDir=join(fixtureRoot,'corpus/code');
    const parser=parseCSharpFixture(readdirSync(codeDir).filter(f=>f.endsWith('.cs')).sort().map(file=>({path:relative(fixtureRoot,join(codeDir,file)),content:readFileSync(join(codeDir,file),'utf8')})));
    const dotnet=spawnSync('dotnet',['--version'],{encoding:'utf8'});
    const compaction=await runCompactionProbe();
    const fixtureUnchanged=verifyBenchmarkLock(fixtureRoot)===fixtureLockDigest,implementationUnchanged=digest(implementationPins(root))===digest(pins);
    if(!fixtureUnchanged||!implementationUnchanged)throw new Error('Sources changed during campaign; result invalid');
    const result={...benchmark,sourceIntegrity:{fixtureUnchanged,implementationUnchanged,implementationDigest:digest(pins)},parser:{...parser,dotnetAvailable:dotnet.status===0,compilation:'NOT_RUN',androidBuild:'NOT_RUN'},compaction};
    writeFileSync(output,JSON.stringify(result,null,2)+'\n',{flag:'wx'});
    return result;
  } catch(error) {
    writeFileSync(output,JSON.stringify({schemaVersion:'mechanical-memory-benchmark/1',startedAt,fixtureLockDigest,status:'RUN_ERROR',completedTrials,trialJournal:`${output}.trials.jsonl`,message:error instanceof Error?error.message:String(error)},null,2)+'\n',{flag:'wx'});
    throw error;
  }finally{rmSync(database,{recursive:true,force:true});}
}
if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  const output=process.argv[2]??'docs/evidence/phase3/benchmark-results.json';
  const result=await runBenchmarkCampaign(process.cwd(),output);
  process.exitCode=result.mechanicalThresholdsMet?0:2;
  console.log(JSON.stringify({output,trialCount:result.trials.length,thresholdChecks:result.thresholdChecks,mechanicalThresholdsMet:result.mechanicalThresholdsMet,semanticAcceptance:result.semanticAcceptance,evaluationPolicy:result.evaluationPolicy,compactionPassed:result.compaction.passed},null,2));
}
