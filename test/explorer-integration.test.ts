import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createMemoryExplorerFixture } from '../fixtures/memory-explorer.js';
import { createReviewProposal, projectExplorer } from '../src/explorer/projection.js';
import { digest } from '../src/contracts/canonical.js';
import { explorerInput } from '../src/explorer/adapters.js';

test('real Memory → Context → Explorer shows selective staleness, compaction pins and isolated windows', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'explorer-integration-'));
  try {
    const fixture = await createMemoryExplorerFixture(path.join(directory, 'canonical'));
    const projection = projectExplorer(fixture.input, fixture.namespace, fixture.windows);
    assert.ok(!JSON.stringify(projection).includes('SECRET_OTHER_PROJECT'));
    const receipt = projection.nodes.find(n => n.label === 'Receipt của adapter r1')!;
    const independent = projection.nodes.find(n => n.label === 'Skill vẫn cần gate')!;
    assert.equal(receipt.lifecycle, 'approved'); assert.equal(receipt.freshness, 'stale'); assert.equal(receipt.validity, 'invalid');
    assert.equal(independent.assertionType, 'inferred'); assert.equal(independent.freshness, 'fresh'); assert.equal(independent.validity, 'valid');
    assert.equal(projection.nodes.find(n => n.kind === 'plan')!.validity, 'invalid');
    assert.equal(projection.nodes.find(n => n.kind === 'handoff')!.validity, 'invalid');
    assert.equal(fixture.report.compaction.constraintsPreserved, true);
    assert.ok(fixture.report.compaction.after < fixture.report.compaction.before);
    assert.deepEqual(fixture.report.windows.map(w => w.currentValidation.status), ['blocked', 'blocked', 'ready']);
    assert.equal(projection.traces.length, 3);
    assert.ok(projectExplorer(fixture.input, fixture.namespace).traces.every(t => t.entries.every(e => e.state === 'unknown')));
    for (const trace of projection.traces) {
      const window = fixture.windows.find(w => w.packet.windowId === trace.windowId)!;
      assert.equal(trace.manifestDigest, window.packet.manifest.manifestDigest); assert.equal(trace.packetDigest, window.packetDigest);
      for (const entry of trace.entries) { assert.equal(entry.state, 'loaded'); assert.ok(entry.receiptRef); assert.ok(entry.receiptDigest); assert.equal(entry.actualDigest, entry.expectedDigest); }
    }
    assert.notDeepEqual(projection.traces[0]!.entries.map(e => e.ref), projection.traces[1]!.entries.map(e => e.ref));
    assert.equal(new Set(projection.edges.map(e => digest([e.from, e.to, e.type, e.basis]))).size, projection.edges.length);
    const db = path.join(directory, 'canonical', 'memory.db'), before = await readFile(db);
    const proposal = createReviewProposal(projection, receipt.id, 'Cần kiểm tra lại adapter r2 trước khi bàn giao.');
    await writeFile(path.join(directory, 'proposal.json'), JSON.stringify(proposal)); projection.nodes[0]!.statement = 'User edits disposable export';
    await writeFile(path.join(directory, 'view.json'), JSON.stringify(projection));
    assert.deepEqual(await readFile(db), before); assert.equal(proposal.promotionAuthorized, false);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('read-model adapter rejects a forged loaded receipt even with recomputed outer hashes', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'explorer-receipt-'));
  try {
    const fixture = await createMemoryExplorerFixture(path.join(directory, 'canonical')), window = structuredClone(fixture.windows[0]!);
    window.packet.loadReceipts[0]!.contentHash = digest('fake');
    window.packetDigest = digest(window.packet);
    const { windowDigest: _old, ...body } = window; window.windowDigest = digest(body);
    const memory = { schemaVersion: 'memory-snapshot/1' as const, namespace: fixture.namespace, memoryVersion: 'memory:1', generatedAt: fixture.input.capturedAt,
      nodes: [], edges: [], digest: digest('unused') };
    assert.throws(() => explorerInput(memory, [window]), /TRACE_RECEIPT/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
