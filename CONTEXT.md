# AI Agent Architect
Bối cảnh thuật ngữ của nền tảng lập kế hoạch và thực thi công việc Unity có kiểm chứng. Thuật ngữ dưới đây thống nhất giữa tài liệu và bàn giao.
## Language
**AI Brain**: Tập trách nhiệm Context, Planning và Memory phục vụ phát triển dự án; LLM Wiki thuộc Memory.
**TaskSpec**: Yêu cầu công việc có phạm vi, ràng buộc và điều kiện nghiệm thu.
_Avoid_: TaskContract.
**ContextBundle**: Gói thông tin được lựa chọn cho một nhiệm vụ và vai trò tại một thời điểm.
_Avoid_: ContextPacket.
**ContextManifest**: Bản kê xác định nguồn, phiên bản, phạm vi và các ràng buộc bắt buộc của một ContextBundle.
_Avoid_: ProvenanceManifest.
**PlanPackage**: Kế hoạch có phiên bản, gồm các phần việc và hợp đồng phối hợp giữa chúng.
_Avoid_: PlanArtifact.
**CheckDefinition**: Định nghĩa một phép kiểm cùng phương pháp, phạm vi áp dụng và loại bằng chứng cần có.
**CheckResult**: Kết quả của một phép kiểm trên đối tượng và phiên bản xác định.
**GateReport**: Quyết định có thẩm quyền về việc một artifact đáp ứng điều kiện bàn giao hay chưa.
**HandoffPacket**: Hồ sơ giao việc tham chiếu artifact, GateReport và context còn hiệu lực trong phạm vi được phép.
_Avoid_: HandoffBundle.
**PolicyRelease**: Phiên bản chính sách chấm và bộ kiểm đã được kiểm định, cho phép dùng trong một phạm vi tác vụ.
**PlanningModeDecision**: Chọn làn Task hoặc phân tầng Game/Epic→Module→Task theo quy mô; module chỉ mở sau interface approval và chỉ song song khi độc lập.
**Claim**: Một khẳng định có nguồn và phạm vi áp dụng, phân biệt quan sát, suy luận và quyết định.
**SourceRecord**: Hồ sơ nhận diện một nguồn tri thức cùng phiên bản và trạng thái hiện hành.
**MemoryDelta**: Đề nghị thay đổi các claims của Memory dựa trên nguồn và bằng chứng.
**Evidence**: Bằng chứng kiểm chứng liên kết kết quả quan sát với đối tượng, phiên bản và nguồn tạo được xác minh.
**Planning Ready**: Trạng thái đủ điều kiện bắt đầu thực thi khi toàn bộ checklist áp dụng đạt, không có mục tiêu hoặc nghiệm thu mơ hồ và còn đủ ngân sách.
_Avoid_: Điểm sẵn sàng 0–100, Planning PASS như bảo đảm kết quả thực thi.
**Game/Epic Plan**: Khung mục tiêu và GDD lõi do planner chính chốt, bao gồm ranh giới module và interface liên quan.
**Module Plan**: Phân rã một phần chức năng thành task trong interface đã chốt và dependency đã xác định.
**Task Plan**: Phần việc thực thi có phạm vi và tiêu chí nghiệm thu kiểm được; là tầng đủ cho bug nhỏ.
**Interface đã chốt**: Hợp đồng có phiên bản và người chịu trách nhiệm, thống nhất giữa bên cung cấp và bên sử dụng trước khi chia planning module.
**Planning Spike**: Task riêng có một câu hỏi, timebox, token cap và điều kiện dừng; đầu ra là decision record, code spike không merge.
**Planning Defect**: Sai sót trong mục tiêu, interface, phân rã hoặc acceptance được phát hiện khi thực thi và trả về tầng gây lỗi.
**Execution PASS**: Kết quả thực thi đáp ứng các phép kiểm bắt buộc bằng bằng chứng hợp lệ.
**STALE**: Artifact không còn đủ điều kiện tái sử dụng do một phụ thuộc liên quan đã thay đổi.
**SkillDescriptor**: Hồ sơ có phiên bản của một quy trình thao tác, mô tả nguồn, tài nguyên, phạm vi tương thích và capability cần có.
**SkillBinding**: Bản ràng buộc một skill và phần tài nguyên đã nạp với task, plan, context, môi trường và các capability cụ thể.
**ProjectProfile**: Hồ sơ môi trường dự án, phân biệt cấu hình mong muốn với môi trường đã được quan sát.
**Skill eligibility**: Kết quả kiểm điều kiện chọn skill cho một tác vụ; không phải chứng nhận chất lượng hoặc quyền thực thi.
