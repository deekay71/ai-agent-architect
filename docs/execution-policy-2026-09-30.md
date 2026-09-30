# Chính sách thực thi từ 30/09/2026

**Bổ sung của chủ dự án:** [Planning Brain](brain-planning-policy.md) áp dụng cho mọi kế hoạch tiếp theo: chốt GDD/interface trước khi chia module, Ready nhị phân, spike có timebox, đo bằng execution và trả lỗi về đúng tầng. Hiện chỉ bàn giao Phase 3; chưa chạy model Unity.

**Cập nhật quyết định mới nhất:** token được quy đổi theo Terra ×1, Sol ×3, Astra ×5. Hỏi trước khi toàn đợt vượt 300.000 token quy đổi. Trần một vòng DEV là 1.500.000; trần nghiệm thu phase là 3.000.000. Các trần này độc lập với phần trăm quota và thay dự phòng 3.822.000 token thô đã duyệt trước đó. Không chia đợt hoặc đổi ledger để lách trần. Cấu hình máy đọc: `docs/model-run-policy.json`.

Phiếu duyệt phải có số case, lượt gọi chuẩn và retry, token thô theo model, token quy đổi toàn đợt (gồm phần đã dùng), % quota tuần dự kiến và quyết định mà phép đo phục vụ. Chụp % giới hạn 5 giờ và tuần trước/sau mỗi đợt; thiếu dữ liệu ghi **chưa xác định**. Ghi rõ hoạt động Codex khác làm lẫn số đo. Sau đợt đầu khoảng một triệu token quy đổi trở lên, tính số token Terra tương đương trên 1 điểm phần trăm quota tuần; nếu số đo bị lẫn/độ phân giải thấp thì ghi là hệ số quan sát sơ bộ. Các dự toán sau ghi “ước tính từ số đo ngày …”; không coi quy đổi nội bộ này là bảng giá hay cách tính quota chính thức.


Quyết định này thay thế hướng triển khai cũ trong T22/roadmap đối với bước kế tiếp. Tài liệu cũ và điểm v1 vẫn là lịch sử, không được sửa thành kết quả của chính sách mới. Phạm vi hiện hành là: đóng vòng đánh giá Phase 3 trên **300 output v1 đã có**, sau đó dựng **skeleton Unity 6 rỗng** và thử đúng **10 tác vụ hạ tầng tổng quát** trên Editor thật. Chưa làm gameplay, game rules, puzzle hay production release.

## 1. Đóng Phase 3 có giới hạn

- Dùng đúng 300 output và raw receipts của v1. Không tạo holdout mới, không chạy lại candidate/summary và không gọi kết quả đã lộ là fresh holdout. Giữ nguyên file, hash, điểm và closure gốc (`Replan`); mọi chấm lại nằm ở version/ledger dẫn xuất, có liên kết tới output ID, rubric, reviewer và source digest.
- Khóa danh sách 300 ID và rubric trước khi chấm. Kiểm đủ 300/300 assessment đúng ID, không trùng/thiếu ID; chấm độc lập các output còn thiếu, kiểm hard gate, citation/revision/constraint và sự nhất quán của judgment. Không chọn riêng ca đẹp để suy ra chất lượng toàn bộ.
- Chỉ retry **ID thiếu do lỗi hạ tầng của khâu chấm**, tối đa **2 lần cho mỗi ID**. Gắn nhãn `infrastructure` với lỗi cụ thể và attempt/usage/receipt; không retry candidate fail, không sửa câu trả lời, không reset ledger hay coi retry là lượt holdout mới. Nếu vẫn thiếu hoặc trạng thái unknown, ghi `unassessed` và đóng vòng với giới hạn đó.
- Timebox: one bounded regrade round. Approval threshold is 300,000 weighted input/output/retry tokens for the entire campaign. Terra x1, Sol x3, Astra x5; no splitting or resetting ledgers. The old 3,822,000 raw-token approval is superseded by the user-approved 3,000,000 weighted cap including the 144 already-assessed outputs. Actual: 300/300 assessed, 50 calls, 917,780 raw Sol / 2,753,340 weighted tokens. Keep historical authorization records immutable and apply the lower effective admission cap.
- Có thể kết luận `conditional administrative Pass` **chỉ cho việc đóng hồ sơ Phase 3** khi đủ 300/300 assessment đúng ID, lineage và integrity của source/receipts/ledger được xác nhận, và báo cáo tách rõ lỗi chất lượng khỏi lỗi hạ tầng. Các câu trả lời v1 là bất biến: hard failure hoặc quality failure vẫn là failure, được đếm và ghi thành rủi ro/việc còn mở; không cần biến mọi câu trả lời cũ thành hard-pass để đóng hồ sơ hành chính. Nếu thiếu assessment hoặc không xác nhận được integrity, báo cáo `incomplete` với số ID/attempt còn thiếu và nguyên nhân, không gọi administrative Pass. Administrative Pass không phải verified production PASS, semantic release, T22 PASS hay bằng chứng năng lực Unity; không ghi đè chín hard fail và 276 missing assessment trong closure v1. Báo cáo dẫn xuất phải chỉ rõ outcome cũ và mới.

