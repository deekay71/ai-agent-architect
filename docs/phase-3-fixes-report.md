# Phase 3 — Sửa findings và bổ sung measurement sau review

Ngày 25/09/2026. Người dùng yêu cầu sửa lỗi và bổ sung các thiếu sót được phát hiện khi review kết quả. Phạm vi giữ **chỉ local**: không gọi OpenAI API, không kiểm credentials, không mở Unity hoặc gameplay. T09/T10 vẫn **Done / Pass local**; T19/T14 **Doing / Not evaluated**; T11 **Doing / Replan**; toàn Phase 3 chưa PASS. Tổng 8 Done, 3 Doing, 14 Todo.

Bản bàn giao trước ở `e82b429` có 384/384 tests và 960 comparison +120 G controls bằng mock. [Report trước](phase-3-closure-report.md), source pins, failed attempts và evidence được giữ nguyên. Các con số cũ không xác minh source đã sửa trong đợt này.

## Bốn findings và phần bổ sung

| Finding | Thay đổi | Điều phải được xác minh |
|---|---|---|
| R1 — campaign làm mất chẩn đoán lỗi | Call receipt giữ loại lỗi, allowlisted code, HTTP status, validated request ID, boundary và digest; ghi vào journal/report | Count/generation HTTP failures và timeout truy nguyên được; không lộ exception message, stack, body, key hoặc arbitrary headers; unknown usage giữ reservation |
| R2 — race giữa các count cùng request | Mỗi count có admission generation riêng; recount thu hồi admission cũ ngay khi bắt đầu | Success cũ không hồi sinh quyền generation sau recount thất bại; failure cũ không xóa success mới; pending/latest failed count không cấp generation |
| R3 — human-review evidence đổi giữa campaign | Lock review status/digest/identity/case coverage/external evidence refs; tái kiểm trước/sau async boundaries và khi chốt report; drift sticky | Record/evidence bị đổi, xóa, thay hoặc thêm sau preflight làm campaign dừng; trước send không gọi generation, sau send giữ actual/unknown usage; report không báo integrity ổn định |
| R4 — chưa đo gathering tách reader | Evaluator đo retrieval và selected evidence độc lập reader; report v2 có answerability/task-class coverage và reader rate theo scored trials | Required evidence thiếu không bị prose đúng che; đầy đủ evidence vẫn ghi nhận dù reader abstain; reader-blocked không thành correct abstention; zero denominator không thành perfect score |
| Bổ sung — audit nội dung dev/holdout | Versioned lexical audit trên public question/history, không dựa riêng family/ID | Exact/near-clone khác family bị reject; broad overlap được giữ thành suspected pairs; report pin policy/content/audit digest; human semantic review vẫn bắt buộc |

Error sanitization chỉ giữ các fields cho phép; không hash/lưu raw secrets làm bằng chứng. Review import vẫn là operator attestation, không xác thực danh tính con người. Host broker/evaluator là trusted boundary như trước; các sửa đổi không bổ sung production service isolation hoặc tự cấp runtime authority.

## Cách đọc report mới

Schema `semantic-campaign-report/2` bổ sung review/evidence và provider integrity, split audit, `gathering.retrieved`/`gathering.selected`, cùng coverage main/G riêng. Gathering được chấm sau comparisons trên evaluator; expected answers hoặc oracle labels không được đưa vào model inputs.

- Recall dùng required sources hợp lệ đúng revision; source optional được pin trong `expectedRevision` có thể làm tăng precision, không bị coi là distractor chỉ vì không required.
- Precision dùng distinct gathered IDs; stale/revoked/distractor/unsupported/revision mismatch là known ineligible, unknown IDs được ghi riêng. Nhiễu giảm precision; sufficiency chỉ hỏi có đủ required evidence hay không.
- Zero required sources cho recall/sufficiency `null`; empty gathering cho precision `null`; context chưa chuẩn bị được không có gathering score. Không biến thiếu dữ liệu thành 100%.
- Reader quality có mẫu số rõ: `readerStrictPassRate` chỉ dùng scored trials; coverage phân answerable/unanswerable/conflict và task class. Từng trial giữ sufficiency và reader diagnosis nhưng chưa có aggregate reader chỉ trên nhóm đủ evidence. Context/token blocks và malformed output giữ outcome riêng; không được tính là reader correct-abstention.
- All-trial strictPass và quality floor cũ giữ nguyên; metrics có điều kiện giúp chẩn đoán, không dùng để nâng gate. G control vẫn chạy riêng sau comparisons và không cộng vào main quality.

