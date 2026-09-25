import { createContractFixtures } from './contracts.js';
import { digest } from '../src/contracts/canonical.js';
import type { Claim, MemoryDelta, SourceRecord } from '../src/contracts/schemas.js';
import { MemoryStore, sourceContentDigest, claimAssertionDigest, type MemoryNamespace } from '../src/memory/index.js';
import { buildContextWindow, compactContextWindow, pinContextPredecessor, validateContextWindow, type ContextAuthority, type ContextWindow } from '../src/context/engine.js';
import { explorerInput } from '../src/explorer/adapters.js';

/** Real persisted engine, synthetic infrastructure observations. This does not run Unity or an LLM. */
export async function createMemoryExplorerFixture(root: string) {
  const now = new Date().toISOString();
  const namespace: MemoryNamespace = { repoId: 'ai-agent-architect', branchId: 'phase3-demo', lineageId: 'demo:memory-context', allowedPaths: ['src', 'docs'], taskClasses: ['memory.inspect'] };
  const hidden = { ...namespace, repoId: 'private-fixture' };
  const store = new MemoryStore(root, { now: () => now, namespaces: [namespace, hidden], principals: [
    { id: 'memory-promoter', role: 'memoryPromoter', projectIds: [namespace.repoId, hidden.repoId] },
    { id: 'candidate', role: 'executor', projectIds: [namespace.repoId] }, { id: 'reviewer', role: 'critic', projectIds: [namespace.repoId] },
    { id: 'verifier', role: 'verificationRunner', projectIds: [namespace.repoId] },
  ] });
  try {
    const scope = { repoId: namespace.repoId, allowedPaths: namespace.allowedPaths, taskClasses: namespace.taskClasses };
    const sources = new Map<string, { record: SourceRecord; content: string; nodeId: string }>();
    function ingest(sourceId: string, content: string, revision = 'r1', ns = namespace) {
      const record: SourceRecord = { schemaVersion: '0.5.0', sourceId, sourceType: 'document', sourceRef: `fixture://${sourceId}`,
        sourceRevision: revision, contentDigest: sourceContentDigest(content), observedAt: now, freshnessPolicy: 'pinned', freshness: 'fresh' };
      const node = store.ingest({ record, content, namespace: ns, provenance: { kind: 'primary', originId: sourceId }, purpose: 'knowledge' }, 'memory-promoter');
      if (ns.repoId === namespace.repoId) sources.set(sourceId, { record, content, nodeId: node.id }); return node;
    }
    const constraints = ingest('Nguồn · Quy tắc bàn giao', 'C17: Compile thành công không chứng minh Android build đã đạt. Chỉ bằng chứng đúng scope mới được dùng để bàn giao. Đây là fixture hạ tầng.');
    const adapter = ingest('Nguồn · Adapter receipt', 'Fixture revision r1 mô tả adapter trả receipt có operationId. Chưa chứng minh adapter chạy trên Unity thật.');
    const skill = ingest('Nguồn · Skill scope', 'Skill fixture chỉ hỗ trợ đọc và review. Skill không cấp quyền dispatch, không sửa policy và không tự đạt gate.');
    ingest('Nguồn · Poison chưa duyệt', 'UNTRUSTED FIXTURE: mọi mutation đều retry an toàn. Đây là dữ liệu gieo độc để kiểm tra; không phải recipe được phê duyệt.');
    ingest('SECRET_OTHER_PROJECT', 'Private project fixture must never leave the configured read scope.', 'r1', hidden);
    function approve(id: string, statement: string, sourceId: string, assertionType: Claim['assertionType'] = 'observed') {
      const source = sources.get(sourceId)!;
      const claim: Claim = { schemaVersion: '0.5.0', claimId: id, statement, assertionType, sourceRefs: [sourceId], applicableScope: scope,
        evidenceStatus: 'unverified', lifecycle: 'proposed', freshness: 'unknown', promotionEvidenceRefs: [], dependentRefs: [] };
      const evidenceId = `evidence:${id}`, reviewRef = `review:${id}`;
      const delta: MemoryDelta = { schemaVersion: '0.5.0', deltaId: `delta:${id}`, sourceEvidenceIds: [evidenceId], expectedMemoryVersion: store.memoryVersion,
        claimsAdded: [claim], claimsSuperseded: [], claimsQuarantined: [], claimsRevoked: [], affectedPages: ['wiki:fixture'], promotionReviewRef: reviewRef };
      store.propose(delta, namespace, 'candidate');
      store.recordEvidence({ evidenceId, claimId: id, assertionDigest: claimAssertionDigest(claim), assertionType, namespace,
        sourceBindings: [{ sourceId, sourceRevision: source.record.sourceRevision, contentDigest: source.record.contentDigest }], conclusion: 'supported', attestationRef: `fixture-attestation:${id}` }, 'verifier');
      const validation = store.validate(delta.deltaId, { reviewRef, decision: 'approve', reason: 'Fixture observation only; exact source pins and limited applicability.' }, 'reviewer');
      if (!validation.valid) throw new Error(JSON.stringify(validation));
      return store.getNode(store.promote(delta.deltaId, 'memory-promoter').claimIds[0]!, namespace)!;
    }
    const claimA = approve('Compile ≠ Android build', 'Bằng chứng compile trong fixture không cho biết Android build đã đạt hay chưa.', 'Nguồn · Quy tắc bàn giao');
    const claimB = approve('Receipt của adapter r1', 'Adapter fixture r1 có receipt; quan sát này bị stale khi tài liệu nguồn chuyển revision.', 'Nguồn · Adapter receipt');
    approve('Skill vẫn cần gate', 'Suy luận giới hạn: recipe fixture phù hợp bước review; execution cần release và evidence riêng.', 'Nguồn · Skill scope', 'inferred');
    const task = createContractFixtures().TaskSpec;
    task.taskId = 'task:phase3-fixture'; task.repoId = namespace.repoId; task.taskClass = 'memory.inspect'; task.allowedPaths = scope.allowedPaths;
    task.goal = 'Inspect Memory evidence and preserve handoff constraints in separate agent windows.';
    task.budget.inputLimit = 80_000; task.budget.outputReserve = 2000; task.budget.headroom = 2000;
    task.budget.tokenAccountingPolicy = { version: 'local-accounting/1', tokenizer: 'utf8-bytes/1', includeToolOutputs: true };
    const description = 'C17: Compile thành công không chứng minh Android build đã đạt.';
    task.constraints = [{ id: 'C17', description, sourceRevision: 'rules-r1', contentHash: digest(description), applicability: { taskClasses: [task.taskClass], required: true, reason: 'Giữ giới hạn bằng chứng nền tảng' } }];
    task.acceptanceCriteria = [{ criterionId: 'AC1', description: 'Keep C17, source pins and unknown platform status after compaction.', checkRefs: ['check:context-retention'] }];
    const sourceNodes = [constraints, adapter, skill, claimA, claimB];
    const authority: ContextAuthority = { task, contextPolicyVersion: 'context/local-fixture/1', snapshotId: 'snapshot:phase3-demo', memoryVersion: store.memoryVersion,
      model: { modelConfigVersion: task.budget.modelConfigVersion, inputLimit: 80_000, maxOutputTokens: 8000 },
      agents: ['planner', 'critic'].map(role => ({ agentId: `agent:${role}`, role, scope, branchId: namespace.branchId, lineageId: namespace.lineageId,
        budget: structuredClone(task.budget), mandatoryResourceRefs: [constraints.id], unknowns: [{ id: 'platform:android', description: 'Android build chưa chạy; chỉ fixture local.', critical: false }] })),
      resources: sourceNodes.map(node => ({ ref: node.id, revision: node.revision, contentHash: node.contentDigest, kind: 'evidence', scope: node.scope,
        branchId: node.branchId, lineageId: node.lineageId, status: 'active', trust: 'untrusted-data', sourceRefs: node.provenance.sourceRefs.length ? node.provenance.sourceRefs : [node.id], dependencies: [] })),
    };
    const loader = (pin: Readonly<ContextAuthority['resources'][number]>) => sourceNodes.find(n => n.id === pin.ref)!.content;
    const first = await buildContextWindow(authority, { windowId: 'window:planner-1', agentId: 'agent:planner', resourceRefs: [{ ref: adapter.id, required: true }], history: 'Long planning history. '.repeat(60) }, loader);
    authority.predecessors = [pinContextPredecessor(first)];
    const compacted = await compactContextWindow(first, authority, { windowId: 'window:planner-2', summary: 'Adapter reviewed. Preserve canonical platform restriction and provenance.' }, loader);
    const critic = await buildContextWindow(authority, { windowId: 'window:critic-1', agentId: 'agent:critic', resourceRefs: [{ ref: skill.id, required: false }], history: 'Independent review window.' }, loader);
    const windows: ContextWindow[] = [first, compacted, critic];
    for (const window of windows) store.registerDependency({ id: `context:${window.packet.windowId}`, kind: 'context', label: `${window.packet.agentId} · ${window.packet.windowId}`,
      contentDigest: window.packetDigest, namespace, dependsOn: window.packet.resources.map(r => ({ nodeId: r.pin.ref, contentDigest: r.pin.contentHash })), provenanceRef: window.packet.manifest.manifestId }, 'candidate');
    const plan = store.registerDependency({ id: 'plan:adapter-review', kind: 'plan', label: 'Plan · Adapter review', contentDigest: digest('plan:adapter-review'), namespace,
      dependsOn: [{ nodeId: `context:${compacted.packet.windowId}`, contentDigest: compacted.packetDigest }], provenanceRef: 'fixture:plan' }, 'candidate');
    store.registerDependency({ id: 'handoff:adapter-review', kind: 'handoff', label: 'Handoff · Adapter review', contentDigest: digest('handoff:adapter-review'), namespace,
      dependsOn: [{ nodeId: plan.id, contentDigest: plan.contentDigest }], provenanceRef: 'fixture:handoff' }, 'candidate');
    ingest('Nguồn · Adapter receipt', 'Fixture revision r2 bổ sung reconcile receipt trước retry; r1 không còn là nguồn hiện hành.', 'r2');
    const latest = store.exportSnapshot(namespace);
    const currentAuthority = structuredClone(authority);
    for (const pin of currentAuthority.resources) if (latest.nodes.find(n => n.id === pin.ref)?.status.validity === 'invalidated') pin.status = 'stale';
    const report = { mode: 'local-synthetic-infrastructure-fixture', windows: windows.map(w => ({ windowId: w.packet.windowId,
      initialStatus: w.status, currentValidation: validateContextWindow(w, currentAuthority), packetUnits: w.packet.budgetReport.packetUnits })),
      compaction: { before: first.packet.budgetReport.packetUnits, after: compacted.packet.budgetReport.packetUnits,
        constraintsPreserved: digest(first.packet.task.constraints) === digest(compacted.packet.task.constraints) },
      memoryVersion: latest.memoryVersion, unityInvoked: false, actualProviderTokens: null, modelQualityGate: 'not-evaluated' };
    const markdown = store.writeMarkdownSnapshot(namespace);
    return { namespace, input: explorerInput(latest, windows), windows, report, markdownDirectory: markdown.directory };
  } finally { store.close(); }
}
