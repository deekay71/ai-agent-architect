# Phase 2 — spike LangGraph và Promptfoo

Ngày khảo sát/chạy: 25/09/2026. Đây là hai thí nghiệm thực thi độc lập cho T07/T18, dùng fixture local và không gọi model, Unity hoặc dịch vụ cloud. Mã, dependencies, lockfile và evidence nằm trong [`spikes/phase2`](../spikes/phase2/README.md); không thêm framework vào package chính.

**Đề xuất:** giữ bounded runner và operation ledger của dự án làm ranh giới runtime. LangGraph là ứng viên adapter orchestration khi graph phức tạp thực sự cần nó; checkpoint của framework không thay ledger, quyền, ownership hay reconciliation. Promptfoo phù hợp làm adapter eval/CI tùy chọn để chạy campaign và xuất kết quả; verdict/release vẫn do policy và evidence của dự án quyết định. Đây là đề xuất dựa trên spike, chưa phải chứng nhận production hoặc benchmark model.

## Phiên bản và nguồn

| Package được pin | Phiên bản | Quan sát tương thích |
|---|---|---|
| `@langchain/langgraph` | `1.4.17` | Node >=18; peer Zod `^3.25.32` hoặc `^4.2.0` |
| `@langchain/langgraph-checkpoint-sqlite` | `1.0.4` | SQLite saver chính thức; dùng native `better-sqlite3` |
| `@langchain/core` | `1.2.12` | Node >=20; được pin để giải peer dependency |
| `promptfoo` | `0.123.1` | Node >=22.22.0 |
| `zod` trong spike | `4.3.6` | Đáp ứng các peer ranges của spike; không thay Zod `4.1.12` của app |

