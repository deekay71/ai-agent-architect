import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { z } from 'zod';
import { canonicalJson, digest, digestOmitting } from '../contracts/canonical.js';
import { auditSemanticSplits, type SemanticSplitAudit } from './split-audit.js';

const text = z.string().trim().min(1);
const hash = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const uniqueTexts = z.array(text).refine(a => new Set(a).size === a.length, 'Duplicate identifiers');
const infrastructureClass = text.refine(s => s.startsWith('infrastructure.'), 'Infrastructure task classes only');
const relativePath = text.refine(p => !isAbsolute(p) && !p.includes('\\') && p.split('/').every(s => s !== '..' && s !== '.' && s !== ''), 'Expected a confined relative path');

export const SemanticDocumentSchema = z.strictObject({
  id: text, revision: text, repoId: text, path: relativePath, taskClass: infrastructureClass,
  lifecycle: z.enum(['active', 'revoked']), freshness: z.enum(['fresh', 'stale']), text,
  distractor: z.boolean(),
});
export const SemanticCaseSchema = z.strictObject({
  id: text, family: text, split: z.enum(['dev', 'holdout']), question: text, query: text,
  repoId: text, allowedPaths: uniqueTexts.min(1).pipe(z.array(relativePath)), taskClass: infrastructureClass,
  constraints: z.array(z.strictObject({ id: text, description: text, revision: text })),
  history: z.string(), unknowns: z.array(z.strictObject({ id: text, description: text, critical: z.boolean() })),
});
export const SemanticGoldSchema = z.strictObject({
  caseId: text, requiredEvidenceIds: uniqueTexts, acceptableAlternatives: uniqueTexts,
  answerability: z.enum(['answerable', 'unanswerable', 'conflict']),
  expectedRevision: z.record(text, text), expectedConstraints: uniqueTexts,
}).superRefine((g, ctx) => {
  if (g.answerability === 'answerable' && (!g.acceptableAlternatives.length || !g.requiredEvidenceIds.length)) {
    ctx.addIssue({ code: 'custom', message: 'Answerable cases require evidence and at least one answer alternative' });
  }
  if (g.answerability !== 'answerable' && g.acceptableAlternatives.length) {
    ctx.addIssue({ code: 'custom', message: 'Abstention cases must not contain accepted answers' });
  }
  if (g.answerability === 'conflict' && g.requiredEvidenceIds.length < 2) {
    ctx.addIssue({ code: 'custom', message: 'Conflict cases require both conflicting sources' });
  }
  if (g.requiredEvidenceIds.some(id => !Object.hasOwn(g.expectedRevision, id))) {
    ctx.addIssue({ code: 'custom', message: 'Every required evidence item needs a pinned revision' });
  }
});
export const SemanticAnswerSchema = z.strictObject({
  disposition: z.enum(['answer', 'abstain']), answer: z.string().trim().min(1).nullable(),
  evidenceIds: uniqueTexts, revisions: z.record(text, text), constraints: uniqueTexts,
  confidence: z.number().finite().min(0).max(1),
}).superRefine((a, ctx) => {
  if ((a.disposition === 'answer') !== (a.answer !== null)) {
    ctx.addIssue({ code: 'custom', message: 'Answer disposition requires text; abstention requires null' });
  }
});
export type SemanticDocument = z.infer<typeof SemanticDocumentSchema>;
export type SemanticCase = z.infer<typeof SemanticCaseSchema>;
export type SemanticGold = z.infer<typeof SemanticGoldSchema>;
export type SemanticAnswer = z.infer<typeof SemanticAnswerSchema>;

