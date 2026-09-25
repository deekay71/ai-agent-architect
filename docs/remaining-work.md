# Công việc còn lại sau triển khai local Phase 3

T09/T10 đã Done / Pass trong phạm vi Memory local. Context mechanics T19 và Memory promotion T14 đã có implementation/tests nhưng **T19/T14 Doing / Not evaluated**: T19 thiếu AC chất lượng/token thật; full handoff T14 chờ dependency T19. **T11 Doing / Replan; toàn Phase 3 chưa PASS**, chưa mở Phase 4 hoặc gameplay. Tổng 8 Done, 3 Doing, 14 Todo. Xem [báo cáo Phase 3](phase-3-report.md), [hướng dẫn Memory/Context/Explorer](memory-context.md) và [benchmark](phase3-benchmark.md).

Runtime demo vẫn chỉ có active release `runtime.fixture`. Không có release model/semantic/Unity, Unity project hoặc T22 PASS. Final clean-source suite đạt327/327 tests,0fail/0skip; evidence giữ cả lần đầu lỗi fixture và bản sửa. Remote `main` còn Phase 1; Phase 2 và Phase 3 đang local chưa push.

## Việc cần làm để đóng Phase 3

1. **Replan T11, giữ lịch sử campaign:** R1 có 6 false accepts; R2 có 0 false accepts và 78 false rejects trên 540 trials. R2 dùng bộ đã lộ nên chỉ là regression. Giữ cả report, manifest, journal và failed attempts; không gọi lần chạy lại là fresh holdout.
2. **Chuẩn bị benchmark độc lập mới:** review labels và oracle, khóa corpus/scenario families/split/config/budget trước khi chạy. Mỗi fixture ghi `requiredEvidenceIds`, `acceptableAlternatives`, `answerability`, `expectedRevision`, `expectedConstraints`; không ingest oracle/holdout answers vào Memory. Đo retrieval riêng với reader; giữ gold-evidence control và report mọi lần thử.
3. **Đóng AC T19 bằng provider thật:** chọn/pin model, prompt/config, tokenizer và usage/cost receipts; so task quality, loss, latency, tokens trên ba nhánh **full-context**, **retrieval + isolation**, **retrieval + isolation + compaction**, dùng cùng model và cùng tổng budget. Chạy nhiều lần compaction, thay đổi mật độ distractors, kiểm evidence/alternatives/answerability/revisions/constraints đúng oracle ở mỗi nhánh. Gold-evidence reader control không thay nhánh full-context. Byte accounting và deterministic reader hiện có không thay các AC này; chỉ nối một provider cũng chưa đủ nghiệm thu.
4. **Calibration và handoff:** đo false acceptance/rejection với uncertainty phù hợp, human adjudication và task classes rõ. Khi T19 có đủ evidence mới nghiệm thu full handoff T14 và gate toàn Phase 3. Không tự thu hẹp scope hoặc hạ threshold để cho phase kế tiếp chạy.
5. **Cập nhật actual riêng:** giữ nguyên forecast R2 lịch sử; xác nhận owner capacity rồi reforecast từ evidence mới. Model usage/touch-time chưa đo giữ UNKNOWN; chưa có dịch vụ agents tự chạy sau phiên.

## Những phần local đã có và giới hạn cần giữ

| Phần đã triển khai | Giới hạn hiện tại |
|---|---|
| SQLite/FTS Memory, claim/source provenance, lifecycle/freshness, promotion và selective invalidation | Broker/operator authority local; source refresh chỉ mock, `revalidateBeforeUse` chưa có fetch adapter thật vẫn UNKNOWN |
| Window riêng, progressive descriptor/body/reference, canonical constraint/AC hydration, critical unknown preservation | Đã kiểm cơ chế packet; chưa đo model consumption/task quality và tokenizer/cost provider |
| Runtime context guard, durable required pin và current-source check trước worker stdin/commit | Chỉ nối vào fixture runtime; callback và issued-window store trusted host, không phải distributed transaction |
| Explorer graph/backlinks kiểu Obsidian, scope-filtered snapshot, context proof, proposal download | Chỉ đọc local, không cài plugin Obsidian; JSON/Markdown không ghi Memory; loaded chỉ là local payload inclusion |
| Parser/retrieval/reader fixture benchmark | C# syntax subset; inferred reference candidates chưa semantic binding/Roslyn; corpus nhỏ và exposed-set regression không chứng minh reliability model |

## Các phase sau, chưa mở

| Hạng mục | Task sở hữu | Đầu ra và kiểm chứng tiếp theo |
|---|---|---|
| Runtime ngoài fixture, multi-planning | T12/T20 | Specialist subplans, synthesis, critic độc lập, integration gate; so single/multi cùng budget, giữ lineage budget qua replan |
| Semantic/model/human evaluation | T20 | Dataset và labels độc lập, usage/cost thật, calibration/release theo task class; reuse harness hiện có |
| Skill benefit/certification | T24 | Controlled trials trên sample repo, locked split/oracle/budget; mọi failure, false accept/reject/cost/owner touch; eligibility không thay certification |
| Unity adapter và recipes | T21/T08/T25 | Probe official CLI trước, tối đa một bridge; real Editor compile/reload/cancel/reconcile và protected runner |
| Nghiệm thu nền tảng | T22 | Active release đủ task classes game cần, conformance trên Unity thật; chưa PASS thì chưa gameplay |
| Game Block Puzzle | T01–T05/T13/T16 | Chỉ sau T22: luật, UI, save/replay, fail-before/pass-after và pilot holdout |

## Ranh giới phải giữ khi tích hợp

- Foundation audit kiểm linked records; runtime tách planning readiness, pre-dispatch và post-execution, không đòi evidence tương lai trước dispatch.
- Operator cài authority ngoài candidate scope; tool output hoặc chuỗi PASS không tự tạo quyền. Digest không chứng thực issuer hay semantic truth.
- Sandbox, immutable artifacts, OS ownership và scope checks bảo vệ trước candidate; operator/root/host vẫn thuộc trusted boundary. Linux/Windows isolation và Unity lifecycle cần evidence riêng.
- Context scope/revision hiện hành phải được kiểm ở điểm sử dụng; source thu hồi không bị bỏ qua sau async hook hoặc restart. Unknown không trở thành fact; không blind retry hiệu ứng không rõ.
- Catalog compatibility/body digest không là certification. Upstream license/attribution, môi trường thật và task-class skill benchmark vẫn thuộc T24/T25.
- JSON Schema chỉ biểu diễn cấu trúc; executable refinements và cross-record checks vẫn bắt buộc. Không suy chất lượng toàn hệ thống từ số task Done hoặc số test xanh.
