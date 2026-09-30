# Công việc còn lại R3 — 30/09/2026

Phase 3 conditional closure đã được owner **accepted**. Evidence/report R2, gồm `evidence/*.json`, giữ immutable history; chúng không tự chứng minh production PASS.

1. Push phạm vi được duyệt và xác nhận CI.
2. Làm Unity baseline/infrastructure: T21 adapter + empty project, sau đó T08 compile/test evidence. Preflight lịch sử có Editor `6000.0.84f1`, CLI `1.0.0-beta.8`, 29 oracle và 3 CLI tests pass; chưa có model Unity run.
3. S1 đã Pass. Khi protocol frozen, reserve, native C credit monitoring và hidden-oracle isolation đủ evidence, chạy sequential A → B → C trên existing 10 microtasks. A chỉ một planner Sol → critic Sol → executor Terra pass. B dùng lại A, chỉ repair tối đa hai Terra round cho task model-failed và không rerun A. C sau B có cùng Terra/Unity skills/CLI rights; C per-task credit cap, gồm cached input, bằng B.
4. Nếu ≥2 task A infra-failed, dừng trước B/C. Ghi actual per task/arm: hidden-test pass count, owner manual fixes, credits, wall time, input/output/cached tokens, test evidence; B tách cumulative A+repairs và incremental repairs. Không cherry-pick sau kết quả.
5. Khi paired results sẵn sàng, owner chọn retain nếu B ≥ C + 2 pass hoặc equal pass/fewer fixes, với B credit ≤2×C. Các tie khác đi batch 2 (4 feature + 2 multi-session, budget approval riêng); C ≥ B batch 2 thì simplify Brain thành thin skills + memory + verification. Sau đó mới mở rộng Brain orchestration nếu quyết định giữ yêu cầu.
6. Hoàn tất T22 platform gate trước Game/Epic brief và Block Puzzle pilot.
7. Khi future batch trở thành next milestone, khóa 24-task scene/prefab + feature bank; hiện chỉ là outline.

Schema tests hiện tại chỉ kiểm cấu trúc/invariant, không thay engine admission, semantic acceptance hay checklist evidence integration tests. Compaction mặc định và advanced Explorer vẫn là experiment.
