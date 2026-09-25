# AI Agent Architect — Kế hoạch triển khai R2

## Actual Phase 2 — 25/09/2026

T07/T18/T15 đã nghiệm thu phạm vi local mechanical runtime: 209/209 tests sạch, independent review và framework spikes. [Báo cáo Phase 2](phase-2-report.md) chứa AC/evidence/giới hạn; [remaining work](remaining-work.md) bàn giao Phase 3. Giữ estimates/forecast R2 bên dưới làm baseline. Model/semantic/Unity release chưa đạt; không thay T22 bằng kết quả fixture.


## Kết quả thực hiện Phase 1 — 24/09/2026

**T17/T06/T23 đã hoàn tất và PASS nghiệm thu foundation**: 26 executable contracts 0.5.0, catalog/resolver và CLI offline; 105 automated tests pass từ clean checkout, independent review đóng bốn findings; 12 repro gốc và 3 follow-up cases bị chặn. Báo cáo đầy đủ: `phase-1-report.md`; source/test evidence ở snapshot Drive. Không có active runtime PolicyRelease, Unity benchmark hoặc T22 PASS.

R2 forecast bên dưới được giữ làm baseline; actual Phase 1 bắt đầu/kết thúc 24/09/2026. Không cần đợi ngày forecast để mở Phase 2 khi có phiên làm việc và dependency đã đạt. Không extrapolate tốc độ foundation sang runtime/Unity. Phần nói “tại cut lập kế hoạch” mô tả lịch sử; trạng thái hiện hành lấy đoạn này và schedule JSON.

Ngày lập: 24/09/2026. Người dùng đã yêu cầu điều chỉnh kế hoạch rồi bắt đầu Phase 1. Phiên implementation đầu tiên bắt đầu ngày 24/09/2026; actual và evidence cập nhật ở phần kết quả phía trên. Baseline R1 được giữ nguyên để đối chiếu. Không tạo tỷ lệ hoàn thành hoặc benchmark PASS từ việc bắt đầu viết code.

## Phạm vi và thay đổi so với R1

Mục tiêu vẫn là xây hạ tầng AI Agent Architect trước, sau đó dùng nền tảng đã được nghiệm thu để xây Block Puzzle local. Đánh số mới **Phase 1…6 tương ứng P0…P5** của R1; không thay ID hoặc tạo bản sao 22 task gốc. Chỉ thêm ba task:

- **T23 / Phase 1:** catalog local, compatibility, digest của skill package và resolver cơ bản; không chạy Unity hoặc làm đầy đủ policy/runtime.
- **T24 / Phase 4:** controlled skill benchmark trên sample repo không Unity, dùng evaluation harness và calibration hiện có.
- **T25 / Phase 5:** recipes Unity theo scope pilot và conformance của đường thao tác đã chọn, tối đa một bridge nếu official CLI chưa đủ; dùng trusted runner T08.

Skill là hướng dẫn thao tác có phiên bản. Nó không có quyền bỏ gate, tự phát hành evidence/PASS hoặc mở rộng capability. Runtime, Memory/Context, planner, ledger, verification và PolicyRelease tiếp tục dùng thiết kế v0.4. **Không gameplay trước T22.**

## Giả định nguồn lực và ý nghĩa các con số

Team đã xác nhận là **bạn + AI agents**. 20 giờ/tuần của bạn và slot review ngắn hằng ngày vẫn là **giả định chưa xác nhận**. Dùng tối đa 16 giờ/tuần cho touch-time đã lên lịch, giữ phần còn lại cho việc bất ngờ. Các phiên AI/tool phải được thực sự khởi chạy; phiên đang làm hôm nay không có nghĩa đã có dịch vụ agent chạy liên tục qua các tuần.

