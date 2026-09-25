import assert from 'node:assert/strict';
import test from 'node:test';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { recoveryCase } from '../fixtures/runtime-crash-child.js';
import { PersistentWorkflowRunner, type RuntimeStatus } from '../src/runtime/runner.js';

const supported = process.platform === 'darwin';
const childScript = fileURLToPath(new URL('../fixtures/runtime-crash-child.js', import.meta.url));
interface ChildMessage { ready?: string; lockRoot?: string; status?: RuntimeStatus; branches?: { complete: boolean; results: Record<string, unknown> } }

async function setup() {
  const root = await mkdtemp(path.join(tmpdir(), 'architect-recovery-test-'));
  const workspace = path.join(root, 'workspace'), control = path.join(root, 'control');
  await mkdir(path.join(workspace, 'src'), { recursive: true });
  await writeFile(path.join(workspace, 'src', 'baseline.txt'), 'unchanged');
  let lockRoot: string | undefined;
  return { root, workspace, control,
    runner: () => { const runner = new PersistentWorkflowRunner(workspace, control); lockRoot = runner.lockRoot; return runner; },
    cleanup: async () => { await rm(root, { recursive: true, force: true }); if (lockRoot) await rm(lockRoot, { recursive: true, force: true }); },
  };
}

async function launch(workspace: string, control: string, action: string): Promise<{ child: ChildProcessWithoutNullStreams; message: ChildMessage; exited: Promise<number | null> }> {
  const child = spawn(process.execPath, [childScript, workspace, control, action], { stdio: ['pipe', 'pipe', 'pipe'] });
  let errors = '';
  child.stderr.on('data', (part: Buffer) => { errors = (errors + part.toString()).slice(0, 8192); });
  const exited = new Promise<number | null>(resolve => child.once('close', resolve));
  const message = await new Promise<ChildMessage>((resolve, reject) => {
    let output = '';
    const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error(`Child timeout (${action}): ${errors}`)); }, 10000);
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('exit', code => { clearTimeout(timer); reject(new Error(`Child exited ${code} (${action}): ${errors}`)); });
    child.stdout.on('data', (part: Buffer) => {
      output += part.toString();
      if (output.includes('\n')) { clearTimeout(timer); resolve(JSON.parse(output.split('\n')[0]!) as ChildMessage); }
    });
  });
  return { child, message, exited };
}

