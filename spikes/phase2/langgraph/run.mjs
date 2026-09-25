import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const runtime = path.join(root, '.runtime/langgraph');
await rm(runtime, { recursive: true, force: true });
await mkdir(runtime, { recursive: true });
await mkdir(path.join(root, 'evidence'), { recursive: true });
const runs = [];
function run(scenario, stage) {
  const directory = path.join(runtime, scenario);
  const started = performance.now();
  const child = spawnSync(process.execPath, ['--import', path.join(root, 'offline.mjs'), path.join(root, 'langgraph/worker.mjs'), directory, scenario, stage], {
    cwd: root, encoding: 'utf8', timeout: 30_000,
    env: { PATH: process.env.PATH, LANG: 'en_US.UTF-8', LANGCHAIN_TRACING_V2: 'false', LANGSMITH_TRACING: 'false' },
  });
  if (child.error) throw child.error;
  runs.push({ scenario, stage, status: child.status, signal: child.signal, elapsedMs: Math.round(performance.now() - started), stdout: child.stdout, stderr: child.stderr });
  return child;
}
const loadJson = async (scenario, stage) => JSON.parse(await readFile(path.join(runtime, scenario, `result-${stage}.json`), 'utf8'));
const loadEvents = async (scenario) => (await readFile(path.join(runtime, scenario, 'events.jsonl'), 'utf8')).trim().split('\n').map((line) => JSON.parse(line));
const countEffects = (scenario) => {
  const database = new DatabaseSync(path.join(runtime, scenario, 'external-effect.sqlite'));
  try { return database.prepare('SELECT value FROM counter WHERE id = 1').get().value; } finally { database.close(); }
};

assert.equal(run('branches', 'first').status, 31);
const before = await loadJson('branches', 'first');
assert.match(before.error, /INJECTED_FIRST_ATTEMPT_FAILURE/);
assert.ok(before.checkpointId);
await writeFile(path.join(runtime, 'branches/allow-retry'), 'ready');
assert.equal(run('branches', 'resume').status, 0);
const resumed = await loadJson('branches', 'resume');
const branchEvents = await loadEvents('branches');
assert.notEqual(before.pid, resumed.pid);
assert.equal(resumed.result.complete, true);
assert.equal(branchEvents.filter((e) => e.name === 'stable-ran').length, 1);
assert.equal(branchEvents.filter((e) => e.name === 'flaky-ran').length, 2);
assert.ok(branchEvents.find((e) => e.name === 'process-start' && e.stage === 'resume')?.checkpointPresent);

assert.equal(run('naive', 'crash').signal, 'SIGKILL');
assert.equal(countEffects('naive'), 1);
assert.equal(run('naive', 'resume').status, 0);
assert.equal(countEffects('naive'), 2, 'Graph checkpoint alone cannot make an external side effect exactly once');

assert.equal(run('guarded', 'crash').signal, 'SIGKILL');
assert.equal(countEffects('guarded'), 1);
assert.equal(run('guarded', 'resume').status, 31);
assert.match((await loadJson('guarded', 'resume')).error, /RECONCILIATION_REQUIRED/);
assert.equal(countEffects('guarded'), 1, 'Unknown receipt must block another effect');
// Explicit fixture reconciliation from an independently observed postcondition.
// This single-writer test is not a production oracle or generic exactly-once mechanism.
const ledger = new DatabaseSync(path.join(runtime, 'guarded/operation-ledger.sqlite'));
ledger.prepare('UPDATE operations SET state = ?, receipt = ? WHERE id = ?').run('COMMITTED', 'receipt:independently-observed-count-1', 'operation:fixed');
ledger.close();
assert.equal(run('guarded', 'after-reconcile').status, 0);
assert.equal(countEffects('guarded'), 1);

const report = {
  executedAt: new Date().toISOString(), node: process.version, platform: process.platform, arch: process.arch,
  framework: '@langchain/langgraph@1.4.17', checkpointer: '@langchain/langgraph-checkpoint-sqlite@1.0.4', durability: 'sync',
  scenarios: [
    { id: 'restart-checkpoint', observed: true, firstPid: before.pid, resumedPid: resumed.pid, persistedCheckpointId: before.checkpointId },
    { id: 'successful-sibling-reuse', observed: true, stableExecutions: 1, failingBranchExecutions: 2, note: 'Successful sibling pending writes survive failed super-step; not an operation-ledger commit.' },
    { id: 'ambiguous-effect-naive-duplicate', observed: true, physicalEffects: countEffects('naive'), confirms: 'Checkpoint alone does not guarantee exactly-once external effects.' },
    { id: 'ambiguous-effect-ledger-block-reconcile', observed: true, blockedBeforeReconcile: true, physicalEffects: countEffects('guarded'), receiptReused: (await loadEvents('guarded')).some((e) => e.name === 'receipt-reused') },
  ],
  modelCalls: 0, unityCalls: 0, networkGuard: 'Node API fixture guard loaded in children; not OS isolation',
  runs, branchEvents, naiveEvents: await loadEvents('naive'), guardedEvents: await loadEvents('guarded'),
};
await writeFile(path.join(root, 'evidence/langgraph-results.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ scenarios: report.scenarios, evidence: 'evidence/langgraph-results.json' }, null, 2));
