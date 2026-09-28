import { existsSync, mkdirSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCodexTransport } from '../providers/codex.js';
import { runCodexCampaign } from './codex-campaign.js';
import { codexCampaignPreflight } from './codex-config.js';

const repositoryRoot = fileURLToPath(new URL('../../../', import.meta.url));
const output = (value: unknown): void => { process.stdout.write(`${JSON.stringify(value, null, 2)}\n`); };
function jsonFile(file: string): unknown {
  const bytes = readFileSync(file);
  if (bytes.length > 2 * 1024 * 1024) throw Error('CODEX_CLI_INPUT_TOO_LARGE');
  return JSON.parse(bytes.toString('utf8')) as unknown;
}
/** Subscription-only entry point. Preflight does not construct a transport or read authentication. */
export async function runCodexEvaluationCli(args: string[]): Promise<boolean> {
  const command = args[0];
  if (!command?.startsWith('semantic-codex-')) return false;
  if (command === 'semantic-codex-preflight') {
    if (args.length !== 3) throw Error('CODEX_CLI_USAGE: semantic-codex-preflight <dataset> <config>');
    output(codexCampaignPreflight(path.resolve(args[1]!), jsonFile(args[2]!))); return true;
  }
  if (command === 'semantic-codex-review-export') {
    if (args.length !== 3) throw Error('CODEX_CLI_USAGE: semantic-codex-review-export <campaign> <new-review-directory>');
    const { exportCodexReview } = await import('./codex-review.js');
    const result = exportCodexReview(path.resolve(args[1]!), path.resolve(args[2]!));
    output({ bundlePath: result.bundlePath, markdownPath: result.markdownPath, decisionsPath: result.decisionsPath,
      coverage: result.bundle.coverage, phaseGate: 'Not evaluated', releaseEligible: false }); return true;
  }
  if (command === 'semantic-codex-review-import') {
    if (args.length !== 4) throw Error('CODEX_CLI_USAGE: semantic-codex-review-import <campaign> <decisions> <new-reviewed-file>');
    const { importCodexReview } = await import('./codex-review.js');
    output(importCodexReview(path.resolve(args[1]!), path.resolve(args[2]!), path.resolve(args[3]!))); return true;
  }
  if (command === 'semantic-codex-judge') {
    if (args.length !== 5 || args[4] !== '--live') throw Error('CODEX_CLI_USAGE: semantic-codex-judge <inputs> <config> <new-output> --live');
    const { z } = await import('zod');
    const { CodexProfileSchema } = await import('./codex-config.js');
    const { JudgmentInputSchema } = await import('./semantic-judgment.js');
    const { runCodexJudgments } = await import('./codex-judgment.js');
    const positive = z.number().int().positive();
    const config = z.strictObject({ judge: CodexProfileSchema, maxRequestBytes: positive.max(1_000_000), timeoutMs: positive.max(120_000),
      authorization: z.strictObject({ authorizationId: z.string().trim().min(1), maxInvocations: positive.max(5000),
        maxReportedTokens: positive.max(10_000_000), maxWallTimeMs: positive.max(3_600_000) }) }).parse(jsonFile(args[2]!));
    const inputs = z.array(JudgmentInputSchema).min(1).parse(jsonFile(args[1]!));
    const outputRoot = path.resolve(args[3]!);
    if (existsSync(outputRoot)) throw Error('CODEX_OUTPUT_MUST_BE_NEW');
    const usageRoot = path.join(repositoryRoot, '.local', 'codex-subscription-usage');
    const transport = createCodexTransport({ timeoutMs: config.timeoutMs, maxRequestBytes: config.maxRequestBytes });
    const report = await runCodexJudgments({ ...config, inputs, repositoryRoot, outputRoot, usageRoot, transport,
      onProgress(done, total) { process.stderr.write(`${JSON.stringify({ judgmentsCompleted: done, judgmentsPlanned: total })}\n`); } });
    output({ report: path.join(outputRoot, 'report.json'), planned: report.planned, assessed: report.assessed,
      stoppedReason: report.stoppedReason, budget: report.budget, humanReviewed: false, phaseGate: report.phaseGate });
    if (report.stoppedReason !== null || report.assessed !== report.planned) process.exitCode = 1;
    return true;
  }
  if (command !== 'semantic-codex-run') throw Error('CODEX_CLI_UNKNOWN_COMMAND');
  if (args.length !== 5 || args[4] !== '--live') throw Error('CODEX_CLI_USAGE: semantic-codex-run <dataset> <config> <new-output> --live');
  const datasetRoot = realpathSync(args[1]!), preflight = codexCampaignPreflight(datasetRoot, jsonFile(args[2]!));
  if (!preflight.invocationCapFitsMatrix) throw Error('CODEX_INVOCATION_CAP_BELOW_PLANNED_MATRIX');
  const outputRoot = path.resolve(args[3]!);
  if (existsSync(outputRoot)) throw Error('CODEX_OUTPUT_MUST_BE_NEW');
  realpathSync(path.dirname(outputRoot));
  // Fixed repository-level ledger: changing campaign/output names never resets consumed authorization.
  const localRoot = path.join(repositoryRoot, '.local'); mkdirSync(localRoot, { recursive: true, mode: 0o700 });
  const usageRoot = path.join(realpathSync(localRoot), 'codex-subscription-usage');
  const transport = createCodexTransport({ timeoutMs: preflight.config.perCallTimeoutMs, maxRequestBytes: preflight.config.maxVisibleRequestBytes });
  const report = await runCodexCampaign({ datasetRoot, repositoryRoot, outputRoot, usageRoot, config: preflight.config, transport,
    onProgress(completed, planned) { process.stderr.write(`${JSON.stringify({ codexTrialsCompleted: completed, codexTrialsPlanned: planned })}\n`); },
  });
  output({ report: path.join(outputRoot, 'report.json'), campaignId: report.campaignId, assurance: report.assurance,
    comparisonCoverage: report.comparisonCoverage, controlCoverage: report.controlCoverage, budget: report.budget,
    stoppedReason: report.stoppedReason, modelOutputsObserved: report.modelOutputsObserved, phaseGate: report.phaseGate });
  if (report.stoppedReason !== null || report.comparisonCoverage.scored !== report.plannedTrials || report.controlCoverage.scored !== report.plannedControls) process.exitCode = 1;
  return true;
}
