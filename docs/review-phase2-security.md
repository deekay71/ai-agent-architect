# Phase 2 — independent runtime security review

Ngày: 2026-09-25. Phạm vi: macOS, adapter cơ học `fixture.write-once`, cấu hình authority do operator quản lý. Đây là review code và kiểm thử đối kháng có giới hạn, không phải chứng nhận sandbox hoặc chất lượng semantic planning.

## Kết quả

Các finding đã xác minh trong vòng review này đã được sửa và có regression. Không còn finding mở đã tái hiện trong phạm vi đã kiểm tra. Lần chạy targeted cuối sau delta review: **63/63 PASS**, gồm 12 runtime-skill integration tests, 41 evaluation tests và 10 recovery tests; build TypeScript PASS. Full-suite receipt do root tổng hợp riêng.

| Finding | Rủi ro | Sửa và bằng chứng |
|---|---|---|
| P1 — recovery có thể chấp nhận thay đổi ngoài target chỉ vì target đúng nội dung | Sau crash/effect, sửa một file khác rồi resume có thể được hấp thụ vào snapshot mới | Broker giữ baseline artifact; so toàn workspace trừ target dự kiến trước commit. Regression hard-crash trong `runtime-recovery.test.ts` chặn thay đổi ngoài target. **Closed**. |
| P2 — skill binding chưa nối vào gate/ledger | Gate execution không truy được chính xác descriptor/profile/selection đã dùng | Pre-dispatch và post-execution gate chứa digest của SkillBinding; ledger giữ `skillBindingRef`. Test positive kiểm tra cả hai gate và ledger. **Closed**. |
| P2 — registry và binding tự nhất quán nhưng mô tả sai tool thực tế | Operator cấu hình nhầm implementation vẫn tạo provenance không khớp adapter chạy thật | Broker đối chiếu capability, implementationRef/digest và project với adapter cố định. Binding mới đã rehash nhưng chỉ sai implementation bị `SKILL_CAPABILITY_DRIFT`, dispatch=0. **Closed**. |
| P2 — lịch sử binding có digest nhưng thiếu nội dung descriptor/profile | Cập nhật catalog hoặc active config khiến lịch sử khó giải trình | Broker lưu descriptor và ProjectProfile thành artifact theo digest; test truy ngược cả hai từ binding. **Closed**. |

Ngoài ra, cleanup khi `release()` từ chối chuyển sang quarantine để đóng helper nhưng giữ marker. Không xóa dấu vết sở hữu hoặc cho takeover dựa trên tuổi lock.

Delta review cuối xác nhận `gate.inputPins` đối chiếu protected planning pins. Broker chỉ mở rộng **bản sao** authority bằng binding vừa xác thực; không thay thế các pin task/plan/context bằng dữ liệu candidate. Pure evaluation vẫn từ chối gate có input cũ dù caller gửi expected giống gate; skill integration vẫn PASS với binding hợp lệ. Đường reconcile cũng resolve skill hiện hành và đối chiếu binding đã ghi trước khi cấp post-execution gate.

Bốn probe tích hợp bổ sung đã chạy trên host: reconcile sau timeout/cancel chỉ xác minh effect cũ, giữ trạng thái cancelled và dispatch=1; hai nhánh thành công xuất hiện trong checkpoint, usage giữ unknown và chặn execution bằng `PLANNER_USAGE_UNMETERED`; hardlink trong workspace bị từ chối khi admission; SQLite control file có nhiều hardlink bị từ chối trước mở database. Các probe này là kiểm tra trực tiếp của review, chưa được tính thêm vào số test suite ở trên.

## Các đường đã rà

- **Candidate admission:** `RunRequest` strict không nhận authority/PASS từ candidate. Task/plan/context phải khớp trusted pins; scope, dependencies, requirement/check coverage và tập step thực thi được kiểm tra. Unknown/blocker không thành readiness PASS.
- **Policy/gate:** release phải active, đúng owner, task class cơ học, stage và artifact pins. Metrics được tính lại từ trial records; thiếu dữ liệu, sai rubric/checkset, revoke hoặc uncertainty vượt giới hạn chặn release. Trusted check results và stage subject được đối chiếu; điểm cao không ghi đè fail/unknown.
- **Verifier:** báo cáo phải khớp protected receipt, run/operation/subject/environment, cấu hình runner và khoảng thời gian. Zero/missing/duplicate/skipped tests, count sai và adapter error đều không PASS. Candidate stdout không được dùng làm authority.
- **Skill trước dispatch:** đọc lại manifest/descriptor/resource bytes; resolve profile/capabilities hiện hành; thực sự load body rồi tạo binding. Test đã đổi riêng body, descriptor, lifecycle, capability digest/availability, environment và profile sau submit: tất cả bị chặn, dispatch=0, không có output. Descriptor được revoke trong catalog mới đã được operator cập nhật pin cũng bị chặn.
- **Store/recovery:** SQLite WAL + synchronous FULL và transaction giữ liên kết ledger/checkpoint/artifact; artifact đọc lại được kiểm tra digest. OS lock dùng một vị trí theo canonical workspace, nên đổi control directory không tránh được chủ sở hữu đang chạy. Recovery kiểm chứng postcondition; không tự retry thao tác STARTED/UNKNOWN.

## Giới hạn cần giữ đúng khi công bố

Authority, store, entrypoint worker và callback planning/observation là mã phía broker được tin cậy; không cho candidate gọi API cấu hình, truyền callback tùy ý hoặc ghi control root. Không xem file mode cùng user là lớp cách ly giữa hai tài khoản: biên cách ly executor hiện tại là sandbox của tiến trình được broker khởi chạy.

Sandbox được kiểm tra trên macOS hiện tại, chặn network, process con, signal sang tiến trình khác và đọc/ghi ngoài grant. Chưa có backend tương đương cho host khác; unsupported host phải fail closed. Khoảng crash sau `beginWorker` nhưng trước ghi PID giữ quarantine, cần kiểm tra thủ công; không có cơ chế tự suy đoán từ TTL.

Kết quả calibration là đếm các fixture cơ học được định nghĩa trước, không phải ước lượng độ tin cậy của model hay Unity. Skill/profile trong integration tests cũng là synthetic; không chứng minh đã cài Unity hoặc đã chạy game. Metadata eligibility không phải certification, và script resource của skill vẫn chỉ là nội dung được đọc.

## Bằng chứng trong repository

- [Runtime skill integration tests](../test/runtime-skill.test.ts)
- [Hard-crash/recovery integration tests](../test/runtime-recovery.test.ts)
- [OS isolation tests](../test/runtime-isolation.test.ts), [ownership tests](../test/runtime-lock.test.ts)
- [Evaluation tests](../test/runtime-evaluation.test.ts), [runner tests](../test/runtime-runner.test.ts)
- [Runtime broker](../src/runtime/runner.ts), [evaluation](../src/runtime/evaluation.ts), [store](../src/runtime/store.ts)

Lệnh targeted đã chạy: `./scripts/dev.sh run build`, sau đó Node 24 chạy `--test dist/test/runtime-evaluation.test.js dist/test/runtime-skill.test.js dist/test/runtime-recovery.test.js`. Không commit/push hoặc thay đổi cấu hình tài khoản trong review này.
