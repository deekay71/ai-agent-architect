import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync, existsSync, lstatSync, cpSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileInMemory, identityReport, PORTABLE_PACKAGE_SPEC, sourceInventory, verifyBuildParity, type PackageSpec } from '../src/portable/identity.js';
import { portableCommand, portableHelp, PORTABLE_COMMANDS } from '../src/portable/cli.js';
import { bootstrapProject } from '../src/portable/project.js';
import { canonicalJson } from '../src/contracts/canonical.js';

// Isolated temporary fixtures only: no original repository writes, Unity, MCP, model, Queens or Pet access.
const repositoryRoot = fileURLToPath(new URL('../../',import.meta.url));
const cli = path.join(repositoryRoot,'dist/src/cli.js');
const ts = createRequire(import.meta.url)('typescript') as typeof import('typescript');
const sha = (value: string | Buffer): string => createHash('sha256').update(value).digest('hex');
const FROZEN_REVISION = 'c7258fb761f1f6185f41f998a00e45d0118feb7e5c33ae5f7c999ac3488b044e';
const fixtureSpec: PackageSpec = { coreFolders:['portable'],fixtures:[],tests:[],extraSources:[],unityPackage:null };

function tree(root: string): Record<string,string> {
  const result: Record<string,string> = {};
  const walk = (dir: string): void => { for (const name of readdirSync(dir)) { const file = path.join(dir,name), s = lstatSync(file);
    if (s.isDirectory()) walk(file); else result[path.relative(root,file)] = s.isFile() ? sha(readFileSync(file)) : 'non-regular'; } };
  walk(root); return result;
}
function sourceFixture(t: test.TestContext, frozenRevision: string | null = FROZEN_REVISION): string {
  const root = mkdtempSync(path.join(tmpdir(),'architect-identity-'));
  t.after(() => rmSync(root,{ recursive:true,force:true }));
  writeFileSync(path.join(root,'package.json'),JSON.stringify({ name:'fixture',version:'0.1.0',type:'module' }));
  writeFileSync(path.join(root,'tsconfig.json'),JSON.stringify({ compilerOptions:{ target:'ES2023',module:'NodeNext',moduleResolution:'NodeNext',strict:true,
    declaration:true,outDir:'dist',rootDir:'.',skipLibCheck:true,types:[] },include:['src/**/*.ts'] }));
  mkdirSync(path.join(root,'src/portable'),{ recursive:true });
  writeFileSync(path.join(root,'src/portable/a.ts'),'export const answer: number = 1;\n');
  if (frozenRevision) {
    mkdirSync(path.join(root,'releases/0.2.0-preview.1'),{ recursive:true });
    writeFileSync(path.join(root,'releases/0.2.0-preview.1/artifact.json'),JSON.stringify({ version:'0.2.0-preview.1',archive:'architect-brain-0.2.0-preview.1.zip',
      archiveSha256:'993a82c8454801eee9d3c08bfa3d43b4510374f1fd070672530add8dec0bbf2d',manifestSha256:'311d27ce017bd8c2b5f64d5426e878375d33d6eecfff0f0fdae973dc81ac145c',sourceRevision:frozenRevision }));
  }
  return root;
}
/** Simulates a normal `tsc` build of the fixture so parity has a coherent starting point. */
function build(root: string): void {
  const { outputs,diagnostics } = compileInMemory(root,ts); assert.deepEqual(diagnostics,[]);
  for (const [relative,text] of outputs) { mkdirSync(path.dirname(path.join(root,relative)),{ recursive:true }); writeFileSync(path.join(root,relative),text); }
}
const runCli = (...args: string[]) => spawnSync(process.execPath,[cli,...args],{ encoding:'utf8',timeout:30000 });

