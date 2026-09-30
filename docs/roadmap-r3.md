# Roadmap R3 — 30/09/2026

[Brain planning policy](brain-planning-policy.md) và [decision log](decision-log.md) là nguồn quyết định authoritative. Roadmap này áp dụng các quyết định đó. Phase 3 đã được owner **accepted, conditional closure**; đây không phải production PASS. Lượt hiện tại chỉ cập nhật documentation/contracts/schema tests, không có model run.

## Trình tự hiện hành

| Mốc | Cổng và đầu ra |
|---|---|
| Push/CI — 30/09–01/10 | Đẩy phạm vi đã duyệt và xác nhận CI trước khi đi tiếp. |
| Unity baseline/infrastructure — 01–09/10 | T21 Unity adapter + empty project, rồi T08 compile/test evidence. T21/T08 không còn chờ T20/T24. |
| Fix + comparison round — 12–23/10 | Khóa existing 10 microtasks và chạy arm A/B/C khi owner duyệt forecast/budget. |
| Quyết định — 28–30/10 | Owner quyết định retain hoặc simplify Brain từ actual paired results; báo sớm nếu forecast trễ. |
| Brain orchestration — 02–13/11, nếu retain | Chỉ mở rộng orchestration sau quyết định giữ, theo policy interface-first. |
| Pilot — sau T22, TBD | T22 platform gate Pass rồi mới mở Block Puzzle pilot và Game/Epic brief. |

Preflight Unity lịch sử vẫn hợp lệ như evidence: Editor `6000.0.84f1`, Unity CLI `1.0.0-beta.8`, 29 oracle tests và 3 CLI tests pass. Nó không phải model Unity run và không thay spike/verification mới.

Chỉ mốc kế tiếp được viết chi tiết; các mốc sau chỉ outline. Mỗi implementation task là một agent session, có automated checks, diff và owner review ≤30 phút. Nếu scope hoặc ambiguity chưa rõ, chọn level cao hơn rồi phân rã/Ready lại.

## Mốc kế tiếp: Unity CLI spike và Ready

S1 là spike hạ tầng, không phải planning engine: timebox 90 phút, cap 60.000 token hỗ trợ AI; xác nhận lại Unity CLI đã pin chạy compile/EditMode test trên empty fixture, tạo XML với test IDs/count và reject một compile/test failure cố ý. Ghi decision record về CLI/fallback/blocked. S2 chỉ là module plan/interface-first và Ready records cho chuỗi `Request → Plan → Critic → Execution → Verification → Evidence → Memory`; schema tests hiện tại kiểm record shape, không thực thi admission/engine. Hai task có timebox/cap được owner duyệt trước khi chạy; goal/AC mơ hồ trả về level cao hơn.

## Comparison round: existing 10 microtasks

Không dùng 24 task bank để làm first round. Cùng 10 microtasks hiện có, cùng Unity CLI/version, protected tests, executor/tool access, revision đầu vào, token cap và workspace isolation cho ba arm:

| Arm | Quy trình |
|---|---|
| A — Brain | Một pass planner → critic → executor. |
| B — Brain repair | Arm A, sau đó tối đa hai compile/test repair rounds. |
| C — ordinary Codex | Codex thường, cùng Unity CLI và token cap; không bắt dùng Brain orchestration. |

`unity-task-bank-r3.md` là outline future cho batch scene/prefab + feature sau first experiment khi time/budget/owner cho phép; không phải điều kiện để chạy A/B/C. T24 là controlled skill measurement trên Unity thật: A/B/C này đo các arm với **cùng pinned skills**; so sánh controlled-skill riêng không được suy từ kết quả đó.

### Forecast accounting, chưa đo

Theo `src/unity/campaign.ts`, mỗi model turn reserve `ceil(16.000 bytes/3)=5.334` input proxy, `2.000` output guidance và `2.000` platform overhead. Để forecast credit, overhead được tính là input: **7.334 input + 2.000 output mỗi call-equivalent**, không cache. Đây là forecast, không phải cap hay actual billing. A dùng 10 planner Sol, 10 critic Sol và 10 executor Terra. B thêm tối đa 20 executor Terra calls (hai repair mỗi task). C có 10 ordinary-agent sessions; số model turns/tool cycles của C phải freeze trong protocol, không được giả là 10 calls.

| Arm | Calls | Terra forecast | Sol forecast | Aggregate forecast |
|---|---:|---:|---:|---:|
| A | 30 | 93.340 | 186.680 | 280.020 = 28.002/task |
| B | 50 | 280.020 | 186.680 | 466.700 = 46.670/task |
| C | freeze trong protocol | conservative Terra call-equivalent ceiling | 0 | 466.700 = 46.670/task |

Direct-credit rate per 1M tokens: Terra input `50` uncached / `5` cached, output `300`; Sol `50` / `5`, output `250`; Astra `250` / `25`, output `1.250`. Với 7.334 uncached input + 2.000 output per call-equivalent, forecast credit A/B/C lần lượt khoảng `27,001` / `46,335` / `48,335`; C là conservative maximum 50 Terra call-equivalents. Cached input chỉ giảm phần input khi receipt chứng minh cache. Các số này không phải measured actuals.

Mỗi arm có raw ceiling **46.670/task**; A không được chuyển phần cap chưa dùng sang repair. C cần hard CLI-unavailable reserve/progress-stop rule trong protocol để giữ fairness. Approval threshold là 300.000 token **raw input + output**; cached subset không cộng lần hai. Tổng proposed A+B+C là **1.213.420 raw token**, vượt threshold nên cần batch-overall approval trước future run. [Credit/quota audit](credit-quota-r3.md) ước tính tổng proposal là **11,63pp** quota tuần, vượt DEV cap 5pp: proposal không admissible cho tới khi được giảm hoặc owner đưa ra quyết định rõ ràng. Forecast unknown cần approval; không chạy model trong lượt này. Quota methodology ở tài liệu quyết định riêng.

Nếu hạ tầng, fixture, forecast hoặc approval trễ, báo owner ngay với blocker, impact và phương án simplify; không đợi late October.
