# Phase 3 — Chuẩn bị nghiệm thu trước Phase 4

> Lịch sử: đề xuất API/key-check/cap 5 USD trong tài liệu này đã được thay bằng [đường DEV Codex subscription được owner duyệt](phase-3-codex-benchmark.md). Không chạy cấu hình API đề xuất hoặc hỏi lại quyền này để thực hiện Codex smoke. Kết quả 466 tests/mock bên dưới giữ nguyên ở source lịch sử.

Ngày 25/09/2026. Quyết định mới của owner: **hoàn tất nghiệm thu Phase 3 trước**, chưa triển khai Phase 4. Bản này tiếp nối mốc [422 tests và mock matrix](phase-3-fixes-report.md); các bằng chứng cũ vẫn giữ nguyên. Phase 3 chưa PASS: T09/T10 Pass local, T19/T14 Not evaluated, T11 Replan.

## Phần đã bổ sung

- Tách `local-regression`, `dev-smoke`, `dev-calibration` và `acceptance`. Lần đo dev đầu tiên không còn đòi khai rằng đã hoàn tất human calibration. Legacy config không tự mở live; runner kiểm readiness trước khi tạo output hoặc gọi provider. Acceptance/holdout vẫn bị chặn khi chưa có frozen protocol và adjudication.
- Chọn case cụ thể trong đúng split, kiểm giới hạn context/output từng profile và cả input + output reserve + headroom trước generation. Model capacity độc lập với tổng token budget của một trial.
- Preflight tính số trials/calls và biên chi phí generation theo giá đã pin. Forecast không cấp quyền chạy API và không phải hóa đơn.
- Báo cáo paired so Retrieval/Compaction với Full theo đúng case/repeat/profile/budget/density/task class. Lấy trung bình repeats trong một case rồi mới trung bình giữa cases. Giữ missing/unscored/system-blocked counts; không xem repeats là mẫu độc lập. Chưa có interval/acceptance inference khi protocol chưa khóa.
- Export output review gắn answer, exact reader request, final context packet, model/profile, raw report/lock và source/config/dataset/prompt hashes. Người review thấy câu trả lời và public context, không thấy oracle hoặc điểm tự động. Pending judgments không được import. Import cần đầy đủ judgments và external evidence hashes; chỉ lưu attestation, không tự xác thực danh tính hoặc cấp release.

CLI mới: `semantic-review-export <campaign> <new-review-directory>` và `semantic-outcome-review-import <campaign> <decisions.json> <new-reviewed-file>`. Lệnh `semantic-review-import` cũ là review dataset riêng, không thay review actual outputs.

## Đợt dev smoke đề xuất

Config: `fixtures/semantic-config/dev-smoke-draft.json`, hiện **chỉ là đề xuất chưa được owner duyệt chi phí**. Trường authorization ID ghi rõ `proposal-not-owner-approved-dev-smoke-5usd`; không coi file cấu hình là bằng chứng cho phép chi tiêu. Operator phải có quyết định thật trước khi dùng `--live`.

| Mục | Giá trị |
|---|---|
| Dataset | Sealed v2 hiện có, chỉ dev `sem-001`, `sem-002`; không gửi holdout |
| Profiles | `gpt-6-astra`/high và `gpt-6-luna`/medium |
| Matrix | Full, Retrieval, Compaction 1 lần; density 0; 1 repeat; 32.768 tokens/trial |
| Quy mô | 12 main trials +4 post-comparison G controls; tối đa 20 generation calls +20 input-count calls |
| Output/context caps | Tối đa 4.000 output tokens/call, gồm reasoning; 256 headroom; context cap nội bộ 100.000 |
| Generation tariff upper bound | 4.242.980 micro-USD = **4,242980 USD**; không dùng cached discount trong upper bound |
| Cap xin duyệt | 5 USD hạch toán usage × pinned generation rates; chưa được duyệt |
| Kết quả mong đợi | Kiểm tra provider access, response schema, whole-request counting, usage/cost, integrity và review export; không đóng Phase 3 |

