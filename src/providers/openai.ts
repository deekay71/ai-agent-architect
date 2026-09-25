import { canonicalJson, digest } from '../contracts/canonical.js';
import { isValidModelUsage } from './pricing.js';
import type { InputTokenCount, ModelProvider, ModelRequest, ModelResult, ModelUsage } from './types.js';

const API = 'https://api.openai.com/v1/responses';
const EFFORTS = new Set(['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max', 'ultra']);
const REQUEST_KEYS = new Set(['model', 'instructions', 'input', 'maxOutputTokens', 'schema', 'schemaName', 'reasoningEffort']);
type ObjectRecord = Record<string, unknown>;

export class OpenAIProviderError extends Error {
  constructor(readonly code: string, readonly httpStatus: number | null = null, readonly requestId: string | null = null) {
    super(code);
    this.name = 'OpenAIProviderError';
  }
}

export interface OpenAIProviderOptions {
  /** Production defaults only to OPENAI_API_KEY. Never persisted or returned. */
  apiKey?: string;
  /** Test seam. Any injected transport reports mock assurance. */
  fetch?: typeof fetch;
  timeoutMs?: number;
  maxRequestBytes?: number;
  maxResponseBytes?: number;
}

function object(value: unknown): value is ObjectRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function integer(value: unknown): value is number { return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0; }
function responseId(value: unknown): value is string { return typeof value === 'string' && /^resp_[a-zA-Z0-9_-]{1,192}$/.test(value); }
function safeRequestId(response: Response): string | null {
  const value = response.headers.get('x-request-id');
  return value && /^req_[a-zA-Z0-9_-]{1,128}$/.test(value) ? value : null;
}
function failure(code: string): never { throw new OpenAIProviderError(code); }

function boundedOption(value: number, max: number): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > max) failure('OPENAI_OPTIONS_INVALID');
  return value;
}

function snapshotRequest(request: ModelRequest, maxBytes: number): { request: ModelRequest; requestDigest: string; responseBody: string; countBody: string } {
  let json: string;
  try { json = canonicalJson(request); } catch { return failure('OPENAI_REQUEST_INVALID'); }
  if (Buffer.byteLength(json) > maxBytes) failure('OPENAI_REQUEST_TOO_LARGE');
  const copy: unknown = JSON.parse(json);
  if (!object(copy) || Object.keys(copy).some(key => !REQUEST_KEYS.has(key)) ||
      typeof copy.model !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,199}$/.test(copy.model) ||
      typeof copy.instructions !== 'string' || typeof copy.input !== 'string' ||
      !integer(copy.maxOutputTokens) || copy.maxOutputTokens === 0 ||
      typeof copy.schemaName !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(copy.schemaName) ||
      !object(copy.schema) || copy.schema.type !== 'object' ||
      (copy.reasoningEffort !== undefined && (typeof copy.reasoningEffort !== 'string' || !EFFORTS.has(copy.reasoningEffort)))) failure('OPENAI_REQUEST_INVALID');
  // The count API accepts input-bearing fields, not generation-only controls.
  const shared = {
    model: copy.model, instructions: copy.instructions, input: copy.input,
    text: { format: { type: 'json_schema', name: copy.schemaName, schema: copy.schema, strict: true } },
    truncation: 'disabled',
    ...(copy.reasoningEffort === undefined ? {} : { reasoning: { effort: copy.reasoningEffort } }),
  };
  const responseBody = canonicalJson({ ...shared, max_output_tokens: copy.maxOutputTokens, store: false, stream: false, service_tier: 'default' });
  const countBody = canonicalJson(shared);
  if (Buffer.byteLength(responseBody) > maxBytes || Buffer.byteLength(countBody) > maxBytes) failure('OPENAI_REQUEST_TOO_LARGE');
  return { request: copy as unknown as ModelRequest, requestDigest: digest(copy), responseBody, countBody };
}

function parseUsage(value: unknown): ModelUsage | null {
  if (!object(value) || !object(value.input_tokens_details) || !object(value.output_tokens_details) ||
      !integer(value.input_tokens) || !integer(value.output_tokens) || !integer(value.total_tokens) ||
      !integer(value.input_tokens_details.cached_tokens) || !integer(value.output_tokens_details.reasoning_tokens)) return null;
  // Cache-write pricing is outside this standard read-cache tariff. Do not pretend it is free.
  if (value.input_tokens_details.cache_write_tokens !== undefined && value.input_tokens_details.cache_write_tokens !== 0) return null;
  const usage: ModelUsage = {
    inputTokens: value.input_tokens, outputTokens: value.output_tokens, totalTokens: value.total_tokens,
    cachedInputTokens: value.input_tokens_details.cached_tokens, reasoningTokens: value.output_tokens_details.reasoning_tokens,
  };
  return isValidModelUsage(usage) ? usage : null;
}

