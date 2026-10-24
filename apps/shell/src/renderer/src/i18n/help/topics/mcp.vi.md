# Kết nối tác nhân lập trình

GenOffice nói chuyện theo Model Context Protocol, nên một tác nhân lập trình có thể đọc, ghi và kết xuất tài liệu của bạn qua đúng những engine mà ứng dụng dùng. Tác nhân không phải đoán mò một định dạng tệp: nó nhận lược đồ thao tác có kiểu từ đúng những định nghĩa mà bộ thực thi dùng để kiểm tra.

## Đăng ký từ trong ứng dụng

Việc này làm ở **Cài đặt ▸ Tích hợp**. Bảng đó có hai nửa, và bạn có thể dùng một nửa hoặc cả hai.

**Kỹ năng.** Mỗi tác nhân lập trình tìm thấy trên máy này một dòng — Claude Code, Codex, Cursor, Gemini CLI, Copilot CLI, OpenCode, Windsurf —, mỗi dòng có **Cài đặt**, **Cập nhật** và **Gỡ cài đặt**, cộng thêm **Cài đặt vào một thư mục khác…**, **Tải xuống kỹ năng (zip)** và **Sao chép đường dẫn**. Nếu trợ lý của bạn không có trong danh sách, hãy chỉ cho GenOffice thư mục mà nó đọc `SKILL.md`, hoặc lưu tệp zip lại rồi bảo trợ lý tự cài đặt. Kỹ năng và MCP có thể nằm cạnh nhau: trợ lý chọn một trong hai, và chúng làm đúng những việc giống nhau.

**MCP.** Có hai đường: **Được khởi động bởi trợ lý (khuyến nghị)**, ở đó bạn thêm cấu hình được hiển thị vào phía khách của mình và trợ lý tự khởi chạy máy chủ, và **Máy chủ HTTP cục bộ**, do ứng dụng chạy thay bạn. Dù chọn đường nào, trợ lý vẫn kết nối với GenOffice và bạn không phải gõ lệnh nào.

## Đăng ký từ dòng lệnh

Cũng làm được từ terminal — đây là đường nâng cao, dùng khi tác nhân nằm ở nơi bảng kia không tìm thấy:

```sh
ieumoffice mcp install all
```

Lệnh này tìm các tác nhân lập trình có trên máy này — Claude Code, Codex, Cursor, Gemini CLI, Copilot CLI, OpenCode, Windsurf — rồi ghi mục máy chủ stdio vào cấu hình riêng của từng tác nhân, giữ nguyên phần còn lại của tệp đó như cũ. Mục đó có tên `ieumoffice`. Nếu làm bằng tay cho Claude Code, việc đăng ký tương tự là `claude mcp add --transport stdio ieumoffice -- ieumoffice mcp`.

```sh
ieumoffice mcp list             # where each agent stands
ieumoffice mcp install cursor    # just one
ieumoffice mcp uninstall cursor  # take it back out
```

Một tác nhân bạn cài ở chỗ không mấy quen thuộc cần `--dir <path>`; còn `--force` ghi đè một mục đã có sẵn.

`ieumoffice mcp --help` đưa mọi thứ mà máy chủ nhận vào một màn hình: các dạng đăng ký, gỡ bỏ và liệt kê, phục vụ qua HTTP, cùng hai cờ lược đồ.

## Tự chạy nó

Với một ứng dụng trên máy khác, hãy phục vụ qua HTTP thay thế:

```sh
ieumoffice mcp --http 8765 --token <secret>
```

`--host <addr>` đổi nơi nó lắng nghe. Hãy truyền cùng mã thông báo đó cho ứng dụng.

Qua HTTP, tệp cũng di chuyển: `PUT /files/<name>` tải lên một tệp, mọi công cụ đều nhận một URL `http(s)` thay cho đường dẫn, và kết quả trả về dưới dạng URL tải xuống — và, khi đủ nhỏ, dưới dạng tài nguyên nhúng. Các thao tác, đặc tả và Markdown đều được truyền nội tuyến trong cả hai trường hợp.

## Tác nhân nhận được gì

Mỗi lệnh là một công cụ. Những cái đáng chú ý:

- **`docs`, `sheet`, `slides`** — đọc và sửa một tệp qua lối ghi của chính ứng dụng, mỗi lần một **thao tác** (op). Một bộ trình chiếu mới đi theo `deck_start`, `deck_page`, `deck_build`.
- **`render`** — một PNG cho mỗi trang, được bộ kết xuất của ứng dụng bố cục, để tác nhân có thể nhìn một trang chiếu thay vì đoán mò.
- **`pdf`** — lớp văn bản của PDF, từng trang một, không cần tiến trình ứng dụng.
- **`info`** — siêu dữ liệu và phần tóm tắt cấu trúc, thường là lời gọi rẻ nhất khi gặp một tệp lạ.
- **`search`, `image`, `media`** — tìm kiếm web và hình ảnh, tạo hình ảnh và phân tích phương tiện thông qua những gì đã được thiết lập trong ứng dụng, nên tác nhân không cần khóa riêng. Phần tiếp theo nói rõ chúng được dùng những gì.
- **`merge`** — điền một mẫu `{{key}}`.

## Tìm kiếm, hình ảnh và phương tiện: tác nhân được dùng những gì

Một yêu cầu đến từ lệnh `ieumoffice` hoặc từ một ứng dụng khách MCP không phải do bạn gõ trong ứng dụng, nên GenOffice thận trọng với nó.

