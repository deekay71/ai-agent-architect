import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { portableCommand } from '../dist/src/portable/cli.js';

// Repository checkout only: an archive has no dist/ beside its bin/ and carries its own validated BUILD_IDENTITY.json.
// Refuse a dist that no longer matches the source it was built from (override: ARCHITECT_ALLOW_UNVERIFIED_DIST=1).
async function checkCheckoutBuild() {
  const root = new URL('../', import.meta.url);
  if (!existsSync(new URL('dist/src/portable/cli.js', root))) return;
  const warn = text => process.stderr.write(`architect: ${text}\n`);
  const rebuild = 'node node_modules/typescript/bin/tsc -p tsconfig.json && node scripts/write-build-identity.mjs (or pnpm run build)';
  if (process.versions.node.split('.')[0] !== '24') warn(`Node ${process.version} is outside engines >=24 <25; the test suite covers Node 24 only.`);
  const identity = new URL('dist/src/portable/identity.js', root), recordFile = new URL('dist/BUILD_IDENTITY.json', root);
  if (!existsSync(identity)) { warn(`dist/src/portable/identity.js is missing: this dist predates build identity and is unverified. Rebuild with: ${rebuild}`); return; }
  if (!existsSync(recordFile)) { warn(`dist/BUILD_IDENTITY.json is missing, so this dist is unverified. Build with: ${rebuild}`); return; }
  let recorded;
  try { recorded = JSON.parse(readFileSync(recordFile, 'utf8')); }
  catch (error) { throw Error(`PORTABLE_DIST_STALE: dist/BUILD_IDENTITY.json is unreadable (${error instanceof Error ? error.message : error}). Rebuild with: ${rebuild}`); }
  const { identityReport } = await import(identity.href);
  const current = identityReport(fileURLToPath(root));
  const sourceSame = recorded?.sourceRevision === current.workingTree.sourceRevision, distSame = recorded?.buildDigest === current.build.buildDigest;
  if (sourceSame && distSame) return;
  const cause = !sourceSame && !distSame ? 'source and dist both changed' : !sourceSame ? 'source changed (dist unchanged)' : 'dist changed (source unchanged)';
  const message = `PORTABLE_DIST_STALE: ${cause} since dist/BUILD_IDENTITY.json was recorded.`;
  if (process.env.ARCHITECT_ALLOW_UNVERIFIED_DIST === '1') { warn(`${message} Running anyway because ARCHITECT_ALLOW_UNVERIFIED_DIST=1.`); return; }
  throw Error(`${message} Rebuild and re-record with: ${rebuild}`);
}

try {
  await checkCheckoutBuild();
  await portableCommand(process.argv.slice(2));
} catch (error) {
  process.stderr.write((error instanceof Error ? error.message : 'PORTABLE_STOPPED') + '\n');
  process.exitCode = 1;
}
