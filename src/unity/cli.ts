import fs from 'node:fs';
import path from 'node:path';
import { estimateSkeletonCampaign, runSkeletonCampaign } from './campaign.js';
import type { SubscriptionAuthorization } from '../evaluation/subscription-budget.js';

/** Explicit live marker; estimates never initialize a model provider. */
export async function runUnityCli(args: string[]): Promise<void> {
  if (args.length === 1 && args[0] === 'unity-baseline-estimate') {
    process.stdout.write(JSON.stringify(estimateSkeletonCampaign(), null, 2) + '\n'); return;
  }
  if (args.length !== 6 || args[0] !== 'unity-baseline-run' || args[5] !== '--live') {
    throw Error('Usage: unity-baseline-run <template> <new-output> <closure.json> <authorization.json> --live');
  }
  const control = JSON.parse(fs.readFileSync(args[4]!, 'utf8')) as { authorization: SubscriptionAuthorization; approval: { reference: string; maxEstimatedTokens: number } };
  const { authorization } = control;
  const result = await runSkeletonCampaign({ templateRoot: path.resolve(args[1]!), outputRoot: path.resolve(args[2]!),
    phase3ClosureFile: path.resolve(args[3]!), authorization, overrideApproval: control.approval, usageRoot: path.resolve('.local/codex-subscription-usage'),
    onProgress(taskId, outcome) { process.stderr.write(JSON.stringify({ taskId, outcome }) + '\n'); } });
  process.stdout.write(JSON.stringify({ planned: result.planned, attempted: result.attempted, passed: result.passed,
    memoryClaims: result.memoryClaims, usage: result.budget, report: path.join(path.resolve(args[2]!), 'report.json') }, null, 2) + '\n');
}
