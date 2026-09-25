import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, readdirSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { digest } from '../src/contracts/canonical.js';
import { SubscriptionBudget, type SubscriptionAuthorization } from '../src/evaluation/subscription-budget.js';

const auth: SubscriptionAuthorization = { authorizationId: 'owner:subscription-smoke', maxInvocations: 3, maxReportedTokens: 100, maxWallTimeMs: 1000 };
const request = digest({ task: 'reader' });
const moduleUrl = new URL('../src/evaluation/subscription-budget.js', import.meta.url).href;
function fixture(): string { return mkdtempSync(path.join(tmpdir(), 'subscription-budget-')); }

test('exact invocation allowance remains spent across campaign restarts with the same authorization', () => {
  const root = fixture();
  let now = 100;
  const first = new SubscriptionBudget(root, auth, { now: () => now });
  const id = first.reserve(request); first.settle(id, 10); first.close();
  now = 200;
  const second = new SubscriptionBudget(root, { ...auth }, { now: () => now });
  try {
    assert.equal(second.snapshot().startedAt, 100);
    assert.equal(second.snapshot().deadlineAt, 1100);
    assert.equal(second.snapshot().timeRemainingMs, 900);
    for (let i = 0; i < 2; i += 1) second.settle(second.reserve(request), 10);
    assert.equal(second.snapshot().usedInvocations, 3);
    assert.equal(second.snapshot().reportedTokens, 30);
    assert.equal(second.snapshot().stopReason, 'invocation-limit');
    assert.throws(() => second.reserve(request), /invocation-limit/);
    assert.equal(second.snapshot().usedInvocations, 3);
  } finally { second.close(); rmSync(root, { recursive: true, force: true }); }
});

test('tokens are a post-call threshold: one call can overshoot, is fully charged, and prevents another call', () => {
  const root = fixture(); const ledger = new SubscriptionBudget(root, auth);
  try {
    ledger.settle(ledger.reserve(request), 70);
    ledger.settle(ledger.reserve(request), 80);
    assert.equal(ledger.snapshot().reportedTokens, 150);
    assert.equal(ledger.snapshot().usedInvocations, 2);
    assert.equal(ledger.snapshot().stopReason, 'reported-token-limit');
    assert.equal(ledger.snapshot().frozen, false);
    assert.throws(() => ledger.reserve(request), /reported-token-limit/);
  } finally { ledger.close(); rmSync(root, { recursive: true, force: true }); }
});

test('known incomplete usage is charged and unknown interrupted usage freezes the authorization durably', () => {
  const root = fixture(); const first = new SubscriptionBudget(root, auth);
  first.settle(first.reserve(request), 25);
  const unknownId = first.reserve(digest('interrupted'));
  first.markUnknown(unknownId, 'CLI exited before emitting trustworthy usage');
  assert.equal(first.snapshot().reportedTokens, 25);
  assert.equal(first.snapshot().usedInvocations, 2);
  assert.equal(first.snapshot().unknownAttempts, 1);
  assert.equal(first.snapshot().frozen, true);
  first.close();
  const second = new SubscriptionBudget(root, auth);
  try {
    assert.equal(second.snapshot().stopReason, 'unknown-usage');
    assert.throws(() => second.reserve(request), /unknown-usage/);
    assert.throws(() => second.settle(unknownId, 0), /SETTLEMENT_INVALID/);
    assert.equal(second.snapshot().reportedTokens, 25);
  } finally { second.close(); rmSync(root, { recursive: true, force: true }); }
});

test('the deadline starts once and cannot be extended by restart or by moving the clock backward', () => {
  const root = fixture(); let now = 100;
  const first = new SubscriptionBudget(root, auth, { now: () => now });
  now = 700; assert.equal(first.snapshot().timeRemainingMs, 400);
  now = 300; assert.equal(first.snapshot().timeRemainingMs, 400);
  first.close();
  const second = new SubscriptionBudget(root, auth, { now: () => now });
  try {
    assert.equal(second.snapshot().timeRemainingMs, 400);
    now = 1100;
    assert.equal(second.snapshot().timeRemainingMs, 0);
    assert.equal(second.snapshot().stopReason, 'wall-time-limit');
    assert.throws(() => second.reserve(request), /wall-time-limit/);
    assert.equal(second.snapshot().usedInvocations, 0);
  } finally { second.close(); rmSync(root, { recursive: true, force: true }); }
});