Workload tham chiếu dùng đơn vị 8 giờ để so quy mô kỹ thuật; không phải số giờ bạn phải tự code hoặc số giờ AI chạy. Owner touch-hours đo riêng việc quyết định, review, nhãn semantic, kiểm bằng chứng và playtest. Calendar là cửa sổ các vòng code–test–review–sửa có phụ thuộc; không chia workload cho số agents hay giả định AI nhanh hơn một hệ số cố định.

Low/base/high là các kịch bản phán đoán trước khi đo, **không phải P50/P90, confidence interval hoặc cam kết**. Range đã tính rework thông thường có giới hạn; không cộng thêm một blanket buffer phần trăm. Calendar chưa bao phủ thời gian nghỉ cá nhân, lịch lễ địa phương chưa xác nhận, outage dài, thiếu licensing hoặc đổi target. Đặc biệt cần thay lịch khả dụng thực trước khi dùng forecast đầu năm 2027 làm lịch làm việc.

Phạm vi cơ sở: một host/OS, một provider thật khi có budget, một Unity version và desktop target; modular monolith/CLI local; mock/local fixtures trước. Chưa mặc định chọn LangGraph/Promptfoo hoặc mua API. Official Unity CLI được probe trước; nếu thiếu, chọn một bridge sau cùng bộ conformance. Không dựng nhiều bridge hay catalog mở rộng trong range này.

## Timeline có điều kiện

Ngày kết thúc dưới đây chỉ giữ nếu các dependency đạt AC và có phiên làm việc/review như giả định. Phase tiếp theo không mở chỉ vì ngày trên lịch đã đến.

| Phase mới (cũ) | Base window | Elapsed thấp/cơ sở/cao (ngày làm việc) | Tasks | Bàn giao |
|---|---|---:|---|---|
| Phase 1 (P0) | 24/09/2026–09/10/2026 | 7 / 12 / 20 | T17, T06, T23 | Foundation: architecture, contracts, skill catalog |
| Phase 2 (P1) | 12/10/2026–30/10/2026 | 10 / 15 / 25 | T07, T18, T15 | Runtime, evaluation harness và recovery |
| Phase 3 (P2) | 02/11/2026–27/11/2026 | 15 / 20 / 30 | T09, T10, T19, T11, T14 | Memory, Context và baseline |
| Phase 4 (P3) | 30/11/2026–25/12/2026 | 15 / 20 / 35 | T12, T20, T24 | Multi-planning, calibration và controlled skill benchmark |
| Phase 5 (P4) | 28/12/2026–22/01/2027 | 12 / 19 / 30 | T21, T08, T25, T22 | Unity fixture, verification, recipes/conformance và T22 |
| Phase 6 (P5) | 25/01/2027–19/02/2027 | 10 / 20 / 30 | T01, T02, T03, T04, T05, T13, T16 | Block Puzzle pilot sau T22 |

Tổng cửa sổ theo ba kịch bản là **69 / 106 / 170 ngày làm việc khả dụng**, xấp xỉ **14 / 21 / 34 tuần làm việc**. Base tính từ phiên đầu 24/09/2026, forecast T22 đến 22/01/2027 và pilot đến 19/02/2027. Đây là lịch minh họa khi có nhịp làm việc đều; thiếu phiên thì dời mốc, không coi thời gian trôi qua là công việc đã chạy. Chỉ lịch base có ngày cụ thể; không gán ngày chính xác cho low/high chưa có lịch khả dụng.

Base dài hơn R1 khoảng bốn tuần do catalog/resolver, campaign skill và Unity recipe/conformance cùng cửa sổ tích hợp/nghiệm thu. Không đơn giản cộng effort-days vào calendar. Phase 4 giữ thời gian phân tích calibration/rework; Phase 5 có thời gian probe và recovery trên Editor thật. Không tự loại các vòng kiểm tra để giữ mốc.

## Work package và ranh giới chống tính trùng

