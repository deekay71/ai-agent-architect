# Contracts v0.5.0

`src/contracts/schemas.ts` là nguồn canonical cho 26 contracts của nền tảng hiện tại. Mọi record phải có `schemaVersion: "0.5.0"`. Phiên bản schema này cụ thể hóa thiết kế v0.4 và bổ sung records cho execution skills; nó không có nghĩa toàn bộ runtime, Unity integration hay game đã được triển khai.

Phase 1 của R2 tương ứng **P0 của R1**. Phạm vi kiểm chứng ở đây là schema, hash, fixture liên kết và conformance offline. Quyền dispatch production thuộc runtime được triển khai từ Phase 2.

## Danh mục 26 contracts

| Contract | Trách nhiệm |
|---|---|
| `TaskSpec` | Mục tiêu, task class, acceptance, scope, constraints và budget |
| `ContextBudget` | Giới hạn input, output reserve, headroom và ngân sách task |
| `ContextBundle` | Context được cấp cho task, evidence, unknowns và phần loại trừ |
| `ContextManifest` | Bind context với task, scope, constraint/evidence content và policy version |
| `PlanStep` | Dependency, capability, inputs/outputs, tools và checks của một bước |
| `SubPlan` | Phạm vi, integration contracts, unresolved items và các bước của nhánh |
| `PlanPackage` | Kế hoạch tổng hợp, coverage, assumptions, risks và artifact hash |
| `ToolCall` | Operation/attempt identity, arguments hash, expected workspace, quyền và recovery mode |
| `ToolResult` | Trạng thái thao tác, thời gian, errors, receipts, artifacts và workspace snapshot |
| `CheckDefinition` | Yêu cầu, method, verifier và các loại evidence cần có |
| `CheckResult` | Kết quả check đúng definition/verifier/subject, evidence và lý do trạng thái |
| `PolicyRelease` | Phạm vi release, cấu hình, evaluation metadata, người phê duyệt và lifecycle |
| `PlanningModeDecision` | Lựa chọn single+critic hoặc multi+synthesizer+critic và căn cứ/budget |
| `GateReport` | Verdict cho artifact/input versions cụ thể cùng checks, defects và issuer |
| `HandoffPacket` | Artifact đã được review, manifest, source versions và scope bàn giao |
| `Claim` | Phát biểu có nguồn, scope, evidence status, freshness và lifecycle promotion |
| `SourceRecord` | Nguồn, revision, content digest, thời điểm và chính sách freshness |
| `MemoryDelta` | Đề xuất thay đổi memory trên expected version; không tự promote claim |
| `Evidence` | Loại bằng chứng, subject/check/run, artifact hash và attestation liên quan |
| `OperationRecord` | Intent, attempt history, trạng thái operation và điều kiện commit |
| `OwnershipRecord` | Process/owner/epoch của resource, heartbeat và trạng thái ownership |
| `Checkpoint` | Workflow version, nhánh, các node hoàn tất/chờ, refs và ledger cursor |
| `RunnerAttestation` | Identity của một attestation cụ thể cùng runner/principal, operation và evidence |
| `ProjectProfile` | Profile mục tiêu hoặc quan sát được, toolchain/packages và các thông tin chưa biết |
| `SkillDescriptor` | Skill version/provenance, resource hashes, compatibility, capabilities và lifecycle |
| `SkillBinding` | Liên kết invocation với descriptor/profile/environment, resources đã nạp và capability identities |

## Ba mức kiểm tra

| Mức | Công cụ hiện tại | Ý nghĩa |
|---|---|---|
| Record | `parseContract(name, input)` hoặc CLI `validate` | Kiểm strict schema, đúng version và các điều kiện nội bộ |
| Bundle fixture | `auditContractBundle(input, authority)` | Đối chiếu refs, content hashes, scope, issuer và records trong authority snapshot được inject |
| Runtime | Chưa triển khai ở Phase 1 | Xác minh nguồn authority được bảo vệ, active policy và trạng thái thật ngay trước dispatch |

Schema từ chối fields thừa và version không hỗ trợ. Chuỗi được giữ nguyên nội dung; chuỗi rỗng hoặc chỉ có khoảng trắng không hợp lệ. Không tự đổi `unknown`, `blocked` hoặc `not_applicable` thành `pass`. Các method `deterministic`, `model`, `human` có trường verifier riêng; record phải thể hiện đúng method thực sự dùng.

JSON Schema export là tài liệu cấu trúc, không thay thế `parseContract`: custom refinements và kiểm liên kết giữa records vẫn cần chạy bằng implementation. Dữ liệu fixture có thể chứa một `PolicyRelease` mô phỏng trạng thái active để thử nhánh kiểm tra; điều đó không tạo active release thật.

## Identity và hash

Hash có dạng `sha256:` theo sau bởi 64 ký tự hex viết thường. `canonicalJson` sắp key object, giữ thứ tự array và giữ nội dung string; nó từ chối dữ liệu không phải JSON thuần như cycle, accessor, sparse array, `undefined` và số không hữu hạn. Đây là quy ước canonical của repo, không phải tuyên bố triển khai một chuẩn canonicalization bên ngoài.

