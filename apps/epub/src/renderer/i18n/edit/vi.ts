import type { zh } from './zh'

export const vi = {
  editUndo: 'Hoàn tác',
  editRedo: 'Làm lại',
  editBold: 'Đậm',
  editItalic: 'Nghiêng',
  editReplace: 'Thay thế',
  editReplaceWith: 'Thay bằng',
  editReplaceOne: 'Thay thế',
  editReplaceAll: 'Thay thế tất cả',
  editReplaceDone: 'Đã thay {count} chỗ',
  editReplaceSkipped: 'Đã bỏ qua {count} chỗ trong các chương chỉ đọc',
  editReplaceFailed: 'Không thể thay {count} chỗ',
  editReplaceNone: 'Không có gì để thay',
  editReplaceNotHere: 'Không thể thay chỗ này',
  editAutoSave: 'Tự động lưu',
  editAutoSaveTip: 'Lưu mỗi 30 giây và khi cửa sổ mất tiêu điểm',
  editUnsaved: 'Có thay đổi chưa lưu',
  editLocked: 'Không thể chỉnh sửa khi sách đang được dịch',
  editRefused: 'Không thể thực hiện thay đổi này',
  editHistoryFailed: 'Lịch sử hoàn tác không còn khớp với sách nên đã bị xóa',
} satisfies Record<keyof typeof zh, string>
