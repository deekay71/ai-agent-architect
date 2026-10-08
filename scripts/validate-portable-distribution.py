#!/usr/bin/env python3
"""Independent archive/extraction comparison against actual source/build plus fresh CLI fixture."""
import argparse,hashlib,json,stat,subprocess,tarfile,zipfile
from pathlib import Path

def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def run(node,args,cwd=None):
    p=subprocess.run([str(node),*map(str,args)],cwd=cwd,text=True,capture_output=True,timeout=30)
    if p.returncode:raise AssertionError(p.stderr[-4000:])
    return json.loads(p.stdout)

SUPPORTED_BUILD_IDENTITY='architect-build-identity/1'
BUILD_PARITY_FIELDS=('status','compiledInputs','comparedOutputs','diagnostics','typescriptVersion')

def check_build_identity(identity,release_version,inventory_revision):
    """Structural/version compatibility of BUILD_IDENTITY.json only; it is unsigned metadata, not authentication."""
    if not isinstance(identity,dict):raise ValueError('BUILD_IDENTITY must be a JSON object')
    if identity.get('schemaVersion')!=SUPPORTED_BUILD_IDENTITY:raise ValueError('unsupported BUILD_IDENTITY schemaVersion: %r'%identity.get('schemaVersion'))
    if set(identity)!={'schemaVersion','version','sourceRevision','buildParity','assurance'}:raise ValueError('BUILD_IDENTITY fields differ from %s'%SUPPORTED_BUILD_IDENTITY)
    if identity['version']!=release_version:raise ValueError('BUILD_IDENTITY version %r incompatible with release %r'%(identity['version'],release_version))
    if identity['sourceRevision']!=inventory_revision:raise ValueError('BUILD_IDENTITY sourceRevision differs from SOURCE_INVENTORY')
    if not isinstance(identity['assurance'],str) or not identity['assurance'].strip():raise ValueError('BUILD_IDENTITY assurance is required')
    parity=identity['buildParity']
    if not isinstance(parity,dict) or set(parity)!=set(BUILD_PARITY_FIELDS):raise ValueError('BUILD_IDENTITY buildParity fields are incomplete')
    if parity['status']!='coherent' or parity['diagnostics']!=0:raise ValueError('BUILD_IDENTITY parity is not coherent')
    for key in ('compiledInputs','comparedOutputs'):
        if type(parity[key]) is not int or parity[key]<=0:raise ValueError('BUILD_IDENTITY %s must be a positive integer'%key)
    if not isinstance(parity['typescriptVersion'],str) or not parity['typescriptVersion']:raise ValueError('BUILD_IDENTITY typescriptVersion is required')
    return identity