`digest(value)` hash canonical JSON. Với record tự chứa hash, `digestOmitting(record, fieldName)` bỏ đúng một field tại root; field cùng tên trong object con vẫn được hash. Ví dụ `PlanPackage.hash` và `ContextManifest.manifestDigest` không đưa chính giá trị của mình vào phép tính. Giữ nguyên ID nhưng đổi nội dung, revision hoặc scope phải được phát hiện qua bindings và digest.

Resource skill dùng **hash byte thô**, không dùng `digest(string)` vì cách đó hash cả biểu diễn JSON của chuỗi. `SkillDescriptor.contentDigest` hash danh sách `resources`; descriptor digest hash toàn record descriptor; catalog manifest pin các descriptor digest. Khi activation, loader kiểm lại pin và bytes. Một pin do chính gói dữ liệu không tin cậy cung cấp không tự trở thành nguồn trust.

## Các trường làm rõ trong v0.5.0

**`Evidence.kind`** ghi loại bằng chứng mà artifact đại diện. Nó cho phép đối chiếu với `CheckDefinition.requiredEvidenceKinds` và loại artifact do nguồn kiểm chứng khai báo. Chỉ có một `artifactHash`, exit code hoặc file bất kỳ không đủ đáp ứng yêu cầu evidence cụ thể. `kind` là nhãn được checkset sử dụng, không phải quyền tự cấp PASS.

**`RunnerAttestation.attestationId`** định danh một attestation cụ thể. `Evidence.runnerAttestationRef` phải trỏ tới ID này; `runnerId` chỉ định danh runner và có thể lặp lại qua nhiều lần chạy. Attestation còn bind principal, config, environment, subject, operation và evidence refs. Dữ liệu attestation tổng hợp ở Phase 1 không phải chữ ký số hoặc bằng chứng đã thực thi runner thật.

**`SkillBinding.policyReleaseId` nhận `null`** để biểu diễn draft chưa có release. Catalog demo có thể ghi nguồn gốc của skill và resources thực sự đã nạp mà không bịa policy ID. Giá trị `null`, danh sách certification evidence rỗng hoặc kết quả resolver `eligible` đều không cấp quyền dispatch. Runtime sau này phải yêu cầu release thật còn active, đúng scope và đúng bindings khi task cần release đó.

**`ToolCall.capability`, `toolRef`, `implementationDigest`, `targetProjectId`** định danh thao tác cụ thể để đối chiếu với PlanStep, registry capability và tool permission policy. `toolVersion` riêng lẻ không đủ nhận diện implementation hoặc dự án được phép. Audit kiểm cả commands/network/path scope, ownership resource, attempt/result và snapshot theo recovery mode.

**Gate inputs phải khớp nội dung hiện tại**, gồm TaskSpec, ContextManifest, PlanPackage, SkillDescriptor, ProjectProfile, SkillBinding và environment digest. Self-rehash candidate không đổi được report đã được authority pin. Authority còn pin selected snapshot, source/revision của context evidence, workflow node/reference registry và bản skill selection đã nạp body. Đây là kiểm liên kết dữ liệu; nguồn authority thực vẫn phải được bảo vệ ở Phase 2.

## Skill eligibility và thông tin chưa biết

`ProjectProfile.profileKind` phân biệt `target` với `observed`. Các giá trị chưa biết dùng `null` và được liệt kê trong `unknowns`. Profile mục tiêu không chứng minh dependencies đã được cài. Resolver dùng exact skill ID/version; lifecycle `candidate`, `revoked` và `superseded` không đủ điều kiện lựa chọn.

Compatibility có danh sách Editor version, OS, build target và required package versions. Danh sách compatibility rỗng không đặt ràng buộc cho chiều đó. Capability phải có implementation ref/digest, trạng thái available và target project phù hợp. Thiếu quan sát cần thiết trả `unknown`; thông tin không tương thích đã xác định trả `unavailable`. `eligible` chỉ mở khả năng xem xét candidate theo metadata.

Discovery không cấp body vào context. Resource được tải theo yêu cầu; binding chỉ ghi resources đã thực sự trả về cho caller và cần body đã được nạp. Đổi descriptor, bytes, profile, environment hoặc implementation của capability phụ thuộc làm selection cũ không dùng được. Phase 1 không chạy nội dung script, không kiểm Unity và không đo lợi ích của skill.

## Authority của fixture và việc còn lại

`AuditAuthority` được truyền riêng với candidate bundle. Audit đối chiếu candidate với policy, checks, issuers, evidence và các pins trong snapshot đó. Các records candidate không được tự cấp trust chỉ bằng tên actor, ID hay chuỗi verdict. Tuy vậy, ở Phase 1, authority vẫn là dữ liệu do chương trình fixture inject; chưa có nguồn trust được bảo vệ khỏi executor bằng OS/process/filesystem.

Phase 2 phải hoàn thiện protected stores và principals, kiểm quyền tại thời điểm dispatch, persistence của operation/checkpoint, ownership lock/queue và reconcile khi timeout/cancel. Các phần Memory/Context, calibration/benchmark, Unity bridge conformance và game-domain verification tiếp tục ở phase tương ứng. Conformance tĩnh hoặc offline mock không chứng minh runtime production an toàn, hiệu quả model hay T22 đã đạt.
