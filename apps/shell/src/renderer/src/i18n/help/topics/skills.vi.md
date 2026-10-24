# Kỹ năng

Kỹ năng là một bộ hướng dẫn làm việc dành cho AI. Hãy viết ra một lần những việc bạn làm đi làm lại — các bước sắp xếp ghi chú cuộc họp, giọng văn của một bản báo cáo, những điểm cần kiểm tra mỗi lần — rồi bạn có thể gọi nó trong bảng AI, hoặc AI sẽ tự dùng khi phù hợp. Một kỹ năng là một thư mục chứa tệp `SKILL.md` theo định dạng mở, nên kỹ năng tạo trong GenOffice cũng dùng được nguyên vẹn trong Claude Code hoặc Codex.

## Bật và tắt kỹ năng

**Cài đặt ▸ Kỹ năng** liệt kê các kỹ năng có trên máy tính này, được nhóm theo nguồn gốc. Mỗi kỹ năng hiển thị bằng tên, giống cách các tác tử lập trình hiển thị. Dùng ô tìm kiếm ở trên cùng để tìm theo tên hoặc mô tả.

| Nguồn                      | Nội dung                                                 | Ban đầu |
| -------------------------- | -------------------------------------------------------- | ------- |
| **Có sẵn**                 | 5 kỹ năng đi kèm GenOffice                               | Bật     |
| **Kỹ năng của tôi**        | Kỹ năng bạn đã thêm hoặc tự tạo (`~/.ieumoffice/skills`) | Bật     |
| **Thư mục kỹ năng Claude** | Các kỹ năng trong `~/.claude/skills`                     | Tắt     |
| **Phần bổ trợ Claude**     | Kỹ năng của các phần bổ trợ Claude đã cài                | Tắt     |
| **Thư mục kỹ năng Codex**  | Các kỹ năng trong `~/.agents/skills`                     | Tắt     |

- Công tắc dùng để bật hoặc tắt một kỹ năng. Cùng một cài đặt áp dụng cho bảng AI của mọi trình soạn thảo, Hỏi AI ở Trang chủ và cửa sổ tác tử.
- Với kỹ năng đang bật, hãy chọn **AI tự quyết định** hoặc **Chỉ khi được gọi**. Ban đầu là AI tự quyết định. Với Chỉ khi được gọi, kỹ năng chỉ được dùng khi chính bạn gọi nó.
- Các kỹ năng từ những nguồn khác nhau có thể trùng tên. Nhãn nguồn trên mỗi hàng giúp phân biệt chúng.
- Menu thêm có **Xem nội dung**, **Chỉnh sửa** (chỉ kỹ năng của tôi), **Xuất (zip)** (chỉ kỹ năng của tôi) và **Mở thư mục**.
- **Chuyển vào thùng rác** chuyển một kỹ năng của tôi vào thùng rác hệ thống, nơi bạn có thể khôi phục lại.
- Kỹ năng có sẵn không bị xóa mà được ẩn đi: hãy chọn **Ẩn**. **Hiện lại** ở cuối danh sách sẽ đưa nó trở lại như ban đầu.
- Để thay đổi một kỹ năng có sẵn hoặc kỹ năng từ chương trình khác, hãy chọn **Sao chép vào kỹ năng của tôi**. Bản sao xuất hiện trong kỹ năng của tôi và bản gốc bị tắt.
- Khi xuất một kỹ năng có mẫu, tài liệu mẫu cũng được đưa vào tệp zip. Hãy kiểm tra để chắc rằng tài liệu đó không chứa thông tin cá nhân trước khi xuất.

## Thêm kỹ năng

