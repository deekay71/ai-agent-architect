import test from 'node:test';
import assert from 'node:assert/strict';
import { digest } from '../src/contracts/canonical.js';
import { createOpenAIProvider, OpenAIProviderError } from '../src/providers/openai.js';
import { estimateCostMicros, reserveCostMicros } from '../src/providers/pricing.js';
import type { ModelPricing, ModelRequest, ModelUsage } from '../src/providers/types.js';

const request: ModelRequest = {
  model: 'pinned-test-model-2026-09-25', instructions: 'Use only the provided evidence.', input: 'Có đủ bằng chứng?',
  maxOutputTokens: 100, schemaName: 'decision', reasoningEffort: 'low',
  schema: { type: 'object', properties: { answer: { type: 'string' } }, required: ['answer'], additionalProperties: false },
};
const count = { object: 'response.input_tokens', input_tokens: 30 };
function response(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'resp_test', object: 'response', model: request.model, status: 'completed', service_tier: 'default',
    output: [{ type: 'reasoning', summary: [] }, { type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: '{"answer":"unknown"}' }] }],
    usage: { input_tokens: 30, input_tokens_details: { cached_tokens: 10 }, output_tokens: 20, output_tokens_details: { reasoning_tokens: 5 }, total_tokens: 50 },
    ...overrides,
  };
}
function mock(...replies: unknown[]) {
  const calls: { url: string; init: RequestInit | undefined; body: Record<string, unknown> }[] = [];
  const transport: typeof fetch = async (url, init) => {
    calls.push({ url: String(url), init, body: JSON.parse(String(init?.body)) as Record<string, unknown> });
    const reply = replies.shift();
    assert.notEqual(reply, undefined, 'unexpected transport call');
    if (reply instanceof Response) return reply;
    return new Response(JSON.stringify(reply), { headers: { 'content-type': 'application/json', 'x-request-id': 'req_test' } });
  };
  return { provider: createOpenAIProvider({ apiKey: 'unit-test-not-a-key', fetch: transport }), calls };
}

function deferredTransport() {
  const calls: { url: string; resolve: (value: Response) => void }[] = [];
  const transport: typeof fetch = async url => new Promise<Response>(resolve => { calls.push({ url: String(url), resolve }); });
  const provider = createOpenAIProvider({ apiKey: 'unit-test-not-a-key', fetch: transport });
  const release = (index: number, body: unknown, status = 200): void => {
    calls[index]!.resolve(new Response(JSON.stringify(body), { status, headers: { 'x-request-id': 'req_count_race' } }));
  };
  return { provider, calls, release };
}

test('OpenAI adapter pins every input-bearing field in count and response, with no storage or truncation', async () => {
  const { provider, calls } = mock(count, response());
  assert.equal(provider.assurance, 'mock');
  const counted = await provider.countInput(request);
  assert.equal(counted.requestDigest, digest(request));
  assert.equal(counted.inputTokens, 30);
  assert.match(counted.counterId, /^mock:/);
  const result = await provider.respond(request);
  assert.equal(result.status, 'completed');
  assert.deepEqual(result.output, { answer: 'unknown' });
  assert.deepEqual(result.usage, { inputTokens: 30, outputTokens: 20, cachedInputTokens: 10, reasoningTokens: 5, totalTokens: 50 });
  assert.equal(result.requestDigest, counted.requestDigest);
  assert.equal(result.requestId, 'req_test');
  assert.ok(result.latencyMs >= 0);
  assert.deepEqual(calls.map(call => call.url), ['https://api.openai.com/v1/responses/input_tokens', 'https://api.openai.com/v1/responses']);
  const generation = calls[1]!.body;
  assert.deepEqual(generation.text, { format: { type: 'json_schema', name: request.schemaName, schema: request.schema, strict: true } });
  assert.deepEqual(generation.reasoning, { effort: 'low' });
  assert.equal(generation.truncation, 'disabled');
  assert.deepEqual(generation, { ...calls[0]!.body, max_output_tokens: 100, store: false, stream: false, service_tier: 'default' });
  assert.ok(calls.every(call => call.init?.redirect === 'error' && call.init.method === 'POST'));
  assert.ok(!JSON.stringify(result).includes('unit-test-not-a-key'));
});

