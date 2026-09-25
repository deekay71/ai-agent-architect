import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createMemoryExplorerFixture } from '../../fixtures/memory-explorer.js';
import { asFileSnapshot, projectExplorer, type ExplorerScope } from './projection.js';
import { startExplorer } from './server.js';
import type { ContextWindow } from '../context/engine.js';

const output = (value: unknown) => process.stdout.write(JSON.stringify(value, null, 2) + '\n');
const writeJson = async (file: string, value: unknown) => writeFile(file, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
async function readJson(file: string): Promise<unknown> {
  const bytes = await readFile(file); if (bytes.length > 20 * 1024 * 1024) throw new Error('Explorer input exceeds 20 MiB'); return JSON.parse(bytes.toString('utf8')) as unknown;
}
export async function memoryCommand(args: string[]): Promise<void> {
  if (args[0] === 'memory-demo' && args.length === 2) {
    const root = path.resolve(args[1]!); await mkdir(root, { recursive: false, mode: 0o700 });
    const fixture = await createMemoryExplorerFixture(path.join(root, 'canonical'));
    await writeJson(path.join(root, 'snapshot.json'), fixture.input); await writeJson(path.join(root, 'scope.json'), fixture.namespace);
    await writeJson(path.join(root, 'context-windows.json'), fixture.windows); await writeJson(path.join(root, 'report.json'), fixture.report);
    output({ ...fixture.report, root, snapshot: path.join(root, 'snapshot.json'), scope: path.join(root, 'scope.json'), markdown: fixture.markdownDirectory }); return;
  }
  if (args[0] === 'memory-view' && args.length >= 3 && args.length <= 5) {
    const file = path.resolve(args[1]!), scope = await readJson(args[2]!) as ExplorerScope;
    const load = async () => asFileSnapshot(await readJson(file));
    projectExplorer(await load(), scope);
    const port = args[3] ? Number(args[3]) : 0; if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Invalid port');
    const windowsFile = args[4] ? path.resolve(args[4]) : null;
    const server = await startExplorer({ scope, load, port,
      ...(windowsFile ? { loadProofWindows: async () => await readJson(windowsFile) as ContextWindow[] } : {}) });
    output({ url: server.url, readOnly: true, source: file, proofWindows: windowsFile, scope });
    for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => { void server.close(); }); return;
  }
  throw new Error('Usage: memory-demo <new-directory> | memory-view <snapshot.json> <scope.json> [port] [context-windows.json]');
}
