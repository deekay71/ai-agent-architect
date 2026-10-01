# Bàn giao walking skeleton — cổng quota đã sửa, 01/10/2026

**Trạng thái: chưa nghiệm thu; bị chặn trước dispatch vì ngân sách.** Đây là trang tiếp tục sau reset 07/10, thay các trang bàn giao trước. Chủ dự án đã tự push `f0e1d2c`; commit mới cần chủ dự án push. Một agent, không sub-agent, không kiểm CI hoặc chạy scene/prefab/đợt 2.

**Chẩn đoán và sửa:** test cũ mong có một task đã chạy dù stop callback đã bật từ trước dispatch. Code dừng đúng, nhưng chỉ ném exception và mất bản ghi lý do. Đã tách test duplicate-receipt khỏi test trước dispatch, thêm bản ghi stop với credit 0 nếu chưa gọi model; các lượt đã chạy giữ nguyên receipt. Dừng mềm vẫn đóng tool mới rồi nhận `turn/completed` và usage chốt. Không đổi bộ chấm, receipt, credit cap hoặc allowlist.

Một lỗi hạ tầng bổ sung đã sửa: runner chỉ kiểm file STOP, chưa có phép so quota. Nay dùng snapshot `get_usage_limits` được supervisor cập nhật, tối đa 60 giây; thiếu/cũ thì chặn. Ngưỡng cố định 45%; snapshot khai báo 34%/40% bị từ chối. Dự toán phải vừa headroom trước dispatch. Khi quota chạm ngưỡng hoặc snapshot cũ, runner đóng cổng tool hiện hành và chờ model kết thúc; không tự lấy dashboard, không tự gia hạn thời gian snapshot.

**Kiểm chứng:** build và **33/33 test liên quan đạt**. Test dừng mềm gọi hook thật để kiểm `deny`, kiểm event `turn/completed`, usage và 9.500 credit micros của fixture (không phải tiền model thật). Runner thực cũng đã chạy admission: quota 44%, dự phòng 1,147 điểm %, headroom 1 → `forecast-exceeds-remaining-quota`, dispatch=false, credit=0. A/integer-clamp, A/cell-bounds, C/integer-clamp, C/cell-bounds đều chưa bắt đầu; không có biên nhận Unity mới. Bằng chứng ở `result.json`, `offline-tests.log`, `admission-report.json` và `quota-admission.ndjson` cùng thư mục.

**Phiên bản giữ nguyên:** Codex native riêng 0.159.0 (đường dẫn cố định trong `src/providers/codex.ts`), Unity CLI 1.0.0-beta.8, Editor 6000.0.84f1; Sol planner/critic, Terra A/C; Node 24, pnpm 11.19.0. A và C mỗi task tối đa 3 credit; A gồm planner/critic/executor. Canary trước vẫn hạch toán 1,5 credit dự phòng; lượt này benchmark 0 credit. Quota đầu lượt 43%, admission 44%, cuối lượt trong `result.json`. Reset dự kiến 07/10/2026 10:23 giờ Việt Nam.

```sh
cd /Users/dmobin/Documents/Codex/2026-09-22/new-chat/ai-agent-architect
./scripts/dev.sh build
./scripts/dev.sh exec node --test dist/test/unity-ready-gate.test.js dist/test/native-codex-credit.test.js dist/test/unity-comparison.test.js dist/test/unity-quota-gate.test.js
```

**Sau reset:** supervisor đọc quota thật, lưu JSON có `weeklyUsedPercent`, `hardStopUsedPercent:45`, `observedAt` đúng thời điểm đo; cập nhật tối thiểu mỗi 30 giây trong suốt đợt. Không viết lại timestamp cho số đo cũ. Khi test đạt, ngân sách còn đủ và Ready còn hợp lệ, chạy (output phải mới):

```sh
./scripts/dev.sh exec node scripts/unity-comparison-local.mjs .local/walking-skeleton-acceptance-20261007 --two-case --live --ready-record docs/evidence/walking-skeleton-20261001-acceptance/ready.json --protocol docs/evidence/walking-skeleton-20261001-acceptance/protocol.json --approval-record docs/evidence/walking-skeleton-20261001-acceptance/approval.json --quota-snapshot .local/walking-skeleton-quota-current.json
```

Giữ thứ tự A hai task rồi C hai task. Dự toán đã trình 8 call, khoảng 387.439 raw token, trần tổng 12 credit; không chia đợt để né admission. Không đủ headroom thì dừng. Sau khi có đủ bốn receipt, kiểm Unity XML/ID/exit code, final source, audit và evidence → Memory; chạm credit cap mà thiếu turn/completed hoặc usage chốt là lỗi hạ tầng. Chỉ bàn giao kết quả, không tự mở rộng phạm vi.
