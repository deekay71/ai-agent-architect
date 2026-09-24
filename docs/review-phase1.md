# Independent Phase 1 review

Review date: 2026-09-24. Scope: `src/foundation/audit.ts`, canonical schemas/hash implementation, skill catalog/resolver integration and `docs/phase-1-acceptance.md`. The reviewer did not implement these modules. This review treats OS isolation, persistent runtime/dispatch, Unity and benchmark certification as deferred work; none is demanded by these findings.

**Current review result: the four initial findings are closed for the tested Phase 1 static scope; see the closure record below. Initial result before fixes: changes were required before closing the integrated conformance AC.** The separate catalog APIs have meaningful pin/path/drift tests, and canonical JSON handles non-JSON values, cycles, sparse arrays and self-digest omission carefully. The issues below concern false-positive **static conformance** results. `dispatchAuthorized` remains false in every repro, so these are not claims of actual unauthorized execution.

The initial adversarial run tested 12 individually mutated copies of `createFoundationScenario()` while leaving `authority` unchanged. All 12 incorrectly returned `valid: true, issues: []`. Portable repo repro: `docs/evidence/review/adversarial.mjs`; initial results: `docs/evidence/review/adversarial-before.json`; source digests: `docs/evidence/review/source-pins-before.json`. The root's existing 68 passing tests did not exercise these self-consistent mutation cases. The reviewer did not interpret that count as benchmark PASS.

## [P1] Gate input versions are not bound back to current task/context content

**AC affected:** F04/F05; R2 F1-07/F1-08. Initial source location: `audit.ts:159`, alongside task/manifest digest checks at the beginning of the function.

The audit compares `gate.inputVersions` to `authority.expectedInputs`, but never verifies that those trusted input digests equal the actual TaskSpec and ContextManifest in the candidate bundle. The candidate can alter a goal or widen `TaskSpec.allowedPaths`, update `ContextManifest.taskSpecDigest`, recompute its manifest digest and the three downstream context digest fields, and retain the original trusted GateReport and input versions. The audit still reports valid.

Repro cases: `gate with OLD task/context input digests accepts CHANGED goal` and `gate with OLD task/context inputs accepts task + handoff path widening`. In the second, add `policy` to task/manifest/handoff allowed roots and set ToolCall allowedPaths to `policy`. No authority record, GateReport or plan content is changed.

**Consequence:** A valid report for the old reviewed inputs can support a different current goal/context/scope in the conformance chain, contrary to stale-input rejection.

**Fix:** Build an expected current binding map for required canonical inputs (TaskSpec, ContextManifest and any required plan/environment/skill dependencies), verify reference uniqueness/completeness, and compare each actual content digest/version to the corresponding trusted GateReport input. If the authority directly pins TaskSpec digest/scope, verify that too; do not trust self-resealed candidate digests alone.

**Acceptance:** Both mutations must fail without requiring a changed issuer or authority. A new valid input version must require correspondingly reviewed/gated authoritative records, not just candidate rehashing.

## [P1] Integrated skill audit bypasses the reviewed catalog and compatibility decision

**AC affected:** F04/F07/F08; R2 F1-11/F1-14/F1-16. Initial source location: `audit.ts:253–269`.

The catalog API pins descriptors, rejects forged selections and requires the body to load before creating a binding. The integrated audit does not consume those guarantees. It accepts a caller-provided descriptor and binding if their hashes agree with each other. There is no independent descriptor/profile pin in `AuditAuthority`, and eligibility rules are not rechecked here.

Repro cases, each with authority unchanged:

- Replace descriptor source URL/revision and resource contentHash, recompute package/descriptor digest and loaded resource list: valid.
- Set `ProjectProfile.editorVersion` to `9999.0.0`, recompute only `SkillBinding.projectProfileDigest`: valid despite descriptor compatibility requiring `6000.0.0f1`.
- Add a declared reference and set loadedResources to only that reference, then self-reseal descriptor digest: valid although the skill body was never represented as loaded.

