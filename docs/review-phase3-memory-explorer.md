# Review Phase 3 — Memory, Context và Explorer

Ngày kiểm tra: 2026-09-25. Phạm vi: triển khai local của Phase 3, không đánh giá chất lượng LLM, Unity hoặc khả năng triển khai production. Reviewer triển khai Memory và kiểm tra độc lập Context/skill adapter/Explorer; các kiểm tra chéo Memory do agent Context thực hiện riêng trong `test/context-memory.test.ts`.

## Hai finding độc lập và cách sửa

| Finding | Bằng chứng | Kết quả |
|---|---|---|
| P2 — File snapshot có thể tự khai `origin: live` | `memory-view` chỉ đọc JSON nhưng từng chuyển nguyên trường `origin` vào projection, làm mất cảnh báo dữ liệu chụp tại thời điểm xuất. | Đã sửa: CLI gọi `asFileSnapshot`, bắt buộc `origin: snapshot`; kiểm tra `file input cannot claim a live Memory connection`. |
| P2 — Bundle có thể khai sai lý do loại context | Với cùng authority: tạo window chứa optional ref thiếu; đổi `bundle.excludedItems[0].reason` thành chuỗi cùng số byte; tính lại outer digest. Validator cũ vẫn trả `ready`, dù lý do trong load plan khác. | Đã sửa điều kiện `context.bundle`: so toàn bộ `excludedItems` với các entry excluded/blocked trong load plan. Đã chạy regression cùng authority và kiểm tra kết quả blocked. |

Không phát hiện quyền dispatch mới từ Explorer hoặc skill guidance trong phần code đã đọc. `instructionAuthority: none`, canonical TaskSpec/constraint/acceptance, scope/branch/lineage, pin và load receipt được kiểm tra riêng. Progressive skill loader re-resolve catalog/selection trước mỗi lần tải; script không được xuất thành context guidance. Đây là kiểm tra nội dung packet local, không phải bằng chứng nhà cung cấp model đã đọc nội dung.

## Kiểm tra đã chạy

- **30/30 Memory tests** trên SQLite thật: ingest/revision/history/idempotence; no holdout; exact evidence và independent review; decision authorization; hai connection tranh phiên bản; freshness và mock refresh; derived copies; source → claim → context → plan → handoff invalidation; scope/provenance/Markdown isolation; quyền file và authority fingerprint.
- **50/50 Context/skill/Memory integration/Explorer tests** tại lần kiểm tra độc lập trước hai regression mới: constraints không mất qua compaction, unknown không bị hạ mức, pin đổi chỉ vô hiệu hóa window liên quan, scoped projection, receipt giả bị từ chối, HTTP loopback cố định phạm vi và chỉ đọc.
- **41/41 Context + Explorer tests** sau hai bản sửa: regression đổi lý do exclusion cùng độ dài byte bị chặn; JSON file không thể tự khai là kết nối live.
- **37/37 targeted tests** sau hardening cuối của Memory: 30 Memory + 5 kiểm tra chéo Context–Memory + 2 Explorer integration. Refresh/link đọc lại bản ghi trong SQLite write transaction; export capture cùng transaction.

Regression Memory bổ sung chặn: trộn evidence đúng và sai cho cùng claim; dùng review mới để xóa unresolved conflict; giữ nhầm cạnh source cũ sau khi claim được review lại. Các đề xuất/review/evidence bất biến; xét lại source binding không tự phục hồi artifact cũ.

## Poison qua nhiều module

Test `poison survives Memory→context→compaction only as data and fails promotion in a new window` thực hiện thật việc ingest nguồn gieo độc, dựng window, pin predecessor, compact sang window mới, đăng ký context dependency rồi gửi MemoryDelta. Summary cố nhận quyền phê duyệt vẫn là `untrusted-data`; resource giữ `instructionAuthority: none`; C17 yêu cầu reconcile trước retry được lấy lại từ TaskSpec. Evidence `insufficient` và nhãn review `approve` không làm proposal được promote. Claim chưa được phê duyệt không xuất hiện trong kho claim. Đây là kiểm tra cơ chế, không phải phép đo khả năng chống prompt injection của một model thật.

## Giới hạn cần giữ nguyên khi báo cáo

