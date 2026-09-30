# Công việc còn lại R3 — 30/09/2026

Phase 3 conditional closure đã được owner **accepted**. Evidence/report R2, gồm `evidence/*.json`, giữ immutable history; chúng không tự chứng minh production PASS.

1. Push phạm vi được duyệt và xác nhận CI.
2. Làm Unity baseline/infrastructure: T21 adapter + empty project, sau đó T08 compile/test evidence. Preflight lịch sử có Editor `6000.0.84f1`, CLI `1.0.0-beta.8`, 29 oracle và 3 CLI tests pass; chưa có model Unity run.
3. Khi owner duyệt forecast/budget, chạy fixes và comparison A/B/C trên existing 10 microtasks: Brain one pass; Brain + tối đa hai repair rounds; ordinary Codex cùng Unity CLI/token cap.
4. Ghi actual per task/arm, gồm input/output/cached tokens, direct credits, test evidence, repair/replan và manual fixes. Nếu forecast unknown hoặc vượt threshold/quota, xin approval trước run.
5. Cuối 10/2026 owner chọn retain hoặc simplify Brain. Sau đó mới mở rộng Brain orchestration nếu quyết định giữ yêu cầu.
6. Hoàn tất T22 platform gate trước Game/Epic brief và Block Puzzle pilot.
7. Khi future batch trở thành next milestone, khóa 24-task scene/prefab + feature bank; hiện chỉ là outline.

Schema tests hiện tại chỉ kiểm cấu trúc/invariant, không thay engine admission, semantic acceptance hay checklist evidence integration tests. Compaction mặc định và advanced Explorer vẫn là experiment.
