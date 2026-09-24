import { constants } from 'node:fs';
import { lstat, open, realpath } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { z } from 'zod';
import { digest } from '../contracts/canonical.js';
import { DigestSchema, ProjectProfileSchema, SCHEMA_VERSION, SkillBindingSchema, SkillDescriptorSchema } from '../contracts/schemas.js';
import type { ProjectProfile, SkillBinding, SkillDescriptor } from '../contracts/schemas.js';

export const catalogManifestSchema = z.strictObject({
  schemaVersion: z.literal('1.0'),
  entries: z.array(z.strictObject({
    descriptorPath: z.string().min(1),
    descriptorDigest: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  })).min(1),
});
export type CatalogManifest = z.infer<typeof catalogManifestSchema>;

export interface LoadSkillCatalogOptions {
  rootDir: string;
  manifestPath: string;
  /** SHA-256 of canonical manifest JSON, obtained through a reviewed source. */
  expectedManifestDigest: string;
}

function immutable<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) immutable(child);
    Object.freeze(value);
  }
  return value;
}

async function readManifest(root: string, manifestPath: string, expectedDigest: string): Promise<CatalogManifest> {
  const result = catalogManifestSchema.safeParse(parseJson(await readPinnedFile(root, manifestPath), manifestPath));
  if (!result.success) fail('INVALID_MANIFEST', `Invalid catalog manifest: ${result.error.message}`);
  if (digest(result.data) !== expectedDigest) fail('MANIFEST_DRIFT', 'Catalog manifest does not match its reviewed pin');
  const paths = new Set<string>();
  for (const entry of result.data.entries) {
    safeSegments(entry.descriptorPath);
    if (paths.has(entry.descriptorPath)) fail('DUPLICATE_DESCRIPTOR', `Repeated descriptor: ${entry.descriptorPath}`);
    paths.add(entry.descriptorPath);
  }
  return result.data;
}

/** Resource bytes have a separate identity from canonical JSON records. */
export function resourceDigest(bytes: string | Uint8Array): string {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

export class SkillCatalogError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'SkillCatalogError';
  }
}

function fail(code: string, message: string): never {
  throw new SkillCatalogError(code, message);
}

function safeSegments(relativePath: string): string[] {
  if (!relativePath || relativePath.includes('\\') || relativePath.includes('\0') ||
      path.posix.isAbsolute(relativePath) || path.win32.isAbsolute(relativePath) ||
      /^[a-zA-Z][a-zA-Z\d+.-]*:/.test(relativePath)) {
    fail('UNSAFE_PATH', `Expected a portable relative resource path: ${relativePath}`);
  }
  const segments = relativePath.split('/');
  if (segments.some((part) => part === '' || part === '.' || part === '..')) {
    fail('UNSAFE_PATH', `Path traversal or ambiguous path: ${relativePath}`);
  }
  return segments;
}

function isContained(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return relative !== '' && !relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative);
}

/**
 * Local Phase 1 reader. Symlinks are rejected, including ones staying in root.
 * Rechecks guard ordinary drift; this is not an OS sandbox against a process
 * concurrently replacing parent directories. Production dispatch needs T07's
 * protected/immutable package store and ownership boundary.
 */
async function readPinnedFile(root: string, relativePath: string): Promise<Buffer> {
  const segments = safeSegments(relativePath);
  let target = root;
  for (const [index, segment] of segments.entries()) {
    target = path.join(target, segment);
    let info;
    try { info = await lstat(target); }
    catch { return fail('MISSING_FILE', `Catalog file is missing: ${relativePath}`); }
    if (info.isSymbolicLink()) fail('SYMLINK', `Symlink is not allowed in catalog paths: ${relativePath}`);
    if (index < segments.length - 1 && !info.isDirectory()) {
      fail('UNSAFE_PATH', `Resource parent is not a directory: ${relativePath}`);
    }
    if (index === segments.length - 1 && !info.isFile()) {
      fail('UNSAFE_PATH', `Resource is not a regular file: ${relativePath}`);
    }
  }
  if (!isContained(root, await realpath(target))) fail('UNSAFE_PATH', `Resource escapes catalog root: ${relativePath}`);
  const handle = await open(target, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const before = await handle.stat();
    if (!before.isFile()) fail('UNSAFE_PATH', `Resource is not a regular file: ${relativePath}`);
    const bytes = await handle.readFile();
    const after = await handle.stat();
    if (before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs) {
      fail('RESOURCE_DRIFT', `Resource changed while reading: ${relativePath}`);
    }
    if (!isContained(root, await realpath(target))) fail('UNSAFE_PATH', `Resource escaped catalog root: ${relativePath}`);
    return bytes;
  } finally { await handle.close(); }
}

