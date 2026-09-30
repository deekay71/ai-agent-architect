import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
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
  if (command === 'semantic-codex-calibration-run') {
    if (args.length !== 5 || args[4] !== '--live') throw Error('CODEX_CLI_USAGE: semantic-codex-calibration-run <calibration-root> <config> <new-output> --live');
    const { z } = await import('zod'), { CodexProfileSchema } = await import('./codex-config.js');
    const { loadReviewedCalibration } = await import('./acceptance-evidence.js'), { ExposureRegistry } = await import('./exposure.js');
    const { runCodexJudgments } = await import('./codex-judgment.js');
    const positive = z.number().int().positive();
    const config = z.strictObject({ judge: CodexProfileSchema, reviewPath: z.string().refine(path.isAbsolute),
      maxRequestBytes: positive.max(1_000_000), timeoutMs: positive.max(120_000),
      authorization: z.strictObject({ authorizationId: z.string().min(1), maxInvocations: positive.max(604), maxReportedTokens: positive.max(10_000_000),
        maxWallTimeMs: positive.max(10_800_000) }) }).parse(jsonFile(args[2]!));
    const { inputs } = loadReviewedCalibration({ calibrationRoot: path.resolve(args[1]!), reviewPath: config.reviewPath });
    const usageRoot = path.join(repositoryRoot, '.local', 'codex-subscription-usage'), registry = new ExposureRegistry(usageRoot);
    try { if (inputs.some(i => registry.inspect(i.task).records.length)) throw Error('CODEX_CALIBRATION_ALREADY_EXPOSED'); } finally { registry.close(); }
    const { reviewPath: _, ...limits } = config;
    const outputRoot = path.resolve(args[3]!);
    const report = await runCodexJudgments({ ...limits, inputs, repositoryRoot, usageRoot, outputRoot,
      calibrationCheck: { calibrationRoot: path.resolve(args[1]!), reviewPath: config.reviewPath },
      transport: createCodexTransport({ timeoutMs: config.timeoutMs, maxRequestBytes: config.maxRequestBytes }),
      onProgress(done, total) { process.stderr.write(`${JSON.stringify({ judgmentsCompleted: done, judgmentsPlanned: total })}\n`); } });
    output({ report: path.join(outputRoot, 'report.json'), planned: report.planned, assessed: report.assessed, stoppedReason: report.stoppedReason, budget: report.budget });
    if (report.stoppedReason || report.assessed !== report.planned) process.exitCode = 1;
    return true;
  }
  if (command.startsWith('semantic-codex-acceptance-')) {
    const { freezeCodexAcceptanceProtocol, runCodexAcceptanceCampaign } = await import('./acceptance-runner.js');
    const { digest } = await import('../contracts/canonical.js');
    const save = (file: string, value: unknown) => writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
    if (command === 'semantic-codex-acceptance-freeze') {
      if (args.length !== 3) throw Error('CODEX_CLI_USAGE: semantic-codex-acceptance-freeze <protocol> <new-lock>');
      const frozen = freezeCodexAcceptanceProtocol(path.resolve(args[1]!)); save(path.resolve(args[2]!), frozen);
      output({ freezeDigest: frozen.freezeDigest, matrix: frozen.matrix, phaseGate: frozen.phaseGate }); return true;
    }
    if (args.length < 4) throw Error('CODEX_CLI_USAGE: acceptance command requires <protocol> <lock> and stage paths');
    const protocolFile = path.resolve(args[1]!), frozen = freezeCodexAcceptanceProtocol(protocolFile);
    if (digest(jsonFile(args[2]!)) !== digest(frozen)) throw Error('CODEX_ACCEPTANCE_LOCK_DRIFT');
    if (frozen.protocol.repositoryRoot !== realpathSync(repositoryRoot)) throw Error('CODEX_ACCEPTANCE_REPOSITORY_BINDING');
    const usageRoot = path.join(repositoryRoot, '.local', 'codex-subscription-usage');
    if (realpathSync(frozen.protocol.usageRoot) !== realpathSync(usageRoot)) throw Error('CODEX_ACCEPTANCE_USAGE_ROOT_BINDING');
    if (command === 'semantic-codex-acceptance-run') {
      if (args.length !== 5 || args[4] !== '--live') throw Error('CODEX_CLI_USAGE: semantic-codex-acceptance-run <protocol> <lock> <new-output> --live');
      const outputRoot = path.resolve(args[3]!), p = frozen.protocol;
      const { result } = await runCodexAcceptanceCampaign({ protocolFile, frozen, outputRoot, usageRoot,
        transport: createCodexTransport({ timeoutMs: p.perCallTimeoutMs, maxRequestBytes: Math.max(...p.visibleByteAllowances) }),
        onProgress(completed, planned) { process.stderr.write(`${JSON.stringify({ codexTrialsCompleted: completed, codexTrialsPlanned: planned })}\n`); } });
      output({ report: path.join(outputRoot, 'report.json'), stoppedReason: result.stoppedReason, comparisonCoverage: result.comparisonCoverage,
        controlCoverage: result.controlCoverage, budget: result.budget, phaseGate: result.phaseGate });
      if (result.stoppedReason) process.exitCode = 1; return true;
    }
    if (command === 'semantic-codex-acceptance-judge') {
      if (args.length !== 6 || args[5] !== '--live') throw Error('CODEX_CLI_USAGE: semantic-codex-acceptance-judge <protocol> <lock> <campaign> <new-output> --live');
      const { prepareAcceptanceJudgmentInputs } = await import('./acceptance-evidence.js'), { runCodexJudgments } = await import('./codex-judgment.js');
      const campaignRoot = path.resolve(args[3]!), { inputs } = prepareAcceptanceJudgmentInputs(campaignRoot, frozen), outputRoot = path.resolve(args[4]!);
      const report = await runCodexJudgments({ inputs, judge: frozen.protocol.judge, repositoryRoot, outputRoot, usageRoot,
        authorization: frozen.protocol.authorization, maxRequestBytes: 1_000_000, timeoutMs: frozen.protocol.perCallTimeoutMs,
        frozenAcceptance: { protocolFile, frozen, campaignRoot }, transport: createCodexTransport({ timeoutMs: frozen.protocol.perCallTimeoutMs, maxRequestBytes: 1_000_000 }),
        onProgress(done, total) { process.stderr.write(`${JSON.stringify({ judgmentsCompleted: done, judgmentsPlanned: total })}\n`); } });
      output({ report: path.join(outputRoot, 'report.json'), planned: report.planned, assessed: report.assessed, stoppedReason: report.stoppedReason, budget: report.budget });
      if (report.stoppedReason || report.assessed !== report.planned) process.exitCode = 1; return true;
    }
    if (command === 'semantic-codex-acceptance-close') {
      if (args.length !== 6) throw Error('CODEX_CLI_USAGE: semantic-codex-acceptance-close <protocol> <lock> <campaign> <judgments> <new-output>');
      const { adjudicateCodexAcceptance } = await import('./acceptance-evidence.js'), { executeAcceptedHandoff } = await import('./acceptance-handoff.js');
      const result = adjudicateCodexAcceptance({ protocolFile, frozen, campaignRoot: path.resolve(args[3]!), judgmentRoot: path.resolve(args[4]!) });
      const outputRoot = path.resolve(args[5]!); mkdirSync(outputRoot, { recursive: false, mode: 0o700 });
      save(path.join(outputRoot, 'acceptance-result.json'), result.report);
      const handoff = result.evidence ? executeAcceptedHandoff({ outputRoot: path.join(outputRoot, 't14'), evidence: result.evidence }) : null;
      const body = { schemaVersion: 'phase3-starter-closure/1', scope: 'finite-authored-infrastructure-starter', protocolDigest: frozen.freezeDigest,
        acceptanceDigest: result.report.artifactDigest, t19: result.report.t19, t11: result.report.t11, t14: handoff ? 'PASS' : 'Not evaluated',
        t14Digest: handoff?.reportDigest ?? null, phaseGate: handoff ? 'PASS' : 'Replan', reviewerKind: 'ai', humanAttestation: null,
        measuredStarterGate: handoff ? 'PASS' : 'Replan', ownerOutputReview: 'not-claimed',
        scopeDecision: 'Pinned protocol records the current user instruction to implement five closure items and close the finite starter scope',
        releaseEligible: false, gameExecutionAuthorized: false };
      const closure = { ...body, artifactDigest: digest(body) }; save(path.join(outputRoot, 'phase3-closure.json'), closure); output(closure);
      if (!handoff) process.exitCode = 1; return true;
    }
    throw Error('CODEX_CLI_UNKNOWN_COMMAND');
  }
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
  if (command === 'semantic-codex-judge-resume') {
    if (args.length !== 6 || args[5] !== '--live') throw Error('CODEX_CLI_USAGE: semantic-codex-judge-resume <inputs> <config> <parent-output> <new-output> --live');
    const { z } = await import('zod');
    const { CodexProfileSchema } = await import('./codex-config.js');
    const { JudgmentInputSchema } = await import('./semantic-judgment.js');
    const { resumeCodexJudgments } = await import('./codex-judgment.js');
    const positive = z.number().int().positive();
    const config = z.strictObject({ judge: CodexProfileSchema, maxRequestBytes: positive.max(1_000_000), timeoutMs: positive.max(120_000),
      authorization: z.strictObject({ authorizationId: z.string().trim().min(1), maxInvocations: positive.max(5000),
        maxReportedTokens: positive.max(10_000_000), maxWallTimeMs: positive.max(3_600_000) }) }).parse(jsonFile(args[2]!));
    const inputs = z.array(JudgmentInputSchema).min(1).parse(jsonFile(args[1]!));
    if (inputs.some(input => input.task.split !== 'dev')) throw Error('CODEX_JUDGE_RESUME_DEV_ONLY');
    const parentRoot = realpathSync(args[3]!), outputRoot = path.resolve(args[4]!);
    if (existsSync(outputRoot)) throw Error('CODEX_OUTPUT_MUST_BE_NEW');
    const usageRoot = path.join(repositoryRoot, '.local', 'codex-subscription-usage');
    const transport = createCodexTransport({ timeoutMs: config.timeoutMs, maxRequestBytes: config.maxRequestBytes });
    const report = await resumeCodexJudgments({ ...config, inputs, repositoryRoot, parentRoot, outputRoot, usageRoot, transport,
      onProgress(done, total) { process.stderr.write(`${JSON.stringify({ judgmentsCompleted: done, judgmentsPlanned: total })}\n`); } });
    output({ report: path.join(outputRoot, 'report.json'), planned: report.planned, assessed: report.assessed,
      stoppedReason: report.stoppedReason, failedBatchIndexes: report.failedBatchIndexes, budget: report.budget,
      complete: false, humanReviewed: false, phaseGate: report.phaseGate });
    process.exitCode = 1;
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
