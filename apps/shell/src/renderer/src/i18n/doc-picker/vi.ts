import type { zh } from './zh'

export const vi = {
  docPickTitle: 'Đính kèm từ tài liệu GenOffice',
  docPickOpen: 'Tài liệu đang mở',
  docPickRecent: 'Tài liệu gần đây',
  docPickEmpty: 'Không có tài liệu để đính kèm.',
  docPickMissing: 'Không tìm thấy tệp.',
  docPickUnsaved: 'Hãy lưu tệp trước.',
  docPickUnavailable: 'Không thể đọc danh sách tài liệu.',
  docPickLimit: 'Chỉ có thể chọn tối đa 20 tài liệu.',
  docPickSelected: 'Đã chọn {n}',
  docPickAttach: 'Đính kèm',
  docPickCancel: 'Hủy',
  docPickWorking: 'Đang đính kèm…',
} satisfies Record<keyof typeof zh, string>
