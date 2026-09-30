# Báo cáo cập nhật R3 — 30/09/2026

Owner đã nghiệm thu quy tắc planning và đóng Phase 3 có điều kiện. Báo cáo này đối chiếu **8 yêu cầu cập nhật mới nhất**; lượt này không chạy model Unity hoặc benchmark mới, không xây planning engine. [Bản Notion và bằng chứng push/CI cuối lượt](https://app.notion.com/p/3eba6c16b3dc8195943bd4fee6be445c).

## Đã xong

| Yêu cầu | Kết quả | Bằng chứng |
|---|---|---|
| 1. Dọn tài liệu | Viết lại các đoạn mâu thuẫn ở 03/04/07/10/12 và hub; đưa snapshot cũ sang nhật ký. Quyết định chỉ ở policy/decision log; trang khác dẫn link. | [04](https://app.notion.com/p/3e3a6c16b3dc816ab47fc95ef0ab630b), [12](https://app.notion.com/p/3e4a6c16b3dc8155ad16df18f81be66f), [nhật ký](https://app.notion.com/p/3eba6c16b3dc8143a1e7f915c48bb09c) |
| 2. Unity là hạ tầng | Decision log ghi adapter/project kiểm thử trước Brain orchestration; chỉ pilot chờ T22; ghi lý do và quyết định cũ bị thay. | [Decision log](https://app.notion.com/p/3eba6c16b3dc819a8c57c73229cf7533), [source](decision-log.md) |
| 3. Backlog/R3 | T21/T08 lên trước, bỏ T20/T24; actual Unity preflight; Gate mới Pass có điều kiện cho T19/T11/T14; thêm T26 risk; viết lại T20/T24/T22 và lịch tới cuối 10/2026. | [Backlog](https://app.notion.com/p/4d37fed112f4430d935dd764f6d1df99), [T26](https://app.notion.com/p/3eba6c16b3dc811aa95cd33b89f841b4), [roadmap](https://app.notion.com/p/3eba6c16b3dc816bb475ffa83559c822) |
| 4. Quy tắc planning | Rolling planning, Task một phiên/auto-check/review ≤30 phút, không chắc chọn tầng cao hơn, brief Game/Epic một trang. Giữ Ready 7 điều kiện, spike và change request. | [Policy](https://app.notion.com/p/3eba6c16b3dc81f1a733c19995488a7f); `test/brain-planning-contracts.test.ts` |
| 5. Credit/quota | Bỏ weights khỏi policy hiện hành; tách input/cache/output; threshold 300k raw; DEV 5%/phase 10%; tính lại 50 receipt và hệ số quan sát; legacy Unity live dispatch chặn trước side effects. | [Credit audit](credit-quota-r3.md), [machine evidence](evidence/planning-r3/credit-calibration.json), `test/credit-policy.test.ts`, `test/unity-campaign.test.ts` |
| 6. Source/CI | CI macOS chạy build/local tests và Phase 2 clean-install; không gọi model/Unity license. Push toàn bộ source và xác nhận CI của commit bàn giao; URL run cụ thể được ghi vào bản Notion cuối lượt. | [Workflow](https://github.com/deekay71/ai-agent-architect/actions/workflows/check.yml), [local 619 tests](evidence/planning-r3/local-check.log) |
| 7. Thí nghiệm A/B/C | Cùng 10 microtasks/revision/tests/skills/Terra/Unity CLI, trần token bằng nhau; A một lượt, B tối đa 2 vòng sửa, C Codex thường; có dự toán từng nhánh và tổng; đợt sau scene/prefab/feature. | [Protocol/forecast](roadmap-r3.md), [outline đợt sau](unity-task-bank-r3.md) |
| 8. Bàn giao và dừng | Báo cáo này cùng Notion/GitHub/CI/cloud là hồ sơ nghiệm thu; dừng trước model run. | [Báo cáo Notion](https://app.notion.com/p/3eba6c16b3dc8195943bd4fee6be445c) |

Local final: `./scripts/dev.sh check` **619/619 Pass, 0 fail/skip**. Registry 33 contracts; 23 giữ 0.5.0, 10 dùng 0.6.0. CLI báo version từng contract. Các test chính gồm Ready thiếu check/evidence/câu hỏi mở; spike không merge/thiếu bounds; change request trả đúng tầng; atomic Task; reject score/mode cũ; credit cached không đếm kép; caps quota cộng prior spend; thiếu usage/calibration không admit; legacy campaign chặn trước model/tool/write. [Contract source](../src/contracts/brain-planning.ts).

## Cần tôi quyết định

Nghiệm thu bản cập nhật R3. Chưa xin chạy A/B/C trong lượt này. Trước lượt chạy phải chốt protocol/forecast phù hợp cap và approval; plan được duyệt không tự cấp ngân sách model.

## Chi phí-quota

50 lượt chấm lịch sử: **917.780 raw Sol token = 52,3066 credits** theo rates Standard mới. Credit/weekly-point quan sát ngày 30/09: **10,46132**, bị lẫn hoạt động Codex và làm tròn, không phải quy đổi chính thức. Forecast A/B/C **280.020/466.700/466.700 raw**, khoảng **27,001/46,335/48,335 credits** ở mix giả định không cache. Tổng 1.213.420 raw, xấp xỉ 11,63 điểm % tuần, vượt DEV 5%; chưa đủ điều kiện chạy. Không tự chia đợt để lách cap.

Snapshot đầu lịch sử 0% không có timestamp chính xác; cuối chấm 5%; snapshot giữa lượt toàn công việc 10%. Số cuối lượt và snapshot 5h/tuần được ghi bản Notion/manifest bàn giao sau push CI. 5h chưa đọc được. Cả lượt có chat/collaboration/docs/tests/CI; token ledger benchmark không bao phủ mọi hoạt động. Không suy USD hoặc quy hoạt động khác vào riêng benchmark.

## Rủi ro và việc chưa làm

- 36 hard failures giữ nguyên; selector quality end-to-end chưa đo. T26 theo dõi disposition theo phạm vi trước T22; không ép sửa hết lịch sử mới làm hạ tầng.
- A/B/C chưa chạy; tỷ lệ đạt, số lần sửa tay, token/thời gian thực chưa có. C có 10 agent sessions; model turn/tool cycles phải khóa protocol, không giả là 10 calls.
- Hệ số quota chỉ mô tả quan sát nhiễu. Estimator fail closed khi thiếu usage/calibration. CLI không cung cấp hard output cap; phải reserve và dừng trước turn không đủ, ghi overshoot nếu có.
- Schema tests chỉ kiểm data/invariant, chưa chứng minh module admission, semantic Ready hoặc planning engine. Việc đó theo roadmap sau mốc quyết định; không triển khai trước khi được yêu cầu.
- Preflight Unity lịch sử không chứng minh gameplay, scene/prefab, device build hoặc production. Spike CLI ổn định và fallback còn phải kiểm ở mốc kế tiếp.