| Chủ sở hữu task | Công việc đã có / được làm tại đây | Không tính thêm lần hai |
|---|---|---|
| T17/T06 | Module seams; canonical schemas, hash/ref/cross-record validation; SkillDescriptor/SkillBinding và input ProjectProfile | Không dựng runtime dispatcher hoặc Unity adapter trong foundation |
| T23 | Catalog nhỏ, source/license/deprecation metadata, package digest, compatibility filtering, deterministic resolver và fixtures riêng | Không làm context hydration T19, ledger/dispatch T07 hay model router T12 |
| T07/T15 | Activation và revalidation qua runtime hiện có; quyền scripts, stale/revoked bindings, fake capabilities/recovery | Không tạo skill runtime, operation ledger hoặc gate thứ hai |
| T18/T20 | Shared evaluation harness; planning calibration, single/multi và release mechanism | Không sao chép harness riêng cho skills |
| T09/T10/T19/T11/T14 | Skill provenance/invalidation, progressive loading, manifest/hydrate và context-cost checks | T23 chỉ resolve metadata; không thực hiện lại Memory/Context |
| T24 | Skill-specific scenarios/corpus, A/C comparator, resets/repeated trials, metrics/decision/report trên repo không Unity | Dùng harness T18 và policy machinery T20; không certify Unity chỉ từ sample repo |
| T21/T08 | Generic Unity fixture, feasibility probe và trusted compile/test/build/evidence plumbing | Không viết runner thứ hai cho T25 |
| T25 | Adapt recipes đủ scope; compatibility, identity, mutation/reload/cancel, composition và recipe binding qua pipeline thật | Một feasibility spike chung T21/T08; có thể cùng report phục vụ nhiều AC nhưng không đếm cùng việc hai lần |
| T22 | Nghiệm thu tích hợp + active release bao phủ task classes game sẽ dùng | Không coi catalog/skill preview/test job success là nền tảng PASS |

T23/T24/T25 là estimate phần tăng thêm: **9 / 16 / 26 workload-days**, **10 / 20 / 36 giờ bạn**. Giữ point estimates 22 task R1 trong R2; các task cũ tái sử dụng interfaces/cơ chế đã có trong scope R1. Đây là giả định cần kiểm sau Phase 1, không khẳng định skill integration miễn phí. Nếu activation/hydration/check bindings cần thay subsystem ngoài seam đã định, cập nhật remaining estimate task sở hữu trước khi tiếp tục; không giấu effort trong task mới hoặc nhận đủ AC với stub.

| Phase | Workload thấp/cơ sở/cao | Giờ bạn thấp/cơ sở/cao |
|---|---:|---:|
| Phase 1 | 6 / 10 / 15 | 6 / 12 / 22 |
| Phase 2 | 11 / 16 / 26 | 10 / 20 / 38 |
| Phase 3 | 12.5 / 20 / 31 | 18 / 29 / 46 |
| Phase 4 | 10.5 / 16.5 / 26 | 16 / 28 / 46 |
| Phase 5 | 11 / 18 / 31 | 13 / 25 / 48 |
| Phase 6 | 8.25 / 15.5 / 27 | 12 / 26 / 48 |

Tổng R2: **59.25 / 96 / 156 ngày tham chiếu**, **75 / 140 / 248 giờ bạn**. Nền tảng Phase 1–5 ở base: **80.5 ngày tham chiếu / 114 giờ bạn**; game Phase 6: **15.5 / 26**. Không dùng tổng 140 giờ để suy ra xong trong 7 tuần. Cách dàn đều touch-time trong từng task chỉ cho một kiểm tra tải sơ bộ, đỉnh base khoảng **9.5 giờ/tuần**; review/label thực tế có thể dồn vào một buổi và tạo queue.

## Phase 1: bàn giao và acceptance matrix

Phase 1 là foundation có thể chạy offline. Bạn và AI coding tools hiện có xây hạ tầng bằng **bootstrap development**, không yêu cầu PolicyRelease của hệ thống chưa tồn tại để bắt đầu code. Một local test report chứng minh fixture đã chạy; chưa đồng nghĩa trusted runtime, Unity conformance, skill certification hoặc gate chuẩn production đã hoạt động.

