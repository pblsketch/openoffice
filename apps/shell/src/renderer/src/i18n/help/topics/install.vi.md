# Cài đặt GenOffice

Mọi phiên bản đều được công bố trên [trang phát hành (Releases)](https://github.com/pblsketch/openoffice/releases/latest) của dự án trên GitHub. Bản dựng cho Windows được công bố cùng với bản dựng cho Mac và Linux, được phát hành dưới dạng beta. Nhà phát triển không thể trực tiếp thử bản Mac và Linux; chúng được xác nhận qua báo cáo của người dùng.

## Chọn tệp cho máy của bạn

| Nền tảng                               | Yêu cầu                                | Tệp                               |
| -------------------------------------- | -------------------------------------- | --------------------------------- |
| **Windows**                            | Windows 10 trở lên, Intel/AMD 64-bit   | `GenOffice-Setup-<version>.exe`   |
| **Mac (beta)**, Apple Silicon          | macOS 12 trở lên, chip M1 hoặc mới hơn | `GenOffice-<version>-arm64.dmg`   |
| **Mac (beta)**, Intel                  | macOS 12 trở lên, bộ xử lý Intel       | `GenOffice-<version>-x64.dmg`     |
| **Linux (beta)**, bản phân phối bất kỳ | 64-bit (x86_64)                        | `GenOffice-<version>.AppImage`    |
| **Linux (beta)**, họ Ubuntu/Debian     | 64-bit (x86_64)                        | `ieumoffice_<version>_amd64.deb`  |
| **Linux (beta)**, Fedora/RHEL/openSUSE | 64-bit (x86_64)                        | `ieumoffice-<version>.x86_64.rpm` |

Để biết máy Mac của bạn là loại nào, mở menu Apple ▸ **Giới thiệu về máy Mac này**. Nếu mục "Chip" ghi Apple M…, hãy lấy tệp có đuôi `-arm64.dmg`; nếu mục "Bộ xử lý" ghi Intel …, hãy lấy tệp có đuôi `-x64.dmg`. Các tệp khác trên trang phát hành (`.zip`, `.yml`, `.blockmap`) là những tệp mà chính ứng dụng dùng để cập nhật; bạn không cần tải chúng về. Các bản cũ hơn vẫn nằm trên trang phát hành.

## Trên Windows

1. Tải `GenOffice-Setup-<version>.exe` về từ trang phát hành.
2. Chạy tệp đó. Trình cài đặt chưa được ký mã, nên trước tiên Windows có thể hiện một cửa sổ màu xanh "Windows đã bảo vệ PC của bạn". Chọn **Thông tin thêm**, rồi chọn **Vẫn chạy**. Câu chữ cụ thể tùy vào phiên bản Windows của bạn.
3. Làm theo trình cài đặt cho đến hết.

Nó đưa GenOffice vào menu Start và đăng ký `.docx`, `.xlsx`, `.pptx`, `.pdf` cùng các định dạng tương tự, để nhấp đúp vào một tệp là mở được tệp đó.

Vì trình cài đặt chưa được ký, bạn chỉ nên chạy tệp đã tải về từ trang phát hành nói trên.

## Khi Windows chặn việc tải xuống hoặc cài đặt

### Edge báo tệp "isn't commonly downloaded"

Microsoft Defender SmartScreen cảnh báo như vậy với tệp mà nó chưa thấy nhiều người tải về. Hướng dẫn của Microsoft để giữ tệp như sau:

1. Mở danh sách tải xuống của Edge (**Ctrl+J**), nhấn **…** cạnh tệp rồi chọn **Keep**.
2. Trong cửa sổ hiện ra, nhấn **Show more**, rồi nhấn **Keep anyway**. Tệp sẽ được giữ trong thư mục Tải xuống của bạn.

Cửa sổ đó còn có một nút để báo cáo tệp là an toàn. Nút này chỉ mở trang báo cáo của Microsoft (`feedback.smartscreen.microsoft.com`) và không giữ tệp. Hãy đóng trang đó và nhấn **Show more** trong cửa sổ.

Nếu cửa sổ không có **Show more** hoặc không có **Keep anyway**:

- Trên PC do trường học hoặc công ty quản lý, quản trị viên có thể tắt khả năng bỏ qua các cảnh báo này (một chính sách của Edge). Khi đó không ai trên PC đó giữ được tệp; hãy nhờ quản trị viên cài đặt hoặc cho phép tệp.
- Tải từ trang phát hành bằng một trình duyệt khác cũng cho bạn đúng tệp đó.
- Nếu cả hai cách đều không được và đây là PC của riêng bạn, hướng dẫn khắc phục sự cố tải xuống của Microsoft cho phép tạm tắt Microsoft Defender SmartScreen như biện pháp cuối cùng. Trong Edge, mở **Cài đặt và hơn thế nữa (…) ▸ Cài đặt ▸ Quyền riêng tư, tìm kiếm và dịch vụ ▸ Bảo mật**, tắt **Microsoft Defender SmartScreen**, tải lại tệp, rồi bật lại ngay. Trong lúc nó tắt, Edge không cảnh báo bạn về lượt tải xuống nào, cũng không cảnh báo về các trang web nguy hiểm như trang lừa đảo.

### Cửa sổ "Windows đã bảo vệ PC của bạn" xuất hiện

Microsoft Defender SmartScreen hiện cửa sổ này lần đầu tiên nó thấy một trình cài đặt chưa được ký. Nhấn **Thông tin thêm** rồi nút **Vẫn chạy** sẽ xuất hiện. Trên PC do trường học hoặc công ty quản lý, một thiết lập của quản trị viên có thể ẩn nút đó; hãy hỏi quản trị viên.

### Smart App Control chặn

Khi Smart App Control của Windows 11 đang bật, nó chặn các trình cài đặt chưa ký và không có đường **Thông tin thêm**. Microsoft cho biết không có cách nào cho phép riêng một ứng dụng: lựa chọn duy nhất là tắt Smart App Control, tại **Windows Security ▸ App & browser control ▸ Smart App Control settings**. Việc đó cũng gỡ sự bảo vệ này khỏi mọi ứng dụng khác. Với các bản cập nhật Windows gần đây, có thể bật lại tính năng này mà không cần cài lại Windows.

## Trên Mac (beta)

Bạn cần macOS 12 (Monterey) trở lên. Bản Mac không có chữ ký nhà phát triển của Apple, nên lần đầu mở, macOS báo rằng không thể xác minh ứng dụng không chứa phần mềm độc hại và không mở nó. Bạn cho phép một lần, như dưới đây.

1. Mở tệp dmg và kéo `GenOffice.app` vào thư mục **Ứng dụng**.
2. Mở GenOffice từ thư mục Ứng dụng. Khi cảnh báo xuất hiện, nhấn **Xong**.
3. Mở **Cài đặt hệ thống ▸ Quyền riêng tư & Bảo mật**. Gần cuối trang, cạnh dòng cho biết GenOffice đã bị chặn, nhấn **Vẫn mở** rồi nhập mật khẩu Mac của bạn. Nút này hiện trong khoảng một giờ sau khi bạn thử mở ứng dụng.
4. Trong cửa sổ hiện ra lần nữa, nhấn **Mở**. Từ đó trở đi ứng dụng mở mà không có cảnh báo.

Trên macOS 12, vị trí đó là **Tùy chọn hệ thống ▸ Bảo mật & Quyền riêng tư ▸ Cài đặt chung**, và nút ở đó là **Vẫn mở**.

Nếu macOS báo ứng dụng "is damaged and can't be opened", đừng chuyển nó vào Thùng rác. Hãy chạy dòng dưới đây trong Terminal, rồi mở lại ứng dụng và cho phép như trên. Lệnh này gỡ dấu mà macOS gắn vào các tệp tải từ internet.

```sh
xattr -dr com.apple.quarantine /Applications/GenOffice.app
```

Nếu macOS báo ứng dụng không được hỗ trợ trên máy Mac này, hãy kiểm tra hai điều:

- Máy Mac Intel không chạy được tệp dành cho Apple Silicon (`-arm64.dmg`). Hãy xem mục "Bộ xử lý" trong **Giới thiệu về máy Mac này**, xóa ứng dụng đã cài và cài tệp `-x64.dmg` thay vào.
- macOS 11 trở về trước không chạy được GenOffice. **Giới thiệu về máy Mac này** cũng cho biết phiên bản macOS.

Ngoài ra trên Mac:

- Các thẻ kết nối AI không có nút cài đặt. Hãy theo liên kết hướng dẫn cài đặt chính thức trên thẻ để cài Claude Code hoặc Codex. Ứng dụng Claude cho máy tính không phải là Claude Code, nên vẫn phải cài Claude Code riêng dù đã có ứng dụng máy tính.
- Việc đăng nhập hoàn tất trong trình duyệt. Nếu trình duyệt yêu cầu bạn dán một mã, hãy tự chạy `claude auth login` hoặc `codex login` trong Terminal. Xem [Kết nối gói đăng ký](help://subscription).

## Trên Linux (beta)

- **AppImage**: cho tệp quyền thực thi (`chmod +x GenOffice-<version>.AppImage`) rồi chạy tệp đó. Không có bước cài đặt.
- **deb**: cài bằng `sudo apt install ./ieumoffice_<version>_amd64.deb`.
- **rpm**: cài bằng `sudo dnf install ./ieumoffice-<version>.x86_64.rpm`. Trên openSUSE, dùng `sudo zypper install ./ieumoffice-<version>.x86_64.rpm`.

Gói deb và rpm cài vào `/opt/GenOffice` và liên kết lệnh terminal `/usr/bin/ieumoffice`. Giống như trên Mac, các thẻ kết nối AI không có nút cài đặt, và khi việc đăng nhập yêu cầu một mã, bạn tự chạy `claude auth login` hoặc `codex login` trong terminal.

## Cập nhật

- GenOffice tìm phiên bản mới hơn trên chính trang phát hành đó của GitHub. Khi có bản mới được công bố, **Cài đặt ▸ Giới thiệu** sẽ đề nghị cập nhật: nhấn **Cập nhật lên …**, chờ tải xong, rồi nhấn **Khởi động lại và cài đặt**. Trên Windows, một cửa sổ hiển thị tiến trình cài đặt; khi xong, GenOffice mở lại cùng các tài liệu bạn đang mở. Trên Mac, ứng dụng sẽ đóng, được thay bằng phiên bản mới rồi mở lại cùng các tài liệu bạn đang mở. Điều này áp dụng cho ứng dụng trong thư mục Ứng dụng; ứng dụng mở trực tiếp từ ảnh đĩa sẽ chỉ bạn tới trang tải xuống. Bản cập nhật chỉ được cài khi bạn nhấn nút đó, không phải khi bạn chỉ đóng ứng dụng.
- Trên Linux, chỉ AppImage tự cập nhật. Với bản cài deb hoặc rpm, ứng dụng báo cho bạn về phiên bản mới và mở trang tải xuống; hãy cài tệp mới theo cách tương tự.
- **Menu (☰) ▸ Kiểm tra bản cập nhật** sẽ kiểm tra bất cứ khi nào bạn yêu cầu. Trên Mac là **Trợ giúp ▸ Kiểm tra bản cập nhật**.
- Khi việc kiểm tra thất bại — không có mạng, hoặc chưa có bản nào được công bố — thì không có gì xảy ra, và ứng dụng vẫn hoạt động như trước.
- **Kênh cập nhật**, cũng nằm trong Cài đặt ▸ Giới thiệu, là Ổn định hoặc Beta. Đổi kênh sẽ có hiệu lực ngay và kiểm tra bản cập nhật; nó sẽ không hạ bản cài đặt Beta về lại Ổn định.
- Các bản cập nhật cũng chưa được ký mã. Trước khi cài một bản, ứng dụng đối chiếu tệp đã tải về với mã kiểm tra (checksum) được công bố cùng bản phát hành đó.
- Nếu bấm **Khởi động lại và cài đặt** mà ứng dụng đóng lại nhưng phiên bản mới không xuất hiện, lần mở tiếp theo ứng dụng sẽ báo điều đó và đề nghị cập nhật lại. Lần này trình cài đặt mở trong cửa sổ riêng, nên bạn theo dõi được và trả lời yêu cầu quyền quản trị viên. Nếu vẫn không được, cửa sổ cập nhật sẽ chỉ đến trang tải xuống; cài bằng tệp tải từ đó vẫn giữ nguyên cài đặt và tài liệu của bạn. Quá trình cập nhật được ghi vào `update-log.txt` trong thư mục dữ liệu của ứng dụng (gõ `%APPDATA%\GenOffice` vào thanh địa chỉ của File Explorer để mở). Hãy đính kèm tệp này khi báo lỗi.

## Bản dựng bạn đang chạy

**Cài đặt ▸ Giới thiệu** là nơi ứng dụng báo bạn đang có phiên bản nào, đang theo kênh nào và dự án nằm ở đâu. Ở đó cũng ghi tên dự án nguồn mở mà ứng dụng này dựa trên.

## Dòng lệnh đi kèm luôn

Mọi bản cài đặt đều kèm lệnh `ieumoffice` nói chuyện với đúng những engine mà cửa sổ dùng, nên cả hai không bao giờ bất đồng về một tệp. `ieumoffice install-cli` đưa nó vào `PATH` của bạn. Xem [Dòng lệnh và tác nhân](help://cli) để biết nó làm được gì.
