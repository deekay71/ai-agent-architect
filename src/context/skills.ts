import { canonicalJson, digest } from '../contracts/canonical.js';
import { discoverSkills, loadSkillCatalog, loadSkillResource, resolveSkill, resourceDigest,
  type LoadSkillCatalogOptions, type SkillResolutionContext } from '../skills/catalog.js';
import type { ContextLoader, ContextResourcePin, ContextScope } from './engine.js';

export interface SkillContextSourceOptions {
  catalog: LoadSkillCatalogOptions; skillId: string; version: string;
  /** Broker-owned current observations; the source cannot supply its own compatibility profile. */
  currentContext: () => SkillResolutionContext;
  scope: ContextScope; branchId: string; lineageId: string;
}
export interface SkillContextSource {
  pins: ContextResourcePin[]; descriptorRef: string; bodyRefs: string[]; referenceRefs: string[];
  loader: ContextLoader;
}

/** Progressive guidance only. Scripts are never exposed by this adapter, and eligibility grants no tool authority. */
export async function createSkillContextSource(options: SkillContextSourceOptions): Promise<SkillContextSource> {
  const select = async () => {
    const current = options.currentContext(), catalog = await loadSkillCatalog(options.catalog);
    const resolution = resolveSkill(catalog, { ...current, skillId: options.skillId, version: options.version });
    if (resolution.status !== 'eligible') throw new Error('CONTEXT_SKILL_INELIGIBLE');
    if (options.scope.repoId !== current.projectProfile.repoId || options.scope.taskClasses.length !== 1 || options.scope.taskClasses[0] !== current.taskClass) throw new Error('CONTEXT_SKILL_SCOPE');
    const descriptor = discoverSkills(catalog).find(x => x.skillId === options.skillId && x.version === options.version);
    if (!descriptor || digest(descriptor) !== resolution.selection.descriptorDigest) throw new Error('CONTEXT_SKILL_DESCRIPTOR');
    return { current, catalog, selection: resolution.selection, descriptor };
  };
  const initial = await select(), base = `skill:${options.skillId}@${options.version}`, descriptorRef = `${base}:descriptor`;
  const descriptorText = canonicalJson(initial.descriptor), selectionDigest = digest(initial.selection);
  const resourceRef = (resourcePath: string): string => `${base}:${resourcePath}`;
  const bodies = initial.descriptor.resources.filter(x => x.kind === 'body'), references = initial.descriptor.resources.filter(x => x.kind === 'reference');
  if (bodies.length === 0) throw new Error('CONTEXT_SKILL_BODY_MISSING');
  const shared = { revision: initial.descriptor.source.revision, scope: structuredClone(options.scope), branchId: options.branchId, lineageId: options.lineageId,
    status: 'active' as const, trust: 'untrusted-data' as const, sourceRefs: [`${initial.descriptor.source.repository}#${initial.descriptor.source.revision}:${initial.descriptor.source.path}`],
    skill: { skillId: initial.selection.skillId, version: initial.selection.skillVersion, descriptorDigest: initial.selection.descriptorDigest, selectionDigest, resourcePath: 'descriptor' } };
  const pins: ContextResourcePin[] = [{ ...shared, ref: descriptorRef, contentHash: resourceDigest(descriptorText), kind: 'skill-descriptor', dependencies: [] },
    ...[...bodies, ...references].map(resource => ({ ...structuredClone(shared), ref: resourceRef(resource.path), contentHash: resource.contentHash,
      kind: resource.kind === 'body' ? 'skill-body' as const : 'skill-reference' as const,
      dependencies: resource.kind === 'body' ? [descriptorRef] : bodies.map(x => resourceRef(x.path)), skill: { ...shared.skill, resourcePath: resource.path } }))];
  const protectedPins = structuredClone(pins);
  const loader: ContextLoader = async requested => {
    const pin = protectedPins.find(x => x.ref === requested.ref);
    if (!pin || digest(pin) !== digest(requested)) throw new Error('CONTEXT_SKILL_PIN_DRIFT');
    const current = await select();
    if (digest(current.selection) !== selectionDigest || current.selection.descriptorDigest !== initial.selection.descriptorDigest) throw new Error('CONTEXT_SKILL_SELECTION_DRIFT');
    if (pin.kind === 'skill-descriptor') return canonicalJson(current.descriptor);
    const loaded = await loadSkillResource(current.catalog, current.selection, pin.skill!.resourcePath, current.current);
    if (loaded.kind === 'script' || loaded.contentHash !== pin.contentHash) throw new Error('CONTEXT_SKILL_RESOURCE_DRIFT');
    return loaded.text;
  };
  return { pins, descriptorRef, bodyRefs: bodies.map(x => resourceRef(x.path)), referenceRefs: references.map(x => resourceRef(x.path)), loader };
}