test('source inventory uses the packaging digest rule: sorted compact JSON of SHA-256 hex, not a Git commit',t => {
  const root = sourceFixture(t), inventory = sourceInventory(root,fixtureSpec);
  const fileHash = sha('export const answer: number = 1;\n');
  assert.deepEqual(inventory.files,{ 'src/portable/a.ts':fileHash });
  assert.equal(inventory.sourceRevision,sha(`{"src/portable/a.ts":"${fileHash}"}`));
  assert.deepEqual(sourceInventory(root,{ ...fixtureSpec,tests:['portable-durability'] }).missing,['test/portable-durability.test.ts']);
});

test('identity report is read-only and separates working-tree, build and frozen historical identities',t => {
  const root = sourceFixture(t), before = tree(root), report = identityReport(root,fixtureSpec);
  assert.deepEqual(tree(root),before); assert.equal(existsSync(path.join(root,'.architect')),false);
  assert.equal(report.repositoryPackageVersion,'0.1.0'); assert.equal(report.portableReleaseVersion,'0.2.0-preview.1');
  assert.equal(report.workingTree.kind,'source-inventory-digest'); assert.match(report.workingTree.note,/not a Git commit/);
  assert.equal(report.build.parity,'not-verified-by-this-command'); assert.deepEqual(report.build.missingOutputs,['dist/src/portable/a.d.ts','dist/src/portable/a.js']);
  assert.equal(report.frozenRelease!.kind,'frozen-historical-distribution'); assert.equal(report.frozenRelease!.sourceRevision,FROZEN_REVISION);
  assert.equal(report.frozenRelease!.matchesWorkingTreeSource,false); assert.match(report.frozenRelease!.note,/Do not assume it contains later working-tree fixes/);
  assert.equal(report.readOnly,true); assert.equal(report.storageInitialized,false); assert.equal(report.unityInvoked,false);
  assert.equal(report.modelsInvoked,false); assert.equal(report.executionAuthorized,false);
  build(root); assert.deepEqual(identityReport(root,fixtureSpec).build.missingOutputs,[]);
});

test('frozen match is computed from recorded inventory, never assumed from the version label',t => {
  const probe = sourceFixture(t,null), revision = sourceInventory(probe,fixtureSpec).sourceRevision;
  const root = sourceFixture(t,revision);
  assert.equal(identityReport(root,fixtureSpec).frozenRelease!.matchesWorkingTreeSource,true);
  assert.equal(identityReport(sourceFixture(t,null),fixtureSpec).frozenRelease,null);
});

test('fresh-compile parity accepts a coherent build and rejects stale, missing, extra and non-compiling states',t => {
  const root = sourceFixture(t); build(root);
  const before = tree(root), coherent = verifyBuildParity(root,ts,fixtureSpec);
  assert.deepEqual(tree(root),before,'parity check must not write');
  assert.equal(coherent.status,'coherent'); assert.ok(coherent.comparedOutputs >= 2); assert.deepEqual([coherent.missing,coherent.mismatched,coherent.unexpected],[[],[],[]]);
  const source = path.join(root,'src/portable/a.ts'), original = readFileSync(source,'utf8');
  writeFileSync(source,'export const answer: number = 2;\n');
  const stale = verifyBuildParity(root,ts,fixtureSpec);
  assert.equal(stale.status,'mismatch'); assert.ok(stale.mismatched.includes('dist/src/portable/a.js'));
  assert.notEqual(stale.sourceRevision,coherent.sourceRevision);
  writeFileSync(source,original); assert.equal(verifyBuildParity(root,ts,fixtureSpec).status,'coherent');
  rmSync(path.join(root,'dist/src/portable/a.d.ts'));
  const missing = verifyBuildParity(root,ts,fixtureSpec); assert.equal(missing.status,'mismatch'); assert.deepEqual(missing.missing,['dist/src/portable/a.d.ts']);
  build(root); writeFileSync(path.join(root,'dist/src/portable/removed.js'),'export const old = 1;\n');
  const extra = verifyBuildParity(root,ts,fixtureSpec); assert.equal(extra.status,'mismatch'); assert.deepEqual(extra.unexpected,['dist/src/portable/removed.js']);
  rmSync(path.join(root,'dist/src/portable/removed.js')); writeFileSync(source,'export const answer: number = "not a number";\n');
  const broken = verifyBuildParity(root,ts,fixtureSpec); assert.equal(broken.status,'mismatch'); assert.ok(broken.diagnostics > 0);
});