function parseOutput(raw: ObjectRecord): { status: ModelResult['status']; output: unknown | null; issues: string[] } {
  if (raw.status !== 'completed' || (raw.error !== undefined && raw.error !== null) ||
      (raw.incomplete_details !== undefined && raw.incomplete_details !== null)) return { status: 'incomplete', output: null, issues: ['PROVIDER_NOT_COMPLETED'] };
  if (!Array.isArray(raw.output)) return { status: 'incomplete', output: null, issues: ['OUTPUT_INVALID'] };
  const texts: string[] = []; let refused = false; let invalid = false;
  for (const item of raw.output) {
    if (!object(item)) { invalid = true; continue; }
    if (item.type === 'reasoning') continue; // Never expose or store provider reasoning text.
    if (item.type !== 'message' || item.role !== 'assistant' || item.status !== 'completed' || !Array.isArray(item.content)) { invalid = true; continue; }
    for (const content of item.content) {
      if (!object(content)) { invalid = true; continue; }
      if (content.type === 'refusal' && typeof content.refusal === 'string') refused = true;
      else if (content.type === 'output_text' && typeof content.text === 'string') texts.push(content.text);
      else invalid = true;
    }
  }
  if (refused) return { status: 'refused', output: null, issues: ['PROVIDER_REFUSAL'] };
  if (invalid || texts.length !== 1) return { status: 'incomplete', output: null, issues: ['OUTPUT_INVALID'] };
  try {
    const output: unknown = JSON.parse(texts[0]!);
    if (!object(output)) return { status: 'incomplete', output: null, issues: ['OUTPUT_INVALID'] };
    return { status: 'completed', output, issues: [] };
  } catch { return { status: 'incomplete', output: null, issues: ['OUTPUT_INVALID'] }; }
}

