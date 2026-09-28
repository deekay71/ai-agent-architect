# Phase 3 — Kế hoạch đóng phần còn lại

## Actual hiện hành — 28/09/2026

Terra medium / Sol medium / Astra high đã áp dụng vào [plan](phase-3-execution-plan-2026-09-28.md) và config smoke mới. **530/530 clean tests Pass**; sửa exact Code Mode startup notice đã kiểm offline. 3 live attempts mới đều chưa có output/usage hợp lệ; ledgers frozen, không retry. Sol/Astra chưa chạy. [Báo cáo và evidence](phase-3-routing-execution-report.md); [bàn giao calibration](phase-3-calibration-worklist.md). Phase 3 chưa Pass, T19/T14 Not evaluated, T11 Replan. Các mốc 25/09 và profiles Luna phía dưới là lịch sử.


## Tiếp tục thực thi — 28/09/2026

Owner yêu cầu áp dụng Terra/Sol/Astra vào plan và thực thi tiếp. [Plan hiện hành](phase-3-execution-plan-2026-09-28.md) phân vai theo từng gói, dependency, gate và phạm vi đo mới; configs/failed runs ngày 25/09 là lịch sử. Bước hiện tại: chẩn đoán CLI, regression fix, DEV smoke ba profiles, rồi chuẩn bị calibration. Giữ ledger cũ frozen và mọi unknown; không đổi status Phase 3 chỉ vì có model output.

## Quyết định hiện hành — Codex subscription, 25/09/2026

Owner đã duyệt chạy DEV benchmark qua **Codex CLI đăng nhập ChatGPT**, dùng quota Codex hiện có. Không cần API key và không áp dụng đề xuất cap API 5 USD. Giữ cấu hình Astra/high cho planning và Luna/medium cho execution; đây là requested profiles, chưa phải chứng nhận model hoặc phân vai. Đợt đầu giới hạn một dev case, 6 comparison trials +2 G, tối đa 10 invocations. Runbook và actual nằm trong [báo cáo Codex](phase-3-codex-benchmark.md). **Actual: hai attempts, 0 valid model answers; một local startup failure đã reconcile có evidence, một started-thread attempt còn unknown usage và ledger frozen. Smoke chưa đạt; không chạy lại hoặc reset allowance tự động.**

Đường đo này ghi reported usage sau call, không có exact provider pre-count hoặc hard output cap, không suy quota thành USD. T19/T14 vẫn Not evaluated, T11 Replan; Phase 3 chưa PASS. Cần calibration độc lập, protocol/holdout mới và adjudication/handoff. Các đề xuất API và đoạn scope chỉ local bên dưới là lịch sử, không phải việc đang chờ owner duyệt nữa.

## Quyết định tiếp tục — 25/09/2026

Owner chọn **hoàn tất nghiệm thu Phase 3 trước**, chưa mở Phase 4. Đã bổ sung DEV readiness, chọn case và forecast, model capacity admission, paired diagnostics và review actual outputs. Fresh-copy build/check đạt **466/466 tests, 0 fail/skip**; mirror hoàn tất 12 main +4 G với 20 mock generations, export đủ 16 review outputs; 0 provider calls, source ổn định. Hai finding review đã sửa. [Gói chuẩn bị nghiệm thu](phase-3-acceptance-prep.md) có cấu hình smoke 2 case, Astra/Luna, tối đa 20 generation calls, generation upper bound 4,242980 USD và đề xuất cap 5 USD. **Chưa nhận phê duyệt chi phí/key-check; chưa gọi API hoặc đọc key.** Smoke không thay calibration/fresh holdout/protocol/adjudication và T14. T19/T14 vẫn Not evaluated, T11 Replan; Phase 3 chưa PASS. Những đoạn scope “chỉ local, S2–S4 để sau” bên dưới là lịch sử trước quyết định tiếp tục này.

Ngày 25/09/2026. Mục tiêu cuối là hoàn thiện Phase 3 theo AC đã duyệt. Phạm vi người dùng vừa xác nhận là **“Chỉ hoàn thiện và chạy test local trước”**: triển khai harness/provider adapter, dataset/evaluator, mock campaigns, tests và test plan; không gọi provider thật hoặc kiểm API key. T19/T11/T14 giữ gate mở khi phần live/human acceptance được để sau theo quyết định này; không tự mở Phase 4 hoặc gameplay. [Test plan](phase-3-test-plan.md) là bản traceability và runbook; [báo cáo Phase 3](phase-3-report.md) giữ baseline đã bàn giao.