## 2. Unity 6: skeleton và baseline

- Tạo project Unity 6 trống, pin Editor version, OS, target và package manifest. Probe và dùng **official Unity CLI** cùng batchmode Editor; nếu CLI không đủ hoặc license/editor không sẵn, ghi blocker và dừng nhánh phụ thuộc, không tự thêm bridge. Không dùng Unity trong CI Node local ở mục 4.
- Chạy một đường baseline **single planner + critic + executor**, với Memory/Context đã có để truy xuất evidence và lưu decision/verification receipts có nguồn, revision và trạng thái. Executor chỉ thao tác trong project skeleton; mỗi lần chạy có plan, tool trace, diff, compile/test report, lỗi/recovery và owner review.
- Khóa manifest gồm **10 tác vụ Unity/C# nhỏ, khác nhau và có ý nghĩa**, kèm requirement, phạm vi thao tác/allowlist, oracle độc lập được bảo vệ, tiêu chí nghiệm thu và digest trước khi chạy. Mỗi task phải đi qua một chu trình planner → critic → executor thực sự; lưu plan, phản biện, tool trace, diff và kết quả kiểm chứng. Không có gameplay logic hoặc full game. Chạy official Unity CLI để compile/domain reload và test thật khi áp dụng; lưu test ID/count, report/snapshot, lỗi/recovery và evidence gắn đúng commit/environment. Exit code 0, screenshot, zero-test hoặc report cũ không tự thành PASS.
- Nếu một task không thể kiểm trên đường official CLI, ghi `Blocked` hoặc `Unknown` và evidence nguyên nhân. Không cộng gộp thành “10/10 thành công” khi còn task chưa kiểm được. Việc kết thúc 10 task chỉ cấp evidence baseline cho phạm vi skeleton; năng lực production và gameplay vẫn cần gate sau này.

## 3. Các nhánh thực nghiệm

Multi-planner, compaction mặc định và advanced Explorer **tắt theo mặc định**. Chỉ mở từng nhánh như experiment khi đã có baseline từ 10 task Unity thật, protocol/metric/budget được khóa trước và nhánh đó thắng baseline trên chính task set có reset, cùng giới hạn token/tool và không tăng hard failures. So sánh quality, task success, false acceptance/rejection, token, latency, recovery và owner effort; thiếu evidence hoặc chỉ có mock/sample-repo thì không bật mặc định. Bất cứ model campaign bổ sung nào cũng theo ngưỡng 300.000 token tổng ở trên.

## 4. GitHub và CI

Đẩy các commit của phạm vi được duyệt lên GitHub, kèm CI local. Workflow duy nhất `.github/workflows/check.yml` dùng macOS do lock/isolation hiện chỉ được xác minh ở macOS; Node 24, pnpm 11.19.0, frozen install, build, test và Phase 2 spike. Quyền workflow chỉ `contents: read`, có timeout và log khi fail. CI này không yêu cầu Unity license, không gọi paid model, không chứng nhận Editor compile/test hoặc production readiness. Unity evidence chạy riêng trên host đã pin.

## 5. Mẫu báo cáo bắt buộc

Mỗi cập nhật và bàn giao dùng đúng bốn mục dưới đây; ghi số đo và artifact thay vì suy diễn:

### đã xong

- Commit/CI, assessment coverage và digest, 10 task Unity cùng compile/test evidence đã thực sự hoàn tất.

### cần tôi quyết định

- Chỉ các quyết định còn thiếu như quota/budget vượt ngưỡng 300.000 token hoặc blocker cần người dùng chọn; nêu phương án và hệ quả.

### chi phí-quota

- Estimated trước run và actual sau run: calls, reported tokens, unknown usage và chi phí nếu có rate đã pin. Không đổi token sang USD khi thiếu giá hoặc billing evidence.

### rủi ro

- Coverage thiếu, hard failures, sự khác biệt giữa administrative closure và production gate, Editor/license/CLI blockers và các experiment chưa đủ điều kiện bật.
