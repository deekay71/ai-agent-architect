import { z } from 'zod';
import type { CodexResult } from '../providers/codex.js';

const counter = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const hash = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const eventIdentifier = z.string().regex(/^[a-zA-Z][a-zA-Z0-9_.:-]{0,79}$/);
const eventDiagnostics = z.strictObject({ eventCount: counter, eventTypes: z.array(eventIdentifier).max(16), itemTypes: z.array(eventIdentifier).max(16),
  rejectedEventType: eventIdentifier.nullable(), rejectedItemType: eventIdentifier.nullable(), rejectionCategory: eventIdentifier.nullable(), truncated: z.boolean() });
export const CodexReceiptSchema = z.strictObject({ status: z.enum(['completed', 'incomplete', 'failed']), output: z.unknown(),
  requestedModel: z.string(), requestDigest: hash, renderedRequestDigest: hash, launchPolicyDigest: hash, configurationDigest: hash,
  usage: z.strictObject({ inputTokens: counter, cachedInputTokens: counter, outputTokens: counter, totalTokens: counter,
    reasoningTokens: counter.nullable() }).nullable(), elapsedMs: z.number().finite().nonnegative(), cliVersion: z.string().nullable(),
  threadId: z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/).nullable(), issues: z.array(z.string().regex(/^CODEX_[A-Z0-9_]+$/)),
  apiCostMicros: z.null(), exactInputCount: z.null(), modelIdentityAssurance: z.literal('requested-only'),
  maxOutputTokensEnforced: z.literal(false), isolationAssurance: z.literal('capability-flags-and-event-audit'), eventDiagnostics: eventDiagnostics.optional() });
export const validCodexTokens = (result: Pick<CodexResult, 'usage'>) => result.usage !== null
  && Number.isSafeInteger(result.usage.inputTokens + result.usage.outputTokens)
  && result.usage.totalTokens === result.usage.inputTokens + result.usage.outputTokens
  && result.usage.cachedInputTokens <= result.usage.inputTokens
  && (result.usage.reasoningTokens === null || result.usage.reasoningTokens <= result.usage.outputTokens);
