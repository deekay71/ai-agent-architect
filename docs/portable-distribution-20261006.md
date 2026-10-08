# Portable Brain distribution — 06/10/2026

Owner paused Queens testing and requested a reusable Brain consumable by a fresh Unity project/new agent session. This supersedes the current task priority only; milestone/platform gates are unchanged. Queens/Pet were not accessed by this portable increment.

**Historical local artifact: `releases/0.2.0-preview.1/architect-brain-0.2.0-preview.1.zip`**, version `0.2.0-preview.1`, 1,399,491 bytes. SHA256 `993a82c8454801eee9d3c08bfa3d43b4510374f1fd070672530add8dec0bbf2d`. Manifest SHA256 `311d27ce017bd8c2b5f64d5426e878375d33d6eecfff0f0fdae973dc81ac145c`; source revision `c7258fb761f1f6185f41f998a00e45d0118feb7e5c33ae5f7c999ac3488b044e`. Extract outside Unity auto-import paths. [Setup](../portable/SETUP.md), [exact fresh-session prompt](../portable/NEW_SESSION_PROMPT.md), [readiness/acceptance matrix](../portable/READINESS.md).

## Accepted offline durability repair

[Durability application and limits](portable-durability-20261008.md): the accepted three-file patch is retained with its exact postimages. Original application verification passed 190 regressions and 15 R1 probes; these are separate from combined Git preparation checks. Existing archives remain unchanged and contain the prior code. No F11/F14 candidate or native/whole-M1/T22 acceptance is included.

## Git source preparation

Git is the primary delivery. The repository is https://github.com/deekay71/ai-agent-architect.git; proposed branch is `feat/portable-brain-0.2.0-preview.1`. Use a reviewed exact commit, the locked toolchain, `scripts/architect.mjs`, and [Git setup](../portable/SETUP.md). The source commit excludes ZIP/TGZ, dist, caches and vendored output.

The original archive included an unrelated untracked `src/runtime/lock-identity.ts` proposal because packaging used a folder glob. Portable does not import it. `portable/PAYLOAD.json` now declares the included modules and resources explicitly; the new packager excludes that proposal. The original artifact remains historical evidence with its existing hash, not a reproducible artifact of the eventual clean portable commit. A fresh archive must be built from that exact commit and receive new validation/hash evidence.

[Historical artifact metadata and sanitized reports](evidence/portable-20261006/README.md) retain their original result scope. Git preparation/source checks are separate from the independent fresh agent's original archive review.

## Implementation

- `src/portable/` adds project marker/version/package detection; conflict-safe, idempotent namespaced bootstrap; CLI/API; project-local identity, Memory and session stores; immutable source/context/plan/checklist/handoff provenance; source revalidation and stale/revoked/superseded invalidation. Generated starter/GDD/brief/module/task templates and two pinned skills load into actual Context. No machine/project hardcoding, provider activation or global setting change.
- Existing Context/Memory/decision authority, role-separated propose→verifier→critic→promote, contracts/planning/verifier evaluators, routing references and durable mechanical runtime are included. Native tools remain below Brain. Planning wrapper records validated evidence-linked data, not autonomous semantic planning or execution authority; `recorded_ready` retains `executionAuthorized:false`.
- `unity/packages/com.architect.brain-unity` is a versioned Editor-only UPM package, no third-party UPM dependency or automatic startup/Play/build. Explicit menu exports project/Editor/scene/package observation data. Host MCP binding requires actually exposed **Assistant Unity** read tools and exact current project/PID/version; no CLI fallback.
- `scripts/package-portable.py` emits private archive, TGZ, content/source inventories and verifier. `scripts/validate-portable-distribution.py` separately extracts/compares actual payload against source/build, bootstraps a new minimal project fixture, resumes Knowledge in a fresh process, and checks controlled corruption rejection. No commit/push/publication.

## Validation and actual limits

TypeScript build PASS; **104/104 targeted source checks and 104/104 checks from actual extracted archive PASS**. Existing mechanical crash/recovery suite **10/10 PASS from source build and 10/10 PASS from extracted release**. It kills only its own temporary fixture children, not Unity/R11. Source SDK C# compile PASS against 6000.0.84f1 (two DTO deserialization-field warnings); Unity import/native compile/menu/Play NOT RUN.

Actual ZIP/TGZ extraction checks:804 files; 145 direct payload comparisons with build/source; inventory/hash consistency; no archive path traversal/duplicates/symlinks; bootstrap preserved five existing source/settings/packages/instructions/skill files, repeat created 0, new-project identity distinct; two Node processes resumed promoted fixture Knowledge and loaded both skills without transcript; controlled payload corruption rejected. An independent fresh reviewer found and drove fixes to scope, source reversion, dependency pins, mutable MCP identity, handoff failure handling, omitted skill fixtures and starter CLI path. Review remains offline, not independent live verifier or M1/T22 acceptance.

[Historical machine-readable validation](evidence/portable-20261006/legacy-archive-validation.json). Evidence/source staging is outside all Unity auto-import folders; active root `dist`, locked historical protocols and R7/R11 evidence were not rebuilt/promoted or rewritten. Existing dirty work is preserved.

## Remaining native readiness

R7 FIRST/COLD remains scoped PASS; full M1a=false. Actual native/model two-task M1b, approved Unity fault/recovery M1c (including during verify), M1d/F1 isolation, F2 protected authority, F9 activation and T22 valid comparison/owner decision remain open. Synthetic role IDs are not live authentication. Legacy mechanical locks remain HOME-dependent; alternate platforms are untested. No provider migration, R11 kill campaign, paid-model run, installation/credential/security action is activated.

Next concrete step: start a NEW agent session with the exact prompt and a specifically chosen fresh Unity project; verify Assistant Unity MCP tools bind that project's current Editor. Then review/import this exact adapter revision under the applicable trusted source/action scope, export an actual observation, and execute the scoped two-task/fault acceptance with real evidence. Missing MCP currently blocks that native step, not use of the packaged offline host/fixtures. No generic permission request or new provider decision is required for the completed local deliverable.
