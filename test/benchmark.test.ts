import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { fixturePins, loadBenchmarkInputs, lockBenchmark, mechanicalRead, readWithCoverage, oracleEvidenceRead, wilsonInterval, scoreRetrieval, selectWithinBudget, verifyBenchmarkLock } from '../src/benchmark/engine.js';
import { parseCSharpFixture } from '../src/benchmark/parser.js';
const root=join(process.cwd(),'fixtures/memory-benchmark');

test('30 gold cases have family-separated dev/holdout and oracle only references corpus',()=>{
  const input=loadBenchmarkInputs(root);assert.equal(input.questions.length,30);assert.equal(input.questions.filter(q=>q.split==='holdout').length,10);
  assert.ok(input.documents.every(d=>!d.path.includes('oracle')));
});
test('locked corpus, questions, oracle and protocol reject any changed bytes',()=>{
  const dir=mkdtempSync(join(tmpdir(),'benchmark-lock-'));
  try{cpSync(root,dir,{recursive:true});rmSync(join(dir,'campaign-lock.json'),{force:true});lockBenchmark(dir);assert.ok(verifyBenchmarkLock(dir));
    writeFileSync(join(dir,'oracle/gold.json'),readFileSync(join(dir,'oracle/gold.json'),'utf8')+' ');
    assert.throws(()=>verifyBenchmarkLock(dir),/drift/);
  }finally{rmSync(dir,{recursive:true,force:true});}
});
test('equal byte packing cap never truncates source content',()=>{
  const hits=[{id:'a',content:'é'.repeat(5),eligible:true},{id:'b',content:'xx',eligible:true}];
  assert.deepEqual(selectWithinBudget(hits,9),{hits:[hits[1]],bytes:2,excluded:['a']});
});
test('reader has no oracle and abstains for absent, conflicting or unusable facts',()=>{
  const q=loadBenchmarkInputs(root).questions[0]!;
  const hit=(id:string,value:string,eligible=true)=>({id,content:JSON.stringify({facts:[{subject:q.subject,predicate:q.predicate,value}]}),eligible});
  assert.equal(mechanicalRead(q,[]).disposition,'abstain');
  assert.equal(mechanicalRead(q,[hit('a','SQLite',false)]).disposition,'abstain');
  assert.equal(mechanicalRead(q,[hit('a','SQLite'),hit('b','Other')]).disposition,'abstain');
  assert.equal(mechanicalRead(q,[hit('a','SQLite')]).value,'SQLite');
});
test('compile support cannot be read as Android certification',()=>{
  const input=loadBenchmarkInputs(root);const q=input.questions.find(q=>q.id==='case-24')!;const doc=input.documents.find(d=>d.id==='compile')!;
  assert.equal(mechanicalRead(q,[{id:doc.id,content:JSON.stringify({text:doc.text,facts:doc.facts}),eligible:true}]).disposition,'abstain');
});
test('retrieval metrics use fixed precision@10 and critical miss list',()=>{
  assert.deepEqual(scoreRetrieval({id:'q',expected:'x',relevantIds:['a','b'],criticalIds:['b']},[{id:'a',content:'',eligible:true}]),{precisionAt10:.1,precisionRetrieved:1,recallAt10:.5,criticalMisses:['b']});
});
test('bounded C# scanner ignores comments and strings, does not certify name matches',()=>{
  const result=parseCSharpFixture([{path:'A.cs',content:'public class A { public bool Run() { ledger.Commit(); return true; } // class Fake {}\n public string Explain() { return "Fake.Call()"; } }'},{path:'B.cs',content:'public class B { public void Commit() {} }'}]);
  assert.ok(result.declarations.some(d=>d.name==='A'&&d.kind==='class'));
  assert.ok(result.declarations.some(d=>d.name==='Run'&&d.kind==='method'));
  assert.ok(!result.declarations.some(d=>d.name==='Fake'));
  assert.ok(!result.references.some(r=>r.name==='Fake.Call'));
  const ref=result.references.find(r=>r.name==='ledger.Commit')!;assert.equal(ref.assertion,'inferred');assert.equal(ref.semanticBinding,'unverified');assert.equal(ref.targetCandidates.length,1);
});
test('unsupported parser constructs fail closed',()=>{
  assert.throws(()=>parseCSharpFixture([{path:'A.cs',content:'#if DEBUG\nclass A {}\n#endif'}]),/Unsupported/);
  assert.throws(()=>parseCSharpFixture([{path:'A.cs',content:'var x = """text""";'}]),/Unsupported/);
});
test('fixture pins include code, protocol and oracle; no generated results',()=>{
  const pins=fixturePins(root);assert.ok(pins['oracle/gold.json']);assert.ok(pins['protocol.json']);assert.ok(pins['corpus/code/DispatchBroker.cs']);assert.ok(!pins['campaign-lock.json']);
});

