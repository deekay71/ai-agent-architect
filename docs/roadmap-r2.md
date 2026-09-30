# 07 — Roadmap triển khai R2: hạ tầng trước, game sau

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

## Kết quả thực hiện Phase 3 — 25/09/2026

**T09/T10 Done / Pass trong phạm vi local; T19 Doing / Not evaluated; T11 Doing / Replan; T14 Doing / Not evaluated; toàn Phase 3 chưa PASS.** SQLite/FTS Memory, provenance/freshness/promotion/invalidation, per-agent Context/hydration/progressive skills và current-source runtime guard đã triển khai. T19 còn AC task quality/loss/latency/tokens với provider thật; T14 có implementation/tests nhưng full handoff gate chờ nghiệm thu T19. Explorer graph/backlinks kiểu Obsidian được duyệt bổ sung vào scope và đã có inspector loopback chỉ đọc; proposal không ghi Memory chuẩn. Xem [báo cáo Phase 3](phase-3-report.md), [hướng dẫn](memory-context.md) và [benchmark](phase3-benchmark.md).

R1 giữ nguyên 6 false accepts. R2 có 0 false accepts và 78 false rejects trên 540 trials, chỉ là regression trên bộ đã lộ; cần fresh independent holdout, provider/model/tokenizer/usage/cost và semantic calibration. Final clean-source check đạt **327/327 tests, 0 fail, 0 skip**; [evidence](evidence/phase3/final-clean-verification.md) giữ cả lần đầu lỗi fixture timing. Không hạ AC để mở Phase 4 hoặc gameplay. Tổng 8 task Done, 3 Doing, 14 chưa mở. Forecast R2 bên dưới giữ nguyên baseline; actual Phase 3 local là 25/09/2026.

Đợt tiếp nối đã bàn giao [384 tests và 960 comparison +120 G controls bằng mock](phase-3-closure-report.md). Review sau đó xác định bốn điểm cần sửa: chẩn đoán lỗi campaign, race count admission, tính ổn định human-review evidence và thiếu gathering metrics riêng. [Bản sửa và xác minh mới](phase-3-fixes-report.md) bổ sung các phần này, report coverage theo answerability và audit nội dung split. Đây là hardening/measurement local trong Phase 3; không đổi số task Done hoặc các gate trên. S2–S4 gồm model thật, review độc lập, calibration và handoff vẫn để sau theo quyết định chỉ chạy local.

Bản sửa đạt **422/422 tests từ source sạch, 0 fail/skip**; campaign mới chạy đủ 960 main +120 G, 1.350 mock calls/0 provider calls và integrity ổn định. Review cuối không còn findings P1/P2; quality model và reader unanswerable/conflict vẫn chưa đo. Không đổi Forecast R2 hoặc mở Phase 4 dựa trên kết quả này.

## Kết quả thực hiện Phase 2 — 25/09/2026

**T07/T18/T15 Done / Pass cho runtime cơ học local trên macOS**: 209/209 tests từ source sạch, 0 skip; ledger/checkpoint, protected authority, stage gates, OS ownership/sandbox và crash recovery. LangGraph/Promptfoo spikes đã chạy, quyết định giữ broker SQLite và benchmark adapter độc lập. Xem [báo cáo Phase 2](phase-2-report.md). Active release chỉ `runtime.fixture`; model/Unity/T22 chưa PASS. Tại mốc Phase 2 có 6 task Done, 19 task còn lại; Explorer lúc đó chưa thuộc scope. Forecast bên dưới vẫn là baseline lịch sử, actual Phase 2 là 25/09/2026; trạng thái mới lấy phần Phase 3 phía trên.

## Kết quả thực hiện Phase 1 — 24/09/2026

**T17/T06/T23 đã hoàn tất và PASS nghiệm thu foundation**: 26 executable contracts 0.5.0, catalog/resolver và CLI offline; 105 automated tests pass từ clean checkout, independent review đóng bốn findings; 12 repro gốc và 3 follow-up cases bị chặn. Báo cáo đầy đủ: `phase-1-report.md`; source/test evidence ở snapshot Drive. Không có active runtime PolicyRelease, Unity benchmark hoặc T22 PASS.

