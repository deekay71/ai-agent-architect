# Báo cáo sửa Phase 3 — 30/09/2026

**Trạng thái hiện tại: Replan.** Báo cáo này ghi nhận sửa chữa local và regression offline trên bộ đã lộ. Nó không là acceptance native, không thay thế calibration độc lập, không cấp PASS cho T19/T11/T14, và không mở Phase 4 hay Unity.

## Sự cố v1

Chín kết quả thất bại của `hnew-102` trong v1 đều thiếu `hdoc-102-e2`: retrieval có Recall@10 bằng 1 nhưng context `topK=3` chỉ giữ `e1,d6,d5`. `e2` là nguồn chứa placement map cần cho phép tính sống sót. Đây là lỗi chọn context, không phải tái sử dụng revision cũ: revision của `e1` đúng, còn `e2` không xuất hiện để trích dẫn hoặc bind revision.

Trong chín kết quả đó, tám candidate abstain an toàn vì context thiếu nguồn cần thiết. Một candidate đưa affirmative conclusion không được placement map hỗ trợ. Không được gọi cả chín là false accept. Phân tích gốc và artifact v1 vẫn bất biến tại [native failure analysis](phase-3-native-failure-analysis.md).

## Sửa selector

Lần thử đầu dùng MMR đơn thuần từ candidate pool công khai. Nó cải thiện một trường hợp nhưng tạo bốn regression hậu kiểm, nên bị loại, không dùng làm mặc định.

Selector cuối là `public-critical-raw-anchor-mmr/1`, đi cùng `semantic-context-comparison/2`:

- Candidate pool nội bộ là `max(10, topK)`; số resource được chọn không vượt `topK`.
- Nếu task công khai có unknown critical, selector giữ raw lexical ranking trong giới hạn đó.
- Nếu không, selector giữ hai lexical anchors đầu rồi chỉ đa dạng các slot còn lại bằng overlap của query + question và redundancy của text công khai.
- Selector không nhận gold, answerability, answer, required evidence ID, distractor flag hay source ID như feature. Diagnostics ghi policy, mode, anchor count, raw candidate IDs và ranking anchor.

Không có bước nào coi selection là bảo đảm sufficiency. Score sufficiency bên dưới là evaluator-only, chạy sau selection.

## Regression offline đã lộ

Đường chạy thật `prepareContext` chạy 60 lần: 20 DEV và 10 holdout đã lộ, mỗi case ở distractor density 0 và 8, `topK=3`. Selector chỉ nhận public cases/documents; oracle chỉ được nạp sau toàn bộ selection để chấm hậu kiểm.

| Density | Applicable cases đủ evidence | N/A | So với lexical legacy | Regression |
|---|---:|---:|---|---:|
| 0 | 27/27 | 3 | giữ nguyên | 0 |
| 8 | 27/27 | 3 | +3 trường hợp (`hnew-102`, `hnew-103`, `hnew-106`) | 0 |

Ở density 8, DEV là 17/17 applicable cases; exposed holdout là 10/10, trong khi lexical legacy là 7/10. Với `hnew-102`, legacy có 1/2 required source và thiếu `hdoc-102-e2`; selector mới có 2/2 với `e1,d6,e2`.

Evidence được giữ ở [selection regression ban đầu](evidence/phase3-repair/selection-regression.json) và [selection regression v2](evidence/phase3-repair/selection-regression-v2.json). Các file này là regression material đã lộ, không phải fresh holdout hay acceptance evidence.

## Judgment và continuation

Batch judgment mới dùng schema/cardinality/ID membership chính xác và checkpoint bind vào input, pin, rubric, authorization, request batch và ledger. Continuation chỉ là một hop advisory **cho DEV** từ parent đã bind; không được retry batch failed hoặc unknown, không được mint acceptance, và giữ receipt, ledger, pin cùng continuation claim.

Diagnostics evaluator tách `gatheringFailure`, disposition, citation, revision, unsupported answer và abstention-with-missing-evidence. Missing judgment và structured contradiction tạo review issue `pending`. Boolean/rationale disagreement được reviewer ghi nhận thủ công, bind vào input/answer/assessment/receipt/source/protocol; hệ thống không tự hiểu hoặc tự sửa prose rationale. Issue pending chặn PASS; không có trường `resolved` do caller tự đặt.

[Historical review register](evidence/phase3-repair/historical-judgment-review-register.json) ghi bất đồng của `codex-00023` với hash artifact v1. Nó không được nạp vào acceptance mới hay thay đổi điểm v1. 276 assessment còn thiếu vẫn giữ nguyên.

Consumer cho recovery/adjudication acceptance hoàn chỉnh vẫn chưa được triển khai như một đường dùng được cho acceptance; cần hoàn tất và xác nhận nó trước campaign acceptance. v1 đã hết hạn không được resume, relabel, hoặc retry chọn lọc.

## Còn mở

Một campaign mới cần calibration độc lập theo rubric mới, fresh sealed holdout, protocol mới, authorization mới và native receipts trước khi bất kỳ acceptance nào được xem xét. Full acceptance recovery/adjudication và consumer của nó không được suy ra từ regression local này.

T19 và T11 vẫn chưa đạt. T14 chỉ được chạy sau khi T19 và T11 có accepted artifacts đúng version và đúng pins. Trạng thái Phase 3 giữ **Replan**.

## Kiểm chứng và review cuối

- Fresh copy install bằng lockfile, build và full suite: **587/587 tests Pass, 0 fail/skip**. Source trước/sau không đổi; compiled JavaScript tại repo khớp bản sạch.
- Bộ test tập trung của bản cuối: **63/63 Pass**. Lượt integration trước refactor cuối đạt 585/585; không dùng nó làm chứng cứ duy nhất cho source cuối.
- Hai trục review độc lập: Astra kiểm spec/safety, Sol kiểm standards. Các finding về parent drift, journal, thời điểm ghi claim và sai lệch giữa admission/replay đã sửa; bản cuối không còn blocker trong phạm vi được review.
- **2.081/2.081 file historical giữ nguyên SHA-256**: acceptance/calibration v1, exposed dataset và ledger chung. Không phát sinh native benchmark calls trong đợt sửa; lượt chat/coordination không nằm trong metric benchmark này.
- Build integration trung gian từng lỗi TS2304 do tên biến assessmentFile; log được giữ, đã sửa trước clean run cuối. Không che hoặc dùng build lỗi làm evidence Pass.

Chi tiết: [verification](evidence/phase3-repair/verification-summary.json), [review độc lập](evidence/phase3-repair/independent-code-reviews.md), [historical integrity](evidence/phase3-repair/historical-integrity-check.json).

Thư mục cloud: [Source, lịch sử và bằng chứng sửa trên Drive](https://drive.google.com/drive/folders/1outD6aoDKan3YmhnQrHjHaU4KD2RQZnD).

[Báo cáo sửa trên Notion](https://app.notion.com/p/3eba6c16b3dc81408282e8779d190e18).
