# Bảng điều khiển trợ lý AI

Mọi trình soạn thảo đều có thể gọi bảng AI: chọn một nội dung, đưa ra chỉ dẫn, xem kết quả hiện dần.

## Mở và sử dụng

- Bảng này cần một AI đã kết nối. Khi chưa có, nó hiển thị các thẻ kết nối thay vì báo lỗi; xem [Kết nối gói đăng ký](help://subscription).
- Các lối vào: **nút AI** trên dải ruy-bâng của từng trình soạn thảo, **Hỏi AI** trong menu ngữ cảnh, hoặc Hỏi AI trên thanh đánh dấu.
- Mô tả công việc bằng ngôn ngữ tự nhiên (viết lại đoạn này / biến cột này thành phần trăm / bố cục lại trang này...) rồi nhấn Enter.
- Câu trả lời hiển thị **dạng luồng**; khi AI cần công cụ (đọc tài liệu, sửa tài liệu) thì nó thực thi và tiếp tục cho tới khi xong.
- **Dừng**: có thể ngắt lượt hiện tại bất cứ lúc nào.
- **Hàng đợi**: khi phản hồi đang truyền, Enter đưa tin nhắn của bạn vào hàng đợi thay vì bỏ đi — dải phía trên ô nhập đếm chúng; mở ra để sửa, bỏ, đổi thứ tự, tạm dừng hay dọn sạch. Tin tiếp theo tự gửi khi lượt kết thúc; Esc vẫn dừng lượt như cũ.

## AI nào trả lời

- Danh sách mô hình ở cuối bảng cho thấy AI đang được dùng và cho phép bạn chọn AI khác: các gói đăng ký của bạn trước, rồi đến các nhà cung cấp dùng khóa mà bạn đã thiết lập.
- Khi bạn đã dùng từ 80% một giới hạn của gói đăng ký trở lên, một dòng như "Đã dùng 85% · đặt lại lúc 15:00" sẽ xuất hiện trong bảng.
- Nếu một yêu cầu bị dừng — giới hạn đã dùng hết, hoặc phiên đăng nhập đã hết hạn — bảng sẽ nói rõ lý do và không tự chuyển sang AI khác. Khi gói đăng ký còn lại của bạn đang được kết nối, một nút **Tiếp tục với …** sẽ đề nghị dùng gói đó.

## AI có thể làm gì

- **Docs**: viết lại/mở rộng/dịch/tóm tắt, chèn bảng và hình ảnh, điều chỉnh định dạng; mỗi lượt đều chụp ảnh trước.
- **Sheets**: công thức, điền dữ liệu, biến đổi hàng loạt, định dạng.
- **Slides**: tạo cả bộ trang chiếu, điều chỉnh bố cục, viết lại nội dung.
- **PDF**: hỏi đáp và tóm tắt dựa trên văn bản hoặc trang đã chọn.
- **Markdown / HTML**: viết lại, mở rộng, dịch.
- **Trang chủ ▸ Ask AI** trả lời từ các tệp bạn đánh sao và trích dẫn chúng — bảng cơ sở tri thức có mục riêng trong chương Trang chủ, và bảng AI của Docs cũng mang kỹ năng ấy.

## Đính kèm tài liệu đang mở

Trong bảng AI của trình soạn thảo Docs, Sheets, Slides, Hangul, HTML và sơ đồ tư duy, bạn có thể đính kèm các tài liệu khác đang mở trong GenOffice, hoặc mới mở gần đây, làm tư liệu. Tài liệu đính kèm được xử lý giống hệt một tệp chọn từ máy tính của bạn.

- **`@` trong ô nhập**: gõ `@` ở đầu ô nhập hoặc sau một dấu cách để mở danh sách tài liệu. Nếu cửa sổ đang chia đôi, tài liệu ở ngăn bên cạnh đứng đầu, tiếp theo là các tài liệu đang mở khác và tài liệu gần đây; tài liệu bạn đang làm việc không có trong danh sách. Thu hẹp bằng vài chữ trong tên (có thể có dấu cách) rồi chọn bằng Enter hoặc một cú nhấp: `@tên tài liệu` được chèn vào ô nhập và tài liệu đó được đính kèm. **Tìm thêm…** ở cuối danh sách mở cửa sổ chọn tài liệu được mô tả bên dưới.
- **Đính kèm từ tài liệu GenOffice**: nút này, nằm cạnh nút đính kèm, mở cùng danh sách đó trong một cửa sổ, nơi bạn có thể đánh dấu nhiều tài liệu và đính kèm một lượt.
- Tài liệu có thay đổi chưa lưu và tài liệu mới chưa từng được lưu sẽ hiện mờ và không chọn được. Hãy lưu rồi chọn lại — AI đọc tệp đã lưu.
- Khi hai tài liệu trùng tên nhưng nằm ở các thư mục khác nhau, tên thư mục ngay phía trên sẽ được thêm vào, như `@kế hoạch.docx(Học kỳ 2)`, và tên thư mục đó cũng được gửi cho AI.
- Trình soạn thảo PDF và Markdown chưa có tính năng đính kèm, nên cả hai cách đều không dùng được ở đó.

## Dự án

- Nhấp vào tên dự án ở bên trái, ngay dưới ô nhập, để chọn một dự án (một thư mục trên máy tính của bạn). Khi đó AI trả lời khi đã biết các tệp, chỉ dẫn và ghi nhớ của thư mục ấy, và cuộc trò chuyện được lưu trong thư mục để bạn tiếp tục ở trình soạn thảo khác. Xem [Dự án](help://projects).
- Khi đã chọn dự án, tiêu đề cuộc trò chuyện hiện tại hiện ở phía trên bảng. Nhấp vào đó để xem danh sách cuộc trò chuyện của dự án này và **Cuộc trò chuyện mới**.
- Danh sách `@` trong ô nhập hiện mục "Tệp trong dự án này" sau các tài liệu đang mở.
- Một yêu cầu có chọn dự án cũng gửi chỉ dẫn (kèm `AGENTS.md` và `CLAUDE.md` ở đầu thư mục, có thể tắt trong trang dự án), ghi nhớ và danh sách tên tệp của dự án đó, một đoạn trích ngắn của mỗi tệp AI tìm thấy khi tìm trong thư mục, cùng nội dung của bất kỳ tệp nào AI đọc, tới AI bạn đang dùng.

## Quay lui và an toàn

- Bảng của Docs giữ một **danh sách phiên bản**: mỗi lượt một ảnh chụp, quay lui về bất kỳ ảnh nào, và bản thân thao tác quay lui cũng quay lui được bằng Ctrl+Z. Ảnh chụp vẫn còn sau khi mở lại tài liệu.
- Các chỉnh sửa của AI đi qua đúng quy trình chỉnh sửa như chỉnh sửa thủ công (hoàn tác được, phải qua xác nhận lưu của bạn) — không có gì lách qua bước xác nhận lưu.

## Ẩn vùng chọn khỏi AI

- Trong Slides, HTML và Markdown, một vùng chọn có thể được giấu khỏi mắt mô hình: chuột phải ▸ **Ẩn vùng chọn khỏi AI**, đặt tên chỗ giữ chỗ, và mô hình đọc `{{tên}}` thay cho chữ. (Markdown bật mục này bằng công tắc mắt-gạch-chéo trên ruy-băng; của HTML nằm ở bảng mã nguồn.)
- Tệp giữ nguyên văn thật — lưu, xuất và in không bị ảnh hưởng, dấu còn sống qua lần mở lại. Chính mục đó hủy việc ẩn (Markdown có thêm mục riêng **Hiện lại vùng chọn cho AI**).
- HTML ẩn nội dung phần tử, giá trị thuộc tính và hằng chuỗi trong script; trang đã render không bao giờ đổi.
- Slides còn ẩn cả hình, video và âm thanh trọn vẹn, và một slide có nội dung ẩn không bao giờ được gửi dạng chụp màn hình: kiểm tra bố cục tự động bỏ qua trang đó và nói rõ.
- Điều này chỉ dành cho AI trong ứng dụng — CLI, công cụ MCP và xuất headless đọc tệp trực tiếp nên vẫn thấy văn bản.

## Quyền riêng tư

- Chỉ dẫn và nội dung tài liệu liên quan được gửi tới **AI mà bạn đang dùng**: tới Anthropic hoặc OpenAI bằng chính tài khoản của bạn khi bạn dùng gói đăng ký, hoặc tới nhà cung cấp mà bạn đã nhập khóa. Khi chưa có AI nào được kết nối thì không có gì được gửi đi.
- Nội dung gửi qua gói đăng ký có được dùng để huấn luyện AI hay không tùy thuộc vào cài đặt tài khoản của bạn tại công ty đó.
- Tập tin cục bộ không được tải lên nơi khác; khóa API được lưu trong tệp cài đặt của ứng dụng trên máy này và chỉ được gửi trong phần đầu yêu cầu.
