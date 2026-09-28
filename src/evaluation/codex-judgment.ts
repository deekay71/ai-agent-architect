import { appendFileSync, closeSync, fsyncSync, mkdirSync, openSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { canonicalJson, digest } from '../contracts/canonical.js';
import { CODEX_CLI_VERSION, CODEX_LAUNCH_POLICY_DIGEST, renderCodexRequest, type CodexTransport } from '../providers/codex.js';
import { implementationPins } from './campaign.js';
import { CodexProfileSchema, type CodexProfile } from './codex-config.js';
import { CodexReceiptSchema, validCodexTokens } from './codex-receipt.js';
import { SubscriptionBudget, type SubscriptionAuthorization } from './subscription-budget.js';
import { JudgmentInputSchema, SEMANTIC_RUBRIC_DIGEST, buildBatchedJudgmentRequest, parseBatchedJudgments, type JudgmentInput } from './semantic-judgment.js';

function writeNew(file: string, value: unknown) { writeFileSync(file, JSON.stringify(value, null, 2) + '\n', { flag: 'wx', mode: 0o600 }); }
function journal(file: string, value: unknown) {
  const fd = openSync(file, 'a', 0o600);
  try { appendFileSync(fd, JSON.stringify(value) + '\n'); fsyncSync(fd); } finally { closeSync(fd); }
}

/** Separate advisory evaluator. It never imports human decisions or changes reader/gate evidence. */
export async function runCodexJudgments(options: { inputs: readonly JudgmentInput[]; judge: CodexProfile;
  repositoryRoot: string; outputRoot: string; usageRoot: string; authorization: SubscriptionAuthorization;
  transport: CodexTransport; maxRequestBytes: number; timeoutMs: number; onProgress?: (done: number, total: number) => void }) {
  const inputs = options.inputs.map(i => JudgmentInputSchema.parse(i)), judge = CodexProfileSchema.parse(options.judge);
  if (!inputs.length || new Set(inputs.map(i => i.id)).size !== inputs.length) throw Error('JUDGMENT_INPUT_COVERAGE');
  if (!Number.isSafeInteger(options.maxRequestBytes) || options.maxRequestBytes < 1024 || options.maxRequestBytes > 1_000_000
    || !Number.isSafeInteger(options.timeoutMs) || options.timeoutMs < 1000 || options.timeoutMs > 120_000) throw Error('JUDGMENT_LIMIT_INVALID');
  const batches = Array.from({ length: Math.ceil(inputs.length / 6) }, (_, n) => inputs.slice(n * 6, n * 6 + 6));
  const requests = batches.map(batch => buildBatchedJudgmentRequest(batch, judge));
  if (requests.length > options.authorization.maxInvocations || requests.some(r =>
    Math.max(Buffer.byteLength(canonicalJson(r)), Buffer.byteLength(renderCodexRequest(r))) > options.maxRequestBytes)) throw Error('JUDGMENT_PREFLIGHT_LIMIT');
  const { transport } = options, { respond, configurationDigest, assurance } = transport;
  if (transport.id !== 'codex-chatgpt-exec/1' || !['mock', 'codex-chatgpt'].includes(assurance)
    || transport.launchPolicyDigest !== CODEX_LAUNCH_POLICY_DIGEST) throw Error('JUDGMENT_TRANSPORT_INVALID');
  const runtimePins = () => {
    const source = implementationPins(options.repositoryRoot);
    const compiled = Object.fromEntries(Object.keys(source).filter(p => p.endsWith('.ts')).map(p => {
      const file = `dist/${p.replace(/\.ts$/, '.js')}`;
      return [file, `sha256:${createHash('sha256').update(readFileSync(path.join(options.repositoryRoot, file))).digest('hex')}`];
    }));
    return { source, compiled };
  };
  const pins = runtimePins(), inputDigest = digest(inputs), pinDigest = digest(pins);
  const stable = () => { try { return digest(runtimePins()) === pinDigest && digest(options.inputs) === inputDigest
    && digest(options.judge) === digest(judge) && transport.respond === respond && transport.configurationDigest === configurationDigest
    && transport.assurance === assurance && transport.id === 'codex-chatgpt-exec/1' && transport.launchPolicyDigest === CODEX_LAUNCH_POLICY_DIGEST;
  } catch { return false; } };
  // Creating the output first rejects reuse before opening the shared authorization ledger.
  mkdirSync(options.outputRoot, { recursive: false, mode: 0o700 });
  writeNew(path.join(options.outputRoot, 'inputs.json'), inputs);
  writeNew(path.join(options.outputRoot, 'lock.json'), { schemaVersion: 'codex-semantic-judge-lock/1', pins, pinDigest, inputDigest,
    rubricDigest: SEMANTIC_RUBRIC_DIGEST, requestDigests: requests.map(digest), judge, assurance,
    authorization: options.authorization, maxRequestBytes: options.maxRequestBytes, timeoutMs: options.timeoutMs,
    batchSize: 6, createdAt: new Date().toISOString(), purpose: 'advisory-dev-calibration', releaseEligible: false });
  const budget = new SubscriptionBudget(options.usageRoot, options.authorization);
  const assessments: ReturnType<typeof parseBatchedJudgments> = [];
  let stoppedReason: string | null = null;
  try {
    for (const [index, request] of requests.entries()) {
      if (!stable()) { stoppedReason = 'binding-drift'; break; }
      const snapshot = budget.snapshot();
      if (snapshot.stopReason) { stoppedReason = snapshot.stopReason; break; }
      const requestDigest = digest(request), expectedConfigurationDigest = configurationDigest(request);
      writeNew(path.join(options.outputRoot, `request-${index}.json`), request);
      const attemptId = budget.reserve(requestDigest);
      journal(path.join(options.outputRoot, 'exposure.jsonl'), { index, attemptId, requestDigest, inputIds: batches[index]!.map(i => i.id), status: 'possibly-exposed', at: new Date().toISOString() });
      const controller = new AbortController(), timer = setTimeout(() => controller.abort(), Math.min(options.timeoutMs, snapshot.timeRemainingMs));
      try {
        const parsed = CodexReceiptSchema.safeParse(await respond(structuredClone(request), controller.signal));
        const result = parsed.success ? parsed.data : null;
        const bound = result !== null && result.requestDigest === requestDigest && result.requestedModel === judge.model
          && result.renderedRequestDigest === digest(renderCodexRequest(request)) && result.launchPolicyDigest === CODEX_LAUNCH_POLICY_DIGEST
          && result.configurationDigest === expectedConfigurationDigest;
        const known = bound && validCodexTokens(result);
        if (known) budget.settle(attemptId, result!.usage!.totalTokens);
        else budget.markUnknown(attemptId, 'unbound-or-unknown-judge-usage');
        journal(path.join(options.outputRoot, 'calls.jsonl'), { index, attemptId, requestDigest, expectedConfigurationDigest,
          result: bound ? result : null, status: known ? result!.status : 'unknown-usage' });
        if (!known) { stoppedReason = 'unknown-usage'; break; }
        if (!stable()) { stoppedReason = 'binding-drift'; break; }
        if (result!.status !== 'completed' || result!.cliVersion !== CODEX_CLI_VERSION || result!.issues.length) { stoppedReason = 'judge-not-completed'; break; }
        try {
          const batch = parseBatchedJudgments(batches[index]!, result!.output);
          assessments.push(...batch); journal(path.join(options.outputRoot, 'assessments.jsonl'), { index, requestDigest, assessments: batch });
        } catch { stoppedReason = 'invalid-judge-output'; break; }
      } catch {
        if (budget.snapshot().pendingAttempts) budget.markUnknown(attemptId, 'judge-transport-error');
        journal(path.join(options.outputRoot, 'calls.jsonl'), { index, attemptId, requestDigest, status: 'judge-transport-error', result: null });
        stoppedReason = 'judge-transport-error'; break;
      } finally { clearTimeout(timer); }
      options.onProgress?.(assessments.length, inputs.length);
    }
    if (!stable()) stoppedReason = 'binding-drift';
    const report = { schemaVersion: 'codex-semantic-judge-report/1', inputDigest, pinDigest, rubricDigest: SEMANTIC_RUBRIC_DIGEST,
      judge, assurance, planned: inputs.length, assessed: assessments.length, stoppedReason, assessments, budget: budget.snapshot(),
      independentModel: true, humanReviewed: false, phaseGate: 'Not evaluated', releaseEligible: false,
      limitations: ['Model judgments require independent calibration and adjudication', 'Batch judgments may be correlated',
        'Subscription reported usage; no API dollar cost or exact pre-count', 'Independent requested model is not independent human review'] };
    writeNew(path.join(options.outputRoot, 'report.json'), report); return report;
  } finally { budget.close(); }
}
