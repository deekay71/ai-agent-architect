# AI Agent Architect — Bối cảnh hiện hành R2

## Actual mới nhất — nghiệm thu 5 hạng mục, 28/09/2026

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

## Phân vai model mới — 25/09/2026

Owner chọn **Terra (`gpt-5.6-terra`) cho execution; Sol (`gpt-6-sol`) cho suy nghĩ mức vừa; Astra (`gpt-6-astra`) cho suy nghĩ sâu**. Effort mặc định tương ứng medium / medium / high. [Quy tắc và profiles](model-routing.md) áp dụng cho cấu hình tác vụ mới; Luna trong kết quả/campaign cũ là lịch sử. Đây chưa phải tự động chuyển model của phiên đang chạy hoặc mở lại benchmark frozen.

## Quyết định hiện hành — Codex subscription, 25/09/2026

Owner đã duyệt chạy DEV benchmark qua **Codex CLI đăng nhập ChatGPT**, dùng quota Codex hiện có. Không cần API key và không áp dụng đề xuất cap API 5 USD. Giữ cấu hình Astra/high cho planning và Luna/medium cho execution; đây là requested profiles, chưa phải chứng nhận model hoặc phân vai. Đợt đầu giới hạn một dev case, 6 comparison trials +2 G, tối đa 10 invocations. Runbook và actual nằm trong [báo cáo Codex](phase-3-codex-benchmark.md). **Actual: hai attempts, 0 valid model answers; một local startup failure đã reconcile có evidence, một started-thread attempt còn unknown usage và ledger frozen. Smoke chưa đạt; không chạy lại hoặc reset allowance tự động.**

Bản bàn giao cuối đạt **527/527 clean tests**, source/compiled pins ổn định; hai attempts live vẫn không có output hợp lệ. Đường đo này ghi reported usage sau call, không có exact provider pre-count hoặc hard output cap, không suy quota thành USD. T19/T14 vẫn Not evaluated, T11 Replan; Phase 3 chưa PASS. Cần calibration độc lập, protocol/holdout mới và adjudication/handoff. Các đề xuất API và đoạn scope chỉ local bên dưới là lịch sử, không phải việc đang chờ owner duyệt nữa.

## Quyết định tiếp tục — 25/09/2026

Owner chọn **hoàn tất nghiệm thu Phase 3 trước**, chưa mở Phase 4. Đã bổ sung DEV readiness, chọn case và forecast, model capacity admission, paired diagnostics và review actual outputs. Fresh-copy build/check đạt **466/466 tests, 0 fail/skip**; mirror hoàn tất 12 main +4 G với 20 mock generations, export đủ 16 review outputs; 0 provider calls, source ổn định. Hai finding review đã sửa. [Gói chuẩn bị nghiệm thu](phase-3-acceptance-prep.md) có cấu hình smoke 2 case, Astra/Luna, tối đa 20 generation calls, generation upper bound 4,242980 USD và đề xuất cap 5 USD. **Chưa nhận phê duyệt chi phí/key-check; chưa gọi API hoặc đọc key.** Smoke không thay calibration/fresh holdout/protocol/adjudication và T14. T19/T14 vẫn Not evaluated, T11 Replan; Phase 3 chưa PASS. Những đoạn scope “chỉ local, S2–S4 để sau” bên dưới là lịch sử trước quyết định tiếp tục này.

## Trạng thái làm việc hiện tại
Ngày 25/09/2026, phần Memory/Context local của Phase 3 đã triển khai: **T09/T10 Done / Pass trong phạm vi local; T19 Doing / Not evaluated; T11 Doing / Replan; T14 Doing / Not evaluated; toàn Phase 3 chưa PASS**. Tổng 8 task Done, 3 Doing, 14 task chưa mở. T19 có cơ chế context đã kiểm nhưng thiếu AC so sánh task quality/loss/latency/tokens với provider thật; T14 đã có implementation/tests nhưng full handoff gate chờ T19 được nghiệm thu. Không thu hẹp AC để đổi trạng thái thành Done. Chưa mở Phase 4, Unity, T22 hoặc gameplay. Baseline clean-source check đạt **327/327 tests, 0 fail, 0 skip**; [evidence](evidence/phase3/final-clean-verification.md) giữ cả lần đầu lỗi fixture timing. Xem [báo cáo Phase 3](phase-3-report.md), [Memory/Context/Explorer](memory-context.md) và [benchmark](phase3-benchmark.md).

