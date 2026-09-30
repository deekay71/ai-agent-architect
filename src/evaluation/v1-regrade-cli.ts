import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { createCurrentCodexTransport } from '../providers/codex.js';
import { CodexProfileSchema } from './codex-config.js';
import { JudgmentInputSchema } from './semantic-judgment.js';
import { estimateV1Regrade, runV1Regrade, V1RegradeBudgetApprovalSchema } from './v1-regrade.js';

const repositoryRoot = fileURLToPath(new URL('../../../', import.meta.url));
const positive = z.number().int().positive();
const emit = (value: unknown): void => { process.stdout.write(`${JSON.stringify(value, null, 2)}\n`); };
function jsonFile(file: string, maximum = 2 * 1024 * 1024): unknown {
  const bytes = readFileSync(file);
  if (bytes.length > maximum) throw Error('V1_REGRADE_CLI_INPUT_TOO_LARGE');
  return JSON.parse(bytes.toString('utf8')) as unknown;
}
function options(args: string[]): { approvalFile: string; judgeFile: string; outputRoot?: string; timeoutMs?: number; maxRequestBytes?: number; live: boolean } {
  const map = new Map<string, string>(); let live = false;
  for (let index = 1; index < args.length; index += 1) {
    const flag = args[index]!;
    if (flag === '--live') { if (live) throw Error('V1_REGRADE_CLI_USAGE'); live = true; continue; }
    if (!['--approval', '--judge', '--output', '--timeout-ms', '--max-request-bytes'].includes(flag) || map.has(flag) || index + 1 >= args.length) throw Error('V1_REGRADE_CLI_USAGE');
    map.set(flag, args[++index]!);
  }
  const approvalFile = map.get('--approval'), judgeFile = map.get('--judge');
  if (!approvalFile || !judgeFile) throw Error('V1_REGRADE_CLI_USAGE');
  const outputRoot = map.get('--output'), timeout = map.get('--timeout-ms'), bytes = map.get('--max-request-bytes');
  if ((timeout === undefined) !== (bytes === undefined)) throw Error('V1_REGRADE_CLI_USAGE');
  const timeoutMs = timeout === undefined ? undefined : positive.max(120_000).parse(Number(timeout));
  const maxRequestBytes = bytes === undefined ? undefined : positive.max(1_000_000).parse(Number(bytes));
  return { approvalFile: path.resolve(approvalFile), judgeFile: path.resolve(judgeFile), ...(outputRoot === undefined ? {} : { outputRoot: path.resolve(outputRoot) }),
    ...(timeoutMs === undefined ? {} : { timeoutMs }), ...(maxRequestBytes === undefined ? {} : { maxRequestBytes }), live };
}

/** CLI is deliberately explicit: `--live` is the only path that constructs a native transport. */
export async function runV1RegradeCli(args: string[]): Promise<boolean> {
  const command = args[0];
  if (command !== 'v1-regrade-estimate' && command !== 'v1-regrade-run') return false;
  const parsed = options(args), approval = V1RegradeBudgetApprovalSchema.parse(jsonFile(parsed.approvalFile));
  const judge = CodexProfileSchema.parse(jsonFile(parsed.judgeFile));
  const sourceFile = path.join(repositoryRoot, '.local', 'phase3-acceptance-v1', 'judgments', 'inputs.json');
  const inputs = z.array(JudgmentInputSchema).length(300).parse(jsonFile(sourceFile, 128 * 1024 * 1024));
  const estimate = estimateV1Regrade(inputs, judge);
  const approvalFits = estimate.worstCaseCalls <= approval.authorization.maxInvocations
    && estimate.totalTokenReserveWorstCase <= approval.maxAggregateTokenEstimate
    && estimate.totalTokenReserveWorstCase <= approval.authorization.maxReportedTokens;
  if (command === 'v1-regrade-estimate') {
    if (parsed.outputRoot !== undefined || parsed.live) throw Error('V1_REGRADE_CLI_USAGE: v1-regrade-estimate --approval <file> --judge <file>');
    emit({ estimate, approvalFits, dispatchAuthorized: false, reason: 'Estimate only; no transport constructed and no model call made.' }); return true;
  }
  if (!parsed.live || parsed.outputRoot === undefined || parsed.timeoutMs === undefined || parsed.maxRequestBytes === undefined) {
    throw Error('V1_REGRADE_CLI_USAGE: v1-regrade-run --approval <file> --judge <file> --output <new-output> --timeout-ms <n> --max-request-bytes <n> --live');
  }
  if (!approvalFits) throw Error('V1_REGRADE_BUDGET_PREFLIGHT');
  if (existsSync(parsed.outputRoot)) throw Error('V1_REGRADE_OUTPUT_EXISTS');
  const localRoot = path.join(repositoryRoot, '.local'); mkdirSync(localRoot, { recursive: true, mode: 0o700 });
  const report = await runV1Regrade({ repositoryRoot, outputRoot: parsed.outputRoot, usageRoot: path.join(localRoot, 'codex-subscription-usage'),
    budgetApproval: approval, judge, timeoutMs: parsed.timeoutMs, maxRequestBytes: parsed.maxRequestBytes,
    transport: createCurrentCodexTransport({ timeoutMs: parsed.timeoutMs, maxRequestBytes: parsed.maxRequestBytes }),
    onProgress(assessed, planned) { process.stderr.write(`${JSON.stringify({ regradeAssessed: assessed, regradePlanned: planned })}\n`); } });
  emit({ report: path.join(parsed.outputRoot, 'report.json'), planned: report.planned, assessed: report.assessed, stoppedReason: report.stoppedReason,
    budget: report.budget, administrativeClosure: report.administrativeClosure });
  if (report.stoppedReason !== null || report.assessed !== report.planned) process.exitCode = 1;
  return true;
}
