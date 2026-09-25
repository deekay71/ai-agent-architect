# Review chéo Phase 3 — Memory và Explorer

Ngày 25/09/2026. Reviewer triển khai Context engine và runtime context guard, vì vậy không tự nhận đánh giá độc lập hai phần đó. Review độc lập này đọc Memory/Explorer do agent khác viết, tái hiện lỗi bằng namespace hẹp, source revision, dependency graph và imported trace. Phạm vi là cơ chế local, chưa đánh giá model, Unity hoặc production.

## Finding

| Mức | Trigger và hậu quả | Sửa và bằng chứng |
|---|---|---|
| P1 — nguồn ẩn lọt qua namespace hẹp | Dùng source binding/private parent cùng repo/branch/lineage nhưng khác path/task scope trong ingest derived, proposal hoặc dependency registration. Có thể đưa nội dung/quan hệ ngoài scope vào artifact công khai. | Đã sửa: kiểm `fits(parent.namespace, requestedNamespace)` tại các đường materialize/bind. Regression `narrow context namespace...` và `claim proposals cannot smuggle...` đã chạy thành công. |
| P1 — revision mới có thể thay head ngoài scope | `ingest` nguồn r2 trong `src/public`, dùng sourceId của head r1 thuộc `src/private`; trước sửa API chấp nhận và supersede/invalidate source ẩn cùng descendant. | Đã sửa trong SQLite transaction: head cũ không nằm trong requested scope bị từ chối trước mutation. Regression `narrow ingestion cannot supersede...` ban đầu thất bại với `Missing expected exception`, sau sửa chạy thành công, head riêng vẫn current và valid. |
| P2 — Markdown export trộn scope | Export rộng rồi export hẹp dùng chung thư mục theo repo/branch/lineage; file của scope riêng vẫn nằm trong thư mục hẹp. | Đã sửa: thư mục dùng digest toàn bộ namespace. Regression xác nhận hai directory khác nhau và nội dung riêng không có trong directory hẹp. |
| P2 — nhãn cạnh né invalidation | DependencyInput cho phép `supersedes`/`conflicts_with`, trong khi invalidation chỉ đi theo dependency kinds. Context/plan/handoff có thể giữ trạng thái usable sau khi parent hỏng. | Đã sửa: registration chỉ nhận dependency kinds. Regression chặn hai nhãn này; chuỗi source→context→plan→handoff bị invalidated khi revoke source. |
| P2 — JSON trace tự nhận loaded | Imported Explorer DTO chỉ cần receiptRef/digest không rỗng và expected/actual hash bằng nhau để được hiển thị loaded, dù không có packet/receipt thật. | Đã sửa: `projectExplorer` mặc định không tin loaded; cần proof windows riêng, đối chiếu packet/manifest/scope/receipt/byte resource. Integration kiểm không proof→unknown; có exact packet proof→loaded. Receipt giả bị từ chối cả khi tính lại outer hashes. |

Các regression độc lập nằm trong [test/context-memory.test.ts](../test/context-memory.test.ts). Review code cũng kiểm đường source freshness, decision authorization, review/promotion và invalidation; việc không tìm thêm lỗi trong phạm vi này không là chứng nhận toàn bộ hệ thống.

## Các thay đổi liên quan do reviewer khác yêu cầu

Root yêu cầu Context export phải đối chiếu receipt thật, thay vì chỉ kiểm outer digest; yêu cầu compaction lấy predecessor pin từ protected issued-window store. Agent Memory phát hiện `bundle.excludedItems` có thể đổi lý do cùng độ dài byte rồi reseal nhưng validator cũ vẫn ready. Context đã sửa ba điểm và thêm regression. Đây là review độc lập của họ đối với code Context, không phải reviewer hiện tại tự chấm PASS.

Runtime guard được triển khai theo yêu cầu tích hợp: marker/pin bền vững trong config và run; current authority callback trusted host; thiếu guard sau restart, đổi source, sai scope hoặc đổi exact records đều block. Targeted integration đã thực hiện write trong subprocess thật ở nhánh nguồn hợp lệ và xác nhận zero dispatch/zero output cho nhánh revoke/revision/missing/outscope. Nguồn không liên quan thay đổi không chặn window; nguồn bị revoke giữa hai operation chặn operation tiếp theo. Các kết quả này là kiểm thử của implementer guard, cần đọc cùng review độc lập và full-suite evidence do root tổng hợp.

Agent Memory phát hiện thêm khoảng hở tại ranh giới bất đồng bộ của runner: source có thể bị revoke sau admission nhưng trước worker stdin hoặc trước commit. Đã sửa bằng recheck sau `prepared`, trong worker handshake sau đăng ký PID và callback `started`, và sau `before-commit` trước khi phát post-execution gate. Regression revoke tại prepared/started giữ zero output; revoke sau effect trước commit giữ `OBSERVED`, không có post-execution PASS hoặc COMMITTED. Worker bị từ chối handshake được reap và xác nhận PID/process group đã dừng trước khi clear ownership. Đây là sửa lỗi từ review độc lập đối với phần guard do reviewer hiện tại triển khai.

## Giới hạn báo cáo

- `loaded` nghĩa là byte thuộc serialized local packet có receipt phù hợp; file import không có xác thực issuer, không chứng minh provider/agent đã đọc hoặc hiểu.
- Default accounting là đơn vị byte UTF-8 local trên toàn packet; provider tokens/cost vẫn unknown. Không coi bytes là tokenizer model hoặc upper bound cho mọi model.
- `revalidateBeforeUse` vẫn unknown nếu không có source fetch adapter thật. Mock refresh không chứng minh hỗ trợ nguồn mạng live.
- Authority, principals, source provenance, review attestation và runtime provider callback là trusted broker/operator boundary; API không được expose trực tiếp cho executor hoặc qua inspector HTTP.
- T11 semantic model/calibration và provider usage chưa đo. Fixture/review không cấp release mới, không thay T22; hạ tầng đi trước game.
- Full-suite và campaign cuối do root chạy sau khi source ổn định. Tài liệu này không tự đặt numeric planning score hoặc công bố Phase 3 PASS.
