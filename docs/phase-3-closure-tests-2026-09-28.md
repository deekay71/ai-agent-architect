# Phase 3 — Kết quả test và sửa lỗi ngày 28/09/2026

**Phase 3 vẫn chưa đủ điều kiện PASS.** Đợt này mở rộng kiểm thử từ một case sang 20 DEV cases, bổ sung chấm ngữ nghĩa và review độc lập, sửa các lỗi tìm được và chuẩn bị holdout mới. Không thay điểm lịch sử hoặc tính test local thành nghiệm thu model.

## Code và test local

Baseline `9ef03f2` có 530 tests. Bản hiện tại `b5e08e7` đạt **554/554 tests, 0 fail, 0 skip**, gồm build/test từ bản sao source sạch với dependencies theo lockfile. [Bằng chứng clean build](evidence/phase3-closure/clean-closure-20260928T074042Z-summary.json).

- Chấm ngữ nghĩa bằng Sol với question/evidence/output công khai; không đưa gold, expected label hoặc tên model thực thi vào prompt judge. Điều kiện bắt buộc về nguồn, revision, constraint và disposition vẫn được kiểm bằng code.
- Reader và judge ghi exposure vào SQLite dùng chung trước dispatch. Reject holdout trên đường DEV; đổi tên case/campaign không xóa lịch sử exposure. Nhận diện theo nội dung chuẩn hóa và family, chưa chứng minh phát hiện mọi bản viết lại ngữ nghĩa.
- Dùng chung receipt schema; giữ budget, usage chưa biết, source/build/config pins và journal của mọi attempt.
- Làm rõ `abstain → answer: null`, `answer → non-empty text`. Parser tiếp tục từ chối output sai; không tự sửa output model để đạt điểm.

[Review Standards/Sol và Spec/Astra](phase-3-closure-review-2026-09-28.md) đã recheck các finding. Đây là AI review, không phải human attestation.

## Đo thật trên 20 DEV cases

Chạy trên source `a9bd7e5`, Terra medium thực thi F/R/C1/C3 và G control; Sol medium chấm độc lập. Một repeat, một giới hạn request 100.000 bytes, tám distractors, topK10. Source/build/config ổn định; không có pending/unknown mới.

| Hạng mục | Kết quả quan sát |
|---|---:|
| Trial dự kiến/ghi nhận | 100/100: 80 main +20 G |
| Đáp án hợp lệ | 74 |
| Context chặn trước reader | 25 |
| Output sai hợp đồng | 1 |
| Advisory semantic pass theo gold cũ | 70/74 đáp án; 70/100 toàn bộ trial |
| Bất đồng disposition/gold | 4, cùng case CORS mơ hồ |
| Canonical task/unknown giữ nguyên | 100/100 |
| Terra invocations / reported tokens | 135 / 1.900.736 |

Mỗi arm có 20 trial; 14 advisory pass/20. C1 có 14 đáp án chấm được, một malformed output và năm context-blocked. F/R/C3/G có 15 đáp án chấm được và năm context-blocked. Không bỏ blocked/malformed khỏi mẫu số toàn bộ. Critical unknown bị chặn là kết quả cơ chế; chưa phải bằng chứng reader biết abstain.

Recall@10 của R/C đạt 1 trên 17 cases có required sources; supporting precision trung bình khoảng 0,122. F và R chọn cùng bộ nguồn ở cấu hình này, nên chưa chứng minh retrieval tiết kiệm context. Các request có cùng nguồn và history ngắn; không suy sang context dài hoặc production. Đã đo thêm retrieval local độc lập ở phần dưới; chưa đo true disk-cold.

| Arm | Reported tokens toàn bộ | Median latency/trial hoàn tất |
|---|---:|---:|
| F | 222.245 | 7,20 s |
| R | 222.217 | 6,85 s |
| C1 | 441.370 | 12,58 s |
| C3 | 879.733 | 24,89 s |
| G | 135.171 | 7,09 s |

