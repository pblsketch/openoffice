# Dự án

Một dự án là một thư mục trên máy tính của bạn. Chọn dự án trong bảng AI, AI sẽ làm việc khi đã biết các tệp, chỉ dẫn, ghi nhớ và cuộc trò chuyện của thư mục đó. Hãy để tài liệu của cùng một việc trong một thư mục: cuộc trò chuyện bắt đầu ở Docs có thể tiếp tục ở Hangul hay Slides mà bạn không phải giải thích lại bối cảnh trong từng tài liệu.

## Chọn dự án

- Trong bảng AI của mọi trình soạn thảo và trong **Ask AI** ở Trang chủ, tên dự án hiện tại nằm bên trái, ngay dưới ô nhập. Khi chưa chọn gì, nó hiện **Không dùng dự án**.
- Nhấp vào tên đó để mở danh sách: các dự án **Đã ghim** và **Gần đây**, **Dự án mới**, **Thêm thư mục** và **Không dùng dự án**. Gõ vào ô trên cùng để tìm; khi không có dự án nào khớp, bạn có thể tạo ngay một dự án mới mang tên đó.
- Rê chuột lên một hàng để thấy nút ghim, **Mở thư mục** và **Xóa khỏi danh sách**. Xóa một dự án khỏi danh sách không động gì đến thư mục và các tệp bên trong.
- Dự án có thư mục đã bị di chuyển hoặc xóa sẽ hiện mờ với dòng **Không tìm thấy thư mục**. Nhấp vào đó rồi chọn thư mục đã chuyển đi để tiếp tục với chính dự án ấy.
- Khi mở một tài liệu nằm trong thư mục dự án, dự án đó đã được chọn sẵn. Nếu bạn chuyển tài liệu đó sang **Không dùng dự án**, lần mở sau nó vẫn giữ như vậy. Dự án bạn chọn cho một tài liệu nằm ngoài thư mục cũng được ghi nhớ cho tài liệu đó.
- Dự án đã chọn có hiệu lực từ yêu cầu tiếp theo của bảng đó. Đổi dự án giữa chừng sẽ mở một cuộc trò chuyện mới; cuộc trò chuyện đang dở vẫn nằm nguyên chỗ cũ.

## Dự án mới và Thêm thư mục

- **Dự án mới**: gõ tên, một thư mục mang tên đó sẽ được tạo trong thư mục lưu mặc định của bạn (ban đầu là `Tài liệu\GenOffice`; có thể đổi trong Cài đặt). **Tạo ở nơi khác…** cho phép chọn một vị trí khác. Nếu đã có thư mục trùng tên, ứng dụng sẽ hỏi bạn có muốn dùng thư mục đó làm dự án không, và **Dùng thư mục này** sẽ bắt đầu với thư mục đó. Nếu thư mục đó đã là một dự án trong danh sách, dự án sẽ mở ngay mà không hỏi.
- **Thêm thư mục** (**Dùng thư mục có sẵn** trên màn hình Dự án của Trang chủ): dùng một thư mục bạn đã có. Các thư mục con cũng được tính vào. Không thể chọn cả một ổ đĩa, toàn bộ thư mục người dùng, hay thư mục chứa dữ liệu đăng nhập hoặc dữ liệu của ứng dụng.
- Khi bạn mở một tài liệu nằm trong một thư mục dự án chưa có trong danh sách, dòng "Tài liệu này nằm trong thư mục dự án '…'" sẽ hiện dưới ô nhập kèm nút **Dùng**. Nhấp vào nút này cũng giống như Thêm thư mục.
- Khi một thư mục nhận từ người khác đã có sẵn chỉ dẫn hoặc ghi nhớ, `AGENTS.md` hoặc `CLAUDE.md`, hay các cuộc trò chuyện viết trên máy khác, ứng dụng cho bạn xem một lần và hỏi. **Xem tất cả** cho bạn đọc hết trước. **Dùng cùng chỉ dẫn** sẽ dùng tất cả. **Dùng mà không theo chỉ dẫn** không gửi các chỉ dẫn và ghi nhớ đó cho AI, ẩn các cuộc trò chuyện từ máy khác và ngừng thêm ghi nhớ; việc đọc tệp vẫn hoạt động. Về sau bạn có thể đổi bằng **Dùng cả chỉ dẫn** trên trang của dự án. Nhấn **Hủy** hoặc đóng câu hỏi mà không chọn thì thư mục sẽ không được thêm.
- Sau đó ứng dụng không hỏi lại nữa. Nếu chỉ dẫn hoặc ghi nhớ bị thay đổi bên ngoài GenOffice, bảng AI sẽ hiện "Chỉ dẫn đã thay đổi" một lần, và **Xem** mở đúng phần đó trên trang của dự án.

