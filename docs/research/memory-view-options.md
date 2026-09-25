# Memory View: Obsidian và graph local

Ngày nghiên cứu: 2026-09-24. **Cập nhật 25/09/2026: người dùng đã duyệt inspector local chỉ đọc vào Phase 3**, graph sau T09/T10 và context trace sau T19. Xem [kế hoạch triển khai](../phase-3-plan.md). Obsidian là adapter tùy chọn; các so sánh thư viện bên dưới là nghiên cứu, không phải cam kết dependency.

## Khuyến nghị

Cả hai hướng đều khả thi. Với nhu cầu xem quan hệ có loại, nguồn gốc, trạng thái và context agent thực sự được cấp, nên ưu tiên **một inspector local chỉ đọc**. Obsidian là adapter xuất tùy chọn từ cùng snapshot nếu cần đọc wiki bằng ứng dụng ghi chú quen thuộc; không bắt buộc làm hai giao diện.

Giữ thiết kế hiện tại: `knowledge/{raw,wiki,decisions,experience}` chứa Markdown; `runtime/memory.db` giữ metadata, tìm kiếm và graph edges; run/evidence thuộc kho runtime/artifact riêng. View có thể JOIN các bản ghi được tham chiếu để truy vết nhưng không biến mọi log hoặc kết quả chạy thành Memory đã được duyệt. [Thiết kế Memory Engine hiện tại](https://app.notion.com/p/3e3a6c16b3dc81448ae8f6aec218612d).

## Các lựa chọn đã đối chiếu nguồn chính thức

| Lựa chọn | Có sẵn | Giới hạn và mức phù hợp |
|---|---|---|
| Obsidian vault | Folder local chứa Markdown, tự nhận thay đổi file từ bên ngoài; phù hợp bản xuất wiki. [Storage](https://help.obsidian.md/Files+and+folders/How+Obsidian+stores+data) | Đây là bản chiếu từ Memory. Obsidian vẫn cho sửa file; cơ chế một chiều phải do kiến trúc exporter bảo đảm. |
| Obsidian Graph / Local Graph | Node là note, edge là internal link; có bộ lọc, nhóm màu và local graph theo độ sâu. [Graph](https://help.obsidian.md/Plugins/Graph+view) | Không tự diễn giải loại quan hệ, provenance hay lifecycle từ metadata. Nhóm màu cần cấu hình; không phải policy engine. |
| Canvas / JSON Canvas | Card note/file, đường nối có nhãn, màu và hướng. JSON Canvas định nghĩa node, edge và tọa độ. [Canvas](https://help.obsidian.md/Plugins/Canvas), [spec 1.0](https://jsoncanvas.org/spec/1.0/) | Hợp xuất sơ đồ tập trung cho một quyết định. Exporter phải tạo layout; nhãn `justified_by` không tự xác minh quan hệ. Text card thuần không trở thành backlink cho tới khi đổi thành file. |
| Cytoscape.js | Bộ lọc/selectors, duyệt graph, thuật toán graph, layout và styling theo dữ liệu. [Tài liệu chính thức](https://js.cytoscape.org/) | Đề xuất ứng viên chính cho inspector tri thức: tập trung vào lân cận, loại cạnh và đường phụ thuộc. Phải tự làm panel chi tiết và các quy tắc trạng thái. |
| React Flow | Node tùy biến bằng React component; hợp card có UI phong phú. [Custom nodes](https://reactflow.dev/learn/customization/custom-nodes) | Đề xuất phù hợp hơn nếu giao diện sau này thiên về workflow/editor. Nhiều node hoặc component phức tạp cần tối ưu; chưa có benchmark để kết luận nhanh hơn hay chậm hơn Cytoscape.js. [Performance](https://reactflow.dev/learn/advanced-use/performance) |

Hai thư viện graph chỉ cung cấp phần hiển thị/tương tác; không thay thế Memory store, kiểm tra provenance hay quy trình duyệt. Lựa chọn Cytoscape.js ở trên là đánh giá phù hợp tác vụ, chưa phải quyết định dependency.

## Projection chỉ đọc được đề xuất

Luồng dữ liệu: **Memory + tham chiếu runtime → snapshot có phiên bản → projector → inspector local hoặc Obsidian export**. Không cần bổ sung graph database chỉ để vẽ.

- Một snapshot ghi nhận ID, revision/digest nguồn, thời điểm chụp và phiên bản projection. Dữ liệu Memory và tham chiếu runtime phải đối chiếu cùng mốc; thiếu bản ghi hoặc snapshot cũ phải hiện rõ. Các trường snapshot mới là metadata của view được đề xuất, không tự thêm vào contract canonical.
- View dùng các edge đã có trong thiết kế: `depends_on`, `implements`, `tested_by`, `justified_by`, `supersedes`. Hiển thị loại, hướng, explicit/inferred và provenance. Không suy ra cạnh chỉ vì hai node nằm gần nhau hoặc nội dung có vẻ giống nhau.
- Mặc định mở một task/claim và lân cận 1–2 bước; lọc theo loại node/cạnh, phạm vi, lifecycle và freshness. Panel cho xem nội dung, nguồn, revision/digest, evidence liên quan. Tách `assertionType` khỏi lifecycle, và tách lifecycle khỏi freshness; “approved” không đồng nghĩa “fresh”.
- Chế độ xem context dùng `ContextManifest` để chỉ ra bản ghi/phiên bản đã được cấp cho lượt xử lý. Không gọi đây là toàn bộ suy nghĩ của agent. Trạng thái thực sự đã nạp phải có bằng chứng runtime; chỉ có manifest dự kiến thì ghi đúng là dự kiến.
- Khi nguồn bị revoke/quarantine hoặc đổi revision, áp dụng dependency invalidation trong phạm vi liên quan. Giữ lịch sử và đánh dấu snapshot cũ; không biến mất lịch sử, cũng không làm stale toàn hệ thống chỉ vì memoryVersion đổi.
- Inspector không có API ghi vào kho canonical. Layout, bộ lọc và ghi chú cá nhân lưu riêng. Chỉnh bản xuất Obsidian không tự ghi ngược hoặc được promote; nếu sau này nhận góp ý, đó là proposal qua quy trình `MemoryDelta` có kiểm tra.
- Read model và exporter áp dụng `accessScope` trước khi trả dữ liệu hoặc tạo file; cạnh tới node không được phép xem cũng không được làm lộ nhãn/nội dung. Fixture nghiệm thu phải có hai project/scope để kiểm tra ranh giới này.

Với Obsidian, xuất properties phẳng cho ID/trạng thái/revision và nội dung dễ đọc; metadata lồng nhau giữ trong bản ghi gốc hoặc JSON vì property UI không hỗ trợ cấu trúc lồng. [Properties](https://help.obsidian.md/Editing+and+formatting/Properties).

**Metadata và liên kết note là hai việc khác nhau:** chuỗi `source_id: S123` không đủ để cam kết có edge trong Graph. Exporter phải phát internal link thật, chẳng hạn `[[sources/S123]]`, rồi mô tả loại quan hệ và provenance trong note; không hứa core Graph sẽ hiện nhãn quan hệ đó. Dùng mapping filename từ ID ổn định, tách khỏi tiêu đề có thể đổi. Obsidian hỗ trợ cả Wikilink và Markdown link. [Internal links](https://help.obsidian.md/Linking+notes+and+files/Internal+links).

## Điều kiện nghiệm thu đề xuất và vị trí triển khai

1. Sửa/xóa bản xuất hoặc đổi layout không thay đổi digest, lifecycle hay dữ liệu canonical.
2. Mỗi node/cạnh truy được ID và revision nguồn; edge thiếu provenance bị đánh dấu, không trình bày như đã xác minh.
3. Fixture có approved-but-stale và inferred-but-fresh hiển thị đúng hai trục trạng thái; bộ lọc không trộn chúng.
4. Revoke một nguồn làm mất hiệu lực đúng các phụ thuộc liên quan; lịch sử còn xem được và node ngoài phạm vi không bị đổi trạng thái.
5. View context khớp chính xác refs/digests trong manifest được chọn, phân biệt đã nạp/dự kiến/không rõ; không đưa toàn bộ Memory vào view như thể agent đã đọc hết.
6. Cùng snapshot cho cùng ID/quan hệ ở inspector và adapter được chọn; snapshot cũ/thiếu dữ liệu hiện cảnh báo. Benchmark trên tập dữ liệu đại diện trước khi chốt giới hạn node và thời gian phản hồi.

Đã đưa read model/graph vào T09/T10 và context trace vào T19 theo yêu cầu 25/09/2026, với các AC bổ sung trong phase-3-plan.md. Giữ thứ tự hạ tầng trước game; không xây Obsidian round-trip và không cam kết timeline từ nghiên cứu chưa đo.
