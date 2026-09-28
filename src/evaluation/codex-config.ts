import { z } from 'zod';
import { digest } from '../contracts/canonical.js';
import { loadPublicDataset, verifyDatasetSeal } from './dataset.js';

const integer = (min: number, max: number) => z.number().int().min(min).max(max);
export const CodexProfileSchema = z.strictObject({ id: z.string().regex(/^[a-zA-Z0-9_-]+$/), role: z.enum(['planner', 'executor']),
  model: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_.-]+$/), reasoningEffort: z.enum(['low', 'medium', 'high', 'xhigh', 'max']) });
export const CodexCampaignConfigSchema = z.strictObject({
  schemaVersion: z.literal('codex-semantic-config/1'), campaignId: z.string().regex(/^[a-zA-Z0-9_-]+$/),
  provider: z.literal('codex-chatgpt'), purpose: z.enum(['dev-smoke', 'dev-calibration', 'acceptance']), split: z.enum(['dev', 'holdout']),
  caseIds: z.array(z.string().trim().min(1)).min(1), profiles: z.array(CodexProfileSchema).min(1).max(4),
  distractorLimits: z.array(integer(0, 100)).min(1).max(4), compactionRounds: z.array(integer(1, 5)).min(1).max(3),
  repeats: integer(1, 5), topK: integer(1, 100), outputTokenHint: integer(64, 4000), maxVisibleRequestBytes: integer(1024, 1_000_000),
  perTrialReportedTokenStop: integer(1024, 1_000_000), perCallTimeoutMs: integer(1000, 120_000),
  /** Present only in the frozen acceptance configuration; DEV keeps its existing single ceiling. */
  visibleByteAllowances: z.array(integer(1024, 1_000_000)).length(3).optional(),
  authorization: z.strictObject({ authorizationId: z.string().min(1), maxInvocations: integer(1, 5000),
    maxReportedTokens: integer(1024, 10_000_000), maxWallTimeMs: integer(1000, 10_800_000) }),
}).superRefine((c, ctx) => {
  for (const values of [c.caseIds, c.profiles.map(p => p.id), c.distractorLimits, c.compactionRounds]) {
    if (new Set<string | number>(values).size !== values.length) ctx.addIssue({ code: 'custom', message: 'Duplicate matrix dimension' });
  }
  if (c.purpose === 'acceptance') {
    if (c.split !== 'holdout' || c.caseIds.length !== 10 || c.profiles.length !== 1 || c.repeats !== 2
      || c.compactionRounds.length !== 2 || !c.compactionRounds.includes(1) || !c.compactionRounds.includes(3)
      || !c.visibleByteAllowances || c.authorization.maxInvocations < 540) ctx.addIssue({ code: 'custom', message: 'Frozen acceptance matrix invalid' });
  } else if (c.split !== 'dev' || c.visibleByteAllowances || c.authorization.maxWallTimeMs > 3_600_000) ctx.addIssue({ code: 'custom', message: 'DEV campaign scope invalid' });
});
export type CodexCampaignConfig = z.infer<typeof CodexCampaignConfigSchema>;
export type CodexProfile = z.infer<typeof CodexProfileSchema>;
/** Structural readiness only; never reads credentials or invokes a model. */
export function codexCampaignPreflight(datasetRoot: string, input: unknown, acceptanceAuthorized = false) {
  const config = CodexCampaignConfigSchema.parse(input), datasetSealDigest = verifyDatasetSeal(datasetRoot), dataset = loadPublicDataset(datasetRoot);
  if (config.purpose === 'acceptance' && !acceptanceAuthorized) throw Error('CODEX_HOLDOUT_FROZEN_PROTOCOL_REQUIRED');
  const selected = config.caseIds.map(id => { const task = dataset.cases.find(c => c.id === id && c.split === config.split);
    if (!task) throw Error(config.split === 'dev' ? 'CODEX_DEV_CASE_SELECTION_INVALID' : 'CODEX_HOLDOUT_CASE_SELECTION_INVALID'); return task; });
  const base = selected.length * config.profiles.length * config.repeats;
  const acceptance = config.purpose === 'acceptance', dimensions = acceptance ? config.visibleByteAllowances!.length : config.distractorLimits.length;
  const plannedTrials = base * dimensions * (2 + config.compactionRounds.length);
  const plannedControls = acceptance ? base * dimensions : base;
  const maxInvocations = base * (dimensions * (2 + config.compactionRounds.reduce((n, d) => n + d + 1, 0)) + (acceptance ? dimensions : 1));
  return { schemaVersion: 'codex-semantic-preflight/1' as const, config, configDigest: digest(config), datasetSealDigest,
    selectedCaseIds: selected.map(c => c.id), splitAudit: dataset.splitAudit, plannedTrials, plannedControls, maxInvocations,
    invocationCapFitsMatrix: maxInvocations <= config.authorization.maxInvocations,
    billing: 'chatgpt-subscription-quota' as const, apiCostMicros: null, exactInputCount: null,
    budgetBasis: 'invocation-hard-cap-and-post-call-reported-token-stop' as const,
    modelAvailabilityVerified: false, technicalConfigurationReady: true, dispatchAuthorized: false, acceptanceReady: false,
    phaseGate: 'Not evaluated' as const };
}
