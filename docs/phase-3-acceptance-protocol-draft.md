# Phase 3 — Đề xuất protocol nghiệm thu S2 → S3 → S4

## Actual hiện hành — 28/09/2026

Terra medium / Sol medium / Astra high đã áp dụng vào [plan](phase-3-execution-plan-2026-09-28.md) và config smoke mới. **530/530 clean tests Pass**; sửa exact Code Mode startup notice đã kiểm offline. 3 live attempts mới đều chưa có output/usage hợp lệ; ledgers frozen, không retry. Sol/Astra chưa chạy. [Báo cáo và evidence](phase-3-routing-execution-report.md); [bàn giao calibration](phase-3-calibration-worklist.md). Phase 3 chưa Pass, T19/T14 Not evaluated, T11 Replan. Các mốc 25/09 và profiles Luna phía dưới là lịch sử.


## Quyết định hiện hành — Codex subscription, 25/09/2026

Owner đã duyệt chạy DEV benchmark qua **Codex CLI đăng nhập ChatGPT**, dùng quota Codex hiện có. Không cần API key và không áp dụng đề xuất cap API 5 USD. Giữ cấu hình Astra/high cho planning và Luna/medium cho execution; đây là requested profiles, chưa phải chứng nhận model hoặc phân vai. Đợt đầu giới hạn một dev case, 6 comparison trials +2 G, tối đa 10 invocations. Runbook và actual nằm trong [báo cáo Codex](phase-3-codex-benchmark.md). **Actual: hai attempts, 0 valid model answers; một local startup failure đã reconcile có evidence, một started-thread attempt còn unknown usage và ledger frozen. Smoke chưa đạt; không chạy lại hoặc reset allowance tự động.**

Đường đo này ghi reported usage sau call, không có exact provider pre-count hoặc hard output cap, không suy quota thành USD. T19/T14 vẫn Not evaluated, T11 Replan; Phase 3 chưa PASS. Cần calibration độc lập, protocol/holdout mới và adjudication/handoff. Các đề xuất API và đoạn scope chỉ local bên dưới là lịch sử, không phải việc đang chờ owner duyệt nữa.

Ngày lập: 25/09/2026. **DRAFT — chưa được owner phê duyệt, chưa đóng băng, không cấp quyền chạy API hoặc chi phí.** Tài liệu này là đầu vào để review và calibration; không phải `PolicyRelease`, `GateReport` hoặc bằng chứng có human review. Các giá trị đề xuất bên dưới chưa được dùng để nghiệm thu.

Trạng thái vẫn là T09/T10 Pass local; T19/T14 Not evaluated; T11 Replan; toàn Phase 3 chưa Pass. Mục tiêu là hoàn tất nghiệm thu Phase 3 trước Phase 4. Nguồn AC: [test plan](phase-3-test-plan.md), [closure plan](phase-3-closure-plan.md), [báo cáo sửa lỗi](phase-3-fixes-report.md). Giữ Forecast R2 và các campaign cũ làm lịch sử.

## 1. Phạm vi và đơn vị đo

Protocol xét Memory/Context phục vụ tác vụ hạ tầng đọc evidence, giữ constraints/AC, nêu đúng giới hạn và abstain khi không đủ căn cứ. Tập hiện tại chủ yếu thuộc `infrastructure.operations`; không suy kết quả của lớp này thành mọi tác vụ lập trình, Unity, gameplay hoặc execution ngoài `runtime.fixture`. Mỗi task class bổ sung phải có workload, rubric và coverage riêng được khóa trước S3.

Một **case** gồm câu hỏi công khai, task scope, constraints/AC, history, corpus có revision, expected answerability và oracle evidence do evaluator giữ riêng. **Family** là nhóm case dùng cùng tình huống hoặc cùng cơ chế suy luận; đổi tên, UUID, đường dẫn hoặc cách diễn đạt không tạo family độc lập. Split theo family và kiểm nội dung/provenance, không chỉ theo trường `family`.

Một **trial** là một case × profile × arm × budget × density × compaction depth × repeat. Repeat đo biến thiên của cùng case; không tăng số case/family độc lập. Một **paired observation** ghép F với R hoặc C trên cùng case, profile, budget, density và repeat. Kết quả giữa hai profile/model không được coi là phép đo ảnh hưởng của context policy.

S3 phải khóa `N_cases`, `N_families`, số case từng task class/answerability/failure family và quy tắc lấy mẫu. Độ tin cậy thống kê theo family khi các case trong family phụ thuộc. Nếu corpus chỉ là authored challenge set, kết luận giới hạn ở tập/scenario được thử; không gắn confidence interval với tuyên bố population reliability khi thiết kế lấy mẫu chưa hỗ trợ.

