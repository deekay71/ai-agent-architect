import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import { StringDecoder } from 'node:string_decoder';
import { canonicalJson, digest } from '../contracts/canonical.js';
import type { ModelRequest } from './types.js';

/** Re-review the isolation flags before admitting a different CLI build. */
export const CODEX_CLI_VERSION = 'codex-cli 0.155.0-alpha.16.4';
export const CODEX_BINARY_PATH = '/Applications/ChatGPT.app/Contents/Resources/codex';
/** Current build is deliberately separate: historical receipts remain replayable. */
export const CURRENT_CODEX_CLI_VERSION = 'codex-cli 0.158.0-alpha.2.1';
export const CURRENT_CODEX_BINARY_PATH = '/Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex';
export interface CodexUsage {
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  /** Arithmetic sum of the two reported counters; not an independently reported total. */
  totalTokens: number;
  reasoningTokens: number | null;
}
export interface CodexEventDiagnostics {
  eventCount: number;
  eventTypes: string[];
  itemTypes: string[];
  rejectedEventType: string | null;
  rejectedItemType: string | null;
  rejectionCategory: string | null;
  truncated: boolean;
}
export interface CodexResult {
  status: 'completed' | 'incomplete' | 'failed';
  output: unknown | null;
  requestedModel: string;
  requestDigest: string;
  renderedRequestDigest: string;
  launchPolicyDigest: string;
  configurationDigest: string;
  usage: CodexUsage | null;
  elapsedMs: number;
  cliVersion: string | null;
  threadId: string | null;
  issues: string[];
  apiCostMicros: null;
  exactInputCount: null;
  modelIdentityAssurance: 'requested-only';
  maxOutputTokensEnforced: false;
  isolationAssurance: 'capability-flags-and-event-audit';
  /** Optional for historical receipts. Identifiers only, never event text or payload values. */
  eventDiagnostics?: CodexEventDiagnostics;
}
export type CodexStopReason = 'timeout' | 'aborted' | 'output-limit' | 'event-rejected' | 'spawn-failed';
export interface CodexProcessInvocation {
  binary: string;
  args: readonly string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
  stdin: string;
  timeoutMs: number;
  maxOutputBytes: number;
  signal?: AbortSignal;
  /** Rejecting a line terminates the process group. Never persist raw JSONL. */
  onStdoutLine?: (line: string) => boolean;
}
export interface CodexProcessResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  stopReason: CodexStopReason | null;
}
export type CodexProcessRunner = (invocation: CodexProcessInvocation) => Promise<CodexProcessResult>;
export interface CodexTransportOptions {
  binaryPath?: string;
  /** Injected runners always carry mock assurance. */
  runner?: CodexProcessRunner;
  timeoutMs?: number;
  maxRequestBytes?: number;
  maxResponseBytes?: number;
}
export interface CodexTransport {
  id: 'codex-chatgpt-exec/1';
  assurance: 'codex-chatgpt' | 'mock';
  /** Undefined is accepted only by older in-process fakes. */
  cliVersion?: string;
  launchPolicyDigest: string;
  configurationDigest(request: ModelRequest): string;
  respond(request: ModelRequest, signal?: AbortSignal): Promise<CodexResult>;
}
export class CodexTransportError extends Error {
  constructor(readonly code: string) { super(code); this.name = 'CodexTransportError'; }
}
type RecordValue = Record<string, unknown>;
const object = (value: unknown): value is RecordValue => value !== null && typeof value === 'object' && !Array.isArray(value);
const integer = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const EFFORTS = new Set(['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max', 'ultra']);
const REQUEST_KEYS = new Set(['model', 'instructions', 'input', 'maxOutputTokens', 'schema', 'schemaName', 'reasoningEffort']);
function bounded(value: number, maximum: number): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) throw new CodexTransportError('CODEX_OPTIONS_INVALID');
  return value;
}
function snapshot(request: ModelRequest, maxBytes: number): { request: ModelRequest; requestDigest: string } {
  let raw: string;
  try { raw = canonicalJson(request); } catch { throw new CodexTransportError('CODEX_REQUEST_INVALID'); }
  if (Buffer.byteLength(raw) > maxBytes) throw new CodexTransportError('CODEX_REQUEST_TOO_LARGE');
  const copy: unknown = JSON.parse(raw);
  if (!object(copy) || Object.keys(copy).some(key => !REQUEST_KEYS.has(key)) ||
      typeof copy.model !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,199}$/.test(copy.model) ||
      typeof copy.instructions !== 'string' || typeof copy.input !== 'string' ||
      !integer(copy.maxOutputTokens) || copy.maxOutputTokens < 1 ||
      !object(copy.schema) || copy.schema.type !== 'object' ||
      typeof copy.schemaName !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(copy.schemaName) ||
      (copy.reasoningEffort !== undefined && (typeof copy.reasoningEffort !== 'string' || !EFFORTS.has(copy.reasoningEffort)))) {
    throw new CodexTransportError('CODEX_REQUEST_INVALID');
  }
  return { request: copy as unknown as ModelRequest, requestDigest: digest(copy) };
}

