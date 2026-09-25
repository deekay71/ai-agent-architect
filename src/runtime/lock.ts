import { spawn } from 'node:child_process';
import { realpath } from 'node:fs/promises';
import { createInterface } from 'node:readline';

export interface ProjectLock {
  /** Persist uncertainty before spawning. A crash here deliberately requires manual inspection. */
  beginWorker(): Promise<void>;
  /** Call from runIsolated.onSpawn, before sending the worker's request on stdin. */
  registerWorker(pid: number): Promise<void>;
  /** Requires both the recorded PID and its detached process group to be absent. */
  clearWorker(pid: number): Promise<void>;
  /** Refuses release with pending or uncleared workers. Never unlinks the flock file. */
  release(): Promise<void>;
  /** End a failed owner session without granting safe release; durable marker remains. */
  quarantine(): Promise<void>;
}

export class ProjectLockError extends Error {
  constructor(readonly code: string, message: string) { super(message); this.name = 'ProjectLockError'; }
}

// Python's documented fcntl.flock provides the actual OS advisory lock, not a TTL/lockfile heuristic.
// The helper owns it for this session. EOF/crash leaves the durable marker for guarded recovery.
const HELPER = String.raw`
import errno, fcntl, json, os, stat, subprocess, sys, time, uuid

root, mode, timeout_text, owner_text = sys.argv[1:]
owner_pid = int(owner_text)
lock_path = os.path.join(root, '.architect-owner.lock')
marker_path = os.path.join(root, '.architect-owner.json')

class LockFailure(Exception):
    def __init__(self, code, message):
        self.code, self.message = code, message

def send(req_id, **value):
    print(json.dumps(dict(id=req_id, **value), separators=(',', ':')), flush=True)

def alive(pid):
    try:
        os.kill(pid, 0)
        return True
    except ProcessLookupError:
        return False
    except PermissionError:
        return True

def identity(pid):
    birth = subprocess.check_output(['/bin/ps', '-o', 'lstart=', '-p', str(pid)], text=True).strip()
    if not birth or not alive(pid):
        raise LockFailure('LOCK_IDENTITY_UNKNOWN', 'Cannot establish process birth identity')
    return dict(pid=pid, birth=birth)

def sync_directory():
    directory = os.open(root, os.O_RDONLY)
    try: os.fsync(directory)
    finally: os.close(directory)

def persist(marker):
    temporary = marker_path + '.' + uuid.uuid4().hex + '.tmp'
    fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    try:
        with os.fdopen(fd, 'w') as stream:
            json.dump(marker, stream, separators=(',', ':'))
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, marker_path)
        sync_directory()
    finally:
        if os.path.lexists(temporary): os.unlink(temporary)

def read_marker():
    if not os.path.lexists(marker_path): return None
    try:
        fd = os.open(marker_path, os.O_RDONLY | os.O_NOFOLLOW)
        with os.fdopen(fd) as stream:
            if os.fstat(stream.fileno()).st_size > 65536: raise ValueError('oversized marker')
            marker = json.load(stream)
        if set(marker) != {'version', 'owner', 'guardian', 'pending', 'workers'}: raise ValueError('fields')
        if marker['version'] != 1 or type(marker['pending']) is not bool or type(marker['workers']) is not list: raise ValueError('shape')
        for item in [marker['owner'], marker['guardian']] + marker['workers']:
            if set(item) != {'pid', 'birth'} or type(item['pid']) is not int or item['pid'] <= 1 or not isinstance(item['birth'], str) or not item['birth']: raise ValueError('identity')
        return marker
    except Exception:
        raise LockFailure('LOCK_QUARANTINED', 'Unverifiable ownership marker; explicit inspection required')

def remove_marker():
    os.unlink(marker_path)
    sync_directory()

fd = None
try:
    fd = os.open(lock_path, os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
    info = os.fstat(fd)
    if not stat.S_ISREG(info.st_mode) or info.st_nlink != 1:
        raise LockFailure('LOCK_UNSAFE_FILE', 'Lock must be a stable regular file with one link')
    deadline = time.monotonic() + int(timeout_text) / 1000
    while True:
        try:
            fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
            break
        except BlockingIOError:
            if time.monotonic() >= deadline:
                raise LockFailure('LOCK_BUSY', 'Another owner holds the OS lock')
            time.sleep(min(0.025, max(0, deadline-time.monotonic())))
    marker = read_marker()
    if mode == 'recover':
        if marker is not None:
            if marker['pending']:
                raise LockFailure('LOCK_QUARANTINED', 'Spawn may be unregistered; explicit inspection required')
            for item in [marker['owner'], marker['guardian']]:
                if alive(item['pid']):
                    raise LockFailure('LOCK_OWNER_ALIVE', 'Recorded owner or guardian PID exists; no takeover, including PID reuse')
            for worker in marker['workers']:
                if alive(worker['pid']) or alive(-worker['pid']):
                    raise LockFailure('LOCK_WORKER_ALIVE', 'Recorded worker PID or process group still exists')
            remove_marker()
        send(0, ok=True, recovered=marker is not None)
    else:
        if marker is not None:
            raise LockFailure('LOCK_QUARANTINED', 'Previous owner did not release cleanly; recovery required')
        marker = dict(version=1, owner=identity(owner_pid), guardian=identity(os.getpid()), pending=False, workers=[])
        persist(marker)
        send(0, ok=True)
        # stdin belongs to the owner only. A dead owner closes the pipe; a paused owner keeps the flock.
        for line in sys.stdin:
            req_id = -1
            try:
                request = json.loads(line)
                req_id = request['id']
                command = request['command']
                if command == 'begin':
                    if marker['pending'] or marker['workers']:
                        raise LockFailure('LOCK_WORKER_PENDING', 'Only one recorded worker may run at a time')
                    marker['pending'] = True
                    persist(marker)
                elif command == 'register':
                    pid = request['pid']
                    if not marker['pending'] or type(pid) is not int or pid <= 1 or pid in (owner_pid, os.getpid()):
                        raise LockFailure('LOCK_INVALID_WORKER', 'Begin dispatch before registering a worker PID')
                    if os.getpgid(pid) != pid:
                        raise LockFailure('LOCK_INVALID_WORKER', 'Worker must lead its detached process group')
                    worker = identity(pid)
                    marker['workers'] = [worker]
                    marker['pending'] = False
                    persist(marker)
                elif command == 'clear':
                    pid = request['pid']
                    if len(marker['workers']) != 1 or marker['workers'][0]['pid'] != pid:
                        raise LockFailure('LOCK_INVALID_WORKER', 'Worker is not registered to this lock')
                    if alive(pid) or alive(-pid):
                        raise LockFailure('LOCK_WORKER_ALIVE', 'Worker PID or process group still exists')
                    marker['workers'] = []
                    persist(marker)
                elif command == 'release':
                    if marker['pending'] or marker['workers']:
                        raise LockFailure('LOCK_WORKER_PENDING', 'Cannot release while a worker is pending or uncleared')
                    remove_marker()
                    send(req_id, ok=True)
                    break
                else:
                    raise LockFailure('LOCK_PROTOCOL', 'Unknown lock command')
                send(req_id, ok=True)
            except LockFailure as error:
                send(req_id, ok=False, code=error.code, message=error.message)
            except Exception:
                send(req_id, ok=False, code='LOCK_PROTOCOL', message='Lock operation failed; marker retained')
except LockFailure as error:
    send(0, ok=False, code=error.code, message=error.message)
except Exception:
    send(0, ok=False, code='LOCK_UNAVAILABLE', message='OS lock unavailable; no ownership granted')
finally:
    if fd is not None: os.close(fd)
`;

