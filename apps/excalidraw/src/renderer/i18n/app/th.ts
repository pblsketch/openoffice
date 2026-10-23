import type { zh } from './zh'

export const th = {
  loading: 'กำลังเปิดภาพวาด…',
  openFailedTitle: 'ไม่สามารถเปิดภาพวาดนี้ได้',
  openFailedNotDrawing: 'ไฟล์นี้ไม่ใช่ภาพวาด Excalidraw',
  openFailedUnreadable: 'ไม่สามารถอ่านไฟล์นี้ได้ ไฟล์อาจเสียหาย',
  openFailedTooLarge: 'ไฟล์มีขนาดใหญ่เกินกว่าจะเปิดได้',
  openFailedError: 'เกิดปัญหาขณะเปิดไฟล์',
  saveFailed: 'ไม่สามารถบันทึกภาพวาดได้',
  picturesMissing: 'ไม่พบรูปภาพ {count} รูปที่ภาพวาดนี้ใช้ในคลังของโน้ต',
  picturesNotInNote: 'ยังไม่สามารถเพิ่มรูปภาพลงในภาพวาด Obsidian ที่นี่ได้',
  linkNotOpened: 'ไม่สามารถเปิดลิงก์นี้ได้',
  autoSave: 'บันทึกอัตโนมัติ',
} satisfies Record<keyof typeof zh, string>
