# AI Agent Architect — Bối cảnh hiện hành R2

## Trạng thái làm việc hiện tại
Ngày 25/09/2026, phần Memory/Context local của Phase 3 đã triển khai: **T09/T10 Done / Pass trong phạm vi local; T19 Doing / Not evaluated; T11 Doing / Replan; T14 Doing / Not evaluated; toàn Phase 3 chưa PASS**. Tổng 8 task Done, 3 Doing, 14 task chưa mở. T19 có cơ chế context đã kiểm nhưng thiếu AC so sánh task quality/loss/latency/tokens với provider thật; T14 đã có implementation/tests nhưng full handoff gate chờ T19 được nghiệm thu. Không thu hẹp AC để đổi trạng thái thành Done. Chưa mở Phase 4, Unity, T22 hoặc gameplay. Final clean-source check đạt **327/327 tests, 0 fail, 0 skip**; [evidence](evidence/phase3/final-clean-verification.md) giữ cả lần đầu lỗi fixture timing. Xem [báo cáo Phase 3](phase-3-report.md), [Memory/Context/Explorer](memory-context.md) và [benchmark](phase3-benchmark.md).

Memory có SQLite/FTS, source/claim provenance và freshness, independent review/promotion, revoke/supersede và invalidation theo dependency. Context có per-agent windows, whole-packet accounting local, progressive skill loading, canonical constraints/AC hydration và guard kiểm current source trước dispatch/commit. Explorer kiểu Obsidian đã được duyệt vào Phase 3 và triển khai local chỉ đọc; không phải plugin Obsidian, proposal UI không sửa Memory chuẩn.

Campaign R1 giữ nguyên 6 false accepts. R2 có 0 false accepts và 78 false rejects trên 540 trials; bộ đã lộ nên chỉ là regression, không phải holdout độc lập mới hoặc semantic/model PASS. T11 cần dataset/labels độc lập mới, provider/model/tokenizer/usage/cost và calibration. Không hạ AC để đi tiếp.