Các AC dưới đây định nghĩa **đích đóng Phase 1**. Khi lần bàn giao hiện tại mới có scaffold hoặc một phần validators, ghi rõ partial và giữ các AC chưa đủ bằng chứng mở. Không tự nâng “đã có file/schema” thành “đã enforce được quyền ở OS”.

| AC | Task | Bàn giao / điều cần kiểm | Bằng chứng đóng AC | Kết quả nghiệm thu 24/09 |
|---|---|---|---|---|
| F1-01 | T17 | Repo hạ tầng độc lập game; module map cho contracts, artifacts, runtime port, eval port, skills và CLI | File tree, README chạy từ clean checkout, smoke command và output | Đạt foundation — report 24/09 |
| F1-02 | T17 | Actor/store ownership rõ: executor, trusted runner, Gate Controller, policy owner, Memory promoter | ADR/interface review; ghi rõ nơi enforce thật nằm Phase 2/5 | Đạt foundation — report 24/09 |
| F1-03 | T17 | Interfaces và fake/offline adapters; không tự gọi model/network/Unity khi smoke | Smoke trace/review entrypoints; no external dependency needed for baseline fixtures | Đạt foundation — report 24/09 |
| F1-04 | T17 | Scope gap register và kế hoạch test ánh xạ contract → task; không gameplay, không parallel Unity writer | Reviewed mapping + outstanding list | Đạt foundation — report 24/09 |
| F1-05 | T06 | Schemas versioned cho các contracts canonical v0.4 và SkillDescriptor/SkillBinding; camelCase, aliases cũ không trở thành schema thứ hai | Schema inventory + valid examples; version/required/enum negative fixtures | Đạt foundation — report 24/09 |
| F1-06 | T06 | method deterministic/model/human đúng nhánh; outcome blocked/unknown/not_applicable có điều kiện bắt buộc tương ứng | Discriminated union và fixtures thiếu validator/rubric/reviewer, blocker/reason bị reject | Đạt foundation — report 24/09 |
| F1-07 | T06 | Canonical content hashing ổn định; loại trường self-digest thích hợp; nội dung đổi dù giữ ID/version phải đổi digest | Vector/canonicalization tests, tampered constraint/manifest/plan fixtures | Đạt foundation — report 24/09 |
| F1-08 | T06 | DAG/ref/binding checks: Handoff → canonical GateReport/ContextManifest; plan/task/checkset/subject versions khớp | Valid chain và dangling ref/cycle/wrong hash/wrong subject fixtures | Đạt foundation — report 24/09 |
| F1-09 | T06 | CheckDefinition/Result, PolicyRelease và RunnerAttestation bindings được kiểm ở mức dữ liệu; UNKNOWN không đổi thành PASS | Negative fixtures + explicit statement rằng issuer/process trust thực được enforce sau | Đạt foundation — report 24/09 |
| F1-10 | T06 | Lifecycle/checkpoint/operation/claim/source enums và invariants biểu diễn được; incompatible schema version bị reject rõ | Fixtures operation same ID khác args, revoked/stale records và incompatible versions | Đạt foundation — report 24/09 |
| F1-11 | T06 | SkillDescriptor/Binding chứa provenance, package digest, task/plan/environment/capability/context refs đúng schema | Roundtrip và missing/mismatched binding fixtures; resolver dùng cùng types | Đạt foundation — report 24/09 |
| F1-12 | T23 | Catalog local nhỏ có source pin/path/license/version/lifecycle; fixtures nội bộ tách rõ upstream candidate chưa reviewed/certified | Inventory + local sample package; không load/copy toàn bộ studio template | Đạt foundation — report 24/09 |
| F1-13 | T23 | Package digest bao gồm body và các references/scripts được khai báo; resource manifest có path/content digest | Body/reference/script tamper đổi digest; thiếu file, path ngoài package hoặc duplicate ambiguous path bị reject | Đạt foundation — report 24/09 |
| F1-14 | T23 | Compatibility filter task class/profile/capability rõ ràng; thông tin cần thiết unknown, deprecated/revoked hoặc tool thiếu không tự thành eligible | Positive/negative matrix, reason codes; target profile unknown không giả tool đã cài | Đạt foundation — report 24/09 |
| F1-15 | T23 | Resolver deterministic, thứ tự ổn định; chỉ trả candidates/selection trong scope; không tự cấp capability hoặc đổi policy | Same input same output; wrong task class/permission/changed digest bị từ chối | Đạt foundation — report 24/09 |
| F1-16 | T23 | CLI/offline slice đọc fixture → validate → resolve → binding/report minh bạch, không execute scripts hoặc Unity | Reproduction command/output + failure example; chưa có dispatch/release certification | Đạt foundation — report 24/09 |
| F1-17 | T17/T06/T23 | Independent review và integration giữa schema/catalog/CLI; không chỉ mỗi module test riêng | Findings được xử lý, automated check report, AC→evidence mapping, remaining gaps | Đạt foundation — report 24/09 |

