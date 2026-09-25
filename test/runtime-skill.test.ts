import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { digest } from '../src/contracts/canonical.js';
import { createContractFixtures } from '../fixtures/contracts.js';
import { runtimeFixture } from '../fixtures/runtime.js';
import { PersistentWorkflowRunner } from '../src/runtime/runner.js';
import type { StageGateEnvelope } from '../src/runtime/evaluation.js';
import { createSkillBinding, loadSkillCatalog, loadSkillResource, resolveSkill, resourceDigest,
  type CatalogManifest, type SkillResolutionContext } from '../src/skills/catalog.js';

const supported = process.platform === 'darwin';

async function setup() {
  const root = await mkdtemp(path.join(tmpdir(), 'architect-runtime-skill-'));
  const workspace = path.join(root, 'workspace'), catalogRoot = path.join(root, 'catalog');
  await Promise.all([mkdir(path.join(workspace, 'src'), { recursive: true }), mkdir(catalogRoot)]);
  const runner = new PersistentWorkflowRunner(workspace, path.join(root, 'control'));
  const { config, request } = runtimeFixture('skill-integration');
  const contracts = createContractFixtures();
  // All records here are synthetic. This is no assertion that Unity or a game skill is installed.
  const descriptor = structuredClone(contracts.SkillDescriptor);
  descriptor.skillId = 'runtime.fixture-guidance'; descriptor.name = 'Mechanical runtime fixture guidance';
  descriptor.supportedTaskClasses = ['runtime.fixture']; descriptor.requiredCapabilities = ['fixture.write-once'];
  descriptor.checkRefs = request.records.plan.subplans[0]!.steps[0]!.verificationChecks;
  const body = '# Synthetic runtime guidance\nWrite the approved target once and independently verify its bytes.\n';
  descriptor.resources = [{ path: 'SKILL.md', kind: 'body', contentHash: resourceDigest(body) }];
  descriptor.contentDigest = digest(descriptor.resources);
  await writeFile(path.join(catalogRoot, 'SKILL.md'), body);
  const manifest: CatalogManifest = { schemaVersion: '1.0', entries: [{ descriptorPath: 'descriptor.json', descriptorDigest: digest(descriptor) }] };
  const publish = async (): Promise<void> => {
    manifest.entries[0]!.descriptorDigest = digest(descriptor);
    await writeFile(path.join(catalogRoot, 'descriptor.json'), JSON.stringify(descriptor));
    await writeFile(path.join(catalogRoot, 'catalog.json'), JSON.stringify(manifest));
  };
  await publish();
  const catalogOptions = { rootDir: catalogRoot, manifestPath: 'catalog.json', expectedManifestDigest: digest(manifest) };
  const context: SkillResolutionContext = { taskClass: 'runtime.fixture', projectProfile: structuredClone(contracts.ProjectProfile),
    environmentDigest: config.environmentDigest,
    capabilities: [{ capability: 'fixture.write-once', implementationRef: 'fixture.write-once', implementationDigest: config.toolDigest,
      targetProjectId: request.records.task.repoId, availability: 'available' }] };
  const catalog = await loadSkillCatalog(catalogOptions);
  const resolution = resolveSkill(catalog, { ...context, skillId: descriptor.skillId, version: descriptor.version });
  assert.equal(resolution.status, 'eligible');
  if (resolution.status !== 'eligible') throw new Error('Fixture selection unavailable');
  await loadSkillResource(catalog, resolution.selection, 'SKILL.md', context);
  const binding = await createSkillBinding(catalog, resolution.selection, {
    bindingId: 'runtime-skill', taskId: request.records.task.taskId, planId: request.records.plan.planId,
    artifactHash: request.records.plan.hash, contextManifestRef: request.records.manifest.manifestId,
    contextManifestDigest: request.records.manifest.manifestDigest, policyReleaseId: config.policyReleaseId, certificationEvidenceRefs: [],
  }, context);
  config.skill = { catalog: catalogOptions, context, skillId: descriptor.skillId, version: descriptor.version, resources: ['SKILL.md'], bindingDigest: digest(binding) };
  await runner.configure(config); await runner.submit(request);
  return { root, workspace, catalogRoot, runner, config, request, descriptor, manifest, binding, publish,
    cleanup: async () => { await runner.close(); await rm(root, { recursive: true, force: true }); await rm(runner.lockRoot, { recursive: true, force: true }); } };
}

