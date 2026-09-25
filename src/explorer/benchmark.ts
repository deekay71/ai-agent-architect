import { performance } from 'node:perf_hooks';
import { cpus, release } from 'node:os';
import { digest } from '../contracts/canonical.js';
import { projectExplorer, type ExplorerInput, type ExplorerScope } from './projection.js';

/** Read-model CPU timings only; this does not claim browser/production graph throughput. */
export function benchmarkProjection() {
  const scope: ExplorerScope = { repoId: 'benchmark:explorer', branchId: 'fixture', lineageId: 'local', allowedPaths: ['docs'], taskClasses: ['memory.inspect'] };
  const samples = [];
  for (const size of [100, 1000]) {
    const input: ExplorerInput = { format: 'memory-explorer-input/1', memoryVersion: 'memory:benchmark', origin: 'snapshot', capturedAt: new Date().toISOString(),
      nodes: Array.from({ length: size }, (_, i) => ({ id: `claim:${i}`, kind: 'claim', label: `Fixture observation ${i}`, namespace: scope,
        statement: `Synthetic read-model record ${i}; benchmark does not establish real-world knowledge.`, revision: 'r1', contentDigest: digest(i), assertionType: 'inferred',
        lifecycle: 'approved', freshness: i % 7 === 0 ? 'stale' : 'fresh', validity: i % 7 === 0 ? 'invalid' : 'valid', provenanceNodeIds: [`claim:${i}`], evidenceNodeIds: [], sourceRef: null })),
      edges: Array.from({ length: size - 1 }, (_, i) => ({ id: `edge:${i}`, from: `claim:${i + 1}`, to: `claim:${i}`, type: 'depends_on', basis: 'explicit', provenanceNodeIds: [`claim:${i}`] })), traces: [] };
    projectExplorer(input, scope);
    const milliseconds: number[] = [];
    for (let repeat = 0; repeat < 20; repeat++) { const start = performance.now(); projectExplorer(input, scope); milliseconds.push(performance.now() - start); }
    const sorted = milliseconds.slice().sort((a, b) => a - b);
    samples.push({ nodes: size, edges: size - 1, repetitions: 20, p50Ms: sorted[10], p95Ms: sorted[19], milliseconds });
  }
  return { format: 'explorer-projection-benchmark/1', measuredAt: new Date().toISOString(), node: process.version, os: release(), cpu: cpus()[0]?.model,
    scope: 'Synthetic projector + schema + canonical hash CPU benchmark; not browser layout, network or production throughput',
    uiVisibleNeighborhoodCap: 70, samples };
}
