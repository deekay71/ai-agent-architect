# Phase 3 — Hoàn thiện benchmark và test local

Actual: 25/09/2026. Owner đã chọn **chỉ hoàn thiện và chạy test local trước**. Đợt này không gọi OpenAI API, không kiểm credentials, không chạy Unity hoặc mở gameplay. Phạm vi local đã hoàn tất; toàn Phase 3 vẫn chưa PASS.

## Kết quả đã xác minh

- Fresh source copy, frozen dependency install bỏ lifecycle scripts, TypeScript build và **384/384 tests pass; 0 fail, 0 skip**. Tăng 57 tests so baseline 327. Source trước/sau giữ nguyên; manifest emitted JavaScript gắn với lần build được lưu cùng evidence. Log kiểm thử đầy đủ nằm trong `docs/evidence/phase3-closure/clean-r1-*-check.log`.
- Campaign `semantic-local-v2` hoàn tất **960 comparison trials + 120 G controls**. Main: 630 reader completions, 90 token-budget-blocked, 240 context-blocked. G: 90 completions, 30 context-blocked. Có 1.350 lượt chạy worker mock trong sandbox; **0 lượt provider thật**.
- Không mất canonical constraints/unknowns qua các checkpoints; source/config/dataset pins giữ nguyên. Spend mock 0, không có reservation treo hoặc uncertain receipt. `phaseGate = Not evaluated`.
- Reader mock luôn abstain và counter dùng byte/4 có nhãn rõ. Các reader completions không có nghĩa là trả lời đúng. Không dùng số false accept thấp của reader này, số test xanh hoặc token synthetic để tuyên bố model quality/cost/latency đã được đo.

Tóm tắt máy đọc: [local-campaign-summary.json](evidence/phase3-closure/local-campaign-summary.json). Lệnh và ma trận: [test plan](phase-3-test-plan.md). Kế hoạch còn lại: [closure plan](phase-3-closure-plan.md).

Clean verification: [summary cuối](evidence/phase3-closure/clean-r1-20260925T071254Z-d760e9-summary.json), Node 24.19.0 / pnpm 11.19.0 / macOS 26.2 arm64. Có 119 source files giữ nguyên, 81 emitted JS files được hash; source manifest digest `sha256:363c73a580b5ae90d5322b35cd224fafb59a7f904905c45d449153acae796103`. Lần đầu tests cũng 384/384 nhưng wrapper đọc version metadata bị lỗi; đã giữ error record và logs, không diễn giải thành test failure. Wrapper sửa đã chạy lại trước khi nhận yêu cầu tránh lặp; cả hai lần được lưu, không có source fix giữa hai lần.

## Những phần mới

1. **OpenAI adapter:** exact request/model pins, whole-request counting, strict structured output, bounded timeout/body, no blind retries; refusal/incomplete/malformed/unknown usage được phân loại. Missing or unbound usage giữ unknown. Ước lượng chi phí dùng usage nhân pinned rates, không được gọi là hóa đơn.
2. **Campaign budget:** SQLite reservations được ghi trước generation; cùng authorization không reset ngân sách qua restart hoặc campaign mới. Kết quả mơ hồ giữ reservation và ngăn tiếp tục. Token ceiling sai dừng campaign, kể cả cache discount khiến chi phí chưa vượt reserve. Đây là measurement ledger, không cấp runtime authority.
3. **Ba context arms:** full eligible context; retrieval/isolation; retrieval + compaction 1 hoặc 3 vòng. Mỗi profile so trên cùng tổng budget 8.192/16.384/32.768, density 0/8. Tất cả compactor và reader calls tính vào tổng trial. G control chạy riêng sau comparisons, chỉ cấp public evidence được evaluator chọn; không cấp expected answer/labels và không quay lại tuning arms.
4. **Dataset candidate mới:** v2 có 363 public documents, 20 dev và 10 candidate holdout theo families riêng. Có 8 fresh in-scope distractors/case cùng stale/revoked/cross-repo negatives. Sealed v1/r0 được giữ vì review phát hiện density không thay input eligible. Dataset/hash không tự chứng minh nhãn độc lập.
5. **CLI và review import:** preflight không đọc key; local sandbox worker không có quyền đọc oracle/repo hoặc gọi mạng. Holdout cần review coverage từng selected case; review một dev case không mở toàn bộ holdout. Human import là operator attestation với external evidence hash, không xác thực danh tính người và không tự cấp PASS.

