import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { runNativeCodexUnityTask, type NativeCodexAppServerConnection, type NativeCodexConnectionFactory, type NativeCodexNotification } from '../src/unity/native-codex.js';

type Script = (connection: FixtureConnection) => void;
class FixtureConnection implements NativeCodexAppServerConnection {
  readonly calls: { method: string; params: Record<string, unknown> }[] = [];
  private readonly listeners = new Set<(event: NativeCodexNotification) => void>();
  constructor(private readonly script: Script, private readonly reroute = false, private readonly unknownMcp = false) {}
  emit(method: string, params: unknown): void { for (const listener of this.listeners) listener({ method, params }); }
  async request(method: string, params: Record<string, unknown>): Promise<unknown> {
    this.calls.push({ method, params });
    if (method === 'initialize') return { userAgent: 'fixture' };
    if (method === 'mcpServerStatus/list') return { data: this.unknownMcp ? [{ name: 'node_repl', tools: { exec: {} } }] : [{ name: 'unity_public', tools: { unity_compile_test: {} } }], nextCursor: null };
    if (method === 'thread/start') return { thread: { id: 'thread-1' }, model: this.reroute ? 'gpt-6-sol' : 'gpt-5.6-terra' };
    if (method === 'turn/start') { this.script(this); return { turn: { id: 'turn-1', status: 'inProgress' } }; }
    if (method === 'turn/interrupt') return {};
    throw Error(`unexpected ${method}`);
  }
  async notify(): Promise<void> {}
  onNotification(listener: (event: NativeCodexNotification) => void): () => void { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  async close(): Promise<void> {}
}
function setup(t: test.TestContext, script: Script, reroute = false, unknownMcp = false) {
  const root = mkdtempSync(path.join(tmpdir(), 'native-codex-credit-')), project = path.join(root, 'public-project'), artifacts = path.join(root, 'artifacts');
  mkdirSync(project, { recursive: true }); mkdirSync(artifacts, { recursive: true }); writeFileSync(path.join(project, 'Assets.cs'), 'public class Assets {}\n');
  t.after(() => rmSync(root, { recursive: true, force: true }));
  let connection: FixtureConnection | null = null;
  const factory: NativeCodexConnectionFactory = { async open() { connection = new FixtureConnection(script, reroute, unknownMcp); return connection; } };
  return { project, artifacts, factory, calls: () => connection?.calls ?? [] };
}
function started(c: FixtureConnection): void { c.emit('turn/started', { threadId: 'thread-1', turn: { id: 'turn-1' } }); }
function usage(c: FixtureConnection, inputTokens: number, cachedInputTokens: number, outputTokens: number): void {
  c.emit('thread/tokenUsage/updated', { threadId: 'thread-1', turnId: 'turn-1', tokenUsage: { last: {}, total: { inputTokens, cachedInputTokens, outputTokens, reasoningOutputTokens: 0, totalTokens: inputTokens + outputTokens } } });
}
function complete(c: FixtureConnection): void { c.emit('turn/completed', { threadId: 'thread-1', turn: { id: 'turn-1', status: 'completed' } }); }
function fileProof(c: FixtureConnection): void { c.emit('item/completed', { threadId: 'thread-1', turnId: 'turn-1', item: { id: 'item-1', type: 'fileChange', status: 'completed', changes: [] } }); }
async function run(f: ReturnType<typeof setup>, maxCreditMicros = 100_000) {
  return await runNativeCodexUnityTask({ projectPath: f.project, targetFile: 'Assets.cs', prompt: 'PINNED SKILL secret-value-must-not-persist', artifactDirectory: f.artifacts,
    maxCreditMicros, connectionFactory: f.factory, timeoutMs: 1_000 });
}

test('uses cumulative totals once and counts cached input in credits', async t => {
  const f = setup(t, c => { started(c); usage(c, 10, 2, 1); usage(c, 100, 20, 10); fileProof(c); complete(c); });
  const receipt = await run(f);
  assert.equal(receipt.status, 'completed');
  assert.deepEqual(receipt.usage, { model: 'gpt-5.6-terra', inputTokens: 100, cachedInputTokens: 20, outputTokens: 10 });
  assert.equal(receipt.creditMicros, 7_100);
  assert.equal(receipt.toolProofRefs.length, 1);
  const receiptFile = `${f.artifacts}/${receipt.receiptId.replace(':', '-')}.receipt.json`;
  assert.ok(existsSync(receiptFile)); assert.doesNotMatch(readFileSync(receiptFile, 'utf8'), /secret-value/);
});

test('unknown token counters fail closed and interrupt the active turn', async t => {
  const f = setup(t, c => { started(c); c.emit('thread/tokenUsage/updated', { threadId: 'thread-1', turnId: 'turn-1', tokenUsage: { total: { inputTokens: 1, outputTokens: 0 } } }); });
  const receipt = await run(f);
  assert.equal(receipt.status, 'failed'); assert.equal(receipt.error, 'NATIVE_CODEX_USAGE_UNKNOWN');
  assert.equal(f.calls().filter(call => call.method === 'turn/interrupt').length, 1);
});

test('credit-cap event interrupts and records the overshoot risk', async t => {
  const f = setup(t, c => { started(c); usage(c, 20, 0, 1); });
  const receipt = await run(f, 1_000);
  assert.equal(receipt.status, 'failed'); assert.equal(receipt.error, 'NATIVE_CODEX_CREDIT_CAP_EXCEEDED'); assert.equal(receipt.overshootRisk, true);
  assert.equal(f.calls().filter(call => call.method === 'turn/interrupt').length, 1);
});

test('reserve closes later tool admission but permits a tool-free final completion', async t => {
  const settled = setup(t, c => { started(c); fileProof(c); usage(c, 190, 0, 0); complete(c); });
  const settledReceipt = await run(settled, 10_000);
  assert.equal(settledReceipt.status, 'completed'); assert.equal(settledReceipt.overshootRisk, true);
  assert.equal(settled.calls().filter(call => call.method === 'turn/interrupt').length, 0);
  const blocked = setup(t, c => { started(c); usage(c, 190, 0, 0); c.emit('item/started', { threadId: 'thread-1', turnId: 'turn-1', item: { id: 'late-tool', type: 'commandExecution', status: 'inProgress' } }); });
  const blockedReceipt = await run(blocked, 10_000);
  assert.equal(blockedReceipt.status, 'failed'); assert.equal(blockedReceipt.error, 'NATIVE_CODEX_TOOL_ADMISSION_CLOSED');
  assert.equal(blocked.calls().filter(call => call.method === 'turn/interrupt').length, 1);
});

test('a rerouted model is rejected before a turn can begin', async t => {
  const f = setup(t, () => undefined, true);
  const receipt = await run(f);
  assert.equal(receipt.status, 'failed'); assert.equal(receipt.error, 'NATIVE_CODEX_MODEL_REROUTED');
  assert.equal(f.calls().filter(call => call.method === 'turn/start').length, 0);
});

test('an inherited MCP tool blocks dispatch before any turn starts', async t => {
  const f = setup(t, () => undefined, false, true);
  const receipt = await run(f);
  assert.equal(receipt.status, 'failed'); assert.equal(receipt.error, 'NATIVE_CODEX_UNAPPROVED_MCP_TOOL');
  assert.equal(f.calls().filter(call => call.method === 'turn/start').length, 0);
});

test('a failed MCP item cannot become a Unity tool proof', async t => {
  const f = setup(t, c => { started(c); usage(c, 1, 0, 1); c.emit('item/completed', { threadId: 'thread-1', turnId: 'turn-1', item: { id: 'mcp-1', type: 'mcpToolCall', server: 'unity_public', tool: 'unity_compile_test', status: 'failed', error: { message: 'sanitized' } } }); complete(c); });
  const receipt = await run(f);
  assert.equal(receipt.status, 'failed'); assert.equal(receipt.error, 'NATIVE_CODEX_MCP_TOOL_FAILED');
  assert.deepEqual(receipt.toolProofRefs, []);
});

test('durable tool proof is required and final source comes from the allowed target', async t => {
  const f = setup(t, c => { started(c); usage(c, 1, 0, 1); fileProof(c); complete(c); });
  const receipt = await run(f);
  assert.equal(receipt.source, 'public class Assets {}\n'); assert.match(receipt.toolProofRefs[0]!, /^file:thread-1:turn-1:item-1$/);
  const eventFile = `${f.artifacts}/${receipt.receiptId.replace(':', '-')}.events.json`;
  assert.match(readFileSync(eventFile, 'utf8'), /fileChange/);
});

test('a completed turn without usage cannot be reported as a free run', async t => {
  const f = setup(t, c => { started(c); fileProof(c); complete(c); });
  const receipt = await run(f);
  assert.equal(receipt.status, 'failed'); assert.equal(receipt.error, 'NATIVE_CODEX_USAGE_MISSING'); assert.equal(receipt.creditMicros, null);
});

test('a completed MCP envelope carrying isError still fails verification', async t => {
  const f = setup(t, c => { started(c); usage(c, 1, 0, 1); c.emit('item/completed', { threadId: 'thread-1', turnId: 'turn-1', item: { id: 'mcp-1', type: 'mcpToolCall', server: 'unity_public', tool: 'unity_compile_test', status: 'completed', error: null, result: { isError: true } } }); complete(c); });
  const receipt = await run(f);
  assert.equal(receipt.status, 'failed'); assert.equal(receipt.error, 'NATIVE_CODEX_MCP_TOOL_FAILED');
  assert.deepEqual(receipt.toolProofRefs, []);
});
