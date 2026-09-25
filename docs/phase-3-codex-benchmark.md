# Phase 3 — DEV benchmark qua Codex CLI

Ngày 25/09/2026. Owner đã đồng ý chuyển đợt DEV benchmark sang **Codex CLI dùng phiên đăng nhập ChatGPT subscription hiện có**, thay cho phương án OpenAI API key và dự toán API trong [gói chuẩn bị nghiệm thu](phase-3-acceptance-prep.md). Quyết định này cho phép chạy smoke có giới hạn qua Codex; không cấp quyền tạo key, mua credit, đổi tài khoản, chuyển sang API billing hoặc mở rộng ma trận tự động. Đề xuất API 5 USD trước đó không phải authorization cho đường chạy này.

**Đã triển khai route và thử live; smoke hiện bị chặn, chưa có câu trả lời model hợp lệ.** Hai attempts được giữ nguyên: lần đầu lỗi config trước model, lần hai khởi tạo thread rồi parser từ chối sự kiện chưa hỗ trợ, không có usage. Không báo 0 usage như bằng chứng không dùng quota. [Actual và pins](evidence/phase3-codex/verification-summary.json) tách từng source/version và failed run.

## Phạm vi smoke đã chọn

| Mục | Thiết kế smoke |
|---|---|
| Mục đích | `dev-smoke`: kiểm tra đường chạy, context, output, usage và khả năng review; không nghiệm thu Phase 3 |
| Dữ liệu | Một case dev `sem-001` của sealed v2; không chạy holdout |
| Profile yêu cầu | Executor `gpt-6-luna` / medium chạy trước, rồi planner `gpt-6-astra` / high |
| So sánh trong từng profile | Full (F), Retrieval (R), Compaction một vòng (C); cùng case, density, history, scope và canonical constraints |
| Đối chứng reader | G: sau các arms, chỉ dùng public evidence do evaluator chọn; không đưa expected answer hoặc oracle record vào prompt |
| Số lượt | Mỗi profile: F reader + R reader + C summary + C reader + G reader = 5 invocations; hai profiles tối đa **10 invocations** |
| Mẫu | 6 main trials +2 G controls, một repeat; không đủ để suy rộng chất lượng hoặc phân phối latency |
| Hạch toán | Invocation/time/reported-token ledger riêng cho Codex subscription; không dùng bảng giá API để suy chi phí |
| Gate | `acceptanceReady:false`, Phase 3 `Not evaluated`; T19/T14 chưa nghiệm thu, T11 vẫn Replan |

Config smoke: `fixtures/semantic-config/codex-dev-smoke.json`. Trần đã chọn: 10 invocations; 600.000 ms tổng wall time; 90.000 ms mỗi invocation; 400.000 reported tokens toàn campaign; ngưỡng dừng sau call 100.000 tokens mỗi trial; serialized visible request tối đa 100.000 bytes. Các byte/token thresholds có ý nghĩa khác nhau, không quy đổi bytes thành provider tokens.

Một invocation có thể chứa nhiều request hoặc retry nội bộ của Codex. Runner không retry ở tầng ứng dụng; không override retry policy của provider built-in vì CLI hiện tại từ chối cấu hình đó. Trần 10 invocations **không phải** trần chính xác 10 inference requests và không phải giới hạn quota cứng của dịch vụ. Các profile biểu thị model/effort được yêu cầu. Chúng chưa chứng nhận model thực sự phục vụ request, chất lượng Planning Engine, năng lực execution hoặc routing tối ưu.

## Giới hạn quota và điều kiện dừng

Trước khi chạy, config phải khóa các trần invocation/time/reported-token ở trên vào campaign lock; không suy từ giá API hoặc cấu hình mock cũ. Quota subscription vẫn bị sử dụng; không mô tả benchmark là miễn phí hay không giới hạn chỉ vì không dùng API billing. Lần kiểm tra chuẩn bị ghi nhận còn 20% quota tuần; đây là snapshot, không bảo đảm quota tại thời điểm call. Owner chưa cho phép mua credit hoặc dùng reset credit; nếu quota không đủ thì dừng và giữ partial artifacts.

Ledger bền vững phải ghi attempt trước dispatch, bao gồm request digest, profile, stage, hạn thời gian và allowance còn lại. Summary của C cũng dùng quota và nằm trong cùng báo cáo. Một timeout, tiến trình bị ngắt, thiếu usage hoặc receipt không xác định không được xóa attempt để chạy lại như chưa tiêu thụ. Dừng campaign, giữ trạng thái unknown/partial; không retry hoặc chuyển model/provider tự động. Restart phải tiếp tục nhìn thấy allowance đã dùng và attempts chưa reconcile.