test('packaging inventory mirrors the identity spec, includes durability coverage and requires parity before packaging',() => {
  const packager = readFileSync(path.join(repositoryRoot,'scripts/package-portable.py'),'utf8');
  const list = (name: string): string[] => [...(new RegExp(`^${name}=\\[([^\\]]*)\\]`,'m').exec(packager)?.[1] ?? '').matchAll(/'([^']+)'/g)].map(x => x[1]!);
  assert.deepEqual(list('TESTS'),PORTABLE_PACKAGE_SPEC.tests); assert.deepEqual(list('FIXTURES'),PORTABLE_PACKAGE_SPEC.fixtures); assert.deepEqual(list('CORE'),PORTABLE_PACKAGE_SPEC.coreFolders);
  assert.ok(PORTABLE_PACKAGE_SPEC.tests.includes('portable-durability'));
  assert.match(packager,/parity=build_parity\(build,node\)\n\s+out\.mkdir/,'parity must run before any output is created');
  assert.match(packager,/BUILD_IDENTITY\.json/);
  const validator = readFileSync(path.join(repositoryRoot,'scripts/validate-portable-distribution.py'),'utf8');
  assert.match(validator,/verify-portable-identity\.mjs/); assert.match(validator,/BUILD_IDENTITY\.json/);
});

test('portable help is static, read-only and grants no execution authority',async t => {
  const help = portableHelp();
  assert.equal(help.executionAuthorized,false); assert.equal(help.unityInvoked,false); assert.equal(help.modelsInvoked,false);
  assert.deepEqual(Object.keys(help.commands).sort(),[...PORTABLE_COMMANDS].sort());
  await assert.rejects(portableCommand(['help','extra']),/PORTABLE_CLI_ARGS/);
  const cwd = mkdtempSync(path.join(tmpdir(),'architect-help-')); t.after(() => rmSync(cwd,{ recursive:true,force:true }));
  for (const args of [['portable'],['portable','help'],['portable','--help']]) {
    const run = spawnSync(process.execPath,[cli,...args],{ encoding:'utf8',timeout:30000,cwd });
    assert.equal(run.status,0,run.stderr); assert.deepEqual(JSON.parse(run.stdout),help);
  }
  assert.deepEqual(readdirSync(cwd),[],'help must not create files in the working directory');
});

test('root CLI routes the portable namespace and identity while preserving legacy commands',t => {
  const help = runCli('--help'); assert.equal(help.status,0,help.stderr);
  const commands = JSON.parse(help.stdout).commands as string[];
  for (const expected of ['demo [--tamper]','contracts','identity','portable help']) assert.ok(commands.includes(expected),expected);
  const contracts = runCli('contracts'); assert.equal(contracts.status,0); assert.ok((JSON.parse(contracts.stdout).contracts as string[]).includes('TaskSpec'));
  const portableHelp = runCli('portable','help'); assert.equal(portableHelp.status,0); assert.equal(JSON.parse(portableHelp.stdout).executionAuthorized,false);

  const project = mkdtempSync(path.join(tmpdir(),'architect-route-')); t.after(() => rmSync(project,{ recursive:true,force:true }));
  for (const name of ['Assets','Packages','ProjectSettings']) mkdirSync(path.join(project,name));
  writeFileSync(path.join(project,'Packages/manifest.json'),'{"dependencies":{}}'); writeFileSync(path.join(project,'ProjectSettings/ProjectVersion.txt'),'m_EditorVersion: 6000.0.84f1\n');
  bootstrapProject(project);
  const status = runCli('portable','status','--project',project); assert.equal(status.status,0,status.stderr);
  const parsed = JSON.parse(status.stdout); assert.equal(parsed.executionAuthorized,false); assert.equal(parsed.mcpBinding,'not-verified-by-this-command');
  assert.equal(existsSync(path.join(project,'.architect/data')),false);
  const bad = runCli('portable','execute','--project',project); assert.equal(bad.status,1); assert.equal(JSON.parse(bad.stdout).dispatchAuthorized,false);

  const identity = runCli('identity'); assert.equal(identity.status,0,identity.stderr);
  const report = JSON.parse(identity.stdout);
  assert.equal(report.repositoryPackageVersion,'0.1.0'); assert.equal(report.portableReleaseVersion,'0.2.0-preview.1'); assert.equal(report.executionAuthorized,false);
  assert.equal(report.build.parity,'not-verified-by-this-command');
  // Today's source differs from the frozen 06/10 archive inventory; the report must not imply it carries later fixes.
  if (report.frozenRelease) { assert.equal(report.frozenRelease.sourceRevision,FROZEN_REVISION); assert.equal(report.frozenRelease.matchesWorkingTreeSource,false); }
});