## 2. Thứ tự S2 → S3 → S4

| Mốc | Thực hiện | Điều kiện đi tiếp |
|---|---|---|
| S2a — DEV smoke | Hai dev cases đã chọn, request/token/usage/model/cost kiểm tra được; xuất output review | Owner cấp scope/cap cho lần chạy; provider/model/capability/pricing pin được kiểm; không gọi holdout |
| S2b — DEV calibration | Mở rộng dev theo strata; independent outcome judgments; phân tích bất đồng evaluator/owner, model fidelity, budget feasibility | Có đủ evidence để đề xuất rubric, thresholds, sample size, matrix và stopping rule; mỗi lần mở rộng cần nằm trong authorization thực tế |
| S2c — Protocol/holdout freeze | Review dataset mới độc lập; chọn sampling unit; khóa mọi artifact và quyết định scope/threshold | Owner quyết định trên gói cụ thể; không còn field nghiệm thu bắt buộc để `null`; exposure register và acceptance validator đã triển khai/kiểm chứng |
| S3 — Acceptance campaign | Chạy ma trận F/R/C cùng model, G tách riêng; mọi attempts được ghi | Không drift/contamination, không tuning; kết thúc theo kế hoạch hoặc stopping rule đã khóa |
| S4 — Adjudication và handoff | Chấm output thực, phân xử bất đồng; T19/T11 gate rồi H03–H05/T14 | Chỉ xét Pass trong scope được kiểm khi đủ mọi AC; thiếu evidence giữ Not evaluated/Blocked, failure yêu cầu Replan |

[dev-smoke-draft.json](../fixtures/semantic-config/dev-smoke-draft.json) là **đề xuất**, gồm 2 dev cases × 2 profiles, 1 budget, 1 density, compaction 1 lần: 12 main trials +4 G, tối đa 20 generation calls. Trần tham chiếu 5 USD và các tên model/giá trong file không phải quyền chi tiêu hoặc xác nhận model khả dụng. `semantic-preflight` chỉ kiểm cấu hình; `liveReady=true` có nghĩa đủ điều kiện kỹ thuật cho DEV, không đồng nghĩa owner đã phê duyệt hay Phase 3 được nghiệm thu.

Không dùng smoke 2 cases làm S3. Dataset legacy khóa 20 dev/10 candidate holdout và đã được implementation team nhìn thấy; không tự đổi nhãn thành fresh independent holdout. Kích thước và tính độc lập cho S3 phải được quyết định từ S2b, rồi biểu diễn bằng manifest/version mới. Không sửa sealed bytes cũ.

## 3. Ma trận và kiểm soát đối chứng

| Nhánh | Input và thao tác | Vai trò trong phép đo |
|---|---|---|
| F — full | Toàn bộ nguồn eligible/in-scope của case và history; không cắt âm thầm khi quá budget | Baseline chất lượng/chi phí ở cùng điều kiện |
| R — retrieval | Retrieval/eligibility giống policy đã pin, context riêng cho role, không compact | Đo ảnh hưởng chọn nguồn so với F |
| C — compaction | Cùng retrieval với R, compact ở các checkpoint/depth đã khóa; canonical constraints/AC/unknown được hydrate lại | Đo loss/fidelity và chi phí mọi lượt summary cùng reader |
| G — evidence control | Evaluator cấp các public evidence documents cần thiết, chạy sau mọi comparison; không cấp expected answers/labels | Chẩn đoán gathering-vs-reader; không thay baseline F, không gộp vào main quality |

Đề xuất starting matrix cho calibration: tổng token budget `8192/16384/32768`, distractor density `0/8`, C depth `1/3`; F/R có depth 0. Đây là giá trị từ regression cũ, **chưa là ma trận acceptance được duyệt**. S2b xác nhận 3–4 budget phù hợp model và workload; nếu sửa phải trước S3. Giữ cùng model, reasoning effort, schema, prompt, output reserve, pricing tier và request capability trong từng phép ghép F/R/C.

Corpus phải bao gồm evidence ở đầu/giữa/cuối, distractor thực sự eligible, source cũ hấp dẫn nhưng không còn áp dụng, conflict, false premise, missing evidence, tool output dài và nguồn ngoài scope. Mỗi yếu tố có coverage đã pin; đổi density mà payload eligible không đổi không được tính là đã thử nhiễu. Vị trí evidence/family/scenario cần thể hiện trong dataset/protocol thay vì suy từ tên case.

