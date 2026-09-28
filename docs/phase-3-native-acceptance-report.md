# Báo cáo nghiệm thu native Phase 3

Phạm vi là **finite authored infrastructure starter**. Các bằng chứng do AI tạo hoặc review; `humanAttestation: null`. Báo cáo này không mở quyền Unity, thực thi game, Phase 4, hay phát hành production.

| Hạng mục | Chủ sở hữu / delegate | Trạng thái hiện tại |
| --- | --- | --- |
| 1. Freeze và điều phối | Root / Astra | Đã freeze source `c902676`; protocol digest `sha256:d2837dc693f6ec9f154c56f684aee06d1be093e46942e0e00e91f4eef2399c67`. |
| 2. Calibration độc lập | Astra thiết kế, Sol review nhãn và chấm native | Hoàn tất: 32/32, gồm 16 positive và 16 negative; 0 false accept, 0 false reject, 0 unknown; 6/6 correct abstentions; 6 calls, 61.053 reported tokens. |
| 3. Runner formal và adjudication | Terra triển khai; Astra/Sol review; Root tích hợp | Runner đã triển khai; 570/570 tests ở repo và fresh copy. Mock hoàn tất 300 trials/540 candidate-summary calls/50 judge batches, không cấp native evidence. Adjudication đã chạy và trả Replan do thiếu coverage và chín hard-check failures. |
| 4. Holdout native của Terra | Terra | Hoàn tất thực thi: 240 main trials và 60 G controls, tất cả `completed`; integrity stable, không có stopped reason. Chất lượng chưa được kết luận ở đây. |
| 5. Blind judgment, T14 và đóng gate | Sol / Root / Astra | Judgment dừng với `invalid-judge-output`; T14 không chạy. Gate finite starter là Replan. |

Holdout dùng 10 case: 6 answerable, 2 unanswerable, 2 conflict. Ma trận cố định dùng ba allowance 64k, 80k và 160k bytes, hai repeats, cùng neutral-history 20 KiB. Ledger dùng chung có mức 10M reported tokens, 604 calls và thời hạn ba giờ. Mọi log lỗi hoặc attempt chưa chắc chắn phải được giữ lại; không được reset ledger hay thay output path để tạo retry.

## Aggregate campaign native của Terra

Report: `.local/phase3-acceptance-v1/campaign/report.json`, raw digest `sha256:599c590e20fd0be71b6f8bf69ffb30c4a75bd498d7d29669bf5d478bcd6b2c47`. Campaign `acceptance-d2837dc693f6ec9f` ghi 300/300 completed: 240 main và 60 G controls; `integrityStable=true`, `stoppedReason=null`.

| Arm | Trials | Candidate/summary calls | Reported tokens | Latency min / median / max (ms) |
| --- | ---: | ---: | ---: | ---: |
| F | 60 | 60 | 996,123 | 5,187 / 7,443 / 11,300 |
| R | 60 | 60 | 858,474 | 5,607 / 7,348 / 10,398 |
| C1 | 60 | 120 | 1,461,014 | 11,835 / 14,432 / 17,531 |
| C3 | 60 | 240 | 2,659,917 | 23,120 / 27,498 / 33,562 |
| G | 60 | 60 | 829,815 | 5,311 / 7,433 / 10,948 |
| **Campaign** | **300** | **540** | **6,805,343** | Descriptive only |

Campaign tokens/calls ở bảng chỉ là phần Terra. Tổng ledger sau calibration + campaign là 546 calls và 6,866,396 reported tokens; đây không phải chi phí USD hoặc quota percentage. Blind Sol judgment sau đó dùng cùng ledger, kết quả ở phần dưới.

## Kết quả blind judgment và closure v1

Sol thực hiện 5 calls, 121,373 reported tokens. Chỉ 24/300 assessment hợp lệ: 15 advisory pass và 9 hard fail. Batch index 4 trả 5/6 IDs, nên runner ghi `invalid-judge-output`; 276 output không được assessment. Tổng authorization cuối v1 là 551 calls, 6,987,769 reported tokens, 0 pending và 0 unknown.

Closure tại `.local/phase3-acceptance-v1/closure/phase3-closure.json` có digest `sha256:d78c3b07571de3e3b57d7780de6c108d2814ec7f679103275cca9fe98302f1f5`: T19 `Replan`, T11 `Replan`, T14 `Not evaluated`, Phase `Replan`. Không có consumer resume/adjudication hợp lệ trong frozen v1. T14 local pass không thay thế native acceptance evidence.

Chẩn đoán: [failure analysis](phase-3-native-failure-analysis.md). Chín failures là thiếu nguồn bắt buộc ở selected topK3; tám candidate abstain, một kết luận thiếu evidence, không phải chín false accepts.

Recovery cần một version mới: DEV regression, exact coverage schema, checkpoint/resume, adjudication bindings và fresh verification. Không relabel, selective retry, hoặc resume v1.

Các sửa lỗi đã được kiểm tra cục bộ gồm: T14 tra claim bằng `claimNodeId`, ranh giới promotion khi quarantine, so sánh raw resource với parsed resource, và task scope tách biệt trong synthetic fixture. Chúng không phải là kết quả native của holdout.

## Kết quả native holdout — execution hoàn tất, nghiệm thu Replan

- Campaign output path / digest: `.local/phase3-acceptance-v1/campaign/report.json` / `sha256:599c590e20fd0be71b6f8bf69ffb30c4a75bd498d7d29669bf5d478bcd6b2c47`.
- Coverage main và G controls: 240/240 main, 60/60 G; tất cả completed.
- Stopped reason: `null`.
- Reported usage: 540 calls, 6,805,343 tokens.
- Integrity / receipt binding: `integrityStable=true`; final receipt replay đã chạy, bằng chứng native hợp lệ nhưng quality/coverage không đạt.

## Blind Sol judgment — v1 incomplete

- Judgment output: `.local/phase3-acceptance-v1/judgments`; evidence digest `sha256:f69b7399dbbf8f6405a92462b2909eae09c679ccc1b630d3abb0581ac5faf7a2`. Không cấp capability PASS cho T14.
- Planned, assessed, missing: 300 / 24 / 276.
- Terminal: `invalid-judge-output` do batch index 4 thiếu một ID.
- Calibration và receipt replay binding: không đủ coverage để đóng gate.

## T14 và finite gate — v1 Replan

- T11/T19: Replan / Replan.
- T14 promotion, revocation và unrelated branch: Not evaluated.
- Phase gate: Replan.
- Giới hạn còn lại: recovery bằng protocol/version mới, không resume v1.

Theo dõi bối cảnh: [Notion](https://app.notion.com/p/3e9a6c16b3dc8107bd6ae3e72403fd53) và [thư mục Drive](https://drive.google.com/drive/folders/1__1dG3VaKmAL412xQ98Lj-F8q_TpiQHo). Gói bàn giao gồm source, lịch sử Git, native artifacts và checksum manifests.
