# Công việc còn lại sau triển khai local Phase 3

## Actual mới nhất — DEV sau sửa CLI, 28/09/2026

**15/15 calls hoàn tất trên Terra/Sol/Astra, 12 valid answers, 141.613 reported tokens,0unknown trong đợt mới.** Ledger lịch sử giữ nguyên. Transport/usage đã kiểm chứng; strictPass vẫn0/12 vì output constraint ID/mô tả và lexical scoring. Đã làm rõ prompt/schema constraint IDs,530/530 clean tests Pass; prompt mới chưa chạy live lại. [Actual và điều chỉnh](phase-3-post-fix-smoke-report.md); [12 outputs chờ review](phase-3-dev-output-review.md). Phase3 chưaPass: R1 done; R2 quality Replan; R3 calibration/review tiếp theo; T19/T14 Not evaluated,T11 Replan. Các đoạn frozen/chưa chạySol/Astra bên dưới mô tả lịch sử trước đợt này.


## Actual hiện hành — 28/09/2026

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

T09/T10 đã Done / Pass trong phạm vi Memory local. Context mechanics T19 và Memory promotion T14 đã có implementation/tests nhưng **T19/T14 Doing / Not evaluated**: T19 thiếu AC chất lượng/token thật; full handoff T14 chờ dependency T19. **T11 Doing / Replan; toàn Phase 3 chưa PASS**, chưa mở Phase 4 hoặc gameplay. Tổng 8 Done, 3 Doing, 14 Todo. Xem [báo cáo Phase 3](phase-3-report.md), [hướng dẫn Memory/Context/Explorer](memory-context.md) và [benchmark](phase3-benchmark.md).

Runtime demo vẫn chỉ có active release `runtime.fixture`. Không có release model/semantic/Unity, Unity project hoặc T22 PASS. Baseline clean-source suite 327 tests; lần bàn giao tiếp nối 384/384; bản sửa review mới đạt **422/422 tests, 0 fail/skip**, chạy đủ 960 main +120 G bằng mock và không gọi provider. Historical evidence và failed attempts đều giữ lại. Remote `main` còn Phase 1; Phase 2 và Phase 3 đang local chưa push.

## Đợt local tiếp theo đã triển khai

Theo xác nhận của owner, chỉ hoàn thiện và test local; không gọi API hoặc kiểm key. Có OpenAI adapter/counting/usage + spend ledger, F/R/C cùng tổng budget, G control tách riêng, compaction 1/3 lần và density0/8, dataset candidate v2, human-review import và CLI. Xem [báo cáo local mới](phase-3-closure-report.md) và [test plan có IDs](phase-3-test-plan.md). Model role config đã chốt tham chiếu Astra cho planning, Luna cho execution; model measurement/calibration còn mở. Những bước “chuẩn bị/nối” bên dưới nay có implementation local; phần review độc lập và provider nghiệm thu vẫn chưa thực hiện.

Đợt sửa sau review bổ sung bốn phần: sanitized error receipts; count admission chống race; pin/revalidate human-review evidence; gathering scores và reader coverage tách riêng. Split audit bổ sung phát hiện nội dung exact/near-clone giữa dev/holdout dù khác family. [Báo cáo sửa lỗi](phase-3-fixes-report.md) là nơi xác minh source mới; không tái dùng baseline 384 tests làm kết quả cho code đã đổi.

## Việc cần làm để đóng Phase 3

1. **Replan T11, giữ lịch sử campaign:** R1 có 6 false accepts; R2 có 0 false accepts và 78 false rejects trên 540 trials. R2 dùng bộ đã lộ nên chỉ là regression. Giữ cả report, manifest, journal và failed attempts; không gọi lần chạy lại là fresh holdout.
2. **Chuẩn bị benchmark độc lập mới:** review labels và oracle, khóa corpus/scenario families/split/config/budget trước khi chạy. Mỗi fixture ghi `requiredEvidenceIds`, `acceptableAlternatives`, `answerability`, `expectedRevision`, `expectedConstraints`; không ingest oracle/holdout answers vào Memory. Dùng gathering/reader metrics và split audit đã có để review protocol, nhưng vẫn cần người kiểm semantic overlap, nhãn và provenance; lexical audit sạch không thành independent acceptance. Giữ gold-evidence control, review/external-evidence pins và report mọi lần thử.
3. **Đóng AC T19 bằng provider thật:** chọn/pin model, prompt/config, tokenizer và usage/cost receipts; so task quality, loss, latency, tokens trên ba nhánh **full-context**, **retrieval + isolation**, **retrieval + isolation + compaction**, dùng cùng model và cùng tổng budget. Chạy nhiều lần compaction, thay đổi mật độ distractors, kiểm evidence/alternatives/answerability/revisions/constraints đúng oracle ở mỗi nhánh. Gold-evidence reader control không thay nhánh full-context. Byte accounting và deterministic reader hiện có không thay các AC này; chỉ nối một provider cũng chưa đủ nghiệm thu.
4. **Calibration và handoff:** đo false acceptance/rejection với uncertainty phù hợp, human adjudication và task classes rõ. Khi T19 có đủ evidence mới nghiệm thu full handoff T14 và gate toàn Phase 3. Không tự thu hẹp scope hoặc hạ threshold để cho phase kế tiếp chạy.
5. **Cập nhật actual riêng:** giữ nguyên forecast R2 lịch sử; xác nhận owner capacity rồi reforecast từ evidence mới. Model usage/touch-time chưa đo giữ UNKNOWN; chưa có dịch vụ agents tự chạy sau phiên.

