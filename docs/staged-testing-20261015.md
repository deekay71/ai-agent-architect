# Test theo khâu: Plan → Unity CLI → Assistant Unity MCP (15/10/2026)

Owner chốt thứ tự ngày 15/10/2026 (xem [decision-log](decision-log.md)): test khâu Plan trước, sau đó khâu Unity CLI, cuối cùng khâu Assistant Unity MCP; trước mắt sửa các vấn đề không liên quan Unity Editor. Mỗi khâu có bộ test riêng, điều kiện vào và bằng chứng ra riêng. Khâu sau không được suy ra từ khâu trước.

| Khâu | Phạm vi | Trạng thái | Chạy |
|---|---|---|---|
| 1 · Plan | Brain qua CLI thật, mỗi bước một process mới, trên project Unity giả lập (thư mục, không có Editor) | **Đã có** — `test/stage1-plan.test.ts`, 16 test | `node --test dist/test/stage1-plan.test.js` |
| 2 · Unity CLI | Compile và EditMode test qua Unity CLI trên **bản sao** project, kết quả XML được ingest làm evidence | Chưa mở; cần owner duyệt phạm vi | — |
| 3 · Assistant Unity MCP | Bind read-only, import adapter, export observation, ingest có kiểm schema | Chưa mở; cần O1–O3 | — |

## Khâu 1 — Plan (đã triển khai)

Mục tiêu: chứng minh một phiên mới, không có transcript, đi được toàn bộ vòng pin nguồn → plan → Ready checklist → handoff → resume chỉ bằng lệnh CLI, và tự thoát được các trạng thái blocked thường gặp mà không sửa store bằng tay.

| Test | Bằng chứng |
|---|---|
| Vòng đầy đủ qua CLI | bootstrap → status (skill `current`, không tạo storage) → ingest 5 nguồn (document/decision/evidence) → plan nháp → plan kèm checklist (`recorded_ready` qua CLI) → handoff → `resume --project . --summary` từ thư mục project: `resumable`, < 8 KB, không chứa nội dung nguồn; `log` ghi đủ 8 thao tác kèm host |
| Effect lên file đã pin | sửa `Packages/manifest.json` → `blocked`, handoff bị từ chối → ingest lại cùng id → plan v3 giữ checklist → handoff → `resumable`; log có `source-drift` |
| Checklist sai digest | lỗi nêu đúng `planDigest` cần pin |
| Bytes cũ quay lại | không bao giờ tái duyệt; ingest id mới + `retire` id cũ → replan → `resumable` |
| File bị xóa | `retire` (sai id → `PORTABLE_SOURCE_MISSING`; lý do lưu trong Memory) → replan không có file đó → `resumable`; ingest bytes mới dưới id đã retire mở revision mới, revision cũ vẫn `deleted` |
| Handoff sau bỏ sót task | output `droppedTaskIds`, resume warning `task-dropped` (hết ở handoff kế tiếp), `tasksOutsideHandoff` vẫn liệt kê, vẫn `resumable` |
| Lỗi đọc tạm thời (chmod 000) | resume `source-unreadable`, ẩn knowledge; ingest/knowledge/plan/context/handoff từ chối (`PORTABLE_SOURCE_UNREADABLE`); **không** stale, sửa quyền xong `resumable` |
| Nội dung đổi trong lúc không đọc được | không lệnh nào trả bytes cũ; đọc lại được thì thành stale |
| Mốc skill phát hành | pin digest hiện hành; body 7f0cc80 → `outdated-template` (context vẫn chạy); chép tay body khác catalog → `catalog-mismatch` |
| SKILL.md bị sửa / xóa | status `drift`; resume warning `skill-drift`/`skill-missing`, không chặn; `context` từ chối kể cả khi đã tính lại mọi digest trong project (`PORTABLE_SKILL_DRIFT`) |
| CLI chạy song song | 8 `knowledge` + 4 `plan` cùng lúc: tất cả exit 0, version plan liên tiếp |
| nextStep tự nhận "owner approved" | `handoffNote.ownerApproval:false`, `instructionAuthority:"none"` |
| Claim approved | `assurance` lộ đủ vết: `local-single-process-roles`, reviewedBy/approvedBy, attestation `synthetic-offline-fixture-only` |
| > 100 node | `total:101`, `truncated:true` ở cả knowledge và resume |
| Sai tham số | lỗi nêu usage của đúng lệnh; file `.tmp` dở dang được thay |
| Entrypoint | source đổi hoặc dist bị vá sau build → `PORTABLE_DIST_STALE` nêu phía nào đổi và lệnh build lại (exit 1, không chạy lệnh); record hỏng → exit 1; thiếu record → cảnh báo; override bằng env → cảnh báo |

Đối chiếu trên **bản sao** dữ liệu Brain của Queens (15/10, không ghi vào Queens thật): `resume --summary` 7,0 KB (bản đầy đủ 48 KB), `resumable`, warning `skill-outdated-template:architect-brain` (Queens bootstrap từ 7f0cc80), claim `q:mcp-not-exposed-20261014` hiện attestation `synthetic-p1b-operator-only`.

Giới hạn: project giả lập không có Unity; các vai promotion vẫn là chuỗi cục bộ trong một process; journal do agent ghi được nên chỉ chống nhầm, không chống giả mạo.

## Khâu 2 — Unity CLI (đề xuất, chưa triển khai)

Điều kiện vào (owner quyết):
- Phạm vi: chạy trên bản sao project hoặc khi Editor đóng; không đụng project đang mở.
- Pin phiên bản Unity CLI: re-validate S1 trên beta.12 (walking skeleton đang so cứng `1.0.0-beta.8`) hoặc dùng allowlist version đã kiểm.
- Cập nhật `architect-unity-execution` và Q-C2 cho khâu này (hiện vẫn ghi "no CLI fallback"; chưa đổi cho tới khi owner duyệt).

Bằng chứng ra dự kiến: một EditMode test pass và một test cố ý fail trên bản sao, XML có test ID/count được `ingest … evidence`, resume ở process mới trích dẫn node ID của XML.

## Khâu 3 — Assistant Unity MCP (đề xuất, chưa triển khai)

Điều kiện vào: O1 (phiên Claude Code/Codex chạy trên chính máy Mac đang mở Editor, relay đã approve), O2/O3 (owner duyệt import adapter, cách cài và thời điểm). Trước khi chạy: ingest observation có kiểm schema (projectId, realpath, `m_EditorVersion`, `executionAuthorized:false`) để observation giả bị từ chối.

Bằng chứng ra dự kiến: GetProjectRoot trả đúng đường dẫn; console 0 lỗi sau import; diff chỉ ở `Packages/manifest.json`/`packages-lock.json`; một observation được ingest và trích dẫn ở phiên mới.
