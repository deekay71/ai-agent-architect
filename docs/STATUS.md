**Stage 1 · plan (15/10/2026):** branch `fix/brain-stage1-plan` adds the plan-stage suite and non-Editor fixes from the 15/10 architecture review; owner set the test order Plan → Unity CLI → Assistant Unity MCP ([staged testing](staged-testing-20261015.md)). Stages 2–3 are not opened; nothing here establishes Unity, MCP or milestone acceptance.

**Git-source integration (08/10/2026):** This source keeps the [accepted durability repair](portable-durability-20261008.md) and the accepted identity/help work. Offline integration evidence is separate from a publication receipt. Original working-tree evidence below describes its original scope. A Git checkout does not bundle the frozen ZIP or guarantee `releases/` metadata; `identity.frozenRelease: null` means that metadata is absent here. No native Unity, MCP/model binding or broader milestone acceptance is implied.

# AI Agent Architect — current status index (08/10/2026)

This is the short canonical entrypoint for **what exists now**. Decisions and policy stay in [brain-planning-policy.md](brain-planning-policy.md), [decision-log.md](decision-log.md) and [roadmap-r3.md](roadmap-r3.md); dated checkpoints and `docs/evidence/` remain immutable history. This index does not redefine milestones or grant any run, model, Unity, security or release authority.

The product goal is unchanged: a game-development Brain that keeps project context, Knowledge/Memory and provenance, Game/Epic → Module → Task planning with GDD/specs, specialist skills, Unity execution through native hosts, orchestration, enforced control, evidence-based QA and learning. Native hosts own turns/tools; the target is that Brain owns knowledge, planning, task state, control/budget and verification (03/10 decision in the roadmap). Today the portable Brain pins sources, records host-written plans and Ready checklists, re-verifies them on resume and hands off; the host still writes plans, judges Ready, runs tools and tracks spend.

## Delivery identity — three different things

| Identity | What it is | How to inspect |
|---|---|---|
| Repository package `ai-agent-architect@0.1.0` | A label in `package.json`. It identifies no source or build bytes. | `package.json` |
| Portable release label `0.2.0-preview.1` | `RELEASE_VERSION` in `src/portable/templates.ts`, also the UPM adapter version and a **strict project-config/skill pin**. Intentionally not bumped: changing it breaks bootstrapped projects. | `node dist/src/cli.js portable help` |
| Working-tree source and build | Source-inventory digest using the packaging rules (**not a Git commit**) plus a digest of the packaged `dist` outputs. Version labels cannot establish that source and `dist` correspond. | `node dist/src/cli.js identity` (read-only file hashing; reports `parity: not-verified-by-this-command`) and `node scripts/verify-portable-identity.mjs` (fresh in-memory TypeScript compile compared byte-for-byte with packaged `dist`; writes nothing; exit 1 on mismatch) |
| Frozen historical distribution | `releases/0.2.0-preview.1/` from 06/10: archive SHA-256 `993a82c8…bf2d`, manifest `311d27ce…145c`, source-inventory revision `c7258fb7…044e`. Content-consistent, **pre-fix**: no durability test, `planArtifactRef`, session v2 or R1 retry verification. Historical, not corrupt; not relabelled. | `releases/0.2.0-preview.1/artifact.json`, `VALIDATION.json`; `identity` reports `matchesWorkingTreeSource:false` |

The working tree contains the independently accepted portable repair (canonical file-source binding in Memory, pinned plan-artifact hydration in `resume`, verified identical-plan retry). It was applied on 08/10 with 190/190 relevant regressions, 15/15 R1 probes and a fresh-process CLI probe; installed archives do **not** acquire it automatically. Packaging now runs the parity preflight first, refuses a mixed or stale `dist`, includes `portable-durability` in its test inventory, and writes `BUILD_IDENTITY.json`. No new archive has been produced or published by this change. Its identity/help/parity tests are authored in `test/portable-identity.test.ts`; their execution results are recorded separately by the host.

## Capabilities