Reported tokens là **quan sát sau call**. Khi tổng báo cáo chạm/vượt ngưỡng, chặn invocation tiếp theo; call vừa xong có thể đã vượt phần còn lại. Không gọi đây là exact pre-count, hard token cap hoặc bảo đảm quota không vượt ngưỡng. Timeout cũng không chứng minh backend ngừng tính usage ngay khi local process bị kết thúc. Usage thiếu là unknown, không phải 0; cached/input/output không được cộng hai lần. API cost để null/not-applicable, không điền 0 như một chi phí dịch vụ đã đo.

## Boundary của context và evaluator

Mỗi invocation bắt đầu phiên độc lập với workspace trống dành riêng cho nó. Chỉ chuyển public task và packet của arm đó; không resume session, không dùng conversation trước làm history ngầm, không dùng output của Astra làm input cho Luna hoặc lấy output G quay lại sửa F/R/C. Compaction chỉ nhận history/context được quy định; code hydrate lại canonical task, nguồn và unknowns như các runner trước.

Phải kiểm boundary thực tế của CLI: working directory trống hoặc chỉ có hai thư mục tên khác nhau chưa đủ chứng minh oracle isolation. Model/tools không được đọc repo, dataset/evaluator, source, credential files hay artifacts của invocation khác; không tự load project/global instructions, skills, MCP, search, shell hoặc file tools ngoài protocol. CLI host dùng phiên authentication hiện có để vận chuyển request; điều này không cấp quyền đưa credentials vào model context. Transport flags và event audit hiện là kiểm soát cho **DEV**, không phải bằng chứng absolute no-tool isolation. Nếu CLI không hỗ trợ cấm một capability, ghi rõ giới hạn và không tuyên bố sandbox tuyệt đối. Tool attempt hoặc cấu hình ngoài dự kiến phải được ghi nhận, chặn/đánh dấu run không hợp lệ và dừng; không coi output sau đó là một reader chỉ dùng context.

Host broker/evaluator vẫn là trusted boundary. Host được đọc oracle để chấm hoặc chọn public evidence cho G; subprocess/model không nhận label, acceptable alternatives, expected constraints/revision map hay grader reasons. G chỉ nhận nội dung public sources, không nhận oracle record. Evaluator diagnostics chỉ tạo sau execution, không chảy trở lại các prompts trong cùng campaign.

Sử dụng subscription session hiện có không đồng nghĩa được dump credential/config cá nhân vào logs. Không đọc/in token hoặc đưa secret vào source, prompt, receipt, cloud export. Không tự fallback sang `OPENAI_API_KEY` khi subscription route thất bại.

## Tính công bằng và khả năng tái lập

So sánh F/R/C trong cùng profile; đối chiếu Astra với Luna là chiều model riêng. Giữ case, canonical input, source revision, density, retrieval policy, compaction depth, prompt/schema version và stage order được khóa trước. G là reader control riêng, không gộp điểm G vào quality rate của ba arms. Tổng C phải tính cả summary và reader; các trial bị context block, timeout, malformed output hoặc thiếu usage vẫn nằm trong coverage.

Codex có thể thêm system/tool instructions, reasoning hoặc compaction bên trong mà broker không quan sát đầy đủ. Vì vậy smoke qua CLI đo **hành vi dưới Codex runtime**; không tương đương benchmark Responses API với exact whole-request counting. Báo cáo phải ghi sự khác biệt này thay vì nhập các số CLI vào metric API như cùng điều kiện. Không có exact pre-count hoặc output-token enforcement ở boundary này; post-call token threshold cũng không đảm bảo mỗi arm nhận cùng cumulative hard token budget.

Campaign lock pin source/compiled entrypoints thực thi, dataset seal, selected case IDs, prompts/schema, context policy, model/effort yêu cầu, config, CLI version, đường dẫn binary trong configuration digest và flags kiểm soát execution. Human-review digest/reviewer/evidence nếu có phải pin và revalidate như runner hiện tại. Dùng directory mới, journals append-only, source/data/prompt đổi thì dừng và giữ partial run. Seal v2 và các report API/mock lịch sử giữ nguyên; case dev đã dùng tiếp tục thuộc exposed development set.

## Báo cáo và review output

Dùng report schema/provider origin riêng cho `codex-cli` với mức bảo đảm được mô tả rõ. Không gắn `assurance:provider` theo nghĩa Responses API hoặc `mock` cho kết quả model thật của Codex. Ghi model requested và mức attestation của model observed riêng; receipt chỉ lặp lại request model không phải independent model identity proof. Không lấy usage của CLI suy thành usage/cost của API.