def validate(archive,build,output,node):
    if output.exists():raise ValueError('validation output must be new')
    output.mkdir(parents=True)
    with zipfile.ZipFile(archive) as z:
        names=z.namelist();assert len(names)==len(set(names));assert z.testzip() is None
        roots=set()
        for info in z.infolist():
            p=Path(info.filename);assert not p.is_absolute() and '..' not in p.parts
            assert not stat.S_ISLNK(info.external_attr>>16);roots.add(p.parts[0])
        assert len(roots)==1;z.extractall(output/'extracted')
    root=output/'extracted'/next(iter(roots));manifest=json.loads((root/'MANIFEST.json').read_text())
    expected={x['path'] for x in manifest['files']}|{'MANIFEST.json'}
    actual={str(p.relative_to(root)) for p in root.rglob('*') if p.is_file()};assert actual==expected
    for item in manifest['files']:
        p=root/item['path'];assert p.stat().st_size==item['bytes'] and sha(p)==item['sha256']
    # Independent membership check: re-sealing a manifest cannot admit undeclared source or host modules.
    payload=json.loads((build/'portable/PAYLOAD.json').read_text())
    inventory=json.loads((root/'SOURCE_INVENTORY.json').read_text())
    declared={'src/'+module+'.ts' for module in payload['sourceModules']}
    declared|={'fixtures/'+name+'.ts' for name in payload['fixtures']}
    declared|={'test/'+name+'.test.ts' for name in payload['tests']}
    declared|={'unity/packages/com.architect.brain-unity/'+name for name in payload['unityPackageFiles']}
    declared|={'portable/PAYLOAD.json','scripts/architect.mjs'}
    assert set(inventory['files'])==declared
    assert {str(p.relative_to(root/'source')) for p in (root/'source').rglob('*') if p.is_file()}==declared-{
        name for name in declared if name.startswith('unity/packages/')}
    for relative,content_hash in inventory['files'].items():assert sha(build/relative)==content_hash
    assert inventory['sourceRevision']==hashlib.sha256(json.dumps(inventory['files'],sort_keys=True,separators=(',',':')).encode()).hexdigest()
    expected_host={'host/src/'+module+extension for module in payload['sourceModules'] if module not in payload['inspectionOnlyModules'] for extension in ('.js','.d.ts')}
    assert {path for path in actual if path.startswith('host/src/')}==expected_host
    assert {path for path in actual if path.startswith('host/test/')}=={'host/test/'+name+'.test.js' for name in payload['tests']}
    expected_fixtures={'host/fixtures/'+name+extension for name in payload['fixtures'] for extension in ('.js','.d.ts')}
    expected_fixtures|={'host/fixtures/'+name for name in payload['fixtureResourceFiles']}
    assert {path for path in actual if path.startswith('host/fixtures/')}==expected_fixtures
    assert {path for path in actual if path.startswith('policy/')}=={'policy/'+name for name in payload['policyFiles']}
    assert {path for path in actual if path.startswith('unity-package/com.architect.brain-unity/')}=={
        'unity-package/com.architect.brain-unity/'+name for name in payload['unityPackageFiles']}
    expected_entry=(build/'scripts/architect.mjs').read_text().replace(
        "'../dist/src/portable/cli.js'", "'../src/portable/cli.js'").replace(
        'portableCommand(process.argv.slice(2))', "portableCommand(process.argv.slice(2),{ entrypoint:'distribution' })")
    assert (root/'host/bin/architect.mjs').read_text()==expected_entry
    comparisons=0
    mappings=[('source',''),('host/src','dist/src'),('host/fixtures','dist/fixtures'),('host/test','dist/test'),('unity-package/com.architect.brain-unity','unity/packages/com.architect.brain-unity')]
    for target,origin in mappings:
        for p in (root/target).rglob('*'):
            if p.is_file():
                relative=p.relative_to(root/target)
                if target=='host/fixtures' and relative.parts[0]=='skill-catalog':other=build/'fixtures'/relative
                else:other=build/origin/relative
                assert p.read_bytes()==other.read_bytes(),str(relative);comparisons+=1
    with tarfile.open(root/'unity-adapter-0.2.0-preview.1.tgz') as t:
        files=[m for m in t.getmembers() if m.isfile()];assert len({m.name for m in files})==len(files)
        for m in files:
            assert not m.issym() and '..' not in Path(m.name).parts
            assert t.extractfile(m).read()==(root/'unity-package/com.architect.brain-unity'/Path(m.name).relative_to('package')).read_bytes();comparisons+=1
    asmdef=json.loads((root/'unity-package/com.architect.brain-unity/Editor/Architect.Brain.Unity.Editor.asmdef').read_text())
    assert asmdef['includePlatforms']==['Editor']
    guid_lines=[]
    for p in (root/'unity-package').rglob('*.meta'):
        guid_lines += [line for line in p.read_text().splitlines() if line.startswith('guid: ')]
    assert len(guid_lines)==len(set(guid_lines))
    verified=run(node,[root/'verify-distribution.mjs'])
    # Payload==build alone does not prove build==source; rerun the read-only fresh-compile parity on the supplied build root.
    parity_run=subprocess.run([str(node),str(build/'scripts/verify-portable-identity.mjs'),str(build)],text=True,capture_output=True,timeout=600)
    parity=json.loads(parity_run.stdout);assert parity_run.returncode==0 and parity['status']=='coherent',parity_run.stdout[-4000:]
    source_inventory=json.loads((root/'SOURCE_INVENTORY.json').read_text());inventory_revision=source_inventory['sourceRevision']
    assert parity['sourceRevision']==inventory_revision and source_inventory['version']==manifest['version']
    build_identity_path=root/'BUILD_IDENTITY.json';assert build_identity_path.is_file(),'archive lacks BUILD_IDENTITY.json (pre-parity distribution)'
    build_identity=check_build_identity(json.loads(build_identity_path.read_text()),manifest['version'],inventory_revision)
    help_text=run(node,[root/'host/bin/architect.mjs','help'])
    assert help_text['entrypoint']=='distribution' and help_text['setup']=='SETUP.md' and (root/help_text['setup']).is_file()
    assert 'host/bin/architect.mjs <command>' in help_text['usage'] and ' portable ' not in help_text['usage'] and not help_text['executionAuthorized']
    fixture=output/'fresh-project';fixture.mkdir()
    for name in ('Assets','Packages','ProjectSettings'): (fixture/name).mkdir()
    preserved={'Assets/original.txt':'untouched source','Packages/manifest.json':'{"dependencies":{}}','ProjectSettings/ProjectVersion.txt':'m_EditorVersion: 6000.0.84f1\n','AGENTS.md':'Existing project instructions.\n','.agents/skills/existing/SKILL.md':'Existing local skill.\n'}
    for rel,text in preserved.items():p=fixture/rel;p.parent.mkdir(parents=True,exist_ok=True);p.write_text(text)
    before={rel:sha(fixture/rel) for rel in preserved}
    cli=root/'host/bin/architect.mjs'
    boot=run(node,[cli,'bootstrap','--project',fixture]);repeat=run(node,[cli,'bootstrap','--project',fixture]);assert not repeat['created']
    assert before=={rel:sha(fixture/rel) for rel in preserved};assert not (fixture/'.architect/data').exists()
    starter=(fixture/'.architect/SESSION_START.md').read_text();assert '<distribution>/host/bin/architect.mjs' in starter
    status=run(node,[cli,'status','--project',fixture]);assert status['mcpBinding']=='not-verified-by-this-command' and status['modelExecution']=='disabled'
    assert not (fixture/'.architect/data').exists()
    empty=run(node,[cli,'resume','--project',fixture]);assert empty['state']=='empty'
    (fixture/'.architect/plans/fixture-evidence.md').write_text('Offline compile fixture passed; Android build was not run.')
    one=run(node,[root/'host/fixtures/portable-session.js','one',fixture]);two=run(node,[root/'host/fixtures/portable-session.js','two',fixture])
    assert one['pid']!=two['pid'] and two['contextStatus']=='ready' and one['claimId'] in two['resourceRefs'] and not two['executionAuthorized']
    # Verify a deliberate corruption is rejected without modifying the reviewed artifact.
    target=root/'unity-package/com.architect.brain-unity/Editor/BrainObservation.cs';original=target.read_bytes();target.write_bytes(original+b'\n// controlled-corruption\n')
    corrupt=subprocess.run([str(node),str(root/'verify-distribution.mjs')],text=True,capture_output=True,timeout=10);assert corrupt.returncode!=0 and 'BrainObservation.cs' in corrupt.stderr
    target.write_bytes(original);run(node,[root/'verify-distribution.mjs'])
    result={'version':manifest['version'],'archiveSha256':sha(archive),'manifestSha256':sha(root/'MANIFEST.json'),'extractedFiles':len(actual),'directSourceBuildComparisons':comparisons,
      'inventoryConsistent':True,'tgzPayloadCompared':True,'sourceBuildParity':'coherent','sourceRevision':inventory_revision,'buildIdentitySchema':build_identity['schemaVersion'],'distributionHelpEntrypoint':help_text['entrypoint'],'freshBootstrapPreservedFiles':len(before),'bootstrapCreated':len(boot['created']),'repeatCreated':0,
      'freshSessionPids':[one['pid'],two['pid']],'knowledgeContextStatus':two['contextStatus'],'corruptionRejected':True,'unityInvoked':False,'modelsInvoked':False,
      'extractedRoot':str(root),'newProjectFixture':str(fixture),'assurance':'offline-extraction-and-synthetic-continuity; not native acceptance'}
    (output/'validation.json').write_text(json.dumps(result,indent=2)+'\n');return result

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--archive',type=Path,required=True);p.add_argument('--build-root',type=Path,required=True);p.add_argument('--output',type=Path,required=True);p.add_argument('--node',type=Path,required=True)
    a=p.parse_args();print(json.dumps(validate(a.archive.resolve(),a.build_root.resolve(),a.output.resolve(),a.node.resolve())))
