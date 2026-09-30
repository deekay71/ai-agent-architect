import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createFoundationScenario } from '../fixtures/foundation.js';
import { resealContractFixtures } from '../fixtures/contracts.js';
import { digest, digestOmitting } from '../src/contracts/canonical.js';
import { type ContractMap } from '../src/contracts/schemas.js';
import { auditContractBundle, type AuditAuthority } from '../src/foundation/audit.js';
import { loadSkillCatalog, discoverSkills, resolveSkill, loadSkillResource, createSkillBinding } from '../src/skills/catalog.js';

test('valid full contract chain roundtrips and never authorizes real dispatch', () => {
  const { bundle, authority } = createFoundationScenario();
  const report = auditContractBundle(JSON.parse(JSON.stringify(bundle)), authority);
  assert.deepEqual(report.issues, []);
  assert.equal(report.valid, true);
  assert.equal(report.checkedContracts, 33);
  assert.equal(report.dispatchAuthorized, false);
});

type Mutation = (bundle: ContractMap, authority: AuditAuthority) => void;
const cases: [string, string, Mutation][] = [
  ['same constraint ID with changed content', 'constraint.authority', b => { b.TaskSpec.constraints[0]!.description = 'Write anything.'; resealContractFixtures(b); }],
  ['manifest keeps ID but changes scope', 'context.scope', b => { b.ContextManifest.scope.allowedPaths = ['policy']; resealContractFixtures(b); }],
  ['stale manifest body with unchanged digest', 'context.digest', b => { b.ContextManifest.contextPolicyVersion = 'changed'; }],
  ['forged gate with legitimate-looking issuer name', 'gate.untrusted', b => { b.GateReport.gateReportId = 'forged-gate'; b.HandoffPacket.gateReportRef = 'forged-gate'; }],
  ['executor claims authority to issue PASS', 'gate.issuer', b => { b.GateReport.issuerId = 'fixture-executor'; }],
  ['actual policy revoked after plan PASS', 'policy.inactive', (_b, a) => { a.policies[0]!.status = 'revoked'; }],
  ['actual policy scope no longer covers task', 'policy.scope', (_b, a) => { a.policies[0]!.permittedTaskClasses = ['other']; }],
  ['policy approved by executor', 'policy.issuer', (_b, a) => { a.policies[0]!.approvedBy = 'fixture-executor'; }],
  ['inputs changed after review', 'gate.inputs', (_b, a) => { a.expectedInputs[0]!.version = 'new-revision'; }],
  ['required check is falsely marked not applicable', 'check.falseNA', b => { b.CheckResult.outcome = 'not_applicable'; b.CheckResult.notApplicableReason = 'Skipped'; b.GateReport.checkResults = [structuredClone(b.CheckResult)]; }],
  ['cyclic step graph is rejected even after rehash', 'plan.cycle', b => { b.PlanPackage.subplans[0]!.steps[0]!.dependsOn = ['step-1']; resealContractFixtures(b); }],
  ['dangling dependency', 'plan.reference', b => { b.PlanPackage.subplans[0]!.steps[0]!.dependsOn = ['missing']; resealContractFixtures(b); }],
  ['handoff widens write scope', 'handoff.scope', b => { b.HandoffPacket.allowedScope.allowedPaths = ['policy']; }],
  ['tool call payload reused with a different hash', 'operation.arguments', b => { b.ToolCall.arguments = { path: 'policy' }; }],
  ['operation ID reused for different args', 'operation.binding', b => { b.OperationRecord.argumentsHash = digest({ different: true }); }],
  ['stale workspace digest', 'operation.workspace', (_b, a) => { a.workspaceDigest = digest('changed'); }],
  ['operation result from a different attempt', 'operation.result', b => { b.ToolResult.attemptId = 'attempt-other'; }],
  ['quarantined resource remains blocked despite heartbeat', 'ownership.notOwned', b => { b.OwnershipRecord.state = 'quarantined'; }],
  ['incompatible checkpoint workflow version', 'checkpoint.version', b => { b.Checkpoint.workflowDefinitionVersion = 'incompatible-v2'; }],
  ['evidence bytes forged with a known issuer', 'evidence.untrusted', b => { b.Evidence.artifactHash = digest('forged file'); }],
  ['wrong evidence environment', 'evidence.environment', (_b, a) => { a.environmentDigest = digest('other-environment'); }],
  ['wrong evidence kind cannot fulfill a deterministic check', 'check.evidenceKind', (_b, a) => { a.evidence[0]!.kind = 'screenshot'; }],
  ['same source URL returns changed content', 'source.untrusted', b => { b.SourceRecord.contentDigest = digest('changed source body'); }],
  ['stale source blocks use', 'source.freshness', b => { b.SourceRecord.freshness = 'stale'; }],
  ['revoked claim blocks use', 'claim.notUsable', b => { b.Claim.lifecycle = 'revoked'; }],
  ['approved claim text edited without promotion', 'claim.untrusted', b => { b.Claim.statement = 'An unsupported new assertion'; }],
  ['claim self-approved by executor', 'claim.approver', b => { b.Claim.approvedBy = 'fixture-executor'; }],
  ['memory delta stale base version', 'memory.version', b => { b.MemoryDelta.expectedMemoryVersion = 'memory-old'; }],
  ['skill descriptor changed under same version', 'skill.digest', b => { b.SkillDescriptor.name = 'changed'; }],
  ['skill withdrawn after selection', 'skill.lifecycle', b => { b.SkillDescriptor.lifecycle = 'revoked'; }],
  ['skill capability same name but changed implementation', 'skill.capability', b => { b.SkillBinding.capabilityBindings[0]!.implementationDigest = digest('new implementation'); }],
  ['skill loaded reference outside pinned package', 'skill.resource', b => { b.SkillBinding.loadedResources[0]!.contentHash = digest('untracked resource'); }],
];
for (const [label, expectedCode, mutate] of cases) test(label, () => {
  const { bundle, authority } = createFoundationScenario();
  mutate(bundle, authority);
  const report = auditContractBundle(bundle, authority);
  assert.equal(report.valid, false);
  assert.equal(report.dispatchAuthorized, false);
  assert.ok(report.issues.some(x => x.code === expectedCode), JSON.stringify(report.issues));
});

