# Phase 3 — Memory, Context và Explorer

Actual: 25/09/2026. Triển khai local đã có Memory SQLite, context riêng từng agent, guard nối runtime và giao diện graph kiểu Obsidian. **Phase 3 chưa PASS toàn bộ; T11 REPLAN.** Không mở Phase 4 hoặc gameplay. Forecast R2 02–27/11/2026 giữ nguyên để đối chiếu, không lấy tốc độ fixture để dự báo Unity.

## Kết quả bàn giao và gate

| Task | Implementation / bằng chứng | Trạng thái nghiệm thu |
|---|---|---|
| T09 | SQLite WAL/FTS5, source/claim/provenance, immutable proposal/evidence/review, Markdown projection theo scope | Done / Pass trong phạm vi cơ chế local |
| T10 | Retrieval lọc scope/version/lifecycle; explicit graph; invalidation source→claim→context→plan→handoff; C# subset spike | Done / Pass trong phạm vi sample local; source refresh là mock hoặc unknown |
| T19 | Window/manifest/pins, hydrate constraints/AC sau compaction, progressive skill load, runtime guard | Doing / Not evaluated toàn AC: quality và provider token chưa đo, cơ chế local đã kiểm thử |
| T11 | Hai campaign mỗi campaign 540 trials; giữ cả kết quả thất bại và regression | Doing / Replan: cần fresh sealed holdout và model/provider/calibration thật |
| T14 | Promotion có exact evidence, independent review, optimistic version; poison/revoke integration | Doing / Not evaluated bàn giao: code/tests đã có, phụ thuộc nghiệm thu T19 còn mở |

Tổng roadmap hiện 8 Done, 3 Doing, 14 Todo. Không tự thay AC quality/token bằng byte-count tests, không tạo điểm rubric hoặc chi phí chưa đo. Khi T19 đủ evidence mới xét gate bàn giao T14. Hai task Done ở đây không chứng nhận production, semantic model hoặc Unity.

## Cách kiến trúc hoạt động

SQLite là kho Memory chuẩn. Dữ liệu nguồn được pin revision/hash/scope; derived claim chỉ promote sau evidence đúng claim và review độc lập. Markdown và Explorer là projection một chiều. Source đổi hoặc revoke làm stale các dependency liên quan; nhánh không phụ thuộc vẫn tiếp tục. `approved`, `fresh` và `valid` được kiểm riêng.

Mỗi agent có window và budget riêng. Compaction chỉ nén history không tin cậy; code lấy lại TaskSpec, constraints và AC từ nguồn chuẩn. Skill được nạp dần metadata → body → references theo catalog pin; script không được biến thành context authority. Receipt xác nhận byte đã nằm trong packet local, không chứng minh model đã đọc hoặc hiểu.

Guard tích hợp runner hiện hữu, không tạo ledger/gate thứ hai. Nó kiểm authority hiện hành trước dispatch, sau các boundary bất đồng bộ, trước cấp stdin cho worker và trước commit. Restart phải reattach guard trusted; xóa config không bỏ được pin bền của run. Source bị thu hồi sau hiệu ứng giữ OBSERVED để reconcile, không gán COMMITTED hoặc giả rollback.

## View kiểu Obsidian

Mở http://127.0.0.1:4318/ khi server local đang chạy. Giao diện có force graph, kéo node, zoom/pan, Fit, global/local graph 1–2 bước, lọc nội dung/loại/freshness/lifecycle/quan hệ, ghi chú và backlinks. Context trace cho biết planned/loaded/unknown theo window và receipt. Theme sáng/tối chỉ là tùy chọn giao diện local.

Tối đa 70 node được vẽ trong một lượt; API projection giới hạn 10.000 node/40.000 cạnh. Đây là local inspector riêng với trải nghiệm tương tự Obsidian, chưa có plugin hoặc đồng bộ vault Obsidian. Demo dùng dữ liệu hạ tầng synthetic, không phải toàn bộ knowledge production.

HTTP bind loopback, fixed scope và chỉ GET/HEAD. Góp ý tạo `memory-review-proposal/1` gắn snapshot/version/node; JSON hiện trong hộp để sao chép và có nút tải. Đây là intake cần dựng MemoryDelta, evidence và review trước promote, không phải quyền ghi Memory. Browser đã xác nhận JSON hiện đúng; tải file tự động qua IAB chưa được xác nhận nên có đường sao chép dự phòng.

## Bằng chứng và giới hạn

