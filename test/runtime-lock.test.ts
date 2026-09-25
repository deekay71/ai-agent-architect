import assert from 'node:assert/strict';
import test from 'node:test';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { mkdtemp, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { acquireProjectLock, recoverProjectLock } from '../src/runtime/lock.js';
import { runIsolated } from '../src/runtime/isolation.js';

const supported = process.platform === 'darwin';
const lockModule = new URL('../src/runtime/lock.js', import.meta.url).href;

async function tempRoot(): Promise<string> { return mkdtemp(path.join(tmpdir(), 'architect-lock-test-')); }

async function owner(root: string, withWorker = false, pending = false): Promise<{ child: ChildProcessWithoutNullStreams; workerPid?: number }> {
  const source = `
    import { acquireProjectLock } from ${JSON.stringify(lockModule)};
    import { spawn } from 'node:child_process';
    const lock = await acquireProjectLock(process.argv[1]);
    let worker;
    if (${withWorker || pending}) await lock.beginWorker();
    if (${withWorker}) {
      worker = spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)'], {detached:true,stdio:'ignore'});
      await lock.registerWorker(worker.pid);
    }
    console.log(JSON.stringify({ready:true,workerPid:worker?.pid}));
    process.on('SIGTERM', async () => { await lock.release(); process.exit(0); });
    setInterval(()=>{},1000);
  `;
  const child = spawn(process.execPath, ['--input-type=module', '-e', source, root], { stdio: ['pipe', 'pipe', 'pipe'] });
  const value = await new Promise<{ workerPid?: number }>((resolve, reject) => {
    let output = ''; let errors = '';
    const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('Owner startup timeout: ' + errors)); }, 5000);
    child.stderr.on('data', (part: Buffer) => { errors += part.toString(); });
    child.stdout.on('data', (part: Buffer) => {
      output += part.toString();
      if (output.includes('\n')) { clearTimeout(timer); resolve(JSON.parse(output.split('\n')[0]!)); }
    });
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('exit', code => { clearTimeout(timer); reject(new Error(`Owner exited ${code}: ${errors}`)); });
  });
  return { child, ...value };
}

async function stop(child: ChildProcessWithoutNullStreams, signal: NodeJS.Signals = 'SIGKILL'): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const ended = new Promise<void>(resolve => child.once('close', () => resolve()));
  child.kill(signal); await ended;
}

