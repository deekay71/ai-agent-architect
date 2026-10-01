# Bàn giao protocol đợt 2 — 01/10/2026

Lệnh duy nhất mở CLI tương tác, cùng home/cwd harness:

```sh
env CODEX_HOME='/Users/dmobin/Documents/Codex/2026-09-22/new-chat/ai-agent-architect/.local/harness-codex-home' '/Users/dmobin/Documents/Codex/2026-09-22/new-chat/ai-agent-architect/.local/tools/codex/0.159.0/node_modules/.pnpm/@openai+codex@0.159.0-darwin-arm64/node_modules/@openai/codex/vendor/aarch64-apple-darwin/bin/codex' -C '/Users/dmobin/Documents/Codex/2026-09-22/new-chat/ai-agent-architect/.local/harness-workspace'
```

Mở /hooks và trust hook. Hook cố định ở `.local/harness-codex-home/hooks.json`, admission flag và hook log cùng home. Không thay định nghĩa/thứ tự hook sau khi owner trust. Không bypass, không requirements hệ thống, không sửa ~/.codex. Auth file được sao chép cục bộ (quyền 0600), không đưa vào Git.

Quota đầu phiên: 49%. Chưa chạy lượt model ở phiên này. Notion/Drive chỉ cập nhật sau đợt 2.
