import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { eligibleDocuments, prepareContext, selectPublicEvidence } from '../src/evaluation/context-arms.js';
import type { SemanticCase, SemanticDocument } from '../src/evaluation/dataset.js';

const task: SemanticCase = {
  id: 'public-selection-fixture', family: 'public-selection', split: 'dev',
  question: 'Where should the fragments be placed across the racks?', query: 'fragment placement rack plan',
  repoId: 'public-selection-repo', taskClass: 'operations', allowedPaths: ['public'],
  constraints: [], history: '', unknowns: [],
};
function source(id: string, text: string, distractor = false): SemanticDocument {
  return { id, revision: 'r1', repoId: task.repoId, path: `public/${id}.md`, taskClass: task.taskClass,
    lifecycle: 'active', freshness: 'fresh', text, distractor };
}

test('retrieval selects complementary public evidence from the ranked pool under the configured context budget', async () => {
  const documents = [
    source('inventory', 'Fragment placement rack plan inventory has one fragment reserved.'),
    source('placement-map', 'Proposed placement map puts three fragments in rack alpha, two in beta, and one in gamma.'),
    ...Array.from({ length: 8 }, (_, index) => source(`placeholder-${index + 1}`,
      `Fragment placement rack plan inventory placeholder ${index + 1}; rack plan tracks fragments.`, true)),
  ];
  const root = mkdtempSync(path.join(tmpdir(), 'semantic-context-selection-'));
  try {
    const prepared = await prepareContext({ root, documents, task, arm: 'retrieval', role: 'executor',
      modelConfigVersion: 'selection-fixture-v1', distractors: 8, topK: 3, trialId: 'selection-fixture' });
    assert.equal(prepared.selected.length, 3, 'the visible context budget remains topK');
    assert.ok(prepared.retrievalDiagnostics.retrieved10Ids.includes('inventory'));
    assert.ok(prepared.retrievalDiagnostics.retrieved10Ids.includes('placement-map'));
    assert.ok(prepared.selected.some(document => document.id === 'inventory'));
    assert.ok(prepared.selected.some(document => document.id === 'placement-map'));
    assert.equal(prepared.retrievalDiagnostics.selectionPolicy, 'public-critical-raw-anchor-mmr/1');
    assert.equal(prepared.retrievalDiagnostics.selectionMode, 'anchored-query-question-mmr');
    assert.equal(prepared.retrievalDiagnostics.rawAnchorCount, 2);
    assert.equal(prepared.retrievalDiagnostics.candidateIds.length, 10);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('a public critical unknown preserves the bounded lexical selection without consulting evaluator data', () => {
  const candidates = [
    source('lexical-first', 'fragment placement rack plan first'),
    source('lexical-second', 'fragment placement rack plan second'),
    source('lexical-third', 'fragment placement rack plan third'),
    source('complementary', 'placement map places three fragments in one rack'),
  ];
  const selected = selectPublicEvidence(candidates, task.query, 3, task.question, 3);
  assert.deepEqual(selected.map(document => document.id), ['lexical-first', 'lexical-second', 'lexical-third']);
});

test('anchored selection honors topK at one, two, three, and above the diagnostic pool size', () => {
  const candidates = Array.from({ length: 12 }, (_, index) => source(`candidate-${index + 1}`,
    `fragment placement rack plan candidate ${index + 1}`));
  assert.deepEqual(selectPublicEvidence(candidates, task.query, 1, task.question, 1).map(document => document.id), ['candidate-1']);
  assert.deepEqual(selectPublicEvidence(candidates, task.query, 2, task.question, 2).map(document => document.id), ['candidate-1', 'candidate-2']);
  assert.equal(selectPublicEvidence(candidates, task.query, 3, task.question, 2).length, 3);
  assert.equal(selectPublicEvidence(candidates, task.query, 11, task.question, 2).length, 11);
});

test('public selection is invariant to source identifiers and input order, and ignores out-of-scope or stale rows', () => {
  const inventory = source('inventory', 'Fragment placement rack plan inventory has one fragment reserved.');
  const placement = source('placement-map', 'Proposed placement map puts three fragments in rack alpha, two in beta, and one in gamma.');
  const placeholders = Array.from({ length: 8 }, (_, index) => source(`placeholder-${index + 1}`,
    `Fragment placement rack plan inventory placeholder ${index + 1}; rack plan tracks fragments.`, true));
  const selectedText = (documents: SemanticDocument[]) => selectPublicEvidence(documents, task.query, 3).map(document => document.text).sort();
  const baseline = selectedText([inventory, placement, ...placeholders]);
  const renamedAndReordered = [
    { ...placement, id: 'unrelated-metadata-name' }, ...[...placeholders].reverse().map((document, index) => ({ ...document, id: `noise-${index}` })),
    { ...inventory, id: 'another-unrelated-name' },
  ];
  assert.deepEqual(selectedText(renamedAndReordered), baseline);
  const stale = { ...placement, id: 'stale-placement', freshness: 'stale' as const };
  const privateSource = { ...placement, id: 'private-placement', path: 'private/placement.md' };
  const eligible = eligibleDocuments([inventory, placement, ...placeholders, stale, privateSource], task, 8);
  assert.equal(eligible.some(document => document.id === stale.id), false);
  assert.equal(eligible.some(document => document.id === privateSource.id), false);
});