function parseJson(bytes: Buffer, label: string): unknown {
  try { return JSON.parse(bytes.toString('utf8')) as unknown; }
  catch { return fail('INVALID_JSON', `Invalid JSON: ${label}`); }
}

export interface SkillCatalog { readonly manifestDigest: string; }
interface CatalogEntry { descriptor: SkillDescriptor; descriptorPath: string; descriptorDigest: string; }
interface CatalogState { root: string; manifestPath: string; manifest: CatalogManifest; entries: Map<string, CatalogEntry>; }
const catalogStates = new WeakMap<SkillCatalog, CatalogState>();
const skillKey = (id: string, version: string): string => JSON.stringify([id, version]);
const compare = (left: string, right: string): number => left < right ? -1 : left > right ? 1 : 0;

function stateOf(catalog: SkillCatalog): CatalogState {
  return catalogStates.get(catalog) ?? fail('UNKNOWN_CATALOG', 'Catalog was not loaded by this reader');
}

async function verifyEntry(state: CatalogState, entry: CatalogEntry): Promise<void> {
  const parsed = SkillDescriptorSchema.safeParse(parseJson(await readPinnedFile(state.root, entry.descriptorPath), entry.descriptorPath));
  if (!parsed.success) fail('INVALID_DESCRIPTOR', `Invalid descriptor: ${entry.descriptorPath}: ${parsed.error.message}`);
  if (digest(parsed.data) !== entry.descriptorDigest) fail('DESCRIPTOR_DRIFT', `Descriptor no longer matches pin: ${entry.descriptorPath}`);
  if (digest(parsed.data.resources) !== parsed.data.contentDigest) fail('CONTENT_DIGEST_MISMATCH', `Resource manifest digest mismatch: ${entry.descriptorPath}`);
  for (const resource of parsed.data.resources) {
    const bytes = await readPinnedFile(state.root, resource.path);
    if (resourceDigest(bytes) !== resource.contentHash) fail('RESOURCE_DRIFT', `Resource hash mismatch: ${resource.path}`);
  }
}

/** Loads reviewed pins and metadata. Validation reads bytes but never executes or exposes resource bodies. */
export async function loadSkillCatalog(options: LoadSkillCatalogOptions): Promise<SkillCatalog> {
  DigestSchema.parse(options.expectedManifestDigest);
  const root = await realpath(options.rootDir);
  if (!(await lstat(root)).isDirectory()) fail('INVALID_ROOT', 'Catalog root must be a directory');
  const manifest = await readManifest(root, options.manifestPath, options.expectedManifestDigest);
  const state: CatalogState = { root, manifestPath: options.manifestPath, manifest, entries: new Map() };
  for (const pin of manifest.entries) {
    const parsed = SkillDescriptorSchema.safeParse(parseJson(await readPinnedFile(root, pin.descriptorPath), pin.descriptorPath));
    if (!parsed.success) fail('INVALID_DESCRIPTOR', `Invalid descriptor: ${pin.descriptorPath}: ${parsed.error.message}`);
    const descriptor = parsed.data;
    if (digest(descriptor) !== pin.descriptorDigest) fail('DESCRIPTOR_DRIFT', `Descriptor does not match pin: ${pin.descriptorPath}`);
    if (!/^(?:[a-fA-F0-9]{40}|[a-fA-F0-9]{64}|sha256:[a-f0-9]{64})$/.test(descriptor.source.revision)) {
      fail('UNPINNED_SOURCE', `Source revision must identify immutable commit/content bytes: ${descriptor.skillId}`);
    }
    const key = skillKey(descriptor.skillId, descriptor.version);
    if (state.entries.has(key)) fail('DUPLICATE_VERSION', `Duplicate skill id/version: ${descriptor.skillId}@${descriptor.version}`);
    const entry = { descriptor: immutable(descriptor), descriptorPath: pin.descriptorPath, descriptorDigest: pin.descriptorDigest };
    await verifyEntry(state, entry);
    state.entries.set(key, entry);
  }
  const catalog = Object.freeze({ manifestDigest: options.expectedManifestDigest });
  catalogStates.set(catalog, state);
  return catalog;
}