/** Stateless text-only Responses adapter. No tools, external URLs, retries or redirects. */
export function createOpenAIProvider(options: OpenAIProviderOptions = {}): ModelProvider {
  const key = options.apiKey ?? process.env.OPENAI_API_KEY;
  if (typeof key !== 'string' || !key.trim() || /\s/.test(key)) failure('OPENAI_API_KEY_REQUIRED');
  const transport = options.fetch ?? globalThis.fetch;
  const timeoutMs = boundedOption(options.timeoutMs ?? 60_000, 120_000);
  const maxRequestBytes = boundedOption(options.maxRequestBytes ?? 1_048_576, 20_971_520);
  const maxResponseBytes = boundedOption(options.maxResponseBytes ?? 2_097_152, 20_971_520);
  const assurance = options.fetch === undefined ? 'provider' : 'mock';
  // Each object is a distinct admission generation, including while its count is pending.
  const counts = new Map<string, { inputTokens: number | null }>();

  async function post(path: '' | '/input_tokens', body: string): Promise<{ raw: unknown; requestId: string | null }> {
    const controller = new AbortController();
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const expired = new Promise<never>((_resolve, reject) => {
      timeout = setTimeout(() => { controller.abort(); reject(new OpenAIProviderError('OPENAI_TIMEOUT')); }, timeoutMs);
    });
    const operation = async (): Promise<{ raw: unknown; requestId: string | null }> => {
      const response = await transport(`${API}${path}`, {
        method: 'POST', redirect: 'error', signal: controller.signal,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` }, body,
      });
      const requestId = safeRequestId(response);
      if (response.redirected || (response.url && response.url !== `${API}${path}`)) failure('OPENAI_REDIRECT_DENIED');
      if (!response.ok) {
        void response.body?.cancel().catch(() => undefined);
        throw new OpenAIProviderError('OPENAI_HTTP_ERROR', response.status, requestId);
      }
      const length = response.headers.get('content-length');
      if (length !== null && (!/^\d+$/.test(length) || Number(length) > maxResponseBytes)) {
        void response.body?.cancel().catch(() => undefined);
        failure('OPENAI_RESPONSE_TOO_LARGE');
      }
      const reader = response.body?.getReader();
      if (!reader) failure('OPENAI_RESPONSE_INVALID');
      const cancelRead = (): void => { void reader.cancel().catch(() => undefined); };
      controller.signal.addEventListener('abort', cancelRead, { once: true });
      let size = 0; const chunks: Uint8Array[] = [];
      try {
        while (true) {
          const part = await reader.read(); if (part.done) break;
          size += part.value.byteLength;
          if (size > maxResponseBytes) failure('OPENAI_RESPONSE_TOO_LARGE');
          chunks.push(part.value);
        }
      } finally {
        controller.signal.removeEventListener('abort', cancelRead);
        void reader.cancel().catch(() => undefined); reader.releaseLock();
      }
      let raw: unknown;
      try { raw = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks))); }
      catch { return failure('OPENAI_RESPONSE_INVALID'); }
      return { raw, requestId };
    };
    try { return await Promise.race([operation(), expired]); }
    catch (error) {
      if (error instanceof OpenAIProviderError) throw error;
      // Never propagate request bodies, Authorization headers, SDK errors or provider bodies.
      throw new OpenAIProviderError(controller.signal.aborted ? 'OPENAI_TIMEOUT' : 'OPENAI_TRANSPORT_ERROR');
    } finally { if (timeout !== undefined) clearTimeout(timeout); controller.abort(); }
  }

  return {
    id: 'openai-responses/1', assurance,
    async countInput(request): Promise<InputTokenCount> {
      const pinned = snapshotRequest(request, maxRequestBytes);
      const admission: { inputTokens: number | null } = { inputTokens: null };
      // A recount revokes prior admission synchronously, before yielding to transport.
      counts.delete(pinned.requestDigest);
      // Bound process-local admission evidence. Eviction requires recount, never a guessed count.
      if (counts.size >= 10_000) counts.delete(counts.keys().next().value!);
      counts.set(pinned.requestDigest, admission);
      try {
        const { raw } = await post('/input_tokens', pinned.countBody);
        if (!object(raw) || raw.object !== 'response.input_tokens' || !integer(raw.input_tokens)) failure('OPENAI_COUNT_INVALID');
        // A later count or eviction owns admission now; a late success cannot revive it.
        if (counts.get(pinned.requestDigest) !== admission) failure('OPENAI_COUNT_SUPERSEDED');
        admission.inputTokens = raw.input_tokens;
        return { inputTokens: raw.input_tokens, requestDigest: pinned.requestDigest, counterId: `${assurance}:openai:responses.input_tokens/1` };
      } catch (error) {
        // An older failure must not revoke a newer successful count.
        if (counts.get(pinned.requestDigest) === admission) counts.delete(pinned.requestDigest);
        throw error;
      }
    },
    async respond(request): Promise<ModelResult> {
      const pinned = snapshotRequest(request, maxRequestBytes);
      const counted = counts.get(pinned.requestDigest)?.inputTokens;
      if (counted === undefined || counted === null) failure('OPENAI_COUNT_REQUIRED');
      const started = performance.now();
      const { raw, requestId } = await post('', pinned.responseBody);
      if (!object(raw) || raw.object !== 'response' || !responseId(raw.id) ||
          typeof raw.model !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,199}$/.test(raw.model)) failure('OPENAI_RESPONSE_INVALID');
      let usage = parseUsage(raw.usage);
      const parsed = parseOutput(raw);
      const issues = [...parsed.issues];
      if (raw.model !== pinned.request.model) issues.push('MODEL_MISMATCH');
      if (usage === null) issues.push('USAGE_UNKNOWN');
      if (usage !== null && usage.inputTokens !== counted) issues.push('INPUT_COUNT_MISMATCH');
      if (usage !== null && usage.outputTokens > pinned.request.maxOutputTokens) issues.push('OUTPUT_LIMIT_EXCEEDED');
      if (raw.service_tier !== 'default') issues.push('SERVICE_TIER_MISMATCH');
      // Preserve reservations: these tokens cannot be costed against the admitted tariff.
      if (raw.model !== pinned.request.model || raw.service_tier !== 'default') usage = null;
      const admitted = issues.length === 0 || (issues.length === 1 && issues[0] === 'PROVIDER_REFUSAL');
      return {
        status: admitted ? parsed.status : 'incomplete', output: admitted ? parsed.output : null,
        model: raw.model, responseId: raw.id, requestId, usage,
        latencyMs: Math.max(0, performance.now() - started), requestDigest: pinned.requestDigest,
        ...(issues.length ? { issues } : {}),
      };
    },
  };
}