test('runtime loads the pinned skill body, verifies the current binding and executes the mechanical tool', { skip: !supported }, async () => {
  const f = await setup();
  try {
    const result = await f.runner.resume(f.request.runId);
    assert.equal(result.run.state, 'completed', result.run.reason ?? ''); assert.equal(result.budget.dispatches, 1);
    assert.deepEqual(f.runner.store.artifactValue(digest(f.binding)), f.binding);
    assert.deepEqual(f.runner.store.artifactValue(f.binding.descriptorDigest), f.descriptor);
    assert.deepEqual(f.runner.store.artifactValue(f.binding.projectProfileDigest), f.config.skill!.context.projectProfile);
    const gates = f.runner.store.list<StageGateEnvelope>('gate').filter(x => x.stage !== 'planning');
    assert.equal(gates.length, 2);
    for (const gate of gates) assert.ok(gate.report.inputVersions.some(x => x.ref === 'runtime-skill' && x.digest === digest(f.binding)), 'Execution gates must bind the actual skill invocation');
    const operation = f.runner.store.read<{ skillBindingRef: string }>('operation', f.request.operations[0]!.operationId);
    assert.equal(operation?.skillBindingRef, digest(f.binding));
    assert.equal(await readFile(path.join(f.workspace, f.request.operations[0]!.target), 'utf8'), f.request.operations[0]!.content);
  } finally { await f.cleanup(); }
});

test('a self-consistent replacement binding cannot misidentify the fixed tool implementation', { skip: !supported }, async () => {
  const f = await setup();
  try {
    const registered = f.config.skill!.context.capabilities[0]!;
    registered.implementationDigest = digest('different-registered-tool');
    const replacement = structuredClone(f.binding);
    replacement.capabilityBindings[0]!.implementationDigest = registered.implementationDigest;
    f.config.skill!.bindingDigest = digest(replacement);
    await f.runner.configure(f.config);
    const result = await f.runner.resume(f.request.runId);
    assert.equal(result.run.state, 'blocked'); assert.equal(result.run.reason, 'SKILL_CAPABILITY_DRIFT');
    assert.equal(result.budget.dispatches, 0);
    await assert.rejects(readFile(path.join(f.workspace, f.request.operations[0]!.target)), { code: 'ENOENT' });
  } finally { await f.cleanup(); }
});

const mutations: { name: string; apply: (f: Awaited<ReturnType<typeof setup>>) => Promise<void> }[] = [
  { name: 'body byte drift after submission', apply: async f => { await writeFile(path.join(f.catalogRoot, 'SKILL.md'), 'unreviewed body'); } },
  { name: 'descriptor drift under the pinned manifest', apply: async f => {
    f.descriptor.name = 'Unreviewed replacement'; await writeFile(path.join(f.catalogRoot, 'descriptor.json'), JSON.stringify(f.descriptor));
  } },
  { name: 'revoked descriptor in an updated trusted catalog', apply: async f => {
    f.descriptor.lifecycle = 'revoked'; await f.publish();
    f.config.skill!.catalog.expectedManifestDigest = digest(f.manifest); await f.runner.configure(f.config);
  } },
  { name: 'capability implementation changed since binding', apply: async f => {
    f.config.skill!.context.capabilities[0]!.implementationDigest = digest('changed-implementation'); await f.runner.configure(f.config);
  } },
  { name: 'required capability availability became unknown', apply: async f => {
    f.config.skill!.context.capabilities[0]!.availability = 'unknown'; await f.runner.configure(f.config);
  } },
  { name: 'environment changed consistently but old binding remained', apply: async f => {
    f.config.environmentDigest = digest('new-environment'); f.config.skill!.context.environmentDigest = f.config.environmentDigest;
    await f.runner.configure(f.config);
  } },
  { name: 'compatible profile changed since binding', apply: async f => {
    f.config.skill!.context.projectProfile.codeRoots = ['different-code-root']; await f.runner.configure(f.config);
  } },
  { name: 'required Editor compatibility became unknown', apply: async f => {
    f.config.skill!.context.projectProfile.editorVersion = null;
    f.config.skill!.context.projectProfile.unknowns.push('editorVersion'); await f.runner.configure(f.config);
  } },
  { name: 'body omitted from runtime activation', apply: async f => {
    f.config.skill!.resources = []; await f.runner.configure(f.config);
  } },
  { name: 'profile targets a different repository', apply: async f => {
    f.config.skill!.context.projectProfile.repoId = 'another-repo'; await f.runner.configure(f.config);
  } },
];

for (const mutation of mutations) test(`runtime skill revalidation blocks ${mutation.name} before dispatch`, { skip: !supported }, async () => {
  const f = await setup();
  try {
    await mutation.apply(f);
    const result = await f.runner.resume(f.request.runId);
    assert.equal(result.run.state, 'blocked', JSON.stringify(result));
    assert.equal(result.budget.dispatches, 0); assert.equal(result.operations.length, 0);
    await assert.rejects(readFile(path.join(f.workspace, f.request.operations[0]!.target)), { code: 'ENOENT' });
  } finally { await f.cleanup(); }
});