/** The discovery surface contains metadata only: no body, reference, or script bytes. */
export function discoverSkills(catalog: SkillCatalog): readonly SkillDescriptor[] {
  return Object.freeze([...stateOf(catalog).entries.values()]
    .map((entry) => entry.descriptor)
    .sort((a, b) => compare(skillKey(a.skillId, a.version), skillKey(b.skillId, b.version))));
}

const registeredCapabilitySchema = z.strictObject({
  capability: z.string().min(1), implementationRef: z.string().min(1), implementationDigest: DigestSchema,
  targetProjectId: z.string().min(1), availability: z.enum(['available', 'unknown', 'unavailable']),
});
export type RegisteredCapability = z.infer<typeof registeredCapabilitySchema>;
export interface SkillResolutionContext {
  taskClass: string;
  projectProfile: ProjectProfile;
  environmentDigest: string;
  capabilities: readonly RegisteredCapability[];
}
export interface SkillRequest extends SkillResolutionContext { skillId: string; version: string; }
export interface ResolutionReason { code: string; message: string; }
export interface SkillSelection {
  readonly skillId: string;
  readonly skillVersion: string;
  readonly taskClass: string;
  readonly descriptorDigest: string;
  readonly projectProfileDigest: string;
  readonly environmentDigest: string;
  readonly capabilityBindings: SkillBinding['capabilityBindings'];
}
export type SkillResolution =
  | { status: 'eligible'; reasons: readonly ResolutionReason[]; selection: SkillSelection }
  | { status: 'unknown' | 'unavailable'; reasons: readonly ResolutionReason[] };
interface SelectionState { catalog: SkillCatalog; contextDigest: string; entry: CatalogEntry; loadedPaths: Set<string>; }
const selectionStates = new WeakMap<SkillSelection, SelectionState>();

function normalizeContext(context: SkillResolutionContext): SkillResolutionContext {
  const projectProfile = ProjectProfileSchema.parse(context.projectProfile);
  const environmentDigest = DigestSchema.parse(context.environmentDigest);
  const capabilities = context.capabilities.map((item) => registeredCapabilitySchema.parse(item))
    .sort((a, b) => compare(`${a.capability}\0${a.targetProjectId}`, `${b.capability}\0${b.targetProjectId}`));
  const capabilityKeys = capabilities.map((item) => JSON.stringify([item.capability, item.targetProjectId]));
  if (new Set(capabilityKeys).size !== capabilityKeys.length) fail('DUPLICATE_CAPABILITY', 'Capability registry has duplicate capability/target entries');
  if (!context.taskClass.trim()) fail('INVALID_TASK_CLASS', 'Task class must not be empty');
  return { taskClass: context.taskClass, projectProfile, environmentDigest, capabilities };
}

function selectionContextDigest(context: SkillResolutionContext, descriptor: SkillDescriptor): string {
  return digest({ ...context, capabilities: context.capabilities.filter((item) =>
    descriptor.requiredCapabilities.includes(item.capability) && item.targetProjectId === context.projectProfile.repoId) });
}

export interface SkillEligibility {
  status: 'eligible' | 'unknown' | 'unavailable';
  reasons: readonly ResolutionReason[];
  capabilityBindings: SkillBinding['capabilityBindings'];
}