test('an injected transport never claims provider assurance, and a missing explicit key fails without dispatch', () => {
  assert.throws(() => createOpenAIProvider({ apiKey: '' }), /OPENAI_API_KEY_REQUIRED/);
  assert.throws(() => createOpenAIProvider({ apiKey: 'secret\nheader' }), /OPENAI_API_KEY_REQUIRED/);
  assert.throws(() => createOpenAIProvider({ apiKey: 'test', timeoutMs: 0 }), /OPENAI_OPTIONS_INVALID/);
  assert.equal(createOpenAIProvider({ apiKey: 'test', fetch: async () => new Response() }).assurance, 'mock');
});

test('respond requires an exact successful preflight count; changes cannot reuse another request admission', async () => {
  const { provider, calls } = mock(count);
  await assert.rejects(provider.respond(request), /OPENAI_COUNT_REQUIRED/);
  await provider.countInput(request);
  for (const changed of [
    { ...request, input: 'different' }, { ...request, instructions: 'different' }, { ...request, model: 'different' },
    { ...request, maxOutputTokens: 101 }, { ...request, schemaName: 'different' }, { ...request, reasoningEffort: 'high' as const },
    { ...request, schema: { type: 'object' } },
  ]) await assert.rejects(provider.respond(changed), /OPENAI_COUNT_REQUIRED/);
  assert.equal(calls.length, 1);
});

test('request snapshots do not race caller mutations during count', async () => {
  let release: ((value: Response) => void) | undefined;
  let calls = 0;
  const provider = createOpenAIProvider({ apiKey: 'test', fetch: async () => { calls++; return new Promise(resolve => { release = resolve; }); } });
  const mutable = structuredClone(request); const expected = digest(mutable);
  const pending = provider.countInput(mutable);
  mutable.input = 'mutated'; mutable.schema.description = 'new';
  release!(new Response(JSON.stringify(count)));
  assert.equal((await pending).requestDigest, expected);
  await assert.rejects(provider.respond(mutable), /OPENAI_COUNT_REQUIRED/);
  assert.equal(calls, 1);
});

test('older count success cannot admit generation while a newer recount is pending or after it fails', async () => {
  const { provider, calls, release } = deferredTransport();
  const older = assert.rejects(provider.countInput(request), /OPENAI_COUNT_SUPERSEDED/);
  const newer = assert.rejects(provider.countInput(request), /OPENAI_HTTP_ERROR/);
  release(0, count);
  await older;
  await assert.rejects(provider.respond(request), /OPENAI_COUNT_REQUIRED/);
  release(1, { error: 'private body' }, 429);
  await newer;
  await assert.rejects(provider.respond(request), /OPENAI_COUNT_REQUIRED/);
  assert.equal(calls.length, 2);
});

test('newer recount failure cannot be undone by a late older count success', async () => {
  const { provider, calls, release } = deferredTransport();
  const older = assert.rejects(provider.countInput(request), /OPENAI_COUNT_SUPERSEDED/);
  const newer = assert.rejects(provider.countInput(request), /OPENAI_HTTP_ERROR/);
  release(1, { error: 'private body' }, 429);
  await newer;
  release(0, count);
  await older;
  await assert.rejects(provider.respond(request), /OPENAI_COUNT_REQUIRED/);
  assert.equal(calls.length, 2);
});

test('a late older count cannot overwrite the count used for the latest successful admission', async () => {
  const { provider, calls, release } = deferredTransport();
  const older = assert.rejects(provider.countInput(request), /OPENAI_COUNT_SUPERSEDED/);
  const newer = provider.countInput(request);
  release(1, { ...count, input_tokens: 31 });
  assert.equal((await newer).inputTokens, 31);
  release(0, count);
  await older;
  const generation = provider.respond(request);
  release(2, response({ usage: { input_tokens: 31, input_tokens_details: { cached_tokens: 10 }, output_tokens: 20, output_tokens_details: { reasoning_tokens: 5 }, total_tokens: 51 } }));
  assert.equal((await generation).status, 'completed');
  assert.equal(calls.length, 3);
});

