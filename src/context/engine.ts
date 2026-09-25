import { z } from 'zod';
import { canonicalJson, digest, digestOmitting } from '../contracts/canonical.js';
import { SCHEMA_VERSION, schemas, type TaskSpec, type ContextBudget, type ContextManifest, type ContextBundle, type HandoffPacket } from '../contracts/schemas.js';
import { isSafeRelativePath, isWithinScope } from '../foundation/permissions.js';
import { resourceDigest } from '../skills/catalog.js';

export type ContextScope = ContextManifest['scope'];
export type ContextUnknown = ContextBundle['unknowns'][number];
export type ContextResourceKind = 'evidence' | 'skill-descriptor' | 'skill-body' | 'skill-reference' | 'tool-output';
export interface ContextResourcePin {
  ref: string; revision: string; contentHash: string; kind: ContextResourceKind;
  scope: ContextScope; branchId: string; lineageId: string;
  status: 'active' | 'stale' | 'revoked' | 'quarantined';
  trust: 'untrusted-data' | 'verified-evidence'; sourceRefs: string[]; dependencies: string[];
  skill?: { skillId: string; version: string; descriptorDigest: string; selectionDigest: string; resourcePath: string };
}
export interface ContextAgentPolicy {
  agentId: string; role: string; scope: ContextScope; branchId: string; lineageId: string;
  budget: ContextBudget; mandatoryResourceRefs: string[]; unknowns: ContextUnknown[];
}
export interface ContextPredecessorPin {
  windowId: string; agentId: string; taskId: string; windowDigest: string; generation: number; originalHistoryDigest: string;
  role: string; scope: ContextScope; branchId: string; lineageId: string;
  unknowns: ContextUnknown[]; requiredResourceRefs: string[];
}
/** Supplied by the broker/canonical stores, never by a summary or executor output. */
export interface ContextAuthority {
  task: TaskSpec; contextPolicyVersion: string; snapshotId: string; memoryVersion: string;
  model: { modelConfigVersion: string; inputLimit: number; maxOutputTokens: number };
  agents: ContextAgentPolicy[]; resources: ContextResourcePin[];
  /** Populated from the protected issued-window store, never copied from a candidate's claimed parent. */
  predecessors?: ContextPredecessorPin[];
}
export interface ContextRequest {
  windowId: string; agentId: string; resourceRefs?: { ref: string; required: boolean }[];
  history?: string; unknowns?: ContextUnknown[];
}
export interface ContextIssue { code: string; ref: string; message: string }
export interface ContextValidation { status: 'ready' | 'blocked'; issues: ContextIssue[] }
export interface ContextCounter {
  id: string; unit: 'utf8-byte-units' | 'tokenizer-units';
  modelConfigVersion: string | null;
  /** Must be deterministic, local, and account for the complete serialized packet. */
  count(serializedPacket: string): number;
}
export const utf8ByteCounter: ContextCounter = Object.freeze({ id: 'utf8-bytes/1', unit: 'utf8-byte-units', modelConfigVersion: null,
  count: (text: string): number => Buffer.byteLength(text, 'utf8') });
export type ContextLoader = (pin: Readonly<ContextResourcePin>) => Promise<string> | string;
export interface ContextLoadEntry {
  ref: string; kind: ContextResourceKind | 'unknown'; revision: string | null; expectedDigest: string | null;
  state: 'planned' | 'loaded' | 'excluded' | 'blocked'; actualDigest: string | null;
  receiptRef: string | null; receiptDigest: string | null; required: boolean; reason: string | null;
}
export interface ContextLoadReceipt {
  receiptId: string; windowId: string; agentId: string; ref: string; revision: string;
  contentHash: string; pinDigest: string; resourceDigest: string;
  kind: 'context-payload-inclusion'; assurance: 'serialized-local-payload-not-provider-read';
}
export interface ContextBudgetReport {
  reportId: string; counterId: string; unit: ContextCounter['unit'];
  assurance: 'local-policy-accounting-only'; actualProviderTokens: null;
  packetUnits: number; packetUtf8Bytes: number; inputCapacity: number;
  inputLimit: number; outputReserve: number; headroom: number; modelMaxOutputTokens: number;
  fits: boolean;
}
export interface ContextPacket {
  schemaVersion: 'context-packet/1'; windowId: string; agentId: string; generation: number; parentWindowDigest: string | null;
  /** Canonical typed task, including every constraint and acceptance criterion, is never summarized. */
  task: TaskSpec; role: string; scope: ContextScope; branchId: string; lineageId: string;
  agentPolicyDigest: string; model: ContextAuthority['model']; contextPolicyVersion: string;
  acceptanceBindings: { criterionId: string; sourceRevision: string; contentHash: string }[];
  manifest: ContextManifest; bundle: ContextBundle;
  resources: { pin: ContextResourcePin; content: string; instructionAuthority: 'none' }[];
  history: { content: string; trust: 'untrusted-data'; originalHistoryDigest: string };
  loadPlan: ContextLoadEntry[]; loadReceipts: ContextLoadReceipt[]; budgetReport: ContextBudgetReport;
}
export interface ContextWindow extends ContextValidation { packet: ContextPacket; packetDigest: string; windowDigest: string }
export interface ContextTrace {
  traceId: string; windowId: string; agentId: string; taskId: string; role: string; scope: ContextScope;
  branchId: string; lineageId: string; packetDigest: string;
  entries: ContextLoadEntry[]; digest: string;
}

