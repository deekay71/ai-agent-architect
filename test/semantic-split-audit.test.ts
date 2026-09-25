import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import test from 'node:test';
import { digest, digestOmitting } from '../src/contracts/canonical.js';
import { loadPublicDataset, sealDataset, verifyDatasetSeal, type SemanticCase, type SemanticGold } from '../src/evaluation/dataset.js';
import { auditSemanticSplits } from '../src/evaluation/split-audit.js';

const fixture = resolve('fixtures/semantic-benchmark');
function copyDataset(t: { after: (fn: () => void) => void }): string {
  const root = mkdtempSync(resolve(tmpdir(), 'semantic-split-audit-'));
  cpSync(fixture, root, { recursive: true });
  rmSync(resolve(root, 'dataset.lock.json'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}
function writeJson(root: string, path: string, value: unknown): void {
  writeFileSync(resolve(root, path), JSON.stringify(value));
}
function duplicateScenario(root: string, edit: (dev: SemanticCase, holdout: SemanticCase) => void = () => {}): void {
  const { cases } = loadPublicDataset(root);
  const dev = cases.find(c => c.split === 'dev')!, index = cases.findIndex(c => c.split === 'holdout'), previous = cases[index]!;
  const holdout = { ...structuredClone(dev), id: previous.id, family: 'renamed-independent-family', split: 'holdout' as const };
  edit(dev, holdout); cases[index] = holdout;
  writeJson(root, 'public/cases.json', cases);
  // Evaluator-only fixture manipulation; no answer text is included in diagnostics or reader inputs.
  const gold: SemanticGold[] = JSON.parse(readFileSync(resolve(root, 'evaluator/oracle.json'), 'utf8'));
  gold[gold.findIndex(g => g.caseId === previous.id)] = { ...structuredClone(gold.find(g => g.caseId === dev.id)!), caseId: previous.id };
  writeJson(root, 'evaluator/oracle.json', gold);
}

test('split audit validates current and archived candidates without modifying immutable seals', () => {
  for (const [root, expectedSeal] of [
    [fixture, 'sha256:be327cca08b882f0c45669cf5cff38f5009dd26a89cb2c46b39dcc2302250008'],
    [resolve('fixtures/semantic-benchmark-candidates/r0'), 'sha256:d70cabc064ef483982f33be1a0dad682053fec589343ed4bfcd935672713551d'],
  ] as const) {
    const sealBytes = readFileSync(resolve(root, 'dataset.lock.json'));
    const data = loadPublicDataset(root), audit = data.splitAudit;
    assert.equal(audit.status, 'clear');
    assert.equal(audit.comparedPairs, 200);
    assert.equal(audit.humanSemanticReviewRequired, true);
    assert.equal(audit.publicCaseDigest, digest(data.cases));
    assert.equal(audit.auditDigest, digestOmitting(audit, 'auditDigest'));
    assert.deepEqual(auditSemanticSplits(data.cases), audit);
    assert.equal(verifyDatasetSeal(root), expectedSeal);
    assert.deepEqual(readFileSync(resolve(root, 'dataset.lock.json')), sealBytes);
  }
});

test('renaming case IDs and family labels cannot seal a dev scenario copied into holdout', t => {
  const root = copyDataset(t);
  duplicateScenario(root);
  assert.throws(() => loadPublicDataset(root), /scenario content leakage.*exact-clone/);
  assert.throws(() => sealDataset(root), /scenario content leakage.*exact-clone/);
  assert.equal(existsSync(resolve(root, 'dataset.lock.json')), false);
});

test('Unicode width, case, punctuation and whitespace changes cannot hide a cross-split clone', t => {
  const root = copyDataset(t);
  duplicateScenario(root, (_dev, held) => {
    held.question = `  ${held.question.toUpperCase().replace('CI', 'ＣＩ').replaceAll(' ', ' — ')}!!! `;
    held.history = held.history.toUpperCase().replaceAll(' ', '\n\t');
  });
  assert.throws(() => sealDataset(root), /scenario content leakage.*exact-clone/);
});

test('small wording edits are rejected with unchanged or empty history', t => {
  for (const emptyHistory of [false, true]) {
    const root = copyDataset(t);
    duplicateScenario(root, (dev, held) => {
      held.question = held.question.replace('use?', 'select?');
      if (emptyHistory) { dev.history = ''; held.history = ''; }
    });
    assert.throws(() => sealDataset(root), /scenario content leakage.*near-clone/);
  }
});

test('a longer near-copy with empty history is caught independently of query and constraints', t => {
  const root = copyDataset(t);
  duplicateScenario(root, (dev, held) => {
    dev.question = 'Which scoped credential should the continuous integration release worker use for the signed build publication job?';
    held.question = 'Which scoped credential should the continuous integration release worker use for the signed build publication task?!';
    dev.history = ''; held.history = '';
    held.query = 'totally changed lookup phrase';
    held.constraints = held.constraints.map(c => ({ ...c, id: `${c.id}-renamed`, description: 'Different generic public constraint.' }));
  });
  // The public boundary rejects the scenario before evaluator constraint validation is relevant.
  assert.throws(() => loadPublicDataset(root), /scenario content leakage.*near-clone/);
});

test('shared constraints, query and history boilerplate do not reject different scenarios', () => {
  const { cases } = loadPublicDataset(fixture), dev = structuredClone(cases.find(c => c.split === 'dev')!);
  const held = structuredClone(cases.find(c => c.split === 'holdout')!);
  held.query = dev.query; held.constraints = structuredClone(dev.constraints); held.history = dev.history;
  const audit = auditSemanticSplits([dev, held]);
  assert.equal(audit.status, 'clear'); assert.deepEqual(audit.suspectedPairs, []);
});

test('broader lexical overlap is reported for manual review rather than certified or rejected', () => {
  const dev = structuredClone(loadPublicDataset(fixture).cases.find(c => c.split === 'dev')!);
  const held = { ...structuredClone(dev), id: 'holdout-reworded', family: 'unrelated-name', split: 'holdout' as const,
    question: dev.question.replace('should', 'must').replace('use?', 'select?') };
  const audit = auditSemanticSplits([dev, held]);
  assert.equal(audit.status, 'review-required');
  assert.equal(audit.suspectedPairs[0]?.classification, 'semantic-review');
  assert.equal(audit.humanSemanticReviewRequired, true);
  const serialized = JSON.stringify(audit);
  assert.equal(serialized.includes(dev.question), false, 'Diagnostics must not contain question or answer prose');
  assert.equal(serialized.includes(dev.history), false);
  assert.notEqual(audit.auditDigest, auditSemanticSplits([dev, { ...held, question: `${held.question} Revised.` }]).auditDigest);
});

test('public-only loading exposes the audit and rejects clones without evaluator bytes', t => {
  const clean = copyDataset(t); sealDataset(clean);
  rmSync(resolve(clean, 'evaluator'), { recursive: true });
  assert.equal(loadPublicDataset(clean).splitAudit.status, 'clear');
  const cloned = copyDataset(t); duplicateScenario(cloned);
  rmSync(resolve(cloned, 'evaluator'), { recursive: true });
  assert.throws(() => loadPublicDataset(cloned), /scenario content leakage/);
});
