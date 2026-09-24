import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createContractFixtures } from '../fixtures/contracts.js';
import { canonicalJson, digest, digestOmitting } from '../src/contracts/canonical.js';
import { parseContract, schemas, type ContractName } from '../src/contracts/schemas.js';

test('all 26 contract fixtures round-trip without mutation or defaults', () => {
  const fixtures = createContractFixtures();
  assert.equal(Object.keys(schemas).length, 26);
  for (const name of Object.keys(schemas) as ContractName[]) {
    const input = fixtures[name];
    assert.deepEqual(parseContract(name, input), input, name);
    assert.deepEqual(parseContract(name, JSON.parse(canonicalJson(input))), input, name);
  }
});

test('every contract rejects wrong version and unknown fields', () => {
  const fixtures = createContractFixtures();
  for (const name of Object.keys(schemas) as ContractName[]) {
    assert.throws(() => parseContract(name, { ...fixtures[name], schemaVersion: '0.4' }), name);
    assert.throws(() => parseContract(name, { ...fixtures[name], unexplainedField: true }), name);
  }
  assert.throws(() => parseContract('ContextPacket' as ContractName, {}), /Unknown contract/);
});

test('text is preserved byte-for-byte; blank strings are rejected', () => {
  const fixture = createContractFixtures().TaskSpec;
  assert.equal(parseContract('TaskSpec', { ...fixture, goal: '  intentional spaces  ' }).goal, '  intentional spaces  ');
  assert.throws(() => parseContract('TaskSpec', { ...fixture, goal: ' \t\n' }));
});

test('method-specific checks require the right verifier and reject misleading fields', () => {
  const { CheckDefinition: def, CheckResult: result } = createContractFixtures();
  assert.ok(def.method === 'deterministic');
  assert.ok(result.method === 'deterministic');
  const { validatorRef: _validator, ...base } = def;
  assert.throws(() => parseContract('CheckDefinition', { ...base, method: 'deterministic' }));
  assert.throws(() => parseContract('CheckDefinition', { ...def, method: 'model', rubricRef: 'r', judgeConfigRef: 'j' }));
  assert.doesNotThrow(() => parseContract('CheckDefinition', { ...base, method: 'model', rubricRef: 'r', judgeConfigRef: 'j' }));
  assert.throws(() => parseContract('CheckDefinition', { ...base, method: 'model', rubricRef: 'r' }));
  assert.doesNotThrow(() => parseContract('CheckDefinition', { ...base, method: 'human', reviewerRole: 'reviewer' }));
  const { validatorRef: _resultValidator, ...resultBase } = result;
  assert.throws(() => parseContract('CheckResult', { ...resultBase, method: 'human', reviewerRole: 'reviewer' }));
  assert.doesNotThrow(() => parseContract('CheckResult', { ...resultBase, method: 'human', reviewerRole: 'reviewer', reviewRecordRef: 'review-1' }));
});

test('unknown, blocked and not-applicable are explicit and cannot masquerade as PASS', () => {
  const { CheckResult: result, GateReport: gate } = createContractFixtures();
  for (const [outcome, reasonField] of [['unknown', 'unknownReason'], ['blocked', 'blockerRef'], ['not_applicable', 'notApplicableReason']] as const) {
    assert.throws(() => parseContract('CheckResult', { ...result, outcome }));
    assert.doesNotThrow(() => parseContract('CheckResult', { ...result, outcome, [reasonField]: 'fixture reason' }));
    assert.throws(() => parseContract('CheckResult', { ...result, [reasonField]: 'fixture reason' }));
  }
  assert.throws(() => parseContract('CheckResult', { ...result, outcome: 'PASS' }));
  assert.throws(() => parseContract('CheckResult', { ...result, evidenceRefs: [] }));
  assert.throws(() => parseContract('GateReport', { ...gate, checkResults: [{ ...result, outcome: 'unknown', unknownReason: 'No observation' }] }));
  assert.throws(() => parseContract('GateReport', { ...gate, checkResults: [{ ...result, outcome: 'fail' }] }));
});

test('release method and status guards prevent invented model IDs or activation', () => {
  const policy = createContractFixtures().PolicyRelease;
  assert.throws(() => parseContract('PolicyRelease', { ...policy, status: 'draft' }));
  const { approvedBy: _actor, ...unapproved } = policy;
  assert.throws(() => parseContract('PolicyRelease', unapproved));
  assert.throws(() => parseContract('PolicyRelease', { ...policy, modelVersion: 'imagined-model' }));
  assert.throws(() => parseContract('PolicyRelease', { ...policy, checkMethods: ['model'] }));
  const { modelNotApplicableReason: _reason, ...withModel } = policy;
  assert.doesNotThrow(() => parseContract('PolicyRelease', { ...withModel, checkMethods: ['model'], modelVersion: 'fixture-model', promptHash: digest('prompt') }));
});

