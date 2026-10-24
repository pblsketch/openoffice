# Sách điện tử EPUB: đọc, chỉnh sửa và dịch

Trình soạn thảo sách điện tử mở sách EPUB (`.epub`) trong một thẻ. Bạn có thể đọc sách, sửa chữ ngay trên trang, hỏi AI về sách và dịch sách thành một tệp EPUB mới. Không có màn hình nào để sửa mã của một chương.

## Mở sách

- Mở tệp `.epub` từ hộp thoại mở tệp, bằng cách kéo tệp vào cửa sổ, từ danh sách tệp gần đây, cây thư mục hoặc danh sách Google Drive. Trên Windows, tệp này cũng xuất hiện trong mục "Mở bằng". Cài GenOffice không biến nó thành chương trình mặc định cho tệp `.epub`.
- Nếu sách đã mở sẵn, thẻ của sách đó sẽ được đưa lên trước.
- Sách có bảo vệ bản quyền (DRM) không mở được: hãy mở bằng ứng dụng của cửa hàng nơi bạn đã mua. Tệp bị hỏng và tệp không phải sách EPUB cũng không mở được, và lý do sẽ được hiển thị.
- **Sách bố cục cố định** (dàn trang theo từng trang, như sách tranh và truyện tranh) chỉ mở để đọc. Chỉnh sửa, chỉnh sửa bằng AI, thay thế và dịch đều bị tắt, và dòng trạng thái cho biết lý do. Bạn vẫn đọc và hỏi AI được như thường.
- Chương có tệp sai cấu trúc vẫn được hiển thị tốt nhất có thể nhưng không sửa được, và một ghi chú ở đầu chương cho biết điều đó. Chương này được lưu nguyên như cũ và giữ ngôn ngữ gốc trong bản dịch.

## Đọc

- Ngăn **Mục lục** bên trái hiển thị mục lục của sách. Bấm vào một mục để đi tới đó. Sách không có mục lục sẽ có danh sách các chương thay thế.
- Mỗi chương cuộn lên xuống. Cứ cuộn tiếp qua cuối chương để sang chương sau, hoặc qua đầu chương để quay lại. Dòng trạng thái cho biết bạn đang ở chương nào.
- Thẻ **Xem** đổi cỡ chữ và giãn dòng, đồng thời bật tắt **Chế độ đọc tối**. Các thiết lập này chỉ đổi cách hiển thị trên màn hình, không bao giờ đổi sách, và áp dụng cho mọi cuốn sách.
- Chỗ bạn đọc dở được ghi nhớ riêng cho từng tệp, trong thư mục dữ liệu của ứng dụng chứ không phải trong sách.
- **Tìm trong sách** (Ctrl+F) tìm trong mọi chương. Bấm vào một kết quả để đi tới đó.
- Liên kết bên trong sách sẽ chuyển tới vị trí được liên kết. Liên kết web và email mở trong trình duyệt mặc định của bạn; các loại địa chỉ khác không được mở.
- Script riêng của sách không bao giờ chạy và không có gì được tải từ internet. Âm thanh và video không phát.

## Chỉnh sửa chữ

- Bấm vào một đoạn văn rồi gõ. Có thể sửa đoạn văn, tiêu đề, mục danh sách, trích dẫn, ô bảng và chú thích hình. Không sửa được hình ảnh và bố cục của bảng.
- Dán chỉ chèn văn bản thuần.
- **Enter** tách một đoạn văn thành hai và **Shift+Enter** xuống dòng bên trong đoạn. **Backspace** ở đầu đoạn văn nối đoạn đó vào đoạn trước, còn **Delete** ở cuối đoạn nối đoạn sau vào đoạn này. Trong ô bảng, chú thích hình và danh sách định nghĩa, Enter không làm gì cả: chỉ có chữ bên trong thay đổi.
- **Đậm** (Ctrl+B) và **Nghiêng** (Ctrl+I) bấm một lần để bật, bấm lần nữa để tắt. Chữ mà bảng định kiểu của sách đã làm đậm hoặc nghiêng vẫn giữ nguyên.
- **Hoàn tác** (Ctrl+Z) và **Làm lại** (Ctrl+Y) vẫn dùng được sau khi lưu. Hoàn tác một thay đổi ở chương khác sẽ đưa bạn tới chương đó.
- **Thay thế** (Ctrl+H) chạy qua toàn bộ sách, mỗi lần một đoạn văn: một kết quả khớp không bao giờ trải qua hai đoạn. Các chương chỉ đọc bị bỏ qua, và số chỗ bị bỏ qua được hiển thị. **Thay thế tất cả** được hoàn tác trong một bước.

## Lưu

- Lưu (Ctrl+S), Lưu dưới dạng (Ctrl+Shift+S, chỉ `.epub`), **Tự động lưu** trên Ribbon và câu hỏi trước khi đóng hoạt động giống như ở các trình soạn thảo khác.
- Nếu không có gì thay đổi, tệp không được ghi lại. Khi bạn lưu thay đổi, chỉ những đoạn văn bạn đã sửa được ghi lại. Hình ảnh, phông chữ, kiểu và mọi phần khác của sách giữ nguyên y như cũ. Với sách EPUB 3, ngày "sửa đổi lần cuối" cũng được cập nhật.
- Nếu một chương trình khác đã sửa tệp sau khi bạn mở, tệp sẽ không bị ghi đè.