Khóa thứ tự/seed của trials trước run; xen kẽ hoặc cân bằng thứ tự arms để giảm ảnh hưởng thời gian. Repeat sử dụng request mới, không chọn output tốt nhất. Giữ cùng case/repeat khi tính paired effects. Chi phí C bao gồm **mọi** compactor calls và reader call; nếu sau compaction không còn budget cho reader thì đó là một outcome cần báo.

## 4. Outcome, mẫu số và ngưỡng cần calibration

System outcomes và reader outcomes được ghi riêng. `context-blocked`, `token-budget-blocked`, `model-context-blocked`, refusal, incomplete, malformed, timeout và unknown usage đều hiện trong coverage. **Không output vì hệ thống chặn không phải model correct-abstention.** Không xóa critical unknown hoặc làm yếu gate để tăng reader coverage.

Các case legacy unanswerable/conflict đang bị critical-context gate chặn phải tiếp tục như vậy. Để đo reader quality, tạo case/diagnostic scope mới được review độc lập, trong đó việc đọc và trả lời “chưa đủ bằng chứng” là tác vụ admissible; không cấp quyền execution hoặc sửa canonical task cũ. Nếu không có admissible reader outputs ở strata bắt buộc, metric reader tương ứng là unknown và S3 không đủ coverage.

Đề xuất field phải khóa theo **từng task class và profile**, không gộp model chất lượng cao bù model chưa đạt:

| Field/metric | Định nghĩa cần khóa | Giá trị để review/calibration |
|---|---|---|
| `qualityFloor` | Human-adjudicated task success trên cohort đủ điều kiện đã định trước; báo cả all-planned success/coverage | Gợi ý ban đầu 0,90; **chưa được duyệt**, không kế thừa flag `human-calibrated` |
| `nonInferiorityMargin` | Delta R−F và C−F theo paired case/family; quy tắc uncertainty và missing pairs pin trước | Gợi ý tối đa giảm 0,05; **chưa được duyệt**; không kết luận từ point estimate đơn lẻ |
| `falseSupportLimit` / `falseAcceptanceLimit` | Trả lời hoặc nhận định supported khi human/evidence xác định không đúng; required evidence/revision áp dụng rõ | Hard-gate false support nghiêm trọng: 0; giới hạn/risk target cho lỗi khác cần owner quyết định |
| `falseRejectionLimit` | Abstain trên case answerable có đủ support; mẫu số là answerable cases trong cohort đã khóa | Gợi ý rate ≤0,10; **chưa được duyệt**; phải báo separately gathering-insufficient và reader failure |
| `correctAbstentionFloor` | Reader thực sự trả abstain đúng trên admissible unanswerable/conflict, có evidence/rationale phù hợp | Chưa chốt; cần S2b và reviewer độc lập |
| `minCaseAndFamilyCoverage` | Số case/family độc lập mỗi class/stratum, số paired repeats và complete/missing pairs | Chưa chốt; không mặc định “có 1 output là đủ” |
| `gatheringFloor` | Required-evidence recall/sufficiency và supporting precision; no-required/empty mẫu số null đúng nghĩa | Chưa chốt theo class; không dùng gathering đủ để suy reader đúng |
| `confidenceAndUncertaintyMethod` | Sampling unit, confidence, interval/paired procedure, multiple-comparison treatment nếu có | Gợi ý confidence 0,95; **chưa được duyệt**; dataset authored không tự đáp ứng assumptions |
| `latencyEnvelope` / `costEnvelope` | Request và end-to-end p50/p95, tổng input/output/reasoning/cached tokens, số calls, tariff cost và unknown charge | Chưa chốt sau smoke; bao gồm attempts lỗi và summary calls |
| `systemFeasibilityFloor` | Mức coverage/input khả thi ở mỗi arm/budget và xử lý F không vừa budget | Chưa chốt trước S3; không bỏ ô infeasible sau khi thấy score |

Các hard gates từ spec giữ nguyên: 0 scope/oracle leakage; constraints/AC binding đúng nội dung, revision và applicability; 0 unsupported promotion; không blind retry side effect; stale/revoked authority không dispatch/commit. Điểm trung bình hoặc cải thiện cost không bù lỗi hard gate.

Reader quality rate phải kèm numerator, denominator, excluded/missing/system outcomes và cohort định trước. Mẫu số conditional giúp chẩn đoán nhưng không được thay thế all-planned coverage. Trường hợp zero denominator giữ `null`, không 0% lỗi/100% thành công. G báo riêng. Repeats được average trong từng case trước khi average case; uncertainty theo family nếu family là independent unit. Diễn giải “giảm token mà không giảm chất lượng” cần cả evidence paired quality và toàn bộ token/cost; byte count không đủ.

