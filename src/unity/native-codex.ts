import { spawn, spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { CURRENT_CODEX_BINARY_PATH, CURRENT_CODEX_CLI_VERSION, codexChildEnvironment } from '../providers/codex.js';
import { creditMicrosForUsage, type ModelCreditUsage } from '../contracts/credit-usage.js';
import { canonicalJson, digest } from '../contracts/canonical.js';

/** The only currently admitted ordinary-Codex model for the Unity C arm. */
export const NATIVE_CODEX_MODEL = 'gpt-5.6-terra' as const;
export const NATIVE_CODEX_APP_SERVER_VERSION = CURRENT_CODEX_CLI_VERSION;

type JsonObject = Record<string, unknown>;
const object = (value: unknown): value is JsonObject => value !== null && typeof value === 'object' && !Array.isArray(value);
const safeInteger = (value: unknown): value is number => Number.isSafeInteger(value) && typeof value === 'number' && value >= 0;
const id = (value: unknown): value is string => typeof value === 'string' && /^[a-zA-Z0-9_.:-]{1,180}$/.test(value);

export interface NativeCodexNotification { method: string; params: unknown; }
export interface NativeCodexAppServerConnection {
  request(method: string, params: JsonObject): Promise<unknown>;
  notify(method: string, params: JsonObject): Promise<void>;
  onNotification(listener: (notification: NativeCodexNotification) => void): () => void;
  close(): Promise<void>;
}
export interface NativeCodexConnectionFactory {
  open(options: { binaryPath: string; args: readonly string[]; cwd: string; env: NodeJS.ProcessEnv }): Promise<NativeCodexAppServerConnection>;
}

/**
 * Every entry must be a single `mcp_servers...` TOML override.  The caller owns
 * the fixed local broker definition; this transport never reads the user's MCP
 * configuration or adds any other server.
 */
export type FixedMcpConfig = readonly string[];
export interface NativeCodexUnityTask {
  /** An already-prepared public Unity project.  This transport never copies in hidden fixtures. */
  projectPath: string;
  /** Relative source file whose final bytes are passed to the comparison verifier. */
  targetFile: string;
  /** Shared pinned skill plus task requirement, assembled by the comparison adapter. */
  prompt: string;
  /** An isolated artifact directory controlled by the caller. */
  artifactDirectory: string;
  maxCreditMicros: number;
  /** Held back from observed totals to absorb notification/in-flight response lag. */
  responseReserveCreditMicros?: number;
  model?: typeof NATIVE_CODEX_MODEL;
  /** Optional trusted Unity MCP broker. All other MCP servers remain disabled. */
  fixedMcpConfig?: FixedMcpConfig;
  timeoutMs?: number;
  binaryPath?: string;
  connectionFactory?: NativeCodexConnectionFactory;
}

export interface NativeCodexEventLog {
  schemaVersion: 'native-codex-event-log/1';
  threadId: string | null;
  turnId: string | null;
  events: readonly { method: string; itemType: string | null; itemId: string | null; itemStatus: string | null; mcpErrorMessage: string | null }[];
  toolProofRefs: readonly string[];
  interruption: 'none' | 'unknown-usage' | 'credit-cap';
}
export interface NativeCodexReceipt {
  schemaVersion: 'native-codex-receipt/1';
  receiptId: string;
  status: 'completed' | 'failed';
  model: typeof NATIVE_CODEX_MODEL;
  modelIdentityAssurance: 'requested-only';
  usage: ModelCreditUsage;
  creditMicros: number | null;
  reservedCreditMicros: number;
  responseReserveCreditMicros: number;
  interruptAtCreditMicros: number;
  elapsedMs: number;
  source?: string;
  sourceDigest: string | null;
  toolProofRefs: readonly string[];
  error: string | null;
  overshootRisk: boolean;
  eventLogDigest: string;
  promptDigest: string;
}

class NativeCodexError extends Error {
  constructor(readonly code: string) { super(code); this.name = 'NativeCodexError'; }
}

function inside(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}
function relativeFile(project: string, value: string): string {
  if (!value || path.isAbsolute(value) || value.split(/[\\/]+/).some(part => part === '..' || !part)) throw new NativeCodexError('NATIVE_CODEX_TARGET_INVALID');
  const candidate = path.resolve(project, value);
  if (!inside(project, candidate) || !existsSync(candidate) || !lstatSync(candidate).isFile() || lstatSync(candidate).isSymbolicLink()) throw new NativeCodexError('NATIVE_CODEX_TARGET_INVALID');
  const resolved = realpathSync(candidate);
  if (!inside(project, resolved)) throw new NativeCodexError('NATIVE_CODEX_TARGET_ESCAPE');
  return resolved;
}
function prohibitedProjectTree(project: string): boolean {
  const prohibited = /(^|[-_])(oracle|reference[-_]?answers?|credentials?)([-_]|$)|^\.git$/i;
  const pending = [project]; let visited = 0;
  while (pending.length) {
    const directory = pending.pop()!;
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (++visited > 20_000) throw new NativeCodexError('NATIVE_CODEX_PROJECT_SCAN_LIMIT');
      if (prohibited.test(entry.name)) return true;
      if (entry.isSymbolicLink()) throw new NativeCodexError('NATIVE_CODEX_PROJECT_SYMLINK');
      if (entry.isDirectory()) pending.push(path.join(directory, entry.name));
    }
  }
  return false;
}
function checkedProject(projectPath: string, targetFile: string): { project: string; target: string } {
  if (!path.isAbsolute(projectPath) || !existsSync(projectPath) || !lstatSync(projectPath).isDirectory() || lstatSync(projectPath).isSymbolicLink()) throw new NativeCodexError('NATIVE_CODEX_PROJECT_INVALID');
  const project = realpathSync(projectPath);
  if (prohibitedProjectTree(project)) throw new NativeCodexError('NATIVE_CODEX_PROJECT_FORBIDDEN_CONTENT');
  return { project, target: relativeFile(project, targetFile) };
}
function checkedArtifactDirectory(value: string): string {
  if (!path.isAbsolute(value)) throw new NativeCodexError('NATIVE_CODEX_ARTIFACT_INVALID');
  mkdirSync(value, { recursive: true, mode: 0o700 });
  if (!lstatSync(value).isDirectory() || lstatSync(value).isSymbolicLink()) throw new NativeCodexError('NATIVE_CODEX_ARTIFACT_INVALID');
  return realpathSync(value);
}
function checkedMcpConfig(config: FixedMcpConfig | undefined): readonly string[] {
  if (config === undefined) return [];
  if (!Array.isArray(config) || config.length > 8 || config.some(value => typeof value !== 'string' || value.length < 14 || value.length > 16_384 || /[\r\n]/.test(value) || !value.startsWith('mcp_servers.'))) {
    throw new NativeCodexError('NATIVE_CODEX_MCP_CONFIG_INVALID');
  }
  return [...config];
}
function launchArgs(mcpConfig: readonly string[]): string[] {
  // Do not disable shell or file-change tools: ordinary Codex needs both. These
  // settings only remove global integrations/config-sourced capabilities.
  const args = ['app-server', '--stdio', '--strict-config',
    '-c', 'forced_login_method="chatgpt"', '-c', 'web_search="disabled"', '-c', 'mcp_servers={}', '-c', 'plugins={}', '-c', 'hooks={}',
    '-c', 'default_permissions="unity-comparison"', '-c', 'permissions.unity-comparison.extends=":read-only"',
    '-c', 'permissions.unity-comparison.network.enabled=false', '-c', 'permissions.unity-comparison.filesystem={":root"="deny",":minimal"="read",":workspace_roots"="write"}',
    '-c', 'memories.use_memories=false', '-c', 'memories.generate_memories=false', '-c', 'memories.dedicated_tools=false',
    '-c', 'include_apps_instructions=false', '-c', 'history.persistence="none"', '-c', 'analytics.enabled=false', '-c', 'feedback.enabled=false',
    '-c', 'mcp_servers.node_repl.enabled=false', '-c', 'mcp_servers.computer-use.enabled=false', '-c', 'mcp_servers.unity_mcp.enabled=false',
    '-c', 'features.skip_host_skill_discovery=true', '-c', 'project_doc_max_bytes=0', '-c', 'skills.include_instructions=false', '-c', 'skills.bundled.enabled=false'];
  for (const feature of ['apps', 'enable_mcp_apps', 'memories', 'plugins', 'plugin_sharing', 'recommended_plugins', 'remote_plugin', 'standalone_web_search', 'in_app_browser']) args.push('--disable', feature);
  for (const setting of mcpConfig) args.push('-c', setting);
  return args;
}