Người dùng đã chọn dùng model OpenAI/ChatGPT, cấu hình chất lượng cao cho planning và cấu hình ít tốn chi phí hơn cho execution. Profile cấu hình khởi điểm: `gpt-6-astra` planning, `gpt-6-luna` execution, `gpt-6-sol` manual escalation. Đây là quyết định phân vai, chưa là quality certification, price/usage đã đo hoặc quyền chạy live. Không cần hỏi/key-check để hoàn tất scope local. Critic cần phiên/context và quyền đánh giá độc lập. Trong benchmark context, giữ **cùng executor model/config giữa ba arms** để tránh lẫn ảnh hưởng model với policy context.

## Hiện trạng cần giữ nguyên

- T09/T10 Done / Pass trong phạm vi local. Baseline 327/327 tests từ source sạch; đây không phải kết quả của các phần mới.
- T19 có packet/manifest/compaction/runtime guard nhưng thiếu downstream quality, token/usage/cost và real-model comparison theo AC.
- T11 Replan. R1 có 6 false accepts; R2 0 false accepts/78 false rejects trên 540 trials là regression trên bộ đã lộ. Không tái đặt tên tập này thành independent holdout.
- T14 có promotion/review/invalidation code và tests, nhưng full handoff chờ T19 và evidence gate liên quan; không đóng task bằng implementation readiness.
- Active release chỉ `runtime.fixture`. Roslyn/Unity/live source-fetch adapter vẫn không được suy là đã có.

## S1 bổ sung sau review local

Người dùng đã yêu cầu sửa các findings; phần này thuộc S1, không cần mở live/API. Gói sửa bao gồm error receipts có mã lỗi/HTTP status/request ID đã lọc; count generation chống request cũ cấp lại admission; pin/revalidate human review và external evidence; gathering scores tách khỏi reader, coverage theo answerability; audit exact/near-clone trên public question/history giữa các split. [Báo cáo sửa lỗi](phase-3-fixes-report.md) ghi source pins, tests và campaign mới; số 384 tests và 960/120 trials ở mục actual cuối là lịch sử trước bản sửa.

Điều kiện đóng gói sửa: repro âm bị chặn, trường hợp hợp lệ vẫn chạy, report v2 giữ null/unknown đúng nghĩa và không giấu blocked trials; review/source/config pins ổn định; source sạch chạy suite và mock campaign phù hợp trên version mới. Các diagnostics không thay đổi quality floor hoặc tự cấp gate. Split audit lexical không thay human semantic/provenance review; khả năng reader trên nhóm context-blocked tiếp tục là chưa đo.

Actual đợt sửa: **422/422 tests, 0 fail/skip**; campaign `semantic-local-v2-fixes` hoàn tất 960 main +120 G, 1.350 mock calls/0 provider calls, source/review/provider integrity ổn định. Review cuối không còn P1/P2; logs/pins và coverage chi tiết ở báo cáo sửa lỗi. S1 bổ sung đã được xác minh local; S2–S4 vẫn chưa thực hiện.

## Các gói công việc có thể chạy song song

| Gói / owner | Đầu ra cần bàn giao | Đo nghiệm thu | Dependency / điểm dừng |
|---|---|---|---|
| W1 — AI provider engineer | Provider adapter, exact request/response model schema, whole-packet counting, usage/cost receipts, durable reservation/attempt states | C05–C08; fake HTTP, limits, malformed/refusal/incomplete/error, no free retry, model mismatch | Local dùng injected/mock provider; real run bị giữ ngoài scope hiện tại, cần yêu cầu mới của owner |
| W2 — AI evaluator độc lập | Public task/corpus schema, evaluator-only gold schema, family split, candidate holdout, alternative-evidence/answerability/revision/constraint checks | E01–E05/E09/E10; split/provenance/label review, contamination probes | Tập do người viết harness đã xem chỉ là candidate/exposed; human review không tự xảy ra |
| W3 — AI integration owner | F/R/C/G campaign runner, matrix, context checkpoints, full attempt journal, source/config locks, reports | C09/C10/E06–E08; paired real outcomes, cost all calls, coverage và uncertainty đúng mẫu | Phải dùng Context/Memory thật hoặc ghi rõ scope hẹp; không đánh tráo API receipt thành context quality |
| W4 — AI test/reviewer | Test plan, threat/failure cases, independent implementation review, clean-source evidence | M01–M05/C01–C08/H01–H04/V01; finding có repro và resolution | Reviewer không tự chứng nhận semantic truth; phát hiện failure thì fix/replan trước close |
| W5 — Owner + AI reviewer | Dev calibration, independent labels/adjudication, threshold/role/model/cost manifest, final evidence review | Không thiếu hard gates/coverage; quality floor và policy đóng băng trước holdout | Thuộc giai đoạn live/human được để sau; không coi chưa chạy là local implementation failure |
| W6 — Integration + owner | Source→context→model result→handoff→review→promotion, revoke/recovery integration, gate record | H03–H05, đúng dependency/source/model/policy versions | T19/T11 chưa đủ evidence thì T14/Phase 3 không PASS |