test('real Context compaction retains compile scope, constraints and Android unknown even under poisoned summary',async()=>{
  const {runCompactionProbe}=await import('../src/benchmark/context-probe.js');
  const result=await runCompactionProbe();assert.equal(result.passed,true);assert.equal(result.trials.length,2);assert.ok(result.loaderCalls.length>=3);
});

test('interface declarations produce method candidates without inventing semantic binding',()=>{
  const spike=parseCSharpFixture([{path:'Store.cs',content:'public interface IStore { bool Contains(string id); void Commit(string id); }'}]);
  assert.deepEqual(spike.declarations.filter(d=>d.kind==='method').map(d=>d.name),['Contains','Commit']);
});

test('evaluator-only gold evidence distinguishes retrieval omission from full-evidence reader behavior',()=>{
  const input=loadBenchmarkInputs(root),question=input.questions.find(q=>q.id==='case-27')!,gold=input.gold.find(g=>g.id===question.id)!;
  const one=input.documents.find(d=>d.id==='conflict-a')!;
  assert.equal(mechanicalRead(question,[{id:one.id,content:JSON.stringify({facts:one.facts}),eligible:true}]).disposition,'supported');
  assert.equal(oracleEvidenceRead(question,gold,input.documents).disposition,'abstain');
});
test('Wilson interval counts unique cases and remains uncertain for perfect small sample',()=>{
  assert.equal(wilsonInterval(0,0),null);
  const interval=wilsonInterval(8,8)!;assert.ok(interval.low<.7&&interval.low>.6);assert.ok(interval.high>.999);
});

test('synthetic harness control keeps paired order, journals every trial and excludes repeats from uncertainty',async()=>{
  const {runMemoryBenchmark}=await import('../src/benchmark/engine.js');
  const documents=[{id:'alpha',revision:'r1',lifecycle:'active' as const,freshness:'fresh' as const,path:'notes/alpha.md',text:'alpha',facts:[{subject:'alpha',predicate:'value',value:'A'}],links:[]},{id:'beta',revision:'r1',lifecycle:'active' as const,freshness:'fresh' as const,path:'notes/beta.md',text:'beta',facts:[{subject:'beta',predicate:'value',value:'B'}],links:[]}];
  const questions=[{id:'synthetic-dev',split:'dev' as const,family:'a',query:'alpha',subject:'alpha',predicate:'value'},{id:'synthetic-holdout',split:'holdout' as const,family:'b',query:'beta',subject:'beta',predicate:'value'}];
  const gold=[{id:'synthetic-dev',expected:'A',relevantIds:['alpha'],criticalIds:['alpha']},{id:'synthetic-holdout',expected:'B',relevantIds:['beta'],criticalIds:['beta']}];
  const protocol={version:'synthetic-unit-test',budgets:[256,512,1024],budgetUnit:'utf8-bytes/1',topK:10,repeats:3,modes:['lexical','explicit-graph'] as ('lexical'|'explicit-graph')[],trialOrder:'paired',reader:'exact facts',thresholds:{maxFalseAcceptance:0,maxIneligibleRetrieved:0,maxOracleLeaks:0,minimumHoldoutRecallAtLargestBudget:.75},thresholdNotes:'unit fixture'};
  const journal:number[]=[],queries:string[]=[];
  const result=runMemoryBenchmark({documents,questions,gold,protocol},{name:'synthetic controlled omission',ingestedIds:['alpha','beta'],ingestedPaths:['corpus/documents.json'],open:()=>({retrieve:(query,mode)=>{queries.push(query);const doc=documents.find(d=>d.id===query)!;return mode==='lexical'?[]:[{id:doc.id,content:JSON.stringify({text:doc.text,facts:doc.facts}),eligible:true}];},close:()=>{}})},'synthetic-lock',trial=>journal.push(trial.order));
  assert.equal(result.trials.length,36);assert.equal(journal.length,36);assert.equal(queries.length,72);
  assert.ok(result.summaries.every(s=>s.caseUncertainty.total===1));
  assert.ok(result.oracleControls.uniqueCaseControls.every(c=>!c.falseAcceptance&&!c.falseRejection));
  assert.equal(result.thresholdChecks.largestBudgetHoldoutRecall,false);
  assert.equal(result.summaries.find(s=>s.split==='dev'&&s.budget===256&&s.mode==='lexical')!.falseRejection,3);
});

