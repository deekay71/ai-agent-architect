import { randomUUID } from 'node:crypto';
import { existsSync, lstatSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { z } from 'zod';
import { digest } from '../contracts/canonical.js';
import { parseContract, type TaskSpec } from '../contracts/schemas.js';
import { ReadyChecklistSchema } from '../contracts/brain-planning.js';
import { isWithinScope } from '../foundation/permissions.js';
import { MemoryStore, sourceContentDigest, type ClaimAssurance, type MemoryNamespace, type MemoryNode } from '../memory/index.js';
import { RuntimeStore } from '../runtime/store.js';
import { buildContextWindow, type ContextResourcePin, type ContextAuthority, type ContextWindow } from '../context/engine.js';
import { createSkillContextSource } from '../context/skills.js';
import { RELEASE_VERSION } from './templates.js';
import { checkSkills, detectProject, loadProjectConfig, projectRoot, projectPath, readProjectFile, type ProjectConfig } from './project.js';

export interface PortableTask {
  task: TaskSpec; planRef: string; planDigest: string; sourceRefs: string[];
  readiness: 'not_ready' | 'recorded_ready'; executionOutcome: 'not_started'; executionAuthorized: false;
  readyChecklist: unknown | null;
  /** Immutable RuntimeStore artifact holding the exact plan bytes; records from earlier builds lack it and cannot hand off. */
  planArtifactRef: string; planVersion: number; supersedesPlanRef: string | null;
}
/** Source lineage captured when the plan was recorded; rechecked against current Memory on every resume. */
export interface PlanDependency { nodeId: string; contentDigest: string; kind: string; label: string; revision: string; sourceRef: string | null; sourceRefs: string[] }
const text = z.string().min(1);
const sha = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const dependencySchema = z.strictObject({ nodeId: text, contentDigest: sha });
const lineageSchema = z.strictObject({ nodeId: text, contentDigest: sha, kind: text, label: text, revision: text, sourceRef: text.nullable(), sourceRefs: z.array(text) });
const planArtifactSchema = z.strictObject({ schemaVersion: z.literal('architect-plan-artifact/1'), projectId: text, taskId: text, planRef: text,
  planVersion: z.number().int().positive().safe(), supersedesPlanRef: text.nullable(), task: z.unknown(), content: z.string(), contentDigest: sha,
  planDigest: sha, recordDigest: sha, readyChecklist: ReadyChecklistSchema.nullable(), dependsOn: z.array(dependencySchema).min(1),
  lineage: z.array(lineageSchema).min(1), executionAuthorized: z.literal(false) });
type PlanArtifact = z.infer<typeof planArtifactSchema>;
const handoffPinSchema = z.strictObject({ taskId: text, planRef: text, planVersion: z.number().int().positive().safe(), planArtifactRef: sha });
export type HandoffPin = z.infer<typeof handoffPinSchema>;
const handoffSchema = z.strictObject({ schemaVersion: z.literal('architect-session/2'), projectId: text, taskIds: z.array(text).min(1), planRefs: z.array(text).min(1),
  tasks: z.array(handoffPinSchema).min(1), nextStep: text, dependencyRef: text, executionAuthorized: z.literal(false), digest: sha });
export type SessionHandoff = z.infer<typeof handoffSchema>;
/** Exact persisted plan recovered from canonical stores. It is planning data only; it never authorizes execution. */
export interface HydratedPlan {
  taskId: string; planRef: string; planVersion: number; planArtifactRef: string; supersedesPlanRef: string | null;
  content: string; contentDigest: string; planDigest: string; task: TaskSpec; budget: TaskSpec['budget'];
  readiness: PortableTask['readiness']; readyChecklist: unknown | null; dependsOn: PlanDependency[];
  /** A recorded Ready checklist is written by the host agent; the Brain never authenticates who reviewed it. */
  readinessAttestation: 'self-recorded' | null;
  executionOutcome: 'not_started'; executionAuthorized: false;
}
/** A claim carries its recorded promotion trail so a reader can tell local role labels from independent review. */
export type KnowledgeNode = MemoryNode & { assurance?: ClaimAssurance | null };
/** Every Brain output is data from earlier sessions; none of it is an instruction or an owner approval. */
interface TrustFrame { trust: 'untrusted-data'; instructionAuthority: 'none' }
const trustFrame: TrustFrame = { trust: 'untrusted-data', instructionAuthority: 'none' };
/** The previous session's free-text next step, framed as a note; it is never an approval. */
export interface HandoffNote { text: string; writtenBy: 'previous-session'; instructionAuthority: 'none'; ownerApproval: false }
export interface KnowledgeView extends TrustFrame {
  /** Total usable nodes when listing; null for a text query (only matches up to the limit are counted). */
  total: number | null;
  /** Listing: more usable nodes exist than returned. Text query: the result limit was reached. */
  truncated: boolean; nodes: KnowledgeNode[];
}
export interface ResumeResult extends TrustFrame {
  projectId: string; state: 'empty' | 'blocked' | 'resumable'; staleSources: string[]; issues: string[];
  /** Non-blocking findings: skill drift/outdated templates, and tasks the latest handoff dropped from the previous one. */
  warnings: string[];
  handoff: SessionHandoff | null; handoffNote: HandoffNote | null;
  /** Verified task records of the handoff; empty whenever an issue blocks hydration. */
  tasks: PortableTask[]; tasksOutsideHandoff: string[]; plans: HydratedPlan[];
  knowledge: KnowledgeNode[]; knowledgeTotal: number | null; knowledgeTruncated: boolean; executionAuthorized: false;
}
/** Compact resume for the start of a session: plan text and a knowledge index without source contents. */
export interface ResumeSummary extends TrustFrame {
  projectId: string; state: ResumeResult['state']; staleSources: string[]; issues: string[]; warnings: string[];
  handoffNote: HandoffNote | null; taskIds: string[]; tasksOutsideHandoff: string[];
  plans: { taskId: string; taskClass: string; goal: string; allowedPaths: string[]; planRef: string; planVersion: number;
    readiness: PortableTask['readiness']; readinessAttestation: HydratedPlan['readinessAttestation']; dependsOn: string[]; content: string }[];
  knowledge: { total: number | null; truncated: boolean; nodes: { id: string; kind: string; label: string; sourceRef: string | null; assertionType: string | null; lifecycle: string; contentBytes: number;
    assurance?: { roleModel: ClaimAssurance['roleModel']; reviewedBy: string | null; approvedBy: string | null; attestationRefs: string[] } }[] };
  detail: string; executionAuthorized: false;
}
/** Where a command came from; recorded in the operation journal. Labels only, never authority. */
export interface BrainHost { entrypoint: string }
const blockedLifecycles = ['revoked','quarantined','superseded','deleted'];
/** Lifecycles that already make a source unusable; a later file change cannot matter for them, so reconcile skips them. */
const withdrawnLifecycles = ['revoked','quarantined','deleted'];
const KNOWLEDGE_LIMIT = 100;
const JOURNAL = 'brain-ops';
const usableNode = (node: MemoryNode): boolean => node.current && node.status.validity === 'valid' && node.status.freshness === 'fresh' &&
  (node.kind !== 'claim' || node.status.lifecycle === 'approved') && !blockedLifecycles.includes(node.status.lifecycle);
const handoffBody = (h: Pick<SessionHandoff,'projectId'|'taskIds'|'planRefs'|'tasks'|'nextStep'>) => ({ schemaVersion: 'architect-session/2' as const,
  projectId: h.projectId, taskIds: h.taskIds, planRefs: h.planRefs, tasks: h.tasks, nextStep: h.nextStep, executionAuthorized: false as const });
/** Missing, replaced, unsafe or oversized files are drift. Any other read error (EACCES, EIO, EMFILE…) is transient. */
const isDrift = (error: unknown): boolean => error instanceof Error &&
  (['ENOENT','ENOTDIR','ELOOP'].includes((error as NodeJS.ErrnoException).code ?? '') || ['PORTABLE_UNSAFE_PATH','PORTABLE_SOURCE_LIMIT'].includes(error.message));

/** Local context/planning data service. This is not a protected authority registry or a Unity executor. */
export class ProjectBrain {
  readonly root: string; readonly config: ProjectConfig; readonly namespace: MemoryNamespace;
  readonly memory: MemoryStore; readonly state: RuntimeStore; readonly host: BrainHost;
  constructor(input: string, options: { host?: BrainHost } = {}) {
    this.root = projectRoot(input); this.config = loadProjectConfig(this.root); this.host = options.host ?? { entrypoint:'library' };
    this.namespace = { repoId: this.config.projectId, branchId: this.config.branchId, lineageId: this.config.lineageId,
      allowedPaths: this.config.allowedPaths, taskClasses: this.config.taskClasses };
    this.memory = new MemoryStore(projectPath(this.root,'.architect/data/memory',true), { namespaces: [this.namespace],
      principals: [{ id:'host:ingest',role:'memoryPromoter' },{ id:'agent:planner',role:'planner' },
        { id:'host:verifier',role:'verificationRunner' },{ id:'host:critic',role:'critic' },{ id:'host:promoter',role:'memoryPromoter' }]
        .map(x => ({ ...x, role: x.role as 'memoryPromoter'|'planner'|'verificationRunner'|'critic', projectIds:[this.config.projectId] })) });
    try { this.state = new RuntimeStore(projectPath(this.root,'.architect/data/session',true)); }
    catch (error) { this.memory.close(); throw error; }
  }
  close(): void { this.memory.close(); this.state.close(); }
  /**
   * Best-effort operation journal for state writes: when, which process, platform and entrypoint, what changed. It helps the
   * next session tell which host touched the store; any local writer can append to it, so it guards against mistakes, not forgery.
   */
  private journal(op: string, detail: Record<string,unknown>): void {
    try { this.state.event(JOURNAL,{ op,at:new Date().toISOString(),pid:process.pid,node:process.version,platform:process.platform,host:this.host,...detail,executionAuthorized:false }); }
    catch { /* The canonical write already committed; a missing journal line must not report it as failed. */ }
  }
  log(limit = 50): { seq: number; body: unknown }[] {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1000) throw Error('PORTABLE_LOG_LIMIT');
    return this.state.events(JOURNAL).slice(-limit);
  }
  /** Source bytes are pinned data. This method does not promote a claim or grant decision authority. */
  ingestFile(relativePath: string, sourceId: string, sourceType: 'document'|'evidence'|'decision' = 'document'): MemoryNode {
    if (!isWithinScope(relativePath,this.config.allowedPaths)) throw Error('PORTABLE_SOURCE_SCOPE');
    const content = readProjectFile(this.root,relativePath), hash = sourceContentDigest(content);
    this.reconcileSources();
    const previous = this.memory.getSource(sourceId,hash,this.namespace);
    if (previous && (previous.record.sourceRef !== relativePath || previous.record.sourceType !== sourceType)) throw Error('PORTABLE_SOURCE_ID_CONFLICT');
    if (previous) {
      const old=this.memory.getNode(previous.nodeId,this.namespace);
      if (!old || !old.current || old.status.validity !== 'valid' || old.status.freshness !== 'fresh' || ['revoked','quarantined','superseded','deleted'].includes(old.status.lifecycle)) throw Error('PORTABLE_SOURCE_REVISION_NOT_CURRENT');
    }
    const node = this.memory.ingest({ namespace:{ ...this.namespace, allowedPaths:[relativePath] },purpose:'knowledge',
      provenance:{ kind:'primary',originId:`project-file:${relativePath}` },content,
      record:previous?.record ?? { schemaVersion:'0.5.0',sourceId,sourceType,sourceRef:relativePath,sourceRevision:hash,contentDigest:hash,
        observedAt:new Date().toISOString(),freshnessPolicy:'pinned',freshness:'fresh' } },'host:ingest');
    // The single Memory transaction above is the canonical file binding (sourceRef + project-file origin).
    // No secondary index write follows, so there is no partial-commit window for reconciliation to miss.
    if (!previous) this.journal('ingest',{ sourceId,sourceType,path:relativePath,nodeId:node.id,revision:hash });
    return node;
  }
  /**
   * Explicitly withdraws a file source — deleted, renamed, replaced by a new source id, or intact but no longer relevant. All
   * revisions become `deleted` with history retained and dependants are invalidated and must be replanned; this cannot be
   * undone. Ingesting new bytes under the same id later starts a new active revision; earlier revisions stay `deleted`.
   */
  retireSource(sourceId: string, reason: string): MemoryNode & { retirement: ReturnType<MemoryStore['sourceTransitions']>[number] | null } {
    if (!reason.trim()) throw Error('PORTABLE_RETIRE_REASON');
    const node = this.fileBoundSources().find(n => n.label === sourceId);
    if (!node) throw Error('PORTABLE_SOURCE_MISSING');
    this.memory.transitionSource({ sourceId,namespace:this.namespace,to:'deleted',reason:reason.trim() },'host:ingest');
    this.journal('retire',{ sourceId,path:node.sourceRef ?? null,nodeId:node.id,reason:reason.trim() });
    const retirement = this.memory.sourceTransitions(sourceId,this.namespace).filter(x => x.to === 'deleted').at(-1) ?? null;
    return { ...this.memory.getNode(node.id,this.namespace)!,retirement };
  }
  /**
   * File-bound sources are discovered from canonical Memory records, never from a disposable index:
   * a current, primary source whose only origin is `project-file:<sourceRef>`. Other provenance
   * (Unity evidence, brokers, abstract refs) is not treated as a filesystem source. Withdrawn sources are already unusable.
   */
  private fileBoundSources(): MemoryNode[] {
    return this.memory.exportSnapshot(this.namespace).nodes.filter(n => n.kind === 'source' && n.current && n.sourceRef !== undefined &&
      !withdrawnLifecycles.includes(n.status.lifecycle) &&
      !n.provenance.derived && n.provenance.originIds.length === 1 && n.provenance.originIds[0] === `project-file:${n.sourceRef}`);
  }
  private nodeMap(): Map<string,MemoryNode> {
    return new Map(this.memory.exportSnapshot(this.namespace).nodes.map(n => [n.id,n] as const));
  }
  /**
   * Reopening/resuming rechecks every canonical file binding; drift is invalidated, never silently re-approved.
   * A transient read error is reported as unreadable and leaves the source untouched.
   */
  private reconcile(): { stale: string[]; unreadable: string[] } {
    const stale = new Set<string>(), unreadable = new Set<string>();
    for (const node of this.fileBoundSources()) {
      let current: string|null = null;
      try { current = sourceContentDigest(readProjectFile(this.root,node.sourceRef!)); }
      catch (error) { if (!isDrift(error)) { unreadable.add(node.label); continue; } }
      if (current === node.contentDigest) continue;
      if (node.status.freshness !== 'stale') {
        this.memory.transitionSource({ sourceId:node.label,sourceRevision:node.revision,namespace:this.namespace,to:'stale',reason:'project-file-drift' },'host:ingest');
        this.journal('source-drift',{ sourceId:node.label,path:node.sourceRef ?? null,nodeId:node.id,fileMissing:current === null });
      }
      stale.add(node.label);
    }
    return { stale:[...stale].sort(),unreadable:[...unreadable].sort() };
  }
  /**
   * Reconcile for commands that consume or extend state (ingest, knowledge, context, plan, handoff). Bytes that cannot be
   * read cannot be verified, so these commands refuse instead of serving the last pinned bytes; the source is not invalidated.
   */
  reconcileSources(): string[] {
    const { stale,unreadable } = this.reconcile();
    if (unreadable.length) throw Error(`PORTABLE_SOURCE_UNREADABLE: ${unreadable.join(',')} cannot be read; fix the read error and retry, or retire the source`);
    return stale;
  }
  knowledge(text?: string): MemoryNode[] {
    this.reconcileSources();
    return this.memory.query({ namespace:this.namespace,...(text === undefined ? {} : { text }),limit:KNOWLEDGE_LIMIT });
  }
  private labelled(nodes: MemoryNode[]): KnowledgeNode[] {
    return nodes.map(n => n.kind === 'claim' ? { ...n,assurance:this.memory.claimAssurance(n.id,this.namespace) ?? null } : n);
  }
  /** Knowledge with its promotion trail and an explicit truncation flag. */
  knowledgeView(text?: string): KnowledgeView {
    const nodes = this.knowledge(text);
    const total = text === undefined ? this.memory.exportSnapshot(this.namespace).nodes.filter(usableNode).length : null;
    return { ...trustFrame,total,truncated:total === null ? nodes.length >= KNOWLEDGE_LIMIT : total > nodes.length,nodes:this.labelled(nodes) };
  }
  private validateTask(input: TaskSpec): TaskSpec {
    const task = parseContract('TaskSpec',input);
    if (task.repoId !== this.config.projectId || !this.config.taskClasses.includes(task.taskClass as ProjectConfig['taskClasses'][number]) ||
      !task.allowedPaths.every(x => isWithinScope(x,this.config.allowedPaths))) throw Error('PORTABLE_TASK_PROJECT_SCOPE');
    if (task.budget.tokenAccountingPolicy.tokenizer !== 'utf8-bytes/1') throw Error('PORTABLE_LOCAL_COUNTER_REQUIRED');
    return task;
  }
  private dependencies(refs: string[], task?:TaskSpec): { nodeId:string;contentDigest:string }[] {
    if (!refs.length || new Set(refs).size !== refs.length) throw Error('PORTABLE_DEPENDENCY_REFS');
    return refs.map(ref => {
      const node = this.memory.getNode(ref,this.namespace);
      if (!node || !node.current || node.status.validity !== 'valid' || node.status.freshness !== 'fresh' ||
        (node.kind === 'claim' && node.status.lifecycle !== 'approved') || ['revoked','quarantined','superseded','deleted'].includes(node.status.lifecycle)) throw Error(`PORTABLE_DEPENDENCY_UNUSABLE: ${ref}`);
      if (task && (!node.scope.taskClasses.includes(task.taskClass) || !node.scope.allowedPaths.every(p => isWithinScope(p,task.allowedPaths)))) throw Error('PORTABLE_DEPENDENCY_TASK_SCOPE');
      return { nodeId:ref,contentDigest:node.contentDigest };
    });
  }
  async context(input: TaskSpec, requiredRefs: string[]): Promise<ContextWindow> {
    const task = this.validateTask(input); this.reconcileSources();
    const scope = { repoId:task.repoId,allowedPaths:task.allowedPaths,taskClasses:[task.taskClass] };
    const usable = this.knowledge();
    // Display/query limits must not silently drop a required current source from a later task.
    for (const ref of requiredRefs) if (!usable.some(n => n.id === ref)) {
      const n=this.memory.getNode(ref,this.namespace);
      if (n && n.current && n.status.validity === 'valid' && n.status.freshness === 'fresh' &&
        (n.kind === 'source' || (n.kind === 'claim' && n.status.lifecycle === 'approved')) &&
        !['revoked','quarantined','superseded','deleted'].includes(n.status.lifecycle)) usable.push(n);
    }
    const pins: ContextResourcePin[] = usable.filter(n => ['source','claim'].includes(n.kind) && n.scope.taskClasses.includes(task.taskClass)).map(n => ({ ref:n.id,
      revision:n.revision,contentHash:n.contentDigest,kind:'evidence',scope:{ ...n.scope,taskClasses:[task.taskClass] },
      branchId:n.branchId,lineageId:n.lineageId,status:'active',trust:'untrusted-data',sourceRefs:n.provenance.sourceRefs.length ? n.provenance.sourceRefs : [n.id],dependencies:[] }));
    const profile = detectProject(this.root,this.config.projectId);
    const guidance = await Promise.all(['architect-brain','architect-unity-execution'].map(skillId => createSkillContextSource({
      catalog:{ rootDir:this.root,manifestPath:'.architect/skills/catalog.json',expectedManifestDigest:this.config.skillManifestDigest },
      skillId,version:RELEASE_VERSION,scope,branchId:this.namespace.branchId,lineageId:this.namespace.lineageId,
      currentContext:() => ({ taskClass:task.taskClass,projectProfile:profile,environmentDigest:digest({ node:process.version,platform:process.platform }),
        capabilities:[{ capability:'repository.read',implementationRef:'portable-project-files/1',implementationDigest:digest('portable-project-files/1'),targetProjectId:task.repoId,availability:'available' }] }) })));
    // The catalog check above only proves the body matches the project's own pins; the anchor is the released bodies.
    const drift = checkSkills(this.root).skills.filter(s => s.state === 'drift').map(s => s.skillId);
    if (drift.length) throw Error(`PORTABLE_SKILL_DRIFT: ${drift.join(',')} differs from every reviewed release`);
    const guidanceRefs = guidance.flatMap(g => [g.descriptorRef,...g.bodyRefs]);
    const authority: ContextAuthority = { task,contextPolicyVersion:'project-local-context/1',snapshotId:digest(profile),memoryVersion:this.memory.memoryVersion,
      model:{ modelConfigVersion:task.budget.modelConfigVersion,inputLimit:task.budget.inputLimit,maxOutputTokens:task.budget.outputReserve },
      agents:[{ agentId:'agent:planner',role:'planner',scope,branchId:this.namespace.branchId,lineageId:this.namespace.lineageId,budget:task.budget,
        mandatoryResourceRefs:guidanceRefs,unknowns:[{ id:'native-unity-acceptance',description:'Unity import/Play and native milestone acceptance are not established by local context.',critical:false }] }],
      resources:[...pins,...guidance.flatMap(g => g.pins)] };
    return buildContextWindow(authority,{ windowId:`window:${randomUUID()}`,agentId:'agent:planner',resourceRefs:requiredRefs.map(ref => ({ ref,required:true })) },
      async pin => { const n = usable.find(x => x.id === pin.ref); if (n) return n.content;
        const g = guidance.find(x => x.pins.some(p => p.ref === pin.ref)); if (!g) throw Error('PORTABLE_CONTEXT_REF'); return g.loader(pin); });
  }
  recordPlan(input: TaskSpec, content: string, refs: string[], checklist?: unknown): PortableTask {
    const task = this.validateTask(input); this.reconcileSources();
    const parsed = checklist === undefined ? null : ReadyChecklistSchema.parse(checklist);
    const evidenceRefs = parsed ? Object.values(parsed.checks).flatMap(x => x.evidenceRefs) : [];
    const allRefs = [...new Set([...refs,...evidenceRefs])], dependsOn = this.dependencies(allRefs,task);
    const planDigest = digest({ task,content }), recordDigest = digest({ task,content,checklist:parsed,dependsOn });
    const planRef = `plan:${task.taskId}:${recordDigest.slice(7)}`;
    // The host cannot know the digest in advance: name the value its checklist must pin.
    if (parsed && parsed.plan.digest !== planDigest) throw Error(`PORTABLE_PLAN_CHECKLIST_PIN: checklist plan.digest must be ${planDigest}`);
    const nodes = this.nodeMap();
    const lineage: PlanDependency[] = dependsOn.map(({ nodeId,contentDigest }) => { const n = nodes.get(nodeId)!;
      return { nodeId,contentDigest,kind:n.kind,label:n.label,revision:n.revision,sourceRef:n.sourceRef ?? null,sourceRefs:[...n.provenance.sourceRefs] }; });
    // An orphan plan node from a failed later commit is harmless: no task record or handoff references it, and retry is idempotent.
    this.memory.registerDependency({ id:planRef,kind:'plan',label:task.goal,contentDigest:recordDigest,namespace:this.namespace,dependsOn,provenanceRef:'project-local-plan-data' },'agent:planner');
    let created = false;
    const result = this.state.transaction(() => {
      const previous = this.state.read<PortableTask>('task',task.taskId);
      if (previous && previous.planRef === planRef && typeof previous.planArtifactRef === 'string') {
        // Identical retry: the mutable row is never returned as-is. It must pass the same immutable-artifact/subject checks as
        // resume, and the result is rebuilt from the verified artifact. Any mismatch fails closed without writing.
        const verified = this.hydratePlan({ taskId:task.taskId,planRef,planVersion:previous.planVersion,planArtifactRef:previous.planArtifactRef },this.nodeMap());
        if (typeof verified === 'string') throw Error('PORTABLE_PLAN_RECORD_UNVERIFIED');
        return { task:verified.task,planRef,planDigest:verified.planDigest,sourceRefs:verified.dependsOn.map(x => x.nodeId),readiness:verified.readiness,
          executionOutcome:'not_started',executionAuthorized:false,readyChecklist:verified.readyChecklist,planArtifactRef:verified.planArtifactRef,
          planVersion:verified.planVersion,supersedesPlanRef:verified.supersedesPlanRef } satisfies PortableTask;
      }
      const planVersion = previous ? (typeof previous.planVersion === 'number' ? previous.planVersion : 1) + 1 : 1;
      const artifact: PlanArtifact = { schemaVersion:'architect-plan-artifact/1',projectId:this.config.projectId,taskId:task.taskId,planRef,planVersion,
        supersedesPlanRef:previous?.planRef ?? null,task,content,contentDigest:sourceContentDigest(content),planDigest,recordDigest,readyChecklist:parsed,
        dependsOn,lineage,executionAuthorized:false };
      const planArtifactRef = this.state.artifact(artifact);
      const record: PortableTask = { task,planRef,planDigest,sourceRefs:allRefs,readiness:parsed?.outcome === 'ready' ? 'recorded_ready' : 'not_ready',
        executionOutcome:'not_started',executionAuthorized:false,readyChecklist:parsed,planArtifactRef,planVersion,supersedesPlanRef:artifact.supersedesPlanRef };
      this.state.write('task',task.taskId,record); this.state.event(task.taskId,{ kind:'plan-recorded',artifact:planArtifactRef,planVersion,executionAuthorized:false });
      created = true;
      return record;
    });
    if (created) this.journal('plan',{ taskId:task.taskId,planRef,planVersion:result.planVersion,readiness:result.readiness,dependsOn:allRefs });
    return result;
  }
  /**
   * Hydrates one pinned plan from its immutable artifact and cross-checks the mutable task record, the Memory plan node
   * and every recorded dependency. Any missing, tampered, superseded or stale element returns an issue instead of content.
   */
  private hydratePlan(pin: HandoffPin, nodes: ReadonlyMap<string,MemoryNode>): HydratedPlan | string {
    let value: unknown;
    try { value = this.state.artifactValue(pin.planArtifactRef); } catch { return `plan-artifact-tampered:${pin.taskId}`; }
    if (value === undefined) return `plan-artifact-missing:${pin.taskId}`;
    const parsed = planArtifactSchema.safeParse(value);
    if (!parsed.success) return `plan-artifact-invalid:${pin.taskId}`;
    const a = parsed.data;
    const task = ((): TaskSpec | null => { try { return parseContract('TaskSpec',a.task); } catch { return null; } })();
    if (!task) return `plan-artifact-invalid:${pin.taskId}`;
    const readiness: PortableTask['readiness'] = a.readyChecklist?.outcome === 'ready' ? 'recorded_ready' : 'not_ready';
    if (a.projectId !== this.config.projectId || a.taskId !== pin.taskId || task.taskId !== pin.taskId || a.planRef !== pin.planRef || a.planVersion !== pin.planVersion ||
      digest(task) !== digest(a.task) || a.contentDigest !== sourceContentDigest(a.content) || a.planDigest !== digest({ task,content:a.content }) ||
      a.recordDigest !== digest({ task,content:a.content,checklist:a.readyChecklist,dependsOn:a.dependsOn }) || a.planRef !== `plan:${task.taskId}:${a.recordDigest.slice(7)}` ||
      digest(a.dependsOn) !== digest(a.lineage.map(x => ({ nodeId:x.nodeId,contentDigest:x.contentDigest })))) return `plan-artifact-inconsistent:${pin.taskId}`;
    const record = this.state.read<PortableTask>('task',pin.taskId);
    if (!record || record.planRef !== a.planRef || record.planArtifactRef !== pin.planArtifactRef || record.planVersion !== a.planVersion ||
      record.supersedesPlanRef !== a.supersedesPlanRef || record.planDigest !== a.planDigest || digest(record.task) !== digest(a.task) ||
      record.readiness !== readiness || digest(record.readyChecklist) !== digest(a.readyChecklist) || digest(record.sourceRefs) !== digest(a.dependsOn.map(x => x.nodeId)) ||
      record.executionAuthorized !== false || record.executionOutcome !== 'not_started') return `plan-superseded-or-record-mismatch:${pin.taskId}`;
    const planNode = nodes.get(a.planRef);
    if (!planNode || planNode.kind !== 'plan' || planNode.contentDigest !== a.recordDigest || !usableNode(planNode)) return `plan-dependency-invalid:${pin.taskId}`;
    for (const dependency of a.lineage) {
      const node = nodes.get(dependency.nodeId);
      if (!node || node.contentDigest !== dependency.contentDigest || !usableNode(node)) return `plan-source-lineage-unusable:${pin.taskId}`;
    }
    return { taskId:task.taskId,planRef:a.planRef,planVersion:a.planVersion,planArtifactRef:pin.planArtifactRef,supersedesPlanRef:a.supersedesPlanRef,
      content:a.content,contentDigest:a.contentDigest,planDigest:a.planDigest,task,budget:task.budget,readiness,readyChecklist:a.readyChecklist,
      dependsOn:a.lineage,readinessAttestation:a.readyChecklist ? 'self-recorded' : null,executionOutcome:'not_started',executionAuthorized:false };
  }
  /** Task IDs of the latest canonical handoff, or [] when there is none or it cannot be parsed. Read-only. */
  latestHandoffTaskIds(): string[] {
    const latest = this.state.read<{ ref:string }>('session','latest');
    if (!latest) return [];
    try { const parsed = handoffSchema.safeParse(this.state.artifactValue(latest.ref)); return parsed.success ? [...parsed.data.taskIds] : []; }
    catch { return []; }
  }
  handoff(taskIds: string[], nextStep: string): SessionHandoff { return this.handoffWithReport(taskIds,nextStep).packet; }
  /** Handoff plus the task IDs the previous handoff listed and this one leaves out (their records remain). */
  handoffWithReport(taskIds: string[], nextStep: string): { packet: SessionHandoff; droppedTaskIds: string[] } {
    this.reconcileSources();
    if (!taskIds.length || new Set(taskIds).size !== taskIds.length || !nextStep.trim()) throw Error('PORTABLE_HANDOFF_INPUT');
    const projection=projectPath(this.root,'.architect/SESSION_HANDOFF.json'), staging=projectPath(this.root,'.architect/SESSION_HANDOFF.json.tmp');
    if (existsSync(projection) && !lstatSync(projection).isFile()) throw Error('PORTABLE_HANDOFF_DESTINATION');
    if (existsSync(staging) && !lstatSync(staging).isFile()) throw Error('PORTABLE_HANDOFF_DESTINATION');
    const nodes = this.nodeMap();
    const tasks = taskIds.map(id => {
      const r = this.state.read<PortableTask>('task',id); if (!r) throw Error('PORTABLE_TASK_MISSING');
      if (typeof r.planArtifactRef !== 'string' || typeof r.planVersion !== 'number') throw Error('PORTABLE_PLAN_ARTIFACT_MISSING');
      const pin: HandoffPin = { taskId:id,planRef:r.planRef,planVersion:r.planVersion,planArtifactRef:r.planArtifactRef };
      // Never hand off a plan that the next session could not verify and hydrate.
      if (typeof this.hydratePlan(pin,nodes) === 'string') throw Error('PORTABLE_HANDOFF_PLAN_UNVERIFIED');
      return pin;
    });
    const dependsOn = this.dependencies(tasks.map(x => x.planRef));
    const body = handoffBody({ projectId:this.config.projectId,taskIds,planRefs:tasks.map(x => x.planRef),tasks,nextStep });
    const dependencyRef = `handoff:${digest(body).slice(7)}`;
    this.memory.registerDependency({ id:dependencyRef,kind:'handoff',label:'New-session handoff',contentDigest:digest(body),namespace:this.namespace,dependsOn,provenanceRef:'project-local-session-data' },'agent:planner');
    const packet: SessionHandoff = { ...body,dependencyRef,digest:digest({ ...body,dependencyRef }) };
    // Dropped tasks are recorded beside the pointer (not in the packet), so the packet schema and digest stay unchanged.
    const dropped = this.state.transaction(() => {
      const previous = this.latestHandoffTaskIds().filter(id => !taskIds.includes(id));
      const ref = this.state.artifact(packet); this.state.write('session','latest',{ ref,droppedTaskIds:previous });
      return previous;
    });
    this.journal('handoff',{ taskIds,dependencyRef,droppedTaskIds:dropped });
    // Disposable convenience projection, written only after the canonical commit; resume never reads it. Replaced atomically.
    if (existsSync(staging)) rmSync(staging);
    writeFileSync(staging,JSON.stringify(packet,null,2)+'\n',{ flag:'wx' }); renameSync(staging,projection);
    return { packet,droppedTaskIds:dropped };
  }
  /** Normal fresh-session continuation from canonical stores only; SESSION_HANDOFF.json and events are not consulted. */
  resume(): ResumeResult {
    const reconciled = this.reconcile(), staleSources = reconciled.stale, issues = reconciled.unreadable.map(id => `source-unreadable:${id}`);
    const latest = this.state.read<{ ref:string; droppedTaskIds?: unknown }>('session','latest');
    let packet: SessionHandoff | null = null;
    if (latest) {
      let value: unknown, tampered = false;
      try { value = this.state.artifactValue(latest.ref); } catch { tampered = true; }
      const parsed = handoffSchema.safeParse(value);
      if (tampered) issues.push('handoff-artifact-tampered');
      else if (value === undefined) issues.push('handoff-artifact-missing');
      else if (!parsed.success) issues.push((value as { schemaVersion?:unknown } | null)?.schemaVersion === 'architect-session/1' ? 'handoff-legacy-unpinned' : 'handoff-artifact-invalid');
      else {
        packet = parsed.data;
        if (packet.projectId !== this.config.projectId) throw Error('PORTABLE_HANDOFF_PROJECT');
        const body = handoffBody(packet);
        if (packet.dependencyRef !== `handoff:${digest(body).slice(7)}` || packet.digest !== digest({ ...body,dependencyRef:packet.dependencyRef }) ||
          digest(packet.taskIds) !== digest(packet.tasks.map(x => x.taskId)) || digest(packet.planRefs) !== digest(packet.tasks.map(x => x.planRef))) issues.push('handoff-artifact-inconsistent');
      }
    }
    const nodes = this.nodeMap();
    const tasks: PortableTask[] = [], plans: HydratedPlan[] = [];
    if (packet) {
      const node = nodes.get(packet.dependencyRef);
      if (!node || node.kind !== 'handoff' || node.status.validity !== 'valid') issues.push('handoff-dependency-invalid');
      for (const pin of packet.tasks) {
        const record = this.state.read<PortableTask>('task',pin.taskId);
        if (record) tasks.push(record); else issues.push(`task-record-missing:${pin.taskId}`);
        const plan = this.hydratePlan(pin,nodes);
        if (typeof plan === 'string') issues.push(plan); else plans.push(plan);
      }
    }
    // Informational: every recorded task the latest handoff does not list (finished, abandoned or never handed off).
    const handed = new Set(packet?.taskIds ?? []);
    const recorded = new Set(this.state.list<PortableTask>('task').map(r => r?.task?.taskId).filter((id): id is string => typeof id === 'string'));
    const tasksOutsideHandoff = [...recorded].filter(id => !handed.has(id)).sort();
    // Warning: tasks the previous handoff listed and the latest one left out. It clears at the next handoff.
    const dropped = Array.isArray(latest?.droppedTaskIds) ? latest.droppedTaskIds.filter((id): id is string => typeof id === 'string' && recorded.has(id) && !handed.has(id)) : [];
    const warnings = [...checkSkills(this.root).skills.filter(s => s.state !== 'current').map(s => `skill-${s.state}:${s.skillId}`),
      ...dropped.map(id => `task-dropped:${id}`)];
    // Knowledge built on bytes that cannot be read is not served.
    const view: Pick<KnowledgeView,'total'|'truncated'|'nodes'> = reconciled.unreadable.length ? { total:null,truncated:false,nodes:[] } : this.knowledgeView();
    return { projectId:this.config.projectId,...trustFrame,state:!latest ? 'empty' : staleSources.length || issues.length ? 'blocked' : 'resumable',
      staleSources,issues,warnings,handoff:packet,
      handoffNote:packet ? { text:packet.nextStep,writtenBy:'previous-session',instructionAuthority:'none',ownerApproval:false } : null,
      tasks:issues.length ? [] : tasks,tasksOutsideHandoff,plans:issues.length ? [] : plans,
      knowledge:view.nodes,knowledgeTotal:view.total,knowledgeTruncated:view.truncated,executionAuthorized:false };
  }
  /** The same checks as resume, returned as plan text plus a knowledge index without source contents. */
  resumeSummary(): ResumeSummary {
    const r = this.resume();
    return { projectId:r.projectId,...trustFrame,state:r.state,staleSources:r.staleSources,issues:r.issues,warnings:r.warnings,handoffNote:r.handoffNote,
      taskIds:r.handoff ? [...r.handoff.taskIds] : [],tasksOutsideHandoff:r.tasksOutsideHandoff,
      plans:r.plans.map(p => ({ taskId:p.taskId,taskClass:p.task.taskClass,goal:p.task.goal,allowedPaths:[...p.task.allowedPaths],planRef:p.planRef,planVersion:p.planVersion,
        readiness:p.readiness,readinessAttestation:p.readinessAttestation,dependsOn:p.dependsOn.map(d => d.label),content:p.content })),
      knowledge:{ total:r.knowledgeTotal,truncated:r.knowledgeTruncated,nodes:r.knowledge.map(n => ({ id:n.id,kind:n.kind,label:n.label,sourceRef:n.sourceRef ?? null,
        assertionType:n.provenance.assertionType ?? null,lifecycle:n.status.lifecycle,contentBytes:Buffer.byteLength(n.content,'utf8'),
        ...(n.assurance ? { assurance:{ roleModel:n.assurance.roleModel,reviewedBy:n.assurance.reviewedBy,approvedBy:n.assurance.approvedBy,
          attestationRefs:n.assurance.evidence.map(e => e.attestationRef) } } : {}) })) },
      detail:'Run resume without --summary for full task records, Ready checklists and knowledge content; knowledge [query] returns matching content.',
      executionAuthorized:false };
  }
}