test('removed numeric gate fields are rejected instead of becoming readiness authority', () => {
  const { bundle, authority } = createFoundationScenario();
  Object.assign(bundle.GateReport, { dimensionScores: [{ dimension: 'all', score: 100, maximum: 100 }] });
  bundle.GateReport.checkResults[0]!.outcome = 'unknown';
  bundle.GateReport.checkResults[0]!.unknownReason = 'Evidence unavailable';
  const report = auditContractBundle(bundle, authority);
  assert.equal(report.valid, false);
  assert.ok(report.issues.some(x => x.code === 'schema.invalid'));
});

test('malformed envelope and absent contracts produce diagnostics without throwing', () => {
  const { authority } = createFoundationScenario();
  for (const input of [null, [], {}, { alien: {} }, { value: undefined }]) {
    assert.equal(auditContractBundle(input, authority).valid, false);
  }
});

function resealContext(b: ContractMap): void {
  b.ContextManifest.taskSpecDigest = digest(b.TaskSpec);
  b.ContextManifest.manifestDigest = digestOmitting(b.ContextManifest, 'manifestDigest');
  b.ContextBundle.manifestDigest = b.ContextManifest.manifestDigest;
  b.HandoffPacket.contextManifestDigest = b.ContextManifest.manifestDigest;
  b.SkillBinding.contextManifestDigest = b.ContextManifest.manifestDigest;
}