/** Preserve only OS startup/auth location variables; never inspect any credential value. */
export function codexChildEnvironment(source: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { PATH: '/usr/bin:/bin:/usr/sbin:/sbin', LANG: 'en_US.UTF-8', NO_COLOR: '1', TERM: 'dumb' };
  for (const key of ['HOME', 'CODEX_HOME', 'USER', 'LOGNAME', 'TMPDIR'] as const) {
    if (source[key] !== undefined) env[key] = source[key];
  }
  return env;
}

/** Detached POSIX process groups make timeout/abort cleanup include descendants. */
export const runCodexProcess: CodexProcessRunner = async invocation => {
  if (invocation.signal?.aborted) return { exitCode: null, stdout: '', stderr: '', stopReason: 'aborted' };
  if (process.platform === 'win32') return { exitCode: null, stdout: '', stderr: '', stopReason: 'spawn-failed' };
  return await new Promise<CodexProcessResult>(resolve => {
    let child: ReturnType<typeof spawn>;
    try { child = spawn(invocation.binary, [...invocation.args], { cwd: invocation.cwd, env: invocation.env, detached: true, stdio: ['pipe', 'pipe', 'pipe'], shell: false }); }
    catch { resolve({ exitCode: null, stdout: '', stderr: '', stopReason: 'spawn-failed' }); return; }
    let outputBytes = 0; let stdout = ''; let stderr = ''; let lineBuffer = '';
    const decoders = { stdout: new StringDecoder('utf8'), stderr: new StringDecoder('utf8') };
    let stopReason: CodexStopReason | null = null; let settled = false;
    let killTimer: ReturnType<typeof setTimeout> | undefined;
    const killGroup = (signal: NodeJS.Signals): void => {
      if (child.pid === undefined) return;
      try { process.kill(-child.pid, signal); } catch { /* already exited */ }
    };
    const stop = (reason: CodexStopReason): void => {
      if (stopReason !== null || settled) return;
      stopReason = reason; killGroup('SIGTERM');
      killTimer = setTimeout(() => killGroup('SIGKILL'), 150);
    };
    const abort = (): void => stop('aborted');
    invocation.signal?.addEventListener('abort', abort, { once: true });
    if (invocation.signal?.aborted) abort();
    const timer = setTimeout(() => stop('timeout'), invocation.timeoutMs);
    const append = (chunk: Buffer, stream: 'stdout' | 'stderr'): void => {
      if (stopReason !== null) return;
      outputBytes += chunk.byteLength;
      if (outputBytes > invocation.maxOutputBytes) { stop('output-limit'); return; }
      const value = decoders[stream].write(chunk);
      if (stream === 'stderr') { stderr += value; return; }
      // Model runs stream directly to a sanitizer; no raw reasoning transcript is accumulated.
      if (invocation.onStdoutLine === undefined) { stdout += value; return; }
      lineBuffer += value;
      while (lineBuffer.includes('\n')) {
        const index = lineBuffer.indexOf('\n'); const line = lineBuffer.slice(0, index); lineBuffer = lineBuffer.slice(index + 1);
        if (!invocation.onStdoutLine(line)) { stop('event-rejected'); return; }
      }
    };
    child.stdout?.on('data', (chunk: Buffer) => append(chunk, 'stdout'));
    child.stderr?.on('data', (chunk: Buffer) => append(chunk, 'stderr'));
    child.stdin?.on('error', () => { /* EPIPE is represented by the exit/stop receipt. */ });
    child.on('error', () => stop('spawn-failed'));
    child.on('close', code => {
      if (settled) return;
      if (stopReason === null) {
        stderr += decoders.stderr.end();
        if (invocation.onStdoutLine === undefined) stdout += decoders.stdout.end();
        else lineBuffer += decoders.stdout.end();
      }
      if (stopReason === null && lineBuffer.trim() && invocation.onStdoutLine !== undefined && !invocation.onStdoutLine(lineBuffer)) stopReason = 'event-rejected';
      settled = true; clearTimeout(timer); if (killTimer !== undefined) clearTimeout(killTimer);
      invocation.signal?.removeEventListener('abort', abort); killGroup('SIGKILL');
      resolve({ exitCode: code, stdout, stderr, stopReason });
    });
    child.stdin?.end(invocation.stdin);
  });
};