const ManifestSchema = z.strictObject({
  schemaVersion: z.literal('semantic-candidate-v1'), datasetId: text,
  status: z.literal('candidate-new'), reviewStatus: z.literal('unreviewed'),
  authorIds: uniqueTexts.min(1), provenance: text, createdAt: z.iso.datetime(),
  splitCounts: z.strictObject({ dev: z.literal(20), holdout: z.literal(10) }),
  releaseEligible: z.literal(false), limitations: uniqueTexts.min(1),
});
const DATA_FILES = ['manifest.json', 'public/documents.json', 'public/cases.json', 'evaluator/oracle.json'] as const;
const SealSchema = z.strictObject({
  schemaVersion: z.literal('semantic-seal-v1'), datasetId: text,
  status: z.literal('candidate-new'), reviewStatus: z.literal('unreviewed'),
  files: z.record(text, hash), sealDigest: hash,
});
export type DatasetSeal = z.infer<typeof SealSchema>;
function fail(message: string): never { throw new Error(`Semantic dataset: ${message}`); }
function fileAt(root: string, name: string): string {
  const base = realpathSync(root), path = resolve(base, name);
  const rel = relative(base, realpathSync(path));
  if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel) || lstatSync(path).isSymbolicLink()) fail('symlink or path escape');
  return path;
}
function readJson(root: string, name: string): unknown { return JSON.parse(readFileSync(fileAt(root, name), 'utf8')) as unknown; }
function rawDigest(bytes: Uint8Array): string { return `sha256:${createHash('sha256').update(bytes).digest('hex')}`; }
function uniqueIds(items: { id: string }[], label: string): void {
  if (new Set(items.map(x => x.id)).size !== items.length) fail(`duplicate ${label} identifiers`);
}
function readPublic(root: string): { documents: SemanticDocument[]; cases: SemanticCase[]; datasetId: string; splitAudit: SemanticSplitAudit } {
  const manifest = ManifestSchema.parse(readJson(root, 'manifest.json'));
  const documents = z.array(SemanticDocumentSchema).min(1).parse(readJson(root, 'public/documents.json'));
  const cases = z.array(SemanticCaseSchema).parse(readJson(root, 'public/cases.json'));
  uniqueIds(documents, 'document'); uniqueIds(cases, 'case');
  for (const split of ['dev', 'holdout'] as const) {
    if (cases.filter(c => c.split === split).length !== manifest.splitCounts[split]) fail('split count does not match locked design');
  }
  const devFamilies = new Set(cases.filter(c => c.split === 'dev').map(c => c.family));
  if (cases.some(c => c.split === 'holdout' && devFamilies.has(c.family))) fail('scenario family leakage across splits');
  for (const c of cases) { uniqueIds(c.constraints, 'constraint'); uniqueIds(c.unknowns, 'unknown'); }
  const splitAudit = auditSemanticSplits(cases);
  if (splitAudit.status === 'rejected') {
    const pairs = splitAudit.suspectedPairs.filter(p => p.classification !== 'semantic-review');
    fail(`scenario content leakage across splits (${splitAudit.policy.version}): ${canonicalJson(pairs)}`);
  }
  return { documents, cases, datasetId: manifest.datasetId, splitAudit };
}
function readOracle(root: string, data: ReturnType<typeof readPublic>): SemanticGold[] {
  const gold = z.array(SemanticGoldSchema).parse(readJson(root, 'evaluator/oracle.json'));
  if (new Set(gold.map(g => g.caseId)).size !== gold.length || gold.length !== data.cases.length) fail('oracle case coverage mismatch');
  const docs = new Map(data.documents.map(d => [d.id, d]));
  for (const g of gold) {
    const c = data.cases.find(c => c.id === g.caseId);
    if (!c) fail('oracle references unknown case');
    const constraintIds = c.constraints.map(c => c.id);
    if (digest([...g.expectedConstraints].sort()) !== digest(constraintIds.sort())) fail('oracle drops public constraints');
    for (const [id, revision] of Object.entries(g.expectedRevision)) {
      const d = docs.get(id);
      if (!d || d.revision !== revision || d.repoId !== c.repoId || d.taskClass !== c.taskClass
        || !c.allowedPaths.some(p => d.path === p || d.path.startsWith(`${p}/`))
        || d.lifecycle !== 'active' || d.freshness !== 'fresh' || d.distractor) fail('oracle evidence is absent, ineligible, or revision-mismatched');
    }
  }
  return gold;
}

/** Reads public bytes only. Oracle labels must never be passed to a reader or Memory. */
export function loadPublicDataset(root: string): ReturnType<typeof readPublic> {
  // Verify public pins without touching evaluator-only bytes, permitting a public-only reader copy.
  if (existsSync(resolve(root, 'dataset.lock.json'))) {
    const seal = readSeal(root);
    for (const name of DATA_FILES.filter(f => !f.startsWith('evaluator/'))) checkFile(root, name, seal);
  }
  return readPublic(root);
}
/** Evaluator boundary: callers must keep this return value out of provider/context inputs. */
export function loadEvaluatorOracle(root: string): SemanticGold[] {
  if (existsSync(resolve(root, 'dataset.lock.json'))) verifyDatasetSeal(root);
  return readOracle(root, readPublic(root));
}
function readSeal(root: string): DatasetSeal {
  const seal = SealSchema.parse(readJson(root, 'dataset.lock.json'));
  if (digestOmitting(seal, 'sealDigest') !== seal.sealDigest) fail('seal digest mismatch');
  if (digest(Object.keys(seal.files).sort()) !== digest([...DATA_FILES].sort())) fail('seal file coverage mismatch');
  return seal;
}
function checkFile(root: string, name: string, seal: DatasetSeal): void {
  if (rawDigest(readFileSync(fileAt(root, name))) !== seal.files[name]) fail(`locked file drift: ${name}`);
}
/** A seal is an immutable content pin, never independent review or semantic certification. */
export function sealDataset(root: string): DatasetSeal {
  if (existsSync(resolve(root, 'dataset.lock.json'))) { verifyDatasetSeal(root); return readSeal(root); }
  const data = readPublic(root); readOracle(root, data);
  const files = Object.fromEntries(DATA_FILES.map(name => [name, rawDigest(readFileSync(fileAt(root, name)))]));
  const body = { schemaVersion: 'semantic-seal-v1' as const, datasetId: data.datasetId,
    status: 'candidate-new' as const, reviewStatus: 'unreviewed' as const, files };
  const seal: DatasetSeal = { ...body, sealDigest: digest(body) };
  writeFileSync(resolve(root, 'dataset.lock.json'), `${canonicalJson(seal)}\n`, { flag: 'wx', mode: 0o444 });
  verifyDatasetSeal(root);
  return seal;
}
export function verifyDatasetSeal(root: string): string {
  const seal = readSeal(root);
  for (const name of DATA_FILES) checkFile(root, name, seal);
  const data = readPublic(root);
  if (data.datasetId !== seal.datasetId) fail('seal dataset identity mismatch');
  readOracle(root, data);
  return seal.sealDigest;
}

