# Phase 2 — nghiệm thu runtime cơ học local

**Ngày 25/09/2026: T07/T18/T15 đạt nghiệm thu trong phạm vi runtime fixture trên macOS.** Source sạch đã build và chạy **209/209 tests, 0 fail, 0 skip**; CLI thực thi một thao tác ghi fixture rồi commit sau xác minh độc lập. Phase 1 có 105 tests; Phase 2 thêm 104 tests. Đây là gate về cơ chế runtime, không phải nghiệm thu T22 hay chứng nhận chất lượng model/Unity.

## Bàn giao

- SQLite WAL/FULL lưu run state, immutable artifacts, checkpoint, operation ledger, gate và lineage counters. `submit/resume/retryAttempt/replay/replan/reconcile` có semantics riêng; version mismatch bị chặn.
- Intent và attempt được lưu trước effect. Worker chỉ nhận input sau khi broker đã ghi PID. Crash sau effect được đối soát bằng snapshot/postcondition và verifier độc lập; không retry mù.
- Queue theo broker và OS flock theo canonical workspace, kể cả khi dùng control directory khác. Owner pause không bị takeover. Timeout/cancel xác nhận cả process group dừng; spawn/process chưa rõ được quarantine.
- Planning readiness, pre-dispatch và post-execution có gate riêng. Candidate không nộp authority/PASS. Release/checkset/input hashes/issuer/report semantics/count/test IDs được kiểm; score không override fail/unknown.
- Skill activation revalidate catalog/body/descriptor/profile/environment/capability; binding nối vào ledger/gate và giữ artifact nguồn. Chưa certified upstream skills.
- Fan-out primitive giữ branch đã commit qua process restart. Generic planner usage chưa đo giữ UNKNOWN và không mở dispatch. Có fixed model adapter và HTTP JSON adapter được thử bằng server local.
- LangGraph embedded SQLite checkpointer và Promptfoo API/CLI đã chạy trong package spike pin riêng. Quyết định triển khai: dùng broker SQLite hiện tại; giữ framework ở vai trò adapter/spike, không thay ledger, ownership hoặc policy authority.

## Ma trận nghiệm thu

| AC | Task | Kết quả / bằng chứng |
|---|---|---|
| P2-01 | T07 | Fresh-process checkpoint resume, workflow/schema mismatch rejection: `test/runtime-recovery.test.ts` |
| P2-02 | T07 | Stable operation ID, payload conflict, intent-before-effect, UNKNOWN thay blind retry: runner/recovery tests |
| P2-03 | T07 | One owner + OS lock + queue, pause A/B exclusion và no TTL takeover: lock/recovery/runner tests |
| P2-04 | T07 | Completed/pending branches, successful sibling reuse, budget counters qua replan, explicit replay lineage: recovery/runner tests |
| P2-05 | T07 | LangGraph executable spike + native recovery comparison và ADR: `spikes/phase2/evidence/`, `docs/adr/0002-phase2-runtime.md` |
| P2-06 | T18 | Stage readiness không đòi execution evidence tương lai; dangling/cycle/current pins: 41 evaluation tests |
| P2-07 | T18 | Policy artifacts/config/dataset/checkset/metrics/uncertainty/scope/release criteria bị kiểm lại; inactive/insufficient release bị từ chối: evaluation tests |
| P2-08 | T18 | Trusted gate lookup, wrong issuer/missing/stale/forged PASS, hard fail không bị score ghi đè: evaluation + runner tests |
| P2-09 | T18 | Verifier process và broker receipt; missing/zero/skipped/duplicate/wrong IDs/checkset/environment/subject không PASS: verifier/evaluation tests |
| P2-10 | T18 | Promptfoo pinned 9 cases chạy API và CLI, JSON/confusion outputs; command CI đã có: framework spike report. Remote GitHub CI chưa được chạy trong lần bàn giao này. |
| P2-11 | T15 | SIGKILL trước dispatch, sau effect, trước ledger commit; inode/effect không bị nhân đôi; unrelated drift bị từ chối: recovery tests |
| P2-12 | T15 | Protected stores/oracle/evidence không đọc/ghi được từ executor; symlink escape/network/subprocess/signal bị chặn: isolation tests |
| P2-13 | T15 | Timeout/cancel/process quarantine và recover ownership không takeover process sống: isolation/lock/recovery tests |
| P2-14 | T15 | Exact step coverage, step/subplan dependency order, task/manifest/subplan scope, secret-free event logs: coverage/runner tests |
| P2-15 | T07/T18 | Current skill binding/actual implementation được kiểm và giữ provenance: 12 runtime skill tests |