const DISABLED_FEATURES = [
  'apps', 'artifact', 'browser_use', 'browser_use_external', 'browser_use_full_cdp_access', 'chronicle',
  'code_mode', 'code_mode_host', 'code_mode_only', 'code_mode_prewarm', 'computer_use', 'context_management',
  'default_mode_request_user_input', 'deferred_executor', 'deferred_tool_world_state', 'enable_mcp_apps',
  'executor_capability_discovery', 'external_agent_memory_import', 'goals', 'hooks', 'image_generation',
  'in_app_browser', 'in_app_chat', 'in_app_local_automation', 'memories', 'multi_agent', 'multi_agent_v2',
  'plugins', 'plugin_sharing', 'realtime_conversation', 'recommended_plugins', 'remote_plugin',
  'request_permissions_tool', 'send_message_to_user_async', 'shell_snapshot', 'shell_snapshot_v2',
  'shell_tool', 'skill_mcp_dependency_install', 'skill_search', 'sleep_tool', 'standalone_web_search',
  'step_model_switching', 'token_budget', 'tool_call_mcp_elicitation', 'tool_suggest',
  'unbounded_connection_retries', 'unified_exec', 'view_image',
  'workspace_dependencies', 'worktrees',
] as const;

function execArgs(request: ModelRequest, schemaFile: string, cwd: string, privateRoot: string): string[] {
  const settings: Record<string, string | number | boolean> = {
    forced_login_method: 'chatgpt', model_provider: 'openai', approval_policy: 'never', web_search: 'disabled',
    // Prevent the experimental-feature banner from adding a startup notice.
    // Suppress only that presentation notice; actual error/tool events still fail closed.
    suppress_unstable_features_warning: true,
    default_permissions: 'architect-benchmark', 'permissions.architect-benchmark.extends': ':read-only',
    'permissions.architect-benchmark.network.enabled': false,
    project_doc_max_bytes: 0, 'skills.include_instructions': false, 'skills.bundled.enabled': false,
    'features.skip_host_skill_discovery': true, 'tools.update_plan.enabled': false,
    'tools.experimental_request_user_input.enabled': false, 'orchestrator.mcp.enabled': false,
    'memories.use_memories': false, 'memories.generate_memories': false, 'memories.dedicated_tools': false,
    'include_apps_instructions': false, 'include_environment_context': false,
    'include_collaboration_mode_instructions': false, hide_agent_reasoning: true, show_raw_agent_reasoning: false,
    'history.persistence': 'none', 'analytics.enabled': false, 'feedback.enabled': false,
    check_for_update_on_startup: false,
    'shell_environment_policy.inherit': 'none', allow_login_shell: false,
    log_dir: join(privateRoot, 'logs'), sqlite_home: join(privateRoot, 'sqlite'),
  };
  if (request.reasoningEffort !== undefined) settings.model_reasoning_effort = request.reasoningEffort;
  const args = ['exec', '--ignore-user-config', '--ignore-rules', '--strict-config', '--ephemeral', '--skip-git-repo-check',
    '--json', '--color', 'never', '--model', request.model, '--cd', cwd, '--output-schema', schemaFile];
  for (const [key, value] of Object.entries(settings)) args.push('-c', `${key}=${JSON.stringify(value)}`);
  // Quoted dotted key segments are not unquoted by CLI -c parsing; use a TOML value table.
  args.push('-c', 'permissions.architect-benchmark.filesystem={":root"="deny",":minimal"="read",":workspace_roots"="read"}');
  for (const feature of DISABLED_FEATURES) args.push('--disable', feature);
  // Empty mappings prevent attaching tools from config; installed plugins are disabled above.
  args.push('-c', 'mcp_servers={}', '-c', 'plugins={}', '-c', 'hooks={}', '-');
  return args;
}

