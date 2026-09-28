# Phase 3 — Actual thực thi Terra / Sol / Astra, 28/09/2026

Đã áp dụng phân vai vào [plan tiếp tục](phase-3-execution-plan-2026-09-28.md) và config `fixtures/semantic-config/codex-terra-sol-astra-dev.json`: Terra medium thực thi; Sol medium phân tích thường lệ; Astra high thiết kế/phản biện sâu. Đây là requested profiles; chưa phải automatic router, không tự đổi model của phiên làm việc.

## Kết quả thực tế

- **530/530 tests Pass, 0 fail/skip** trong bản sao source sạch, frozen dependency install. Source không đổi trong kiểm thử. Bằng chứng: `docs/evidence/phase3-routing/verification-summary.json`.
- **3 live attempts mới:** hai diagnostic Terra và một reader Terra trong smoke. Cả ba không có valid output/terminal usage. Giữ cả ba ledger unknown/frozen; `reportedTokens: 0` chỉ là tổng counter đã nhận, không có nghĩa đã dùng 0 quota. Không retry, không cấp allowance thay thế hoặc reset deadline. Ledger 25/09 giữ nguyên.
- Matrix smoke dự kiến 9 main +3 G, tối đa15 calls; actual chỉ 1 main unknown, 0 scored, 0 G. Chưa chạy Sol/Astra, retrieval/compaction/G. Không có kết luận chất lượng hoặc so sánh chi phí ba model.
- Review bundle đã export từ bản source/compiled đúng policy của smoke, gồm 1 failed observation, 0 answers; chưa có human judgment. Source snapshot được lưu cùng delivery. Không dùng code mới để sửa hoặc nâng hạng receipt cũ.

## Chẩn đoán và bản sửa sau smoke

Hai giả thuyết đầu (experimental banner, deprecated web flags) chưa giải quyết startup; giữ lịch sử thất bại. Đã tắt banner và bỏ hai cờ `web_search_cached`/`web_search_request` deprecated, vẫn giữ `web_search="disabled"` và tắt standalone web.

Tái hiện CLI thật dưới **macOS sandbox deny network\*** tìm được exact notice: Code Mode unavailable vì host bị vô hiệu hóa. CLI đóng gói notice này thành `item.completed` loại `error` trước `turn.started`. Đây là quan sát offline, không suy rằng raw text của các live attempts cũ đã được khôi phục.

Parser mới chỉ nhận đúng toàn bộ message/shape đó, một lần, sau thread start và trước turn start, trên CLI version đã pin. Không bật Code Mode host, shell, web hay công cụ. Notice không thay output/usage. Duplicate, altered text, unknown fields, sai vị trí và lỗi khác vẫn bị chặn; policy digest gắn notice rule. Regression đỏ→xanh nằm trong evidence.

Offline trước sửa: dừng tại notice. Offline sau sửa: qua notice, đạt `turn.started`, rồi từ chối network error như dự kiến. **Bản sửa được xác nhận local/offline, chưa được xác nhận bằng một model response live sau sửa.** Không đổi các attempt cũ thành not-dispatched vì thiếu bằng chứng của chính attempt đó.

Harness: sao chép `docs/evidence/phase3-routing/offline-startup-harness.mjs` vào `.local/routing-continuation/offline-startup.mjs`, chạy bằng `./scripts/dev.sh exec node .local/routing-continuation/offline-startup.mjs` trên macOS. Nó dùng injected runner (mock assurance), chặn toàn bộ network bằng sandbox-exec; không phải semantic benchmark.

## Gate và bước tiếp

R1 local fix hoàn tất; live validation còn mở. R2 **Replan / frozen** theo unknown-usage guard. Không tái sử dụng config allowance này để chạy tiếp. R3 đã chuẩn bị worksheet bàn giao, nhãn/calibration/human review vẫn chưa thực hiện. T09/T10 Pass local; T19/T14 Not evaluated; T11 Replan. Phase 3 chưa Pass; chưa mở Phase 4/Unity/game.

Cần xử lý nhánh unknown theo policy trước live tiếp; không tự coi 14 lượt chưa dùng là quyền vượt freeze. Sau đó kiểm smoke trên bản sửa, rồi independent labels/fresh reviewed holdout, frozen acceptance protocol và T14. Không API key/API billing/reset credit; không push GitHub trong phiên này.
