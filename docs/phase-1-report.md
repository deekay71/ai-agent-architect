# Nghiệm thu Phase 1 — R2

Ngày: 24/09/2026. Phạm vi: **T17/T06/T23, tương ứng P0 cũ**. Kết quả chỉ áp dụng foundation development conformance; không cấp quyền runtime, chứng nhận skill hoặc T22 PASS.

Trạng thái: **PASS nghiệm thu foundation trong phạm vi Phase 1**. T17/T06/T23 hoàn tất ngày 24/09/2026; 17 AC R2 có bằng chứng bên dưới. Review độc lập đã đóng cả bốn findings trong phạm vi được kiểm. Đây là kết quả bootstrap development acceptance, không phải GateReport/PolicyRelease của runtime production.

## Bàn giao

- Repo TypeScript modular monolith riêng, Node 24/pnpm 11.19.0 và dependency lockfile; CLI với output JSON.
- 26 executable contracts version 0.5.0, canonical hashing và strict validation.
- Audit các liên kết task/context/plan/gate/handoff/operation/evidence/memory/skill với authority fixture riêng.
- Catalog/resolver local: source pin, resource bytes, exact version, compatibility, capability binding, metadata discovery và nạp resources khi cần; không chạy nội dung skill.
- Interfaces WorkflowRunner/ModelAdapter/ToolAdapter/EvalHarness và offline fake workflow.
- R2 gồm 25 task, thêm T23/T24/T25; baseline R1 được giữ nguyên. Phase 2–6 chưa triển khai.

## Kết quả kiểm chứng

| Kiểm chứng | Kết quả | Bằng chứng |
|---|---|---|
| Clean checkout, frozen lockfile, ignore install scripts | Cài dependency và build thành công | `evidence/clean-install.log`, `evidence/clean-check.log` |
| Automated suite | **105 passed, 0 failed, 0 skipped** | `evidence/clean-check.log`; reviewer chạy độc lập cùng kết quả |
| CLI demo / skill catalog demo | Exit 0; `dispatchAuthorized:false` | `evidence/demo.json`, `evidence/skills-demo.json` |
| CLI gate bị làm sai | Exit 1 như mong đợi | `evidence/demo-tampered.json`, `evidence/cli-checks.json` |
| Original adversarial repros | **12/12 bị từ chối** với authority không đổi; valid baseline vẫn nhận | `review-phase1.md`, `evidence/review/` |
| Targeted follow-up review | **3/3 bị từ chối**: đổi catalog/profile nhưng dùng gate cũ; receipt/postcondition mâu thuẫn | `review-phase1.md`, `evidence/review/` |
| Nối catalog thực vào audit | Load pin → resolve → load body → binding → audit hợp lệ; thay body bị từ chối | `test/foundation.test.ts` |
| Source của clean checkout | 25 file code/test/fixture/toolchain khớp SHA-256 | `evidence/tested-source-manifest.json` |

Số tests là phạm vi quan sát, không phải điểm chất lượng model. Không dùng rubric 85/100 chưa calibration để tự cấp điểm cho Phase 1. Toàn bộ AC dưới đây đạt trong phạm vi foundation được xác định trước; các yêu cầu runtime được giữ ở phase sở hữu.

## Ma trận nghiệm thu chuẩn R2

Các F01–F10 trong `phase-1-acceptance.md` là nhóm kiểm kỹ thuật được ghi trước integration; bảng F1-01…F1-17 dưới đây là mapping đầy đủ theo plan R2, không phải hai bộ gate khác nhau.

| AC R2 | Task | Bằng chứng trong repo | Nhóm kiểm |
|---|---|---|---|
| F1-01 | T17 | README, package/lockfile, clean checkout và CLI smoke | F01/F09 |
| F1-02 | T17 | architecture.md, permissions.ts, permissions.test.ts | F09 |
| F1-03 | T17 | workflow.ts, workflow-cli.test.ts; fake adapters chỉ trả fixture | F09 |
| F1-04 | T17 | remaining-work.md ánh xạ gaps → task, scope architecture | F10 |
| F1-05 | T06 | schemas.ts registry 26 loại, contracts.test.ts | F02 |
| F1-06 | T06 | discriminated CheckDefinition/Result và conditional negative fixtures | F02/F05 |
| F1-07 | T06 | canonical.ts, canonicalization/tamper tests | F03 |
| F1-08 | T06 | audit.ts: DAG/ref/current-input/content binding; foundation.test.ts | F04/F05 |
| F1-09 | T06 | trusted fixture policy/check/issuer/evidence/attestation tests | F05 |
| F1-10 | T06 | lifecycle/operation/source/claim/checkpoint fixtures và invalid versions | F02/F06 |
| F1-11 | T06/T23 | SkillDescriptor/Binding cùng types catalog; fixture và integration tests | F04/F07 |
| F1-12 | T23 | fixtures/skill-catalog: package tự tạo, metadata/pin/license; không upstream install | F07 |
| F1-13 | T23 | skills.test.ts: byte tamper, missing/path/symlink/duplicate, script inert | F07 |
| F1-14 | T23 | compatibility matrix: target/unknown/mismatch/revoked/missing tool | F07 |
| F1-15 | T23 | exact resolver, deterministic repeats, drift revalidation | F07/F08 |
| F1-16 | T23 | CLI demo + skills-demo + expected rejection, loaded binding/output | F01/F08/F09 |
| F1-17 | T17/T06/T23 | review-phase1.md, regressions và independent rerun | F10 |

## Review và ranh giới kết luận

Reviewer độc lập với người viết implementation đã tìm thấy bốn nhóm thiếu ràng buộc: current task/context inputs; skill/catalog/profile; operation permissions/ownership/result; provenance/checkpoint. Findings ban đầu được giữ trong `review-phase1.md`, sau đó ghi closure và adversarial rerun. Passing các module tests trước review không được dùng làm bằng chứng đóng những finding này.

Fixtures biểu diễn policy active và gate PASS để thử cơ chế, không tạo chính sách thực. `dispatchAuthorized` luôn là false. Authority do test caller inject; enforcement OS/process/protected stores là Phase 2. Một full linked fixture không thay lifecycle runtime theo từng stage. Không có semantic model benchmark, Unity compile/test/build hoặc gameplay ở Phase 1.

## Actuals và forecast

Phiên đầu bắt đầu 24/09/2026. Owner touch-hours, tổng agent token/cost và elapsed tổng phiên chưa đo đủ nên ghi **unknown**, không gán giá trị 0. Test duration trong log là thời gian của kiểm thử, không phải effort phát triển.

R2 baseline giữ cửa sổ dự báo Phase 1 tới 09/10 và các phase tiếp theo để đối chiếu actual; không bắt buộc đợi ngày trên lịch nếu dependencies đã đạt và có phiên làm việc. Không extrapolate tốc độ foundation sang persistence/fault recovery/Unity. Re-estimate remaining work sau runtime spike; số giờ/tuần của bạn vẫn chưa xác nhận.

Gói tiếp theo: T07 runtime vertical slice, T18 evaluation/protected authority, T15 recovery; chi tiết tại `remaining-work.md`. Game chỉ mở sau T22.

## Hồ sơ liên quan

- [Plan R2 trên Notion](https://app.notion.com/p/3e5a6c16b3dc81a5b1d7e1e71bbad748).
- [Drive: R2 và source Phase 1](https://drive.google.com/drive/folders/1ybTIegTfXXhuW-mZ6yzW16dbcnu8rHjG).
