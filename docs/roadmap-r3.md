## Accepted offline durability repair — application evidence 20261008

[Exact accepted source and evidence](portable-durability-20261008.md): canonical revalidation, persisted/hydrated plan artifacts, verified handoff/resume and corrupt retry handling. Original application passed 190/190 regressions and 15/15 independent R1 probes. Combined Git-source preparation is a separate check; existing archives remain unchanged. No F11/F14 candidate or native/whole M1/T22 acceptance is included.

## Portable Brain preview and Queens pause — 06/10/2026

Owner paused Queens tests and requested a portable Brain for a fresh Unity project/new session. The original `0.2.0-preview.1` archive packaged existing Context/Memory/decision provenance, planning/evaluation/runtime foundations plus project-local bootstrap/context/plan/handoff and Editor-only UPM observation adapter. Historical archive evidence: 104/104 targeted checks + 104/104 actual-extracted checks, 10/10 mechanical recovery checks from each, and standalone 6000.0.84f1 SDK compilation PASS. Actual ZIP/TGZ/source comparison, fresh bootstrap, distinct-process Knowledge resume and corruption rejection verified; these are offline scopes.

Unity import/Play and live Assistant Unity MCP binding remain pending (tools unavailable in delegated session); no CLI fallback/model/R11 activation. R7 scoped FIRST/COLD PASS retained; full M1a/M1b/M1c/M1d/F1/F2/F9/T22 are not passed or waived. Queens native domain 21 PASS/UI render existed before pause; input/win/reset remains unverified and is not resumed. Existing dirty work and R7/R11 evidence preserved. Git is the primary source; portable-only commit excludes the unrelated lock proposal and binary output. [Historical evidence, Git setup/prompt and readiness](portable-distribution-20261006.md).

# Roadmap R3 — 30/09/2026

[Brain planning policy](brain-planning-policy.md) và [decision log](decision-log.md) là nguồn quyết định authoritative. Roadmap này áp dụng các quyết định đó. Phase 3 đã được owner **accepted, conditional closure**; đây không phải production PASS. Lượt hiện tại chỉ cập nhật documentation/contracts/schema tests, không có model run.

## Trình tự hiện hành

| Mốc | Cổng và đầu ra |
|---|---|
| Push/CI — 30/09–01/10 | Đẩy phạm vi đã duyệt và xác nhận CI trước khi đi tiếp. |
| Unity baseline/infrastructure — 01–09/10 | T21 Unity adapter + empty project, rồi T08 compile/test evidence. T21/T08 không còn chờ T20/T24. |
| Fix + comparison round — sau S1 | Khóa existing 10 microtasks và chạy tuần tự A → B → C khi S1 Pass, protocol freeze và forecast/conditional approval đủ điều kiện. |
| Quyết định — khi paired results sẵn sàng | Owner quyết định retain hoặc simplify Brain ngay khi kết quả A/B/C đã hoàn chỉnh; không chờ một ngày lịch cố định. |
| Brain orchestration — 02–13/11, nếu retain | Chỉ mở rộng orchestration sau quyết định giữ, theo policy interface-first. |
| Pilot — sau T22, TBD | T22 platform gate Pass rồi mới mở Block Puzzle pilot và Game/Epic brief. |

S1 đã Pass 6/6 controlled runs trong 71,49 giây Unity runtime: cold/warm/recovery/batch fallback đều 29/29; test fault 3 failed/exit 8; compile fault không XML/exit 6+CS error. Evidence là [results.json](evidence/unity-s1-20260930/results.json); source riêng tư dưới `.local`, không merge. Nó không phải model Unity run.

Chỉ mốc kế tiếp được viết chi tiết; các mốc sau chỉ outline. Mỗi implementation task là một agent session, có automated checks, diff và owner review ≤30 phút. Nếu scope hoặc ambiguity chưa rõ, chọn level cao hơn rồi phân rã/Ready lại.

## Mốc kế tiếp: Unity CLI spike và Ready

S1 là spike hạ tầng, không phải planning engine: timebox 90 phút, cap 60.000 token hỗ trợ AI; xác nhận lại Unity CLI đã pin chạy compile/EditMode test trên empty fixture, tạo XML với test IDs/count và reject một compile/test failure cố ý. S1 đã Pass với evidence nêu trên. S2 là module plan/interface-first và Ready records cho chuỗi `Request → Plan → Critic → Execution → Verification → Evidence → Memory`, ở [S2 protocol](s2-brain-comparison-protocol.md) và [records](evidence/planning-r3/s2-module-ready-records.json). S2 vẫn `not_ready` cho execution: protocol lock, reserve, native C credit monitoring và hidden-oracle isolation chưa có evidence. Schema tests chỉ kiểm record shape, không thực thi admission/engine.

