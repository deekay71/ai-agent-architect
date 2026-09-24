# Bàn giao từ foundation sang runtime

Phase 1 (T17/T06/T23) cung cấp executable contracts, kiểm liên kết bản ghi, catalog/resolver và CLI offline. Các bản ghi authority/policy/PASS trong fixtures là dữ liệu giả định do test tạo. Không có active PolicyRelease thực hoặc Unity project trong repo này.

| Hạng mục chưa triển khai | Task sở hữu | Đầu ra và kiểm chứng cần tiếp tục |
|---|---|---|
| Durable runtime và artifact stores | T07 | Lưu immutable artifact bytes theo digest, operation intent trước side effect, outcome/receipt sau thao tác; checkpoint version và resume/replay/fork khác nhau |
| Ranh giới trust và dispatch | T07/T18 | Authority chỉ đọc từ protected stores; pin current inputs, revalidate scope/policy/skill trước gọi tool; executor không sửa oracle/evidence/verdict/promoted Memory |
| Fault recovery và ownership | T15 | OS lock + owner process + queue; kill-after-effect/lost-response không duplicate, TTL không takeover; quarantine khi chưa biết trạng thái process |
| Evaluation harness thực | T18/T20 | Parse report semantics/count/IDs và attestations; không dùng exit 0 hoặc tự khai issuer thay bằng chứng; judge errors/UNKNOWN chặn handoff |
| Memory và Context | T09/T10/T19/T11/T14 | Source freshness/revoke, selective invalidation, actual loaded context manifest, hydrate sau compaction, retrieval/reader và token-cost baseline |
| Multi-planning | T12/T20 | Specialist subplans, synthesis, independent critic, integration gate; đo single-vs-multi cùng budget; giữ lineage budget qua replan |
| Skill benefit/certification | T24 | Controlled trials trên sample repo, locked oracle/split/budget; giữ mọi failures, đo false acceptance/cost/owner touch; eligibility không thay certification |
| Unity adapter và recipes | T21/T08/T25 | Probe official CLI trước; tối đa một bridge; compatibility, real Editor compile/reload/cancel/reconcile và protected runner |
| Nghiệm thu nền tảng | T22 | Active release đủ task classes game cần, conformance trên Unity thật; chưa PASS thì chưa mở gameplay |
| Game Block Puzzle | T01–T05/T13/T16 | Bắt đầu sau T22; luật, UI, save/replay, fail-before/pass-after và pilot holdout |

## Gói việc đầu tiên của Phase 2

1. Chọn persistent store local và làm một vertical slice `submit → checkpoint → operation intent → fake effect → receipt → reconcile → resume`. So lựa chọn framework bằng cùng acceptance, không mặc định cài LangGraph/Promptfoo.
2. Thiết lập principal/process/store boundary thật; đưa quyền model trong `permissions.ts` thành enforcement được kiểm bằng hành vi bị từ chối.
3. Thêm fake tool gây timeout sau side effect và crash trước ghi receipt. Dùng cùng operationId khi reconcile; attempt mới không tự tạo effect mới.
4. Nối catalog selection với current authority và runtime revalidation. Script resource chỉ có thể chạy qua tool đã đăng ký, đúng permission scope/ownership/ledger.
5. Kiểm lại estimates còn lại sau spike. Không extrapolate tốc độ fixture/schema Phase 1 thành tốc độ runtime hoặc Unity.

## Giới hạn kỹ thuật phải giữ khi tích hợp

- `auditContractBundle` kiểm một đồ thị fixture đầy đủ 26 loại bản ghi. Nó chưa là evaluator cho mọi workflow stage. Runtime phải tách planning readiness, pre-dispatch và post-execution theo stage; không đòi evidence của tác vụ chưa chạy để được bắt đầu tác vụ đó.
- Caller của audit chịu trách nhiệm cung cấp authority chính xác. CLI demo chỉ dùng authority synthetic; không tiếp nhận authority từ output executor rồi xem là trusted.
- Digest phát hiện nội dung đổi khi reference pin còn được bảo vệ. Digest không xác thực danh tính người tạo, không tự chứng minh semantics hoặc thay chữ ký/OS boundary.
- Catalog dùng exact version/profile compatibility, metadata trước và body/reference khi cần. Môi trường thực, license/attribution upstream và task-class certification còn phải kiểm ở T24/T25.
- Kiểm containment/symlink hiện tại không phải sandbox chống adversary cùng quyền có thể đổi parent directories liên tục. Runtime cần immutable store và process separation.
- JSON Schema xuất từ CLI chỉ là structural representation; custom refinements và cross-record conformance vẫn bắt buộc.
- Đến cuối Phase 1 chưa có benchmark model, cost/token/touch-time đo đủ hoặc dịch vụ agent chạy nền. Lịch chỉ là forecast có điều kiện.
