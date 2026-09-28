# Phase 3 — Đợt kiểm chứng sau điều chỉnh, 28/09/2026

## Kết quả chính

Đường Codex native đã chạy đủ **15/15 invocations, 12/12 valid reader answers** (9 main +3 G controls), tổng **141.613 reported tokens**, không pending/unknown trong đợt này. Terra medium, Sol medium và Astra high đều hoàn thành F/R/C/G. `stoppedReason=null`, source/config/dataset/compiled pins ổn định. Budget báo invocation-limit vì đã dùng đủ15 lượt, không phải lỗi giữa campaign. CLI vẫn pin version 0.155.0-alpha.16.4; identity assurance chỉ requested-only.

**Transport/usage smoke hoàn tất. Reader-quality gate chưa đạt:** strictPass 0/9 main và0/3 G. Evidence coverage/citation/revision đúng12/12; hai nguyên nhân strict đều là lexical answer mismatch và output constraints dùng mô tả thay vì ID. Không coi lexical mismatch là nhãn độc lập rằng nội dung model sai.

| Profile | Calls | Reported tokens gồm G | Full | Retrieval | Compaction gồm summary +reader | C/F |
|---|---:|---:|---:|---:|---:|---:|
| gpt-5.6-terra / medium | 5 | 44,729 | 8,976 | 8,978 | 17,793 | 1.982× |
| gpt-6-sol / medium | 5 | 47,228 | 9,496 | 9,494 | 18,759 | 1.975× |
| gpt-6-astra / high | 5 | 49,656 | 9,934 | 9,983 | 19,734 | 1.987× |

Đơn vị là input+output tokens báo bởi CLI, có Codex context/overhead; không phải USD hoặc phần trăm quota. Một case DEV ngắn, density0, repeat1, n=1; các tỷ lệ chỉ mô tả workload này. Chưa kết luận model nào tốt/rẻ hơn hay retrieval/compaction tiết kiệm ở quy mô lớn. G được tách khỏi so sánh main.

## Điều chỉnh thực hiện

1. Owner yêu cầu “thực hiện điều chỉnh đi” sau báo cáo frozen. Đã cấp phạm vi tiếp nối riêng tối đa15calls/400.000 reported tokens/30phút/120giây mỗi call, có record liên kết5attempts lịch sử. Không thay đổi bytes của ledger cũ, không refund/reconcile unknown hoặc reset deadline. Tổng audit20attempts:15settled mới,4unknown lịch sử,1not-dispatched lịch sử. Trần token là post-call.
2. Smoke xác nhận bản sửa exact Code Mode startup notice hoạt động với cả ba model, không cần bật tool host/shell/web.
3. Sau quan sát12outputs, bổ sung prompt và schema description: trường `constraints` phải chứa nguyên văn **task.constraints[].id**, gồm mọi constraint và cả khi abstain. Prompt cũ chỉ nói “preserve constraints”, gây mơ hồ ID/mô tả. **Chưa chạy live lại prompt mới** vì đã hết allowance đợt này. Scorer/gold/threshold và điểm lịch sử giữ nguyên.
4. Full regression trên source copy sạch sau chỉnh prompt: **530/530 Pass,0fail/0skip**. Source không đổi trong test. Không thêm test chỉ kiểm literal prompt; actual12outputs là bằng chứng tái hiện hợp đồng mơ hồ. [Verification](evidence/phase3-continuation/verification-summary.json).
5. Export đủ12outputs với full public context/request/answer và digests trước chỉnh prompt. Source+compiled snapshot của smoke đã kiểm khớp lock. [Bản đọc review](phase-3-dev-output-review.md) chưa có human judgments; review bundle không chứa oracle/score.

## Kế hoạch đã điều chỉnh

- R1: hoàn tất kiểm chứng CLI bằng model thật.
- R2: transport/coverage hoàn tất; quality **Replan**, không gộp thành Phase PASS.
- R3a: kiểm lại prompt constraint IDs trên lượt DEV tiếp theo; tách contract compliance khỏi semantic correctness trong rubric. Sol chuẩn bị rubric/case families; Astra phản biện độc lập; Terra triển khai theo phân vai. Phân vai không đồng nghĩa đã có ba model thực hiện calibration.
- R3b: dùng actual review packet để lấy human/independent semantic labels trước chốt equivalence/rubric; cần admissible answerable/abstain/conflict cases và fresh reviewed holdout. Không dùng bộ câu trả lời đã nhìn để giả fresh holdout.
- R3c: chưa bật compaction mặc định cho case ngắn. Thêm strata chiều dài/history/distractors và nhiều vòng compaction để tìm điểm có lợi, báo toàn bộ summary+reader usage, matched profiles và missing outcomes. Threshold và uncertainty còn DRAFT.
- R4: freeze protocol/holdout và xét T19/T11/T14 khi evidence đủ. T09/T10 Pass local; T19/T14 Not evaluated; T11 Replan; Phase3 chưaPASS. Chưa mở Phase4/Unity/game.

Next session: R3a prompt compliance và review dev; sau đó calibration/freeze. Không hẹn ngày Phase3 Pass trước khi đóng các phụ thuộc. Giữ Forecast R2 lịch sử.

## Evidence và tái dựng

Campaign `.local/codex-terra-sol-astra-post-fix-20260928`; review `.local/codex-terra-sol-astra-post-fix-20260928-review`; audit trong `docs/evidence/phase3-continuation`. `continuation-record.json` liên kết5prior attempts; config/giới hạn thông báo trước dispatch, read-only DB snapshot lưu sau lúc start khi sửa chế độ mở SQLite readonly. Native campaign tự ghi config/source lock và reservation trước call.

`smoke-source-snapshot.tar.gz` giữ code/prompt cũ khớp actual; source cuối chứa prompt đã sửa và evidence. Không chạy lại historical review export bằng prompt mới vì binding phải khác. Không API key/reset credit/API billing; source chỉ commit local, chưa push GitHub.
