import type { zh } from './zh'

export const vi = {
  driveNav: 'Google Drive',
  driveDesc:
    'Chọn tệp trong Google Drive, rồi mở và chỉnh sửa trong GenOffice; khi lưu, tệp được đưa trở lại Drive. GenOffice chỉ mở được những tệp bạn chọn.',
  driveConnect: 'Kết nối Google Drive',
  driveConnecting: 'Hãy đăng nhập tài khoản Google trong trình duyệt và cho phép truy cập…',
  driveCancel: 'Hủy',
  driveConnectedAs: 'Đã kết nối với {email}',
  driveDisconnect: 'Ngắt kết nối',
  driveDisconnectConfirm:
    'Thao tác này xóa thông tin đăng nhập Drive khỏi máy tính này và yêu cầu Google thu hồi quyền truy cập của GenOffice. Các bản sao đã có trên máy tính này vẫn được giữ lại.',
  driveDisconnectYes: 'Ngắt kết nối',
  driveNotPersisted:
    'Máy tính này không thể lưu thông tin đăng nhập dưới dạng mã hóa, nên kết nối sẽ kết thúc khi bạn đóng ứng dụng.',
  driveExpired:
    'Google đã kết thúc kết nối: quyền truy cập bị thu hồi hoặc phiên đăng nhập đã hết hạn. Hãy kết nối lại.',
  driveAiAccess: 'Cho AI tìm và đọc tệp trong Drive',
  driveAiAccessDesc:
    'Khi bật, AI trong trình soạn thảo có thể tìm kiếm và đọc các tệp Drive bạn đã chọn ở đây. Nội dung AI đọc được gửi đến nhà cung cấp AI bạn đang dùng. AI không thể sửa, xóa hay chia sẻ tệp trên Drive.',
  drivePrivacy:
    'Danh sách và nội dung tệp chỉ đi lại giữa máy tính này và Google, không bao giờ đi qua máy chủ của những người làm ra GenOffice.',
  driveFailDenied: 'Không kết nối được vì Google không cho phép.',
  driveFailScope:
    'Không kết nối được vì chưa đánh dấu quyền truy cập Drive. Hãy kết nối lại và đánh dấu mục Drive.',
  driveFailTimeout: 'Đăng nhập không hoàn tất trong 10 phút. Hãy thử lại.',
  driveFailNetwork: 'Không thể kết nối đến Google. Hãy kiểm tra kết nối Internet rồi thử lại.',
  driveRecent: 'Tệp bạn đã chọn',
  driveSearchPlaceholder: 'Tìm trong các tệp đã chọn',
  driveSearchResults: 'Kết quả cho “{q}”',
  driveRefresh: 'Làm mới',
  driveNotConnectedTitle: 'Chưa kết nối Google Drive',
  driveNotConnectedBody:
    'Sau khi kết nối, bạn có thể chọn tệp trên Drive, mở và chỉnh sửa tại đây, và khi lưu tệp được đưa trở lại Drive.',
  driveOpenSettings: 'Kết nối trong Cài đặt',
  driveEmpty: 'Chưa có tệp nào. Nhấp “Chọn từ Google Drive” để chọn tệp.',
  driveLoading: 'Đang tải…',
  driveLoadMore: 'Xem thêm',
  driveOpening: 'Đang mở…',
  driveGoogleBadge: 'Định dạng Google',
  driveGoogleNote:
    'Tài liệu Google được mở dưới dạng tệp Office. Khi lưu, bản gốc được giữ nguyên và một tệp Office được lưu bên cạnh, hoặc trong Drive của tôi.',
  driveReadOnly: 'Chỉ xem',
  driveReadOnlyNote:
    'Bạn không có quyền chỉnh sửa tệp này. Khi lưu, bạn sẽ được hỏi có muốn lưu bản sao vào Drive không.',
  driveUnsupported: 'Ứng dụng này không mở được loại tệp này.',
  driveErrNotConnected: 'Google Drive đã bị ngắt kết nối. Hãy kết nối lại trong Cài đặt.',
  driveErrNotFound: 'Không tìm thấy tệp. Tệp đã bị xóa, hoặc tài khoản này không xem được.',
  driveErrForbidden: 'Tài khoản này không được phép tải tệp này xuống.',
  driveErrTooLarge: 'Tệp quá lớn để mở.',
  driveErrRateLimit: 'Google đang tạm giữ các yêu cầu. Hãy thử lại sau ít phút.',
  driveErrNetwork: 'Không thể kết nối đến Google Drive. Hãy kiểm tra kết nối Internet.',
  driveErrDisk: 'Không thể lưu tệp vào máy tính này.',
  drivePick: 'Chọn từ Google Drive',
  drivePicking: 'Hãy chọn tệp trong cửa sổ Google đã mở trên trình duyệt…',
  drivePickNote:
    'GenOffice chỉ mở được các tệp Drive bạn chọn trong cửa sổ của Google. Tệp đã chọn một lần sẽ ở lại trong danh sách này.',
  driveTrainingTitle: 'Trước khi dùng tệp Drive với AI',
  driveTrainingBody:
    'Google không cho phép gửi tệp Drive đến dịch vụ AI dùng chúng để huấn luyện mô hình. Gói cá nhân của Claude, ChatGPT và Codex có thể dùng cuộc trò chuyện của bạn để huấn luyện nếu bạn không tắt: trong Claude ở Cài đặt → Quyền riêng tư, trong ChatGPT ở Cài đặt → Kiểm soát dữ liệu → “Improve the model for everyone”. Nhà cung cấp dùng khóa API mặc định không huấn luyện trên dữ liệu API. Kết nối AI miễn phí không bao giờ được nhận tệp Drive.',
  driveTrainingAck: 'Tôi đã tắt huấn luyện mô hình trong các tài khoản AI dùng với tệp Drive',
  driveFailTraining: 'Hãy đánh dấu mục về huấn luyện mô hình ở trên trước.',
} satisfies Record<keyof typeof zh, string>
