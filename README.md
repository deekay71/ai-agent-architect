# AI Agent Architect — runtime, Memory và Context local

Repo có foundation **Phase 1**, runtime **Phase 2** và phần Memory/Context local của **Phase 3**. T09/T10 đạt Done / Pass trong phạm vi local; **T19 Doing / Not evaluated, T11 Doing / Replan, T14 Doing / Not evaluated; toàn Phase 3 chưa PASS**. Context mechanics và Memory promotion đã có code/tests, nhưng T19 còn AC chất lượng/token thật; handoff T14 chờ T19 được nghiệm thu đầy đủ. Chưa mở Phase 4 hoặc gameplay. Xem [báo cáo Phase 3](docs/phase-3-report.md).

Runtime lưu checkpoint/operation ledger trong SQLite, bảo vệ executor bằng sandbox macOS, giữ khóa OS theo project và cấp gate theo từng stage. Memory bổ sung nguồn/claim có provenance, freshness và selective invalidation; Context tách window theo agent, hydrate constraints/acceptance sau compaction và kiểm source hiện hành trước dispatch/commit. Tool hiện tại chỉ ghi một file fixture có giới hạn rồi kiểm lại bằng một verifier process độc lập.

Phạm vi gồm 26 contracts phiên bản `0.5.0`, canonical hashing, audit liên kết giữa records, mô hình phân quyền actor/store và catalog có pin nội dung. CLI có demo offline và thử lựa chọn skill theo metadata. Các record policy, evidence và verdict trong demo đều là dữ liệu tổng hợp của fixture.

Runtime chỉ hỗ trợ macOS đã kiểm chứng; host khác từ chối chạy. Active policy của demo chỉ bao phủ `runtime.fixture`, chưa cấp quyền production/Unity. HTTP model adapter là cổng JSON tùy chọn, được test với server local; đã có OpenAI adapter và phân vai Astra/Luna nhưng chưa gọi provider thật. Multi-planning có critic/calibration, Unity và game vẫn chưa triển khai. `demo` Phase 1 giữ `dispatchAuthorized: false`.

Explorer local có graph/backlinks và panel kiểu Obsidian, chỉ đọc snapshot đã lọc scope; góp ý được tải thành proposal, không ghi Memory chuẩn. Benchmark R1 giữ nguyên 6 false accepts; R2 có 0 false accepts và 78 false rejects trên 540 trials, nhưng là regression trên bộ đã lộ. Cần holdout độc lập mới cùng provider/model/tokenizer/cost/calibration trước khi đóng T11. Baseline clean-source check đạt **327/327 tests, 0 fail, 0 skip**; [evidence](docs/evidence/phase3/final-clean-verification.md) giữ cả lần đầu lỗi fixture timing. Không suy test count thành quality gate.

## Benchmark và test plan Phase 3

Đợt tiếp theo theo quyết định **chỉ chạy local** đã đạt **384/384 tests**, chạy đủ 960 comparison +120 control trials với mock: [test plan](docs/phase-3-test-plan.md), [kế hoạch đóng gate](docs/phase-3-closure-plan.md), [báo cáo và evidence mới](docs/phase-3-closure-report.md). Adapter OpenAI có token-count/structured output/usage accounting và spend ledger; profiles planning dùng `gpt-6-astra`, execution dùng `gpt-6-luna`. Phân vai này mới là cấu hình khởi điểm, chưa đo chất lượng model.

```sh
./scripts/dev.sh build
./scripts/dev.sh exec node dist/src/cli.js semantic-preflight fixtures/semantic-benchmark fixtures/semantic-config/local.json
mkdir -p .local
./scripts/dev.sh exec node dist/src/cli.js semantic-run fixtures/semantic-benchmark fixtures/semantic-config/local.json .local/semantic-dev-first .local/semantic-spend-first
```

Lệnh mẫu dùng mock sandbox không đọc API key hoặc gọi mạng. Dùng output directory mới mỗi run, giữ cùng spend directory cho cùng authorization để không reset budget. Mock counter là byte/4, reader luôn abstain; số token/quality model thật vẫn chưa đo. Chạy build ngay trước CLI, giữ hash build/source đi cùng evidence. Live chỉ được mở ở một đợt được cấp budget riêng, sau review/khóa protocol; không bật trong đợt local này.

## Thiết lập

Cần Node.js **24.x**, pnpm **11.19.0**; runtime tests cần macOS có `/usr/bin/sandbox-exec` và `/usr/bin/python3`. Chạy trong thư mục repo:

```sh
./scripts/dev.sh install --frozen-lockfile --ignore-scripts
./scripts/dev.sh check
```