// Repros from the independent review: each starts valid, and retains the exact same authority.
const adversarialCases: [string, string, (bundle: ContractMap) => void][] = [
  ['changed goal retains the old reviewed gate inputs', 'gate.currentInputs', b => { b.TaskSpec.goal = 'Replace protected configuration'; resealContext(b); }],
  ['task, context, handoff and call self-widen together', 'gate.currentInputs', b => {
    b.TaskSpec.allowedPaths.push('policy'); b.ContextManifest.scope.allowedPaths.push('policy');
    b.HandoffPacket.allowedScope.allowedPaths.push('policy'); b.ToolCall.permissionScope.allowedPaths = ['policy']; resealContext(b);
  }],
  ['owner resource is another project', 'ownership.resource', b => { b.OwnershipRecord.resourceId = 'other-project'; }],
  ['context names an unrelated snapshot', 'context.snapshot', b => { b.ContextBundle.snapshotId = 'snapshot-other'; }],
  ['read-only result changes workspace', 'operation.readOnlyWorkspace', b => { b.ToolResult.workspaceSnapshot.digest = digest('different-workspace'); }],
  ['commands and network permissions exceed approved tool policy', 'operation.permissions', b => {
    b.ToolCall.permissionScope.allowedCommands = ['arbitrary-shell']; b.ToolCall.permissionScope.networkDestinations = ['https://unapproved.example'];
  }],
  ['committed operation contains a failed matching attempt', 'operation.attemptResult', b => { b.OperationRecord.attempts[0]!.status = 'failed'; }],
  ['descriptor and binding are replaced and self-resealed', 'skill.untrustedDescriptor', b => {
    b.SkillDescriptor.source.repository = 'https://unreviewed.example/repo'; b.SkillDescriptor.source.revision = 'unreviewed';
    b.SkillDescriptor.resources[0]!.contentHash = digest('unreviewed body');
    b.SkillDescriptor.contentDigest = digest(b.SkillDescriptor.resources); b.SkillBinding.descriptorDigest = digest(b.SkillDescriptor);
    b.SkillBinding.loadedResources = structuredClone(b.SkillDescriptor.resources);
  }],
  ['self-resealed profile is incompatible', 'skill.ineligible', b => { b.ProjectProfile.editorVersion = '9999.0.0'; b.SkillBinding.projectProfileDigest = digest(b.ProjectProfile); }],
  ['a declared reference replaces the required body', 'skill.bodyNotLoaded', b => {
    const reference = { path: 'ref.md', kind: 'reference' as const, contentHash: digest('ref') };
    b.SkillDescriptor.resources.push(reference); b.SkillDescriptor.contentDigest = digest(b.SkillDescriptor.resources);
    b.SkillBinding.descriptorDigest = digest(b.SkillDescriptor); b.SkillBinding.loadedResources = [reference];
  }],
  ['checkpoint has an invented completed node', 'checkpoint.node', b => { b.Checkpoint.completedNodeIds = ['invented-node']; }],
  ['context evidence source and revision are invented', 'context.provenance', b => {
    b.ContextManifest.evidenceBindings[0]!.sourceRevision = 'nonexistent-revision';
    b.ContextBundle.evidenceItems[0]!.sourceRef = 'nonexistent-source'; resealContext(b);
  }],
  ['candidate lifecycle cannot form a completed invocation', 'skill.lifecycle', b => { b.SkillDescriptor.lifecycle = 'candidate'; resealContractFixtures(b); }],
  ['target profile is not an observed prerequisite', 'skill.profileUnknown', b => { b.ProjectProfile.profileKind = 'target'; resealContractFixtures(b); }],
  ['unknown required Editor version blocks compatibility', 'skill.ineligible', b => { b.ProjectProfile.editorVersion = null; b.ProjectProfile.unknowns.push('editorVersion'); resealContractFixtures(b); }],
  ['call capability differs from its plan step', 'operation.stepCapability', b => { b.ToolCall.capability = 'write_fixture'; }],
  ['call tool differs from allowed tools', 'operation.stepCapability', b => { b.ToolCall.toolRef = 'arbitrary-shell'; }],
  ['call version differs from registered tool', 'operation.toolPolicy', b => { b.ToolCall.toolVersion = 'new-version'; }],
  ['call implementation is changed under the same tool name', 'operation.capability', b => { b.ToolCall.implementationDigest = digest('different-implementation'); }],
  ['call target is a different project', 'operation.capability', b => { b.ToolCall.targetProjectId = 'other-project'; }],
  ['path argument is outside declared permission scope', 'operation.argumentScope', b => { b.ToolCall.arguments = { path: 'policy' }; resealContractFixtures(b); }],
  ['attempt times disagree with result', 'operation.attemptResult', b => { b.OperationRecord.attempts[0]!.finishedAt = '2026-09-24T09:01:00.000Z'; }],
  ['attempt result reference is invented', 'operation.attemptResult', b => { b.OperationRecord.attempts[0]!.resultRef = 'another-result'; }],
  ['operation postconditions disagree with result', 'operation.receipt', b => { b.OperationRecord.postconditionRefs = ['invented-postcondition']; }],
  ['checkpoint carries an invented invocation receipt', 'checkpoint.reference', b => { b.Checkpoint.invocationReceiptRefs.push('invented-receipt'); }],
  ['checkpoint carries an invented pending node', 'checkpoint.node', b => { b.Checkpoint.pendingNodeIds.push('invented-node'); }],
  ['checkpoint adds an unregistered context bundle', 'checkpoint.reference', b => { b.Checkpoint.contextBundleRefs.push('bundle-other'); }],
  ['gate omits the selected skill dependency', 'gate.currentInputs', b => { b.GateReport.inputVersions = b.GateReport.inputVersions.filter(x => x.ref !== b.SkillBinding.bindingId); }],
  ['gate repeats a current input', 'gate.duplicateInput', b => { b.GateReport.inputVersions.push(structuredClone(b.GateReport.inputVersions[0]!)); }],
];
for (const [label, expectedCode, mutate] of adversarialCases) test(`independent regression: ${label}`, () => {
  const { bundle, authority } = createFoundationScenario();
  const before = auditContractBundle(bundle, authority);
  assert.equal(before.valid, true, JSON.stringify(before.issues));
  const authorityDigest = digest(authority);
  mutate(bundle);
  const after = auditContractBundle(bundle, authority);
  assert.equal(digest(authority), authorityDigest, 'The candidate mutation must never repair the authority');
  assert.equal(after.valid, false);
  assert.equal(after.dispatchAuthorized, false);
  assert.ok(after.issues.some(x => x.code === expectedCode), JSON.stringify(after.issues));
});