test('the actual parity verifier gives the same verdict for one absolute build root from any caller cwd',t => {
  // Isolated copy of this repository's compiled inputs with its installed dependencies linked read-only; never the original.
  const target = mkdtempSync(path.join(tmpdir(),'architect-parity-root-')), elsewhere = mkdtempSync(path.join(tmpdir(),'architect-unrelated-cwd-'));
  t.after(() => { rmSync(target,{ recursive:true,force:true }); rmSync(elsewhere,{ recursive:true,force:true }); });
  for (const relative of ['src','test','fixtures','unity/packages/com.architect.brain-unity','package.json','tsconfig.json']) {
    mkdirSync(path.dirname(path.join(target,relative)),{ recursive:true });
    cpSync(path.join(repositoryRoot,relative),path.join(target,relative),{ recursive:true });
  }
  symlinkSync(path.join(repositoryRoot,'node_modules'),path.join(target,'node_modules'),'dir');
  build(target);
  const verifier = path.join(repositoryRoot,'scripts/verify-portable-identity.mjs');
  const cwds = { root:target,subdirectory:path.join(target,'src'),unrelated:elsewhere };
  const verify = (cwd: string) => { const run = spawnSync(process.execPath,[verifier,target],{ encoding:'utf8',timeout:180000,cwd });
    return { code:run.status,result:JSON.parse(run.stdout) as Record<string,unknown> & { mismatched:string[]; missing:string[]; unexpected:string[] } }; };

  const before = tree(target), revisions = new Set<unknown>();
  for (const [name,cwd] of Object.entries(cwds)) {
    const { code,result } = verify(cwd);
    assert.equal(code,0,`${name}: ${JSON.stringify(result.diagnosticSamples ?? result.error)}`);
    assert.equal(result.status,'coherent',name); assert.equal(result.diagnostics,0,name); assert.equal(result.verifierMatched,true,name);
    assert.deepEqual([result.missing,result.mismatched,result.unexpected],[[],[],[]],name);
    assert.equal(result.writes,false); assert.equal(result.unityInvoked,false); assert.equal(result.modelsInvoked,false); assert.equal(result.executionAuthorized,false);
    revisions.add(result.sourceRevision);
  }
  assert.equal(revisions.size,1,'same source revision from every cwd');
  assert.deepEqual(tree(target),before,'verifier must not write into the target'); assert.deepEqual(readdirSync(elsewhere),[],'nor into the caller cwd');

  // A genuinely modified packaged output is rejected from every cwd for byte reasons, not cwd-dependent diagnostics.
  const output = path.join(target,'dist/src/portable/templates.js'), original = readFileSync(output);
  writeFileSync(output,Buffer.concat([original,Buffer.from('\n// stale fixture fault\n')]));
  for (const [name,cwd] of Object.entries(cwds)) {
    const { code,result } = verify(cwd);
    assert.equal(code,1,name); assert.equal(result.status,'mismatch',name); assert.equal(result.diagnostics,0,name);
    assert.deepEqual(result.mismatched,['dist/src/portable/templates.js'],name); assert.ok(revisions.has(result.sourceRevision),name);
  }
  writeFileSync(output,original);

  // Changed source with an old build is stale even when checked from an unrelated cwd.
  const source = path.join(target,'src/portable/templates.ts'), sourceBytes = readFileSync(source);
  writeFileSync(source,Buffer.concat([sourceBytes,Buffer.from('\nexport const staleFixtureMarker = 1;\n')]));
  const stale = verify(elsewhere);
  assert.equal(stale.code,1); assert.equal(stale.result.status,'mismatch'); assert.equal(stale.result.diagnostics,0);
  assert.ok(stale.result.mismatched.includes('dist/src/portable/templates.js')); assert.equal(revisions.has(stale.result.sourceRevision),false);
  writeFileSync(source,sourceBytes);
  assert.deepEqual(tree(target),before,'only deliberate, restored fixture faults touched the target');
});