Có thể dùng lại scorer evidence/revision/constraints, gathering recall/precision/sufficiency, task-class/answerability coverage và paired diagnostics; chúng vẫn chỉ chấm theo oracle/alternatives hiện có. Adapter sang cấu trúc review phải giữ origin, raw report digest, lock, request/packet linkage và limitations. Exporter cũ chỉ hiểu OpenAI/mock phải từ chối schema chưa hỗ trợ hoặc có adapter được test; không sửa nhãn để ép import.

Người review cần actual answer, exact public packet/request, profile requested, stage, usage/latency đã quan sát, error/unknown flags và artifact hashes. Không lộ oracle cho người đang đóng vai candidate; không tự điền human judgments. Nhận xét của agent là agent review, không đổi thành independent human attestation.

## Test cần có trước và quanh smoke

| Nhóm | Tiêu chí |
|---|---|
| Route/transport | Giữ model/effort/schema/flags đúng; dùng subscription route; không tự fallback API/model; payload không chứa credentials hoặc oracle |
| CLI lifecycle | Partial/invalid/truncated JSONL, nhiều terminal events, nonzero exit, refusal, timeout, cancellation, output quá lớn, unexpected tools; mỗi attempt có terminal/unknown state |
| Isolation | Fresh sessions, empty task workspace, denied reads với canary repo/oracle/sibling artifacts; không load skills/MCP/project instructions ngoài protocol |
| Ledger | Attempt reserve trước dispatch; cap invocation/elapsed time; post-call token threshold; summary được tính; missing usage/crash/restart không tạo lượt miễn phí |
| Pairing/gathering | F/R/C/G đúng 6+2 trials và tối đa 10 invocations; same-profile pairing; selected/retrieved sufficiency độc lập reader; G không làm lộ answer |
| Integrity | Source/data/config/prompt/review drift, output overwrite, mismatched request/packet digest; báo cáo partial, không clean acceptance |
| Output review | Schema Codex riêng; export exact actual outputs với hash linkage; unknown model identity/usage không biến thành attested API receipt; import pending/unsupported bị chặn |

Local injected CLI tests chỉ chứng minh parser/runner/ledger. Một smoke thành công chỉ bổ sung DEV observations. Vẫn cần independent calibration, admissible abstention/conflict cases, fresh reviewed holdout, frozen protocol, complete acceptance matrix, adjudication và T19/T11→T14 handoff trước khi xét Phase 3 Pass. Unity, game và Phase 4 chưa được mở bởi quyết định dùng Codex.

## Actual và artifacts

- CLI đăng nhập ChatGPT, version `0.155.0-alpha.16.4`; không đọc/copy API key hoặc auth token. Trước live, snapshot quota tài khoản còn 11% tuần; usage của toàn phiên/agents cùng chia sẻ quota nên không quy phần trăm thay đổi thành chi phí riêng của smoke.
- Source trước live cuối đạt **525/525 clean tests, 0 fail/skip**, source và JS khớp bản sao sạch. [Clean run](evidence/phase3-codex/clean-codex-20260925T101121Z-summary.json). Sau live có bổ sung metadata chẩn đoán sự kiện; kiểm thử bản bàn giao cuối được ghi riêng bên dưới, không gán ngược vào lần chạy trước.
- Run 1: một attempt Luna, CLI từ chối `model_post_turn_compact_threshold_percent` ngay ở strict config parsing. [Tái hiện offline](evidence/phase3-codex/startup-no-inference-diagnosis.json) dùng stdin rỗng và schema không tồn tại, không gọi model. Đã bỏ field không được CLI cài trên máy hỗ trợ.
- [Operator reconciliation](evidence/phase3-codex/startup-reconciliation.json) gắn evidence hash, chuyển attempt đầu thành `not-dispatched`. Đây là attestation dựa trên tái hiện local, không phải provider usage receipt. Vẫn tính một invocation, giữ nguyên trần và deadline; không xóa attempt/unknown reason cũ hoặc tạo allowance mới.
- Run 2: CLI tạo thread, parser gặp `CODEX_EVENT_UNKNOWN`, process bị dừng; không có final answer/usage. Lượt này **giữ unknown và đóng băng ledger**, không reconcile thành 0 và không retry. Nhật ký cũ không lưu tên sự kiện cụ thể nên chưa kết luận chính xác loại event gây lỗi. Bản chẩn đoán mới chỉ lưu tên event/item có giới hạn, không lưu nội dung reasoning, prompt, error hay auth.
- Tổng **2 attempts, 0 câu trả lời hợp lệ**, chưa tới Astra, C hoặc G. Một attempt đã reconcile local; một attempt vẫn unknown. `reportedTokens:0` chỉ nói chưa có usage hợp lệ nhận được. Không có phép đo chất lượng model, không đạt DEV smoke và không đóng S2a.
- Export được review bundle của run 2 với **1 partial trial, 0 completed answers**; judgments pending, không giả human review. [Tóm tắt export](evidence/phase3-codex/review-export-summary.json). Run 1/error/config/source pin và toàn bộ artifacts giữ trong gói cloud, không ghi đè.

