import { StateGraph, Annotation, START, END } from '@langchain/langgraph';
import { SqliteSaver } from '@langchain/langgraph-checkpoint-sqlite';
import { DatabaseSync } from 'node:sqlite';
import { appendFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const [directory, scenario, stage] = process.argv.slice(2);
if (!directory || !scenario || !stage) throw new Error('Expected directory, scenario, stage');
mkdirSync(directory, { recursive: true });
const eventsFile = path.join(directory, 'events.jsonl');
const event = (name, details = {}) => appendFileSync(eventsFile, JSON.stringify({ name, pid: process.pid, stage, ...details }) + '\n');
const saver = SqliteSaver.fromConnString(path.join(directory, 'checkpoints.sqlite'));
saver.db.pragma('synchronous=FULL');
const state = Annotation.Root({
  stable: Annotation({ reducer: (_, value) => value, default: () => false }),
  flaky: Annotation({ reducer: (_, value) => value, default: () => false }),
  complete: Annotation({ reducer: (_, value) => value, default: () => false }),
});
let graph;
let ledger;
let effect;
if (scenario === 'branches') {
  graph = new StateGraph(state)
    .addNode('stableBranch', async () => { event('stable-ran'); return { stable: true }; })
    .addNode('flakyBranch', async () => {
      event('flaky-ran');
      // Give the successful sibling time to write its pending result before failure.
      if (!existsSync(path.join(directory, 'allow-retry'))) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        throw new Error('INJECTED_FIRST_ATTEMPT_FAILURE');
      }
      return { flaky: true };
    })
    .addNode('joinBranches', (value) => {
      if (!value.stable || !value.flaky) throw new Error('Missing branch result');
      event('join-ran');
      return { complete: true };
    })
    .addEdge(START, 'stableBranch').addEdge(START, 'flakyBranch')
    .addEdge(['stableBranch', 'flakyBranch'], 'joinBranches').addEdge('joinBranches', END)
    .compile({ checkpointer: saver });
} else {
  ledger = new DatabaseSync(path.join(directory, 'operation-ledger.sqlite'));
  ledger.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; CREATE TABLE IF NOT EXISTS operations (id TEXT PRIMARY KEY, state TEXT NOT NULL, receipt TEXT)');
  effect = new DatabaseSync(path.join(directory, 'external-effect.sqlite'));
  effect.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; CREATE TABLE IF NOT EXISTS counter (id INTEGER PRIMARY KEY, value INTEGER NOT NULL); INSERT OR IGNORE INTO counter VALUES (1, 0)');
  graph = new StateGraph(state)
    .addNode('performEffect', () => {
      event('effect-node-entered');
      if (scenario === 'guarded') {
        const operation = ledger.prepare('SELECT * FROM operations WHERE id = ?').get('operation:fixed');
        if (operation?.state === 'COMMITTED') { event('receipt-reused'); return { complete: true }; }
        if (operation) { event('reconciliation-required'); throw new Error('RECONCILIATION_REQUIRED'); }
        ledger.prepare('INSERT INTO operations VALUES (?, ?, NULL)').run('operation:fixed', 'STARTED');
      }
      effect.exec('UPDATE counter SET value = value + 1 WHERE id = 1');
      event('external-effect-applied');
      if (stage === 'crash') process.kill(process.pid, 'SIGKILL');
      if (scenario === 'guarded') ledger.prepare('UPDATE operations SET state = ?, receipt = ? WHERE id = ?').run('COMMITTED', 'receipt:observed', 'operation:fixed');
      return { complete: true };
    })
    .addEdge(START, 'performEffect').addEdge('performEffect', END)
    .compile({ checkpointer: saver });
}
const config = { configurable: { thread_id: `spike:${scenario}` }, durability: 'sync' };
try {
  const before = await graph.getState(config);
  event('process-start', { checkpointPresent: Boolean(before.config?.configurable?.checkpoint_id), next: before.next });
  const result = await graph.invoke(stage === 'first' || stage === 'crash' ? {} : null, config);
  const after = await graph.getState(config);
  writeFileSync(path.join(directory, `result-${stage}.json`), JSON.stringify({ pid: process.pid, result, checkpointId: after.config.configurable.checkpoint_id, next: after.next }, null, 2));
} catch (error) {
  const checkpoint = await graph.getState(config);
  writeFileSync(path.join(directory, `result-${stage}.json`), JSON.stringify({ pid: process.pid, error: error.message, checkpointId: checkpoint.config?.configurable?.checkpoint_id, next: checkpoint.next, tasks: checkpoint.tasks.map(({ name, error }) => ({ name, error })) }, null, 2));
  process.exitCode = 31;
} finally {
  saver.db.close();
  ledger?.close();
  effect?.close();
}
