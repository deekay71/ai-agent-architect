# Phase 3 — Kiểm chứng prompt đã sửa bằng model thật

Ngày 28/09/2026. Owner yêu cầu “kiểm chứng model thật đi”. **Bản sửa constraint IDs đã được xác nhận trên DEV sem-001: 12/12 reader outputs đúng ID, trước sửa 0/12.** Không còn lý do lỗi `required-constraint-dropped` trong đợt này.

## Phạm vi và kết quả

Native Codex đăng nhập ChatGPT, Terra medium / Sol medium / Astra high. Mỗi profile chạy Full, Retrieval, Compaction một vòng và G control; 5 calls/profile gồm một summary và bốn readers. Case DEV đã từng quan sát, density 0, repeat 1; đây là regression validation, không phải fresh holdout hoặc benchmark planning/game.

| Requested profile | Reader outputs | Exact constraint IDs | Citation + revision | Reported tokens gồm G |
|---|---:|---:|---:|---:|
| gpt-5.6-terra / medium | 4 | 4/4 | 4/4 | 44,875 |
| gpt-6-sol / medium | 4 | 4/4 | 4/4 | 47,391 |
| gpt-6-astra / high | 4 | 4/4 | 4/4 | 49,747 |

**15/15 calls hoàn tất, 12/12 outputs, 142.013 reported tokens; 0 pending, 0 unknown mới.** Ràng buộc ID kiểm bằng exact set equality với canonical public task.constraints[].id, không chỉ kiểm có chứa một ID. Gathering/evidence/revision đúng 12/12; canonical context giữ nguyên. Source/config/dataset/compiled pins ổn định, `stoppedReason=null`. Ledger dừng tại invocation-limit sau khi dùng đủ 15 lượt; không phải lỗi giữa campaign.

Trước dispatch đã lưu [plan kiểm chứng và snapshot lịch sử](evidence/phase3-model-validation/validation-plan.json): tối đa 15 calls, 400.000 reported tokens, 30 phút và 120 giây/call. Tất cả 20 attempts trước đó giữ nguyên bytes/deadlines/trạng thái; tổng audit 35 attempts gồm 30 settled, 4 unknown lịch sử và 1 not-dispatched lịch sử. Không suy unknown thành 0 quota hoặc USD. Không retry, API key, API billing hoặc reset credit.

## Đối chiếu trước/sau và phần còn thiếu

- Trước sửa: 0/12 constraints đúng ID; cả ba profile trả mô tả constraint. Sau sửa: 12/12 đúng ID `sem-001-c1`, không có ID dư hoặc trùng. So sánh source pins giữa hai smoke chỉ thay `src/evaluation/campaign.ts`; dataset seal/scorer/gold giữ nguyên. Đây là quan sát regression trên một case, chưa chứng minh tỷ lệ tổng quát hoặc nhánh abstain/multi-constraint.
- **StrictPass vẫn 0/9 main và 0/3 G**, nhưng lý do còn lại duy nhất là `answer-missing-or-not-an-accepted-alternative`. Scorer hiện so toàn bộ câu trả lời với hai phương án nguyên văn, chỉ chuẩn hóa typography/case/whitespace/punctuation cuối câu. Các câu diễn đạt khác vẫn bị đánh fail; falseAcceptance trong report cũng chỉ là diagnostic của scorer này, không phải nhãn semantic độc lập.
- Đối chiếu nội dung do agent thực hiện: cả 12 câu trả lời đều chọn short-lived workload identity token và audience artifacts.internal, phù hợp evidence doc-001-a/r3. Một số câu bổ sung không dùng static keys hoặc chưa có thao tác production, có căn cứ trong resource/history. Đây là nhận xét chẩn đoán của agent, không phải human/independent adjudication hoặc release evidence.
- **Không thay scorer, gold, threshold hoặc câu trả lời đã ghi để nâng điểm.** Đã export 12 actual outputs với full public context, request, answer và digests. [Bản đọc chờ review](phase-3-model-validation-review.md) không kèm oracle hoặc automated scores; human judgments vẫn pending.

## Xác minh source và thay đổi trạng thái

Source và 105 built JS files trước run khớp bản clean `clean-continuation-20260928T050351Z` đã đạt **530/530 tests**. Đợt này không đổi source code; không chạy lặp suite để tạo số test mới. [Audit](evidence/phase3-model-validation/audit-summary.json) đối chiếu 149 source/test/config files của bản clean, source changes giữa hai smoke, ID sets, usage, dataset seal và bytes các ledger lịch sử.

R1 CLI live đã hoàn tất. R3a **constraint-ID contract Pass trên sample DEV này**; transport/usage/evidence binding đã kiểm đủ ba requested profiles. R2/R3b semantic quality và calibration vẫn Replan/pending; cần reviewer độc lập, rubric có equivalence rõ, các case answerable/abstain/conflict và protocol/holdout mới. R3c context dài/compaction cost còn mở. T19/T14 Not evaluated, T11 Replan; Phase 3 chưa PASS, chưa mở Phase 4/Unity/game. Không đổi Forecast R2.

Model identity ở mức requested-only của CLI; usage bao gồm Codex context/overhead. Một case không xếp hạng chất lượng ba model, không suy phần trăm quota hoặc số tiền. C/F token ratio trên case ngắn vẫn gần 2×, nên chưa đặt compaction làm mặc định.

## Artifacts

Campaign `.local/codex-constraint-id-validation-20260928`; review `.local/codex-constraint-id-validation-20260928-review`; config `fixtures/semantic-config/codex-constraint-id-validation.json`. Evidence đã sanitize ở `docs/evidence/phase3-model-validation`, có exact review bundle và request/source/config pins. Source snapshot của run và raw campaign/ledgers nằm trong gói cloud bàn giao. GitHub chưa push trong phiên này.