Giá Standard kiểm tra ngày 25/09/2026: Astra input/output 10/50 USD mỗi triệu tokens; Luna 0,10/0,50 USD. [Giá OpenAI](https://developers.openai.com/api/docs/pricing). Các caps 100.000/4.000 là giới hạn campaign tự đặt dưới khả năng được công bố, không phải context/output maximum của provider. [Astra](https://developers.openai.com/api/docs/models/gpt-6-astra), [Luna](https://developers.openai.com/api/docs/models/gpt-6-luna).

Giữ alias model đúng như nguồn hiện có; chưa có dated snapshot được xác minh nên không bịa snapshot. Ghi model trong response và chặn mismatch. Role planner/executor ở đây là nhãn profile: cả hai đang làm reader task; smoke không chứng minh chất lượng Planning Engine hoặc năng lực execution.

Giới hạn dự toán: chưa xác minh phí endpoint input-count nếu có; không bao gồm thuế, tool fees hoặc surcharges. Ledger không thể hủy chi phí đã phát sinh ở provider. Unknown usage, charge không giải thích được hoặc vượt reserve/cap phải dừng và reconcile, không retry miễn phí. [Token counting](https://developers.openai.com/api/docs/guides/token-counting) đếm toàn request; [reasoning output](https://developers.openai.com/api/docs/guides/reasoning) vẫn có thể tính phí khi response incomplete mà chưa có visible answer.

## Runbook

1. Chạy preflight không đọc key/không gọi mạng: `./scripts/dev.sh exec node dist/src/cli.js semantic-preflight fixtures/semantic-benchmark fixtures/semantic-config/dev-smoke-draft.json`.
2. Sau khi owner duyệt phạm vi/cap, tạo config mới giữ matrix đã duyệt và authorization ID trỏ quyết định thật; không sửa historical config. Chỉ kiểm key có được cấu hình hay chưa, không in giá trị, không gửi vào chat/source/cloud.
3. Dùng output directory mới và spend ledger ổn định theo authorization. Freeze code/config/data/prompt trước run. Chạy `semantic-run` với `--live` chỉ sau phê duyệt; giữ failed attempts và reservations chưa giải quyết.
4. Export review sang directory mới bên ngoài campaign. Người review nhận Markdown, có thể phản hồi bằng ngôn ngữ thường; operator ghi judgments với nguồn quyết định thật. Không gán agent thành human hoặc tự điền nhãn để đạt gate.
5. Review dev results → calibration → freeze protocol/holdout → acceptance campaign → adjudication T19/T11 → handoff T14. Smoke pass không bỏ qua bước nào.

## Phần còn thiếu để nghiệm thu

Protocol/adjudicator acceptance chưa triển khai đầy đủ; preflight trả `acceptanceReady:false` và runner chặn `purpose:acceptance`. Cần khóa mẫu/coverage, tiêu chí chất lượng, noninferiority, FA/FR, latency/cost, uncertainty và điều kiện dừng trước holdout. [Bản protocol đề xuất](phase-3-acceptance-protocol-draft.md) cần calibration và review; không phải protocol đã được duyệt.

Sealed v2 có 20 dev/10 candidate holdout. 5 dev cases có critical unknown nên bị context block; reader abstention/conflict chưa đo. Không xóa critical flag để tăng coverage. Cần bộ admissible cases và holdout version mới được review độc lập; giữ seal/dataset cũ. Manifest hiện còn cố định 20/10, cần mở rộng bằng version riêng trước bộ mới. Chưa có durable exposure register đảm bảo ghi trước `countInput`; đường acceptance vẫn đóng để không vô tình làm lộ holdout.

Outcome review import chỉ là external attestation. Cần đối chiếu reviewer/rubric/protocol, lý do bất đồng, coverage và evidence provenance trước quyết định gate. Paired diagnostics không thay các bước đó. T14 cần linked evidence trên đúng accepted T19/T11 versions, gồm promotion, revoke/conflict/recovery; `runtime.fixture` vẫn là release duy nhất. Không mở Unity/game trước T22.

## Xác minh và bàn giao

Fresh-copy install/build/check đạt **466/466 tests, 0 fail, 0 skip**; source không đổi trong run. [Clean verification](evidence/phase3-acceptance-prep/clean-acceptance-prep-20260925T085122Z-summary.json) giữ raw logs, source hashes trước/sau và built JS manifest. Source manifest gồm code/tests/fixtures/scripts: `sha256:c3615ad15edb1d07e05181db3a2a89d11e300b782c10bca7a7df5fe75222d6b8`.

[Local mirror evidence](evidence/phase3-acceptance-prep/verification-summary.json) hoàn tất 12/12 main +4/4 G, 20 sandbox mock generations, 0 provider calls, chi phí 0, không reservation/usage uncertainty. Export đủ 16 output review; chưa có actual human judgments. Có 4 paired diagnostic groups; G tách khỏi so sánh. Campaign implementation pin `sha256:8310abb1e98accae59a98f80c8191b1de39f89dd3dd7436fd76c51d9a449d486`; đây là tập file pin của runner, khác full clean manifest. JS dùng cho mirror khớp bản build sạch.

Review độc lập tìm hai lỗi và đã đóng bằng regression: bỏ sót `model-context-blocked` trong paired counts; chưa nối packet digest tới complete reader request. Cách sửa thứ hai tái dựng request từ prompt/schema/profile/output đã pin; packet thay thế dù tính lại window hash vẫn bị chặn. Prompt version không được hỗ trợ không được khai là verified. 16 outcome review tests và 11 paired tests nằm trong suite 466; không cộng các lượt chạy lặp thành số tests mới.

Sealed v2/dataset/gold không thay đổi. Không chạy lại full 960+120 mock matrix chỉ để đổi source pin; số đó thuộc baseline 422. Bản này có mirror nhỏ và full regression suite riêng, không giả là real-model acceptance. **Chưa nhận phê duyệt chi phí/key-check; không đọc key, không gọi API.**
