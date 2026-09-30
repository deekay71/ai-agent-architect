import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { canonicalJson, digest } from '../contracts/canonical.js';
import { renderCodexRequest, type CodexTransport } from '../providers/codex.js';
import { CodexReceiptSchema, validCodexTokens } from './codex-receipt.js';
import { CodexProfileSchema, type CodexProfile } from './codex-config.js';
import { JudgmentInputSchema, type JudgmentInput } from './semantic-judgment.js';
import { batchRequest, parseOutput, V1RegradeBudgetApprovalSchema } from './v1-regrade.js';
import { SubscriptionBudget } from './subscription-budget.js';

const read = (file: string) => JSON.parse(fs.readFileSync(file, 'utf8')) as unknown;
const write = (file: string, value: unknown) => fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n', { flag: 'wx', mode: 0o600 });

/** Lossless factoring of identical public context. No summarization, truncation or oracle access. */
export function compactRegradeRequest(inputs: readonly JudgmentInput[], judge: CodexProfile) {
  const request = batchRequest(inputs, judge);
  const { items } = JSON.parse(request.input) as { items: Record<string, unknown>[] };
  const contexts: Record<string, unknown> = {}, keys = new Map<string, string>();
  const compact = items.map(({ id, answer, ...context }) => {
    const key = canonicalJson(context); let ref = keys.get(key);
    if (!ref) { ref = `context-${keys.size}`; keys.set(key, ref); contexts[ref] = context; }
    return { id, contextRef: ref, answer };
  });
  return { ...request, input: canonicalJson({ contexts, items: compact }),
    instructions: request.instructions + ' Each item contextRef resolves to the complete shared context in contexts. Use that context for that item. Sharing is lossless and does not mix answers.' };
}
function contextKey(input: JudgmentInput, judge: CodexProfile): string {
  const items = (JSON.parse(batchRequest([input], judge).input) as { items: Record<string, unknown>[] }).items;
  const { id: _id, answer: _answer, ...context } = items[0]!; return canonicalJson(context);
}