- Final clean-source check: **327/327 tests pass, 0 fail, 0 skip**, frozen dependency install scripts disabled. Source85 files không đổi trong run; manifest `sha256:bfc489445f010030718daf26c3da8ea9b70dee7f144dc73bd8a13873c4e587b5`. [Evidence cuối](evidence/phase3/final-clean-verification.md) giữ cả lần đầu326/327 lỗi fixture timing: ready phát trước SIGTERM handler. Paired probe3/3 old fail và3/3 fixed pass; sửa fixture handler-before-ready, không đổi production lock.
- Review độc lập đã tái hiện rồi đóng lỗi scope source head, Markdown export, giả receipt, sửa bundle reason và async runtime guard. Xem hai [review](review-phase3-memory-explorer.md) [chéo](review-phase3-context-memory.md).
- Demo thực qua SQLite/Context: window planner 9428 → 8190 đơn vị UTF-8 local sau compaction, constraints giữ nguyên; source r1→r2 làm hai window planner/plan/handoff stale, critic độc lập vẫn ready. Provider tokens = unknown.
- C# subset spike: 16 declarations, 10 inferred candidates; không có semantic binding/Roslyn, compile C# hoặc Android build. Inferred edges không cấp explicit retrieval authority.
- Projection microbenchmark 100/1.000 node được lưu riêng; không coi latency CPU này là FPS browser hay năng lực production.
- `revalidateBeforeUse` giữ unknown khi thiếu fetch adapter thật. Authority/provenance/review attestation dựa trusted local broker, không là chữ ký nguồn hay judge semantic.

Các campaign dưới đây là diagnostic/regression cơ học trước nghiệm thu, không phải formal T11 acceptance khi T19 còn mở. Campaign đầu có **6 false acceptance**, khi cap 256 byte bỏ mất một phía của conflict. Bản sửa giữ critical coverage/unknown và abstain. Campaign R2 đạt **0 FA, 78 FR trên 540 trials**, nhưng chỉ là `REGRESSION_EXPOSED_SET`, không còn independent holdout. Retrieval/bytes giữ nguyên; guard thêm 184–512 bytes metadata ngoài cap content gốc. Không tuyên bố thắng cùng tổng prompt budget. [Báo cáo benchmark](phase3-benchmark.md) và toàn bộ journals lưu cả thất bại.

## Tiếp tục và timeline có điều kiện

1. Owner chọn provider/model và trần chi phí; không gửi API key trong chat. Chuẩn bị fresh holdout độc lập, human labels và protocol khóa trước run: dự kiến 1–2 ngày làm việc sau khi đủ cấu hình/người gán nhãn.
2. Nối tokenizer, usage/cost receipts và model reader; chạy full/retrieved/compacted với cùng tổng budget, đánh giá semantic/calibration: dự kiến 2–3 ngày.
3. Review evidence độc lập, fix/replan nếu fail, xét gate T11/T19 rồi T14: tối thiểu 1 ngày, vòng replan chưa thể ấn định.

Fresh semantic fixtures phải có requiredEvidenceIds, acceptableAlternatives, answerability, expectedRevision và expectedConstraints. So sánh ba nhánh full-context / retrieval+isolation / retrieval+isolation+compaction, nhiều lần compact và mật độ distractor khác nhau trên cùng model và tổng budget. Gold-evidence reader control hiện có không phải nhánh full-context này.

Đây là estimate còn lại, không thay Forecast R2 hoặc cam kết ngày kết thúc. T22 vẫn là gate bắt buộc trước game puzzle. Provider, actual owner hours và model cost hiện chưa biết.

## Chạy lại local

```sh
./scripts/dev.sh install --frozen-lockfile --ignore-scripts
./scripts/dev.sh check
./scripts/dev.sh exec node dist/src/cli.js memory-demo .local/my-new-demo
./scripts/dev.sh exec node dist/src/cli.js memory-view .local/my-new-demo/snapshot.json .local/my-new-demo/scope.json 4318 .local/my-new-demo/context-windows.json
```

Tạo `.local` trước nếu chưa có; `memory-demo` yêu cầu thư mục đích mới. Nếu không truyền proof windows, trace import hạ loaded xuống unknown. Hướng dẫn API ở [Memory/Context](memory-context.md). Source/commit/cloud delivery được ghi trong manifest bàn giao; GitHub remote chưa có Phase 2/3 khi chưa push được xác thực.

## Nơi bàn giao

- [Báo cáo và gate trên Notion](https://app.notion.com/p/3e6a6c16b3dc81fb864ed042ed313b55).
- [Source, context và evidence trên Drive](https://drive.google.com/drive/folders/1J_9ASjL-YKWUFQCmsNk4EeOmcEvdHAe0).
