# Google Drive

Kết nối Google Drive để mở và chỉnh sửa trong GenOffice các tệp Drive bạn chọn. Khi lưu, tệp được đưa trở lại Drive. GenOffice chỉ mở được những tệp bạn chọn trong cửa sổ của Google; nó không thấy các tệp khác trong Drive của bạn.

## Kết nối

1. Mở **Cài đặt ▸ Tích hợp**.
2. Đọc **Trước khi dùng tệp Drive với AI**, tắt huấn luyện mô hình trong các tài khoản AI bạn dùng với tệp Drive, rồi đánh dấu mục đó.
   - Claude: trong **Cài đặt ▸ Quyền riêng tư** của Claude, tắt huấn luyện mô hình.
   - ChatGPT và Codex: trong **Cài đặt ▸ Kiểm soát dữ liệu** của ChatGPT, tắt **Improve the model for everyone**.
   - Nhà cung cấp dùng khóa API mặc định không dùng dữ liệu API để huấn luyện.
   - Kết nối AI miễn phí (mô hình miễn phí của OpenRouter, Gemini) không bao giờ được nhận tệp Drive.
3. Nhấp **Kết nối Google Drive**. Trang đăng nhập của Google mở trong trình duyệt. Hãy đăng nhập và cho phép truy cập.
4. Quay lại GenOffice. Thẻ sẽ hiển thị tài khoản đã kết nối.

Google không cho phép gửi tệp Drive đến dịch vụ AI dùng chúng để huấn luyện mô hình, nên bạn không thể kết nối hay chọn tệp cho đến khi đánh dấu mục này.

Thông tin đăng nhập được lưu trên máy tính này bằng cơ chế mã hóa mà hệ điều hành cung cấp cho tài khoản người dùng của bạn (cơ chế bảo vệ của Windows, Chuỗi khóa của macOS hoặc keyring của môi trường desktop trên Linux). Nếu máy tính này không mã hóa được, kết nối chỉ kéo dài đến khi bạn đóng ứng dụng.

## Mở tệp trên Drive

- Nhấp **Google Drive** trên thanh bên của Trang chủ, rồi nhấp **Chọn từ Google Drive**.
- Cửa sổ chọn tệp của Google mở trong trình duyệt. Chọn các tệp cần mở (có thể chọn nhiều tệp cùng lúc); GenOffice quay lại và mở chúng trong trình soạn thảo tương ứng.
- Tệp đã chọn một lần sẽ ở lại trong danh sách **Tệp bạn đã chọn**. Bạn có thể mở lại từ đó, hoặc tìm theo tên và nội dung.
- Định dạng mà GenOffice không mở được sẽ hiển thị mờ. Google Tài liệu, Trang tính và Trang trình bày được mở dưới dạng tệp Word, Excel và PowerPoint.

## Lưu trở lại Drive

- Lưu như bình thường. Một lát sau tệp được tải lên Drive.
- Nếu ai đó đã thay đổi tệp trên Drive sau khi bạn mở, bạn sẽ được hỏi nên ghi đè tệp trên Drive, lưu bản sao vào Drive, hay chỉ giữ thay đổi trên máy tính này.
- Tệp bạn chỉ được xem sẽ được lưu vào Drive dưới dạng bản sao, hoặc giữ trên máy tính này.
- Tài liệu Google được giữ nguyên. Thay đổi của bạn được lưu thành tệp Office trong cùng thư mục, hoặc trong Drive của tôi nếu không ghi được vào thư mục đó.
- Nếu tải lên không thành công, thay đổi vẫn ở trên máy tính này và GenOffice sẽ thử lại, kể cả lần khởi động ứng dụng tiếp theo.

## AI và Drive

- Trong bảng AI của trình soạn thảo Word, Excel, PowerPoint, HTML, sơ đồ tư duy và Hangul, nhấp **Đính kèm từ Google Drive** cạnh nút đính kèm để chọn tệp trong cửa sổ của Google trên trình duyệt và đính kèm như tệp trên máy tính này. Tối đa 20 tệp mỗi lần.
- Khi **Cho AI tìm và đọc tệp trong Drive** đang bật (bật khi bạn kết nối), AI trong mọi trình soạn thảo có thể tìm kiếm và đọc các tệp Drive bạn đã chọn trong GenOffice. Ví dụ: "Tìm biên bản cuộc họp tháng trước trong Drive của tôi và tóm tắt giúp tôi." Nếu không tìm thấy tệp, hãy chọn tệp đó ở Trang chủ trước.
- Nội dung AI đọc được gửi đến nhà cung cấp AI bạn đang dùng. Những phần đã ẩn khỏi AI vẫn được ẩn.
- Khi AI đang dùng là kết nối miễn phí, việc đính kèm từ Drive và việc AI đọc Drive sẽ không chạy.
- AI không thể sửa, xóa hay chia sẻ tệp trên Drive.
- Khi một cuộc trò chuyện có nội dung đọc từ Drive, cuộc trò chuyện đó ngừng dùng tìm kiếm web, tìm kiếm hình ảnh, đọc trang qua địa chỉ web và chèn hình qua địa chỉ web. Hãy bắt đầu cuộc trò chuyện mới để dùng lại.

## Ngắt kết nối

Nhấp **Ngắt kết nối** trong **Cài đặt ▸ Tích hợp**. GenOffice xóa thông tin đăng nhập khỏi máy tính này và yêu cầu Google thu hồi quyền truy cập. Các bản sao tệp đã có trên máy tính này vẫn được giữ lại. Bạn cũng có thể xóa quyền truy cập bất cứ lúc nào trong **Kết nối với bên thứ ba** của Tài khoản Google.
