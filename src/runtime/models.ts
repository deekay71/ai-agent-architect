import type { ModelAdapter } from '../foundation/workflow.js';
import { parseContract, type PlanPackage, type TaskSpec } from '../contracts/schemas.js';

export class FixedModelAdapter implements ModelAdapter {
  constructor(private readonly result: PlanPackage) {}
  async plan(_task: TaskSpec): Promise<PlanPackage> { return parseContract('PlanPackage', structuredClone(this.result)); }
}

/** Optional generic JSON HTTP adapter. Never enabled by default; no provider credentials in requests or logs. */
export class HttpModelAdapter implements ModelAdapter {
  constructor(private readonly config: { endpoint: string; allowedOrigin: string; timeoutMs: number; bearerToken?: string },
    private readonly transport: typeof fetch = fetch) {
    const url = new URL(config.endpoint);
    if (url.origin !== config.allowedOrigin || url.username || url.password ||
      (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['127.0.0.1', '[::1]'].includes(url.hostname)))) throw new Error('MODEL_ENDPOINT_DENIED');
    if (!Number.isSafeInteger(config.timeoutMs) || config.timeoutMs <= 0) throw new Error('MODEL_TIMEOUT_INVALID');
  }
  async plan(task: TaskSpec): Promise<PlanPackage> {
    try {
      const response = await this.transport(this.config.endpoint, { method: 'POST', redirect: 'error',
        headers: { 'content-type': 'application/json', ...(this.config.bearerToken ? { authorization: `Bearer ${this.config.bearerToken}` } : {}) },
        body: JSON.stringify({ kind: 'plan', task: parseContract('TaskSpec', task) }), signal: AbortSignal.timeout(this.config.timeoutMs) });
      if (!response.ok || !response.body) throw new Error('MODEL_FAILED');
      let text = '', size = 0;
      const decoder = new TextDecoder('utf-8', { fatal: true });
      for await (const chunk of response.body) {
        size += chunk.byteLength;
        if (size > 2 * 1024 * 1024) throw new Error('MODEL_LIMIT');
        text += decoder.decode(chunk, { stream: true });
      }
      text += decoder.decode();
      return parseContract('PlanPackage', JSON.parse(text));
    } catch { throw new Error('MODEL_ADAPTER_UNKNOWN'); }
  }
}
