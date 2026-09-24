import assert from 'node:assert/strict';
import test from 'node:test';
import { canWrite, isWithinScope, roles, type StoreKind } from '../src/foundation/permissions.js';

test('executor has no writer authority over any trusted store or another project', () => {
  const executor = { id: 'executor-1', role: 'executor' as const, projectIds: ['pilot'] };
  assert.equal(canWrite(executor, 'candidate', 'pilot'), true);
  for (const store of ['policy', 'oracle', 'evidence', 'verdict', 'promotedMemory'] as const) {
    assert.equal(canWrite(executor, store, 'pilot'), false, store);
  }
  assert.equal(canWrite(executor, 'candidate', 'other'), false);
  assert.equal(canWrite(undefined, 'candidate', 'pilot'), false);
});

test('each trusted store has one designated writer role', () => {
  const expected: Partial<Record<StoreKind, string>> = {
    policy: 'policyOwner', oracle: 'policyOwner', evidence: 'verificationRunner',
    verdict: 'gateController', promotedMemory: 'memoryPromoter',
  };
  for (const [store, writer] of Object.entries(expected)) {
    for (const role of roles) {
      assert.equal(canWrite({ id: role, role, projectIds: ['p'] }, store as StoreKind, 'p'), role === writer);
    }
  }
});

test('path scope rejects traversal, absolute paths, sibling prefixes, globs and Windows escapes', () => {
  assert.equal(isWithinScope('src/domain/change.ts', ['src']), true);
  assert.equal(isWithinScope('src', ['src']), true);
  assert.equal(isWithinScope('src-other/file', ['src']), false);
  for (const path of ['src/../policy', '/src/file', 'src//file', 'src\\file', 'C:/src/file', 'src/./file', 'src/*', 'src/\0file']) {
    assert.equal(isWithinScope(path, ['src']), false, path);
  }
  assert.equal(isWithinScope('src/file', ['.']), false);
});
