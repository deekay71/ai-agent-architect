import { z } from 'zod';
import { digest } from '../contracts/canonical.js';

export const ProfileSchema = z.strictObject({
  id: z.string().min(1), role: z.enum(['planner', 'executor']), model: z.string().min(1),
  inputTokenLimit: z.number().int().min(1024).max(100_000),
  reasoningEffort: z.enum(['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']),
  pricing: z.strictObject({ model: z.string().min(1), inputPerMillionUsd: z.number().nonnegative().finite(),
    cachedInputPerMillionUsd: z.number().nonnegative().finite(), outputPerMillionUsd: z.number().nonnegative().finite(),
    source: z.string().url(), observedAt: z.string().min(1) }),
});
export const CampaignConfigSchema = z.strictObject({
  schemaVersion: z.literal('semantic-campaign-config/1'), campaignId: z.string().regex(/^[a-zA-Z0-9_-]+$/),
  provider: z.enum(['mock', 'openai']), profiles: z.array(ProfileSchema).min(1).max(4),
  split: z.enum(['dev', 'holdout']), totalTokenBudgets: z.array(z.number().int().min(1024).max(100_000)).min(1).max(4),
  distractorLimits: z.array(z.number().int().nonnegative().max(100)).min(1).max(4),
  compactionRounds: z.array(z.number().int().min(1).max(5)).min(1).max(3),
  repeats: z.number().int().min(1).max(5), topK: z.number().int().min(1).max(100),
  maxOutputTokens: z.number().int().min(64).max(4000), headroomTokens: z.number().int().nonnegative().max(4000),
  authorization: z.strictObject({ authorizationId: z.string().min(1), maxCostMicros: z.number().int().nonnegative().safe() }),
  thresholds: z.strictObject({ maxFalseAcceptance: z.literal(0), maxConstraintLoss: z.literal(0), maxInvalidCitations: z.literal(0),
    minimumStrictPassRate: z.number().min(0).max(1), calibrationStatus: z.enum(['provisional', 'human-calibrated']) }),
}).superRefine((c, ctx) => {
  if (new Set(c.profiles.map(p => p.id)).size !== c.profiles.length) ctx.addIssue({ code: 'custom', message: 'Duplicate profile' });
  if (c.profiles.some(p => p.model !== p.pricing.model)) ctx.addIssue({ code: 'custom', message: 'Model pricing pin mismatch' });
  if ([c.totalTokenBudgets, c.distractorLimits, c.compactionRounds].some(a => new Set(a).size !== a.length)) ctx.addIssue({ code: 'custom', message: 'Duplicate matrix dimension' });
  if (c.provider === 'openai' && c.authorization.maxCostMicros <= 0) ctx.addIssue({ code: 'custom', message: 'Live campaign requires explicit nonzero spend authorization' });
});
export type CampaignConfig = z.infer<typeof CampaignConfigSchema>;
export type ModelProfile = z.infer<typeof ProfileSchema>;
export function modelConfigVersion(profile: ModelProfile): string { return digest(profile); }
export function selectModelProfile(config: CampaignConfig, role: ModelProfile['role']): ModelProfile {
  const matches = config.profiles.filter(p => p.role === role);
  if (matches.length !== 1) throw new Error('MODEL_ROLE_MUST_RESOLVE_EXPLICITLY');
  return structuredClone(matches[0]!);
}
