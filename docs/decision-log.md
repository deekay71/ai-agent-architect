# Decision log — AI Agent Architect

Các quyết định dưới đây do owner xác nhận trong hội thoại ngày **30/09/2026**; đây và [quy tắc planning](brain-planning-policy.md) là hai nguồn quyết định hiện hành. Roadmap, backlog và tài liệu kỹ thuật áp dụng và dẫn link, không giữ chính sách mâu thuẫn. Nhật ký cũ ở [Notion](https://app.notion.com/p/3eba6c16b3dc8143a1e7f915c48bb09c), lịch sử Git và immutable evidence.

## Unity infrastructure trước Brain orchestration

Lý do: adapter/project kiểm thử là cách kiểm nền tảng, không phải game; gộp chúng với pilot tạo dependency sai và làm chậm kiểm chứng.

Quyết định: **T21 adapter + empty project, T08 compile/test/evidence làm trước điều phối Brain T20**, không chờ T20/T24/T22. T25 conformance recipe dùng T21/T08/T23. Chỉ T01/pilot Block Puzzle chờ T22. Actual 30/09: Unity Editor `6000.0.84f1`, CLI báo `1.0.0-beta.8`; 29 oracle tests tham chiếu và 3 CLI preflight pass, chưa có model Unity run.

Thay thế: quan niệm mọi Unity/project phải chờ T22; dependency T21←T20/T24; scope empty project trong T01. Giữ “hạ tầng trước, game sau”.

## Planning mặc định phân tầng, interface-first

Lý do: planner đồng thời quyết định các phần phụ thuộc tạo mâu thuẫn; điểm tổng có thể che thiếu acceptance/interface.

Quyết định: [policy](brain-planning-policy.md) Game/Epic → Module → Task theo quy mô; main planner chốt GDD/interface trước; chỉ module độc lập planning song song; critic/test author độc lập để kiểm chứng. Ready có 7 mục đạt/không đạt; rolling planning, Task một phiên/auto-check/review ≤30 phút; không chắc chọn tầng cao hơn; spike riêng có time/token/stop/decision, code không merge; change request trả đúng tầng; Game/Epic brief một trang cho owner.

Thay thế: planner song song rồi hợp nhất, ngưỡng 85/100, và “multi-planner chỉ là thí nghiệm”. Chỉ compaction mặc định và Explorer nâng cao còn là thí nghiệm. Thiết kế là mặc định; xây orchestration đầy đủ sau mốc quyết định cuối tháng.

## Phase 3 được owner chấp nhận đóng có điều kiện

Owner đã đọc Notion và xác nhận **quy tắc planning và việc đóng Phase 3 đạt yêu cầu**. T19/T11/T14 có Gate **Pass có điều kiện**, phạm vi hồ sơ hiện tại. Không đòi fresh holdout để đóng phase, không sửa immutable evidence, không coi đây là production/semantic verified PASS.

Rủi ro chuyển sang task theo dõi T26: **36 hard failures** trong 300 đáp án cũ; selector chỉ đo đủ nguồn trên DEV, chưa chất lượng trả lời end-to-end. T26 theo dõi xử lý/giảm thiểu/chấp nhận rủi ro theo phạm vi trước T22; không mặc định cần xóa hết lỗi lịch sử mới mở pilot. T22 phải ghi residual risk và owner decision; các hard check runtime/Unity trong phạm vi pilot vẫn phải Pass.

Thay thế: trạng thái tạm “chờ nghiệm thu đóng Phase 3” và các trạng thái Replan/Not evaluated chồng ở trang hiện hành. Bản evidence đầu ngày giữ nguyên số 300/300, 264 advisory Pass, 36 hard failures.

## Roadmap và đối chứng ba nhánh

Lý do: cần đo lợi ích của vòng sửa lỗi compile/test và so với cách dùng Codex thường trước đầu tư thêm orchestration.

Quyết định: push/CI → baseline Unity → fix/đối chứng → **28–30/10/2026 giữ hay thu gọn Brain** → orchestration phù hợp quyết định → T22 → pilot. Báo sớm lý do/tác động nếu trễ.

Round 1 dùng cùng 10 microtasks Unity hiện có: **A** Brain một lượt; **B** A + tối đa 2 vòng sửa từ compile/test; **C** Codex thường, cùng Terra executor, Unity CLI, skills và trần token. Brain tính cả planner/critic. Dự toán riêng từng nhánh và tổng; khóa fixture/revision/AC/trần/retry protocol trước chạy. Đợt sau thêm scene/prefab và feature. T24 đo skill trên Unity thật; thí nghiệm A/B/C giữ skill cố định nên không tự chứng minh causal benefit của skill.

Thay thế: first round 24 case real-task bank/10 case phân cỡ × 2 arm; T24 repo không Unity; thứ tự Brain orchestration trước Unity. Task bank 24 giữ outline đợt sau, chưa fixture hay campaign.

## Ngân sách credit và quota thay model weights

Lý do: hệ số model cố định không phản ánh cached input/output. Owner bỏ Terra×1/Sol×3/Astra×5 và trần token DEV 1,5 triệu/phase 3 triệu cho lượt mới.

Quyết định: credit Standard trên 1 triệu token uncached input/cached input/output: **gpt-5.6-terra 50/5/300; gpt-6-sol 50/5/250; gpt-6-astra 250/25/1250**. Tính `(input−cached)×inputRate + cached×cachedRate + output×outputRate`, chia 1 triệu. Cached đã nằm trong input, không cộng hai lần; receipt thiếu usage/cache ghi unknown. [Bảng giá Codex](https://learn.chatgpt.com/docs/pricing) xác nhận credit Standard, khác giá API USD; credit không tự quy đổi thành quota included.

Hỏi trước toàn đợt dự kiến **>300.000 raw input+output**, kể cả retry; không chia đợt để lách. **DEV ≤5 điểm % quota tuần; nghiệm thu ≤10 điểm %** trên tổng quota tuần, không tính trên phần còn lại. Forecast dựa calibration có dated/source/uncertainty; dùng snapshot trước/sau **cả lượt làm việc**, không chỉ benchmark; ghi 5h/tuần và hoạt động lẫn số đo. Không đọc được ghi unknown, không suy 0.

[Credit audit](credit-quota-r3.md) thay hệ số 550.668 weighted tokens/1 điểm %. Hệ số mới chỉ sơ bộ bị nhiễu, không tự mở run cap. Theo quota snapshot chưa đủ để bảo chứng trần ngân sách cứng; dự toán vượt cap/unknown thì dừng xin decision trước chạy, không tự nâng trần.

## Giới hạn lượt cập nhật này

Hoàn thiện docs/Notion, decision log, roadmap/backlog, contracts/tests, budget calculation, GitHub/CI và bàn giao. **Không model run mới, không xây planning engine, không pilot.** Sau báo cáo cập nhật dừng để owner nghiệm thu; acceptance Phase 3 đã có không phải approval chạy thí nghiệm.