test('an older count failure cannot remove a newer successful admission', async () => {
  const { provider, calls, release } = deferredTransport();
  const older = assert.rejects(provider.countInput(request), /OPENAI_HTTP_ERROR/);
  const newer = provider.countInput(request);
  release(1, count);
  await newer;
  release(0, { error: 'private body' }, 429);
  await older;
  const generation = provider.respond(request);
  release(2, response());
  assert.equal((await generation).status, 'completed');
  assert.equal(calls.length, 3);
});

test('a recount revokes prior admission immediately and its completion restores exact sequential admission', async () => {
  const { provider, calls, release } = deferredTransport();
  const initial = provider.countInput(request);
  release(0, count);
  await initial;
  const recount = provider.countInput(request);
  await assert.rejects(provider.respond(request), /OPENAI_COUNT_REQUIRED/);
  release(1, count);
  await recount;
  const generation = provider.respond(request);
  release(2, response());
  assert.equal((await generation).status, 'completed');
  assert.equal(calls.length, 3);
});

test('independent request counts remain concurrent and do not revoke each other', async () => {
  const { provider, calls, release } = deferredTransport();
  const different = { ...request, input: 'An independent request.' };
  const pending = assert.rejects(provider.countInput(request), /OPENAI_HTTP_ERROR/);
  const independent = provider.countInput(different);
  assert.equal(calls.length, 2, 'both count requests dispatch before either completes');
  release(1, count);
  await independent;
  const generation = provider.respond(different);
  assert.equal(calls.length, 3, 'independent generation is admitted while the first count is pending');
  release(2, response());
  assert.equal((await generation).status, 'completed');
  release(0, { error: 'private body' }, 429);
  await pending;
  await assert.rejects(provider.respond(request), /OPENAI_COUNT_REQUIRED/);
  assert.equal(calls.length, 3);
});

test('malformed requests, non-JSON values, and extra provider capabilities fail before network', async () => {
  const { provider, calls } = mock();
  for (const bad of [
    { ...request, model: '../model' }, { ...request, maxOutputTokens: -1 }, { ...request, maxOutputTokens: 1.5 },
    { ...request, schemaName: 'bad name' }, { ...request, schema: [] }, { ...request, schema: { type: 'array' } },
    { ...request, reasoningEffort: 'invented' }, { ...request, tools: [{ type: 'web_search' }] },
    { ...request, instructions: undefined }, { ...request, schema: { type: 'object', value: Infinity } },
  ]) await assert.rejects(provider.countInput(bad as unknown as ModelRequest), /OPENAI_REQUEST_INVALID/);
  assert.equal(calls.length, 0);
});

test('input count must be a valid typed nonnegative safe integer, never guessed from bytes', async () => {
  for (const bad of [{}, { input_tokens: 30 }, { ...count, input_tokens: null }, { ...count, input_tokens: -1 }, { ...count, input_tokens: 0.5 }, { ...count, input_tokens: Number.MAX_SAFE_INTEGER + 1 }]) {
    const { provider, calls } = mock(bad);
    await assert.rejects(provider.countInput(request), /OPENAI_COUNT_INVALID/);
    await assert.rejects(provider.respond(request), /OPENAI_COUNT_REQUIRED/);
    assert.equal(calls.length, 1);
  }
});

test('actual usage is authoritative: a count mismatch fails closed but preserves billed usage', async () => {
  const actual = response(); const usage = actual.usage as Record<string, unknown>;
  usage.input_tokens = 31; usage.total_tokens = 51;
  const { provider } = mock(count, actual); await provider.countInput(request);
  const result = await provider.respond(request);
  assert.equal(result.status, 'incomplete'); assert.equal(result.output, null);
  assert.equal(result.usage?.inputTokens, 31); assert.deepEqual(result.issues, ['INPUT_COUNT_MISMATCH']);
});

test('a substituted model or service tier cannot produce accepted output', async () => {
  for (const [overrides, code] of [[{ model: 'cheaper-substitute' }, 'MODEL_MISMATCH'], [{ service_tier: 'priority' }, 'SERVICE_TIER_MISMATCH']] as const) {
    const { provider } = mock(count, response(overrides)); await provider.countInput(request);
    const result = await provider.respond(request);
    assert.equal(result.status, 'incomplete'); assert.equal(result.output, null); assert.ok(result.issues?.includes(code));
    assert.equal(result.usage, null);
  }
});

