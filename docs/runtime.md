# Runtime Phase 2

Phạm vi triển khai là một broker local, một project/workspace, các thao tác `fixture.write-once` được plan cho phép và verifier content hash độc lập. Đây là slice kiểm cơ chế runtime trước khi gắn Unity. Tất cả task classes ngoài `runtime.fixture` bị policy của demo từ chối.

## Cách vận hành

Chạy `./scripts/dev.sh check` trên macOS, sau đó `mkdir -p .local` và `./scripts/dev.sh exec node dist/src/cli.js runtime-demo .local/my-demo`. Thư mục demo phải chưa tồn tại. CLI tạo `candidate/src`, kho `control/runtime.sqlite`, `request.json`, cài authority fixture qua thao tác operator và thực thi một run. Output CLI chỉ có trạng thái, số dispatch/attempt và checkpoint ID.

Các lệnh bổ sung:

```sh
node dist/src/cli.js runtime-submit <workspace> <control> <request.json>
node dist/src/cli.js runtime-resume <workspace> <control> <run-id>
node dist/src/cli.js runtime-status <workspace> <control> <run-id>
node dist/src/cli.js runtime-reconcile <workspace> <control> <run-id>
node dist/src/cli.js runtime-recover <workspace> <control>
```

`submit` nhận task/plan/context và operation candidates. Nó không nhận authority, policy, embedded PASS hay đường dẫn executable. Cấu hình authority được operator cài bằng `PersistentWorkflowRunner.configure`, lưu ngoài workspace. `SIGINT`/`SIGTERM` khi đang `resume` hủy worker hiện tại, đợi xác nhận nhóm process dừng rồi mới thả ownership.

`resume` dùng lại kết quả đã commit, đối soát thao tác đã bắt đầu và chỉ dispatch intent chưa chạy. `retryAttempt` không retry thao tác có thể đã gây effect; adapter hiện tại yêu cầu reconcile. `replay` cần lời gọi explicit, run ID/operation IDs mới và lineage mới. `replan` dùng lineage cũ nên không reset số dispatch, planner attempts hoặc replan đã tiêu. Không replan khi còn effect chưa đối soát.

Sau cancel chủ động, `reconcile` chỉ đọc/kiểm effect cũ, không chạy operation mới và vẫn giữ trạng thái cancelled. `runtime-recover` xử lý ownership sau broker crash; không giết process hoặc xóa marker chưa rõ. Nó từ chối nếu owner/helper/worker PID hoặc process group còn tồn tại. Khoảng crash sau ghi dispatch-pending nhưng trước đăng ký PID cần kiểm tra thủ công; không có lệnh “force unlock” tự động.

## Lưu trữ và ranh giới quyền

SQLite dùng WAL và `synchronous=FULL`. Artifact canonical JSON là immutable theo digest; operation result, checkpoint và refs được commit trong cùng transaction. Run/checkpoint pin schema `0.5.0` và workflow `durable-fixture/1`; không có migration ngầm. Event log chứa IDs, states, counters và reason codes, không chứa arguments/raw tool output. Request và artifact trong protected store vẫn chứa dữ liệu tác vụ; đây không phải kho đã mã hóa.

Control root phải tách khỏi workspace. Project lock được định vị theo canonical workspace trong `~/.local/state/ai-agent-architect/project-locks`, nên đổi control root không vượt được khóa. Broker queue tuần tự hóa các run trong cùng process; OS flock chặn process khác, kể cả owner bị pause. Khóa ổn định không bị unlink; không dùng lease expiry làm bằng chứng owner đã chết.

Executor chỉ được đọc fixed entry point và ghi directory parent của target đã qua task/manifest/subplan scope. Không cấp network, child process, signal process khác, protected store hoặc verifier code. Env được scrub; stdout/stderr giới hạn. Verifier là process khác, chỉ có quyền đọc target và nhận oracle từ stdin của broker. Gate Controller tin receipt do broker ghi sau invocation thực, không tin issuer/exit code do executor tự khai.

`sandbox-exec` là cơ chế macOS đã được đánh dấu deprecated; phiên bản host mới phải chạy lại conformance. Không có fallback không sandbox. Chưa cung cấp Linux/Windows/container backend, sandbox cho code arbitrary nhiều file, hoặc bảo vệ trước operator/root/kernel bị xâm phạm. Workspace/authority do host khác sửa liên tục trong lúc chạy nằm ngoài model single-owner; drift bình thường, symlink và hardlink được từ chối.

## Effect và gate

Trước effect: validate coverage 1 operation cho mỗi step, thứ tự step/subplan dependencies, allowed capability, current snapshot, implementation digest, skill pins; ghi PREPARED rồi STARTED và budget. Sau đó mới đăng ký worker PID và gửi request stdin. Operation ID giữ nguyên; attempt/call ID riêng. Cùng ID khác payload bị từ chối.

Worker ghi file qua temporary file, fsync và link không overwrite. Sau response hoặc phục hồi crash, broker kiểm postcondition trên filesystem, so toàn snapshot trước/sau chỉ cho target thay đổi, rồi chạy verifier riêng. Chỉ report đầy đủ expected test IDs/count, không zero/skipped/unknown, đúng subject/checkset/environment/invocation receipt mới có thể tạo post-execution PASS. Gate/policy được lấy từ protected store, đúng stage và current inputs; score không override hard fail.

Skill body/reference chỉ là text; script resource không tự chạy. Runtime resolve/reload pin mỗi lần, kiểm binding khớp profile/environment và actual registered implementation. Descriptor/profile/resource bytes được giữ trong artifact store; binding được nối với ledger và input versions của pre/post gates. Chưa certified upstream skill hoặc đo skill benefit; đó là T24/T25.

## Planning và ngân sách

`planBranches` là primitive dành cho trusted read-only adapter callbacks; mỗi branch thành công được commit ngay và dùng lại sau restart. Input digest/manifest đổi thì từ chối reuse. Callback có timeout/AbortSignal; kết quả tới muộn không được commit. Đây chưa phải sandbox cho arbitrary planner code hoặc pipeline specialist/synthesizer/critic của T12/T20.

Run/checkpoint lưu các counters dispatch/planner/replan. Fixed tool không gọi model nên usage của tool là 0 có provenance. Với generic planning callbacks, token/cost là UNKNOWN; runtime không dispatch từ đường này (`PLANNER_USAGE_UNMETERED`) trước khi có metered model integration. HTTP JSON adapter có allowlisted origin, timeout, size cap và schema validation, được kiểm bằng server local; chưa cấp paid-provider credentials hay model policy release.

## Giới hạn của benchmark

Runtime policy fixture chứa campaign 80 validator calls trên hai failure families, với các shape lặp lại. Confusion matrix và công thức Wilson được kiểm lại từ artifacts pin; các số này chỉ mô tả mẫu fixture, không ước lượng chất lượng model hoặc population false-pass rate. Promptfoo spike có 9 cases gồm valid/invalid/ambiguous, và giữ UNKNOWN ở lớp ứng dụng. Semantic/model/human calibration cùng held-out task diversity thuộc T20. T22 chưa PASS và game chưa được mở.
