# Kết nối gói đăng ký

GenOffice chạy AI bằng gói đăng ký mà bạn đã có: gói đăng ký Claude (Anthropic) hoặc gói ChatGPT (OpenAI). ChatGPT được kết nối trực tiếp trong GenOffice; nếu bạn đã dùng chương trình Codex của OpenAI trên máy tính này, bạn cũng có thể kết nối qua Codex. Bạn không cần khóa API, và GenOffice cũng không có tài khoản riêng nào để đăng ký.

## Cách hoạt động

- AI không được tích hợp sẵn trong GenOffice. Claude đi qua chương trình **Claude Code** đã cài trên máy tính này: GenOffice nhờ chương trình đó trả lời, và chương trình đó được đăng nhập bằng chính tài khoản của bạn, nên mọi yêu cầu đều được tính vào gói của bạn.
- ChatGPT do chính GenOffice kết nối, không cần chương trình nào. Hãy đăng nhập trên trang đăng nhập ChatGPT của OpenAI mở ra trong trình duyệt, rồi cho phép ứng dụng này dùng gói ChatGPT của bạn. Yêu cầu đi thẳng từ máy tính này đến OpenAI, và mức sử dụng được tính vào gói ChatGPT đó.
- **Codex** là chương trình của OpenAI. Khi ChatGPT được kết nối qua Codex, GenOffice nhờ chương trình Codex trả lời, giống như với Claude Code.
- GenOffice không có biểu mẫu đăng nhập riêng bên trong ứng dụng. Bạn đăng nhập trong chương trình của chính công ty đó, hoặc trên trang web của công ty đó mở ra trong trình duyệt. GenOffice không bao giờ đọc hay lưu thông tin đăng nhập của Claude Code hoặc Codex. Thông tin đăng nhập duy nhất mà GenOffice giữ là thông tin OpenAI cấp cho ứng dụng này khi bạn kết nối ChatGPT trực tiếp, và nó chỉ nằm trên máy tính này (được mã hóa trên Windows). GenOffice không bao giờ thấy mật khẩu ChatGPT của bạn.

## Trước khi bắt đầu

Bạn cần một trong hai thứ sau. Có cả hai cũng được.

- Gói đăng ký Claude (gói Pro hoặc Max; tài khoản Claude miễn phí không kết nối được), cùng chương trình Claude Code đã được cài đặt và đăng nhập trên máy tính này.
- Một gói ChatGPT. Khi kết nối trực tiếp, không cần cài chương trình nào. Gói miễn phí chỉ cho dùng một ít. Nếu bạn đã dùng chương trình Codex trên máy tính này, bạn cũng có thể kết nối qua Codex.

Nếu Claude Code hoặc Codex chưa được cài đặt hoặc chưa đăng nhập, các nút ở phần tiếp theo sẽ lo việc đó.

## Kết nối

1. Mở **Cài đặt** từ hàng ở góc dưới bên trái của Trang chủ rồi chọn **AI**. Dưới **Kết nối gói đăng ký** có các thẻ cho Claude, ChatGPT và Codex, theo thứ tự đó. Nếu có gói ChatGPT, hãy kết nối trên thẻ ChatGPT. Thẻ Codex dành cho những ai dùng chương trình Codex trên máy tính này.
2. Đọc trạng thái ghi trên thẻ rồi nhấn nút của thẻ. Bảng bên dưới giải thích từng trạng thái.
3. Quay lại cửa sổ GenOffice. Thẻ sẽ tự kiểm tra lại, còn **Kiểm tra lại** thì kiểm tra ngay lập tức.

