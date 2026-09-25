import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createServer } from 'node:net';
import { runIsolated } from '../src/runtime/isolation.js';

const supported = process.platform === 'darwin';
async function fixture(body: string) {
  const root = await mkdtemp(path.join(tmpdir(), 'architect-sandbox-test-'));
  const workspace = path.join(root, 'workspace');
  const protectedRoot = path.join(root, 'evaluator');
  await Promise.all([mkdir(workspace), mkdir(protectedRoot)]);
  const script = path.join(workspace, 'worker.mjs');
  await writeFile(script, body);
  await writeFile(path.join(protectedRoot, 'rubric.json'), 'protected-rubric');
  await writeFile(path.join(protectedRoot, 'evidence.json'), 'trusted-evidence');
  return { root, workspace, protectedRoot, script, cleanup: () => rm(root, { recursive: true, force: true }) };
}

test('actual sandbox allows explicit scoped writes, protects rubric/evidence and rejects symlink escape', { skip: !supported }, async () => {
  const f = await fixture(`
    import fs from 'node:fs';
    const protectedRoot = process.argv[2];
    const cases = {};
    for (const [name, action] of Object.entries({
      rubricRead: () => fs.readFileSync(protectedRoot + '/rubric.json'),
      rubricWrite: () => fs.writeFileSync(protectedRoot + '/rubric.json', 'forged'),
      evidenceWrite: () => fs.writeFileSync(protectedRoot + '/evidence.json', 'forged'),
      symlinkRead: () => fs.readFileSync('leak/rubric.json'),
      symlinkWrite: () => fs.writeFileSync('leak/evidence.json', 'forged'),
      outsideWrite: () => fs.writeFileSync('unapproved.txt', 'forged'),
    })) { try { action(); cases[name] = 'ALLOWED'; } catch (e) { cases[name] = e.code; } }
    fs.writeFileSync('output/result.txt', 'allowed-result');
    console.log(JSON.stringify(cases));
  `);
  try {
    const output = path.join(f.workspace, 'output');
    await mkdir(output);
    await symlink(f.protectedRoot, path.join(f.workspace, 'leak'));
    const result = await runIsolated({ scriptPath: f.script, args: [f.protectedRoot], workspace: f.workspace, writeRoots: [output], timeoutMs: 5000 });
    assert.equal(result.exitCode, 0, result.stderr);
    assert.equal(result.stopped, true);
    const cases: Record<string, string> = JSON.parse(result.stdout);
    assert.equal(Object.keys(cases).length, 6);
    for (const [name, code] of Object.entries(cases)) assert.match(code, /^(EPERM|EACCES)$/, name);
    assert.equal(await readFile(path.join(output, 'result.txt'), 'utf8'), 'allowed-result');
    assert.equal(await readFile(path.join(f.protectedRoot, 'rubric.json'), 'utf8'), 'protected-rubric');
    assert.equal(await readFile(path.join(f.protectedRoot, 'evidence.json'), 'utf8'), 'trusted-evidence');
  } finally { await f.cleanup(); }
});

test('actual sandbox denies loopback network, child creation and signals to another process', { skip: !supported }, async () => {
  const server = createServer(socket => socket.end('unexpected-network'));
  let accepted = 0;
  server.on('connection', () => { accepted++; });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const f = await fixture(`
    import { spawnSync } from 'node:child_process';
    import net from 'node:net';
    const result = {};
    result.spawn = spawnSync(process.execPath, ['-e', 'console.log("escaped")']).error?.code ?? 'ALLOWED';
    result.shell = spawnSync('/bin/sh', ['-c', 'echo escaped']).error?.code ?? 'ALLOWED';
    try { process.kill(Number(process.argv[2]), 0); result.signal = 'ALLOWED'; } catch(e) { result.signal = e.code; }
    result.network = await new Promise(resolve => {
      const socket = net.connect({host:'127.0.0.1', port:Number(process.argv[3])});
      socket.on('connect', () => { socket.destroy(); resolve('ALLOWED'); });
      socket.on('error', error => resolve(error.code));
      socket.setTimeout(1000, () => { socket.destroy(); resolve('TIMEOUT'); });
    });
    console.log(JSON.stringify(result));
  `);
  try {
    const result = await runIsolated({ scriptPath: f.script, args: [String(process.pid), String(address.port)], workspace: f.workspace, timeoutMs: 5000 });
    assert.equal(result.exitCode, 0, result.stderr);
    const values: Record<string, string> = JSON.parse(result.stdout);
    for (const [name, code] of Object.entries(values)) assert.match(code, /^(EPERM|EACCES)$/, name);
    assert.equal(accepted, 0);
  } finally { await f.cleanup(); await new Promise<void>(resolve => server.close(() => resolve())); }
});

