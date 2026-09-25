# Phase 3 — clean-source verification

Final run (R2): **327 tests passed, 0 failed, 0 skipped, 0 cancelled, 0 todo**. TypeScript build passed. Both install and `./scripts/dev.sh check` exited 0.

A new temporary source tree was copied without `.git`, `node_modules`, `dist`, `.local`, runtime scratch directories or prior evidence. Dependencies were installed with `--frozen-lockfile --ignore-scripts`. The source manifest covers `src`, `test`, `fixtures`, `scripts`, `package.json`, `pnpm-lock.yaml`, and `tsconfig.json`: **85 files**. Original and tested-copy source hashes were unchanged after the run.

Manifest digest: `sha256:bfc489445f010030718daf26c3da8ea9b70dee7f144dc73bd8a13873c4e587b5`.

Evidence: `final-r2-source-manifest.json`, `final-r2-install.log`, `final-r2-check.log`, `final-r2-verification.json`.

## Preserved first-run failure and diagnosis

The first clean run passed 326/327; `paused owner cannot be replaced and resumes with the same lock` failed with `LOCK_QUARANTINED`. Its logs and receipt remain unchanged in `final-install.log`, `final-check.log`, `final-source-manifest.json`, and `final-verification.json`.

The original test passed 12/12 isolated repetitions. A deterministic paired probe then demonstrated the fixture race: it announced ready before installing its SIGTERM handler. Inserting the same 500 ms scheduling window reproduced 3/3 quarantine failures with the old order (exit by SIGTERM) and 3/3 successful releases with handler installed first (exit 0). Both variants still rejected a simultaneous second owner with `LOCK_BUSY`; the production lock correctly failed closed when the fixture died without clean release.

The authorized fix only changes `test/runtime-lock.test.ts`: install the shutdown handler before announcing ready, then assert clean exit after SIGCONT/SIGTERM. The complete lock suite passed 8/8 before the second clean full run. This test file is the only source-manifest difference between R1 and R2; no production semantics or test thresholds were weakened.

Diagnostic artifacts are explicitly retained: `final-lock-isolated.log/.json` and `final-lock-race-probe.mjs/.json`. The probe changes only a generated child fixture and contains no credentials. No commit or staging was performed.