Lệnh đầu cài đúng lockfile và bỏ lifecycle scripts của dependencies. Bước cài có thể cần mạng để tải dependencies; các demo bên dưới chạy offline. `scripts/dev.sh` dùng Node/pnpm có trong `PATH`; nếu chưa tìm thấy Node, script có thể dùng runtime Node đi kèm Codex trên máy này. Script không cài hay thay Node hệ thống.

`check` chạy TypeScript build rồi bộ tests. Dependencies trực tiếp được pin gồm TypeScript `5.9.3` và Zod `4.1.12`; danh sách đầy đủ nằm trong `package.json` và lockfile. Không cần API key, Unity Editor hay model server để chạy các fixture local hiện có.

## Chạy CLI

Sau `check` hoặc `./scripts/dev.sh build`:

```sh
# Runtime ghi fixture thật, chỉ dùng thư mục mới; không cần model key/Unity
mkdir -p .local
./scripts/dev.sh exec node dist/src/cli.js runtime-demo .local/phase2-demo

# Đọc trạng thái/tiếp tục từ durable checkpoint
./scripts/dev.sh exec node dist/src/cli.js runtime-status .local/phase2-demo/candidate .local/phase2-demo/control fixture-run
./scripts/dev.sh exec node dist/src/cli.js runtime-resume .local/phase2-demo/candidate .local/phase2-demo/control fixture-run

# Memory/Context fixture và inspector local chỉ đọc; dùng thư mục demo mới
./scripts/dev.sh exec node dist/src/cli.js memory-demo .local/phase3-memory-demo
./scripts/dev.sh exec node dist/src/cli.js memory-view .local/phase3-memory-demo/snapshot.json .local/phase3-memory-demo/scope.json 0 .local/phase3-memory-demo/context-windows.json

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
| `src/memory/` | SQLite/FTS, source/claim lifecycle, independent promotion, dependency invalidation và Markdown export |
| `src/context/` | Window/manifest, progressive skill loading, budget/compaction và current-source runtime guard |
| `src/explorer/` | Graph/trace projection đã lọc scope, loopback HTTP chỉ đọc và proposal download |
| `src/benchmark/` | Retrieval/reader/context fixture benchmark, oracle riêng và C# syntax spike giới hạn |
| `src/cli.ts` | CLI và các demo fixture |
| `fixtures/` | Dữ liệu thử, authority tổng hợp và resource skill trơ |
| `test/` | Kiểm schema, liên kết, negative cases, catalog và CLI |

Đọc [báo cáo Phase 3](docs/phase-3-report.md), [hướng dẫn Memory/Context/Explorer](docs/memory-context.md), [benchmark và phần T11 còn mở](docs/phase3-benchmark.md), [hướng dẫn runtime](docs/runtime.md) và [kiến trúc](docs/architecture.md). [Báo cáo Phase 2](docs/phase-2-report.md), [framework spikes](docs/phase-2-framework-spikes.md) và [contracts v0.5](docs/contracts-v0.5.md) được giữ làm nguồn đối chiếu.

## Ranh giới trust

`AuditAuthority` là dữ liệu fixture được caller inject riêng với candidate bundle. Demo kiểm records đối chiếu với snapshot này; tên actor, hash hay một chuỗi `PASS` do candidate tự khai không tạo ra authority. Cấu hình đó chưa phải nguồn trust được bảo vệ bằng process, tài khoản hoặc filesystem trong production.

Trong Phase 2, executor là process bị sandbox, không truy cập kho authority/evidence/verdict hoặc code verifier. Policy owner, verifier coordinator và Gate Controller là các vai trò trong trusted broker; chưa tách thành service/tài khoản riêng. Cấu hình operator và máy chủ tin cậy nằm ngoài threat model của candidate. Khóa không có TTL takeover; kết quả không rõ phải reconcile hoặc giữ UNKNOWN/quarantine.

Context receipts chỉ chứng minh byte nằm trong packet local; chưa chứng minh provider đã nhận/đọc. Accounting mặc định dùng byte UTF-8 local, không phải token provider. `revalidateBeforeUse` vẫn UNKNOWN nếu chưa có fetch adapter thật. Explorer không mở database để ghi và file import không được tự nhận là kết nối live.

LangGraph và Promptfoo được pin/cài trong `spikes/phase2`, tách khỏi dependencies runtime chính. Chạy spike bằng `sh spikes/phase2/run.sh install --frozen-lockfile` rồi `sh spikes/phase2/run.sh run check`; chỉ native build `better-sqlite3` được cho phép. Kết quả fixture không chứng minh model quality. Sau khi đóng gate Phase 3 mới tiếp tục planning/calibration, Unity/T22, rồi gameplay.

Mốc đồng bộ hiện tại: remote `main` còn ở Phase 1; Phase 2 và thay đổi Phase 3 đang local, chưa push. Snapshot/report lịch sử được giữ riêng; commit và liên kết cloud cuối sẽ được cập nhật sau xác minh.
