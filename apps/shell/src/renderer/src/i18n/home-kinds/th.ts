import type { zh } from './zh'

export const th = {
  setHomeKinds: 'เอกสารใหม่บนหน้าแรก',
  setHomeKindsDesc:
    'ประเภทที่ปิดไว้จะไม่แสดงในการ์ดสร้างเอกสารใหม่บนหน้าแรกและในเมนูสร้างใหม่ ไฟล์ประเภทนั้นยังเปิดได้ตามปกติ',
  homeKindUp: 'เลื่อน {name} ขึ้น',
  homeKindDown: 'เลื่อน {name} ลง',
  homeKindsReset: 'คืนลำดับเดิม',
} satisfies Record<keyof typeof zh, string>
