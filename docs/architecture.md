# Kiến trúc và ranh giới R3 — 30/09/2026

> Historical 30/09 snapshot. For current components, entrypoints, identities and blockers (including `src/portable/`), see [STATUS.md](STATUS.md).

R3 giữ modular monolith TypeScript, runtime/Memory/Context local hiện có và evidence R2 immutable. Bổ sung hiện tại là **planning data contracts và schema tests**, không phải planning engine, scheduler, model campaign hay Unity adapter đang chạy. Scope này không thêm Unity/model run; Unity preflight cũ vẫn là evidence lịch sử. [Policy](brain-planning-policy.md) và [decision log](decision-log.md) là nguồn quyết định hiện hành.

Planning hierarchy mặc định là Game/Epic → Module → Task. Main planner khóa core GDD, boundaries và interfaces; interface approval là precondition của module planning. Critic/test-plan validation độc lập đọc đầu vào đã khóa. Song song chỉ áp dụng cho module chứng minh độc lập; single+critic là default cho task.

Ready là seven-way binary gate: requirement coverage, interface compatibility, automatic testable acceptance, high-risk spike decision, budget fit, acyclic dependencies, và không còn goal/AC questions. `ReadyChecklist` không phải scorecard; 85/100 là historical rubric, không được dùng để dispatch.

Platform có 33 contracts: 23 contract cũ giữ `schemaVersion: "0.5.0"`; PlanPackage, PlanningModeDecision, GateReport và bảy records R3 dùng `0.6.0`. Các records mới đóng gói brief, work item, approval, readiness, spike, change request và telemetry. Schema parse/test chỉ chứng minh cấu trúc/invariant, không phải module admission thật, semantic AC, checklist evidence thực hoặc authority. Quyền dispatch, protected oracle, policy release và runtime enforcement vẫn thuộc các thành phần hiện hữu/chưa được mở rộng trong R3.

Unity adapter và empty Unity project là infrastructure cần có trước T22. Platform gate phải Pass trước Block Puzzle pilot. Round 1 dùng cùng 10 microtasks hiện có: A Brain one pass; B A + tối đa hai compile/test repair rounds; C ordinary Codex cùng Unity CLI, pinned skills và token cap. Task bank 24 là outline future cho scene/prefab + feature. Compaction default và advanced Explorer vẫn là experiments; hierarchy với module planners độc lập là default.

Phase 3 conditional closure đã được owner accepted. Evidence R2 và `evidence/*.json` không đổi; chúng là lịch sử, không phải declaration rằng toàn hệ thống đã implemented hay production-ready.
