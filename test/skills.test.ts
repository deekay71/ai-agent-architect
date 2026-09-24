import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import type { TestContext } from 'node:test';
import { digest } from '../src/contracts/canonical.js';
import { SkillDescriptorSchema } from '../src/contracts/schemas.js';
import type { ProjectProfile, SkillDescriptor } from '../src/contracts/schemas.js';
import {
  createSkillBinding, discoverSkills, loadSkillCatalog, loadSkillResource, resolveSkill, resourceDigest, SkillCatalogError,
} from '../src/skills/catalog.js';
import type { CatalogManifest, SkillCatalog, SkillResolutionContext, SkillSelection } from '../src/skills/catalog.js';

const fixtureRoot = path.resolve('fixtures/skill-catalog');
const descriptorPath = 'local-review/descriptor.json';
const bodyPath = 'local-review/recipe.md';
const referencePath = 'local-review/reference.md';

function context(): SkillResolutionContext {
  const projectProfile: ProjectProfile = {
    schemaVersion: '0.5.0', profileId: 'profile:fixture', repoId: 'repo:fixture', profileKind: 'observed',
    editorVersion: null, operatingSystem: 'macOS', buildTarget: null,
    packageLockDigest: null, packages: [], renderPipeline: null, uiSystem: null, inputSystem: null,
    codeRoots: ['src'], assetRoots: [],
    unknowns: ['editorVersion', 'buildTarget', 'packageLockDigest', 'renderPipeline', 'uiSystem', 'inputSystem'],
  };
  return {
    taskClass: 'code.review', projectProfile, environmentDigest: digest({ runtime: 'node24-fixture' }),
    capabilities: [{ capability: 'repository.read', implementationRef: 'adapter:read:v1', implementationDigest: digest('read-v1'), targetProjectId: 'repo:fixture', availability: 'available' }],
  };
}

async function fixture(t: TestContext): Promise<{ root: string; descriptor: SkillDescriptor; manifest: CatalogManifest }> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'skill-catalog-test-'));
  t.after(async () => { await rm(root, { recursive: true, force: true }); });
  await cp(fixtureRoot, root, { recursive: true });
  const descriptor = SkillDescriptorSchema.parse(JSON.parse(await readFile(path.join(root, descriptorPath), 'utf8')));
  const manifest = JSON.parse(await readFile(path.join(root, 'catalog.json'), 'utf8')) as CatalogManifest;
  return { root, descriptor, manifest };
}

async function repin(root: string, descriptor: SkillDescriptor): Promise<CatalogManifest> {
  descriptor.contentDigest = digest(descriptor.resources);
  await writeFile(path.join(root, descriptorPath), JSON.stringify(descriptor));
  const manifest: CatalogManifest = { schemaVersion: '1.0', entries: [{ descriptorPath, descriptorDigest: digest(descriptor) }] };
  await writeFile(path.join(root, 'catalog.json'), JSON.stringify(manifest));
  return manifest;
}

const load = (root: string, manifest: CatalogManifest): Promise<SkillCatalog> => loadSkillCatalog({ rootDir: root, manifestPath: 'catalog.json', expectedManifestDigest: digest(manifest) });
function select(catalog: SkillCatalog, current = context(), version = '1.0.0'): SkillSelection {
  const result = resolveSkill(catalog, { ...current, skillId: 'fixture.local-review', version });
  if (result.status !== 'eligible') assert.fail(JSON.stringify(result.reasons));
  return result.selection;
}
const errorCode = (code: string) => (error: unknown): boolean => error instanceof SkillCatalogError && error.code === code;

test('pinned metadata discovery is inert; body and references load only when selected', async (t) => {
  const { root, manifest } = await fixture(t);
  const catalog = await load(root, manifest);
  const discovered = discoverSkills(catalog);
  assert.equal(discovered.length, 1);
  assert.equal(discovered[0]?.source.license, 'LicenseRef-Local-Inert-Fixture');
  assert.equal(JSON.stringify(discovered).includes('Inspect the requested source paths'), false);
  const selected = select(catalog);
  const body = await loadSkillResource(catalog, selected, bodyPath, context());
  assert.match(body.text, /inert test data/);
  assert.equal(body.contentHash, resourceDigest(body.text));
  const refs = { bindingId: 'binding:fixture', taskId: 'task:fixture', planId: 'plan:fixture', artifactHash: digest('artifact'), contextManifestRef: 'context:fixture', contextManifestDigest: digest('context'), certificationEvidenceRefs: [], policyReleaseId: null };
  const binding = await createSkillBinding(catalog, selected, refs, context());
  assert.deepEqual(binding.loadedResources.map((r) => r.path), [bodyPath]);
  assert.equal(binding.policyReleaseId, null);
  assert.deepEqual(binding.certificationEvidenceRefs, []);
  assert.equal(binding.capabilityBindings[0]?.implementationRef, 'adapter:read:v1');
  await loadSkillResource(catalog, selected, referencePath, context());
  const expanded = await createSkillBinding(catalog, selected, refs, context());
  assert.deepEqual(expanded.loadedResources.map((r) => r.path), [bodyPath, referencePath]);
});

