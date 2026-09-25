import { DatabaseSync } from 'node:sqlite';
import { chmodSync, existsSync, lstatSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { digest } from '../contracts/canonical.js';

export interface SpendAuthorization { authorizationId: string; maxCostMicros: number; assurance: 'provider' | 'mock' }
const integer = (n: number): boolean => Number.isSafeInteger(n) && n >= 0;
/** Campaign accounting only. This never issues runtime authority or resets an existing authorization. */
export class CampaignBudget {
  private readonly db: DatabaseSync;
  constructor(root: string, authorization: SpendAuthorization) {
    if (!authorization.authorizationId || !integer(authorization.maxCostMicros)) throw new Error('BUDGET_AUTHORIZATION_INVALID');
    mkdirSync(root, { recursive: true, mode: 0o700 });
    if (!lstatSync(root).isDirectory() || lstatSync(root).isSymbolicLink()) throw new Error('BUDGET_PATH_INVALID');
    chmodSync(root, 0o700);
    const file = path.join(root, 'campaign-spend.sqlite');
    if (existsSync(file) && (!lstatSync(file).isFile() || lstatSync(file).nlink !== 1)) throw new Error('BUDGET_PATH_INVALID');
    this.db = new DatabaseSync(file); chmodSync(file, 0o600);
    this.db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS config (id INTEGER PRIMARY KEY CHECK(id=1), digest TEXT NOT NULL, cap INTEGER NOT NULL, frozen INTEGER NOT NULL DEFAULT 0); CREATE TABLE IF NOT EXISTS attempts (id TEXT PRIMARY KEY, request_digest TEXT NOT NULL, reserved INTEGER NOT NULL, charged INTEGER NOT NULL, state TEXT NOT NULL, receipt TEXT);');
    try {
      this.transaction(() => {
        const old = this.db.prepare('SELECT digest FROM config WHERE id=1').get();
        if (old && old.digest !== digest(authorization)) throw new Error('BUDGET_AUTHORIZATION_DRIFT');
        if (!old) this.db.prepare('INSERT INTO config(id,digest,cap) VALUES(1,?,?)').run(digest(authorization), authorization.maxCostMicros);
      });
    } catch (error) { this.db.close(); throw error; }
  }
  private transaction<T>(fn: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try { const value = fn(); this.db.exec('COMMIT'); return value; }
    catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  reserve(attemptId: string, requestDigest: string, amountMicros: number): void {
    if (!attemptId || !/^sha256:[a-f0-9]{64}$/.test(requestDigest) || !integer(amountMicros)) throw new Error('BUDGET_RESERVATION_INVALID');
    this.transaction(() => {
      const state = this.snapshot();
      if (state.frozen) throw new Error('BUDGET_FROZEN');
      if (state.chargedMicros + amountMicros > state.capMicros) throw new Error('BUDGET_CAP_EXCEEDED');
      if (this.db.prepare('SELECT id FROM attempts WHERE id=?').get(attemptId)) throw new Error('ATTEMPT_ALREADY_RESERVED_NO_BLIND_RETRY');
      if (state.reservedAttempts > 0) throw new Error('BUDGET_PENDING_RECONCILIATION');
      this.db.prepare('INSERT INTO attempts VALUES(?,?,?,?,?,NULL)').run(attemptId, requestDigest, amountMicros, amountMicros, 'reserved');
    });
  }
  settle(attemptId: string, requestDigest: string, measuredMicros: number | null, receipt: string): void {
    if (measuredMicros !== null && !integer(measuredMicros)) throw new Error('BUDGET_USAGE_INVALID');
    this.transaction(() => {
      const row = this.db.prepare('SELECT * FROM attempts WHERE id=?').get(attemptId);
      if (!row || row.state !== 'reserved' || row.request_digest !== requestDigest || !receipt) throw new Error('BUDGET_SETTLEMENT_INVALID');
      const reserved = Number(row.reserved), amount = measuredMicros ?? reserved;
      this.db.prepare('UPDATE attempts SET charged=?,state=?,receipt=? WHERE id=?').run(amount, measuredMicros === null ? 'uncertain' : 'settled', receipt, attemptId);
      // Uncertain effects retain their reservation and stop the account across restarts/campaigns.
      if (measuredMicros === null || amount > reserved) this.db.exec('UPDATE config SET frozen=1 WHERE id=1');
    });
  }
  snapshot(): { capMicros: number; chargedMicros: number; reservedAttempts: number; uncertainAttempts: number; frozen: boolean } {
    const config = this.db.prepare('SELECT * FROM config WHERE id=1').get()!;
    const total = this.db.prepare('SELECT COALESCE(SUM(charged),0) AS total, SUM(state=\'reserved\') AS pending, SUM(state=\'uncertain\') AS uncertain FROM attempts').get()!;
    return { capMicros: Number(config.cap), chargedMicros: Number(total.total), reservedAttempts: Number(total.pending ?? 0), uncertainAttempts: Number(total.uncertain ?? 0), frozen: Boolean(config.frozen) };
  }
  close(): void { this.db.close(); }
}
