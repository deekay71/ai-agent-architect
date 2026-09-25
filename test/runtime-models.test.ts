import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { FixedModelAdapter, HttpModelAdapter } from '../src/runtime/models.js';
import { createRuntimeEvaluationFixture } from '../fixtures/runtime-authority.js';

test('fixed model clones and validates its plan', async () => {
  const { records } = createRuntimeEvaluationFixture(); const adapter = new FixedModelAdapter(records.plan);
  const result = await adapter.plan(records.task); result.version++;
  assert.equal((await adapter.plan(records.task)).version, records.plan.version);
});

test('HTTP model adapter invokes a real local protocol endpoint and handles split UTF-8', async t => {
  const { records } = createRuntimeEvaluationFixture(); let seen = '';
  const server = createServer(async (req, res) => {
    for await (const chunk of req) seen += String(chunk);
    assert.equal(req.method, 'POST');
    const bytes = Buffer.from(JSON.stringify(records.plan)); res.writeHead(200, { 'content-type': 'application/json' });
    for (let i = 0; i < bytes.length; i++) res.write(bytes.subarray(i, i + 1)); res.end();
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => { server.closeAllConnections(); server.close(); });
  const address = server.address(); assert.ok(address && typeof address !== 'string'); const origin = `http://127.0.0.1:${address.port}`;
  const adapter = new HttpModelAdapter({ endpoint: `${origin}/plan`, allowedOrigin: origin, timeoutMs: 2000 });
  assert.deepEqual(await adapter.plan(records.task), records.plan); assert.equal(JSON.parse(seen).task.taskId, records.task.taskId);
});

test('HTTP adapter rejects broad origins and hides provider secrets/errors', async () => {
  assert.throws(() => new HttpModelAdapter({ endpoint: 'http://example.com/plan', allowedOrigin: 'http://example.com', timeoutMs: 100 }), /MODEL_ENDPOINT_DENIED/);
  const adapter = new HttpModelAdapter({ endpoint: 'https://example.com/plan', allowedOrigin: 'https://example.com', timeoutMs: 100 },
    async () => { throw new Error('FAKE_PROVIDER_SECRET'); });
  await assert.rejects(adapter.plan(createRuntimeEvaluationFixture().records.task), /^Error: MODEL_ADAPTER_UNKNOWN$/);
});

test('HTTP adapter timeout becomes unknown; empty or malformed results never become a plan', async () => {
  const { records } = createRuntimeEvaluationFixture();
  const transport: typeof fetch = async (_url, init) => new Promise((_resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('transport stalled')), 200);
    init?.signal?.addEventListener('abort', () => { clearTimeout(timer); reject(new Error('timeout')); });
  });
  const config = { endpoint: 'https://example.com/plan', allowedOrigin: 'https://example.com', timeoutMs: 30 };
  await assert.rejects(new HttpModelAdapter(config, transport).plan(records.task), /MODEL_ADAPTER_UNKNOWN/);
  await assert.rejects(new HttpModelAdapter(config, async () => new Response('{}')).plan(records.task), /MODEL_ADAPTER_UNKNOWN/);
});
