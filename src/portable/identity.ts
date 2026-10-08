import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readdirSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { canonicalJson } from '../contracts/canonical.js';
import { RELEASE_VERSION } from './templates.js';

/**
 * Read-only delivery identity. Version labels (repository package 0.1.0, portable/UPM 0.2.0-preview.1) are labels only;
 * they identify neither source nor build bytes. A source-inventory digest is not a Git commit. Nothing here writes files,
 * opens project stores, starts Unity, binds MCP or calls a model.
 */
export const IDENTITY_SCHEMA_VERSION = 'architect-source-identity/1' as const;
export const PARITY_SCHEMA_VERSION = 'architect-build-parity/1' as const;
type TypeScriptApi = typeof import('typescript');
export interface PackageSpec {
  coreFolders: readonly string[]; fixtures: readonly string[]; tests: readonly string[];
  extraSources: readonly string[]; unityPackage: string | null;
  declaredOutputs?: readonly string[];
}
/** Legacy inventory for read-only inspection of roots without PAYLOAD.json; publication uses the declaration. */
export const PORTABLE_PACKAGE_SPEC: PackageSpec = Object.freeze({
  coreFolders: ['contracts','foundation','context','memory','skills','runtime','portable'],
  fixtures: ['contracts','brain-planning','portable-session','runtime-crash-child','runtime-authority'],
  tests: ['portable','portable-durability','context','context-memory','context-skills','memory','brain-planning-contracts','runtime-recovery'],
  extraSources: ['src/providers/types.ts'],
  unityPackage: 'unity/packages/com.architect.brain-unity',
});

const sha256 = (bytes: string | Buffer): string => createHash('sha256').update(bytes).digest('hex');
const posix = (value: string): string => value.split(path.sep).join('/');
const payloadLists = ['sourceModules','inspectionOnlyModules','fixtures','tests','fixtureResourceFiles','policyFiles','unityPackageFiles'] as const;
/** Resolve the same declared source/output set as the producer, without admitting directory-scan additions. */
function resolveSpec(root: string, spec: PackageSpec): PackageSpec {
  const declaration = path.join(root,'portable/PAYLOAD.json');
  if (spec !== PORTABLE_PACKAGE_SPEC || !existsSync(declaration)) return spec;
  if (!regularFile(declaration)) throw Error('non-regular payload declaration');
  const value = JSON.parse(readFileSync(declaration,'utf8')) as Record<string,unknown>;
  if (value.format !== 'architect-portable-payload/1' || value.version !== RELEASE_VERSION) throw Error('payload version mismatch');
  const lists: Record<string,string[]> = {};
  for (const key of payloadLists) {
    const values = value[key];
    if (!Array.isArray(values) || values.some(x => typeof x !== 'string') || new Set(values).size !== values.length) throw Error(`invalid payload list: ${key}`);
    for (const item of values as string[]) {
      if (item.split('/').some(part => !part || part === '.' || part === '..' || /[\\\s\u0000-\u001f:]/u.test(part))) throw Error('unsafe payload path');
    }
    lists[key] = values as string[];
  }
  const modules = lists.sourceModules!, inspection = lists.inspectionOnlyModules!;
  if (inspection.some(x => !modules.includes(x))) throw Error('inspection module outside declared source');
  if (value.hostCliModule !== 'portable/cli' || !modules.includes(value.hostCliModule) || inspection.includes(value.hostCliModule)) throw Error('CLI outside active declared source');
  const sources = [
    ...modules.map(x => `src/${x}.ts`), ...lists.fixtures!.map(x => `fixtures/${x}.ts`),
    ...lists.tests!.map(x => `test/${x}.test.ts`), 'portable/PAYLOAD.json','scripts/architect.mjs',
    ...lists.unityPackageFiles!.map(x => `unity/packages/com.architect.brain-unity/${x}`),
  ];
  const outputs = [
    ...modules.filter(x => !inspection.includes(x)).flatMap(x => [`dist/src/${x}.js`,`dist/src/${x}.d.ts`]),
    ...lists.fixtures!.flatMap(x => [`dist/fixtures/${x}.js`,`dist/fixtures/${x}.d.ts`]),
    ...lists.tests!.map(x => `dist/test/${x}.test.js`),
  ];
  return { coreFolders:[],fixtures:[],tests:[],extraSources:sources,unityPackage:null,declaredOutputs:outputs };
}
function regularFile(file: string): boolean {
  try { const s = lstatSync(file); return s.isFile() && !s.isSymbolicLink(); } catch { return false; }
}
function directory(dir: string): boolean {
  try { const s = lstatSync(dir); return s.isDirectory() && !s.isSymbolicLink(); } catch { return false; }
}
const topLevelFiles = (dir: string): string[] => directory(dir) ? readdirSync(dir).filter(name => regularFile(path.join(dir,name))).sort() : [];
function walk(dir: string): string[] {
  return readdirSync(dir,{ withFileTypes:true }).flatMap(entry => {
    const file = path.join(dir,entry.name);
    return entry.isDirectory() ? walk(file) : entry.isFile() ? [file] : [];
  });
}