// ---- U1: Unicode inventory codec parity with package-portable.py; H1 entrypoint help; H2 BUILD_IDENTITY compatibility ----
const python = process.env.PYTHON ?? 'python3';
const pythonEnv = { ...process.env,PYTHONDONTWRITEBYTECODE:'1' };
function runPython(code: string, args: string[], cwd?: string): unknown {
  const run = spawnSync(python,['-c',code,...args],{ encoding:'utf8',timeout:600000,maxBuffer:16*1024*1024,env:pythonEnv,...(cwd ? { cwd } : {}) });
  assert.equal(run.status,0,run.stderr); return JSON.parse(run.stdout);
}
/** Verbatim packager inventory expression for one core folder: key, SHA-256 hex, json.dumps defaults, UTF-8 encode. */
const PYTHON_INVENTORY = [
  'import hashlib,json,pathlib,sys',
  'r=pathlib.Path(sys.argv[1]);files={}',
  "for p in sorted((r/'src'/'portable').glob('*.ts')): files['src/portable/'+p.name]=hashlib.sha256(p.read_bytes()).hexdigest()",
  "encoded=json.dumps(files,sort_keys=True,separators=(',',':'))",
  "print(json.dumps({'revision':hashlib.sha256(encoded.encode()).hexdigest(),'files':files,'order':sorted(files),'asciiOnly':encoded.isascii()}))",
].join('\n');

test('source inventory revision equals the Python packager codec for ASCII, BMP and non-BMP names, contents and key order',t => {
  const cases: Record<string,Record<string,string>> = {
    ascii:{ 'a.ts':'export const a = 1;\n','b-c.ts':'export const b = "quote \\" and slash /";\n' },
    bmpVietnamese:{ 'a.ts':'export const a = 1;\n','động.ts':'export const tên = "Trò chơi xếp hình";\n','é.ts':'export const café = "é";\n' },
    // UTF-16 order puts 𝒜 (U+1D49C) and 😀 (U+1F600) before ﬀ (U+FB00); code-point order puts ﬀ first.
    nonBmpOrder:{ 'ﬀ.ts':'export const ligature = "ﬀ";\n','𝒜.ts':'export const script = "𝒜";\n','😀.ts':'export const face = "😀";\n','z.ts':'export const z = 1;\n' },
  };
  for (const [name,files] of Object.entries(cases)) {
    const root = mkdtempSync(path.join(tmpdir(),`architect-codec-${name}-`)); t.after(() => rmSync(root,{ recursive:true,force:true }));
    mkdirSync(path.join(root,'src/portable'),{ recursive:true });
    for (const [file,text] of Object.entries(files)) writeFileSync(path.join(root,'src/portable',file),text);
    const before = tree(root), inventory = sourceInventory(root,fixtureSpec);
    const py = runPython(PYTHON_INVENTORY,[root]) as { revision:string; files:Record<string,string>; order:string[]; asciiOnly:boolean };
    assert.deepEqual(inventory.files,py.files,name); assert.deepEqual(Object.keys(inventory.files),py.order,`${name}: code-point key order`);
    assert.equal(inventory.sourceRevision,py.revision,`${name}: same revision as package-portable.py`); assert.equal(py.asciiOnly,true);
    assert.deepEqual(tree(root),before,`${name}: inventory is read-only`);
    if (name === 'ascii') assert.equal(inventory.sourceRevision,sha(canonicalJson(inventory.files)),'ASCII inventories keep their previous digest');
    if (name === 'nonBmpOrder') assert.notDeepEqual(Object.keys(inventory.files),[...Object.keys(inventory.files)].sort(),'case must exercise UTF-16 versus code-point order');
  }
});