Ở bước thứ hai của màn hình chào mừng khi khởi chạy lần đầu, và trong bảng AI khi chưa có AI nào được kết nối, trước tiên bạn sẽ được hỏi "Bạn đang dùng AI nào?". Chọn gói đăng ký Claude trả phí, ChatGPT hoặc chưa có cái nào, bạn sẽ chỉ thấy các bước của lựa chọn đó cùng một thẻ của nó. Với Claude, các bước là Cài đặt chương trình → Đăng nhập → Đã kết nối; với ChatGPT là Đăng nhập → Đã kết nối. Ở lựa chọn ChatGPT, **Đã dùng chương trình Codex trên máy tính này? Kết nối bằng Codex** sẽ chuyển sang lựa chọn Codex (Cài đặt chương trình → Đăng nhập → Đã kết nối), còn **Kết nối trực tiếp trong ứng dụng, không cần Codex** ở lựa chọn đó sẽ đưa bạn trở lại kết nối trực tiếp. Nếu Codex đã được kết nối, lựa chọn Codex sẽ hiện ngay từ đầu. **Chọn cách khác** cho phép bạn chọn lại, và bạn có thể bỏ qua tất cả để kết nối sau. Nếu vẫn không kết nối được, hãy nhấn **Sao chép thông tin để nhờ hỗ trợ** rồi gửi nội dung đã sao chép cho người đang giúp bạn. Nội dung này không chứa tài khoản hay đường dẫn tệp.

| Thẻ hiển thị                                       | Ý nghĩa                                                                                                                     | Việc cần làm                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Đang kiểm tra…**                                 | GenOffice đang hỏi chương trình về trạng thái của nó.                                                                       | Chờ một chút.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| **Chưa cài đặt**                                   | Không tìm thấy chương trình trên máy tính này.                                                                              | Nhấn **Cài đặt**. Lệnh cài đặt chính thức của công ty đó sẽ chạy trong một cửa sổ terminal mới, nên bạn có thể theo dõi nó làm gì. GenOffice không tự tải về bất cứ thứ gì. Nếu muốn tự cài bằng tay, **Hướng dẫn cài đặt chính thức** sẽ mở trang hướng dẫn của công ty đó.                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| **Chưa đăng nhập**                                 | Chương trình đã có nhưng chưa đăng nhập.                                                                                    | Nhấn **Đăng nhập**. Trang đăng nhập của công ty đó mở trong trình duyệt: đăng nhập ở đó và cho phép truy cập, thẻ sẽ tự kết nối. Cứ từ từ, việc đăng nhập có thể mất một lúc. Nếu trình duyệt hoàn toàn không mở, nhấn **Trình duyệt không mở?** trên thẻ (sau 25 giây, nút này đổi thành nút **Mở cửa sổ đăng nhập**). Đừng nhấn khi bạn vẫn đang đăng nhập trong trình duyệt: nút này sẽ dừng lần đăng nhập đó và bắt đầu lại từ đầu. Cửa sổ đăng nhập mở ra sẽ liệt kê những việc cần làm ở trên cùng. Để dán mã vào cửa sổ đó, nhấp chuột phải bên trong cửa sổ rồi nhấn Enter. Mã đã dán không hiện ra là bình thường; nếu thấy "Invalid code", hãy dán lại mã vào chính cửa sổ đó. Để dừng đăng nhập, nhấn **Hủy đăng nhập**. |
| **Đã kết nối**                                     | Đã xác nhận đăng nhập bằng gói đăng ký. Tên gói được hiển thị khi chương trình cho biết.                                    | Không cần làm gì. AI đã sẵn sàng.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| **Đã đăng nhập nhưng không phải bằng gói đăng ký** | Chương trình được đăng nhập bằng khóa API hoặc tài khoản trả phí theo mức sử dụng, hoặc không xác định được loại đăng nhập. | Xem "Đăng nhập tính phí theo mức sử dụng" bên dưới.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| **Không kiểm tra được kết nối**                    | Chính việc kiểm tra đã thất bại. Lý do được hiển thị trên thẻ.                                                              | Nhấn **Kiểm tra lại**. Nếu thẻ báo chương trình quá cũ, hãy nhấn **Cập nhật**: bản cập nhật chính thức của công ty sẽ chạy trong một cửa sổ mới. Khi cập nhật xong ở đó, hãy quay lại GenOffice.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| **Đã tắt trong ứng dụng này**                      | Bạn đã tắt chương trình cho ứng dụng này trong cài đặt. Ứng dụng không kiểm tra nó và không gửi gì cho nó.                  | Nhấn **Dùng lại**. Ứng dụng kiểm tra lại chương trình rồi dùng nó.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |

Thẻ ChatGPT không đi qua chương trình nào, nên nó không bao giờ ghi **Chưa cài đặt** hay **Đã đăng nhập nhưng không phải bằng gói đăng ký**. Khi thẻ ghi **Chưa đăng nhập**, hãy nhấn **Tiếp tục với ChatGPT**: trang đăng nhập ChatGPT của OpenAI sẽ mở ra trong trình duyệt. Hãy đăng nhập và cho phép ứng dụng này dùng gói ChatGPT của bạn, thẻ sẽ tự chuyển sang **Đã kết nối**. Nếu bạn không cho phép, hoặc việc này không xong trong vòng 10 phút, thẻ sẽ báo quá trình đăng nhập chưa hoàn tất; nhấn lại nút để bắt đầu lại từ đầu. Không có cửa sổ đăng nhập và không có mã nào cần dán. Trong lúc đang đăng nhập, **Hủy đăng nhập** sẽ dừng quá trình đó.

Kết nối được kiểm tra khi ứng dụng khởi động, khi bạn mở Cài đặt, và khi bạn quay lại cửa sổ sau khi bắt đầu cài đặt hoặc đăng nhập.

Nếu thẻ Claude hoặc Codex cho biết quá trình đăng nhập chưa hoàn tất, hãy chọn **Mở cửa sổ đăng nhập**. Mã do trình duyệt hiện phải được dán vào cửa sổ đó; mã hiện trước đó không còn dùng được.

Nếu trang trình duyệt hoặc cửa sổ đăng nhập hiện `3p_delegated_access_policy_denied`, có thể một chính sách áp dụng cho tài khoản Claude đã chặn lần đăng nhập này. Nếu thử lại vẫn như vậy, hãy hỏi người quản lý tài khoản, hoặc thử xem tài khoản khác có đăng nhập được không.

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

Thẻ đã đăng nhập hiển thị tài khoản đang đăng nhập. Thẻ Claude và Codex còn hiển thị tên gói khi chương trình cho biết. Thẻ cũng có thêm hai nút.

- **Đăng nhập bằng tài khoản khác** khởi động lại quy trình đăng nhập của chính chương trình. Hãy hoàn tất trong cửa sổ mở ra, bằng tài khoản kia.
- **Đăng xuất** chạy lệnh đăng xuất của chính chương trình. Sau đó thẻ hiển thị **Chưa đăng nhập**.
- Trên thẻ Claude và Codex, cả hai đều áp dụng cho chương trình đó trên toàn bộ máy tính này, không chỉ riêng GenOffice. Nếu bạn cũng dùng Claude Code hoặc Codex trong terminal, ở đó chương trình cũng bị đăng xuất hoặc chuyển sang tài khoản kia. Vì vậy GenOffice hỏi bạn xác nhận trước.
- Thẻ Claude và Codex còn có **Không dùng trong ứng dụng này**. Chương trình và đăng nhập của nó giữ nguyên, chỉ GenOffice ngừng dùng nó: không kiểm tra trạng thái, không gửi yêu cầu, và **Tự động** cũng bỏ qua nó. Việc dùng nó trong terminal không bị ảnh hưởng. Khi đó thẻ hiện **Đã tắt trong ứng dụng này**, và **Dùng lại** bật nó trở lại. Cả hai đều không hỏi xác nhận vì bên ngoài GenOffice không có gì thay đổi.
- Thẻ ChatGPT thì khác. **Đăng xuất** sẽ hỏi bạn xác nhận bằng câu "Thao tác này ngắt kết nối ChatGPT khỏi ứng dụng này"; khi bạn xác nhận, GenOffice đề nghị OpenAI kết thúc kết nối của ứng dụng này và xóa thông tin đăng nhập đã lưu trên máy tính này. **Đăng nhập bằng tài khoản khác** mở ngay trang đăng nhập trong trình duyệt mà không hỏi lại. Cả hai đều không ảnh hưởng đến các chương trình khác trên máy tính này, kể cả Codex.
- Thẻ ChatGPT đã kết nối ghi "AI trong ứng dụng này chạy bằng gói ChatGPT của bạn" và có liên kết **Quản lý mức sử dụng**. Liên kết này mở trang mức sử dụng trong phần cài đặt ChatGPT của bạn, nơi bạn có thể xem ứng dụng này đã dùng bao nhiêu và đặt giới hạn riêng cho ứng dụng này.
- Tài khoản và hai nút này chỉ xuất hiện ở đây, trong Cài đặt ▸ AI. GenOffice chỉ hiển thị tài khoản và không lưu nó ở bất cứ đâu.

