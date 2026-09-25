import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { digest } from '../src/contracts/canonical.js';
import { runSemanticCampaign, campaignPreflight } from '../src/evaluation/campaign.js';
import { createSandboxMockProvider } from '../src/evaluation/mock-provider.js';
import type { ModelProvider, ModelRequest } from '../src/providers/types.js';

const config = {
  schemaVersion: 'semantic-campaign-config/1', campaignId: 'pipeline-test', provider: 'mock', split: 'dev',
  profiles: [{ id: 'test', role: 'executor', model: 'mock', inputTokenLimit: 10_000, reasoningEffort: 'low',
    pricing: { model: 'mock', inputPerMillionUsd: 1, cachedInputPerMillionUsd: 1, outputPerMillionUsd: 1,
      source: 'https://developers.openai.com/api/docs/pricing', observedAt: '2026-09-25' } }],
  totalTokenBudgets: [1024], distractorLimits: [0], compactionRounds: [3], repeats: 1, topK: 8,
  maxOutputTokens: 512, headroomTokens: 0, authorization: { authorizationId: 'local-pipeline', maxCostMicros: 0 },
  thresholds: { maxFalseAcceptance: 0, maxConstraintLoss: 0, maxInvalidCitations: 0, minimumStrictPassRate: .9, calibrationStatus: 'provisional' },
};

test('complete local campaign counts earlier compactions, separates reader controls, preserves immutable evidence and never claims model PASS', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'semantic-pipeline-'));
  const requests: ModelRequest[] = [];
  const provider: ModelProvider = { id: 'deliberately-abstaining-test', assurance: 'mock',
    async countInput(r) { return { inputTokens: 400, requestDigest: digest(r), counterId: 'synthetic-fixed' }; },
    async respond(r) {
      requests.push(r);
      const packet = JSON.parse(r.input);
      return { model: r.model, requestDigest: digest(r), responseId: 'fixture', requestId: null, latencyMs: 0,
        status: 'completed', usage: { inputTokens: 400, outputTokens: 10, totalTokens: 410, cachedInputTokens: 0, reasoningTokens: 0 },
        output: r.schemaName === 'context_summary' ? { summary: 'Untrusted short summary' }
          : { disposition: 'abstain', answer: null, evidenceIds: [], revisions: [], constraints: packet.task.constraints.map((c: { id: string }) => c.id), confidence: .5 } };
    } };
  try {
    const args = { datasetRoot: path.resolve('fixtures/semantic-benchmark'), repositoryRoot: process.cwd(),
      outputRoot: path.join(root, 'evidence'), spendRoot: path.join(root, 'spend'), config, provider };
    const preflight = campaignPreflight(args.datasetRoot, config);
    const report = await runSemanticCampaign(args);
    assert.equal(report.completedTrials, preflight.plannedTrials);
    assert.equal(report.completedControlTrials, preflight.plannedControlTrials);
    assert.equal(report.stoppedReason, null);
    assert.equal(report.phaseGate, 'Not evaluated');
    assert.equal(report.modelQualityMeasured, false);
    assert.ok(report.summaries.every(g => !JSON.stringify(g.dimensions).includes('oracle-evidence')));
    assert.ok(report.controlSummaries.every(g => JSON.stringify(g.dimensions).includes('oracle-evidence')));
    const compacted = report.trials.filter(t => t.arm === 'compaction' && t.status !== 'context-blocked');
    assert.ok(compacted.length > 0);
    for (const trial of compacted) {
      assert.equal(trial.status, 'token-budget-blocked');
      assert.equal(trial.calls.length, 2);
      assert.equal(trial.calls[0]!.stage, 'compact-0');
      assert.equal(trial.calls[1]!.result, null, 'second compactor blocked using spent first-compactor tokens');
      assert.equal(trial.unitsUsed, 410);
      assert.equal(trial.windowDigests.length, 2);
    }
    assert.ok(report.trials.every(t => t.providerTokens === null && t.costMicros === null));
    assert.ok(report.trials.every(t => t.canonicalPreserved));
    assert.ok(report.trials.some(t => t.status === 'context-blocked'));
    for (const r of requests) for (const forbidden of ['acceptableAlternatives', 'expectedConstraints', 'requiredEvidenceIds', 'answerability']) {
      assert.equal(r.input.includes(`\"${forbidden}\"`), false);
    }
    assert.equal(JSON.parse(readFileSync(path.join(args.outputRoot, 'report.json'), 'utf8')).completedTrials, report.completedTrials);
    await assert.rejects(runSemanticCampaign(args), /EEXIST/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('sandbox reader and compactor run locally without filesystem or model access, labelled synthetic', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'semantic-sandbox-'));
  try {
    const provider = createSandboxMockProvider(root);
    const request: ModelRequest = { model: 'mock-only', instructions: 'Local fixture', maxOutputTokens: 512,
      schema: {}, schemaName: 'evidence_answer', input: JSON.stringify({ task: { constraints: [{ id: 'keep-canonical' }] }, history: { content: 'untrusted history' } }) };
    const count = await provider.countInput(request), result = await provider.respond(request);
    assert.equal(provider.assurance, 'mock');
    assert.equal(count.counterId, 'mock-byte-div4-NOT-tokenizer');
    assert.equal(result.status, 'completed');
    assert.equal(result.usage!.inputTokens, count.inputTokens);
    assert.deepEqual(result.output, { disposition: 'abstain', answer: null, evidenceIds: [], revisions: [], constraints: ['keep-canonical'], confidence: .5 });
    assert.ok(result.issues?.includes('MOCK_NOT_MODEL_EVIDENCE'));
    const summary = await provider.respond({ ...request, schemaName: 'context_summary' });
    assert.match((summary.output as { summary: string }).summary, /UNTRUSTED LOCAL FIXTURE/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