## Bảng AI

- Hỏi về cuốn sách, nhờ tóm tắt một chương, hoặc nhờ sửa hay viết lại chữ trong đó. AI đọc mục lục và các chương của sách, và tìm chữ trong sách.
- Thay đổi của AI hiện ra ngay, và một lần hoàn tác (Ctrl+Z) sẽ lấy lại mọi thứ AI đã đổi trong lượt đó. AI có thể làm chữ đậm hoặc nghiêng, nhưng không thể thêm hình ảnh, bảng hay chương.
- Chữ trong sách là tư liệu cho AI, không phải lệnh dành cho AI.
- Hãy nói "Dịch cuốn sách này sang tiếng Pháp" và AI sẽ mở cửa sổ dịch với ngôn ngữ đó đã được điền sẵn. Không có gì được gửi đi cho tới khi bạn bấm **Bắt đầu**.
- Sách EPUB cũng có thể được đính kèm trong bảng AI của các trình soạn thảo khác, chọn bằng `@`, và tìm thấy qua tìm kiếm tệp ở màn hình Trang chủ.

## Dịch sách

1. Trên thẻ **Trang đầu**, bấm **Dịch sách** (hoặc Tệp ▸ Dịch sách…).
2. Chọn ngôn ngữ, các chương (ban đầu đã chọn tất cả) và kết quả: **Bản dịch**, **Bản song ngữ** (nguyên văn và bản dịch), hoặc cả hai. Chọn nơi lưu cho từng kết quả.
3. Bấm **Tiếp**. Màn hình xác nhận cho thấy số yêu cầu AI ước tính, AI sẽ nhận các yêu cầu đó, phần đã dịch (không gửi lại) và, nếu là kết nối tính phí theo mức dùng, cho biết sẽ mất phí. Nếu sách có thay đổi chưa lưu, nút sẽ là **Lưu và dịch**.
4. Bấm **Bắt đầu**. Tiến độ và nút **Dừng** hiện ở phía trên. Việc chỉnh sửa bị khóa cho tới khi dịch xong; bảng AI vẫn dùng được.
5. Khi xong, một báo cáo liệt kê những gì đã dịch, những gì còn giữ ngôn ngữ gốc và các tệp kết quả, mỗi tệp kèm nút **Mở**.

- Bản thân cuốn sách không thay đổi. Mỗi kết quả là một tệp EPUB mới có định danh riêng, nên ứng dụng thư viện sách điện tử tách nó khỏi bản gốc.
- Tên sách và mục lục cũng được dịch. Trong bản song ngữ, mỗi đoạn văn có bản dịch đi ngay sau; trong bảng, chú thích hình và danh sách, bản dịch nằm trong cùng ô hoặc cùng mục. Tên sách hiện cả hai, dạng "Tên gốc (Tên đã dịch)".
- Các chương bạn không chọn sẽ giữ ngôn ngữ gốc trong kết quả.
- Sách viết dọc sẽ chuyển thành viết ngang, trừ khi được dịch sang tiếng Nhật, tiếng Trung hoặc tiếng Hàn. Bản dịch tiếng Ả Rập và tiếng Do Thái đọc từ phải sang trái.
- Phần đã dịch được giữ lại. Nếu bạn dừng, hãy chọn **Xuất phần đã dịch đến giờ** (phần còn lại giữ ngôn ngữ gốc) hoặc **Tiếp tục sau**. Khi bạn mở một cuốn sách có bản dịch chưa xong, GenOffice sẽ đề nghị dịch tiếp. **Dịch lại từ đầu** sẽ xóa bản dịch đã giữ của ngôn ngữ đó trước.
- Bản dịch đã giữ được tính trong Cài đặt ▸ Chung ▸ **Kết quả AI đã lưu**, cùng với kết quả của tài liệu PDF, và **Xóa tất cả** cũng xóa luôn chúng.
- Cũng có thể chạy cùng phép dịch này từ [lệnh trên terminal](help://cli) bằng `ieumoffice epub translate`.

## Chưa hỗ trợ

- Thêm, xóa hoặc sắp xếp lại chương; đổi tên sách, tác giả hoặc ảnh bìa; chèn hình ảnh hoặc bảng; biến một đoạn văn thành tiêu đề hoặc danh sách.
- Chỉnh sửa hoặc dịch sách bố cục cố định, và mở sách có bảo vệ bản quyền.
- Lật trang như sách in, và tạo một cuốn sách mới trống.
- So sánh nguyên văn và bản dịch đặt cạnh nhau trong trình soạn thảo. Thay vào đó, hãy mở bản song ngữ, và sửa bản dịch như mọi cuốn sách khác.
- Ẩn các phần của sách khỏi AI.