const hash = z.string().regex(/^sha256:[a-f0-9]{64}$/), text = z.string().min(1), natural = z.number().int().nonnegative().safe();
const scopeSchema = z.strictObject({ repoId: text, allowedPaths: z.array(text), taskClasses: z.array(text) });
const unknownSchema = z.strictObject({ id: text, description: text, critical: z.boolean() });
const modelSchema = z.strictObject({ modelConfigVersion: text, inputLimit: natural.positive(), maxOutputTokens: natural.positive() });
const kindSchema = z.enum(['evidence', 'skill-descriptor', 'skill-body', 'skill-reference', 'tool-output']);
const pinSchema = z.strictObject({ ref: text, revision: text, contentHash: hash, kind: kindSchema, scope: scopeSchema, branchId: text, lineageId: text,
  status: z.enum(['active', 'stale', 'revoked', 'quarantined']), trust: z.enum(['untrusted-data', 'verified-evidence']), sourceRefs: z.array(text).min(1), dependencies: z.array(text),
  skill: z.strictObject({ skillId: text, version: text, descriptorDigest: hash, selectionDigest: hash, resourcePath: text }).optional() });
const agentSchema = z.strictObject({ agentId: text, role: text, scope: scopeSchema, branchId: text, lineageId: text, budget: schemas.ContextBudget,
  mandatoryResourceRefs: z.array(text), unknowns: z.array(unknownSchema) });
const predecessorSchema = z.strictObject({ windowId: text, agentId: text, taskId: text, windowDigest: hash, generation: natural, originalHistoryDigest: hash, role: text, scope: scopeSchema, branchId: text, lineageId: text,
  unknowns: z.array(unknownSchema), requiredResourceRefs: z.array(text) });
const authoritySchema = z.strictObject({ task: schemas.TaskSpec, contextPolicyVersion: text, snapshotId: text, memoryVersion: text,
  model: modelSchema, agents: z.array(agentSchema).min(1), resources: z.array(pinSchema), predecessors: z.array(predecessorSchema).optional() });
const requestSchema = z.strictObject({ windowId: text, agentId: text, resourceRefs: z.array(z.strictObject({ ref: text, required: z.boolean() })).max(128).optional(),
  history: z.string().optional(), unknowns: z.array(unknownSchema).optional() });
const entrySchema = z.strictObject({ ref: text, kind: z.enum(['evidence', 'skill-descriptor', 'skill-body', 'skill-reference', 'tool-output', 'unknown']), revision: text.nullable(),
  expectedDigest: hash.nullable(), state: z.enum(['planned', 'loaded', 'excluded', 'blocked']), actualDigest: hash.nullable(), receiptRef: text.nullable(), receiptDigest: hash.nullable(), required: z.boolean(), reason: text.nullable() });
const receiptSchema = z.strictObject({ receiptId: text, windowId: text, agentId: text, ref: text, revision: text, contentHash: hash,
  pinDigest: hash, resourceDigest: hash, kind: z.literal('context-payload-inclusion'), assurance: z.literal('serialized-local-payload-not-provider-read') });
const reportSchema = z.strictObject({ reportId: text, counterId: text, unit: z.enum(['utf8-byte-units', 'tokenizer-units']), assurance: z.literal('local-policy-accounting-only'),
  actualProviderTokens: z.null(), packetUnits: natural, packetUtf8Bytes: natural, inputCapacity: natural, inputLimit: natural.positive(), outputReserve: natural,
  headroom: natural, modelMaxOutputTokens: natural.positive(), fits: z.boolean() });
const packetSchema = z.strictObject({ schemaVersion: z.literal('context-packet/1'), windowId: text, agentId: text, generation: natural, parentWindowDigest: hash.nullable(),
  task: schemas.TaskSpec, role: text, scope: scopeSchema, branchId: text, lineageId: text, agentPolicyDigest: hash, model: modelSchema, contextPolicyVersion: text,
  acceptanceBindings: z.array(z.strictObject({ criterionId: text, sourceRevision: text, contentHash: hash })), manifest: schemas.ContextManifest, bundle: schemas.ContextBundle,
  resources: z.array(z.strictObject({ pin: pinSchema, content: z.string(), instructionAuthority: z.literal('none') })),
  history: z.strictObject({ content: z.string(), trust: z.literal('untrusted-data'), originalHistoryDigest: hash }),
  loadPlan: z.array(entrySchema), loadReceipts: z.array(receiptSchema), budgetReport: reportSchema });