Memory có SQLite/FTS, source/claim provenance và freshness, independent review/promotion, revoke/supersede và invalidation theo dependency. Context có per-agent windows, whole-packet accounting local, progressive skill loading, canonical constraints/AC hydration và guard kiểm current source trước dispatch/commit. Explorer kiểu Obsidian đã được duyệt vào Phase 3 và triển khai local chỉ đọc; không phải plugin Obsidian, proposal UI không sửa Memory chuẩn.

Campaign R1 giữ nguyên 6 false accepts. R2 có 0 false accepts và 78 false rejects trên 540 trials; bộ đã lộ nên chỉ là regression, không phải holdout độc lập mới hoặc semantic/model PASS. T11 cần dataset/labels độc lập mới, provider/model/tokenizer/usage/cost và calibration. Không hạ AC để đi tiếp.

Phase 2 T07/T18/T15 đã đạt nghiệm thu runtime cơ học local trên macOS: clean source 209/209 tests, 0 skip; protected store/sandbox/OS lock, stage gates, recovery và skill bindings. Active release vẫn chỉ `runtime.fixture`. Xem [báo cáo Phase 2](phase-2-report.md). Đoạn Phase 1 dưới đây là mốc lịch sử.
R2 ngày 24/09/2026 đã áp dụng execution skill layer theo yêu cầu điều chỉnh kế hoạch và triển khai Phase 1. Repo hạ tầng riêng đã có 26 executable contracts 0.5.0, static conformance, catalog/resolver và CLI offline. T17/T06/T23 đã Done / Pass trong phạm vi foundation bootstrap: 105 tests đạt từ clean checkout, bốn findings review đã đóng, 12 repro gốc và ba ca bổ sung bị chặn; chưa có production gate, active PolicyRelease, Unity benchmark hoặc game.
Kế hoạch và nghiệm thu hiện hành: [Tài liệu liên quan](https://app.notion.com/p/3e5a6c16b3dc81a5b1d7e1e71bbad748). R1 được giữ làm baseline lịch sử. Nghiên cứu đa nguồn: [Tài liệu liên quan](https://app.notion.com/p/3e5a6c16b3dc81a4973ff86951f2cb48). Upstream skills/bridges chưa được cài hoặc certified; package đang chạy là fixture nội bộ.
## Quyết định bổ sung — hoàn thiện và test local trước
Người dùng chọn OpenAI/ChatGPT: model chất lượng cao cho planning, model ít tốn chi phí hơn cho execution; sau đó xác nhận “Chỉ hoàn thiện và chạy test local trước”. Không gọi API, không kiểm credentials, không tự nhận cost cap. Profiles tham chiếu `gpt-6-astra` high và `gpt-6-luna` medium; escalation `gpt-6-sol` chỉ thủ công. Chưa chứng minh phân vai tối ưu bằng benchmark thật.

Đã thêm provider adapter, campaign cost ledger, ba context arms cùng tổng budget, nhiều compactions/distractor densities, G evidence-only control tách riêng, sealed candidate dataset và CLI. Dataset v2 có 363 public documents, 20 dev/10 candidate holdout, 8 eligible distractors mỗi case. v1/r0 giữ lịch sử vì density chưa tạo nhiễu trong scope. Holdout chưa được review độc lập và chưa chạy reader. Human-record import chỉ attestation từ operator, không xác thực danh tính người; coverage từng case bắt buộc trước mở holdout. Exact-answer alternatives/constraint IDs không thay semantic/behavioral review.

[Báo cáo mới](phase-3-closure-report.md), [test plan](phase-3-test-plan.md), [kế hoạch đóng gate](phase-3-closure-plan.md) là tài liệu tiếp nối baseline 327 tests. Đợt local mới đạt384/384tests,0fail/skip;960comparison+120controls hoàn tất,1.350mockcalls và0providercalls. Local fixture luôn abstain; model quality/provider tokens/cost vẫn chưa đo. Unknown nghiêm trọng vẫn block context, vì thế chưa đo reader abstention/conflict quality ở những case đó. Không hạ hard gate hoặc đổi status Phase 3 chỉ để đạt số test.

## Đợt sửa sau review kết quả local

Người dùng yêu cầu sửa bốn findings P2 và bổ sung thiếu sót. Bản sửa giữ chẩn đoán lỗi đã lọc trong call journals/report; count admission theo generation để recount cũ không hồi sinh quyền generation; khóa và tái kiểm human-review record/external evidence trước và sau async calls; chấm gathering độc lập reader cho mọi trial đã chuẩn bị context, kể cả reader bị block. Lỗi review drift dừng campaign và giữ receipt/chi phí đã phát sinh; không bỏ failed attempts hoặc đổi UNKNOWN thành miễn phí.

Report `semantic-campaign-report/2` tách retrieval/selected evidence recall, precision và sufficiency khỏi reader quality; có coverage theo answerability/task class. `readerStrictPassRate` chỉ dùng scored trials, còn từng trial có gathering sufficiency để truy nguyên lỗi evidence. Không có required evidence thì recall/sufficiency là `null`; chưa có reader output không phải correct abstention. Mẫu số all-trial strictPass bảo thủ vẫn giữ, quality floor chưa được calibration không đổi. Citation nguồn optional vẫn kiểm revision khi xuất hiện, nhưng bỏ nguồn optional không làm fail mandatory revision check. Audit split dựa trên public question/history phát hiện bản sao exact/near giữa dev/holdout dù family/ID khác; các nghi vấn rộng hơn cần semantic review. Audit lexical sạch không chứng minh độc lập ngữ nghĩa.

Source mới đạt **422/422 tests, 0 fail/skip**, 126 source files ổn định trước/sau clean run; bằng chứng và kết quả campaign của version mới nằm trong [báo cáo sửa lỗi](phase-3-fixes-report.md). Baseline 384 và campaign cũ ở trên được giữ nguyên làm lịch sử. Phạm vi vẫn chỉ local, không gọi API/key-check. T09/T10 vẫn Pass local; T19/T14 Not evaluated, T11 Replan và toàn Phase 3 chưa PASS.

Campaign `semantic-local-v2-fixes` chạy đủ 960 main +120 G controls, 1.350 mock calls/0 provider calls; source/review/provider integrity true, không reserved/uncertain attempt. Gathering main có 816 required trial đủ evidence, 144 N/A; precision khoảng 0,48 do nguồn nhiễu. Main vẫn 630 reader outputs, 90 token block và 240 context block; unanswerable/conflict chưa có reader output. Không biến recall fixture cao hoặc review code sạch thành model acceptance.

## Mục tiêu và thứ tự bắt buộc
Xây hạ tầng AI Agent Architect trước, nghiệm thu T22 rồi mới dùng hệ thống xây game Block Puzzle kiểu Block Blast từ đầu. Unity fixture nhỏ ở Phase 5 (P4 cũ) kiểm tra adapter, không phải gameplay. Giữ Context Engine / Planning Engine / Memory Engine; LLM Wiki, ADR và Experience nằm trong Memory.
## Các quyết định đã áp dụng
1. Modular monolith, nhiều planner chuyên môn có context riêng, synthesizer và critic độc lập. PlanningModeDecision chọn single/multi theo task class, dependencies và benchmark cùng budget; hệ thống phải hỗ trợ multi-planning.
2. CheckDefinition/CheckResult phân loại deterministic/model/human, loại evidence bắt buộc và unknowns. Schema đúng/đủ refs không chứng minh đúng ngữ nghĩa. Planning PASS là readiness; execution cần compile/tests/integration evidence riêng.
3. Judge/rubric muốn cấp quyền tự động dispatch phải thuộc PolicyRelease active đã kiểm định đúng task class. Scheduler lấy GateReport từ store tin cậy, kiểm issuer/hash/input versions/policy/scope. Shadow không cấp quyền thực thi; deterministic scope có release riêng.
4. Runtime có operation ledger: operationId ổn định, attempt riêng, reconcile receipt/postcondition; crash/timeout không được retry mù. Pilot một owner process + OS lock + queue; quarantine nếu chưa biết Unity process cũ đã dừng.
5. Tách quyền executor, verification runner, Gate Controller, policy owner và Memory promoter. Executor không sửa oracle/rubric/verdict/evidence store hoặc promoted Memory. Hash không thay kiểm tra nguồn tạo bằng chứng.
6. ContextManifest gắn constraints/AC với nội dung chuẩn, revision, hash và scope. Sau compaction, code hydrate phần bắt buộc; mỗi agent invocation có window/budget riêng. Không biến UNKNOWN thành fact.
7. Claim giữ observed/inferred/decision, nguồn, scope, evidenceStatus và lifecycle. Quarantine/revoke/supersede invalidate bắc cầu phần phụ thuộc; không stale toàn hệ thống chỉ vì MemoryVersion tăng. SourceRecord có freshnessPolicy pinned/live/revalidateBeforeUse và digest/thời điểm.
8. Phân biệt resume, retryAttempt, replay/fork và replan; giữ workflow/checkpoint versions và kết quả đã commit. Benchmark có negative cases, answerability/unsupported premise, retrieval/reader đối chứng, nhiều trials và mọi failed attempts.
## Những điểm vẫn cần đo hoặc spike
- 85/100, điểm sàn 3/4, tối đa hai replan, context budgets/fan-out và retry budgets là cấu hình khởi đầu chưa calibration. Tạo artifact version mới không reset lineage budget.
- LangGraph embedded SQLite và Promptfoo đã được pin/cài/chạy trong package spike riêng. Runtime chính chọn broker SQLite hẹp; checkpoints framework không thay operation ledger/ownership/policy. Promptfoo là benchmark adapter, không có authority. Xem ADR 0002 và framework spike report. Không thêm Temporal/Redis/vector/graph DB.
- TypeScript orchestration và C# Unity/domain là hướng dự kiến; provider OpenAI đã chọn, planning dùng cấu hình Astra/execution Luna; cost cap/API benchmark và target mobile chưa chốt; team là bạn + AI agents, số giờ mỗi tuần chưa xác nhận.
- R2 thay forecast R1: low/base/high khoảng 14/21/34 tuần làm việc khả dụng; base tới T22 ngày 22/01/2027 và pilot 19/02/2027. 20 giờ/tuần của bạn chưa xác nhận; lịch có điều kiện, chưa đặt dịch vụ agents chạy nền. Workload tham chiếu 59.25/96/156 đơn vị 8 giờ khác owner touch-time 75/140/248 giờ. Giữ baseline, cập nhật actual riêng và reforecast sau spike; không extrapolate tốc độ foundation sang runtime/Unity.
- Đã xác nhận team: bạn + AI agents. Backlog có 25 task, Forecast R2/Actual/Acceptance evidence và hai views R2. Ngày bắt đầu actual: 24/09/2026; status/evidence Phase 1 được cập nhật trong plan R2.
## Lộ trình hiện hành
Phase 1 (P0 cũ): T17/T06/T23 — architecture, executable contracts, catalog/compatibility/digest/resolver offline.
Phase 2 (P1 cũ): T07/T18/T15 — persistent runtime, protected authority/evaluation, ledger/ownership/recovery.
Phase 3 (P2 cũ): T09/T10 local Done/Pass; T19/T14 Doing/Not evaluated; T11 Doing/Replan — chưa đạt gate toàn phase.
Phase 4 (P3 cũ): T12/T20/T24 — multi-planning, calibration và controlled skill benchmark trên sample repo không Unity.
Phase 5 (P4 cũ): T21/T08/T25/T22 — Unity fixture, một đường thao tác, trusted runner, recipes/conformance, platform acceptance.
Phase 6 (P5 cũ): T01–T05/T13/T16 — Block Puzzle sau T22 PASS đủ task classes.
## Công việc tiếp theo
Tiếp theo là replan T11 cùng AC còn thiếu của T19: review labels độc lập, khóa fresh holdout/corpus/oracle trước run; chọn và pin provider/model/tokenizer/config/budget, đo task quality/loss/latency/tokens/cost, semantic reader/calibration và giữ toàn bộ failed attempts. T14 handoff gate chờ T19, không suy tests promotion thành đã nghiệm thu dependency. T10 parser hiện chỉ là C# syntax subset, reference candidates mang nhãn inferred/unverified; semantic binding/Roslyn trên project thật vẫn cần spike nếu AC yêu cầu. Phase 4 chờ gate Phase 3; không gọi regression exposed-set là holdout mới.

Không có dịch vụ agents tự chạy sau phiên. Remote `main` vẫn ở Phase 1; Phase 2 và Phase 3 local chưa push. Source Phase 1 trên Drive và các report/campaign cũ là lịch sử được giữ lại. Giữ forecast R2 baseline, reforecast theo owner capacity và evidence mới; không dùng tốc độ fixtures suy ra deadline Unity.

Catalog skill khác runtime: eligibility chỉ xác định ứng viên tương thích. Script phải qua capability/permission/ledger; skill không tự đổi policy hoặc cấp PASS. T19 đã ghi actual loaded bindings, hydrate bản pin và giữ constraint/AC/critical unknown qua compaction. Loaded receipt chỉ là local packet inclusion; default byte accounting không phải provider tokens; `revalidateBeforeUse` thiếu fetch adapter vẫn UNKNOWN.
## Nguồn chuẩn và cách dùng
Contracts/tên fields chuẩn: [Tài liệu liên quan](https://app.notion.com/p/3e3a6c16b3dc816ab47fc95ef0ab630b).
Roadmap: [Tài liệu liên quan](https://app.notion.com/p/3e3a6c16b3dc8136927dcb1bb630daf1); backlog: [Tài liệu liên quan](https://app.notion.com/p/4d37fed112f4430d935dd764f6d1df99).
Planning/gates: [Tài liệu liên quan](https://app.notion.com/p/3e4a6c16b3dc8112a3d7c54cfe836c81); Context: [Tài liệu liên quan](https://app.notion.com/p/3e4a6c16b3dc81cf8849fafc428eb65b).
Sơ đồ hỗ trợ đọc kiến trúc: [Tài liệu liên quan](https://app.notion.com/p/3e4a6c16b3dc8155ad16df18f81be66f). Review 13 giữ lý do và nguồn nghiên cứu của thay đổi: [Tài liệu liên quan](https://app.notion.com/p/3e4a6c16b3dc81deb2dac08ad626a619); các “khoảng trống” trong review mô tả baseline v0.3, nay đã được đưa thành yêu cầu tài liệu v0.4, chưa đóng bằng code/evidence.
Hội thoại gốc và bộ 21 file được nhắc tới là nguồn lịch sử; các file gốc chưa truy xuất đủ. Dùng quyết định đã xác nhận và tài liệu hiện hành khi tiếp tục, không diễn giải bản thiết kế cũ là kết quả triển khai.

Bàn giao Phase 3: [Notion](https://app.notion.com/p/3e6a6c16b3dc81fb864ed042ed313b55), [Drive](https://drive.google.com/drive/folders/1J_9ASjL-YKWUFQCmsNk4EeOmcEvdHAe0). GitHub Phase2/3 vẫn chưa push; bản source và Git history được đóng gói riêng trên Drive.

Bàn giao local tiếp nối: [Notion report](https://app.notion.com/p/3e6a6c16b3dc817e996dd2c20abd3cfe), [Notion test plan](https://app.notion.com/p/3e6a6c16b3dc81bd93c9f7c999882bd8), [Drive](https://drive.google.com/drive/folders/1C7ZQmtNnJyJafEABbt_je-1gZUuc42jE). Source/history/evidence và context được đóng gói; GitHub vẫn chưa push.

Bàn giao sau sửa review: [Notion fixes](https://app.notion.com/p/3e6a6c16b3dc8180bc0cff5fc43cfd60), [Drive fixes](https://drive.google.com/drive/folders/18XOvGDcJnSmzxSNKH5G28WKOcRXecKuE). 422/422 clean tests và campaign 960+120 có source pins mới; GitHub chưa push.
