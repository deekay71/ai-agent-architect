import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { digest } from '../src/contracts/canonical.js';
import { loadPublicDataset, loadEvaluatorOracle } from '../src/evaluation/dataset.js';
import { runV1Regrade } from '../src/evaluation/v1-regrade.js';
import { compactRegradeRequest, continueV1Regrade, prepareRegradeContinuation } from '../src/evaluation/v1-regrade-continuation.js';
import { CURRENT_CODEX_CLI_VERSION, CURRENT_CODEX_LAUNCH_POLICY_DIGEST, renderCodexRequest, type CodexTransport } from '../src/providers/codex.js';
import type { JudgmentInput } from '../src/evaluation/semantic-judgment.js';

const data = loadPublicDataset('fixtures/semantic-benchmark'), task = data.cases.find(row => row.id === 'sem-001')!;
const gold = loadEvaluatorOracle('fixtures/semantic-benchmark').find(row => row.caseId === task.id)!;
const input: JudgmentInput = { id: 'answer-0', task, gold, readerModel: 'gpt-5.6-terra', documents: data.documents.filter(d => gold.requiredEvidenceIds.includes(d.id)),
  answer: { disposition: 'answer', answer: gold.acceptableAlternatives[0]!, evidenceIds: gold.requiredEvidenceIds, revisions: gold.expectedRevision, constraints: gold.expectedConstraints, confidence: 0.9 } };
const judge = { id: 'sol', role: 'planner' as const, model: 'gpt-6-sol', reasoningEffort: 'medium' as const };
test('shared context is lossless and retains each answer and exact required ID', () => {
  const second = { ...input, id: 'answer-1' }, request = compactRegradeRequest([input, second], judge);
  const parsed = JSON.parse(request.input);
  assert.equal(Object.keys(parsed.contexts).length, 1); assert.equal(parsed.items.length, 2);
  assert.equal(parsed.contexts[parsed.items[0].contextRef].history, input.task.history);
  assert.deepEqual(parsed.contexts[parsed.items[1].contextRef].constraints, input.task.constraints);
  assert.equal(parsed.items[1].answer.answer, second.answer.answer);
  assert.deepEqual((request.schema as any).properties.judgments.required, ['answer-0', 'answer-1']);
});

test('operator continuation replays prior assessments and shares their unchanged ledger; request tampering is rejected', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'regrade-continuation-')); t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const source = path.join(root, '.local/phase3-acceptance-v1/judgments'); fs.mkdirSync(source, { recursive: true });
  fs.writeFileSync(path.join(source, 'inputs.json'), JSON.stringify(Array.from({ length: 300 }, (_, n) => ({ ...input, id: `answer-${n}` }))));
  let calls = 0;
  const transport: CodexTransport = { id: 'codex-chatgpt-exec/1', assurance: 'mock', cliVersion: CURRENT_CODEX_CLI_VERSION,
    launchPolicyDigest: CURRENT_CODEX_LAUNCH_POLICY_DIGEST, configurationDigest: request => digest(request.model),
    async respond(request) {
      calls++; const items = JSON.parse(request.input).items as { id: string }[];
      return { status: 'completed', output: { judgments: Object.fromEntries(items.map(item => [item.id, { addressesQuestion: true, supportedByEvidence: true,
        respectsConstraintMeaning: true, abstentionAppropriate: false, rationale: 'fixture', unsupportedClaims: [], violatedConstraintIds: [] }])) },
        requestedModel: request.model, requestDigest: digest(request), renderedRequestDigest: digest(renderCodexRequest(request)), launchPolicyDigest: transport.launchPolicyDigest,
        configurationDigest: transport.configurationDigest(request), usage: { inputTokens: 10, cachedInputTokens: 0, outputTokens: 1, totalTokens: 11, reasoningTokens: null },
        elapsedMs: 1, cliVersion: transport.cliVersion!, threadId: 'mock', issues: [], apiCostMicros: null, exactInputCount: null,
        modelIdentityAssurance: 'requested-only', maxOutputTokensEnforced: false, isolationAssurance: 'capability-flags-and-event-audit' };
    } };
  const parentRoot = path.join(root, 'parent'), usageRoot = path.join(root, 'usage');
  await assert.rejects(runV1Regrade({ repositoryRoot: root, outputRoot: parentRoot, usageRoot, judge, transport, timeoutMs: 10000, maxRequestBytes: 1000000,
    budgetApproval: { schemaVersion: 'v1-regrade-budget-approval/1', approvalId: 'fixture', explicitlyAuthorized: true, maxAggregateTokenEstimate: 20000000,
      authorization: { authorizationId: 'same-ledger', maxInvocations: 150, maxReportedTokens: 20000000, maxWallTimeMs: 60000 } },
    onProgress() { throw Error('OPERATOR_STOP'); } }), /OPERATOR_STOP/);
  const prepared = prepareRegradeContinuation(root, parentRoot, transport); assert.equal(prepared.assessed.size, 6);
  const result = await continueV1Regrade({ repositoryRoot: root, parentRoot, outputRoot: path.join(root, 'continued'), usageRoot, transport, approvalReference: 'fixture-continuation', maxWeightedTokens: 3000000 });
  assert.equal(result.assessed, 300); assert.equal(calls, 50); assert.equal(result.budget.usedInvocations, 50); assert.equal(result.budget.reportedTokens, 550);
  const requestPath = path.join(parentRoot, 'request-0-0.json'), request = JSON.parse(fs.readFileSync(requestPath, 'utf8')); request.input += 'tamper'; fs.writeFileSync(requestPath, JSON.stringify(request));
  assert.throws(() => prepareRegradeContinuation(root, parentRoot, transport), /RECEIPT_BINDING/);
});
