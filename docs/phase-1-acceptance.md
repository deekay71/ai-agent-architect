# Phase 1 acceptance — R2

Phase 1 is the foundation phase (old P0), covering T17, T06 and T23. These criteria are recorded before the integrated test run. The implementation is a modular monolith, with no gameplay and no dependency on a running Unity Editor.

| ID | Acceptance | Planned evidence |
|---|---|---|
| F01 | A clean local checkout installs exact dependencies, compiles and runs its CLI | Frozen lockfile install, TypeScript build, subprocess CLI smoke |
| F02 | Every canonical contract has a strict versioned executable schema; unsupported versions, extra fields and malformed conditional states are rejected | Contract fixtures and schema tests |
| F03 | Canonical hashing is deterministic, rejects non-JSON input and binds content rather than only IDs | Canonicalization tests, tamper negative cases |
| F04 | The TaskSpec → context/manifest → plan/gate/handoff → operation/evidence → memory fixture roundtrips and its cross-record references agree | Integrated fixture audit |
| F05 | Invalid issuer, inactive/out-of-scope policy, missing/unknown required checks, stale hash/input and forged evidence cannot pass the conformance audit | Adversarial integration cases |
| F06 | Contract-level constraint content/revision/scope and source/claim lifecycle are checked | Same-ID changed-content, revoked/stale source and unreviewed promotion cases |
| F07 | Skill catalog verifies pinned descriptor and resource bytes, rejects path escapes/duplicates and selects only compatible capabilities | Skill catalog/resolver tests |
| F08 | Skill discovery exposes metadata; resources load on demand with drift checks; availability never means dispatch authorization | Progressive resource tests, CLI output |
| F09 | WorkflowRunner/ModelAdapter/ToolAdapter/EvalHarness interfaces and actor/store ownership are documented; a mock task runs without network or side effects | Fake workflow, interface review, permission model tests |
| F10 | Reviewer checks implementation against scope; handoff lists what remains unimplemented | Independent review, phase report and source snapshot hash |

The evaluator here audits records against separately supplied, immutable test authorities. It does not create an active PolicyRelease, issue trusted runtime GateReports, enforce OS permissions, or run arbitrary commands. Fake release/runner/report records are synthetic test data. Conformance success means the tested foundation satisfies these criteria; it is not production reliability or T22 PASS.

Phase 2 must implement persistent operation/checkpoint stores, dispatch-time trust, protected stores/OS isolation and fault recovery. Later phases implement context hydration, multi-planning/skill benefit benchmarks, a real Unity adapter and game-domain checks. Those requirements remain in the roadmap; they are not waived by this phase.
