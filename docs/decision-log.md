# Decision log — AI Agent Architect

Các quyết định dưới đây do owner xác nhận trong hội thoại ngày **30/09/2026**; đây và [quy tắc planning](brain-planning-policy.md) là hai nguồn quyết định hiện hành. Roadmap, backlog và tài liệu kỹ thuật áp dụng và dẫn link, không giữ chính sách mâu thuẫn. Nhật ký cũ ở [Notion](https://app.notion.com/p/3eba6c16b3dc8143a1e7f915c48bb09c), lịch sử Git và immutable evidence.

## Unity infrastructure trước Brain orchestration

Lý do: adapter/project kiểm thử là cách kiểm nền tảng, không phải game; gộp chúng với pilot tạo dependency sai và làm chậm kiểm chứng.

Quyết định: **T21 adapter + empty project, T08 compile/test/evidence làm trước điều phối Brain T20**, không chờ T20/T24/T22. T25 conformance recipe dùng T21/T08/T23. Chỉ T01/pilot Block Puzzle chờ T22. Actual 30/09: Unity Editor `6000.0.84f1`, CLI báo `1.0.0-beta.8`; 29 oracle tests tham chiếu và 3 CLI preflight pass, chưa có model Unity run.

Thay thế: quan niệm mọi Unity/project phải chờ T22; dependency T21←T20/T24; scope empty project trong T01. Giữ “hạ tầng trước, game sau”.

## Planning mặc định phân tầng, interface-first

Lý do: planner đồng thời quyết định các phần phụ thuộc tạo mâu thuẫn; điểm tổng có thể che thiếu acceptance/interface.

Quyết định: [policy](brain-planning-policy.md) Game/Epic → Module → Task theo quy mô; main planner chốt GDD/interface trước; chỉ module độc lập planning song song; critic/test author độc lập để kiểm chứng. Ready có 7 mục đạt/không đạt; rolling planning, Task một phiên/auto-check/review ≤30 phút; không chắc chọn tầng cao hơn; spike riêng có time/token/stop/decision, code không merge; change request trả đúng tầng; Game/Epic brief một trang cho owner.

Thay thế: planner song song rồi hợp nhất, ngưỡng 85/100, và “multi-planner chỉ là thí nghiệm”. Chỉ compaction mặc định và Explorer nâng cao còn là thí nghiệm. Thiết kế là mặc định; xây orchestration đầy đủ sau mốc quyết định cuối tháng.

## Phase 3 được owner chấp nhận đóng có điều kiện

Owner đã đọc Notion và xác nhận **quy tắc planning và việc đóng Phase 3 đạt yêu cầu**. T19/T11/T14 có Gate **Pass có điều kiện**, phạm vi hồ sơ hiện tại. Không đòi fresh holdout để đóng phase, không sửa immutable evidence, không coi đây là production/semantic verified PASS.

Rủi ro chuyển sang task theo dõi T26: **36 hard failures** trong 300 đáp án cũ; selector chỉ đo đủ nguồn trên DEV, chưa chất lượng trả lời end-to-end. T26 theo dõi xử lý/giảm thiểu/chấp nhận rủi ro theo phạm vi trước T22; không mặc định cần xóa hết lỗi lịch sử mới mở pilot. T22 phải ghi residual risk và owner decision; các hard check runtime/Unity trong phạm vi pilot vẫn phải Pass.

Thay thế: trạng thái tạm “chờ nghiệm thu đóng Phase 3” và các trạng thái Replan/Not evaluated chồng ở trang hiện hành. Bản evidence đầu ngày giữ nguyên số 300/300, 264 advisory Pass, 36 hard failures.

## Roadmap và đối chứng ba nhánh

Lý do: cần đo lợi ích của vòng sửa lỗi compile/test và so với cách dùng Codex thường trước đầu tư thêm orchestration.

Quyết định: push/CI → baseline Unity → fix/đối chứng → **quyết định giữ hay thu gọn ngay khi paired results sẵn sàng** → orchestration phù hợp quyết định → T22 → pilot. Báo sớm lý do/tác động nếu blocker kéo dài.

Round 1 dùng cùng 10 microtasks Unity hiện có, tuần tự **A → B → C**. A chỉ một pass planner Sol → critic Sol → executor Terra. B tái sử dụng A và chỉ repair tối đa hai vòng Terra cho task A model-failed, từ compile/test output; không rerun A. C là Codex thường với cùng Terra executor, Unity CLI, skills và quyền CLI. Nếu ít nhất hai task A infra-failed, dừng trước B/C và báo evidence. Protocol khóa fixture/revision/AC/phân loại lỗi/skill pins/quyền/caps trước A; không cherry-pick sau kết quả. B báo cumulative A+repairs và incremental repairs riêng. C cap **credit (gồm cached input)** mỗi task bằng B cap, không dùng raw `46.670/task` cũ. Đợt sau thêm scene/prefab và feature. T24 đo skill trên Unity thật; thí nghiệm A/B/C giữ skill cố định nên không tự chứng minh causal benefit của skill.

Quy tắc quyết định: giữ nếu B ≥ C + 2 hidden-test passes, hoặc bằng pass nhưng B có ít owner manual fixes hơn, với B credit ≤ 2 × C. Equal-pass/fewer-fixes cùng cost constraint đủ điều kiện giữ; tie khác phải batch 2. Nếu C ≥ B sau 10 microtasks thì inconclusive: batch 2 gồm 4 feature + 2 multi-session task và cần approval ngân sách riêng; nếu C ≥ B ở batch 2 thì simplify Brain thành thin skills + memory + verification. Metrics bắt buộc: hidden-test pass count, owner manual fixes, credits và wall time.

Thay thế: first round 24 case real-task bank/10 case phân cỡ × 2 arm; T24 repo không Unity; thứ tự Brain orchestration trước Unity. Task bank 24 giữ outline đợt sau, chưa fixture hay campaign.

## Ngân sách credit và quota thay model weights

Lý do: hệ số model cố định không phản ánh cached input/output. Owner bỏ Terra×1/Sol×3/Astra×5 và trần token DEV 1,5 triệu/phase 3 triệu cho lượt mới.

Quyết định: credit Standard trên 1 triệu token uncached input/cached input/output: **gpt-5.6-terra 50/5/300; gpt-6-sol 50/5/250; gpt-6-astra 250/25/1250**. Tính `(input−cached)×inputRate + cached×cachedRate + output×outputRate`, chia 1 triệu. Cached đã nằm trong input, không cộng hai lần; receipt thiếu usage/cache ghi unknown. [Bảng giá Codex](https://learn.chatgpt.com/docs/pricing) xác nhận credit Standard, khác giá API USD; credit không tự quy đổi thành quota included.

Hỏi trước toàn đợt dự kiến **>300.000 raw input+output**, kể cả retry; không chia đợt để lách. Mục tiêu nghiệm thu A/B/C có cap **≤10 điểm % quota tuần** trên tổng quota tuần, không tính trên phần còn lại; cap DEV 5pp không phải cổng cho thí nghiệm này. Owner cấp conditional approval khi S1 Pass, protocol frozen và forecast ≤10pp. Forecast dựa calibration có dated/source/uncertainty; dùng snapshot trước/sau **cả lượt làm việc**, không chỉ benchmark; ghi 5h/tuần và hoạt động lẫn số đo. Không đọc được ghi unknown, không suy 0.

Nonbenchmark work có mục tiêu ≤3pp quota tuần. Nếu không thể hoàn thành trong target đó, báo nguyên nhân và actual; không ghi target là đạt. Snapshot quota ban đầu của lượt hiện là 16%; số 5h vẫn unknown.

## S2 protocol Ready, execution chưa bắt đầu

S2 protocol đã frozen và Ready cho run được owner conditional preapprove: S1 6/6, native offline preflight (chỉ `unity_public`/`unity_compile_test`, oracle denied, 0 model calls), và broker preflight 3/3 hidden IntegerClamp test với feedback giống nhau cho các arm. Focused 24 TypeScript và 6 Python broker test pass; full suite đang chạy, chưa được ghi green. Run chưa bắt đầu.

Forecast credit 92,67 / 8,858351336pp dùng tỷ lệ quota noisy observational, không phải trusted calibration. Quota có thể rounded/concurrent; manual checkpoint STOP tại 8pp delta để giữ 2pp reserve. Credit monitor chỉ giảm soft in-flight overshoot risk, không là hard provider cap. Raw forecast tentative 1–2m, kể cả cached input, không phải raw cap; threshold hỏi trước 300.000 raw input+output vẫn giữ.

## R1 invalid, quyết định bị chặn

R1 A10/B reuse10/C9 không hợp lệ cho comparison: runtime MCP không tạo Unity broker receipt và verifier fallback external host. Test external pass không chứng minh arm comparison; lỗi hạ tầng đáng lẽ chặn sau hai A task. Budget benchmark không vượt: 39 invocation, 1.616.535 raw gồm 1.238.400 cached, 31,00375 credits từ receipt đã biết; benchmark quota 24→26 (+2pp). Mục tiêu preparation thất bại: whole turn 16→24 (+8pp, vượt mục tiêu ≤3pp); sau audit là 27% (+11pp overall), có hoạt động khác, 5h unknown. Không suy calibration từ 15,501875 credits/pp. Direct app-server MCP preflight 0 model calls Pass; local fix checks 19 TypeScript target và 6 Python pass. Causal model-path error không thể khôi phục từ old logs, nên Ready vẫn blocked. Conditional model approval còn hiệu lực nhưng chưa rerun. Commits/push vẫn trong authorization hiện có; Git push cần credentials mới vì temporary key đã bị revoke.

[Credit audit](credit-quota-r3.md) thay hệ số 550.668 weighted tokens/1 điểm %. Hệ số mới chỉ sơ bộ bị nhiễu, không tự mở run cap. Theo quota snapshot chưa đủ để bảo chứng trần ngân sách cứng; dự toán vượt cap/unknown thì dừng xin decision trước chạy, không tự nâng trần.

## Giới hạn lượt cập nhật này

Hoàn thiện docs/Notion, decision log, roadmap/backlog, contracts/tests, budget calculation, GitHub/CI và bàn giao. **Không model run mới, không xây planning engine, không pilot.** Sau báo cáo cập nhật dừng để owner nghiệm thu; acceptance Phase 3 đã có không phải approval chạy thí nghiệm.

## Canary CLI compatibility pin — 01/10/2026

Lần canary IntegerClamp duy nhất dừng trước app-server vì binary desktop thay đổi từ
`0.158.0-alpha.2.1` sang `0.159.0`. Owner cho phép một compatibility fix và retry
sau khi xác nhận quota mới. Harness dùng binary riêng trong `.local/tools/codex/0.159.0`,
cài exact `@openai/codex@0.159.0`, không cập nhật binary desktop hay global Codex.
Pin này chỉ phục vụ canary; model Terra, Unity CLI `1.0.0-beta.8`, cap 1.5 credit,
reserve 0.5 credit, và các stopping rules giữ nguyên. Offline probe đã Pass với
initialize, thread/start và inventory `unity_public.unity_compile_test`; probe không
gửi turn/start hay model request. Retry live vẫn chờ snapshot quota mới từ owner.

Stable retry đã chứng minh hai Unity tool call cùng session: stub fail 3/3 rồi
repair pass 3/3, receipt/XML/source hash khớp. Tuy nhiên native monitor ngắt ở
1.033010 credit observed khi reserve 0.5 credit được chạm; không có
`turn/completed`, nên settled cost unknown. Đây là technical tool-proof Pass nhưng
canary overall interrupted: không mở 2 task, spike, A/C hay retry tự động. Native
pin hiện chỉ có canary; default transport/A/C vẫn dùng desktop pin cũ và migration
đó bị chặn cho đến quyết định riêng.

Owner chấp nhận mục tiêu canary và hạch toán **1.5 credit reserved**, không dùng
1.033010 observed như settled cost. Runtime stable isolated hiện là default cho
new transports. Hard weekly stop mới là 40%; two-case A/C (forecast 387.439 raw
tokens) vẫn blocked cho đến ModuleReady mới, full checks và owner budget approval.

## Chuỗi nhanh 01/10 — ngân sách mới; dừng cổng bước 1

Owner thay mọi trần 45%/47% của chuỗi bằng hard stop **85% quota tuần hiện tại**; bước 1/2/3 tăng tối đa **2/5/6 điểm %**, gồm điều phối. Bước 4 dùng phần còn lại, admission phải dự phòng đủ cả cặp B/C; không mở một arm lẻ. Không Fast mode, không subagent, không hỏi theo token trong trần; không đợi reset 07/10. Reset authorization `1791343381` (07/10 10:23:01 VN); tới/qua reset phải dừng. Cổng mới từ chối cấu hình cũ, thiếu dữ liệu bước, snapshot cũ, reset đổi và thiếu dự phòng cặp. Cổng API đã kiểm thử; chưa có harness đợt 2 tích hợp nên chưa tuyên bố Ready.

Đã đọc handoff nghiệm thu bcb2ea8, policy theo tầng và Notion “14 — Bối cảnh hiện hành R3” (còn bàn giao cũ ngày 30/09). Không sửa lịch sử immutable. Bước 1 bắt đầu quota 49%, kết thúc 49% (rounded/shared account). Build và 18 test liên quan đạt.

Hai lượt Terra thật, cùng fixture IntegerClamp ban đầu, trần 0,5 credit, reserve 0,1: lượt 1 chốt counter quan sát 1,40530 nhưng không có turn/completed, settled charge chưa xác minh; lượt 2 có turn/completed, chốt **1,44057** credit. Tổng counter quan sát **2,84587**, không gọi tổng đó là toàn bộ settled charge. Lượt đầu không có final settlement giữ ít nhất observed cost trong ledger; không coi 0,5 reserved là chi phí tối đa khi thực tế đã vượt. Cả hai không có hook log, không đạt nghiệm thu dừng mềm. Không tính đây là model/task failure hoặc benchmark results.

Sửa trong cổng: (1) cấu trúc hook đúng matcher/handler và sửa tuple test để build; (2) kiểm trust qua hooks/list, thử session trust override và cho turn chốt thay vì ngắt ngay khi vượt credit. CLI 0.159.0 báo override trust bị bỏ qua; hook inventory vẫn untrusted. Sau hai lần sửa, cổng Fail: **dừng bước 1, không spike, không protocol, không đợt 2**. Runtime hiện chặn trước paid turn nếu exact session hook không trusted; không thử tiếp đường trust khác. Cần owner quyết định mở phiên sửa riêng/cấp lại giới hạn sửa, hoặc thao tác trust hook phù hợp CLI đã ghim. Không đổi pin tự động.

Bằng chứng tóm tắt và manifest: [soft stop](evidence/soft-stop-20261001/handoff.md). Raw logs giữ `.local/soft-stop-20261001-attempt{1,2}`. Chưa push; owner push gom. Protocol chưa khóa nên chưa có protocol hash đợt 2. Cần tích hợp snapshot supervisor và cặp B/C vào harness trước khi có Ready; không nhận API tests là bằng chứng integration.

## Owner trust và bước 2 — 01/10/2026 (tiếp nối)

Owner thay điều kiện dừng trước bước 2–3: hai bước không chạy model qua harness, được làm ngay khi owner tự trust hook. Hook duy nhất cố định tại `.local/harness-codex-home/hooks.json`, cwd CLI/harness `.local/harness-workspace`; lệnh 0.159.0 trong handoff. Không thay định nghĩa/thứ tự, không bypass, không requirements hệ thống. Notion/Drive chỉ cập nhật sau đợt 2, thay chỉ dẫn đồng bộ cuối lượt trước.

Spike scene/prefab **Pass đường dự phòng**: Unity CLI command trả No Pipeline instance; không có live Editor/Pipeline được kết nối. `ScenePrefabSpike.Create` tạo prefab/scene, `Modify` sửa scale prefab và thêm scene marker; PlayMode batchmode 2/2 Pass. Sửa hạ tầng lần 1: thêm built-in Physics 2D vào manifest fixture vì thiếu BoxCollider2D khi compile. Không sửa lần 2. Editor 6000.0.84f1, CLI 1.0.0-beta.8 giữ pin. Dùng chung Unity tool với backend executeMethod + batchmode runTests cho B/C; giữ task prefab/kéo thả. Rủi ro: chưa chứng minh thao tác qua Editor trực tiếp/Pipeline; spike code do_not_merge, không tái sử dụng implementation cho benchmark.

Quota bước 2 bắt đầu 49%, checkpoint sau spike 49%; gồm chuẩn bị home/harness/điều phối. Chưa có model call trong phiên này. Ngắt cứng 1,5× trần được thêm theo owner: interrupt tại counter ngưỡng, chi phí counter cuối đánh dấu unsettled, lấy source cuối để chấm hidden tests; lượt rate-limit/infra vẫn không tính task fail và replay cùng snapshot. Một test đồng bộ mock được sửa sau lần đầu treo; test ngắt cứng sau đó đạt.

Home riêng khiến các entry MCP disabled nhưng thiếu transport báo invalid transport trước model. Đã bỏ entry rỗng; allowlist vẫn `mcp_servers={}` + broker cố định. Offline hooks/list xác nhận đúng user hook ở home cố định, enabled/untrusted, 0 model calls; không ghi trust thay owner. 19 kiểm thử quota/native/hard-stop đạt. Quota bước 2 chốt 49→49% (+0pp rounded), từ đầu phiên +0pp; model credit 0.

## Khóa protocol đợt 2 — 01/10/2026

Sáu task B/C đã có fixture/public smoke, 30 hidden tests và allowed paths/session contracts. Baseline 25 EditMode + 5 PlayMode compile, 30/30 fail đúng stub/thiếu asset/adapter; positive-control private 30/30 Pass. Test source và đề bài khóa; test hidden tuyệt đối không dùng làm repair feedback. Task nhỏ đi Task; level/refactor nhiều phiên đi Module→Task. B cumulative A+≤2 repairs; C cùng Terra medium/tool/snapshot đầu/caps. Các phiên sau dùng source/handoff của chính arm và giữ regression. Tiêu chí giữ/thu gọn dùng whole-task-hidden-pass như implementation R3, báo thêm 30 case pass count; điều kiện equal-pass/fewer-fixes/cost được xét trước C≥B simplify.

Cap mỗi B/C arm: 4 feature ×6 credit +2 multi-session ×10 (5+5) =88 tổng soft caps. Dự toán 44–64 credit (4,2–6,2pp noisy), pair dự phòng 1,5× cả hai caps: 18 hoặc 30 credit, toàn đợt 132 credit≈12,62pp theo quan sát cũ; không gọi đây là trusted calibration/hard provider bound. Live quota/reset/cặp là cổng thật, giữ 85% và tuần hiện tại. Native effort medium/serviceTier default explicit; protocolDigest ghi reservation/native/public broker/grader, ngắt cứng 1,5× giữ source cuối/counter unsettled; grade-admission từ chối thiếu/mismatch receipt và rate-limit/infra, không silent fallback. Credit-stop vẫn chạy hidden diagnostic trên source cuối; cần broker ban đầu để là scored run.

Protocol b9327ac9fb4b4f404c4828c39dfddcb712c9d58e331aac691909fd8d04b7fb97, hướng dẫn và fixture hashes đã khóa. Protocol-artifact Ready 7/7; execution Not Ready: hook live proof, owner “chạy”, fresh quota/pair reserve và offline adapter preflight. Hai arm phải dùng shared prepared snapshot (import fixture một lần rồi clone; host import/meta/lock generation cần trace trước model, không quy thay đổi của Editor cho model). Không dùng runner round1 chứa hidden repair feedback. Broker public-only mới đã chuẩn bị; full adapter chưa có live evidence.

Sửa nhỏ bước 3 lần 1: Ready record thiếu version/reason schema fields, bổ sung metadata và parse Pass; không đổi protocol/AC/fixtures. 22 test quota/native/hard-stop/round2-admission đạt, lock-check xác minh 7 checks/30 cases/fixture hashes. Hook kiểm lại enabled/untrusted tại home cố định; 0 model calls, không test live bước 1. Quota bước 3 49→49%, từ đầu phiên 49→49 (+0pp rounded), chưa vượt 6pp. Cả bước 2/3 không có model spend. Dừng ở mốc protocol khóa theo owner; Notion/Drive giữ nguyên tới sau đợt 2. Lệnh trust và tóm tắt một trang ở evidence/round2-preparation-20261001/handoff.md.

Checkpoint cuối trước commit bước 3: quota chuyển 49→50%; bước 3 +1pp và cả phiên +1pp (49→50%), trong trần 6pp. Các checkpoint 49% trước đó giữ nguyên lịch sử. Harness model calls/credits bằng 0; điều phối đã nằm trong quota tăng. Hook kiểm tra cuối vẫn untrusted. Không cập nhật Notion/Drive.