R2 forecast bên dưới được giữ làm baseline; actual Phase 1 bắt đầu/kết thúc 24/09/2026. Không cần đợi ngày forecast để mở Phase 2 khi có phiên làm việc và dependency đã đạt. Không extrapolate tốc độ foundation sang runtime/Unity. Phần nói “tại cut lập kế hoạch” mô tả lịch sử; trạng thái hiện hành lấy đoạn này và schedule JSON.

Cập nhật24/09/2026 sau khi người dùng yêu cầu áp dụng execution skills và triển khai Phase 1. **Phase 1…6 thay cách gọi P0…P5; task IDs cũ giữ nguyên.** Phiên implementation đầu tiên bắt đầu24/09; kết quả Phase 1 đã cập nhật riêng phía trên, không suy thành nghiệm thu nền tảng T22.

## Các nguyên tắc tiếp tục giữ

- Benchmark đo policy/năng lực theo tập bài; quality gate kiểm từng artifact. Planning readiness khác correctness sau execution.
- Multi-planning được hỗ trợ: specialist subplans → synthesizer → independent critic → integration gate. Chọn mode theo task class và benchmark cùng budget; nhiều agents không mặc định tốt hơn.
- Chỉ trusted PASS đúng artifact/hash/input refs và active PolicyRelease đúng scope mới runtime auto-dispatch. Executor không ghi oracle/rubric/verdict/trusted evidence/promoted Memory.
- Context partition/isolation, progressive disclosure và compaction là ba cơ chế riêng. Manifest ghi đúng body/references/constraints đã nạp; hydrate bản pin sau compaction. Revoke/invalidation theo dependency, không stale cả hệ thống vô điều kiện.
- Skill là procedural knowledge có version/digest/provenance; không phải policy authority. Dùng operation ledger, context và evaluation harness hiện có, không thêm runtime/gate thứ hai.
- **Không tạo gameplay trước T22.** Fixture Unity trước gate chỉ kiểm capability generic, không lén chứa vòng chơi puzzle.

## Phase 1 — Architecture, contracts và catalog/resolver cơ bản (P0 cũ)

**T17 → T06 → T23.** Repo hạ tầng/CLI offline; module seams và actor/store permissions; contracts canonical v0.4 + SkillDescriptor/SkillBinding; canonical digest, cross-record refs/DAG/version validators; catalog nhỏ với source/license/deprecation, compatibility và deterministic resolver.

Exit evidence: positive/negative fixtures, CLI smoke, package tamper/unknown compatibility/missing capability rejection, independent integration review và AC mapping. Đây là schema/resolver scaffold và development tests, **không phải** OS enforcement, active policy runtime, Unity conformance hoặc chứng nhận skill. Quyền/process thật được implement/kiểm ở Phase 2/5. Ma trận17AC T17/T06/T23 nằm trong plan R2; AC chưa có bằng chứng giữ mở.

Thực hiện bằng bootstrap development: user+AI coding tools hiện có xây nền tảng; không yêu cầu release của hệ thống chưa tồn tại trước khi viết code. Không gọi model/Unity/network trong offline baseline nếu fixture không cần.

## Phase 2 — Runtime, evaluation harness và recovery (P1 cũ)

**T07 → T18 → T15**, sau Phase 1. State machine/checkpoints, operation ledger, ownership/OS lock/queue, actor/store boundaries, model/fake tool adapters; evaluation harness, Gate Controller và release controls.

Skill activation dùng bindings của T23, revalidate trước dispatch; không tạo ledger mới. Exit: fake/stale/missing PASS, inactive policy, wrong scope/digest/issuer không dispatch; crash-after-effect không duplicate; owner cũ còn sống không takeover; tampered report/oracle bị chặn tại boundary thật. Fake/deterministic fixtures chứng minh cơ chế, chưa chứng minh judge semantic đủ chính xác. LangGraph/Promptfoo đã chạy executable spike; kết quả và quyết định ở report Phase 2/ADR 0002.

## Phase 3 — Memory, Context và baseline (P2 cũ)

