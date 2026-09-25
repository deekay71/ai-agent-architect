import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const digestBytes = (bytes) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const lockBytes = await readFile(path.join(root, 'promptfoo/fixture-lock.json'));
const lock = JSON.parse(lockBytes);
for (const [file, expected] of Object.entries(lock.files)) {
  assert.equal(digestBytes(await readFile(path.join(root, file))), expected, `Locked fixture drift: ${file}`);
}
const dataset = JSON.parse(await readFile(path.join(root, 'promptfoo/dataset.json'), 'utf8'));
assert.equal(dataset.length, lock.expectedCases);
assert.notEqual(digestBytes(Buffer.concat([await readFile(path.join(root, 'promptfoo/dataset.json')), Buffer.from(' ')])), lock.files['promptfoo/dataset.json']);
await mkdir(path.join(root, 'evidence'), { recursive: true });
await mkdir(path.join(root, '.runtime/promptfoo'), { recursive: true });
const environment = {
  PATH: process.env.PATH, LANG: 'en_US.UTF-8', CI: 'true',
  PROMPTFOO_DISABLE_TELEMETRY: '1', PROMPTFOO_DISABLE_UPDATE: '1',
  PROMPTFOO_CONFIG_DIR: path.join(root, '.runtime/promptfoo/config'),
  PROMPTFOO_LOG_DIR: path.join(root, '.runtime/promptfoo/logs'),
  LANGCHAIN_TRACING_V2: 'false', LANGSMITH_TRACING: 'false',
};
const runs = [];
function run(name, args) {
  const started = performance.now();
  const child = spawnSync(process.execPath, ['--import', path.join(root, 'offline.mjs'), ...args], {
    cwd: root, encoding: 'utf8', env: environment, timeout: 60_000, maxBuffer: 4 * 1024 * 1024,
  });
  if (child.error) throw child.error;
  runs.push({ name, status: child.status, signal: child.signal, elapsedMs: Math.round(performance.now() - started), stdout: child.stdout, stderr: child.stderr });
  return child;
}
const api = run('node-api', [path.join(root, 'promptfoo/api-worker.mjs')]);
assert.equal(api.status, 0, api.stderr || api.stdout);
const cli = run('cli-ci', [path.join(root, 'node_modules/promptfoo/dist/src/entrypoint.js'), 'eval',
  '-c', 'promptfoo/promptfooconfig.json', '-o', 'evidence/promptfoo-cli-results.json',
  '--no-cache', '--no-write', '--no-share', '--no-progress-bar', '--no-table', '--max-concurrency', '1']);
assert.equal(cli.status, 100, 'The raw CLI must report expected assertion failures for rejected/unknown candidates');

function counts(rows) {
  return {
    total: rows.length,
    acceptedValid: rows.filter((r) => r.label === 'valid' && r.accepted).length,
    rejectedInvalid: rows.filter((r) => r.label === 'invalid' && !r.accepted).length,
    ambiguousNotAccepted: rows.filter((r) => r.label === 'ambiguous' && !r.accepted).length,
    falseAccepts: rows.filter((r) => r.label === 'invalid' && r.accepted).length,
    falseRejects: rows.filter((r) => r.label === 'valid' && !r.accepted).length,
    ambiguousAccepts: rows.filter((r) => r.label === 'ambiguous' && r.accepted).length,
  };
}
const reports = [];
for (const mode of ['api', 'cli']) {
  const exported = JSON.parse(await readFile(path.join(root, `evidence/promptfoo-${mode}-results.json`), 'utf8'));
  const summary = Array.isArray(exported.results) ? exported : exported.results;
  assert.equal(summary.results.length, lock.expectedCases);
  assert.equal(summary.stats.errors, 0);
  const rows = summary.results.map((result) => {
    const metadata = result.testCase?.metadata ?? result.metadata;
    assert.ok(metadata?.caseId, `Missing fixture identity in ${JSON.stringify(Object.keys(result))}`);
    const oracle = dataset.find((item) => item.metadata.caseId === metadata.caseId);
    assert.ok(oracle, 'Unexpected result outside locked dataset');
    const reasons = [result.gradingResult?.reason, ...(result.gradingResult?.componentResults ?? []).map((r) => r.reason)].filter(Boolean);
    const reason = reasons.find((value) => /^(ALLOW|REJECT|UNKNOWN):/.test(value));
    assert.ok(reason, `Missing explicit three-way decision for ${metadata.caseId}`);
    const decision = reason.split(':')[0];
    assert.equal(decision, oracle.metadata.expectedDecision);
    return { caseId: metadata.caseId, label: oracle.metadata.label, expectedDecision: oracle.metadata.expectedDecision, decision, accepted: result.success, reason };
  });
  const metrics = counts(rows);
  assert.deepEqual(metrics, { total: 9, acceptedValid: 3, rejectedInvalid: 3, ambiguousNotAccepted: 3, falseAccepts: 0, falseRejects: 0, ambiguousAccepts: 0 });
  reports.push({ mode, stats: summary.stats, metrics, rows });
}
assert.deepEqual(reports[0].metrics, reports[1].metrics);
// Check reporting itself against synthetic mutants; these are not hidden extra eval trials.
assert.equal(counts([{ label: 'invalid', accepted: true }]).falseAccepts, 1);
assert.equal(counts([{ label: 'valid', accepted: false }]).falseRejects, 1);
assert.equal(counts([{ label: 'ambiguous', accepted: true }]).ambiguousAccepts, 1);
const report = {
  executedAt: new Date().toISOString(), node: process.version, platform: process.platform, arch: process.arch,
  framework: 'promptfoo@0.123.1', fixtureLockDigest: digestBytes(lockBytes), reports, runs,
  modelCalls: 0, modelTokens: 0, modelCost: 0, unityCalls: 0,
  rawCliExitCode: cli.status, wrapperMeaning: 'Exit 0 means fixed oracle labels matched, not all candidate plans were accepted',
  limits: 'Nine deterministic wiring fixtures, no semantic model evaluation or release-reliability estimate; API network guard is not an OS sandbox',
};
await writeFile(path.join(root, 'evidence/promptfoo-results.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ reports: reports.map(({ mode, metrics }) => ({ mode, metrics })), rawCliExitCode: cli.status, evidence: 'evidence/promptfoo-results.json' }, null, 2));