const windowSchema = z.strictObject({ packet: packetSchema, packetDigest: hash, windowDigest: hash, status: z.enum(['ready', 'blocked']),
  issues: z.array(z.strictObject({ code: text, ref: text, message: text })) });
const same = (a: unknown, b: unknown): boolean => digest(a) === digest(b);
const unique = (values: readonly string[]): boolean => new Set(values).size === values.length;
const issue = (code: string, ref: string, message: string): ContextIssue => ({ code, ref, message });
function assertJson(value: unknown): void { canonicalJson(value); }
function authorityOf(value: ContextAuthority): ContextAuthority {
  assertJson(value); const authority = authoritySchema.parse(value) as ContextAuthority;
  if (!unique(authority.agents.map(x => x.agentId)) || !unique(authority.resources.map(x => x.ref)) ||
    !unique(authority.task.constraints.map(x => x.id)) || !unique(authority.task.acceptanceCriteria.map(x => x.criterionId)) ||
    !unique((authority.predecessors ?? []).map(x => x.windowId))) throw new Error('CONTEXT_DUPLICATE_ID');
  if (authority.task.constraints.some(x => x.contentHash !== digest(x.description))) throw new Error('CONTEXT_CANONICAL_CONSTRAINT_HASH');
  for (const agent of authority.agents) {
    if (!scopeWithin(agent.scope, { repoId: authority.task.repoId, allowedPaths: authority.task.allowedPaths, taskClasses: [authority.task.taskClass] }) ||
      !unique(agent.mandatoryResourceRefs) || !unique(agent.unknowns.map(x => x.id))) throw new Error('CONTEXT_AGENT_POLICY_INVALID');
  }
  return authority;
}
function scopeWithin(candidate: ContextScope, allowed: ContextScope): boolean {
  return candidate.repoId === allowed.repoId && candidate.allowedPaths.length > 0 && candidate.taskClasses.length > 0 &&
    unique(candidate.allowedPaths) && unique(candidate.taskClasses) && candidate.allowedPaths.every(x => isSafeRelativePath(x) && isWithinScope(x, allowed.allowedPaths)) &&
    candidate.taskClasses.every(x => allowed.taskClasses.includes(x));
}
function canLoad(pin: ContextResourcePin, policy: ContextAgentPolicy): boolean {
  return pin.branchId === policy.branchId && pin.lineageId === policy.lineageId && scopeWithin(pin.scope, policy.scope);
}
function counterIssues(authority: ContextAuthority, policy: ContextAgentPolicy, counter: ContextCounter): ContextIssue[] {
  const issues: ContextIssue[] = [], budget = policy.budget;
  if (budget.modelConfigVersion !== authority.model.modelConfigVersion || budget.modelConfigVersion !== authority.task.budget.modelConfigVersion ||
    budget.inputLimit > authority.task.budget.inputLimit || budget.inputLimit > authority.model.inputLimit ||
    budget.outputReserve > authority.model.maxOutputTokens || budget.outputReserve < authority.task.budget.outputReserve || budget.headroom < authority.task.budget.headroom ||
    budget.taskSpendLimit.currency !== authority.task.budget.taskSpendLimit.currency || budget.taskSpendLimit.amount > authority.task.budget.taskSpendLimit.amount)
    issues.push(issue('context.budgetPolicy', policy.agentId, 'Window budget/model exceeds authority limits or drops required reserves'));
  if (!budget.tokenAccountingPolicy.includeToolOutputs || budget.tokenAccountingPolicy.tokenizer !== counter.id ||
    (counter.unit === 'tokenizer-units' && counter.modelConfigVersion !== authority.model.modelConfigVersion) ||
    (counter.unit === 'utf8-byte-units' && (counter.id !== utf8ByteCounter.id || counter.count !== utf8ByteCounter.count)))
    issues.push(issue('context.counterPolicy', policy.agentId, 'Counter is not the configured local accounting method; all payload sections must be counted'));
  return issues;
}
function acceptanceBindings(task: TaskSpec): ContextPacket['acceptanceBindings'] {
  return task.acceptanceCriteria.map(x => ({ criterionId: x.criterionId, sourceRevision: task.baseRevision, contentHash: digest(x) }));
}
function makeManifest(packet: ContextPacket): ContextManifest {
  const manifest: ContextManifest = { schemaVersion: SCHEMA_VERSION, manifestId: `manifest:${packet.windowId}`, manifestDigest: digest(null), taskSpecDigest: digest(packet.task),
    role: packet.role, scope: structuredClone(packet.scope),
    constraintBindings: packet.task.constraints.map(({ description: _description, ...binding }) => structuredClone(binding)),
    evidenceBindings: packet.resources.map(x => ({ evidenceId: x.pin.ref, sourceRevision: x.pin.revision, contentHash: x.pin.contentHash })),
    contextPolicyVersion: packet.contextPolicyVersion, modelConfigVersion: packet.model.modelConfigVersion, budgetReportRef: packet.budgetReport.reportId };
  manifest.manifestDigest = digestOmitting(manifest, 'manifestDigest'); return manifest;
}
function refresh(packet: ContextPacket): void {
  packet.manifest = makeManifest(packet);
  packet.bundle.manifestRef = packet.manifest.manifestId; packet.bundle.manifestDigest = packet.manifest.manifestDigest;
  packet.bundle.evidenceItems = packet.resources.map(x => ({ evidenceId: x.pin.ref, contentHash: x.pin.contentHash, sourceRef: x.pin.sourceRefs[0]! }));
  packet.bundle.excludedItems = packet.loadPlan.filter(x => x.state === 'excluded' || x.state === 'blocked').map(x => ({ ref: x.ref, reason: x.reason! }));
}
/** Fixed point includes its own numeric report/bundle fields, metadata, tool output, trace and receipts. */
function account(packet: ContextPacket, counter: ContextCounter): boolean {
  for (let round = 0; round < 32; round++) {
    const serialized = canonicalJson(packet), units = counter.count(serialized), bytes = Buffer.byteLength(serialized, 'utf8');
    if (!Number.isSafeInteger(units) || units <= 0) throw new Error('CONTEXT_COUNTER_INVALID');
    const fits = units <= packet.budgetReport.inputCapacity;
    if (packet.budgetReport.packetUnits === units && packet.budgetReport.packetUtf8Bytes === bytes && packet.bundle.tokenCount === units && packet.budgetReport.fits === fits) return fits;
    packet.budgetReport.packetUnits = units; packet.budgetReport.packetUtf8Bytes = bytes; packet.budgetReport.fits = fits; packet.bundle.tokenCount = units;
  }
  throw new Error('CONTEXT_COUNTER_UNSTABLE');
}
function seal(packet: ContextPacket, issues: ContextIssue[]): ContextWindow {
  const base = { packet, packetDigest: digest(packet), status: issues.length ? 'blocked' as const : 'ready' as const, issues };
  return { ...base, windowDigest: digest(base) };
}
function assertWindowHashes(window: ContextWindow): void {
  assertJson(window); windowSchema.parse(window);
  if (digest(window.packet) !== window.packetDigest || digestOmitting(window, 'windowDigest') !== window.windowDigest) throw new Error('CONTEXT_PRIOR_TAMPERED');
}
/** Trusted broker calls this only for a window it issued/stored; this digest is not a signature or self-authorization. */
export function pinContextPredecessor(window: ContextWindow): ContextPredecessorPin {
  assertWindowHashes(window);
  const p = window.packet;
  return { windowId: p.windowId, agentId: p.agentId, taskId: p.task.taskId, windowDigest: window.windowDigest, generation: p.generation,
    originalHistoryDigest: p.history.originalHistoryDigest, role: p.role,
    scope: structuredClone(p.scope), branchId: p.branchId, lineageId: p.lineageId, unknowns: structuredClone(p.bundle.unknowns),
    requiredResourceRefs: p.loadPlan.filter(x => x.required).map(x => x.ref) };
}

