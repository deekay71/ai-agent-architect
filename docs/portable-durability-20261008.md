# Portable durability — accepted offline repair

The accepted aggregate patch is applied to the original Architect working tree. Its SHA-256 is
`1e5ac3d0095f419fcc61947005bead4d858512f816df00ae52c7c97102b433a6`.
The Git preparation retains these exact postimages:

| Source path | Accepted SHA-256 |
|---|---|
| fixtures/portable-session.ts | bceae9da041d04de48b34c380fb6f1e218ffcb5ec739b6842873c7cecc7af0d7 |
| src/portable/brain.ts | 590b77f61fc816e234048f8a13ca3f5ee5ac6e89fbe31bb717262bef6bc507c5 |
| test/portable-durability.test.ts | 7901c4d6b9a5c9bee12c3da912b9542912724751432ae61aa6f4a81322723c1b |

## Resulting behavior

Canonical Memory determines portable file-revalidation coverage. Plan artifacts persist their exact content and digest; a new process hydrates and verifies their task/plan bindings before continuation. Handoff and resume verify those records. The canonical session commit precedes its convenience projection.

An identical-plan retry verifies the pinned existing record and reconstructs its return from canonical data. A corrupt record cannot inject a changed task or return executionAuthorized:true. Healthy retry and changed-content versioning remain supported.

Legacy v1 task/handoff data without artifact pins needs re-recording. No automatic migration, universal orphan-safety or semantic acceptance is established.

## Evidence and Git source scope

[Accepted application evidence](evidence/portable-20261008/accepted-application.json) records the original application verification: 190/190 relevant regressions, 15/15 independent R1 probes and a fresh-process portable CLI public-export probe passed. 507 reviewed build files matched; the original dist total was 509 because two historical extra outputs were preserved. The earlier isolated 26/26 durability matrix was not rerun during application.

The offline application modified exactly the three paths above and preserved the original index, HEAD and unrelated source. Prepared Git delivery also includes the earlier portable foundations, source-controlled CLI, setup and declared packaging scope; these delivery changes are distinct from the accepted three-file repair. [Combined source checks](evidence/portable-20261006/git-source-checks.json) record preparation verification separately.

The prepared source is based on cached origin/main bcb2ea8128b1835704b506509fe0cc2d5d9845df. Live remote access has not been verified. There is no new Git commit, branch, push or PR yet; no Git commit SHA is inferred from the aggregate patch hash.

Existing preview ZIP/TGZ files remain historical and do not acquire this repair. The declared future payload includes portable-durability tests and excludes the unused lock-identity proposal. Any release must be built from the exact final clean commit and receive its own inventory/hash/validation.

## Limits

This is offline durability evidence, not whole Architect acceptance. Native Unity import/compile/Play, real model/native cross-session tasks, full M1/T22, authenticated principals/direct-store authority, semantic Ready fitness, full Brain composition, performance/cost/load and comparative benefit remain pending. Changed-content predecessor corruption and broader cross-store orphan handling remain separate limitations.

Queens remains paused. Existing Unity foundations and project instructions are preserved. Ongoing isolated Claude F11/F14 candidates are outside this source scope and have not been read, copied or published.
