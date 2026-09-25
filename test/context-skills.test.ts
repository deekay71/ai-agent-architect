import test from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createContractFixtures } from '../fixtures/contracts.js';
import { digest } from '../src/contracts/canonical.js';
import { buildContextWindow, compactContextWindow, validateContextWindow, pinContextPredecessor, type ContextAuthority } from '../src/context/engine.js';
import { createSkillContextSource } from '../src/context/skills.js';
import { resourceDigest, type SkillResolutionContext } from '../src/skills/catalog.js';

async function fixture(t: test.TestContext, script = false) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'architect-context-skill-'));
  t.after(async () => { await rm(root, { recursive: true, force: true }); });
  await cp(path.resolve('fixtures/skill-catalog'), root, { recursive: true });
  const manifest = JSON.parse(await readFile(path.join(root, 'catalog.json'), 'utf8'));
  if (script) {
    const descriptorPath = path.join(root, 'local-review/descriptor.json');
    const descriptor = JSON.parse(await readFile(descriptorPath, 'utf8'));
    const bytes = 'throw new Error("This script must never execute");';
    await writeFile(path.join(root, 'local-review/tool.js'), bytes);
    descriptor.resources.push({ path: 'local-review/tool.js', kind: 'script', contentHash: resourceDigest(bytes) });
    descriptor.contentDigest = digest(descriptor.resources); manifest.entries[0].descriptorDigest = digest(descriptor);
    await writeFile(descriptorPath, JSON.stringify(descriptor)); await writeFile(path.join(root, 'catalog.json'), JSON.stringify(manifest));
  }
  const contracts = createContractFixtures(), task = contracts.TaskSpec;
  contracts.ProjectProfile.operatingSystem = 'macOS';
  task.taskClass = 'code.review'; task.constraints.forEach(x => { x.applicability.taskClasses = [task.taskClass]; });
  task.budget.inputLimit = 60000; task.budget.outputReserve = 1000; task.budget.headroom = 1000;
  task.budget.tokenAccountingPolicy = { version: 'context-accounting/1', tokenizer: 'utf8-bytes/1', includeToolOutputs: true };
  const scope = { repoId: task.repoId, allowedPaths: ['src'], taskClasses: [task.taskClass] };
  const current: SkillResolutionContext = { taskClass: task.taskClass, projectProfile: contracts.ProjectProfile, environmentDigest: digest('context-fixture-env'),
    capabilities: [{ capability: 'repository.read', implementationRef: 'read-fixture', implementationDigest: digest('fixture-read-v1'), targetProjectId: task.repoId, availability: 'available' }] };
  const source = await createSkillContextSource({ catalog: { rootDir: root, manifestPath: 'catalog.json', expectedManifestDigest: digest(manifest) },
    skillId: 'fixture.local-review', version: '1.0.0', currentContext: () => current, scope, branchId: 'main', lineageId: 'lineage:1' });
  const authority: ContextAuthority = { task, model: { modelConfigVersion: task.budget.modelConfigVersion, inputLimit: 60000, maxOutputTokens: 4000 },
    contextPolicyVersion: 'ctx:1', snapshotId: 'snapshot:1', memoryVersion: 'memory:1',
    agents: [{ agentId: 'planner', role: 'planner', scope, branchId: 'main', lineageId: 'lineage:1', budget: structuredClone(task.budget), mandatoryResourceRefs: [], unknowns: [] }], resources: source.pins };
  const request = { windowId: 'w:1', agentId: 'planner', resourceRefs: [source.descriptorRef, ...source.bodyRefs, ...source.referenceRefs].map(ref => ({ ref, required: true })) };
  return { root, source, authority, request, current };
}

test('real catalog discovery/body/reference are progressively included with exact source and selection pins', async t => {
  const f = await fixture(t);
  const metadata = await buildContextWindow(f.authority, { ...f.request, resourceRefs: [{ ref: f.source.descriptorRef, required: true }] }, f.source.loader);
  assert.equal(metadata.status, 'ready'); assert.equal(metadata.packet.resources.length, 1);
  assert.equal(metadata.packet.resources[0]!.pin.kind, 'skill-descriptor');
  assert.equal(JSON.stringify(metadata.packet.resources).includes('Inspect the requested source paths'), false);
  const full = await buildContextWindow(f.authority, f.request, f.source.loader);
  assert.equal(full.status, 'ready'); assert.equal(full.packet.resources.length, 3);
  assert.deepEqual(full.packet.resources.map(x => x.pin.kind), ['skill-descriptor', 'skill-body', 'skill-reference']);
  assert.ok(full.packet.resources.every(x => x.pin.skill?.selectionDigest && x.instructionAuthority === 'none'));
  assert.equal(validateContextWindow(full, f.authority).status, 'ready');
});

test('catalog body byte drift is rejected when compaction rehydrates a prior skill window', async t => {
  const f = await fixture(t), first = await buildContextWindow(f.authority, f.request, f.source.loader);
  f.authority.predecessors = [pinContextPredecessor(first)];
  await writeFile(path.join(f.root, 'local-review/recipe.md'), 'Altered body must not replace reviewed bytes');
  const next = await compactContextWindow(first, f.authority, { windowId: 'w:2', summary: 'Compacted notes' }, f.source.loader);
  assert.equal(next.status, 'blocked'); assert.equal(next.packet.resources.length, 0); assert.equal(next.packet.loadReceipts.length, 0);
  assert.ok(next.packet.loadPlan.every(x => x.state === 'blocked'));
});

test('a current environment/profile change cannot reuse a selected skill pin', async t => {
  const f = await fixture(t); f.current.environmentDigest = digest('changed-env');
  const w = await buildContextWindow(f.authority, f.request, f.source.loader);
  assert.equal(w.status, 'blocked'); assert.equal(w.packet.resources.length, 0);
});

test('context skill adapter never exports scripts as progressive guidance resources', async t => {
  const f = await fixture(t, true);
  assert.equal(f.source.pins.some(x => x.skill?.resourcePath.endsWith('.js')), false);
  const w = await buildContextWindow(f.authority, f.request, f.source.loader);
  assert.equal(w.status, 'ready'); assert.equal(w.packet.resources.length, 3);
});
