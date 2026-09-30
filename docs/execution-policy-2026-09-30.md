# Chính sách thực thi R3 — 30/09/2026

[Brain planning policy](brain-planning-policy.md) và [decision log](decision-log.md) là authoritative. Phase 3 conditional closure đã được owner **accepted**. Phạm vi lượt này chỉ là docs/contracts/schema tests; không có model run.

Thứ tự bắt buộc: push/CI → Unity baseline/infrastructure (T21 rồi T08) → fix + A/B/C comparison → late-October retain/simplify decision → Brain orchestration nếu còn giá trị → T22 Pass → Block Puzzle pilot. T21/T08 không phụ thuộc T20/T24. Unity preflight lịch sử (Editor `6000.0.84f1`, CLI `1.0.0-beta.8`, 29 oracle + 3 CLI tests pass) được giữ làm evidence; chưa có model Unity run.

Execution dùng hierarchy Game/Epic → Module → Task, interface-first và chỉ fan-out các module độc lập. Task phải Ready, là một agent session, có automated checks, diff và owner review ≤30 phút. Ambiguity/scope chưa rõ phải nâng lên level cao hơn. Milestone kế tiếp chi tiết; future milestone chỉ outline.

Comparison dùng existing 10 microtasks: A Brain one pass; B A + tối đa hai compile/test repair rounds; C ordinary Codex cùng Unity CLI và token cap. Ghi per-arm/per-task input, output, cached subset, actual credits, outcome, repair, replan, manual fixes và elapsed time. 24-task bank là future scene/prefab + feature batch.

Budget không dùng weights: rates mỗi 1M token là Terra `50/5/300`, Sol `50/5/250`, Astra `250/25/1250` cho input uncached/cached/output. Threshold 300.000 dùng raw input + output, không đếm cached subset hai lần; DEV ≤5% weekly quota, phase ≤10%. Forecast unknown cần approval. Không có run ở lượt này.