/** One continuation of an operator-stopped run; completed judgments are replayed, never regenerated. */
export function prepareRegradeContinuation(repositoryRoot: string, parentRoot: string, transport: CodexTransport) {
  const sourceFile = path.join(repositoryRoot, '.local/phase3-acceptance-v1/judgments/inputs.json');
  const raw = fs.readFileSync(sourceFile, 'utf8'), inputs = z.array(JudgmentInputSchema).length(300).parse(JSON.parse(raw));
  const lock = read(path.join(parentRoot, 'lock.json')) as Record<string, unknown>;
  const approval = V1RegradeBudgetApprovalSchema.parse(lock.budgetApproval), judge = CodexProfileSchema.parse(lock.judge);
  if (lock.inputDigest !== digest(inputs) || lock.sourceDigest !== digest(raw) || lock.assurance !== transport.assurance) throw Error('REGRADE_RESUME_SOURCE_BINDING');
  const calls = fs.readFileSync(path.join(parentRoot, 'calls.jsonl'), 'utf8').trim().split('\n').map(line => JSON.parse(line) as Record<string, unknown>);
  const assessed = new Map<string, unknown>();
  let reportedTokens = 0;
  for (const call of calls) {
    if (call.status !== 'completed' || call.retryNumber !== 0 || !Number.isInteger(call.batchIndex)) throw Error('REGRADE_RESUME_PARENT_NOT_CLEAN');
    const receipt = CodexReceiptSchema.parse(call.receipt), batchIndex = call.batchIndex as number;
    const batch = inputs.slice(batchIndex * 6, batchIndex * 6 + 6), expected = batchRequest(batch, judge);
    const recorded = read(path.join(parentRoot, `request-${batchIndex}-0.json`));
    if (!validCodexTokens(receipt) || receipt.status !== 'completed' || receipt.issues.length || receipt.requestDigest !== digest(expected)
      || digest(recorded) !== digest(expected) || receipt.renderedRequestDigest !== digest(renderCodexRequest(expected))
      || receipt.requestedModel !== judge.model || receipt.cliVersion !== transport.cliVersion
      || receipt.configurationDigest !== transport.configurationDigest(expected) || receipt.launchPolicyDigest !== transport.launchPolicyDigest
      || digest(call.inputIds) !== digest(batch.map(row => row.id))) throw Error('REGRADE_RESUME_RECEIPT_BINDING');
    const parsed = parseOutput(batch, receipt.output); if (parsed.kind !== 'complete') throw Error('REGRADE_RESUME_PARENT_OUTPUT');
    for (const row of parsed.assessments) { if (assessed.has(row.id)) throw Error('REGRADE_RESUME_DUPLICATE'); assessed.set(row.id, row.assessment); }
    reportedTokens += receipt.usage!.totalTokens;
  }
  const remaining = inputs.filter(input => !assessed.has(input.id)).sort((a, b) => contextKey(a, judge).localeCompare(contextKey(b, judge)) || a.id.localeCompare(b.id));
  const batches = Array.from({ length: Math.ceil(remaining.length / 6) }, (_, n) => remaining.slice(n * 6, n * 6 + 6));
  const requests = batches.map(batch => compactRegradeRequest(batch, judge));
  const initialEstimate = requests.reduce((total, request) => total + Math.ceil(canonicalJson(request).length / 4) + request.maxOutputTokens + 2000, 0);
  return { inputs, lock, approval, judge, calls, assessed, remaining, batches, reportedTokens,
    forecast: { originalCases: 300, completedCases: assessed.size, remainingCases: remaining.length, completedCalls: calls.length,
      initialRemainingCalls: batches.length, maxMissingIdRetryCalls: batches.length * 2,
      rawTokensUsed: reportedTokens, weightedTokensUsed: reportedTokens * 3, initialRemainingTokenEstimate: initialEstimate,
      estimatedWholeRunWeightedTokens: (reportedTokens + initialEstimate) * 3, wholeRunWeightedCap: 3000000,
      retryPolicy: 'At most two missing-ID-only retries; also bounded by remaining whole-run budget. A cap stop leaves explicit unassessed IDs.',
      weeklyQuotaPercent: null, weeklyQuotaBasis: 'Unknown; concurrent Codex activity contaminates current before/after readings.',
      decision: 'Close Phase 3 administratively with counted quality risks, then admit the small Unity baseline; no production release.' } };
}

