#!/usr/bin/env python3
"""Package an explicit source payload; no install, Editor, provider, git or network action."""
import argparse, gzip, hashlib, json, re, shutil, subprocess, tarfile, zipfile
from pathlib import Path

VERSION = '0.2.0-preview.1'
# Legacy inspection spec for roots without a declaration; this producer always selects PAYLOAD.json.
CORE=['contracts','foundation','context','memory','skills','runtime','portable']
FIXTURES=['contracts','brain-planning','portable-session','runtime-crash-child','runtime-authority']
TESTS=['portable','portable-durability','context','context-memory','context-skills','memory','brain-planning-contracts','runtime-recovery']

def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def copy(source, target):
    if source.is_symlink() or not source.is_file():
        raise ValueError('non-regular source: ' + str(source))
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(source, target)

def load_payload(build):
    checked_file(build, 'portable/PAYLOAD.json')
    payload = json.loads((build / 'portable/PAYLOAD.json').read_text())
    if not isinstance(payload, dict) or payload.get('format') != 'architect-portable-payload/1' or payload.get('version') != VERSION:
        raise ValueError('payload version mismatch')
    keys = ('sourceModules', 'inspectionOnlyModules', 'fixtures', 'tests',
            'fixtureResourceFiles', 'policyFiles', 'unityPackageFiles')
    for key in keys:
        values = payload.get(key)
        if not isinstance(values, list) or any(not isinstance(value, str) for value in values) or len(values) != len(set(values)):
            raise ValueError('invalid payload list: ' + key)
        for value in values:
            if not value or any(not re.fullmatch(r'[^/\\\s\x00-\x1f:]+', part) for part in value.split('/')):
                raise ValueError('invalid payload path')
            if any(part in ('.', '..') for part in Path(value).parts):
                raise ValueError('unsafe payload path')
    if not set(payload['inspectionOnlyModules']) <= set(payload['sourceModules']):
        raise ValueError('inspection module outside declared source')
    if payload.get('hostCliModule') != 'portable/cli' or payload['hostCliModule'] not in payload['sourceModules'] or payload['hostCliModule'] in payload['inspectionOnlyModules']:
        raise ValueError('CLI outside declared source')
    return payload

def checked_file(build, relative):
    source = build / relative
    if source.is_symlink() or not source.is_file() or not source.resolve().is_relative_to(build.resolve()):
        raise ValueError('non-regular source: ' + str(source))
    return source

def declared_inventory(build, payload):
    paths = ['src/' + module + '.ts' for module in payload['sourceModules']]
    paths += ['fixtures/' + name + '.ts' for name in payload['fixtures']]
    paths += ['test/' + name + '.test.ts' for name in payload['tests']]
    paths += ['portable/PAYLOAD.json', 'scripts/architect.mjs']
    paths += ['unity/packages/com.architect.brain-unity/' + name for name in payload['unityPackageFiles']]
    return {relative: sha(checked_file(build, relative)) for relative in paths}

def build_parity(build, node):
    p = subprocess.run([str(node), str(build/'scripts/verify-portable-identity.mjs'), str(build)],
                       text=True, capture_output=True, timeout=600)
    try:
        result = json.loads(p.stdout)
    except json.JSONDecodeError:
        result = {}
    if p.returncode or result.get('status') != 'coherent' or result.get('diagnostics') != 0 or not result.get('verifierMatched'):
        raise ValueError('source/build parity preflight failed; rebuild dist from this exact source: ' + (p.stdout or p.stderr)[-4000:])
    return result

