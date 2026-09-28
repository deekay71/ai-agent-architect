import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { executeAcceptedHandoff } from '../src/evaluation/acceptance-handoff.js';
import type { VerifiedAcceptanceEvidence } from '../src/evaluation/acceptance-evidence.js';
import { sourceContentDigest } from '../src/memory/index.js';

const hash = (text: string) => sourceContentDigest(text);
function fakeEvidence(): VerifiedAcceptanceEvidence {
  const sourceBytes = '{"sanitized":"metadata only"}';
  return {
    schemaVersion: 'verified-starter-acceptance/1', scope: 'finite-authored-infrastructure-starter', t11ArtifactVersion: hash('t11'), t19ArtifactVersion: hash('t19'),
    implementationPin: hash('implementation'), protocolDigest: hash('protocol'), receiptDigest: hash('receipt'), modelOutputDigest: hash('output'), assessmentDigest: hash('assessment'),
    sourceRevision: 'frozen-revision', sourceBytes, sourceBytesSha256: hash(sourceBytes), trialId: 'trial-fixture', answerDisposition: 'answer', gate: 'PASS',
    reviewerKind: 'ai', humanAttestation: null, releaseEligible: false,
  };
}

test('T14 rejects caller-made PASS records before creating any output', t => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'architect-handoff-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const fake = fakeEvidence();
  assert.throws(() => executeAcceptedHandoff({ outputRoot: root, evidence: fake }), /ACCEPTANCE_HANDOFF_UNVERIFIED_EVIDENCE/);
  assert.equal(existsSync(path.join(root, 'accepted-handoff-report.json')), false);
  assert.equal(existsSync(path.join(root, 'memory')), false);
});

test('T14 rejects JSON-reloaded and copied PASS-shaped records before creating output', t => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'architect-handoff-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const reloaded = JSON.parse(JSON.stringify(fakeEvidence())) as VerifiedAcceptanceEvidence;
  const copied = { ...reloaded } as VerifiedAcceptanceEvidence;
  for (const evidence of [reloaded, copied]) assert.throws(() => executeAcceptedHandoff({ outputRoot: root, evidence }), /ACCEPTANCE_HANDOFF_UNVERIFIED_EVIDENCE/);
  assert.equal(existsSync(path.join(root, 'accepted-handoff-report.json')), false);
});

test('test-only issuer seam exercises accepted handoff, revocation, replay, and negative traces without native evidence', async t => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'architect-handoff-issuer-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const compiled = readFileSync(path.resolve('dist/src/evaluation/acceptance-handoff.js'), 'utf8');
  const issuer = path.join(root, 'issuer.mjs'), module = path.join(root, 'handoff.mjs');
  writeFileSync(issuer, `const issued=new WeakSet(); export const issue=e=>{issued.add(e);return e}; export const isVerifiedAcceptanceEvidence=e=>issued.has(e);`);
  const url = (file: string) => pathToFileURL(path.resolve(file)).href;
  writeFileSync(module, compiled
    .replace("'../contracts/canonical.js'", `'${url('dist/src/contracts/canonical.js')}'`)
    .replace("'../memory/index.js'", `'${url('dist/src/memory/index.js')}'`)
    .replace("'./acceptance-evidence.js'", "'./issuer.mjs'"));
  const seam = await import(pathToFileURL(module).href), issuerModule = await import(pathToFileURL(issuer).href);
  const evidence = issuerModule.issue(fakeEvidence()), outputRoot = path.join(root, 'output');
  const report = seam.executeAcceptedHandoff({ outputRoot, evidence });
  assert.equal(report.handoffValidityAfterRevocation, 'invalidated'); assert.equal(report.unrelatedBranchValidity, 'valid');
  assert.equal(report.negativeChecks.length, 5); assert.deepEqual(seam.executeAcceptedHandoff({ outputRoot, evidence }), report);
  assert.throws(() => seam.executeAcceptedHandoff({ outputRoot, evidence: issuerModule.issue({ ...evidence, receiptDigest: hash('other') }) }), /REPLAY_CONFLICT/);
});