Các con số 0,90/0,05/0,10/0,95 ở trên chỉ làm đề xuất đủ cụ thể để thảo luận. S2b có thể dẫn tới thay đổi; thay đổi ghi version/rationale/owner decision trước S3. Không dùng việc chưa có threshold chính thức để tự chọn một ngưỡng dễ Pass sau run.

## 5. Freeze manifest, review và exposure

Acceptance manifest phải có version/ID/digest và ít nhất các nhóm sau:

- Source commit, thực tế source/lockfile hashes và environment; mọi code chạy phải đúng pin.
- Dataset/corpus/oracle seal, source revisions, task/family split, public split-audit policy/result, source provenance, authors/reviewers và exposure history.
- Exact model/profile, returned model binding, provider/count API identity, prompt/output schema/config digests; cap context/output và accounting policy đã kiểm.
- Selected scope/cases, strata, đầy đủ ma trận/pairing/order/seed/repeats; sample-size rationale và worst-case calls/cost.
- Rubric/judge/human review roles, independent label/evidence review, ngưỡng/mẫu số/uncertainty/stopping rules; cách adjudicate bất đồng.
- Authorization có scope/cost cap thực tế; acceptance protocol owner decision; artifact refs và hashes cho mọi dependency.

**Dataset review và output review là hai bằng chứng khác nhau.** Dataset reviewer kiểm nhãn, evidence alternatives, answerability, semantic overlap và provenance của corpus. Output reviewer chấm kết quả thực với trial/answer/request/context/model/config pins. Hash một file “human review” hoặc tên reviewer không chứng minh danh tính/independence; hệ thống lưu external attestation và phải nêu đúng giới hạn đó. Người/agent biết oracle holdout không được dùng kiến thức đó để tune reader/prompt/retrieval cho cùng acceptance campaign.

Exposure register cần ghi durable event theo dataset seal, selected cases, protocol/campaign và request digest **trước `countInput`**, vì count endpoint cũng nhận nội dung. Dừng mạng/timeout hoặc chưa generation không xóa exposure. Các case/nội dung đã được xem hoặc truyền ra provider phải được ghi exposed/regression đúng phạm vi; chỉ gửi DEV không tự đánh dấu các holdout case chưa dùng là đã lộ. Nếu toàn bộ holdout đã được dùng để tune thì cả phần đó không còn fresh. Tạo output directory/campaign ID mới không làm nội dung đã lộ thành fresh holdout. Follow-up có thể phân tích failed campaign; muốn thử lại như acceptance cần quy tắc protocol đã khóa hoặc new independently reviewed holdout, không chọn chạy lại chỉ case fail.

Không đưa oracle/expected answers vào reader, Memory hoặc skill context. G chỉ truyền public evidence documents và chạy sau comparison. Export output review hiện hành không tự đọc oracle hoặc đưa automated score vào gói để tránh dẫn dắt reviewer. Human quyết định trên gói đọc được; AI có thể ghi/import quyết định thực tế, không cần owner tự viết JSON.

## 6. Budget, model pins và stopping rules

Trước mỗi generation: count complete serialized request; kiểm input cap, `count + outputReserve + headroom <= modelContextLimit` và cumulative trial budget. Reserve chi phí bền vững trước send; trả usage hợp lệ mới settle theo rates pin. Reasoning tokens thuộc output nếu provider định nghĩa như vậy, không cộng hai lần. Unknown usage giữ reservation/freeze theo ledger, không retry miễn phí hoặc chuyển sang spend directory mới để né cap.

Model alias trong config không bảo đảm immutable backend snapshot. Cần kiểm model khả dụng và supported effort/format/counting trước live; returned model phải phù hợp binding. Nếu provider không trả immutable build/version, ghi rõ mức identity thực sự quan sát được, không gọi đó là exact backend version. So arms trong cùng campaign, giữ receipts/time và dừng khi identity/capability/prompt pin thay đổi.

Forecast dùng tariffs đã pin, không phải hóa đơn: chưa gồm count-endpoint charge nếu có, thuế, surcharge hoặc external tools. Giá/capability có source/date và phải kiểm lại trước run. `generationTariffFitsConfiguredCap` chỉ nói bound giá tham chiếu nằm trong cap cấu hình; không chứng minh owner đã approve hoặc có credit. Smoke cap không tự cấp quyền cho full calibration/S3.

Stopping rules cần ghi trong manifest và chạy nhất quán:

