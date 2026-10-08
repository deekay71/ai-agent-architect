**Git-source integration (08/10/2026):** This source keeps the [accepted durability repair](docs/portable-durability-20261008.md) and the accepted identity/help work. Offline integration evidence is separate from a publication receipt. Original working-tree evidence below describes its original scope. A Git checkout does not bundle the frozen ZIP or guarantee `releases/` metadata; `identity.frozenRelease: null` means that metadata is absent here. No native Unity, MCP/model binding or broader milestone acceptance is implied.

**Current status, identities and capability owners: [docs/STATUS.md](docs/STATUS.md).** The frozen 06/10 archive below predates the accepted 08/10 portable repair; inspect with `node dist/src/cli.js identity` and `node scripts/verify-portable-identity.mjs`.

**Portable preview 0.2.0-preview.1 is available.** [Setup/prompt/readiness and actual evidence](docs/portable-distribution-20261006.md). Queens testing is paused; native Unity acceptance and M1/T22 gates remain pending.

# AI Agent Architect

R3 hiện cập nhật documentation và planning data contracts/schema tests. Scope này không thêm planning engine, model campaign hoặc Unity run; Unity preflight trước đó vẫn là evidence lịch sử. Schema tests chỉ kiểm cấu trúc/invariant, không chứng minh module admission thật, semantic acceptance hay checklist evidence thực. Phase 3 đã được owner **accepted, conditional closure**; đây không phải production PASS. Chính sách hiện hành chỉ nằm ở [policy](docs/brain-planning-policy.md) và [decision log](docs/decision-log.md).

Policy mặc định là Game/Epic → Module → Task. Main planner khóa core GDD và interfaces trước khi module bắt đầu; chỉ module độc lập mới được planning song song. Critic và test-plan author kiểm chứng độc lập. Ready là bảy điều kiện nhị phân, không còn rubric 85/100. Spike là work item riêng có timebox/token cap/decision record; code spike không merge. Xem [policy](docs/brain-planning-policy.md), [roadmap R3](docs/roadmap-r3.md) và [decision log](docs/decision-log.md).

Task implementation phải atomic: một agent session, automated checks, diff và owner review ≤30 phút. Khi level chưa rõ, chọn level cao hơn. Future milestones chỉ outline; next milestone mới được chi tiết. Task log ghi level, plan version, Ready, spike, execution, replan, return level, owner manual fixes và token receipts.

## Contracts

Platform có 33 contracts: 23 contract R2 vẫn `0.5.0`; `PlanPackage`, `PlanningModeDecision`, `GateReport` và bảy planning-data schemas mới dùng `0.6.0`: `ReadyChecklist`, `SpikeTask`, `InterfaceApproval`, `ChangeRequest`, `PlanningTaskLog`, `GameEpicBrief`, `PlanningWorkItem`. Parsing schemas không cấp executor/planner authority. Chi tiết ở [contracts transition](docs/contracts-v0.5.md).

Runtime, Memory và Context local từ R2 vẫn là nền tảng đã tồn tại; R3 không tuyên bố các phần planning orchestration, Unity adapter hay game đã triển khai. Existing reports và `evidence/*.json` là historical immutable evidence.

Unity adapter và empty Unity project là infrastructure trước T22. Platform gate phải Pass trước Block Puzzle pilot. Round 1 dùng **cùng 10 microtasks hiện có**: A Brain one pass; B A + tối đa hai compile/test repair rounds; C ordinary Codex, cùng Unity CLI, pinned skills và token cap. Task bank 24 là outline future cho scene/prefab + feature. Compaction mặc định và advanced Explorer là experiments; hierarchy với module planners độc lập là default.

## Thiết lập local

Cần Node.js 24.x và pnpm 11.19.0. Trên macOS, runtime tests còn cần `/usr/bin/sandbox-exec` và `/usr/bin/python3`.

```sh
./scripts/dev.sh install --frozen-lockfile --ignore-scripts
./scripts/dev.sh check
```

`check` build TypeScript và chạy tests. Các fixture local không cần API key, Unity Editor hoặc model server.

## CLI local

```sh
./scripts/dev.sh demo
./scripts/dev.sh exec node dist/src/cli.js contracts
./scripts/dev.sh exec node dist/src/cli.js validate TaskSpec /duong-dan/task.json
./scripts/dev.sh schemas ./artifacts/schemas
./scripts/dev.sh exec node dist/src/cli.js identity
./scripts/dev.sh exec node dist/src/cli.js portable help
```

Các lệnh demo chỉ dùng fixtures local; một record parse hợp lệ vẫn cần runtime/policy authorization trước dispatch. Không tự diễn giải test count, schema conformance hoặc historical evidence thành acceptance của planning engine, Unity hay gameplay.