/** Shared metadata checks; callers must separately establish the descriptor/profile provenance. */
export function evaluateSkillEligibility(descriptorInput: SkillDescriptor, request: SkillResolutionContext): SkillEligibility {
  const descriptor = SkillDescriptorSchema.parse(descriptorInput);
  const context = normalizeContext(request);
  const unavailable: ResolutionReason[] = [];
  const unknown: ResolutionReason[] = [];
  const reject = (code: string, message: string): void => { unavailable.push({ code, message }); };
  const uncertain = (code: string, message: string): void => { unknown.push({ code, message }); };
  if (!['reviewed', 'tested', 'released'].includes(descriptor.lifecycle)) {
    reject('LIFECYCLE_UNAVAILABLE', `Skill lifecycle is ${descriptor.lifecycle}`);
  }
  if (!descriptor.supportedTaskClasses.includes(context.taskClass)) reject('TASK_CLASS_UNSUPPORTED', `Unsupported task class: ${context.taskClass}`);
  if (context.projectProfile.profileKind !== 'observed') uncertain('PROFILE_NOT_OBSERVED', 'Target profile does not prove the environment is installed');
  const dimensions = [
    ['editorVersion', descriptor.compatibility.editorVersions],
    ['operatingSystem', descriptor.compatibility.operatingSystems],
    ['buildTarget', descriptor.compatibility.buildTargets],
  ] as const;
  for (const [field, supported] of dimensions) {
    if (supported.length === 0) continue;
    const actual = context.projectProfile[field];
    if (actual === null) uncertain('PROFILE_UNKNOWN', `${field} is unknown`);
    else if (!supported.includes(actual)) reject('PROFILE_INCOMPATIBLE', `${field} ${actual} is not in the exact compatibility list`);
  }
  const packageNames = context.projectProfile.packages.map((item) => item.name);
  if (new Set(packageNames).size !== packageNames.length) reject('PACKAGE_AMBIGUOUS', 'Project profile contains duplicate package names');
  if (descriptor.compatibility.requiredPackages.length > 0 && context.projectProfile.packageLockDigest === null) {
    uncertain('PACKAGES_UNKNOWN', 'Required packages have no observed lockfile digest');
  }
  for (const required of descriptor.compatibility.requiredPackages) {
    const actual = context.projectProfile.packages.find((item) => item.name === required.name);
    if (!actual && context.projectProfile.packageLockDigest === null) continue;
    if (!actual || actual.version !== required.version) reject('PACKAGE_INCOMPATIBLE', `Required exact package ${required.name}@${required.version} is absent`);
  }
  const capabilityBindings: SkillBinding['capabilityBindings'] = [];
  for (const required of descriptor.requiredCapabilities) {
    const found = context.capabilities.find((item) => item.capability === required && item.targetProjectId === context.projectProfile.repoId);
    if (!found) { reject('CAPABILITY_MISSING', `No implementation of ${required} is registered for project ${context.projectProfile.repoId}`); continue; }
    if (found.availability === 'unavailable') reject('CAPABILITY_UNAVAILABLE', `Capability ${required} is unavailable`);
    if (found.availability === 'unknown') uncertain('CAPABILITY_UNKNOWN', `Capability ${required} availability is unknown`);
    capabilityBindings.push({ capability: found.capability, implementationRef: found.implementationRef, implementationDigest: found.implementationDigest, targetProjectId: found.targetProjectId });
  }
  if (unavailable.length > 0) return { status: 'unavailable', reasons: [...unavailable, ...unknown], capabilityBindings };
  if (unknown.length > 0) return { status: 'unknown', reasons: unknown, capabilityBindings };
  return { status: 'eligible', reasons: [{ code: 'METADATA_ELIGIBLE', message: 'Declared metadata matches; certification and runtime authorization are not evaluated' }], capabilityBindings };
}