def package(build, policy, out, node='node'):
    payload = load_payload(build)
    inventory_before = declared_inventory(build, payload)
    for relative in payload['fixtureResourceFiles']:
        checked_file(build, 'fixtures/' + relative)
    for relative in payload['policyFiles']:
        checked_file(policy, 'docs/' + relative)
    if out.exists():
        raise ValueError('output must be a new directory')
    parity=build_parity(build,node)
    out.mkdir(parents=True)
    root = out / ('architect-brain-' + VERSION)
    root.mkdir()
    inventory = {}

    def inspected(relative):
        source = build / relative
        copy(source, root / 'source' / relative)
        inventory[relative] = sha(source)

    for module in payload['sourceModules']:
        inspected('src/' + module + '.ts')
        if module not in payload['inspectionOnlyModules']:
            for extension in ('.js', '.d.ts'):
                copy(build / 'dist/src' / (module + extension), root / 'host/src' / (module + extension))
    for name in payload['fixtures']:
        for extension in ('.js', '.d.ts'):
            copy(build / 'dist/fixtures' / (name + extension), root / 'host/fixtures' / (name + extension))
        inspected('fixtures/' + name + '.ts')
    for name in payload['tests']:
        copy(build / 'dist/test' / (name + '.test.js'), root / 'host/test' / (name + '.test.js'))
        inspected('test/' + name + '.test.ts')
    for relative in payload['fixtureResourceFiles']:
        copy(build / 'fixtures' / relative, root / 'host/fixtures' / relative)
    inspected('portable/PAYLOAD.json')
    inspected('scripts/architect.mjs')

    zod = (build / 'node_modules/zod').resolve()
    if json.loads((zod / 'package.json').read_text())['version'] != '4.1.12':
        raise ValueError('Zod pin mismatch')
    shutil.copytree(zod, root / 'host/node_modules/zod', symlinks=False)
    (root / 'host/package.json').write_text(json.dumps({
        'name': 'architect-brain-host', 'version': VERSION, 'private': True, 'type': 'module',
        'engines': {'node': '>=24.0.0 <25'}, 'dependencies': {'zod': '4.1.12'}
    }, indent=2) + '\n')
    # Reuse the source-controlled entry; only the compiled module location differs.
    entry = (build / 'scripts/architect.mjs').read_text()
    old_import = "'../dist/src/portable/cli.js'"
    old_call = 'portableCommand(process.argv.slice(2))'
    if entry.count(old_import) != 1 or entry.count(old_call) != 1:
        raise ValueError('unexpected CLI entry')
    (root / 'host/bin').mkdir()
    (root / 'host/bin/architect.mjs').write_text(entry.replace(old_import, "'../src/portable/cli.js'").replace(
        old_call, "portableCommand(process.argv.slice(2),{ entrypoint:'distribution' })"))
    for name in ('SETUP.md', 'NEW_SESSION_PROMPT.md', 'READINESS.md', 'verify-distribution.mjs'):
        copy(build / 'portable' / name, root / name)
    for name in payload['policyFiles']:
        copy(policy / 'docs' / name, root / 'policy' / name)
    for relative in payload['unityPackageFiles']:
        source = build / 'unity/packages/com.architect.brain-unity' / relative
        copy(source, root / 'unity-package/com.architect.brain-unity' / relative)
        inventory['unity/packages/com.architect.brain-unity/' + relative] = sha(source)

    # Sorted members and fixed timestamps/ownership make equal source bytes yield equal archives.
    with (root / ('unity-adapter-' + VERSION + '.tgz')).open('wb') as output:
        with gzip.GzipFile(filename='', fileobj=output, mode='wb', mtime=0) as compressed:
            with tarfile.open(fileobj=compressed, mode='w', format=tarfile.PAX_FORMAT) as tar:
                package_root = root / 'unity-package/com.architect.brain-unity'
                for path in [package_root, *sorted(package_root.rglob('*'))]:
                    info = tar.gettarinfo(str(path), arcname='package' + (
                        '/' + str(path.relative_to(package_root)) if path != package_root else ''))
                    info.uid = info.gid = info.mtime = 0
                    info.uname = info.gname = ''
                    info.mode = 0o755 if path.is_dir() else 0o644
                    if path.is_file():
                        with path.open('rb') as stream:
                            tar.addfile(info, stream)
                    else:
                        tar.addfile(info)
    revision = hashlib.sha256(json.dumps(inventory, sort_keys=True, separators=(',', ':')).encode()).hexdigest()
    if inventory != inventory_before or revision != parity.get('sourceRevision'):
        raise ValueError('parity preflight and packaged source inventory describe different source revisions')
    (root / 'SOURCE_INVENTORY.json').write_text(json.dumps({
        'version': VERSION,
        'sourceRevision': revision,
        'files': inventory
    }, indent=2, sort_keys=True) + '\n')
    (root / 'BUILD_IDENTITY.json').write_text(json.dumps({
        'schemaVersion': 'architect-build-identity/1', 'version': VERSION, 'sourceRevision': revision,
        'buildParity': {key: parity[key] for key in ('status', 'compiledInputs', 'comparedOutputs', 'diagnostics', 'typescriptVersion')},
        'assurance': 'Fresh in-memory compile of declared source byte-matched the packaged dist outputs; not a Git commit, publication or native acceptance.'
    }, indent=2, sort_keys=True) + '\n')
    files = [{'path': str(path.relative_to(root)), 'bytes': path.stat().st_size, 'sha256': sha(path)}
             for path in sorted(root.rglob('*')) if path.is_file()]
    manifest = {'format': 'architect-distribution/1', 'version': VERSION, 'hostNode': '>=24 <25',
                'unityMinimum': '6000.0', 'nativeUnityAccepted': False, 'modelsEnabled': False, 'files': files}
    (root / 'MANIFEST.json').write_text(json.dumps(manifest, indent=2, sort_keys=True) + '\n')
    archive = out / (root.name + '.zip')
    with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED) as zipped:
        for path in sorted(root.rglob('*')):
            if path.is_file():
                info = zipfile.ZipInfo(str(path.relative_to(out)), date_time=(1980, 1, 1, 0, 0, 0))
                info.compress_type = zipfile.ZIP_DEFLATED
                info.create_system = 3
                info.external_attr = 0o100644 << 16
                zipped.writestr(info, path.read_bytes())
    result = {'version': VERSION, 'archive': archive.name, 'archiveSha256': sha(archive),
              'archiveBytes': archive.stat().st_size, 'fileCount': len(files),
              'manifestSha256': sha(root / 'MANIFEST.json'),
              'sourceRevision': revision, 'buildParity': 'coherent'}
    (out / 'artifact.json').write_text(json.dumps(result, indent=2) + '\n')
    return result

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--build-root', type=Path, required=True)
    parser.add_argument('--policy-root', type=Path)
    parser.add_argument('--output', type=Path)
    parser.add_argument('--list-payload', action='store_true')
    parser.add_argument('--node', default='node', help='Node 24 executable for the mandatory read-only parity preflight')
    args = parser.parse_args()
    if args.list_payload:
        print(json.dumps(load_payload(args.build_root.resolve()), indent=2))
    else:
        if args.policy_root is None or args.output is None:
            parser.error('--policy-root and --output are required for packaging')
        print(json.dumps(package(args.build_root.resolve(), args.policy_root.resolve(), args.output.resolve(), args.node)))
