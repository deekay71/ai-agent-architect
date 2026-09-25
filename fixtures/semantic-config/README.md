# Local semantic campaign configuration

`local.json` runs the 20-case development split with the sandboxed mock counter and abstaining fixture reader. It makes no model request, reads no API credential, and authorizes zero spend. The two profile names describe the intended planner/executor routing for a later reviewed live campaign; mock outputs are not model quality evidence.

The matrix includes both profiles, three whole-trial token budgets (8,192 / 16,384 / 32,768), two distractor counts (0 / 8), full context, retrieval, and compaction with one or three rounds: 960 development comparison trials plus 120 gold-evidence control trials. The configured input ceiling of 100,000 and output cap of 512 are campaign admission limits, not claims about official model context or output capacity.

Pricing fields pin the supplied 2026-09-25 standard per-million-token rates and source URL for a future campaign record. Mock usage is simulated and incurs no provider charge. A live configuration needs an explicit nonzero spend authorization, external review covering its selected split, calibrated thresholds, and the `--live` opt-in. The CLI checks readiness before reading an API credential or constructing a live provider. Do not edit this zero-spend mock fixture into a live campaign in place; preserve the local configuration and create a separately reviewed configuration.

From the repository root after a build:

```sh
node dist/src/cli.js semantic-preflight fixtures/semantic-benchmark fixtures/semantic-config/local.json
mkdir -p .local
node dist/src/cli.js semantic-run fixtures/semantic-benchmark fixtures/semantic-config/local.json .local/semantic-campaign-001 .local/semantic-spend
node dist/src/cli.js semantic-review-import fixtures/semantic-benchmark /absolute/path/to/external-human-review.json
```

Use a new output directory and campaign ID for each attempt. Preserve prior campaign output and the spend ledger; a retry must not reset the same logical authorization. Importing a human review records evidence and coverage, and does not issue a release or Phase 3 PASS.