## Kiểm thử và review

Từ staged source tạo thư mục sạch bằng `git checkout-index`, cài đúng lockfile với lifecycle scripts bị tắt, rồi chạy `./scripts/dev.sh check`. Kết quả: **209 pass, 0 fail, 0 skipped** trên Node 24.19.0/macOS 26.2. CLI `runtime-demo` tạo một output, một dispatch, một attempt, operation COMMITTED, run completed; `productionAuthorized: false`, `unityInvoked: false`.

Bằng chứng: [clean install](evidence/phase2/clean-install.log), [clean check](evidence/phase2/clean-check.log), [CLI output](evidence/phase2/runtime-demo.json), [source hashes](evidence/phase2/tested-source-manifest.json). [Spec review](review-phase2-spec.md) và [security review](review-phase2-security.md) là review chéo giữa agents. Các lỗi coverage/scope/dependency, evidence kind, recovery snapshot, quarantine cleanup và skill provenance đã được sửa, giữ regression. Reviewer độc lập của evaluation chạy lại bộ liên quan; không còn finding tái hiện được đang mở trong phạm vi đã khai báo.

LangGraph spike chứng minh checkpoint đơn thuần tạo 2 effects sau crash, còn external ledger + reconcile giữ 1. Promptfoo nhận đúng 3 valid, từ chối 3 invalid, giữ 3 ambiguous ở UNKNOWN; false acceptance/rejection quan sát được bằng 0 trong mẫu 9 case. Đây là mẫu cơ học rất nhỏ, không đại diện reliability production. Thông tin versions và nguồn chính thức nằm trong [framework spike report](phase-2-framework-spikes.md).

## Giới hạn nghiệm thu

- Chỉ macOS và fixed `fixture.write-once`; `sandbox-exec` deprecated, host mới phải chạy lại conformance. Không có backend Linux/Windows/Unity hoặc khả năng arbitrary plugin execution.
- Policy owner, verifier coordinator và Gate Controller là các vai trò trong trusted broker. Executor process bị tách; operator/host/broker code vẫn là trusted computing base.
- Active release chỉ `runtime.fixture`. Campaign 80 validator calls lặp các shape; `populationInference: false`. Chưa human-label/model calibration hoặc task-class release production. T20 phải làm phần đó.
- Không gọi paid model, Unity Editor hay cloud model. Model token/cost và owner touch-time chưa đo thì giữ unknown. Không coi số tests/fixture calls là phần trăm tiến độ toàn dự án.
- Pending spawn chưa có PID không tự recover; cần kiểm tra thủ công. Side effect không có postcondition đủ tin cậy giữ UNKNOWN. Tool mới phải có recovery contract riêng.
- GitHub Actions workflow đã chuẩn bị; chưa có remote CI result. Source/Notion/Drive và GitHub publication phải ghi trạng thái riêng, không coi file local là đã push.

## Roadmap và bàn giao tiếp

Phase 1 và Phase 2 đã đạt scoped acceptance: **6 task Done, 19 task chưa triển khai**. Phase 3 bắt đầu từ T09 → T10 → T19 → T11, với T14 join. Memory Explorer/Obsidian vẫn là nghiên cứu chưa phê duyệt vào scope.

Actual Phase 2: 25/09/2026. Giữ nguyên forecast R2 làm baseline lịch sử, không kéo deadline T22/game về sớm từ tốc độ fixture. Team vẫn user + AI; owner hours/week chưa xác nhận. Không có automation/agent service chạy tiếp sau phiên. **Gameplay vẫn khóa đến T22 PASS đúng task classes.**