## Chỉ dẫn và ghi nhớ

- **Chỉ dẫn** là các quy tắc của dự án này, chẳng hạn "Viết báo cáo dạng gạch đầu dòng, và không bao giờ viết tắt tên cơ quan". Hãy viết chúng trên trang của dự án ở Trang chủ rồi nhấn **Lưu**. Nếu ở cấp trên cùng của thư mục có `AGENTS.md` hoặc `CLAUDE.md`, các tệp này cũng được đọc, và bạn có thể tắt chúng trên trang của dự án.
- **Ghi nhớ** là những ghi chú AI viết trong lúc trò chuyện: sự thật, sở thích và quyết định sẽ có ích về sau, mỗi điều một dòng kèm ngày. Mỗi lần AI viết một ghi chú, bảng AI hiện "Đã ghi nhớ: …" kèm nút **Xóa**. Nếu ghi chú đó đã bị xóa, dòng đó hiện "Đã xóa ghi nhớ: …" và không có nút **Xóa**. AI không hỏi bạn trước.
- Khi ghi nhớ dài ra, bảng AI hiện "Ghi nhớ đang dài dần" kèm nút **Sắp xếp gọn**. Nhấn vào sẽ gộp các ghi chú trùng lặp hoặc đã cũ. Bản trước đó vẫn được giữ lại, và **Hoàn tác** sẽ khôi phục nó. Việc sắp xếp chỉ diễn ra khi bạn nhấn nút, và dùng một yêu cầu AI.
- Trên trang của dự án, bạn có thể xóa ghi chú, sửa toàn bộ ghi nhớ và tắt ghi nhớ. Khi tắt, không có gì mới được ghi thêm, còn ghi nhớ hiện có vẫn được đọc.
- Chỉ dẫn quá dài sẽ bị mất phần cuối, và bảng AI sẽ báo cho bạn biết. Ghi nhớ thì luôn được gửi đầy đủ, dù dài đến đâu.

## Các tệp AI nhìn thấy