test('missing or inconsistent usage is unknown, including missing cached/reasoning details and cache-write surcharges', async () => {
  const good = response().usage as Record<string, unknown>;
  for (const usage of [null, {}, { ...good, total_tokens: 1 }, { ...good, input_tokens: '30' },
    { ...good, input_tokens_details: {} }, { ...good, output_tokens_details: null },
    { ...good, input_tokens_details: { cached_tokens: 31 } }, { ...good, output_tokens_details: { reasoning_tokens: 21 } },
    { ...good, input_tokens_details: { cached_tokens: 10, cache_write_tokens: 1 } },
  ]) {
    const { provider } = mock(count, response({ usage })); await provider.countInput(request);
    const result = await provider.respond(request);
    assert.equal(result.status, 'incomplete'); assert.equal(result.output, null); assert.equal(result.usage, null);
    assert.ok(result.issues?.includes('USAGE_UNKNOWN'));
  }
});

test('incomplete, refused and malformed structured output never become a completed answer', async () => {
  const message = (content: unknown[]) => [{ type: 'message', role: 'assistant', status: 'completed', content }];
  const cases: { overrides: Record<string, unknown>; expected: string }[] = [
    { overrides: { status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' } }, expected: 'incomplete' },
    { overrides: { status: 'failed', error: { message: 'private error body' } }, expected: 'incomplete' },
    { overrides: { output: message([{ type: 'refusal', refusal: 'cannot answer' }]) }, expected: 'refused' },
    { overrides: { output: message([{ type: 'output_text', text: 'not json' }]) }, expected: 'incomplete' },
    { overrides: { output: message([{ type: 'output_text', text: '[]' }]) }, expected: 'incomplete' },
    { overrides: { output: [] }, expected: 'incomplete' },
    { overrides: { output: [{ type: 'function_call', arguments: '{}' }] }, expected: 'incomplete' },
    { overrides: { output: message([{ type: 'output_text', text: '{}' }, { type: 'output_text', text: '{}' }]) }, expected: 'incomplete' },
  ];
  for (const item of cases) {
    const { provider } = mock(count, response(item.overrides)); await provider.countInput(request);
    const result = await provider.respond(request);
    assert.equal(result.status, item.expected); assert.equal(result.output, null); assert.equal(result.usage?.outputTokens, 20);
    assert.ok(!JSON.stringify(result).includes('private error body'));
  }
});

test('reasoning tokens are already within output tokens and output-limit violations are not accepted', async () => {
  const usage = { input_tokens: 30, input_tokens_details: { cached_tokens: 0 }, output_tokens: 101, output_tokens_details: { reasoning_tokens: 100 }, total_tokens: 131 };
  const { provider } = mock(count, response({ usage })); await provider.countInput(request);
  const result = await provider.respond(request);
  assert.equal(result.status, 'incomplete'); assert.equal(result.usage?.outputTokens, 101);
  assert.ok(result.issues?.includes('OUTPUT_LIMIT_EXCEEDED'));
});

test('HTTP failures are single attempts and hide body, key and provider text', async () => {
  const { provider, calls } = mock(new Response('do not leak this secret', { status: 429, headers: { 'x-request-id': 'req_rate_limit' } }));
  await assert.rejects(provider.countInput(request), error => {
    assert.ok(error instanceof OpenAIProviderError);
    assert.equal(error.message, 'OPENAI_HTTP_ERROR'); assert.equal(error.httpStatus, 429); assert.equal(error.requestId, 'req_rate_limit');
    assert.ok(!JSON.stringify(error).includes('secret')); return true;
  });
  assert.equal(calls.length, 1);
});

test('transport errors and redirects never expose raw details or follow another host', async () => {
  let calls = 0;
  const provider = createOpenAIProvider({ apiKey: 'test', fetch: async () => { calls++; throw new Error('secret credential or request body'); } });
  await assert.rejects(provider.countInput(request), /^OpenAIProviderError: OPENAI_TRANSPORT_ERROR$/);
  assert.equal(calls, 1);
  const redirected = mock(new Response(null, { status: 302, headers: { location: 'https://example.com/collect' } }));
  await assert.rejects(redirected.provider.countInput(request), /OPENAI_HTTP_ERROR/);
  assert.equal(redirected.calls.length, 1); assert.equal(redirected.calls[0]!.init?.redirect, 'error');
});

test('invalid JSON/UTF-8 and response size limits fail without including response bytes', async () => {
  const malformed = mock(new Response('SENSITIVE malformed json'));
  await assert.rejects(malformed.provider.countInput(request), /^OpenAIProviderError: OPENAI_RESPONSE_INVALID$/);
  const utf8 = mock(new Response(new Uint8Array([0xc3, 0x28])));
  await assert.rejects(utf8.provider.countInput(request), /OPENAI_RESPONSE_INVALID/);
  for (const headers of [{}, { 'content-length': '100000' }]) {
    const provider = createOpenAIProvider({ apiKey: 'test', maxResponseBytes: 20, fetch: async () => new Response('x'.repeat(30), { headers }) });
    await assert.rejects(provider.countInput(request), /OPENAI_RESPONSE_TOO_LARGE/);
  }
  const small = createOpenAIProvider({ apiKey: 'test', maxRequestBytes: 10, fetch: async () => { assert.fail('must not dispatch'); } });
  await assert.rejects(small.countInput(request), /OPENAI_REQUEST_TOO_LARGE/);
});

test('deadline bounds both pending fetch and a stalled response stream', async () => {
  for (const transport of [
    async () => new Promise<Response>(() => undefined),
    async () => new Response(new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new TextEncoder().encode('{')); } })),
  ]) {
    const provider = createOpenAIProvider({ apiKey: 'test', timeoutMs: 20, fetch: transport });
    await assert.rejects(provider.countInput(request), /^OpenAIProviderError: OPENAI_TIMEOUT$/);
  }
});

