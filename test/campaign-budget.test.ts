import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { CampaignBudget } from '../src/evaluation/budget.js';
import { digest } from '../src/contracts/canonical.js';

test('shared campaign authorization cannot overspend across connections or reset by restart', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'campaign-budget-'));
  const auth = { authorizationId: 'owner:first-batch', maxCostMicros: 100, assurance: 'mock' as const };
  const a = new CampaignBudget(root, auth), b = new CampaignBudget(root, auth);
  try {
    a.reserve('one', digest('request'), 70);
    assert.throws(() => b.reserve('two', digest('other'), 31), /CAP_EXCEEDED/);
    a.settle('one', digest('request'), 50, 'receipt:one');
    b.reserve('two', digest('other'), 50);
    assert.equal(a.snapshot().chargedMicros, 100);
    assert.throws(() => new CampaignBudget(root, { ...auth, maxCostMicros: 200 }), /AUTHORIZATION_DRIFT/);
    assert.throws(() => a.reserve('one', digest('request'), 0), /NO_BLIND_RETRY/);
  } finally { a.close(); b.close(); rmSync(root, { recursive: true, force: true }); }
});

test('unknown billed usage preserves reservation and freezes later paid attempts after restart', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'campaign-budget-'));
  const auth = { authorizationId: 'owner:batch', maxCostMicros: 100, assurance: 'mock' as const };
  const a = new CampaignBudget(root, auth); a.reserve('one', digest('request'), 60);
  a.settle('one', digest('request'), null, 'timeout:unknown'); a.close();
  const b = new CampaignBudget(root, auth);
  try {
    assert.deepEqual(b.snapshot(), { capMicros: 100, chargedMicros: 60, reservedAttempts: 0, uncertainAttempts: 1, frozen: true });
    assert.throws(() => b.reserve('two', digest('new'), 1), /FROZEN/);
    assert.throws(() => b.settle('one', digest('request'), 0, 'guess'), /SETTLEMENT_INVALID/);
  } finally { b.close(); rmSync(root, { recursive: true, force: true }); }
});

test('a crashed reservation remains charged and measured overruns freeze the account', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'campaign-budget-'));
  const auth = { authorizationId: 'owner:batch', maxCostMicros: 100, assurance: 'mock' as const };
  const a = new CampaignBudget(root, auth); a.reserve('one', digest('request'), 60); a.close();
  const b = new CampaignBudget(root, auth);
  try {
    assert.equal(b.snapshot().chargedMicros, 60);
    assert.throws(() => b.reserve('two', digest('new'), 41), /CAP_EXCEEDED/);
    assert.throws(() => b.settle('one', digest('different'), 0, 'bad'), /SETTLEMENT_INVALID/);
    b.settle('one', digest('request'), 80, 'real-usage');
    assert.equal(b.snapshot().frozen, true);
    assert.equal(b.snapshot().chargedMicros, 80);
  } finally { b.close(); rmSync(root, { recursive: true, force: true }); }
});
