# Bàn giao sau sửa Phase 3

## Điểm bắt đầu

Giữ Phase 3 ở **Replan**. `public-critical-raw-anchor-mmr/1` đã có regression offline trên exposed set, không phải acceptance. Không chạy native, không dùng lại quota/call budget cũ và không suy PASS từ báo cáo này.

Đọc trước:

- [Báo cáo sửa](phase-3-repair-report-2026-09-30.md)
- [Phân tích thất bại v1](phase-3-native-failure-analysis.md)
- [Regression v2](evidence/phase3-repair/selection-regression-v2.json)

## Điều không được làm

1. Không sửa, relabel, retry, hoặc resume v1. Giữ requests, receipts, locks, ledger, outputs và labels v1 như historical evidence.
2. Không truyền oracle, required evidence IDs, answerability, candidate answer, distractor flag hoặc source-ID feature vào selector/reader.
3. Không coi abstain khi thiếu context là false accept. Không tự resolve boolean/rationale disagreement hay missing judgment.
4. Không retry failed/unknown judgment batch. Một continuation chỉ được phép theo checkpoint/receipt/ledger/pin/claim đã bind và chỉ cho batch chưa có durable reservation.

## Chuẩn bị campaign mới

1. Tạo calibration mới, độc lập với rubric hiện tại; lưu reviewer evidence và outcome bindings.
2. Tạo fresh holdout mới, niêm phong trước exposure và independent review. Holdout đã lộ chỉ được dùng regression.
3. Freeze protocol mới với authorization, source/build/prompt/rubric pins, exact matrix và rule batch ID/cardinality.
4. Consumer recovery/adjudication full acceptance hiện chưa có đường triển khai được xác nhận. Hoàn tất và kiểm nó end-to-end trước dispatch; chỉ sau đó mới mở native campaign theo authorization mới.
5. Ghi toàn bộ receipts, usage/unknown, ledger, checkpoint event và model/provider bindings. Unknown hoặc failed giữ fail-closed; không retry suy đoán.
6. Đánh giá full planned denominator, calibration và adjudication results có provenance (AI review không phải human attestation). Chỉ artifact accepted của T19 và T11 mới là input cho T14.

## Gate tiếp theo

T19 và T11 cần acceptance evidence mới. Sau khi cả hai có accepted artifacts đúng version/pins, chạy trace T14: source → context → model request/output → independent review → proposal/promotion, rồi kiểm revoke/conflict/replay. Trước điều đó, T14 không chạy như một closeout và Phase 3 không PASS.

Nếu consumer recovery/adjudication chưa hoàn chỉnh, ghi blocker này rõ ràng và dừng trước native dispatch; không thay bằng replay local hoặc evidence v1.

## Tiếp tục DEV advisory

Lệnh mới chỉ áp dụng parent DEV đã có report hoàn chỉnh theo lock/checkpoint v2:

```sh
./scripts/dev.sh exec node dist/src/cli.js semantic-codex-judge-resume \
  /absolute/dev-inputs.json /absolute/dev-config.json \
  /absolute/parent-run /absolute/new-child-run --live
```

Đây là cú pháp bàn giao, chưa được thực thi native. Dùng ledger chung của repo và authorization còn hiệu lực đã được cấp cho phạm vi DEV đó. Không dùng với đường dẫn v1, calibration hay holdout. Child chỉ dispatch batch chưa từng reserve; report cộng dồn vẫn giữ denominator, failed indexes và `complete=false`. Chạy tiếp xong không biến failed batch thành Pass. Exit code 1 là chủ ý vì đây chưa phải kết quả nghiệm thu đầy đủ.

Giới hạn: một parent finalized → một child; không phục hồi parent thiếu report, child bị crash hoặc child-of-child. Lỗi I/O sau khi ghi claim dừng an toàn và giữ claim, không tự xóa hoặc cấp lại quyền. Adjudication hiện ghi nhận/bind issue và chặn PASS; chưa có consumer nhận kết luận model độc lập để resolve issue acceptance.

## Phân công lượt kế tiếp

| Gói | Agent / vai trò | Tiêu chí bàn giao |
|---|---|---|
| Recovery/adjudication acceptance v2 | Astra thiết kế, Terra triển khai, Sol review | Contract fail-closed; scope mới; receipt và independent-review bindings; test từ fault đến quyết định cuối, giữ mọi failed/unknown trong mẫu số. Không tái sử dụng v1. |
| Calibration và corpus mới | Astra soạn, Sol review độc lập; tách khỏi người tuning | Rubric/source cuối đã pin; nhãn/case kiểm độc lập trước exposure; fresh status được đối chiếu registry. |
| Native campaign mới | Coordinator điều phối, Terra reader/compactor, Sol judge | Authorization mới có calls/tokens/deadline; đủ matrix/receipts; không mặc định dùng số cap cũ. |
| Gate và T14 | Coordinator, reviewer độc lập | T19/T11 đạt đúng version; trace promotion/revoke/conflict/unrelated branch; phase chỉ đóng nếu mọi điều kiện đạt. |

Forecast R2 vẫn là baseline. Chưa đặt ngày đóng Phase 3 khi coverage và calibration mới chưa được đo.
