# Phase 3 — Test plan và bằng chứng nghiệm thu

## Actual mới nhất — sửa local, 30/09/2026

**Phase 3 vẫn Replan; T19/T11 Replan, T14 Not evaluated.** Đã sửa chọn context public: giữ hai lexical anchors, đa dạng nguồn bổ sung; topK không tăng. 60 lượt offline trên bộ đã lộ có 54/54 trường hợp cần evidence đủ nguồn và 6 N/A, không regression; đây chưa phải quality model acceptance.

Đã thêm exact batch schema, checkpoint và continuation một hop chỉ cho DEV finalized, dùng chung receipt replay trước dispatch; failed/unknown không retry. Diagnostics tách gathering/reader và bind pending review issue để chặn PASS. Consumer recovery/adjudication đầy đủ cho acceptance vẫn còn mở.

Bản cuối đạt **587/587 fresh-copy tests, 63/63 focused tests**, hai review độc lập không còn blocker trong scope local. Source/build ổn định, 2.081 historical files nguyên hash; **0 native benchmark calls mới**. Rubric/policy mới không dùng lại calibration v1; v1 đã hết hạn, holdout đã lộ.

Tiếp theo: hoàn tất consumer acceptance recovery/adjudication; calibration mới, fresh holdout, protocol/authorization mới; đo native rồi xét T19/T11 và T14. [Báo cáo sửa](phase-3-repair-report-2026-09-30.md), [Báo cáo sửa trên Notion](https://app.notion.com/p/3eba6c16b3dc81408282e8779d190e18), [bàn giao và phân công](phase-3-repair-handoff.md), [Drive](https://drive.google.com/drive/folders/1outD6aoDKan3YmhnQrHjHaU4KD2RQZnD). Forecast R2 giữ nguyên; Phase 4/Unity/game chưa mở.

## Lịch sử — nghiệm thu 5 hạng mục, 28/09/2026

**Phase 3 = Replan; chưa đóng phase.** Source `c902676` đạt 570/570 tests ở repo và fresh copy. Protocol đã freeze (`d2837dc693f6ec9f154c56f684aee06d1be093e46942e0e00e91f4eef2399c67`); calibration Sol native đạt 32/32, 0 false accept/reject/unknown. Terra chạy đủ 300/300 trials (240 main +60 G), 540 calls, integrity ổn định.

Blind Sol judgment dừng sau 5 calls: batch index 4 trả 5/6 IDs, bị exact-coverage validator từ chối. Có 24/300 assessments hợp lệ: 15 advisory Pass, 9 hard-check failures; 276 chưa được chấm. Không coi 300 completed là semantic PASS hoặc tỷ lệ 15/24 là chất lượng toàn bộ holdout. Tổng authorization: **551 calls / 6.987.769 reported tokens**, 0 pending/unknown mới; không gồm coordination và không quy thành USD.

Closure chính thức: **T19 Replan, T11 Replan, T14 Not evaluated**; T14 local integration đã kiểm nhưng không được chạy trên dependency chưa đạt. Protocol/source/build/thresholds và mọi failed artifacts giữ nguyên. Holdout đã lộ, không còn là fresh holdout cho lần sửa tiếp. Ràng buộc T22 trước game và scope chưa mở Phase 4 giữ nguyên.

Bước tiếp theo: sửa trên DEV các lỗi evidence/revision; thêm schema exact coverage và checkpoint/resume/adjudication có binding, ledger chung và immutable failed attempts; review độc lập, tạo protocol/lock phiên bản mới trước bất kỳ lần đo tiếp theo. Runner frozen v1 không có recovery consumer hợp lệ; tám call reserve không phải quyền retry hoặc sửa kết quả cũ. [Báo cáo nghiệm thu](phase-3-native-acceptance-report.md), [bàn giao](phase-3-acceptance-handoff.md), [Notion](https://app.notion.com/p/3e9a6c16b3dc8107bd6ae3e72403fd53), [thư mục bàn giao Drive](https://drive.google.com/drive/folders/1__1dG3VaKmAL412xQ98Lj-F8q_TpiQHo).

Các mốc bên dưới là lịch sử; Forecast R2 và bằng chứng cũ giữ nguyên.

## Lịch sử — test và sửa lỗi trước nghiệm thu 28/09/2026

**554/554 clean tests Pass.** Đợt native trên 20 DEV cases ghi đủ 100 trials: 74 đáp án hợp lệ, 25 context-blocked, 1 output sai contract. Sol chấm 70/74 advisory Pass; bốn bất đồng cùng case CORS mơ hồ đã được Astra adjudicate. Đã sửa hướng dẫn abstain/null và tách hai DEV regressions rõ nghĩa: 10/10 outputs hợp lệ, 10/10 advisory Pass; sáu controls sửa câu hỏi khớp nhãn 6/6. Không thay dataset hoặc score cũ.

Calibration 108/108 agreement vẫn thiếu bảo đảm nhãn: sáu controls CORS bị ambiguity; không dùng con số này đóng gate. Có 10 fresh holdout families được AI author/reviewer độc lập chuẩn bị, chưa dispatch. Native harness dùng 187 calls / 2.515.297 reported tokens, không unknown mới; số này không bao gồm lượt chat/collaboration và không suy ra USD.

Compaction context ngắn tốn khoảng 1,99×/3,96× token của F ở C1/C3, chưa tăng quality. Chưa bật mặc định. Retrieval local với topK3 giữ recall=1 trên 17 cases có required sources, đang là DEV feasibility. **T19/T14 Not evaluated, T11 Replan, Phase 3 chưa PASS**: còn protocol freeze, calibration/acceptance runner, fresh holdout matrix và full handoff. Đây không chỉ là thiếu owner approval. [Báo cáo và phần còn lại](phase-3-closure-tests-2026-09-28.md); [protocol đề xuất](phase-3-subscription-acceptance-proposal.md); [cloud evidence](https://drive.google.com/drive/folders/1fJQhs5ral9Pr3NdGJJMWpYaw7gu8O03G).

Các mốc, profile và giới hạn scope bên dưới là lịch sử; giữ nguyên evidence và Forecast R2 để đối chiếu.

## Kiểm chứng model thật — prompt constraint IDs, 28/09/2026

**15/15 calls trên Terra/Sol/Astra hoàn tất; 12/12 outputs đúng constraint ID và citation/revision, 142.013 reported tokens, 0 unknown mới.** Trước sửa constraint IDs đạt 0/12; bản sửa đã kiểm chứng live trên DEV sem-001. Source/build khớp bản đã qua 530 tests. [Báo cáo](phase-3-model-validation.md); [12 outputs chờ human review](phase-3-model-validation-review.md). StrictPass vẫn 0/12 do so khớp nguyên văn; semantic calibration/rubric độc lập còn mở. R3a contract Pass trong sample này; T19/T14 Not evaluated, T11 Replan, Phase 3 chưa Pass. Các mốc chưa chạy prompt mới phía dưới là lịch sử.


## Lịch sử actual — 28/09/2026

Terra medium / Sol medium / Astra high đã áp dụng vào [plan](phase-3-execution-plan-2026-09-28.md) và config smoke mới. **530/530 clean tests Pass**; sửa exact Code Mode startup notice đã kiểm offline. 3 live attempts mới đều chưa có output/usage hợp lệ; ledgers frozen, không retry. Sol/Astra chưa chạy. [Báo cáo và evidence](phase-3-routing-execution-report.md); [bàn giao calibration](phase-3-calibration-worklist.md). Phase 3 chưa Pass, T19/T14 Not evaluated, T11 Replan. Các mốc 25/09 và profiles Luna phía dưới là lịch sử.


## Tiếp tục thực thi — 28/09/2026

Owner yêu cầu áp dụng Terra/Sol/Astra vào plan và thực thi tiếp. [Plan hiện hành](phase-3-execution-plan-2026-09-28.md) phân vai theo từng gói, dependency, gate và phạm vi đo mới; configs/failed runs ngày 25/09 là lịch sử. Bước hiện tại: chẩn đoán CLI, regression fix, DEV smoke ba profiles, rồi chuẩn bị calibration. Giữ ledger cũ frozen và mọi unknown; không đổi status Phase 3 chỉ vì có model output.

## Quyết định hiện hành — Codex subscription, 25/09/2026

Owner đã duyệt chạy DEV benchmark qua **Codex CLI đăng nhập ChatGPT**, dùng quota Codex hiện có. Không cần API key và không áp dụng đề xuất cap API 5 USD. Giữ cấu hình Astra/high cho planning và Luna/medium cho execution; đây là requested profiles, chưa phải chứng nhận model hoặc phân vai. Đợt đầu giới hạn một dev case, 6 comparison trials +2 G, tối đa 10 invocations. Runbook và actual nằm trong [báo cáo Codex](phase-3-codex-benchmark.md). **Actual: hai attempts, 0 valid model answers; một local startup failure đã reconcile có evidence, một started-thread attempt còn unknown usage và ledger frozen. Smoke chưa đạt; không chạy lại hoặc reset allowance tự động.**

Bản bàn giao cuối đạt **527/527 clean tests**, source/compiled pins ổn định; hai attempts live vẫn không có output hợp lệ. Đường đo này ghi reported usage sau call, không có exact provider pre-count hoặc hard output cap, không suy quota thành USD. T19/T14 vẫn Not evaluated, T11 Replan; Phase 3 chưa PASS. Cần calibration độc lập, protocol/holdout mới và adjudication/handoff. Các đề xuất API và đoạn scope chỉ local bên dưới là lịch sử, không phải việc đang chờ owner duyệt nữa.

## Bổ sung chuẩn bị S2 — 25/09/2026

Runbook mới ở [gói nghiệm thu](phase-3-acceptance-prep.md). Kiểm thêm: legacy/provisional config không giả calibration; explicit DEV case selection đúng split; exact model context boundary; generation forecast bao gồm compaction/G/rounding; paired missing/unscored/model-context-blocked và case weighting; review gắn actual answer/request/context/report; thay packet đồng thời cập nhật window hash vẫn phải bị chặn vì request không khớp; pending/partial/duplicate/drifted judgments bị từ chối; synthetic mock review không cấp Pass. Chạy CLI end-to-end có guard cấm đọc credential và cấm network. Source sạch phải build/test mới trước delivery; historical 422 là baseline cũ.

Mốc 25/09 trước quyết định dùng Codex subscription: chỉ sau phê duyệt chi phí mới chạy dev smoke thật. Tiếp tục giữ protocol/holdout/independent outcome labels/T14 là acceptance còn mở, không dùng test xanh để thay.

Trạng thái lịch sử ngày 25/09/2026, đã được thay bởi actual ở đầu trang: kế hoạch kiểm thử phần còn lại. Người dùng đã chọn các model OpenAI/ChatGPT: model chất lượng cao cho planning, model ít tốn chi phí hơn cho execution; sau đó xác nhận **“Chỉ hoàn thiện và chạy test local trước”**. Phạm vi thực thi hiện tại là code, mock campaign, tests và test plan local; không gọi provider thật hoặc kiểm API key. Các phần real-model/human acceptance dưới đây là kế hoạch cho lần thực hiện sau, giữ gate mở. Tài liệu không ghi nhận một lần gọi model thật hoặc một kết quả PASS mới.

Baseline đã xác minh: [327/327 tests từ source sạch](evidence/phase3/final-clean-verification.md), T09/T10 Pass trong phạm vi local; T19 và T14 Not evaluated; T11 Replan. Campaign R1 có 6 false accepts; R2 có 0 false accepts và 78 false rejects trên 540 trials nhưng chỉ là exposed-set regression. Giữ nguyên toàn bộ [evidence lịch sử](phase3-benchmark.md). Test suite xanh không thay nghiệm thu model, token, calibration hoặc handoff.

Bổ sung sau review đợt 384 tests: C11/C12/E11–E13 dưới đây kiểm bốn findings và nội dung split. [Báo cáo sửa lỗi](phase-3-fixes-report.md) giữ kết quả xác minh trên source mới. Mục 7 giữ nguyên evidence trước bản sửa; không dùng số tests cũ để xác nhận version mới.

## 1. Phạm vi, vai trò và thứ tự

| Lớp | Kiểm tra | Quyền kết luận |
|---|---|---|
| L0 — cơ chế local | Memory, Context, runtime guard, Explorer và regression | Độ đúng của cơ chế trong môi trường đã chạy; không chứng nhận semantic quality |
| L1 — giao thức provider | Fake HTTP, request/response, usage, budget, lỗi/timeout | Adapter/harness sẵn sàng; fake usage không thành usage thật |
| L2 — dev với model thật | Prompt/packet thực, tokenizer/counting, latency, usage, reader/executor output | Calibration trên dev; không dùng làm holdout |
| L3 — campaign khóa trước | Ba context policies, budget/distractor/compaction matrix, fresh holdout, independent labels/review | Evidence theo đúng model/config/task class đã khóa; còn cần quyết định gate |
| L4 — bàn giao | T19 + T11 đủ evidence, T14 integration/review/promotion và dependency invalidation | Xét gate Phase 3; không tự cấp release Phase 4/Unity/game |

AI thực hiện chuẩn bị fixture, code, protocol tests, chạy phép đo và tổng hợp evidence. Profile khởi điểm là `gpt-6-astra` cho planner/synthesizer, `gpt-6-luna` cho executor; `gpt-6-sol` là phương án escalation thủ công. Đây là phân vai cấu hình, không là chứng nhận chất lượng hay giá đã đo. Exact IDs/capabilities/price vẫn phải kiểm và pin khi chạy provider thật. Critic độc lập không được dùng self-review của tác giả thay cho kiểm tra. Có thể cùng provider/model nhưng phải khác phiên, input/context và quyền đánh giá. Model critic không tự trở thành người gán nhãn độc lập hoặc policy owner.

Owner chịu trách nhiệm xác nhận task classes/quality floor và cost cap, review nhãn mơ hồ/khác biệt, quyết định gate theo evidence. Việc này có thể thực hiện trên một gói kết quả cụ thể; không yêu cầu owner viết code hay chạy lại các thao tác AI có thể làm. Không tự nhận đã có human review khi owner chưa review.

## 2. Manifest và điều kiện trước khi chạy

Mỗi campaign mới có ID, output directory mới và append-only attempt journal. Khóa trước khi xem kết quả holdout:

- Source commit **và** hashes source/lockfile thực được chạy, dependency versions, OS/Node; working tree khác commit phải ghi rõ.
- Corpus snapshot/source revisions; public tasks, task classes, family split; oracle/evaluator digest do evaluator giữ; dataset exposure/author/reviewer provenance.
- Exact model IDs hoặc returned model version; provider endpoint/API version; prompt và output-schema digests, reasoning/output configuration, tokenizer/count API version và accounting policy.
- Ba policies, retrieval query/top-k/eligibility/graph policy, 3–4 mức tổng budget, distractor densities, compaction depths, repeats, paired trial order/seed và stopping rule.
- Rubric, required evidence và alternatives, answerability, revisions/constraints, chất lượng tối thiểu, non-inferiority margin, false-accept/reject thresholds, calibration method và uncertainty method.
- Giới hạn tổng task/campaign spend, per-request output reserve/headroom, rounds, parallelism; giá tham chiếu có nguồn/ngày/digest, cách xử lý cache/reasoning tokens, retry/timeout policy.
- Reviewer identity/role, review digest, case coverage và external evidence paths/digests; kiểm lại sau mọi boundary async và trước chốt report, không chỉ ở preflight. Pin cả trạng thái chưa có review để record được thêm giữa run cũng làm drift. Phương pháp adjudication, coverage tối thiểu và xử lý partial/error trials phải rõ. Thiếu một metric bắt buộc hoặc còn threshold `null` thì chưa đủ điều kiện acceptance.
- Split audit public-content digest, policy version, thresholds và cặp nghi vấn. Family labels khác nhau vẫn phải qua nội dung question/history; exact/near-clone bị reject, lexical overlap rộng hơn cần semantic review. Không dùng oracle answers làm similarity features hoặc đưa diagnostic oracle vào model.

Dataset mới do implementation team tạo là **candidate holdout** cho đến khi provenance/split/labels được review độc lập. Tên file `holdout` hoặc hash lock không chứng minh tính độc lập. Người/agent đã thấy expected answers không được tuning prompt, retrieval hoặc thresholds rồi vẫn gọi tập đó fresh holdout. Nếu đã lộ: đánh dấu exposed, dùng regression, tạo version và tập độc lập khác; không xóa trial thất bại.

## 3. Ma trận thử nghiệm model

Một đơn vị so sánh là cùng case/family, cùng exact executor model/config, cùng tool/task/environment và cùng tổng window ceiling/output reserve. So riêng từng model; không lấy model đắt ở full-context so model rẻ ở compaction rồi quy khác biệt cho context policy.

| Arm | Đầu vào và thao tác | Điều phải được đo |
|---|---|---|
| F — full-context | Tất cả nguồn **eligible, trong scope** của case và history theo protocol | Nguồn không vừa budget làm trial `infeasible`; không cắt thầm hoặc coi là policy F hợp lệ |
| R — retrieval + isolation | Retrieval chọn nguồn eligible; mỗi role có scope/window riêng; chưa compact history | Retrieval sufficiency, canonical hydration, downstream quality, tokens và total cost |
| C — retrieval + isolation + compaction | Như R, compact 1 lần và nhiều lần theo checkpoint đã khóa | Constraint/AC/evidence fidelity và quality sau mỗi lần; chi phí mọi lượt compactor tính vào task |
| G — gold-evidence control | Evaluator cấp đủ evidence chuẩn trong run biệt lập sau trial chính | Phân biệt lỗi gathering với reading/execution; không thay F, không đưa gold IDs/labels về candidate |

AC cần 3–4 mức budget và các mức distractor cùng compaction `0/1/multiple`. Harness local đang được dựng với tổng trial budgets `8192/16384/32768`, distractor limits `0/8`, compaction rounds `1/3`; budget bao gồm mọi lượt tóm tắt và lượt trả lời, không chỉ lượt cuối. Chạy cùng ba arms trong từng planning/execution profile; không gộp hai profile thành một đối chứng. Các số này là protocol candidate cho mock local, chưa là threshold/provider acceptance đã duyệt. Campaign thật phải pin ma trận cuối trước run. Đổi vị trí evidence đầu/giữa/cuối; distractor cùng tên interface, source cũ mâu thuẫn source mới, huge tool result và scope khác. Dùng paired cases và repeated trials; không tính repeats của cùng case thành mẫu độc lập. Nếu ma trận vượt cost cap thì giảm số case theo protocol **trước** lock hoặc báo coverage còn thiếu; không chọn bỏ ô đã thất bại.

Context Engine vẫn giữ local UTF-8 guard riêng; provider admission đếm complete request ở boundary bên ngoài và lưu receipt riêng, không ghi số mock/API vào `actualProviderTokens` của packet như thể Context Engine đã dùng provider tokenizer. `count_m(complete input packet) + outputReserve + headroom <= modelContextLimit`. Input gồm system/developer/task, hydrated constraints/AC, evidence, history/summary, schemas/tools và serialization overhead áp dụng. Output reserve tuân theo model và gồm reasoning nếu provider tính chung; không cộng reasoning hai lần. Byte estimates chỉ phục vụ cơ chế local, không được ghi thành actual provider tokens. Ghi token đếm trước request và usage provider trả về riêng, gồm chênh lệch/unknown. Tổng task budget bao gồm planning, compaction, execution, critic và các attempt bị lỗi có thể đã tính phí. Campaign có SQLite spend/usage ledger riêng phục vụ đo đạc, không thay operation ledger hoặc cấp runtime policy/release. Đối với mock campaign, cả counts/usage/cost phải có nhãn synthetic rõ.

## 4. Test cases có ID và đường evidence

`A`: automated; `M`: manual/human; `A+M`: automation tạo evidence, reviewer quyết định semantic/quality. `Existing` chỉ trỏ đến baseline đã có, không khẳng định test mới đã chạy. Evidence mới nằm dưới `docs/evidence/phase3-closure/<campaign-id>/`; tên cụ thể lấy từ manifest CLI, không ghi đè historical evidence.

### T09/T10 — Memory và retrieval regression

| ID / cách chạy | Input và trường hợp âm | Expected result | Evidence / triển khai hiện có |
|---|---|---|---|
| M01 — A, Existing | Approved source/claim đúng scope; proposed/quarantined/revoked và revision cũ | Chỉ eligible current records dùng cho action; history giữ nhãn rõ | `test/memory.test.ts`, `test/benchmark-memory.test.ts`; TAP + source pins |
| M02 — A, Existing | Public scope ghi revision mới trùng logical ID với private source; scope/path/class/lineage khác | Không supersede/đọc hidden source; transaction không có side effect | `test/context-memory.test.ts`; before/after snapshot/DB assertions |
| M03 — A, Existing | Source r1→r2 hoặc revoke; context→plan→handoff phụ thuộc và nhánh không phụ thuộc | Invalidate đúng dependency; nhánh độc lập không stale vô cớ | `test/memory.test.ts`, `test/explorer-integration.test.ts` |
| M04 — A, Existing | Explicit graph so inferred edges, top-k truncation, budget bỏ một phía conflict | Inferred edge không cấp authority; thiếu critical evidence/known conflict giữ unknown/abstain | `test/benchmark.test.ts`, `test/benchmark-memory.test.ts`; retrieval/packing traces |
| M05 — A, Existing | Source refresh không có live adapter; evidence compile được hỏi Android build | Unknown, không báo current/certified; missing evidence không thành fact | `test/memory.test.ts`, `test/benchmark.test.ts` |

### T19 — Context và provider boundary

| ID / cách chạy | Input và trường hợp âm | Expected result | Evidence bắt buộc |
|---|---|---|---|
| C01 — A, Existing | Compact history cố đảo nội dung C17 nhưng giữ ID; mất AC, scope/revision/hash sai | Hydrate canonical bytes; sai một binding bắt buộc block | `test/context.test.ts`, `test/context-memory.test.ts`; manifest/packet digests |
| C02 — A, Existing + stress | 1 và nhiều compactions; poison summary, constraint giữa log dài, sole canonical source | Bất biến constraints/AC/unknown/artifact pins sau **mỗi** checkpoint; không summary-as-authority | Compaction-chain checkpoints; canonical-diff report, không chỉ summary text |
| C03 — A, Existing | Agent/window/scope khác, receipt giả được reseal outer hashes, missing actual bytes | Context isolation; loaded chỉ khi payload inclusion proof khớp; giả proof bị từ chối | `test/context.test.ts`, `test/explorer-integration.test.ts` |
| C04 — A, Existing | Revoke ở prepared/started/before-commit; restart thiếu guard; config bị xóa | Recheck điểm dùng; không dispatch/commit bằng pin cũ; effect đã xảy ra giữ OBSERVED/reconcile | `test/runtime-context.test.ts`; ledger, dispatch/effect counters |
| C05 — A, protocol | Counting đủ packet + tool/schema overhead; exact limit, 1 token vượt; output reserve vượt model max | Request không hợp lệ bị chặn **trước** provider call; constraints không bị cắt để vừa | Fake HTTP request count/body; local counting policy + request digest |
| C06 — A, protocol | Provider usage thiếu/âm/sai kiểu, model khác pin, cached/reasoning details không đủ | Reject malformed fields; missing receipt là unknown/error theo policy; không tự đặt 0 token/0 cost | Sanitized response receipt, error code, budget ledger; không lưu API key |
| C07 — A, protocol | HTTP 401/429/5xx, disconnect, timeout sau send, cancellation | Mỗi attempt có terminal state; không free retry/retry mù; chi phí chưa biết giữ reservation/unknown và block paid continuation nếu không reconcile được | Attempt journal + reservations; fake server verifies actual request count |
| C08 — A, protocol | `refusal`, `incomplete`/max-output, failed response, invalid/trailing JSON, schema-valid unsupported answer | Phân loại riêng refusal/incomplete/transport/parse/schema/semantic failure; không gộp thành đúng abstention hoặc PASS | Raw sanitized response hash, parsed disposition, grader record |
| C09 — A+M, real | F/R/C cùng case/model/budget, nhiều distractor/positions và depths | Đo task success, fidelity, retrieval sufficiency, false support/correct abstention, cost/latency; không chỉ tỷ lệ nén | Per-trial input/output, provider receipts, oracle score, paired report |
| C10 — A+M, real | Tool output/required source quá lớn; API names/signatures/config values gần giống nhau | Whole-source policy rõ; infeasible/missing giữ unknown; downstream action đúng exact interface và version | Loaded/excluded resource traces, executable postconditions, reviewer reasons |
| C11 — A, protocol regression | Hai count cùng request overlap, success/failure đảo thứ tự; recount sau success; unrelated digest; count bị supersede | Recount thu hồi admission cũ ngay khi bắt đầu; response count cũ không hồi sinh quyền generation; failure cũ không xóa success mới; không generation khi latest count chưa thành công | `test/openai-provider.test.ts`; fake HTTP barriers và generation call counts |
| C12 — A, campaign regression | Count/generation trả 401/429/5xx, timeout, transport error; lỗi có message/body/key/header nhạy cảm | Journal và report giữ allowlisted code, HTTP status, validated request ID, call boundary và error digest; không lưu raw error message/stack/body/key; generation không rõ usage giữ reservation | `test/semantic-campaign-bindings.test.ts`; sanitized call receipts/journals và ledger assertions |

### T11 — Dataset, isolation, quality và calibration

| ID / cách chạy | Input và trường hợp âm | Expected result | Evidence bắt buộc |
|---|---|---|---|
| E01 — A+M | Public corpus/tasks tách oracle; exact/near-duplicate question/history giữa dev/holdout dù đổi IDs/families; missing review | Reject family leakage và exact/near-clones; broader lexical overlap có suspected pairs cần review; candidate chưa review không thành independent sealed holdout | Dataset manifest, versioned split audit, exposure log, independent label-review record; `test/semantic-split-audit.test.ts` |
| E02 — A | Fixture thiếu/giả `requiredEvidenceIds`, `acceptableAlternatives`, `answerability`, `expectedRevision`, `expectedConstraints` | Evaluator schema/cross-record validation reject; alternatives có scope/revision đúng và đủ support | Dataset validation TAP; oracle digest; lỗi chỉ ở evaluator |
| E03 — A, isolation | Candidate cố đọc oracle qua path/traversal/symlink/env/tool output; canary label; evaluator lỗi trả gold | Candidate process/tool boundary không có filesystem/env/API quyền đọc oracle; broker không gửi labels/gold IDs trước scoring | Process permissions/invocation, denied-read probes, outbound request/packet scan, evaluator error sanitization |
| E04 — A+M | Đáp án đúng đoán may nhưng thiếu source bắt buộc; valid alternative; conflict/no evidence/false premise | Guess không PASS evidence gate; alternative đúng được chấp nhận; correct abstention khác false rejection | Separate gathering/answerability/evidence/semantic scores + human disputed-case decisions |
| E05 — A+M | Old revision có đáp án hấp dẫn, stale/refuted claim, source update giữa window và execution | Current revision/scope/constraints quyết định; revision sai fail dù prose đúng | Source pins + refresh/invalidation + output citations check |
| E06 — A+M | Paired F/R/C và G; answerability strata; repeated stochastic samples | Report từng arm/budget/density/depth/task class, retrieval vs reader; mọi trial kể cả lỗi | Attempt/trial journal, gold-control separation, coverage matrix |
| E07 — A+M | Judge tự chấm output mình tạo; candidate output chứa “PASS”; raw confidence cao nhưng sai | Independent critic/grader; candidate text không cấp gate; calibrate trên dev rồi freeze rubric/thresholds | Role/context isolation, grader versions, dev confusion matrix/reliability bins, adjudication log |
| E08 — A+M | Small sample, repeated cases, disagreements và missing results | Mẫu số theo unique cases/families; uncertainty đúng sampling unit; unknown/partial không thành pass | FA/FR, falseSupportedRate, correctAbstention, task-quality intervals; coverage/unknown counts |
| E09 — A | Sửa source/config/oracle giữa run; output path đã có; campaign crash giữa trial | Reject changed pins/overwrite; giữ journal/failed attempt, không tạo report acceptance hoàn chỉnh | Before/after hashes, nonzero terminal state, immutable artifact list |
| E10 — A+M | Tune theo holdout; selective rerun hoặc bỏ case fail; đổi threshold sau khi xem score | Dataset chuyển exposed/regression; new campaign/version giữ lịch sử; gate Replan | Exposure register, protocol version diff, complete attempt index |
| E11 — A, review binding | Sửa/xóa/thay review record hoặc external evidence sau count/generation, trong progress hook, hoặc ngay trước report; thêm review khi preflight pending | Review identity/coverage/evidence pins drift là sticky failure; dừng calls tiếp; trước send không generation, sau send giữ usage/unknown receipt; final report không báo integrity stable | `test/semantic-campaign-bindings.test.ts`; lock/report review pin, `reviewEvidenceStable`, `campaignIntegrityStable`, call counters |
| E12 — A, gathering regression | Answer prose đúng nhưng thiếu required source; đủ evidence nhưng reader abstain; optional supported source, distractor/stale/revoked/wrong revision/unknown; không required refs | Gathering không phụ thuộc answer: recall theo required refs hợp lệ, precision theo distinct gathered IDs; optional expectedRevision support không thành false positive; reader bỏ nguồn optional không fail revision, nhưng đã cite phải đúng revision; no-required recall/sufficiency null, empty-gather precision null | `test/semantic-gathering.test.ts`, dataset scorer tests; retrieval và selected metrics riêng cho mọi prepared trial, kể cả reader-blocked |
| E13 — A, coverage regression | Prepared/context-blocked/token-blocked/parse-error/completed trộn nhau; answerable/unanswerable/conflict; insufficient evidence; nhiều task classes; G control riêng | Mọi trial có outcome và mẫu số rõ; reader rate chỉ dùng scored trials; thiếu output không thành correct abstention; per-trial gathering sufficiency độc lập reader score; zero denominator null; G không nhập main | Campaign tests và report `semantic-campaign-report/2`, per-arm/per-answerability/task-class coverage; floor strictPass hiện hành giữ nguyên |

E03 cần runtime boundary thực. Thiết kế mock hiện dùng `runIsolated` với worker literal trong empty workspace, `readRoots: []`, không filesystem grant cho dataset/oracle và không network/credentials; test phải có denied-read probes để xác nhận trên host. Provider API sau này chỉ nhận serialized text request, không có local tools/FS, nên host evaluator vẫn là trusted boundary; không tuyên bố cách này bảo vệ trước malicious host/evaluator. Việc reader không được truyền object oracle hoặc hai file ở hai thư mục là unit-level defense, **không đủ** chứng minh evaluator isolation nếu candidate tool/process vẫn đọc được toàn repo. Nếu chưa có sandbox riêng thì ghi rõ phạm vi `model-request payload isolation`, giữ yêu cầu rộng hơn Not evaluated; không đổi tên test để che phần thiếu.

### T14 — Handoff, promotion và Explorer

| ID / cách chạy | Input và trường hợp âm | Expected result | Evidence bắt buộc |
|---|---|---|---|
| H01 — A, Existing | Proposal đúng/khác claim, evidence digest/assertion/actor/scope sai; author tự review | Chỉ exact evidence + independent authorized review mới promote; không copy authority | `test/memory.test.ts`, `test/context-memory.test.ts`; rejected/accepted transitions |
| H02 — A, Existing | Concurrent Memory version change, unresolved conflict, stale/revoked source, promotion replay | Optimistic version/dependency checks; fail/replan, giữ audit; replay không có side effect lặp | Promotion journal + before/after MemoryVersion |
| H03 — A+M | Handoff schema đủ nhưng thiếu interface/assumption/dependency/AC semantic hoặc quality failure | Structural pass không đủ; thiếu điều kiện thì block; grounded complete handoff mới được xét | Linked TaskSpec/plan/artifact/context/check reports + independent rubric review |
| H04 — A+M | T19 hoặc T11 còn Not evaluated/Replan; report/gate sai source/model/policy version | T14 không full PASS; không phát hành downstream dispatch quyền ngoài active release | Dependency gate report, source/config equality, unchanged release state |
| H05 — A+M | Chuỗi source→context→model output→review→proposal→promotion rồi source revoke | Bàn giao có provenance đầy đủ; revoke invalidate downstream dùng claim, independent branch không bị block | Integration trace, model receipt, promotion + runtime guard results |
| V01 — A+M, Existing | Explorer scope filters, hidden refs/backlinks, forged loaded DTO, HTTP write/traversal/origin | Chỉ projection được phép; GET/HEAD loopback; DB không đổi; invalid receipt là unknown | `test/explorer*.test.ts`, browser QA log |
| V02 — M, Existing + smoke | Graph drag/zoom/pan/filter/local view/note/backlinks/context; proposal JSON | UI dễ đọc, scope chính xác; proposal không ghi DB hoặc tự approve; copy fallback hoạt động | Browser screenshots/log + DB hash before/after; không claim download thành công nếu chưa quan sát file |

## 5. Ngưỡng và cách ra quyết định

Các hard gates hiện hành: 0 scope/oracle leakage; 100% mandatory constraint/AC bindings đúng nội dung, revision và applicability; 0 evidence giả/unsupported promotion; không blind retry side effect; không dispatch/commit dựa stale/revoked authority. Không bù lỗi hard gate bằng điểm trung bình cao.

Campaign local trước đây khóa 0 false acceptance và recall holdout ≥0.75 tại cap content lớn nhất. Các số này thuộc protocol cơ học cũ; không tự áp chúng thành quality floor của model thật. Protocol model mới phải pin quality floor, non-inferiority margin C/R so F, false-support và false-rejection limits, confidence bounds/required sample size, latency/cost envelope **trước** acceptance run. Chưa có các giá trị đó thì chỉ chạy dev calibration, không tuyên bố đạt T11/T19.

Báo cáo tối thiểu: số eligible/infeasible/refused/incomplete/error/unknown/completed trials; task success và loss theo arm; critical constraint/evidence fidelity; retrieval sufficiency; false support, FA/FR và correct abstention theo answerability; complete input/output/reasoning/cached tokens, total task cost và unknown reservations; p50/p95 latency theo request lẫn task; paired effect và uncertainty. Một trial “không trả lời” do timeout/refusal không phải correct abstention có lý do bằng chứng. Không loại nó khỏi coverage mà không báo.

Phân biệt system safety outcome với reader quality: critical unknown có thể làm Context Engine block trước khi gọi model. Khi đó ghi `context-blocked` và giữ evidence của hard gate, **không** tính là model correct-abstention hoặc câu trả lời model sai. Candidate hiện có critical unknown trên các ca unanswerable/conflict; nếu tất cả bị block thì coverage model ở nhóm đó chưa đo. Muốn đo riêng cần control chẩn đoán chỉ đọc, không cấp runtime authority, giữ nguyên unknown và có scope/protocol riêng; không xóa critical flag để đạt điểm. Quality floor và mẫu số phải khóa phù hợp trước campaign thật, không sửa sau khi thấy score.

Report v2 bổ sung `gathering.retrieved` và `gathering.selected` cho trial đã chuẩn bị context. Recall = số required refs hiện diện, active/fresh và đúng pinned revision chia số required refs; precision = số supporting refs hợp lệ chia distinct gathered IDs. Supporting refs được oracle pin trong `expectedRevision`, có thể gồm nguồn optional ngoài required set. Nhiễu làm giảm precision nhưng không xóa việc đủ required evidence. Với zero required refs, recall/sufficiency là `null`; empty gathering có precision `null`; trial chưa chuẩn bị được context có `gathering=null`. Unknown refs tách khỏi known ineligible; stale/revoked/revision mismatch có chẩn đoán riêng. Scoring chỉ chạy ở evaluator sau comparisons, không đưa nhãn/expected answer vào request.

Coverage của main và G tách riêng, có `byAnswerability` và `byTaskClass`; summaries nhóm theo profile/arm/depth/density/budget/task class. Báo attempted/prepared/reader-requested/scored/unscored/outcomes; planned main/G giữ ở report. Prepared ở đây là trial có gathering score. `readerStrictPassRate` chỉ dùng scored trials, không lọc tiếp theo gathering sufficiency; zero scored outputs cho rate `null`. Từng trial giữ sufficiency và reader diagnosis để phân tích lỗi, chưa có aggregate riêng cho reader chỉ trên nhóm đủ evidence. All-trial strictPass vẫn giữ mẫu số bảo thủ cũ để không đổi gate sau review. G paired diagnosis chỉ có khi cả hai reader đã được chấm và chưa đủ tự kết luận lỗi semantic nếu thiếu human review.

Gate được lập từ artifact đã pin và check versions. Không có report, thiếu coverage, metric/cost còn unknown, independent review thiếu hoặc hard gate fail: `Not evaluated`/`Blocked`/`Replan` theo nguyên nhân, tuyệt đối không PASS. Pass chỉ trong task class/model/config/scope đã kiểm. Full Phase 3 chờ T19, T11 và T14 cùng đủ AC; T22 vẫn bắt buộc trước game.

## 6. Runbook và record template

Các lệnh dưới đây đã có trong baseline, chạy từ repository root. Dùng output name mới cho mỗi attempt:

```sh
./scripts/dev.sh install --frozen-lockfile --ignore-scripts
./scripts/dev.sh check
./scripts/dev.sh exec node --test dist/test/memory.test.js dist/test/context.test.js dist/test/context-memory.test.js dist/test/runtime-context.test.js dist/test/explorer.test.js dist/test/explorer-integration.test.js
./scripts/dev.sh exec node --test dist/test/benchmark.test.js dist/test/benchmark-memory.test.js
./scripts/dev.sh exec node dist/src/benchmark/cli.js .local/closure-regression-attempt-001.json
```

Tạo `.local` trước nếu cần. Lệnh benchmark cũ là exposed-set mechanical regression; exit 0 không nghiệm thu model. Focused tests của phần triển khai local mới, sau build:

```sh
./scripts/dev.sh exec node --test dist/test/openai-provider.test.js dist/test/campaign-budget.test.js dist/test/semantic-dataset.test.js dist/test/semantic-adversarial.test.js
./scripts/dev.sh exec node --test dist/test/semantic-campaign-bindings.test.js dist/test/semantic-gathering.test.js dist/test/semantic-split-audit.test.js dist/test/semantic-campaign.test.js dist/test/semantic-campaign-review.test.js
```

`semantic-adversarial` do reviewer riêng bổ sung, kiểm private/stale/revoked isolation, canonical bindings và critical unknown qua ba lần compaction, shared-account freeze và matrix distractor có thật. Test cho mật độ distractor đã phát hiện candidate ban đầu chỉ có distractors bị eligibility loại. Candidate v2 bổ sung tám nguồn fresh/in-scope gây nhiễu cho mỗi case; v1 giữ ở `fixtures/semantic-benchmark-candidates/r0`. Test yêu cầu tăng density thực sự đổi eligible input, không coi hai input giống nhau là hai density đã kiểm. Reviewer còn kiểm source manifest bao phủ canonical fixture dependency `fixtures/contracts.ts`, tránh source thay đổi mà campaign integrity vẫn báo ổn. Kết quả cuối lấy từ run log trên source mới, không suy từ việc test đã tồn tại.

Runbook campaign local dùng CLI mới (sau build). `semantic-run` chỉ dùng config mock dưới đây; không thêm `--live` trong scope hiện tại. Thư mục output phải mới; spend directory giữ nguyên cho cùng authorization, không xóa/reset để né giới hạn:

```sh
mkdir -p .local
./scripts/dev.sh exec node dist/src/cli.js semantic-preflight fixtures/semantic-benchmark fixtures/semantic-config/local.json
./scripts/dev.sh exec node dist/src/cli.js semantic-run fixtures/semantic-benchmark fixtures/semantic-config/local.json .local/semantic-local-attempt-001 .local/semantic-local-spend
```

Preflight đã được kiểm tra local sau build: 20 dev cases, 960 main/120 control planned, review `pending`, `liveReady=false`, `dispatchAuthorized=false`, gate `Not evaluated`. Đây là kiểm cấu hình/readiness, chưa là trial outcome.

Artifact của mỗi run: `campaign-lock.json`, `calls.jsonl`, `trials.jsonl`, `packets/`, `report.json`. Kiểm `configAndSourceStable`, `reviewEvidenceStable`, `providerIdentityStable`, `campaignIntegrityStable`, review/split audit pins, planned/completed trials, terminal status, actual distractors và eligible-input digests, gathering/reader coverage, usage assurance, missing acceptance và gate; không chỉ đọc exit code. Error receipt có digest và allowlisted diagnostics, không raw messages/body. Local config có 960 main trials và 120 post-comparison gold-evidence controls, tổng 1.080 mục dự kiến; con số completion cuối chỉ được ghi sau run.

G control chạy sau toàn bộ comparison, chỉ cấp các **public evidence documents** được evaluator chọn; không cấp expected answers, labels hoặc gold field names vào reader. Nó dùng cùng profile/budget, report ở `controlSummaries`, không gộp vào main-arm quality. Host evaluator được tin cậy và có thể đọc oracle trong preflight để verify seal; scoring/control không biến oracle thành Memory hoặc prompt authority. Ngưỡng strictPass 0.9 trong local config là **provisional**, chưa human-calibrated và chưa phù hợp để cấp admission: main denominator hiện gồm context-blocked cases. Không thay threshold hoặc critical flags chỉ để làm mock score xanh.

`semantic-review-import` phục vụ lần manual review sau; không nhập giả human record vào dataset bàn giao. Synthetic import chỉ xuất hiện trong thư mục tạm của tests. Live/API/token-count calls và key checks vẫn ngoài scope hiện tại.

Mỗi test-run record ghi `testId`, `campaignId`, `attemptId`, `sourceManifestDigest`, `input/config digests`, `startedAt/endedAt`, environment, automated/manual role, expected, actual, status, output/log/receipt refs, usage/cost hoặc unknown reason, reviewer và follow-up. Kết quả `PASS` cần actual evidence, không phải chỉ có test plan.

Thứ tự được phép chạy **trong yêu cầu hiện tại**: L0 sạch → L1 fake HTTP → mock campaign và review local. Dừng trước L2 theo quyết định của owner; completion của scope local không đổi T19/T11/T14 thành PASS. Roadmap sau khi owner yêu cầu live: L2 dev smoke với cấu hình/cost cap → dev calibration + independent dataset review → freeze L3 protocol/labels → real campaign → independent adjudication → L4 handoff. Khi code/prompt/policy đổi, xác định tests ảnh hưởng và run lại trên source pin mới; không tái sử dụng receipt cũ làm evidence cho version mới.

## 7. Kết quả local đã thực hiện trước đợt sửa review — 25/09/2026

Scope local đã chạy xong: [clean-source verification](evidence/phase3-closure/clean-r1-20260925T071254Z-d760e9-summary.json) ghi **384/384 tests pass, 0 fail, 0 skip**, install/check exit 0 và 119 source files không đổi. [Check log](evidence/phase3-closure/clean-r1-20260925T071254Z-d760e9-check.log) là evidence mới; baseline 327 ở đầu tài liệu vẫn giữ làm lịch sử. Lần wrapper metadata trước bị lỗi parse sau khi tests đã pass được giữ riêng, không dùng làm final verification.

[Campaign summary](evidence/phase3-closure/local-campaign-summary.json) ghi đủ **960/960 main trials +120/120 G controls**, `stoppedReason=null`, `configAndSourceStable=true`, `assurance=mock`. Đây là trạng thái hoàn tất phép chạy, không phải 1.080 semantic passes:

| Phần chạy | Completed reader output | Token-budget blocked | Critical-context blocked | Tổng |
|---|---:|---:|---:|---:|
| Main F/R/C | 630 | 90 | 240 | 960 |
| G control | 90 | 0 | 30 | 120 |

Có 1.350 lượt generation trong sandbox fixture, **0 lượt provider thật**, 0 canonical constraint loss. Campaign spend cap/charged đều 0, không còn reserved/uncertain attempt; không tính đây là số đo giá model. Mock reader chủ động abstain, nên 0 false acceptance không chứng minh model quality; các semantic quality thresholds không đạt và `modelQualityMeasured=false`. Những ca bị context block không đo reader answerability. `phaseGate=Not evaluated` của harness không đổi T11 Replan hoặc đóng T19/T14.

Các findings đã có regression và được sửa: density thực tăng tám nguồn eligible/case; source pins bao phủ canonical fixture; partial dev-only human record không mở holdout. Sáu reviewer adversarial tests nằm trong suite 384. Source campaign pin là `sha256:1f8ae54cc224e7da7fd180ef366bb54c5523125e62dfdabae8dd01f9c4cff3c8`; dataset v2 seal là `sha256:be327cca08b882f0c45669cf5cff38f5009dd26a89cb2c46b39dcc2302250008`. Clean-test source digest riêng bao phủ source/tests/fixtures theo manifest, không phải cùng tập files với campaign implementation digest.

L2–L4 vẫn để sau theo quyết định “chỉ local trước”: chưa real-model smoke/calibration, chưa independent human holdout acceptance, chưa T14 full handoff hoặc Phase 3 PASS. Không cần chạy lại local campaign chỉ để làm semantic score của mock đẹp hơn.

Đợt sửa review chạy lại các checks bị ảnh hưởng để xác nhận protocol/report mới, không nhằm làm đẹp điểm mock. Kết quả source pin mới được ghi tại [báo cáo sửa lỗi](phase-3-fixes-report.md); evidence cũ ở mục này không bị ghi đè.

Clean verification của đợt sửa đạt **422/422 tests, 0 fail, 0 skip**, tăng 38 tests. [Summary](evidence/phase3-fixes/clean-fixes-20260925T082029Z-summary.json) gắn với 126 source files không đổi và 87 emitted JS files; campaign mới dùng `fixtures/semantic-config/local-fixes.json`, ID `semantic-local-v2-fixes`, output `.local/semantic-local-v2-fixes-run1`. [Campaign summary mới](evidence/phase3-fixes/local-campaign-summary.json) xác nhận 960 main +120 G hoàn tất, 1.350 mock calls/0 provider calls, cả source/review/provider integrity true. Gathering được chấm trên cả 1.080 prepared trials; reader unanswerable/conflict vẫn chưa có output. Kết quả chi tiết/pins nằm trong báo cáo sửa lỗi; không suy model acceptance từ clean tests hoặc fixture recall.
