import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname } from 'node:path';
import { digest } from '../src/contracts/canonical.js';
import { CODEX_CLI_VERSION, CODEX_LAUNCH_POLICY_DIGEST, codexChildEnvironment, createCodexTransport,
  renderCodexRequest, runCodexProcess } from '../src/providers/codex.js';
import type { CodexProcessInvocation, CodexProcessResult, CodexProcessRunner } from '../src/providers/codex.js';
import type { ModelRequest } from '../src/providers/types.js';

const request: ModelRequest = { model: 'gpt-6-luna', instructions: 'Read only the supplied context.', input: 'Một thông tin.',
  maxOutputTokens: 40, reasoningEffort: 'medium', schemaName: 'answer',
  schema: { type: 'object', properties: { answer: { type: 'string' } }, required: ['answer'], additionalProperties: false } };
const usage = { input_tokens: 100, cached_input_tokens: 20, output_tokens: 10, reasoning_output_tokens: 2 };
const ok = (stdout = '', stderr = ''): CodexProcessResult => ({ exitCode: 0, stdout, stderr, stopReason: null });
function events(output: unknown = { answer: 'Một' }): unknown[] {
  return [{ type: 'thread.started', thread_id: 'thread-123' }, { type: 'turn.started' },
    { type: 'item.completed', item: { id: 'reason-1', type: 'reasoning', text: 'PRIVATE REASONING DO NOT STORE' } },
    { type: 'item.completed', item: { id: 'answer-1', type: 'agent_message', text: JSON.stringify(output) } },
    { type: 'turn.completed', usage }];
}
function fakeRunner(stream: unknown[] = events(), inspect?: (invocation: CodexProcessInvocation) => Promise<void>): { calls: CodexProcessInvocation[]; runner: CodexProcessRunner } {
  const calls: CodexProcessInvocation[] = [];
  return { calls, runner: async invocation => {
    calls.push(invocation);
    if (invocation.args[0] === '--version') return ok(CODEX_CLI_VERSION);
    if (invocation.args.includes('login')) return ok('', 'Logged in using ChatGPT\n');
    await inspect?.(invocation);
    assert.ok(invocation.onStdoutLine);
    for (const event of stream) {
      if (!invocation.onStdoutLine(typeof event === 'string' ? event : JSON.stringify(event))) return { ...ok(), stopReason: 'event-rejected' };
    }
    return ok('', 'Untrusted raw stderr SECRET TOKEN never persisted');
  } };
}

test('Codex transport binds wrapper, schema and policy, isolates working directory, and sanitizes receipts', async () => {
  let root = '';
  const fake = fakeRunner(events(), async invocation => {
    assert.deepEqual(await readdir(invocation.cwd), []);
    root = dirname(invocation.cwd);
    const schemaIndex = invocation.args.indexOf('--output-schema');
    assert.deepEqual(JSON.parse(await readFile(invocation.args[schemaIndex + 1]!, 'utf8')), request.schema);
    assert.equal(invocation.stdin, renderCodexRequest(request));
    for (const argument of ['--ignore-user-config', '--ignore-rules', '--ephemeral', '--strict-config', '--json',
      'default_permissions="architect-benchmark"', 'permissions.architect-benchmark.filesystem={":root"="deny",":minimal"="read",":workspace_roots"="read"}',
      'permissions.architect-benchmark.network.enabled=false',
      'forced_login_method="chatgpt"', 'skills.include_instructions=false', 'skills.bundled.enabled=false', 'features.skip_host_skill_discovery=true',
      'project_doc_max_bytes=0', 'web_search="disabled"',
      'shell_tool', 'unified_exec', 'plugins', 'memories', 'multi_agent', 'sleep_tool', 'mcp_servers={}']) assert.ok(invocation.args.includes(argument), argument);
    assert.equal(invocation.args.includes('resume'), false);
    assert.equal(invocation.args.includes('--sandbox'), false);
    assert.equal(invocation.args.some(arg => arg.startsWith('model_providers.')), false);
    assert.equal(invocation.args.some(arg => arg.startsWith('model_post_turn_compact_threshold_percent=')), false);
    assert.equal(invocation.args.includes('--dangerously-bypass-approvals-and-sandbox'), false);
  });
  const transport = createCodexTransport({ runner: fake.runner });
  const result = await transport.respond(request);
  assert.equal(transport.assurance, 'mock'); assert.equal(transport.launchPolicyDigest, CODEX_LAUNCH_POLICY_DIGEST);
  assert.equal(result.status, 'completed'); assert.deepEqual(result.output, { answer: 'Một' });
  assert.deepEqual(result.usage, { inputTokens: 100, cachedInputTokens: 20, outputTokens: 10, totalTokens: 110, reasoningTokens: 2 });
  assert.equal(result.requestDigest, digest(request)); assert.equal(result.renderedRequestDigest, digest(renderCodexRequest(request)));
  assert.equal(result.configurationDigest, transport.configurationDigest(request));
  assert.equal(result.apiCostMicros, null); assert.equal(result.exactInputCount, null); assert.equal(result.maxOutputTokensEnforced, false);
  assert.equal(result.modelIdentityAssurance, 'requested-only'); assert.equal(result.isolationAssurance, 'capability-flags-and-event-audit');
  assert.equal(result.cliVersion, CODEX_CLI_VERSION); assert.equal(fake.calls.length, 3);
  assert.ok(!JSON.stringify(result).includes('SECRET')); assert.ok(!JSON.stringify(result).includes('PRIVATE REASONING'));
  await assert.rejects(access(root));
});

