# Phase 3 — benchmark cơ học và C# parser spike

Đây là benchmark local cho retrieval, structured-fact reader và context retention. Nó không gọi LLM, provider hoặc Unity; token/cost calibration và semantic acceptance của T11 vẫn **UNMEASURED**. Kết quả không cấp policy, không certify skill và không thay T22.

## Corpus, oracle và protocol

Fixture gồm 30 câu hỏi: 20 dev, 10 holdout, không trùng scenario family giữa hai nhóm. Chúng dùng chung corpus hạ tầng nhỏ, không có gameplay. `corpus/` là đầu vào duy nhất được ingest; `questions.json` chỉ chứa yêu cầu công khai; `oracle/gold.json` chỉ nằm trong evaluator: preflight đọc để kiểm coverage/lock, còn việc chấm và gold-evidence control xảy ra sau retrieval. Reader không nhận oracle: nó đối chiếu chính xác subject/predicate với facts có cấu trúc trong nội dung thực được nạp, rồi abstain nếu không có fact hoặc có giá trị mâu thuẫn.

[Protocol](../fixtures/memory-benchmark/protocol.json) và [campaign lock](../fixtures/memory-benchmark/campaign-lock.json) khóa corpus, source C#, câu hỏi, oracle, split và thresholds trước campaign holdout. Harness kiểm hash trước/sau run; không chỉnh corpus/thresholds theo kết quả holdout. Mỗi lần đo mới phải giữ mọi kết quả hoặc lập campaign mới có danh tính riêng. Tác giả đã thấy toàn bộ starter labels; đây không phải nghiên cứu mù hoặc oracle do chuyên gia độc lập gán nhãn. Tách file và API ngăn đường ingest thông thường, chưa phải sandbox evaluator/model độc lập.

Hai nhánh dùng cùng SQLite MemoryStore, namespace, query, top-10 và cap: FTS lexical (`expandHops: 0`) so với FTS cộng explicit graph (`expandHops: 2`). Cạnh inferred không được mở rộng. Ba budget là 256/512/1024 byte UTF-8 của content truy hồi; bản ghi không vừa bị loại toàn bộ, không cắt làm sai JSON/fact. Budget này không bao gồm prompt/system/task overhead và không được gọi là token model. Context probe riêng đo đầy đủ serialized packet qua Context API.

Mỗi cặp chạy ba lần, luân phiên nhánh đi trước theo case/repeat, dev trước holdout. Cold là query đầu trên connection SQLite vừa mở lại; warm là query lặp ngay trên connection đó. Không xóa OS page cache; đây không phải cold disk benchmark. Thời gian query gồm retrieval và byte packing, tách reader và mở connection; ingest không nằm trong latency. Evidence lưu môi trường CPU/OS/Node, thứ tự trial và digest, từng hit/exclusion, byte count, reader result và latency; không suy ra production throughput từ corpus nhỏ.

Precision@10 dùng số source relevant / 10 ngay cả khi trả ít hơn 10; recall bỏ các câu không có relevant source khỏi mẫu số. Critical miss là thiếu source trong oracle critical set. False acceptance là reader trả một giá trị trái oracle hoặc trả support khi oracle yêu cầu abstain; false rejection là abstain khi oracle có đáp án. Đây là nhãn cơ học cho fixture reader, không phải false acceptance của model/gate production. Thresholds khóa trước run: 0 false acceptance, 0 source không đủ điều kiện, 0 oracle leak, recall holdout ở budget lớn nhất ≥0.75 cho mỗi nhánh; mức cải thiện graph chỉ mô tả, không có threshold thắng/thua được chọn sau run.

## Parser spike

`src/benchmark/parser.ts` chạy trên project C# nhỏ trong `corpus/code`: ReceiptLedger, DispatchBroker, BuildReceipt và WindowHydrator. Scanner che comment/string, xuất tên khai báo với dòng và digest của file; các qualified calls/type-name matches chỉ là candidates mang nhãn inferred, `semanticBinding: unverified`. Chúng không tự biến thành explicit dependency edges trong Memory. Raw string và preprocessor bị từ chối; đây là subset fixture, không cam kết parse đầy đủ C# (generics, overload, extension methods, dynamic dispatch, conditional compilation).

[Parser evidence](evidence/phase3/benchmark-parser-spike.json) ghi 16 khai báo (5 class/interface, 11 method) và 10 reference candidates từ bốn file C#; tất cả reference vẫn `semanticBinding: unverified`, dù đều có name candidate. Đây là số lượng extraction, không phải precision/recall của semantic parser.