1. Trong **Cài đặt ▸ Kỹ năng**, nhấn **Thêm**.
2. Chọn **Từ thư mục**, **Từ tệp zip** hoặc **Từ liên kết GitHub**. Với GitHub, hãy nhập địa chỉ của một kho lưu trữ công khai hoặc `owner/repo` rồi nhấn **Tìm**.
3. Kiểm tra các kỹ năng tìm thấy trong bản xem trước. Bản xem trước cho biết số lượng và kích thước tệp, có tập lệnh hay không, các địa chỉ web trong nội dung và tệp giấy phép.
4. Chỉ đánh dấu những kỹ năng muốn cài rồi nhấn **Cài đặt**. Kỹ năng đã cài ở trạng thái bật ngay từ đầu.

Bên dưới bản xem trước luôn có dòng: "Chỉ cài kỹ năng từ nguồn bạn tin cậy. Kỹ năng đưa chỉ dẫn cho AI và có thể chạy tập lệnh trong cửa sổ tác tử." Hãy đọc kỹ một kỹ năng từ nguồn lạ trước khi cài.

- Nếu kỹ năng của tôi đã có một kỹ năng trùng tên, hãy chọn **Thay thế** hoặc **Bỏ qua** trên hàng đó.
- Khi tải xuống từ GitHub, GenOffice chỉ kết nối tới `github.com`, `api.github.com` và `codeload.github.com`, và không gửi bất kỳ dữ liệu đăng nhập nào. Nếu tệp nén quá lớn hoặc không qua được các bước kiểm tra an toàn, sẽ không có gì được cài.
- **Kỹ năng mới** mở một trình soạn thảo trống để bạn tự viết tên, mô tả và hướng dẫn.

## Kiểm tra cập nhật

- Với kỹ năng được cài từ GitHub, **Kiểm tra cập nhật** trong menu thêm sẽ tìm nội dung mới. GitHub chỉ được liên hệ khi bạn nhấn vào đó.
- Nếu không có gì thay đổi, sẽ hiện "Đã là bản mới nhất". Nếu có, hãy xem lại các tệp đã thay đổi và bản xem trước, rồi nhấn **Cập nhật**.
- Nếu bạn đã tự sửa kỹ năng sau khi cài, dòng "Những chỉnh sửa của bạn sẽ bị mất" cũng hiện ra.
- Việc cập nhật giữ nguyên trạng thái bật/tắt của kỹ năng và lựa chọn AI tự quyết định / Chỉ khi được gọi.

## Gọi kỹ năng trong bảng AI

1. Gõ `/` hoặc `$` ở đầu ô nhập AI hoặc ngay sau một dấu cách. Danh sách các kỹ năng đang bật sẽ hiện ra.
2. Gõ tiếp để thu hẹp danh sách. Ví dụ, `/meet` sẽ tìm ra `meeting-minutes`. Từ trong phần mô tả cũng dùng được, nên `/biên` cũng tìm ra kỹ năng này.
3. Chọn một kỹ năng bằng các phím mũi tên rồi nhấn Enter hoặc Tab. Kỹ năng đó trở thành một thẻ nhỏ phía trên ô nhập.
4. Viết điều bạn muốn rồi gửi. GenOffice sẽ thêm nội dung của kỹ năng vào yêu cầu.

- Trong bảng AI của Excel, `$` chỉ mở danh sách khi nằm ở ngay đầu ô nhập, để không cản trở các địa chỉ ô như `$A$1`.
- Bạn có thể thêm nhiều thẻ nhỏ và bỏ một thẻ bằng ×. Esc chỉ đóng danh sách; nó không dừng một lượt AI đang chạy.
- **Quản lý kỹ năng…** ở cuối danh sách sẽ mở **Cài đặt ▸ Kỹ năng**.
- Các thẻ nhỏ vẫn gắn với tin nhắn bạn đã gửi và trong cuộc trò chuyện đã lưu. Khi bạn mở lại cuộc trò chuyện và gửi tiếp, nội dung hiện tại của kỹ năng sẽ được đọc lại. Kỹ năng đã bị xóa hoặc tắt trong thời gian đó sẽ hiện "Không còn" trên thẻ của nó.
- Nếu phần nội dung kỹ năng gửi kèm quá dài, dòng "Các kỹ năng quá lớn để gửi kèm" sẽ hiện ra và không có gì được gửi.