Reader scorer cũng sửa optional evidence: chỉ required sources bắt buộc xuất hiện; optional source bỏ qua không làm mandatory revision fail, còn source đã cite vẫn phải đúng revision và eligibility. Đây là correction để khớp semantics required/optional, không mở rộng accepted answer text hoặc nới hard gate.

Split audit là lexical screen: NFKC/lowercase token normalization, token/bigram Dice trên question/history, policy và thresholds có version. Exact/near-clone bị chặn; overlap rộng hơn tạo advisory review. Paraphrase khác từ có thể lọt screen; `clear` không đồng nghĩa independently reviewed hoặc fresh holdout. Dataset v2 vẫn candidate chưa được human acceptance.

## Xác minh của source mới

Clean-source verification và mock campaign đã hoàn tất trên source mới. Đây là xác minh implementation/protocol local; `modelQualityMeasured=false`, harness gate `Not evaluated`, không đóng Phase 3.

| Bằng chứng | Kết quả đợt sửa |
|---|---|
| Commit/source manifest và source ổn định trước/sau | 126 source files; `sourceUnchanged=true`; digest `sha256:c6c570ee9f31705dd6443e61bc435267c68af379f26943031830d39fcbc63f3b`; commit bàn giao ghi trong delivery manifest trên Drive |
| TypeScript build + clean full suite, fail/skip | 422/422 pass, 0 fail/skip; 38 tests tăng so baseline 384; 87 emitted JS files, digest `sha256:0e6af243d44f0c962a43855c9f8dc078fc93c1403cd654d6c9f0a80f72257040` |
| Regression R1–R4 và split audit | Có trong full suite đã pass; [summary](evidence/phase3-fixes/clean-fixes-20260925T082029Z-summary.json), [check log](evidence/phase3-fixes/clean-fixes-20260925T082029Z-check.log) |
| Campaign ID, config/dataset/implementation pins | `semantic-local-v2-fixes`; config `fixtures/semantic-config/local-fixes.json`, mock cap 0; exact pins ở mục dưới và [summary](evidence/phase3-fixes/local-campaign-summary.json) |
| Main trials và G controls planned/completed | 960/960 main, 120/120 G; 1.080 trial journal entries; 2.790 call journal events |
| Calls mock/provider; blocked/unknown outcomes | 1.350 mock generation calls, 0 provider calls; main 630 completed/90 token-blocked/240 context-blocked; G 90 completed/30 context-blocked |
| Review/source/provider integrity và spend reconciliation | `configAndSourceStable`, `reviewEvidenceStable`, `providerIdentityStable`, `campaignIntegrityStable` đều true; stoppedReason null; cap/charged 0, reserved/uncertain attempts 0; 0 canonical loss |
| Gathering/reader coverage theo arm, answerability và task class | Cả 1.080 trials có gathering scores; summary nhóm theo profile/arm/depth/density/budget/task class; cohort reader unanswerable/conflict vẫn 0 output |
| Report/log paths và cloud handoff | Local report `.local/semantic-local-v2-fixes-run1/report.json`; summary trong repo; [Drive đợt sửa](https://drive.google.com/drive/folders/18XOvGDcJnSmzxSNKH5G28WKOcRXecKuE), raw campaign đã đối chiếu file ID/parent/9.862.314 bytes; source/history và manifest bàn giao nằm cùng thư mục |

Gathering main có **816 trial có required evidence, cả 816 đủ evidence**, mean recall 1,0; 144 trial không có required evidence giữ recall/sufficiency null. Mean precision của retrieval là 0,484375, của selected context là 0,482448 trên 960 trial: các nguồn nhiễu vẫn được đưa vào context, dù không mất required evidence. G có 102 trial required evidence với recall/precision 1,0 và 18 trial N/A. Đây là số đo gathering trên fixture, không chứng minh reader/model quality.

Main có 720 answerable trial, trong đó 630 reader outputs và 90 bị token block; 144 unanswerable và 96 conflict trial đều bị context block. G có 90 answerable outputs, 18 unanswerable và 12 conflict bị context block. Reader mock luôn abstain nên strictPass bằng 0; không sửa threshold hoặc critical flags để thay kết quả. Cả dataset hiện dùng `infrastructure.operations`; report đã hỗ trợ grouping task class nhưng không suy coverage cho class khác. Split audit so 200 cặp dev/holdout, `clear`, 0 suspected pairs; `humanSemanticReviewRequired=true` vẫn giữ.

Exact pins:

- Dataset seal: `sha256:be327cca08b882f0c45669cf5cff38f5009dd26a89cb2c46b39dcc2302250008`.
- Config digest: `sha256:d10238b04352bc68b3594188b8463677d7370ebffa11731b6ff25c3dcd33aa90`.
- Campaign implementation digest: `sha256:dc0026e10d987c8dbe6421fe5a1106b0c5587b19fb8378949ac45d376ad1d5d5`.
- Full report SHA256: `4a316f4dd93ab9aebaf7895f04fcef4b8b08f1273cfd82179932d965682a0e38`.
- Split audit digest: `sha256:38e8179940c47a327cb713164beea61efd8d748bf2d3b1904e78728ec8f14f7b`.

Clean-source digest bao phủ source/tests/fixtures theo clean manifest; campaign implementation digest pin runtime source/dependencies, dataset/config pin riêng. Đây là các tập files khác nhau, không yêu cầu digest bằng nhau. Số actual provider tokens và cost trên mọi trial vẫn null; spend fixture 0 không là giá API đo được.

Tests mục tiêu: `openai-provider`, `semantic-campaign-bindings`, `semantic-gathering`, `semantic-split-audit`, `semantic-campaign`, `semantic-campaign-review`, cùng full suite trên source sạch. [Test plan](phase-3-test-plan.md) ánh xạ C11/C12/E11–E13 với input âm, expected result, mẫu số và evidence cần giữ. Chỉ ghi actual counts khi có logs/report phù hợp, giữ mọi failure trước và sau fix.

## Review độc lập trên diff từ `e82b429`

| Trục review | Kết quả và phạm vi |
|---|---|
| Standards | 0 findings ở lượt cuối; kiểm code thay đổi theo quy tắc repo, dữ liệu/diagnostics có boundary rõ |
| Spec | Không còn findings P1/P2 ở lượt cuối; kiểm bốn yêu cầu sửa và phần split/coverage bổ sung. Reviewer phát hiện thiếu grouping theo task class; implementation và assertions đã được bổ sung trước clean run 422 tests |
| Kiểm chéo provider/evidence boundary | Không phát hiện finding mới trong phần race admission, sanitized diagnostics và review evidence binding |

Review này áp dụng cho implementation local đã kiểm; không phải independent human label review, model acceptance hoặc nghiệm thu toàn Phase 3. Source manifest trên gắn với code được build/test; commit bàn giao cuối được ghi riêng sau khi đóng gói.

## Phần vẫn để sau

Model/token/cost thật, independent label/semantic-overlap review, dev calibration và frozen fresh holdout campaign chưa thực hiện theo quyết định chỉ local. Các ca critical unknown tiếp tục block context; nếu không có reader outputs thì reader quality của nhóm đó chưa đo. T19/T11 cần đủ evidence trước khi nghiệm thu handoff T14; Phase 4 vẫn chưa mở và T22 vẫn bắt buộc trước Block Puzzle. Forecast R2 giữ làm baseline, không đổi deadline dựa trên tốc độ unit tests.

Bản tài liệu trên [Notion](https://app.notion.com/p/3e6a6c16b3dc8180bc0cff5fc43cfd60). GitHub chưa push; bản source/history được bàn giao riêng trên Drive, không suy cloud upload thành remote Git đã đồng bộ.
