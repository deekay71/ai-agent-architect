# Bàn giao từ Phase 2 sang Memory/Context

Phase 1 cung cấp contracts/catalog; Phase 2 bổ sung durable runtime, protected stores, process isolation, stage gates và recovery. Runtime demo có active release chỉ cho `runtime.fixture`, được operator cài riêng. Không có release model/semantic/Unity, Unity project hoặc T22 PASS. Chi tiết phạm vi và bằng chứng: [Phase 2 report](phase-2-report.md).

| Hạng mục chưa triển khai | Task sở hữu | Đầu ra và kiểm chứng cần tiếp tục |
|---|---|---|
| Runtime mở rộng ngoài fixture | T12/T20/T08 | T07/T18/T15 đã có broker/ledger/isolation/gates trên fixture macOS; cần adapter và policy đúng task class khi nối model/Unity, không bypass bằng release fixture |
| Semantic/model/human evaluation | T20 | T18 đã có stage/mechanical report validation và release controls; cần dataset đa dạng độc lập, human labels, paid-model usage và calibration có ý nghĩa |
| Memory và Context | T09/T10/T19/T11/T14 | Source freshness/revoke, selective invalidation, actual loaded context manifest, hydrate sau compaction, retrieval/reader và token-cost baseline |
| Multi-planning | T12/T20 | Specialist subplans, synthesis, independent critic, integration gate; đo single-vs-multi cùng budget; giữ lineage budget qua replan |
| Skill benefit/certification | T24 | Controlled trials trên sample repo, locked oracle/split/budget; giữ mọi failures, đo false acceptance/cost/owner touch; eligibility không thay certification |
| Unity adapter và recipes | T21/T08/T25 | Probe official CLI trước; tối đa một bridge; compatibility, real Editor compile/reload/cancel/reconcile và protected runner |
| Nghiệm thu nền tảng | T22 | Active release đủ task classes game cần, conformance trên Unity thật; chưa PASS thì chưa mở gameplay |
| Game Block Puzzle | T01–T05/T13/T16 | Bắt đầu sau T22; luật, UI, save/replay, fail-before/pass-after và pilot holdout |

## Gói việc đầu tiên của Phase 3

1. T09: Markdown/SQLite Memory, provenance và lifecycle; tách facts/decisions/experience, candidate/promoted và access scope.
2. T10: source freshness/revoke/supersede cùng selective invalidation; nối dependency refs với existing artifact store.
3. T19: context partition theo agent/window, progressive metadata/body/reference loading, pinned hydration sau compaction.
4. T11/T14: khóa corpus/holdout, đo retrieval/reader/context retention/cost, nối báo cáo và conflict handling.
5. Memory Explorer/Obsidian là đề xuất chưa duyệt, không tự mở rộng scope Phase 3. Forecast R2 giữ baseline; reforecast sau khi xác nhận owner capacity và đo công việc Memory.

## Giới hạn kỹ thuật phải giữ khi tích hợp

- `auditContractBundle` kiểm một đồ thị fixture đầy đủ 26 loại bản ghi. Nó chưa là evaluator cho mọi workflow stage. Runtime phải tách planning readiness, pre-dispatch và post-execution theo stage; không đòi evidence của tác vụ chưa chạy để được bắt đầu tác vụ đó.
- Caller của foundation audit chịu trách nhiệm cung cấp authority chính xác. Runtime operator cài authority ngoài candidate scope; không nhận authority/PASS từ tool output.
- Digest phát hiện nội dung đổi khi reference pin còn được bảo vệ. Digest không xác thực danh tính người tạo, không tự chứng minh semantics hoặc thay chữ ký/OS boundary.
- Catalog dùng exact version/profile compatibility, metadata trước và body/reference khi cần. Môi trường thực, license/attribution upstream và task-class certification còn phải kiểm ở T24/T25.
- Runtime hiện có sandbox/process separation, drift/symlink/hardlink rejection, immutable artifacts. Không bảo vệ trước operator/root hoặc host process có quyền sửa workspace liên tục ngoài queue. Linux/Windows isolation và Unity process lifecycle phải kiểm ở adapter tương ứng.
- JSON Schema xuất từ CLI chỉ là structural representation; custom refinements và cross-record conformance vẫn bắt buộc.
- Đến cuối Phase 2 chưa có benchmark model, cost/token/touch-time production hoặc dịch vụ agent chạy nền. Counters action/attempt/replan đã durable; model usage chưa đo giữ UNKNOWN và không dispatch từ generic planner callbacks. Lịch là forecast có điều kiện.
