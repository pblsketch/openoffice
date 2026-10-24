# Cài đặt, ngôn ngữ, chủ đề và tích hợp MCP

## Mở cài đặt

Hàng ở góc dưới bên trái của Trang chủ mở bảng cài đặt (hàng đó ghi "Kết nối AI" cho đến khi có một AI được kết nối). Bảng đó có năm mục: Tài khoản, AI, Chung, Tích hợp và Giới thiệu.

**Tài khoản** cho biết tình trạng các gói đăng ký Claude và Codex của bạn, còn **Quản lý kết nối** dẫn tới mục AI. AI có các bài riêng: [Kết nối gói đăng ký](help://subscription) và [Mô hình AI và cài đặt](help://ai-models).

## Ngôn ngữ

- Cài đặt có **21 ngôn ngữ giao diện**: tiếng Anh, Trung giản thể, Nhật, Hàn, Pháp, Đức, Tây Ban Nha, Thái, Indonesia, Nga, Ả Rập, Bồ Đào Nha, Ý, Ba Lan, Séc, Hà Lan, Mã Lai, Hebrew, Hindi, Trung Quốc Phồn thể, Việt.
- Việc đổi có hiệu lực ngay và được ghi nhớ; dải menu gốc được dựng lại theo ngôn ngữ đó.

## Chủ đề

Sáng / Tối / Theo hệ thống. Khi chọn Theo hệ thống, giao diện bám theo vẻ ngoài của hệ điều hành, và vùng trình soạn thảo đổi màu đồng bộ mà không nhấp nháy.

## Chung

- **Vị trí thanh bên AI** (trái hoặc phải), **Cỡ chữ bảng điều khiển AI** và **Kiểm tra chính tả trong trò chuyện AI**.
- **Mở bảng AI trong tài liệu mới** — tắt, tài liệu mới sẽ bắt đầu với bảng AI đã thu gọn, chỉ một cú nhấp là mở ra.
- **Tự động lưu tất cả tài liệu** bật AutoSave theo mặc định trong mọi trình soạn thảo; bạn vẫn có thể tắt nó cho một cửa sổ.
- **Vị trí lưu** kèm nút **Thay đổi**, và **Ứng dụng mặc định cho tài liệu Office** để nhận .docx / .xlsx / .pptx về cho GenOffice.

GenOffice không thu thập hay gửi số liệu thống kê sử dụng, nên không có công tắc nào cho việc đó.

## AI ▸ Nâng cao

Mục này đóng cho đến khi bạn mở ra; hầu hết mọi người không bao giờ cần đến nó. Thẻ **Mô hình AI** chứa các khóa API và các máy chủ do bạn tự vận hành, dùng cho trò chuyện. Trong thẻ **Phương tiện AI & Tìm kiếm**, mỗi khả năng sẽ chọn nhà cung cấp phục vụ nó, và khóa cùng URL cơ sở của nhà cung cấp chỉ nhập một lần rồi dùng chung:

- **Tìm kiếm web**, **Tạo hình ảnh**, **Phân tích hình ảnh** và **Phân tích video**, mỗi mục có nhà cung cấp, mô hình, khóa và URL cơ sở.
- **Tìm tệp cục bộ** chạy trên máy này. Bên dưới, **xếp hạng lại tìm kiếm Jev** **tắt mặc định**. Bật lên, các trích đoạn của 20 kết quả cục bộ đầu — tới 1.200 ký tự mỗi tài liệu, cộng tên tệp và thư mục — đi tới điểm cuối quyết định bạn chọn (Jev qua OpenRouter hay TypeSafe, Perplexity, Liquid AI d1, Cloudflare, engine cục bộ hoặc URL tùy chỉnh) để xếp lại theo mức liên quan. Tắt thì không gì rời thiết bị.
- **Cho phép yêu cầu tự động dùng gói đăng ký** **tắt mặc định**. Mục này quyết định một yêu cầu đến từ dòng lệnh hoặc từ một tác nhân lập trình đã kết nối có được dùng gói đăng ký Claude hay Codex của bạn hay không; xem [Kết nối tác nhân lập trình](help://mcp).

## Giới thiệu

- **Phiên bản**, địa chỉ GitHub của dự án, và một dòng ghi tên dự án nguồn mở mà ứng dụng này dựa trên.
- **Kênh cập nhật**: Ổn định hoặc Beta. Đổi kênh sẽ có hiệu lực ngay và kiểm tra bản cập nhật; nó sẽ không hạ bản cài đặt Beta về lại Ổn định.

## Đăng ký ứng dụng mặc định

Cài đặt có thể đăng ký GenOffice làm ứng dụng xử lý .docx / .xlsx / .pptx / .pdf và các định dạng liên quan (đăng ký ứng dụng mặc định ở cấp nền tảng; xác nhận khi được hỏi).

## Thông báo bên thứ ba và cập nhật

- Trợ giúp ▸ Thông báo của bên thứ ba: danh mục giấy phép nguồn mở đầy đủ đi kèm ứng dụng.
- Menu (☰) ▸ Kiểm tra bản cập nhật (trên Mac là Trợ giúp ▸ Kiểm tra bản cập nhật): kích hoạt một lần kiểm tra thủ công; nếu có bản mới sẽ nhắc cài đặt.

## Tích hợp MCP (dành cho người dùng nâng cao / ứng dụng AI)

**Tích hợp** là bảng nối GenOffice với một tác nhân lập trình, và nó có bài riêng: Kết nối tác nhân lập trình. Nói ngắn gọn — chọn một lối (dòng lệnh, hoặc MCP), làm theo phần đó, rồi mở một cuộc trò chuyện mới và hỏi.

Dưới **Máy chủ HTTP cục bộ**, ứng dụng cũng có thể tự chạy máy chủ đó — công tắc bật và cổng —, còn **Nâng cao** thêm URL kiểm tra tình trạng và tệp nhật ký, thay vì để dành cho trợ lý. Nó chỉ lắng nghe trên localhost.

## Bảng tra nhanh dòng lệnh

| Lệnh                | Tác dụng                     |
| ------------------- | ---------------------------- |
| `ieumoffice <file>` | mở một tập tin               |
| `ieumoffice mcp`    | khởi động máy chủ MCP cục bộ |
| `ieumoffice --help` | mọi lệnh và tuỳ chọn         |
