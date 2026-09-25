# Memory, Context và inspector local

Phase 3 bổ sung kho kiến thức có nguồn gốc, cửa sổ context riêng cho từng agent và giao diện kiểm tra chỉ đọc. Các fixture hiện tại kiểm tra cơ chế local; chúng chưa đo chất lượng model, token/cost của provider hoặc thao tác Unity. Tiêu chí còn mở được ghi ở [kế hoạch Phase 3](phase-3-plan.md) và [benchmark](phase3-benchmark.md).

## Dùng inspector

Từ repository root, tạo một thư mục demo mới rồi mở file snapshot:

```sh
./scripts/dev.sh run build
./scripts/dev.sh exec node dist/src/cli.js memory-demo /tmp/architect-memory-demo
./scripts/dev.sh exec node dist/src/cli.js memory-view /tmp/architect-memory-demo/snapshot.json /tmp/architect-memory-demo/scope.json 0 /tmp/architect-memory-demo/context-windows.json
```

Mở URL `127.0.0.1` do lệnh trả về. Demo dùng nguồn hạ tầng tổng hợp, có claim đã duyệt nhưng stale, quan hệ phụ thuộc và các cửa sổ planner/critic. Chọn node để xem nội dung, assertion, lifecycle, freshness và provenance; chọn window để xem nguồn đã đưa vào packet. Hai trạng thái `approved` và `fresh` độc lập: duyệt một claim không làm nguồn của nó luôn mới.

Server chỉ nhận GET/HEAD, scope và đường dẫn file được operator cấu hình khi khởi động. URL hoặc HTTP request không được chọn repo, mở file khác hay ghi database. Nút góp ý tải một proposal JSON với `promotionAuthorized: false`; proposal phải qua quy trình review/promotion riêng. Đổi file Markdown hoặc JSON export không sửa Memory chuẩn.

File input luôn là snapshot, dù JSON tự khai `origin: live`. `loaded` cần ContextWindow đi kèm, đúng packet/manifest/namespace và receipt khớp chính xác byte resource. Nếu bỏ file proof windows, các entry tự khai loaded thành `unknown`. Proof này chỉ chứng minh byte nằm trong packet local được cung cấp; nó không chứng thực người tạo file, không chứng minh nhà cung cấp model đã nhận/đọc nội dung và không biến snapshot cũ thành live Memory.

## Kho Memory và quyền truy cập

API nằm trong [src/memory](../src/memory/index.ts). `MemoryStore(root, options)` nhận principal và namespace từ trusted local broker/operator. Namespace gồm `repoId`, `branchId`, `lineageId`, `allowedPaths`, `taskClasses`; nhánh/lineage chưa đăng ký bị từ chối. Caller không được đưa principal hoặc namespace tùy ý từ văn bản agent vào API này.

SQLite là dữ liệu chuẩn; `knowledge/` chứa Markdown xuất một chiều. Database và thư mục riêng tư được đặt quyền local, authority fingerprint ngăn mở lại cùng database với cấu hình quyền khác. Đây là ranh giới broker local, chưa phải dịch vụ nhiều người dùng có xác thực mạng. Executor không được có quyền đọc/ghi control root hoặc database qua filesystem.

| Thao tác | API và điều kiện chính |
|---|---|
| Nhập nguồn | `ingest` kiểm SourceRecord, raw UTF-8 digest, revision bất biến, scope và lineage nguồn cha. `purpose: holdout` bị từ chối. |
| Tìm kiếm | `query({ namespace, text, limit, expandHops })`; mặc định chỉ current, valid, fresh và claim approved. `includeUnusable` dành cho inspector/diagnostics. |
| Đề xuất claim | `propose(MemoryDelta, namespace, actorId)` pin revision nguồn và phiên bản Memory; proposal không là knowledge đã duyệt. |
| Xác nhận bằng chứng | `recordEvidence` chỉ nhận producer đã đăng ký `verificationRunner`; pin assertion/source/type/scope chính xác. Attestation không tự chứng minh semantic truth. |
| Duyệt và promote | `validate` bởi critic độc lập, sau đó `promote` bởi memoryPromoter; kiểm lại phiên bản/nguồn/evidence/review trước commit. |
| Quyết định | Claim `decision` cần `authorizeDecision` khớp assertion, actor và nguồn loại decision; chuỗi `decisionBy` do candidate viết không đủ. |
| Thu hồi claim | `reviewTransition` rồi `transition`; review gắn đúng payload và expected Memory version. |
| Thu hồi nguồn | `transitionSource` cho stale/quarantined/revoked/deleted, giữ lịch sử và vô hiệu hóa descendant. |
| Gắn phụ thuộc | `registerDependency` cho context/plan/handoff/artifact; parent phải dùng được và đúng scope/digest. Hướng `from` phụ thuộc `to`; invalidation đi từ `to` về `from`. |

