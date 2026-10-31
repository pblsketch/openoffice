import type { zh } from './zh'

export const vi = {
  windowTitle: 'Tác tử',
  homeCardSub: 'Làm việc trong thư mục với Claude Code hoặc Codex',
  intro:
    'Tác tử chạy Claude Code hoặc Codex của bạn trong thư mục bạn chọn. Nó có thể đọc các tệp trong đó, tạo tệp mới, dùng các kỹ năng của bạn, chạy tập lệnh và sửa các tài liệu đang mở trong GenOffice.',
  folderLabel: 'Thư mục dự án',
  folderPick: 'Chọn thư mục…',
  folderNone: 'Chưa chọn thư mục',
  recentLabel: 'Thư mục gần đây',
  providerLabel: 'Chương trình',
  providerClaude: 'Claude Code',
  providerCodex: 'Codex',
  providerClaudeNote:
    'Trên Windows, các lệnh bạn cho phép sẽ chạy không cách ly và có thể truy cập toàn bộ máy tính của bạn cùng internet.',
  providerCodexNote:
    'Các lệnh chạy trong không gian cách ly của Codex: chỉ có thể ghi vào thư mục dự án và không có internet.',
  providerBlocked: 'Chưa dùng được: hiện chưa thể ngăn Codex đọc tệp đăng nhập của chính nó.',
  connChecking: 'Đang kiểm tra kết nối…',
  connUnavailable: 'Chưa kết nối. Hãy đăng nhập trong Cài đặt → AI.',
  connMetered: 'Đã đăng nhập bằng tài khoản trả tiền theo mức dùng mà bạn đã chấp nhận.',
  modeLabel: 'Khi nào hỏi bạn',
  modeAskCommands: 'Hỏi trước mỗi lệnh',
  modeAskCommandsDesc:
    'Việc đọc và ghi tệp trong thư mục dự án được làm ngay. Trước khi chạy lệnh hoặc tập lệnh, tác tử sẽ hỏi.',
  modeAskWrites: 'Hỏi trước khi ghi và chạy lệnh',
  modeAskWritesDesc:
    'Chỉ việc đọc được làm ngay. Trước khi ghi tệp và trước khi chạy lệnh, tác tử đều sẽ hỏi.',
  modeTrust: 'Tin tưởng dự án này',
  modeTrustDesc:
    'Không hỏi gì cả. Codex vẫn chỉ ở trong không gian cách ly của nó; với Claude Code, bộ kiểm tra riêng của nó sẽ thay bạn kiểm tra từng hành động.',
  warningTitle: 'Trước khi bắt đầu',
  warningCommands:
    'Các lệnh tác tử chạy có thể thay đổi tệp và dùng internet. Tài liệu người khác gửi cho bạn có thể chứa chỉ dẫn ẩn.',
  warningRedaction:
    'Những phần bạn đã ẩn khỏi AI chỉ được ẩn trong các tài liệu đang mở trong GenOffice. Các tệp tác tử đọc từ thư mục sẽ được gửi nguyên trạng.',
  warningUsage:
    'Tác tử làm việc qua nhiều bước nên dùng nhiều hạn mức gói đăng ký của bạn hơn bảng AI.',
  warningAccept: 'Tôi đã hiểu',
  start: 'Bắt đầu',
  starting: 'Đang bắt đầu…',
  stop: 'Dừng',
  newSession: 'Phiên mới',
  send: 'Gửi',
  inputPlaceholder: 'Bạn muốn tác tử làm gì?',
  you: 'Bạn',
  agent: 'Tác tử',
  startedLine: 'Đã khởi động {program} trong {folder}',
  skillsLine: 'Có {n} kỹ năng để dùng',
  skillsLineOne: 'Có {n} kỹ năng để dùng',
  toolRunning: 'Đang làm',
  toolDone: 'Xong',
  toolFailed: 'Thất bại',
  toolDenied: 'Đã từ chối',
  actRead: 'Đọc',
  actWrite: 'Ghi',
  actCommand: 'Chạy',
  actAppTool: 'Sửa tài liệu đang mở',
  actSkill: 'Dùng kỹ năng',
  actOther: 'Dùng công cụ',
  openFile: 'Mở',
  permTitle: 'Tác tử xin phép:',
  permCommand: 'Chạy lệnh này',
  permWrite: 'Ghi tệp này',
  permRead: 'Đọc một tệp bên ngoài thư mục dự án',
  permOther: 'Dùng công cụ “{tool}”',
  permReason: 'Lý do: {reason}',
  permAllow: 'Cho phép',
  permDeny: 'Từ chối',
  turnFailed: 'Tác tử không thể hoàn thành yêu cầu này.',
  ended: 'Phiên đã kết thúc.',
  errBadFolder:
    'Không thể dùng thư mục này. Hãy chọn thư mục công việc của riêng bạn: không phải cả ổ đĩa, không phải thư mục người dùng và không phải thư mục chứa dữ liệu đăng nhập hay dữ liệu ứng dụng.',
  errNotConnected:
    'Chương trình này chưa được kết nối. Hãy đăng nhập trong Cài đặt → AI rồi thử lại.',
  errNotAccepted: 'Hãy đọc các lưu ý ở trên và xác nhận trước.',
  errUnsafeTools: 'Chương trình khởi động cùng các công cụ mà ứng dụng không cấp, nên đã bị dừng.',
  errRateLimit: 'Bạn đã dùng hết hạn mức gói đăng ký. Hãy thử lại sau.',
  errSignedOut: 'Chương trình đã đăng xuất. Hãy đăng nhập trong Cài đặt → AI.',
  errMetered:
    'Chương trình đang đăng nhập bằng tài khoản trả tiền theo mức dùng mà bạn chưa chấp nhận.',
  errSandboxUnavailable:
    'Codex không thể mở hộp cát dùng để cô lập các lệnh của nó trên máy tính này nên đã không khởi động. Hãy cập nhật Windows hoặc chọn Claude Code.',
  errNeedsUpdate: 'Chương trình quá cũ để dùng chế độ tác tử. Hãy cập nhật rồi thử lại.',
  errNotInstalled: 'Chương trình chưa được cài đặt.',
  errGeneric: 'Đã xảy ra lỗi. Hãy thử lại.',
  documentsUnprotected:
    'Tài liệu mở sau khi phiên bắt đầu ({n}) không được bảo vệ bởi cơ chế chống ghi của chương trình. Dừng và bắt đầu lại phiên để bảo vệ chúng.',
} satisfies Record<keyof typeof zh, string>