Metadata exact-version, URL tarball, integrity, repository và `gitHead` khi có được lưu trong [package-provenance.json](../spikes/phase2/evidence/package-provenance.json), lấy từ [npm registry LangGraph](https://registry.npmjs.org/%40langchain%2Flanggraph/1.4.17), [SQLite saver](https://registry.npmjs.org/%40langchain%2Flanggraph-checkpoint-sqlite/1.0.4), [LangChain core](https://registry.npmjs.org/%40langchain%2Fcore/1.2.12) và [Promptfoo](https://registry.npmjs.org/promptfoo/0.123.1). Các số ở bảng là pin đã chạy, không phải yêu cầu dùng một nhánh `latest` khi tái hiện.

Môi trường quan sát là Node `24.19.0`, macOS arm64, pnpm `11.19.0`. Lockfile giải `better-sqlite3` thành `12.11.1`. Cài với `--ignore-scripts` ban đầu thiếu native binding; sau khi cho phép riêng build `better-sqlite3`, SQLite saver chạy được. [Frozen-install log](../spikes/phase2/evidence/frozen-install.log) ghi lần xác minh lockfile sau setup, không phải một lần cài sạch trên máy khác.

[Peer check](../spikes/phase2/evidence/peer-check.txt) còn hai cảnh báo dependency gián tiếp: `nunjucks` muốn `chokidar ^3.3.0` nhưng nhận `5.0.0`; `mongodb` muốn `gcp-metadata ^7.0.1` nhưng nhận `9.0.4`. Các đường local được thử vẫn chạy; spike không xác minh mọi integration tùy chọn trong dependency tree. Đây là một lý do giữ framework ngoài dependencies bắt buộc của runtime hiện tại.

## LangGraph: checkpoint và tác động bên ngoài

Spike dùng `SqliteSaver`, `thread_id` cố định theo scenario và `durability: "sync"`. Hai nhánh chạy trong cùng super-step: một nhánh thành công, nhánh còn lại thất bại có chủ đích. Process mới tạo lại graph rồi gọi `invoke(null, config)` để tiếp tục. Tài liệu chính thức mô tả persistence theo thread và pending writes cho các nhánh thành công; SQLite được giới thiệu cho workflow local/thử nghiệm. [LangGraph checkpointers](https://docs.langchain.com/oss/javascript/langgraph/checkpointers).

| Scenario | Kết quả quan sát |
|---|---|
| `restart-checkpoint` | Process mới có PID khác đọc được checkpoint cũ và hoàn tất graph |
| `successful-sibling-reuse` | Nhánh thành công chạy 1 lần; nhánh lỗi chạy 2 lần; join có đủ kết quả |
| `ambiguous-effect-naive-duplicate` | SIGKILL sau khi counter bên ngoài đã tăng, trước receipt/node completion; resume làm counter tăng lần thứ hai |
| `ambiguous-effect-ledger-block-reconcile` | Ledger riêng còn STARTED nên resume bị chặn với `RECONCILIATION_REQUIRED`; sau bước đối soát fixture độc lập, receipt được dùng lại và counter vẫn bằng 1 |

[langgraph-results.json](../spikes/phase2/evidence/langgraph-results.json) chứa PID, checkpoint ID, status/signal của từng process, event logs và toàn bộ các lần lỗi có chủ đích. Pending writes của nhánh thành công là kết quả node được framework lưu, không đồng nghĩa operation side effect đã có commit/receipt của dự án.

Ca naive chứng minh giới hạn trực tiếp trên bản đã pin: framework checkpoint không làm thao tác ngoài process tự có exactly-once semantics. Ledger trong ca guarded là mã ứng dụng bổ sung. Việc đối soát dựa trên counter fixture với một writer và postcondition biết trước; chưa chứng minh cách đối soát mọi tool, concurrent writers, mạng hoặc Unity. Process crash đã được thử bằng SIGKILL; mất điện, filesystem corruption và đổi workflow version chưa nằm trong spike này.

## Promptfoo: Node API và CLI/CI

Spike dùng một provider JavaScript cục bộ trả candidate đã định trước, một assertion deterministic và chín records. Provider/assertion không đọc nhãn oracle. Dataset, provider, assertion và config được hash trước eval trong [fixture-lock.json](../spikes/phase2/promptfoo/fixture-lock.json); runner từ chối drift và kiểm số ca trả về.

Node API dùng `evaluate()` rồi xuất `toEvaluateSummary()`. CLI dùng cùng config với `--no-cache --no-write --no-share`, concurrency 1 và output JSON. Tài liệu chính thức hỗ trợ API này, JavaScript assertions và export qua CLI. [Node API](https://www.promptfoo.dev/docs/usage/node-package/), [JavaScript assertions](https://www.promptfoo.dev/docs/configuration/expected-outputs/javascript/), [CLI](https://www.promptfoo.dev/docs/usage/command-line/).

| Chỉ số trên mỗi chế độ API hoặc CLI | Quan sát |
|---|---:|
| Tổng ca | 9 |
| Valid được nhận | 3 / 3 |
| Invalid bị từ chối | 3 / 3 |
| Ambiguous giữ UNKNOWN, không được nhận | 3 / 3 |
| False accept trên ca invalid | 0 / 3 |
| False reject trên ca valid | 0 / 3 |
| Ambiguous được nhận sai | 0 / 3 |
| Lỗi adapter trong run hoàn tất | 0 |

Raw CLI trả **100** vì sáu candidate invalid/ambiguous không đạt acceptance assertion. Wrapper trả 0 khi các quyết định đó khớp oracle, không biến sáu ca thành accepted. Cách phân biệt này cần giữ khi nối vào CI; không coi pass rate thô của bộ cố ý chứa negative cases là độ đúng của gate. Quy ước exit code 100 cho assertion failures được mô tả trong [CLI chính thức](https://www.promptfoo.dev/docs/usage/command-line/).

Kết quả chi tiết ở [promptfoo-results.json](../spikes/phase2/evidence/promptfoo-results.json), [API export](../spikes/phase2/evidence/promptfoo-api-results.json) và [CLI export](../spikes/phase2/evidence/promptfoo-cli-results.json). Khi tích hợp API, relative provider path ban đầu được resolve từ working directory; worker riêng đã cố định cwd vào thư mục config để API/CLI dùng cùng file. Không thay oracle hoặc assertions sau lỗi setup này.

Không có model calls, model tokens hay model cost trong các run. Dữ liệu nhỏ và deterministic chỉ kiểm wiring, cách giữ UNKNOWN, thống kê và xuất evidence. Không thể suy false-accept production bằng 0, chất lượng semantic judge, hiệu quả multi-agent hay lợi ích skill từ chín ca này. Local CLI đã chạy ở chế độ phù hợp CI; chưa có hosted CI job được triển khai.

## So sánh với bounded runner của dự án

Sau fresh build, chạy riêng `dist/test/runtime-recovery.test.js` trên macOS: **10 tests chạy, 10 đạt, 0 lỗi, 0 skip**. [native-results.json](../spikes/phase2/evidence/native-results.json) ghi source hashes, lệnh, môi trường và mapping scenario; [native-recovery.tap](../spikes/phase2/evidence/native-recovery.tap) giữ output kiểm tra. Các source pins được so trước/sau run để tránh gắn kết quả vào một phiên bản code đang đổi.

| Yêu cầu chung | LangGraph spike đã quan sát | Native runner đã quan sát |
|---|---|---|
| Tiếp tục từ process mới | SQLite checkpoint đọc lại được | Fresh process hoàn tất queued checkpoint; workflow version sai bị từ chối |
| Giữ nhánh đã thành công khi nhánh khác chưa xong | Pending writes giữ nhánh thành công sau sibling failure | Sau hard crash, owner mới dùng lại branch a; callback sẽ ném lỗi nếu branch đã commit bị chạy lại; tổng planner attempts là 3 |
| Crash sau effect, trước commit | Graph đơn thuần tạo 2 counter effects | Sau `after-worker`/`before-commit` crash: một dispatch, một attempt và inode output giữ nguyên; resume tiếp không redispatch |
| Receipt/timeout cần đối soát | Ledger bổ sung chặn đến khi reconcile; tổng 1 counter effect | Timeout sau effect tạm dừng; resume xác minh effect và giữ một dispatch; workspace drift khác target sau crash chặn commitment |
| Ownership giữa process | Ngoài phạm vi LangGraph spike | Control directory thứ hai không vượt được lock canonical của workspace |
| Cancel và workspace drift | Ngoài phạm vi LangGraph spike | Cancel dừng worker và không tự resume; drift trước dispatch chặn execution |

Hai bộ kiểm dùng cùng tiêu chí recovery nhưng không dùng cùng thao tác: LangGraph tăng counter SQLite; native worker ghi file deterministic. Vì vậy đây là đối chiếu hành vi, không phải benchmark tốc độ hoặc tuyên bố hai runtime tương đương. Không tạo một chế độ native cố ý bỏ ledger để lặp lại ca unsafe; ca naive duplicate chỉ chạy ở graph spike.

Lựa chọn hiện tại được ghi ở [ADR 0002](adr/0002-phase2-runtime.md): native SQLite + bounded broker cho Phase 2; LangGraph giữ vai trò ứng viên orchestration adapter, Promptfoo là adapter eval/CI tùy chọn. Operation ledger, protected stores, sandbox, scope và active-policy checks vẫn bắt buộc với mọi lựa chọn framework. Chưa kiểm Unity, tool tùy ý, semantic judge có phí, mất điện hay vận hành đa máy trong các kết quả trên.

## Tái hiện và phạm vi giữ lại

Từ repo root, chạy các lệnh trong [README spike](../spikes/phase2/README.md). Installation/native build có thể dùng mạng để tải package; các child processes thử nghiệm được cấp môi trường tối thiểu, tắt telemetry/tracing và có guard chặn Node network APIs. Guard đó không phải OS sandbox hay cơ chế isolation production. Runtime database nằm trong `.runtime/` được ignore; JSON evidence được giữ để review. Không gọi `share`, tạo cloud resources, nạp secrets hay dùng Unity.

Đối chiếu native có thể tái hiện bằng `./scripts/dev.sh exec node spikes/phase2/native/run.mjs`; script build lại app và chạy riêng recovery tests, không dựng runtime thay thế. Workflow [check.yml](../.github/workflows/check.yml) đã được chuẩn bị cho `macos-26`, gồm app checks và framework spikes. Chưa có bằng chứng workflow đó được thực thi trên GitHub; các kết quả trong tài liệu là chạy local.