Máy chạy chưa có `dotnet`; chưa thực hiện Roslyn spike hoặc compile C#. Roslyn phân biệt Syntax API với Semantic API: binding cần compilation cùng source, assembly references và compiler options. Vì thế name match không đủ chứng minh call graph. Nguồn: [Microsoft — semantic analysis](https://learn.microsoft.com/en-us/dotnet/csharp/roslyn-sdk/get-started/semantic-analysis), đọc ngày 25/09/2026.

## Compaction thật qua Context API

Probe tạo window chứa compile evidence có pin và critical unknown cho Android build. Sau compaction với summary đúng và summary cố ghi “Android certified”, code nạp lại source pin, giữ constraints/AC, giữ unknown và trả `blocked`; summary vẫn là untrusted data. Probe kiểm cơ chế packet/manifest, không chứng minh model sẽ hiểu hoặc đọc nội dung. Compile thành công không thành Android build/certification.

## Tái hiện và kết quả

Từ repository root:

```sh
./scripts/dev.sh build
./scripts/dev.sh exec node --test dist/test/benchmark.test.js dist/test/benchmark-memory.test.js
./scripts/dev.sh exec node dist/src/benchmark/cli.js docs/evidence/phase3/benchmark-reproduction.json
```

Lệnh campaign từ chối ghi đè output/manifest đã tồn tại; dùng tên khác cho một lần tái hiện. Source pins của implementation được ghi trước run, kiểm lại sau run, cùng fixture lock. Mỗi trial được append vào `.trials.jsonl` ngay khi xong để không mất evidence nếu bước sau lỗi. Mọi lỗi campaign được lưu với `RUN_ERROR`; threshold không đạt vẫn giữ toàn bộ trial và CLI trả exit code 2 (cần replan). Ba lần lặp deterministic chỉ hỗ trợ quan sát latency, không biến 10 holdout thành 30 mẫu độc lập. Không có model/API key hoặc dịch vụ trả phí cần cấu hình.

Campaign 1 chạy ngày 25/09/2026 lúc 04:52 UTC: **540/540 trials**, 0 oracle leak theo đường ingest, 0 nguồn không eligible trong kết quả. Corpus và implementation hashes không đổi trong run. Campaign này giữ nguyên nhưng đã **superseded cho source version hiện tại** bởi bản sửa Memory scope guard sau đó; chưa dùng làm nghiệm thu source mới. Xem [campaign index](evidence/phase3/benchmark-campaigns.json), [kết quả đầy đủ](evidence/phase3/benchmark-results.json), [source manifest](evidence/phase3/benchmark-results.json.manifest.json), [trial journal](evidence/phase3/benchmark-results.json.trials.jsonl), [build log](evidence/phase3/benchmark-build.log) và [16 focused tests](evidence/phase3/benchmark-tests.tap).

**Kết luận đo: REPLAN.** Threshold false acceptance bằng 0 không đạt: 6 trial lỗi, đều là một ca holdout duy nhất (`case-27`) ở budget 256, hai nhánh × ba lần lặp. Threshold recall holdout tại 1024 đạt ở cả hai nhánh, nhưng không bù được lỗi acceptance. Corpus, oracle và thresholds giữ nguyên. Sau khi phát hiện lỗi, reader được sửa bằng policy `critical-coverage/2`; mọi run dùng những ca đã lộ này được gắn `REGRESSION_EXPOSED_SET`, không còn là holdout độc lập.


| Split | Byte cap | Mode | P@10 | R@10 | Critical misses | FA | FR |
|---|---:|---|---:|---:|---:|---:|---:|
| dev | 256 | lexical | 6.0% | 70.6% | 15 | 0 | 15 |
| dev | 256 | explicit-graph | 6.0% | 70.6% | 15 | 0 | 15 |
| dev | 512 | lexical | 6.5% | 76.5% | 12 | 0 | 12 |
| dev | 512 | explicit-graph | 7.5% | 88.2% | 6 | 0 | 6 |
| dev | 1024 | lexical | 6.5% | 76.5% | 12 | 0 | 12 |
| dev | 1024 | explicit-graph | 8.5% | 100.0% | 0 | 0 | 0 |
| holdout | 256 | lexical | 5.0% | 56.2% | 12 | 3 | 9 |
| holdout | 256 | explicit-graph | 5.0% | 56.2% | 12 | 3 | 9 |
| holdout | 512 | lexical | 9.0% | 100.0% | 0 | 0 | 0 |
| holdout | 512 | explicit-graph | 9.0% | 100.0% | 0 | 0 | 0 |
| holdout | 1024 | lexical | 9.0% | 100.0% | 0 | 0 | 0 |
| holdout | 1024 | explicit-graph | 9.0% | 100.0% | 0 | 0 | 0 |

