# AI Agent Architect — foundation và local runtime

Repo có foundation **Phase 1 (T17/T06/T23)** và runtime **Phase 2 (T07/T18/T15)**. Runtime lưu checkpoint/operation ledger trong SQLite, bảo vệ executor bằng sandbox macOS, giữ khóa OS theo project và cấp gate theo từng stage. Tool hiện tại chỉ ghi một file fixture có giới hạn rồi kiểm lại bằng một verifier process độc lập.

Phạm vi gồm 26 contracts phiên bản `0.5.0`, canonical hashing, audit liên kết giữa records, mô hình phân quyền actor/store và catalog có pin nội dung. CLI có demo offline và thử lựa chọn skill theo metadata. Các record policy, evidence và verdict trong demo đều là dữ liệu tổng hợp của fixture.

Runtime chỉ hỗ trợ macOS đã kiểm chứng; host khác từ chối chạy. Active policy của demo chỉ bao phủ `runtime.fixture`, chưa cấp quyền production/Unity. HTTP model adapter là cổng JSON tùy chọn, được test với server local; chưa chọn/call paid provider. Memory, multi-planning có critic/calibration, Unity và game thuộc các phase sau. `demo` Phase 1 vẫn giữ `dispatchAuthorized: false`.

## Thiết lập

Cần Node.js **24.x**, pnpm **11.19.0**; runtime tests cần macOS có `/usr/bin/sandbox-exec` và `/usr/bin/python3`. Chạy trong thư mục repo:

```sh
./scripts/dev.sh install --frozen-lockfile --ignore-scripts
./scripts/dev.sh check
```

Lệnh đầu cài đúng lockfile và bỏ lifecycle scripts của dependencies. Bước cài có thể cần mạng để tải dependencies; các demo bên dưới chạy offline. `scripts/dev.sh` dùng Node/pnpm có trong `PATH`; nếu chưa tìm thấy Node, script có thể dùng runtime Node đi kèm Codex trên máy này. Script không cài hay thay Node hệ thống.

`check` chạy TypeScript build rồi bộ tests. Dependencies trực tiếp được pin gồm TypeScript `5.9.3` và Zod `4.1.12`; danh sách đầy đủ nằm trong `package.json` và lockfile. Không cần API key, Unity Editor hay model server để chạy phạm vi Phase 1.

## Chạy CLI

Sau `check` hoặc `./scripts/dev.sh build`:

```sh
# Runtime ghi fixture thật, chỉ dùng thư mục mới; không cần model key/Unity
mkdir -p .local
./scripts/dev.sh exec node dist/src/cli.js runtime-demo .local/phase2-demo

# Đọc trạng thái/tiếp tục từ durable checkpoint
./scripts/dev.sh exec node dist/src/cli.js runtime-status .local/phase2-demo/candidate .local/phase2-demo/control fixture-run
./scripts/dev.sh exec node dist/src/cli.js runtime-resume .local/phase2-demo/candidate .local/phase2-demo/control fixture-run

# Workflow giả lập: fixture plan, read-only inspection và audit records
./scripts/dev.sh demo

# Cố ý giả mạo issuer; dùng để quan sát chẩn đoán và exit code lỗi
./scripts/dev.sh demo --tamper

# Catalog discovery → metadata eligibility → tải body → draft binding
./scripts/dev.sh exec node dist/src/cli.js skills-demo

# Danh sách contracts và trợ giúp
./scripts/dev.sh exec node dist/src/cli.js contracts
./scripts/dev.sh exec node dist/src/cli.js --help

# Xuất JSON Schema vào thư mục được chỉ định
./scripts/dev.sh schemas ./artifacts/schemas
```

`demo --tamper` cố ý tạo đầu vào sai; exit code khác 0 là hành vi mong đợi của ví dụ đó. `skills-demo` dùng fixture host macOS/Linux và đọc `recipe.md` cục bộ; không thực thi resource script hoặc gọi Unity. Đầu ra có `policyReleaseId: null`, danh sách evidence certification rỗng và `dispatchAuthorized: false`.

Để kiểm một JSON record đã có:

```sh
./scripts/dev.sh exec node dist/src/cli.js validate TaskSpec /duong-dan/task.json
```

`validate` kiểm schema và các điều kiện nội bộ của record. Một JSON hợp lệ vẫn cần audit với records liên quan và kiểm quyền tại runtime trước khi sử dụng để dispatch. JSON Schema xuất ra chỉ mô tả cấu trúc; các Zod refinements và kiểm tra liên kết giữa records không được biểu diễn đầy đủ trong bản xuất.

## Nơi đọc và sửa

| Đường dẫn | Trách nhiệm |
|---|---|
| `src/contracts/` | 26 schema canonical, kiểu dữ liệu và quy tắc hash |
| `src/foundation/audit.ts` | Audit bundle dựa trên authority được truyền riêng |
| `src/foundation/permissions.ts` | Mô hình actor/store và scope đường dẫn |
| `src/foundation/workflow.ts` | Interfaces và workflow mock, không có scheduler production |
| `src/skills/catalog.ts` | Pin catalog/resources, resolver và draft binding |
| `src/runtime/runner.ts` | Trusted broker, state machine, lineage budgets, dispatch/reconcile và fan-out primitives |
| `src/runtime/evaluation.ts` | Stage readiness, policy release validation, verifier semantics và protected gate lookup |
| `src/runtime/store.ts` | SQLite WAL/FULL, immutable artifacts và atomic checkpoints |
| `src/runtime/isolation.ts`, `lock.ts` | Sandbox executor/verifier, OS flock, stop confirmation và quarantine |
| `src/cli.ts` | CLI và các demo fixture |
| `fixtures/` | Dữ liệu thử, authority tổng hợp và resource skill trơ |
| `test/` | Kiểm schema, liên kết, negative cases, catalog và CLI |

Đọc [báo cáo Phase 2](docs/phase-2-report.md), [hướng dẫn runtime](docs/runtime.md), [framework spikes](docs/phase-2-framework-spikes.md), [contracts v0.5](docs/contracts-v0.5.md) và [kiến trúc](docs/architecture.md).

## Ranh giới trust

`AuditAuthority` là dữ liệu fixture được caller inject riêng với candidate bundle. Demo kiểm records đối chiếu với snapshot này; tên actor, hash hay một chuỗi `PASS` do candidate tự khai không tạo ra authority. Cấu hình đó chưa phải nguồn trust được bảo vệ bằng process, tài khoản hoặc filesystem trong production.

Trong Phase 2, executor là process bị sandbox, không truy cập kho authority/evidence/verdict hoặc code verifier. Policy owner, verifier coordinator và Gate Controller là các vai trò trong trusted broker; chưa tách thành service/tài khoản riêng. Cấu hình operator và máy chủ tin cậy nằm ngoài threat model của candidate. Khóa không có TTL takeover; kết quả không rõ phải reconcile hoặc giữ UNKNOWN/quarantine.

LangGraph và Promptfoo được pin/cài trong `spikes/phase2`, tách khỏi dependencies runtime chính. Chạy spike bằng `sh spikes/phase2/run.sh install --frozen-lockfile` rồi `sh spikes/phase2/run.sh run check`; chỉ native build `better-sqlite3` được cho phép. Kết quả fixture không chứng minh model quality. Các phase sau bổ sung Memory/Context, planning/calibration, Unity/T22, rồi gameplay.