// Exact advisory observed offline on the pinned CLI. Tool capability remains disabled.
const DISABLED_CODE_MODE_NOTICE = 'Code Mode is unavailable because code-mode host is disabled. Code mode will fail closed; enable `features.code_mode_host` and install `codex-code-mode-host`.';

/** Canonical wrapper bytes are bound separately from the original ModelRequest. */
export function renderCodexRequest(request: ModelRequest): string {
  return canonicalJson({ taskInstructions: request.instructions, input: request.input,
    responseInstructions: 'Use only the supplied input. Return exactly one JSON object conforming to the response schema. Do not use tools.',
    requestedMaxOutputTokens: request.maxOutputTokens });
}
function launchPolicyDigest(cliVersion: string): string { return digest({
  schemaVersion: 'codex-launch-policy/1', supportedCliVersion: cliVersion,
  startupNoticePolicy: { message: DISABLED_CODE_MODE_NOTICE, maximum: 1, beforeTurnOnly: true },
  args: execArgs({ model: '<requested-model>', instructions: '', input: '', maxOutputTokens: 1,
    schema: { type: 'object' }, schemaName: 'placeholder', reasoningEffort: 'medium' }, '<schema>', '<work>', '<private>'),
  rendering: renderCodexRequest({ model: '<requested-model>', instructions: '<instructions>', input: '<input>',
    maxOutputTokens: 1, schema: { type: 'object' }, schemaName: 'placeholder' }),
  environmentAllowlist: ['HOME', 'CODEX_HOME', 'USER', 'LOGNAME', 'TMPDIR'],
  isolationAssurance: 'capability-flags-and-event-audit', modelIdentityAssurance: 'requested-only',
  applicationRetries: 0, cliInternalRetries: 'CLI-managed; not an exact provider-request cap',
}); }
/** Historical policy: keep for existing evidence replay. */
export const CODEX_LAUNCH_POLICY_DIGEST = launchPolicyDigest(CODEX_CLI_VERSION);
/** Current native policy, pinned after offline `--version`/help inspection on 2026-09-30. */
export const CURRENT_CODEX_LAUNCH_POLICY_DIGEST = launchPolicyDigest(CURRENT_CODEX_CLI_VERSION);

