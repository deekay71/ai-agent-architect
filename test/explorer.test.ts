import test from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { digest } from '../src/contracts/canonical.js';
import { asFileSnapshot, projectExplorer, createReviewProposal, type ExplorerInput, type ExplorerScope } from '../src/explorer/projection.js';
import { startExplorer } from '../src/explorer/server.js';

const scope: ExplorerScope = { repoId: 'repo:a', branchId: 'main', lineageId: 'run:a', allowedPaths: ['src'], taskClasses: ['code.review'] };
function fixture(): ExplorerInput {
  const node = (id: string, namespace: ExplorerScope): ExplorerInput['nodes'][number] => ({ id, label: id, kind: 'claim', statement: 'A scoped claim', namespace,
    revision: 'r1', contentDigest: digest(id), assertionType: 'inferred', lifecycle: 'approved', freshness: 'fresh', validity: 'valid',
    provenanceNodeIds: [id], evidenceNodeIds: [], sourceRef: null });
  return { format: 'memory-explorer-input/1', memoryVersion: 'memory:1', capturedAt: '2026-09-25T00:00:00.000Z', origin: 'snapshot',
    nodes: [node('public', scope), { ...node('stale', scope), freshness: 'stale' }, node('SECRET_PROJECT', { ...scope, repoId: 'repo:b' }),
      node('SECRET_PATH', { ...scope, allowedPaths: ['private'] }), node('SECRET_BRANCH', { ...scope, branchId: 'private' })],
    edges: [{ id: 'visible-edge', from: 'public', to: 'stale', type: 'depends_on', basis: 'explicit', provenanceNodeIds: ['public'] },
      { id: 'SECRET_EDGE', from: 'public', to: 'SECRET_PROJECT', type: 'depends_on', basis: 'explicit', provenanceNodeIds: ['SECRET_PROJECT'] }],
    traces: [] };
}
test('projection filters project/path/branch and hidden edge/provenance before serialization', () => {
  const input = fixture(); input.nodes[0]!.provenanceNodeIds.push('SECRET_PROJECT'); input.nodes[0]!.evidenceNodeIds.push('SECRET_PATH');
  const result = projectExplorer(input, scope), json = JSON.stringify(result);
  assert.equal(result.nodes.length, 2); assert.equal(result.edges.length, 1); assert.ok(!json.includes('SECRET'));
  assert.equal(result.nodes[0]!.provenanceStatus, 'unknown');
});
test('same graph pins give stable ID independent of capture time and array order', () => {
  const input = fixture(), first = projectExplorer(input, scope); input.capturedAt = '2026-09-25T01:00:00.000Z'; input.nodes.reverse(); input.edges.reverse();
  assert.equal(projectExplorer(input, scope).snapshotId, first.snapshotId);
});
test('scope cannot be empty/wildcard/traversal or widen path/class/lineage', () => {
  assert.throws(() => projectExplorer(fixture(), { ...scope, allowedPaths: [] }));
  for (const change of [{ allowedPaths: ['*'] }, { allowedPaths: ['src/../private'] }, { taskClasses: ['other'] }, { lineageId: 'run:other' }]) {
    assert.equal(projectExplorer(fixture(), { ...scope, ...change }).nodes.length, 0);
  }
});
test('approved-but-stale and inferred-but-fresh remain separate in the read model', () => {
  const projection = projectExplorer(fixture(), scope);
  assert.equal(projection.nodes.find(n => n.id === 'stale')!.lifecycle, 'approved');
  assert.equal(projection.nodes.find(n => n.id === 'stale')!.freshness, 'stale');
  assert.equal(projection.nodes.find(n => n.id === 'public')!.assertionType, 'inferred');
  assert.equal(projection.nodes.find(n => n.id === 'public')!.freshness, 'fresh');
});
test('loaded trace without matching receipt is unknown; hidden refs and labels never escape', () => {
  const input = fixture(); input.traces.push({ traceId: 't1', windowId: 'w1', agentId: 'agent:a', taskId: 'task:a', role: 'planner', namespace: scope,
    packetDigest: digest('packet'), manifestRef: 'manifest:a', manifestDigest: digest('manifest'), accounting: 'local units', entries: [
      { nodeId: 'public', ref: 'public', kind: 'evidence', revision: 'r1', expectedDigest: digest('public'), state: 'loaded', actualDigest: digest('public'), receiptRef: null, receiptDigest: null, reason: null },
      { nodeId: 'SECRET_PROJECT', ref: 'SECRET_REF', kind: 'evidence', revision: 'r1', expectedDigest: digest('private'), state: 'planned', actualDigest: null, receiptRef: null, receiptDigest: null, reason: null },
    ] });
  const result = projectExplorer(input, scope); assert.ok(!JSON.stringify(result).includes('SECRET')); assert.equal(result.traces[0]!.entries[0]!.state, 'unknown'); assert.equal(result.traces[0]!.incomplete, true);
});
test('proposal and editing exported objects cannot change canonical input or grant approval', () => {
  const input = fixture(), before = digest(input), projection = projectExplorer(input, scope);
  const proposal = createReviewProposal(projection, 'public', 'Please check against current source.');
  assert.equal(proposal.promotionAuthorized, false); assert.equal(proposal.status, 'proposed');
  assert.throws(() => createReviewProposal(projection, 'SECRET_PROJECT', 'change')); assert.throws(() => createReviewProposal(projection, 'public', ' '));
  projection.nodes[0]!.statement = 'Changed in view'; assert.equal(digest(input), before);
});
test('duplicate identities and malformed hashes fail closed', () => {
  const input = fixture(); input.nodes.push(structuredClone(input.nodes[0]!)); assert.throws(() => projectExplorer(input, scope));
  input.nodes.pop(); input.nodes[0]!.contentDigest = 'bad'; assert.throws(() => projectExplorer(input, scope));
});
test('file input cannot claim a live Memory connection', () => {
  const input = fixture(); input.origin = 'live';
  const result = projectExplorer(asFileSnapshot(input), scope);
  assert.equal(result.origin, 'snapshot'); assert.match(result.warnings[0]!, /Snapshot export/);
});
test('HTTP is loopback read-only with fixed scope, no traversal/CORS/host rebinding', async () => {
  const input = fixture(), before = digest(input), server = await startExplorer({ scope, load: () => input });
  try {
    assert.equal(new URL(server.url).hostname, '127.0.0.1');
    const response = await fetch(server.url + '/api/snapshot'); assert.equal(response.status, 200); assert.ok(!(await response.text()).includes('SECRET'));
    assert.equal(response.headers.get('access-control-allow-origin'), null); assert.match(response.headers.get('content-security-policy')!, /frame-ancestors 'none'/);
    assert.equal((await fetch(server.url + '/api/snapshot', { method: 'POST', body: '{}' })).status, 405);
    assert.equal((await fetch(server.url + '/api/snapshot?repoId=repo:b')).status, 400);
    assert.equal((await fetch(server.url + '/api/snapshot', { headers: { Origin: 'https://example.org' } })).status, 403);
    assert.equal((await fetch(server.url + '/api/snapshot', { headers: { 'Sec-Fetch-Site': 'cross-site' } })).status, 403);
    assert.equal((await fetch(server.url + '/%2e%2e/package.json')).status, 404);
    const wrongHost = await new Promise<number>(resolve => { const req = request(server.url + '/api/snapshot', { headers: { Host: 'evil.invalid' } }, res => { resolve(res.statusCode!); res.resume(); }); req.end(); }); assert.equal(wrongHost, 403);
    const app = await fetch(server.url + '/app.js'); assert.equal(app.status, 200); assert.match(await app.text(), /textContent/);
    assert.equal((await fetch(server.url, { method: 'HEAD' })).status, 200); assert.equal(digest(input), before);
  } finally { await server.close(); }
});
test('invalid snapshot errors expose neither paths nor underlying secret input', async () => {
  const server = await startExplorer({ scope, load: () => { throw new Error('/SECRET_PATH'); } });
  try { const response = await fetch(server.url + '/api/snapshot'); assert.equal(response.status, 503); assert.ok(!(await response.text()).includes('SECRET')); } finally { await server.close(); }
});