async function gone(pid: number): Promise<void> {
  for (let count = 0; count < 100; count++) {
    try { process.kill(pid, 0); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ESRCH') return; throw error; }
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  throw new Error(`Process ${pid} did not stop`);
}

test('OS flock excludes a second owner and stable file survives clean release', { skip: !supported }, async () => {
  const root = await tempRoot();
  try {
    const first = await acquireProjectLock(root);
    const inode = (await stat(path.join(root, '.architect-owner.lock'))).ino;
    await assert.rejects(acquireProjectLock(root, { timeoutMs: 50 }), { code: 'LOCK_BUSY' });
    await first.release();
    const second = await acquireProjectLock(root); await second.release();
    assert.equal((await stat(path.join(root, '.architect-owner.lock'))).ino, inode);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('paused owner cannot be replaced and resumes with the same lock', { skip: !supported }, async () => {
  const root = await tempRoot(); const a = await owner(root);
  try {
    a.child.kill('SIGSTOP');
    await assert.rejects(acquireProjectLock(root, { timeoutMs: 100 }), { code: 'LOCK_BUSY' });
    a.child.kill('SIGCONT');
    await stop(a.child, 'SIGTERM');
    const b = await acquireProjectLock(root); await b.release();
  } finally { a.child.kill('SIGCONT'); await stop(a.child); await rm(root, { recursive: true, force: true }); }
});

test('hard owner crash leaves quarantine and explicit recovery works only after guardian exits', { skip: !supported }, async () => {
  const root = await tempRoot(); const a = await owner(root);
  try {
    const marker = JSON.parse(await readFile(path.join(root, '.architect-owner.json'), 'utf8')) as { guardian: { pid: number } };
    await stop(a.child); await gone(marker.guardian.pid);
    await assert.rejects(acquireProjectLock(root), { code: 'LOCK_QUARANTINED' });
    assert.deepEqual(await recoverProjectLock(root), { recovered: true });
    const b = await acquireProjectLock(root); await b.release();
  } finally { await stop(a.child); await rm(root, { recursive: true, force: true }); }
});

test('orphan worker blocks recovery after parent crash until its process group is proven gone', { skip: !supported }, async () => {
  const root = await tempRoot(); const a = await owner(root, true);
  assert.ok(a.workerPid);
  try {
    const marker = JSON.parse(await readFile(path.join(root, '.architect-owner.json'), 'utf8')) as { guardian: { pid: number }; workers: { birth: string }[] };
    assert.ok(marker.workers[0]?.birth);
    await stop(a.child); await gone(marker.guardian.pid);
    await assert.rejects(recoverProjectLock(root), { code: 'LOCK_WORKER_ALIVE' });
    await assert.rejects(acquireProjectLock(root), { code: 'LOCK_QUARANTINED' });
    process.kill(-a.workerPid, 'SIGKILL'); await gone(a.workerPid);
    assert.deepEqual(await recoverProjectLock(root), { recovered: true });
    const b = await acquireProjectLock(root); await b.release();
  } finally {
    await stop(a.child);
    try { process.kill(-a.workerPid, 'SIGKILL'); } catch {}
    await rm(root, { recursive: true, force: true });
  }
});

test('unregistered spawn window stays quarantined instead of guessing from age', { skip: !supported }, async () => {
  const root = await tempRoot(); const a = await owner(root, false, true);
  try {
    const marker = JSON.parse(await readFile(path.join(root, '.architect-owner.json'), 'utf8')) as { guardian: { pid: number } };
    await stop(a.child); await gone(marker.guardian.pid);
    await assert.rejects(recoverProjectLock(root), { code: 'LOCK_QUARANTINED' });
  } finally { await stop(a.child); await rm(root, { recursive: true, force: true }); }
});

test('live registered worker prevents release/clear, then timeout enables clean release', { skip: !supported }, async () => {
  const root = await tempRoot();
  const lock = await acquireProjectLock(root);
  let pid = 0;
  try {
    const script = path.join(root, 'worker.mjs');
    await writeFile(script, 'for await (const c of process.stdin) {} setInterval(()=>{},1000);');
    await lock.beginWorker();
    const result = await runIsolated({ scriptPath: script, workspace: root, timeoutMs: 400, onSpawn: async worker => {
      pid = worker; await lock.registerWorker(worker);
      await assert.rejects(lock.clearWorker(worker), { code: 'LOCK_WORKER_ALIVE' });
      await assert.rejects(lock.release(), { code: 'LOCK_WORKER_PENDING' });
    } });
    assert.equal(result.termination, 'timed_out'); assert.equal(result.stopped, true);
    await lock.clearWorker(pid); await lock.release();
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('symlink lock path fails closed without touching its target', { skip: !supported }, async () => {
  const root = await tempRoot();
  try {
    const target = path.join(root, 'target'); await writeFile(target, 'untouched');
    await symlink(target, path.join(root, '.architect-owner.lock'));
    await assert.rejects(acquireProjectLock(root), { code: 'LOCK_UNAVAILABLE' });
    assert.equal(await readFile(target, 'utf8'), 'untouched');
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('failed session can close its helper while keeping the marker quarantined', { skip: !supported }, async () => {
  const root = await tempRoot();
  try {
    const lock = await acquireProjectLock(root);
    await lock.beginWorker();
    await lock.quarantine();
    await assert.rejects(acquireProjectLock(root), { code: 'LOCK_QUARANTINED' });
    await assert.rejects(recoverProjectLock(root), { code: 'LOCK_QUARANTINED' });
  } finally { await rm(root, { recursive: true, force: true }); }
});