C1 dùng khoảng 1,99 lần token của F, C3 khoảng 3,96 lần; phần compactor lần lượt 218.657 và 656.997 tokens. Chưa thấy lợi ích chất lượng trong những cặp đã chấm. **Giữ compaction theo nhu cầu; chưa đặt làm mặc định cho context ngắn.** API cost và exact pre-count vẫn unknown/null; reported tokens không chuyển thành USD hay phần trăm quota.

[Report máy đọc được](evidence/phase3-closure/dev-coverage-summary.json) gắn source, report, bundle và judgment digests. Raw requests/packets/calls/answers cùng bản source/build đúng thời điểm nằm trong gói evidence trên Drive; human review packet giữ đủ 100 trial, gồm lỗi.

## Calibration và lỗi của bộ đề

Sol chấm đủ 108 synthetic controls qua 18 calls, 170.228 reported tokens; khớp 108 nhãn hiện có. Tuy nhiên, khi chấm output thực, reviewer phát hiện **sáu controls thuộc sem-015 bị ảnh hưởng bởi câu hỏi mơ hồ**. Vì vậy 108/108 agreement không đủ để chứng nhận chất lượng nhãn hoặc thông qua calibration gate. Giữ nguyên report cũ và ghi adjudication riêng.

Câu “Which browser origins…” có thể yêu cầu liệt kê URL cụ thể, trong khi nguồn chỉ mô tả quy tắc exact-match allowlist. Bốn null abstentions, gồm G control, có cơ sở theo cách hiểu đó. `codex-00059` vẫn là lỗi khác: chọn abstain nhưng trả prose vào answer. [Astra adjudication](evidence/phase3-closure/sem015-ai-adjudication.json) phân biệt hai vấn đề này.

Tạo hai dataset DEV regression riêng: hỏi quy tắc → answer; hỏi danh sách URL không được cung cấp → abstain. Giữ nguyên nguồn, constraint, unknown và mọi scenario khác; không sửa dataset/score cũ. [Thiết kế](evidence/phase3-closure/sem015-regression-design.json) và [review độc lập](evidence/phase3-closure/sem015-regression-design-review.json) đã kiểm exact diff và seals. Sáu controls sửa câu hỏi sẽ được tính là regression đã lộ, không phải calibration-check độc lập mới.

Bản sửa `b5e08e7` đã kiểm thật qua 18 Terra calls, **10/10 outputs hợp lệ và 10/10 advisory semantic Pass**: policy 5/5 answer; enumeration 5/5 abstain/null. Sáu controls đã làm rõ câu hỏi được Sol kiểm lại, **6/6 agreement**, chỉ là exposed regression. Source/build/dataset ổn định, không unknown mới. [Regression evidence](evidence/phase3-closure/sem015-regression-summary.json).

Tổng riêng native harness trong đợt này: **187 calls, 2.515.297 reported tokens**, 0 pending/unknown mới. Không gồm lượt chat chính hoặc collaboration agents; bốn unknown lịch sử giữ nguyên. Dùng quota Codex subscription, không API key/mua credit/reset quota. [Usage evidence](evidence/phase3-closure/native-usage-summary.json).

## Retrieval feasibility local sau campaign

[Phép đo DEV](evidence/phase3-closure/retrieval-feasibility.json) dùng 20 cases, tám distractors, query đúng corpus, chấm bằng gold sau khi retrieval trả kết quả. topK1 thiếu bốn required sources; topK2 thiếu một; **topK3 giữ Recall=1 và tăng supporting precision từ 0,122 lên 0,373** trên 17 cases có required evidence. topK3 là cấu hình đề xuất để thử chất lượng reader tiếp, chưa phải cấu hình đã nghiệm thu. Không đổi report topK10 vừa chạy.

Median query đầu sau mở lại SQLite connection là 0,446 ms; warm topK10 là 0,378 ms. OS/page cache không flush nên không gọi đây là disk-cold latency. Bộ corpus nhỏ, không có suy luận performance production.

## Explorer và Memory