/** Unicode code-point order, as Python sorts `str` keys (differs from UTF-16 order for non-BMP versus U+E000–U+FFFF). */
export function codePointCompare(a: string, b: string): number {
  const x = [...a], y = [...b];
  for (let i = 0; i < Math.min(x.length,y.length); i++) { const d = x[i]!.codePointAt(0)! - y[i]!.codePointAt(0)!; if (d) return d; }
  return x.length - y.length;
}
const shortEscapes: Readonly<Record<number,string>> = { 0x22:'\\"',0x5c:'\\\\',0x08:'\\b',0x0c:'\\f',0x0a:'\\n',0x0d:'\\r',0x09:'\\t' };
/** Python `json.dumps` string with default `ensure_ascii=True`: everything outside U+0020–U+007E is \uXXXX (lowercase, surrogate pairs). */
function pythonAsciiJsonString(value: string): string {
  let encoded = '"';
  for (let i = 0; i < value.length; i++) {
    const unit = value.charCodeAt(i), short = shortEscapes[unit];
    encoded += short ?? (unit < 0x20 || unit > 0x7e ? `\\u${unit.toString(16).padStart(4,'0')}` : value[i]);
  }
  return `${encoded}"`;
}
/**
 * The packaging inventory codec, kept local to identity: exactly Python's
 * `json.dumps(inventory, sort_keys=True, separators=(',',':'))` for a flat string map. ASCII inventories encode
 * byte-identically to the previous canonical JSON rule, so their revisions are unchanged. Shared contract digests are untouched.
 */
export function packagingInventoryJson(files: Readonly<Record<string,string>>): string {
  return `{${Object.keys(files).sort(codePointCompare).map(key => `${pythonAsciiJsonString(key)}:${pythonAsciiJsonString(files[key]!)}`).join(',')}}`;
}

export interface SourceInventory { files: Record<string,string>; sourceRevision: string; missing: string[] }
/** Same file set and digest rule as package-portable.py SOURCE_INVENTORY.json (Python-compatible compact JSON, SHA-256 hex). */
export function sourceInventory(root: string, spec: PackageSpec = PORTABLE_PACKAGE_SPEC): SourceInventory {
  spec = resolveSpec(root,spec);
  const files: Record<string,string> = {}, missing: string[] = [];
  const add = (relative: string): void => { const file = path.join(root,relative);
    if (regularFile(file) && !path.relative(realpathSync(root),realpathSync(file)).startsWith('..')) files[relative] = sha256(readFileSync(file)); else missing.push(relative); };
  for (const folder of spec.coreFolders) {
    if (!directory(path.join(root,'src',folder))) { missing.push(`src/${folder}/`); continue; }
    for (const name of topLevelFiles(path.join(root,'src',folder))) if (name.endsWith('.ts')) add(`src/${folder}/${name}`);
  }
  for (const name of spec.fixtures) add(`fixtures/${name}.ts`);
  for (const name of spec.tests) add(`test/${name}.test.ts`);
  for (const relative of spec.extraSources) add(relative);
  if (spec.unityPackage) {
    const base = path.join(root,spec.unityPackage);
    if (!directory(base)) missing.push(`${spec.unityPackage}/`);
    else for (const file of walk(base)) files[`${spec.unityPackage}/${posix(path.relative(base,file))}`] = sha256(readFileSync(file));
  }
  const sorted = Object.fromEntries(Object.entries(files).sort(([a],[b]) => codePointCompare(a,b)));
  return { files:sorted, sourceRevision:sha256(packagingInventoryJson(sorted)), missing:missing.sort() };
}

