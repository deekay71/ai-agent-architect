# Credit và quota calibration R3

Đây là phép tính audit từ 50 receipt regrade Sol lịch sử, không phải ước lượng quota hay ngân sách cho công việc mới.

## Tập dữ liệu và cách chọn

Nguồn là hai file `calls.jsonl` trong `.local/phase3-v1-regrade-20260930` và `.local/phase3-v1-regrade-20260930-continuation`. Mỗi dòng chứa `requestDigest`, `inputIds`, `usage` và receipt kèm usage. Chọn một lần cho mỗi `requestDigest`: có đúng 50 request digest duy nhất, không có digest trùng, tất cả completed, và phủ 300 input item id. Đây là 50 request đã kỳ vọng/ghi receipt; không cộng lại một request nếu bản sao xuất hiện ở nguồn khác.

Tổng usage trong 50 receipt là 885,692 uncached-input tokens, 0 cached-input tokens, 32,088 output tokens, tức **917,780 raw Sol tokens**. Trường `cachedInputTokens` có tồn tại và bằng 0 cho toàn bộ 50 receipt được chọn. `receipt-audit.json` cũng ghi 50 calls và 917,780 raw tokens.

## Credit theo rate mới

Rate mỗi 1 triệu token: Terra 50/5/300, Sol 50/5/250, Astra 250/25/1250 cho uncached input/cached input/output. Không áp dụng trọng số model.

Vì tất cả receipt đã chọn yêu cầu `gpt-6-sol`, phép tính là:

`(885692 × 50 + 0 × 5 + 32088 × 250) / 1,000,000 = 52.3066 credits`.

Phần uncached input là 44.2846 credits, cached input là 0, và output là 8.022 credits. File bằng chứng có thể máy đọc là [credit-calibration.json](/Users/dmobin/Documents/Codex/2026-09-22/new-chat/ai-agent-architect/docs/evidence/planning-r3/credit-calibration.json).

Các rate trên phù hợp bảng Standard token rates chính thức: bảng nêu rate credit riêng cho input, cached input và output; đồng thời nêu rõ credit price không tự quyết định included subscription usage. API-key usage dùng API pricing, là cơ chế riêng. [OpenAI Pricing](https://learn.chatgpt.com/docs/pricing)

## Quan sát quota

Khoảng benchmark quan sát weekly quota từ 0% đến 5%, nhưng **bị nhiễm**: evidence hiện có ghi Codex hoạt động đồng thời và usage tăng từ 2% lên 3% khi benchmark đang dừng. Không được gán 5 percentage points đó cho 50 receipt hay dùng nó để suy ra credits/token-percentage-point.

Snapshot whole-work mới là 0% đến 10%, tức khoảng đo được 10 percentage points. Tổng token của whole work không được biết: 917,780 raw Sol tokens chỉ là 50 receipt regrade và không bao gồm các call khác. Vì vậy snapshot 0→10% cũng không cung cấp một hệ số quota conversion.

Không thể suy ra cached/uncached input chưa ghi nhận cho whole work từ tập receipt này. Phần trăm quota có thể làm tròn và không phải bảng giá hay bảng quy đổi credit chính thức.

## Tỷ lệ mô tả tạm thời và kiểm tra proposal

Chia 52.3066 credits cho thay đổi quota quan sát 5 percentage points cho **10.46132 credits/weekly-percentage-point**. Đây chỉ là *tỷ lệ mô tả bị nhiễm của ngày 30/09*, không phải conversion chính thức, calibration sạch, hay hard quota-safety guarantee. Giá trị trusted calibration giữ là `null`, để estimator fail closed khi thiếu calibration hợp lệ.

Nếu chỉ dùng tỷ lệ mô tả này để kiểm tra một proposal, forecast xấp xỉ là A: `27.001 / 10.46132 = 2.58pp`; B: `46.335 / 10.46132 = 4.43pp`; C: `48.335 / 10.46132 = 4.62pp`; tổng **11.63pp**. Cap DEV hiện tại là 5pp, nên proposal này **không admissible**. Cần forecast mới thấp hơn hoặc một quyết định owner rõ ràng ở giai đoạn sau; phép tính này không cho phép chạy model.

Snapshot whole work từ 0% đến latest check 10% vẫn không thay đổi kết luận: timestamp mốc early 0% không có, tổng token whole work không biết, và root sẽ ghi mốc completion sau. Nó không tạo được hệ số quota tin cậy.