- Authority, principal, source provenance và manual attestation đến từ trusted local broker/operator; không phải chữ ký chứng thực nguồn hay semantic judge production. `minimumIndependentOrigins` đếm nguồn gốc đã khai trong provenance đáng tin, không tự phát hiện mọi bản sao trên Internet.
- `approved` không có nghĩa `fresh`. `revalidateBeforeUse` giữ `unknown` khi chưa có fetch adapter thật. Mock refresh có thể làm nguồn đủ mới; các claim/artifact dẫn xuất vẫn cần xét lại riêng.
- Inferred edge không mở rộng retrieval như explicit edge. Nếu nguồn có quan hệ inferred bị thu hồi, descendant bị chặn với lý do `inferred-dependency-uncertain`; điều đó không biến inference thành sự thật.
- SQLite/Markdown là local canonical store và projection một chiều. Explorer không mở database để ghi; proposal tải xuống không cấp quyền promotion. Static JSON luôn là snapshot; `loaded` chỉ chứng minh byte nằm trong packet local có receipt được đối chiếu, không chứng minh agent đã nghĩ gì.
- Runtime Context guard mới dùng handle process-local và provider authority hiện hành; việc nối vào dispatch/resume do kiểm tra tích hợp runtime riêng xác nhận. Báo cáo này không thay cho kết quả toàn bộ suite hoặc gate benchmark đã khóa.

## Review bổ sung — runtime Context guard (2026-09-25)

Đã đọc riêng `src/context/runtime-guard.ts`, thay đổi `src/runtime/runner.ts` và `test/runtime-context.test.ts`. Handle dùng WeakMap, pin của run được lưu bền, config removal/mismatched pin và restart không reattach đều bị chặn; exact TaskSpec/ContextManifest/ContextBundle được so với guard. Callback current authority là host-owned; adapter của nó phải đọc Memory hiện hành. Đây không phải API nhận authority do candidate cung cấp.

**P1 đã đóng sau recheck — kiểm tra freshness từng nằm trước các async boundary.** Repro độc lập tái dùng fixture test hiện có, chạy sandbox worker thật và không sửa authority pin:

| Thu hồi nguồn ở observer | Kết quả trước sửa | Hệ quả |
|---|---|---|
| `prepared` | blocked / CONTEXT_NOT_READY; dispatches=1; operation=OBSERVED; file đã tồn tại | Nguồn đã bị thu hồi trước worker nhưng tool vẫn tạo hiệu ứng. |
| `started` | blocked / CONTEXT_NOT_READY; dispatches=1; operation=OBSERVED; file đã tồn tại | Gate trước đó không còn đủ mới tại thời điểm cấp input cho worker. |
| `before-commit` | completed; operation=COMMITTED | Nguồn đã bị thu hồi trước commit nhưng operation vẫn được xác nhận thành công. |

Đề nghị đặt revalidation sau mọi observer có thể chờ, và tại handshake sau đăng ký PID nhưng trước gửi input để worker gây hiệu ứng. Khi verifier/observer hoàn thành, kiểm tra lại ngay trước final gate/commit; nếu nguồn không hợp lệ thì giữ trạng thái cần reconcile, không COMMITTED. Đây là giới hạn tại các boundary quan sát được; không tuyên bố có transaction phân tán giữa Memory và side effect hệ điều hành. Cần regression same-authority cho cả ba boundary, positive run/restart và bộ recovery hiện có.

Kiểm tra chéo Memory của agent Context còn phát hiện P1 khác: ingest revision mới trong namespace hẹp có thể supersede source head ở phạm vi ẩn. Đã sửa guard `fits(old.namespace, n)` bên trong SQLite transaction, trước mutation; **36/36 Memory + Context–Memory tests** đạt, bao gồm test độc lập cho tình huống này. Benchmark phải dùng source hash sau sửa.


### Đóng finding runtime guard

Đã chạy lại **ba probe độc lập trên sandbox worker thật** sau bản sửa, giữ cùng fixture/authority và chỉ thu hồi source tại từng observer. Không sửa source trong lúc benchmark khóa chạy.

| Thu hồi tại | Kết quả sau sửa | Bằng chứng effect/commit |
|---|---|---|
| `prepared` | blocked / CONTEXT_NOT_READY; PREPARED; dispatches=0 | File chưa tồn tại; không COMMITTED. |
| `started` | blocked / CONTEXT_NOT_READY; STARTED; dispatches=1 | Worker đã khởi tạo nhưng chưa nhận input; file chưa tồn tại. Attempt đã bắt đầu vẫn được tính, không hoàn ngân sách hoặc retry mù. |
| `before-commit` | blocked / CONTEXT_NOT_READY; OBSERVED; dispatches=1 | File từ hiệu ứng trước đó còn tồn tại; không COMMITTED và cần reconcile. |

Cả ba trường hợp chỉ có gate `planning` và `pre-dispatch` đã cấp trước thu hồi; **không có post-execution PASS**. Revalidation nằm sau `prepared`, tại handshake đăng ký PID → callback → current Context trước stdin, và sau verifier/`before-commit` trước final gate/transaction. Finding đã đóng trong phạm vi các boundary local này. Không có rollback giả đối với hiệu ứng đã xảy ra và không có tuyên bố freshness liên tục giữa Memory và OS.