test('environment construction never reads or forwards API credentials, provider overrides or inherited tools', () => {
  const source: NodeJS.ProcessEnv = { HOME: '/safe/home', CODEX_HOME: '/safe/codex', USER: 'tester', PATH: '/unsafe',
    OPENAI_BASE_URL: 'https://evil.invalid', CODEX_THREAD_ID: 'parent', HTTPS_PROXY: 'evil', NODE_OPTIONS: '--require=evil' };
  Object.defineProperty(source, 'OPENAI_API_KEY', { get: () => { throw new Error('must not inspect key'); }, enumerable: true });
  Object.defineProperty(source, 'CODEX_API_KEY', { get: () => { throw new Error('must not inspect key'); }, enumerable: true });
  const child = codexChildEnvironment(source);
  assert.equal(child.HOME, '/safe/home'); assert.equal(child.CODEX_HOME, '/safe/codex'); assert.equal(child.PATH, '/usr/bin:/bin:/usr/sbin:/sbin');
  for (const key of ['OPENAI_API_KEY', 'CODEX_API_KEY', 'OPENAI_BASE_URL', 'CODEX_THREAD_ID', 'HTTPS_PROXY', 'NODE_OPTIONS']) assert.equal(child[key], undefined);
});

test('unsupported version blocks before login or generation', async () => {
  let calls = 0;
  const result = await createCodexTransport({ runner: async () => { calls++; return ok('codex-cli unknown'); } }).respond(request);
  assert.equal(calls, 1); assert.equal(result.status, 'failed'); assert.deepEqual(result.issues, ['CODEX_CLI_VERSION_UNSUPPORTED']);
  assert.equal(result.cliVersion, null);
});

test('API auth and ambiguous auth output cannot dispatch generation', async () => {
  for (const status of ['Logged in using an API key', 'Logged in using ChatGPT\nAdditional account credentials', 'Not logged in']) {
    let calls = 0;
    const result = await createCodexTransport({ runner: async () => (++calls === 1 ? ok(CODEX_CLI_VERSION) : ok(status)) }).respond(request);
    assert.equal(calls, 2); assert.deepEqual(result.issues, ['CODEX_CHATGPT_AUTH_REQUIRED']); assert.equal(result.output, null);
  }
});

test('every invocation rechecks authentication and fresh working root', async () => {
  const fake = fakeRunner(); const transport = createCodexTransport({ runner: fake.runner });
  const a = await transport.respond(request); const b = await transport.respond(request);
  assert.equal(fake.calls.length, 6); assert.notEqual(fake.calls[2]!.cwd, fake.calls[5]!.cwd);
  assert.equal(a.configurationDigest, b.configurationDigest);
});

test('configuration identity binds exact transport limits and requested model effort', () => {
  const a = createCodexTransport({ runner: fakeRunner().runner, timeoutMs: 1000 });
  const b = createCodexTransport({ runner: fakeRunner().runner, timeoutMs: 2000 });
  assert.notEqual(a.configurationDigest(request), b.configurationDigest(request));
  assert.notEqual(a.configurationDigest(request), a.configurationDigest({ ...request, reasoningEffort: 'high' }));
  assert.notEqual(a.configurationDigest(request), a.configurationDigest({ ...request, model: 'gpt-6-astra' }));
  assert.equal(a.configurationDigest(request), a.configurationDigest({ ...request, input: 'Different input bound by requestDigest' }));
});

