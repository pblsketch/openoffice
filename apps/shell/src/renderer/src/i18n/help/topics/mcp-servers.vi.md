# Kết nối máy chủ MCP

Máy chủ MCP là một dịch vụ cung cấp các công cụ mà AI có thể dùng từ bên ngoài ứng dụng, chẳng hạn tra cứu luật hoặc tìm trong tài liệu do nhóm của bạn quản lý. Sau khi kết nối máy chủ, các cửa sổ AI trong GenOffice có thể gọi công cụ của máy chủ đó trong lúc trò chuyện. Bạn tự quyết định, từng công cụ một, AI được dùng gì và dùng thế nào.

## Thêm máy chủ

1. Mở **Cài đặt ▸ Tích hợp** và nhấn **Thêm máy chủ** trên thẻ **Máy chủ MCP**.
2. Chọn cách thêm.
   - **Dán đoạn cài đặt**: dán nguyên đoạn cài đặt trong hướng dẫn của máy chủ rồi nhấn **Đọc**. GenOffice sẽ điền các ô giúp bạn. Nếu một đoạn có nhiều máy chủ, bạn xác nhận từng máy chủ một. Nếu đoạn văn bản đọc khóa hoặc giá trị từ biến của máy (`${TÊN}`), ô đó để trống để bạn tự nhập.
   - **Tự nhập**: nhập tên và địa chỉ. Nếu hướng dẫn của máy chủ có đưa một khóa, hãy điền vào ô **Khóa (không bắt buộc)**.
3. Đọc thông báo phía trên nút thêm, rồi nhấn **Thêm**.
4. Sau khi thêm, GenOffice kiểm tra kết nối ngay và lấy danh sách công cụ. Máy chủ cần đăng nhập sẽ chờ bạn thay vì tự mở trình duyệt. Nhấn **Kiểm tra kết nối** để xem danh sách công cụ mà máy chủ cung cấp. Với máy chủ cần đăng nhập, hãy nhấn **Đăng nhập bằng trình duyệt** và hoàn tất việc đăng nhập ở đó.

Tên máy chủ dùng chữ cái, chữ số, `-` và `_`, tối đa 24 ký tự. AI thấy công cụ của máy chủ này dưới tên có dạng `mcp__name__tool`. Nếu một kỹ năng gọi công cụ bằng tên dạng này, hãy thêm máy chủ với đúng tên mà kỹ năng đó dùng.

## Máy chủ qua địa chỉ và máy chủ trên máy tính này

- Máy chủ **qua địa chỉ** được kết nối bằng một địa chỉ web. Địa chỉ internet phải bắt đầu bằng `https://`. `http://` chỉ dùng được cho máy tính này và các địa chỉ mạng riêng ở nhà hoặc ở cơ quan, và trước đó bạn phải xác nhận rằng khóa và nội dung tài liệu sẽ được gửi đi mà không mã hóa.
- Máy chủ **trên máy tính này** là một chương trình GenOffice chạy ngay trên máy tính này. Màn hình thêm sẽ hiện đúng chương trình sẽ chạy, các đối số của nó và tên các biến môi trường được truyền cho nó. Chương trình chỉ chạy lần đầu sau khi bạn nhấn **Cho phép chạy**. Nếu sau này lệnh thay đổi, máy chủ sẽ dừng cho đến khi bạn cho phép lại.
- Nếu máy chủ trên máy tính này cần một chương trình mà máy tính chưa có (Node.js, hoặc uv cho máy chủ Python), GenOffice sẽ hỏi trên thẻ máy chủ trong Cài đặt xem có tải về hay không. Dung lượng tải về được hiển thị, và sẽ không tải gì cho đến khi bạn nhấn **Tải về**. Chương trình đã tải chỉ nằm trong thư mục dữ liệu của GenOffice, và cài đặt của máy tính không bị thay đổi.
- Máy chủ trên máy tính này khởi động khi cần và dừng sau 10 phút không dùng. Nó cũng dừng khi bạn đóng GenOffice.

## Chọn quyền cho từng công cụ

