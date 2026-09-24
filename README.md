# AI Agent Architect — nền tảng Phase 1

Repo triển khai **Phase 1 của R2, tương ứng P0 của R1**: T17 (khởi tạo repo và ranh giới module), T06 (contracts và validators), T23 (catalog và resolver skill cơ bản). Mục tiêu hiện tại là kiểm tính nhất quán của dữ liệu bằng schema, fixture và workflow giả lập chạy local.

Phạm vi gồm 26 contracts phiên bản `0.5.0`, canonical hashing, audit liên kết giữa records, mô hình phân quyền actor/store và catalog có pin nội dung. CLI có demo offline và thử lựa chọn skill theo metadata. Các record policy, evidence và verdict trong demo đều là dữ liệu tổng hợp của fixture.

Repo chưa cung cấp quyền dispatch production, process/OS isolation, workflow có persistence/recovery, kết nối model hoặc dịch vụ, Unity adapter, game hay benchmark hiệu quả. `dispatchAuthorized` của demo luôn là `false`. Kết quả `eligible` của resolver chỉ cho biết metadata tương thích; không chứng nhận skill và không cấp quyền chạy.

## Thiết lập

Cần Node.js **24.x** và pnpm **11.19.0**. Chạy trong thư mục repo:

```sh
./scripts/dev.sh install --frozen-lockfile --ignore-scripts
./scripts/dev.sh check
```

Lệnh đầu cài đúng lockfile và bỏ lifecycle scripts của dependencies. Bước cài có thể cần mạng để tải dependencies; các demo bên dưới chạy offline. `scripts/dev.sh` dùng Node/pnpm có trong `PATH`; nếu chưa tìm thấy Node, script có thể dùng runtime Node đi kèm Codex trên máy này. Script không cài hay thay Node hệ thống.

`check` chạy TypeScript build rồi bộ tests. Dependencies trực tiếp được pin gồm TypeScript `5.9.3` và Zod `4.1.12`; danh sách đầy đủ nằm trong `package.json` và lockfile. Không cần API key, Unity Editor hay model server để chạy phạm vi Phase 1.

## Chạy CLI

Sau `check` hoặc `./scripts/dev.sh build`:

```sh
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
| `src/cli.ts` | CLI và các demo fixture |
| `fixtures/` | Dữ liệu thử, authority tổng hợp và resource skill trơ |
| `test/` | Kiểm schema, liên kết, negative cases, catalog và CLI |

Đọc [contracts v0.5](docs/contracts-v0.5.md), [kiến trúc và giới hạn trust](docs/architecture.md), [tiêu chí nghiệm thu Phase 1](docs/phase-1-acceptance.md) và [quy ước catalog fixture](fixtures/skill-catalog/README.md).

## Ranh giới trust

`AuditAuthority` là dữ liệu fixture được caller inject riêng với candidate bundle. Demo kiểm records đối chiếu với snapshot này; tên actor, hash hay một chuỗi `PASS` do candidate tự khai không tạo ra authority. Cấu hình đó chưa phải nguồn trust được bảo vệ bằng process, tài khoản hoặc filesystem trong production.

Phase 2 phải triển khai protected stores, isolation, dispatch-time authorization, operation/checkpoint persistence và recovery thật. Các phase sau mới bổ sung Memory/Context, multi-planning và benchmark, Unity conformance/T22, rồi gameplay. Kết quả conformance của Phase 1 không thay các gate đó. Tình trạng nghiệm thu được ghi riêng sau review và chạy kiểm tra tích hợp; README này không công bố PASS hay một test count cố định.
