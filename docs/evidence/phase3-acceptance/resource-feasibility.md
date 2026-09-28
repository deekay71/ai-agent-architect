# Pre-dispatch resource forecast — 28 September 2026

Astra reviewed only current DEV request sizes and prior DEV aggregate receipts. It did not inspect fresh holdout semantics or make live calls. The protocol remains capped at 604 invocations, 10,000,000 reported tokens and three hours in a single shared authorization lineage.

- Planned: 540 reader/summary calls, 50 blind judgment batches and six calibration batches = 596; eight calls remain reserved for adjudication.
- Token proxy: approximately 8.3–9.6 million, midpoint 8.9 million, including a 160k adjudication allowance. Headroom is approximately 0.4–1.7 million. This is not an exact provider token count; another 5% above the upper estimate could exhaust the cap.
- Wall-time proxy: historical native averages imply about 76 minutes, plus roughly 15 minutes local validation. Longer context suggests a planning range around 110–145 minutes. Twice historical native latency approaches 168 minutes before operator delays.
- Assumptions: historical request-byte/reported-token relationship, 0.20–0.30 tokens per added neutral-history byte, compacted history growth of 0–3,000 bytes, current topK3 and five density-zero/five density-eight cases. No cache-token discount is applied.
- The 20KiB initial block enters 300 candidate/summary calls; 180 uncompressed reader contexts later enter blind judgment. Other compaction calls consume their prior summary.

The coordinator retains the original operational caps. Exhaustion is an incomplete measurement, never PASS, and does not authorize ledger reset or reuse of exposed holdout as fresh. Acceptance thresholds and all-planned denominators remain unchanged.
