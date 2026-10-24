# Kết nối gói đăng ký

GenOffice chạy AI bằng gói đăng ký mà bạn đã có: gói đăng ký Claude (Anthropic) hoặc gói đăng ký Codex (OpenAI). Codex là chương trình của OpenAI, và bạn đăng nhập vào đó bằng tài khoản gói ChatGPT của mình. Bạn không cần khóa API, và GenOffice cũng không có tài khoản riêng nào để đăng ký.

## Cách hoạt động

- AI không được tích hợp sẵn trong GenOffice. Trên máy tính này có cài một chương trình của công ty đó — **Claude Code** cho gói đăng ký Claude, **Codex** cho gói đăng ký ChatGPT — và GenOffice nhờ chương trình đó trả lời.
- Chương trình đó được đăng nhập bằng chính tài khoản của bạn, nên mọi yêu cầu đều được tính vào gói của bạn.
- GenOffice không bao giờ hiển thị biểu mẫu đăng nhập riêng, cũng không bao giờ đọc hay lưu thông tin đăng nhập của bạn. Bạn đăng nhập ngay trong chương trình và trang web của chính công ty đó.

## Trước khi bắt đầu

Bạn cần một trong hai thứ sau. Có cả hai cũng được.

- Gói đăng ký Claude (gói Pro hoặc Max; tài khoản Claude miễn phí không kết nối được), cùng chương trình Claude Code đã được cài đặt và đăng nhập trên máy tính này.
- Gói đăng ký ChatGPT, cùng chương trình Codex đã được cài đặt và đăng nhập trên máy tính này.

Nếu chương trình chưa được cài đặt hoặc chưa đăng nhập, các nút ở phần tiếp theo sẽ lo việc đó.

## Kết nối

1. Mở **Cài đặt** từ hàng ở góc dưới bên trái của Trang chủ rồi chọn **AI**. Dưới **Kết nối gói đăng ký** có một thẻ cho Claude và một thẻ cho Codex.
2. Đọc trạng thái ghi trên thẻ rồi nhấn nút của thẻ. Bảng bên dưới giải thích từng trạng thái.
3. Quay lại cửa sổ GenOffice. Thẻ sẽ tự kiểm tra lại, còn **Kiểm tra lại** thì kiểm tra ngay lập tức.

Ở bước thứ hai của màn hình chào mừng khi khởi chạy lần đầu, và trong bảng AI khi chưa có AI nào được kết nối, trước tiên bạn sẽ được hỏi "Bạn đang dùng AI nào?". Chọn gói đăng ký Claude trả phí, ChatGPT hoặc chưa có cái nào, bạn sẽ chỉ thấy các bước của lựa chọn đó (Cài đặt chương trình → Đăng nhập → Đã kết nối) cùng một thẻ của nó. **Chọn cách khác** cho phép bạn chọn lại, và bạn có thể bỏ qua tất cả để kết nối sau. Nếu vẫn không kết nối được, hãy nhấn **Sao chép thông tin để nhờ hỗ trợ** rồi gửi nội dung đã sao chép cho người đang giúp bạn. Nội dung này không chứa tài khoản hay đường dẫn tệp.