- **Tìm kiếm** lúc nào cũng dùng được và mặc định miễn phí. Khóa của nhà cung cấp tìm kiếm chỉ được dùng nếu bạn đã chọn.
- **Tạo một hình ảnh** cần khóa của nhà cung cấp hình ảnh. Trong phiên bản này, gói đăng ký không tạo được hình ảnh.
- **Mô tả một hình ảnh** sẽ dùng nhà cung cấp dùng khóa khi có một nhà cung cấp như vậy được thiết lập. Gói đăng ký Claude hoặc Codex của bạn **không được dùng trừ khi bạn cho phép**.
- **Video và âm thanh** cần một nhà cung cấp dùng khóa có hỗ trợ video.

Để cho phép dùng gói đăng ký, hãy mở Cài đặt ▸ AI ▸ **Nâng cao** rồi bật **Cho phép yêu cầu tự động dùng gói đăng ký**. Một cảnh báo sẽ hiện ra trước — "Không có giới hạn theo giờ, nên chương trình có thể gửi bao nhiêu yêu cầu tùy ý, và các yêu cầu đó có thể chứa toàn bộ văn bản của tài liệu cùng hình ảnh các trang. Cả hai công ty đều không khuyến nghị để chương trình tự động dùng gói đăng ký, và tài khoản của bạn có thể bị hạn chế." — và công tắc chỉ được bật sau khi bạn nhấn **Vẫn bật**.

Ngay cả khi công tắc đã bật:

- Các yêu cầu được xử lý lần lượt từng cái một. Những yêu cầu khác chờ đến lượt.
- Không có giới hạn theo giờ. Lượt được tính theo từng yêu cầu chứ không theo cả tác vụ, nên một bản dịch PDF dài vẫn xen kẽ với các yêu cầu khác thay vì chặn chúng. Công tắc đã bật theo cảnh báo cũ đã được tắt; hãy đọc cảnh báo mới rồi bật lại.
- Một lần đăng nhập tính phí theo mức sử dụng mà bạn đã cho phép bằng **Vẫn sử dụng** không được tính là gói đăng ký ở đây. Nó được xử lý như một khóa: nếu bạn đã chọn nó làm AI sử dụng, việc mô tả hình ảnh sẽ đi qua nó bất kể công tắc đang bật hay tắt, và mỗi lần đều bị tính phí.

Khi công tắc tắt và chưa có khóa nào được thiết lập, công cụ sẽ trả lời rằng tính năng không dùng được và nêu tên cài đặt này. Tác nhân có thể kiểm tra trước bằng công cụ `capabilities`; xem [Dòng lệnh và tác nhân](help://cli).

## Lược đồ, và một hạn mức nhỏ hơn

`apply` và `create` công bố các tham số `ops`, `cells` và `data` kèm lược đồ có kiểu cho từng thao tác, sinh từ `ieumoffice guide <domain> --json`. Nó chính xác và không hề nhỏ. Một ứng dụng có cửa sổ ngữ cảnh chật hẹp có thể xin các mảng thuần thay vì thế:

```sh
ieumoffice mcp --compact-schemas
GENOFFICE_MCP_COMPACT_SCHEMAS=1 ieumoffice mcp
```

## Vì sao cần kỹ năng

Một tác nhân không biết từ vựng thao tác sẽ đoán mò. Kỹ năng mang theo tài liệu tham chiếu và các hướng dẫn thiết kế — đúng những tài liệu mà `ieumoffice guide` in ra —, nên trợ lý viết ra thao tác mà nó đã thực sự đọc đặc tả. Cài nó từ bảng kia ở trên, hoặc bằng `ieumoffice skill` trong terminal.

## Nó chạm được gì trong ứng dụng

Máy chủ không chỉ dừng ở các tệp trên đĩa. Chừng nào GenOffice còn chạy, tác nhân cũng có thể làm việc qua cửa sổ:

- **`open_in_genoffice`** mở một tệp trong một thẻ và đưa thẻ đó lên tiền cảnh.
- **`open_documents`** liệt kê mọi tài liệu bạn đang mở — id, loại, đường dẫn và có thay đổi chưa lưu hay không —, rồi đọc nội dung hiện tại của một tài liệu, lưu tại chỗ hoặc đóng nó lại, lưu trước trừ khi bạn bảo nó bỏ thay đổi.
- **Các công cụ nội dung** nhận id (hoặc đường dẫn) đó làm tham số `document`, nên một thay đổi sẽ rơi vào đúng thẻ bạn đang mở và cửa sổ chuyển sang hiển thị nó.

Có hai thứ vẫn nằm ngoài tầm với: không có bảng AI, và hộp thoại cập nhật trong ứng dụng không áp dụng.

## Bảng Máy chủ HTTP cục bộ

Dưới **Máy chủ HTTP cục bộ**, ứng dụng tự chạy máy chủ thay vì để trợ lý lo: công tắc bật, ô **Cổng**, chỉ báo **Đang chạy / Không chạy** và **Tạo ngầm dưới nền** (ghi thẳng tài liệu ra một đường dẫn mà không mở giao diện), cùng **Ví dụ cấu hình máy khách** để sao chép. Mở **Nâng cao** sẽ thêm hai URL kết nối — Streamable HTTP và URL SSE cũ —, URL **Kiểm tra tình trạng** và công tắc **Ghi nhật ký** ghi lại hoạt động của máy chủ và các công cụ vào một tệp cục bộ mà bạn có thể **Mở**, **Làm mới** hoặc **Xóa** ngay tại đó. Nó chỉ lắng nghe trên localhost.