const ReviewSchema = z.strictObject({
  schemaVersion: z.literal('semantic-human-review-v1'), datasetSealDigest: hash,
  reviewerId: text, reviewerKind: z.literal('human'), method: z.literal('external-manual-review'),
  reviewedAt: z.iso.datetime(), caseIds: uniqueTexts.min(1),
  evidenceRefs: z.array(z.strictObject({ path: text, digest: hash })).min(1),
  judgments: z.array(z.strictObject({ caseId: text, answerDigest: hash, judgment: z.enum(['accept', 'reject']), rationale: text })).min(1),
});
export type HumanCalibrationReview = z.infer<typeof ReviewSchema>;
export type HumanCalibrationStatus = { status: 'pending'; releaseEligible: false } |
  { status: 'reviewed'; releaseEligible: false; reviewDigest: string; review: HumanCalibrationReview };
function verifyReview(root: string, review: HumanCalibrationReview): void {
  if (review.datasetSealDigest !== verifyDatasetSeal(root)) fail('human review dataset pin mismatch');
  const manifest = ManifestSchema.parse(readJson(root, 'manifest.json'));
  const identity = (s: string): string => s.normalize('NFKC').trim().toLowerCase();
  if (manifest.authorIds.some(id => identity(id) === identity(review.reviewerId))) fail('dataset author cannot self-attest independent human review');
  const ids = new Set(readPublic(root).cases.map(c => c.id));
  if (review.caseIds.some(id => !ids.has(id)) || review.judgments.some(j => !review.caseIds.includes(j.caseId))) fail('human review case coverage mismatch');
  if (review.caseIds.some(id => !review.judgments.some(j => j.caseId === id))) fail('reviewed case lacks a judgment');
  const judgmentKeys = review.judgments.map(j => `${j.caseId}:${j.answerDigest}`);
  if (new Set(judgmentKeys).size !== judgmentKeys.length) fail('duplicate calibration judgment');
  const base = realpathSync(root);
  const paths = new Set<string>();
  for (const evidence of review.evidenceRefs) {
    if (!isAbsolute(evidence.path)) fail('manual review evidence requires an absolute external path');
    const path = realpathSync(evidence.path), rel = relative(base, path);
    if (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel)) fail('review evidence must originate outside the candidate dataset');
    if (paths.has(path)) fail('duplicate human evidence reference');
    paths.add(path);
    const bytes = readFileSync(path);
    if (!bytes.length || rawDigest(bytes) !== evidence.digest) fail('human evidence empty or changed');
  }
}
/** Operator imports an external human attestation; the API cannot authenticate a person's identity. */
export function importHumanCalibrationReview(root: string, input: unknown): HumanCalibrationStatus {
  const review = ReviewSchema.parse(input); verifyReview(root, review);
  const record = { review, reviewDigest: digest(review) };
  writeFileSync(resolve(root, 'human-calibration-review.json'), `${canonicalJson(record)}\n`, { flag: 'wx', mode: 0o444 });
  return loadHumanCalibrationReview(root);
}
export function loadHumanCalibrationReview(root: string): HumanCalibrationStatus {
  if (!existsSync(resolve(root, 'human-calibration-review.json'))) return { status: 'pending', releaseEligible: false };
  const record = z.strictObject({ review: ReviewSchema, reviewDigest: hash }).parse(readJson(root, 'human-calibration-review.json'));
  if (digest(record.review) !== record.reviewDigest) fail('human review record drift');
  verifyReview(root, record.review);
  return { status: 'reviewed', releaseEligible: false, ...record };
}
