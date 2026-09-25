import { digest } from '../contracts/canonical.js';
import { resourceDigest } from '../skills/catalog.js';
import { exportContextTrace, type ContextWindow } from '../context/engine.js';
import type { MemorySnapshot } from '../memory/types.js';
import type { ExplorerInput, ExplorerNode } from './projection.js';

/** Joins only version-pinned resources; context is a read model, never promoted knowledge. */
export function explorerInput(memory: MemorySnapshot, windows: readonly ContextWindow[] = []): ExplorerInput {
  const nodes: ExplorerNode[] = memory.nodes.map(n => ({ id: n.id, kind: n.kind, label: n.label,
    namespace: { ...n.scope, branchId: n.branchId, lineageId: n.lineageId }, statement: n.content,
    revision: n.revision, contentDigest: n.contentDigest, assertionType: n.provenance.assertionType ?? null,
    lifecycle: n.status.lifecycle, freshness: n.status.freshness, validity: n.status.validity === 'invalidated' ? 'invalid' : 'valid',
    provenanceNodeIds: n.kind === 'source' && !n.provenance.derived ? [n.id] : n.provenance.sourceRefs,
    evidenceNodeIds: [], sourceRef: n.sourceRef ?? null }));
  const ids = new Set(nodes.map(n => n.id));
  const edges: ExplorerInput['edges'] = memory.edges.map(e => ({ id: e.id, from: e.from, to: e.to, type: e.type,
    basis: e.assertion, provenanceNodeIds: ids.has(e.provenanceRef) ? [e.provenanceRef] : [] }));
  const traces: ExplorerInput['traces'] = [];
  for (const window of windows) {
    const trace = exportContextTrace(window), packet = window.packet;
    const namespace = { ...trace.scope, branchId: trace.branchId, lineageId: trace.lineageId };
    const contextId = `context:${trace.windowId}`;
    if (!ids.has(contextId)) {
      nodes.push({ id: contextId, kind: 'context', label: `${trace.agentId} · ${trace.windowId}`, namespace,
        statement: `Payload ${window.status}. Load receipts prove bytes included in this local packet; provider execution is not measured.`,
        revision: String(packet.generation), contentDigest: window.packetDigest, assertionType: null, lifecycle: window.status,
        freshness: 'unknown', validity: window.status === 'ready' ? 'valid' : 'invalid', provenanceNodeIds: [], evidenceNodeIds: [], sourceRef: null }); ids.add(contextId);
    }
    const mapping = new Map<string, string>();
    for (const resource of packet.resources) {
      const pin = resource.pin;
      const matched = nodes.find(n => n.id === pin.ref && n.revision === pin.revision && n.contentDigest === pin.contentHash);
      let id = matched?.id;
      if (!id) {
        id = `resource:${digest({ ref: pin.ref, revision: pin.revision, contentHash: pin.contentHash, scope: pin.scope, branchId: pin.branchId, lineageId: pin.lineageId }).slice(7)}`;
        if (!ids.has(id)) { nodes.push({ id, kind: pin.kind.startsWith('skill-') ? 'skill' : 'evidence', label: pin.ref,
          namespace: { ...pin.scope, branchId: pin.branchId, lineageId: pin.lineageId }, statement: resource.content,
          revision: pin.revision, contentDigest: pin.contentHash, assertionType: null, lifecycle: pin.trust,
          freshness: pin.status === 'active' ? 'fresh' : 'stale', validity: pin.status === 'active' ? 'valid' : 'invalid',
          provenanceNodeIds: pin.sourceRefs, evidenceNodeIds: [], sourceRef: null }); ids.add(id); }
      }
      mapping.set(pin.ref, id);
      edges.push({ id: `context-link:${digest([contextId, id]).slice(7)}`, from: contextId, to: id,
        type: 'depends_on', basis: 'explicit', provenanceNodeIds: [contextId, id] });
    }
    // Canonical constraints appear separately from compressible history or retrieved instructions.
    for (const constraint of packet.task.constraints) {
      const id = `constraint:${digest({ binding: constraint, namespace }).slice(7)}`;
      if (!ids.has(id)) { nodes.push({ id, kind: 'constraint', label: constraint.id, namespace, statement: constraint.description,
        revision: constraint.sourceRevision, contentDigest: constraint.contentHash, assertionType: 'decision', lifecycle: 'canonical-task',
        freshness: 'unknown', validity: 'unknown', provenanceNodeIds: [contextId], evidenceNodeIds: [], sourceRef: null }); ids.add(id); }
      edges.push({ id: `constraint-link:${digest([contextId, id]).slice(7)}`, from: contextId, to: id, type: 'depends_on', basis: 'explicit', provenanceNodeIds: [contextId] });
    }
    traces.push({ traceId: trace.traceId, windowId: trace.windowId, agentId: trace.agentId, taskId: trace.taskId, role: trace.role,
      namespace, packetDigest: trace.packetDigest, manifestRef: packet.manifest.manifestId, manifestDigest: packet.manifest.manifestDigest,
      accounting: `${packet.budgetReport.packetUnits} ${packet.budgetReport.unit}; provider tokens/cost unknown. Loaded = local payload inclusion.`,
      entries: trace.entries.map(entry => {
        const resource = packet.resources.find(r => r.pin.ref === entry.ref), receipt = packet.loadReceipts.find(r => r.receiptId === entry.receiptRef);
        const proved = !!resource && !!receipt && entry.receiptDigest === digest(receipt) && receipt.windowId === trace.windowId &&
          receipt.agentId === trace.agentId && receipt.ref === entry.ref && receipt.contentHash === resource.pin.contentHash &&
          receipt.revision === resource.pin.revision && receipt.pinDigest === digest(resource.pin) && receipt.resourceDigest === digest(resource) &&
          resourceDigest(resource.content) === resource.pin.contentHash;
        // Entries that were never materialized still link to a known visible Memory record when possible.
        const nodeId = mapping.get(entry.ref) ?? (ids.has(entry.ref) ? entry.ref : null);
        const { required: _required, ...base } = entry;
        return { ...base, nodeId, state: entry.state === 'loaded' && !proved ? 'unknown' as const : entry.state,
          reason: entry.state === 'loaded' && !proved ? 'Payload inclusion receipt cannot be verified' : entry.reason };
      }) });
  }
  // Memory lineage and packet receipts may describe the same edge. Keep a single relation,
  // preferring the packet's visible provenance rather than drawing overlapping arrows.
  const merged = new Map<string, ExplorerInput['edges'][number]>();
  for (const edge of edges) {
    const key = digest([edge.from, edge.to, edge.type, edge.basis]);
    const prior = merged.get(key);
    if (!prior || edge.provenanceNodeIds.length > prior.provenanceNodeIds.length) merged.set(key, { ...edge, id: `view-edge:${key.slice(7)}` });
  }
  return { format: 'memory-explorer-input/1', memoryVersion: memory.memoryVersion, capturedAt: memory.generatedAt,
    origin: 'snapshot', nodes, edges: [...merged.values()], traces };
}
