# Phase 3 acceptance handoff runbook

This runbook closes the finite authored infrastructure starter only. It does not authorize a production release, Unity/game execution, or Phase 4. The current prepared state has **not** run the live calibration, holdout campaign, blind holdout judgment, or T14 trace. No PASS, human review, or measured result is implied by this document.

The owner’s five closure items are handled as follows:

1. **Protocol freeze — Astra and coordinator:** freeze scope, criteria, matrix, models, source/build/dataset/review pins and the shared authorization before holdout dispatch.
2. **Independent calibration — Astra author, Sol reviewer/judge:** prepare fresh controls, review labels independently before the native check, and retain every disagreement. No label repair from grader outputs.
3. **Formal runner and adjudication — Terra implementer, Astra/Sol reviewers, coordinator operator:** execute durable calls, replay receipts, enforce the frozen denominators and issue only bounded acceptance evidence.
4. **Fresh holdout matrix — Astra dataset author, Sol independent reviewer, Terra reader, Sol blind judge:** run 240 main comparisons plus 60 G controls after freeze, with three allowances, two repeats, long history, unanswerable/conflict cases and recorded retrieval metrics.
5. **T14 and delivery — Terra bridge/test implementer, coordinator integrator:** use accepted T19/T11 versions for the real Memory trace, then record the phase gate and distribute the report, source, receipts and next-step handoff to Notion/Drive.

Each agent's model follows the owner's routing: Terra `gpt-5.6-terra` medium for execution, Sol `gpt-6-sol` medium for review/judgment, Astra `gpt-6-astra` high for deep specification review. The coordinator integrates their work. Synthetic tests do not count as native model measurements.

The operator must use the repository’s shared ledger at `.local/codex-subscription-usage`. Do not delete, rename, replace, or point commands at another usage root. Unknown or interrupted attempts freeze that authorization; changing an output directory never creates a retry allowance. No API key, API purchase, or secret is needed for this subscription route.

Run commands from the repository root after building the current source. Every output path below must be new.

```sh
./scripts/dev.sh run build

./scripts/dev.sh exec node dist/src/cli.js semantic-codex-calibration-run \
  .local/phase3-acceptance-calibration-v1 \
  .local/phase3-acceptance-v1/calibration-config.json \
  .local/phase3-acceptance-calibration-sol-v1 --live

./scripts/dev.sh exec node dist/src/cli.js semantic-codex-acceptance-freeze \
  .local/phase3-acceptance-v1/protocol.json \
  .local/phase3-acceptance-v1/frozen.json

./scripts/dev.sh exec node dist/src/cli.js semantic-codex-acceptance-run \
  .local/phase3-acceptance-v1/protocol.json \
  .local/phase3-acceptance-v1/frozen.json \
  .local/phase3-acceptance-v1/campaign --live

./scripts/dev.sh exec node dist/src/cli.js semantic-codex-acceptance-judge \
  .local/phase3-acceptance-v1/protocol.json \
  .local/phase3-acceptance-v1/frozen.json \
  .local/phase3-acceptance-v1/campaign \
  .local/phase3-acceptance-v1/judgments --live

./scripts/dev.sh exec node dist/src/cli.js semantic-codex-acceptance-close \
  .local/phase3-acceptance-v1/protocol.json \
  .local/phase3-acceptance-v1/frozen.json \
  .local/phase3-acceptance-v1/campaign \
  .local/phase3-acceptance-v1/judgments \
  .local/phase3-acceptance-v1/closure
```

The order matters. Calibration must complete with its frozen reviewed inputs and the shared authorization before freeze. Freeze validates the sealed dataset, source/build/prompt pins, protocol criteria, independent review, and calibration result. The campaign records all 240 comparisons and 60 G controls, subject to the 540 Terra-call ceiling. Sol receives blinded task/context/answer inputs; labels and gold remain host-only. Closing recomputes the evidence, applies all-planned denominators, and runs T14 only if the finite gate produces verified evidence.

## V1 actual handoff status

All five implementation items were exercised in v1: protocol/calibration, campaign, blind judgment dispatch, closure evaluation, and the bounded T14 bridge. The gate did not close. Terra completed 240 main trials and 60 G controls. Sol’s fifth batch returned 5 of 6 required IDs, producing `invalid-judge-output`; only 24 of 300 assessments were valid and 276 remained unassessed. The closure recorded T19 `Replan`, T11 `Replan`, T14 `Not evaluated`, and Phase `Replan`.

The v1 frozen protocol has no valid resume or adjudication consumer for the incomplete judgment output. Preserve all v1 receipts, logs, locks, ledger history, and closure artifact. Do not relabel the missing item, retry selected work, or use a local T14 pass as native evidence. Recovery requires a new version with DEV regression, exact coverage schema, checkpoint/resume behavior, adjudication bindings, and fresh verification before a new freeze.

Stop and preserve all outputs if any command returns a nonzero exit status, reports `stoppedReason`, detects drift, rejects an exposure, or cannot complete its planned coverage. Do not alter thresholds, inputs, lock files, output receipts, or the ledger to continue. Create a new protocol and retain the failed artifacts only after the cause is understood and the authorized scope is explicitly updated.

The finite gate requires the pinned calibration criteria, all planned main strata, required correct abstentions, zero hard-gate violations, native receipt evidence, and the linked T14 promotion/revocation trace. A successful closure records AI reviewer provenance and `humanAttestation: null`; it remains `releaseEligible: false`. The next phase requires a separate scope decision and T22 before any game or runtime execution.