| Thẻ hiển thị                                       | Ý nghĩa                                                                                                                     | Việc cần làm                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Đang kiểm tra…**                                 | GenOffice đang hỏi chương trình về trạng thái của nó.                                                                       | Chờ một chút.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| **Chưa cài đặt**                                   | Không tìm thấy chương trình trên máy tính này.                                                                              | Nhấn **Cài đặt**. Lệnh cài đặt chính thức của công ty đó sẽ chạy trong một cửa sổ terminal mới, nên bạn có thể theo dõi nó làm gì. GenOffice không tự tải về bất cứ thứ gì. Nếu muốn tự cài bằng tay, **Hướng dẫn cài đặt chính thức** sẽ mở trang hướng dẫn của công ty đó.                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| **Chưa đăng nhập**                                 | Chương trình đã có nhưng chưa đăng nhập.                                                                                    | Nhấn **Đăng nhập**. Trang đăng nhập của công ty đó mở trong trình duyệt: đăng nhập ở đó và cho phép truy cập, thẻ sẽ tự kết nối. Cứ từ từ, việc đăng nhập có thể mất một lúc. Nếu trình duyệt hoàn toàn không mở, nhấn **Trình duyệt không mở?** trên thẻ (sau 25 giây, nút này đổi thành nút **Mở cửa sổ đăng nhập**). Đừng nhấn khi bạn vẫn đang đăng nhập trong trình duyệt: nút này sẽ dừng lần đăng nhập đó và bắt đầu lại từ đầu. Cửa sổ đăng nhập mở ra sẽ liệt kê những việc cần làm ở trên cùng. Để dán mã vào cửa sổ đó, nhấp chuột phải bên trong cửa sổ rồi nhấn Enter. Mã đã dán không hiện ra là bình thường; nếu thấy "Invalid code", hãy dán lại mã vào chính cửa sổ đó. Để dừng đăng nhập, nhấn **Hủy đăng nhập**. |
| **Đã kết nối**                                     | Đã xác nhận đăng nhập bằng gói đăng ký. Tên gói được hiển thị khi chương trình cho biết.                                    | Không cần làm gì. AI đã sẵn sàng.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| **Đã đăng nhập nhưng không phải bằng gói đăng ký** | Chương trình được đăng nhập bằng khóa API hoặc tài khoản trả phí theo mức sử dụng, hoặc không xác định được loại đăng nhập. | Xem "Đăng nhập tính phí theo mức sử dụng" bên dưới.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| **Không kiểm tra được kết nối**                    | Chính việc kiểm tra đã thất bại. Lý do được hiển thị trên thẻ.                                                              | Nhấn **Kiểm tra lại**. Nếu thẻ báo chương trình quá cũ, hãy nhấn **Cập nhật**: bản cập nhật chính thức của công ty sẽ chạy trong một cửa sổ mới. Khi cập nhật xong ở đó, hãy quay lại GenOffice.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |

Kết nối được kiểm tra khi ứng dụng khởi động, khi bạn mở Cài đặt, và khi bạn quay lại cửa sổ sau khi bắt đầu cài đặt hoặc đăng nhập.

## Không có gói đăng ký: AI miễn phí

Không có gói đăng ký Claude hay ChatGPT? Trong Cài đặt ▸ AI, mục **Dùng miễn phí** cho phép kết nối một AI miễn phí để thay thế. Chọn **Tôi chưa có cái nào** ở bước thứ hai của màn hình chào mừng sẽ hiện những thẻ này, và chọn nó trong bảng AI khi chưa có gì được kết nối sẽ đưa ra **Kết nối AI miễn phí**.

- **OpenRouter**: nhấn **Kết nối trong trình duyệt**. Trình duyệt sẽ mở OpenRouter; hãy đăng ký hoặc đăng nhập, rồi cho phép truy cập. Khi trình duyệt báo đã kết nối, hãy đóng tab đó và quay lại. Không cần sao chép khóa nào, và thẻ hiển thị số yêu cầu miễn phí còn lại trong hôm nay.
- **Google Gemini**: nhấn **Lấy khóa**, tạo một khóa trong Google AI Studio, dán vào thẻ rồi nhấn **Kết nối**. Chỉ dành cho người từ 18 tuổi trở lên. Khóa tạo trong một dự án Google đã bật thanh toán có thể bị tính phí.
- Sau khi kết nối, AI đó trở thành **AI sử dụng**. Nếu đã kết nối cả hai, **Dùng AI này** trên thẻ sẽ chuyển qua lại giữa chúng. **Ngắt kết nối** xóa khóa khỏi GenOffice.
- Mô hình miễn phí yếu hơn mô hình của gói đăng ký, và mỗi ngày chỉ cho phép một số yêu cầu nhất định. Một lần sửa tài liệu có thể tốn vài yêu cầu. Khi hết lượt của hôm nay, bảng AI sẽ báo cho bạn biết, kèm thời điểm có thể dùng lại.
- Trong lúc dùng miễn phí, nội dung bạn gửi có thể được dùng để cải thiện AI của công ty đó. Hãy cẩn thận với tài liệu chứa thông tin cá nhân.