function parseUsage(raw: unknown): CodexUsage | null {
  if (!object(raw) || Object.keys(raw).some(key => !['input_tokens', 'cached_input_tokens', 'cache_write_input_tokens', 'output_tokens', 'reasoning_output_tokens'].includes(key)) ||
      !integer(raw.input_tokens) || !integer(raw.cached_input_tokens) || !integer(raw.output_tokens) ||
      raw.cached_input_tokens > raw.input_tokens || !Number.isSafeInteger(raw.input_tokens + raw.output_tokens) ||
      // The installed CLI reports this field. Only known zero is admitted until
      // cache-write accounting receives an explicit transport contract.
      (raw.cache_write_input_tokens !== undefined && raw.cache_write_input_tokens !== 0) ||
      (raw.reasoning_output_tokens !== undefined && (!integer(raw.reasoning_output_tokens) || raw.reasoning_output_tokens > raw.output_tokens))) return null;
  return { inputTokens: raw.input_tokens, cachedInputTokens: raw.cached_input_tokens, outputTokens: raw.output_tokens,
    totalTokens: raw.input_tokens + raw.output_tokens, reasoningTokens: raw.reasoning_output_tokens as number | undefined ?? null };
}

/** One thread and one turn, with no accepted tool, plan or unknown events. Reasoning is discarded. */
function eventParser(): { line: (line: string) => boolean; finish: () => { output: unknown | null; usage: CodexUsage | null; threadId: string | null; issues: string[]; eventDiagnostics: CodexEventDiagnostics } } {
  let startupNoticeSeen = false;
  let threadId: string | null = null; let started = false; let completed = false; let message: string | null = null;
  let usage: CodexUsage | null = null; const issues: string[] = []; const completedItems = new Set<string>();
  const diagnostics: CodexEventDiagnostics = { eventCount: 0, eventTypes: [], itemTypes: [], rejectedEventType: null,
    rejectedItemType: null, rejectionCategory: null, truncated: false };
  let currentEventType: string | null = null; let currentItemType: string | null = null;
  const typeName = (value: unknown, seen: string[]): string | null => {
    if (typeof value !== 'string') return null;
    if (!/^[a-zA-Z][a-zA-Z0-9_.:-]{0,79}$/.test(value)) { diagnostics.truncated = true; return null; }
    if (!seen.includes(value)) { if (seen.length < 16) seen.push(value); else diagnostics.truncated = true; }
    return value;
  };
  const fail = (issue: string): false => {
    if (!issues.includes(issue)) issues.push(issue);
    if (diagnostics.rejectionCategory === null) {
      diagnostics.rejectedEventType = currentEventType; diagnostics.rejectedItemType = currentItemType;
      diagnostics.rejectionCategory = issue;
    }
    return false;
  };
  return {
    line: line => {
      if (!line.trim()) return true;
      diagnostics.eventCount++; currentEventType = null; currentItemType = null;
      let event: unknown; try { event = JSON.parse(line); } catch { return fail('CODEX_EVENT_INVALID'); }
      if (!object(event) || typeof event.type !== 'string') return fail('CODEX_EVENT_INVALID');
      currentEventType = typeName(event.type, diagnostics.eventTypes);
      if (object(event.item)) currentItemType = typeName(event.item.type, diagnostics.itemTypes);
      if (completed) return fail('CODEX_EXTRA_EVENT');
      if (event.type === 'thread.started') {
        if (threadId !== null || started || typeof event.thread_id !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(event.thread_id)) return fail('CODEX_THREAD_INVALID');
        threadId = event.thread_id; return true;
      }
      if (event.type === 'turn.started') { if (threadId === null || started) return fail('CODEX_MULTIPLE_TURNS'); started = true; return true; }
      if (event.type === 'turn.failed' || event.type === 'error') return fail('CODEX_TURN_FAILED');
      if (event.type === 'turn.completed') {
        if (!started) return fail('CODEX_TURN_INVALID'); completed = true; usage = parseUsage(event.usage);
        if (usage === null) return fail('CODEX_USAGE_UNKNOWN'); return true;
      }
      // A pinned CLI advisory about intentionally disabled tools is not a failed model turn.
      // Match its entire shape/text and position; never admit arbitrary error items.
      if (event.type === 'item.completed' && threadId !== null && !started && !startupNoticeSeen &&
          Object.keys(event).every(key => ['type', 'item'].includes(key)) && object(event.item) &&
          Object.keys(event.item).every(key => ['id', 'type', 'message'].includes(key)) &&
          typeof event.item.id === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(event.item.id) &&
          event.item.type === 'error' && event.item.message === DISABLED_CODE_MODE_NOTICE) {
        startupNoticeSeen = true; completedItems.add(event.item.id); return true;
      }
      if (!['item.started', 'item.updated', 'item.completed'].includes(event.type) || !started || !object(event.item) ||
          typeof event.item.id !== 'string' || typeof event.item.type !== 'string') return fail('CODEX_EVENT_UNKNOWN');
      if (event.item.type !== 'reasoning' && event.item.type !== 'agent_message') return fail('CODEX_TOOL_EVENT_DENIED');
      if (event.type !== 'item.completed') return true;
      if (completedItems.has(event.item.id)) return fail('CODEX_DUPLICATE_ITEM'); completedItems.add(event.item.id);
      if (event.item.type === 'reasoning') return true;
      if (typeof event.item.text !== 'string' || message !== null) return fail('CODEX_MULTIPLE_OUTPUTS');
      message = event.item.text; return true;
    },
    finish: () => {
      let output: unknown | null = null;
      if (!completed && !issues.length) issues.push('CODEX_TURN_INCOMPLETE');
      if (message === null && !issues.length) issues.push('CODEX_OUTPUT_MISSING');
      if (message !== null && !issues.length) {
        try { const parsed: unknown = JSON.parse(message); if (object(parsed)) output = parsed; else issues.push('CODEX_OUTPUT_INVALID'); }
        catch { issues.push('CODEX_OUTPUT_INVALID'); }
      }
      return { output: issues.length ? null : output, usage, threadId, issues, eventDiagnostics: diagnostics };
    },
  };
}

