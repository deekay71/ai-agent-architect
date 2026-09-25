import { randomUUID } from 'node:crypto';
import { chmodSync, lstatSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { digest } from '../contracts/canonical.js';

export interface SubscriptionAuthorization {
  authorizationId: string;
  maxInvocations: number;
  maxReportedTokens: number;
  maxWallTimeMs: number;
}

export type SubscriptionStopReason = 'unknown-usage' | 'invocation-limit' | 'reported-token-limit' | 'wall-time-limit' | 'pending-attempt' | null;

export interface SubscriptionBudgetSnapshot extends SubscriptionAuthorization {
  usedInvocations: number;
  reportedTokens: number;
  pendingAttempts: number;
  unknownAttempts: number;
  notDispatchedAttempts: number;
  /** Operator attestations; these hashes are audit references, not provider proofs. */
  reconciliationEvidenceDigests: string[];
  frozen: boolean;
  stopReason: SubscriptionStopReason;
  startedAt: number;
  deadlineAt: number;
  timeRemainingMs: number;
}

const nonnegative = (value: number): boolean => Number.isSafeInteger(value) && value >= 0;
const positive = (value: number): boolean => nonnegative(value) && value > 0;
const requestDigestPattern = /^sha256:[a-f0-9]{64}$/;

/**
 * Subscription accounting, not a monetary budget or an exact token reservation.
 * Use one stable root across campaigns. The authorization ID selects its ledger;
 * changing a campaign name cannot reset attempts, usage, or the original deadline.
 * A reported-token limit is checked after a call and can be exceeded by that call.
 */
export class SubscriptionBudget {
  private readonly db: DatabaseSync;
  private readonly ownership: DatabaseSync;
  private readonly authorization: SubscriptionAuthorization;
  private readonly now: () => number;
  private closed = false;

  constructor(root: string, authorization: SubscriptionAuthorization, options: { now?: () => number } = {}) {
    if (typeof authorization.authorizationId !== 'string' || !authorization.authorizationId.trim()
      || authorization.authorizationId.length > 512 || !positive(authorization.maxInvocations)
      || !positive(authorization.maxReportedTokens) || !positive(authorization.maxWallTimeMs)) {
      throw new Error('SUBSCRIPTION_AUTHORIZATION_INVALID');
    }
    this.authorization = {
      authorizationId: authorization.authorizationId, maxInvocations: authorization.maxInvocations,
      maxReportedTokens: authorization.maxReportedTokens, maxWallTimeMs: authorization.maxWallTimeMs,
    };
    this.now = options.now ?? Date.now;
    const initialNow = this.readClock();
    if (!nonnegative(initialNow + authorization.maxWallTimeMs)) throw new Error('SUBSCRIPTION_DEADLINE_INVALID');
    mkdirSync(root, { recursive: true, mode: 0o700 });
    if (!lstatSync(root).isDirectory() || lstatSync(root).isSymbolicLink()) throw new Error('SUBSCRIPTION_PATH_INVALID');
    chmodSync(root, 0o700);
    const key = digest(authorization.authorizationId).slice('sha256:'.length);
    const file = path.join(root, `subscription-${key}.sqlite`);
    const ownershipFile = path.join(root, `subscription-${key}-owner.sqlite`);
    this.validateFile(file); this.validateFile(ownershipFile);
    this.ownership = new DatabaseSync(ownershipFile);
    try {
      chmodSync(ownershipFile, 0o600);
      // A held OS-backed SQLite lock releases on process death. PID reuse cannot
      // steal ownership, and a second connection in this process is also rejected.
      this.ownership.exec('PRAGMA busy_timeout=0; BEGIN EXCLUSIVE');
    } catch {
      this.ownership.close();
      throw new Error('SUBSCRIPTION_OWNERSHIP_ACTIVE');
    }
    let opened: DatabaseSync | undefined;
    try {
      opened = new DatabaseSync(file);
      this.db = opened;
      chmodSync(file, 0o600);
      this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;
        CREATE TABLE IF NOT EXISTS config (
          id INTEGER PRIMARY KEY CHECK(id=1), authorization_digest TEXT NOT NULL,
          started_at INTEGER NOT NULL, deadline_at INTEGER NOT NULL, last_observed_at INTEGER NOT NULL,
          frozen INTEGER NOT NULL DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS attempts (
          id TEXT PRIMARY KEY, request_digest TEXT NOT NULL, state TEXT NOT NULL,
          reported_tokens INTEGER NOT NULL DEFAULT 0, unknown_reason TEXT,
          reconciliation_evidence_digest TEXT
        );`);
      // Existing authorizations retain their original configuration and deadline.
      // The exclusive ownership lock also serializes this additive migration.
      if (!this.db.prepare('PRAGMA table_info(attempts)').all().some(column => column.name === 'reconciliation_evidence_digest')) {
        this.db.exec('ALTER TABLE attempts ADD COLUMN reconciliation_evidence_digest TEXT');
      }
      this.transaction(() => {
        const previous = this.db.prepare('SELECT * FROM config WHERE id=1').get();
        if (previous && previous.authorization_digest !== digest(this.authorization)) throw new Error('SUBSCRIPTION_AUTHORIZATION_DRIFT');
        if (!previous) this.db.prepare('INSERT INTO config VALUES(1,?,?,?,?,0)')
          .run(digest(this.authorization), initialNow, initialNow + authorization.maxWallTimeMs, initialNow);
        // The prior owner died or left an unresolved invocation. No replay, refund,
        // or late guessed settlement can make that possible consumption disappear.
        const unresolved = this.db.prepare("SELECT COUNT(*) AS count FROM attempts WHERE state='pending'").get()!;
        if (Number(unresolved.count) > 0) {
          this.db.prepare("UPDATE attempts SET state='unknown',unknown_reason=? WHERE state='pending'").run('previous-owner-ended-with-unsettled-invocation');
          this.db.exec('UPDATE config SET frozen=1 WHERE id=1');
        }
      });
    } catch (error) {
      opened?.close();
      this.ownership.exec('ROLLBACK'); this.ownership.close();
      throw error;
    }
  }

  private validateFile(file: string): void {
    try {
      const stat = lstatSync(file);
      if (!stat.isFile() || stat.nlink !== 1) throw new Error('SUBSCRIPTION_PATH_INVALID');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }

  private readClock(): number {
    const now = this.now();
    if (!nonnegative(now)) throw new Error('SUBSCRIPTION_CLOCK_INVALID');
    return now;
  }

  private transaction<T>(fn: () => T): T {
    if (this.closed) throw new Error('SUBSCRIPTION_BUDGET_CLOSED');
    this.db.exec('BEGIN IMMEDIATE');
    try { const result = fn(); this.db.exec('COMMIT'); return result; }
    catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }

  private snapshotWithinTransaction(): SubscriptionBudgetSnapshot {
    const config = this.db.prepare('SELECT * FROM config WHERE id=1').get()!;
    const now = Math.max(this.readClock(), Number(config.last_observed_at));
    this.db.prepare('UPDATE config SET last_observed_at=? WHERE id=1').run(now);
    const counts = this.db.prepare(`SELECT COUNT(*) AS used, COALESCE(SUM(reported_tokens),0) AS tokens,
      COALESCE(SUM(state='pending'),0) AS pending, COALESCE(SUM(state='unknown'),0) AS unknown,
      COALESCE(SUM(state='not-dispatched'),0) AS not_dispatched FROM attempts`).get()!;
    const usedInvocations = Number(counts.used), reportedTokens = Number(counts.tokens);
    const pendingAttempts = Number(counts.pending), unknownAttempts = Number(counts.unknown);
    const notDispatchedAttempts = Number(counts.not_dispatched);
    const reconciliationEvidenceDigests = this.db.prepare("SELECT reconciliation_evidence_digest FROM attempts WHERE state='not-dispatched' ORDER BY id")
      .all().map(row => String(row.reconciliation_evidence_digest));
    const frozen = Boolean(config.frozen);
    const startedAt = Number(config.started_at), deadlineAt = Number(config.deadline_at);
    const timeRemainingMs = Math.max(0, deadlineAt - now);
    const stopReason: SubscriptionStopReason = frozen ? 'unknown-usage'
      : usedInvocations >= this.authorization.maxInvocations ? 'invocation-limit'
      : reportedTokens >= this.authorization.maxReportedTokens ? 'reported-token-limit'
      : timeRemainingMs === 0 ? 'wall-time-limit'
      : pendingAttempts > 0 ? 'pending-attempt' : null;
    return { ...this.authorization, usedInvocations, reportedTokens, pendingAttempts, unknownAttempts, notDispatchedAttempts, reconciliationEvidenceDigests,
      frozen, stopReason, startedAt, deadlineAt, timeRemainingMs };
  }

  /** Persist an invocation before spawning it. Even spawn failure consumes this attempt. */
  reserve(requestDigest: string): string {
    if (typeof requestDigest !== 'string' || !requestDigestPattern.test(requestDigest)) throw new Error('SUBSCRIPTION_REQUEST_DIGEST_INVALID');
    const result = this.transaction(() => {
      const state = this.snapshotWithinTransaction();
      // Commit the observed time even when admission is refused. Rolling it back
      // could reopen an expired authorization after a wall-clock correction.
      if (state.stopReason) return { id: null, stopReason: state.stopReason };
      const id = randomUUID();
      this.db.prepare("INSERT INTO attempts(id,request_digest,state) VALUES(?,?,'pending')").run(id, requestDigest);
      return { id, stopReason: null };
    });
    if (result.id === null) throw new Error(`SUBSCRIPTION_STOPPED:${result.stopReason}`);
    return result.id;
  }

  /** Charge known usage, including an incomplete or failed response with known usage. */
  settle(attemptId: string, reportedTokens: number): void {
    if (!nonnegative(reportedTokens)) throw new Error('SUBSCRIPTION_USAGE_INVALID');
    this.transaction(() => {
      this.requirePending(attemptId);
      const total = Number(this.db.prepare('SELECT COALESCE(SUM(reported_tokens),0) AS tokens FROM attempts').get()!.tokens);
      if (!nonnegative(total + reportedTokens)) throw new Error('SUBSCRIPTION_USAGE_TOTAL_INVALID');
      this.db.prepare("UPDATE attempts SET state='settled',reported_tokens=? WHERE id=?").run(reportedTokens, attemptId);
    });
  }

  markUnknown(attemptId: string, reason: string): void {
    if (typeof reason !== 'string' || !reason.trim() || reason.length > 1000) throw new Error('SUBSCRIPTION_UNKNOWN_REASON_INVALID');
    this.transaction(() => {
      this.requirePending(attemptId);
      this.db.prepare("UPDATE attempts SET state='unknown',unknown_reason=? WHERE id=?").run(reason, attemptId);
      this.db.exec('UPDATE config SET frozen=1 WHERE id=1');
    });
  }

  /**
   * Explicit operator attestation that an unknown invocation never dispatched a
   * model request. The evidence digest is an audit reference, not cryptographic
   * provider proof. This is never an automatic retry path: the attempt remains
   * spent, cannot be settled/reconciled again, and no limit or deadline changes.
   */
  reconcileNotDispatched(attemptId: string, evidenceDigest: string): void {
    if (typeof evidenceDigest !== 'string' || !requestDigestPattern.test(evidenceDigest)) throw new Error('SUBSCRIPTION_RECONCILIATION_EVIDENCE_INVALID');
    this.transaction(() => {
      if (typeof attemptId !== 'string' || !attemptId || this.db.prepare('SELECT state FROM attempts WHERE id=?').get(attemptId)?.state !== 'unknown') {
        throw new Error('SUBSCRIPTION_RECONCILIATION_INVALID');
      }
      this.db.prepare("UPDATE attempts SET state='not-dispatched',reconciliation_evidence_digest=? WHERE id=?")
        .run(evidenceDigest, attemptId);
      const unresolved = this.db.prepare("SELECT COUNT(*) AS count FROM attempts WHERE state IN ('pending','unknown')").get()!;
      this.db.prepare('UPDATE config SET frozen=? WHERE id=1').run(Number(unresolved.count) > 0 ? 1 : 0);
    });
  }

  private requirePending(attemptId: string): void {
    if (typeof attemptId !== 'string' || !attemptId || this.db.prepare('SELECT state FROM attempts WHERE id=?').get(attemptId)?.state !== 'pending') {
      throw new Error('SUBSCRIPTION_SETTLEMENT_INVALID');
    }
  }

  snapshot(): SubscriptionBudgetSnapshot { return this.transaction(() => this.snapshotWithinTransaction()); }

  close(): void {
    if (this.closed) return;
    try {
      this.transaction(() => {
        const pending = this.db.prepare("SELECT COUNT(*) AS count FROM attempts WHERE state='pending'").get()!;
        if (Number(pending.count) > 0) {
          this.db.prepare("UPDATE attempts SET state='unknown',unknown_reason=? WHERE state='pending'").run('owner-closed-with-unsettled-invocation');
          this.db.exec('UPDATE config SET frozen=1 WHERE id=1');
        }
      });
    } finally {
      this.closed = true;
      try { this.db.close(); }
      finally { try { this.ownership.exec('ROLLBACK'); } finally { this.ownership.close(); } }
    }
  }
}
