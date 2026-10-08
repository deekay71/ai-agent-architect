import { randomUUID } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { digest } from '../contracts/canonical.js';
import { ProjectProfileSchema, SkillDescriptorSchema, type ProjectProfile } from '../contracts/schemas.js';
import { isSafeRelativePath } from '../foundation/permissions.js';
import { resourceDigest, type CatalogManifest } from '../skills/catalog.js';
import { brainSkill, unitySkill, planTemplates, RELEASE_VERSION, sessionStart } from './templates.js';

export const projectConfigSchema = z.strictObject({ schemaVersion: z.literal('architect-project/1'),
  distributionVersion: z.literal(RELEASE_VERSION), projectId: z.string().uuid(), branchId: z.string().min(1), lineageId: z.string().uuid(),
  connector: z.literal('Assistant Unity'), modelExecution: z.literal('disabled'),
  allowedPaths: z.array(z.string().refine(isSafeRelativePath)).min(1),
  taskClasses: z.array(z.enum(['code.review', 'unity.coding', 'unity.observe'])).min(1),
  skillManifestDigest: z.string().regex(/^sha256:[a-f0-9]{64}$/),
});
export type ProjectConfig = z.infer<typeof projectConfigSchema>;

/** Explicit root; no Editor launch, process discovery, credentials or package installation. */
export function projectRoot(input: string): string {
  const root = realpathSync(path.resolve(input));
  for (const rel of ['Assets', 'Packages', 'ProjectSettings']) {
    const p = path.join(root, rel);
    if (!existsSync(p) || lstatSync(p).isSymbolicLink() || !lstatSync(p).isDirectory()) throw Error('PORTABLE_NOT_UNITY_PROJECT');
  }
  return root;
}

