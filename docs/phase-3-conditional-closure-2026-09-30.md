# Đóng hồ sơ Phase 3 và bàn giao baseline Unity — 30/09/2026

## Đã xong

**Phase 3: Pass có điều kiện, chỉ trong phạm vi đóng hồ sơ hành chính.** Quyết định theo timebox của chủ dự án; không cấp verified PASS, không công nhận production readiness và không sửa kết quả lịch sử.

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

Người dùng quyết định chỉ bàn giao Phase 3, chưa chạy model Unity. Dự toán lưu cho lần sau: 10 task, 30 lượt (20 Sol, 10 Terra), không tự retry; dự kiến 280.020 token thô / 653.380 token quy đổi, trần DEV 1.500.000. Mục đích là có baseline thực tế trước khi bật thí nghiệm.

GitHub đã có lịch sử đến commit 2481c70. Bản sửa và kết quả trong báo cáo này đang local, chưa xác nhận push hoặc CI của commit mới. Nếu cần cấp quyền truy cập tạm mới để push, sẽ trình quyền repo cụ thể trước khi cấp.

## Chi phí-quota

- Đợt chấm: **917.780 token Sol ×3 = 2.753.340 token quy đổi**, còn 246.660 dưới trần 3 triệu. 50 calls, 0 pending, 0 unknown mới.
- Usage tuần trước/sau: **0% → 5%**. Giới hạn 5 giờ: **chưa xác định** ở cả hai đầu. Mốc chụp đầu không lưu timestamp chính xác.
- Hệ số quan sát sơ bộ ngày 30/09/2026: **550.668 token Terra tương đương / 1 điểm % quota tuần**. Có hoạt động Codex khác làm lẫn số đo; quota tuần tăng 2% → 3% ngay trong khoảng benchmark tạm dừng. Đây không phải quy đổi quota chính thức.
- Unity forecast: **khoảng 1,19 điểm % quota tuần**, ước tính từ số đo ngày 30/09/2026, độ tin cậy thấp vì số đo lẫn và làm tròn.
- Chính sách cố định: Terra ×1, Sol ×3, Astra ×5; hỏi trước khi toàn đợt vượt 300.000; DEV ≤1,5 triệu; nghiệm thu phase ≤3 triệu. Không chia hoặc reset ledger để lách trần.
- Dùng Codex đăng nhập ChatGPT; không dùng API key, không suy token thành USD. Token của trao đổi/coordination không nằm trong ledger benchmark.

## Rủi ro

36 đáp án cũ vẫn thất bại hard checks. Tỷ lệ 88% là điểm advisory trên bộ đã lộ, không phải độ chính xác production. Sửa selector mới chỉ được đo trên DEV về giữ nguồn, chưa đo lại chất lượng trả lời end-to-end. Không tạo holdout mới và không mở thêm vòng săn PASS.

Memory promotion trong baseline là phân quyền local cùng broker, không phải cách ly dịch vụ. Hash oracle/source giúp phát hiện thay đổi; không phải sandbox chạy C# thù địch. Chưa chứng minh gameplay, build thiết bị, chất lượng hình ảnh hoặc production.

CLI không cung cấp hard token output cap. Runner dự phòng trước mỗi lượt và chặn khi không đủ ngân sách; một lượt có thể vượt ước lượng. Actual phải được ghi đủ và không dispatch thêm nếu chạm trần.

Multi-planner, compaction mặc định và Explorer nâng cao tiếp tục tắt. Chỉ mở từng thí nghiệm khi có protocol, ngân sách và kết quả thắng baseline trên task thật.

## Kế hoạch tiếp theo và test plan

1. **Đã hoàn tất trong lượt này:** chấm đủ 300, audit lịch sử, đo selector DEV, chốt hồ sơ có điều kiện.
2. **Khi người dùng mở lại đợt Unity và duyệt ngân sách, khoảng một buổi:** chạy 10 task Unity, mỗi task tối đa một chuỗi 3 model calls; lưu yêu cầu, plan, critic, code, receipts, source hash, exact test count, XML/log, Memory claim hoặc lý do không promote. Case bị critic từ chối hoặc compile/test fail được giữ nguyên kết quả; không gọi là 10/10 nếu chưa đo đủ.
3. **Cùng lượt bàn giao:** push source, kiểm CI build/test và Phase 2 từ fresh install; cập nhật Notion và Drive. CI Node không tự chạy model/Unity cần license.
4. **Sau baseline:** review task success, false acceptance, token, latency, recovery và công người dùng. Chỉ lên đợt thí nghiệm riêng khi baseline chỉ ra nhu cầu.

Điều kiện test: critic reject thì không executor; unknown usage đóng băng; source/test bị đổi thì fail; XML zero/skipped/missing tests không Pass; test fail không ghi Memory claim; cap dự toán chặn trước dispatch; receipt phải khớp request/model/config/CLI; lịch sử v1 bất biến.

Evidence: [closure](evidence/phase3-pivot-20260930/closure.json), [300 assessments](evidence/phase3-pivot-20260930/regrade-report.json), [DEV selection](evidence/phase3-pivot-20260930/dev-selection-report.json), [quota](evidence/phase3-pivot-20260930/quota.json), [integrity](evidence/phase3-pivot-20260930/historical-integrity.json), [local tests](evidence/phase3-pivot-20260930/local-check.log).