FA/FR và critical misses trong bảng đếm trials qua ba lần lặp, không đếm mẫu độc lập. P@10 có mẫu số cố định 10; đa số ca chỉ có một source relevant nên trần P@10 của chúng là 10%. Ở dev/1024, graph tăng recall từ 76.5% lên 100%; holdout/512 và 1024 đạt 100% ở cả hai nhánh nên chưa có bằng chứng graph cải thiện holdout này.

Gold-evidence reader control trả đúng nhãn cơ học ở 30/30 case (0 FA, 0 FR). Ở holdout/256, mỗi nhánh có 15 abstentions trên 30 trials, trong đó 6 đúng; ở 512/1024 có 9/30 abstentions và đều đúng. Điều này chỉ khoanh vùng thiếu evidence/coverage, không chứng minh reader semantic tốt. Giữ đủ critical evidence ở holdout/1024 là 8/8 case, Wilson95 **67.6–100%**; dev graph/1024 là 17/17, **81.6–100%**. Đây là interval mô tả trên mẫu nhỏ do tác giả tạo.

### Latency quan sát

Máy đo Apple M4 (10 logical CPUs), 16 GiB RAM, Darwin 25.2.0 arm64, Node v24.19.0. Corpus có 30 source records, gồm revision lịch sử và các trạng thái loại khỏi retrieval. Các con số dưới đây gộp 270 trials mỗi nhánh; không phải test throughput hoặc so sánh hiệu năng có ý nghĩa thống kê.

| Mode | Cold p50 / p95 (ms) | Warm p50 / p95 (ms) |
|---|---:|---:|
| lexical | 0.968 / 2.213 | 0.913 / 1.815 |
| explicit-graph | 0.979 / 1.822 | 0.917 / 1.418 |

Context probe sau compaction giữ constraints/AC, critical Android unknown và pinned evidence trong cả hai summary; cả hai vẫn `blocked`. Packet đầy đủ lần lượt 5317/5322 byte. Provider tokens, model cost, owner touch và semantic acceptance vẫn unknown.

### Chẩn đoán và hướng sửa an toàn

`case-27` có hai tài liệu retention cho giá trị 7 và 30. Retrieval trước packing lấy cả hai; cap 256 chỉ giữ `conflict-b`, bỏ `conflict-a`. Reader thấy một giá trị nên trả 30, trong khi oracle yêu cầu abstain vì mâu thuẫn chưa giải quyết. Gold-evidence control có cả hai nên abstain. Graph không giải quyết lỗi thiếu coverage do packing.

Policy `critical-coverage/2` đã được triển khai sau campaign 1 (không sửa lại kết quả gốc): packer dùng metadata facts từ nguồn eligible được truy hồi, đối chiếu subject/predicate của yêu cầu công khai để lập nhóm conflict/coverage có pin. Nếu loại một thành viên cần thiết hoặc có giá trị mâu thuẫn, phát critical unknown và buộc reader abstain; có thể nạp cả nhóm nguyên vẹn khi vừa budget. Không dùng gold IDs hoặc expected labels. Source bytes được pin trong coverage group; source bị thay nội dung không đáp ứng pin. Nguồn không liên quan bị loại không làm block. Bộ test synthetic mới kiểm conflict khác case-27, sole supporting source bị loại, unrelated exclusion và substitution. Metadata guard được báo riêng bằng `metadataBytes`, nằm ngoài cap content của protocol gốc; chưa có claim cùng tổng prompt/model budget. Guard này chỉ bảo vệ facts có cấu trúc đã biết; top-10 truncation vẫn có thể giấu conflict chưa được truy hồi, nên không chứng nhận semantic completeness.

Vì holdout đã lộ, bản sửa chỉ được đánh giá như regression trên bộ này. Muốn đóng T11 cần một holdout mới được niêm phong độc lập, cùng provider/model/tokenizer và calibration thực; không tự hạ gate hoặc coi test regression là fresh holdout.

## Reader control, uncertainty và phần AC còn mở

Sau mỗi retrieval, evaluator chạy cùng reader với chỉ những gold relevant documents còn eligible. Evidence gold này không đi vào adapter, query hoặc Memory. Đối chiếu reader trên nội dung truy hồi với reader trên evidence đầy đủ giúp thấy ảnh hưởng của thiếu evidence; nó vẫn không đo reasoning model. Facts trong `documents.json` là nhãn tình huống được viết sẵn, không được suy ra hoặc kiểm chứng bằng C# stub. Oracle labels có thể sai và cần review độc lập trước campaign chất lượng thật.