`contentDigest` của source/claim là SHA-256 byte UTF-8 nội dung, khác `recordDigest` của record JSON chuẩn hóa. Dependency node lưu digest artifact và không có nội dung có thể tải như source; không biến mọi node trong graph thành resource văn bản.

Nguồn derived mang theo origin gốc. Nhiều bản sao không thành nhiều nguồn độc lập; `minimumIndependentOrigins` là policy cấu hình dựa trên provenance được broker cung cấp. Cơ chế này không tự phát hiện mọi bản sao hoặc nguồn giả trên Internet. Cạnh inferred được hiển thị khác explicit, không mở rộng retrieval như explicit; khi nguồn liên quan mất hiệu lực, descendant bị chặn với trạng thái bất định.

`pinned` giữ revision; `live` dùng thời gian/maxAge đã cấu hình. `revalidateBeforeUse` hiện giữ `unknown`: chưa có adapter lấy nguồn mạng thật. `refreshSource` chỉ hỗ trợ adapter mock. Làm nguồn mới trở lại không tự khôi phục các claim/context/plan/handoff đã bị vô hiệu hóa; cần xét lại và dựng artifact mới đúng pin.

## Cửa sổ context và compaction

[Context engine](../src/context/engine.ts) nhận `ContextAuthority` từ TaskSpec, policy, model config và registry nguồn hiện hành do broker quản lý. `ContextRequest` chỉ chọn agent/window, resource refs, lịch sử và unknown bổ sung. Resource chưa được pin, không đúng project/path/task class/branch/lineage hoặc không đủ mới bị chặn trước khi gọi loader.

`buildContextWindow(authority, request, loader, counter?)` trả `{ status, issues, packet, packetDigest, windowDigest }`. Packet chứa toàn bộ typed TaskSpec, constraints và acceptance criteria; evidence giữ raw byte hash/revision cùng manifest, receipt và load trace. Resource và lịch sử luôn có mức tin cậy dữ liệu (`instructionAuthority: none` / `untrusted-data`), kể cả khi văn bản tự yêu cầu cấp quyền hoặc tuyên bố đã PASS.

`compactContextWindow(previous, authority, {windowId, summary}, loader)` chỉ thay phần lịch sử có thể nén. Broker phải đăng ký `pinContextPredecessor(previous)` từ window do chính nó phát hành/lưu giữ vào protected predecessor store. Không lấy pin từ candidate tự khai. Window mới nạp lại TaskSpec/constraints/acceptance và source bytes; giữ critical unknown, required resources, provenance và parent digest. Đổi C17 thành câu phủ định nhưng giữ ID không vượt được đối chiếu với canonical TaskSpec.

`validateContextWindow(window, currentAuthority)` kiểm nguồn hiện tại theo đúng dependency đã nạp. Một thay đổi Memory không liên quan không tự làm mọi cửa sổ stale. `validateContextHandoff` thêm kiểm manifest, source versions, scope và downstream acceptance; nó không thay kiểm GateReport/policy/runtime authority.

Counter mặc định `utf8ByteCounter` dùng **đơn vị byte UTF-8 local**, không phải token provider và không được coi là upper bound chung cho mọi tokenizer. Toàn bộ serialized packet được tính, gồm metadata, source bytes, tool outputs, history, receipt, load trace và budget report. Policy dành riêng output reserve/headroom và kiểm model max output. Có thể truyền counter deterministic gắn đúng model/version khi có tokenizer tương ứng; usage/cost provider vẫn phải đo riêng. Nếu phần bắt buộc không vừa, window giữ nguyên nội dung và trả `blocked`; engine chỉ bỏ resource tùy chọn với lý do rõ trong bundle/load trace.