function validLoadReceipts(p: ContextPacket): boolean {
  if (!unique(p.resources.map(x => x.pin.ref)) || !unique(p.loadPlan.map(x => x.ref)) || !unique(p.loadReceipts.map(x => x.ref)) ||
    !unique(p.loadReceipts.map(x => x.receiptId)) || p.loadReceipts.length !== p.resources.length) return false;
  for (const resource of p.resources) {
    const pin = resource.pin, entry = p.loadPlan.find(x => x.ref === pin.ref), receipt = p.loadReceipts.find(x => x.ref === pin.ref);
    if (!entry || entry.state !== 'loaded' || entry.kind !== pin.kind || entry.revision !== pin.revision || entry.expectedDigest !== pin.contentHash || entry.actualDigest !== pin.contentHash ||
      resourceDigest(resource.content) !== pin.contentHash || !receipt || entry.receiptRef !== receipt.receiptId || entry.receiptDigest !== digest(receipt) || receipt.windowId !== p.windowId ||
      receipt.agentId !== p.agentId || receipt.revision !== pin.revision || receipt.contentHash !== pin.contentHash || receipt.pinDigest !== digest(pin) || receipt.resourceDigest !== digest(resource)) return false;
  }
  return p.loadPlan.every(x => x.state === 'loaded' ? p.resources.some(r => r.pin.ref === x.ref) : x.actualDigest === null && x.receiptRef === null && x.receiptDigest === null);
}

