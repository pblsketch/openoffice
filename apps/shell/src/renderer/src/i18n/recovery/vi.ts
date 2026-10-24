import type { zh } from './zh'

export const vi = {
  title: 'Tài liệu còn nội dung chưa lưu',
  intro:
    'Các tài liệu này vẫn còn nội dung bạn chưa lưu. Hãy chọn khôi phục hay bỏ đi cho từng tài liệu. Nội dung đã bỏ đi không thể lấy lại.',
  restore: 'Khôi phục',
  discard: 'Bỏ đi',
  restoreAll: 'Khôi phục tất cả',
  discardAll: 'Bỏ đi tất cả',
  confirm: 'Xác nhận',
  later: 'Quyết định sau',
  laterHint: 'Đóng danh sách này sẽ không xóa gì cả; bạn sẽ được hỏi lại sau.',
  untitledFolder: 'Tài liệu mới, chưa từng lưu',
  lastCopy: 'Lưu giữ lúc {time}',
  changedAfter: 'Tệp đã thay đổi sau đó',
  changedAfterNote:
    'Có thể một chương trình khác hoặc đồng bộ đám mây đã sửa tệp. "Bỏ đi" được chọn sẵn để giữ tệp như hiện tại.',
  missing: 'Không tìm thấy tệp gốc',
  missingNote:
    'Nếu khôi phục, tài liệu sẽ mở dưới dạng tài liệu mới chưa có tên. Khi lưu, vị trí ban đầu sẽ được đề xuất.',
  choiceLabel: 'Lựa chọn cho {name}',
} satisfies Record<keyof typeof zh, string>
