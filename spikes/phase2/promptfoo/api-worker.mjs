import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
// Pin the process-local working directory so API and CLI resolve the same files.
process.chdir(path.join(root, 'promptfoo'));
const { evaluate } = await import('promptfoo');
const config = JSON.parse(await readFile(path.join(root, 'promptfoo/promptfooconfig.json'), 'utf8'));
const record = await evaluate({ ...config, basePath: path.join(root, 'promptfoo') }, {
  cache: false, maxConcurrency: 1, showProgressBar: false, silent: true,
});
const summary = await record.toEvaluateSummary();
await writeFile(path.join(root, 'evidence/promptfoo-api-results.json'), JSON.stringify(summary, null, 2) + '\n');
console.log(JSON.stringify({ stats: summary.stats, cases: summary.results.length }));
