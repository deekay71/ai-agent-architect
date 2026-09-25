import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const spikeRoot = fileURLToPath(new URL('../', import.meta.url));
const repositoryRoot = path.resolve(spikeRoot, '../..');
const evidence = path.join(spikeRoot, 'evidence');
await mkdir(evidence, { recursive: true });
const build = spawnSync('/bin/sh', ['./scripts/dev.sh', 'build'], { cwd: repositoryRoot, encoding: 'utf8', timeout: 60_000 });
await writeFile(path.join(evidence, 'native-build.log'), build.stdout + build.stderr);
assert.equal(build.status, 0, build.stderr || build.stdout);
const testedFiles = ['test/runtime-recovery.test.ts', 'fixtures/runtime-crash-child.ts', 'src/runtime/runner.ts', 'src/runtime/store.ts', 'src/runtime/lock.ts', 'src/runtime/isolation.ts', 'src/runtime/evaluation.ts', 'src/runtime/tool-worker.ts', 'src/runtime/verifier-worker.ts'];
async function pins() {
  return Promise.all(testedFiles.map(async (file) => ({ path: file, sha256: createHash('sha256').update(await readFile(path.join(repositoryRoot, file))).digest('hex') })));
}
const sourcePins = await pins();
const started = performance.now();
const run = spawnSync(process.execPath, ['--test', '--test-reporter=tap', 'dist/test/runtime-recovery.test.js'], {
  cwd: repositoryRoot, encoding: 'utf8', timeout: 60_000, maxBuffer: 2 * 1024 * 1024,
});
await writeFile(path.join(evidence, 'native-recovery.tap'), run.stdout + run.stderr);
assert.equal(run.status, 0, run.stderr || run.stdout);
assert.deepEqual(await pins(), sourcePins, 'Native sources changed while recovery evidence was being collected');
const testNames = [...run.stdout.matchAll(/^ok \d+ - (.+)$/gm)].map((match) => match[1]);
const count = (name) => Number(run.stdout.match(new RegExp(`^# ${name} (\\d+)$`, 'm'))?.[1]);
const counts = { tests: count('tests'), pass: count('pass'), fail: count('fail'), skipped: count('skipped') };
assert.equal(counts.tests, 10);
assert.equal(counts.pass, 10);
assert.equal(counts.fail, 0);
assert.equal(counts.skipped, 0, 'macOS-only checks must run, not silently skip');
const report = {
  executedAt: new Date().toISOString(), node: process.version, platform: process.platform, arch: process.arch,
  command: 'node --test --test-reporter=tap dist/test/runtime-recovery.test.js',
  buildCommand: './scripts/dev.sh build', status: run.status, elapsedMs: Math.round(performance.now() - started), counts, testNames, sourcePins,
  comparisonScenarios: [
    { id: 'restart-checkpoint', evidenceTests: testNames.filter((name) => name.includes('fresh process') || name.includes('clean process restart')), observed: true },
    { id: 'successful-sibling-reuse', evidenceTests: testNames.filter((name) => name.includes('successful planner branch')), observed: true, assertion: 'Fresh owner returns durable branch a; callback would throw if committed branch were rerun; plannerAttempts=3' },
    { id: 'ambiguous-effect-naive-duplicate', observed: null, reason: 'Native runner intentionally always has a ledger; no unsafe native mode is introduced for comparison' },
    { id: 'ambiguous-effect-ledger-block-reconcile', evidenceTests: testNames.filter((name) => name.includes('after-worker') || name.includes('before-commit') || name.includes('timeout after effect') || name.includes('reconciliation must not bless')), observed: true, assertion: 'Fresh-process after-effect recovery has dispatches=1, attempts=1, unchanged output inode; unrelated post-crash workspace drift blocks commitment' },
  ],
  limits: 'Deterministic macOS file-write fixture and trusted broker; not Unity, arbitrary tools, a paid judge, power-loss testing, or hosted CI execution',
};
await writeFile(path.join(evidence, 'native-results.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ counts, evidence: 'evidence/native-results.json' }));
