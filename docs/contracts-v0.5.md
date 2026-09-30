# Contracts — chuyển tiếp R2 v0.5.0 sang R3 v0.6.0

Tài liệu này giữ tên cũ để các liên kết R2 không vỡ. Nó không còn là danh mục hiện hành duy nhất; [policy](brain-planning-policy.md) và [decision log](decision-log.md) giữ quyết định hiện hành.

Platform hiện có 33 contracts: 23 contract cũ vẫn dùng `schemaVersion: "0.5.0"`; ba contract planning chuyển sang `0.6.0` là `PlanPackage`, `PlanningModeDecision` và `GateReport`; bảy contract R3 cũng là `0.6.0`. Vì vậy một bundle có thể hợp lệ với cả hai version theo tên contract; không đổi version toàn cục chỉ để làm báo cáo trông đồng nhất.

R3 thêm bảy planning-data schemas `0.6.0`: `ReadyChecklist`, `SpikeTask`, `InterfaceApproval`, `ChangeRequest`, `PlanningTaskLog`, `GameEpicBrief` và `PlanningWorkItem`. Đây là dữ liệu và validation schema; parse/schema tests chỉ kiểm cấu trúc và invariant. Chúng không cấp planner/executor authority, không thực hiện scheduling và không chứng minh module admission thật, semantic acceptance, checklist evidence thực hay planning engine đã tồn tại.

| Contract R3 | Mục đích chính |
|---|---|
| `ReadyChecklist` | Bảy check nhị phân, evidence, câu hỏi goal/AC mở và outcome `ready`/`not_ready` |
| `SpikeTask` | Question, timebox, token cap, stop conditions, decision record, blocker refs và `do_not_merge` |
| `InterfaceApproval` | Versioned producer/consumer interface, ownership, invariant, error/compatibility contract và approval |
| `ChangeRequest` | Plan/implementation/requirement defect, causal return level, impact và invalidation |
| `PlanningTaskLog` | Lineage plan, Ready, spike, execution, replan, owner fixes và token receipts |
| `GameEpicBrief` | One-page gate: goal, scope in/out, decisions, interfaces, risks/spikes, budget và owner decision |
| `PlanningWorkItem` | Game/Epic/module/task work item; implementation task một session, checks, AC và owner review ≤30 phút |

`PlanPackage` R3 ghi level (`game_epic`, `module`, `task`), `parentPlanRef`, `milestoneRef`, approved interfaces, Ready checklist, changes và spikes. `PlanningModeDecision` chỉ chọn `single+critic` hoặc `hierarchical+critic`; mode single có fan-out 1. `GateReport` R3 cùng version và yêu cầu input versions, check results, evidence, defects và verdict; `dimensionScores` đã bị bỏ khỏi schema này.

`SpikeTask.rawTokenCap` và `GameEpicBrief.rawTokenBudget` là input + output token thô; cached input nằm trong input và chỉ tính một lần. `PlanningTaskLog` giữ usage theo model và `creditMicros` thay cho trọng số Terra/Sol/Astra. Policy credit hiện hành nằm ở [model-run-policy.json](model-run-policy.json).

`src/contracts/schemas.ts` và `src/contracts/brain-planning.ts` là nguồn canonical. Hash/canonicalization, immutable R2 evidence và các contract v0.5.0 cũ không được sửa lại. R2 catalog bên dưới đã được thay bằng nội dung chuyển tiếp này; historical evidence vẫn immutable.