/** The dist files package-portable.py copies into host/: CORE top-level .js/.d.ts (cli only for portable), fixtures, tests, extras. */
export function packagedOutput(spec: PackageSpec = PORTABLE_PACKAGE_SPEC): (relative: string) => boolean {
  if (spec.declaredOutputs) { const outputs = new Set(spec.declaredOutputs); return relative => outputs.has(relative); }
  const extras = new Set(spec.extraSources.flatMap(x => [`dist/${x.replace(/\.ts$/,'.js')}`,`dist/${x.replace(/\.ts$/,'.d.ts')}`]));
  const fixtures = new Set(spec.fixtures.flatMap(x => [`dist/fixtures/${x}.js`,`dist/fixtures/${x}.d.ts`]));
  const tests = new Set(spec.tests.map(x => `dist/test/${x}.test.js`));
  return relative => {
    if (extras.has(relative) || fixtures.has(relative) || tests.has(relative)) return true;
    const parts = relative.split('/');
    if (parts.length !== 4 || parts[0] !== 'dist' || parts[1] !== 'src' || !spec.coreFolders.includes(parts[2]!)) return false;
    const name = parts[3]!;
    if (!name.endsWith('.js') && !name.endsWith('.d.ts')) return false;
    return parts[2] === 'portable' || (name !== 'cli.js' && name !== 'cli.d.ts');
  };
}
function presentOutputs(root: string, spec: PackageSpec): string[] {
  if (spec.declaredOutputs) return spec.declaredOutputs.filter(x => regularFile(path.join(root,x))).sort();
  const keep = packagedOutput(spec), candidates = [
    ...spec.coreFolders.flatMap(folder => topLevelFiles(path.join(root,'dist/src',folder)).map(name => `dist/src/${folder}/${name}`)),
    ...topLevelFiles(path.join(root,'dist/fixtures')).map(name => `dist/fixtures/${name}`),
    ...topLevelFiles(path.join(root,'dist/test')).map(name => `dist/test/${name}`),
    ...spec.extraSources.flatMap(x => [`dist/${x.replace(/\.ts$/,'.js')}`,`dist/${x.replace(/\.ts$/,'.d.ts')}`]).filter(x => regularFile(path.join(root,x))),
  ];
  return [...new Set(candidates)].filter(keep).sort();
}

export interface FrozenReleaseIdentity {
  kind: 'frozen-historical-distribution'; version: string; archive: string | null; archiveSha256: string | null; manifestSha256: string | null;
  sourceRevision: string | null; recordedMetadataOnly: true; matchesWorkingTreeSource: boolean; note: string;
}
function frozenRelease(root: string, workingTreeRevision: string): FrozenReleaseIdentity | null {
  const file = path.join(root,'releases',RELEASE_VERSION,'artifact.json');
  if (!regularFile(file)) return null;
  let value: Record<string,unknown>;
  try { value = JSON.parse(readFileSync(file,'utf8')) as Record<string,unknown>; } catch { return null; }
  const str = (key: string): string | null => typeof value[key] === 'string' ? value[key] as string : null;
  const matches = str('sourceRevision') === workingTreeRevision;
  return { kind:'frozen-historical-distribution',version:str('version') ?? RELEASE_VERSION,archive:str('archive'),archiveSha256:str('archiveSha256'),manifestSha256:str('manifestSha256'),
    sourceRevision:str('sourceRevision'),recordedMetadataOnly:true,matchesWorkingTreeSource:matches,
    note:matches ? 'Recorded source inventory equals the working tree; archive bytes are not re-hashed and dist parity is checked separately.'
      : 'Frozen archive was built from a different source inventory. Do not assume it contains later working-tree fixes; it is historical, not corrupt.' };
}