Profiles tham chiếu cho benchmark là `gpt-6-astra` high cho planning và `gpt-6-luna` medium cho execution; `gpt-6-sol` chỉ là lựa chọn escalation thủ công về sau. Source [catalog OpenAI](https://developers.openai.com/api/docs/models) và [pricing](https://developers.openai.com/api/docs/pricing) được đối chiếu ngày 25/09/2026; cần kiểm/pin exact returned model trước live. Không gọi các model này trong đợt local. Actual multi-planning orchestration/critic calibration vẫn ở Phase 4.

## Review và giới hạn

Các regression tests đã kiểm density thật khác nhau, pin dependency canonical fixture, provider/source drift qua async boundary, partial-review holdout bypass, unknown totals bị ghi nhầm 0, token-limit redispatch và malformed mock arithmetic. G isolation/budget và partial journals khi dataset drift có test độc lập. Các findings có repro đã sửa trước final clean run.

Critical unknowns tiếp tục chặn context: 5 dev cases ở mỗi matrix cell không đi tới reader. Giữ hard gate này; **reader abstention/conflict quality của các case đó chưa được đo**. Floor strictPass 0,9 vẫn provisional, chưa phải ngưỡng calibrated có thể dùng để nghiệm thu trên mẫu có blocked cases. Conservative answer alternatives và constraint-ID coverage không chứng minh giữ đúng nghĩa/behavior của yêu cầu. Phần executable/human downstream acceptance còn mở.

Trusted broker/evaluator vẫn có quyền đọc nhãn để kiểm seal/chấm điểm; labels không nằm trong request payload. Sandbox/mock không chứng minh production host/operator isolation hoặc Unity compatibility. Source pins không tự kiểm stale emitted JS ở lần gọi CLI tương lai; chạy build trước CLI và giữ build/source manifest đi cùng evidence, như đợt này.

## Gate và bước tiếp theo

T09/T10 **Done/Pass local**; T19/T14 **Doing/Not evaluated**; T11 **Doing/Replan**. Roadmap vẫn 8 Done, 3 Doing, 14 Todo. Không hạ AC, không mở Phase 4 hoặc game; T22 vẫn bắt buộc trước Block Puzzle.

Scope local hiện tại đã xong. S2–S4 chỉ bắt đầu khi owner yêu cầu chạy model thật: independent label/review và calibrated protocol; cấp cap cho campaign mới; dev calibration rồi reviewed fresh holdout; adjudication T19/T11 và handoff T14. Không tự chạy API hoặc agents nền sau phiên. Forecast R2 giữ nguyên; estimate có điều kiện nằm trong closure plan.

## Pins và nơi lưu

- Implementation digest: `sha256:1f8ae54cc224e7da7fd180ef366bb54c5523125e62dfdabae8dd01f9c4cff3c8`.
- Dataset v2 seal: `sha256:be327cca08b882f0c45669cf5cff38f5009dd26a89cb2c46b39dcc2302250008`.
- Config digest: `sha256:d13369e1653c4b8befff4f81b0580cc96de7b4b9eac05bac7c82d8e6d9fef629`.
- Full report SHA256: `fda854e2567fa79ea8c07a3927f98737eeb837a022f98321d296b37546e17be7`.
- Full campaign ở `.local/semantic-local-v2-run1`: lock, calls/trials journals, packets, report, Memory fixtures. Summary/logs và clean-source evidence trong repo; full evidence và spend ledger trong cloud bundle.
- [Test plan trên Notion](https://app.notion.com/p/3e6a6c16b3dc81bd93c9f7c999882bd8); [closure plan trên Notion](https://app.notion.com/p/3e6a6c16b3dc81d5b626f58bc16c2c79).
- [Thư mục Drive của đợt local](https://drive.google.com/drive/folders/1C7ZQmtNnJyJafEABbt_je-1gZUuc42jE). Source/Git history, context, tài liệu và raw evidence được đóng gói kèm manifest. GitHub Phase 2/3 vẫn chưa push bằng credential đã xác thực; không tạo lại khóa tạm.

Baseline Phase 3 và các campaign thất bại cũ được giữ nguyên trong Git history/tài liệu. Evidence của đợt local không thay đổi kết luận lịch sử hoặc tự công nhận acceptance mới.
