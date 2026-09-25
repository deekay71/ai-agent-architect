import { z } from 'zod';
import { digest } from '../contracts/canonical.js';

export const ProfileSchema = z.strictObject({
  id: z.string().min(1), role: z.enum(['planner', 'executor']), model: z.string().min(1),
  inputTokenLimit: z.number().int().min(1024).max(100_000),
  /** Reviewed campaign caps; these must not exceed the provider's verified capabilities. */
  modelContextLimit: z.number().int().min(1024).max(10_000_000).optional(),
  maxModelOutputTokens: z.number().int().positive().max(1_000_000).optional(),
  reasoningEffort: z.enum(['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']),
  pricing: z.strictObject({ model: z.string().min(1), inputPerMillionUsd: z.number().nonnegative().finite(),
    cachedInputPerMillionUsd: z.number().nonnegative().finite(), outputPerMillionUsd: z.number().nonnegative().finite(),
    source: z.string().url(), observedAt: z.string().min(1) }),
});
export const CampaignConfigSchema = z.strictObject({
  schemaVersion: z.literal('semantic-campaign-config/1'), campaignId: z.string().regex(/^[a-zA-Z0-9_-]+$/),
  provider: z.enum(['mock', 'openai']), profiles: z.array(ProfileSchema).min(1).max(4),
  purpose: z.enum(['local-regression', 'dev-smoke', 'dev-calibration', 'acceptance']).optional(),
  caseIds: z.array(z.string().min(1).refine(s => s.trim() === s, 'Case IDs must be canonical')).min(1).optional(),
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
  if (c.caseIds && new Set(c.caseIds).size !== c.caseIds.length) ctx.addIssue({ code: 'custom', message: 'Duplicate selected case' });
  const purpose = c.purpose ?? 'local-regression';
  if ((purpose === 'dev-smoke' || purpose === 'dev-calibration') && (c.split !== 'dev' || !c.caseIds)) {
    ctx.addIssue({ code: 'custom', message: 'DEV stages require the dev split and an explicit case selection' });
  }
  if (purpose === 'acceptance' && c.split !== 'holdout') ctx.addIssue({ code: 'custom', message: 'Acceptance requires the holdout split' });
  if (purpose !== 'local-regression' && c.totalTokenBudgets.some(b => b < c.maxOutputTokens + c.headroomTokens)) {
    ctx.addIssue({ code: 'custom', message: 'Trial budget cannot fit the locked output reserve and headroom' });
  }
  for (const profile of c.profiles) {
    if (c.provider === 'openai' && purpose !== 'local-regression' &&
        (profile.modelContextLimit === undefined || profile.maxModelOutputTokens === undefined)) {
      ctx.addIssue({ code: 'custom', message: 'Live stages require reviewed model context and output caps' });
    }
    if (profile.maxModelOutputTokens !== undefined && c.maxOutputTokens > profile.maxModelOutputTokens) {
      ctx.addIssue({ code: 'custom', message: 'Output reserve exceeds the reviewed model output cap' });
    }
    if (profile.modelContextLimit !== undefined && (profile.inputTokenLimit > profile.modelContextLimit ||
        c.maxOutputTokens + c.headroomTokens > profile.modelContextLimit)) {
      ctx.addIssue({ code: 'custom', message: 'Input cap or output reserve and headroom exceeds the reviewed model context cap' });
    }
  }
});
export type CampaignConfig = z.infer<typeof CampaignConfigSchema>;
export type ModelProfile = z.infer<typeof ProfileSchema>;
export type CampaignPurpose = NonNullable<CampaignConfig['purpose']>;
/** Resolve legacy local fixtures without adding fields to their pinned configuration bytes. */
export function campaignPurpose(config: CampaignConfig): CampaignPurpose { return config.purpose ?? 'local-regression'; }
export function modelConfigVersion(profile: ModelProfile): string { return digest(profile); }
export function selectModelProfile(config: CampaignConfig, role: ModelProfile['role']): ModelProfile {
  const matches = config.profiles.filter(p => p.role === role);
  if (matches.length !== 1) throw new Error('MODEL_ROLE_MUST_RESOLVE_EXPLICITLY');
  return structuredClone(matches[0]!);
}