/** Assembles a local payload; a load receipt proves included bytes, not that a provider read them. */
export async function buildContextWindow(authorityInput: ContextAuthority, requestInput: ContextRequest, loader: ContextLoader, counter: ContextCounter = utf8ByteCounter): Promise<ContextWindow> {
  const authority = authorityOf(authorityInput); assertJson(requestInput);
  const request = requestSchema.parse(requestInput), policy = authority.agents.find(x => x.agentId === request.agentId);
  if (!policy) throw new Error('CONTEXT_AGENT_UNKNOWN');
  if (!unique((request.resourceRefs ?? []).map(x => x.ref)) || !unique((request.unknowns ?? []).map(x => x.id))) throw new Error('CONTEXT_REQUEST_DUPLICATE');
  const issues = counterIssues(authority, policy, counter);
  const unknowns = structuredClone(policy.unknowns);
  for (const unknown of request.unknowns ?? []) {
    const prior = unknowns.find(x => x.id === unknown.id);
    if (prior && !same(prior, unknown)) issues.push(issue('context.unknownConflict', unknown.id, 'Candidate cannot rewrite a canonical unknown'));
    if (!prior) unknowns.push(structuredClone(unknown));
  }
  const requests = [...(request.resourceRefs ?? [])];
  for (const ref of policy.mandatoryResourceRefs) {
    const prior = requests.find(x => x.ref === ref);
    if (prior) prior.required = true; else requests.push({ ref, required: true });
  }
  const emptyManifest: ContextManifest = { schemaVersion: SCHEMA_VERSION, manifestId: 'initial', manifestDigest: digest(null), taskSpecDigest: digest(authority.task), role: policy.role,
    scope: policy.scope, constraintBindings: [], evidenceBindings: [], contextPolicyVersion: authority.contextPolicyVersion, modelConfigVersion: authority.model.modelConfigVersion, budgetReportRef: `budget:${request.windowId}` };
  const packet: ContextPacket = { schemaVersion: 'context-packet/1', windowId: request.windowId, agentId: policy.agentId, generation: 0, parentWindowDigest: null,
    task: structuredClone(authority.task), role: policy.role, scope: structuredClone(policy.scope), branchId: policy.branchId, lineageId: policy.lineageId,
    agentPolicyDigest: digest(policy), model: structuredClone(authority.model), contextPolicyVersion: authority.contextPolicyVersion,
    acceptanceBindings: acceptanceBindings(authority.task), manifest: emptyManifest,
    bundle: { schemaVersion: SCHEMA_VERSION, bundleId: `bundle:${request.windowId}`, taskId: authority.task.taskId, snapshotId: authority.snapshotId, memoryVersion: authority.memoryVersion,
      manifestRef: emptyManifest.manifestId, manifestDigest: emptyManifest.manifestDigest, evidenceItems: [], unknowns, excludedItems: [], tokenCount: 0 },
    resources: [], history: { content: request.history ?? '', trust: 'untrusted-data', originalHistoryDigest: resourceDigest(request.history ?? '') }, loadPlan: [], loadReceipts: [],
    budgetReport: { reportId: `budget:${request.windowId}`, counterId: counter.id, unit: counter.unit, assurance: 'local-policy-accounting-only', actualProviderTokens: null,
      packetUnits: 0, packetUtf8Bytes: 0, inputCapacity: policy.budget.inputLimit - policy.budget.outputReserve - policy.budget.headroom,
      inputLimit: policy.budget.inputLimit, outputReserve: policy.budget.outputReserve, headroom: policy.budget.headroom, modelMaxOutputTokens: authority.model.maxOutputTokens, fits: false } };
  for (const requested of requests) {
    const pin = authority.resources.find(x => x.ref === requested.ref);
    const entry: ContextLoadEntry = { ref: requested.ref, kind: pin?.kind ?? 'unknown', revision: pin?.revision ?? null, expectedDigest: pin?.contentHash ?? null,
      state: 'planned', actualDigest: null, receiptRef: null, receiptDigest: null, required: requested.required, reason: null };
    packet.loadPlan.push(entry);
    const reject = (code: string): void => { entry.state = requested.required ? 'blocked' : 'excluded'; entry.reason = code;
      if (requested.required) issues.push(issue(code, requested.ref, 'Required resource could not be included from current approved pins')); };
    if (!pin) { reject('context.resourceMissing'); continue; }
    if (!canLoad(pin, policy)) { reject('context.resourceScope'); continue; }
    if (pin.status !== 'active') { reject('context.resourceInactive'); continue; }
    if (!unique(pin.dependencies) || pin.dependencies.some(ref => !packet.resources.some(x => x.pin.ref === ref))) { reject('context.resourceDependency'); continue; }
    let content: string;
    try { content = await loader(structuredClone(pin)); } catch { reject('context.loadFailed'); continue; }
    if (typeof content !== 'string' || Buffer.byteLength(content, 'utf8') > 2 * 1024 * 1024 || resourceDigest(content) !== pin.contentHash) { reject('context.resourceDigest'); continue; }
    const resource = { pin: structuredClone(pin), content, instructionAuthority: 'none' as const };
    const receipt: ContextLoadReceipt = { receiptId: `load:${request.windowId}:${packet.loadReceipts.length}`, windowId: request.windowId, agentId: policy.agentId,
      ref: pin.ref, revision: pin.revision, contentHash: pin.contentHash, pinDigest: digest(pin), resourceDigest: digest(resource),
      kind: 'context-payload-inclusion', assurance: 'serialized-local-payload-not-provider-read' };
    packet.resources.push(resource); packet.loadReceipts.push(receipt);
    Object.assign(entry, { state: 'loaded', actualDigest: pin.contentHash, receiptRef: receipt.receiptId, receiptDigest: digest(receipt) });
  }
  for (const unknown of packet.bundle.unknowns) if (unknown.critical) issues.push(issue('context.criticalUnknown', unknown.id, 'Critical unknown retained and blocks handoff'));
  refresh(packet);
  let fits = account(packet, counter);
  // Only optional material can be removed. Mandatory task, criteria, unknowns and provenance remain.
  for (const entry of [...packet.loadPlan].reverse()) {
    if (fits) break;
    if (entry.required || entry.state !== 'loaded' || packet.resources.some(x => x.pin.dependencies.includes(entry.ref))) continue;
    packet.resources = packet.resources.filter(x => x.pin.ref !== entry.ref);
    packet.loadReceipts = packet.loadReceipts.filter(x => x.ref !== entry.ref);
    Object.assign(entry, { state: 'excluded', actualDigest: null, receiptRef: null, receiptDigest: null, reason: 'context.optionalBudget' });
    refresh(packet); fits = account(packet, counter);
  }
  if (!fits) issues.push(issue('context.budgetExceeded', request.windowId, 'Mandatory context/history/metadata exceeds configured input capacity; nothing mandatory was silently dropped'));
  return seal(packet, issues);
}

