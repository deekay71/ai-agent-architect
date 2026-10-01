# Bàn giao walking skeleton — 01/10/2026

**Trạng thái: BLOCKED trước khi gọi model; chưa nghiệm thu.** Base commit: `25413197ae9bb412669e11dea8b4441f02cbaa1c`. Lượt này chỉ lập bản ghi kết quả/Ready; không sửa code, không sub-agent, không kiểm CI, không chạy Unity hoặc model benchmark.

## Phạm vi và kết quả

Chỉ nghiệm thu `integer-clamp`, `cell-bounds`: A (planner → critic → executor → Unity → evidence → Memory), rồi C (Codex thường + cùng Unity tool). Bốn lượt task chưa chạy. Không làm scene/prefab hoặc đợt 2. Canary trước đã được chủ dự án chấp nhận; giữ hạch toán 1,5 credit dự phòng, không gộp vào chi phí thực của lượt này.

**Nguyên nhân dừng:** `scripts/unity-comparison-local.mjs:72` chứa `if(twoCase) throw Error('TWO_CASE_MODULE_READY_REQUIRED');`. Điều kiện này luôn chặn `--two-case`, dù đã bổ sung Ready record. Script còn đọc Ready/protocol cũ của đợt 10 task; cần sửa code liên kết record/protocol mới với runner, không được xóa guard hoặc gọi vòng qua để chạy. Đây là chặn hạ tầng xác định từ source, không phải thất bại của model. Theo chỉ thị chủ dự án, dừng trước khi sửa.

Ready được ghi `not_ready` trong `result.json`; checklist đạt/không đạt, chưa cấp quyền chạy. Không tái sử dụng phê duyệt 10 task đã bị thu hồi. CI do chủ dự án tự kiểm trên GitHub.

## Các phiên bản đã ghim

- Codex: `@openai/codex@0.159.0`, native binary riêng tại `.local/tools/codex/0.159.0/node_modules/.pnpm/@openai+codex@0.159.0-darwin-arm64/node_modules/@openai/codex/vendor/aarch64-apple-darwin/bin/codex`. Không dùng lệnh `codex` toàn máy. Bằng chứng: `docs/evidence/unity-canary-compat-20261001.json`.
- Unity CLI: `1.0.0-beta.8`, `/Users/dmobin/.unity/bin/unity`; Editor `6000.0.84f1`, `/Applications/Unity/Hub/Editor/6000.0.84f1/Unity.app`. Giữ backend batchmode `-runTests` dự phòng; mỗi receipt ghi backend thực dùng.
- Planner/critic: `gpt-6-sol`; executor A/C: `gpt-5.6-terra`. Runtime repo yêu cầu Node 24, pnpm 11.19.0. MCP chỉ tự duyệt `unity_compile_test`.

## Lệnh và điều kiện tiếp tục

```sh
cd /Users/dmobin/Documents/Codex/2026-09-22/new-chat/ai-agent-architect
./scripts/dev.sh exec node scripts/unity-comparison-local.mjs .local/walking-skeleton-acceptance-20261007 --two-case --live
```

**Chưa chạy lệnh trên:** ở commit hiện tại nó chạy preflight rồi dừng tại guard. Chỉ sử dụng sau khi chủ dự án duyệt sửa hạ tầng, Ready/protocol đã được liên kết và adapter offline đạt. Output phải là thư mục mới. Không bỏ `--two-case`, vì sẽ đi vào luồng 10 task cũ.

Trần 3 credit/task/nhánh, A gồm cả planner + critic + executor. Khi chạm ngưỡng, chặn tool mới nhưng chờ `turn/completed` và usage chốt; thiếu một trong hai là lỗi hạ tầng. Lưu stdout/stderr, events, XML, exit code, ID/số test, source digest, approval audit và evidence/Memory. Lượt này gặp lỗi hạ tầng cần sửa code thì dừng ngay; không tự sửa hoặc retry.

## Ngân sách và việc tiếp theo

Mức dừng tuần được duyệt: 45%, tính cả điều phối. Snapshot đầu lượt 41%; snapshot cuối trong `result.json`; giới hạn 5 giờ chưa xác định. Reset dự kiến **07/10/2026 10:23:01, giờ Việt Nam**. Benchmark lượt này: 0 call, 0 token, 0 credit; token/credit riêng của phiên điều phối chưa có usage chốt.

Dự toán sửa liên kết Ready/protocol và test offline: **45–90 phút, khoảng 20–40 nghìn token điều phối** (ước tính; chưa được duyệt sửa trong lượt này). Không thay logic chấm hoặc cổng dừng. Sau sửa mới xác định admission cho 4 lượt task: **8 lời gọi model**, dự toán cũ **387.439 token thô** gồm dự phòng 20%, vượt ngưỡng hỏi trước 300.000; trần tổng **12 credit**. Theo hệ số lịch sử nhiễu, riêng trần model khoảng **1,15 điểm % tuần**, chưa gồm điều phối và không phải bảo đảm. Cần trình lại dự toán và đối chiếu phê duyệt trước dispatch; không chia đợt để né ngưỡng.

**Mở phiên mới sau reset:** đọc trang này và `result.json`; xem phê duyệt mới nhất; sửa hạ tầng chỉ khi được cho phép; hoàn thiện Ready và test adapter; chạy A hai task rồi C hai task; ghi kết quả và dừng. Không tự mở rộng sang scene/prefab hoặc đợt 2. Bản ghi này mới lưu local, chưa push; không tạo khóa tạm mới.
