# Cài đặt GenOffice

Mọi phiên bản đều được công bố trên [trang phát hành (Releases)](https://github.com/pblsketch/openoffice/releases/latest) của dự án trên GitHub. Phiên bản này được phát hành cho Windows.

## Chọn tệp cho máy của bạn

| Nền tảng    | Yêu cầu                              | Tệp                             |
| ----------- | ------------------------------------ | ------------------------------- |
| **Windows** | Windows 10 trở lên, Intel/AMD 64-bit | `GenOffice-Setup-<version>.exe` |

Các bản cũ hơn vẫn nằm trên trang phát hành.

## Trên Windows

1. Tải `GenOffice-Setup-<version>.exe` về từ trang phát hành.
2. Chạy tệp đó. Trình cài đặt chưa được ký mã, nên trước tiên Windows có thể hiện một cửa sổ màu xanh "Windows đã bảo vệ PC của bạn". Chọn **Thông tin thêm**, rồi chọn **Vẫn chạy**. Câu chữ cụ thể tùy vào phiên bản Windows của bạn.
3. Làm theo trình cài đặt cho đến hết.

Nó đưa GenOffice vào menu Start và đăng ký `.docx`, `.xlsx`, `.pptx`, `.pdf` cùng các định dạng tương tự, để nhấp đúp vào một tệp là mở được tệp đó.

Vì trình cài đặt chưa được ký, bạn chỉ nên chạy tệp đã tải về từ trang phát hành nói trên.

## Cập nhật

- GenOffice tìm phiên bản mới hơn trên chính trang phát hành đó của GitHub. Khi có bản mới được công bố, **Cài đặt ▸ Giới thiệu** sẽ đề nghị cập nhật: nhấn **Cập nhật lên …**, chờ tải xong, rồi nhấn **Khởi động lại và cài đặt**.
- **Menu (☰) ▸ Kiểm tra bản cập nhật** sẽ kiểm tra bất cứ khi nào bạn yêu cầu. Trên Mac là **Trợ giúp ▸ Kiểm tra bản cập nhật**.
- Khi việc kiểm tra thất bại — không có mạng, hoặc chưa có bản nào được công bố — thì không có gì xảy ra, và ứng dụng vẫn hoạt động như trước.
- **Kênh cập nhật**, cũng nằm trong Cài đặt ▸ Giới thiệu, là Ổn định hoặc Beta. Đổi kênh sẽ có hiệu lực ngay và kiểm tra bản cập nhật; nó sẽ không hạ bản cài đặt Beta về lại Ổn định.
- Các bản cập nhật cũng chưa được ký mã. Trước khi cài một bản, ứng dụng đối chiếu tệp đã tải về với mã kiểm tra (checksum) được công bố cùng bản phát hành đó.

## Bản dựng bạn đang chạy

**Cài đặt ▸ Giới thiệu** là nơi ứng dụng báo bạn đang có phiên bản nào, đang theo kênh nào và dự án nằm ở đâu. Ở đó cũng ghi tên dự án nguồn mở mà ứng dụng này dựa trên.

## Dòng lệnh đi kèm luôn

Mọi bản cài đặt đều kèm lệnh `ieumoffice` nói chuyện với đúng những engine mà cửa sổ dùng, nên cả hai không bao giờ bất đồng về một tệp. `ieumoffice install-cli` đưa nó vào `PATH` của bạn. Xem [Dòng lệnh và tác nhân](help://cli) để biết nó làm được gì.