interface Reply { id: number; ok: boolean; code?: string; message?: string; recovered?: boolean }

async function session(root: string, mode: 'acquire' | 'recover', timeoutMs: number) {
  if (process.platform !== 'darwin') throw new ProjectLockError('LOCK_UNSUPPORTED', 'This lock implementation is verified on macOS only');
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 0 || timeoutMs > 10_000) throw new Error('Lock timeout must be between 0 and 10000ms');
  const canonicalRoot = await realpath(root);
  const child = spawn('/usr/bin/python3', ['-I', '-u', '-c', HELPER, canonicalRoot, mode, String(timeoutMs), String(process.pid)], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { PATH: '/usr/bin:/bin', LANG: 'C', TZ: 'UTC' },
  });
  let nextId = 0;
  let closed = false;
  const pending = new Map<number, { resolve: (reply: Reply) => void; reject: (error: Error) => void }>();
  let stderr = '';
  child.stderr.on('data', (chunk: Buffer) => { stderr = (stderr + chunk.toString('utf8')).slice(0, 4096); });
  child.stdin.on('error', () => {});
  const lines = createInterface({ input: child.stdout });
  const rejectAll = (error: Error): void => { for (const entry of pending.values()) entry.reject(error); pending.clear(); };
  lines.on('line', line => {
    try {
      const reply = JSON.parse(line) as Reply;
      const entry = pending.get(reply.id);
      if (!entry) return;
      pending.delete(reply.id);
      if (reply.ok) entry.resolve(reply);
      else entry.reject(new ProjectLockError(reply.code ?? 'LOCK_PROTOCOL', reply.message ?? 'Lock helper refused operation'));
    } catch { rejectAll(new ProjectLockError('LOCK_PROTOCOL', 'Invalid response from OS lock helper')); }
  });
  const ended = new Promise<void>(resolve => {
    child.once('error', error => rejectAll(error));
    child.once('close', () => {
      closed = true;
      rejectAll(new ProjectLockError('LOCK_HELPER_EXITED', `OS lock helper exited; marker may require recovery${stderr ? ': ' + stderr : ''}`));
      lines.close(); resolve();
    });
  });
  const receive = (id: number): Promise<Reply> => new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
  const ready = receive(0);
  // Bound startup even if the system helper itself is unavailable/hung.
  const startupTimer = setTimeout(() => {
    rejectAll(new ProjectLockError('LOCK_HELPER_TIMEOUT', 'OS lock helper startup timed out'));
    child.kill('SIGKILL');
  }, timeoutMs + 5000);
  let initial: Reply;
  try { initial = await ready; } catch (error) { child.stdin.end(); await ended; throw error; }
  finally { clearTimeout(startupTimer); }

  const request = async (command: string, pid?: number): Promise<void> => {
    if (closed) throw new ProjectLockError('LOCK_CLOSED', 'OS lock helper is no longer alive');
    const id = ++nextId;
    const reply = receive(id);
    const timer = setTimeout(() => {
      const entry = pending.get(id);
      pending.delete(id);
      entry?.reject(new ProjectLockError('LOCK_HELPER_TIMEOUT', 'OS lock command timed out; ownership remains quarantined'));
      child.kill('SIGKILL');
    }, 5000);
    child.stdin.write(JSON.stringify({ id, command, ...(pid === undefined ? {} : { pid }) }) + '\n');
    try { await reply; } finally { clearTimeout(timer); }
  };
  return { initial, request, ended, closeInput: () => child.stdin.end() };
}

/** The root runtime queues work; this lock refuses independent/paused owners, with no lease expiry. */
export async function acquireProjectLock(root: string, options: { timeoutMs?: number } = {}): Promise<ProjectLock> {
  const helper = await session(root, 'acquire', options.timeoutMs ?? 100);
  let released = false;
  return {
    beginWorker: () => helper.request('begin'),
    registerWorker: pid => helper.request('register', pid),
    clearWorker: pid => helper.request('clear', pid),
    release: async () => {
      if (released) return;
      await helper.request('release');
      helper.closeInput(); await helper.ended; released = true;
    },
    quarantine: async () => { helper.closeInput(); await helper.ended; released = true; },
  };
}

/** Explicit crash recovery. Never kills processes or clears an uncertain spawn/PID reuse. */
export async function recoverProjectLock(root: string): Promise<{ recovered: boolean }> {
  const helper = await session(root, 'recover', 100);
  helper.closeInput(); await helper.ended;
  return { recovered: helper.initial.recovered === true };
}