/** Eligibility is metadata compatibility only. It is never certification, PASS, or dispatch authorization. */
export function resolveSkill(catalog: SkillCatalog, request: SkillRequest): SkillResolution {
  const state = stateOf(catalog);
  const entry = state.entries.get(skillKey(request.skillId, request.version));
  if (!entry) return { status: 'unavailable', reasons: [{ code: 'SKILL_NOT_FOUND', message: 'The exact pinned skill id/version is absent' }] };
  const context = normalizeContext(request);
  const descriptor = entry.descriptor;
  const eligibility = evaluateSkillEligibility(descriptor, context);
  if (eligibility.status !== 'eligible') return { status: eligibility.status, reasons: eligibility.reasons };
  const selection = immutable({
    skillId: descriptor.skillId, skillVersion: descriptor.version, taskClass: context.taskClass,
    descriptorDigest: entry.descriptorDigest, projectProfileDigest: digest(context.projectProfile),
    environmentDigest: context.environmentDigest, capabilityBindings: eligibility.capabilityBindings,
  });
  selectionStates.set(selection, { catalog, contextDigest: selectionContextDigest(context, descriptor), entry, loadedPaths: new Set() });
  return { status: 'eligible', reasons: [{ code: 'METADATA_ELIGIBLE', message: 'Declared metadata matches; certification and runtime authorization are not evaluated' }], selection };
}

async function validateSelection(catalog: SkillCatalog, selection: SkillSelection, currentContext: SkillResolutionContext): Promise<SelectionState> {
  const selected = selectionStates.get(selection);
  if (!selected || selected.catalog !== catalog) fail('UNKNOWN_SELECTION', 'Selection was not issued for this catalog');
  if (selectionContextDigest(normalizeContext(currentContext), selected.entry.descriptor) !== selected.contextDigest) fail('SELECTION_DRIFT', 'Project, environment, task, or capability implementation changed after selection');
  const state = stateOf(catalog);
  await readManifest(state.root, state.manifestPath, catalog.manifestDigest);
  await verifyEntry(state, selected.entry);
  return selected;
}

export interface LoadedSkillResource { path: string; kind: 'body' | 'reference' | 'script'; contentHash: string; text: string; }

/** Reads only a declared selected resource and records actual loads; script-kind content remains inert text. */
export async function loadSkillResource(catalog: SkillCatalog, selection: SkillSelection, resourcePath: string, currentContext: SkillResolutionContext): Promise<LoadedSkillResource> {
  safeSegments(resourcePath);
  const selected = await validateSelection(catalog, selection, currentContext);
  const resource = selected.entry.descriptor.resources.find((item) => item.path === resourcePath);
  if (!resource) fail('UNDECLARED_RESOURCE', `Resource is not declared by selected skill: ${resourcePath}`);
  const bytes = await readPinnedFile(stateOf(catalog).root, resource.path);
  if (resourceDigest(bytes) !== resource.contentHash) fail('RESOURCE_DRIFT', `Resource changed during activation: ${resource.path}`);
  selected.loadedPaths.add(resource.path);
  return immutable({ ...resource, text: bytes.toString('utf8') });
}

export interface SkillBindingRefs {
  bindingId: string; taskId: string; planId: string; artifactHash: string;
  contextManifestRef: string; contextManifestDigest: string;
  policyReleaseId: string | null;
  certificationEvidenceRefs: string[];
}

/** Builds provenance refs only; caller-supplied evidence/release refs are not verified or activated here. */
export async function createSkillBinding(catalog: SkillCatalog, selection: SkillSelection, refs: SkillBindingRefs, currentContext: SkillResolutionContext): Promise<SkillBinding> {
  const selected = await validateSelection(catalog, selection, currentContext);
  const loadedResources = selected.entry.descriptor.resources.filter((item) => selected.loadedPaths.has(item.path));
  if (!loadedResources.some((item) => item.kind === 'body')) fail('BODY_NOT_LOADED', 'Skill body must actually be loaded before creating an invocation binding');
  return immutable(SkillBindingSchema.parse({
    schemaVersion: SCHEMA_VERSION, ...refs, skillId: selection.skillId, skillVersion: selection.skillVersion,
    descriptorDigest: selection.descriptorDigest, projectProfileDigest: selection.projectProfileDigest,
    environmentDigest: selection.environmentDigest, loadedResources, capabilityBindings: selection.capabilityBindings,
  }));
}