test('refused admission persists the expired time even when the clock subsequently moves backward', () => {
  const root = fixture(); let now = 100;
  const first = new SubscriptionBudget(root, auth, { now: () => now });
  now = 1100;
  assert.throws(() => first.reserve(request), /wall-time-limit/);
  first.close(); now = 300;
  const second = new SubscriptionBudget(root, auth, { now: () => now });
  try {
    assert.equal(second.snapshot().timeRemainingMs, 0);
    assert.throws(() => second.reserve(request), /wall-time-limit/);
    assert.equal(second.snapshot().usedInvocations, 0);
  } finally { second.close(); rmSync(root, { recursive: true, force: true }); }
});

test('authorization limits are pinned to the ID and a rejected config cannot damage the original ledger', () => {
  const root = fixture(); const first = new SubscriptionBudget(root, auth);
  first.settle(first.reserve(request), 5); first.close();
  for (const field of ['maxInvocations', 'maxReportedTokens', 'maxWallTimeMs'] as const) {
    assert.throws(() => new SubscriptionBudget(root, { ...auth, [field]: auth[field] + 1 }), /AUTHORIZATION_DRIFT/);
  }
  const second = new SubscriptionBudget(root, auth);
  try { assert.equal(second.snapshot().usedInvocations, 1); assert.equal(second.snapshot().reportedTokens, 5); }
  finally { second.close(); rmSync(root, { recursive: true, force: true }); }
});

test('only one owner can use an authorization, within this process or another process', () => {
  const root = fixture(); const ledger = new SubscriptionBudget(root, auth);
  try {
    assert.throws(() => new SubscriptionBudget(root, auth), /OWNERSHIP_ACTIVE/);
    const child = spawnSync(process.execPath, ['--input-type=module', '-e', `
      import { SubscriptionBudget } from ${JSON.stringify(moduleUrl)};
      try { new SubscriptionBudget(${JSON.stringify(root)}, ${JSON.stringify(auth)}); process.exitCode = 1; }
      catch(error) { if (!error.message.includes('OWNERSHIP_ACTIVE')) throw error; }
    `], { timeout: 5000, encoding: 'utf8' });
    assert.equal(child.status, 0, child.stderr);
    ledger.settle(ledger.reserve(request), 1);
    assert.equal(ledger.snapshot().usedInvocations, 1);
  } finally { ledger.close(); rmSync(root, { recursive: true, force: true }); }
});