test('unknown required profile field or target-only profile stays unknown', async (t) => {
  const { root, manifest } = await fixture(t);
  const catalog = await load(root, manifest);
  for (const mode of ['unknown-os', 'target'] as const) {
    const current = context();
    if (mode === 'unknown-os') { current.projectProfile.operatingSystem = null; current.projectProfile.unknowns.push('operatingSystem'); }
    else current.projectProfile.profileKind = 'target';
    const result = resolveSkill(catalog, { ...current, skillId: 'fixture.local-review', version: '1.0.0' });
    assert.equal(result.status, 'unknown');
    assert.equal('selection' in result, false);
  }
});

test('unknown, unsupported, and wrong-project capabilities do not produce eligibility', async (t) => {
  const { root, manifest } = await fixture(t);
  const catalog = await load(root, manifest);
  const current = context();
  const present = current.capabilities[0];
  assert.ok(present);
  for (const [capabilities, expected] of [
    [[], 'unavailable'],
    [[{ ...present, targetProjectId: 'another-project' }], 'unavailable'],
    [[{ ...present, availability: 'unavailable' as const }], 'unavailable'],
    [[{ ...present, availability: 'unknown' as const }], 'unknown'],
  ] as const) {
    const result = resolveSkill(catalog, { ...current, capabilities, skillId: 'fixture.local-review', version: '1.0.0' });
    assert.equal(result.status, expected);
    assert.match(result.reasons[0]?.code ?? '', /CAPABILITY/);
  }
});

test('task class and candidate/revoked/superseded lifecycle are unavailable', async (t) => {
  const { root, descriptor } = await fixture(t);
  for (const lifecycle of ['candidate', 'revoked', 'superseded'] as const) {
    descriptor.lifecycle = lifecycle;
    const catalog = await load(root, await repin(root, descriptor));
    const result = resolveSkill(catalog, { ...context(), skillId: descriptor.skillId, version: descriptor.version });
    assert.equal(result.status, 'unavailable');
    assert.equal(result.reasons[0]?.code, 'LIFECYCLE_UNAVAILABLE');
  }
  descriptor.lifecycle = 'reviewed';
  const catalog = await load(root, await repin(root, descriptor));
  assert.equal(resolveSkill(catalog, { ...context(), skillId: descriptor.skillId, version: descriptor.version, taskClass: 'gameplay.mutate' }).status, 'unavailable');
});

test('Unity version, OS, target, and package versions match exactly without calling Unity', async (t) => {
  const { root, descriptor } = await fixture(t);
  descriptor.compatibility = { editorVersions: ['6000.0.1f1'], operatingSystems: ['macOS'], buildTargets: ['StandaloneOSX'], requiredPackages: [{ name: 'com.unity.test-framework', version: '1.4.5' }] };
  const catalog = await load(root, await repin(root, descriptor));
  const current = context();
  Object.assign(current.projectProfile, { editorVersion: '6000.0.1f1', buildTarget: 'StandaloneOSX', packageLockDigest: digest('lock'), packages: [{ name: 'com.unity.test-framework', version: '1.4.5' }], unknowns: ['renderPipeline', 'uiSystem', 'inputSystem'] });
  select(catalog, current);
  for (const field of ['editorVersion', 'operatingSystem', 'buildTarget'] as const) {
    const wrong = structuredClone(current);
    wrong.projectProfile[field] = 'different';
    assert.equal(resolveSkill(catalog, { ...wrong, skillId: descriptor.skillId, version: descriptor.version }).status, 'unavailable');
  }
  current.projectProfile.packages[0]!.version = '1.4.6';
  assert.equal(resolveSkill(catalog, { ...current, skillId: descriptor.skillId, version: descriptor.version }).status, 'unavailable');
  current.projectProfile.packages = [];
  current.projectProfile.packageLockDigest = null;
  current.projectProfile.unknowns.push('packageLockDigest');
  assert.equal(resolveSkill(catalog, { ...current, skillId: descriptor.skillId, version: descriptor.version }).status, 'unknown');
});