## Đăng nhập tính phí theo mức sử dụng

Thẻ ghi **Đã đăng nhập nhưng không phải bằng gói đăng ký** có kèm một cảnh báo: "Đây không phải gói đăng ký: bạn bị tính phí theo mức sử dụng."

- GenOffice không dùng lần đăng nhập đó cho đến khi bạn nhấn **Vẫn sử dụng**. Từ đó trở đi, mọi yêu cầu đều được tính tiền vào tài khoản đó.
- Ngay cả khi ấy, nó cũng không bao giờ được chọn tự động. Bạn phải tự chọn trong **AI sử dụng**, nơi nó được đánh dấu **Trả phí**.
- Sự cho phép của bạn chỉ được ghi nhớ cho riêng chương trình đó. Nó sẽ bị xóa khi chương trình đăng xuất hoặc khi thông tin đăng nhập thay đổi.
- Nếu muốn dùng gói đăng ký, hãy đăng nhập chương trình bằng tài khoản có gói đăng ký rồi nhấn **Kiểm tra lại**.

## Đổi tài khoản hoặc đăng xuất

Khi chương trình đã đăng nhập, thẻ hiển thị tài khoản đang đăng nhập bên cạnh tên gói, nếu chương trình cho biết. Thẻ cũng có thêm hai nút.

- **Đăng nhập bằng tài khoản khác** khởi động lại quy trình đăng nhập của chính chương trình. Hãy hoàn tất trong cửa sổ mở ra, bằng tài khoản kia.
- **Đăng xuất** chạy lệnh đăng xuất của chính chương trình. Sau đó thẻ hiển thị **Chưa đăng nhập**.
- Cả hai đều áp dụng cho chương trình đó trên toàn bộ máy tính này, không chỉ riêng GenOffice. Nếu bạn cũng dùng Claude Code hoặc Codex trong terminal, ở đó chương trình cũng bị đăng xuất hoặc chuyển sang tài khoản kia. Vì vậy GenOffice hỏi bạn xác nhận trước.
- Tài khoản và hai nút này chỉ xuất hiện ở đây, trong Cài đặt ▸ AI. GenOffice chỉ hiển thị tài khoản và không lưu nó ở bất cứ đâu.

## AI nào được dùng

**AI sử dụng**, trong Cài đặt ▸ AI, ban đầu được đặt là **Tự động**. Tự động quyết định theo thứ tự sau:

1. Claude, khi thẻ của nó ghi "Đã kết nối".
2. Nếu không thì Codex, khi thẻ của nó ghi "Đã kết nối".
3. Nếu không nữa thì chưa có AI nào được kết nối, và bảng AI hiển thị hướng dẫn kết nối thay vì báo lỗi.

Tự động không bao giờ chọn thứ gì tốn thêm tiền: không chọn khóa API, cũng không chọn đăng nhập tính phí theo mức sử dụng. Những thứ đó chỉ được dùng trong lúc bạn tự chọn chúng.

Bạn cũng có thể tự chọn một AI, ngay tại chỗ đó hoặc trong danh sách mô hình ở cuối bảng AI. Nếu AI bạn chọn ngừng hoạt động, GenOffice không lặng lẽ chuyển sang AI khác. Nó cho bạn biết chuyện gì đã xảy ra và chỉ cách kết nối lại.

Danh sách mô hình hiển thị các mô hình do chính chương trình báo về: mỗi mô hình có tên kèm mã mô hình chính xác bên cạnh, và **Mô hình mặc định** ghi rõ mô hình mà nó đang trỏ tới. Nhãn lựa chọn ở cuối bảng AI và mục **AI sử dụng** cũng ghi tên mô hình đó. Việc đọc danh sách không hỏi AI điều gì nên không tính vào hạn mức gói của bạn. Nếu chương trình quá cũ để báo các mô hình, một danh sách ngắn có sẵn trong ứng dụng sẽ được hiển thị thay thế.

Ở bất cứ chỗ nào chọn được Codex đều có một dòng đi kèm: "Dùng gói đăng ký Codex bên trong một ứng dụng không phải là cách được OpenAI chính thức khuyến nghị." Hãy cân nhắc điều đó khi quyết định.