Đã thao tác trình duyệt: graph 14 nodes/14 edges, search, full note/backlinks, local graph, zoom/fit, context trace ba windows và tạo proposal JSON. Copy fallback hoạt động; canonical database, snapshot và files giữ nguyên hash trước/sau. Sự kiện download bị timeout nên chưa xác nhận tải file tự động; không đánh dấu ca đó Pass. Không chạy lại drag/pan hoặc responsive layout trong smoke này. [UI evidence](evidence/phase3-closure/ui-qa.json).

Các tests Memory/Context vẫn kiểm promotion với exact evidence, independent role, optimistic version, replay, poison/revoke và selective invalidation. Chúng xác nhận cơ chế local. **Bàn giao T14 đầy đủ vẫn cần T19/T11 được nghiệm thu trên đúng versions.**

## Các bước bắt buộc trước khi đóng phase

1. Chốt [phạm vi nghiệm thu qua Codex subscription](phase-3-subscription-acceptance-proposal.md): request bytes/post-call tokens/latency, giới hạn khả năng kết luận, thresholds và mẫu số. Quyết định dùng Codex thay API đã có; đề xuất đang chờ ở đây là phạm vi kết luận nghiệm thu, không phải duyệt thêm phí API.
2. Hoàn tất calibration/review sau phát hiện ambiguity; cần nhãn check độc lập mới nếu chỉnh rubric/thresholds. Không gọi sáu controls đã sửa là untouched. Ghi review người thực nếu tiêu chí đang giữ yêu cầu human review.
3. Freeze protocol, versions, matrix và acceptance runner/adjudication. Runner hiện hành chủ động chỉ cho DEV; chưa có đường formal holdout acceptance. Thiếu phần này là công việc kỹ thuật còn lại, không đổ toàn bộ cho owner.
4. Chạy fresh holdout với nhiều mức context allowance, repeats, nhóm unanswerable/conflict và bối cảnh dài; đo overhead, quality loss và retrieval cold/warm. Ghi mọi attempt; lỗi → replan, không nới threshold sau khi xem kết quả.
5. Sau T19/T11 Pass đúng phạm vi/version, chạy full T14 handoff và kiểm source revoke/conflict/replay; mới xét gate Phase 3.

Đã chuẩn bị 10 fresh holdout families bởi Astra ở context riêng, Sol review độc lập, seal `sha256:e8fdedb9542d1925adbb89d0e0cc503219d55ab0b31a88d49a7c2ac3dc0e5806`: 6 answerable, 2 unanswerable, 2 conflict, 80 distractors. Chưa dispatch; implementer chỉ nhận metadata. [Review summary](evidence/phase3-closure/fresh-holdout-ai-review.json). DEV sem-015 đi kèm candidate còn câu hỏi cũ: phải tạo revision mới có provenance trước freeze, giữ nguyên 10 holdout và không dùng nội dung holdout để tuning.

T09/T10 giữ Pass trong phạm vi local. T19/T14 **Not evaluated**, T11 **Replan**; Phase 3 chưa PASS. Chưa mở Phase 4, Unity hoặc gameplay.

## Tái lập

Chạy `./scripts/dev.sh check` trong repo để kiểm local. Dùng artifact source/build khớp campaign-lock khi export review cũ: prompt mới không được giả làm prompt cũ. Dataset derivatives, raw campaigns, pending human-review packets và các script chuẩn bị/tổng hợp nằm trong gói evidence; những script này không tự cấp release.

Không chạy lại live bằng cách đổi authorization để né pending/unknown hoặc reset allowance. Các authorizations cũ vẫn giữ nguyên lịch sử; đợt sửa dùng authorization riêng có phạm vi kiểm chứng bản sửa, hai campaign dùng chung 18 invocations/400.000 reported-token stop.

## Bản lưu cloud

[Thư mục source, context và evidence trên Drive](https://drive.google.com/drive/folders/1fJQhs5ral9Pr3NdGJJMWpYaw7gu8O03G). Holdout/evaluator candidate được tách trong archive riêng; không đưa vào context implementer để tuning.