/** The only compressible channel is untrusted history. Canonical task/AC/constraints are hydrated again. */
export async function compactContextWindow(previous: ContextWindow, authority: ContextAuthority, proposal: { windowId: string; summary: string }, loader: ContextLoader,
  counter: ContextCounter = utf8ByteCounter): Promise<ContextWindow> {
  assertWindowHashes(previous); assertJson(proposal);
  z.strictObject({ windowId: text, summary: z.string() }).parse(proposal);
  const current = authorityOf(authority), pin = current.predecessors?.find(x => x.windowId === previous.packet.windowId);
  if (!pin || !same(pin, pinContextPredecessor(previous))) throw new Error('CONTEXT_PREDECESSOR_UNTRUSTED');
  const policy = current.agents.find(x => x.agentId === previous.packet.agentId);
  if (!policy || current.task.taskId !== pin.taskId || policy.role !== pin.role || !same(policy.scope, pin.scope) || policy.branchId !== pin.branchId || policy.lineageId !== pin.lineageId)
    throw new Error('CONTEXT_COMPACTION_NAMESPACE_CHANGE');
  if (proposal.windowId === previous.packet.windowId) throw new Error('CONTEXT_WINDOW_ID_REUSED');
  const next = await buildContextWindow(authority, { windowId: proposal.windowId, agentId: previous.packet.agentId,
    resourceRefs: previous.packet.loadPlan.map(x => ({ ref: x.ref, required: x.required })), history: proposal.summary, unknowns: previous.packet.bundle.unknowns }, loader, counter);
  next.packet.generation = previous.packet.generation + 1; next.packet.parentWindowDigest = previous.windowDigest;
  next.packet.history.originalHistoryDigest = previous.packet.history.originalHistoryDigest;
  if (!account(next.packet, counter) && !next.issues.some(x => x.code === 'context.budgetExceeded')) next.issues.push(issue('context.budgetExceeded', proposal.windowId, 'Compaction metadata and mandatory context exceed budget'));
  return seal(next.packet, next.issues);
}

