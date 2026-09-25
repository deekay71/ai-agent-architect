import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { chmodSync, existsSync, lstatSync, mkdirSync, realpathSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { canonicalJson, digest } from '../contracts/canonical.js';
import { parseContract, type Claim, type MemoryDelta, type SourceRecord } from '../contracts/schemas.js';
import { isSafeRelativePath, isWithinScope, type Principal } from '../foundation/permissions.js';
import type { DependencyInput, MemoryEdge, MemoryNamespace, MemoryNode, MemoryOptions, MemoryQuery, MemorySnapshot,
  PromotionEvidence, Proposal, ReviewInput, SourceBinding, SourceInput, SourceProvenance, TransitionInput, ValidationReport } from './types.js';

const text = z.string().min(1).refine(x => x.trim().length > 0);
const hash = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const namespaceSchema = z.strictObject({ repoId: text, branchId: text, lineageId: text,
  allowedPaths: z.array(text.refine(isSafeRelativePath)).min(1), taskClasses: z.array(text).min(1) });
const bindingSchema = z.strictObject({ sourceId: text, sourceRevision: text, contentDigest: hash });
const provenanceSchema = z.strictObject({ kind: z.enum(['primary', 'derived']), originId: text, derivedFrom: z.array(bindingSchema).min(1).optional() });
const evidenceSchema = z.strictObject({ evidenceId: text, claimId: text, assertionDigest: hash, assertionType: z.enum(['observed', 'inferred', 'decision']),
  namespace: namespaceSchema, sourceBindings: z.array(bindingSchema).min(1), conclusion: z.enum(['supported', 'contradicted', 'insufficient']), attestationRef: text });
const edgeSchema = z.strictObject({ from: text, to: text, type: z.enum(['depends_on', 'implements', 'tested_by', 'justified_by', 'supersedes', 'conflicts_with']),
  assertion: z.enum(['explicit', 'inferred']), provenanceRef: text });
const dependentKinds = new Set(['depends_on', 'implements', 'tested_by', 'justified_by']);
const blockedLifecycles = new Set(['revoked', 'quarantined', 'superseded', 'deleted']);

export const sourceContentDigest = (content: string): string => `sha256:${createHash('sha256').update(content, 'utf8').digest('hex')}`;
const namespaceIdentity = (n: MemoryNamespace) => [n.repoId, n.branchId, n.lineageId];
const namespaceKey = (n: MemoryNamespace): string => digest(namespaceIdentity(n));
export const sourceNodeId = (sourceId: string, revision: string, n: MemoryNamespace): string => `source:${digest([...namespaceIdentity(n), sourceId, revision]).slice(7)}`;
export const claimNodeId = (claimId: string, n: MemoryNamespace): string => `claim:${digest([...namespaceIdentity(n), claimId]).slice(7)}`;
/** Binds the immutable assertion. Approval/freshness metadata do not change this evidence subject. */
export function claimAssertionDigest(claim: Claim): string {
  return digest({ claimId: claim.claimId, statement: claim.statement, assertionType: claim.assertionType, sourceRefs: claim.sourceRefs,
    applicableScope: claim.applicableScope, ...(claim.decisionBy ? { decisionBy: claim.decisionBy } : {}), ...(claim.supersedes ? { supersedes: claim.supersedes } : {}) });
}
const scopeOf = (n: MemoryNamespace): Claim['applicableScope'] => ({ repoId: n.repoId, allowedPaths: n.allowedPaths, taskClasses: n.taskClasses });
const fits = (n: MemoryNamespace, access: MemoryNamespace): boolean => namespaceKey(n) === namespaceKey(access) &&
  n.allowedPaths.every(p => isWithinScope(p, access.allowedPaths)) && n.taskClasses.every(c => access.taskClasses.includes(c));
const same = (a: unknown, b: unknown): boolean => digest(a) === digest(b);

interface Origin { id: string; contentDigest: string; nodeId: string }
interface StoredNode {
  view: MemoryNode; namespace: MemoryNamespace; record: SourceRecord | Claim | DependencyInput;
  origins: Origin[]; sourceBindings: SourceBinding[]; assertionDigest?: string;
  source?: { provenance: SourceProvenance; checkedAt: string | null; freshnessOverride?: 'stale' };
}
interface StoredEvidence { evidence: PromotionEvidence; recordedBy: string; digest: string }
interface StoredReview { input: ReviewInput; report: ValidationReport; proposalDigest: string }

/** Trusted local broker API. Candidate text/Markdown never supplies principals or changes authority. */
export class MemoryStore {
  readonly root: string;
  private readonly db: DatabaseSync;
  private readonly options: MemoryOptions;
  private dirty = false;
  constructor(root: string, options: MemoryOptions) {
    this.options = { principals: structuredClone(options.principals), namespaces: options.namespaces.map(n => namespaceSchema.parse(n)), ...(options.now ? { now: options.now } : {}), minimumIndependentOrigins: options.minimumIndependentOrigins ?? 1 };
    if (!Number.isSafeInteger(this.options.minimumIndependentOrigins) || this.options.minimumIndependentOrigins! < 1) throw new Error('MEMORY_ORIGIN_POLICY');
    if (new Set(options.principals.map(p => p.id)).size !== options.principals.length) throw new Error('MEMORY_PRINCIPAL_AMBIGUOUS');
    mkdirSync(root, { recursive: true, mode: 0o700 });
    if (lstatSync(root).isSymbolicLink()) throw new Error('MEMORY_UNSAFE_STORE');
    this.root = realpathSync(root); chmodSync(this.root, 0o700);
    const file = path.join(this.root, 'memory.db');
    for (const candidate of [file, `${file}-wal`, `${file}-shm`]) if (existsSync(candidate)) { const s = lstatSync(candidate); if (!s.isFile() || s.isSymbolicLink() || s.nlink !== 1) throw new Error('MEMORY_UNSAFE_STORE'); }
    this.db = new DatabaseSync(file); chmodSync(file, 0o600);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=3000;
      CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS nodes(id TEXT PRIMARY KEY,kind TEXT NOT NULL,ns TEXT NOT NULL,body TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS edges(id TEXT PRIMARY KEY,from_id TEXT NOT NULL,to_id TEXT NOT NULL,body TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS aux(kind TEXT NOT NULL,id TEXT NOT NULL,body TEXT NOT NULL,PRIMARY KEY(kind,id));
      CREATE TABLE IF NOT EXISTS history(node_id TEXT NOT NULL,sequence INTEGER NOT NULL,body TEXT NOT NULL,PRIMARY KEY(node_id,sequence));
      CREATE VIRTUAL TABLE IF NOT EXISTS search USING fts5(node_id UNINDEXED,label,content,tokenize='unicode61');
      INSERT OR IGNORE INTO meta VALUES('schema','memory-store/1'); INSERT OR IGNORE INTO meta VALUES('version','0');`);
    if (this.db.prepare("SELECT value FROM meta WHERE key='schema'").get()?.value !== 'memory-store/1') { this.db.close(); throw new Error('MEMORY_STORE_VERSION'); }
    const authorityDigest = digest({ principals: this.options.principals, namespaces: this.options.namespaces, minimumIndependentOrigins: options.minimumIndependentOrigins ?? 1 });
    const authority = this.db.prepare("SELECT value FROM meta WHERE key='authority'").get();
    if (authority && authority.value !== authorityDigest) { this.db.close(); throw new Error('MEMORY_AUTHORITY_CHANGED'); }
    this.db.prepare("INSERT OR IGNORE INTO meta VALUES('authority',?)").run(authorityDigest);
    for (const candidate of [file, `${file}-wal`, `${file}-shm`]) if (existsSync(candidate)) chmodSync(candidate, 0o600);
  }
  close(): void { this.db.close(); }
  get memoryVersion(): string { return `memory:${String(this.db.prepare("SELECT value FROM meta WHERE key='version'").get()!.value)}`; }
  private now(): string { return z.iso.datetime({ offset: true }).parse(this.options.now?.() ?? new Date().toISOString()); }
  private namespace(input: MemoryNamespace): MemoryNamespace {
    const n = namespaceSchema.parse(input);
    if (new Set(n.allowedPaths).size !== n.allowedPaths.length || new Set(n.taskClasses).size !== n.taskClasses.length || !this.options.namespaces.some(x => fits(n, x))) throw new Error('MEMORY_UNKNOWN_SCOPE_OR_LINEAGE');
    return n;
  }
  private actor(id: string, n: MemoryNamespace, roles?: readonly Principal['role'][]): Principal {
    const p = this.options.principals.find(x => x.id === id);
    if (!p || !p.projectIds.includes(n.repoId) || (roles && !roles.includes(p.role))) throw new Error('MEMORY_PERMISSION_DENIED');
    return p;
  }
  private transaction<T>(operation: () => T): T {
    this.db.exec('BEGIN IMMEDIATE'); this.dirty = false;
    try {
      const result = operation();
      if (this.dirty) this.db.exec("UPDATE meta SET value=CAST(value AS INTEGER)+1 WHERE key='version'");
      this.db.exec('COMMIT'); return result;
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  private read<T>(kind: string, id: string): T | undefined { const r = this.db.prepare('SELECT body FROM aux WHERE kind=? AND id=?').get(kind, id); return r ? JSON.parse(String(r.body)) as T : undefined; }
  private write(kind: string, id: string, value: unknown): void { this.db.prepare('INSERT INTO aux VALUES(?,?,?) ON CONFLICT(kind,id) DO UPDATE SET body=excluded.body').run(kind, id, canonicalJson(value)); }
  private immutable(kind: string, id: string, value: unknown): void {
    const old = this.read(kind, id);
    if (old !== undefined && !same(old, value)) throw new Error('MEMORY_IMMUTABLE_CONFLICT');
    if (old === undefined) this.write(kind, id, value);
  }
  private node(id: string): StoredNode | undefined { const r = this.db.prepare('SELECT body FROM nodes WHERE id=?').get(id); return r ? JSON.parse(String(r.body)) as StoredNode : undefined; }
  private nodes(): StoredNode[] { return this.db.prepare('SELECT body FROM nodes ORDER BY id').all().map(r => JSON.parse(String(r.body)) as StoredNode); }
  private edges(): MemoryEdge[] { return this.db.prepare('SELECT body FROM edges ORDER BY id').all().map(r => JSON.parse(String(r.body)) as MemoryEdge); }
  private putNode(n: StoredNode): void {
    n.view.recordDigest = digest(n.record);
    this.db.prepare('INSERT INTO nodes VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body').run(n.view.id, n.view.kind, namespaceKey(n.namespace), canonicalJson(n));
    this.db.prepare('DELETE FROM search WHERE node_id=?').run(n.view.id);
    this.db.prepare('INSERT INTO search(node_id,label,content) VALUES(?,?,?)').run(n.view.id, n.view.label, n.view.content);
    const sequence = Number(this.db.prepare('SELECT COALESCE(MAX(sequence),0)+1 AS next FROM history WHERE node_id=?').get(n.view.id)!.next);
    this.db.prepare('INSERT INTO history VALUES(?,?,?)').run(n.view.id, sequence, canonicalJson(n)); this.dirty = true;
  }
  private putEdge(edge: Omit<MemoryEdge, 'id'>): void {
    const value = { id: `edge:${digest(edge).slice(7)}`, ...edge };
    if (this.db.prepare('SELECT id FROM edges WHERE id=?').get(value.id)) return;
    this.db.prepare('INSERT INTO edges VALUES(?,?,?,?)').run(value.id, value.from, value.to, canonicalJson(value)); this.dirty = true;
  }
  private sourceHead(sourceId: string, n: MemoryNamespace): StoredNode | undefined {
    const nodeId = this.read<string>('source-head', digest([...namespaceIdentity(n), sourceId])); return nodeId ? this.node(nodeId) : undefined;
  }
  private sourceFromBinding(binding: SourceBinding, n: MemoryNamespace): StoredNode {
    const node = this.node(sourceNodeId(binding.sourceId, binding.sourceRevision, n));
    if (!node || node.view.kind !== 'source' || node.view.contentDigest !== binding.contentDigest || !fits(node.namespace, n)) throw new Error('MEMORY_SOURCE_PIN_MISMATCH');
    return node;
  }
  private invalidate(ids: readonly string[], reason: string): void {
    const queue = ids.map(id => ({ id, uncertain: false })), seen = new Set<string>();
    const edges = this.edges();
    while (queue.length) {
      const { id, uncertain } = queue.shift()!; if (seen.has(id)) continue; seen.add(id);
      const effectiveReason = uncertain ? 'inferred-dependency-uncertain' : reason;
      const node = this.node(id); if (!node) throw new Error('MEMORY_UNKNOWN_DEPENDENCY');
      if (!node.view.status.reasons.includes(effectiveReason) || node.view.status.validity !== 'invalidated') {
        node.view.status.validity = 'invalidated'; node.view.status.reasons = [...new Set([...node.view.status.reasons, effectiveReason])];
        if (node.view.kind !== 'source') {
          node.view.status.freshness = uncertain ? 'unknown' : 'stale';
          if (node.view.kind === 'claim') (node.record as Claim).freshness = node.view.status.freshness;
        }
        this.putNode(node);
      }
      for (const edge of edges) if (edge.to === id && dependentKinds.has(edge.type)) queue.push({ id: edge.from, uncertain: uncertain || edge.assertion === 'inferred' });
    }
  }
  private computedFreshness(node: StoredNode): Claim['freshness'] {
    if (node.view.kind !== 'source') return node.view.status.freshness;
    const record = node.record as SourceRecord, at = Date.parse(this.now()), observed = Date.parse(node.source?.checkedAt ?? record.observedAt);
    if (node.source?.freshnessOverride) return node.source.freshnessOverride;
    if (record.freshness !== 'fresh') return record.freshness;
    if (observed > at || (record.effectiveFrom && Date.parse(record.effectiveFrom) > at)) return 'unknown';
    if (record.effectiveUntil && Date.parse(record.effectiveUntil) <= at) return 'stale';
    // A per-use live fetch adapter is deliberately not faked by the local mock refresh path.
    if (record.freshnessPolicy === 'revalidateBeforeUse') return 'unknown';
    if (record.freshnessPolicy === 'live' && at - observed > record.maxAge! * 1000) return 'stale';
    return 'fresh';
  }
  private tick(): void {
    this.transaction(() => {
      for (const node of this.nodes()) {
        if (node.view.kind !== 'source') continue;
        const freshness = this.computedFreshness(node);
        if (node.view.status.freshness === freshness) continue;
        node.view.status.freshness = freshness; this.putNode(node);
        if (freshness !== 'fresh') this.invalidate([node.view.id], 'source-not-fresh');
      }
    });
  }
  private usable(n: StoredNode): boolean {
    return n.view.current && n.view.status.validity === 'valid' && n.view.status.freshness === 'fresh' &&
      !blockedLifecycles.has(n.view.status.lifecycle) && (n.view.kind !== 'claim' || n.view.status.lifecycle === 'approved');
  }
  ingest(input: SourceInput, actorId: string): MemoryNode {
    canonicalJson(input);
    const n = this.namespace(input.namespace); this.actor(actorId, n, ['memoryPromoter']);
    if (input.purpose !== 'knowledge') throw new Error('MEMORY_HOLDOUT_FORBIDDEN');
    const record = parseContract('SourceRecord', input.record), parsedProvenance = provenanceSchema.parse(input.provenance);
    const provenance: SourceProvenance = { kind: parsedProvenance.kind, originId: parsedProvenance.originId, ...(parsedProvenance.derivedFrom ? { derivedFrom: parsedProvenance.derivedFrom } : {}) };
    if (sourceContentDigest(input.content) !== record.contentDigest) throw new Error('MEMORY_SOURCE_HASH');
    if ((provenance.kind === 'derived') !== !!provenance.derivedFrom) throw new Error('MEMORY_DERIVED_LINEAGE_REQUIRED');
    const nodeId = sourceNodeId(record.sourceId, record.sourceRevision, n);
    this.transaction(() => {
      const existing = this.node(nodeId);
      if (existing) {
        if (!same(existing.record, record) || existing.view.content !== input.content || !same(existing.namespace, n) || !same(existing.source?.provenance, provenance)) throw new Error('MEMORY_SOURCE_REVISION_CONFLICT');
        return;
      }
      const parents = (provenance.derivedFrom ?? []).map(binding => this.sourceFromBinding(binding, n));
      if (parents.some(parent => !this.usable(parent))) throw new Error('MEMORY_DERIVED_SOURCE_UNUSABLE');
      const origins: Origin[] = provenance.kind === 'primary' ? [{ id: provenance.originId, contentDigest: record.contentDigest, nodeId }] :
        [...new Map(parents.flatMap(p => p.origins).map(o => [o.id + ':' + o.contentDigest, o])).values()];
      const old = this.sourceHead(record.sourceId, n);
      if (old && !fits(old.namespace, n)) throw new Error('MEMORY_SOURCE_SCOPE_CONFLICT');
      if (old) { old.view.current = false; old.view.status.lifecycle = 'superseded'; this.putNode(old); this.invalidate([old.view.id], 'source-revision-changed'); }
      const node: StoredNode = { namespace: n, record, origins, sourceBindings: [], source: { provenance, checkedAt: null }, view: {
        id: nodeId, kind: 'source', label: record.sourceId, content: input.content, sourceRef: record.sourceRef, scope: scopeOf(n), branchId: n.branchId, lineageId: n.lineageId,
        revision: record.sourceRevision, contentDigest: record.contentDigest, recordDigest: digest(record),
        provenance: { sourceRefs: parents.map(p => p.view.id), originIds: origins.map(o => o.id), derived: provenance.kind === 'derived' },
        status: { lifecycle: 'active', freshness: record.freshness, validity: 'valid', reasons: [] }, current: true,
      } };
      node.view.status.freshness = this.computedFreshness(node);
      if (node.view.status.freshness !== 'fresh') { node.view.status.validity = 'invalidated'; node.view.status.reasons = ['source-not-fresh']; }
      this.putNode(node); this.write('source-head', digest([...namespaceIdentity(n), record.sourceId]), nodeId);
      for (const parent of parents) this.putEdge({ from: nodeId, to: parent.view.id, type: 'depends_on', assertion: 'explicit', provenanceRef: nodeId });
    });
    return this.getNode(nodeId, n)!;
  }
  getSource(sourceId: string, revision: string, namespace: MemoryNamespace): { record: SourceRecord; content: string; nodeId: string } | undefined {
    const n = this.namespace(namespace), node = this.node(sourceNodeId(sourceId, revision, n));
    if (!node || !fits(node.namespace, n)) return undefined;
    return { record: structuredClone(node.record as SourceRecord), content: node.view.content, nodeId: node.view.id };
  }
  getNode(id: string, namespace: MemoryNamespace): MemoryNode | undefined { return this.exportSnapshot(namespace).nodes.find(n => n.id === id); }
  transitionSource(input: { sourceId: string; sourceRevision?: string; namespace: MemoryNamespace; to: 'stale' | 'quarantined' | 'revoked' | 'deleted'; reason: string }, actorId: string): void {
    const n = this.namespace(input.namespace); this.actor(actorId, n, ['memoryPromoter']);
    if (!['stale', 'quarantined', 'revoked', 'deleted'].includes(input.to) || !input.reason.trim()) throw new Error('MEMORY_TRANSITION_INVALID');
    this.transaction(() => {
      const selected = this.nodes().filter(node => node.view.kind === 'source' && namespaceKey(node.namespace) === namespaceKey(n) &&
        (node.record as SourceRecord).sourceId === input.sourceId && (!input.sourceRevision || (node.record as SourceRecord).sourceRevision === input.sourceRevision));
      if (!selected.length || selected.some(node => !fits(node.namespace, n))) throw new Error('MEMORY_SOURCE_MISSING');
      for (const node of selected) {
        const lifecycle = input.to === 'stale' ? node.view.status.lifecycle : input.to;
        node.source!.freshnessOverride = 'stale';
        if (node.view.status.lifecycle !== lifecycle || node.view.status.freshness !== 'stale') { node.view.status.lifecycle = lifecycle; node.view.status.freshness = 'stale'; this.putNode(node); }
        this.invalidate([node.view.id], `source-${input.to}`);
      }
    });
  }
  deleteSource(sourceId: string, namespace: MemoryNamespace, actorId: string): void { this.transitionSource({ sourceId, namespace, to: 'deleted', reason: 'Explicit source deletion; history retained' }, actorId); }
  /** Local fixture adapter only; no network request or external-source authenticity claim. */
  refreshSource(input: { sourceId: string; namespace: MemoryNamespace; adapter: 'mock'; sourceRevision: string; content: string; observedAt: string }, actorId: string): MemoryNode {
    const n = this.namespace(input.namespace); this.actor(actorId, n, ['memoryPromoter']);
    if (input.adapter !== 'mock') throw new Error('MEMORY_REFRESH_UNSUPPORTED');
    z.iso.datetime({ offset: true }).parse(input.observedAt);
    let head = this.sourceHead(input.sourceId, n);
    if (!head || !fits(head.namespace, n) || blockedLifecycles.has(head.view.status.lifecycle)) throw new Error('MEMORY_SOURCE_UNUSABLE');
    if (input.sourceRevision !== (head.record as SourceRecord).sourceRevision) return this.ingest({ record: { ...head.record as SourceRecord, sourceRevision: input.sourceRevision,
      contentDigest: sourceContentDigest(input.content), observedAt: input.observedAt, freshness: 'fresh' }, content: input.content, namespace: head.namespace,
      provenance: head.source!.provenance, purpose: 'knowledge' }, actorId);
    if (sourceContentDigest(input.content) !== head.view.contentDigest) throw new Error('MEMORY_SOURCE_REVISION_CONFLICT');
    const expectedHead = head.view.id;
    this.transaction(() => {
      // Re-read while holding the SQLite write lock; a concurrent revoke must not be overwritten.
      head = this.sourceHead(input.sourceId, n);
      if (!head || head.view.id !== expectedHead || !fits(head.namespace, n) || blockedLifecycles.has(head.view.status.lifecycle)) throw new Error('MEMORY_SOURCE_UNUSABLE');
      head.source!.checkedAt = input.observedAt; delete head.source!.freshnessOverride;
      head.view.status.freshness = this.computedFreshness(head);
      if (head.view.status.freshness === 'fresh') {
        head.view.status.reasons = head.view.status.reasons.filter(x => !['source-not-fresh', 'source-stale'].includes(x));
        if (!head.view.status.reasons.length) head.view.status.validity = 'valid';
      }
      this.putNode(head);
    });
    return this.getNode(expectedHead, n)!;
  }
  propose(deltaInput: MemoryDelta, namespace: MemoryNamespace, actorId: string): Proposal {
    this.tick();
    const delta = parseContract('MemoryDelta', deltaInput), n = this.namespace(namespace); this.actor(actorId, n);
    if (delta.expectedMemoryVersion !== this.memoryVersion) throw new Error('MEMORY_VERSION_CONFLICT');
    const claimIds = delta.claimsAdded.map(c => c.claimId);
    if (new Set(claimIds).size !== claimIds.length) throw new Error('MEMORY_DUPLICATE_CLAIM');
    const sourceBindings = delta.claimsAdded.map(claim => {
      if (!same(claim.applicableScope, scopeOf(n)) || claim.reviewRef || claim.approvedBy || claim.promotionEvidenceRefs.length) throw new Error('MEMORY_PROPOSAL_AUTHORITY');
      const sources = claim.sourceRefs.map(sourceId => {
        const source = this.sourceHead(sourceId, n); if (!source || !fits(source.namespace, n)) throw new Error('MEMORY_SOURCE_MISSING');
        const record = source.record as SourceRecord; return { sourceId, sourceRevision: record.sourceRevision, contentDigest: record.contentDigest };
      });
      return { claimId: claim.claimId, sources };
    });
    const body = { delta, namespace: n, proposedBy: actorId, sourceBindings };
    const proposal: Proposal = { ...body, digest: digest(body) };
    this.transaction(() => this.immutable('proposal', delta.deltaId, proposal)); return structuredClone(proposal);
  }
  getProposal(deltaId: string, namespace: MemoryNamespace): Proposal | undefined {
    const n = this.namespace(namespace), proposal = this.read<Proposal>('proposal', deltaId);
    return proposal && fits(proposal.namespace, n) ? structuredClone(proposal) : undefined;
  }
  recordEvidence(input: PromotionEvidence, actorId: string): void {
    const evidence = evidenceSchema.parse(input), n = this.namespace(evidence.namespace); this.actor(actorId, n, ['verificationRunner']);
    if (new Set(evidence.sourceBindings.map(x => x.sourceId)).size !== evidence.sourceBindings.length) throw new Error('MEMORY_EVIDENCE_DUPLICATE_SOURCE');
    for (const binding of evidence.sourceBindings) this.sourceFromBinding(binding, n);
    const value: StoredEvidence = { evidence, recordedBy: actorId, digest: digest(evidence) };
    this.transaction(() => this.immutable('evidence', evidence.evidenceId, value));
  }
  /** Explicit local decision authority, distinct from a candidate writing decisionBy in a claim. */
  authorizeDecision(claimInput: Claim, namespace: MemoryNamespace, reviewRef: string, actorId: string): void {
    const claim = parseContract('Claim', claimInput), n = this.namespace(namespace);
    this.actor(actorId, n, ['critic', 'memoryPromoter']); text.parse(reviewRef);
    if (claim.assertionType !== 'decision' || claim.decisionBy !== actorId || !same(claim.applicableScope, scopeOf(n))) throw new Error('MEMORY_DECISION_AUTHORITY');
    this.tick();
    this.transaction(() => {
      const bindings = claim.sourceRefs.map(id => {
        const source = this.sourceHead(id, n);
        if (!source || !fits(source.namespace, n) || !this.usable(source) || (source.record as SourceRecord).sourceType !== 'decision') throw new Error('MEMORY_DECISION_SOURCE_REQUIRED');
        const r = source.record as SourceRecord; return { sourceId: r.sourceId, sourceRevision: r.sourceRevision, contentDigest: r.contentDigest };
      });
      this.immutable('decision-authority', digest([namespaceKey(n), claimAssertionDigest(claim)]), { actorId, reviewRef, assertionDigest: claimAssertionDigest(claim), namespace: n, bindings });
    });
  }
  private proposalIssues(proposal: Proposal): string[] {
    const issues: string[] = [], { delta, namespace: n } = proposal;
    if (delta.expectedMemoryVersion !== this.memoryVersion) issues.push('memory-version-conflict');
    const referencedEvidence = delta.sourceEvidenceIds.map(id => this.read<StoredEvidence>('evidence', id));
    if (referencedEvidence.some(x => !x)) issues.push('missing-evidence');
    if (referencedEvidence.some(e => e && !delta.claimsAdded.some(c => c.claimId === e.evidence.claimId))) issues.push('unbound-evidence');
    for (const claim of delta.claimsAdded) {
      const bindings = proposal.sourceBindings.find(x => x.claimId === claim.claimId)!.sources;
      const sources = bindings.map(b => this.sourceFromBinding(b, n));
      if (sources.some(s => !this.usable(s) || this.sourceHead((s.record as SourceRecord).sourceId, n)?.view.id !== s.view.id)) issues.push(`claim:${claim.claimId}:source-unusable`);
      const existing = this.node(claimNodeId(claim.claimId, n));
      if (existing && (existing.assertionDigest !== claimAssertionDigest(claim) || blockedLifecycles.has(existing.view.status.lifecycle))) issues.push(`claim:${claim.claimId}:immutable-conflict`);
      if (existing?.view.status.reasons.includes('unresolved-conflict')) issues.push(`claim:${claim.claimId}:unresolved-conflict`);
      if (claim.assertionType === 'decision') {
        const authority = this.read<{ actorId: string; bindings: SourceBinding[]; namespace: MemoryNamespace }>('decision-authority', digest([namespaceKey(n), claimAssertionDigest(claim)]));
        if (!authority || authority.actorId !== claim.decisionBy || !same(authority.bindings, bindings) || !same(authority.namespace, n) || sources.some(s => (s.record as SourceRecord).sourceType !== 'decision')) issues.push(`claim:${claim.claimId}:decision-authority`);
      }
      const matches = referencedEvidence.filter((e): e is StoredEvidence => !!e && e.evidence.claimId === claim.claimId &&
        e.evidence.assertionDigest === claimAssertionDigest(claim) && e.evidence.assertionType === claim.assertionType && same(e.evidence.namespace, n) && same(e.evidence.sourceBindings, bindings));
      if (!matches.length || matches.length !== referencedEvidence.filter(e => e?.evidence.claimId === claim.claimId).length || matches.some(e => e.evidence.conclusion !== 'supported')) issues.push(`claim:${claim.claimId}:unsupported`);
      // A derived copy carries the original roots; additional copies do not create independent origins.
      if (new Set(sources.flatMap(s => s.origins.map(o => o.id))).size < this.options.minimumIndependentOrigins!) issues.push(`claim:${claim.claimId}:insufficient-independent-origins`);
    }
    for (const id of [...delta.claimsSuperseded, ...delta.claimsQuarantined, ...delta.claimsRevoked]) {
      const target = this.node(claimNodeId(id, n)); if (!target || !fits(target.namespace, n)) issues.push(`claim:${id}:missing-transition-target`);
    }
    for (const id of delta.claimsSuperseded) if (!delta.claimsAdded.some(c => c.supersedes === id)) issues.push(`claim:${id}:missing-successor`);
    return issues;
  }
  validate(deltaId: string, input: ReviewInput, actorId: string): ValidationReport {
    this.tick();
    const review = z.strictObject({ reviewRef: text, decision: z.enum(['approve', 'reject']), reason: text }).parse(input);
    const proposal = this.read<Proposal>('proposal', deltaId); if (!proposal) throw new Error('MEMORY_PROPOSAL_MISSING');
    this.actor(actorId, proposal.namespace, ['critic']);
    if (actorId === proposal.proposedBy || review.reviewRef !== proposal.delta.promotionReviewRef) throw new Error('MEMORY_REVIEW_BINDING');
    return this.transaction(() => {
      const issues = this.proposalIssues(proposal); if (review.decision !== 'approve') issues.push('review-rejected');
      const report: ValidationReport = { deltaId, proposalDigest: proposal.digest, valid: issues.length === 0, issues, reviewRef: review.reviewRef, reviewedBy: actorId };
      this.immutable('review', review.reviewRef, { input: review, report, proposalDigest: proposal.digest } satisfies StoredReview); return report;
    });
  }
  promote(deltaId: string, actorId: string): { memoryVersion: string; claimIds: string[] } {
    this.tick();
    this.transaction(() => {
      const proposal = this.read<Proposal>('proposal', deltaId); if (!proposal) throw new Error('MEMORY_PROPOSAL_MISSING');
      this.actor(actorId, proposal.namespace, ['memoryPromoter']);
      const already = this.read('promoted', deltaId); if (already) return;
      const review = this.read<StoredReview>('review', proposal.delta.promotionReviewRef);
      if (!review?.report.valid || review.proposalDigest !== proposal.digest || review.report.reviewedBy === actorId || review.input.decision !== 'approve') throw new Error('MEMORY_REVIEW_REQUIRED');
      this.actor(review.report.reviewedBy, proposal.namespace, ['critic']);
      if (this.proposalIssues(proposal).length) throw new Error('MEMORY_PROMOTION_INVALID');
      const n = proposal.namespace;
      for (const proposed of proposal.delta.claimsAdded) {
        const bindings = proposal.sourceBindings.find(x => x.claimId === proposed.claimId)!.sources, sources = bindings.map(b => this.sourceFromBinding(b, n));
        const evidenceRefs = proposal.delta.sourceEvidenceIds.filter(id => this.read<StoredEvidence>('evidence', id)?.evidence.claimId === proposed.claimId);
        const claim = parseContract('Claim', { ...proposed, lifecycle: 'approved', evidenceStatus: 'supported', freshness: 'fresh',
          reviewRef: review.report.reviewRef, approvedBy: actorId, promotionEvidenceRefs: evidenceRefs });
        const nodeId = claimNodeId(claim.claimId, n), origins = [...new Map(sources.flatMap(s => s.origins).map(o => [o.id + ':' + o.contentDigest, o])).values()];
        const old = this.node(nodeId);
        // A reviewed refresh replaces the exact source bindings, while prior descendants remain invalid.
        if (old) for (const edge of this.edges()) if (edge.from === nodeId && edge.type === 'justified_by' && edge.provenanceRef === nodeId) {
          this.db.prepare('DELETE FROM edges WHERE id=?').run(edge.id); this.dirty = true;
        }
        const node: StoredNode = { namespace: n, record: claim, origins, sourceBindings: bindings, assertionDigest: claimAssertionDigest(claim), view: {
          id: nodeId, kind: 'claim', label: claim.claimId, content: claim.statement, scope: claim.applicableScope, branchId: n.branchId, lineageId: n.lineageId,
          revision: String(Number(old?.view.revision ?? '0') + 1), contentDigest: sourceContentDigest(claim.statement), recordDigest: digest(claim),
          provenance: { sourceRefs: sources.map(s => s.view.id), originIds: origins.map(o => o.id), derived: claim.assertionType === 'inferred', assertionType: claim.assertionType },
          status: { lifecycle: 'approved', freshness: 'fresh', validity: 'valid', reasons: [] }, current: true,
        } };
        this.putNode(node);
        for (const source of sources) this.putEdge({ from: nodeId, to: source.view.id, type: 'justified_by', assertion: 'explicit', provenanceRef: nodeId });
        if (claim.supersedes) this.putEdge({ from: nodeId, to: claimNodeId(claim.supersedes, n), type: 'supersedes', assertion: 'explicit', provenanceRef: nodeId });
      }
      for (const [to, ids] of [['superseded', proposal.delta.claimsSuperseded], ['quarantined', proposal.delta.claimsQuarantined], ['revoked', proposal.delta.claimsRevoked]] as const) {
        for (const claimId of ids) this.transitionInternal(claimNodeId(claimId, n), to);
      }
      this.write('promoted', deltaId, { proposalDigest: proposal.digest, approvedBy: actorId });
    });
    const proposal = this.read<Proposal>('proposal', deltaId)!;
    return { memoryVersion: this.memoryVersion, claimIds: proposal.delta.claimsAdded.map(c => claimNodeId(c.claimId, proposal.namespace)) };
  }
  private transitionInternal(nodeId: string, to: TransitionInput['to']): void {
    const node = this.node(nodeId); if (!node || node.view.kind !== 'claim') throw new Error('MEMORY_CLAIM_MISSING');
    if (node.view.status.lifecycle !== to) { (node.record as Claim).lifecycle = to; node.view.status.lifecycle = to; this.putNode(node); }
    this.invalidate([nodeId], `claim-${to}`);
  }
  transition(input: TransitionInput, actorId: string): void {
    const n = this.namespace(input.namespace); this.actor(actorId, n, ['memoryPromoter']);
    if (!['quarantined', 'revoked', 'superseded'].includes(input.to) || !input.reason.trim() || !input.reviewRef.trim()) throw new Error('MEMORY_TRANSITION_INVALID');
    this.transaction(() => {
      if (input.expectedMemoryVersion !== this.memoryVersion) throw new Error('MEMORY_VERSION_CONFLICT');
      const reviewed = this.read<{ inputDigest: string; review: ReviewInput; actorId: string }>('transition-review', input.reviewRef);
      if (!reviewed || reviewed.inputDigest !== digest(input) || reviewed.review.decision !== 'approve' || reviewed.actorId === actorId) throw new Error('MEMORY_REVIEW_REQUIRED');
      this.actor(reviewed.actorId, n, ['critic']);
      const node = this.node(claimNodeId(input.claimId, n)); if (!node || !fits(node.namespace, n)) throw new Error('MEMORY_CLAIM_MISSING');
      if (input.to === 'superseded') {
        const successor = input.supersededBy ? this.node(claimNodeId(input.supersededBy, n)) : undefined;
        if (!successor || !this.usable(successor) || (successor.record as Claim).supersedes !== input.claimId) throw new Error('MEMORY_SUCCESSOR_REQUIRED');
      }
      this.transitionInternal(node.view.id, input.to);
      this.immutable('transition-applied', digest(input), { ...input, actorId });
    });
  }
  reviewTransition(input: TransitionInput, review: ReviewInput, actorId: string): void {
    const n = this.namespace(input.namespace); this.actor(actorId, n, ['critic']);
    const parsed = z.strictObject({ reviewRef: text, decision: z.enum(['approve', 'reject']), reason: text }).parse(review);
    if (review.reviewRef !== input.reviewRef || input.expectedMemoryVersion !== this.memoryVersion) throw new Error('MEMORY_REVIEW_BINDING');
    this.transaction(() => this.immutable('transition-review', input.reviewRef, { inputDigest: digest(input), review: parsed, actorId }));
  }
  link(input: Omit<MemoryEdge, 'id'>, actorId: string): MemoryEdge {
    const edge = edgeSchema.parse(input); this.tick();
    this.transaction(() => {
      const from = this.node(edge.from), to = this.node(edge.to);
      if (!from || !to || !fits(to.namespace, from.namespace)) throw new Error('MEMORY_EDGE_SCOPE');
      this.actor(actorId, from.namespace, ['memoryPromoter']);
      this.putEdge(edge);
      if (edge.type === 'conflicts_with') this.invalidate([edge.from, edge.to], 'unresolved-conflict');
      else if (dependentKinds.has(edge.type) && !this.usable(to)) this.invalidate([edge.from], 'dependency-unusable');
    });
    return { id: `edge:${digest(edge).slice(7)}`, ...edge };
  }
  registerDependency(input: DependencyInput, actorId: string): MemoryNode {
    canonicalJson(input); const n = this.namespace(input.namespace); this.actor(actorId, n);
    if (!['context', 'plan', 'handoff', 'artifact'].includes(input.kind) || !input.id.trim() || !input.label.trim() || !input.provenanceRef.trim() || !hash.safeParse(input.contentDigest).success || !input.dependsOn.length || input.dependsOn.some(b => b.type && !dependentKinds.has(b.type))) throw new Error('MEMORY_DEPENDENCY_INVALID');
    this.tick();
    this.transaction(() => {
    const parents = input.dependsOn.map(binding => {
      const parent = this.node(binding.nodeId);
      if (!parent || !fits(parent.namespace, n) || parent.view.contentDigest !== binding.contentDigest || !this.usable(parent)) throw new Error('MEMORY_DEPENDENCY_UNUSABLE');
      return parent;
    });
      const existing = this.node(input.id);
      if (existing) { if (!same(existing.record, input)) throw new Error('MEMORY_IMMUTABLE_CONFLICT'); return; }
      const origins = [...new Map(parents.flatMap(p => p.origins).map(o => [o.id + ':' + o.contentDigest, o])).values()];
      this.putNode({ namespace: n, record: input, origins, sourceBindings: [], view: {
        id: input.id, kind: input.kind, label: input.label, content: '', scope: scopeOf(n), branchId: n.branchId, lineageId: n.lineageId,
        revision: '1', contentDigest: input.contentDigest, recordDigest: digest(input), current: true,
        provenance: { sourceRefs: [...new Set(parents.flatMap(p => p.view.kind === 'source' ? [p.view.id] : p.view.provenance.sourceRefs))], originIds: origins.map(o => o.id), derived: true },
        status: { lifecycle: 'registered', freshness: 'fresh', validity: 'valid', reasons: [] },
      } });
      for (const binding of input.dependsOn) this.putEdge({ from: input.id, to: binding.nodeId, type: binding.type ?? 'depends_on', assertion: 'explicit', provenanceRef: input.id });
    });
    return this.getNode(input.id, n)!;
  }
  exportSnapshot(namespace: MemoryNamespace): MemorySnapshot {
    const n = this.namespace(namespace); this.tick();
    return this.transaction(() => {
    const stored = this.nodes().filter(node => fits(node.namespace, n)), visible = new Set(stored.map(node => node.view.id));
    const nodes = stored.map(node => {
      const view = structuredClone(node.view);
      view.provenance.sourceRefs = view.provenance.sourceRefs.filter(ref => visible.has(ref));
      view.provenance.originIds = [...new Set(node.origins.filter(origin => visible.has(origin.nodeId)).map(origin => origin.id))];
      return view;
    });
    const edges = this.edges().filter(edge => visible.has(edge.from) && visible.has(edge.to)).map(edge => ({ ...edge,
      provenanceRef: visible.has(edge.provenanceRef) ? edge.provenanceRef : 'recorded-provenance' }));
    const body = { schemaVersion: 'memory-snapshot/1' as const, namespace: n, memoryVersion: this.memoryVersion, generatedAt: this.now(), nodes, edges };
    return { ...body, digest: digest(body) };
    });
  }
  query(options: MemoryQuery): MemoryNode[] {
    const snapshot = this.exportSnapshot(options.namespace), limit = options.limit ?? 10, hops = options.expandHops ?? 0;
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100 || !Number.isSafeInteger(hops) || hops < 0 || hops > 2) throw new Error('MEMORY_QUERY_LIMIT');
    const available = new Map(snapshot.nodes.filter(node => options.includeUnusable || (node.current && node.status.validity === 'valid' && node.status.freshness === 'fresh' &&
      !blockedLifecycles.has(node.status.lifecycle) && (node.kind !== 'claim' || node.status.lifecycle === 'approved'))).map(node => [node.id, node]));
    const tokens = (options.text ?? '').match(/[\p{L}\p{N}_]+/gu) ?? [];
    const ordered = tokens.length ? this.db.prepare('SELECT node_id FROM search WHERE search MATCH ? ORDER BY bm25(search), node_id').all(tokens.slice(0, 20).map(x => `"${x}"`).join(' OR ')).map(row => String(row.node_id)) : [...available.keys()];
    const resultIds = ordered.filter(id => available.has(id)).slice(0, limit);
    let frontier = [...resultIds];
    for (let hop = 0; hop < hops && resultIds.length < limit; hop++) {
      const next: string[] = [];
      for (const edge of snapshot.edges) {
        if (edge.assertion !== 'explicit' || edge.type === 'conflicts_with') continue;
        for (const [from, to] of [[edge.from, edge.to], [edge.to, edge.from]]) if (frontier.includes(from!) && available.has(to!) && !resultIds.includes(to!) && resultIds.length < limit) { resultIds.push(to!); next.push(to!); }
      }
      frontier = next;
    }
    return resultIds.map(id => available.get(id)!);
  }
  /** Disposable one-way Markdown projection. Editing these files never edits the database. */
  writeMarkdownSnapshot(namespace: MemoryNamespace): { directory: string; snapshot: MemorySnapshot } {
    const snapshot = this.exportSnapshot(namespace), directory = path.join(this.root, 'knowledge', digest(snapshot.namespace).slice(7));
    const root = path.join(this.root, 'knowledge');
    for (const dir of [root, directory]) { if (existsSync(dir) && lstatSync(dir).isSymbolicLink()) throw new Error('MEMORY_UNSAFE_PROJECTION'); mkdirSync(dir, { recursive: true, mode: 0o700 }); }
    const filename = (node: MemoryNode): string => `${node.id.split(':')[0]}-${digest(node.id).slice(7)}.md`;
    for (const node of snapshot.nodes.filter(x => x.kind === 'source' || x.kind === 'claim')) {
      const folder = node.kind === 'source' ? 'raw' : node.provenance.assertionType === 'decision' ? 'decisions' : 'wiki';
      const dir = path.join(directory, folder); if (existsSync(dir) && lstatSync(dir).isSymbolicLink()) throw new Error('MEMORY_UNSAFE_PROJECTION'); mkdirSync(dir, { recursive: true, mode: 0o700 });
      const links = snapshot.edges.filter(e => e.from === node.id).flatMap(e => {
        const target = snapshot.nodes.find(n => n.id === e.to); if (!target || !['source', 'claim'].includes(target.kind)) return [];
        const parent = target.kind === 'source' ? 'raw' : target.provenance.assertionType === 'decision' ? 'decisions' : 'wiki';
        return [`- ${e.type}: [${target.label.replaceAll('[', '').replaceAll(']', '')}](../${parent}/${filename(target)})`];
      });
      const content = `---\nrecord_id: ${JSON.stringify(node.id)}\nrecord_digest: ${JSON.stringify(node.recordDigest)}\nlifecycle: ${JSON.stringify(node.status.lifecycle)}\nfreshness: ${JSON.stringify(node.status.freshness)}\nprojection: true\n---\n\n${node.content}\n\n${links.join('\n')}\n`;
      const file = path.join(dir, filename(node));
      if (existsSync(file) && (lstatSync(file).isSymbolicLink() || lstatSync(file).nlink !== 1)) throw new Error('MEMORY_UNSAFE_PROJECTION');
      const temporary = `${file}.tmp`; if (existsSync(temporary)) throw new Error('MEMORY_UNSAFE_PROJECTION');
      writeFileSync(temporary, content, { flag: 'wx', mode: 0o600 }); renameSync(temporary, file);
    }
    return { directory, snapshot };
  }
}
