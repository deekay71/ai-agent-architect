# Phase 3 native failure analysis

Read-only diagnosis, 2026-09-28. The native result remains **Replan**. This analysis neither changes labels nor repairs artifacts, and does not authorize retries or a new acceptance run.

## Observed distribution

Sol assessed 24 of 300 planned outputs: 15 passed and nine failed. All nine failures belong to `hnew-102`, repeat 0. Each allowance (64,000 / 80,000 / 160,000 bytes) has one failure in R, C1 and C3. F passed at all three allowances. The other twelve assessed outputs, `hnew-101` across F/R/C1/C3 and all three allowances, passed. These counts describe the assessed prefix, not the full campaign's quality.

## Source selection and candidate behavior

All nine failures selected the same topK3 payload: `hdoc-102-e1`, `hdoc-102-d6`, `hdoc-102-d5`. Required source `hdoc-102-e2` was missing. Recall@10 was 1, but selected recall was 0.5 and precision was 1/3. The missing source supplies the proposed fragment placement (3/2/1 across racks); losing the rack with three fragments leaves three, below the reconstruction threshold of four. F retained both required sources and passed.

Eight candidates abstained appropriately for their incomplete visible context. Their end-to-end result still fails because this is an answerable case whose required source was available to the system. `codex-00014` (C1, 64,000 bytes) instead answered “Yes—provided…” without the proposed map; Sol identified the unsupported affirmative conclusion. No allowance hit, canonical loss or reported-token stop was observed in these twelve `hnew-102` trials. Evidence/revision failures reflect missing required citation and revision for `e2`; the cited `e1` revision was correct, with no observed stale-source reuse.

The reducer counts missing required evidence/revision as `hardChecksPass=false`, producing nine reported hard-gate failures. This count must not be described as nine candidate false accepts: eight candidates abstained, and one supplied an unsupported affirmative answer.

## Evaluator failures

- `codex-00023` (R, 160,000 bytes) has `abstentionAppropriate=false`, while its rationale explicitly says abstaining is appropriate because the proposed map is absent. This boolean/rationale disagreement does not change the failed end-to-end outcome, which independently lacks required evidence.
- Judgment batch index 4 returned five judgments for six requested IDs, omitting `item-95516a59d69ae130e61b7b4e`. The coverage parser rejected the entire batch and stopped with `invalid-judge-output`. The remaining 276 outputs are unassessed, including the five judgments in that rejected batch; they cannot be silently accepted or repaired.

## Next DEV regression work

1. Add a synthetic two-required-source scenario with eight distractors to inspect ranking/topK and selected-context sufficiency. Distinguish safe abstention under missing context from unsupported affirmative conclusions.
2. Cover exact batch ID membership/cardinality, omitted/duplicate/extra IDs and whole-batch stopping. Evaluate fixed cardinality/ID schema constraints only in a new implementation version.
3. Report gathering failure, disposition failure, missing citation/revision and semantic false acceptance separately; add explicit handling or review for boolean/rationale disagreements.

The observed set is now exposed regression material. Preserve its original labels, requests, outputs, receipts and protocol. Any changed candidate, retrieval policy or evaluator requires a new version/lock, explicit bounded measurement scope and an untouched acceptance check; this diagnosis supplies no retrospective PASS.

## Sources and limits

Inspected local evidence: `.local/phase3-acceptance-v1/judgments/report.json`, `inputs.json`, `calls.jsonl`, `request-4.json`, and `campaign/report.json`; candidate contexts and source text were read from the already-exposed judgment inputs. Trial IDs were matched to judgment IDs using the existing canonical SHA-256 mapping. Inspected implementation: `src/evaluation/semantic-judgment.ts` and `src/evaluation/codex-judgment.ts`.

No labels, artifacts, protocol or implementation were edited during diagnosis; no model calls, builds or tests were run. This records AI analysis of the available evidence, not human attestation or a complete assessment of the remaining outputs. Only this documentation file was added afterward.