/** Current resource pins are checked selectively; unrelated memory/snapshot versions do not invalidate a window. */
export function validateContextWindow(input: ContextWindow, authorityInput: ContextAuthority, counter: ContextCounter = utf8ByteCounter): ContextValidation {
  const issues: ContextIssue[] = [];
  const add = (ok: boolean, code: string, ref: string, message: string): void => { if (!ok) issues.push(issue(code, ref, message)); };
  let authority: ContextAuthority, window: ContextWindow;
  try { authority = authorityOf(authorityInput); assertJson(input); window = windowSchema.parse(input) as ContextWindow; }
  catch { return { status: 'blocked', issues: [issue('context.schema', '$', 'Malformed context/authority')] }; }
  const p = window.packet, policy = authority.agents.find(x => x.agentId === p.agentId);
  if (!policy) return { status: 'blocked', issues: [issue('context.agent', p.agentId, 'Agent policy no longer exists')] };
  issues.push(...counterIssues(authority, policy, counter));
  add(digest(p) === window.packetDigest && digestOmitting(window, 'windowDigest') === window.windowDigest, 'context.windowDigest', p.windowId, 'Context bytes changed');
  add(same(p.task, authority.task) && same(p.acceptanceBindings, acceptanceBindings(authority.task)), 'context.canonicalTask', p.task.taskId, 'Task/constraint/acceptance content or revisions differ from canonical source');
  add(p.agentPolicyDigest === digest(policy) && p.role === policy.role && same(p.scope, policy.scope) && p.branchId === policy.branchId && p.lineageId === policy.lineageId,
    'context.agentBinding', p.agentId, 'Window is bound to a different role/scope/branch/lineage/budget');
  add(same(p.model, authority.model) && p.contextPolicyVersion === authority.contextPolicyVersion, 'context.policy', p.windowId, 'Model/context policy changed');
  if (p.generation === 0) add(p.parentWindowDigest === null, 'context.predecessor', p.windowId, 'Initial context cannot claim a predecessor');
  else {
    const parent = authority.predecessors?.find(x => x.windowDigest === p.parentWindowDigest && x.agentId === p.agentId && x.taskId === p.task.taskId);
    add(!!parent && p.generation === parent.generation + 1 && p.history.originalHistoryDigest === parent.originalHistoryDigest &&
      parent.role === p.role && same(parent.scope, p.scope) && parent.branchId === p.branchId && parent.lineageId === p.lineageId &&
      parent.unknowns.every(x => p.bundle.unknowns.some(y => same(x, y))) && parent.requiredResourceRefs.every(ref => p.loadPlan.some(x => x.ref === ref && x.required)),
    'context.predecessor', p.windowId, 'Compaction predecessor is untrusted or its blockers/required resources/namespace were changed');
  }
  add(same(p.manifest, makeManifest(p)), 'context.manifest', p.manifest.manifestId, 'Manifest does not describe actual loaded context');
  add(p.bundle.taskId === p.task.taskId && p.bundle.bundleId === `bundle:${p.windowId}` && p.bundle.manifestRef === p.manifest.manifestId && p.bundle.manifestDigest === p.manifest.manifestDigest &&
    same(p.bundle.evidenceItems, p.resources.map(x => ({ evidenceId: x.pin.ref, contentHash: x.pin.contentHash, sourceRef: x.pin.sourceRefs[0]! }))) &&
    same(p.bundle.excludedItems, p.loadPlan.filter(x => x.state === 'excluded' || x.state === 'blocked').map(x => ({ ref: x.ref, reason: x.reason }))), 'context.bundle', p.bundle.bundleId, 'Bundle refs/evidence/exclusions differ from packet');
  add(unique(p.resources.map(x => x.pin.ref)) && unique(p.loadPlan.map(x => x.ref)) && unique(p.loadReceipts.map(x => x.receiptId)), 'context.duplicate', p.windowId, 'Repeated context resource/receipt');
  add(policy.unknowns.every(x => p.bundle.unknowns.some(y => same(x, y))) && unique(p.bundle.unknowns.map(x => x.id)), 'context.unknowns', p.windowId, 'Canonical unknown was dropped or rewritten');
  for (const unknown of p.bundle.unknowns) add(!unknown.critical, 'context.criticalUnknown', unknown.id, 'Critical unknown blocks handoff');
  add(policy.mandatoryResourceRefs.every(ref => p.resources.some(x => x.pin.ref === ref)), 'context.mandatoryResource', p.windowId, 'Mandatory resource is missing');
  for (const resource of p.resources) {
    const pin = authority.resources.find(x => x.ref === resource.pin.ref), entry = p.loadPlan.find(x => x.ref === resource.pin.ref), receipt = p.loadReceipts.find(x => x.ref === resource.pin.ref);
    add(!!pin && same(pin, resource.pin) && pin.status === 'active' && canLoad(pin, policy), 'context.resourceStale', resource.pin.ref, 'Loaded resource changed, was revoked or moved outside namespace');
    add(resourceDigest(resource.content) === resource.pin.contentHash, 'context.resourceBytes', resource.pin.ref, 'Loaded bytes differ from source pin');
    add(!!entry && entry.state === 'loaded' && entry.kind === resource.pin.kind && entry.revision === resource.pin.revision && entry.expectedDigest === resource.pin.contentHash && entry.actualDigest === resource.pin.contentHash &&
      !!receipt && entry.receiptRef === receipt.receiptId && entry.receiptDigest === digest(receipt) && receipt.windowId === p.windowId && receipt.agentId === p.agentId &&
      receipt.revision === resource.pin.revision && receipt.contentHash === resource.pin.contentHash && receipt.pinDigest === digest(resource.pin) && receipt.resourceDigest === digest(resource),
    'context.loadReceipt', resource.pin.ref, 'Actual-load trace lacks matching payload inclusion receipt');
    add(resource.pin.dependencies.every(ref => p.resources.some(x => x.pin.ref === ref)), 'context.resourceDependency', resource.pin.ref, 'Loaded resource dependency was removed');
  }
  add(p.loadReceipts.length === p.resources.length && p.loadPlan.every(x => x.state !== 'planned' &&
    (x.state === 'loaded' ? p.resources.some(r => r.pin.ref === x.ref) : x.actualDigest === null && x.receiptRef === null && x.receiptDigest === null && !!x.reason) &&
    (!x.required || x.state === 'loaded')), 'context.loadCompleteness', p.windowId, 'Unresolved plan, fabricated receipt, or required resource omitted');
  const expectedReport = p.budgetReport;
  add(expectedReport.reportId === `budget:${p.windowId}` && expectedReport.counterId === counter.id && expectedReport.unit === counter.unit &&
    expectedReport.inputLimit === policy.budget.inputLimit && expectedReport.outputReserve === policy.budget.outputReserve && expectedReport.headroom === policy.budget.headroom &&
    expectedReport.inputCapacity === policy.budget.inputLimit - policy.budget.outputReserve - policy.budget.headroom && expectedReport.modelMaxOutputTokens === authority.model.maxOutputTokens,
  'context.budgetReport', p.windowId, 'Budget report differs from configured accounting');
  try {
    const bytes = canonicalJson(p), count = counter.count(bytes);
    add(Number.isSafeInteger(count) && count > 0 && count === p.bundle.tokenCount && count === expectedReport.packetUnits && Buffer.byteLength(bytes, 'utf8') === expectedReport.packetUtf8Bytes,
      'context.accounting', p.windowId, 'Whole serialized payload accounting mismatch');
    add(count <= expectedReport.inputCapacity && expectedReport.fits, 'context.budgetExceeded', p.windowId, 'Context exceeds input capacity');
  } catch { issues.push(issue('context.accounting', p.windowId, 'Counter failed')); }
  add(window.status === 'ready' && window.issues.length === 0, 'context.blocked', p.windowId, 'Blocked context cannot become ready by rewriting the outer verdict');
  return { status: issues.length ? 'blocked' : 'ready', issues };
}

