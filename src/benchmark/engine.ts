import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { performance } from 'node:perf_hooks';
import { cpus, platform, arch, release, totalmem } from 'node:os';
import { z } from 'zod';
import { digest } from '../contracts/canonical.js';
import { rawDigest } from './parser.js';

const Fact = z.strictObject({ subject: z.string(), predicate: z.string(), value: z.string() });
const Document = z.strictObject({ id: z.string(), revision: z.string(), lifecycle: z.enum(['active', 'superseded', 'revoked', 'quarantined']), freshness: z.enum(['fresh','stale','unknown']), path: z.string(), text: z.string(), facts: z.array(Fact), links: z.array(z.strictObject({target:z.string(),kind:z.enum(['explicit','inferred']),relation:z.string()})) });
const Question = z.strictObject({id:z.string(),split:z.enum(['dev','holdout']),family:z.string(),query:z.string(),subject:z.string(),predicate:z.string()});
const Gold = z.strictObject({id:z.string(),expected:z.string().nullable(),relevantIds:z.array(z.string()),criticalIds:z.array(z.string())});
export type BenchmarkDocument = z.infer<typeof Document>;
export type BenchmarkQuestion = z.infer<typeof Question>;
export type BenchmarkGold = z.infer<typeof Gold>;
export type BenchmarkMode = 'lexical' | 'explicit-graph';
export interface BenchmarkHit { id: string; content: string; eligible: boolean }
export interface BenchmarkSession { retrieve(query: string, mode: BenchmarkMode, limit: number): BenchmarkHit[]; close(): void }
export interface BenchmarkAdapter { name: string; ingestedIds: string[]; ingestedPaths: string[]; open(): BenchmarkSession }
export interface Protocol { version: string; budgets: number[]; budgetUnit: string; topK: number; repeats: number; modes: BenchmarkMode[]; trialOrder: string; reader: string; thresholds: {maxFalseAcceptance:number;maxIneligibleRetrieved:number;maxOracleLeaks:number;minimumHoldoutRecallAtLargestBudget:number}; thresholdNotes:string }
export interface BenchmarkInputs { documents: BenchmarkDocument[]; questions: BenchmarkQuestion[]; gold: BenchmarkGold[]; protocol: Protocol }
export function loadCorpus(root: string): BenchmarkDocument[] { return z.array(Document).parse(JSON.parse(readFileSync(join(root, 'corpus/documents.json'),'utf8'))); }
export function loadBenchmarkInputs(root: string): BenchmarkInputs {
  const documents=loadCorpus(root), questions=z.array(Question).parse(JSON.parse(readFileSync(join(root,'questions.json'),'utf8'))), gold=z.array(Gold).parse(JSON.parse(readFileSync(join(root,'oracle/gold.json'),'utf8')));
  const protocol=JSON.parse(readFileSync(join(root,'protocol.json'),'utf8')) as Protocol;
  if (new Set(documents.map(d=>d.id)).size!==documents.length || new Set(questions.map(q=>q.id)).size!==questions.length || new Set(gold.map(g=>g.id)).size!==gold.length) throw new Error('Duplicate fixture identity');
  if (questions.length!==30 || questions.filter(q=>q.split==='dev').length!==20 || questions.filter(q=>q.split==='holdout').length!==10) throw new Error('Expected locked 20 dev / 10 holdout split');
  if (gold.length!==questions.length || questions.some(q=>!gold.some(g=>g.id===q.id))) throw new Error('Oracle coverage mismatch');
  const devFamilies=new Set(questions.filter(q=>q.split==='dev').map(q=>q.family));
  if (questions.some(q=>q.split==='holdout' && devFamilies.has(q.family))) throw new Error('Scenario family leakage across split');
  if (gold.some(g=>[...g.relevantIds,...g.criticalIds].some(id=>!documents.some(d=>d.id===id)))) throw new Error('Unknown gold source');
  return {documents,questions,gold,protocol};
}
export function fixturePins(root: string): Record<string,string> {
  const paths:string[]=[];
  const walk=(dir:string):void=>{ for(const entry of readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))) { if(entry.isSymbolicLink())throw new Error('Fixture symlink rejected'); const p=join(dir,entry.name); if(entry.isDirectory())walk(p);else if(entry.isFile() && entry.name!=='campaign-lock.json')paths.push(p); } };
  walk(root); return Object.fromEntries(paths.map(path=>[relative(root,path),rawDigest(readFileSync(path))]));
}
export function lockBenchmark(root: string): void {
  loadBenchmarkInputs(root);
  const pins=fixturePins(root);
  writeFileSync(join(root,'campaign-lock.json'),JSON.stringify({schemaVersion:'benchmark-lock/1',lockedAt:new Date().toISOString(),pins,digest:digest(pins)},null,2)+'\n',{flag:'wx'});
}
export function verifyBenchmarkLock(root: string): string {
  const lock=JSON.parse(readFileSync(join(root,'campaign-lock.json'),'utf8')) as {pins:Record<string,string>;digest:string};
  if(digest(lock.pins)!==lock.digest || digest(fixturePins(root))!==lock.digest)throw new Error('Benchmark fixture/config/oracle drift after lock');
  return lock.digest;
}
export function selectWithinBudget(hits: readonly BenchmarkHit[], budget:number): {hits:BenchmarkHit[];bytes:number;excluded:string[]} {
  let bytes=0; const selected:BenchmarkHit[]=[],excluded:string[]=[];
  for(const hit of hits){const size=Buffer.byteLength(hit.content,'utf8');if(bytes+size<=budget){selected.push(hit);bytes+=size;}else excluded.push(hit.id);}
  return {hits:selected,bytes,excluded};
}
/** No oracle parameter: this reader performs exact matching on structured source facts, not semantic interpretation. */
export function mechanicalRead(question: BenchmarkQuestion, hits: readonly BenchmarkHit[]): {disposition:'supported'|'abstain';value:string|null;sourceIds:string[]} {
  const found: {value:string;sourceId:string}[]=[];
  for(const hit of hits.filter(h=>h.eligible)) {
    let facts:z.infer<typeof Fact>[]=[];
    try {const payload=JSON.parse(hit.content) as {facts?:unknown};facts=z.array(Fact).parse(payload.facts);}catch{continue;}
    for(const fact of facts)if(fact.subject===question.subject && fact.predicate===question.predicate)found.push({value:fact.value,sourceId:hit.id});
  }
  const values=[...new Set(found.map(f=>f.value))];
  return values.length===1?{disposition:'supported',value:values[0]!,sourceIds:found.map(f=>f.sourceId)}:{disposition:'abstain',value:null,sourceIds:found.map(f=>f.sourceId)};
}
export function scoreRetrieval(gold: BenchmarkGold, hits: readonly BenchmarkHit[], topK=10) {
  const ids=new Set(hits.map(h=>h.id));const relevant=gold.relevantIds.filter(id=>ids.has(id)).length;
  return {precisionAt10:relevant/topK,precisionRetrieved:hits.length?relevant/hits.length:0,recallAt10:gold.relevantIds.length?relevant/gold.relevantIds.length:null,criticalMisses:gold.criticalIds.filter(id=>!ids.has(id))};
}
export const BENCHMARK_READER_POLICY = {version:'critical-coverage/2',classification:'REGRESSION_EXPOSED_SET',scope:'structured facts in retrieved top-10 only',budgetScope:'source content bytes; coverage metadata reported separately'} as const;
export interface CoverageGuard {
  policyVersion:typeof BENCHMARK_READER_POLICY.version;
  group:{sourceId:string;contentDigest:string}[];
  criticalUnknowns:{code:'CRITICAL_EVIDENCE_EXCLUDED'|'CONFLICTING_RETRIEVED_FACTS'|'NO_RETRIEVED_SUPPORT';sourceIds:string[]}[];
  metadataBytes:number;
  guarantee:'retrieved-set-only-not-global-semantic-completeness';
}
/** Uses only public query fields and actual eligible retrieval bytes. No gold labels or IDs enter this guard. */
export function readWithCoverage(question:BenchmarkQuestion,retrieved:readonly BenchmarkHit[],loaded:readonly BenchmarkHit[]):{reader:ReturnType<typeof mechanicalRead>;coverage:CoverageGuard} {
  const group:CoverageGuard['group']=[],values=new Set<string>();
  for(const hit of retrieved.filter(h=>h.eligible)) {
    try {
      const payload=JSON.parse(hit.content) as {facts?:unknown};
      const matching=z.array(Fact).parse(payload.facts).filter(f=>f.subject===question.subject&&f.predicate===question.predicate);
      if(matching.length){group.push({sourceId:hit.id,contentDigest:rawDigest(hit.content)});for(const fact of matching)values.add(fact.value);}
    }catch{ /* Unstructured content supplies no verified structured-fact coverage. */ }
  }
  const criticalUnknowns:CoverageGuard['criticalUnknowns']=[];
  const missing=group.filter(pin=>!loaded.some(h=>h.eligible&&h.id===pin.sourceId&&rawDigest(h.content)===pin.contentDigest)).map(pin=>pin.sourceId);
  if(missing.length)criticalUnknowns.push({code:'CRITICAL_EVIDENCE_EXCLUDED',sourceIds:missing});
  if(values.size>1)criticalUnknowns.push({code:'CONFLICTING_RETRIEVED_FACTS',sourceIds:group.map(pin=>pin.sourceId)});
  if(!group.length)criticalUnknowns.push({code:'NO_RETRIEVED_SUPPORT',sourceIds:[]});
  const body={policyVersion:BENCHMARK_READER_POLICY.version,group,criticalUnknowns,guarantee:'retrieved-set-only-not-global-semantic-completeness' as const};
  const coverage:CoverageGuard={...body,metadataBytes:Buffer.byteLength(JSON.stringify(body),'utf8')};
  return {reader:criticalUnknowns.length?{disposition:'abstain',value:null,sourceIds:[]}:mechanicalRead(question,loaded),coverage};
}
/** Evaluator-only control. Gold evidence is passed to the same reader after retrieval, never to the adapter. */
export function oracleEvidenceRead(question:BenchmarkQuestion,gold:BenchmarkGold,documents:readonly BenchmarkDocument[]) {
  const evidence=documents.filter(d=>gold.relevantIds.includes(d.id)&&d.lifecycle==='active'&&d.freshness==='fresh').map(d=>({id:d.id,content:JSON.stringify({text:d.text,facts:d.facts}),eligible:true}));
  return readWithCoverage(question,evidence,evidence).reader;
}
/** Descriptive 95% Wilson interval; caller uses unique cases, never repeat count as sample size. */
export function wilsonInterval(successes:number,total:number):{low:number;high:number}|null {
  if(total===0)return null;
  const z=1.959963984540054,p=successes/total,denominator=1+z*z/total;
  const center=(p+z*z/(2*total))/denominator,half=z*Math.sqrt(p*(1-p)/total+z*z/(4*total*total))/denominator;
  return {low:Math.max(0,center-half),high:Math.min(1,center+half)};
}
const percentile=(values:number[],p:number):number=>values.slice().sort((a,b)=>a-b)[Math.min(values.length-1,Math.floor(values.length*p))]??0;
export type BenchmarkTrial = ReturnType<typeof scoreRetrieval> & {
  order:number;caseId:string;split:'dev'|'holdout';family:string;repeat:number;budget:number;mode:BenchmarkMode;
  retrievedIds:string[];bytes:number;excludedIds:string[];openMs:number;coldMs:number;warmMs:number;readerMs:number;
  reader:ReturnType<typeof mechanicalRead>;coverage:CoverageGuard;oracleEvidenceReader:ReturnType<typeof mechanicalRead>;
  oracleEvidenceFalseAcceptance:boolean;oracleEvidenceFalseRejection:boolean;falseAcceptance:boolean;falseRejection:boolean;correctAbstention:boolean;ineligibleRetrieved:number;
};
export function runMemoryBenchmark(inputs:BenchmarkInputs,adapter:BenchmarkAdapter,fixtureLockDigest:string,onTrial?:(trial:BenchmarkTrial)=>void) {
  const {protocol}=inputs;
  const trials:BenchmarkTrial[]=[];
  let order=0;
  for(const split of ['dev','holdout'] as const)for(let repeat=0;repeat<protocol.repeats;repeat++)for(const budget of protocol.budgets)for(const [index,question] of inputs.questions.filter(q=>q.split===split).entries()) {
    const modes=(repeat+index)%2 ? [...protocol.modes].reverse():protocol.modes;
    for(const mode of modes){
      const opened=performance.now();const session=adapter.open();const openMs=performance.now()-opened;
      try {
        const coldStart=performance.now();const retrieved=session.retrieve(question.query,mode,protocol.topK);const cold=selectWithinBudget(retrieved,budget);const coldMs=performance.now()-coldStart;
        const warmStart=performance.now();const warm=selectWithinBudget(session.retrieve(question.query,mode,protocol.topK),budget);const warmMs=performance.now()-warmStart;
        if(digest(cold)!==digest(warm))throw new Error('Cold/warm result drift');
        const readerStart=performance.now();const {reader,coverage}=readWithCoverage(question,retrieved,cold.hits);const readerMs=performance.now()-readerStart;
        const gold=inputs.gold.find(g=>g.id===question.id)!;
        const oracleReader=oracleEvidenceRead(question,gold,inputs.documents);
        const trial:BenchmarkTrial={order:order++,caseId:question.id,split,family:question.family,repeat,budget,mode,retrievedIds:cold.hits.map(h=>h.id),bytes:cold.bytes,excludedIds:cold.excluded,openMs,coldMs,warmMs,readerMs,...scoreRetrieval(gold,cold.hits,protocol.topK),reader,coverage,oracleEvidenceReader:oracleReader,oracleEvidenceFalseAcceptance:oracleReader.disposition==='supported'&&oracleReader.value!==gold.expected,oracleEvidenceFalseRejection:oracleReader.disposition==='abstain'&&gold.expected!==null,falseAcceptance:reader.disposition==='supported'&&reader.value!==gold.expected,falseRejection:reader.disposition==='abstain'&&gold.expected!==null,correctAbstention:reader.disposition==='abstain'&&gold.expected===null,ineligibleRetrieved:cold.hits.filter(h=>!h.eligible).length};
        trials.push(trial);onTrial?.(trial);
      }finally{session.close();}
    }
  }
  const summaries=[];
  for(const split of ['dev','holdout'] as const)for(const budget of protocol.budgets)for(const mode of protocol.modes){
    const group=trials.filter(t=>t.split===split&&t.budget===budget&&t.mode===mode);
    const criticalCases=group.filter(t=>t.repeat===0&&inputs.gold.find(g=>g.id===t.caseId)!.criticalIds.length>0),allCriticalRetained=criticalCases.filter(t=>t.criticalMisses.length===0).length;
    const recalls=group.flatMap(t=>t.recallAt10===null?[]:[t.recallAt10]);
    summaries.push({split,budget,mode,trials:group.length,caseUncertainty:{unit:'unique cases with critical evidence',total:criticalCases.length,allCriticalRetained,wilson95:wilsonInterval(allCriticalRetained,criticalCases.length),caution:'Descriptive only: authored starter cases are not random population samples; repeats are excluded.'},meanPrecisionAt10:group.reduce((a,t)=>a+t.precisionAt10,0)/group.length,meanRecallAt10:recalls.reduce((a,n)=>a+n,0)/recalls.length,criticalMissCount:group.reduce((a,t)=>a+t.criticalMisses.length,0),falseAcceptance:group.filter(t=>t.falseAcceptance).length,falseRejection:group.filter(t=>t.falseRejection).length,correctAbstention:group.filter(t=>t.correctAbstention).length,abstention:group.filter(t=>t.reader.disposition==='abstain').length,coldMsP50:percentile(group.map(t=>t.coldMs),.5),coldMsP95:percentile(group.map(t=>t.coldMs),.95),warmMsP50:percentile(group.map(t=>t.warmMs),.5),warmMsP95:percentile(group.map(t=>t.warmMs),.95)});
  }
  const oracleLeaks=adapter.ingestedPaths.filter(p=>p.includes('oracle')||p.includes('questions')||p.includes('protocol')).length;
  const falseAcceptance=trials.filter(t=>t.falseAcceptance).length,ineligibleRetrieved=trials.reduce((a,t)=>a+t.ineligibleRetrieved,0);
  const thresholdChecks={falseAcceptance:falseAcceptance<=protocol.thresholds.maxFalseAcceptance,ineligibleRetrieved:ineligibleRetrieved<=protocol.thresholds.maxIneligibleRetrieved,oracleLeaks:oracleLeaks<=protocol.thresholds.maxOracleLeaks,largestBudgetHoldoutRecall:summaries.filter(s=>s.split==='holdout'&&s.budget===Math.max(...protocol.budgets)).every(s=>s.meanRecallAt10>=protocol.thresholds.minimumHoldoutRecallAtLargestBudget)};
  return {schemaVersion:'mechanical-memory-benchmark/1',evaluationPolicy:BENCHMARK_READER_POLICY,measuredAt:new Date().toISOString(),fixtureLockDigest,adapter:adapter.name,protocol,environment:{node:process.version,platform:platform(),arch:arch(),osRelease:release(),cpu:cpus()[0]?.model??'unknown',cpuCount:cpus().length,totalMemoryBytes:totalmem()},measurementScope:{cold:'first query after opening a fresh SQLite connection; OS page cache not flushed',warm:'immediate repeat on same connection',queryLatency:'includes retrieval and byte packing; excludes ingest/open and reader',reader:'exact structured-fact reader; no model semantics',providerTokens:null,modelCost:null,ownerTouchHours:null},oracleControls:{ingestedIds:adapter.ingestedIds,ingestedPaths:adapter.ingestedPaths,oracleLeaks,evaluatorOracleOnly:true,preflightLoadsLabelsForValidation:true,readerGoldEvidenceAfterRetrieval:true,uniqueCaseControls:inputs.questions.map(q=>{const t=trials.find(t=>t.caseId===q.id)!;return {caseId:q.id,reader:t.oracleEvidenceReader,falseAcceptance:t.oracleEvidenceFalseAcceptance,falseRejection:t.oracleEvidenceFalseRejection};})},thresholdChecks,mechanicalThresholdsMet:Object.values(thresholdChecks).every(Boolean),semanticAcceptance:'UNMEASURED',trialOrderDigest:digest(trials.map(t=>({order:t.order,caseId:t.caseId,repeat:t.repeat,budget:t.budget,mode:t.mode}))),summaries,trials};
}