## AI nào được dùng

**AI sử dụng**, trong Cài đặt ▸ AI, ban đầu được đặt là **Tự động**. Tự động quyết định theo thứ tự sau:

1. Claude, khi thẻ của nó ghi "Đã kết nối".
2. Nếu không thì ChatGPT, khi thẻ của nó ghi "Đã kết nối".
3. Nếu không thì Codex, khi thẻ của nó ghi "Đã kết nối".
4. Nếu không nữa thì chưa có AI nào được kết nối, và bảng AI hiển thị hướng dẫn kết nối thay vì báo lỗi.

Tự động không bao giờ chọn thứ gì tốn thêm tiền: không chọn khóa API, cũng không chọn đăng nhập tính phí theo mức sử dụng. Những thứ đó chỉ được dùng trong lúc bạn tự chọn chúng.

Bạn cũng có thể tự chọn một AI, ngay tại chỗ đó hoặc trong danh sách mô hình ở cuối bảng AI. Nếu AI bạn chọn ngừng hoạt động, GenOffice không lặng lẽ chuyển sang AI khác. Nó cho bạn biết chuyện gì đã xảy ra và chỉ cách kết nối lại.

Danh sách mô hình hiển thị các mô hình do chính chương trình báo về (với ChatGPT là các mô hình mà OpenAI cho biết gói của bạn được dùng; mô hình đầu tiên trong số đó được dùng cho đến khi bạn tự chọn): mỗi mô hình có tên kèm mã mô hình chính xác bên cạnh, và **Mô hình mặc định** ghi rõ mô hình mà nó đang trỏ tới. Nhãn lựa chọn ở cuối bảng AI và mục **AI sử dụng** cũng ghi tên mô hình đó. Việc đọc danh sách không hỏi AI điều gì nên không tính vào hạn mức gói của bạn. Nếu chương trình quá cũ để báo các mô hình, một danh sách ngắn có sẵn trong ứng dụng sẽ được hiển thị thay thế.

Ở bất cứ chỗ nào chọn được Codex đều có một dòng đi kèm: "Dùng gói đăng ký Codex bên trong một ứng dụng không phải là cách được OpenAI chính thức khuyến nghị." Hãy cân nhắc điều đó khi quyết định.

## Khi một yêu cầu bị dừng

Một yêu cầu sẽ dừng khi giới hạn của gói đã dùng hết, khi phiên đăng nhập đã hết hạn, hoặc khi chương trình không còn trên máy. GenOffice không tự chuyển sang AI khác.

- Lý do được hiển thị ngay tại chỗ câu trả lời dừng lại. Nếu là do dùng hết giới hạn, thời điểm giới hạn được đặt lại cũng được hiển thị khi chương trình cho biết.
- ChatGPT kết nối trực tiếp sẽ dừng khi giới hạn của gói đã dùng hết, hoặc khi giới hạn bạn đặt cho ứng dụng này trong phần cài đặt ChatGPT đã dùng hết. Thời điểm đặt lại không được hiển thị. Nếu bạn đã ngắt kết nối ứng dụng này trong phần cài đặt ChatGPT, thẻ sẽ chuyển sang **Chưa đăng nhập**; hãy đăng nhập lại.
- Nếu gói đăng ký còn lại của bạn đang được kết nối, một nút **Tiếp tục với …** sẽ xuất hiện, ví dụ **Tiếp tục với ChatGPT** hoặc **Tiếp tục với Codex**. Nhấn nút đó sẽ đặt gói ấy làm AI sử dụng — danh sách mô hình cũng hiển thị thay đổi này — rồi chạy lại yêu cầu.
- Nếu kết nối duy nhất còn lại là một lần đăng nhập tính phí theo mức sử dụng mà bạn đã cho phép, nút đó sẽ kèm một ghi chú về chi phí.
- Không bao giờ có nút nào chuyển bạn sang khóa API.