Các gói tạo artifact review được trước khi cần owner quyết định. Không chờ credentials để làm code, test protocol, dataset validator, test plan hoặc review. **Dừng trước real dev smoke đúng quyết định của owner**; không hỏi lại key/cost ở giai đoạn này. Không tự mua credit, tạo key hoặc chạy paid campaign.

## Các mốc thực thi và thời gian có điều kiện

Đây là working estimate cho một owner + AI agents, không thay Forecast R2 lịch sử 02–27/11/2026. Chỉ S1 và mock campaign thuộc yêu cầu đang thực thi; S2–S4 là các mốc tiếp tục sau khi owner yêu cầu chạy live. Ngày kết thúc phụ thuộc API/config, thời gian review nhãn và số vòng replan; không lấy tốc độ code/test local làm throughput của Unity.

| Mốc | Việc hoàn tất | Ước lượng sau khi đủ đầu vào | Điều kiện đi tiếp |
|---|---|---|---|
| S1 — cơ chế local | W1–W4 code/docs, protocol tests, mock matrix/campaign, review độc lập, clean-source check | 1–2 phiên làm việc AI; ghi actual, không đổi thành owner-hours tự đoán | Các test bắt buộc qua; known findings đã xử lý; artifact version khóa |
| S2 — dev calibration | Pin provider/model config và giá; small dev smoke, budget receipt; thử matrix trên dev; label review | 0,5–1 ngày làm việc, cộng thời gian owner cung cấp/review | Usage/counting/cost đủ; protocol thresholds và independent holdout review sẵn sàng |
| S3 — acceptance campaign | Freeze source/data/prompt/config; real paired F/R/C/G; giữ mọi attempts | 1–2 ngày tùy matrix/cap/API rate và review | Đủ coverage, không contamination; không tuning sau holdout; mọi unknown được xử lý hoặc gate giữ mở |
| S4 — adjudication/handoff | Review bất đồng, uncertainty, H03–H05 và T19/T11→T14 gate | 0,5–1 ngày cho một vòng | Chỉ PASS nếu toàn AC đạt; fail giữ evidence và tạo replan/new dataset khi cần |

Candidate mock matrix: full/retrieval/compaction, compaction rounds 1/3, distractor limits 0/8, tổng trial token budgets 8192/16384/32768; so arms trong từng profile. Config `fixtures/semantic-config/local.json` dự kiến 960 main trials +120 post-comparison gold-evidence controls; actual completion lấy từ report. CLI và đường artifacts có trong test-plan runbook. Counts/usage synthetic phải ghi rõ, không coi là provider receipts thật. Provisional strictPass floor 0.9 không phải ngưỡng nghiệm thu đã calibration; critical-unknown cases bị context block nên reader answerability coverage chưa đo. Giữ nguyên hard gate, không xóa critical flag để tăng điểm. Context Engine vẫn local UTF-8; exact provider boundary counting được thử bằng injected mock. Campaign budget SQLite chỉ quản lý measurement spend, không thay runtime ledger/release.

Không chạy một ma trận vô hạn: trước S3, manifest ghi số case/family, 3–4 mức budget, density/position/depth, repeats, request upper bound và cost worst case. Nếu không vừa cap thì replan coverage **trước** run. Timeout/ambiguous charge giữ reservation; không khởi chạy lại miễn phí theo giả định lỗi mạng không tính tiền.

## Điều kiện đóng từng task