class StdioAppServerConnection implements NativeCodexAppServerConnection {
  private readonly listeners = new Set<(notification: NativeCodexNotification) => void>();
  private readonly pending = new Map<number, { resolve: (value: unknown) => void; reject: (reason: Error) => void }>();
  private nextId = 1; private buffer = ''; private closed = false;
  private constructor(private readonly child: ReturnType<typeof spawn>) {
    child.stdout?.setEncoding('utf8'); child.stdout?.on('data', (chunk: string) => this.read(chunk));
    child.on('error', () => this.failAll('NATIVE_CODEX_APP_SERVER_SPAWN_FAILED'));
    child.on('close', () => this.failAll('NATIVE_CODEX_APP_SERVER_EXIT_DRIFT'));
  }
  static async open(options: { binaryPath: string; args: readonly string[]; cwd: string; env: NodeJS.ProcessEnv }): Promise<NativeCodexAppServerConnection> {
    let child: ReturnType<typeof spawn>;
    try { child = spawn(options.binaryPath, [...options.args], { cwd: options.cwd, env: options.env, stdio: ['pipe', 'pipe', 'ignore'], shell: false }); }
    catch { throw new NativeCodexError('NATIVE_CODEX_APP_SERVER_SPAWN_FAILED'); }
    return new StdioAppServerConnection(child);
  }
  private failAll(code: string): void { for (const request of this.pending.values()) request.reject(new NativeCodexError(code)); this.pending.clear(); this.closed = true; }
  private read(chunk: string): void {
    this.buffer += chunk;
    while (this.buffer.includes('\n')) {
      const index = this.buffer.indexOf('\n'), line = this.buffer.slice(0, index); this.buffer = this.buffer.slice(index + 1);
      let message: unknown; try { message = JSON.parse(line); } catch { this.failAll('NATIVE_CODEX_APP_SERVER_PROTOCOL_INVALID'); return; }
      if (!object(message)) { this.failAll('NATIVE_CODEX_APP_SERVER_PROTOCOL_INVALID'); return; }
      if (typeof message.id === 'number' && this.pending.has(message.id)) {
        const request = this.pending.get(message.id)!; this.pending.delete(message.id);
        if (object(message.error)) request.reject(new NativeCodexError('NATIVE_CODEX_APP_SERVER_RESPONSE_ERROR')); else request.resolve(message.result);
      } else if (typeof message.method === 'string') for (const listener of this.listeners) listener({ method: message.method, params: message.params });
    }
  }
  request(method: string, params: JsonObject): Promise<unknown> {
    if (this.closed || !this.child.stdin) return Promise.reject(new NativeCodexError('NATIVE_CODEX_APP_SERVER_EXIT_DRIFT'));
    const requestId = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(requestId, { resolve, reject });
      this.child.stdin!.write(`${JSON.stringify({ jsonrpc: '2.0', id: requestId, method, params })}\n`, error => {
        if (error) { this.pending.delete(requestId); reject(new NativeCodexError('NATIVE_CODEX_APP_SERVER_WRITE_FAILED')); }
      });
    });
  }
  async notify(method: string, params: JsonObject): Promise<void> {
    if (this.closed || !this.child.stdin) throw new NativeCodexError('NATIVE_CODEX_APP_SERVER_EXIT_DRIFT');
    await new Promise<void>((resolve, reject) => this.child.stdin!.write(`${JSON.stringify({ jsonrpc: '2.0', method, params })}\n`, error =>
      error ? reject(new NativeCodexError('NATIVE_CODEX_APP_SERVER_WRITE_FAILED')) : resolve()));
  }
  onNotification(listener: (notification: NativeCodexNotification) => void): () => void { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  async close(): Promise<void> { this.listeners.clear(); if (!this.closed) { this.failAll('NATIVE_CODEX_APP_SERVER_CLOSED'); this.child.kill('SIGTERM'); } }
}
export const nativeCodexAppServerConnection: NativeCodexConnectionFactory = { open: StdioAppServerConnection.open };