**T09 → T10 → T19 → T11; T14 join**, sau Phase 2. Source/claim trust, freshness/revoke và selective invalidation; skill source và digest được truy nguyên; context theo agent/window nạp metadata → body → references khi cần, lưu actual-loaded manifest và hydrate sau compaction.

T11 đo baseline retrieval/reader/context retention và token cost trên sample repo. Starter30cases với10holdout chia theo scenario family chưa đủ production reliability. T14 có thể chuẩn bị sau T09/T18, nghiệm thu integration đợi T10/T19. Không ingest holdout hoặc biến upstream skill instructions thành policy được phê duyệt.

## Phase 4 — Multi-planning, calibration và skill benchmark có đối chứng (P3 cũ)

**T12 → T20 → T24**, sau Phase 3. T12 dùng model adapter và resolver hiện có; T20 quản lý subplans/synthesis/critic/integration, single-vs-multi và calibration. T24 bổ sung **campaign skill-specific trên repo không Unity**, không làm lại harness.

Exit evidence: locked scenarios/split/oracle/budget/config, A không có skill và C adapted skill; B upstream chỉ khi safe/compatible; workspace/context/memory reset, nhiều trials và toàn bộ failures; task success/false accept/reject/routing/token/tool/elapsed/owner touch metrics cùng uncertainty. Đánh giá composition và conflict giữa skills. Không dùng holdout để sửa skill rồi vẫn gọi independent holdout.

Trước khi release đủ evidence, giữ shadow/manual-label comparison hoặc scoped deterministic release đã được phê duyệt. PolicyRelease chỉ active trong task classes đã kiểm; benchmark sample repo không certify Unity. 85/100, sàn3/4, tối đa2replan vẫn provisional; version mới không reset lineage budget.

## Phase 5 — Unity recipes, adapter conformance và nghiệm thu T22 (P4 cũ)

**T21 → T08 → T25 → T22**, sau Phase 4 và các dependency T15/T11/T14/T20/T24. T21 tạo fixture generic và feasibility probe; ưu tiên official Unity CLI/pipeline trước. Nếu cần community bridge, spike một ứng viên theo cùng conformance; không chạy hai bridge cùng mutate project.

T08 sở hữu trusted compile/EditMode/PlayMode/build/evidence plumbing. T25 adapt recipes đủ scope pilot, pin identity/environment và kiểm compatibility, scene/code/UI/assets/serialization, domain reload/cancel/recovery, composition và binding qua pipeline đó. Một spike/report có thể đáp ứng nhiều AC, không xây hai runner hoặc đếm cùng implementation hai lần.

Exit T22: evidence đúng snapshot/checkset/runner; missing/zero/skipped-required/stale tests không PASS; report semantics được parse thay vì chỉ exit0; ownership/reconcile trên Editor thật đạt; scoped active release bao phủ **create-project, domain/code, UI/assets, save/replay và test changes có oracle được bảo vệ** mà Phase 6 sẽ dùng. Inventory/read-only policy không đủ. Thiếu class thì chưa mở class đó; không đổi semantic check thành N/A để giữ lịch.

## Phase 6 — Block Puzzle và pilot thực tế (P5 cũ)

**T01 → T02 → T03 → T04 → T05 → T13 → T16**, chỉ sau T22 PASS đúng scope. Dùng skills/tool capabilities đã release cho phạm vi phù hợp; game-domain recipe S11 được kiểm riêng bằng oracle rules của dự án, không tự coi đã certified từ generic fixture.

Exit: local playable, luật board/placement/clear/game-over/scoring khớp spec, save/load/replay, fail-before/pass-after bug; hai holdout×ba runs sạch với tất cả outcomes/cost/touch-time; go/no-go và giới hạn thống kê. So comparator thật nếu tuyên bố lợi ích. Không mở mobile/store/monetization/multiplayer hoặc art pipeline ngoài phạm vi.

## Timeline và estimates R2

| Phase | Base forecast có điều kiện | Task |
|---|---|---|
| Phase 1 | 24/09–09/10/2026 | T17/T06/T23 |
| Phase 2 | 12–30/10/2026 | T07/T18/T15 |
| Phase 3 | 02–27/11/2026 | T09/T10/T19/T11/T14 |
| Phase 4 | 30/11–25/12/2026 | T12/T20/T24 |
| Phase 5 | 28/12/2026–22/01/2027 | T21/T08/T25/T22 |
| Phase 6 | 25/01–19/02/2027 | T01/T02/T03/T04/T05/T13/T16 |