- Với mỗi yêu cầu, AI nhận được tên dự án, chỉ dẫn và ghi nhớ của dự án, cùng danh sách tên các tệp trong thư mục. Khi cần, AI tự đọc nội dung tệp theo cùng cách như với tệp đính kèm, nên những phần đã ẩn khỏi AI vẫn được giữ kín.
- AI không đọc các tài liệu đang mở còn thay đổi chưa lưu, các tệp ẩn có tên bắt đầu bằng dấu chấm, hay thư mục `.ieumoffice`.
- Để giữ một tệp khỏi tầm nhìn của AI, nhấn **Ẩn khỏi AI** trong phần Tệp trên trang của dự án. Bạn có thể hoàn tác việc này. Tệp đó vẫn hiện trong kết quả tìm kiếm ở Trang chủ.
- Trong các thư mục được đồng bộ bởi OneDrive, Google Drive và các dịch vụ tương tự, tệp chưa được tải về máy này sẽ hiện là "Không có trên máy này". Khi AI muốn đọc một tệp như vậy, ứng dụng sẽ hỏi bạn trước có tải về không.
- Gõ `@` trong ô nhập, mục "Tệp trong dự án này" sẽ hiện sau các tài liệu đang mở. Chọn một tệp là đính kèm tệp đó. Xem [Bảng điều khiển trợ lý AI](help://ai-panel).
- Tài liệu mới mà AI tạo trong một dự án được lưu vào thư mục của tài liệu hiện tại, hoặc ở cấp trên cùng của thư mục dự án khi bạn yêu cầu từ Trang chủ. Nếu tên đã có người dùng, `(2)` sẽ được thêm vào để không tệp nào bị thay thế.

## Cuộc trò chuyện

- Bảng AI đã chọn dự án sẽ hiện tiêu đề cuộc trò chuyện hiện tại ở phía trên. Nhấp vào đó để xem danh sách cuộc trò chuyện của dự án này, ô tìm kiếm và **Cuộc trò chuyện mới**. Bất kỳ cuộc trò chuyện nào trong danh sách cũng có thể được tiếp tục trong bất kỳ trình soạn thảo nào.
- Những việc đã làm ở trình soạn thảo khác hiện thành một dòng, chẳng hạn "Đã chạy 3 công cụ trong Hangul 'báo cáo.hwp'". AI chỉ dùng công cụ của trình soạn thảo bạn đang ở.
- Khi mở một tài liệu, cuộc trò chuyện được dùng gần nhất trong tài liệu đó sẽ hiện ra. Nếu hai cửa sổ cùng mở một cuộc trò chuyện, tin nhắn gửi ở cửa sổ này sẽ hiện ngay ở cửa sổ kia.
- Các cuộc trò chuyện viết trên máy khác được đánh dấu **Máy khác**.
- Bạn có thể đổi tên hoặc xóa cuộc trò chuyện trong danh sách. Cuộc trò chuyện đã xóa sẽ vào thùng rác.
- Các cuộc trò chuyện mà tài liệu đã có từ trước khi có tính năng này nằm ở cuối danh sách, dưới mục **Cuộc trò chuyện trước đây trong tài liệu này**.
- Cuộc trò chuyện với **Không dùng dự án** vẫn được lưu theo từng tài liệu như trước. Trong Ask AI ở Trang chủ khi không chọn dự án, cuộc trò chuyện kết thúc khi bạn đóng ứng dụng.

## Trang của dự án ở Trang chủ

**Dự án** trên thanh bên của Trang chủ là nơi bạn tạo **Dự án mới**, chọn **Dùng thư mục có sẵn** và mở một dự án để quản lý.

- **Phần đầu**: tên (đổi tên dự án không đổi tên thư mục), đường dẫn thư mục, **Mở trong File Explorer** (trên máy Mac là **Hiện trong Finder**) và trạng thái. Khi dự án đang dùng mà không theo chỉ dẫn, nút **Dùng cả chỉ dẫn** sẽ hiện ra.
- **Chỉ dẫn**: ô viết chỉ dẫn, cùng `AGENTS.md` và `CLAUDE.md` được đọc kèm.
- **Ghi nhớ**: danh sách ghi chú, **Sửa tất cả**, **Sắp xếp gọn**, bật hoặc tắt ghi nhớ.
- **Tệp**: các tệp AI nhìn thấy và những tệp được giữ khỏi AI. Nhấp vào tên tệp để mở tệp đó.
- **Cuộc trò chuyện**: các cuộc trò chuyện của dự án này. Nhấp vào một cuộc để mở tài liệu dùng nó gần nhất và tiếp tục trong bảng AI của tài liệu đó.
- Trang này đọc lại thư mục mỗi khi hiện ra, nên ghi nhớ AI vừa viết sẽ hiện ngay mà không cần rời trang. Nếu tệp chỉ dẫn hoặc ghi nhớ bị thay đổi bên ngoài GenOffice trong lúc bạn đang sửa, **Lưu** sẽ hỏi trước: **Tải lại** đọc tệp đã thay đổi, còn **Vẫn lưu** ghi đè tệp bằng nội dung bạn đã sửa.

## Những gì nằm lại trong thư mục, và điều cần biết

- Chỉ dẫn, ghi nhớ và cuộc trò chuyện được lưu dưới dạng tệp văn bản trong thư mục `.ieumoffice` bên trong thư mục dự án. Khi bạn di chuyển thư mục hoặc chép sang máy khác, chúng đi theo. Trên máy khác, chỉ cần chọn thư mục đó một lần bằng **Thêm thư mục** trong bảng AI hoặc **Dùng thư mục có sẵn** trên màn hình Dự án của Trang chủ.
- Thư mục `.ieumoffice` chỉ được tạo khi có gì đó cần ghi. Bạn có thể mở và sửa các tệp trong đó bằng Notepad.
- Những gì bạn gõ trong cuộc trò chuyện có thể được đưa vào ghi nhớ. Để giữ một điều nào đó lại, hãy xóa nó bằng **Xóa** trên dòng "Đã ghi nhớ", hoặc tắt ghi nhớ.
- Nếu bạn chọn một thư mục đồng bộ làm dự án, chỉ dẫn, ghi nhớ và cuộc trò chuyện của nó cũng được tải lên dịch vụ đó. Ứng dụng báo cho bạn một lần, vào lần đầu bạn chọn.
- Trong thư mục dùng chung của nhiều người, ghi nhớ và cuộc trò chuyện có thể bị lẫn vào nhau.
- Trong thư mục mà ứng dụng không ghi được, chẳng hạn thư mục chỉ đọc, chỉ dẫn và việc đọc tệp vẫn hoạt động nhưng cuộc trò chuyện và ghi nhớ không được lưu. Bảng AI sẽ báo cho bạn biết.
- Cửa sổ tác tử hiện chưa dùng dự án. Tác tử cũng có thể thay đổi các tệp trong `.ieumoffice` của thư mục, nên với thư mục chứa tài liệu bạn không rõ nguồn gốc, hãy dùng một trong các cách hỏi trước. Xem [Chế độ tác tử](help://agent-mode).
