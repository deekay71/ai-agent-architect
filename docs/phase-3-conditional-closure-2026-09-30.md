# Phase 3 đóng có điều kiện — 30/09/2026

## Đã xong

**Phase 3: Pass có điều kiện — owner đã nghiệm thu ngày 30/09/2026.** Phạm vi, residual risks và thứ tự tiếp theo xem [decision log](decision-log.md). Đây không phải production/semantic verified PASS.

| Hạng mục | Kết quả |
|---|---|
| Chấm lại đáp án v1 | 300/300 ID duy nhất, 0 thiếu, 50 lượt Sol, 0 retry |
| Chất lượng | 264/300 advisory Pass (88%); 36 hard failures vẫn giữ nguyên |
| Tính nhất quán judgment | 300/300; meaningCorrect 299/300 không thay thế hard checks |
| Bảo toàn lịch sử | 2.081 file đối chiếu SHA-256, 0 thay đổi |
| Bộ chọn evidence trên DEV | 20 cases × 2 mức nhiễu = 40 lượt; 17/17 case áp dụng giữ đủ nguồn ở mỗi mức, 3 N/A; 0 regression |
| Test local | 608/608 Pass, 0 fail/skip; kiểm tra focused sau sửa chặn ngân sách |
| Phase 2 clean install | Frozen install và check thành công sau khai báo build scripts bị chặn rõ ràng |
| Unity trước model | Unity 6.0.84f1; 29 oracle tests trên implementation tham chiếu; official Unity CLI 1.0.0-beta.8 chạy riêng 3/3 test preflight |

Bộ chấm khóa đủ ID trong schema. Chỉ ID thiếu do lỗi hạ tầng được retry tối đa hai lần; không chạy lại câu trả lời hoặc sửa điểm để đạt. Đợt thực tế không cần retry. Sau 144 đáp án, runner dừng theo thay đổi chính sách ngân sách; 156 đáp án còn lại tiếp tục cùng ledger. Context trùng được dùng chung nguyên văn, không tóm tắt hoặc bỏ dữ liệu.

Baseline Unity đã có 10 task C# nhỏ, manifest, stub, oracle được bảo vệ và runner single planner → critic → executor → official CLI compile/test → evidence → Memory. Trước mỗi đợt, runner thay toàn bộ implementation tham chiếu bằng stub; model chỉ nhận requirement, chữ ký và kế hoạch. Mock chứng minh luồng điều phối, chưa chứng minh tỷ lệ thành công model thật.

## Cần tôi quyết định

Owner đã nghiệm thu Phase 3. Báo cáo R3 mới sẽ dừng chờ nghiệm thu trước mọi model run; xem [roadmap](roadmap-r3.md).

## Chi phí-quota

- Đợt chấm: **917.780 token Sol ×3 = 2.753.340 token quy đổi**, còn 246.660 dưới trần 3 triệu. 50 calls, 0 pending, 0 unknown mới.
- Usage tuần trước/sau: **0% → 5%**. Giới hạn 5 giờ: **chưa xác định** ở cả hai đầu. Mốc chụp đầu không lưu timestamp chính xác.
- Hệ số quan sát sơ bộ ngày 30/09/2026: **550.668 token Terra tương đương / 1 điểm % quota tuần**. Có hoạt động Codex khác làm lẫn số đo; quota tuần tăng 2% → 3% ngay trong khoảng benchmark tạm dừng. Đây không phải quy đổi quota chính thức.
- Forecast 1,19 điểm % tuần của baseline cũ đã superseded. Chưa có forecast được duyệt cho round 1 R3.
- Các con số quy đổi phía trên chỉ là accounting lịch sử. Chính sách mới dùng credit trực tiếp và cap quota, xem [decision log](decision-log.md) và [tính lại credit](credit-quota-r3.md).
- Dùng Codex đăng nhập ChatGPT; không dùng API key, không suy token thành USD. Token của trao đổi/coordination không nằm trong ledger benchmark.

## Rủi ro

36 đáp án cũ vẫn thất bại hard checks. Tỷ lệ 88% là điểm advisory trên bộ đã lộ, không phải độ chính xác production. Sửa selector mới chỉ được đo trên DEV về giữ nguồn, chưa đo lại chất lượng trả lời end-to-end. Không tạo holdout mới và không mở thêm vòng săn PASS.

Memory promotion trong baseline là phân quyền local cùng broker, không phải cách ly dịch vụ. Hash oracle/source giúp phát hiện thay đổi; không phải sandbox chạy C# thù địch. Chưa chứng minh gameplay, build thiết bị, chất lượng hình ảnh hoặc production.

CLI không cung cấp hard token output cap. Runner dự phòng trước mỗi lượt và chặn khi không đủ ngân sách; một lượt có thể vượt ước lượng. Actual phải được ghi đủ và không dispatch thêm nếu chạm trần.

Planning phân tầng/interface-first là mặc định R3; chỉ compaction mặc định và Explorer nâng cao còn là thí nghiệm. Chưa xây engine mới trong lượt tài liệu/schema này.

## Kế hoạch tiếp theo và test plan

Thứ tự, forecast và test plan ở [roadmap R3](roadmap-r3.md). Schema local không chứng minh engine hoặc model end-to-end; cần Module Ready bằng code và spike CLI sau nghiệm thu. Scaffold 10 microtasks hiện có không thay 24-case task bank hay protocol Brain/Codex.

Evidence: [closure](evidence/phase3-pivot-20260930/closure.json), [300 assessments](evidence/phase3-pivot-20260930/regrade-report.json), [DEV selection](evidence/phase3-pivot-20260930/dev-selection-report.json), [quota](evidence/phase3-pivot-20260930/quota.json), [integrity](evidence/phase3-pivot-20260930/historical-integrity.json), [local tests](evidence/phase3-pivot-20260930/local-check.log).

