# Chính sách planning của Brain — 30/09/2026

Quyết định của chủ dự án: **chốt interface rồi mới chia**. Tài liệu này thay hướng “các planner làm song song rồi hợp nhất” và thang điểm Ready 0–100 trong các tài liệu cũ. Không khởi động thêm campaign model trong lần cập nhật này.

## Tầng và quyền quyết định

| Quy mô | Tầng bắt buộc | Sản phẩm trước khi bàn giao |
|---|---|---|
| Bug nhỏ | Task | Mục tiêu rõ, phạm vi sửa, điều kiện tái hiện, test kiểm được |
| Feature | Module → Task | Interface module, ràng buộc, dependency và các task có acceptance |
| Game mới | Game/Epic → Module → Task | Khung game, GDD lõi và interface liên module được planner chính chốt trước khi planner module bắt đầu |

Planner chính chịu trách nhiệm mục tiêu Game/Epic, GDD lõi, ranh giới module, interface và dependency. Planner module chỉ phân rã trong interface đã chốt, không tự đổi thiết kế liên module. Task planner chuyển phần việc thành bước thực thi với điều kiện nghiệm thu cụ thể.

“Chốt interface” phải có phiên bản, người/role chốt, producer/consumer, đầu vào/đầu ra, ownership dữ liệu, invariant, cách báo lỗi và phép kiểm tương thích. N/A phải có lý do đối với bug không đụng interface. Không tạo tầng Game giả cho một sửa lỗi nhỏ.

Chỉ song song giữa các module độc lập sau khi interface liên quan đã chốt: không còn quyết định thiết kế dùng chung chưa giải quyết, không cùng sửa một ownership boundary và không phải chờ một module khác chọn contract. Các phần còn phụ thuộc nhau phải đi theo dependency; không giao nhiều planner quyền quyết định cùng lúc trên phần đó.

Critic và người viết test plan đọc GDD/acceptance/interface đã chốt để kiểm chứng độc lập. Họ trả findings hoặc đề nghị thay đổi; không tự ban hành thiết kế cạnh tranh. Test plan độc lập có thể làm song song khi đầu vào đã chốt. Owner vẫn quyết định thay đổi mục tiêu sản phẩm.

## Ready: checklist nhị phân

Ready chỉ đạt khi **tất cả** mục áp dụng đạt. Một mục thiếu bằng chứng, mơ hồ hoặc không kiểm được là **không đạt**, có lý do và tầng chịu trách nhiệm; không lấy điểm mục khác bù, không dùng trung bình hay ngưỡng 0–100.

| Điều kiện | Bằng chứng cần có |
|---|---|
| Mỗi yêu cầu có task | Trace từ requirement đến task; không bỏ sót yêu cầu |
| Interface khớp | Các producer/consumer dùng cùng phiên bản interface đã chốt; test plan kiểm invariant và lỗi |
| Mỗi task có acceptance kiểm được | Đầu vào, quan sát/đầu ra mong đợi, cách kiểm và evidence; tránh “chạy tốt”, “đẹp”, “tối ưu” không có tiêu chí |
| Giả định rủi ro cao có spike | Câu hỏi cụ thể, timebox và trần tài nguyên, cách đo, kết quả/decision trước khi task phụ thuộc được Ready |
| Vừa ngân sách | Toàn chuỗi planning, critic, execution, test và retry trong ngân sách/approval đang hiệu lực |

Mục tiêu hoặc acceptance mơ hồ: trả về planner đúng tầng làm rõ; không dispatch execution. Ẩn số kỹ thuật/thực nghiệm: tạo **spike** độc lập có timebox, một câu hỏi cụ thể và sản phẩm trả lời. Ví dụ: “Official Unity CLI bản đã pin có trả XML đúng test count cho EditMode trên máy này trong 60 phút không?”. Spike được phép khám phá; task triển khai phụ thuộc phải chờ kết quả. Hết timebox chưa trả lời thì ghi unresolved và replan/thu hẹp/nhờ owner quyết định, không âm thầm kéo dài.

Không bắt spike cho mọi giả định thấp rủi ro. Giả định này phải được ghi rõ, có owner và cách theo dõi; giả định liên quan acceptance/safety/interface vẫn phải giải quyết trước dispatch.

