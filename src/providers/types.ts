/** The complete, immutable request pinned by a campaign before dispatch. */
export interface ModelRequest {
  model: string;
  instructions: string;
  input: string;
  /** Includes reasoning, visible text, and other generated output tokens. */
  maxOutputTokens: number;
  schema: Record<string, unknown>;
  schemaName: string;
  reasoningEffort?: 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max' | 'ultra';
}

export interface ModelUsage {
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  reasoningTokens: number;
  totalTokens: number;
}

export interface ModelResult {
  status: 'completed' | 'incomplete' | 'refused';
  /** Untrusted parsed JSON; the caller must validate its task-specific schema. */
  output: unknown | null;
  model: string;
  responseId: string;
  requestId: string | null;
  /** Missing/malformed usage stays unknown, including for incomplete responses. */
  usage: ModelUsage | null;
  latencyMs: number;
  /** digest(ModelRequest), using contracts/canonical.ts. */
  requestDigest: string;
  issues?: string[];
}

export interface InputTokenCount {
  inputTokens: number;
  requestDigest: string;
  counterId: string;
}

export interface ModelProvider {
  id: string;
  assurance: 'provider' | 'mock';
  countInput(request: ModelRequest): Promise<InputTokenCount>;
  respond(request: ModelRequest): Promise<ModelResult>;
}

/** Explicit prices are campaign inputs, not dynamically changing provider defaults. */
export interface ModelPricing {
  model: string;
  inputPerMillionUsd: number;
  cachedInputPerMillionUsd: number;
  outputPerMillionUsd: number;
  source: string;
  observedAt: string;
}