Phase 3 vẫn chưa PASS: T09/T10 Pass local; T19/T14 Not evaluated; T11 Replan. Tiếp theo cần xác định và hỗ trợ đúng protocol event của CLI cài trên máy, sau đó xử lý allowance/unknown attempt theo evidence trước khi chạy lại. Không tự đổi model/provider, mua/reset credits, mở API hoặc dùng campaign tên mới để né ledger. Cả deadline ban đầu cũng được giữ nguyên. Sau khi smoke thực sự có output vẫn cần independent calibration, fresh reviewed holdout, frozen protocol/adjudication và T14.

## Lệnh tái lập

Build bằng `./scripts/dev.sh run build`. Preflight chỉ đọc và không gọi model:

```sh
./scripts/dev.sh exec node dist/src/cli.js semantic-codex-preflight fixtures/semantic-benchmark fixtures/semantic-config/codex-dev-smoke.json
```

Hai lệnh lịch sử dưới đây dùng để tái lập khi có điều kiện chạy mới hợp lệ; ledger hiện đang frozen, không chạy lại hoặc reset bằng cách đổi tên campaign:

```sh
./scripts/dev.sh exec node dist/src/cli.js semantic-codex-run fixtures/semantic-benchmark fixtures/semantic-config/codex-dev-smoke-startup-fixed.json .local/codex-dev-smoke-run2 --live
./scripts/dev.sh exec node dist/src/cli.js semantic-codex-review-export .local/codex-dev-smoke-run2 .local/codex-dev-smoke-run2-review
```

CLI tự dùng ledger cố định `.local/codex-subscription-usage`; không nhận thư mục ledger tùy ý. Giữ nguyên authorization ID và lịch sử khi kiểm tra lại. Human review được nhập bằng `semantic-codex-review-import <campaign> <decisions.json> <new-reviewed-file>` sau khi có quyết định thật; pending template không được import.

Tham chiếu cơ chế CLI: [non-interactive mode](https://learn.chatgpt.com/docs/non-interactive-mode), [authentication](https://learn.chatgpt.com/docs/auth), [configuration](https://learn.chatgpt.com/docs/config-file/config-reference), [permissions](https://learn.chatgpt.com/docs/permissions). Kiểm metadata offline trên CLI thực được lưu riêng; không suy từ docs rằng mọi capability bị cô lập tuyệt đối.

Source/context/evidence bàn giao: [Drive](https://drive.google.com/drive/folders/1YZOOxTgBmonGaMEB4KvAtEPCOZlb5M9l). GitHub chưa push; bản source và Git history được đóng gói.

## Review giao thức sau lỗi live

Đã đối chiếu định nghĩa sự kiện/usage trong [nguồn chính thức OpenAI Codex](https://github.com/openai/codex/blob/main/codex-rs/exec/src/exec_events.rs), blob SHA `06565c097b28d3bf2ad592943cc30c776b45e236`. Có field `cache_write_input_tokens`; bản parser mới chấp nhận trường này khi bằng số 0, còn giá trị khác giữ unknown đến khi có quy tắc accounting phù hợp. Đây là lỗi tương thích tiềm tàng được sửa bằng test local, **không phải nguyên nhân đã xác định của EVENT_UNKNOWN trong run 2**. [Evidence offline](evidence/phase3-codex/protocol-offline-review.json).

Chưa chạy model lại sau hai sửa chẩn đoán/usage này; ledger vẫn frozen. Receipt parser không nới cho tool hoặc error item. Scope bảo đảm vẫn là DEV với flags và event audit; kiểm metadata thấy `unified_exec` true dù gửi disable, nên không tuyên bố toàn bộ tool bị vô hiệu hóa tuyệt đối. `shell_tool` false và named filesystem policy là các lớp kiểm soát khác; chưa có canary live chứng minh cách ly tuyệt đối.

Báo cáo online: [Notion](https://app.notion.com/p/3e6a6c16b3dc81d8837be2a7a57ed9dd).

## Kiểm chứng bản bàn giao cuối

**527/527 clean tests, 0 fail, 0 skip**, source không đổi trong verification; compiled JS trên workspace khớp bản sạch. [Kết quả](evidence/phase3-codex/clean-codex-20260925T101720Z-summary.json). Full source/test/fixture/script manifest `sha256:2b2a1feecba3f5b43476da44ac723d3826c6305cb09bbc43a152ca40e6574940`; built JS manifest `sha256:553619710a4780f31f677edf5e90695b8d0fbbec77bb24f095c5c59629fb8cf5`. Đây là kiểm thử local của bản sau chẩn đoán, không phải live benchmark thành công.
