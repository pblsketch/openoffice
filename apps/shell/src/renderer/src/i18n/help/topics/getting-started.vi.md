# Bắt đầu nhanh: giao diện và những điều cơ bản

GenOffice là bộ ứng dụng văn phòng chạy trên máy của bạn: một cửa sổ, một hàng thẻ, chứa tám trình soạn thảo — Docs (xử lý văn bản), Sheets (bảng tính), Slides (trình chiếu), PDF, Markdown và văn bản thuần, HTML, HWP/HWPX (tài liệu Hangul) và sơ đồ tư duy (.xmind). Mỗi trình soạn thảo mở và lưu tập tin theo định dạng riêng của nó: .docx, .xlsx, .pptx, .pdf, .md, .html, .hwp/.hwpx và .xmind. Chỉnh sửa không cần mạng; các tính năng AI thì cần. Trình chỉnh sửa sơ đồ tư duy cũng nhập tệp FreeMind và Freeplane (.mm) thành sơ đồ mới, được lưu dưới dạng .xmind.

## Tổng quan giao diện

Cửa sổ gồm ba phần:

- **Dải thẻ (phía trên)**: mỗi tập tin đang mở là một thẻ. Thẻ Trang chủ ngoài cùng bên trái luôn tồn tại và không thể đóng; các thẻ còn lại là tài liệu của bạn. Nhấp đúp vào một thẻ để đổi tên tập tin ngay tại chỗ.
- **Vùng nội dung**: trình soạn thảo (hoặc Trang chủ) thuộc thẻ đang hoạt động.
- **Dải menu**: trên dải menu hệ thống của macOS, ở trên cửa sổ trên Windows/Linux. Các menu File/Edit/View đổi theo trình soạn thảo đang hoạt động.

## Tạo tài liệu

Bất kỳ cách nào sau đây:

