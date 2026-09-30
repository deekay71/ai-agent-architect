import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { checkWorkflowArtifacts, parseUnityTestResults, proposeVerifiedUnityObservation, requireVerifiedUnityTests, UNITY_TASK_MANIFEST, unitySourceSnapshot, type UnityEvidence } from '../src/unity/walking-skeleton.js';
import { digest } from '../src/contracts/canonical.js';
import { MemoryStore, type MemoryNamespace } from '../src/memory/index.js';

const tasks = UNITY_TASK_MANIFEST.map(task => task.taskId);
const artifact = (tasks: readonly string[]) => ({ plan: { kind: 'checked-plan' as const, digest: digest('plan'), taskIds: tasks, criticDigest: digest('critic') },
  critic: { kind: 'critic' as const, digest: digest('critic'), approved: true, findings: [] }, execution: { kind: 'execution' as const, digest: digest('execution'), checkedPlanDigest: digest('plan'), taskIds: tasks } });

test('Unity XML must prove positive, complete, non-skipped test cases', () => {
  const xml = '<test-run><test-case result="Passed"/><test-case result="Passed"/><test-case result="Passed"/><test-case result="Passed"/><test-case result="Passed"/><test-case result="Passed"/><test-case result="Passed"/><test-case result="Passed"/><test-case result="Passed"/><test-case result="Passed"/><test-case result="Passed"/></test-run>';
  assert.deepEqual(parseUnityTestResults(xml), { total: 11, passed: 11, failed: 0, skipped: 0, inconclusive: 0 });
  assert.doesNotThrow(() => requireVerifiedUnityTests(parseUnityTestResults(xml), 11));
  assert.throws(() => requireVerifiedUnityTests(parseUnityTestResults('<test-run><test-case result="Passed"/><test-case result="Skipped"/></test-run>'), 2), /UNITY_TESTS_NOT_CLEAN/);
  assert.throws(() => parseUnityTestResults('<test-run/>'), /UNITY_TEST_XML_NO_CASES/);
});

test('only a checked single-plan critic execution chain can reach Unity', () => {
  const valid = artifact(tasks); assert.doesNotThrow(() => checkWorkflowArtifacts(valid.plan, valid.critic, valid.execution));
  assert.throws(() => checkWorkflowArtifacts(valid.plan, { ...valid.critic, approved: false }, valid.execution), /UNITY_PLAN_CRITIC_BINDING/);
  assert.throws(() => checkWorkflowArtifacts({ ...valid.plan, taskIds: tasks.slice(0, 9) }, valid.critic, valid.execution), /UNITY_TASK_FIXTURE_BINDING/);
});

test('source snapshot changes with source bytes and excludes generated output', () => {
  const project = mkdtempSync(path.join(os.tmpdir(), 'unity-snapshot-'));
  try {
    for (const directory of ['Assets', 'Packages', 'ProjectSettings', 'Library']) mkdirSync(path.join(project, directory));
    writeFileSync(path.join(project, 'Assets', 'Fixture.cs'), 'class Fixture {}');
    writeFileSync(path.join(project, 'Packages', 'manifest.json'), '{}');
    writeFileSync(path.join(project, 'ProjectSettings', 'ProjectVersion.txt'), '6000.0.84f1');
    const baseline = unitySourceSnapshot(project);
    writeFileSync(path.join(project, 'Library', 'generated.txt'), 'first generated output');
    assert.equal(unitySourceSnapshot(project), baseline);
    writeFileSync(path.join(project, 'Assets', 'Fixture.cs'), 'class Fixture { int Changed; }');
    assert.notEqual(unitySourceSnapshot(project), baseline);
  }
  finally { rmSync(project, { recursive: true, force: true }); }
});

test('verified Unity observations are proposed through Memory and await an independent critic', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'unity-memory-'));
  const namespace: MemoryNamespace = { repoId: 'unity-fixture', branchId: 'main', lineageId: 'walking-skeleton', allowedPaths: ['unity'], taskClasses: ['unity.walking-skeleton'] };
  const store = new MemoryStore(root, { namespaces: [namespace], principals: [{ id: 'executor', role: 'executor', projectIds: ['unity-fixture'] }, { id: 'verifier', role: 'verificationRunner', projectIds: ['unity-fixture'] }, { id: 'promoter', role: 'memoryPromoter', projectIds: ['unity-fixture'] }, { id: 'critic', role: 'critic', projectIds: ['unity-fixture'] }] });
  const evidence: UnityEvidence = { schemaVersion: 'unity-evidence/1', evidenceId: 'fixture', projectPath: '/fixture', unityVersion: '6000.0.84f1', unityCliVersion: '1.0.0-beta.8', sourceSnapshotDigest: digest('source'), sourceSnapshotAfterDigest: digest('source'), commandDigest: digest('command'), testXmlDigest: digest('xml'), testSummary: { total: 11, passed: 11, failed: 0, skipped: 0, inconclusive: 0 }, logDigest: digest('log'), outcome: 'pass', checkedPlanDigest: digest('plan'), executionDigest: digest('execution') };
  try { const result = proposeVerifiedUnityObservation({ store, namespace, evidence, executorId: 'executor', verifierId: 'verifier', promoterId: 'promoter', now: '2026-09-30T00:00:00.000Z' }); assert.equal(result.proposal.delta.deltaId, 'unity-delta:fixture'); assert.equal(store.getProposal(result.delta.deltaId, namespace)?.proposedBy, 'executor'); }
  finally { store.close(); rmSync(root, { recursive: true, force: true }); }
});
