import type { MemoryEdge, MemoryNode, MemoryOptions, MemoryQuery, SourceInput } from '../memory/types.js';
import type { BenchmarkAdapter, BenchmarkHit, BenchmarkMode } from './engine.js';
import { loadCorpus } from './engine.js';
import { rawDigest } from './parser.js';

interface BenchmarkMemoryStore {
  ingest(input: SourceInput, actorId:string): MemoryNode;
  query(query:MemoryQuery): MemoryNode[];
  transitionSource(input:{sourceId:string;sourceRevision?:string;namespace:MemoryQuery['namespace'];to:'stale'|'quarantined'|'revoked'|'deleted';reason:string},actorId:string): unknown;
  link(input:Omit<MemoryEdge,'id'>,actorId:string): unknown;
  close(): void;
}
export type MemoryStoreFactory = (root:string,options:MemoryOptions)=>BenchmarkMemoryStore;
const namespace={repoId:'benchmark-infrastructure',branchId:'main',lineageId:'campaign-1',allowedPaths:['notes','code'],taskClasses:['memory.benchmark']};
const options:MemoryOptions={namespaces:[namespace],principals:[{id:'benchmark-importer',role:'memoryPromoter',projectIds:[namespace.repoId]}],now:()=> '2026-09-25T00:00:00.000Z'};
const actorId='benchmark-importer';

/** This ingestion path reads corpus/documents.json only. It cannot receive questions, labels, thresholds or oracle content. */
export function createMemoryBenchmarkAdapter(fixtureRoot:string,storeRoot:string,createStore:MemoryStoreFactory):BenchmarkAdapter {
  const documents=loadCorpus(fixtureRoot);const identity=new Map<string,string>();const nodes=new Map<string,MemoryNode>();
  const store=createStore(storeRoot,options);
  try {
    for(const doc of documents){
      const content=JSON.stringify({text:doc.text,facts:doc.facts});
      const sourceId=doc.id.startsWith('revision-')?'retry-policy':doc.id;
      const node=store.ingest({record:{schemaVersion:'0.5.0',sourceId,sourceType:'document',sourceRef:doc.path,sourceRevision:doc.revision,contentDigest:rawDigest(content),observedAt:'2026-09-25T00:00:00.000Z',freshnessPolicy:'pinned',freshness:doc.freshness},content,namespace,provenance:{kind:'primary',originId:sourceId},purpose:'knowledge'},actorId);
      nodes.set(doc.id,node);identity.set(node.id,doc.id);
      if(doc.lifecycle==='quarantined'||doc.lifecycle==='revoked')store.transitionSource({sourceId,namespace,to:doc.lifecycle,reason:'Locked benchmark lifecycle fixture'},actorId);
    }
    for(const doc of documents)for(const edge of doc.links){
      const from=nodes.get(doc.id),to=nodes.get(edge.target);if(!from||!to)throw new Error('Corpus edge target missing');
      store.link({from:from.id,to:to.id,type:'depends_on',assertion:edge.kind,provenanceRef:`${doc.path}@${doc.revision}`},actorId);
    }
  }finally{store.close();}
  return {name:'MemoryStore SQLite FTS + explicit dependency expansion',ingestedIds:documents.map(d=>d.id),ingestedPaths:['corpus/documents.json'],open(){
    const session=createStore(storeRoot,options);
    return {retrieve(query:string,mode:BenchmarkMode,limit:number):BenchmarkHit[]{
      return session.query({namespace,text:query,limit,expandHops:mode==='explicit-graph'?2:0}).map(node=>{
        const id=identity.get(node.id);if(!id)throw new Error('Retrieval returned a node not ingested from corpus');
        return {id,content:node.content,eligible:node.current&&node.status.validity==='valid'&&node.status.freshness==='fresh'&&node.status.lifecycle==='active'};
      });
    },close(){session.close();}};
  }};
}