- Nhấp vào một thẻ tạo nhanh trong mục [Bắt đầu nhanh](help://getting-started) của **Trang chủ** (AI Docs, AI Sheets, AI Slides, ...).
- Menu **File ▸ Mới**: Docs (⌘N/ctrl+N), Sheets, Slides, Markdown, HTML hoặc PDF.
- Kéo một tập tin vào cửa sổ, hoặc nhấp đúp vào nó trong trình quản lý tập tin (nếu GenOffice là ứng dụng mặc định).

Tài liệu mới mở ra chưa có tiêu đề; tập tin trên đĩa chỉ được tạo ở lần lưu đầu tiên.

## Mở tập tin

- Menu **File ▸ Mở** (⌘O/ctrl+O) mở bộ chọn của hệ thống: .docx / .doc / .odt / .xlsx / .xls / .csv / .tsv / .pptx / .ppt / .pdf / .md / .html.
- Nhấp vào bất kỳ mục nào trong danh sách **Gần đây** của Trang chủ.
- `ieumoffice <file>` từ terminal cũng mở được tập tin.

## Tài liệu ODT

Tệp .odt (văn bản OpenDocument, định dạng mà Hancom Office, LibreOffice và các chương trình khác lưu) mở trong thẻ Docs, từ mọi nơi có thể mở .docx. Tài liệu mới vẫn là .docx.

- **Dùng như bình thường**: sửa chữ, định dạng ký tự và đoạn văn, bảng (thêm và xóa hàng, cột, gộp và tách ô), hình ảnh, đầu trang và chân trang, chú thích cuối trang và cuối tài liệu, thiết lập trang và phân đoạn, dấu đầu dòng và đánh số, kiểu tiêu đề, liên kết, tìm và thay thế, kiểm tra chính tả, in, xuất PDF và HTML, và chỉnh sửa bằng AI.
- **Bị tắt trong ODT**: chú thích, theo dõi thay đổi, so sánh tài liệu, hình mờ, viết tay, mục lục, chèn phương trình, hình dạng, hộp văn bản hoặc biểu đồ, chia cột, trích dẫn và thư mục, chú thích hình và tham chiếu chéo, màu trang, mật khẩu và hạn chế chỉnh sửa, khuyến nghị chỉ đọc, phông chữ và màu chủ đề, lề đối xứng. Các nút này sẽ bị mờ; hãy lưu thành .docx để dùng chúng.
- **Giữ nguyên**: phương trình, biểu đồ và hình vẽ trong tệp gốc hiển thị dưới dạng ảnh bị khóa, có thể xóa nhưng không sửa được; ô bảng bị khóa vẫn bị khóa. Những phần bạn không chạm vào được lưu lại không đổi. ODT có mật khẩu không mở được; hãy gỡ mật khẩu trước.
- **Lưu thành** cho phép chọn .docx hoặc .odt. Trước khi đổi định dạng, ứng dụng liệt kê những gì sẽ thay đổi hoặc bị bỏ, rồi mở lại thẻ với tệp mới. Markdown và HTML cũng có **Xuất dưới dạng ODT…**.

## Mô hình lưu

- **Lưu thủ công**: ⌘S/ctrl+S, hoặc File ▸ Lưu / Lưu dưới dạng. Lần lưu đầu tiên sẽ hỏi vị trí và tên.
- **Tự động lưu** tuân theo công tắc của từng trình soạn thảo (và giá trị mặc định của ứng dụng). Một tập tin PDF bạn chỉ đọc sẽ không bao giờ bị ghi lại trong im lặng, và tài liệu mới chưa có tệp riêng chỉ bắt đầu tự động lưu sau lần lưu đầu tiên.
- Đóng một thẻ có thay đổi chưa lưu sẽ hỏi Lưu / Bỏ / Hủy trước.
- Mọi lần ghi đều diễn ra theo kiểu nguyên tử (tập tin tạm + đổi tên), nên mất điện không thể để lại một tập tin dở dang.

## Phím tắt thường dùng

| Thao tác       | macOS | Windows / Linux |
| -------------- | ----- | --------------- |
| Tài liệu mới   | ⌘N    | ctrl+N          |
| Mở             | ⌘O    | ctrl+O          |
| Lưu            | ⌘S    | ctrl+S          |
| Đóng thẻ       | ⌘W    | ctrl+W          |
| Mở sổ tay này  | F1    | F1              |
| Thu gọn Ribbon | ⌥⌘R   | Ctrl+F1         |

**Thu gọn Ribbon** hoạt động trong mọi trình soạn thảo. Hàng thẻ vẫn còn nguyên, còn dải lệnh bên dưới sẽ ẩn đi; thẻ đang chọn kiêm luôn là nút thu gọn, nên khi Ribbon còn thu gọn thì không thẻ nào được chọn, và bấm thẻ bất kỳ sẽ đưa dải lệnh trở lại. Bấm đúp vào một thẻ cũng cho kết quả tương tự. Trạng thái bạn để lại được ghi nhớ riêng cho từng trình soạn thảo. Docs thêm mật độ trung gian: **⌥⌘K** / Ctrl+Alt+K nén dải chỉ còn biểu tượng, cũng được ghi nhớ như vậy.

Các phím tắt bên trong từng trình soạn thảo (công cụ định dạng, tìm và thay thế, thao tác bảng, ...) nằm trong chương tương ứng; Docs còn có hộp thoại phím tắt bàn phím có thể tìm kiếm (**⌘/**) (xem chương của nó).

## Các phím tắt Option+Command

Option+Command là lớp mà Word dành riêng cho các bước nhảy có cấu trúc, và GenOffice lấp đầy lớp đó theo đúng cách. Docs chiếm phần lớn, Sheets chiếm hai phím riêng để tương đương với Excel, và có một tổ hợp dùng được ở mọi nơi.

**Docs**

| Phím tắt (macOS) | Tác dụng                     | Windows / Linux    |
| ---------------- | ---------------------------- | ------------------ |
| ⌥⌘1 / ⌥⌘2 / ⌥⌘3  | Tiêu đề 1 / 2 / 3            | Ctrl+Alt+1 / 2 / 3 |
| ⌥⌘0              | Bình thường                  | Ctrl+Alt+0         |
| ⌥⌘M              | Đoạn văn                     | Ctrl+Alt+M         |
| ⌥⌘A              | Nhận xét mới                 | Ctrl+Alt+A         |
| ⌥⌘F              | Chèn chú thích cuối trang    | Ctrl+Alt+F         |
| ⌥⌘E              | Chèn chú thích cuối tài liệu | Ctrl+Alt+D         |
| ⌥⌘G              | Đi tới                       | Ctrl+G             |

Trong đó hai phím đổi trên Windows, vì lý do mà Word cũng tách chúng ra. **macOS đã giữ ⌥⌘D** — dùng để hiện và ẩn Dock — nên chèn chú thích cuối tài liệu là ⌥⌘E trên Mac và Ctrl+Alt+D ở mọi nơi khác. Còn **Đi tới** thì bỏ Alt: Ctrl+G, trong khi phím tắt bên Mac vẫn mang theo Alt.

**Sheets**, khi lưới đang có tiêu điểm

| Phím tắt (macOS) | Tác dụng   | Windows / Linux |
| ---------------- | ---------- | --------------- |
| ⌥⌘0              | Viền ngoài | Ctrl+Shift+7    |
| ⌥⌘−              | Không viền | Ctrl+Shift+−    |

Windows không phải bản viết lại của cặp phím trên Mac. Excel cho Mac trao cho Sheets **cả hai**: ⌘⇧7 và ⌥⌘0 là hai phím cho cùng một kiểu viền ngoài, nên trên Windows lệnh này vẫn giữ chỗ Ctrl+Shift vốn đã có, còn lớp Option đơn giản là không có.

Lưu ý rằng **⌥⌘0 nghĩa là Bình thường trong Docs và Viền ngoài trong Sheets**. Chúng không bao giờ xuất hiện trong cùng một trình soạn thảo, nên khi dùng không có gì xung đột, nhưng ⌥⌘0 đã bị chiếm và không dùng được làm phím tắt toàn cục.

**Mọi trình soạn thảo**: **⌥⌘R / Ctrl+F1** thu gọn Ribbon, như đã mô tả ở trên.

Như vậy ⌥⌘D vẫn còn trống để GenOffice dùng trên macOS, nếu một lệnh nào trong tương lai cần đến nó.

## Nên đọc tiếp ở đâu

- Tập tin nằm ở đâu: [Màn hình Trang chủ](help://home-screen).
- Quản lý nhiều tập tin đang mở: [Quản lý thẻ và cửa sổ](help://tabs-and-windows).
- Để AI làm việc giúp: [Bảng điều khiển trợ lý AI](help://ai-panel).
- Kết nối AI trước đã: [Kết nối gói đăng ký](help://subscription).
- Ngôn ngữ, chủ đề, ứng dụng mặc định: [Cài đặt, ngôn ngữ, chủ đề và tích hợp MCP](help://settings-integrations).
