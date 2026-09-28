import { appendFileSync, closeSync, existsSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { z } from 'zod';
import { canonicalJson, digest } from '../contracts/canonical.js';
import { serializeContextPacket, validateContextWindow } from '../context/engine.js';
import type { ModelRequest } from '../providers/types.js';
import { createCodexTransport, renderCodexRequest, CODEX_CLI_VERSION, CODEX_LAUNCH_POLICY_DIGEST, type CodexResult } from '../providers/codex.js';
import { buildReaderRequest, buildSummaryRequest, campaignPromptDigest, implementationPins, parseReaderAnswer } from './campaign.js';
import { codexCampaignPreflight, type CodexProfile } from './codex-config.js';
import { applyCompaction, prepareContext, type ContextArm } from './context-arms.js';
import { loadEvaluatorOracle, loadPublicDataset, verifyDatasetSeal, type SemanticAnswer, type SemanticCase, type SemanticDocument } from './dataset.js';
import { scoreGatheringEvidence, scoreSemanticAnswer, type GatheringEvidenceScore, type SemanticScore } from './scoring.js';
import { summarizePairedTrials } from './paired-statistics.js';
import { SubscriptionBudget } from './subscription-budget.js';
import { CodexReceiptSchema, validCodexTokens } from './codex-receipt.js';
import { ExposureRegistry, caseExposureFingerprint } from './exposure.js';

export interface CodexCampaignCall {
  stage: string; requestPath: string; requestDigest: string; attemptId: string | null;
  status: string; expectedConfigurationDigest: string | null; result: CodexResult | null;
}
export interface CodexTrial {
  trialId: string; caseId: string; family: string; taskClass: string; profileId: string; role: string; requestedModel: string;
  arm: ContextArm | 'oracle-evidence'; compactionRounds: number; distractors: number; repeat: number; status: string;
  reportedTokenStop: number; reportedTokens: number; reportedTokenStopExceeded: boolean; latencyMs: number;
  windowDigests: string[]; selectedIds: string[]; retrievedIds: string[]; eligibleIds: string[]; actualDistractors: number;
  canonicalPreserved: boolean; answer: SemanticAnswer | null; answerDigest: string | null; score: SemanticScore | null;
  gathering: { selected: GatheringEvidenceScore; retrieved: GatheringEvidenceScore } | null;
  calls: CodexCampaignCall[];
}
function json(file: string, value: unknown): void { writeFileSync(file, JSON.stringify(value, null, 2) + '\n', { flag: 'wx', mode: 0o600 }); }
function append(file: string, value: unknown): void {
  const fd = openSync(file, 'a', 0o600);
  try { appendFileSync(fd, JSON.stringify(value) + '\n'); fsyncSync(fd); } finally { closeSync(fd); }
}
const contains = (parent: string, child: string) => child === parent || child.startsWith(`${parent}${path.sep}`);
function canonicalDestination(file: string): string {
  const absolute = path.resolve(file);
  if (existsSync(absolute)) {
    if (lstatSync(absolute).isSymbolicLink()) throw Error('CODEX_PATH_SYMLINK_DENIED');
    return realpathSync(absolute);
  }
  return path.join(realpathSync(path.dirname(absolute)), path.basename(absolute));
}

/** Separate measurement route: Codex context and reported usage cannot impersonate API pre-count or billing. */
export async function runCodexCampaign(options: {
  datasetRoot: string; repositoryRoot: string; outputRoot: string; usageRoot: string; config: unknown;
  transport: ReturnType<typeof createCodexTransport>; onProgress?: (completed: number, planned: number) => void;
}) {
  const datasetPath = realpathSync(options.datasetRoot), outputPath = canonicalDestination(options.outputRoot), usagePath = canonicalDestination(options.usageRoot);
  if (existsSync(outputPath)) throw Error('CODEX_OUTPUT_MUST_BE_NEW');
  if (contains(datasetPath, outputPath) || contains(outputPath, datasetPath) || contains(datasetPath, usagePath)
    || contains(usagePath, datasetPath) || contains(outputPath, usagePath) || contains(usagePath, outputPath)) throw Error('CODEX_PATH_OVERLAP');
  options = { ...options, datasetRoot: datasetPath, outputRoot: outputPath, usageRoot: usagePath };
  const preflight = codexCampaignPreflight(options.datasetRoot, options.config), config = preflight.config;
  const configDigest = preflight.configDigest, sourcePins = implementationPins(options.repositoryRoot), implementationDigest = digest(sourcePins);
  const transportId = options.transport.id, assurance = options.transport.assurance, launchPolicyDigest = options.transport.launchPolicyDigest;
  const respond = options.transport.respond, configurationDigest = options.transport.configurationDigest;
  if (!['codex-chatgpt', 'mock'].includes(assurance) || transportId !== 'codex-chatgpt-exec/1'
    || launchPolicyDigest !== CODEX_LAUNCH_POLICY_DIGEST) throw Error('CODEX_TRANSPORT_ASSURANCE_INVALID');
  const runtimePins = () => Object.fromEntries(Object.keys(sourcePins).filter(p => p.endsWith('.ts')).flatMap(p => {
    const compiled = `dist/${p.replace(/\.ts$/, '.js')}`, file = path.join(options.repositoryRoot, compiled);
    if (!existsSync(file)) { if (assurance === 'codex-chatgpt') throw Error('CODEX_COMPILED_SOURCE_MISSING'); return []; }
    if (lstatSync(file).isSymbolicLink()) throw Error('CODEX_COMPILED_SOURCE_SYMLINK');
    return [[compiled, `sha256:${createHash('sha256').update(readFileSync(file)).digest('hex')}`]];
  }));
  const compiledPins = runtimePins(), compiledDigest = digest(compiledPins);
  let driftObserved = false;
  const stable = () => {
    try { if (!(digest(options.config) === configDigest && digest(implementationPins(options.repositoryRoot)) === implementationDigest
      && verifyDatasetSeal(options.datasetRoot) === preflight.datasetSealDigest
      && options.transport.id === transportId && options.transport.assurance === assurance
      && options.transport.launchPolicyDigest === launchPolicyDigest && options.transport.respond === respond
      && options.transport.configurationDigest === configurationDigest && digest(runtimePins()) === compiledDigest)) driftObserved = true;
    } catch { driftObserved = true; }
    return !driftObserved;
  };
  const dataset = loadPublicDataset(options.datasetRoot), cases = config.caseIds.map(id => dataset.cases.find(c => c.id === id)!);
  // Acquire durable authorization before creating a campaign or exposing any input.
  const budget = new SubscriptionBudget(options.usageRoot, config.authorization);
  let exposure: ExposureRegistry | undefined;
  const trials: CodexTrial[] = []; let stoppedReason: string | null = null;
  try {
    exposure = new ExposureRegistry(options.usageRoot);
    mkdirSync(options.outputRoot, { recursive: false, mode: 0o700 });
    for (const name of ['packets', 'requests']) mkdirSync(path.join(options.outputRoot, name));
    const lock = { ...preflight, schemaVersion: 'codex-semantic-lock/1', sourcePins, implementationDigest, compiledPins, compiledDigest,
      promptDigest: campaignPromptDigest(), transportId, assurance, launchPolicyDigest, createdAt: new Date().toISOString() };
    json(path.join(options.outputRoot, 'campaign-lock.json'), lock);
    async function invoke(request: ModelRequest, trial: CodexTrial, stage: string): Promise<CodexResult | null> {
      const requestPath = `requests/${trial.trialId}-${stage}.json`, requestDigest = digest(request);
      const call: CodexCampaignCall = { stage, requestPath, requestDigest, attemptId: null, status: 'pending', expectedConfigurationDigest: null, result: null };
      trial.calls.push(call); json(path.join(options.outputRoot, requestPath), request);
      const blocked = (status: string): null => { call.status = trial.status = status; append(path.join(options.outputRoot, 'calls.jsonl'), call); return null; };
      if (!stable()) { stoppedReason = 'binding-drift'; return blocked(stoppedReason); }
      if (Math.max(Buffer.byteLength(canonicalJson(request)), Buffer.byteLength(renderCodexRequest(request))) > config.maxVisibleRequestBytes) return blocked('visible-request-blocked');
      if (trial.reportedTokens >= config.perTrialReportedTokenStop) return blocked('reported-token-stop');
      const snapshot = budget.snapshot();
      if (snapshot.stopReason) { stoppedReason = snapshot.stopReason; return blocked('subscription-budget-stopped'); }
      const expectedConfigurationDigest = configurationDigest(request);
      call.expectedConfigurationDigest = expectedConfigurationDigest;
      try { call.attemptId = budget.reserve(requestDigest); }
      catch { stoppedReason = 'subscription-budget-admission'; return blocked('subscription-budget-stopped'); }
      // Count APIs are not used. Record exposure BEFORE the first possible CLI request, including uncertain failures.
      append(path.join(options.outputRoot, 'exposure.jsonl'), { datasetSealDigest: preflight.datasetSealDigest, split: 'dev',
        caseId: trial.caseId, requestDigest, attemptId: call.attemptId, at: new Date().toISOString(), status: 'possibly-exposed', assurance });
      const exposedTask = cases.find(c => c.id === trial.caseId)!;
      exposure!.record({ datasetSealDigest: preflight.datasetSealDigest, split: 'dev', caseId: trial.caseId,
        family: exposedTask.family, contentFingerprint: caseExposureFingerprint(exposedTask), campaignId: config.campaignId,
        requestDigest, attemptId: call.attemptId, at: new Date().toISOString(), assurance });
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), Math.max(1, Math.min(config.perCallTimeoutMs, snapshot.timeRemainingMs)));
      try {
        const parsed = CodexReceiptSchema.safeParse(await respond(structuredClone(request), controller.signal));
        if (!parsed.success) { budget.markUnknown(call.attemptId, 'invalid-receipt'); call.status = trial.status = stoppedReason = 'receipt-binding-error'; return null; }
        const result = parsed.data as CodexResult;
        // Only a validated transport receipt can settle usage; never count undefined usage as zero.
        const binding = result.requestDigest === requestDigest && result.requestedModel === request.model
          && result.renderedRequestDigest === digest(renderCodexRequest(request)) && result.launchPolicyDigest === launchPolicyDigest
          && result.configurationDigest === expectedConfigurationDigest;
        const known = binding && validCodexTokens(result);
        if (known) { budget.settle(call.attemptId, result.usage!.totalTokens); trial.reportedTokens += result.usage!.totalTokens; }
        else budget.markUnknown(call.attemptId, 'unknown-or-unbound-usage');
        call.result = binding ? result : null;
        if (!binding) { call.status = trial.status = 'receipt-binding-error'; stoppedReason = call.status; return null; }
        if (!stable()) { call.status = trial.status = 'binding-drift'; stoppedReason = call.status; return null; }
        if (!known) { call.status = trial.status = 'unknown-usage'; stoppedReason = call.status; return null; }
        if (result.status !== 'completed' || result.cliVersion !== CODEX_CLI_VERSION || result.issues.length) {
          call.status = trial.status = result.status === 'completed' ? 'invalid-completion' : result.status; stoppedReason = 'codex-invocation-not-completed'; return null;
        }
        call.status = 'completed'; return result;
      } catch {
        if (budget.snapshot().pendingAttempts) budget.markUnknown(call.attemptId, 'interrupted-or-transport-error');
        call.status = trial.status = 'transport-error'; stoppedReason = call.status; return null;
      } finally { clearTimeout(timer); append(path.join(options.outputRoot, 'calls.jsonl'), call); }
    }
    async function execute(task: SemanticCase, profile: CodexProfile, arm: CodexTrial['arm'], rounds: number, distractors: number, repeat: number, documents: SemanticDocument[]) {
      const started = performance.now(), trialId = `codex-${String(trials.length + 1).padStart(5, '0')}`;
      const trial: CodexTrial = { trialId, caseId: task.id, family: task.family, taskClass: task.taskClass, profileId: profile.id, role: profile.role,
        requestedModel: profile.model, arm, compactionRounds: rounds, distractors, repeat, status: 'pending',
        reportedTokenStop: config.perTrialReportedTokenStop, reportedTokens: 0, reportedTokenStopExceeded: false, latencyMs: 0,
        windowDigests: [], selectedIds: [], retrievedIds: [], eligibleIds: [], actualDistractors: 0, canonicalPreserved: false,
        answer: null, answerDigest: null, score: null, gathering: null, calls: [] };
      try {
        let p = await prepareContext({ root: path.join(options.outputRoot, 'memory', trialId), documents, task,
          arm: arm === 'oracle-evidence' ? 'full' : arm, role: profile.role, modelConfigVersion: digest(profile), distractors, topK: config.topK, trialId });
        trial.selectedIds = p.selected.map(d => d.id); trial.retrievedIds = p.retrievedIds; trial.eligibleIds = p.eligibleIds;
        trial.actualDistractors = documents.filter(d => p.eligibleIds.includes(d.id) && d.distractor).length;
        const canonical = digest({ task: p.window.packet.task, unknowns: p.window.packet.bundle.unknowns });
        const save = () => { trial.windowDigests.push(p.window.windowDigest); json(path.join(options.outputRoot, 'packets', `${trialId}-${p.window.packet.generation}.json`), p.window); };
        save();
        for (let round = 0; round < rounds && p.window.status === 'ready'; round++) {
          const r = await invoke(buildSummaryRequest(serializeContextPacket(p.window), profile, config.outputTokenHint), trial, `compact-${round}`);
          if (!r) break;
          const summary = z.strictObject({ summary: z.string().max(500_000) }).safeParse(r.output);
          if (!summary.success) { trial.status = 'malformed-summary'; break; }
          p = await applyCompaction(p, summary.data.summary, `${trialId}:window:${round + 1}`); save();
        }
        trial.canonicalPreserved = canonical === digest({ task: p.window.packet.task, unknowns: p.window.packet.bundle.unknowns });
        if (!trial.canonicalPreserved || validateContextWindow(p.window, p.authority).status !== 'ready') trial.status = 'context-blocked';
        if (trial.status === 'pending') {
          const r = await invoke(buildReaderRequest(serializeContextPacket(p.window), profile, config.outputTokenHint), trial, 'reader');
          if (r) { try { trial.answer = parseReaderAnswer(r.output); trial.answerDigest = digest(trial.answer); trial.status = 'completed'; }
            catch { trial.status = 'malformed-answer'; } }
        }
      } catch { trial.status = 'trial-infrastructure-error'; stoppedReason = trial.status; }
      trial.reportedTokenStopExceeded = trial.reportedTokens > config.perTrialReportedTokenStop;
      trial.latencyMs = performance.now() - started; trials.push(trial);
      append(path.join(options.outputRoot, 'trials.jsonl'), trial);
      options.onProgress?.(trials.length, preflight.plannedTrials + preflight.plannedControls);
    }
    outer: for (let repeat = 0; repeat < config.repeats; repeat++) for (const task of cases) for (const profile of config.profiles) for (const density of config.distractorLimits) {
      const arms = [{ arm: 'full' as const, rounds: 0 }, { arm: 'retrieval' as const, rounds: 0 }, ...config.compactionRounds.map(rounds => ({ arm: 'compaction' as const, rounds }))];
      if ((repeat + cases.indexOf(task)) % 2) arms.reverse();
      for (const a of arms) { await execute(task, profile, a.arm, a.rounds, density, repeat, dataset.documents); if (stoppedReason) break outer; }
    }
    try {
      const oracle = loadEvaluatorOracle(options.datasetRoot);
      if (!stoppedReason) {
        controls: for (let repeat = 0; repeat < config.repeats; repeat++) for (const task of cases) for (const profile of config.profiles) {
          const required = oracle.find(g => g.caseId === task.id)!.requiredEvidenceIds;
          await execute(task, profile, 'oracle-evidence', 0, 0, repeat, dataset.documents.filter(d => required.includes(d.id)));
          if (stoppedReason) break controls;
        }
      }
      for (const t of trials) {
        const gold = oracle.find(g => g.caseId === t.caseId)!;
        if (t.windowDigests.length) t.gathering = { retrieved: scoreGatheringEvidence(gold, t.retrievedIds, dataset.documents), selected: scoreGatheringEvidence(gold, t.selectedIds, dataset.documents) };
        if (t.answer) t.score = scoreSemanticAnswer(gold, t.answer, dataset.documents.filter(d => t.selectedIds.includes(d.id)));
      }
    } catch { stoppedReason = 'evaluator-integrity-error'; }
    const integrityStable = stable(); if (!integrityStable) stoppedReason = 'binding-drift';
    const paired = summarizePairedTrials(trials.map(t => ({ ...t, totalTokenBudget: t.reportedTokenStop })), ['visible-request-blocked', 'reported-token-stop', 'subscription-budget-stopped']);
    const pairedDiagnostics = { ...paired, schemaVersion: 'codex-paired-diagnostics/1',
      accountingBasis: 'same-post-call-stop-rule-not-equal-hard-provider-token-budget',
      groups: paired.groups.map(g => { const { totalTokenBudget, ...dimensions } = g.dimensions; return { ...g, dimensions: { ...dimensions, reportedTokenStop: totalTokenBudget } }; }) };
    const coverage = (items: CodexTrial[]) => ({ observed: items.length, scored: items.filter(t => t.score !== null).length,
      strictPass: items.filter(t => t.score?.strictPass).length, outcomes: Object.fromEntries([...new Set(items.map(t => t.status))].map(s => [s, items.filter(t => t.status === s).length])) });
    const report = { schemaVersion: 'codex-semantic-report/1', campaignId: config.campaignId, purpose: config.purpose,
      configDigest, datasetSealDigest: preflight.datasetSealDigest, implementationDigest, compiledDigest, transportId, assurance, launchPolicyDigest,
      billing: 'chatgpt-subscription-quota', apiCostMicros: null, exactInputCount: null, maxOutputTokensEnforced: false,
      modelIdentityAssurance: 'requested-only', budgetBasis: preflight.budgetBasis, integrityStable, stoppedReason,
      modelOutputsObserved: assurance === 'codex-chatgpt' && trials.some(t => t.answer !== null),
      plannedTrials: preflight.plannedTrials, plannedControls: preflight.plannedControls,
      comparisonCoverage: coverage(trials.filter(t => t.arm !== 'oracle-evidence')), controlCoverage: coverage(trials.filter(t => t.arm === 'oracle-evidence')),
      pairedDiagnostics, budget: budget.snapshot(), trials, phaseGate: 'Not evaluated', releaseEligible: false,
      limitations: ['DEV pipeline measurement includes Codex system context and CLI behavior, not raw Responses API parity',
        'Reported token stops are post-call and can overshoot within one invocation; no dollar or exact quota conversion',
        'Requested model/effort and CLI policy are pinned; backend model identity is not independently attested',
        'Capability flags and event auditing are not proof of absolute oracle isolation',
        'Fresh independent holdout, human calibration, frozen protocol and T14 remain open'] };
    json(path.join(options.outputRoot, 'report.json'), report); return report;
  } finally { try { exposure?.close(); } finally { budget.close(); } }
}
