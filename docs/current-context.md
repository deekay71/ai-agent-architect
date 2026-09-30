# Bối cảnh hiện hành R3 — 30/09/2026

[Brain planning policy](brain-planning-policy.md) và [decision log](decision-log.md), ngày 30/09/2026, supersede policy/roadmap R2; R2 reports/evidence JSON giữ immutable history. Phase 3 conditional closure đã được owner **accepted**. Scope lượt này chỉ docs/contracts/schema tests và **không có model run**.

Planning mặc định là Game/Epic → Module → Task; main planner khóa core GDD/interfaces trước module, critic/test-plan validation độc lập và chỉ module độc lập mới song song. Task implementation là một agent session với automated checks, diff và owner review ≤30 phút. Nếu uncertainty/ambiguity chưa rõ, chọn higher level. Rolling plan chỉ chi tiết next milestone; tương lai giữ outline.

Trình tự hiện hành: push/CI → T21 Unity adapter + empty project → T08 compile/test evidence → fixes + comparison existing 10 microtasks A/B/C → late-October retain/simplify → Brain orchestration nếu còn giá trị → T22 → Block Puzzle pilot. T21/T08 không còn chờ T20/T24.

Preflight Unity lịch sử: Editor `6000.0.84f1`, CLI `1.0.0-beta.8`, 29 oracle tests và 3 CLI tests pass; đó không phải model Unity run. A là Brain one pass; B là A + tối đa hai compile/test repair rounds; C là ordinary Codex với cùng Unity CLI/token cap. 24-task bank chỉ là future scene/prefab + feature outline.

Budget không weighted: credits per 1M input uncached/cached/output là Terra `50/5/300`, Sol `50/5/250`, Astra `250/25/1250`; 300.000 threshold tính raw input + output, cached subset không cộng hai lần; DEV ≤5% weekly quota và phase ≤10%. Unknown forecast cần approval. Không có run trong lượt này.

Platform có 33 contracts: 23 cũ `0.5.0`; PlanPackage, PlanningModeDecision, GateReport và bảy planning data records `0.6.0`. Schema tests chỉ xác nhận structure/invariants; chúng chưa xác nhận engine admission, semantic AC hay checklist evidence integration.
