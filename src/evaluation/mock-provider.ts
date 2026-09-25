import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { canonicalJson, digest } from '../contracts/canonical.js';
import { runIsolated } from '../runtime/isolation.js';
import type { ModelProvider, ModelRequest } from '../providers/types.js';

/** The counter is deliberately labelled simulated; never substitutes for a provider tokenizer. */
export function createSandboxMockProvider(root: string): ModelProvider {
  mkdirSync(root, { recursive: true, mode: 0o700 });
  const count = (request: ModelRequest) => Math.ceil(Buffer.byteLength(canonicalJson(request), 'utf8') / 4);
  return { id: 'sandbox-abstaining-fixture/1', assurance: 'mock',
    async countInput(request) { return { inputTokens: count(request), requestDigest: digest(request), counterId: 'mock-byte-div4-NOT-tokenizer' }; },
    async respond(request) {
      const started = performance.now();
      const r = await runIsolated({ scriptPath: fileURLToPath(new URL('./mock-worker.js', import.meta.url)), workspace: root,
        readRoots: [], input: JSON.stringify(request), timeoutMs: 10_000 });
      if (r.exitCode !== 0 || !r.stopped || r.outputTruncated) throw new Error('MOCK_WORKER_FAILED');
      const output: unknown = JSON.parse(r.stdout), inputTokens = count(request), outputTokens = Math.ceil(Buffer.byteLength(r.stdout, 'utf8') / 4);
      return { status: outputTokens > request.maxOutputTokens ? 'incomplete' : 'completed', output, model: request.model,
        responseId: `mock:${digest({ request, output })}`, requestId: null,
        usage: { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens, cachedInputTokens: 0, reasoningTokens: 0 },
        latencyMs: performance.now() - started, requestDigest: digest(request), issues: ['MOCK_NOT_MODEL_EVIDENCE'] };
    },
  };
}