Báo cáo có Wilson interval 95% cho tỷ lệ giữ đủ mọi critical source theo từng budget/mode/split, dùng **số case duy nhất có critical evidence**, không dùng số lần lặp. Interval chỉ mô tả mẫu starter không ngẫu nhiên; không suy ra độ tin cậy trên population tác vụ. Chưa có confidence interval có ý nghĩa cho semantic accuracy hoặc calibration.

| AC | Evidence hiện có / giới hạn | Điều kiện đóng phần còn mở |
|---|---|---|
| 30 cases, 20 dev / 10 holdout, oracle tách và lock | Fixture và hash lock; author đã thấy holdout | Review nhãn độc lập và dataset lớn hơn trước tuyên bố reliability |
| Lexical so với explicit graph, ba budget, repeated trials | Harness real SQLite, byte cap bằng nhau; kết quả campaign ở phần trên | Đạt thresholds đã khóa hoặc ghi replan; không sửa thresholds theo holdout |
| Retrieval tách reader, oracle-evidence control | Exact-fact reader + gold-evidence reader sau retrieval | Model reader thật và đánh giá semantic riêng; fixture reader không là thay thế được mặc định chấp nhận |
| Context retention/compaction | Context API giữ pins, constraints/AC và critical unknown trước summary độc | Model consumption/behavior chưa đo; cần provider-bound tests đúng cấu hình |
| Token/cost budget | UTF-8 byte accounting, actual provider tokens/cost = unknown | Tokenizer đúng model, usage/cost receipts và cùng tổng budget cho các nhánh |
| Calibration / false acceptance ngữ nghĩa | Chỉ có mechanical labels; không judge/model/human calibration | Human adjudication, model/provider/prompt pins, calibration và held-out semantic evaluation |
| C# parser | Bounded syntax extractor chạy được, explicit declarations/inferred candidates | Roslyn/semantic binding spike trên project thật nếu AC yêu cầu call/dependency correctness |

Không có quyết định tự thay các AC model/token/calibration bằng kết quả cơ học. Cách tiếp tục hợp lệ là bổ sung evidence tương ứng, hoặc owner duyệt replan có ghi rõ scope, task sở hữu và điều kiện nghiệm thu còn lại; trước đó không tuyên bố T11 hay toàn Phase 3 PASS.

## Regression v2 — bộ đã lộ, không là independent holdout

Sau Memory scope guard fix và reader policy `critical-coverage/2`, chạy lại **540/540 trials** lúc 04:58 UTC ngày 25/09/2026. [R2 results](evidence/phase3/benchmark-results-r2.json), [manifest](evidence/phase3/benchmark-results-r2.json.manifest.json), [journal](evidence/phase3/benchmark-results-r2.json.trials.jsonl) và [summary dẫn xuất](evidence/phase3/benchmark-regression-summary.json) đều giữ `REGRESSION_EXPOSED_SET`. Fixture/protocol digest và implementation pins không đổi trong run. [Build](evidence/phase3/benchmark-r2-build.log) sạch, [19 focused tests](evidence/phase3/benchmark-r2-tests.tap) đạt.

False acceptance giảm **6 → 0**, nguồn không eligible/oracle leak vẫn 0; các thresholds cơ học đều đạt. IDs và bytes truy hồi giống campaign 1 trong toàn bộ 540 cặp tương ứng, nên P@10, recall và critical misses trong bảng giữ nguyên. Guard thay đổi quyết định abstain, không cải thiện retrieval. False rejection vẫn **78 trial**. Tại nhóm holdout đã lộ/budget256, mỗi nhánh có 18 abstentions trên30 trials, trong đó9 đúng (trước sửa là15/30, trong đó6 đúng).

Có **186 blocked/abstaining trials trên14 case duy nhất**. Trong đó **48 trials trên9 case** mất coverage do budget loại supporting source, tổng48 refs; 126 lần `NO_RETRIEVED_SUPPORT`, 48 lần `CRITICAL_EVIDENCE_EXCLUDED`, 18 lần `CONFLICTING_RETRIEVED_FACTS`. Các code chồng lấn ở6 trials nên không cộng chúng thành số blocked. Coverage metadata tốn thêm **184–512 bytes/trial**, ngoài cap source-content gốc; chưa đo tổng provider prompt budget. Hai compaction probes vẫn giữ unknown/pins và `blocked`.

**T11 vẫn REPLAN.** Regression đã biết không thay thế fresh holdout được niêm phong độc lập. Cần model/provider thật, tokenizer/usage/cost đúng cấu hình, nhãn semantic/human và calibration trước khi xét PASS. Không được bắt đầu phase phụ thuộc bằng kết quả fixture này.