test('Unicode source keeps read-only identity and coherent parity; stale or missing Unicode outputs are rejected',t => {
  const root = sourceFixture(t); writeFileSync(path.join(root,'src/portable/động.ts'),'export const portableUnicodeFixture = "động";\n');
  build(root);
  const before = tree(root), report = identityReport(root,fixtureSpec), parity = verifyBuildParity(root,ts,fixtureSpec);
  assert.deepEqual(tree(root),before); assert.deepEqual(report.build.missingOutputs,[]); assert.equal(report.workingTree.sourceRevision,parity.sourceRevision);
  assert.equal(parity.status,'coherent'); assert.equal(parity.diagnostics,0); assert.ok(parity.comparedOutputs >= 4);
  const output = path.join(root,'dist/src/portable/động.js'), bytes = readFileSync(output);
  writeFileSync(output,Buffer.concat([bytes,Buffer.from('// stale\n')]));
  assert.deepEqual(verifyBuildParity(root,ts,fixtureSpec).mismatched,['dist/src/portable/động.js']);
  writeFileSync(output,bytes); rmSync(path.join(root,'dist/src/portable/động.d.ts'));
  const incomplete = verifyBuildParity(root,ts,fixtureSpec); assert.equal(incomplete.status,'mismatch'); assert.deepEqual(incomplete.missing,['dist/src/portable/động.d.ts']);
});

test('help names the actual entrypoint and SETUP location for repository and generated distribution callers',() => {
  const repository = portableHelp(), distribution = portableHelp('distribution');
  assert.equal(repository.entrypoint,'repository'); assert.match(repository.usage,/^node dist\/src\/cli\.js portable <command>/);
  assert.equal(repository.setup,'portable/SETUP.md'); assert.ok(existsSync(path.join(repositoryRoot,repository.setup)));
  assert.equal(distribution.entrypoint,'distribution'); assert.match(distribution.usage,/host\/bin\/architect\.mjs <command> --project/);
  assert.doesNotMatch(distribution.usage,/ portable /); assert.equal(distribution.setup,'SETUP.md');
  for (const help of [repository,distribution]) { assert.equal(help.executionAuthorized,false); assert.deepEqual(Object.keys(help.commands).sort(),[...PORTABLE_COMMANDS].sort()); }
  assert.match(readFileSync(path.join(repositoryRoot,'scripts/package-portable.py'),'utf8'),/portableCommand\(process\.argv\.slice\(2\),\{ entrypoint:'distribution' \}\)/);
});

