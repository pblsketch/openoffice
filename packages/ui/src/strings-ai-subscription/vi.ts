import type { zh } from './zh'

export const vi = {
  aiAssistant: 'Trợ lý AI',
  cardChecking: 'Đang kiểm tra…',
  cardNotInstalled: 'Chưa cài đặt',
  cardSignedOut: 'Chưa đăng nhập',
  cardSigningIn: 'Đang đăng nhập…',
  cardReady: 'Đã kết nối',
  cardReadyPlan: 'Đã kết nối · {plan}',
  cardMetered: 'Đã đăng nhập nhưng không phải bằng gói đăng ký',
  cardMeteredAccepted: 'Đang dùng · tính phí theo mức sử dụng',
  cardError: 'Không kiểm tra được kết nối',
  cardErrNeedsUpdate:
    'Chương trình {provider} trên máy tính này quá cũ. Hãy cập nhật rồi kiểm tra lại.',
  cardErrNeedsUpdateVersion:
    'Chương trình {provider} trên máy tính này ({version}) quá cũ; cần phiên bản {minimum} trở lên. Hãy chạy {command} trong terminal rồi kiểm tra lại.',
  cardErrNeedsUpdatePath: 'Tệp mà ứng dụng này chạy:',
  cardErrNeedsUpdateWindows:
    'Cập nhật {provider} trong WSL (Ubuntu) hoặc ở thư mục khác không làm thay đổi tệp này. Hãy chạy {command} trong Windows PowerShell.',
  cardErrTimeout: 'Chương trình {provider} không trả lời kịp thời. Hãy kiểm tra lại sau giây lát.',
  cardErrFailed: 'Đã xảy ra sự cố khi kiểm tra {provider}. Hãy kiểm tra lại.',
  actionInstall: 'Cài đặt',
  actionLogin: 'Đăng nhập',
  actionLoginWindow: 'Trình duyệt không mở?',
  actionRecheck: 'Kiểm tra lại',
  actionAcceptMetered: 'Vẫn sử dụng',
  actionInstallHelp: 'Hướng dẫn cài đặt chính thức',
  actionOpenSettings: 'Mở cài đặt',
  actionDismiss: 'Đóng',
  actionSwitchAccount: 'Đăng nhập bằng tài khoản khác',
  actionLogout: 'Đăng xuất',
  installNote: 'Lệnh cài đặt chính thức của {vendor} sẽ chạy trong một cửa sổ terminal mới.',
  loginNote: 'Trang đăng nhập được mở ra là của {vendor}.',
  signingInBrowserNote:
    'Đăng nhập vào tài khoản {vendor} của bạn trong trình duyệt vừa mở và cho phép truy cập. Khi xong, kết nối sẽ tự hoàn tất.',
  signingInWindowNote:
    'Hãy làm theo hướng dẫn ở đầu cửa sổ đăng nhập vừa mở. Đăng nhập trên trang {vendor} vừa mở trong trình duyệt: khi đó cửa sổ sẽ tự đóng và kết nối hoàn tất. Trang đăng nhập đã mở từ trước không còn dùng được nữa; hãy đóng trang đó.',
  meteredWarning: 'Đây không phải gói đăng ký: bạn bị tính phí theo mức sử dụng.',
  meteredMeaning:
    'Lần đăng nhập này dùng khóa API hoặc tài khoản trả phí theo mức sử dụng, hoặc không xác định được loại đăng nhập. Chọn "Vẫn sử dụng" để AI chạy qua kết nối này, và mỗi yêu cầu sẽ được tính vào tài khoản đó.',
  connectTitle: 'Kết nối AI để bắt đầu',
  connectBody: 'AI chạy bằng gói đăng ký Claude hoặc Codex mà bạn đã có. Không cần khóa API.',
  connectProviderTitle: 'Kết nối {provider} hiện chưa dùng được',
  connectKeyBody:
    'Thiết lập {provider} chưa hoàn tất. Hãy hoàn tất trong Cài đặt hoặc chọn AI khác.',
  errNotConnected:
    'Chưa có AI nào được kết nối. Hãy kết nối gói đăng ký Claude hoặc Codex, hoặc một AI miễn phí trước.',
  errNotInstalled: 'Không tìm thấy chương trình {provider} trên máy tính này.',
  errSignedOut: 'Phiên đăng nhập {provider} đã hết hạn. Hãy đăng nhập lại để tiếp tục.',
  errRateLimit: 'Đã dùng hết giới hạn của gói đăng ký {provider}.',
  errRateLimitReset:
    'Đã dùng hết giới hạn của gói đăng ký {provider}. Giới hạn sẽ được đặt lại lúc {time}.',
  errUnsafeTools:
    'Chương trình {provider} khởi động khi các công cụ riêng của nó vẫn bật, nên lượt chạy đã bị dừng để đảm bảo an toàn.',
  errMeteredNotAccepted:
    'Kết nối {provider} bị tính phí theo mức sử dụng và bạn chưa cho phép. Chọn "Vẫn sử dụng" trong phần cài đặt kết nối để dùng.',
  errNeedsUpdate:
    'Chương trình {provider} quá cũ nên không dùng được tính năng này. Hãy cập nhật rồi thử lại.',
  errHeadlessLimit: 'Đã đạt giới hạn mỗi giờ cho các yêu cầu tự động.',
  errHeadlessLimitReset:
    'Đã đạt giới hạn mỗi giờ cho các yêu cầu tự động. Có thể gửi lại yêu cầu lúc {time}.',
  connectFreeHint:
    'Chưa có gói đăng ký? Bạn có thể kết nối AI miễn phí trong Cài đặt chỉ trong khoảng một phút.',
  actionConnectFree: 'Kết nối AI miễn phí',
  errFreeLimit:
    'Đã dùng hết lượt miễn phí hôm nay. Hãy thử lại vào ngày mai hoặc chọn AI khác trong Cài đặt.',
  errFreeLimitReset: 'Đã dùng hết lượt miễn phí hôm nay. Bạn có thể dùng lại lúc {time}.',
  continueWith: 'Tiếp tục với {provider}',
  continueMeteredNote:
    'Kết nối {provider} không phải gói đăng ký: tiếp tục sẽ bị tính phí theo mức sử dụng.',
  usageLine: 'Đã dùng {percent}% · đặt lại lúc {time}',
  usageWindowFiveHour: 'Giới hạn 5 giờ',
  usageWindowSevenDay: 'Giới hạn 7 ngày',
  noticeTitle: 'Trước khi dùng AI bằng gói đăng ký của bạn',
  noticeSend:
    'Nội dung tài liệu và cuộc trò chuyện được gửi đến Anthropic hoặc OpenAI bằng chính tài khoản của bạn. Mỗi yêu cầu còn kèm tên, tiêu đề và mô tả của mọi kỹ năng đặt ở "AI tự quyết định"; kỹ năng đang dùng và các tệp kỹ năng mà AI đọc cũng được gửi kèm.',
  noticeTraining:
    'Nội dung đó có được dùng để huấn luyện AI hay không tùy thuộc vào cài đặt tài khoản của bạn tại công ty đó.',
  noticeCodexHistory:
    'Ứng dụng này tắt việc lưu lịch sử trò chuyện của Codex, nhưng Codex vẫn có thể lưu nhật ký chẩn đoán riêng trên máy tính này.',
  noticePdfWholeDocument:
    'Trong trình chỉnh sửa PDF, tính năng đọc trang bằng AI và dịch tài liệu có thể gửi hình ảnh các trang và toàn bộ văn bản của tài liệu.',
  noticeAck: 'Đã hiểu',
  codexNotice:
    'Dùng gói đăng ký Codex bên trong một ứng dụng không phải là cách được OpenAI chính thức khuyến nghị.',
  truncatedNotice: 'Nội dung nhập quá dài nên một phần đã bị cắt bớt trước khi gửi.',
  pickerAuto: 'Tự động',
  pickerAutoUsing: 'Tự động · {provider}',
  pickerAutoUsingModel: 'Tự động · {provider} · {model}',
  pickerDefaultModel: 'Mô hình mặc định',
  pickerDefaultModelNamed: 'Mô hình mặc định · {model}',
  pickerSubscription: 'Gói đăng ký',
  pickerPaid: 'Trả phí',
  pickerPaidTitle: 'Tính phí theo mức sử dụng, không nằm trong gói đăng ký',
  pickerNotConnected: 'Kết nối AI',
  guideQuestion: 'Bạn đang dùng AI nào?',
  guidePathClaudeTitle: 'Tôi có gói đăng ký Claude trả phí',
  guidePathClaudeBody: 'Cần có gói Pro hoặc Max. Tài khoản Claude miễn phí không kết nối được.',
  guidePathCodexTitle: 'Tôi dùng ChatGPT',
  guidePathCodexBody:
    'Đăng nhập vào chương trình Codex của OpenAI bằng tài khoản ChatGPT của bạn. Gói miễn phí chỉ cho dùng một ít.',
  guidePathFreeTitle: 'Tôi chưa có cái nào',
  guidePathFreeBody:
    'Kết nối AI miễn phí trong khoảng một phút. Trong thời gian dùng miễn phí, nội dung bạn gửi có thể được dùng để cải thiện AI của công ty đó.',
  guideBack: 'Chọn cách khác',
  guideBadgeReady: 'Đã kết nối',
  guideBadgeInstalled: 'Đã cài đặt',
  guideBadgeCheck: 'Cần kiểm tra',
  guideStepsLabel: 'Các bước kết nối',
  stepInstall: 'Cài đặt chương trình',
  stepLogin: 'Đăng nhập',
  stepReady: 'Đã kết nối',
  installReturnNote:
    'Khi cài đặt trong cửa sổ đó xong, hãy quay lại màn hình này. Ứng dụng sẽ tự kiểm tra lại.',
  loginHowNote:
    'Khi bạn nhấn, trình duyệt sẽ mở ra. Đăng nhập bằng tài khoản {vendor} của bạn rồi nhấn Cho phép, kết nối sẽ tự hoàn tất.',
  signingInStalledNote:
    'Nếu trình duyệt không mở trang đăng nhập nào, hãy mở cửa sổ đăng nhập bằng nút bên dưới. Nếu bạn vẫn đang đăng nhập trong trình duyệt, đừng nhấn nút mà hãy hoàn tất ở đó: nút này sẽ dừng lần đăng nhập đó và bắt đầu lại từ đầu.',
  actionLoginWindowOpen: 'Mở cửa sổ đăng nhập',
  loginWindowTitle: 'Đăng nhập {provider}',
  loginWindowIntro:
    'Đây là cửa sổ đăng nhập của chương trình {provider}. Đoạn tiếng Anh bên dưới là hướng dẫn của chương trình {provider}.',
  loginWindowStepBrowser:
    'Khi trang đăng nhập {vendor} mở trong trình duyệt, hãy đăng nhập và cho phép truy cập. Sau đó cửa sổ này sẽ tự đóng.',
  loginWindowStepAddress:
    'Nếu trình duyệt không mở, hãy kéo chuột để chọn địa chỉ bắt đầu bằng https:// ở bên dưới, rồi nhấp chuột phải để sao chép. Dán địa chỉ đó vào thanh địa chỉ của trình duyệt để mở trang đăng nhập.',
  loginWindowStepCode:
    'Nếu sau khi đăng nhập trình duyệt hiện một mã, hãy sao chép toàn bộ mã (nếu có nút sao chép thì dùng nút đó). Nhấp chuột phải một lần bên trong cửa sổ này để dán, rồi nhấn Enter. Mã đã dán không hiện ra là bình thường.',
  loginWindowStepInvalid:
    'Nếu thấy "Invalid code", tức là mã chưa được sao chép đầy đủ. Đừng đóng cửa sổ này, hãy sao chép lại mã rồi dán.',
  loginWindowClosing:
    'Đăng nhập chưa hoàn tất. Đọc xong các thông báo ở trên, hãy nhấn Enter để đóng cửa sổ này. Để thử lại, hãy nhấn lại nút đăng nhập.',
  actionCancelLogin: 'Hủy đăng nhập',
  actionUpdate: 'Cập nhật',
  updateNote:
    'Khi bạn nhấn, bản cập nhật chính thức của {vendor} sẽ chạy trong một cửa sổ mới. Khi cập nhật xong ở đó, hãy quay lại màn hình này.',
  guideInfoHint:
    'Vẫn chưa được? Hãy sao chép thông tin kết nối và gửi cho người đang giúp bạn. Thông tin này không chứa tài khoản hay đường dẫn tệp.',
  actionCopyInfo: 'Sao chép thông tin để nhờ hỗ trợ',
  copyInfoDone: 'Đã sao chép',
  actionConnectHelp: 'Xem từng bước trên màn hình (trang tiếng Hàn)',
} satisfies Record<keyof typeof zh, string>