test('request validation and pre-abort never invoke a child', async () => {
  const fake = fakeRunner(); const transport = createCodexTransport({ runner: fake.runner, maxRequestBytes: 4096 });
  await assert.rejects(transport.respond({ ...request, model: '--malicious' }), /CODEX_REQUEST_INVALID/);
  await assert.rejects(transport.respond({ ...request, input: 'x'.repeat(5000) }), /CODEX_REQUEST_TOO_LARGE/);
  const abort = new AbortController(); abort.abort();
  const result = await transport.respond(request, abort.signal);
  assert.deepEqual(result.issues, ['CODEX_ABORTED']); assert.equal(fake.calls.length, 0);
});

test('tool events, unknown events, malformed JSON and extra turns fail closed', async () => {
  for (const bad of [
    { type: 'item.started', item: { id: 'bad', type: 'command_execution', command: 'cat oracle.json' } },
    { type: 'item.completed', item: { id: 'bad', type: 'mcp_tool_call' } },
    { type: 'item.completed', item: { id: 'bad', type: 'web_search' } },
    { type: 'new-unknown-event' }, '{not json', { type: 'turn.started' },
  ]) {
    const fake = fakeRunner([...events().slice(0, 2), bad, ...events().slice(2)]);
    const result = await createCodexTransport({ runner: fake.runner }).respond(request);
    assert.equal(result.status, 'incomplete'); assert.equal(result.output, null); assert.ok(result.issues.length);
    assert.ok(!JSON.stringify(result).includes('oracle.json'));
  }
  const fake = fakeRunner([...events(), { type: 'turn.started' }]);
  const result = await createCodexTransport({ runner: fake.runner }).respond(request);
  assert.ok(result.issues.includes('CODEX_EXTRA_EVENT')); assert.equal(result.output, null);
});

test('malformed, unknown and missing usage are not zero or valid measurements', async () => {
  for (const badUsage of [undefined, { ...usage, input_tokens: -1 }, { ...usage, cached_input_tokens: 101 },
    { ...usage, extra_tokens: 3 }, { ...usage, reasoning_output_tokens: 11 }, { ...usage, output_tokens: Number.MAX_SAFE_INTEGER }]) {
    const fake = fakeRunner([...events().slice(0, -1), { type: 'turn.completed', usage: badUsage }]);
    const result = await createCodexTransport({ runner: fake.runner }).respond(request);
    assert.equal(result.usage, null); assert.equal(result.output, null); assert.ok(result.issues.includes('CODEX_USAGE_UNKNOWN'));
  }
});

test('unknown event diagnostics keep bounded type identifiers while discarding payload text and secrets', async () => {
  const unknown = { type: 'thread.extension_notice', item: { type: 'startup_notice', text: 'PRIVATE REASONING',
    auth: 'SECRET_TOKEN', prompt: 'PRIVATE PROMPT' }, error: 'RAW STDERR SECRET' };
  const result = await createCodexTransport({ runner: fakeRunner([events()[0], unknown]).runner }).respond(request);
  assert.equal(result.status, 'incomplete'); assert.equal(result.output, null); assert.equal(result.usage, null);
  assert.deepEqual(result.eventDiagnostics, { eventCount: 2, eventTypes: ['thread.started', 'thread.extension_notice'],
    itemTypes: ['startup_notice'], rejectedEventType: 'thread.extension_notice', rejectedItemType: 'startup_notice',
    rejectionCategory: 'CODEX_EVENT_UNKNOWN', truncated: false });
  for (const marker of ['PRIVATE REASONING', 'SECRET_TOKEN', 'PRIVATE PROMPT', 'RAW STDERR SECRET']) assert.equal(JSON.stringify(result).includes(marker), false);
  const invalid = await createCodexTransport({ runner: fakeRunner([{ type: 'x'.repeat(81), item: { type: 'unsafe type with text' } }]).runner }).respond(request);
  assert.deepEqual(invalid.eventDiagnostics?.eventTypes, []); assert.deepEqual(invalid.eventDiagnostics?.itemTypes, []);
  assert.equal(invalid.eventDiagnostics?.rejectedEventType, null); assert.equal(invalid.eventDiagnostics?.rejectedItemType, null);
  assert.equal(invalid.eventDiagnostics?.truncated, true);
});

test('reported usage above output hint is retained; transport does not invent a hard cap', async () => {
  const fake = fakeRunner([...events().slice(0, -1), { type: 'turn.completed', usage: { ...usage, output_tokens: 50 } }]);
  const result = await createCodexTransport({ runner: fake.runner }).respond(request);
  assert.equal(result.status, 'completed'); assert.equal(result.usage?.outputTokens, 50); assert.equal(result.maxOutputTokensEnforced, false);
});

