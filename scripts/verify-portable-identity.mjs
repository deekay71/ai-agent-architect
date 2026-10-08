#!/usr/bin/env node
// Read-only source/build parity preflight for portable packaging. Usage: node scripts/verify-portable-identity.mjs [repository-root]
// Compiles the repository's tsconfig in memory with its own pinned TypeScript and byte-compares packaged dist outputs.
// Writes no files; no install, Git, network, Unity, MCP or model action. Exit 1 on any mismatch or error.
import { createRequire } from 'node:module';
import { existsSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const out = value => process.stdout.write(JSON.stringify(value,null,2)+'\n');
const self = 'dist/src/portable/identity.js';
try {
  if (process.argv.length > 3) throw Error('Usage: verify-portable-identity.mjs [repository-root]');
  const root = realpathSync(path.resolve(process.argv[2] ?? path.join(path.dirname(fileURLToPath(import.meta.url)),'..')));
  if (!existsSync(path.join(root,self))) throw Error(`${self} is missing: the supplied dist predates or lacks the identity verifier; rebuild from this exact source`);
  const ts = createRequire(path.join(root,'package.json'))('typescript');
  const { verifyBuildParity } = await import(pathToFileURL(path.join(root,self)).href);
  const result = verifyBuildParity(root,ts);
  // The verifier module that ran must itself be one of the byte-matched outputs of the fresh compile.
  const verifierMatched = result.status === 'coherent' && !result.mismatched.includes(self) && !result.missing.includes(self);
  out({ ...result,status:verifierMatched ? 'coherent' : 'mismatch',verifierModule:self,verifierMatched,typescriptVersion:ts.version,
    writes:false,unityInvoked:false,modelsInvoked:false,executionAuthorized:false });
  process.exitCode = verifierMatched ? 0 : 1;
} catch (error) {
  out({ schemaVersion:'architect-build-parity/1',status:'mismatch',error:error instanceof Error ? error.message : String(error),writes:false,executionAuthorized:false });
  process.exitCode = 1;
}