[Skill context adapter](../src/context/skills.ts) tạo pins/loader từ catalog thật: descriptor trước, body sau, reference khi cần. Mỗi lần tải kiểm lại source digest, selection, profile và environment. Scripts không được xuất thành guidance và skill không tự mở capability hoặc dispatch.

## Bắt buộc kiểm context trước runtime dispatch

[Runtime guard](../src/context/runtime-guard.ts) là seam trusted host, không phải tham số candidate. Operator dựng window, pin planning records đúng window rồi cài guard:

```ts
const guard = createRuntimeContextGuard({
  guardId: 'project-context/1',
  window: issuedWindow,
  currentAuthority: () => readCurrentBrokerAuthority(),
});
runner.attachContextGuard(guard);
await runner.configure({ ...operatorRuntimeConfig, contextGuard: guard.pin });
// request.records.task/manifest/context phải đúng canonical records trong issuedWindow.
await runner.submit(request);
await runner.resume(request.runId);
```

`readCurrentBrokerAuthority()` phải thực sự đọc registry Memory hiện hành trong namespace được phép ở **mỗi lần gọi**, lấy chính xác revision/content digest của source hoặc approved claim còn usable. Không trả lại bản authority cũ đã chụp lúc build; loại nguồn missing/stale/revoked/quarantined/invalidated hoặc ngoài scope. Với source gốc, `sourceRefs: [node.id]` diễn đạt nguồn chính nó; với claim/derived, giữ provenance đã kiểm scope. Không lấy resource text hay callback từ executor. Ví dụ thực thi đầy đủ nằm trong [runtime-context.test.ts](../test/runtime-context.test.ts).

Guard là handle process-local do factory phát hành, object tự khai callback PASS không hợp lệ. Required pin nằm trong protected RuntimeConfig và được chụp vào RunRecord tại submit; đổi/bỏ marker sau đó không vô hiệu hóa yêu cầu đã pin. Khi restart, operator cần cài lại đúng handle/window/provider; thiếu hoặc sai guard sẽ block.

Runner kiểm exact TaskSpec/manifest/bundle, current context lúc resume, trước mỗi dispatch mới và trước commit/reconciliation. Sau các callback bất đồng bộ, guard được kiểm lại: sau prepared; trong handshake khi PID đã đăng ký nhưng worker chưa nhận stdin; và sau before-commit trước post-execution gate/commit. Guard thành công được gắn vào subject/evidence của gate pre-dispatch hiện có; không có ledger hoặc gate thứ hai. Guard thất bại chặn trước hiệu ứng mới. Hiệu ứng cũ đã xảy ra có thể còn cần reconciliation sau khi context được xây/dàn xếp lại; không được blind retry.

Đây là admission tại thời điểm broker đọc snapshot, không phải giao dịch nguyên tử phân tán giữa Memory, filesystem và mọi hệ thống bên ngoài. Callback, issued-window store, principal và operator config là trusted boundary local. Run lịch sử không có marker vẫn là Phase 2 fixture giới hạn; nó không có cam kết kiểm live Memory. Policy hiện hành chỉ cho phép mechanical `runtime.fixture`, không cấp quyền cho Unity hoặc gameplay.

## Kiểm chứng và giới hạn

Các regression nằm trong [Context](../test/context.test.ts), [skill loading](../test/context-skills.test.ts), [Memory integration](../test/context-memory.test.ts), [runtime admission](../test/runtime-context.test.ts) và [Explorer integration](../test/explorer-integration.test.ts). [Review Context/Memory](review-phase3-context-memory.md) ghi lỗi và trạng thái sửa; [review độc lập Context/Explorer](review-phase3-memory-explorer.md) được thực hiện bởi agent khác. Kết quả campaign, protocol/split và phần semantic acceptance chưa đo được ghi riêng trong [benchmark](phase3-benchmark.md). Số test xanh không tự chứng minh plan, model hoặc game đã đạt quality gate.