## Kỹ năng AI tự dùng

- Với các kỹ năng đang bật và đặt là AI tự quyết định, tên và mô tả của chúng được đưa cho AI dưới dạng một danh sách. Khi có kỹ năng phù hợp với yêu cầu, AI lấy nội dung của kỹ năng đó và sử dụng.
- Khi AI dùng một kỹ năng, cuộc trò chuyện sẽ hiện "Đã dùng kỹ năng 〈tên〉".
- AI dựa vào mô tả để quyết định có dùng một kỹ năng hay không. Một mô tả nói rõ khi nào nên dùng kỹ năng sẽ giúp AI chọn đúng.

## Tạo kỹ năng bằng cách nhờ AI

1. Trong bảng AI, hãy nói chẳng hạn như "Lưu việc chúng ta vừa làm thành một kỹ năng" hoặc "Tạo một kỹ năng viết báo cáo theo phong cách của đơn vị mình".
2. AI chọn ra các bước và quy tắc đáng lặp lại rồi hiện một thẻ **Kỹ năng mới**. Những giá trị chỉ dùng cho lần này, như tên và ngày tháng, không được đưa vào hướng dẫn.
3. Kiểm tra và sửa tên, mô tả và hướng dẫn trên thẻ. Tên là thứ danh sách kỹ năng hiển thị và là thứ bạn gõ sau `/`: chữ cái tiếng Anh viết thường, chữ số và dấu gạch nối.
4. Nhấn **Lưu**. Kỹ năng mới được thêm vào kỹ năng của tôi ở trạng thái bật và xuất hiện ngay trong danh sách `/`.

- Không có tệp nào được ghi cho đến khi bạn nhấn **Lưu**. Nếu bạn nhấn **Hủy**, cuộc trò chuyện chỉ giữ lại nó dưới dạng "Đề xuất kỹ năng chưa lưu".
- Bạn cũng có thể nhờ sửa một kỹ năng sẵn có, chẳng hạn "Sửa kỹ năng biên bản cuộc họp theo cách chúng ta vẫn làm". Khi đó thẻ có tiêu đề **Sửa kỹ năng**. Một kỹ năng của tôi sẽ bị ghi đè bằng **Thay thế**; kỹ năng có sẵn hoặc kỹ năng từ chương trình khác được lưu thành một bản sao trong kỹ năng của tôi và bản gốc bị tắt.

## Thêm tài liệu làm mẫu

Khi bạn tạo kỹ năng trong bảng AI của một trình soạn thảo, tài liệu hiện tại có thể được lưu kèm làm mẫu. Đánh dấu **Lưu kèm tài liệu này làm mẫu** trên thẻ, và nút sẽ tách thành hai.

- **Tạo mẫu trống**: một bản sao của tài liệu mở trong thẻ mới, "Xem trước mẫu - 〈tiêu đề〉", và AI trong thẻ đó xóa trống các giá trị đã điền như tên, ngày tháng và thông tin cá nhân. Hãy xem lại thẻ, tự sửa thêm nếu cần, rồi nhấn **Lưu thẻ này làm mẫu**; nội dung của thẻ ở thời điểm đó sẽ trở thành mẫu.
- **Lưu tài liệu như hiện tại**: lưu tài liệu hiện tại làm mẫu mà không thay đổi gì. Nếu tài liệu có phần bạn đã ẩn khỏi AI, nút này bị chặn, để nội dung bị ẩn không lọt nguyên vào mẫu.
- Mẫu được lưu dưới dạng một bản sao của tài liệu bên trong thư mục kỹ năng. Tài liệu gốc không thay đổi.

## Dùng kỹ năng có mẫu

