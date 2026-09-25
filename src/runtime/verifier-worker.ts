import { createHash } from 'node:crypto';
import { lstatSync, readFileSync } from 'node:fs';

// This entry point receives a broker-pinned oracle over stdin; the candidate cannot write it.
let input = '';
for await (const chunk of process.stdin) {
  input += String(chunk);
  if (Buffer.byteLength(input) > 1024 * 1024) throw new Error('VERIFIER_INPUT_LIMIT');
}
try {
  const { target, expectedHash, report } = JSON.parse(input);
  const startedAt = new Date().toISOString();
  let passed = false;
  try {
    const stat = lstatSync(target);
    passed = stat.isFile() && !stat.isSymbolicLink() && stat.size <= 512 * 1024 &&
      `sha256:${createHash('sha256').update(readFileSync(target)).digest('hex')}` === expectedHash;
  } catch { /* Missing, inaccessible and non-file outputs all fail. */ }
  process.stdout.write(JSON.stringify({ ...report, startedAt, finishedAt: new Date().toISOString(),
    adapterStatus: 'completed', total: 1, tests: [{ testId: 'content-hash', outcome: passed ? 'pass' : 'fail' }] }));
} catch { process.stderr.write('VERIFIER_FAILED\n'); process.exitCode = 1; }
