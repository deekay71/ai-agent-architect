# Architect Brain 0.2.0-preview.1 — Git-first setup

This is a local, private preview distribution. The Node host contains the existing Context, persistent Memory/Knowledge, contracts, role-separated promotion, planning/runtime evaluators, skill catalog and durable mechanical runtime, plus project bootstrap and fresh-session integration. The UPM package is only a Unity Editor observation adapter. Native turns/tools remain below Brain; no provider migration or paid model activation is performed.

## Use the repository at a reviewed commit

Git is the primary source/install path: https://github.com/deekay71/ai-agent-architect.git. The portable feature branch is a proposal until pushed and reviewed; do not assume it is already available remotely. Clone the repository, check out the reviewed commit explicitly, and keep this checkout outside Unity auto-import folders.

With Node 24.x and pnpm 11.19.0 already available, use the lockfile and source-controlled entry:

```sh
cd <architect-checkout>
git checkout --detach <reviewed-commit-sha>
pnpm install --frozen-lockfile --ignore-scripts
pnpm run build
node scripts/architect.mjs bootstrap --project <existing-unity-project-root>
node scripts/architect.mjs status --project <existing-unity-project-root>
node scripts/architect.mjs resume --project <existing-unity-project-root>
```

`pnpm run brain bootstrap --project <root>` uses the same entry. Verify `git rev-parse HEAD` and the reviewed source diff before bootstrap. Installation requires dependency retrieval unless the pinned dependencies are already present; an archive may instead provide an offline compiled host.

Without pnpm (dependencies already present in `node_modules`), build with Node 24 directly:

```sh
node node_modules/typescript/bin/tsc -p tsconfig.json
node scripts/write-build-identity.mjs
```

`write-build-identity.mjs` runs the same fresh in-memory parity check as `verify-portable-identity.mjs` and only then records `dist/BUILD_IDENTITY.json`. Before every command, `scripts/architect.mjs` re-hashes the source inventory and the packaged `dist` outputs against that record and refuses with `PORTABLE_DIST_STALE` when either changed (for example a source edit without a rebuild). A missing record or a Node major other than 24 is reported on stderr. A `tsc`-only rebuild also needs `node scripts/write-build-identity.mjs` afterwards; `PORTABLE_DIST_STALE` says whether the source or the dist changed and prints that command. `ARCHITECT_ALLOW_UNVERIFIED_DIST=1` runs a mismatched dist anyway and says so on stderr. Archives are unaffected: they carry their own validated `BUILD_IDENTITY.json`.

Choose the project explicitly. Read its instructions and existing foundation before any integration. Bootstrap preserves its gameplay source, package manifest, settings and unrelated skills; it does not authorize framework replacement or invent a game design. Project-local `.architect` identities/stores/observations/handoffs are working data; do not add them to the Architect source commit or transplant them between projects.

For the adapter, select `<architect-checkout>/unity/packages/com.architect.brain-unity/package.json` with Package Manager Add package from disk only when the exact import is authorized. Native import/Play is still pending.

## Supported boundary

- Host requires an already available **Node 24.x**, including `node:sqlite`. Zod 4.1.12 is vendored with its license; no npm/pnpm install or internet is needed to consume this archive. Source development remains TypeScript 5.9.3 with the repo's pinned toolchain.
- Offline host checks have been run on macOS with Node 24.19.0. Other operating systems are untested. The old mechanical subprocess runtime needs macOS `/usr/bin/sandbox-exec` and Python; it is not a general Unity executor. Its existing HOME-dependent lock behavior and F9 activation remain explicit limitations.
- UPM declares Unity **6000.0** minimum. Adapter source is standalone-compiled with the **6000.0.84f1 SDK**. Actual Package Manager import, menu execution, native compile, Play, platforms and other Editor versions are pending. No third-party UPM dependencies are required by this adapter.
- Package presence does not establish active render pipeline, UI/input settings or build target. Host detection keeps these unknown until an actual observation supplies them. No saved PID is installed.

## Optional archive: verify and bootstrap

Extract the archive outside all Unity `Assets`/`Packages` auto-import folders. Verify it before use:

```sh
node <distribution>/verify-distribution.mjs
node <distribution>/host/bin/architect.mjs bootstrap --project <fresh-unity-project-root>
node <distribution>/host/bin/architect.mjs status --project <fresh-unity-project-root>
node <distribution>/host/bin/architect.mjs resume --project <fresh-unity-project-root>
```

`source/` is a pinned inspection subset. Rebuild using the existing repository's full source, fixtures and pinned TypeScript toolchain; this archive is consumed through its already compiled host and vendored runtime dependency.

Replace angle-bracket placeholders with explicit paths. The project must already have `Assets`, `Packages/manifest.json` and `ProjectSettings/ProjectVersion.txt`; bootstrap does not create a Unity project or repo. It adds only `.architect` files and the two namespaced `.agents/skills` folders; it preflights conflicts and preserves existing AGENTS, source, packages, settings and unrelated skills. Repeating bootstrap preserves project/lineage IDs and writes nothing. Interrupted/partial bootstrap fails on conflicts; inspect and repair only its declared created files, rather than using an automatic cleanup.

