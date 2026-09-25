# Phase 2 framework spikes

Executable, optional experiments for T07/T18. Dependencies and lockfiles remain
inside this directory; the main application's package manifest is unchanged.
No API key, paid model, cloud service or Unity installation is used.

From the repository root:

```sh
sh spikes/phase2/run.sh install --frozen-lockfile --ignore-scripts
sh spikes/phase2/run.sh rebuild better-sqlite3
sh spikes/phase2/run.sh run langgraph
sh spikes/phase2/run.sh run promptfoo

# Compare the actual native runner using fresh app build + macOS recovery tests
./scripts/dev.sh exec node spikes/phase2/native/run.mjs
```

Node 24 and pnpm 11.19.0 are required. `run.sh` can use the Codex-bundled Node
when Node is absent from PATH. `pnpm-workspace.yaml` permits only the native
`better-sqlite3` build. Package installation and native prebuilt download may
use the network; experiment child processes receive a reduced environment,
disabled telemetry/tracing, and a Node API network guard. This guard is fixture
defence, not an OS sandbox. Runtime data stays in ignored `.runtime/`.

`langgraph` uses the official SQLite saver with `durability: "sync"`. It launches
fresh child processes, injects a branch failure, and SIGKILLs a worker after a
physical effect. A naive retry duplicates the effect. A separate operation
ledger blocks the ambiguous retry until an explicit independent fixture
observation reconciles it. The ledger is application code, not a guarantee
provided by LangGraph.

`promptfoo` runs a local deterministic provider through both Node API and CLI.
The dataset, assertion, provider and configuration are pinned in
`promptfoo/fixture-lock.json` before evaluation. Oracle labels are only used by
the report wrapper, never by the provider/assertion. Nine fixed cases are
classified as ALLOW, REJECT or UNKNOWN. Raw CLI exit **100 is expected** because
invalid/ambiguous candidate outputs fail acceptance assertions; wrapper exit 0
means every decision matched its independently supplied fixture label.

Evidence is written to `evidence/langgraph-results.json`,
`evidence/promptfoo-results.json`, and raw Promptfoo API/CLI JSON exports. The
reports contain attempts, failures and counts, including false accepts, false
rejects and ambiguous accepts. These are small deterministic adapter tests,
not a semantic benchmark or release certificate. Re-running overwrites the
local reports and resets the LangGraph experiment's own runtime directory.

The native comparison additionally writes `evidence/native-results.json`,
`evidence/native-recovery.tap` and `evidence/native-build.log`. It invokes the
application's actual recovery suite; it does not implement a second native
runner. macOS-specific tests must run without skips for this comparison.

Read [the decision report](../../docs/phase-2-framework-spikes.md) for sources,
observations, limitations and the recommendation.
