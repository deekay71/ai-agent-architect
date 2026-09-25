# Review độc lập: runner và phạm vi Phase 2

Ngày: 25/09/2026. Đối chiếu T07/T18/T15 và roadmap R2. Reviewer không viết `runner.ts`, `store.ts`, các worker, model adapter, isolation hoặc ownership lock. Reviewer có viết pure evaluation module và calibration fixture nên **không tự công bố independent PASS cho phần đó**. Đây là review source và regression thực thi, không phải scored benchmark hay phê duyệt release semantic.

## Kết luận hiện tại

Vertical slice đã có dispatch thực trên fixture local, SQLite checkpoint/ledger, independent verifier, sandbox và recovery process. Bốn findings integration trong review này đã được sửa và có regression đạt. Không còn blocker trong phạm vi runner được review; kết luận nghiệm thu toàn Phase 2 còn phụ thuộc independent review pure evaluation/isolation và suite/source evidence cuối của parent. Không có scored benchmark hoặc semantic release PASS trong báo cáo này.

## Findings và cách tái hiện

| Mức | Finding / hậu quả | Kiểm chứng / trạng thái |
|---|---|---|
| P1 | Request có thể bỏ bước hoặc lặp một `stepId`, rồi runtime báo completed vì chỉ đếm submitted operations. Repro ban đầu: approved plan có step-1 → step-2, request chỉ có step-1; kết quả `completed`, một operation COMMITTED. | Đã sửa exact one-operation-per-step cho adapter hẹp. Regression omission, duplicate và complete positive đã đạt. |
| P1 | Target chỉ kiểm task scope nên có thể vượt scope hẹp hơn của ContextManifest hoặc subplan. | Đã sửa runtime containment. Hai regression scope đã đạt, không có operation intent/effect. |
| P1 | Subplan B phụ thuộc A, nhưng step B không khai thêm `dependsOn: [step-A]`; request B rồi A vẫn được submit. Approved DAG và thứ tự effect khác nhau. | Đã sửa. Regression reject `SUBPLAN_DEPENDENCY_DENIED` trước operation intent/effect. |
| P2 | Gate chỉ hỗ trợ một deterministic validator/stage nhưng allowlist ban đầu chưa khóa `requiredEvidenceKinds`/applicability. Definition khác semantics có thể dùng cùng validator ID rồi được nhận PASS từ generic evidence. | Đã sửa kind `mechanical-report`, critical/required, taskClass `runtime.fixture` và typed evidence wrapper. Regression đổi kind thành `image-review` bị chặn `GATE_CHECK_UNSUPPORTED`, 0 dispatch. |

Regressions nằm trong [`runtime-plan-coverage.test.ts`](../test/runtime-plan-coverage.test.ts). Lệnh tái hiện: `./scripts/dev.sh run build`, sau đó `./scripts/dev.sh exec node --test dist/test/runtime-plan-coverage.test.js`. Lần đầu sau thêm scope/dependency cases: 7 tests, 6 đạt, 1 lỗi đúng tại subplan dependency. Sau fix và thêm evidence-kind case: **8 tests đạt, 0 lỗi, 0 skip**; không bỏ test lỗi. Build TypeScript đạt.

## Đối chiếu yêu cầu và bằng chứng

