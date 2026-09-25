---
status: accepted
---

# Phase 2 dùng SQLite và bounded broker cho runtime local

Phase 2 cần phục hồi tác vụ sau process crash mà vẫn giữ operation identity, quyền và kết quả đã commit. Chọn `PersistentWorkflowRunner` giới hạn thao tác, store SQLite qua `node:sqlite`, canonical workspace OS lock và worker isolation cho phạm vi fixture deterministic trên macOS; các ranh giới này được kiểm trực tiếp trong code của dự án. LangGraph giữ vai trò ứng viên adapter orchestration, còn Promptfoo chỉ là adapter benchmark/eval và CI, không có quyền cấp gate hoặc kích hoạt policy.

## Căn cứ và lựa chọn đã cân nhắc

| Lựa chọn | Evidence và trade-off |
|---|---|
| Native SQLite + bounded broker | Recovery tests chạy qua process mới, giữ branch đã commit và xác minh effect sau crash mà không redispatch; giữ scope nhỏ và quản lý ledger/ownership rõ ràng, đổi lại dự án phải tự bảo trì state machine và fault tests |
| LangGraph + SQLite saver | Spike đã resume qua process mới và dùng lại successful sibling; graph đơn thuần vẫn lặp effect khi chết trước receipt, nên vẫn cần ledger, reconciliation và sandbox của ứng dụng; thêm dependency tree và adapter khi nhu cầu orchestration tăng |
| Promptfoo | API/CLI chạy được dataset/assertions đã khóa, giữ UNKNOWN và xuất JSON; dùng để tổ chức campaign và báo cáo, không làm nguồn trust hoặc thay check identity, evidence validation, gate/release policy |

Quan sát, phiên bản pin và lệnh tái hiện nằm trong [báo cáo framework spikes](../phase-2-framework-spikes.md); [native evidence](../../spikes/phase2/evidence/native-results.json) ghi 10 recovery tests chạy local, không skip. LangGraph dùng counter effect còn native dùng file-write effect, nên kết quả đối chiếu recovery không phải benchmark hiệu năng hay bằng chứng hai implementation tương đương.

## Hệ quả

Operation ledger, protected authority stores, sandbox và ownership lock vẫn bắt buộc nếu sau này dùng LangGraph; checkpoint hoặc framework label không tạo exactly-once semantics. Chỉ cho phép tiếp tục khi receipt/postcondition và workspace bindings đủ để đối soát; outcome chưa xác định phải dừng hoặc giữ trạng thái cần reconciliation. Promptfoo results chỉ là đầu vào evidence của policy có scope, không tự biến assertion pass thành quyền dispatch.

Quyết định này áp dụng cho runtime local macOS và các tool/verifier deterministic đã pin. Nó không chấp thuận arbitrary executor code, Unity bridge, paid semantic judge, đa máy hoặc phát hành production. [CI workflow](../../.github/workflows/check.yml) đã chuẩn bị cho `macos-26`; chưa tuyên bố đã chạy remote. Xem xét LangGraph adapter khi graph/subgraph thật sự phức tạp hơn và cùng bộ recovery/permission tests vượt qua; giữ interface và ledger semantics ổn định khi thay orchestration.