| Capability | Owner component / entrypoint | Schema / version | Assurance and tests | Open blockers |
|---|---|---|---|---|
| Contracts | `src/contracts`; `cli.js contracts`, `validate`, `schemas` | 23 contracts `0.5.0`, 10 planning contracts `0.6.0` | `contracts`, `brain-planning-contracts` tests: structure/invariants only | No semantic admission or authority from parsing |
| Offline fixture APIs | `src/foundation`, `fixtures/`; `cli.js demo`, `skills-demo` | fixture workflow | `foundation`, `skills` tests | Fixture data only; no dispatch authority |
| Persistent mechanical fixture runtime | `src/runtime`; `cli.js runtime-*` | `runtime-store/1`, `durable-fixture/1` | `runtime-*` tests including kill/reconcile recovery; macOS `sandbox-exec` | HOME-dependent lock root (F9); not a Unity executor; not native M1c recovery |
| Memory / Knowledge / provenance | `src/memory` (`MemoryStore`) | `memory-store/1` | `memory`, `context-memory`: provenance, role-separated promotion, invalidation | Roles run in one local process; no authenticated principals or protected store |
| Context and skill loading | `src/context`, `src/skills` | `context-packet/1`, catalog `1.0` | `context*`, `skills` | Caller-selected references; no automatic task retrieval or project index |
| Project-local portable Brain | `src/portable` (`ProjectBrain`, `portableCommand`); `cli.js portable …` or packaged `host/bin/architect.mjs` | `architect-project/1`, `architect-session/2`, `architect-plan-artifact/1`; label `0.2.0-preview.1` | `portable`, `portable-durability`, `stage1-plan` (CLI in fresh processes: recovery via re-ingest/`retire`, `source-unreadable`, dropped-task and skill-drift warnings, trust/assurance labels, dist identity gate): offline, synthetic roles | `executionAuthorized:false` always; Ready records are self-recorded data; no CLI promotion/decision workflow; legacy v1 handoffs need re-recording |
| Delivery identity / packaging | `src/portable/identity.ts`, `scripts/verify-portable-identity.mjs`, `scripts/package-portable.py`, `scripts/validate-portable-distribution.py`; checkout gate `scripts/write-build-identity.mjs` + `scripts/architect.mjs` | `architect-source-identity/1`, `architect-build-parity/1`, `architect-build-identity/1`, `architect-checkout-build/1` (checkout `dist/` only) | `portable-identity` tests on isolated fixtures | No Git commit pin, CI release job or publication; frozen archive remains pre-fix |
| Unity observation adapter | `unity/packages/com.architect.brain-unity` (Editor menu) | `architect-unity-observation/1` | Standalone 6000.0.84f1 SDK compile (06/10) | Unity import/menu/Play not run; live Assistant Unity MCP binding pending |
| Native Unity execution and campaigns | `src/unity`, round2/comparison scripts | historical protocols | Historical evidence only (walking skeleton 01/10; R1 A/B/C invalid) | Unaccepted: full M1a, M1b, M1c, M1d/F1, F2, F9, T22 |
| Planning / GDD / specs | `src/contracts/brain-planning.ts`, portable templates | `0.6.0` records | Schema tests only | No planning engine; semantic Ready not enforced |
| Evaluation | `src/evaluation`, `src/benchmark`; `cli.js semantic-*` | Phase 3 protocols | Phase 3 conditional closure (owner-accepted, not production PASS) | No valid whole-Brain benefit evidence; T22 open |
| Specialist game/UI skills | two generic portable skills plus the catalog | skill `0.2.0-preview.1` | `context-skills` | Specialist UI/scene/save/verify skills are later work |

## Milestones (reference only)

Order and gates follow the roadmap's 03/10 decision: M0 → M1a → M1b → M1c → M2 → M3 → M4, with M1d gated in parallel and T22 unwaived. R7 FIRST/COLD remains a scoped PASS; full M1a is not accepted. **Queens is paused.** Nothing in this index or in the identity tooling advances any milestone.