Memory/session data stays under this project's `.architect/data`. It is project-local working data, not a protected owner/authority/verdict store. Do not copy `.architect/data`, project IDs or session handoffs into another project; bootstrap the new project independently. Protect live authority/oracle/budget according to existing host policy before any automated dispatch. This preview does not establish F1/F2/M1d isolation. No global configuration, credential, permissions or active harness are changed.

## Import the Unity adapter when this exact native action is authorized

In the authorized fresh project, use Package Manager → **Add package from disk** and select `unity-package/com.architect.brain-unity/package.json`. The same package is supplied as `unity-adapter-0.2.0-preview.1.tgz`. Import only the UPM adapter. Keep the Node host, source snapshots, historical fixtures, evidence and offline test artifacts outside Unity auto-import paths.

There is no Editor startup hook and no Play/build/network/subprocess action. After host bootstrap, the explicit menu **Tools → AI Agent Brain → Export Editor Observation** writes a new `.architect/observations/<id>.json`. It reports project/Editor/scene/package metadata and labels its assurance. It is project-produced data; it does not prove independent verification, gameplay or input. This menu has not yet been run in Unity for this release.

For native operations, the NEW agent session must actually expose **Assistant Unity MCP**. Use a harmless read-only tool to verify the current project's canonical path, Editor PID and version before every binding. `bindAssistantUnity` accepts a host wrapper around the actually exposed tools and rejects missing tools, wrong project and session drift. It contains no transport installer, discovery-by-secret or CLI fallback. The CLI `status` command intentionally reports MCP as unverified. Missing tools leave native actions pending while independent source work continues.

## Working with project-local Brain data

Fill `.architect/plans/game-brief.md`, `gdd.md`, `module-plan.md`, and `task-plan.md` at the applicable planning level. Bootstrap invents no gameplay and records no owner approval. Core policy and original routing metadata are supplied in `policy/` as inert references, not provider activation.

Pin source/observation bytes explicitly:

```sh
node <distribution>/host/bin/architect.mjs ingest --project <root> <project-relative-file> <source-id>
node <distribution>/host/bin/architect.mjs knowledge --project <root>
```

The ingest result contains the immutable source node ID. Allowed data paths are explicit in `.architect/project.json`. Symlinks, hardlinks, traversal, conflicts and old/revoked revisions fail closed. Repeating a current unchanged observation is idempotent. A source change invalidates dependent Knowledge/context/plan/handoff; returning to old bytes does not re-approve the old revision. Use an explicitly versioned new source/observation rather than silently restoring trust.

Supply a typed TaskSpec (`0.5.0`) under `.architect/plans/`; use the detected `projectId`, applicable task class, explicit allowed paths, constraints and automated acceptance refs. Local context accounting uses `utf8-bytes/1`, includes tool outputs and preserves reserves; it does not claim measured provider tokens. Models remain disabled. Then:

```sh
node <distribution>/host/bin/architect.mjs context --project <root> <task-json-relative-path> <required-node-id,...>
node <distribution>/host/bin/architect.mjs plan --project <root> <task-json-relative-path> <plan-markdown-relative-path> <source-node-id,...>
node <distribution>/host/bin/architect.mjs handoff --project <root> <task-id,...> '<concrete next step>'
node <distribution>/host/bin/architect.mjs resume --project <root>
```

Plan and source/checklist pins, source scope, task identity and dependencies are bound in persisted plan records. Seven-check Ready records are validated as evidence-linked **data**; `recorded_ready` is not semantic acceptance or execution authority. All portable task records retain `executionAuthorized:false` and `executionOutcome:not_started`. Canonical resume reads the durable SQLite store; `SESSION_HANDOFF.json` is a convenience projection. Live native verification/result authority must use the existing trusted caller boundary; the portable wrapper does not bypass it.

For API integrations, import `host/src/portable/index.js`. Existing APIs expose Context windows/guards, Memory source/claim/decision provenance and role-separated propose→evidence→critic→promote, planning/verifier evaluation, skill resolution and the mechanical durable runtime. Candidate text and skill bodies never grant permissions. Synthetic test actor IDs are not authentication. An owner decision requires the existing decision-source/authority path, not a `decisionBy` label alone.

Optional arguments: `resume --project <root> --summary` returns the same checks with plan text and a knowledge index but no source contents (a 15/10 project store: 7 KB instead of 48 KB). `ingest … <source-id> [document|evidence|decision]` records the source type. `plan … <source-node-id,...> [ready-checklist-json]` records a Ready checklist through the CLI; its `plan.digest` must equal the `planDigest` printed by a plan run without the checklist (the error names the expected value). `retire --project <root> <source-id> <reason>` withdraws a file source (deleted, renamed, replaced by a new id or no longer relevant); it cannot be undone, invalidates dependants and stores the reason in Memory. `log --project <root> [limit]` lists the operation journal (ingest, plan, handoff, retire, source drift) with time, process and host; any local writer can append to it, so it records, it does not prove.

