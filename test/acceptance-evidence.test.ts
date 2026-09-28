import test from 'node:test';
import assert from 'node:assert/strict';
import { assessPlannedAcceptance, isVerifiedAcceptanceEvidence, type AcceptanceOutcome } from '../src/evaluation/acceptance-evidence.js';

const cases = Array.from({ length: 10 }, (_, index) => `case-${index + 1}`);
const allowances = [64000, 80000, 160000];
const manifest = allowances.flatMap(visibleByteAllowance => cases.flatMap(caseId =>
  (['F', 'R', 'C1', 'C3', 'G'] as const).flatMap(arm => [1, 2].map(repeat => ({
    id: `${caseId}-${visibleByteAllowance}-${arm}-${repeat}`, trialId: `${caseId}-${visibleByteAllowance}-${arm}-${repeat}`,
    caseId, arm, visibleByteAllowance, repeat, compactionRounds: arm === 'C1' ? 1 : arm === 'C3' ? 3 : 0,
  })))));
const answerability = Object.fromEntries(cases.map((id, index) => [id, index < 8 ? 'answerable' : index === 8 ? 'unanswerable' : 'conflict'] as const));
const passing = (): AcceptanceOutcome[] => manifest.map(row => ({ ...row, pass: true, canonicalPreserved: true, hardGateFailure: false }));

test('finite 300-trial all-planned grid accepts one answerable case failure per stratum at 90%', () => {
  const outcomes = passing().map(row => row.caseId === 'case-1' && row.arm !== 'G' ? { ...row, pass: false } : row);
  const result = assessPlannedAcceptance(manifest, outcomes, answerability);
  assert.equal(manifest.length, 300);
  assert.equal(result.pass, true);
  assert.ok(result.strata.every(row => row.passedCases === 9));
});

test('missing repeats remain failures in the full case denominator', () => {
  const outcomes = passing().filter(row => row.trialId !== 'case-1-64000-F-2');
  const result = assessPlannedAcceptance(manifest, outcomes, answerability);
  assert.equal(result.missing, 1); assert.equal(result.strata[0]!.passedCases, 9); assert.equal(result.strata[0]!.successRate, 0.9);
  const missingTwoCases = outcomes.filter(row => row.trialId !== 'case-2-64000-F-2');
  assert.equal(assessPlannedAcceptance(manifest, missingTwoCases, answerability).pass, false);
});

test('wrong allowance, duplicate, and extra outcome rows fail closed', () => {
  const rows = passing();
  assert.throws(() => assessPlannedAcceptance(manifest, [{ ...rows[0]!, visibleByteAllowance: 1 }, ...rows.slice(1)], answerability), /ACCEPTANCE_OUTCOME_COVERAGE/);
  assert.throws(() => assessPlannedAcceptance(manifest, [rows[0]!, rows[0]!, ...rows.slice(1)], answerability), /ACCEPTANCE_OUTCOME_COVERAGE/);
  assert.throws(() => assessPlannedAcceptance(manifest, [...rows, { ...rows[0]!, trialId: 'extra' }], answerability), /ACCEPTANCE_OUTCOME_COVERAGE/);
});

test('a required abstention failure blocks acceptance even where the stratum remains at 90%', () => {
  const outcomes = passing().map(row => row.caseId === 'case-9' && row.arm !== 'G' ? { ...row, pass: false } : row);
  const result = assessPlannedAcceptance(manifest, outcomes, answerability);
  assert.equal(result.strata[0]!.successRate, 0.9); assert.equal(result.pass, false);
});

test('G hard-gate violations fail acceptance without changing the main quality numerator', () => {
  const outcomes = passing().map(row => row.arm === 'G' ? { ...row, pass: false, canonicalPreserved: false, hardGateFailure: true } : row);
  const result = assessPlannedAcceptance(manifest, outcomes, answerability);
  assert.equal(result.controlsPassed, 0); assert.equal(result.hardGateFailures, 60); assert.equal(result.mainPassed, 240); assert.equal(result.pass, false);
  const ordinaryQualityFailures = passing().map(row => row.arm === 'G' ? { ...row, pass: false } : row);
  assert.equal(assessPlannedAcceptance(manifest, ordinaryQualityFailures, answerability).pass, true);
});

test('empty plans and unbranded values cannot be treated as accepted evidence', () => {
  assert.throws(() => assessPlannedAcceptance([], [], {}), /ACCEPTANCE_OUTCOME_COVERAGE/);
  assert.equal(isVerifiedAcceptanceEvidence(null), false);
  assert.equal(isVerifiedAcceptanceEvidence({ gate: 'PASS' }), false);
});