| Task | Evidence bổ sung | Điều chưa đủ để đóng |
|---|---|---|
| T19 | Complete packet token accounting đúng provider; same-model F/R/C across budget/distractor/repeated compaction; downstream success/loss/fidelity/recovery, usage/cost/latency, frozen quality thresholds | Unit tests, byte-count reduction, provider adapter chạy được hoặc một smoke answer |
| T11 | Fresh independently reviewed sealed holdout; oracle/process isolation đúng phạm vi tuyên bố; evidence alternatives/answerability/revision/constraints; retrieval-vs-reader/G control; calibrated independent grader/human adjudication, uncertainty và all-attempt report | R2 exposed regression, tự gán nhãn rồi tự chấm, chỉ schema pass, chỉ average quality, hoặc hai thư mục oracle/corpus |
| T14 | Grounded complete handoff và independent exact-evidence promotion trên accepted T19/T11 versions; revoke/conflict/version/recovery integration | Memory promotion unit tests khi dependency acceptance còn mở |
| Toàn Phase 3 | Linked gate report chỉ đúng task classes/model/config/source scope đã kiểm; zero unresolved hard-gate failures; owner review phần cần người | Tổng số tests/task Done, report model tự nói PASS, hoặc thiếu coverage được gán N/A sau run |

Không đổi AC để biến implementation thành acceptance. Nếu cần thu hẹp scope phải có replan ghi rõ yêu cầu nào chuyển sang đâu và người quyết định; trước đó trạng thái task còn mở. Phase 4/Unity không tự được cấp release; T22 vẫn bắt buộc trước game Block Puzzle.

## Handoff cho lần làm việc tiếp theo

Gói bàn giao cần source/version manifest; test plan và closure plan; full-suite/focused logs; provider fake/live receipt classification; protocol/data/exposure locks; candidate/public dataset và evaluator gold lưu đúng boundary; every-attempt journal; paired report và uncertainty; human decisions; gate record hoặc lý do Blocked/Replan; exact reproduction commands; chi phí/owner touch thực đo được hoặc UNKNOWN.

GitHub/Drive/Notion là nơi đồng bộ artifact, không thay nguồn chuẩn kiểm nghiệm. Không đưa API keys vào log/source/cloud export. Giữ failed campaign/history và baseline Forecast R2; current status phải phân biệt `implemented`, `tested local`, `measured with provider`, `independently accepted`.

Điều kiện hoàn tất **scope local hiện tại**: code/harness và mock campaign có source pins, tests phù hợp cùng review đã xử lý findings, test plan/runbook thực thi được, report nêu coverage và phần acceptance chưa chạy. Không cần chờ S2–S4 để bàn giao scope local.

Chưa có live benchmark mới hoặc quyết định PASS mới được tạo bởi tài liệu này. Trạng thái thực thi mới phải lấy từ report và artifacts trên đúng source pin sau khi run.

## Actual scope local đã bàn giao trước review — 25/09/2026

**S1 và mock campaign đã hoàn tất tại lần bàn giao trước review**. [Clean-source evidence](evidence/phase3-closure/clean-r1-20260925T071254Z-d760e9-summary.json) đạt 384/384 tests, 0 fail/skip; source giữ nguyên trong run. Các lỗi reviewer về density giả, source dependency ngoài manifest và partial review mở holdout đã được sửa và có regression.

[Local campaign](evidence/phase3-closure/local-campaign-summary.json) chạy đủ 960 main +120 G controls, source/config stable, không bị dừng lỗi. Main có 630 reader outputs, 90 token-budget blocks và 240 critical-context blocks; G có 90 outputs và 30 context blocks. Tổng 1.350 sandbox mock generation calls, 0 real-provider call, 0 canonical loss; cap/charged 0 và không còn usage reservation chưa giải quyết.

Đây là nghiệm thu implementation/test **local**, không phải nghiệm thu model. Reader fixture luôn abstain, model quality chưa đo, quality thresholds không đạt; không chuyển T19/T11/T14 hoặc toàn Phase 3 thành PASS. S2–S4 tiếp tục được để sau theo quyết định của owner, bao gồm real-model/token/cost measurement, independent human labels/holdout/calibration và dependent handoff gate. Test plan đã có commands, inputs/negative cases, thresholds cần khóa, role phân công và evidence cần thu cho các bước đó.
