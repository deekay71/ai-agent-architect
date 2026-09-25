import { DatabaseSync } from 'node:sqlite';
import { chmodSync, lstatSync, mkdirSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { canonicalJson, digest } from '../contracts/canonical.js';

/** Trusted broker only. Workers never receive a handle or access to this directory. */
export class RuntimeStore {
  readonly root: string;
  private readonly db: DatabaseSync;
  constructor(root: string) {
    mkdirSync(root, { recursive: true, mode: 0o700 });
    if (lstatSync(root).isSymbolicLink()) throw new Error('STORE_SYMLINK');
    this.root = realpathSync(root);
    chmodSync(this.root, 0o700);
    const file = path.join(this.root, 'runtime.sqlite');
    try { const stat = lstatSync(file); if (stat.isSymbolicLink() || !stat.isFile() || stat.nlink !== 1) throw new Error('STORE_UNSAFE_FILE'); }
    catch (e) { if (!(e instanceof Error && 'code' in e && e.code === 'ENOENT')) throw e; }
    this.db = new DatabaseSync(file);
    chmodSync(file, 0o600);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON;
      PRAGMA busy_timeout=3000;
      CREATE TABLE IF NOT EXISTS metadata(key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS records(kind TEXT NOT NULL, id TEXT NOT NULL, body TEXT NOT NULL,
        PRIMARY KEY(kind,id));
      CREATE TABLE IF NOT EXISTS artifacts(hash TEXT PRIMARY KEY, body TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS events(seq INTEGER PRIMARY KEY AUTOINCREMENT, run_id TEXT NOT NULL, body TEXT NOT NULL);`);
    const existing = this.db.prepare('SELECT value FROM metadata WHERE key=?').get('schema');
    if (existing && existing.value !== 'runtime-store/1') { this.db.close(); throw new Error('STORE_VERSION_MISMATCH'); }
    this.db.prepare('INSERT OR IGNORE INTO metadata VALUES(?,?)').run('schema', 'runtime-store/1');
  }
  close(): void { this.db.close(); }
  transaction<T>(fn: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try { const result = fn(); this.db.exec('COMMIT'); return result; }
    catch (e) { this.db.exec('ROLLBACK'); throw e; }
  }
  read<T>(kind: string, id: string): T | undefined {
    const row = this.db.prepare('SELECT body FROM records WHERE kind=? AND id=?').get(kind, id);
    return row ? JSON.parse(String(row.body)) as T : undefined;
  }
  write(kind: string, id: string, body: unknown): void {
    this.db.prepare('INSERT INTO records VALUES(?,?,?) ON CONFLICT(kind,id) DO UPDATE SET body=excluded.body')
      .run(kind, id, canonicalJson(body));
  }
  insert(kind: string, id: string, body: unknown): void {
    this.db.prepare('INSERT INTO records VALUES(?,?,?)').run(kind, id, canonicalJson(body));
  }
  list<T>(kind: string): T[] {
    return this.db.prepare('SELECT body FROM records WHERE kind=? ORDER BY rowid').all(kind)
      .map(row => JSON.parse(String(row.body)) as T);
  }
  /** Immutable bytes inside the same durable transaction as references/checkpoints. */
  artifact(body: unknown): string {
    const hash = digest(body), bytes = canonicalJson(body);
    this.db.prepare('INSERT OR IGNORE INTO artifacts VALUES(?,?)').run(hash, bytes);
    if (this.artifactValue(hash) === undefined) throw new Error('ARTIFACT_WRITE_FAILED');
    return hash;
  }
  artifactValue(hash: string): unknown {
    const row = this.db.prepare('SELECT body FROM artifacts WHERE hash=?').get(hash);
    if (!row) return undefined;
    const body: unknown = JSON.parse(String(row.body));
    if (digest(body) !== hash) throw new Error('ARTIFACT_TAMPERED');
    return body;
  }
  event(runId: string, body: unknown): number {
    return Number(this.db.prepare('INSERT INTO events(run_id,body) VALUES(?,?)').run(runId, canonicalJson(body)).lastInsertRowid);
  }
  events(runId: string): { seq: number; body: unknown }[] {
    return this.db.prepare('SELECT seq,body FROM events WHERE run_id=? ORDER BY seq').all(runId)
      .map(row => ({ seq: Number(row.seq), body: JSON.parse(String(row.body)) as unknown }));
  }
}
