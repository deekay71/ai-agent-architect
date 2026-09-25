import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtempSync, rmSync } from 'node:fs';
import { MemoryStore } from '../src/memory/store.js';
import { createMemoryBenchmarkAdapter } from '../src/benchmark/memory-adapter.js';

const fixtureRoot=join(process.cwd(),'fixtures/memory-benchmark');
test('benchmark adapter ingests only corpus and uses real revision/revoke/quarantine eligibility',()=>{
  const dir=mkdtempSync(join(tmpdir(),'benchmark-memory-'));
  try{
    const adapter=createMemoryBenchmarkAdapter(fixtureRoot,dir,(root,options)=>new MemoryStore(root,options));
    assert.equal(adapter.ingestedIds.length,30);assert.deepEqual(adapter.ingestedPaths,['corpus/documents.json']);
    const session=adapter.open();
    try{
      for(const query of ['retry policy limit','credential inline secrets','storage encryption','Unreviewed imported note']) {
        const hits=session.retrieve(query,'explicit-graph',10);
        assert.ok(hits.every(h=>h.eligible));
        assert.ok(hits.every(h=>!['revision-old','revoked-secret','stale-storage','quarantine'].includes(h.id)));
      }
      assert.ok(session.retrieve('retry policy limit','lexical',10).some(h=>h.id==='revision-current'));
    }finally{session.close();}
  }finally{rmSync(dir,{recursive:true,force:true});}
});
test('actual explicit graph adds linked evidence while inferred references stay unexpanded',()=>{
  const dir=mkdtempSync(join(tmpdir(),'benchmark-graph-'));
  try{
    const adapter=createMemoryBenchmarkAdapter(fixtureRoot,dir,(root,options)=>new MemoryStore(root,options));const session=adapter.open();
    try{
      const baseline=session.retrieve('DispatchBroker entry point','lexical',10),expanded=session.retrieve('DispatchBroker entry point','explicit-graph',10);
      assert.ok(!baseline.some(h=>h.id==='receipt-state'));
      assert.ok(expanded.some(h=>h.id==='receipt-state'));
      assert.deepEqual(session.retrieve('Speculative','explicit-graph',10).map(h=>h.id),['edge-inferred']);
    }finally{session.close();}
  }finally{rmSync(dir,{recursive:true,force:true});}
});
