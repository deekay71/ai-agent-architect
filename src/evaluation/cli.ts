import { existsSync, lstatSync, mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createOpenAIProvider } from '../providers/openai.js';
import { campaignPreflight, runSemanticCampaign } from './campaign.js';
import { importHumanCalibrationReview } from './dataset.js';
import { createSandboxMockProvider } from './mock-provider.js';
import { exportOutcomeReview, importOutcomeReview } from './outcome-review.js';
import { runCodexEvaluationCli } from './codex-cli.js';

const repositoryRoot = fileURLToPath(new URL('../../../', import.meta.url));
const output = (value: unknown): void => { process.stdout.write(`${JSON.stringify(value, null, 2)}\n`); };
function jsonFile(file: string): unknown {
  const bytes = readFileSync(file);
  if (bytes.length > 2 * 1024 * 1024) throw new Error('SEMANTIC_CLI_INPUT_TOO_LARGE');
  return JSON.parse(bytes.toString('utf8')) as unknown;
}
function usage(command: string): never {
  const syntax: Record<string, string> = {
    'semantic-preflight': 'semantic-preflight <dataset> <config>',
    'semantic-run': 'semantic-run <dataset> <config> <new-output> <spend> [--live]',
    'semantic-review-import': 'semantic-review-import <dataset> <review>',
    'semantic-review-export': 'semantic-review-export <campaign> <new-review-directory>',
    'semantic-outcome-review-import': 'semantic-outcome-review-import <campaign> <decisions.json> <new-reviewed-file>',
  };
  throw new Error(`SEMANTIC_CLI_USAGE: ${syntax[command]}`);
}
const contains = (parent: string, child: string): boolean => child === parent || child.startsWith(`${parent}${path.sep}`);
function newOutputPath(requested: string): string {
  const absolute = path.resolve(requested);
  if (existsSync(absolute)) throw new Error('SEMANTIC_OUTPUT_MUST_BE_NEW');
  const parent = realpathSync(path.dirname(absolute));
  if (!lstatSync(parent).isDirectory()) throw new Error('SEMANTIC_OUTPUT_PARENT_REQUIRED');
  return path.join(parent, path.basename(absolute));
}

/** CLI adapter only. It never reads credentials or constructs a live provider during preflight/mock work. */
export async function runEvaluationCli(args: string[]): Promise<boolean> {
  if (await runCodexEvaluationCli(args)) return true;
  const command = args[0];
  if (!command || !['semantic-preflight', 'semantic-run', 'semantic-review-import', 'semantic-review-export', 'semantic-outcome-review-import'].includes(command)) return false;
  if (command === 'semantic-review-export') {
    if (args.length !== 3) usage(command);
    const result = exportOutcomeReview(path.resolve(args[1]!), path.resolve(args[2]!));
    output({ bundlePath: result.bundlePath, markdownPath: result.markdownPath, decisionsPath: result.decisionsPath,
      coverage: result.bundle.coverage, releaseEligible: false, phaseGate: 'Not evaluated' }); return true;
  }
  if (command === 'semantic-outcome-review-import') {
    if (args.length !== 4) usage(command);
    const artifact = importOutcomeReview(path.resolve(args[1]!), jsonFile(args[2]!), path.resolve(args[3]!));
    output({ status: artifact.status, artifactDigest: artifact.artifactDigest, acceptanceStatus: artifact.acceptanceStatus,
      releaseEligible: artifact.releaseEligible, phaseGate: artifact.phaseGate }); return true;
  }
  if (command === 'semantic-preflight') {
    if (args.length !== 3) usage(command);
    output(campaignPreflight(path.resolve(args[1]!), jsonFile(args[2]!)));
    return true;
  }
  if (command === 'semantic-review-import') {
    if (args.length !== 3) usage(command);
    const result = importHumanCalibrationReview(path.resolve(args[1]!), jsonFile(args[2]!));
    output({ status: result.status, releaseEligible: false, phaseGate: 'Not evaluated',
      ...(result.status === 'reviewed' ? { reviewDigest: result.reviewDigest, reviewedCaseCount: result.review.caseIds.length } : {}) });
    return true;
  }
  if (args.length !== 5 && !(args.length === 6 && args[5] === '--live')) usage(command);
  const datasetRoot = realpathSync(args[1]!), preflight = campaignPreflight(datasetRoot, jsonFile(args[2]!));
  const live = args[5] === '--live';
  if (preflight.config.provider === 'openai' && !live) throw new Error('LIVE_EXPLICIT_OPT_IN_REQUIRED');
  if (live && preflight.config.provider !== 'openai') throw new Error('LIVE_FLAG_REQUIRES_OPENAI_CONFIG');
  if (live && !preflight.liveReady) throw new Error('LIVE_PREFLIGHT_NOT_READY');
  if (preflight.config.split === 'holdout' && !preflight.reviewCoversSelectedCases) throw new Error('HOLDOUT_REQUIRES_INDEPENDENT_REVIEW');
  const outputRoot = newOutputPath(args[3]!), spendRoot = path.resolve(args[4]!);
  if (contains(datasetRoot, outputRoot) || contains(datasetRoot, spendRoot)
    || contains(outputRoot, spendRoot) || contains(spendRoot, outputRoot)) throw new Error('SEMANTIC_INPUT_OUTPUT_PATH_OVERLAP');
  let workerRoot: string | undefined;
  try {
    // A new, private sibling workspace grants the mock child no dataset/repository reads.
    if (!live) workerRoot = mkdtempSync(path.join(path.dirname(outputRoot), '.semantic-mock-worker-'));
    const provider = live ? createOpenAIProvider() : createSandboxMockProvider(workerRoot!);
    const report = await runSemanticCampaign({ datasetRoot, repositoryRoot, outputRoot, spendRoot,
      config: preflight.config, provider,
      onProgress(completed, planned) {
        if (completed % 100 === 0) process.stderr.write(`${JSON.stringify({ semanticTrialsCompleted: completed, semanticTrialsPlanned: planned })}\n`);
      },
    });
    output({ report: path.join(outputRoot, 'report.json'), campaignId: report.campaignId, assurance: report.assurance,
      completedTrials: report.completedTrials, plannedTrials: report.plannedTrials,
      completedControlTrials: report.completedControlTrials, plannedControlTrials: report.plannedControlTrials, stoppedReason: report.stoppedReason,
      modelQualityMeasured: report.modelQualityMeasured, phaseGate: report.phaseGate, budget: report.budget });
    if (report.stoppedReason !== null || report.completedTrials !== report.plannedTrials
      || report.completedControlTrials !== report.plannedControlTrials) process.exitCode = 1;
    return true;
  } finally { if (workerRoot !== undefined) rmSync(workerRoot, { recursive: true, force: true }); }
}