- Với mỗi công cụ, chọn **Luôn cho phép**, **Hỏi trước** hoặc **Không dùng**.
- Ban đầu, các công cụ mà máy chủ đánh dấu là chỉ đọc được đặt là **Luôn cho phép**, còn lại là **Hỏi trước**.
- Khi AI gọi một công cụ **Hỏi trước**, một thẻ sẽ hiện trong cửa sổ AI. Xem nội dung sắp được gửi rồi nhấn **Chỉ cho phép lần này**, **Luôn cho phép trong cuộc trò chuyện này** hoặc **Chặn**. Không có gì chạy cho đến khi bạn nhấn một trong số đó. Dừng AI hoặc đóng cửa sổ được tính là chặn.
- Nếu máy chủ thay đổi mô tả của một công cụ hoặc các giá trị công cụ nhận, công cụ đó sẽ hiện **Cần kiểm tra** và bị ẩn khỏi AI cho đến khi bạn xem thay đổi và nhấn **Duyệt thay đổi**. Nếu phần hướng dẫn mà máy chủ đưa cho AI thay đổi, bạn cũng kiểm tra theo cách như vậy.
- Công cụ mới trên máy chủ được bật với cùng thiết lập ban đầu, và thẻ cùng nút trong cửa sổ AI hiện **Công cụ mới: n**. Dấu này biến mất khi bạn mở danh sách công cụ của máy chủ đó trong Cài đặt.

## Dùng máy chủ trong cửa sổ AI

- Máy chủ hoạt động trong cửa sổ AI của các trình soạn thảo và trong ô Hỏi AI ở trang chủ. Khi có máy chủ đang bật, nút **Máy chủ đã kết nối** sẽ hiện cạnh ô nhập.
- Nhấn nút đó để xem trạng thái từng máy chủ, và tắt hoặc bật một máy chủ chỉ trong cuộc trò chuyện này. Cuộc trò chuyện mới bắt đầu với mọi máy chủ mà bạn đã bật trong Cài đặt. Máy chủ chưa từng được kiểm tra kết nối sẽ hiện **Chưa kiểm tra**; hãy kiểm tra trong Cài đặt để có các công cụ của nó.
- Tắt **Cho phép AI dùng công cụ internet** trong **Cài đặt ▸ Phương tiện AI & Tìm kiếm** cũng sẽ gỡ toàn bộ công cụ của máy chủ MCP.
- Khi một kỹ năng cần công cụ của một máy chủ mà hiện bạn không dùng được, AI sẽ nói trong câu trả lời là bước nào nó không làm được. **Cài đặt ▸ Kỹ năng** cũng hiện máy chủ mà kỹ năng cần ngay cạnh kỹ năng đó.
- Cửa sổ tác tử cũng dùng được công cụ của các máy chủ đang bật. Áp dụng cùng quyền, và một phiên giữ nguyên thiết lập lúc bắt đầu. Xem [Chế độ tác tử](help://agent-mode).

## Bảo vệ nội dung máy chủ trả về

Mỗi máy chủ có mục **Bảo vệ nội dung máy chủ này trả về**, ban đầu được bật. Khi bật, một khi có nội dung do máy chủ đó trả về nằm trong cuộc trò chuyện, các công cụ gửi dữ liệu ra ngoài ứng dụng sẽ ngừng hoạt động trong cuộc trò chuyện đó: tìm kiếm web, đọc trang theo địa chỉ, công cụ của các máy chủ MCP khác và những công cụ tương tự. Công cụ của chính máy chủ đó vẫn dùng bình thường. Hãy bắt đầu cuộc trò chuyện mới để dùng lại các công cụ kia. Bạn có thể tắt mục này cho máy chủ chỉ cung cấp tài liệu công khai.

Cửa sổ tác tử không giữ được sự bảo vệ này. Khi một phiên bắt đầu với máy chủ như vậy, cửa sổ sẽ báo cho bạn biết.

## Dữ liệu đi đâu

- Khi AI gọi một công cụ, văn bản do AI chọn sẽ được gửi đến máy chủ đó. Văn bản này có thể gồm nội dung từ tài liệu đang mở và từ tệp đính kèm. Những phần đã ẩn khỏi AI vẫn được giữ ẩn.
- Những gì máy chủ trả về sẽ đến nhà cung cấp AI mà bạn đang dùng. Chỉ thêm những máy chủ mà bạn tin tưởng bên vận hành.
- Khóa, thông tin đăng nhập và giá trị biến môi trường được lưu bằng mã hóa của hệ điều hành trên máy tính này. Nếu máy tính này không mã hóa được, chúng chỉ được nhớ cho đến khi bạn đóng ứng dụng.
- Xóa một máy chủ sẽ xóa khóa và thông tin đăng nhập của nó, và nếu máy chủ hỗ trợ thì còn yêu cầu máy chủ kết thúc phiên đăng nhập.