test('BUILD_IDENTITY validation accepts only the supported schema, release version and complete parity metadata',() => {
  const code = [
    'import importlib.util,json,pathlib,sys',
    'sys.dont_write_bytecode=True',
    "spec=importlib.util.spec_from_file_location('validator',pathlib.Path(sys.argv[1])/'scripts/validate-portable-distribution.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)",
    "rev='a'*64;valid={'schemaVersion':'architect-build-identity/1','version':'0.2.0-preview.1','sourceRevision':rev,'assurance':'offline parity metadata',",
    "  'buildParity':{'status':'coherent','compiledInputs':172,'comparedOutputs':84,'diagnostics':0,'typescriptVersion':'5.9.3'}}",
    "cases={'valid':valid,'schemaV2':{**valid,'schemaVersion':'architect-build-identity/2'},'noSchema':{k:v for k,v in valid.items() if k!='schemaVersion'},",
    "  'releaseVersion':{**valid,'version':'0.2.0-preview.2'},'missingAssurance':{k:v for k,v in valid.items() if k!='assurance'},'extraField':{**valid,'signedBy':'unauthenticated'},",
    "  'revision':{**valid,'sourceRevision':'b'*64},'parityMismatch':{**valid,'buildParity':{**valid['buildParity'],'status':'mismatch'}},",
    "  'parityIncomplete':{**valid,'buildParity':{'status':'coherent'}},'zeroOutputs':{**valid,'buildParity':{**valid['buildParity'],'comparedOutputs':0}},'notObject':[]}",
    'out={}',
    'for name,case in cases.items():',
    '  try: m.check_build_identity(case,"0.2.0-preview.1",rev);out[name]="accepted"',
    '  except ValueError as e: out[name]=str(e)',
    'print(json.dumps(out))',
  ].join('\n');
  const out = runPython(code,[repositoryRoot]) as Record<string,string>;
  assert.equal(out.valid,'accepted');
  assert.match(out.schemaV2!,/unsupported BUILD_IDENTITY schemaVersion/); assert.match(out.noSchema!,/unsupported BUILD_IDENTITY schemaVersion/);
  assert.match(out.releaseVersion!,/incompatible with release/);
  for (const name of ['missingAssurance','extraField','revision','parityMismatch','parityIncomplete','zeroOutputs','notObject']) assert.notEqual(out[name],'accepted',name);
});