function usageFromTotal(value: unknown): ModelCreditUsage | null {
  if (!object(value) || !safeInteger(value.inputTokens) || !safeInteger(value.cachedInputTokens) || !safeInteger(value.outputTokens) ||
      (value.cacheWriteInputTokens !== undefined && value.cacheWriteInputTokens !== 0) || value.cachedInputTokens > value.inputTokens) return null;
  return { model: NATIVE_CODEX_MODEL, inputTokens: value.inputTokens, cachedInputTokens: value.cachedInputTokens, outputTokens: value.outputTokens };
}
function eventItem(params: unknown): JsonObject | null { return object(params) && object(params.item) ? params.item : null; }
function turnFrom(value: unknown): JsonObject | null { return object(value) && object(value.turn) ? value.turn : null; }
function shortHash(value: string): string { return createHash('sha256').update(value, 'utf8').digest('hex').slice(0, 24); }
function writeNew(file: string, value: unknown): void { writeFileSync(file, `${canonicalJson(value)}\n`, { flag: 'wx', mode: 0o600 }); }
async function requireUnityMcp(connection: NativeCodexAppServerConnection, beforeDeadline: <T>(promise: Promise<T>) => Promise<T>): Promise<void> {
  let cursor: string | null = null, pages = 0, requiredFound = false;
  do {
    if (++pages > 16) throw new NativeCodexError('NATIVE_CODEX_MCP_PAGINATION_INVALID');
    const result: unknown = await beforeDeadline(connection.request('mcpServerStatus/list', { cursor, detail: 'full', limit: 100 }));
    if (!object(result) || !Array.isArray(result.data) || (result.nextCursor !== null && result.nextCursor !== undefined && typeof result.nextCursor !== 'string')) throw new NativeCodexError('NATIVE_CODEX_MCP_INVENTORY_INVALID');
    for (const status of result.data) {
      if (!object(status) || typeof status.name !== 'string' || !object(status.tools)) throw new NativeCodexError('NATIVE_CODEX_MCP_INVENTORY_INVALID');
      const toolNames = Object.keys(status.tools);
      if (status.name === 'unity_public') { if (!toolNames.includes('unity_compile_test')) throw new NativeCodexError('NATIVE_CODEX_UNITY_MCP_TOOL_MISSING'); requiredFound = true; }
      else if (toolNames.length) throw new NativeCodexError('NATIVE_CODEX_UNAPPROVED_MCP_TOOL');
    }
    cursor = typeof result.nextCursor === 'string' ? result.nextCursor : null;
  } while (cursor !== null);
  if (!requiredFound) throw new NativeCodexError('NATIVE_CODEX_UNITY_MCP_MISSING');
}

