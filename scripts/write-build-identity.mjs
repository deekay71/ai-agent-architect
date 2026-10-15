#!/usr/bin/env node
// Run right after `tsc -p tsconfig.json` in a repository checkout. Verifies source/dist parity with a fresh in-memory compile
// (the same check as verify-portable-identity.mjs) and only then records dist/BUILD_IDENTITY.json, which scripts/architect.mjs
// re-hashes against the current source and dist before every command. No install, Git, network, Unity, MCP or model action.
import { createRequire } from 'node:module';
import { existsSync, realpathSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const out = value => process.stdout.write(JSON.stringify(value, null, 2) + '\n');
try {
  if (process.argv.length > 2) throw Error('Usage: write-build-identity.mjs');
  const root = realpathSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..'));
  const module = path.join(root, 'dist/src/portable/identity.js');
  if (!existsSync(module)) throw Error('dist/src/portable/identity.js is missing: run tsc -p tsconfig.json first');
  const ts = createRequire(path.join(root, 'package.json'))('typescript');
  const { verifyBuildParity, identityReport } = await import(pathToFileURL(module).href);
  const parity = verifyBuildParity(root, ts);
  if (parity.status !== 'coherent') {
    out({ status: 'mismatch', missing: parity.missing, mismatched: parity.mismatched, unexpected: parity.unexpected, diagnosticSamples: parity.diagnosticSamples, written: false });
    process.exit(1);
  }
  const report = identityReport(root);
  if (report.workingTree.sourceRevision !== parity.sourceRevision) throw Error('source changed while the build was being checked');
  const record = { schemaVersion: 'architect-checkout-build/1', sourceRevision: parity.sourceRevision, buildDigest: report.build.buildDigest,
    comparedOutputs: parity.comparedOutputs, typescriptVersion: ts.version, node: process.version, recordedAt: new Date().toISOString(),
    assurance: 'Fresh in-memory compile of the declared source byte-matched dist when recorded; not a Git commit, publication or native acceptance.' };
  const file = path.join(root, 'dist/BUILD_IDENTITY.json'), staging = `${file}.tmp`;
  writeFileSync(staging, JSON.stringify(record, null, 2) + '\n'); renameSync(staging, file);
  out({ status: 'coherent', written: 'dist/BUILD_IDENTITY.json', ...record });
} catch (error) {
  out({ status: 'error', error: error instanceof Error ? error.message : String(error), written: false });
  process.exitCode = 1;
}
