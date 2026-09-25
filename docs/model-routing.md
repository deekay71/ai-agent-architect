# Phân vai model của AI Agent Architect

## Phân vai model hiện hành — Terra / Sol / Astra

Quyết định mới của owner ngày 25/09/2026 thay phân vai Luna trước đây cho công việc mới:

| Công việc | Model | Reasoning effort mặc định |
|---|---|---|
| Execution: triển khai code, sửa lỗi có hướng xử lý, chạy test, tạo artifacts theo kế hoạch | `gpt-5.6-terra` | `medium` |
| Suy nghĩ mức vừa: phân tích thường lệ, chia việc, lập kế hoạch có phạm vi rõ, review thông thường | `gpt-6-sol` | `medium` |
| Suy nghĩ sâu: thiết kế kiến trúc, trade-off khó, root-cause phức tạp, phản biện và quyết định quan trọng | `gpt-6-astra` | `high` |

Model do owner chọn; effort là mặc định triển khai. [Profiles máy đọc được](model-routing.json) dùng khi cấu hình tác vụ/campaign mới. Đây là phân vai dự án, chưa phải automatic runtime router hoặc thay model đang chạy của cuộc hội thoại. Vai trò critic/verifier vẫn cần context và quyền độc lập; chọn Astra không tự cấp PASS. Những config/receipts Luna của campaign cũ giữ nguyên để truy vết. Không tự mở lại ledger đang frozen hoặc tạo quyền benchmark mới từ thay đổi phân vai.

Model IDs đối chiếu danh sách trên host và [OpenAI Models](https://learn.chatgpt.com/docs/models), ngày 25/09/2026. Không suy khả dụng thực tế hoặc chất lượng đã đo từ tên model; benchmark vẫn bị chặn như báo cáo gần nhất.