test('new synthetic conflict cannot become support when budget removes one member',()=>{
  const q={id:'fresh-synthetic',split:'dev' as const,family:'coverage-regression',query:'cache retention',subject:'cache',predicate:'expiry'};
  const hit=(id:string,value:string)=>({id,content:JSON.stringify({facts:[{subject:'cache',predicate:'expiry',value}]}),eligible:true});
  const a=hit('new-a','15 minutes'),b=hit('new-b','45 minutes');
  const result=readWithCoverage(q,[a,b],[a]);
  assert.equal(result.reader.disposition,'abstain');
  assert.deepEqual(result.coverage.criticalUnknowns.map(u=>u.code),['CRITICAL_EVIDENCE_EXCLUDED','CONFLICTING_RETRIEVED_FACTS']);
  assert.equal(result.coverage.group.length,2);assert.ok(result.coverage.group.every(p=>p.contentDigest.startsWith('sha256:')));
});
test('dropping sole supporting source records critical unknown; unrelated exclusion does not block',()=>{
  const q={id:'new-q',split:'dev' as const,family:'coverage-regression',query:'cache backend',subject:'cache',predicate:'backend'};
  const relevant={id:'backend-new',content:JSON.stringify({facts:[{subject:'cache',predicate:'backend',value:'disk'}]}),eligible:true};
  const unrelated={id:'unrelated-new',content:JSON.stringify({facts:[{subject:'log',predicate:'backend',value:'memory'}]}),eligible:true};
  const dropped=readWithCoverage(q,[relevant],[]);assert.equal(dropped.reader.disposition,'abstain');assert.equal(dropped.coverage.criticalUnknowns[0]?.code,'CRITICAL_EVIDENCE_EXCLUDED');
  const safe=readWithCoverage(q,[relevant,unrelated],[relevant]);assert.equal(safe.reader.value,'disk');assert.deepEqual(safe.coverage.criticalUnknowns,[]);
});
test('loaded source substitution cannot satisfy a pinned coverage member',()=>{
  const q={id:'new-pin',split:'dev' as const,family:'coverage-regression',query:'x',subject:'x',predicate:'p'};
  const original={id:'same-id',content:JSON.stringify({facts:[{subject:'x',predicate:'p',value:'a'}]}),eligible:true};
  const substituted={...original,content:JSON.stringify({facts:[{subject:'x',predicate:'p',value:'b'}]})};
  assert.equal(readWithCoverage(q,[original],[substituted]).coverage.criticalUnknowns[0]?.code,'CRITICAL_EVIDENCE_EXCLUDED');
});
