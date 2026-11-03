# Sơ đồ: vẽ và chỉnh sửa tệp draw.io

Trình soạn thảo sơ đồ mở tệp draw.io trong một thẻ. Bạn có thể vẽ lưu đồ, sơ đồ kiến trúc và các loại sơ đồ khác, lưu lại đúng định dạng lúc mở, xuất thành ảnh hoặc PDF, và nhờ AI đọc, sửa hay vẽ sơ đồ. Trình soạn thảo chạy hoàn toàn trên máy tính của bạn.

## Mở sơ đồ

- Trình soạn thảo mở được các tệp `.drawio`, `.dio`, `.drawio.svg` và `.drawio.png`: từ hộp thoại mở tệp, bằng cách kéo tệp vào cửa sổ, từ danh sách tệp gần đây, cây thư mục, hoặc (với `.drawio` và `.dio`) danh sách Google Drive. Trên Windows, sau khi cài GenOffice, ứng dụng trở thành chương trình mở tệp `.drawio` và `.dio`.
- Tệp `.drawio.svg` hoặc `.drawio.png` chỉ mở được khi sơ đồ được lưu bên trong ảnh. Ảnh SVG hoặc PNG thông thường không được mở như một sơ đồ. Tệp bị hỏng cũng không mở được, và lý do sẽ được hiển thị.
- Tệp Visio (`.vsdx`) được nhập thành một sơ đồ mới chưa đặt tên. Lần lưu đầu tiên sẽ đề xuất một tệp `.drawio` trong thư mục chứa tệp Visio, còn bản thân tệp Visio không bị thay đổi. Nếu có ảnh nào bên trong không chuyển đổi được, trình soạn thảo sẽ cho biết bao nhiêu ảnh. Trên Windows, tệp `.vsdx` chỉ xuất hiện trong mục "Mở bằng".
- Một sơ đồ mới để trống bắt đầu từ ô **Sơ đồ** trên màn hình Trang chủ hoặc từ mục Mới trong menu Tệp.
- Nếu sơ đồ đã mở sẵn, thẻ của sơ đồ đó sẽ được đưa lên trước.

## Chỉnh sửa

- Màn hình chỉnh sửa chính là màn hình của draw.io: menu ở phía trên, các hình ở bên trái, bảng định dạng ở bên phải và các thẻ trang ở phía dưới.
- Lưu (Ctrl+S), Lưu dưới dạng (Ctrl+Shift+S) và In (Ctrl+P) do GenOffice xử lý. Chuyển thẻ và các phím tắt khác dùng chung cho cả ứng dụng vẫn hoạt động. Mọi phím tắt còn lại là của riêng trình soạn thảo, kể cả hoàn tác (Ctrl+Z).
- Mục **Trợ giúp** (F1) trong menu của trình soạn thảo sẽ mở trang này.
- Trình soạn thảo dùng ngôn ngữ giao diện của GenOffice. Khi bạn đổi ngôn ngữ, trình soạn thảo khởi động lại: thay đổi chưa lưu vẫn còn, nhưng lịch sử hoàn tác bị mất.
- Trình soạn thảo theo chủ đề của GenOffice. Ở chủ đề tối, hình vẽ cũng hiện bằng màu tối, nhưng tệp đã lưu, PNG, PDF và bản in vẫn giống hệt như ở chủ đề sáng.

## Lưu

- Lưu, Lưu dưới dạng, **Tự động lưu** trên dòng trạng thái và câu hỏi trước khi đóng hoạt động giống như ở các trình soạn thảo khác.
- Sơ đồ được lưu theo đúng định dạng lúc mở. Lưu dưới dạng cho chọn `.drawio`, `.dio`, `.drawio.svg` và `.drawio.png`. Sơ đồ mới được lưu lần đầu dưới dạng `.drawio`.
- Nếu không có gì thay đổi, tệp không được ghi lại. Các trang được nén sẵn trong tệp vẫn giữ dạng nén khi lưu.
- Ảnh của tệp `.drawio.png` hiển thị trang đầu tiên, còn toàn bộ sơ đồ được lưu bên trong ảnh đó.
- Trong lúc sơ đồ có thay đổi chưa lưu, một bản sao khôi phục được giữ trong thư mục dữ liệu của ứng dụng, nên công việc vẫn còn nếu ứng dụng bị tắt đột ngột.