/**
 * Runs one ordinary tool-enabled Codex turn.  It intentionally has no JSON
 * schema/output-mode fallback: the source is read from the allowed target after
 * native shell/file/MCP tools finish.
 */
export async function runNativeCodexUnityTask(input: NativeCodexUnityTask): Promise<NativeCodexReceipt> {
  const model = input.model ?? NATIVE_CODEX_MODEL;
  if (model !== NATIVE_CODEX_MODEL || !safeInteger(input.maxCreditMicros) || input.maxCreditMicros < 1 || typeof input.prompt !== 'string' || !input.prompt.trim()) throw new NativeCodexError('NATIVE_CODEX_OPTIONS_INVALID');
  const { project, target } = checkedProject(input.projectPath, input.targetFile), artifacts = checkedArtifactDirectory(input.artifactDirectory);
  const mcpConfig = checkedMcpConfig(input.fixedMcpConfig), timeoutMs = input.timeoutMs ?? 600_000;
  if (!safeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 600_000) throw new NativeCodexError('NATIVE_CODEX_TIMEOUT_INVALID');
  const responseReserveCreditMicros = input.responseReserveCreditMicros ?? Math.min(500_000, Math.floor(input.maxCreditMicros / 10));
  if (!safeInteger(responseReserveCreditMicros) || responseReserveCreditMicros >= input.maxCreditMicros) throw new NativeCodexError('NATIVE_CODEX_RESERVE_INVALID');
  const interruptAtCreditMicros = input.maxCreditMicros - responseReserveCreditMicros;
  const receiptId = `native-codex:${randomUUID()}`, promptDigest = digest({ prompt: input.prompt, targetFile: input.targetFile });
  const started = performance.now(), logEvents: { method: string; itemType: string | null; itemId: string | null; itemStatus: string | null; mcpErrorMessage: string | null }[] = [];
  const toolProofRefs: string[] = []; let threadId: string | null = null, turnId: string | null = null;
  let latestUsage: ModelCreditUsage | null = null, error: string | null = null, interruption: NativeCodexEventLog['interruption'] = 'none';
  let overshootRisk = false, completed = false, interrupted = false;
  let settle!: () => void; const terminal = new Promise<void>(resolve => { settle = resolve; });
  const fail = (code: string): void => { if (error === null) error = code; if (!completed) { completed = true; settle(); } };
  const factory = input.connectionFactory ?? nativeCodexAppServerConnection;
  let connection: NativeCodexAppServerConnection | null = null, unlisten: (() => void) | null = null;
  let expire!: () => void;
  const deadline = new Promise<never>((_resolve, reject) => { expire = () => reject(new NativeCodexError('NATIVE_CODEX_TIMEOUT')); });
  const timer: ReturnType<typeof setTimeout> = setTimeout(() => { requestInterrupt(); fail('NATIVE_CODEX_TIMEOUT'); expire(); }, timeoutMs);
  const beforeDeadline = async <T>(promise: Promise<T>): Promise<T> => await Promise.race([promise, deadline]);
  const requestInterrupt = (): void => {
    if (interrupted || connection === null || threadId === null || turnId === null) return;
    interrupted = true;
    void connection.request('turn/interrupt', { threadId, turnId }).catch(() => undefined);
  };
  const observe = (notification: NativeCodexNotification): void => {
    const params = object(notification.params) ? notification.params : null, item = eventItem(notification.params);
    const itemType = item !== null && typeof item.type === 'string' ? item.type : null, itemId = item !== null && id(item.id) ? item.id : null;
    const itemStatus = item !== null && typeof item.status === 'string' && /^[a-zA-Z]+$/.test(item.status) ? item.status : null;
    const rawMcpError = itemType === 'mcpToolCall' && item !== null && object(item.error) && typeof item.error.message === 'string' ? item.error.message : null;
    const mcpErrorMessage = rawMcpError === null ? null : rawMcpError.replace(/[\r\n]/g, ' ').replace(/\/Users\/[^/\s]+/g, '<home>').replace(/(?:sk-|ghp_)[A-Za-z0-9_-]+/g, '<redacted>').slice(0, 500);
    if (logEvents.length < 256) logEvents.push({ method: /^[a-zA-Z/]+$/.test(notification.method) ? notification.method : 'invalid', itemType, itemId, itemStatus, mcpErrorMessage });
    if (params !== null && typeof params.threadId === 'string' && threadId !== null && params.threadId !== threadId) { fail('NATIVE_CODEX_THREAD_DRIFT'); return; }
    if (params !== null && typeof params.turnId === 'string' && turnId !== null && params.turnId !== turnId) { fail('NATIVE_CODEX_TURN_DRIFT'); return; }
    if (notification.method === 'model/rerouted') { fail('NATIVE_CODEX_MODEL_REROUTED'); return; }
    if (notification.method === 'thread/tokenUsage/updated') {
      const usage = params === null ? null : usageFromTotal(object(params.tokenUsage) ? params.tokenUsage.total : null);
      if (usage === null) { interruption = 'unknown-usage'; requestInterrupt(); fail('NATIVE_CODEX_USAGE_UNKNOWN'); return; }
      if (usage.inputTokens === null || usage.cachedInputTokens === null || usage.outputTokens === null) {
        interruption = 'unknown-usage'; requestInterrupt(); fail('NATIVE_CODEX_USAGE_UNKNOWN'); return;
      }
      if (latestUsage !== null && (latestUsage.inputTokens === null || latestUsage.cachedInputTokens === null || latestUsage.outputTokens === null ||
          usage.inputTokens < latestUsage.inputTokens || usage.cachedInputTokens < latestUsage.cachedInputTokens || usage.outputTokens < latestUsage.outputTokens)) {
        interruption = 'unknown-usage'; requestInterrupt(); fail('NATIVE_CODEX_USAGE_NONMONOTONIC'); return;
      }
      latestUsage = usage;
      const micros = creditMicrosForUsage([usage]);
      if (micros === null) { interruption = 'unknown-usage'; requestInterrupt(); fail('NATIVE_CODEX_USAGE_UNKNOWN'); return; }
      if (micros > input.maxCreditMicros) { interruption = 'credit-cap'; overshootRisk = true; requestInterrupt(); fail('NATIVE_CODEX_CREDIT_CAP_EXCEEDED'); }
      else if (micros >= interruptAtCreditMicros) { interruption = 'credit-cap'; overshootRisk = true; requestInterrupt(); fail('NATIVE_CODEX_CREDIT_CAP_RESERVE_REACHED'); }
      return;
    }
    if (notification.method === 'turn/started') {
      const turn = turnFrom(notification.params);
      if (turn !== null && id(turn.id)) {
        if (turnId !== null && turnId !== turn.id) { fail('NATIVE_CODEX_TURN_DRIFT'); return; }
        turnId = turn.id;
        if (turn.model !== undefined && turn.model !== null && turn.model !== model) fail('NATIVE_CODEX_MODEL_REROUTED');
      }
      return;
    }
    if (notification.method === 'item/completed' && item !== null && itemId !== null && turnId !== null && threadId !== null) {
      if (itemType === 'commandExecution') {
        if (typeof item.cwd !== 'string' || !path.isAbsolute(item.cwd) || !inside(project, path.resolve(item.cwd))) { fail('NATIVE_CODEX_TOOL_SCOPE_INVALID'); return; }
        toolProofRefs.push(`command:${threadId}:${turnId}:${itemId}`);
      } else if (itemType === 'fileChange') toolProofRefs.push(`file:${threadId}:${turnId}:${itemId}`);
      else if (itemType === 'mcpToolCall') {
        if (item.status !== 'completed' || (item.error !== undefined && item.error !== null) || !object(item.result) || item.result.isError === true) { fail('NATIVE_CODEX_MCP_TOOL_FAILED'); return; }
        if (typeof item.server !== 'string' || typeof item.tool !== 'string' || !mcpConfig.some(setting => setting.startsWith(`mcp_servers.${item.server}.`))) { fail('NATIVE_CODEX_MCP_TOOL_INVALID'); return; }
        toolProofRefs.push(`mcp:${threadId}:${turnId}:${itemId}:${shortHash(`${item.server}:${item.tool}`)}`);
      }
      return;
    }
    if (notification.method === 'turn/completed') {
      const turn = turnFrom(notification.params);
      if (turn === null || !id(turn.id) || (turnId !== null && turn.id !== turnId) || turn.status !== 'completed') { fail('NATIVE_CODEX_TURN_FAILED'); return; }
      if (latestUsage === null) { fail('NATIVE_CODEX_USAGE_MISSING'); return; }
      completed = true; settle();
    }
  };
  try {
    const binary = input.binaryPath ?? CURRENT_CODEX_BINARY_PATH;
    if (input.connectionFactory === undefined) {
      const version = spawnSync(binary, ['--version'], { cwd: project, env: codexChildEnvironment(), encoding: 'utf8', shell: false, timeout: 5_000 });
      if (version.status !== 0 || version.stdout.trim() !== NATIVE_CODEX_APP_SERVER_VERSION) throw new NativeCodexError('NATIVE_CODEX_CLI_VERSION_UNSUPPORTED');
    }
    connection = await beforeDeadline(factory.open({ binaryPath: binary, args: launchArgs(mcpConfig), cwd: project, env: codexChildEnvironment() }));
    unlisten = connection.onNotification(observe);
    const initialized = await beforeDeadline(connection.request('initialize', { clientInfo: { name: 'ai-agent-architect-unity', version: '1' }, capabilities: { optOutNotificationMethods: [] } }));
    if (!object(initialized)) throw new NativeCodexError('NATIVE_CODEX_INITIALIZE_INVALID');
    await beforeDeadline(connection.notify('initialized', {}));
    await requireUnityMcp(connection, beforeDeadline);
    const threadStarted = await beforeDeadline(connection.request('thread/start', { cwd: project, model, approvalPolicy: 'never', ephemeral: true }));
    const thread = object(threadStarted) && object(threadStarted.thread) ? threadStarted.thread : null;
    if (thread === null || !id(thread.id)) throw new NativeCodexError('NATIVE_CODEX_THREAD_INVALID');
    threadId = thread.id;
    if (object(threadStarted) && threadStarted.model !== null && threadStarted.model !== undefined && threadStarted.model !== model) throw new NativeCodexError('NATIVE_CODEX_MODEL_REROUTED');
    // The reservation is the full observed cap before any model response. It is
    // released only in the final receipt's measured charge, never replaced by a raw-token cap.
    const reservation = { schemaVersion: 'native-codex-reservation/1', receiptId, maxCreditMicros: input.maxCreditMicros, promptDigest };
    writeNew(path.join(artifacts, `${receiptId.replace(':', '-')}.reservation.json`), reservation);
    const turnStarted = await beforeDeadline(connection.request('turn/start', { threadId, model, cwd: project, approvalPolicy: 'never', input: [{ type: 'text', text: input.prompt }] }));
    const turn = turnFrom(turnStarted);
    if (turn === null || !id(turn.id)) throw new NativeCodexError('NATIVE_CODEX_TURN_INVALID');
    turnId = turn.id;
    if (turn.model !== undefined && turn.model !== null && turn.model !== model) throw new NativeCodexError('NATIVE_CODEX_MODEL_REROUTED');
    if (turn.status === 'failed') fail('NATIVE_CODEX_TURN_FAILED');
    await Promise.race([terminal, deadline]);
  } catch (cause) {
    error = cause instanceof NativeCodexError ? cause.code : 'NATIVE_CODEX_TRANSPORT_FAILED';
  } finally {
    clearTimeout(timer);
    unlisten?.(); await connection?.close();
  }
  const usage = latestUsage ?? { model: NATIVE_CODEX_MODEL, inputTokens: null, cachedInputTokens: null, outputTokens: null };
  const creditMicros = creditMicrosForUsage([usage]);
  if (error === null && (creditMicros === null || creditMicros > input.maxCreditMicros)) error = creditMicros === null ? 'NATIVE_CODEX_USAGE_MISSING' : 'NATIVE_CODEX_CREDIT_CAP_EXCEEDED';
  if (error === null && !toolProofRefs.length) error = 'NATIVE_CODEX_TOOL_PROOF_REQUIRED';
  let source: string | undefined;
  if (error === null) {
    try { source = readFileSync(target, 'utf8'); }
    catch { error = 'NATIVE_CODEX_TARGET_READ_FAILED'; }
  }
  const eventLog: NativeCodexEventLog = { schemaVersion: 'native-codex-event-log/1', threadId, turnId, events: logEvents, toolProofRefs, interruption };
  const eventLogDigest = digest(eventLog), eventFile = path.join(artifacts, `${receiptId.replace(':', '-')}.events.json`);
  writeNew(eventFile, eventLog);
  const receipt: NativeCodexReceipt = { schemaVersion: 'native-codex-receipt/1', receiptId, status: error === null ? 'completed' : 'failed', model: NATIVE_CODEX_MODEL,
    modelIdentityAssurance: 'requested-only', usage, creditMicros, reservedCreditMicros: input.maxCreditMicros, responseReserveCreditMicros, interruptAtCreditMicros, elapsedMs: Math.max(0, Math.round(performance.now() - started)),
    ...(source === undefined ? {} : { source }), sourceDigest: source === undefined ? null : digest(source), toolProofRefs: [...new Set(toolProofRefs)], error, overshootRisk, eventLogDigest, promptDigest };
  writeNew(path.join(artifacts, `${receiptId.replace(':', '-')}.receipt.json`), receipt);
  return receipt;
}