test('worker input is gated on awaited onSpawn, and environment is scrubbed', { skip: !supported }, async () => {
  const f = await fixture(`
    let text = ''; for await (const part of process.stdin) text += part;
    console.log(JSON.stringify({text, leaked:process.env.ARCHITECT_TEST_SECRET ?? null, options:process.env.NODE_OPTIONS ?? null}));
  `);
  const previous = process.env.ARCHITECT_TEST_SECRET;
  process.env.ARCHITECT_TEST_SECRET = 'must-not-cross';
  try {
    let recorded = false;
    const result = await runIsolated({ scriptPath: f.script, workspace: f.workspace, timeoutMs: 5000, input: 'approved request', onSpawn: async pid => {
      assert.ok(pid > 1);
      await new Promise(resolve => setTimeout(resolve, 50));
      recorded = true;
    } });
    assert.equal(recorded, true);
    assert.deepEqual(JSON.parse(result.stdout), { text: 'approved request', leaked: null, options: null });
  } finally {
    if (previous === undefined) delete process.env.ARCHITECT_TEST_SECRET; else process.env.ARCHITECT_TEST_SECRET = previous;
    await f.cleanup();
  }
});

test('timeout kills and confirms the detached worker group is gone', { skip: !supported }, async () => {
  const f = await fixture('setInterval(() => {}, 1000);');
  try {
    const result = await runIsolated({ scriptPath: f.script, workspace: f.workspace, timeoutMs: 250 });
    assert.equal(result.termination, 'timed_out');
    assert.equal(result.stopped, true);
    assert.throws(() => process.kill(-result.pid, 0), { code: 'ESRCH' });
  } finally { await f.cleanup(); }
});

test('cancellation stops a worker and failed bookkeeping never releases its input', { skip: !supported }, async () => {
  const f = await fixture('let s=""; for await (const c of process.stdin) s+=c; if(s) console.log("EFFECT"); setInterval(() => {},1000);');
  try {
    const abort = new AbortController();
    const running = runIsolated({ scriptPath: f.script, workspace: f.workspace, timeoutMs: 5000, signal: abort.signal,
      onSpawn: () => { setTimeout(() => abort.abort(), 100); } });
    const result = await running;
    assert.equal(result.termination, 'cancelled'); assert.equal(result.stopped, true);
    let failedPid = 0;
    await assert.rejects(runIsolated({ scriptPath: f.script, workspace: f.workspace, timeoutMs: 5000, input: 'forbidden', onSpawn: pid => {
      failedPid = pid; throw new Error('durable registration failed');
    } }), /durable registration failed/);
    assert.throws(() => process.kill(-failedPid, 0), { code: 'ESRCH' });
  } finally { await f.cleanup(); }
});

test('output is bounded and write grants resolving outside workspace are rejected', { skip: !supported }, async () => {
  const f = await fixture('process.stdout.write("x".repeat(2 * 1024 * 1024));');
  try {
    const result = await runIsolated({ scriptPath: f.script, workspace: f.workspace, timeoutMs: 5000 });
    assert.equal(result.exitCode, 0, result.stderr);
    assert.equal(result.outputTruncated, true); assert.equal(Buffer.byteLength(result.stdout), 1024 * 1024);
    await symlink(f.protectedRoot, path.join(f.workspace, 'outside'));
    await assert.rejects(runIsolated({ scriptPath: f.script, workspace: f.workspace, writeRoots: [path.join(f.workspace, 'outside')], timeoutMs: 5000 }), /escapes workspace/);
  } finally { await f.cleanup(); }
});

test('explicit read scopes do not grant the entire workspace', { skip: !supported }, async () => {
  const f = await fixture(`import fs from 'node:fs'; try {fs.readFileSync('private.txt'); console.log('ALLOWED');} catch(e) {console.log(e.code);}`);
  try {
    await writeFile(path.join(f.workspace, 'private.txt'), 'not granted');
    const result = await runIsolated({ scriptPath: f.script, workspace: f.workspace, readRoots: [], timeoutMs: 5000 });
    assert.equal(result.exitCode, 0, result.stderr);
    assert.match(result.stdout.trim(), /^(EPERM|EACCES)$/);
  } finally { await f.cleanup(); }
});