export async function continueV1Regrade(options: { repositoryRoot: string; parentRoot: string; outputRoot: string; usageRoot: string;
  transport: CodexTransport; approvalReference: string; maxWeightedTokens: number; onProgress?: (assessed: number) => void }) {
  const prepared = prepareRegradeContinuation(options.repositoryRoot, options.parentRoot, options.transport);
  if (!options.approvalReference.trim() || options.maxWeightedTokens > 3000000 || options.maxWeightedTokens < prepared.forecast.estimatedWholeRunWeightedTokens) throw Error('REGRADE_RESUME_APPROVAL');
  if (fs.existsSync(options.outputRoot)) throw Error('REGRADE_RESUME_OUTPUT_EXISTS');
  const budget = new SubscriptionBudget(options.usageRoot, prepared.approval.authorization);
  try {
    const state = budget.snapshot();
    if (state.stopReason || state.reportedTokens !== prepared.reportedTokens || state.usedInvocations !== prepared.calls.length) throw Error('REGRADE_RESUME_LEDGER_BINDING');
    const attempts = budget.attempts();
    for (const call of prepared.calls) if (!attempts.some(attempt => attempt.attemptId === call.attemptId && attempt.state === 'settled' && attempt.requestDigest === call.requestDigest)) throw Error('REGRADE_RESUME_ATTEMPT_BINDING');
    fs.mkdirSync(options.outputRoot, { mode: 0o700 });
    write(path.join(options.outputRoot, 'lock.json'), { schemaVersion: 'v1-regrade-continuation/1', parentRoot: path.resolve(options.parentRoot),
      parentLockDigest: digest(prepared.lock), approvalReference: options.approvalReference, forecast: prepared.forecast,
      effectiveRawTokenCap: Math.floor(options.maxWeightedTokens / 3), effectiveWeightedTokenCap: options.maxWeightedTokens,
      budgetApproval: prepared.approval, inputDigest: digest(prepared.inputs), contextEncoding: 'lossless-shared-context/1' });
    let stoppedReason: string | null = null;
    for (const [batchIndex, originalBatch] of prepared.batches.entries()) {
      let pending = originalBatch;
      for (let retryNumber = 0; pending.length && retryNumber <= 2; retryNumber++) {
        const request = compactRegradeRequest(pending, prepared.judge);
        const reserve = Math.ceil(canonicalJson(request).length / 4) + request.maxOutputTokens + 2000;
        if ((budget.snapshot().reportedTokens + reserve) * 3 > options.maxWeightedTokens || budget.snapshot().stopReason) { stoppedReason = 'weighted-token-cap'; break; }
        write(path.join(options.outputRoot, `request-${batchIndex}-${retryNumber}.json`), request);
        const attemptId = budget.reserve(digest(request));
        const call: Record<string, unknown> = { batchIndex, retryNumber, attemptId, requestDigest: digest(request), inputIds: pending.map(input => input.id) };
        try {
          const receipt = await options.transport.respond(request); call.receipt = receipt;
          if (!CodexReceiptSchema.safeParse(receipt).success || !validCodexTokens(receipt) || receipt.requestDigest !== digest(request)
            || receipt.renderedRequestDigest !== digest(renderCodexRequest(request)) || receipt.configurationDigest !== options.transport.configurationDigest(request)
            || receipt.launchPolicyDigest !== options.transport.launchPolicyDigest || receipt.cliVersion !== options.transport.cliVersion || receipt.requestedModel !== prepared.judge.model) {
            budget.markUnknown(attemptId, 'continuation-unbound-usage'); stoppedReason = 'unknown-usage'; call.status = stoppedReason; break;
          }
          budget.settle(attemptId, receipt.usage!.totalTokens); call.usage = receipt.usage;
          if (receipt.status !== 'completed' || receipt.issues.length) { stoppedReason = 'provider-failure'; call.status = stoppedReason; break; }
          const parsed = parseOutput(pending, receipt.output);
          if (parsed.kind === 'invalid') { stoppedReason = 'invalid-output'; call.status = stoppedReason; break; }
          for (const row of parsed.assessments) { if (prepared.assessed.has(row.id)) throw Error('REGRADE_RESUME_DUPLICATE'); prepared.assessed.set(row.id, row.assessment); }
          call.status = parsed.kind === 'complete' ? 'completed' : 'infrastructure-error-partial-output';
          if (parsed.kind === 'complete') pending = [];
          else { call.missingIds = parsed.missingIds; pending = pending.filter(input => parsed.missingIds.includes(input.id)); }
        } catch (error) {
          if (budget.snapshot().pendingAttempts) budget.markUnknown(attemptId, 'continuation-transport-error');
          stoppedReason = 'transport-error'; call.status = stoppedReason; call.error = String(error);
        } finally { fs.appendFileSync(path.join(options.outputRoot, 'calls.jsonl'), JSON.stringify(call) + '\n', { mode: 0o600 }); }
        if (stoppedReason) break;
      }
      options.onProgress?.(prepared.assessed.size); if (stoppedReason) break;
    }
    const rows = [...prepared.assessed].map(([id, assessment]) => ({ id, assessment }));
    const report = { schemaVersion: 'v1-regrade-merged-report/1', assurance: options.transport.assurance, planned: 300, assessed: rows.length,
      unassessed: prepared.inputs.filter(input => !prepared.assessed.has(input.id)).map(input => input.id), assessments: rows,
      budget: budget.snapshot(), weightedReportedTokens: budget.snapshot().reportedTokens * 3, weightedCap: options.maxWeightedTokens,
      parentRoot: path.resolve(options.parentRoot), sourceDigest: prepared.lock.sourceDigest, inputDigest: digest(prepared.inputs),
      stoppedReason, releaseEligible: false, verifiedPassCapability: false };
    write(path.join(options.outputRoot, 'report.json'), report); return report;
  } finally { budget.close(); }
}