test('wrong reviewed manifest pin is rejected', async (t) => {
  const { root } = await fixture(t);
  await assert.rejects(loadSkillCatalog({ rootDir: root, manifestPath: 'catalog.json', expectedManifestDigest: digest('wrong-pin') }), errorCode('MANIFEST_DRIFT'));
});

test('source revision must be an immutable pin, not a moving branch name', async (t) => {
  const { root, descriptor } = await fixture(t);
  descriptor.source.revision = 'main';
  await assert.rejects(load(root, await repin(root, descriptor)), errorCode('UNPINNED_SOURCE'));
});

test('all declared resources are hashed, including references not yet loaded', async (t) => {
  const { root, manifest } = await fixture(t);
  await writeFile(path.join(root, referencePath), 'changed but same path');
  await assert.rejects(load(root, manifest), errorCode('RESOURCE_DRIFT'));
});

test('changed body, reference, descriptor or manifest after discovery blocks activation', async (t) => {
  for (const target of [bodyPath, referencePath, descriptorPath, 'catalog.json']) {
    const { root, descriptor, manifest } = await fixture(t);
    const catalog = await load(root, manifest);
    const selected = select(catalog);
    if (target === descriptorPath) { descriptor.name = 'Changed'; await writeFile(path.join(root, target), JSON.stringify(descriptor)); }
    else if (target === 'catalog.json') { manifest.entries[0]!.descriptorDigest = digest('changed'); await writeFile(path.join(root, target), JSON.stringify(manifest)); }
    else await writeFile(path.join(root, target), 'changed bytes');
    await assert.rejects(loadSkillResource(catalog, selected, bodyPath, context()), errorCode(target === descriptorPath ? 'DESCRIPTOR_DRIFT' : target === 'catalog.json' ? 'MANIFEST_DRIFT' : 'RESOURCE_DRIFT'));
  }
});

test('absolute, traversal, backslash, and URL resource paths are rejected even with a valid manifest pin', async (t) => {
  for (const malicious of ['../escape.md', '/tmp/escape.md', 'C:\\escape.md', 'C:escape.md', 'local-review/../escape.md', 'https://example.invalid/file', 'local-review//recipe.md']) {
    const { root, descriptor } = await fixture(t);
    descriptor.resources[0]!.path = malicious;
    await assert.rejects(load(root, await repin(root, descriptor)), errorCode('UNSAFE_PATH'));
  }
});

test('descriptor and manifest paths reject traversal', async (t) => {
  const { root, manifest } = await fixture(t);
  manifest.entries[0]!.descriptorPath = '../descriptor.json';
  await writeFile(path.join(root, 'catalog.json'), JSON.stringify(manifest));
  await assert.rejects(load(root, manifest), errorCode('UNSAFE_PATH'));
  await assert.rejects(loadSkillCatalog({ rootDir: root, manifestPath: '../catalog.json', expectedManifestDigest: digest(manifest) }), errorCode('UNSAFE_PATH'));
});

test('symlink files and symlink directories cannot escape the catalog', async (t) => {
  for (const directoryLink of [false, true]) {
    const { root, descriptor, manifest } = await fixture(t);
    const outside = await mkdtemp(path.join(os.tmpdir(), 'skill-outside-'));
    t.after(async () => { await rm(outside, { recursive: true, force: true }); });
    const bytes = await readFile(path.join(root, bodyPath));
    await writeFile(path.join(outside, 'recipe.md'), bytes);
    if (directoryLink) {
      await symlink(outside, path.join(root, 'linked'), 'dir');
      descriptor.resources[0]!.path = 'linked/recipe.md';
      await assert.rejects(load(root, await repin(root, descriptor)), errorCode('SYMLINK'));
    } else {
      await rm(path.join(root, bodyPath));
      await symlink(path.join(outside, 'recipe.md'), path.join(root, bodyPath));
      await assert.rejects(load(root, manifest), errorCode('SYMLINK'));
    }
  }
});

test('missing resource and internally inconsistent content digest are rejected', async (t) => {
  const { root, descriptor, manifest } = await fixture(t);
  await rm(path.join(root, referencePath));
  await assert.rejects(load(root, manifest), errorCode('MISSING_FILE'));
  descriptor.contentDigest = digest('wrong-resource-list');
  await writeFile(path.join(root, descriptorPath), JSON.stringify(descriptor));
  manifest.entries[0]!.descriptorDigest = digest(descriptor);
  await writeFile(path.join(root, 'catalog.json'), JSON.stringify(manifest));
  await assert.rejects(load(root, manifest), errorCode('CONTENT_DIGEST_MISMATCH'));
});