Team: user+AI đã xác nhận; **20giờ/tuần và review hằng ngày chưa xác nhận**, chỉ dùng để lập scenario với16giờ planned touch capacity. Phiên đầu bắt đầu24/09 là actual; các phiên sau chưa được đặt/chạy tự động. Không tính thời gian trôi qua thành agent work. Lịch tránh cuối tuần và01/01/2027; lịch nghỉ thực/lễ địa phương còn thiếu phải cập nhật trước khi dùng ngày tháng làm forecast làm việc.

Workload tham chiếu thấp/cơ sở/cao: **59.25/96/156 ngày đơn vị8h**; owner touch-time riêng: **75/140/248giờ**. Elapsed scenarios khoảng **14/21/34 tuần làm việc khả dụng**, không phải confidence interval. Base dài hơn R1 do skill layer; không giữ17tuần như thể scope mới đã được tính. Workload không chia số agents và không quy đổi thành số giờ owner. Range có normal bounded rework; không cộng blanket buffer mới.

Giữ nguyên R1, thêm đúng **T23/T24/T25**, không tạo lại22tasks. New packages tăng9/16/26workload-days và10/20/36owner-hours. Existing task estimates giữ làm điểm khởi đầu với reuse boundaries rõ trong plan; nếu integration vượt assumptions, re-estimate task sở hữu sau Phase1/spike, không gọi wiring miễn phí.

## Dependency, handoff và replan

Thứ tự phase là thứ tự nghiệm thu. T23 phụ thuộc T06; T07 cần T06/T23; T24 cần T20/T23/T19/T18; T21 cần T20/T15/T24; T25 cần T21/T08/T24; T22 thêm T24/T25 vào joins hiện có. T01 vẫn chỉ phụ thuộc T22. Dependency cụ thể/cửa sổ25tasks ở `schedule-r2.json`.

Có thể chuẩn bị corpus/spec/recipe text độc lập; formal benchmark/Unity integration chờ prerequisite. Một Unity owner/write queue, contracts có một integrator. FAIL → defect/replan phần liên quan và gate lại đúng versions; UNKNOWN/BLOCKED/grader error/hết budget không được coi PASS. Routine authorization đã cấp được giữ, không bắt user duyệt từng lệnh để bù thiếu enforcement.

Sau mỗi phiên ghi artifact/check versions, actual touch/tool/agent time, queue/cost/retries/blockers; unknown ghi unknown. Re-estimate sau Phase1, runtime spike, T11, T20/T24 và T21. Chạm high mà chưa đủ AC, hai task lệch base trên50%, review queue hoặc capacity quá tải kéo dài, scope/tool/model/release thay đổi, trust boundary không enforce hoặc T22 fail đều là trigger replan. Ngày tháng dời theo evidence và availability; không sửa lịch sử R1/R2 để che variance.

## Trạng thái và nguồn

R2 đã được áp dụng. Foundation T17/T06/T23, local runtime T07/T18/T15 và local Memory T09/T10 đã Done / Pass trong phạm vi riêng được báo cáo. T19 và T14 Doing / Not evaluated; T11 Doing / Replan; 14 task còn lại chưa mở. Active release chỉ `runtime.fixture`; chưa gate toàn Phase 3 hoặc T22 PASS, Phase 4/game chưa mở. Không suy phần trăm tiến độ tổng thể từ số task hoặc tests. Remote `main` còn Phase 1; Phase 2/3 đang local chưa push, commit/cloud links cuối sẽ được cập nhật sau xác minh.

Nguồn chuẩn: contracts/architecture v0.4; plan/schedule R1 ngày24/09; execution-skills-proposal và bốn source reviews đã pin ngày24/09. Đi kèm: `plan-r2.md` (scope, estimates, Phase1 AC matrix), `schedule-r2.json` (25tasks/dependencies/calendar/capacity). R1 nằm ở thư mục lịch sử riêng và không bị ghi đè.