## Khi execution phát hiện plan sai

| Nguyên nhân | Tầng nhận lại |
|---|---|
| Mục tiêu/GDD lõi/ràng buộc game sai hoặc mâu thuẫn | Game/Epic, planner chính |
| Ranh giới, ownership, interface hoặc dependency giữa phần việc sai | Module; planner chính tham gia nếu đổi interface chung |
| Bước thực hiện, task breakdown hoặc acceptance cục bộ sai | Task |
| Code không tuân plan đúng | Execution; không gắn nhãn replan để che lỗi code |

Ghi finding với task, plan version, bằng chứng, nguyên nhân và tầng gây lỗi. Dừng các task phụ thuộc bị ảnh hưởng; giữ kết quả phần độc lập còn hợp lệ. Thay interface phải tạo phiên bản mới, kiểm impact, invalidation và Ready lại cho các module/task liên quan trước khi tiếp tục. Không replanning toàn game cho mọi lỗi nhỏ, cũng không vá Task để che lỗi thiết kế Module.

## Đo planning bằng execution

Mỗi task giữ plan version ban đầu và lịch sử replan, không reset mẫu số sau sửa:

- **Tỉ lệ task hoàn tất không replan** = task hoàn tất, chưa từng phải sửa plan / tất cả task đã bắt đầu thực thi trong cohort. Báo riêng số đang chạy, bị block và thất bại; cohort đã kết thúc mới dùng để so sánh kết luận.
- **Lỗi plan phát hiện khi execution**: đếm finding nguyên nhân gốc duy nhất, theo tầng và mức ảnh hưởng; nhiều triệu chứng cùng lỗi không tăng giả số finding. Tách lỗi implementation và thay đổi yêu cầu mới của owner.
- **Số lần owner sửa tay**: đếm lần can thiệp để sửa thiếu/sai trong plan, ghi lý do và tầng. Một đợt sửa liên tục tính một lần; không tính review/duyệt thường lệ thành lỗi.
- Kèm task count, phạm vi/quy mô, version, token, thời gian và tình trạng cohort. Chưa có dữ liệu ghi “chưa đo”, không ghi 0 lỗi hoặc 100%.

Dùng kết quả này để so single planner với cách chia module có kiểm soát. Nhiều planner không được quyền bỏ dependency/interface gate, kể cả khi một benchmark tổng hợp cho điểm cao hơn.

## Hiện trạng triển khai và bước tiếp theo

Runtime hiện kiểm coverage, reference interface, dependency DAG, check references, input pins, context budget và chặn critical unknown/unresolved blocker. Kết quả planning là pass/fail/unknown/blocked; với Ready, chỉ pass là đạt. Điểm dimension trong contract chung là lịch sử/diagnostic, không có quyền bỏ qua hard checks. Chưa có bộ điều phối Brain đầy đủ theo ba tầng.

Còn cần triển khai ở đợt Brain tiếp theo: bản ghi hierarchy/interface approval có version; admission planner module; kiểm độc lập trước dispatch song song; spike records/timebox; Ready checklist có evidence; định tuyến replan/invalidation theo tầng; telemetry ba chỉ số thực thi. Không âm thầm đổi schema của các hồ sơ Phase 3 đã freeze để giả vờ các phần này đã được nghiệm thu.

Test plan cho đợt Brain: module trước interface lock bị chặn; hai module còn dependency không cùng quyết định; critic/test author không đổi approved design; một yêu cầu thiếu task hoặc acceptance mơ hồ đều Not Ready; spike quá hạn không mở task phụ thuộc; vượt ngân sách không dispatch; bug nhỏ không bắt tầng Game; đổi interface invalidates đúng downstream; lỗi code không làm tăng lỗi planning; replan không reset mẫu số.

Thứ tự roadmap: bàn giao Phase 3 → khi owner cho mở lại, baseline Unity single planner → thêm điều phối Brain theo quy tắc này → chỉ thử nhiều planner ở các module độc lập, đo trên execution. Compaction mặc định và Explorer nâng cao tiếp tục là thí nghiệm tắt.

