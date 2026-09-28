# Phase 3 — Bàn giao chuẩn bị calibration (DRAFT)

## Actual mới nhất — DEV sau sửa CLI, 28/09/2026

**15/15 calls hoàn tất trên Terra/Sol/Astra, 12 valid answers, 141.613 reported tokens,0unknown trong đợt mới.** Ledger lịch sử giữ nguyên. Transport/usage đã kiểm chứng; strictPass vẫn0/12 vì output constraint ID/mô tả và lexical scoring. Đã làm rõ prompt/schema constraint IDs,530/530 clean tests Pass; prompt mới chưa chạy live lại. [Actual và điều chỉnh](phase-3-post-fix-smoke-report.md); [12 outputs chờ review](phase-3-dev-output-review.md). Phase3 chưaPass: R1 done; R2 quality Replan; R3 calibration/review tiếp theo; T19/T14 Not evaluated,T11 Replan. Các đoạn frozen/chưa chạySol/Astra bên dưới mô tả lịch sử trước đợt này.


Phụ thuộc: [actual 28/09](phase-3-routing-execution-report.md), [protocol DRAFT](phase-3-acceptance-protocol-draft.md). Đây là phân công tiếp theo, không phải bằng chứng các model đã review hoặc human đã duyệt.

| Gói | Model mục tiêu | Đầu ra bắt buộc | Điều kiện đi tiếp |
|---|---|---|---|
| C1 | Terra medium | Smoke reader F/R/C/G theo từng profile; đủ receipts, failed attempts và exact review bundle | Native terminal usage, không unknown pending; DEV smoke không cấp Phase Pass |
| C2 | Sol medium | Danh mục task class/family; bảng rubric supported/unsupported/abstain; quy tắc mẫu số và missing outcomes | Mọi AC có chỉ số/nguồn/gate, không trộn profile để suy tác động context |
| C3 | Astra high, context riêng | Phản biện leakage, family overlap, false acceptance/rejection, provenance, budget lineage | Mọi finding có resolution/evidence; không dùng chính tác giả làm reviewer độc lập |
| C4 | Terra medium | Freeze manifest và review packet candidate mới từ protocol được quyết định | Owner/reviewer thực ghi labels/provenance; chưa được tự gắn độc lập hoặc human-reviewed |
| C5 | Sol/Astra theo độ khó + owner | Adjudication theo protocol đã khóa; T19/T11, rồi T14 | Tất cả hard gates Pass; fail → ghi finding và replan, không đổi threshold sau khi thấy điểm |

Checklist trước freeze: exact requested model/effort; launch/source/prompt/schema pins; split/family audit; exposure history; independent labels; admissible unanswerable/conflict cases; threshold/uncertainty/missing-pair policy; invocation/token/time accounting; owner decision. Các mục này còn pending, không có ngày nghiệm thu chắc chắn.

Review export mới có12 actual answers; [bản đọc](phase-3-dev-output-review.md) chờ reviewer thực. Bản failed observation cũ giữ làm lịch sử. C1 đã kiểm transport/usage, quality Replan. C2 ưu tiên contract IDs và equivalence/semantic rubric; C3 thêm phản biện compaction chi phí≈2× trên case ngắn; C4/C5 chưa mở acceptance.
