/** Fixed, bounded adapter. Request on stdin is released only after broker records worker ownership. */
import { openSync, writeSync, fsyncSync, closeSync, linkSync, unlinkSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

async function input(): Promise<string> {
  let bytes = '';
  for await (const chunk of process.stdin) {
    bytes += String(chunk);
    if (Buffer.byteLength(bytes) > 1024 * 1024) throw new Error('INPUT_LIMIT');
  }
  return bytes;
}
const hash = (text: string): string => `sha256:${createHash('sha256').update(text).digest('hex')}`;
try {
  const value: unknown = JSON.parse(await input());
  if (!value || typeof value !== 'object') throw new Error('INVALID_REQUEST');
  const v = value as Record<string, unknown>;
  if (typeof v.target !== 'string' || typeof v.content !== 'string' || typeof v.operationId !== 'string' ||
    v.tool !== 'fixture.write-once' || Buffer.byteLength(v.content) > 512 * 1024) throw new Error('INVALID_REQUEST');
  const target = v.target, content = v.content;
  if (existsSync(target)) {
    if (readFileSync(target, 'utf8') !== content) throw new Error('POSTCONDITION_CONFLICT');
  } else {
    // Publish a fully written file atomically without clobbering an existing target.
    const tmp = path.join(path.dirname(target), `.effect-${hash(v.operationId).slice(7)}.tmp`);
    const fd = openSync(tmp, 'wx', 0o600);
    try { writeSync(fd, content); fsyncSync(fd); } finally { closeSync(fd); }
    try { linkSync(tmp, target); } finally { unlinkSync(tmp); }
    const dir = openSync(path.dirname(target), 'r');
    try { fsyncSync(dir); } finally { closeSync(dir); }
  }
  // Fault injection is explicit test-only behavior of this registered fixture tool.
  if (v.fault === 'after-effect') process.exit(73);
  if (v.fault === 'hang-after-effect') await new Promise<void>(resolve => setTimeout(resolve, 60000));
  process.stdout.write(JSON.stringify({ operationId: v.operationId, contentHash: hash(content), committed: true })+'\n');
} catch {
  process.stderr.write('FIXTURE_TOOL_FAILED\n'); process.exitCode = 1;
}