const pricing: ModelPricing = {
  model: request.model, inputPerMillionUsd: 2, cachedInputPerMillionUsd: 0.2, outputPerMillionUsd: 10,
  source: 'https://developers.openai.com/api/docs/pricing', observedAt: '2026-09-25',
};
const usage: ModelUsage = { inputTokens: 100, outputTokens: 20, cachedInputTokens: 40, reasoningTokens: 10, totalTokens: 120 };

test('pinned pricing calculates exact decimal integer USD micros and includes reasoning only once', () => {
  assert.equal(estimateCostMicros(usage, pricing), 328); // 60*2 + 40*.2 + 20*10.
  assert.equal(reserveCostMicros(100, 200, pricing), 2200);
  assert.equal(estimateCostMicros({ inputTokens: 1, outputTokens: 0, cachedInputTokens: 0, reasoningTokens: 0, totalTokens: 1 }, { ...pricing, inputPerMillionUsd: 0.1 }), 1);
  assert.equal(estimateCostMicros({ inputTokens: 10, outputTokens: 0, cachedInputTokens: 0, reasoningTokens: 0, totalTokens: 10 }, { ...pricing, inputPerMillionUsd: 0.1 }), 1);
  assert.equal(reserveCostMicros(10, 0, { ...pricing, cachedInputPerMillionUsd: 3 }), 30);
});

test('cost estimates reject unknown, malformed or overflowing rates and counts rather than assigning zero', () => {
  for (const invalid of [NaN, Infinity, -1, 1e-10]) assert.throws(() => estimateCostMicros(usage, { ...pricing, inputPerMillionUsd: invalid }), /MODEL_COST_INPUT_INVALID/);
  assert.throws(() => estimateCostMicros({ ...usage, cachedInputTokens: 101 }, pricing), /MODEL_COST_INPUT_INVALID/);
  assert.throws(() => estimateCostMicros({ ...usage, totalTokens: 0 }, pricing), /MODEL_COST_INPUT_INVALID/);
  assert.throws(() => reserveCostMicros(Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER, pricing), /MODEL_COST_INPUT_INVALID/);
  assert.throws(() => reserveCostMicros(1, 1, { ...pricing, observedAt: 'not-a-date' }), /MODEL_COST_INPUT_INVALID/);
});
