# S2 A/B/C R1 invalid-run handoff — 30/09/2026

Frozen protocol planning artifacts are complete, but execution readiness is revoked. R1 stopped after A10, B reuse10 and C9. Every runtime MCP call had zero Unity broker receipts; the main verifier silently fell back to an external host. Its test passes are real external-test evidence, not valid A/B/C comparison evidence. Native execution also treated an item as completed without surfacing the tool error.

The run should have stopped after two A infrastructure failures. The later audit is the actual stop reason; `quota-stop` in the raw summary is a generic STOP label. Do not retain, simplify, batch-2, or otherwise decide Brain from R1. Conditional model approval persists, but Ready is blocked and no rerun has been performed.

Measured, descriptive data: 20 Sol requests and 19 tool-enabled Terra sessions (internal model responses vary), 1,616,535 raw tokens including 1,238,400 cached-input subset, and 31.00375 credits from known receipts in `summary.json`. The benchmark cap was not exceeded: benchmark quota moved 24→26 (+2pp). The preparation goal failed: whole-turn quota moved 16→24 (+8pp versus ≤3pp target). Post-audit it was 28% at 06:08 UTC (+12pp overall), with other activity included and 5h unknown. The empirical 15.501875 credits/pp is noisy and not trusted calibration.

S1 CLI evidence remains Pass. Direct app-server MCP preflight passed with 0 model calls, and the local fix checks passed 19 target TypeScript and 6 Python tests. The causal model-path error is unrecoverable from old logs, so this evidence cannot restore R1. Commits and push remain within existing authorization; Git push currently needs working credentials after the temporary key was revoked.

Evidence: [summary](evidence/unity-abc-20260930-r1/summary.json), [runtime report](evidence/unity-abc-20260930-r1/report.json), [S1 evidence](evidence/unity-s1-20260930/results.json).
