"""Offline regression checks for declared payload boundaries and reproducible archive metadata."""
import importlib.util
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest
import zipfile

sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location('portable_packager', ROOT / 'scripts/package-portable.py')
packager = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(packager)


class PortablePackagingTests(unittest.TestCase):
    def fixture(self, root):
        payload = {
            'format': 'architect-portable-payload/1', 'version': '0.2.0-preview.1',
            'sourceModules': ['portable/cli', 'portable/identity', 'portable/templates', 'contracts/canonical'],
            'inspectionOnlyModules': [], 'hostCliModule': 'portable/cli',
            'fixtures': [], 'tests': [], 'fixtureResourceFiles': [], 'policyFiles': [],
            'unityPackageFiles': ['package.json']
        }
        files = {
            'portable/PAYLOAD.json': json.dumps(payload),
            'src/portable/cli.ts': 'export const fixture = true;',
            'scripts/architect.mjs': (ROOT / 'scripts/architect.mjs').read_text(),
            'node_modules/zod/package.json': '{"version":"4.1.12"}',
            'node_modules/zod/LICENSE': 'Synthetic offline dependency fixture.',
            'unity/packages/com.architect.brain-unity/package.json': '{"version":"0.2.0-preview.1"}'
        }
        for name in ('SETUP.md', 'NEW_SESSION_PROMPT.md', 'READINESS.md', 'verify-distribution.mjs'):
            files['portable/' + name] = 'fixture'
        for relative, content in files.items():
            path = root / relative
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(content)
        # Real compiler and self-checked verifier infrastructure, not a preflight stub.
        for relative in ('src/portable/identity.ts', 'src/portable/templates.ts', 'src/contracts/canonical.ts',
                         'scripts/verify-portable-identity.mjs'):
            target = root / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(ROOT / relative, target)
        (root / 'package.json').write_text('{"type":"module"}')
        (root / 'tsconfig.json').write_text(json.dumps({
            'compilerOptions': {'target':'ES2023', 'module':'NodeNext', 'moduleResolution':'NodeNext',
                                'strict':True, 'declaration':True, 'sourceMap':True, 'rootDir':'.', 'outDir':'dist', 'skipLibCheck':True},
            'include':['src/**/*.ts']
        }))
        for name in ('typescript', '@types'):
            (root / 'node_modules' / name).symlink_to((ROOT / 'node_modules' / name).resolve(), target_is_directory=True)
        node = shutil.which('node')
        build = subprocess.run([node, str(root / 'node_modules/typescript/bin/tsc'), '-p', str(root / 'tsconfig.json')],
                               text=True, capture_output=True, timeout=120)
        self.assertEqual(build.returncode, 0, build.stdout + build.stderr)
        return payload

    def test_unlisted_proposal_and_compiled_noise_are_excluded(self):
        with tempfile.TemporaryDirectory(prefix='architect-payload-test-') as directory:
            root = Path(directory)
            self.fixture(root)
            for relative in ('src/runtime/lock-identity.ts', 'dist/src/runtime/lock-identity.js'):
                path = root / relative
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text('unreviewed proposal')
            result = packager.package(root, root, root / 'output')
            with zipfile.ZipFile(root / 'output' / result['archive']) as archive:
                self.assertFalse(any('lock-identity' in name for name in archive.namelist()))
                inventory = json.loads(archive.read('architect-brain-0.2.0-preview.1/SOURCE_INVENTORY.json'))
                self.assertEqual(set(inventory['files']), {
                    'src/portable/cli.ts', 'portable/PAYLOAD.json', 'scripts/architect.mjs',
                    'unity/packages/com.architect.brain-unity/package.json',
                    'src/portable/identity.ts', 'src/portable/templates.ts', 'src/contracts/canonical.ts'
                })

    def test_equal_bytes_in_different_output_directories_produce_equal_archives(self):
        with tempfile.TemporaryDirectory(prefix='architect-payload-test-') as directory:
            root = Path(directory)
            self.fixture(root)
            first = packager.package(root, root, root / 'first')
            second = packager.package(root, root, root / 'second')
            self.assertEqual(first['archiveSha256'], second['archiveSha256'])
            self.assertEqual(first['manifestSha256'], second['manifestSha256'])

    def test_missing_declared_source_fails_instead_of_silently_omitting_it(self):
        with tempfile.TemporaryDirectory(prefix='architect-payload-test-') as directory:
            root = Path(directory)
            self.fixture(root)
            (root / 'src/portable/cli.ts').unlink()
            with self.assertRaisesRegex(ValueError, 'non-regular source'):
                packager.package(root, root, root / 'output')

    def test_traversal_duplicate_or_wrong_version_is_rejected(self):
        for replacement in (
            {'sourceModules': ['../private']},
            {'sourceModules': ['portable/cli', 'portable/cli']},
            {'version': 'another-version'}
        ):
            with self.subTest(replacement=replacement):
                with tempfile.TemporaryDirectory(prefix='architect-payload-test-') as directory:
                    root = Path(directory)
                    payload = self.fixture(root)
                    payload.update(replacement)
                    (root / 'portable/PAYLOAD.json').write_text(json.dumps(payload))
                    with self.assertRaises(ValueError):
                        packager.load_payload(root)

    def test_real_declaration_matches_existing_source_and_excludes_proposal(self):
        payload = packager.load_payload(ROOT)
        self.assertNotIn('runtime/lock-identity', payload['sourceModules'])
        for module in payload['sourceModules']:
            self.assertTrue((ROOT / 'src' / (module + '.ts')).is_file(), module)


if __name__ == '__main__':
    unittest.main()