**Consequence:** Passing the separate catalog API is optional from the static integrated validator's perspective; a forged/self-sealed or incompatible package can appear to have a conforming handoff.

**Fix:** Bind the integrated audit to a separately trusted catalog descriptor pin and observed profile/selection record, or a verified catalog-issued validation result with an unforgeable in-process handle for this scaffold. Reuse eligibility logic rather than creating inconsistent duplicate checks. Require the body and match actual loaded resources/manifest. Keep metadata eligibility distinct from certification and runtime permission.

**Acceptance:** All three mutations fail; candidate lifecycle and target-only/unknown prerequisite profile must also fail a completed invocation binding where actual eligibility is required. Genuine catalog-issued body-loaded selection remains valid. No production PolicyRelease should be invented by this fix.

## [P2] Operation, target, permission and recovery records are only partially joined

**AC affected:** F04/F05; R2 F1-08/F1-10. Initial source location: `audit.ts:195–216`.

Four independent malformed data chains pass the current audit:

1. `OwnershipRecord.resourceId = 'other-project'` while runId is unchanged; only run and owned state are checked.
2. ToolCall allowedCommands is replaced with `arbitrary-shell` and networkDestinations with an unapproved host; path checking alone does not bind the call to the approved step/tool capability or permission policy.
3. The matched OperationRecord attempt status is changed to failed while operation remains COMMITTED and ToolResult remains succeeded; attempt identity is checked, but terminal result/status/receipt coherence is not.
4. ToolResult workspace digest changes for a `readOnly` operation; no consistency check rejects the changed snapshot.

**Consequence:** The fixture audit can report a coherent chain while ownership refers to another resource, permission scope is broader than the plan, or committed operation history contradicts the result. These checks are structural/semantic data checks feasible in Phase 1; they do not require an OS lock implementation.

**Fix:** Cross-bind owner resource to project; bind call capability/tool/version/permissions to the PlanStep and approved registry; compare the matched attempt's result/status/times with ToolResult; validate receipt/postcondition identity and workspace semantics by recovery mode. If a field lacks enough identity in the current schema, add the smallest explicit contract binding rather than infer permission from a free-text toolVersion.

**Acceptance:** Four cases fail independently with a valid baseline still accepted. Do not assert every mutating result must retain the pre-mutation digest; the unchanged-workspace check in this repro is specifically for readOnly mode.

## [P2] Several provenance/checkpoint references can be invented without detection

**AC affected:** F04/F06; R2 F1-08/F1-10. Initial source location: context evidence loop and checkpoint checks in `audit.ts`.

Independent repros accepted `ContextBundle.snapshotId = 'snapshot-other'`, an invented checkpoint completedNodeId, or a nonexistent evidence sourceRef/sourceRevision (with the manifest correctly rehashed). The evidence contentHash check does not validate these provenance fields, and checkpoint only requires plan/context refs rather than validating its node references.

**Fix/acceptance:** Bind snapshot ID/digest to the authority's selected snapshot and operation/result scope; check checkpoint node IDs against the workflow/plan's allowed node registry (explicitly distinguish workflow nodes from plan steps if they differ); verify evidence source IDs/revisions via canonical SourceRecords. Each malformed case should fail. A trusted reference store may contain multiple records, so validation should follow actual used references rather than validating one representative record only.

## Scope and release note

These findings do not ask for full context hydration, semantic judge calibration, Unity execution, remote cryptographic signatures or distributed locking. Keep those deferred. The local audit must nevertheless verify the bindings it claims to audit. Until fixed, record F04/F05/F07/F08 as incomplete at the integrated level rather than weakening the AC or treating 68 unit tests as complete coverage.

Root is implementing fixes after receiving the repros. This document records the **initial** findings; closure requires rerunning the adversarial cases and retaining the results. Review of the CLI/mock workflow follows once that code exists; the initial cut did not include its implementation.


## Independent closure record — 2026-09-24