1. Dừng calls mới khi source/data/config/review/provider identity drift, oracle/scope leak, request/usage binding unknown, budget frozen/cap exhausted hoặc dấu hiệu effect chưa reconcile.
2. Trial context/token/model-context blocked được ghi và xử lý theo coverage rule đã khóa; không biến thành model answer. Không cắt resource/đổi budget để cứu trial giữa run.
3. Refusal/incomplete/malformed answer là outcome được giữ. Nếu protocol cho chạy tiếp, vẫn giữ full trial và cost; nếu yêu cầu dừng, mọi ô chưa chạy hiện missing.
4. Không dừng sớm chỉ vì kết quả đã đẹp hoặc cherry-pick arm. Không tune prompt/config/rubric khi đang xem holdout. Hard-gate failure giữ campaign artifact và dẫn tới điều tra/replan.
5. Mọi attempted calls/trials, including failed/uncertain/blocked, có ID và append-only records. Quay lại sau lỗi phải dùng lịch sử attempt và authorization cũ đúng quy tắc; không ghi đè output đã có.

## 7. Gate nối T19/T11 → T14

| Gate | Evidence phải liên kết đúng phiên bản | Kết quả khi thiếu/sai |
|---|---|---|
| T19 | Accepted protocol + provider receipts + complete F/R/C/G matrix/coverage + canonical fidelity + paired quality/token/cost/latency + human outcome adjudication | Not evaluated/Blocked nếu thiếu; Replan nếu vi phạm AC; không đóng bằng adapter/tests |
| T11 | Fresh independently reviewed holdout/provenance/exposure + oracle isolation + calibrated rubric/judgments + uncertainty/sample coverage + all-attempt report | Dataset candidate/exposed hoặc tự chấm chưa đủ; không lấy `human-calibrated` làm chứng minh |
| T14 | Exact accepted T19/T11 artifact pins; grounded complete handoff; independent review/proposal/promotion; source revoke/conflict/version/recovery integration H03–H05 | Dependency chưa Pass hoặc source/model/policy pin đổi thì giữ gate mở; không promote dựa vào report chỉ có hình dạng đúng |
| Phase 3 | Linked gate report có task-class/model/config/source scope đã kiểm; mọi hard gate đạt; owner adjudication/decision thật ở phần cần người | Không suy từ tổng tests, mock score hoặc imported review thành Pass |

T14 trace cần thể hiện source → context → actual model request/output → independent review → proposal → exact evidence promotion, rồi revoke source để chứng minh dependency invalidation và nhánh độc lập vẫn hợp lệ. Existing Memory review/promotion checks được reuse; linked acceptance receipt phải được kiểm tại boundary, không chỉ viết trong Markdown. Gate Phase 3 không tự phát hành production semantic policy, không mở Unity/game và không bỏ T22.

## 8. Code hiện có và phần còn phải làm

| Đã có code để chuẩn bị/đo DEV | Còn thiếu để chạy S3 defensibly |
|---|---|
| Purpose `dev-smoke`/`dev-calibration`, explicit selected dev cases; caps context/output; live acceptance/holdout bị chặn | Versioned frozen acceptance protocol và validator/adjudicator có thể kiểm đủ field/criteria/coverage |
| Preflight/forecast calls, standard tariff upper bound; durable spend reservation/unknown freeze; model request/usage checks | Authorization/price/capability xác nhận thực tế, provider run; không do config tự cấp |
| F/R/C/G, separate gathering/reader coverage, per-class summaries; paired descriptive case-weighted diagnostics | Protocol-specific non-inferiority/risk/uncertainty, planned independent family/sample coverage; không chỉ descriptive averages |
| Export output bundle + pending template; import complete unique judgments bound raw report/lock, exact answer/model/complete reader request/selected context/external evidence | Human decisions thật và calibration/adjudication artifacts; imported record luôn `releaseEligible:false` |
| Immutable legacy dataset seal, public lexical split audit, dataset-review attestation import | Manifest version cho sample size/strata mới, independent semantic/provenance label review, durable pre-count exposure register |
| Context runtime guard, Memory review/promote, selective invalidation/recovery tests | Linked accepted T19/T11 → T14 integration receipt, H03–H05 evidence và Phase 3 gate decision |

Các protocol/adjudicator/exposure entries bên phải **chưa được coi đã triển khai** bởi tài liệu này. Chừng nào còn thiếu thì acceptance admission phải giữ đóng; chỉ DEV measurement trong scope/cap đã được cấp mới có thể chạy. Bản draft này không sửa AC, không đánh dấu S2/S3/S4 hoàn thành và không ghi nhận quyết định human nào.
