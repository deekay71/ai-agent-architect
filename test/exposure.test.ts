import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { digest } from '../src/contracts/canonical.js';
import { ExposureRegistry, caseExposureFingerprint } from '../src/evaluation/exposure.js';
import { loadPublicDataset } from '../src/evaluation/dataset.js';
const task = loadPublicDataset('fixtures/semantic-benchmark').cases[0]!;
function setup(t: test.TestContext) { const root = mkdtempSync(path.join(tmpdir(), 'exposure-test-')); t.after(() => rmSync(root, { recursive: true, force: true })); return root; }
const record = { attemptId: 'attempt-1', requestDigest: digest('request'), datasetSealDigest: digest('dataset'), campaignId: 'first',
  caseId: task.id, family: task.family, contentFingerprint: caseExposureFingerprint(task), split: 'dev' as const,
  assurance: 'codex-chatgpt' as const, at: '2026-09-28T10:00:00.000Z' };
test('possible exposure survives restart, renamed IDs/family/dataset/campaign cannot recover freshness', t => {
  const root = setup(t); let registry = new ExposureRegistry(root);
  assert.equal(registry.inspect(task).reusableAsFresh, true); registry.record(record); registry.close();
  registry = new ExposureRegistry(root);
  try {
    assert.equal(registry.inspect({ ...task, id: 'renamed', family: 'renamed-family', split: 'holdout' }).reusableAsFresh, false);
    registry.record({ ...record, attemptId: 'second', campaignId: 'renamed', datasetSealDigest: digest('other-seal') });
    assert.equal(registry.inspect(task).recordedExposures, 2);
  } finally { registry.close(); }
});
test('duplicate attempt is idempotent only for identical bytes; history cannot be rewritten', t => {
  const r = new ExposureRegistry(setup(t));
  try { r.record(record); r.record(record); assert.equal(r.inspect(task).recordedExposures, 1);
    assert.throws(() => r.record({ ...record, requestDigest: digest('other') }), /ATTEMPT_DRIFT/);
    assert.equal(r.inspect(task).records[0]!.requestDigest, record.requestDigest);
  } finally { r.close(); }
});
test('same family with changed wording still records exposure; novel family is not certified independent', t => {
  const r = new ExposureRegistry(setup(t));
  try { r.record(record); assert.equal(r.inspect({ ...task, question: 'Rewritten question' }).reusableAsFresh, false);
    const unseen = r.inspect({ ...task, family: 'new', question: 'Entirely new question' });
    assert.equal(unseen.reusableAsFresh, true); assert.match(unseen.assurance, /independent provenance.*still required/);
  } finally { r.close(); }
});
test('exposure database symlink cannot redirect records', t => {
  const root = setup(t); writeFileSync(path.join(root, 'target'), 'untouched'); symlinkSync(path.join(root, 'target'), path.join(root, 'dataset-exposure.sqlite'));
  assert.throws(() => new ExposureRegistry(root), /PATH_INVALID/);
});