Schema inventory lấy tài liệu 04 làm chuẩn: TaskSpec, ContextBundle, PlanPackage/HandoffPacket/GateReport, CheckDefinition/CheckResult, PolicyRelease, PlanningModeDecision, ContextManifest, MemoryDelta/Claim/SourceRecord, OperationRecord/OwnershipRecord/Checkpoint/RunnerAttestation và các nested/support contracts như PlanStep, ToolCall/Result, Evidence, ContextBudget, SubPlan. Field/invariants chưa rõ được ghi ADR trước khi coi executable schema là canonical; không tự đổi các semantics trust đã chốt.

Trình tự forecast: T17 24–25/09 → T06 28/09–02/10 → T23 05–09/10. Có thể chuẩn bị catalog inventory hoặc tests độc lập sớm hơn, nhưng integration/closing vẫn chờ contracts ổn định. Phiên đầu chỉ cần bàn giao một slice review được và actuals; không giả định toàn bộ Phase 1 hoàn tất trong một lượt chat. Root cập nhật trạng thái và evidence sau implementation, không lấy các ô kế hoạch làm kết quả test.

## Phase gates và tiêu chí dừng/đi tiếp

- **Phase 2:** state machine/checkpoints, durable operation intent/outcome, owner/OS lock và process boundary; fake/missing/stale PASS, inactive policy, digest mismatch và revoke không dispatch. Kill-after-effect và lost-response không duplicate; không takeover khi owner cũ còn sống. Skill activation dùng cùng ledger/budget. Deterministic/fake fixtures kiểm cơ chế, chưa chứng minh semantic judge đủ chính xác.
- **Phase 3:** source freshness/claim trust/revoke invalidate đúng dependency; ContextManifest giữ actual loaded body/reference và constraint content/revision/scope; compaction phải hydrate bản pin. T11 baseline tách retrieval/reader và vài budget; 30 starter cases gồm 10 holdout không đủ production reliability.
- **Phase 4:** multi-planner/synthesizer/critic có budget/lineage và integration gate. So single+critic với multi+synthesizer+critic cùng budget. T24 dùng A không có skill và C bản đã adapt; B upstream chỉ khi safe/compatible. Khóa oracle/split/sample size/cost trước campaign, reset workspace/context/memory, lưu mọi trials. Metrics gồm task success, false acceptance/rejection, routing, token/tool/elapsed và owner review. Không suy benchmark sample repo thành Unity certification; shadow/manual-label comparison trước release đủ scope.
- **Phase 5/T22:** probe official CLI trước và chốt một đường thao tác; pin tool/runtime/environment, xác minh compilation/domain reload/cancel/reconcile, generic code/scene/UI/assets/serialization/test/build. Trusted runner phải parse đủ report/test IDs/count/snapshot, không nhận zero-test/missing/stale report hoặc exit0 làm PASS. T25 dùng một candidate bridge nếu cần, không tích hợp cả Coplay và Ivan. T22 cần active PolicyRelease bao phủ đúng create-project/code/UI/assets/save/test task classes Phase 6 dùng; inventory-only release không đủ.
- **Phase 6:** xây gameplay theo spec độc lập của dự án; không copy match-3/gravity/undo từ skill puzzle. S11 được kiểm bằng rules oracle khi game bắt đầu, không được coi đã certified trước T22. Có regression fail-before/pass-after, 2 holdout × 3 runs theo manifest, giữ mọi failure, comparator nếu tuyên bố lợi ích. Playfeel có human CheckResult; screenshot không chứng minh game vui hoặc đúng luật.

