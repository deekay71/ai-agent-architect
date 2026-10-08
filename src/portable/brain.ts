import { randomUUID } from 'node:crypto';
import { existsSync, lstatSync, writeFileSync } from 'node:fs';
import { z } from 'zod';
import { digest } from '../contracts/canonical.js';
import { parseContract, type TaskSpec } from '../contracts/schemas.js';
import { ReadyChecklistSchema } from '../contracts/brain-planning.js';
import { isWithinScope } from '../foundation/permissions.js';
import { MemoryStore, sourceContentDigest, type MemoryNamespace, type MemoryNode } from '../memory/index.js';
import { RuntimeStore } from '../runtime/store.js';
import { buildContextWindow, type ContextResourcePin, type ContextAuthority, type ContextWindow } from '../context/engine.js';
import { createSkillContextSource } from '../context/skills.js';
import { RELEASE_VERSION } from './templates.js';
import { detectProject, loadProjectConfig, projectRoot, projectPath, readProjectFile, type ProjectConfig } from './project.js';

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
  executionOutcome: 'not_started'; executionAuthorized: false;
}
export interface ResumeResult {
  projectId: string; state: 'empty' | 'blocked' | 'resumable'; staleSources: string[]; issues: string[];
  handoff: SessionHandoff | null; tasks: PortableTask[]; plans: HydratedPlan[]; knowledge: MemoryNode[]; executionAuthorized: false;
}
const blockedLifecycles = ['revoked','quarantined','superseded','deleted'];
const usableNode = (node: MemoryNode): boolean => node.current && node.status.validity === 'valid' && node.status.freshness === 'fresh' &&
  (node.kind !== 'claim' || node.status.lifecycle === 'approved') && !blockedLifecycles.includes(node.status.lifecycle);
const handoffBody = (h: Pick<SessionHandoff,'projectId'|'taskIds'|'planRefs'|'tasks'|'nextStep'>) => ({ schemaVersion: 'architect-session/2' as const,
  projectId: h.projectId, taskIds: h.taskIds, planRefs: h.planRefs, tasks: h.tasks, nextStep: h.nextStep, executionAuthorized: false as const });