| Phạm vi | Bằng chứng đã đọc/chạy | Giới hạn kết luận |
|---|---|---|
| T07: intent trước effect, ID/payload, resume/retry/replay/replan | [`runner.ts`](../src/runtime/runner.ts), [`store.ts`](../src/runtime/store.ts), runner/recovery tests. Ledger intent và attempt bền trước worker; COMMITTED dùng lại; ambiguous effect reconcile; replay lineage mới, replan dùng budget lineage cũ. | Adapter duy nhất `fixture.write-once`; không suy ra exactly-once cho tool mạng/Unity. |
| T07/T15: process crash, successful sibling reuse, version mismatch | Hard SIGKILL tại prepared/after-worker/before-commit; process mới tiếp tục; kiểm inode giữ nguyên; branch đã commit không gọi lại; incompatible checkpoint bị reject. | Nhánh planner là callback của trusted host. Chưa là sandbox chạy plugin agent tùy ý; không phải benchmark hiệu quả multi-agent. |
| T15: owner/OS lock/queue, cancel/timeout | Đã đọc recovery tests khóa theo canonical workspace dù control directory khác; timeout/cancel worker, quarantine khi chưa biết trạng thái. Isolation/lock conformance thuộc review riêng của implementer/parent. | Local macOS; nền tảng chưa hỗ trợ phải fail closed. Không chứng nhận chống host/operator độc hại cùng quyền. |
| T18: stage gate và độc lập verifier | Runner chỉ gọi planning gate sau readiness; pre-dispatch sau workspace/tool/skill revalidation; post-execution sau postcondition + sandboxed verifier và protected receipt. Definition ID/version/ref được allowlist. | Pure evaluation module do reviewer này viết, cần independent review riêng. Chưa có semantic judge/model calibration. |
| T07: minimal model adapter + fake | Fixed adapter; HTTP adapter thực chạy server loopback, schema/size/timeout/redirect/error handling trong [`runtime-models.test.ts`](../test/runtime-models.test.ts). | Không gọi paid provider; không có token/cost đo từ model. Không được ghi 0 khi callback/model usage chưa biết. |
| T07/T18: framework spikes | [`phase-2-framework-spikes.md`](phase-2-framework-spikes.md) có LangGraph process restart/sibling reuse/ambiguous effect và Promptfoo API/CLI reports. | Spike chưa thay native ledger/policy. Không dùng framework checkpoint như bằng chứng exactly-once. |

Lần chạy độc lập `runtime-runner`, `runtime-recovery`, `runtime-models`: **24 tests đạt, 0 lỗi, 0 skip**. Đây là observed fixture results trên máy review; không phải tỷ lệ false-pass production. Không chạy lại toàn suite thay parent; parent cần lưu source manifest/evidence cuối sau các fix.

## Phần phải giữ tách biệt khi cập nhật tiến độ

- Calibration fixture của evaluation chạy 80 validator invocations nhưng mỗi family chỉ có một positive shape và một mutation shape được lặp. Confusion counts là descriptive; Wilson numbers là reference formula với assumptions chưa xác minh, không có suy luận population risk. `populationInference: false` trong output phải giữ nguyên. Chưa có human calibration hoặc semantic PolicyRelease; T20 tiếp tục phần này.
- `runtime.fixture` được phép active cho đúng fixture hẹp. Không mở `unity.*`, task game hoặc agent tools mới từ việc fixture đạt. T22 vẫn chặn gameplay đến khi Unity conformance và task-class releases thật đủ phạm vi.
- Skill revalidation là catalog/compatibility/digest/scope enforcement; không tự chứng minh skill cải thiện chất lượng. T24/T25 giữ controlled trials/Unity recipes.
- [`remaining-work.md`](remaining-work.md) vẫn là bàn giao cuối Phase 1 ở thời điểm đọc: parent cần cập nhật thành trạng thái sau Phase 2, phân biệt phần đã làm với Memory/Context, planner synthesis/critic, semantic release, Unity và game chưa làm. Không xóa lịch sử hoặc đánh dấu cả dòng T18/T20 hoàn tất từ mechanical tests.

## Trạng thái đóng review

1. Đã đạt regression dependency subplan cùng omission/duplicate/scope và positive execution.
2. Đã xác minh gate từ chối evidence kind không được implementation hỗ trợ.
3. Parent còn phải chạy suite cuối, lưu source pins và cập nhật remaining-work/report để không biến mechanical fixture thành production/semantic certification. Các giới hạn ở trên là scope được giữ lại, không phải giả định production đã đạt.
