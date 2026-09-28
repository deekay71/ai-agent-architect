import { chmodSync, lstatSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { z } from 'zod';
import { digest } from '../contracts/canonical.js';
import { SemanticCaseSchema, type SemanticCase } from './dataset.js';

const text = z.string().trim().min(1), hash = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const ExposureSchema = z.strictObject({ attemptId: text, requestDigest: hash, datasetSealDigest: hash.nullable(), inputSnapshotDigest: hash.optional(),
  campaignId: text, caseId: text, family: text, contentFingerprint: hash, split: z.enum(['dev', 'holdout']),
  assurance: z.enum(['mock', 'codex-chatgpt']), at: z.iso.datetime() }).refine(r => r.datasetSealDigest !== null || r.inputSnapshotDigest !== undefined,
    'Exposure requires a dataset seal or explicitly unsealed input snapshot');
type Exposure = z.infer<typeof ExposureSchema>;
const normalize = (s: string) => s.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();

/** Identity labels are excluded so merely renaming IDs/families cannot erase content exposure. */
export function caseExposureFingerprint(input: SemanticCase): string {
  const c = SemanticCaseSchema.parse(input);
  return digest({ question: normalize(c.question), constraints: c.constraints.map(x => normalize(x.description)).sort(),
    unknowns: c.unknowns.map(x => ({ description: normalize(x.description), critical: x.critical })) });
}

/** Repository-level exposure journal. Fingerprints detect exact normalized reuse, not semantic near-duplicates. */
export class ExposureRegistry {
  private readonly db: DatabaseSync;
  constructor(root: string) {
    mkdirSync(root, { recursive: true, mode: 0o700 });
    if (!lstatSync(root).isDirectory() || lstatSync(root).isSymbolicLink()) throw Error('EXPOSURE_PATH_INVALID');
    const file = path.join(root, 'dataset-exposure.sqlite');
    try { const stat = lstatSync(file); if (!stat.isFile() || stat.nlink !== 1) throw Error('EXPOSURE_PATH_INVALID'); }
    catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; }
    this.db = new DatabaseSync(file); chmodSync(file, 0o600);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS exposures(attempt_id TEXT PRIMARY KEY, record_digest TEXT NOT NULL,
        family TEXT NOT NULL, fingerprint TEXT NOT NULL, body TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS exposure_family ON exposures(family);
      CREATE INDEX IF NOT EXISTS exposure_fingerprint ON exposures(fingerprint);`);
  }
  record(input: Exposure): void {
    const record = ExposureSchema.parse(input), recordDigest = digest(record);
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const previous = this.db.prepare('SELECT record_digest FROM exposures WHERE attempt_id=?').get(record.attemptId);
      if (previous && previous.record_digest !== recordDigest) throw Error('EXPOSURE_ATTEMPT_DRIFT');
      if (!previous) this.db.prepare('INSERT INTO exposures VALUES(?,?,?,?,?)').run(record.attemptId, recordDigest,
        normalize(record.family), record.contentFingerprint, JSON.stringify(record));
      this.db.exec('COMMIT');
    } catch (e) { this.db.exec('ROLLBACK'); throw e; }
  }
  inspect(task: SemanticCase) {
    const c = SemanticCaseSchema.parse(task), fingerprint = caseExposureFingerprint(c);
    const records = this.db.prepare('SELECT body FROM exposures WHERE family=? OR fingerprint=? ORDER BY attempt_id')
      .all(normalize(c.family), fingerprint).map(r => ExposureSchema.parse(JSON.parse(String(r.body))));
    return { recordedExposures: records.length, records, reusableAsFresh: records.length === 0,
      assurance: 'registered-exposure-only; independent provenance and semantic split review still required' };
  }
  close(): void { this.db.close(); }
}