/** This checks only context freshness/scope; runtime must separately resolve the trusted stage GateReport. */
export function validateContextHandoff(handoffInput: HandoffPacket, window: ContextWindow, authority: ContextAuthority, counter: ContextCounter = utf8ByteCounter): ContextValidation {
  const result = validateContextWindow(window, authority, counter), parsed = schemas.HandoffPacket.safeParse(handoffInput);
  if (!parsed.success) return { status: 'blocked', issues: [...result.issues, issue('context.handoffSchema', '$', 'Malformed handoff')] };
  const handoff = parsed.data, p = window.packet;
  if (handoff.contextManifestRef !== p.manifest.manifestId || handoff.contextManifestDigest !== p.manifest.manifestDigest || !scopeWithin(handoff.allowedScope, p.scope))
    result.issues.push(issue('context.handoffBinding', handoff.handoffId, 'Handoff manifest/scope differs from current context'));
  const versions = [{ ref: p.task.taskId, version: p.task.baseRevision, digest: digest(p.task) },
    ...p.resources.map(x => ({ ref: x.pin.ref, version: x.pin.revision, digest: x.pin.contentHash }))];
  if (!unique(handoff.sourceVersions.map(x => x.ref)) || !versions.every(x => handoff.sourceVersions.some(y => same(x, y))))
    result.issues.push(issue('context.handoffSources', handoff.handoffId, 'Handoff omits exact task/resource revisions'));
  if (!p.task.acceptanceCriteria.every(x => x.checkRefs.every(ref => handoff.downstreamAcceptance.includes(ref))))
    result.issues.push(issue('context.handoffAcceptance', handoff.handoffId, 'Handoff drops mandatory acceptance checks'));
  return { status: result.issues.length ? 'blocked' : 'ready', issues: result.issues };
}

export function exportContextTrace(window: ContextWindow): ContextTrace {
  assertJson(window); windowSchema.parse(window);
  if (digest(window.packet) !== window.packetDigest || digestOmitting(window, 'windowDigest') !== window.windowDigest) throw new Error('CONTEXT_TRACE_TAMPERED');
  if (!validLoadReceipts(window.packet)) throw new Error('CONTEXT_TRACE_RECEIPT_INVALID');
  const p = window.packet, base = { traceId: `trace:${p.windowId}`, windowId: p.windowId, agentId: p.agentId, taskId: p.task.taskId,
    role: p.role, scope: structuredClone(p.scope), branchId: p.branchId, lineageId: p.lineageId, packetDigest: window.packetDigest, entries: structuredClone(p.loadPlan) };
  return { ...base, digest: digest(base) };
}

export const serializeContextPacket = (window: ContextWindow): string => canonicalJson(window.packet);