## Comparison round: invalid R1, blocked

R1 is invalid and cannot support a product decision: all runtime MCP calls lacked Unity broker receipts and verification fell back to an external host. It reached A10/B reuse10/C9 before the infrastructure audit; it should have stopped after two A infrastructure failures. The generic raw `quota-stop` label is not the actual reason. Direct app-server MCP preflight passed with 0 model calls and the local fix checks passed 19 target TypeScript plus 6 Python tests, but the causal model-path error is unrecoverable from old logs. S2 Ready remains blocked; conditional model approval persists, no rerun has been performed, and no retain/simplify/batch-2 decision follows. See [handoff](s2-abc-r1-invalid-run.md).

Không dùng 24 task bank để làm first round. Cùng 10 microtasks hiện có, cùng Unity CLI/version, protected tests, executor/tool access, revision đầu vào, token cap và workspace isolation cho ba arm:

| Arm | Quy trình |
|---|---|
| A — Brain | Mỗi một trong 10 microtask chạy đúng một lần: planner Sol → critic Sol → executor Terra. |
| B — Brain repair | Tái sử dụng đúng kết quả A; chỉ task có lỗi **model** ở A mới được tối đa hai vòng repair Terra, mỗi vòng lấy compile/test output của vòng trước. Không chạy lại A. |
| C — ordinary Codex | Chỉ bắt đầu sau B; Codex thường có cùng Terra, Unity skills và quyền CLI như executor, không dùng Brain orchestration. |

`unity-task-bank-r3.md` là outline future cho batch scene/prefab + feature sau first experiment khi time/budget/owner cho phép; không phải điều kiện để chạy A/B/C. T24 là controlled skill measurement trên Unity thật: A/B/C này đo các arm với **cùng pinned skills**; so sánh controlled-skill riêng không được suy từ kết quả đó.

### Protocol, accounting và acceptance — chưa đo

Protocol frozen phải khóa cùng revision/fixture/protected tests, cách phân loại lỗi model so với hạ tầng, skill pins, CLI rights, model receipts và giới hạn từng task trước A. Nếu **từ hai task A trở lên** lỗi hạ tầng, dừng trước B/C và báo evidence; không dùng repair để che lỗi hạ tầng. B báo riêng hai số: cumulative A + repairs, và incremental repairs; không được ghi B như một independent rerun. C giữ quyền Terra/Unity skills/CLI tương đương executor và **credit cap mỗi task (bao gồm cached input)** đúng bằng cap B mỗi task. `46.670 raw/task` cũ không phải C cap.

Raw threshold vẫn là 300.000 raw input + output cho toàn lượt, cached input không cộng lần hai. Revised forecast là **92,67 credits = 8,858351336pp**: B cumulative cap `4,6335` credit/task (A `2,7001` + tối đa hai repair `0,9667`), C cap `4,6335` credit/task including cached input. Owner đã cấp conditional approval chỉ khi S1 Pass, protocol đã frozen và forecast toàn lượt ≤ **10pp quota tuần**; 10pp là cap cho mục tiêu nghiệm thu này, không phải DEV 5pp. S1 đã Pass, nhưng reserve, native C credit monitoring và hidden-oracle isolation còn pending nên chưa executable Ready. Đo mỗi arm/task: hidden-test pass count, owner manual fixes, credits và wall time. Không cherry-pick hoặc chọn task sau khi có kết quả.

Giữ Brain khi B ≥ C + 2 hidden-test passes, hoặc B bằng C nhưng ít owner fixes hơn, và B credit ≤ 2 × C. Điều kiện bằng-pass/ít-fix cùng cost constraint là đủ để giữ; các tie khác đi batch 2. Nếu C ≥ B trên 10 microtasks đầu, kết quả inconclusive và mở batch 2 gồm 4 feature + 2 multi-session task, với budget approval riêng. Nếu C ≥ B ở batch 2, thu gọn Brain thành thin skills + memory + verification.

Nếu hạ tầng, fixture, forecast hoặc approval trễ, báo owner ngay với blocker, impact và phương án simplify; không đợi late October.