## Xuất và in

- Chọn xuất PNG, SVG hoặc PDF trong menu Tệp (các mục xuất trong menu riêng của trình soạn thảo cũng mở cùng cửa sổ đó). Sau đó chọn **Tất cả các trang** (mặc định) hoặc **Chỉ trang hiện tại**.
- Khi chọn tất cả các trang, PNG và SVG tạo một tệp cho mỗi trang, đặt tên là `<tên>-p<số trang>`. PDF có một tờ cho mỗi trang, theo khổ giấy đã đặt trong sơ đồ.
- In (Ctrl+P) cũng in mỗi trang một tờ. Bản xuất và bản in luôn dùng màu sáng, dù đang dùng chủ đề nào.

## Bảng AI

- Nhờ AI vẽ lưu đồ, sơ đồ tuần tự hoặc sơ đồ tổ chức, giải thích sơ đồ, sắp xếp lại một trang cho gọn, hoặc thêm bước tiếp theo sau các hình bạn đã chọn.
- AI đọc sơ đồ dưới dạng chữ: danh sách trang, và với mỗi hình và đường nối thì có id, chữ, loại hình, vị trí và các kết nối, cùng với những hình bạn đang chọn. AI không nhìn sơ đồ dưới dạng hình ảnh.
- Thay đổi của AI hiện ra ngay. Mỗi thay đổi là một bước hoàn tác (Ctrl+Z), và danh sách "Hoàn tác một lượt của AI" trong bảng lấy lại trọn một lượt của AI. Nếu bất kỳ phần nào của một thay đổi bị từ chối, sơ đồ giữ nguyên như cũ.
- Với lưu đồ, sơ đồ tuần tự hoặc loại tương tự mới, AI viết bằng Mermaid và GenOffice chuyển nó thành các hình ngay trên máy tính của bạn. Cách bố trí có thể hơi khác so với kết quả từ trang web draw.io.
- Sơ đồ cũng có thể được đính kèm trong bảng AI của các trình soạn thảo khác, chọn bằng `@`, và tìm thấy qua tìm kiếm tệp ở màn hình Trang chủ. Các [lệnh trên terminal](help://cli) cũng đọc, sửa và tạo sơ đồ (`ieumoffice diagram read`, `ieumoffice diagram apply`, `ieumoffice create --type drawio`).

## Dùng internet

- Thẻ sơ đồ không gửi gì lên internet. Trình soạn thảo chạy từ các tệp được cài cùng GenOffice, và các tính năng lưu trữ đám mây, chia sẻ, plugin và AI riêng của nó đều bị tắt.
- Ảnh và phông chữ mà sơ đồ lấy từ internet sẽ không được tải; một ghi chú cho biết điều này khi tệp được mở. Liên kết web hoặc email gắn trên một hình chỉ mở trong trình duyệt mặc định khi bạn bấm vào.
- Bảng nháp, các thư viện hình bạn thêm và các màu dùng gần đây được giữ trên máy tính này, trong thư mục dữ liệu của ứng dụng. Bảng AI gửi chữ của sơ đồ tới AI bạn đã chọn, giống như ở các trình soạn thảo khác.

## Chưa hỗ trợ

- Chèn hoặc sửa PlantUML. Các hình PlantUML có trong tệp được hiển thị bằng ảnh đã lưu của chúng.
- Bố trí tự động dùng ELK, và đường nối tự đi vòng qua các hình. Những đường nối như vậy được vẽ thành đường nối thông thường.
- Các định dạng Visio cũ (`.vsd`, `.vss`) và lưu ngược lại thành `.vsdx`.
- Lưu trữ đám mây, chia sẻ, xuất bản, plugin và các tính năng AI riêng của trình soạn thảo.
- Ẩn các phần của sơ đồ khỏi AI.
