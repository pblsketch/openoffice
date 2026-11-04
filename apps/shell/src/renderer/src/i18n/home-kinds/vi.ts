import type { zh } from './zh'

export const vi = {
  setHomeKinds: 'Tài liệu mới trên Trang chủ',
  setHomeKindsDesc:
    'Các loại bạn tắt sẽ không còn trong thẻ tài liệu mới ở Trang chủ và trong menu Mới. Tệp thuộc các loại đó vẫn mở như trước.',
  homeKindUp: 'Đưa {name} lên',
  homeKindDown: 'Đưa {name} xuống',
  homeKindsReset: 'Khôi phục thứ tự ban đầu',
} satisfies Record<keyof typeof zh, string>