export interface IdentityReport {
  schemaVersion: typeof IDENTITY_SCHEMA_VERSION; repositoryPackageVersion: string | null; portableReleaseVersion: typeof RELEASE_VERSION; versionLabels: string;
  workingTree: { kind: 'source-inventory-digest'; sourceRevision: string; files: number; missingSources: string[]; note: string };
  build: { kind: 'dist-output-digest'; outputsExpected: number; outputsPresent: number; missingOutputs: string[]; buildDigest: string;
    parity: 'not-verified-by-this-command'; verifyWith: string };
  frozenRelease: FrozenReleaseIdentity | null;
  readOnly: true; storageInitialized: false; unityInvoked: false; modelsInvoked: false; executionAuthorized: false;
}
/** Fast read-only report: hashes files only. It never compiles, so it cannot by itself establish source/build parity. */
export function identityReport(root: string, spec: PackageSpec = PORTABLE_PACKAGE_SPEC): IdentityReport {
  spec = resolveSpec(realpathSync(root),spec);
  const real = realpathSync(root), inventory = sourceInventory(real,spec), keep = packagedOutput(spec);
  let repositoryPackageVersion: string | null = null;
  try { const v = (JSON.parse(readFileSync(path.join(real,'package.json'),'utf8')) as { version?: unknown }).version; repositoryPackageVersion = typeof v === 'string' ? v : null; } catch { /* Unknown stays null. */ }
  const expected = [...new Set(Object.keys(inventory.files).filter(x => x.endsWith('.ts') && !x.startsWith('unity/'))
    .flatMap(x => [`dist/${x.replace(/\.ts$/,'.js')}`,`dist/${x.replace(/\.ts$/,'.d.ts')}`]).filter(keep))].sort();
  const present = presentOutputs(real,spec);
  const build = Object.fromEntries(present.map(x => [x,sha256(readFileSync(path.join(real,x)))]));
  return { schemaVersion:IDENTITY_SCHEMA_VERSION,repositoryPackageVersion,portableReleaseVersion:RELEASE_VERSION,
    versionLabels:'Labels only: the repository package and the portable/UPM release versions intentionally differ and identify neither source nor build bytes.',
    workingTree:{ kind:'source-inventory-digest',sourceRevision:inventory.sourceRevision,files:Object.keys(inventory.files).length,missingSources:inventory.missing,
      note:'Digest of the current working-tree packaging inventory; not a Git commit.' },
    build:{ kind:'dist-output-digest',outputsExpected:expected.length,outputsPresent:present.length,missingOutputs:expected.filter(x => !present.includes(x)),
      buildDigest:sha256(canonicalJson(build)),parity:'not-verified-by-this-command',verifyWith:'node scripts/verify-portable-identity.mjs <repository-root>' },
    frozenRelease:frozenRelease(real,inventory.sourceRevision),
    readOnly:true,storageInitialized:false,unityInvoked:false,modelsInvoked:false,executionAuthorized:false };
}

/**
 * Compiles the project's tsconfig in memory; the custom writeFile keeps every output off disk. Resolution is anchored to the
 * requested root, never the caller's cwd: the absolute config path sets `configFilePath` (so automatic `@types` roots resolve
 * from the project), and the compiler host reports the root as its current directory, matching `tsc -p` run from that root.
 */