/** Local context/planning data service. This is not a protected authority registry or a Unity executor. */
export class ProjectBrain {
  readonly root: string; readonly config: ProjectConfig; readonly namespace: MemoryNamespace;
  readonly memory: MemoryStore; readonly state: RuntimeStore;
  constructor(input: string) {
    this.root = projectRoot(input); this.config = loadProjectConfig(this.root);
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
    return node;
  }
  /**
   * File-bound sources are discovered from canonical Memory records, never from a disposable index:
   * a current, primary source whose only origin is `project-file:<sourceRef>`. Other provenance
   * (Unity evidence, brokers, abstract refs) is not treated as a filesystem source.
   */
  private fileBoundSources(): MemoryNode[] {
    return this.memory.exportSnapshot(this.namespace).nodes.filter(n => n.kind === 'source' && n.current && n.sourceRef !== undefined &&
      !n.provenance.derived && n.provenance.originIds.length === 1 && n.provenance.originIds[0] === `project-file:${n.sourceRef}`);
  }
  private nodeMap(): Map<string,MemoryNode> {
    return new Map(this.memory.exportSnapshot(this.namespace).nodes.map(n => [n.id,n] as const));
  }
  /** Reopening/resuming rechecks every canonical file binding; drift is invalidated, never silently re-approved. */
  reconcileSources(): string[] {
    const stale = new Set<string>();
    for (const node of this.fileBoundSources()) {
      let current: string|null = null;
      try { current = sourceContentDigest(readProjectFile(this.root,node.sourceRef!)); } catch { /* Missing, unsafe, relinked or oversized means drift. */ }
      if (current === node.contentDigest) continue;
      if (node.status.freshness !== 'stale') this.memory.transitionSource({ sourceId:node.label,sourceRevision:node.revision,namespace:this.namespace,to:'stale',reason:'project-file-drift' },'host:ingest');
      stale.add(node.label);
    }
    return [...stale].sort();
  }
  knowledge(text?: string): MemoryNode[] {
    this.reconcileSources();
    return this.memory.query({ namespace:this.namespace,...(text === undefined ? {} : { text }),limit:100 });
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
        (node.kind === 'claim' && node.status.lifecycle !== 'approved') || ['revoked','quarantined','superseded','deleted'].includes(node.status.lifecycle)) throw Error('PORTABLE_DEPENDENCY_UNUSABLE');
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
    if (parsed && parsed.plan.digest !== planDigest) throw Error('PORTABLE_PLAN_CHECKLIST_PIN');
    const nodes = this.nodeMap();
    const lineage: PlanDependency[] = dependsOn.map(({ nodeId,contentDigest }) => { const n = nodes.get(nodeId)!;
      return { nodeId,contentDigest,kind:n.kind,label:n.label,revision:n.revision,sourceRef:n.sourceRef ?? null,sourceRefs:[...n.provenance.sourceRefs] }; });
    // An orphan plan node from a failed later commit is harmless: no task record or handoff references it, and retry is idempotent.
    this.memory.registerDependency({ id:planRef,kind:'plan',label:task.goal,contentDigest:recordDigest,namespace:this.namespace,dependsOn,provenanceRef:'project-local-plan-data' },'agent:planner');
    return this.state.transaction(() => {
      const previous = this.state.read<PortableTask>('task',task.taskId);
      if (previous && previous.planRef === planRef && typeof previous.planArtifactRef === 'string') {
        // Identical retry: the mutable row is never returned as-is. It must pass the same immutable-artifact/subject checks as
        // resume, and the result is rebuilt from the verified artifact. Any mismatch fails closed without writing.
        const verified = this.hydratePlan({ taskId:task.taskId,planRef,planVersion:previous.planVersion,planArtifactRef:previous.planArtifactRef },this.nodeMap());
        if (typeof verified === 'string') throw Error('PORTABLE_PLAN_RECORD_UNVERIFIED');
        return { task:verified.task,planRef,planDigest:verified.planDigest,sourceRefs:verified.dependsOn.map(x => x.nodeId),readiness:verified.readiness,
          executionOutcome:'not_started',executionAuthorized:false,readyChecklist:verified.readyChecklist,planArtifactRef:verified.planArtifactRef,
          planVersion:verified.planVersion,supersedesPlanRef:verified.supersedesPlanRef };
      }
      const planVersion = previous ? (typeof previous.planVersion === 'number' ? previous.planVersion : 1) + 1 : 1;
      const artifact: PlanArtifact = { schemaVersion:'architect-plan-artifact/1',projectId:this.config.projectId,taskId:task.taskId,planRef,planVersion,
        supersedesPlanRef:previous?.planRef ?? null,task,content,contentDigest:sourceContentDigest(content),planDigest,recordDigest,readyChecklist:parsed,
        dependsOn,lineage,executionAuthorized:false };
      const planArtifactRef = this.state.artifact(artifact);
      const record: PortableTask = { task,planRef,planDigest,sourceRefs:allRefs,readiness:parsed?.outcome === 'ready' ? 'recorded_ready' : 'not_ready',
        executionOutcome:'not_started',executionAuthorized:false,readyChecklist:parsed,planArtifactRef,planVersion,supersedesPlanRef:artifact.supersedesPlanRef };
      this.state.write('task',task.taskId,record); this.state.event(task.taskId,{ kind:'plan-recorded',artifact:planArtifactRef,planVersion,executionAuthorized:false });
      return record;
    });
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
      dependsOn:a.lineage,executionOutcome:'not_started',executionAuthorized:false };
  }
  handoff(taskIds: string[], nextStep: string): SessionHandoff {
    this.reconcileSources();
    if (!taskIds.length || new Set(taskIds).size !== taskIds.length || !nextStep.trim()) throw Error('PORTABLE_HANDOFF_INPUT');
    const projection=projectPath(this.root,'.architect/SESSION_HANDOFF.json');
    if (existsSync(projection) && !lstatSync(projection).isFile()) throw Error('PORTABLE_HANDOFF_DESTINATION');
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
    this.state.transaction(() => { const ref = this.state.artifact(packet); this.state.write('session','latest',{ ref }); });
    // Disposable convenience projection, written only after the canonical commit; resume never reads it.
    writeFileSync(projection,JSON.stringify(packet,null,2)+'\n');
    return packet;
  }
  /** Normal fresh-session continuation from canonical stores only; SESSION_HANDOFF.json and events are not consulted. */
  resume(): ResumeResult {
    const staleSources = this.reconcileSources(), issues: string[] = [];
    const latest = this.state.read<{ ref:string }>('session','latest');
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
    return { projectId:this.config.projectId,state:!latest ? 'empty' : staleSources.length || issues.length ? 'blocked' : 'resumable',
      staleSources,issues,handoff:packet,tasks,plans:issues.length ? [] : plans,knowledge:this.knowledge(),executionAuthorized:false };
  }
}
