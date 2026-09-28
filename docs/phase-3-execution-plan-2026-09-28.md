# Phase 3 — Kế hoạch thực thi tiếp ngày 28/09/2026

## Actual mới nhất — test và sửa lỗi 28/09/2026

**554/554 clean tests Pass.** Đợt native trên 20 DEV cases ghi đủ 100 trials: 74 đáp án hợp lệ, 25 context-blocked, 1 output sai contract. Sol chấm 70/74 advisory Pass; bốn bất đồng cùng case CORS mơ hồ đã được Astra adjudicate. Đã sửa hướng dẫn abstain/null và tách hai DEV regressions rõ nghĩa: 10/10 outputs hợp lệ, 10/10 advisory Pass; sáu controls sửa câu hỏi khớp nhãn 6/6. Không thay dataset hoặc score cũ.

Calibration 108/108 agreement vẫn thiếu bảo đảm nhãn: sáu controls CORS bị ambiguity; không dùng con số này đóng gate. Có 10 fresh holdout families được AI author/reviewer độc lập chuẩn bị, chưa dispatch. Native harness dùng 187 calls / 2.515.297 reported tokens, không unknown mới; số này không bao gồm lượt chat/collaboration và không suy ra USD.

Compaction context ngắn tốn khoảng 1,99×/3,96× token của F ở C1/C3, chưa tăng quality. Chưa bật mặc định. Retrieval local với topK3 giữ recall=1 trên 17 cases có required sources, đang là DEV feasibility. **T19/T14 Not evaluated, T11 Replan, Phase 3 chưa PASS**: còn protocol freeze, calibration/acceptance runner, fresh holdout matrix và full handoff. Đây không chỉ là thiếu owner approval. [Báo cáo và phần còn lại](phase-3-closure-tests-2026-09-28.md); [protocol đề xuất](phase-3-subscription-acceptance-proposal.md); [cloud evidence](https://drive.google.com/drive/folders/1fJQhs5ral9Pr3NdGJJMWpYaw7gu8O03G).

Các mốc, profile và giới hạn scope bên dưới là lịch sử; giữ nguyên evidence và Forecast R2 để đối chiếu.

## Kiểm chứng model thật — prompt constraint IDs, 28/09/2026

**15/15 calls trên Terra/Sol/Astra hoàn tất; 12/12 outputs đúng constraint ID và citation/revision, 142.013 reported tokens, 0 unknown mới.** Trước sửa constraint IDs đạt 0/12; bản sửa đã kiểm chứng live trên DEV sem-001. Source/build khớp bản đã qua 530 tests. [Báo cáo](phase-3-model-validation.md); [12 outputs chờ human review](phase-3-model-validation-review.md). StrictPass vẫn 0/12 do so khớp nguyên văn; semantic calibration/rubric độc lập còn mở. R3a contract Pass trong sample này; T19/T14 Not evaluated, T11 Replan, Phase 3 chưa Pass. Các mốc chưa chạy prompt mới phía dưới là lịch sử.


Owner yêu cầu “apply vào plan. Thực thi tiếp đi”. Tiếp tục đường Codex đăng nhập ChatGPT đã duyệt, áp dụng Terra/Sol/Astra; không dùng API key. Quyết định mới cấp scope tiếp tục có giới hạn dưới đây, không xóa/reconcile usage chưa biết hoặc gia hạn ledger ngày 25/09.

| Bước | Phân vai mục tiêu | Đầu ra / gate | Thời gian dự kiến |
|---|---|---|---|
| R1 — Gỡ lỗi giao thức CLI | Terra execution; Sol phân tích thường lệ | Repro metadata, regression đỏ→xanh, terminal usage; không lưu reasoning/secrets | Phiên hiện tại |
| R2 — DEV smoke ba profiles | Terra medium; Sol medium; Astra high | Một case dev, F/R/C/G trong từng profile, usage/coverage và exact review bundle | Sau R1, phiên hiện tại nếu CLI hoạt động |
| R3 — Chuẩn bị calibration | Sol chuẩn bị; Astra phản biện sâu; Terra triển khai | Rubric, admissible abstention/conflict cases, candidate independent holdout; human review còn cần thật | 1–2 phiên tiếp theo, phụ thuộc review |
| R4 — Nghiệm thu và bàn giao | Terra chạy; critic độc lập/Sol/Astra theo độ khó; owner quyết định phần human | Frozen protocol/holdout, T19/T11 evidence, T14 handoff; thiếu bằng chứng thì không Pass | Sau R3; chưa cam kết ngày kết thúc |

Đây là phân công trong kiến trúc và profiles được yêu cầu, không tuyên bố phiên Codex hiện tại tự đổi model hay ba model đã đánh giá chất lượng lẫn nhau. Smoke reader kiểm đường context, chưa phải Planning Engine benchmark.

R1 tối đa hai invocation chẩn đoán riêng (mỗi invocation 120 giây, stop sau reported 25.000 tokens). R2 tối đa 15 invocations, 400.000 reported tokens, 30 phút toàn campaign và 120 giây/call. Tổng scope mới tối đa 17 invocations; mọi attempt đều tính, không retry tự động. Các trần token là post-call, không bảo đảm hard output cap. Mỗi stage có allowance ghi trước; unknown dừng stage và giữ receipt, không xem là miễn phí. Chỉ chuyển từ chẩn đoán sang smoke khi đã có thay đổi xác định và validation. Không đổi/khởi tạo lại cùng allowance để né cap. Các diagnostics không dùng dataset/gold. R2 chỉ `sem-001` dev, không chạy holdout.

Matrix R2: 3 profiles × (F reader + R reader + C summary + C reader + G reader) = 15 invocations, 9 main trials +3 G controls. C một vòng; distractor 0; một repeat. Pin profiles lấy từ `docs/model-routing.json`; config mới phải khớp file này. Full/Retrieval/Compaction so sánh trong cùng profile. G tách khỏi điểm main.

Giữ Forecast R2 lịch sử; các mốc trên là kế hoạch tiếp tục có điều kiện. Phase 3 chưa Pass, T19/T14 Not evaluated, T11 Replan; chưa mở Phase 4/Unity/game. Cần cập nhật actual bên dưới sau thực hiện.

## Actual và replan — 28/09/2026

R1: local/offline fix đã qua 530/530 clean tests; startup đã qua notice tới turn.started khi chặn mạng. Live terminal usage chưa đạt. R2: dừng sau 1/15 call vì unknown usage; hai diagnostics R1 cũng unknown. Tổng mới 3 attempts, 0 valid answers; cả ba ledger frozen, không reset hoặc cấp lại allowance. Chưa chạy Sol/Astra. R3: [worksheet chuẩn bị](phase-3-calibration-worklist.md) đã viết; calibration/review thực tế pending. R4 chưa mở.

[Actual và evidence](phase-3-routing-execution-report.md) là nguồn trạng thái hiện hành. Không diễn giải cap còn dư thành quyền vượt unknown freeze. Lần live sau cần xử lý policy/allowance có liên kết lịch sử, giữ toàn bộ unknown và số attempts; chưa chạy lại sau bản sửa cuối.