test('actual pinned catalog selection with a loaded body integrates with the static audit', async () => {
  const rootDir = await mkdtemp(path.join(tmpdir(), 'architect-audit-catalog-'));
  try {
    const { bundle, authority } = createFoundationScenario();
    await writeFile(path.join(rootDir, 'SKILL.md'), '# Synthetic fixture skill\nRead the fixture.\n');
    await writeFile(path.join(rootDir, 'descriptor.json'), JSON.stringify(bundle.SkillDescriptor));
    const manifest = { schemaVersion: '1.0', entries: [{ descriptorPath: 'descriptor.json', descriptorDigest: digest(bundle.SkillDescriptor) }] };
    await writeFile(path.join(rootDir, 'catalog.json'), JSON.stringify(manifest));
    const catalog = await loadSkillCatalog({ rootDir, manifestPath: 'catalog.json', expectedManifestDigest: digest(manifest) });
    const context = { taskClass: bundle.TaskSpec.taskClass, projectProfile: bundle.ProjectProfile,
      environmentDigest: authority.environmentDigest, capabilities: authority.capabilities.map(x => ({ ...x, availability: 'available' as const })) };
    const resolved = resolveSkill(catalog, { ...context, skillId: bundle.SkillDescriptor.skillId, version: bundle.SkillDescriptor.version });
    assert.equal(resolved.status, 'eligible');
    if (resolved.status !== 'eligible') throw new Error('Synthetic catalog must be eligible');
    const body = bundle.SkillDescriptor.resources.find(x => x.kind === 'body')!;
    await loadSkillResource(catalog, resolved.selection, body.path, context);
    const original = bundle.SkillBinding;
    bundle.SkillBinding = await createSkillBinding(catalog, resolved.selection, {
      bindingId: original.bindingId, taskId: original.taskId, planId: original.planId, artifactHash: original.artifactHash,
      contextManifestRef: original.contextManifestRef, contextManifestDigest: original.contextManifestDigest,
      policyReleaseId: original.policyReleaseId, certificationEvidenceRefs: original.certificationEvidenceRefs,
    }, context);
    // A real catalog/load result enters the separate synthetic authority before the reviewed baseline is established.
    authority.skillDescriptors = structuredClone(discoverSkills(catalog));
    authority.skillSelections = [structuredClone(bundle.SkillBinding)];
    const before = auditContractBundle(bundle, authority);
    assert.equal(before.valid, true, JSON.stringify(before.issues));
    assert.equal(before.dispatchAuthorized, false);
    const authorityDigest = digest(authority);
    bundle.SkillBinding = structuredClone(bundle.SkillBinding);
    bundle.SkillBinding.loadedResources[0]!.contentHash = digest('a substituted body');
    resealContractFixtures(bundle);
    const after = auditContractBundle(bundle, authority);
    assert.equal(after.valid, false);
    assert.ok(after.issues.some(x => x.code === 'skill.untrustedSelection'));
    assert.equal(digest(authority), authorityDigest);
  } finally { await rm(rootDir, { recursive: true, force: true }); }
});
