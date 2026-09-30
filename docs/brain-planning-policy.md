# Chính sách Planning Brain R3 — 30/09/2026

Quy tắc mặc định là **Game/Epic → Module → Task**, không phải thí nghiệm nhiều planner. Planner chính khóa GDD lõi và các interface liên module trước khi planner module bắt đầu. Module chỉ được planning song song khi độc lập: không còn quyết định chung, không cùng ownership boundary và không chờ contract của nhau. Critic và tác giả test plan kiểm chứng độc lập từ đầu vào đã khóa; họ không tự thay thiết kế đã duyệt.

Quy tắc đã được owner nghiệm thu ngày 30/09/2026. Các quyết định thay thế và ngân sách ở [decision log](decision-log.md); lịch sử chuyển sang nhật ký riêng, không chồng lên hướng dẫn hiện hành.

## Cổng Game/Epic và phân rã

Một Game/Epic phải có brief một trang trước khi module được mở: goal, in-scope, out-of-scope, key decisions, interfaces, risks/spikes và budget thời gian/raw token/credit và quota. Owner chấp thuận brief hoặc yêu cầu thay đổi; không suy sự im lặng thành approval.

Planner chính sở hữu mục tiêu, ranh giới module, dependency và interface. Interface approval có version, producer/consumer, input/output, ownership, invariant, error contract, compatibility checks và decision record. Planner module chỉ tạo task trong interface đã approved. Task là đơn vị thực thi nhỏ nhất.

Áp dụng hierarchy theo tỷ lệ: bug cục bộ dùng **Task**; feature dùng **Module → Task**; game mới dùng đủ **Game/Epic → Module → Task**. Không tạo Game/Epic giả cho bug, cũng không ép game/feature có interface chung thành một task.

Milestone kế tiếp được chi tiết thành task; tương lai chỉ giữ outline có parent, dependency và giả định rõ. Nếu mức độ không chắc chắn không rõ, chọn **tầng cao hơn** thay vì ép thành task.

## Ready là bảy điều kiện nhị phân

`Ready` chỉ khi cả bảy điều kiện đều Pass, có evidence, và không có câu hỏi goal/acceptance còn mở:

1. Requirement coverage: mỗi requirement có task/work item.
2. Interface compatibility: producer/consumer cùng interface version đã duyệt.
3. Automatic testable acceptance: mỗi task có acceptance và automated check.
4. High-risk spikes: rủi ro cao đã có spike độc lập và decision.
5. Budget fit: planning, critic, execution, test và retry nằm trong budget/approval.
6. Acyclic dependencies: dependency graph không có cycle.
7. Clear goal and acceptance: không còn câu hỏi goal hoặc acceptance.

Một mục Fail, evidence thiếu, hoặc câu hỏi còn mở làm `Not Ready`. Hỏi owner trước execution khi goal/AC còn mở; không dispatch để “tìm hiểu khi làm”.

## Spike, execution và replan

Spike là work item riêng `kind: spike`: một câu hỏi, timebox, token cap, stop conditions, evidence và decision record. Code từ spike có `do_not_merge`; spike trả lời câu hỏi hoặc timebox-out rồi replan/thu hẹp/hỏi owner. Không dùng spike code làm implementation đã duyệt.

Task implementation phải hoàn thành trong một agent session, có automated checks và owner review không quá 30 phút. Nếu vượt phạm vi này, nâng lên work package/module. Lỗi plan trả về đúng tầng: mục tiêu/GDD về Game/Epic; interface/dependency về Module; breakdown/AC cục bộ về Task. Lỗi implementation chỉ trở về execution, không ngụy trang thành replan.

Mỗi task ghi level, plan version, Ready outcome, spike refs, execution outcome, replans, return level, owner manual fixes và token actuals (kèm receipt). Change request ghi nguyên nhân, evidence, scope ảnh hưởng, invalidation và decision; đổi interface phải Ready lại downstream.

## Trạng thái triển khai và thí nghiệm

R3 hiện chỉ thêm contracts/schema tests và tài liệu; scope này **không thêm** planning engine, model run hoặc Unity run. Nó không phủ nhận Unity preflight đã có trong evidence trước đó. Schema tests chỉ xác nhận cấu trúc/invariant của record: chúng chưa chứng minh module admission thật, semantic của acceptance, evidence thực cho checklist, scheduling hay execution. Các acceptance tests đó thuộc planning engine/gate tương lai. Compaction mặc định và advanced Explorer vẫn là experiment. Hierarchy và planner module song song khi module độc lập là policy mặc định.

Schema tests hiện tại chỉ xác nhận cấu trúc/invariant có thể biểu diễn: version per-record, enum level/kind, Ready đúng với bảy outcomes và câu hỏi mở, spike có cap/stop/`do_not_merge`, approval/change/log/brief/work item đủ fields, lineage không lùi, token receipt, self-dependency và task implementation một session/review ≤30 phút.

Khi triển khai orchestration cần engine/Ready integration tests riêng: chặn module trước interface lock; chỉ fan-out module độc lập; đánh giá AC có semantic thật; kiểm evidence checklist; chặn spike hết hạn mở dependent task; budget/DAG trên plan thật; invalidation downstream khi interface đổi; và định tuyến plan defect về đúng tầng. Các kiểm thử này không được ghi là schema coverage hiện tại.

## Đo chất lượng bằng kết quả thực thi

Tỉ lệ task hoàn tất không replan = số task đã hoàn tất, chưa từng sửa plan / toàn bộ task đã bắt đầu trong cohort. Báo riêng đang chạy, blocked và fail; chỉ kết luận trên cohort đã kết thúc. Lỗi plan đếm nguyên nhân gốc theo tầng; không tính lỗi code hoặc yêu cầu mới thành lỗi plan. Mỗi đợt owner sửa tay liên tục tính một lần, có lý do; review/duyệt thường lệ không là lỗi. Không reset mẫu số hoặc lịch sử sau replan. Kèm input/cached/output, credit, thời gian và usage receipts; chưa đo ghi chưa đo.

## Mẫu brief Game/Epic một trang

Mục tiêu và thành công kiểm được; phạm vi làm/không làm; quyết định chính; interface/ownership/dependency; rủi ro và spike (câu hỏi/timebox/token/stop); budget thời gian/token/credit/quota; mục cần owner chốt. Owner nhận trang này trước khi mở planning module.
