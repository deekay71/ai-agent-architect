# Bàn giao walking skeleton — 01/10/2026

**Kết luận: PASS luồng walking skeleton trên hai microtask × A/C.** Cả bốn lượt có Unity receipt, XML/test ID khớp, nguồn cuối khớp, exit code 0, `turn/completed` và usage chốt. Hai lượt A đi đủ request → planner/critic → executor → Unity → evidence → Memory, tạo hai claim approved. Kết quả này không kết luận Brain tốt hơn Codex thường.

| Lượt | Exit | Test | Credit đã chốt | Bằng chứng |
|---|---:|---|---:|---|
| A / IntegerClamp | 0 | 3/3 PASS | 2,43047 | [Receipt + IDs](A/integer-clamp/audit.json), [XML](A/integer-clamp/tests.xml) |
| A / CellBounds | 0 | 3/3 PASS | 2,12184 | [Receipt + IDs](A/cell-bounds/audit.json), [XML](A/cell-bounds/tests.xml) |
| C / IntegerClamp | 0 | 3/3 PASS | 1,21752 | [Receipt + IDs](C/integer-clamp/audit.json), [XML](C/integer-clamp/tests.xml) |
| C / CellBounds | 0 | 3/3 PASS | 1,01276 | [Receipt + IDs](C/cell-bounds/audit.json), [XML](C/cell-bounds/tests.xml) |

Mỗi audit ghi numeric ID và full test name từ XML. Tên test khớp giữa A và C, gồm:

- `WalkingSkeleton.Tests.WalkingSkeletonFixtureTests.IntegerClamp_oracle(-1,0,4,0)`
- `WalkingSkeleton.Tests.WalkingSkeletonFixtureTests.IntegerClamp_oracle(5,0,4,4)`
- `WalkingSkeleton.Tests.WalkingSkeletonFixtureTests.IntegerClamp_oracle(2,0,4,2)`
- `WalkingSkeleton.Tests.WalkingSkeletonFixtureTests.CellBounds_oracle(0,0,2,2,True)`
- `WalkingSkeleton.Tests.WalkingSkeletonFixtureTests.CellBounds_oracle(2,1,2,2,False)`
- `WalkingSkeleton.Tests.WalkingSkeletonFixtureTests.CellBounds_oracle(0,0,0,2,False)`

**Chi phí:** 8 call, 313.459 token thô (input + output; cached input không cộng hai lần), tổng **6,78259 credit**. A gồm Sol planner + critic + Terra executor. Từng task dưới trần 3 credit; không retry, không sửa tay. Quota đầu lượt 44%, trước/sau đợt model 45%/45%; cuối lượt trong `result.json`. Số đo làm tròn dùng chung tài khoản; không suy ra model miễn quota. Mức dừng 47% chỉ cho bốn lượt này. Reset dự kiến **07/10/2026 10:23 giờ Việt Nam**.

**Phiên bản:** Codex native riêng 0.159.0; Unity CLI 1.0.0-beta.8; Editor 6000.0.84f1. Cả bốn receipt dùng backend `unity-cli`, không fallback. MCP được cấu hình chỉ `unity_compile_test`, approval_mode=approve; raw events xác nhận đúng server/tool hoàn tất không lỗi. Node 24/pnpm 11.19.0. Build và **33/33 test offline đạt**.

**Giới hạn bằng chứng:** Không lượt nào chạm credit reserve/cap, nên đợt này không kích hoạt dừng mềm. Không tìm thấy per-tool hook admission log ở cả bốn lượt; raw MCP completion events có đầy đủ. Không coi đợt này là bằng chứng thực thi hook chặn tool. Dừng mềm có bằng chứng offline; mang giới hạn này sang phiên sau, không tự sửa trong lượt hiện tại.

**Lệnh đã chạy** — output đã tồn tại, không chạy lại:

```sh
cd /Users/dmobin/Documents/Codex/2026-09-22/new-chat/ai-agent-architect
./scripts/dev.sh exec node scripts/unity-comparison-local.mjs .local/walking-skeleton-live-47-20261001 --two-case --live --ready-record docs/evidence/walking-skeleton-20261001-47/ready.json --protocol docs/evidence/walking-skeleton-20261001-47/protocol.json --approval-record docs/evidence/walking-skeleton-20261001-47/approval.json --quota-snapshot .local/walking-skeleton-live-47-quota.json
```

Supervisor lấy quota thật mỗi 15 giây; cổng từ chối snapshot quá 60 giây. Quyết định duyệt ngày 01/10, toàn bộ nội dung và mức 47% được lưu trong Ready và kiểm hash. Thay đổi source lượt này chỉ cập nhật giá trị phê duyệt và hash tương ứng; giữ nguyên bộ chấm, biên nhận, trần 3 credit/task, allowlist và cách dừng.

**Hồ sơ:** `result.json`, `report.json`, bốn thư mục A/C, `memory-snapshot.json`, `quota-history.ndjson`, `lock.json`, `offline-tests.log`. Raw stdout/stderr/events/Unity logs giữ nguyên ở `.local/walking-skeleton-live-47-20261001`, có manifest SHA-256 trong `raw-artifact-manifest.json`; không đưa toàn bộ raw log vào Git.

**Việc tiếp theo:** Dừng. Sau reset 07/10, mở phiên mới từ trang này, xem giới hạn hook log rồi mới làm spike scene/prefab và chuẩn bị protocol/dự toán đợt 2 theo phê duyệt khi đó. Không chạy đợt 2 bằng phê duyệt 47% này. Chủ dự án tự push commit mới bằng `git push origin main`.