Every resume/knowledge/plan output carries `trust:"untrusted-data"` and `instructionAuthority:"none"`. The previous session's next step appears as `handoffNote` with `ownerApproval:false`. Approved claims show `assurance` (local single-process role labels, review and attestation refs); a recorded Ready checklist shows `readinessAttestation:"self-recorded"`. `warnings` never block resume:
- `skill-drift`, `skill-catalog-mismatch`, `skill-missing`, `skill-outdated-template` compare installed SKILL.md bytes with bodies shipped by reviewed builds and with the project's own catalog. `context` refuses a drifted body even after its project digests were recomputed (`PORTABLE_SKILL_DRIFT`). `skill-outdated-template` is informational: the project keeps the guidance it was bootstrapped with. Do not copy a newer SKILL.md by hand; the project catalog still pins the old body and `context` fails until an upgrade path regenerates it (not provided yet).
- `task-dropped:<id>` names a task the previous handoff listed and the latest one left out; it clears at the next handoff. `tasksOutsideHandoff` lists every recorded task the latest handoff does not list (finished, abandoned or never handed off); no command closes a task yet.

A text `knowledge` query and the unfiltered listing return at most 100 nodes (sources, approved claims, plans, handoffs); check `truncated`.

## Recovery when resume is blocked

Stores are never edited by hand. Each case leaves history intact:

| Resume shows | Cause | Recovery |
|---|---|---|
| `staleSources: [id]` | A pinned file changed (also when a plan step edits a pinned file such as `Packages/manifest.json`) | `ingest` the file under the same source id, `plan` again with the current node IDs, then `handoff`. Reuse the same checklist file only if task and plan text are unchanged and none of its evidenceRefs changed; a checklist citing a superseded node fails with `PORTABLE_DEPENDENCY_UNUSABLE: <node>` — review again and cite current nodes |
| `PORTABLE_SOURCE_REVISION_NOT_CURRENT` on ingest | The file returned to bytes of an older, already superseded revision | Old trust is never restored: ingest under a new source id, `retire` the old id, `plan` with the new node, `handoff` |
| `staleSources: [id]` and the file is gone or renamed | Deleted, moved or merged file | `retire <id> "<reason>"`, then `plan` without that node and `handoff` |
| `issues: source-unreadable:<id>` (knowledge hidden); ingest/knowledge/plan/context/handoff fail with `PORTABLE_SOURCE_UNREADABLE` | A read error other than missing/replaced (permissions, I/O, open-file limit). Unverifiable bytes are never served | Fix the error and run resume again; the source was not invalidated. If the file changed meanwhile it becomes stale. If it cannot be fixed, `retire` it |
| `issues: plan-…:<task>` after one of the above | The plan's lineage points at an unusable node | `plan` again with current node IDs, then `handoff` |

## Durable plan continuation

Use the accepted source repair for canonical file revalidation and exact persisted plan hydration. Identical-plan retry, handoff and resume verify pinned records before returning data. Legacy task/handoff data without artifact pins must be re-recorded; do not treat an old archive as containing this repair. See the accepted application report and combined source checks for their distinct evidence scope.

## Exact new-session prompt

Copy the project-generated `.architect/SESSION_START.md` into the new agent request, or use `NEW_SESSION_PROMPT.md` with the explicit root/distribution path. Resume without the old chat transcript. Missing task/GDD/owner decisions remain open questions; missing native tools remain an exact MCP blocker. Keep milestone acceptance separate from this portable preview.

## Build an optional archive from the final clean commit

Use a separate clean checkout pinned to the final reviewed commit, install locked dependencies and run the build there. Send output to a new directory outside that checkout:

```sh
python3 scripts/package-portable.py --build-root . --list-payload
python3 scripts/package-portable.py --build-root . --policy-root . --output <new-output-directory>
python3 scripts/validate-portable-distribution.py --archive <new-output-directory>/architect-brain-0.2.0-preview.1.zip --build-root . --output <new-validation-directory> --node <absolute-node-24-path>
```

`portable/PAYLOAD.json` explicitly lists the source/runtime/tests/resources/adapter files. Unlisted proposals or build noise are excluded. ZIP/TGZ metadata is normalized, but payload/dependency bytes must match for the archive hash to match. Record the exact Git commit with the new validation; a content sourceRevision is not a Git commit SHA. Do not reuse the historical ZIP's hash or validation as a result for the new artifact.

## Reproducible offline checks

```sh
cd <distribution>/host
node --test test/portable.test.js test/context.test.js test/context-memory.test.js test/context-skills.test.js test/memory.test.js test/brain-planning-contracts.test.js
node --test test/runtime-recovery.test.js
```

The first command creates temporary minimal Unity-shaped filesystem fixtures, never an Editor, and performs Knowledge promotion in synthetic roles followed by a distinct-process resume/context build. The second is the existing macOS-only **mechanical fixture** recovery suite: it kills only its own spawned fixture processes, reconciles write-once file effects, checks durable attempts/budget and cleans only its own generated fixture/lock directories. It does not kill Unity or execute R11. In a restricted host, sandbox/process permissions may block it; record that result, do not infer native recovery PASS. Read `READINESS.md` for actual outcomes and outstanding gates.
