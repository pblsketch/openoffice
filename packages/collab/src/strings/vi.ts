import type { zh } from './zh'

export const vi = {
  button: 'Cộng tác',
  dialogTitle: 'Cộng tác',
  tabShare: 'Chia sẻ tài liệu này',
  tabJoin: 'Tham gia',
  nameLabel: 'Tên của tôi',
  nameHint: 'Hiển thị cạnh con trỏ của bạn trên màn hình của những người khác.',
  colorLabel: 'Màu của tôi',
  colorChoice: 'Màu {n}',
  shareIntro:
    'Những người trong cùng mạng (LAN) có thể xem và chỉnh sửa tài liệu này cùng bạn sau khi nhập mã PIN. Tệp chỉ được lưu trên máy tính này.',
  shareStart: 'Bắt đầu chia sẻ',
  shareStarting: 'Đang bắt đầu…',
  shareStop: 'Dừng chia sẻ',
  pinLabel: 'Mã PIN',
  pinNew: 'Mã PIN mới',
  pinChanged:
    'Đã có quá nhiều lần nhập sai mã PIN nên mã PIN đã được thay mới. Những người đã tham gia vẫn ở lại.',
  addressLabel: 'Địa chỉ của máy tính này',
  peopleLabel: 'Người tham gia',
  nobodyYet: 'Chưa có ai tham gia.',
  you: 'bạn',
  hostBadge: 'người chia sẻ',
  joinIntro:
    'Nhập mã PIN mà người chia sẻ đã gửi cho bạn. Chọn một tài liệu được tìm thấy trong mạng này hoặc nhập địa chỉ.',
  searching: 'Đang tìm tài liệu được chia sẻ trong mạng này…',
  foundLabel: 'Đã tìm thấy',
  foundBy: 'do {name} chia sẻ',
  addressInput: 'Địa chỉ',
  addressPlaceholder: 'Ví dụ: 192.168.0.12',
  pinInput: 'Mã PIN (6 chữ số)',
  join: 'Tham gia',
  joining: 'Đang kết nối…',
  close: 'Đóng',
  leave: 'Rời khỏi',
  errPin: 'Mã PIN không đúng.',
  errLocked: 'Nhập sai mã PIN quá nhiều lần. Máy tính này không thể thử lại trong 10 phút.',
  errFull: 'Phiên này đã đủ người.',
  errVersion:
    'Máy tính kia đang chạy phiên bản ứng dụng khác. Hãy cập nhật cả hai máy tính lên cùng một phiên bản.',
  errUnreachable:
    'Không thể kết nối đến địa chỉ đó. Hãy kiểm tra địa chỉ, mạng và tường lửa của máy tính đang chia sẻ.',
  errTimeout: 'Máy tính đang chia sẻ không phản hồi.',
  errInvalid: 'Hãy kiểm tra lại địa chỉ và mã PIN.',
  errUnavailable: 'Không thể mở tài liệu này trên máy tính này.',
  errShareNetwork:
    'Không thể bắt đầu chia sẻ trên máy tính này. Hãy kiểm tra xem có chương trình nào khác đang chặn mạng không.',
  errShareTooLarge: 'Tài liệu này quá lớn để chia sẻ.',
  errShareBusy: 'Thẻ này đã ở trong một phiên.',
  errShareSaveFirst: 'Có thay đổi chưa được lưu. Hãy lưu trước rồi mới chia sẻ.',
  errShareEncrypted: 'Không thể chia sẻ tài liệu được bảo vệ bằng mật khẩu.',
  errShareUnsupported: 'Hiện không thể chia sẻ tài liệu này.',
  endedByHost:
    'Người chia sẻ đã kết thúc phiên. Tài liệu này giờ là một bản sao chưa lưu trên máy tính này.',
  endedLost:
    'Đã mất kết nối với máy tính đang chia sẻ. Tài liệu này giờ là một bản sao chưa lưu trên máy tính này.',
  endedLeft: 'Bạn đã rời khỏi phiên. Tài liệu này giờ là một bản sao chưa lưu trên máy tính này.',
  endedHostStopped: 'Đã dừng chia sẻ.',
  guestSaveBlocked: 'Trong phiên cộng tác, người chia sẻ sẽ lưu tệp.',
  guestBlocked: 'Không thể dùng tính năng này trong phiên cộng tác.',
  hostBlocked: 'Không thể dùng tính năng này khi có người khác đang tham gia.',
  viewOnly: 'Ở định dạng này, chỉ người chia sẻ mới chỉnh sửa được; người tham gia xem trực tiếp.',
  lanNotice:
    'Nội dung trao đổi được mã hóa, nên chỉ người nhập mã PIN mới đọc được. Trong khi chia sẻ, tên của bạn và tiêu đề tài liệu hiển thị trên mạng.',
  firewallHint:
    'Nếu Tường lửa Windows hỏi trong lần chia sẻ đầu tiên, hãy cho phép trên mạng riêng.',
  statusHosting: 'Đang chia sẻ · {count} người',
  statusGuest: 'Trong tài liệu của {name}',
  dismiss: 'Đã hiểu',
} satisfies Record<keyof typeof zh, string>