## Khi một yêu cầu bị dừng

Một yêu cầu sẽ dừng khi giới hạn của gói đã dùng hết, khi phiên đăng nhập đã hết hạn, hoặc khi chương trình không còn trên máy. GenOffice không tự chuyển sang AI khác.

- Lý do được hiển thị ngay tại chỗ câu trả lời dừng lại. Nếu là do dùng hết giới hạn, thời điểm giới hạn được đặt lại cũng được hiển thị khi chương trình cho biết.
- Nếu gói đăng ký còn lại của bạn đang được kết nối, một nút **Tiếp tục với …** sẽ xuất hiện, ví dụ **Tiếp tục với Codex**. Nhấn nút đó sẽ đặt gói ấy làm AI sử dụng — danh sách mô hình cũng hiển thị thay đổi này — rồi chạy lại yêu cầu.
- Nếu kết nối duy nhất còn lại là một lần đăng nhập tính phí theo mức sử dụng mà bạn đã cho phép, nút đó sẽ kèm một ghi chú về chi phí.
- Không bao giờ có nút nào chuyển bạn sang khóa API.

## Dòng mức sử dụng

Khi bạn đã dùng từ 80% một giới hạn trở lên, bảng AI hiển thị một dòng như "Đã dùng 85% · đặt lại lúc 15:00". Claude báo giới hạn 5 giờ và giới hạn 7 ngày, còn Codex cũng được hiển thị theo cách tương tự khi nó báo các giới hạn này. Dưới 80%, hoặc khi chương trình không báo gì, sẽ không có dòng nào hiện ra.

## Những gì được gửi đi, và gửi đến đâu

Lần đầu tiên có thể dùng một gói đăng ký, GenOffice hiển thị một thông báo đúng một lần. Để đọc lại, hãy vào Cài đặt ▸ AI ▸ **Thông báo khi kết nối lần đầu** rồi nhấn **Xem lại**. Thông báo nói ba điều:

- Nội dung tài liệu và cuộc trò chuyện được gửi đến Anthropic hoặc OpenAI bằng chính tài khoản của bạn.
- Nội dung đó có được dùng để huấn luyện AI hay không tùy thuộc vào cài đặt tài khoản của bạn tại công ty đó, chứ không phải do GenOffice quyết định.
- GenOffice tắt việc lưu lịch sử trò chuyện của Codex, nhưng Codex vẫn có thể lưu nhật ký chẩn đoán riêng trên máy tính này.

Bất cứ thứ gì bạn đã ẩn bằng **Ẩn vùng chọn khỏi AI** đều không được gửi đi, dù bạn dùng AI nào.

## Nên biết

- **Tốc độ.** Câu trả lời qua gói đăng ký bắt đầu chậm hơn vài giây so với qua khóa API, vì chương trình của công ty đó phải khởi động trước.
- **Gói ChatGPT miễn phí.** Gói này hiển thị là "Đã kết nối", nhưng giới hạn của nó nhỏ nên yêu cầu sẽ dừng sớm hơn. Dòng mức sử dụng không xuất hiện với gói này.
- **Tạo hình ảnh.** Trong phiên bản này, gói đăng ký không tạo được hình ảnh, dù là gói nào. Việc đó cần khóa của nhà cung cấp hình ảnh; xem [Mô hình AI và cài đặt](help://ai-models).
- **Proxy.** Claude Code và Codex không nhận cài đặt proxy từ GenOffice. Chúng dùng proxy được thiết lập cho máy tính này, chẳng hạn biến môi trường `HTTPS_PROXY`, giống hệt như khi bạn chạy chúng trong terminal. Nếu chúng không kết nối được trong terminal thì ở đây cũng không kết nối được.
- **Lệnh và các chương trình khác.** Một yêu cầu đến từ lệnh `ieumoffice` hoặc từ một tác nhân lập trình đã kết nối sẽ không dùng gói đăng ký của bạn trừ khi bạn cho phép. Xem [Kết nối tác nhân lập trình](help://mcp).