/** Subscription transport, deliberately separate from the exact-count/API-tariff ModelProvider. */
type CodexBuild = { cliVersion: string; binaryPath: string; launchPolicyDigest: string };
function createCodexTransportForBuild(options: CodexTransportOptions, build: CodexBuild): CodexTransport {
  const binary = options.binaryPath ?? build.binaryPath;
  if (!isAbsolute(binary)) throw new CodexTransportError('CODEX_BINARY_PATH_INVALID');
  const runner = options.runner ?? runCodexProcess;
  const timeoutMs = bounded(options.timeoutMs ?? 180_000, 600_000);
  const maxRequestBytes = bounded(options.maxRequestBytes ?? 1_048_576, 4_194_304);
  const maxResponseBytes = bounded(options.maxResponseBytes ?? 2_097_152, 8_388_608);
  const configurationDigest = (request: ModelRequest): string => digest({ launchPolicyDigest: build.launchPolicyDigest,
    binary, timeoutMs, maxRequestBytes, maxResponseBytes, model: request.model, reasoningEffort: request.reasoningEffort ?? null });
  return {
    id: 'codex-chatgpt-exec/1', assurance: options.runner === undefined ? 'codex-chatgpt' : 'mock',
    cliVersion: build.cliVersion, launchPolicyDigest: build.launchPolicyDigest, configurationDigest,
    async respond(request, signal): Promise<CodexResult> {
      const pinned = snapshot(request, maxRequestBytes); const started = performance.now();
      const prompt = renderCodexRequest(pinned.request);
      if (Buffer.byteLength(prompt) > maxRequestBytes) throw new CodexTransportError('CODEX_REQUEST_TOO_LARGE');
      const base: CodexResult = { status: 'failed', output: null, requestedModel: pinned.request.model, requestDigest: pinned.requestDigest,
        renderedRequestDigest: digest(prompt), launchPolicyDigest: build.launchPolicyDigest,
        configurationDigest: configurationDigest(pinned.request),
        usage: null, elapsedMs: 0, cliVersion: null, threadId: null, issues: [], apiCostMicros: null, exactInputCount: null,
        modelIdentityAssurance: 'requested-only', maxOutputTokensEnforced: false, isolationAssurance: 'capability-flags-and-event-audit' };
      const finish = (): CodexResult => ({ ...base, elapsedMs: Math.max(0, performance.now() - started) });
      if (signal?.aborted) { base.issues = ['CODEX_ABORTED']; return finish(); }
      let root: string | null = null;
      try {
        root = await mkdtemp(join(tmpdir(), 'architect-codex-')); const cwd = join(root, 'work'); await mkdir(cwd, { mode: 0o700 });
        const env = codexChildEnvironment();
        const invoke = (args: string[], stdin = '', onStdoutLine?: (line: string) => boolean): Promise<CodexProcessResult> => runner({
          binary, args, cwd, env, stdin, timeoutMs: Math.min(timeoutMs, Math.max(1, timeoutMs - (performance.now() - started))),
          maxOutputBytes: onStdoutLine === undefined ? 16_384 : maxResponseBytes,
          ...(signal === undefined ? {} : { signal }), ...(onStdoutLine === undefined ? {} : { onStdoutLine }),
        });
        const version = await invoke(['--version']);
        if (version.exitCode !== 0 || version.stopReason !== null || version.stdout.trim() !== build.cliVersion) {
          base.issues = ['CODEX_CLI_VERSION_UNSUPPORTED']; return finish();
        }
        base.cliVersion = build.cliVersion;
        const auth = await invoke(['-c', 'forced_login_method="chatgpt"', 'login', 'status']);
        if (auth.exitCode !== 0 || auth.stopReason !== null || `${auth.stdout}\n${auth.stderr}`.trim() !== 'Logged in using ChatGPT') {
          base.issues = ['CODEX_CHATGPT_AUTH_REQUIRED']; return finish();
        }
        const schemaFile = join(root, 'output.schema.json'); await writeFile(schemaFile, canonicalJson(pinned.request.schema), { mode: 0o600, flag: 'wx' });
        const parser = eventParser();
        // maxOutputTokens is only guidance here: CLI has no supported hard generation cap.
        const result = await invoke(execArgs(pinned.request, schemaFile, cwd, root), prompt, parser.line);
        const parsed = parser.finish(); Object.assign(base, parsed);
        if (result.stopReason !== null) base.issues.push(`CODEX_${result.stopReason.toUpperCase().replaceAll('-', '_')}`);
        if (result.exitCode !== 0) base.issues.push('CODEX_PROCESS_FAILED');
        base.issues = [...new Set(base.issues)];
        base.status = base.issues.length ? 'incomplete' : 'completed';
        if (base.issues.length) base.output = null;
        return finish();
      } catch {
        base.issues = ['CODEX_TRANSPORT_FAILED']; return finish();
      } finally { if (root !== null) await rm(root, { recursive: true, force: true }); }
    },
  };
}

/** Historical factory retained for receipt compatibility and replay. */
export function createCodexTransport(options: CodexTransportOptions = {}): CodexTransport {
  return createCodexTransportForBuild(options, { cliVersion: CODEX_CLI_VERSION, binaryPath: CODEX_BINARY_PATH, launchPolicyDigest: CODEX_LAUNCH_POLICY_DIGEST });
}

/** New native runs must opt into the current, separately pinned ChatGPT-bundled CLI. */
export function createCurrentCodexTransport(options: CodexTransportOptions = {}): CodexTransport {
  return createCodexTransportForBuild(options, { cliVersion: CURRENT_CODEX_CLI_VERSION, binaryPath: CURRENT_CODEX_BINARY_PATH,
    launchPolicyDigest: CURRENT_CODEX_LAUNCH_POLICY_DIGEST });
}