The implementer updated the bindings and added regression coverage; the independent reviewer reran the original reproducer without weakening its mutations.

- Positive baseline: valid with 26 parsed contracts, no issues and `dispatchAuthorized:false`.
- Original 12 adversarial mutations: **12/12 rejected**. Results are retained in `docs/evidence/review/adversarial-after.json`.
- Three further targeted checks: an independently updated reviewed catalog version cannot reuse an old gate; a new observed profile cannot reuse an old gate even if metadata-compatible; absent receipts cannot mask contradictory postconditions. **3/3 rejected**; portable script/output are `docs/evidence/review/followup.mjs` and `docs/evidence/review/followup-after.json`. These registry-update tests deliberately update registry pins while leaving the old gate unchanged.
- Independent `./scripts/dev.sh check`: TypeScript build succeeded; **105 tests passed, 0 failed, 0 skipped**. This is local automated validation, not a skill-benefit benchmark or production reliability claim.
- Inspected the added integration test that actually loads a pinned on-disk catalog, resolves a selection, loads its body, creates a binding and feeds it into static audit. It accepts the legitimate fixture and rejects a subsequently substituted body. This closes the gap between separate catalog and audit happy paths.
- CLI/mock workflow review found no additional blocking issue in its explicit offline scope. It stops on failed preflight or a changed plan, never authorizes production dispatch and does not invoke Unity/model/network or execute skill scripts.

Fix assessment:

| Finding | Closure evidence | Status |
|---|---|---|
| P1 stale gate/current inputs | Separately pinned task digest plus currentGateInputs over task, manifest, plan, descriptor, profile, full loaded selection and environment; unique/complete refs; original and later registry-update cases reject | Closed for tested Phase 1 scope |
| P1 catalog/eligibility bypass | Independent descriptor/profile/selection pins; shared eligibility evaluator reused by resolver/audit; required body check; real catalog→binding→audit integration | Closed for tested Phase 1 scope |
| P2 operation/scope/recovery joins | Explicit capability/tool/version/implementation/target fields, registered tool permissions/path arguments, owner project, attempt/result timestamps/status/ref, coherent receipt/postconditions and recovery-mode snapshot checks | Closed for tested Phase 1 scope |
| P2 provenance/checkpoint joins | Selected snapshot authority, evidence source/revision provenance, registered workflow nodes/lineage refs; used source freshness and evidence attestations/artifacts followed | Closed for tested Phase 1 scope |

The shared compatibility evaluator correctly blocks **required** unknown prerequisites without banning unrelated unknown Unity fields in a generic offline skill. Source hashes at the recheck are recorded in `docs/evidence/review/source-pins-after.json`. Initial evidence is retained rather than overwritten.

This closure does not activate any real PolicyRelease, issue a runtime GateReport or approve T22/game implementation. Persistent stores, dispatch-time isolation/revalidation, fault recovery, real context hydration, calibrated semantic evaluation and Unity conformance remain deferred as documented. The review is bounded to the implementation and cases inspected; it is not proof that all future inputs or task classes are correct.


### Reproduce from a clean local checkout

After the documented dependency install and TypeScript build, run from the repository root with Node 24:

```sh
node docs/evidence/review/adversarial.mjs
node docs/evidence/review/followup.mjs
```

Both scripts import only this repository's compiled modules via relative paths, use fresh in-memory synthetic fixtures, and do not write candidate/authority files or execute external commands. The first preserves the original 12 negative cases; the second exits nonzero if any of its three targeted regressions is accepted. The captured before-results document the initial defects; rerunning against the fixed source should produce rejected cases.

Evidence files: [original cases](evidence/review/adversarial.mjs), [before](evidence/review/adversarial-before.json), [after](evidence/review/adversarial-after.json), [follow-up cases](evidence/review/followup.mjs), [follow-up results](evidence/review/followup-after.json), [source pins before](evidence/review/source-pins-before.json), [source pins after](evidence/review/source-pins-after.json).