test('a process crash releases ownership but leaves the attempted invocation unknown, never free to retry', async () => {
  const root = fixture();
  const child = spawn(process.execPath, ['--input-type=module', '-e', `
    import { SubscriptionBudget } from ${JSON.stringify(moduleUrl)};
    const ledger = new SubscriptionBudget(${JSON.stringify(root)}, ${JSON.stringify(auth)});
    ledger.reserve(${JSON.stringify(request)});
    process.send({ ready: true });
    setInterval(() => {}, 1000);
  `], { stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
  try {
    await once(child, 'message', { signal: AbortSignal.timeout(5000) });
    const exit = once(child, 'exit'); child.kill('SIGKILL'); await exit;
    const recovered = new SubscriptionBudget(root, auth);
    try {
      assert.equal(recovered.snapshot().usedInvocations, 1);
      assert.equal(recovered.snapshot().unknownAttempts, 1);
      assert.equal(recovered.snapshot().reportedTokens, 0);
      assert.equal(recovered.snapshot().stopReason, 'unknown-usage');
      assert.throws(() => recovered.reserve(request), /unknown-usage/);
    } finally { recovered.close(); }
  } finally { child.kill('SIGKILL'); rmSync(root, { recursive: true, force: true }); }
});

test('an unsettled invocation blocks a second invocation and close freezes rather than cancels it', () => {
  const root = fixture(); const first = new SubscriptionBudget(root, auth);
  const id = first.reserve(request);
  assert.equal(first.snapshot().stopReason, 'pending-attempt');
  assert.throws(() => first.reserve(request), /pending-attempt/);
  first.close(); first.close();
  assert.throws(() => first.snapshot(), /BUDGET_CLOSED/);
  const second = new SubscriptionBudget(root, auth);
  try {
    assert.equal(second.snapshot().unknownAttempts, 1);
    assert.equal(second.snapshot().usedInvocations, 1);
    assert.throws(() => second.settle(id, 0), /SETTLEMENT_INVALID/);
  } finally { second.close(); rmSync(root, { recursive: true, force: true }); }
});

test('invalid limits, digests, usage, unknown reasons and repeated settlement do not silently change accounting', () => {
  const root = fixture();
  for (const invalid of [NaN, Infinity, -1, 0, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    for (const field of ['maxInvocations', 'maxReportedTokens', 'maxWallTimeMs'] as const) {
      assert.throws(() => new SubscriptionBudget(root, { ...auth, [field]: invalid }), /AUTHORIZATION_INVALID/);
    }
  }
  assert.throws(() => new SubscriptionBudget(root, { ...auth, authorizationId: ' ' }), /AUTHORIZATION_INVALID/);
  assert.throws(() => new SubscriptionBudget(root, auth, { now: () => NaN }), /CLOCK_INVALID/);
  assert.throws(() => new SubscriptionBudget(root, auth, { now: () => Number.MAX_SAFE_INTEGER }), /DEADLINE_INVALID/);
  const ledger = new SubscriptionBudget(root, auth);
  try {
    assert.throws(() => ledger.reserve('sha256:invalid'), /REQUEST_DIGEST_INVALID/);
    assert.equal(ledger.snapshot().usedInvocations, 0);
    const id = ledger.reserve(request);
    for (const invalid of [NaN, Infinity, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) assert.throws(() => ledger.settle(id, invalid), /USAGE_INVALID/);
    assert.throws(() => ledger.settle('other-attempt', 1), /SETTLEMENT_INVALID/);
    assert.throws(() => ledger.markUnknown(id, ''), /UNKNOWN_REASON_INVALID/);
    ledger.settle(id, 0);
    assert.equal(ledger.snapshot().reportedTokens, 0);
    assert.equal(ledger.snapshot().usedInvocations, 1);
    assert.throws(() => ledger.settle(id, 5), /SETTLEMENT_INVALID/);
    assert.throws(() => ledger.markUnknown(id, 'late change'), /SETTLEMENT_INVALID/);
    assert.equal(ledger.snapshot().unknownAttempts, 0);
  } finally { ledger.close(); rmSync(root, { recursive: true, force: true }); }
});

test('the authorization ledger cannot be replaced by a symlink', () => {
  const root = fixture(); const outside = fixture(); const ledger = new SubscriptionBudget(root, auth); ledger.close();
  const filename = readdirSync(root).find(name => name.endsWith('.sqlite') && !name.endsWith('-owner.sqlite'))!;
  rmSync(path.join(root, filename));
  symlinkSync(path.join(outside, 'missing.sqlite'), path.join(root, filename));
  try {
    assert.throws(() => new SubscriptionBudget(root, auth), /PATH_INVALID/);
    assert.deepEqual(readdirSync(outside), []);
  } finally { rmSync(root, { recursive: true, force: true }); rmSync(outside, { recursive: true, force: true }); }
});

test('operator-attested non-dispatch recovery persists evidence without refunding an invocation or renewing the deadline', () => {
  const root = fixture(); let now = 100;
  const first = new SubscriptionBudget(root, auth, { now: () => now });
  const id = first.reserve(request); first.markUnknown(id, 'configuration parse failed before model dispatch'); first.close();
  now = 400;
  const recovered = new SubscriptionBudget(root, auth, { now: () => now });
  const evidence = digest({ kind: 'operator-attestation', diagnostic: 'offline pre-dispatch configuration failure' });
  recovered.reconcileNotDispatched(id, evidence);
  assert.equal(recovered.snapshot().usedInvocations, 1);
  assert.equal(recovered.snapshot().unknownAttempts, 0); assert.equal(recovered.snapshot().notDispatchedAttempts, 1);
  assert.deepEqual(recovered.snapshot().reconciliationEvidenceDigests, [evidence]);
  assert.equal(recovered.snapshot().reportedTokens, 0); assert.equal(recovered.snapshot().frozen, false);
  assert.equal(recovered.snapshot().startedAt, 100); assert.equal(recovered.snapshot().deadlineAt, 1100);
  assert.equal(recovered.snapshot().timeRemainingMs, 700);
  assert.throws(() => recovered.reconcileNotDispatched(id, evidence), /RECONCILIATION_INVALID/);
  assert.throws(() => recovered.settle(id, 0), /SETTLEMENT_INVALID/);
  recovered.close();
  const ledgerFile = readdirSync(root).find(name => name.endsWith('.sqlite') && !name.endsWith('-owner.sqlite'))!;
  const inspection = new DatabaseSync(path.join(root, ledgerFile));
  const row = inspection.prepare('SELECT state,request_digest,unknown_reason,reconciliation_evidence_digest FROM attempts WHERE id=?').get(id)!;
  assert.equal(row.state, 'not-dispatched'); assert.equal(row.request_digest, request);
  assert.equal(row.reconciliation_evidence_digest, evidence); assert.match(String(row.unknown_reason), /configuration parse failed/);
  inspection.close();
  const second = new SubscriptionBudget(root, auth, { now: () => now });
  try {
    second.settle(second.reserve(request), 10); second.settle(second.reserve(request), 10);
    assert.equal(second.snapshot().usedInvocations, 3); assert.equal(second.snapshot().notDispatchedAttempts, 1);
    assert.equal(second.snapshot().reportedTokens, 20); assert.equal(second.snapshot().stopReason, 'invocation-limit');
    assert.throws(() => second.reserve(request), /invocation-limit/);
  } finally { second.close(); rmSync(root, { recursive: true, force: true }); }
});

test('reconciliation cannot rewrite pending or known usage, reopen exhausted time, or reuse an evidence-less recovery', () => {
  const root = fixture(); let now = 100;
  const ledger = new SubscriptionBudget(root, auth, { now: () => now });
  try {
    const known = ledger.reserve(request);
    assert.throws(() => ledger.reconcileNotDispatched(known, digest('operator-evidence')), /RECONCILIATION_INVALID/);
    ledger.settle(known, 20);
    assert.throws(() => ledger.reconcileNotDispatched(known, digest('operator-evidence')), /RECONCILIATION_INVALID/);
    const unknown = ledger.reserve(request); ledger.markUnknown(unknown, 'pre-dispatch failure');
    assert.throws(() => ledger.reconcileNotDispatched(unknown, 'missing-proof'), /RECONCILIATION_EVIDENCE_INVALID/);
    assert.equal(ledger.snapshot().frozen, true);
    now = 1200; ledger.reconcileNotDispatched(unknown, digest('operator-evidence'));
    assert.equal(ledger.snapshot().reportedTokens, 20); assert.equal(ledger.snapshot().usedInvocations, 2);
    assert.equal(ledger.snapshot().timeRemainingMs, 0); assert.equal(ledger.snapshot().stopReason, 'wall-time-limit');
    assert.throws(() => ledger.reserve(request), /wall-time-limit/);
  } finally { ledger.close(); rmSync(root, { recursive: true, force: true }); }
});

test('adding reconciliation to an existing ledger preserves its frozen attempts and authorization', () => {
  const root = fixture();
  const first = new SubscriptionBudget(root, auth, { now: () => 100 });
  const id = first.reserve(request); first.markUnknown(id, 'legacy pre-dispatch failure'); first.close();
  const ledgerFile = readdirSync(root).find(name => name.endsWith('.sqlite') && !name.endsWith('-owner.sqlite'))!;
  const legacy = new DatabaseSync(path.join(root, ledgerFile));
  legacy.exec('ALTER TABLE attempts DROP COLUMN reconciliation_evidence_digest'); legacy.close();
  const migrated = new SubscriptionBudget(root, auth, { now: () => 400 });
  try {
    assert.equal(migrated.snapshot().usedInvocations, 1); assert.equal(migrated.snapshot().frozen, true);
    assert.equal(migrated.snapshot().startedAt, 100); assert.equal(migrated.snapshot().deadlineAt, 1100);
    migrated.reconcileNotDispatched(id, digest('legacy diagnostic operator attestation'));
    assert.equal(migrated.snapshot().notDispatchedAttempts, 1); assert.equal(migrated.snapshot().usedInvocations, 1);
    assert.equal(migrated.snapshot().timeRemainingMs, 700);
  } finally { migrated.close(); rmSync(root, { recursive: true, force: true }); }
});