- Kỹ năng có mẫu sẽ hiện **Có mẫu** trong danh sách.
- Gọi nó thành thẻ nhỏ rồi gửi, một bản sao của mẫu sẽ mở ra như một tài liệu mới chưa có tên; AI trong thẻ đó tiếp tục thực hiện yêu cầu của bạn. Bảng ban đầu giữ dòng "Đang làm việc với mẫu trong một thẻ mới" và nút **Đến thẻ**.
- Khi AI tự chọn một kỹ năng có mẫu, sẽ không có thẻ nào mở ra ngay. Thay vào đó, cuộc trò chuyện hiện nút **Mở tài liệu mới từ mẫu này**.
- Thường thì bạn chọn nơi lưu tài liệu mới vào lần lưu đầu tiên. Riêng trình soạn thảo Markdown và HTML vẫn lưu vào thư mục mặc định như trước nay. Bản thân tệp mẫu vẫn giữ nguyên.

## Kỹ năng có tập lệnh

- Trong bảng AI thông thường và trong Hỏi AI ở Trang chủ, tập lệnh của kỹ năng không bao giờ chạy. Chỉ phần văn bản của kỹ năng được gửi tới AI.
- Kỹ năng có tập lệnh sẽ hiện **Có tập lệnh · hoạt động đầy đủ trong cửa sổ tác tử**, và khi thêm nó thành thẻ nhỏ sẽ hiện "Tập lệnh của kỹ năng này không chạy trong cửa sổ AI thông thường". Việc gửi không bị chặn.
- Để dùng cả tập lệnh, hãy gọi kỹ năng trong cửa sổ tác tử. Xem [Chế độ tác tử](help://agent-mode).

## Kỹ năng có sẵn

| Kỹ năng           | Chức năng                                                                               |
| ----------------- | --------------------------------------------------------------------------------------- |
| `meeting-minutes` | Biến ghi chú cuộc họp thành biên bản nêu rõ các quyết định và việc cần làm              |
| `internal-comms`  | Viết thông báo, bản tin, báo cáo tiến độ, câu hỏi thường gặp và các văn bản nội bộ khác |
| `humanizer`       | Tìm những cách diễn đạt nghe như AI viết và sửa cho tự nhiên                            |
| `copy-editing`    | Rà lại văn bản tiếng Anh bạn đã viết để nó rõ ràng và gọn hơn                           |
| `find-skills`     | Tìm các kỹ năng bạn cần trong cửa sổ tác tử và đề xuất cài đặt                          |

`copy-editing` được làm cho văn bản tiếp thị tiếng Anh. `find-skills` chỉ hoạt động trong cửa sổ tác tử.

## Trong cửa sổ tác tử

- Cửa sổ tác tử tuân theo cùng cài đặt bật/tắt trong **Cài đặt ▸ Kỹ năng**, và bạn gọi kỹ năng trong ô nhập của nó bằng `/` hoặc `$` theo cùng một cách.
- Các kỹ năng trong `.claude/skills` và `.agents/skills` của thư mục dự án được dùng trong phiên đó mà không cần bật.
- Danh sách kỹ năng được cố định khi phiên bắt đầu. Nếu bạn bật hoặc tắt kỹ năng trong lúc phiên đang chạy, dòng "Kỹ năng đã thay đổi được áp dụng từ phiên tiếp theo" sẽ hiện ra.
- Khi tác tử tạo một kỹ năng, cùng loại thẻ đó sẽ hiện trong cửa sổ. Để chọn mẫu, hãy chọn trong số các tài liệu đang mở ở các thẻ và các tệp trong thư mục dự án.
- Khi tác tử tìm thấy một kỹ năng đáng cài, một đề xuất cài đặt sẽ hiện ra. Hãy mở nó bằng **Mở bản xem trước** và tự nhấn **Cài đặt**; nếu không, sẽ không có gì được cài. Kỹ năng đã cài dùng được từ phiên tiếp theo.
