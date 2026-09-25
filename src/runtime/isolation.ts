import { spawn } from 'node:child_process';
import { access, realpath, stat } from 'node:fs/promises';
import path from 'node:path';

export interface IsolatedRunOptions {
  scriptPath: string;
  args?: readonly string[];
  workspace: string;
  /** Trusted caller grants. The workspace is readable by default, never writable by default. */
  readRoots?: readonly string[];
  /** Existing files/directories within workspace only. Symlinks are resolved before granting access. */
  writeRoots?: readonly string[];
  timeoutMs: number;
  signal?: AbortSignal;
  input?: string;
  /** Persist worker identity before its input handshake is delivered. */
  onSpawn?: (pid: number) => void | Promise<void>;
}

export interface IsolatedRunResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  termination: 'exited' | 'timed_out' | 'cancelled';
  pid: number;
  stopped: boolean;
  outputTruncated: boolean;
}

const OUTPUT_LIMIT = 1024 * 1024;
const SANDBOX = '/usr/bin/sandbox-exec';

function sbString(value: string): string {
  if (/[\u0000-\u001f\u007f]/u.test(value)) throw new Error('Sandbox paths must not contain control characters');
  return `"${value.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`;
}

function within(parent: string, child: string): boolean {
  const relative = path.relative(parent, child);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

async function filterFor(file: string): Promise<string> {
  return `(${(await stat(file)).isDirectory() ? 'subpath' : 'literal'} ${sbString(file)})`;
}

function ancestors(file: string): string[] {
  const result: string[] = [];
  let current = path.dirname(file);
  for (;;) {
    result.push(current);
    const parent = path.dirname(current);
    if (parent === current) return result;
    current = parent;
  }
}

function groupStopped(pid: number): boolean {
  try { process.kill(-pid, 0); return false; }
  catch (error) { return (error as NodeJS.ErrnoException).code === 'ESRCH'; }
}

/** macOS-only, default-deny process boundary. Unsupported hosts fail closed. */
export async function runIsolated(options: IsolatedRunOptions): Promise<IsolatedRunResult> {
  if (process.platform !== 'darwin') throw new Error('ISOLATION_UNSUPPORTED: macOS sandbox-exec is required');
  if (!Number.isSafeInteger(options.timeoutMs) || options.timeoutMs <= 0 || options.timeoutMs > 3_600_000) {
    throw new Error('timeoutMs must be an integer between 1 and 3600000');
  }
  await access(SANDBOX);
  const workspace = await realpath(options.workspace);
  if (!(await stat(workspace)).isDirectory()) throw new Error('Workspace must be an existing directory');
  const node = await realpath(process.execPath);
  const script = await realpath(options.scriptPath);
  const readRoots = await Promise.all((options.readRoots ?? [workspace]).map(p => realpath(p)));
  const writeRoots = await Promise.all((options.writeRoots ?? []).map(p => realpath(p)));
  for (const root of writeRoots) {
    if (!within(workspace, root)) throw new Error('Write grant escapes workspace');
  }
  // The worker entry point and Node executable are explicit trusted reads, not their whole directories.
  const reads = [...new Set([
    workspace, script, node, ...readRoots, ...writeRoots,
    '/System/Library', '/usr/lib', '/usr/share/icu', '/dev/null', '/dev/random', '/dev/urandom',
  ])];
  // getcwd/dyld traverse ancestors. Directory entries can be listed; sibling file contents stay denied.
  const directories = new Set(reads.flatMap(ancestors));
  const readFilters = await Promise.all(reads.map(filterFor));
  // workspace itself only grants directory traversal when explicit readRoots were supplied.
  if (options.readRoots !== undefined && !readRoots.includes(workspace) && !writeRoots.includes(workspace)) {
    readFilters[reads.indexOf(workspace)] = `(literal ${sbString(workspace)})`;
  }
  const profile = [
    '(version 1)', '(deny default)',
    `(allow process-exec (literal ${sbString(node)}))`,
    '(deny process-fork)', '(deny network*)', '(deny signal)',
    '(allow sysctl-read)',
    `(allow file-read* ${readFilters.join(' ')} ${[...directories].map(p => `(literal ${sbString(p)})`).join(' ')})`,
    ...(writeRoots.length ? [`(allow file-write* ${(await Promise.all(writeRoots.map(filterFor))).join(' ')})`] : []),
  ].join('\n');

  return new Promise<IsolatedRunResult>((resolve, reject) => {
    const child = spawn(SANDBOX, ['-p', profile, node, '--no-addons', script, ...(options.args ?? [])], {
      cwd: workspace,
      detached: true,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { PATH: '/usr/bin:/bin', HOME: workspace, TMPDIR: workspace, LANG: 'C', TZ: 'UTC' },
    });
    let termination: IsolatedRunResult['termination'] = 'exited';
    let outputBytes = 0;
    let outputTruncated = false;
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let finished = false;
    let callbackError: unknown;
    let timer: NodeJS.Timeout | undefined;
    let reapTimer: NodeJS.Timeout | undefined;
    const pid = child.pid;

    const append = (target: Buffer[], chunk: Buffer): void => {
      const remaining = OUTPUT_LIMIT - outputBytes;
      if (chunk.length > remaining) outputTruncated = true;
      if (remaining > 0) { const part = chunk.subarray(0, remaining); target.push(part); outputBytes += part.length; }
    };
    child.stdout.on('data', (chunk: Buffer) => append(stdout, chunk));
    child.stderr.on('data', (chunk: Buffer) => append(stderr, chunk));
    child.stdin.on('error', () => { /* EPIPE when a worker exits before receiving its request. */ });

    const cleanup = (): void => {
      if (timer) clearTimeout(timer);
      if (reapTimer) clearTimeout(reapTimer);
      options.signal?.removeEventListener('abort', cancel);
    };
    const stop = (reason: IsolatedRunResult['termination']): void => {
      if (finished || !pid) return;
      if (termination === 'exited') termination = reason;
      try { process.kill(-pid, 'SIGKILL'); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ESRCH') callbackError ??= error; }
      // A stuck process is never reported stopped, so its ownership must stay quarantined.
      reapTimer ??= setTimeout(() => {
        if (finished) return;
        finished = true; cleanup();
        child.stdout.destroy(); child.stderr.destroy(); child.stdin.destroy(); child.unref();
        resolve({ pid, exitCode: null, termination, stopped: false, outputTruncated,
          stdout: Buffer.concat(stdout).toString('utf8'), stderr: Buffer.concat(stderr).toString('utf8') });
      }, 5000);
    };
    const cancel = (): void => stop('cancelled');
    child.once('error', error => { if (!finished) { finished = true; cleanup(); reject(error); } });
    child.once('close', exitCode => {
      if (finished) return;
      finished = true; cleanup();
      if (!pid) { reject(new Error('Isolated child did not receive a PID')); return; }
      if (callbackError) { reject(callbackError); return; }
      resolve({ pid, exitCode, termination, stopped: groupStopped(pid), outputTruncated,
        stdout: Buffer.concat(stdout).toString('utf8'), stderr: Buffer.concat(stderr).toString('utf8') });
    });
    if (!pid) return;
    timer = setTimeout(() => stop('timed_out'), options.timeoutMs);
    options.signal?.addEventListener('abort', cancel, { once: true });
    // The fixed trusted worker must wait for stdin; arbitrary JS can run before the handshake.
    Promise.resolve().then(() => options.onSpawn?.(pid)).then(() => {
      if (finished || termination !== 'exited') return;
      if (options.signal?.aborted) { cancel(); return; }
      child.stdin.end(options.input ?? '');
    }, error => { callbackError = error; stop('cancelled'); });
    if (options.signal?.aborted) cancel();
  });
}
