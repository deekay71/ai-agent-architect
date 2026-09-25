import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { runtimeFixture } from '../../fixtures/runtime.js';
import { PersistentWorkflowRunner, type RunRequest } from './runner.js';

const output = (value: unknown): void => { process.stdout.write(JSON.stringify(value, null, 2) + '\n'); };
const summary = (status: ReturnType<PersistentWorkflowRunner['status']>) => ({ mode: 'local-mechanical-fixture', runId: status.run.runId,
  state: status.run.state, reason: status.run.reason, budget: status.budget,
  operations: status.operations.map(x => ({ operationId: x.operationId, state: x.state, attempts: x.attempts.length })),
  checkpointId: status.checkpoint?.checkpointId, unityInvoked: false, productionAuthorized: false });

export async function runtimeCommand(args: string[]): Promise<void> {
  const command = args[0];
  if (command === 'runtime-demo' && args.length === 2) {
    const root = path.resolve(args[1]!);
    // Explicit new directory prevents accidental reuse/replacement of a real project.
    await mkdir(root, { recursive: false, mode: 0o700 });
    const workspace = path.join(root, 'candidate'), control = path.join(root, 'control');
    await mkdir(path.join(workspace, 'src'), { recursive: true });
    const runner = new PersistentWorkflowRunner(workspace, control);
    try {
      const { config, request } = runtimeFixture(); await runner.configure(config);
      await writeFile(path.join(root, 'request.json'), JSON.stringify(request, null, 2) + '\n', { mode: 0o600 });
      await runner.submit(request); const status = await runner.resume(request.runId);
      output({ ...summary(status), workspace, control }); if (status.run.state !== 'completed') process.exitCode = 1;
    } finally { await runner.close(); }
    return;
  }
  if (!['runtime-submit', 'runtime-resume', 'runtime-reconcile', 'runtime-status', 'runtime-recover'].includes(command ?? '') ||
    args.length !== (command === 'runtime-recover' ? 3 : 4)) throw new Error('Invalid runtime command; run --help');
  const runner = new PersistentWorkflowRunner(args[1]!, args[2]!);
  try {
    if (command === 'runtime-recover') { output(await runner.recoverOwnership()); return; }
    if (command === 'runtime-submit') {
      const bytes = await readFile(args[3]!); if (bytes.length > 2 * 1024 * 1024) throw new Error('Input exceeds 2 MiB');
      output(summary(await runner.submit(JSON.parse(bytes.toString('utf8')) as RunRequest))); return;
    }
    if (command === 'runtime-status') { output(summary(runner.status(args[3]!))); return; }
    if (command === 'runtime-reconcile') { const status = await runner.reconcile(args[3]!); output(summary(status)); if (status.run.state === 'blocked') process.exitCode = 1; return; }
    const controller = new AbortController(), stop = (): void => controller.abort();
    process.once('SIGINT', stop); process.once('SIGTERM', stop);
    try {
      const status = await runner.resume(args[3]!, { signal: controller.signal }); output(summary(status));
      if (status.run.state !== 'completed') process.exitCode = 1;
    } finally { process.removeListener('SIGINT', stop); process.removeListener('SIGTERM', stop); }
  } finally { await runner.close(); }
}
