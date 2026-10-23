# Trình chỉnh sửa bản vẽ

Trình chỉnh sửa bản vẽ mở các bản vẽ Excalidraw trong một thẻ riêng và lưu lại vào chính tệp đó.

- **Mở được gì**: ghi chú bản vẽ tạo bằng plugin Excalidraw của Obsidian (`.excalidraw.md`, hoặc tệp `.md` có `excalidraw-plugin` trong front matter) và tệp `.excalidraw` từ ứng dụng web Excalidraw.
- **Bản vẽ mới**: thẻ **Bản vẽ Excalidraw** ở Trang chủ, hoặc **Tệp ▸ Mới**. Bản vẽ mới là một ghi chú bản vẽ Obsidian (`.excalidraw.md`), và bạn đặt tên cho nó ở lần lưu đầu tiên.
- **Vẽ**: hình khối, mũi tên, đường thẳng, nét vẽ tự do và chữ, bằng thanh công cụ và phím tắt của chính khung vẽ. ctrl+Z để hoàn tác.
- **Lưu**: ctrl+S. Tệp được lưu theo đúng định dạng lúc mở. Tự động lưu ghi mỗi 30 giây và khi cửa sổ mất tiêu điểm, nhưng bỏ qua bản vẽ chưa có tên tệp. Bản vẽ bạn chỉ mở ra xem được lưu nguyên từng byte như cũ.

## Ghi chú bản vẽ Obsidian

- Khi lưu, chỉ danh sách chữ và dữ liệu bản vẽ của ghi chú được viết lại. Front matter, phần chữ bạn viết trong ghi chú và các liên kết vẫn giữ nguyên, nên ghi chú mở ra trong Obsidian vẫn như cũ.
- Hình ảnh mà ghi chú trỏ tới (`[[hinh.png]]` dưới Embedded Files) được hiển thị khi nằm trong kho của ghi chú: thư mục gần nhất phía trên ghi chú có chứa thư mục `.obsidian`, nếu không có thì là thư mục của chính ghi chú. Hình lớn hơn 20 MB, nằm trong thư mục ẩn hoặc nằm ngoài kho sẽ không được hiển thị.
- Hiện chưa thể thêm hình mới vào ghi chú. Công cụ hình ảnh đã tắt và việc kéo thả tệp vào khung vẽ bị chặn, vì hình chỉ được lưu bên trong ghi chú có thể không hiện trong Obsidian.

## Những gì chưa làm được

- Không có bảng AI. AI không thể đọc hay sửa bản vẽ.
- Chưa xuất được sang PNG hay SVG.
- Trình chỉnh sửa không kết nối mạng. Phông chữ có sẵn trong ứng dụng, còn thư viện dùng chung, cộng tác trực tiếp và nhúng nội dung web đều tắt. Liên kết trong bản vẽ chỉ mở trong trình duyệt khi đó là địa chỉ web hoặc địa chỉ thư.

## Mở bản vẽ từ Trình khám phá Tệp

Trình cài đặt thêm ứng dụng vào mục **Mở bằng** cho tệp `.excalidraw` nhưng không đặt nó làm chương trình mặc định. Ghi chú bản vẽ là tệp `.md`, nên nó mở được ở bất cứ chỗ nào ứng dụng mở được tệp Markdown, và sẽ vào trình chỉnh sửa bản vẽ thay vì trình chỉnh sửa Markdown.