/** Prevent accidental traversal/symlink/hardlink writes. Not an OS sandbox or race-proof authority store. */
export function projectPath(root: string, relative: string, createParents = false): string {
  if (!isSafeRelativePath(relative)) throw Error('PORTABLE_UNSAFE_PATH');
  const parts = relative.split('/'); let current = root;
  for (let i = 0; i < parts.length; i++) {
    current = path.join(current, parts[i]!);
    let s;
    try { s = lstatSync(current); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    if (s) {
      if (s.isSymbolicLink() || (s.isFile() && s.nlink !== 1) || (i < parts.length - 1 && !s.isDirectory())) throw Error('PORTABLE_UNSAFE_PATH');
    } else if (createParents && i < parts.length - 1) mkdirSync(current);
  }
  return current;
}
export function readProjectFile(root: string, relative: string): string {
  const p = projectPath(root, relative); const s = lstatSync(p);
  if (!s.isFile() || s.size > 2 * 1024 * 1024) throw Error('PORTABLE_SOURCE_LIMIT');
  return readFileSync(p, 'utf8');
}
export function loadProjectConfig(root: string): ProjectConfig {
  return projectConfigSchema.parse(JSON.parse(readProjectFile(root, '.architect/project.json')));
}

export function detectProject(root: string, repoId: string): ProjectProfile {
  const version = readProjectFile(root, 'ProjectSettings/ProjectVersion.txt').match(/^m_EditorVersion:\s*(\S+)/m)?.[1] ?? null;
  const manifest = JSON.parse(readProjectFile(root, 'Packages/manifest.json')) as { dependencies?: Record<string, string> };
  const packages = Object.entries(manifest.dependencies ?? {}).map(([name, version]) => ({ name, version })).sort((a,b) => a.name.localeCompare(b.name));
  const profile = { schemaVersion: '0.5.0' as const, profileId: `profile:${repoId}`, repoId, profileKind: 'observed' as const,
    editorVersion: version, operatingSystem: ({ darwin: 'macOS', linux: 'Linux', win32: 'Windows' } as Record<string,string>)[process.platform] ?? null,
    buildTarget: null, packageLockDigest: existsSync(projectPath(root, 'Packages/packages-lock.json')) ? resourceDigest(readProjectFile(root, 'Packages/packages-lock.json')) : null,
    packages, renderPipeline: null, uiSystem: null, inputSystem: null,
    codeRoots: ['Assets'], assetRoots: ['Assets'], unknowns: [] as string[] };
  // Installed packages do not establish the active render/UI/input settings; these stay unknown.
  for (const k of ['editorVersion','operatingSystem','buildTarget','packageLockDigest','renderPipeline','uiSystem','inputSystem'] as const) if (profile[k] === null) profile.unknowns.push(k);
  return ProjectProfileSchema.parse(profile);
}

export function bootstrapProject(input: string): { root: string; config: ProjectConfig; created: string[]; profile: ProjectProfile } {
  const root = projectRoot(input);
  if (existsSync(projectPath(root, '.architect/project.json'))) {
    const config = loadProjectConfig(root);
    return { root, config, created: [], profile: detectProject(root, config.projectId) };
  }
  const files: Record<string,string> = { ...planTemplates,
    '.agents/skills/architect-brain/SKILL.md': brainSkill,
    '.agents/skills/architect-unity-execution/SKILL.md': unitySkill,
  };
  const entries: CatalogManifest['entries'] = [];
  for (const [skillId, skillPath] of [['architect-brain', '.agents/skills/architect-brain/SKILL.md'], ['architect-unity-execution', '.agents/skills/architect-unity-execution/SKILL.md']] as const) {
    const resources = [{ kind: 'body' as const, path: skillPath, contentHash: resourceDigest(files[skillPath]!) }];
    const descriptor = SkillDescriptorSchema.parse({ schemaVersion: '0.5.0', skillId, version: RELEASE_VERSION, name: skillId,
      source: { repository: 'file://architect-distribution/skills', revision: resourceDigest(files[skillPath]!), path: skillPath, license: 'LicenseRef-Project-Local' },
      contentDigest: digest(resources), resources, supportedTaskClasses: ['code.review','unity.coding','unity.observe'],
      compatibility: { editorVersions: [], operatingSystems: [], buildTargets: [], requiredPackages: [] }, requiredCapabilities: ['repository.read'],
      inputRefs: ['task.spec','project.profile','source.pins'], outputRefs: ['plan','evidence','handoff'], checkRefs: ['project.boundary','evidence.provenance'], lifecycle: 'reviewed' });
    const descriptorPath = `.architect/skills/${skillId}.json`;
    files[descriptorPath] = JSON.stringify(descriptor,null,2)+'\n'; entries.push({ descriptorPath, descriptorDigest: digest(descriptor) });
  }
  const catalog: CatalogManifest = { schemaVersion: '1.0', entries };
  files['.architect/skills/catalog.json'] = JSON.stringify(catalog,null,2)+'\n';
  const config = projectConfigSchema.parse({ schemaVersion: 'architect-project/1', distributionVersion: RELEASE_VERSION,
    projectId: randomUUID(), branchId: 'project-local', lineageId: randomUUID(), connector: 'Assistant Unity', modelExecution: 'disabled',
    allowedPaths: ['Assets','Packages','ProjectSettings','.architect/plans','.architect/observations','.agents/skills'],
    taskClasses: ['code.review','unity.coding','unity.observe'], skillManifestDigest: digest(catalog) });
  files['.architect/SESSION_START.md'] = sessionStart(config.projectId);
  files['.architect/project.json'] = JSON.stringify(config,null,2)+'\n';
  // Preflight every destination before any write. Never replace AGENTS, settings, packages or existing guidance.
  for (const rel of Object.keys(files)) if (existsSync(projectPath(root, rel))) throw Error('PORTABLE_BOOTSTRAP_CONFLICT');
  const profile = detectProject(root, config.projectId);
  const created: string[] = [];
  for (const [rel, body] of Object.entries(files).sort(([a],[b]) => a === '.architect/project.json' ? 1 : b === '.architect/project.json' ? -1 : a.localeCompare(b))) {
    writeFileSync(projectPath(root,rel,true), body, { flag:'wx' }); created.push(rel);
  }
  return { root, config, created, profile };
}