## Dòng mức sử dụng

Khi bạn đã dùng từ 80% một giới hạn trở lên, bảng AI hiển thị một dòng như "Đã dùng 85% · đặt lại lúc 15:00". Claude báo giới hạn 5 giờ và giới hạn 7 ngày, còn Codex cũng được hiển thị theo cách tương tự khi nó báo các giới hạn này. Dưới 80%, hoặc khi chương trình không báo gì, sẽ không có dòng nào hiện ra. ChatGPT kết nối trực tiếp không hiển thị dòng này; hãy xem mức đã dùng qua **Quản lý mức sử dụng** trên thẻ ChatGPT.

## Những gì được gửi đi, và gửi đến đâu

Lần đầu tiên có thể dùng một gói đăng ký, GenOffice hiển thị một thông báo đúng một lần. Để đọc lại, hãy vào Cài đặt ▸ AI ▸ **Thông báo khi kết nối lần đầu** rồi nhấn **Xem lại**. Thông báo nói ba điều:

- Nội dung tài liệu và cuộc trò chuyện được gửi đến Anthropic hoặc OpenAI bằng chính tài khoản của bạn.
- Nội dung đó có được dùng để huấn luyện AI hay không tùy thuộc vào cài đặt tài khoản của bạn tại công ty đó, chứ không phải do GenOffice quyết định.
- GenOffice tắt việc lưu lịch sử trò chuyện của Codex, nhưng Codex vẫn có thể lưu nhật ký chẩn đoán riêng trên máy tính này.

Các yêu cầu qua ChatGPT kết nối trực tiếp không đi qua chương trình Codex; chúng đi thẳng từ máy tính này đến OpenAI.

Bất cứ thứ gì bạn đã ẩn bằng **Ẩn vùng chọn khỏi AI** đều không được gửi đi, dù bạn dùng AI nào.

## Nên biết

- **Tốc độ.** Câu trả lời qua Claude Code hoặc Codex bắt đầu chậm hơn vài giây so với qua khóa API, vì chương trình phải khởi động trước. ChatGPT kết nối trực tiếp không khởi động chương trình nào.
- **Gói ChatGPT miễn phí.** Gói này hiển thị là "Đã kết nối", nhưng giới hạn của nó nhỏ nên yêu cầu sẽ dừng sớm hơn. Dòng mức sử dụng không xuất hiện với gói này.
- **Tạo hình ảnh.** Trong phiên bản này, gói đăng ký không tạo được hình ảnh, dù là gói nào. Việc đó cần khóa của nhà cung cấp hình ảnh; xem [Mô hình AI và cài đặt](help://ai-models).
- **Proxy.** Claude Code và Codex không nhận cài đặt proxy từ GenOffice. Chúng dùng proxy được thiết lập cho máy tính này, chẳng hạn biến môi trường `HTTPS_PROXY`, giống hệt như khi bạn chạy chúng trong terminal. Nếu chúng không kết nối được trong terminal thì ở đây cũng không kết nối được.
- **Lệnh và các chương trình khác.** Một yêu cầu đến từ lệnh `ieumoffice` hoặc từ một tác nhân lập trình đã kết nối sẽ không dùng gói đăng ký của bạn trừ khi bạn cho phép. Ngay cả khi đó, nó dùng Claude Code hoặc Codex, không bao giờ dùng ChatGPT kết nối trực tiếp. Xem [Kết nối tác nhân lập trình](help://mcp).
- **Chế độ tác tử.** [Chế độ tác tử](help://agent-mode) chạy Claude Code hoặc Codex trên máy tính này. ChatGPT kết nối trực tiếp không thể chạy tác tử.
