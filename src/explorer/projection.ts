import { z } from 'zod';
import { digest } from '../contracts/canonical.js';
import { isSafeRelativePath, isWithinScope } from '../foundation/permissions.js';
import { exportContextTrace, type ContextWindow } from '../context/engine.js';
import { resourceDigest } from '../skills/catalog.js';

const text = z.string().min(1).max(32_768);
const hash = z.string().regex(/^sha256:[0-9a-f]{64}$/);
const scopeSchema = z.strictObject({ repoId: text, branchId: text, lineageId: text,
  allowedPaths: z.array(text).min(1), taskClasses: z.array(text).min(1) });
export type ExplorerScope = z.infer<typeof scopeSchema>;
const nodeSchema = z.strictObject({ id: text, kind: z.enum(['source', 'claim', 'context', 'plan', 'handoff', 'artifact', 'constraint', 'skill', 'evidence']),
  label: text, namespace: scopeSchema, statement: z.string().max(100_000), revision: text.nullable(), contentDigest: hash.nullable(),
  assertionType: z.enum(['observed', 'inferred', 'decision']).nullable(), lifecycle: text.nullable(),
  freshness: z.enum(['fresh', 'stale', 'unknown']), validity: z.enum(['valid', 'invalid', 'unknown']),
  provenanceNodeIds: z.array(text), evidenceNodeIds: z.array(text), sourceRef: text.nullable() });
const edgeSchema = z.strictObject({ id: text, from: text, to: text,
  type: z.enum(['depends_on', 'implements', 'tested_by', 'justified_by', 'supersedes', 'conflicts_with']),
  basis: z.enum(['explicit', 'inferred']), provenanceNodeIds: z.array(text) });
const traceEntrySchema = z.strictObject({ nodeId: text.nullable(), ref: text, kind: text, revision: text.nullable(),
  expectedDigest: hash.nullable(), state: z.enum(['planned', 'loaded', 'unknown', 'excluded', 'blocked']),
  actualDigest: hash.nullable(), receiptRef: text.nullable(), receiptDigest: hash.nullable(), reason: text.nullable() });
const traceSchema = z.strictObject({ traceId: text, windowId: text, agentId: text, taskId: text, role: text,
  namespace: scopeSchema, packetDigest: hash, manifestRef: text, manifestDigest: hash,
  entries: z.array(traceEntrySchema), accounting: text });
const inputSchema = z.strictObject({ format: z.literal('memory-explorer-input/1'), memoryVersion: text,
  capturedAt: z.iso.datetime(), origin: z.enum(['live', 'snapshot', 'unknown']),
  nodes: z.array(nodeSchema).max(10_000), edges: z.array(edgeSchema).max(40_000), traces: z.array(traceSchema).max(1000) });
export type ExplorerInput = z.infer<typeof inputSchema>;
export type ExplorerNode = z.infer<typeof nodeSchema>;
export type ExplorerTrace = z.infer<typeof traceSchema>;
export type ExplorerProjection = ReturnType<typeof projectExplorer>;
/** A file can record a capture, but cannot attest to a current live Memory connection. */
export function asFileSnapshot(input: unknown): ExplorerInput { return { ...inputSchema.parse(input), origin: 'snapshot' }; }

/** Paths must be wholly contained, not merely overlap. An empty scope never means wildcard. */
export function scopeAllows(access: ExplorerScope, subject: ExplorerScope): boolean {
  return access.repoId === subject.repoId && access.branchId === subject.branchId && access.lineageId === subject.lineageId &&
    access.allowedPaths.length > 0 && subject.allowedPaths.length > 0 && subject.taskClasses.length > 0 &&
    [...access.allowedPaths, ...subject.allowedPaths].every(isSafeRelativePath) &&
    subject.allowedPaths.every(p => isWithinScope(p, access.allowedPaths)) &&
    subject.taskClasses.every(c => access.taskClasses.includes(c));
}