test('claim, operation, checkpoint and ownership retain their state distinctions', () => {
  const f = createContractFixtures();
  assert.throws(() => parseContract('Claim', { ...f.MemoryDelta.claimsAdded[0], lifecycle: 'approved' }));
  assert.throws(() => parseContract('Claim', { ...f.Claim, assertionType: 'decision' }));
  assert.throws(() => parseContract('MemoryDelta', { ...f.MemoryDelta, claimsAdded: [{ ...f.Claim, lifecycle: 'validated' }] }));
  assert.throws(() => parseContract('OperationRecord', { ...f.OperationRecord, state: 'UNKNOWN' }));
  assert.throws(() => parseContract('OperationRecord', { ...f.OperationRecord, attempts: [] }));
  assert.throws(() => parseContract('OwnershipRecord', { ...f.OwnershipRecord, state: 'released' }));
  assert.throws(() => parseContract('Checkpoint', { ...f.Checkpoint, pendingNodeIds: ['step-1'] }));
  assert.throws(() => parseContract('Checkpoint', { ...f.Checkpoint, budgetSpent: { ...f.Checkpoint.budgetSpent, tokens: 0, cost: 0 } }));
  assert.throws(() => parseContract('PlanningModeDecision', { ...f.PlanningModeDecision, mode: 'multi+synthesizer+critic' }));
});

test('hash format, null unknown profiles, and typed nested structures are enforced', () => {
  const f = createContractFixtures();
  assert.throws(() => parseContract('PlanPackage', { ...f.PlanPackage, hash: 'deadbeef' }));
  assert.throws(() => parseContract('ContextManifest', { ...f.ContextManifest, manifestDigest: `sha256:${'A'.repeat(64)}` }));
  assert.throws(() => parseContract('ProjectProfile', { ...f.ProjectProfile, editorVersion: null }));
  assert.doesNotThrow(() => parseContract('ProjectProfile', { ...f.ProjectProfile, profileKind: 'target', editorVersion: null, unknowns: ['editorVersion'] }));
  assert.throws(() => parseContract('SkillDescriptor', { ...f.SkillDescriptor, resources: [{ arbitrary: true }] }));
  assert.throws(() => parseContract('SkillDescriptor', { ...f.SkillDescriptor, resources: [...f.SkillDescriptor.resources, ...f.SkillDescriptor.resources] }));
  assert.doesNotThrow(() => parseContract('SkillBinding', { ...f.SkillBinding, policyReleaseId: null, certificationEvidenceRefs: [] }));
});

test('canonical JSON sorts object keys recursively while preserving array order and content', () => {
  assert.equal(canonicalJson({ z: 2, a: { c: 3, b: [1, 2] } }), '{"a":{"b":[1,2],"c":3},"z":2}');
  assert.equal(digest({ a: 1, b: { z: 2, c: 3 } }), digest({ b: { c: 3, z: 2 }, a: 1 }));
  assert.notEqual(digest([1, 2]), digest([2, 1]));
  assert.notEqual(digest(' x'), digest('x'));
  assert.equal(digest(null), 'sha256:74234e98afe7498fb5daf1f36ac2d78acc339464f950703b8c019892f982b90b');
  const shared = { x: 1 };
  assert.equal(canonicalJson([shared, shared]), '[{"x":1},{"x":1}]');
});

test('canonical JSON rejects values JSON.stringify would silently lose or rewrite', () => {
  const cycle: Record<string, unknown> = {};
  cycle['self'] = cycle;
  const accessor = Object.defineProperty({}, 'x', { enumerable: true, get: () => { throw new Error('Getter must not execute'); } });
  const hidden = Object.defineProperty({}, 'x', { value: 1, enumerable: false });
  const extended = Object.assign([1], { other: 2 });
  for (const value of [undefined, NaN, Infinity, -Infinity, 1n, () => 1, Symbol('s'), { x: undefined }, [undefined], new Array(1), cycle, new Date(), new Map(), accessor, hidden, extended, { [Symbol('s')]: 1 }]) {
    assert.throws(() => canonicalJson(value), TypeError);
  }
  assert.throws(() => parseContract('ToolCall', { ...createContractFixtures().ToolCall, arguments: { unknown: undefined } }));
});

test('self digest omission is exact, root-only, and detects nested or payload changes', () => {
  const original = { hash: digest('old'), a: 1, nested: { hash: 'must-remain' } };
  assert.equal(digestOmitting(original, 'hash'), digest({ a: 1, nested: { hash: 'must-remain' } }));
  assert.equal(digestOmitting(original, 'hash'), digestOmitting({ ...original, hash: digest('new') }, 'hash'));
  assert.notEqual(digestOmitting(original, 'hash'), digestOmitting({ ...original, nested: { hash: 'changed' } }, 'hash'));
  assert.throws(() => digestOmitting({ a: 1 }, 'hash'), /Missing root/);
  assert.throws(() => digestOmitting([], 'hash'));
  assert.throws(() => digestOmitting({ hash: undefined }, 'hash'));
  const f = createContractFixtures();
  assert.equal(f.PlanPackage.hash, digestOmitting(f.PlanPackage, 'hash'));
  assert.equal(f.ContextManifest.manifestDigest, digestOmitting(f.ContextManifest, 'manifestDigest'));
  assert.equal(f.ContextBundle.manifestDigest, f.ContextManifest.manifestDigest);
});