Phase 2 T07/T18/T15 đã đạt nghiệm thu runtime cơ học local trên macOS: clean source 209/209 tests, 0 skip; protected store/sandbox/OS lock, stage gates, recovery và skill bindings. Active release vẫn chỉ `runtime.fixture`. Xem [báo cáo Phase 2](phase-2-report.md). Đoạn Phase 1 dưới đây là mốc lịch sử.
R2 ngày 24/09/2026 đã áp dụng execution skill layer theo yêu cầu điều chỉnh kế hoạch và triển khai Phase 1. Repo hạ tầng riêng đã có 26 executable contracts 0.5.0, static conformance, catalog/resolver và CLI offline. T17/T06/T23 đã Done / Pass trong phạm vi foundation bootstrap: 105 tests đạt từ clean checkout, bốn findings review đã đóng, 12 repro gốc và ba ca bổ sung bị chặn; chưa có production gate, active PolicyRelease, Unity benchmark hoặc game.
Kế hoạch và nghiệm thu hiện hành: [Tài liệu liên quan](https://app.notion.com/p/3e5a6c16b3dc81a5b1d7e1e71bbad748). R1 được giữ làm baseline lịch sử. Nghiên cứu đa nguồn: [Tài liệu liên quan](https://app.notion.com/p/3e5a6c16b3dc81a4973ff86951f2cb48). Upstream skills/bridges chưa được cài hoặc certified; package đang chạy là fixture nội bộ.
## Mục tiêu và thứ tự bắt buộc
Xây hạ tầng AI Agent Architect trước, nghiệm thu T22 rồi mới dùng hệ thống xây game Block Puzzle kiểu Block Blast từ đầu. Unity fixture nhỏ ở Phase 5 (P4 cũ) kiểm tra adapter, không phải gameplay. Giữ Context Engine / Planning Engine / Memory Engine; LLM Wiki, ADR và Experience nằm trong Memory.
## Các quyết định đã áp dụng
1. Modular monolith, nhiều planner chuyên môn có context riêng, synthesizer và critic độc lập. PlanningModeDecision chọn single/multi theo task class, dependencies và benchmark cùng budget; hệ thống phải hỗ trợ multi-planning.
2. CheckDefinition/CheckResult phân loại deterministic/model/human, loại evidence bắt buộc và unknowns. Schema đúng/đủ refs không chứng minh đúng ngữ nghĩa. Planning PASS là readiness; execution cần compile/tests/integration evidence riêng.
3. Judge/rubric muốn cấp quyền tự động dispatch phải thuộc PolicyRelease active đã kiểm định đúng task class. Scheduler lấy GateReport từ store tin cậy, kiểm issuer/hash/input versions/policy/scope. Shadow không cấp quyền thực thi; deterministic scope có release riêng.
4. Runtime có operation ledger: operationId ổn định, attempt riêng, reconcile receipt/postcondition; crash/timeout không được retry mù. Pilot một owner process + OS lock + queue; quarantine nếu chưa biết Unity process cũ đã dừng.
5. Tách quyền executor, verification runner, Gate Controller, policy owner và Memory promoter. Executor không sửa oracle/rubric/verdict/evidence store hoặc promoted Memory. Hash không thay kiểm tra nguồn tạo bằng chứng.
6. ContextManifest gắn constraints/AC với nội dung chuẩn, revision, hash và scope. Sau compaction, code hydrate phần bắt buộc; mỗi agent invocation có window/budget riêng. Không biến UNKNOWN thành fact.
7. Claim giữ observed/inferred/decision, nguồn, scope, evidenceStatus và lifecycle. Quarantine/revoke/supersede invalidate bắc cầu phần phụ thuộc; không stale toàn hệ thống chỉ vì MemoryVersion tăng. SourceRecord có freshnessPolicy pinned/live/revalidateBeforeUse và digest/thời điểm.
8. Phân biệt resume, retryAttempt, replay/fork và replan; giữ workflow/checkpoint versions và kết quả đã commit. Benchmark có negative cases, answerability/unsupported premise, retrieval/reader đối chứng, nhiều trials và mọi failed attempts.
## Những điểm vẫn cần đo hoặc spike
- 85/100, điểm sàn 3/4, tối đa hai replan, context budgets/fan-out và retry budgets là cấu hình khởi đầu chưa calibration. Tạo artifact version mới không reset lineage budget.
- LangGraph embedded SQLite và Promptfoo đã được pin/cài/chạy trong package spike riêng. Runtime chính chọn broker SQLite hẹp; checkpoints framework không thay operation ledger/ownership/policy. Promptfoo là benchmark adapter, không có authority. Xem ADR 0002 và framework spike report. Không thêm Temporal/Redis/vector/graph DB.
- TypeScript orchestration và C# Unity/domain là hướng dự kiến; model/provider, cost cap và target mobile chưa chốt; team là bạn + AI agents, số giờ mỗi tuần chưa xác nhận.
- R2 thay forecast R1: low/base/high khoảng 14/21/34 tuần làm việc khả dụng; base tới T22 ngày 22/01/2027 và pilot 19/02/2027. 20 giờ/tuần của bạn chưa xác nhận; lịch có điều kiện, chưa đặt dịch vụ agents chạy nền. Workload tham chiếu 59.25/96/156 đơn vị 8 giờ khác owner touch-time 75/140/248 giờ. Giữ baseline, cập nhật actual riêng và reforecast sau spike; không extrapolate tốc độ foundation sang runtime/Unity.
- Đã xác nhận team: bạn + AI agents. Backlog có 25 task, Forecast R2/Actual/Acceptance evidence và hai views R2. Ngày bắt đầu actual: 24/09/2026; status/evidence Phase 1 được cập nhật trong plan R2.
## Lộ trình hiện hành
Phase 1 (P0 cũ): T17/T06/T23 — architecture, executable contracts, catalog/compatibility/digest/resolver offline.
Phase 2 (P1 cũ): T07/T18/T15 — persistent runtime, protected authority/evaluation, ledger/ownership/recovery.
Phase 3 (P2 cũ): T09/T10 local Done/Pass; T19/T14 Doing/Not evaluated; T11 Doing/Replan — chưa đạt gate toàn phase.
Phase 4 (P3 cũ): T12/T20/T24 — multi-planning, calibration và controlled skill benchmark trên sample repo không Unity.
Phase 5 (P4 cũ): T21/T08/T25/T22 — Unity fixture, một đường thao tác, trusted runner, recipes/conformance, platform acceptance.
Phase 6 (P5 cũ): T01–T05/T13/T16 — Block Puzzle sau T22 PASS đủ task classes.
## Công việc tiếp theo
Tiếp theo là replan T11 cùng AC còn thiếu của T19: review labels độc lập, khóa fresh holdout/corpus/oracle trước run; chọn và pin provider/model/tokenizer/config/budget, đo task quality/loss/latency/tokens/cost, semantic reader/calibration và giữ toàn bộ failed attempts. T14 handoff gate chờ T19, không suy tests promotion thành đã nghiệm thu dependency. T10 parser hiện chỉ là C# syntax subset, reference candidates mang nhãn inferred/unverified; semantic binding/Roslyn trên project thật vẫn cần spike nếu AC yêu cầu. Phase 4 chờ gate Phase 3; không gọi regression exposed-set là holdout mới.

Không có dịch vụ agents tự chạy sau phiên. Remote `main` vẫn ở Phase 1; Phase 2 và Phase 3 local chưa push. Source Phase 1 trên Drive và các report/campaign cũ là lịch sử được giữ lại. Giữ forecast R2 baseline, reforecast theo owner capacity và evidence mới; không dùng tốc độ fixtures suy ra deadline Unity.

Catalog skill khác runtime: eligibility chỉ xác định ứng viên tương thích. Script phải qua capability/permission/ledger; skill không tự đổi policy hoặc cấp PASS. T19 đã ghi actual loaded bindings, hydrate bản pin và giữ constraint/AC/critical unknown qua compaction. Loaded receipt chỉ là local packet inclusion; default byte accounting không phải provider tokens; `revalidateBeforeUse` thiếu fetch adapter vẫn UNKNOWN.
## Nguồn chuẩn và cách dùng
Contracts/tên fields chuẩn: [Tài liệu liên quan](https://app.notion.com/p/3e3a6c16b3dc816ab47fc95ef0ab630b).
Roadmap: [Tài liệu liên quan](https://app.notion.com/p/3e3a6c16b3dc8136927dcb1bb630daf1); backlog: [Tài liệu liên quan](https://app.notion.com/p/4d37fed112f4430d935dd764f6d1df99).
Planning/gates: [Tài liệu liên quan](https://app.notion.com/p/3e4a6c16b3dc8112a3d7c54cfe836c81); Context: [Tài liệu liên quan](https://app.notion.com/p/3e4a6c16b3dc81cf8849fafc428eb65b).
Sơ đồ hỗ trợ đọc kiến trúc: [Tài liệu liên quan](https://app.notion.com/p/3e4a6c16b3dc8155ad16df18f81be66f). Review 13 giữ lý do và nguồn nghiên cứu của thay đổi: [Tài liệu liên quan](https://app.notion.com/p/3e4a6c16b3dc81deb2dac08ad626a619); các “khoảng trống” trong review mô tả baseline v0.3, nay đã được đưa thành yêu cầu tài liệu v0.4, chưa đóng bằng code/evidence.
Hội thoại gốc và bộ 21 file được nhắc tới là nguồn lịch sử; các file gốc chưa truy xuất đủ. Dùng quyết định đã xác nhận và tài liệu hiện hành khi tiếp tục, không diễn giải bản thiết kế cũ là kết quả triển khai.

Bàn giao Phase 3: [Notion](https://app.notion.com/p/3e6a6c16b3dc81fb864ed042ed313b55), [Drive](https://drive.google.com/drive/folders/1J_9ASjL-YKWUFQCmsNk4EeOmcEvdHAe0). GitHub Phase2/3 vẫn chưa push; bản source và Git history được đóng gói riêng trên Drive.
