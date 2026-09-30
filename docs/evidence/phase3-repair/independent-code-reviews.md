# Independent repair reviews — 2026-09-30

Baseline: 664a62f02ea52df1f7c4095986ae3d1750f646ea. Reviewed working-tree changes including new files. Terra implemented selector, batch/checkpoint/DEV continuation and CLI; coordinator integrated diagnostics, replay and final admission refactor. Astra/high reviewed specification/safety; Sol/medium reviewed standards independently. These are AI code reviews, not model benchmark results or human attestations.

## Findings and disposition

| Finding | Fix | Regression evidence |
|---|---|---|
| Parent artifact changes across await were not checked | Raw file and optional absence pins before/after calls and final report | Async parent report mutation stops with binding-drift and zero own assessments |
| Parent assessment journal was trusted by indexes | Use shared receipt replay; require exact journal equality | Forged empty journal/report rows rejected before dispatch |
| Claim was consumed before ledger checks | Ledger/output/read-only validation precedes exclusive claim | Erased history rejected with no continuation claim |
| Resume receipt/native configuration/completion/order checks were weaker than downstream replay | Remove duplicated admission parser; call replayCodexJudgments before ledger/claim/dispatch | Paired native config forgery, reordered calls and invalid completion rejected with no child dispatch/claim |

Astra final: no remaining blocker in SPEC/safety scope. Sol final: all reported standards findings resolved; no remaining concrete blocker. Both inspected tests but did not run them; coordinator verification is recorded separately. Approval applies to local repair readiness only.

## Reviewed final source pins

- `src/evaluation/codex-judgment.ts`: `sha256:0d4df5a638b4a8a10fe42e4146b89e3f58cdea816de832626badb1656b9f4504`
- `src/evaluation/acceptance-evidence.ts`: `sha256:ceec8c4363dca22c87bb7cabdd457586bf2509331ac0c3e88f552196846aa47c`
- `src/evaluation/acceptance-diagnostics.ts`: `sha256:153c8e3c6ac6a5beb10a924347829126ab380619e4c7d0e543b240c818e17d5c`
- `src/evaluation/context-arms.ts`: `sha256:29942cb7b501221b54e30003035a6f69d4629b908961ebad1938d45bc8d0fb50`
- `src/evaluation/semantic-judgment.ts`: `sha256:62418dbbf2c424c22438af0490148349ef21ae861d2c4afaa762144bd640fedf`

## Retained limitations

DEV continuation is one hop from a finalized parent; no crash-before-report recovery, no child-of-child, no calibration/holdout resume, no unknown/failed retry. Post-claim I/O failure remains fail-closed. Pending issue records block PASS; independent acceptance-adjudication resolution is not implemented. These limitations remain open work, not claims of a general recovery solution. Native v1 and expired authorization are unchanged.