Planning PASS đo readiness, execution PASS đo artifact đã thực thi. Score 85/100, sàn3/4 và tối đa2 vòng replan vẫn provisional; score không vượt hard fail. Không reset lineage budget bằng version mới, không cherry-pick trial. Chỉ trusted PASS đúng current refs/hash và active scoped PolicyRelease mới cho runtime auto-dispatch. Policy/gate không trở thành bước hỏi bạn duyệt mọi thao tác routine đã được cấp quyền.

## Task forecast R2

Cửa sổ dưới đây là lúc tích hợp/nghiệm thu chính. Preparation độc lập có thể sớm hơn; chưa trừ sẵn lợi ích parallelism chưa đo. Task T17 bắt đầu thực tế24/09; ngày của các task còn lại là forecast. Khi root báo đã bắt đầu/đạt AC, cập nhật actuals riêng và giữ forecast baseline.

| Task | Phase | Forecast base | Workload thấp/cơ sở/cao | Giờ bạn thấp/cơ sở/cao | Phụ thuộc nghiệm thu |
|---|---|---|---:|---:|---|
| [T17 — Thiết kế module và khởi tạo repo hạ tầng](https://app.notion.com/p/3e4a6c16b3dc8193b203c2303684a5a6) | Phase 1 | 24/09/2026–25/09/2026 | 1 / 2 / 3 | 2 / 4 / 6 | Không |
| [T06 — Định nghĩa contracts và schema validators](https://app.notion.com/p/3e3a6c16b3dc812cba19c08daf7c7fd2) | Phase 1 | 28/09/2026–02/10/2026 | 3 / 4 / 6 | 2 / 4 / 8 | T17 |
| T23 — Skill catalog, compatibility, package digest và basic resolver scaffold | Phase 1 | 05/10/2026–09/10/2026 | 2 / 4 / 6 | 2 / 4 / 8 | T06 |
| [T07 — Xây runner và state machine](https://app.notion.com/p/3e3a6c16b3dc810d8efcee0b49de04fe) | Phase 2 | 12/10/2026–16/10/2026 | 5 / 7 / 11 | 4 / 8 / 16 | T06, T23 |
| [T18 — Xây evaluation harness và Plan Quality Gate](https://app.notion.com/p/3e4a6c16b3dc81deb9f6ecc1b6f30e46) | Phase 2 | 19/10/2026–23/10/2026 | 3 / 5 / 8 | 3 / 6 / 10 | T07 |
| [T15 — Kiểm thử lỗi, giới hạn quyền và phục hồi](https://app.notion.com/p/3e3a6c16b3dc811c8d9acbadd75659f1) | Phase 2 | 26/10/2026–30/10/2026 | 3 / 4 / 7 | 3 / 6 / 12 | T18 |
| [T09 — Xây Memory store và wiki compiler](https://app.notion.com/p/3e3a6c16b3dc81ae9980c542e13e36a3) | Phase 3 | 02/11/2026–04/11/2026 | 2 / 3.5 / 5 | 3 / 5 / 8 | T07 |
| [T10 — Xây retrieval và impact analysis](https://app.notion.com/p/3e3a6c16b3dc8157ab22e6c7dd20f42f) | Phase 3 | 05/11/2026–11/11/2026 | 2.5 / 4 / 6.5 | 3 / 5 / 8 | T09 |
| [T19 — Xây quản lý context cho từng agent/window](https://app.notion.com/p/3e4a6c16b3dc8152b78bfb29b82d630a) | Phase 3 | 12/11/2026–18/11/2026 | 2.5 / 4 / 6.5 | 3 / 5 / 8 | T10 |
| [T11 — Tạo eval dataset và đo baseline](https://app.notion.com/p/3e3a6c16b3dc813f9b86f8231983849b) | Phase 3 | 19/11/2026–24/11/2026 | 3 / 4.5 / 7 | 6 / 9 / 14 | T10, T19 |
| [T14 — Cập nhật memory từ kết quả đã kiểm chứng](https://app.notion.com/p/3e3a6c16b3dc815a8377cc035b796de2) | Phase 3 | 25/11/2026–27/11/2026 | 2.5 / 4 / 6 | 3 / 5 / 8 | T09, T18, T10, T19 |
| [T12 — Xây planner, router và model adapter](https://app.notion.com/p/3e3a6c16b3dc8194b4dbfd3e3a08b222) | Phase 4 | 30/11/2026–04/12/2026 | 3 / 4.5 / 7 | 4 / 6 / 10 | T11, T18, T23 |
| [T20 — Xây planning phân cấp nhiều agent và integration gate](https://app.notion.com/p/3e4a6c16b3dc813195e7cccf18bb1552) | Phase 4 | 07/12/2026–18/12/2026 | 4.5 / 7 / 11 | 8 / 14 / 22 | T12 |
| T24 — Controlled skill benchmark trên sample repo không Unity | Phase 4 | 21/12/2026–25/12/2026 | 3 / 5 / 8 | 4 / 8 / 14 | T20, T23, T19, T18 |
| [T21 — Tạo Unity integration fixture](https://app.notion.com/p/3e4a6c16b3dc812e9d1be5995a06d851) | Phase 5 | 28/12/2026–29/12/2026 | 1 / 2 / 4 | 2 / 4 / 8 | T20, T15, T24 |
| [T08 — Nối Unity verification và evidence](https://app.notion.com/p/3e3a6c16b3dc815a8ce2f119101cf6a1) | Phase 5 | 30/12/2026–07/01/2027 | 4 / 6 / 10 | 4 / 8 / 16 | T21 |
| T25 — Unity recipes và một bridge conformance | Phase 5 | 08/01/2027–15/01/2027 | 4 / 7 / 12 | 4 / 8 / 14 | T21, T08, T24 |
| [T22 — Nghiệm thu nền tảng trước khi bắt đầu game](https://app.notion.com/p/3e4a6c16b3dc81e8ad39da00bedc6451) | Phase 5 | 18/01/2027–22/01/2027 | 2 / 3 / 5 | 3 / 5 / 10 | T08, T11, T14, T20, T24, T25 |
| [T01 — Khởi tạo repo và Unity project](https://app.notion.com/p/3e3a6c16b3dc81d29c20d8fa917cac5b) | Phase 6 | 25/01/2027–25/01/2027 | 0.5 / 1 / 2 | 1 / 2 / 4 | T22 |
| [T02 — Cài luật board, placement và scoring](https://app.notion.com/p/3e3a6c16b3dc8193b34dd53a1c18c8d1) | Phase 6 | 26/01/2027–28/01/2027 | 1.5 / 2.5 / 4 | 2 / 4 / 6 | T01 |
| [T03 — Kiểm thử game over và sinh mảnh](https://app.notion.com/p/3e3a6c16b3dc81b3b36dece9276a42ce) | Phase 6 | 29/01/2027–29/01/2027 | 0.75 / 1 / 2 | 1 / 2 / 4 | T02 |
| [T04 — Làm UI chơi được](https://app.notion.com/p/3e3a6c16b3dc8137a15dc9bb0a448ff7) | Phase 6 | 01/02/2027–04/02/2027 | 1.5 / 3 / 5 | 2 / 4 / 8 | T02, T03 |
| [T05 — Thêm save/load và replay baseline](https://app.notion.com/p/3e3a6c16b3dc815fb23be1f80fd70461) | Phase 6 | 05/02/2027–08/02/2027 | 1 / 2 / 3 | 1 / 3 / 6 | T04 |
| [T13 — Chạy task sửa bug game-over từ đầu tới cuối](https://app.notion.com/p/3e3a6c16b3dc81179472d57a4d7d22b9) | Phase 6 | 09/02/2027–10/02/2027 | 1 / 2 / 4 | 1 / 3 / 6 | T05, T20 |
| [T16 — Nghiệm thu pilot và quyết định mở rộng](https://app.notion.com/p/3e3a6c16b3dc81fb9d20e2dbd72071e5) | Phase 6 | 11/02/2027–19/02/2027 | 2 / 4 / 7 | 4 / 8 / 14 | T13 |

## Critical path, capacity và replan

Đường nghiệm thu: **T17 → T06 → T23 → T07 → T18 → T15 → Memory/Context/T11 → T12 → T20 → T24 → T21 → T08 → T25 → T22 → game**. Dependency kỹ thuật chi tiết ở schedule JSON; thứ tự phase là một gate tổ chức bổ sung. T14 là nhánh join trước T22. T11/T24 có thể chuẩn bị corpus/protocol sớm, nhưng formal runs chỉ sau dependency và lock oracle/budget. T25 có thể review recipe text trước, nhưng conformance trên Editor chờ T08 và một writer.

Bạn chốt mục tiêu/environment/budget/risk targets khi cần và review semantic khó. AI coordinator/planners chia việc; implementer và critic không tự xác nhận cùng artifact của mình. Giữ WIP thấp, một integrator cho contracts và một Unity owner. Nếu bạn chỉ có10giờ/tuần, planned touch capacity còn khoảng8giờ và những tuần label/review cần giãn. Nếu có40giờ/tuần, không mặc định calendar giảm một nửa vì dependency và các vòng chạy–review vẫn tồn tại.

Sau mỗi phiên ghi actual owner touch, agent/tool wall time, queue wait, cost, attempts, artifact/check versions và blockers. Ghi unknown khi chưa đo, không ghi0. Re-estimate sau Phase1, runtime/recovery spike, T11, T20/T24 và tool feasibility T21. Có thể tiếp tục độc lập trong scope đã đủ điều kiện; nhánh phụ thuộc chờ PASS.

Replan khi: một task chạm high estimate chưa đủ AC; hai task liên tiếp vượt base trên50%; review queue qua slot tiếp theo; touch load vượt capacity hai tuần; thay target/tool/environment/model/prompt/checkset; revoke/stale evidence; không enforce được trust boundary hoặc T22 không đạt. Các tỷ lệ là trigger quản trị thử, không benchmark đã hiệu chuẩn. Giữ R1/R2 lịch sử và actuals riêng; không sửa baseline để trông như đúng hạn.

## Nguồn và trạng thái

Nguồn nội bộ: plan R1 + schedule R1 + CURRENT_ROADMAP ngày24/09; contracts v0.4; execution-skills-proposal ngày24/09 và source reviews đã pin. R2 không mở thêm nghiên cứu web hoặc chọn vendor mới. Bản kế hoạch được review estimate độc lập cho ba package tăng thêm; chưa có campaign nào chứng minh năng suất hoặc score cho plan này.

Tại cut lập R2: phiên implementation đã bắt đầu; T17 In progress theo hoạt động khởi tạo. T06/T23 sẽ được root cập nhật theo công việc thật; task khác vẫn planned/Todo. **Mọi gate trong schedule vẫn Not evaluated.** Không tự tuyên bố “implementation0%” sau khi đã bắt đầu, cũng không suy ra phần trăm hoàn thành từ số file được tạo. Các kết quả triển khai sau cut phải nằm trong report/evidence riêng.