/** This is the sole data exit used by HTTP and exports. Never serialize the raw input. */
export function projectExplorer(input: unknown, scope: ExplorerScope, proofWindows: readonly ContextWindow[] = []) {
  const access = scopeSchema.parse(scope), raw = inputSchema.parse(input);
  const duplicate = (ids: string[]) => new Set(ids).size !== ids.length;
  if (duplicate(raw.nodes.map(n => n.id)) || duplicate(raw.edges.map(e => e.id)) || duplicate(raw.traces.map(t => t.traceId))) {
    throw new Error('Duplicate graph identity');
  }
  const visible = raw.nodes.filter(n => scopeAllows(access, n.namespace));
  const ids = new Set(visible.map(n => n.id));
  const nodes = visible.map(n => ({ ...n, provenanceNodeIds: n.provenanceNodeIds.filter(id => ids.has(id)),
    evidenceNodeIds: n.evidenceNodeIds.filter(id => ids.has(id)),
    provenanceStatus: n.provenanceNodeIds.length > 0 && n.provenanceNodeIds.every(id => ids.has(id)) && n.revision !== null && n.contentDigest !== null
      ? 'recorded' as const : 'unknown' as const })).sort((a, b) => a.id.localeCompare(b.id));
  const edges = raw.edges.filter(e => ids.has(e.from) && ids.has(e.to)).map(e => ({ ...e,
    provenanceNodeIds: e.provenanceNodeIds.filter(id => ids.has(id)),
    provenanceStatus: e.provenanceNodeIds.length > 0 && e.provenanceNodeIds.every(id => ids.has(id)) ? 'recorded' as const : 'unknown' as const,
  })).sort((a, b) => a.id.localeCompare(b.id));
  const proofs = new Map(proofWindows.map(window => [window.packet.windowId, { window, trace: exportContextTrace(window) }]));
  const traces = raw.traces.filter(t => scopeAllows(access, t.namespace)).map(t => ({ ...t,
    // Unknown or hidden resource refs are omitted entirely; even their labels can disclose another scope.
    entries: t.entries.filter(e => e.nodeId !== null && ids.has(e.nodeId)).map(e => {
      const proof = proofs.get(t.windowId), packet = proof?.window.packet;
      const recorded = proof?.trace.entries.find(item => item.ref === e.ref), resourceNode = nodes.find(n => n.id === e.nodeId);
      const loaded = e.state === 'loaded' && e.receiptRef !== null && e.receiptDigest !== null && e.expectedDigest !== null && e.actualDigest === e.expectedDigest &&
        proof?.window.packetDigest === t.packetDigest && packet?.manifest.manifestDigest === t.manifestDigest && packet.manifest.manifestId === t.manifestRef &&
        proof.trace.agentId === t.agentId && proof.trace.taskId === t.taskId && proof.trace.role === t.role &&
        digest({ ...proof.trace.scope, branchId: proof.trace.branchId, lineageId: proof.trace.lineageId }) === digest(t.namespace) &&
        recorded?.state === 'loaded' && recorded.revision === e.revision && recorded.expectedDigest === e.expectedDigest &&
        recorded.actualDigest === e.actualDigest && recorded.receiptRef === e.receiptRef && recorded.receiptDigest === e.receiptDigest &&
        !!resourceNode && resourceNode.revision === e.revision && resourceDigest(resourceNode.statement) === e.expectedDigest;
      return e.state === 'loaded' && !loaded ? { ...e, state: 'unknown' as const, reason: 'Imported trace has no matching payload inclusion proof' } : e;
    }),
    incomplete: t.entries.some(e => e.nodeId === null || !ids.has(e.nodeId)),
  })).sort((a, b) => a.traceId.localeCompare(b.traceId));
  const body = { format: 'memory-explorer/1' as const, memoryVersion: raw.memoryVersion, scope: access, nodes, edges, traces };
  return { ...body, snapshotId: digest(body), capturedAt: raw.capturedAt, origin: raw.origin,
    warnings: [ ...(raw.origin !== 'live' ? ['Snapshot export: freshness is recorded at capture time; refresh from Memory before reuse.'] : []),
      ...(nodes.some(n => n.freshness !== 'fresh' || n.validity !== 'valid') ? ['Some visible records are stale, invalid or unknown. Approval does not establish freshness.'] : []),
      ...(traces.some(t => t.incomplete) ? ['Some context references are unavailable in this scope.'] : []) ] };
}

export interface ReviewProposal { format: 'memory-review-proposal/1'; snapshotId: string; expectedMemoryVersion: string;
  targetNodeId: string; comment: string; status: 'proposed'; promotionAuthorized: false }
export function createReviewProposal(projection: ExplorerProjection, targetNodeId: string, comment: string): ReviewProposal {
  if (!projection.nodes.some(n => n.id === targetNodeId)) throw new Error('Unknown proposal target');
  if (!comment.trim() || comment.length > 8000) throw new Error('Proposal comment must contain 1–8000 characters');
  return { format: 'memory-review-proposal/1', snapshotId: projection.snapshotId, expectedMemoryVersion: projection.memoryVersion,
    targetNodeId, comment: comment.trim(), status: 'proposed', promotionAuthorized: false };
}
