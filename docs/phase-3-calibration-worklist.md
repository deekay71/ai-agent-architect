# Phase 3 — Bàn giao chuẩn bị calibration (DRAFT)

Phụ thuộc: [actual 28/09](phase-3-routing-execution-report.md), [protocol DRAFT](phase-3-acceptance-protocol-draft.md). Đây là phân công tiếp theo, không phải bằng chứng các model đã review hoặc human đã duyệt.

| Gói | Model mục tiêu | Đầu ra bắt buộc | Điều kiện đi tiếp |
|---|---|---|---|
| C1 | Terra medium | Smoke reader F/R/C/G theo từng profile; đủ receipts, failed attempts và exact review bundle | Native terminal usage, không unknown pending; DEV smoke không cấp Phase Pass |
| C2 | Sol medium | Danh mục task class/family; bảng rubric supported/unsupported/abstain; quy tắc mẫu số và missing outcomes | Mọi AC có chỉ số/nguồn/gate, không trộn profile để suy tác động context |
| C3 | Astra high, context riêng | Phản biện leakage, family overlap, false acceptance/rejection, provenance, budget lineage | Mọi finding có resolution/evidence; không dùng chính tác giả làm reviewer độc lập |
| C4 | Terra medium | Freeze manifest và review packet candidate mới từ protocol được quyết định | Owner/reviewer thực ghi labels/provenance; chưa được tự gắn độc lập hoặc human-reviewed |
| C5 | Sol/Astra theo độ khó + owner | Adjudication theo protocol đã khóa; T19/T11, rồi T14 | Tất cả hard gates Pass; fail → ghi finding và replan, không đổi threshold sau khi thấy điểm |

Checklist trước freeze: exact requested model/effort; launch/source/prompt/schema pins; split/family audit; exposure history; independent labels; admissible unanswerable/conflict cases; threshold/uncertainty/missing-pair policy; invocation/token/time accounting; owner decision. Các mục này còn pending, không có ngày nghiệm thu chắc chắn.

Review export hiện có chỉ chứa một failed observation, không có đáp án để chấm ngữ nghĩa. Không yêu cầu owner chấm chất lượng cho output không tồn tại. Source snapshot và unknown receipts được giữ để audit kỹ thuật.