test('actual packager accepts a coherent Unicode-source build from any caller cwd and rejects stale or incomplete builds',t => {
  const target = mkdtempSync(path.join(tmpdir(),'architect-unicode-package-root-')), outputs = mkdtempSync(path.join(tmpdir(),'architect-unicode-package-out-'));
  const elsewhere = mkdtempSync(path.join(tmpdir(),'architect-unicode-unrelated-cwd-'));
  t.after(() => { for (const dir of [target,outputs,elsewhere]) rmSync(dir,{ recursive:true,force:true }); });
  for (const relative of ['src','test','fixtures','portable','scripts','unity/packages/com.architect.brain-unity','package.json','tsconfig.json']) {
    mkdirSync(path.dirname(path.join(target,relative)),{ recursive:true });
    cpSync(path.join(repositoryRoot,relative),path.join(target,relative),{ recursive:true });
  }
  symlinkSync(path.join(repositoryRoot,'node_modules'),path.join(target,'node_modules'),'dir');
  writeFileSync(path.join(target,'src/portable/động.ts'),'export const portableUnicodeFixture = "động";\n');
  // The Unicode fixture is an explicit reviewed input, never an excuse to enumerate undeclared neighbors.
  const payloadPath = path.join(target,'portable/PAYLOAD.json');
  const payload = JSON.parse(readFileSync(payloadPath,'utf8')) as { sourceModules:string[] };
  payload.sourceModules.push('portable/động');
  writeFileSync(payloadPath,JSON.stringify(payload,null,2)+'\n');
  build(target);
  const expectedRevision = sourceInventory(target).sourceRevision, before = tree(target);
  // Policy references come read-only from this repository's docs; nothing is promoted to releases/.
  const driver = [
    'import importlib.util,json,pathlib,sys',
    'sys.dont_write_bytecode=True',
    'r=pathlib.Path(sys.argv[1]);o=pathlib.Path(sys.argv[2]);node=sys.argv[3];policy=pathlib.Path(sys.argv[4])',
    "spec=importlib.util.spec_from_file_location('packager',r/'scripts/package-portable.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)",
    "try: print(json.dumps({'ok':True,'result':m.package(r,policy,o,node)}))",
    "except Exception as e: print(json.dumps({'ok':False,'error':str(e),'outputExists':o.exists()}))",
  ].join('\n');
  const pack = (name: string, cwd: string) => runPython(driver,[target,path.join(outputs,name),process.execPath,repositoryRoot],cwd) as
    { ok:boolean; error?:string; outputExists?:boolean; result?:{ sourceRevision:string; buildParity:string; archive:string } };
  const cwds = { root:target,subdirectory:path.join(target,'src'),unrelated:elsewhere };
  for (const [name,cwd] of Object.entries(cwds)) {
    const packed = pack(name,cwd);
    assert.equal(packed.ok,true,`${name}: ${packed.error}`); assert.equal(packed.result!.sourceRevision,expectedRevision,name); assert.equal(packed.result!.buildParity,'coherent');
    const dist = path.join(outputs,name,'architect-brain-0.2.0-preview.1');
    const inventory = JSON.parse(readFileSync(path.join(dist,'SOURCE_INVENTORY.json'),'utf8'));
    assert.equal(inventory.sourceRevision,expectedRevision); assert.ok('src/portable/động.ts' in inventory.files);
    const identity = JSON.parse(readFileSync(path.join(dist,'BUILD_IDENTITY.json'),'utf8'));
    assert.equal(identity.schemaVersion,'architect-build-identity/1'); assert.equal(identity.sourceRevision,expectedRevision); assert.equal(identity.buildParity.status,'coherent');
    for (const flag of ['help','--help']) {
      const help = spawnSync(process.execPath,[path.join(dist,'host/bin/architect.mjs'),flag],{ encoding:'utf8',timeout:30000,cwd:elsewhere });
      assert.equal(help.status,0,help.stderr); const parsed = JSON.parse(help.stdout);
      assert.equal(parsed.entrypoint,'distribution'); assert.equal(parsed.setup,'SETUP.md'); assert.ok(existsSync(path.join(dist,parsed.setup)));
      assert.equal(parsed.executionAuthorized,false);
    }
  }
  assert.deepEqual(tree(target),before,'packaging reads the build root only'); assert.deepEqual(readdirSync(elsewhere),[],'nor writes the caller cwd');

  const validator = [
    'import importlib.util,json,pathlib,sys',
    'sys.dont_write_bytecode=True',
    "spec=importlib.util.spec_from_file_location('validator',pathlib.Path(sys.argv[2])/'scripts/validate-portable-distribution.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)",
    'print(json.dumps(m.validate(pathlib.Path(sys.argv[1]),pathlib.Path(sys.argv[2]),pathlib.Path(sys.argv[3]),pathlib.Path(sys.argv[4]))))',
  ].join('\n');
  const validated = runPython(validator,[path.join(outputs,'unrelated','architect-brain-0.2.0-preview.1.zip'),target,path.join(outputs,'validation'),process.execPath],elsewhere) as Record<string,unknown>;
  assert.equal(validated.sourceBuildParity,'coherent'); assert.equal(validated.sourceRevision,expectedRevision);
  assert.equal(validated.buildIdentitySchema,'architect-build-identity/1'); assert.equal(validated.distributionHelpEntrypoint,'distribution');

  const output = path.join(target,'dist/src/portable/động.js'), bytes = readFileSync(output);
  writeFileSync(output,Buffer.concat([bytes,Buffer.from('// stale\n')]));
  const stale = pack('stale',elsewhere);
  assert.equal(stale.ok,false); assert.match(stale.error!,/parity preflight failed/); assert.equal(stale.outputExists,false);
  writeFileSync(output,bytes);
  const declaration = path.join(target,'dist/src/portable/động.d.ts'), declarationBytes = readFileSync(declaration); rmSync(declaration);
  const incomplete = pack('incomplete',target);
  assert.equal(incomplete.ok,false); assert.match(incomplete.error!,/parity preflight failed/); assert.equal(incomplete.outputExists,false);
  writeFileSync(declaration,declarationBytes);
  assert.deepEqual(tree(target),before,'only deliberate, restored fixture faults touched the build root');
});