test('known zero cache-write usage is admitted while nonzero or malformed cache-write counters stay unknown', async () => {
  for (const cacheWrite of [0, 1, -1, '0', null, false]) {
    const fake = fakeRunner([...events().slice(0, -1), { type: 'turn.completed', usage: { ...usage, cache_write_input_tokens: cacheWrite } }]);
    const result = await createCodexTransport({ runner: fake.runner }).respond(request);
    if (cacheWrite === 0) { assert.equal(result.status, 'completed'); assert.equal(result.usage?.totalTokens, 110); }
    else { assert.equal(result.status, 'incomplete'); assert.equal(result.usage, null); assert.ok(result.issues.includes('CODEX_USAGE_UNKNOWN')); }
  }
});

test('missing terminal event, duplicate outputs and invalid final JSON are not successful', async () => {
  for (const stream of [events().slice(0, -1), [...events().slice(0, -1),
    { type: 'item.completed', item: { id: 'answer-2', type: 'agent_message', text: '{}' } }, events().at(-1)],
    events('plain string instead of an object')]) {
    const result = await createCodexTransport({ runner: fakeRunner(stream).runner }).respond(request);
    assert.equal(result.status, 'incomplete'); assert.equal(result.output, null);
  }
});

test('runner failure cannot leak raw error, prompt, or auth material', async () => {
  const result = await createCodexTransport({ runner: async () => { throw new Error('SECRET AUTH RAW'); } }).respond(request);
  assert.deepEqual(result.issues, ['CODEX_TRANSPORT_FAILED']); assert.equal(result.status, 'failed');
  assert.ok(!JSON.stringify(result).includes('SECRET'));
});

test('native runner bounds output, timeout and external cancellation without a shell', async () => {
  const invocation = { binary: process.execPath, args: ['-e', 'process.stdout.write("x".repeat(10000))'], cwd: tmpdir(), env: {},
    stdin: '', timeoutMs: 2000, maxOutputBytes: 100 };
  const bounded = await runCodexProcess(invocation); assert.equal(bounded.stopReason, 'output-limit'); assert.equal(bounded.stdout, '');
  const timed = await runCodexProcess({ ...invocation, args: ['-e', 'setInterval(()=>{},1000)'], timeoutMs: 50 });
  assert.equal(timed.stopReason, 'timeout');
  const abort = new AbortController(); const promise = runCodexProcess({ ...invocation, args: ['-e', 'setInterval(()=>{},1000)'], signal: abort.signal });
  setTimeout(() => abort.abort(), 50); assert.equal((await promise).stopReason, 'aborted');
});

test('native stream decoding preserves UTF-8 across chunks and stops on rejected event', async () => {
  const lines: string[] = [];
  const invocation = { binary: process.execPath, args: ['-e', 'const b=Buffer.from("Một\\n");process.stdout.write(b.subarray(0,2));setTimeout(()=>process.stdout.write(b.subarray(2)),20)'],
    cwd: tmpdir(), env: {}, stdin: '', timeoutMs: 2000, maxOutputBytes: 1000,
    onStdoutLine: (line: string): boolean => { lines.push(line); return true; } };
  const result = await runCodexProcess(invocation); assert.equal(result.exitCode, 0); assert.deepEqual(lines, ['Một']); assert.equal(result.stdout, '');
  const denied = await runCodexProcess({ ...invocation, args: ['-e', 'process.stdout.write("denied\\n");setInterval(()=>{},1000)'], onStdoutLine: () => false });
  assert.equal(denied.stopReason, 'event-rejected');
});

test('native timeout kills a child process in the detached process group', async () => {
  let descendant: number | null = null;
  const script = 'const {spawn}=require("node:child_process");const c=spawn(process.execPath,["-e","setInterval(()=>{},1000)"],{stdio:"ignore"});console.log(c.pid);setInterval(()=>{},1000);';
  const result = await runCodexProcess({ binary: process.execPath, args: ['-e', script], cwd: tmpdir(), env: {}, stdin: '',
    timeoutMs: 150, maxOutputBytes: 1000, onStdoutLine: line => { descendant = Number(line); return true; } });
  assert.equal(result.stopReason, 'timeout'); assert.ok(descendant !== null && Number.isSafeInteger(descendant));
  let alive = true;
  for (let i = 0; i < 20 && alive; i++) {
    try { process.kill(descendant!, 0); } catch { alive = false; }
    if (alive) await new Promise(resolve => setTimeout(resolve, 20));
  }
  assert.equal(alive, false);
});