async function waitGone(pid: number): Promise<void> {
  for (let i = 0; i < 150; i++) {
    try { process.kill(pid, 0); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ESRCH') return; throw error; }
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  throw new Error(`PID ${pid} remains alive`);
}

async function crash(child: Awaited<ReturnType<typeof launch>>): Promise<void> {
  assert.ok(child.message.lockRoot);
  const marker = JSON.parse(await readFile(path.join(child.message.lockRoot, '.architect-owner.json'), 'utf8')) as { guardian: { pid: number } };
  child.child.kill('SIGKILL'); await child.exited; await waitGone(marker.guardian.pid);
}

for (const event of ['prepared', 'after-worker', 'before-commit'] as const) {
  test(`hard process crash at ${event} recovers in a fresh process without repeating a committed effect`, { skip: !supported }, async () => {
    const f = await setup();
    const inspector = f.runner(); await inspector.close();
    try {
      const child = await launch(f.workspace, f.control, `crash-${event}`);
      assert.equal(child.message.ready, event); await crash(child);
      let previousInode: number | undefined;
      if (event !== 'prepared') { assert.equal(await readFile(path.join(f.workspace, 'src/output.txt'), 'utf8'), 'done'); previousInode = (await stat(path.join(f.workspace, 'src/output.txt'))).ino; }
      const fresh = await launch(f.workspace, f.control, 'resume');
      assert.equal(await fresh.exited, 0);
      assert.equal(fresh.message.status?.run.state, 'completed', JSON.stringify(fresh.message));
      assert.equal(fresh.message.status?.operations[0]?.state, 'COMMITTED');
      assert.equal(fresh.message.status?.budget.dispatches, 1);
      assert.equal(fresh.message.status?.operations[0]?.attempts.length, 1);
      if (previousInode !== undefined) assert.equal((await stat(path.join(f.workspace, 'src/output.txt'))).ino, previousInode, 'Recovery must verify/reuse the original effect');
      const again = await launch(f.workspace, f.control, 'resume');
      assert.equal(await again.exited, 0); assert.equal(again.message.status?.budget.dispatches, 1);
    } finally { await f.cleanup(); }
  });
}

test('successful planner branch survives a hard crash and is reused by a fresh owner', { skip: !supported }, async () => {
  const f = await setup(); const inspector = f.runner(); await inspector.close();
  try {
    const child = await launch(f.workspace, f.control, 'branch-partial'); await crash(child);
    const fresh = await launch(f.workspace, f.control, 'resume-branches');
    assert.equal(await fresh.exited, 0);
    assert.deepEqual(fresh.message.branches, { complete: true, results: { a: { content: 'durable-branch-a' }, b: { content: 'resumed-branch-b' } } });
    assert.equal(fresh.message.status?.budget.plannerAttempts, 3);
  } finally { await f.cleanup(); }
});

test('queued checkpoint resumes after clean process restart and rejects workflow version mismatch', { skip: !supported }, async () => {
  const f = await setup(); const inspector = f.runner(); await inspector.close();
  try {
    const submitted = await launch(f.workspace, f.control, 'submit-only'); assert.equal(await submitted.exited, 0);
    assert.equal(submitted.message.status?.run.state, 'queued');
    const runner = f.runner();
    try {
      const status = runner.status('run-recovery');
      runner.store.write('run', status.run.runId, { ...status.run, workflowVersion: 'incompatible-workflow/2' });
      assert.throws(() => runner.status('run-recovery'), /CHECKPOINT_VERSION_MISMATCH/);
      await assert.rejects(runner.resume('run-recovery'), /CHECKPOINT_VERSION_MISMATCH/);
      runner.store.write('run', status.run.runId, status.run);
    } finally { await runner.close(); }
    const resumed = await launch(f.workspace, f.control, 'resume'); assert.equal(await resumed.exited, 0);
    assert.equal(resumed.message.status?.run.state, 'completed', JSON.stringify(resumed.message));
  } finally { await f.cleanup(); }
});

test('another control directory cannot bypass the canonical workspace OS lock', { skip: !supported }, async () => {
  const f = await setup(); const inspector = f.runner(); await inspector.close();
  let child: Awaited<ReturnType<typeof launch>> | undefined;
  try {
    child = await launch(f.workspace, f.control, 'crash-prepared');
    const other = new PersistentWorkflowRunner(f.workspace, path.join(f.root, 'other-control'));
    try {
      assert.equal(other.lockRoot, child.message.lockRoot);
      await assert.rejects(other.configure(recoveryCase().config), { code: 'LOCK_BUSY' });
    } finally { await other.close(); }
    await crash(child); child = undefined;
    const recovery = f.runner(); try { assert.equal((await recovery.recoverOwnership()).recovered, true); } finally { await recovery.close(); }
  } finally { if (child) await crash(child); await f.cleanup(); }
});

test('timeout after effect pauses, then reconciles without redispatch', { skip: !supported }, async () => {
  const f = await setup(); const runner = f.runner();
  try {
    const { config, request } = recoveryCase(400);
    await runner.configure(config); await runner.submit(request);
    const timed = await runner.resume(request.runId, { fixtureFault: 'hang-after-effect' });
    assert.equal(timed.run.state, 'paused', JSON.stringify(timed)); assert.equal(timed.run.reason, 'TIMED_OUT');
    assert.equal(timed.operations[0]?.attempts[0]?.status, 'timed_out');
    const inode = (await stat(path.join(f.workspace, 'src/output.txt'))).ino;
    const resumed = await runner.resume(request.runId);
    assert.equal(resumed.run.state, 'completed', JSON.stringify(resumed)); assert.equal(resumed.budget.dispatches, 1);
    assert.equal((await stat(path.join(f.workspace, 'src/output.txt'))).ino, inode);
  } finally { await runner.close(); await f.cleanup(); }
});

test('cancel kills an active worker and durably forbids automatic resume', { skip: !supported }, async () => {
  const f = await setup(); const runner = f.runner();
  try {
    const { config, request } = recoveryCase(); await runner.configure(config); await runner.submit(request);
    const executing = runner.resume(request.runId, { fixtureFault: 'hang-after-effect' });
    for (let i = 0; i < 150; i++) {
      try { await stat(path.join(f.workspace, 'src/output.txt')); break; } catch { await new Promise(resolve => setTimeout(resolve, 10)); }
    }
    await runner.cancel(request.runId); await executing;
    const cancelled = runner.status(request.runId);
    assert.equal(cancelled.run.state, 'cancelled'); assert.equal(cancelled.run.cancelRequested, true);
    assert.equal(cancelled.operations[0]?.attempts[0]?.status, 'cancelled');
    const again = await runner.resume(request.runId);
    assert.equal(again.run.state, 'cancelled'); assert.equal(again.budget.dispatches, 1);
  } finally { await runner.close(); await f.cleanup(); }
});

test('workspace drift before dispatch blocks execution', { skip: !supported }, async () => {
  const f = await setup(); const runner = f.runner();
  try {
    const { config, request } = recoveryCase(); await runner.configure(config); await runner.submit(request);
    await writeFile(path.join(f.workspace, 'src/baseline.txt'), 'unreviewed');
    const status = await runner.resume(request.runId);
    assert.equal(status.run.state, 'blocked'); assert.equal(status.run.reason, 'WORKSPACE_DRIFT');
    assert.equal(status.budget.dispatches, 0); assert.equal(status.operations.length, 0);
    await assert.rejects(readFile(path.join(f.workspace, 'src/output.txt')), { code: 'ENOENT' });
  } finally { await runner.close(); await f.cleanup(); }
});

test('reconciliation must not bless unrelated workspace changes made after effect/crash', { skip: !supported }, async () => {
  const f = await setup(); const inspector = f.runner(); await inspector.close();
  try {
    const child = await launch(f.workspace, f.control, 'crash-after-worker'); await crash(child);
    await writeFile(path.join(f.workspace, 'src/baseline.txt'), 'unreviewed-after-crash');
    const resumed = await launch(f.workspace, f.control, 'resume'); assert.equal(await resumed.exited, 0);
    assert.equal(resumed.message.status?.run.state, 'blocked', 'A matching target must not authorize unrelated workspace drift');
    assert.notEqual(resumed.message.status?.operations[0]?.state, 'COMMITTED');
    assert.equal(resumed.message.status?.budget.dispatches, 1);
  } finally { await f.cleanup(); }
});
