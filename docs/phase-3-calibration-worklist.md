# Phase 3 — Bàn giao chuẩn bị calibration (DRAFT)

## Actual mới nhất — test và sửa lỗi 28/09/2026

**554/554 clean tests Pass.** Đợt native trên 20 DEV cases ghi đủ 100 trials: 74 đáp án hợp lệ, 25 context-blocked, 1 output sai contract. Sol chấm 70/74 advisory Pass; bốn bất đồng cùng case CORS mơ hồ đã được Astra adjudicate. Đã sửa hướng dẫn abstain/null và tách hai DEV regressions rõ nghĩa: 10/10 outputs hợp lệ, 10/10 advisory Pass; sáu controls sửa câu hỏi khớp nhãn 6/6. Không thay dataset hoặc score cũ.

Calibration 108/108 agreement vẫn thiếu bảo đảm nhãn: sáu controls CORS bị ambiguity; không dùng con số này đóng gate. Có 10 fresh holdout families được AI author/reviewer độc lập chuẩn bị, chưa dispatch. Native harness dùng 187 calls / 2.515.297 reported tokens, không unknown mới; số này không bao gồm lượt chat/collaboration và không suy ra USD.

Compaction context ngắn tốn khoảng 1,99×/3,96× token của F ở C1/C3, chưa tăng quality. Chưa bật mặc định. Retrieval local với topK3 giữ recall=1 trên 17 cases có required sources, đang là DEV feasibility. **T19/T14 Not evaluated, T11 Replan, Phase 3 chưa PASS**: còn protocol freeze, calibration/acceptance runner, fresh holdout matrix và full handoff. Đây không chỉ là thiếu owner approval. [Báo cáo và phần còn lại](phase-3-closure-tests-2026-09-28.md); [protocol đề xuất](phase-3-subscription-acceptance-proposal.md); [cloud evidence](https://drive.google.com/drive/folders/1fJQhs5ral9Pr3NdGJJMWpYaw7gu8O03G).

Các mốc, profile và giới hạn scope bên dưới là lịch sử; giữ nguyên evidence và Forecast R2 để đối chiếu.

## Kiểm chứng model thật — prompt constraint IDs, 28/09/2026

**15/15 calls trên Terra/Sol/Astra hoàn tất; 12/12 outputs đúng constraint ID và citation/revision, 142.013 reported tokens, 0 unknown mới.** Trước sửa constraint IDs đạt 0/12; bản sửa đã kiểm chứng live trên DEV sem-001. Source/build khớp bản đã qua 530 tests. [Báo cáo](phase-3-model-validation.md); [12 outputs chờ human review](phase-3-model-validation-review.md). StrictPass vẫn 0/12 do so khớp nguyên văn; semantic calibration/rubric độc lập còn mở. R3a contract Pass trong sample này; T19/T14 Not evaluated, T11 Replan, Phase 3 chưa Pass. Các mốc chưa chạy prompt mới phía dưới là lịch sử.


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