export function compileInMemory(root: string, ts: TypeScriptApi, declaredInputs?: readonly string[]): { outputs: Map<string,string>; diagnostics: string[]; inputs: number } {
  const real = realpathSync(root), message = (d: { messageText: string | import('typescript').DiagnosticMessageChain }): string => ts.flattenDiagnosticMessageText(d.messageText,'\n');
  const configFile = path.join(real,'tsconfig.json');
  const config = ts.readConfigFile(configFile,ts.sys.readFile);
  if (config.error) return { outputs:new Map(),diagnostics:[message(config.error)],inputs:0 };
  const parsed = ts.parseJsonConfigFileContent(config.config,ts.sys,real,undefined,configFile);
  const host = ts.createCompilerHost(parsed.options);
  host.getCurrentDirectory = () => real;
  const rootNames = declaredInputs ? declaredInputs.map(x => path.join(real,x)) : parsed.fileNames;
  const program = ts.createProgram({ rootNames,options:parsed.options,host });
  const outputs = new Map<string,string>();
  const diagnostics = [...parsed.errors,...ts.getPreEmitDiagnostics(program)].map(message);
  const emitted = program.emit(undefined,(fileName,text) => { outputs.set(posix(path.relative(real,fileName)),text); });
  diagnostics.push(...emitted.diagnostics.map(message));
  if (declaredInputs) {
    const allowed = new Set(declaredInputs);
    for (const file of program.getSourceFiles()) {
      const relative = posix(path.relative(real,file.fileName));
      const localDeclaration = file.isDeclarationFile && !relative.startsWith('..') && !relative.startsWith('node_modules/');
      if ((!file.isDeclarationFile || localDeclaration) && !allowed.has(relative)) diagnostics.push(`Undeclared source dependency: ${relative}`);
    }
  }
  return { outputs,diagnostics,inputs:rootNames.length };
}

export interface BuildParity {
  schemaVersion: typeof PARITY_SCHEMA_VERSION; status: 'coherent' | 'mismatch'; compiledInputs: number; comparedOutputs: number;
  diagnostics: number; diagnosticSamples: string[]; missing: string[]; mismatched: string[]; unexpected: string[];
  sourceRevision: string; missingSources: string[]; assurance: string;
}
/**
 * Source/build parity for the packaged output set: a fresh in-memory compile of the current source must byte-match the
 * supplied dist, with no missing or stale extra packaged outputs. This is delivery coherence, not native/harness activation.
 */
export function verifyBuildParity(root: string, ts: TypeScriptApi, spec: PackageSpec = PORTABLE_PACKAGE_SPEC): BuildParity {
  const real = realpathSync(root);
  spec = resolveSpec(real,spec);
  const inventory = sourceInventory(real,spec);
  const keep = packagedOutput(spec);
  const declaredInputs = spec.declaredOutputs ? Object.keys(inventory.files).filter(x => x.endsWith('.ts') && keep(`dist/${x.replace(/\.ts$/,'.js')}`)) : undefined;
  const compiled = compileInMemory(real,ts,declaredInputs);
  const expected = spec.declaredOutputs ? [...spec.declaredOutputs].sort() : [...compiled.outputs.keys()].filter(keep).sort();
  const present = presentOutputs(real,spec);
  const missing = expected.filter(x => !present.includes(x) || !compiled.outputs.has(x)), unexpected = present.filter(x => !compiled.outputs.has(x));
  const mismatched = expected.filter(x => compiled.outputs.has(x) && present.includes(x) && !readFileSync(path.join(real,x)).equals(Buffer.from(compiled.outputs.get(x)!,'utf8')));
  const coherent = !compiled.diagnostics.length && !missing.length && !unexpected.length && !mismatched.length && !inventory.missing.length && expected.length > 0;
  return { schemaVersion:PARITY_SCHEMA_VERSION,status:coherent ? 'coherent' : 'mismatch',compiledInputs:compiled.inputs,comparedOutputs:expected.length,
    diagnostics:compiled.diagnostics.length,diagnosticSamples:compiled.diagnostics.slice(0,5),missing,mismatched,unexpected,
    sourceRevision:inventory.sourceRevision,missingSources:inventory.missing,
    assurance:'Fresh in-memory compile of supplied source versus supplied dist for packaged outputs; not a Git commit, release publication or native acceptance.' };
}
