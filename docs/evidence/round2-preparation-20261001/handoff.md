# Bàn giao protocol đợt 2 — 01/10/2026

Lệnh duy nhất mở CLI tương tác, cùng home/cwd harness:

```sh
env CODEX_HOME='/Users/dmobin/Documents/Codex/2026-09-22/new-chat/ai-agent-architect/.local/harness-codex-home' '/Users/dmobin/Documents/Codex/2026-09-22/new-chat/ai-agent-architect/.local/tools/codex/0.159.0/node_modules/.pnpm/@openai+codex@0.159.0-darwin-arm64/node_modules/@openai/codex/vendor/aarch64-apple-darwin/bin/codex' -C '/Users/dmobin/Documents/Codex/2026-09-22/new-chat/ai-agent-architect/.local/harness-workspace'
```

Mở /hooks và trust hook. Hook cố định ở `.local/harness-codex-home/hooks.json`, admission flag và hook log cùng home. Không thay định nghĩa/thứ tự hook sau khi owner trust. Không bypass, không requirements hệ thống, không sửa ~/.codex. Auth file được sao chép cục bộ (quyền 0600), không đưa vào Git.

Quota đầu phiên: 49%. Chưa chạy lượt model ở phiên này. Notion/Drive chỉ cập nhật sau đợt 2.

## Protocol khóa — tóm tắt một trang

| Task | Kiểm chính | Cap/arm/task |
|---|---|---:|
| Xóa hàng/cột + combo | Đồng thời, đếm ô giao một lần, board không gravity | 6 credit |
| Sinh 3 khối + game over | Seed cố định, chỉ pending quyết định còn nước đi | 6 credit |
| Prefab + kéo thả + preview | Scene/prefab, Unity drag events, preview mờ, atomic placement | 6 credit |
| Save/restore | Board, score, pending, version và lỗi save | 6 credit |
| Level hai phiên | Catalog/luật rồi UI dùng đúng version/API của phiên 1 | 10 credit (5+5) |
| Refactor board rồi bom | Core thuần C#, adapter; phiên sau bom 3×3 giữ regression | 10 credit (5+5) |

So B (A một lần + ≤2 repair/phiên) với C, Terra medium, cùng đề bài/tool/snapshot đầu/cap. Hidden tests chỉ chấm, không đưa vào sửa B; hai phiên dùng source/handoff chính arm đó. Task nhỏ planning tầng Task. 30 hidden cases đã compile: baseline 30 fail đúng stub/thiếu asset/adapter; positive control 30 Pass. Spike scene/prefab dự phòng PlayMode 2/2 Pass. Protocol-artifact Ready 7/7; **execution chưa Ready**.

Chấm hidden-case passes và task passes, owner fixes, input/cached/output credit, wall time. Giữ Brain khi hơn ≥2 task-pass hoặc bằng pass nhưng ít owner fixes hơn, cùng B credit≤2×C. Nếu không đạt điều kiện giữ và C≥B ở đợt 2 thì thu gọn Brain. Test hỏng do chính test: loại khỏi cả hai arm, giữ raw/adjusted score và lý do.

Dự toán **44–64 credit ≈4,2–6,2 điểm %**; soft caps toàn đợt **88 credit**, dự phòng hard-stop **132 credit ≈12,62 điểm %**. Tỷ lệ quota chỉ là quan sát nhiễu; cổng live 85%/reset và dự phòng đủ cặp quyết định dispatch. Ngắt cứng tại counter 1,5× cap, chấm source cuối, counter chưa chốt nếu interrupted; thiếu broker vẫn là infrastructure, không chạy thay. Luôn giữ hash protocol trong mọi receipt đợt 2.

Protocol SHA-256: `b9327ac9fb4b4f404c4828c39dfddcb712c9d58e331aac691909fd8d04b7fb97`. Nguồn: `docs/round2-protocol.md` + `protocol.json`, fixture manifest, lock-check và Ready bên cạnh. Không sửa nội dung đã khóa; thay đổi cần owner mở lại.

Bước 2: 49→49%; bước 3: 49→50%; từ đầu phiên 49→50% (+1pp rounded/shared). Không model call trong phiên này; model calls qua harness 0, credit harness 0; quota điều phối tính trong +1pp. Hook cuối bước 3 vẫn **untrusted**, không chạy lại bước 1. Proof runner đã chuẩn bị, yêu cầu fresh quota snapshot và trust thật; kiểm cả log hook, marker không thực thi, turn/completed/settlement và apply_patch nếu có gọi sau cap. Không suy “model không gọi apply_patch” thành live proof cho apply_patch.

Dừng tại mốc khóa protocol. Owner tự trust qua lệnh trên; nếu trust xong thì kiểm chứng lại bước 1 trước mọi paid call đợt 2. Chỉ owner “chạy” mới mở bước 4, sau offline preflight của adapter public-only/broker/receipt/scope. Adapter chạy đủ cặp chưa có live evidence; không dùng runner round 1. Notion/Drive chưa cập nhật, chỉ cập nhật sau đợt 2. Owner push gom commit local.
