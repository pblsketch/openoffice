import type { zh } from './zh'

export const vi = {
  loading: 'Đang mở bản vẽ…',
  openFailedTitle: 'Không thể mở bản vẽ này',
  openFailedNotDrawing: 'Tệp này không phải là bản vẽ Excalidraw.',
  openFailedUnreadable: 'Không thể đọc tệp này. Tệp có thể đã bị hỏng.',
  openFailedTooLarge: 'Tệp quá lớn để mở.',
  openFailedError: 'Đã xảy ra sự cố khi mở tệp.',
  saveFailed: 'Không thể lưu bản vẽ.',
  picturesMissing: 'Không tìm thấy {count} hình ảnh mà bản vẽ này dùng trong kho của ghi chú.',
  picturesNotInNote: 'Hiện chưa thể thêm hình ảnh vào bản vẽ Obsidian tại đây.',
  linkNotOpened: 'Không thể mở liên kết này.',
  autoSave: 'Tự động lưu',
} satisfies Record<keyof typeof zh, string>
