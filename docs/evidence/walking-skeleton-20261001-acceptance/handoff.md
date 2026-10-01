# Bàn giao walking skeleton — sau sửa cổng, 01/10/2026

**BLOCKED: chưa chạy model, chưa nghiệm thu.** Tiếp tục từ trang này sau reset, thay cho bản bàn giao trước sửa cổng. Một agent, không sub-agent; không kiểm CI theo chỉ thị chủ dự án.

Cổng trong `scripts/unity-comparison-local.mjs` đã nhận Ready/protocol/approval mới trước khi tạo project hoặc gọi tool. Nó kiểm Ready = ready, SHA-256 và đường dẫn protocol khớp, ngày/ID/hash nội dung quyết định duyệt 01/10 khớp. Biên nhận, bộ chấm, credit cap, allowlist và code Unity không đổi. `--gate-only` chỉ kiểm admission, không gọi Unity/model.

**Kiểm tra:** build đạt; 5/5 test cổng đạt, gồm 3 test âm bắt buộc và thêm nội dung duyệt bị sửa. Adapter credit 10/10 đạt. Tổng suite liên quan 25/26: test `duplicate receipts and quota stops preserve the completed row for durable progress recording` lỗi `UNITY_COMPARISON_PRE_DISPATCH_STOP`. Fixture cũ bật stop trước dispatch, trong khi test chờ kết quả trả về với một row; `src/unity/comparison.ts:212` ném lỗi. Chưa kết luận nên đổi code hay cập nhật kỳ vọng test. Không sửa vì ngoài phạm vi cổng. Raw output ở `offline-tests.log`.

Ready trong `ready.json` là snapshot ứng viên đã kiểm cổng; **không phải quyền chạy hiện hành**: offline suite chưa đạt, `result.json` ghi `liveAuthorized: false`. A/integer-clamp, A/cell-bounds, C/integer-clamp, C/cell-bounds đều chưa bắt đầu; không có biên nhận giả hoặc usage ước lượng ghi thành thực tế.

**Phiên bản:** Codex native riêng 0.159.0 dưới `.local/tools/codex/0.159.0` (đường dẫn đầy đủ trong `src/providers/codex.ts`); Unity CLI 1.0.0-beta.8; Editor 6000.0.84f1; Sol planner/critic, Terra executor A/C; Node 24, pnpm 11.19.0. Giữ nguyên tool MCP `unity_compile_test` và batchmode `-runTests` dự phòng.

```sh
cd /Users/dmobin/Documents/Codex/2026-09-22/new-chat/ai-agent-architect
./scripts/dev.sh build
./scripts/dev.sh exec node --test dist/test/unity-ready-gate.test.js dist/test/native-codex-credit.test.js dist/test/unity-comparison.test.js
```

Sau khi chủ dự án duyệt xử lý lỗi offline, tests đạt và snapshot quota cho phép, lệnh dự kiến (output phải mới):

```sh
./scripts/dev.sh exec node scripts/unity-comparison-local.mjs .local/walking-skeleton-acceptance-20261007 --two-case --live --ready-record docs/evidence/walking-skeleton-20261001-acceptance/ready.json --protocol docs/evidence/walking-skeleton-20261001-acceptance/protocol.json --approval-record docs/evidence/walking-skeleton-20261001-acceptance/approval.json
```

**Không chạy hiện tại.** Cần giải quyết test stop trước dispatch rồi tái xác nhận Ready và quyền chạy. Dự toán khoanh vùng lỗi này: 20–40 phút, khoảng 10–20 nghìn token điều phối, không benchmark; chưa được duyệt. Phần benchmark giữ dự toán đã trình: 8 call cho 4 lượt task, khoảng 387.439 token thô, tối đa 12 credit, 3 credit/task/nhánh. Không mở rộng sang scene/prefab/đợt 2. Thiếu turn/completed hoặc usage chốt khi chạm cap phải ghi lỗi hạ tầng.

**Quota:** đầu lượt 42%; cuối lượt ghi trong `result.json`; mức dừng 45%, gồm điều phối. Benchmark 0 token/credit, chi phí điều phối riêng chưa chốt. Reset 07/10/2026 khoảng 10:23 giờ Việt Nam; giới hạn 5 giờ chưa xác định. Commit gồm cả trang bàn giao trước. Không tạo khóa mới hoặc dùng khóa công ty; nếu push không có xác thực, chủ dự án chạy `git push origin main` trên Terminal đã đăng nhập.