## Những phần local đã có và giới hạn cần giữ

| Phần đã triển khai | Giới hạn hiện tại |
|---|---|
| SQLite/FTS Memory, claim/source provenance, lifecycle/freshness, promotion và selective invalidation | Broker/operator authority local; source refresh chỉ mock, `revalidateBeforeUse` chưa có fetch adapter thật vẫn UNKNOWN |
| Window riêng, progressive descriptor/body/reference, canonical constraint/AC hydration, critical unknown preservation | Đã kiểm cơ chế packet; chưa đo model consumption/task quality và tokenizer/cost provider |
| Runtime context guard, durable required pin và current-source check trước worker stdin/commit | Chỉ nối vào fixture runtime; callback và issued-window store trusted host, không phải distributed transaction |
| Explorer graph/backlinks kiểu Obsidian, scope-filtered snapshot, context proof, proposal download | Chỉ đọc local, không cài plugin Obsidian; JSON/Markdown không ghi Memory; loaded chỉ là local payload inclusion |
| Parser/retrieval/reader fixture benchmark | C# syntax subset; inferred reference candidates chưa semantic binding/Roslyn; corpus nhỏ và exposed-set regression không chứng minh reliability model |
| Semantic campaign report v2, gathering/reader coverage, split audit, review/error receipts | Gathering đo evidence có mặt đúng revision, không chứng minh reader hiểu; lexical split audit không phát hiện mọi semantic clone; human import vẫn là operator attestation |

## Các phase sau, chưa mở

| Hạng mục | Task sở hữu | Đầu ra và kiểm chứng tiếp theo |
|---|---|---|
| Runtime ngoài fixture, multi-planning | T12/T20 | Specialist subplans, synthesis, critic độc lập, integration gate; so single/multi cùng budget, giữ lineage budget qua replan |
| Semantic/model/human evaluation | T20 | Dataset và labels độc lập, usage/cost thật, calibration/release theo task class; reuse harness hiện có |
| Skill benefit/certification | T24 | Controlled trials trên sample repo, locked split/oracle/budget; mọi failure, false accept/reject/cost/owner touch; eligibility không thay certification |
| Unity adapter và recipes | T21/T08/T25 | Probe official CLI trước, tối đa một bridge; real Editor compile/reload/cancel/reconcile và protected runner |
| Nghiệm thu nền tảng | T22 | Active release đủ task classes game cần, conformance trên Unity thật; chưa PASS thì chưa gameplay |
| Game Block Puzzle | T01–T05/T13/T16 | Chỉ sau T22: luật, UI, save/replay, fail-before/pass-after và pilot holdout |

## Ranh giới phải giữ khi tích hợp

- Foundation audit kiểm linked records; runtime tách planning readiness, pre-dispatch và post-execution, không đòi evidence tương lai trước dispatch.
- Operator cài authority ngoài candidate scope; tool output hoặc chuỗi PASS không tự tạo quyền. Digest không chứng thực issuer hay semantic truth.
- Sandbox, immutable artifacts, OS ownership và scope checks bảo vệ trước candidate; operator/root/host vẫn thuộc trusted boundary. Linux/Windows isolation và Unity lifecycle cần evidence riêng.
- Context scope/revision hiện hành phải được kiểm ở điểm sử dụng; source thu hồi không bị bỏ qua sau async hook hoặc restart. Unknown không trở thành fact; không blind retry hiệu ứng không rõ.
- Catalog compatibility/body digest không là certification. Upstream license/attribution, môi trường thật và task-class skill benchmark vẫn thuộc T24/T25.
- JSON Schema chỉ biểu diễn cấu trúc; executable refinements và cross-record checks vẫn bắt buộc. Không suy chất lượng toàn hệ thống từ số task Done hoặc số test xanh.