test('duplicate id/version rejects both identical copies and content collisions', async (t) => {
  for (const changed of [false, true]) {
    const { root, descriptor, manifest } = await fixture(t);
    if (changed) descriptor.name = 'Colliding content at the same version';
    await mkdir(path.join(root, 'duplicate'));
    await writeFile(path.join(root, 'duplicate/descriptor.json'), JSON.stringify(descriptor));
    manifest.entries.push({ descriptorPath: 'duplicate/descriptor.json', descriptorDigest: digest(descriptor) });
    await writeFile(path.join(root, 'catalog.json'), JSON.stringify(manifest));
    await assert.rejects(load(root, manifest), errorCode('DUPLICATE_VERSION'));
  }
});

test('distinct versions coexist and selection never silently falls back', async (t) => {
  const { root, descriptor, manifest } = await fixture(t);
  descriptor.version = '2.0.0';
  await writeFile(path.join(root, 'v2.json'), JSON.stringify(descriptor));
  manifest.entries.push({ descriptorPath: 'v2.json', descriptorDigest: digest(descriptor) });
  await writeFile(path.join(root, 'catalog.json'), JSON.stringify(manifest));
  const catalog = await load(root, manifest);
  assert.equal(discoverSkills(catalog).length, 2);
  assert.equal(select(catalog, context(), '2.0.0').skillVersion, '2.0.0');
  assert.equal(resolveSkill(catalog, { ...context(), skillId: descriptor.skillId, version: 'latest' }).status, 'unavailable');
});

test('environment, package lock, task, and capability implementation drift invalidate selection', async (t) => {
  const { root, manifest } = await fixture(t);
  const catalog = await load(root, manifest);
  const selected = select(catalog);
  for (const mutation of ['environment', 'profile', 'capability-digest', 'capability-ref', 'task'] as const) {
    const current = context();
    if (mutation === 'environment') current.environmentDigest = digest('new-environment');
    if (mutation === 'profile') { current.projectProfile.packageLockDigest = digest('new-lock'); current.projectProfile.unknowns = current.projectProfile.unknowns.filter((f) => f !== 'packageLockDigest'); }
    if (mutation === 'task') current.taskClass = 'different-task';
    const first = current.capabilities[0];
    assert.ok(first);
    if (mutation === 'capability-digest') first.implementationDigest = digest('new-implementation');
    if (mutation === 'capability-ref') first.implementationRef = 'new-implementation-ref';
    await assert.rejects(loadSkillResource(catalog, selected, bodyPath, current), errorCode('SELECTION_DRIFT'));
  }
});

test('unrelated capability changes do not invalidate selected dependencies', async (t) => {
  const { root, manifest } = await fixture(t);
  const catalog = await load(root, manifest);
  const selected = select(catalog);
  const current = context();
  current.capabilities = [...current.capabilities, { capability: 'unrelated.tool', implementationRef: 'adapter:other', implementationDigest: digest('other'), targetProjectId: 'repo:fixture', availability: 'available' }];
  assert.equal((await loadSkillResource(catalog, selected, bodyPath, current)).kind, 'body');
});

test('script-kind resources are hashed and returned as inert text, never executed', async (t) => {
  const { root, descriptor } = await fixture(t);
  const scriptPath = 'local-review/script-fixture.txt';
  const text = 'throw new Error("This text must never execute");\n';
  await writeFile(path.join(root, scriptPath), text, { mode: 0o600 });
  descriptor.resources.push({ path: scriptPath, kind: 'script', contentHash: resourceDigest(text) });
  const manifest = await repin(root, descriptor);
  const catalog = await load(root, manifest);
  assert.equal((await loadSkillResource(catalog, select(catalog), scriptPath, context())).text, text);
  await writeFile(path.join(root, scriptPath), 'different bytes');
  await assert.rejects(load(root, manifest), errorCode('RESOURCE_DRIFT'));
});

test('forged selections, undeclared resources, and bindings without loaded body are rejected', async (t) => {
  const { root, manifest } = await fixture(t);
  const catalog = await load(root, manifest);
  const selected = select(catalog);
  await assert.rejects(loadSkillResource(catalog, { ...selected }, bodyPath, context()), errorCode('UNKNOWN_SELECTION'));
  await assert.rejects(loadSkillResource(catalog, selected, 'local-review/undeclared.md', context()), errorCode('UNDECLARED_RESOURCE'));
  const refs = { bindingId: 'binding:fixture', taskId: 'task:fixture', planId: 'plan:fixture', artifactHash: digest('artifact'), contextManifestRef: 'context:fixture', contextManifestDigest: digest('context'), certificationEvidenceRefs: [], policyReleaseId: null };
  await assert.rejects(createSkillBinding(catalog, selected, refs, context()), errorCode('BODY_NOT_LOADED'));
});
