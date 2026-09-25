#!/usr/bin/env node
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { schemas, SCHEMA_VERSION, parseContract, type ContractName, type ProjectProfile } from './contracts/schemas.js';
import { digest } from './contracts/canonical.js';
import { createFoundationScenario } from '../fixtures/foundation.js';
import { createFixtureWorkflow } from './foundation/workflow.js';
import { createSkillBinding, discoverSkills, loadSkillCatalog, loadSkillResource, resolveSkill } from './skills/catalog.js';
import type { SkillResolutionContext } from './skills/catalog.js';
import { runtimeCommand } from './runtime/cli.js';
import { memoryCommand } from './explorer/cli.js';
import { runEvaluationCli } from './evaluation/cli.js';

const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url));
const output = (value: unknown) => process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
async function jsonFile(file: string): Promise<unknown> {
  const bytes = await readFile(file);
  if (bytes.length > 2 * 1024 * 1024) throw new Error('Input exceeds the 2 MiB CLI limit');
  return JSON.parse(bytes.toString('utf8')) as unknown;
}

async function skillsDemo(): Promise<unknown> {
  const rootDir = path.join(repositoryRoot, 'fixtures/skill-catalog');
  const pin = z.strictObject({ expectedManifestDigest: z.string() }).parse(await jsonFile(path.join(rootDir, 'catalog.pin.json')));
  const catalog = await loadSkillCatalog({ rootDir, manifestPath: 'catalog.json', ...pin });
  const profile: ProjectProfile = {
    schemaVersion: SCHEMA_VERSION, profileId: 'profile:offline-fixture', repoId: 'repo:fixture', profileKind: 'observed',
    editorVersion: null, operatingSystem: process.platform === 'darwin' ? 'macOS' : process.platform === 'linux' ? 'Linux' : process.platform,
    buildTarget: null, packageLockDigest: null, packages: [], renderPipeline: null, uiSystem: null, inputSystem: null,
    codeRoots: ['src'], assetRoots: [], unknowns: ['editorVersion', 'buildTarget', 'packageLockDigest', 'renderPipeline', 'uiSystem', 'inputSystem'],
  };
  const context: SkillResolutionContext = {
    taskClass: 'code.review', projectProfile: profile,
    environmentDigest: digest({ node: process.version, platform: process.platform, mode: 'offline-fixture' }),
    capabilities: [{ capability: 'repository.read', implementationRef: 'fixture-read-only-adapter',
      implementationDigest: digest('fixture-read-only-adapter-v1'), targetProjectId: profile.repoId, availability: 'available' }],
  };
  const resolution = resolveSkill(catalog, { ...context, skillId: 'fixture.local-review', version: '1.0.0' });
  if (resolution.status !== 'eligible') throw new Error(JSON.stringify(resolution));
  await loadSkillResource(catalog, resolution.selection, 'local-review/recipe.md', context);
  const binding = await createSkillBinding(catalog, resolution.selection, {
    bindingId: 'binding:demo', taskId: 'task:demo', planId: 'plan:demo', artifactHash: digest('demo-plan'),
    contextManifestRef: 'manifest:demo', contextManifestDigest: digest('demo-context'),
    policyReleaseId: null, certificationEvidenceRefs: [],
  }, context);
  return { mode: 'offline-fixture', discovered: discoverSkills(catalog).map(({ skillId, version, name }) => ({ skillId, version, name })),
    resolution: resolution.status, binding, scriptsExecuted: 0, unityInvoked: false, dispatchAuthorized: false };
}

async function main(args: string[]): Promise<void> {
  const command = args[0];
  if (command === '--help' || command === 'help' || args.length === 0) {
    output({ name: 'AI Agent Architect', commands: ['demo [--tamper]', 'skills-demo', 'contracts', 'validate <ContractName> <file.json>', 'schemas <output-directory>',
      'runtime-demo <new-directory>', 'runtime-submit <workspace> <control> <request.json>', 'runtime-resume <workspace> <control> <run-id>',
      'runtime-status <workspace> <control> <run-id>', 'runtime-reconcile <workspace> <control> <run-id>', 'runtime-recover <workspace> <control>',
      'memory-demo <new-directory>', 'memory-view <snapshot.json> <scope.json> [port] [context-windows.json]',
      'semantic-preflight <dataset> <config.json>', 'semantic-run <dataset> <config.json> <new-output-directory> <spend-directory> [--live]',
      'semantic-review-import <dataset> <external-review.json>',
      'semantic-review-export <campaign> <new-review-directory>',
      'semantic-outcome-review-import <campaign> <decisions.json> <new-reviewed-file>'],
      scope: 'Foundation, local mechanical runtime and Memory/Context inspector; no production/model/Unity authorization' });
  } else if (command?.startsWith('semantic-')) {
    if (!await runEvaluationCli(args)) throw new Error('Unknown semantic command');
  } else if (command?.startsWith('memory-')) {
    await memoryCommand(args);
  } else if (command?.startsWith('runtime-')) {
    await runtimeCommand(args);
  } else if (command === 'contracts' && args.length === 1) {
    output({ schemaVersion: SCHEMA_VERSION, contracts: Object.keys(schemas) });
  } else if (command === 'validate' && args.length === 3) {
    const name = args[1]!;
    if (!Object.hasOwn(schemas, name)) throw new Error(`Unknown contract: ${name}`);
    const data = parseContract(name as ContractName, await jsonFile(args[2]!));
    output({ contract: name, schemaValid: true, digest: digest(data), dispatchAuthorized: false,
      limitation: 'Structural and local invariants only; cross-record and runtime trust checks still required' });
  } else if (command === 'schemas' && args.length === 2) {
    const directory = path.resolve(args[1]!);
    await mkdir(directory, { recursive: true });
    for (const [name, schema] of Object.entries(schemas)) {
      const structure = z.toJSONSchema(schema, { target: 'draft-2020-12', unrepresentable: 'any' });
      await writeFile(path.join(directory, `${name}.schema.json`), JSON.stringify({ ...structure,
        $comment: 'Structure only. Execute parseContract and the cross-record validator; custom refinements/JSON-value checks are not represented here.' }, null, 2) + '\n');
    }
    output({ written: Object.keys(schemas).length, directory, structuralOnly: true });
  } else if (command === 'skills-demo' && args.length === 1) {
    output(await skillsDemo());
  } else if (command === 'demo' && (args.length === 1 || (args.length === 2 && args[1] === '--tamper'))) {
    const scenario = createFoundationScenario();
    const workflow = createFixtureWorkflow(scenario.bundle);
    if (args[1] === '--tamper') scenario.bundle.GateReport.issuerId = 'fixture-executor';
    const result = await workflow.run(scenario);
    output(result);
    if (!result.conformance.valid) process.exitCode = 1;
  } else throw new Error('Invalid command or arguments. Run --help.');
}

main(process.argv.slice(2)).catch((error: unknown) => {
  output({ error: error instanceof Error ? error.message : String(error), dispatchAuthorized: false });
  process.exitCode = 1;
});
