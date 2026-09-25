# Phase 3 — Memory, Context và Memory Explorer

Scope được người dùng duyệt ngày 25/09/2026: triển khai Phase 3 cùng inspector local chỉ đọc sau T09/T10; nối context trace sau T19. Góp ý từ UI là proposal cần kiểm tra và promotion, không sửa Memory chuẩn. Người dùng tiếp tục yêu cầu view kiểu Obsidian: force graph, kéo node, global/local graph, ghi chú và backlinks. Đồng bộ vault/plugin Obsidian vẫn ngoài scope hiện tại.

## Thứ tự và phân công

| Lát cắt | Chủ trì | Bàn giao và gate |
|---|---|---|
| T09/T10/T14 Memory | Agent Memory | SQLite + Markdown, nguồn/claim/edges, FTS, freshness, optimistic promotion, selective invalidation; regression authority/poison/source đổi/xóa |
| T19 Context | Agent Context | Window riêng, manifest, budget, code hydrate constraints/AC sau compaction, actual/planned/unknown trace; stress và tamper tests |
| T10 parser + T11 baseline | Agent Evaluation độc lập | Sample C# hạ tầng, 30 cases 20dev/10holdout, oracle riêng, config khóa trước chạy; retrieval/reader/budget/latency evidence |
| Explorer + tích hợp | Root | Read model lọc scope trước xuất, graph có hướng/provenance, panel trạng thái, context trace, proposal download; HTTP và browser QA |
| Review | Đổi reviewer giữa các nhánh | Reproduce findings → sửa → chạy lại đúng phiên bản; UNKNOWN không thành PASS |

Các nhánh được chuẩn bị song song; nghiệm thu theo dependency T09 → T10 → T19 → T11, T14 join. Không có gameplay hoặc Unity invocation ở Phase 3. Không phát hành policy cho tác vụ chưa được kiểm định.

## Tiêu chí bổ sung của Explorer

1. Project/path/task scope áp dụng trước khi dữ liệu rời projector; node/cạnh/provenance ngoài quyền không được lộ qua endpoint hoặc file export.
2. Graph hiển thị assertionType, lifecycle và freshness riêng; cạnh có loại/hướng, explicit/inferred và provenance. Không suy ra quan hệ từ layout.
3. Snapshot có version, content digest và thời điểm; giữ lịch sử, hiển thị stale/unknown/missing rõ. Cùng input cho cùng stable IDs và graph content digest.
4. Context view phân biệt planned, loaded có receipt, unknown; chỉ hiển thị nguồn/bản pin của window được chọn, không gọi là suy nghĩ của agent.
5. HTTP chỉ đọc, bind loopback và scope cấu hình lúc khởi động; UI góp ý tải proposal độc lập, không có endpoint ghi canonical.
6. Chạy integration hai project và benchmark read model ở kích thước khai báo; không suy ra khả năng tải graph lớn từ demo nhỏ.

## Chính sách nghiệm thu và timeline

Giữ Forecast R2 02–27/11/2026 làm baseline lịch sử; actual triển khai bắt đầu 25/09/2026 theo phiên hiện tại. Explorer là scope mới thuộc T09/T10/T19, không tạo ledger/runtime/gate khác. Thời gian thực tế của owner và model cost chưa đo được ghi unknown. Không quy đổi thời gian fixture thành forecast Unity.

T11 phải tách kết quả cơ học local khỏi chất lượng model thật. Bộ benchmark có thể đo parser/retrieval/retention và reader fixture; nếu chưa có model/provider/tokenizer/cost calibration thì các AC đó vẫn mở và Phase 3 chưa được tuyên bố PASS toàn bộ. Mốc tiếp theo là đóng AC còn thiếu bằng evidence hoặc replan có ghi rõ, không hạ gate để đi tiếp.
