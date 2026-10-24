import type { zh } from './zh'

export const th = {
  editUndo: 'เลิกทำ',
  editRedo: 'ทำซ้ำ',
  editBold: 'ตัวหนา',
  editItalic: 'ตัวเอียง',
  editReplace: 'แทนที่',
  editReplaceWith: 'แทนที่ด้วย',
  editReplaceOne: 'แทนที่',
  editReplaceAll: 'แทนที่ทั้งหมด',
  editReplaceDone: 'แทนที่แล้ว {count} แห่ง',
  editReplaceSkipped: 'ข้าม {count} แห่งในบทที่อ่านได้อย่างเดียว',
  editReplaceFailed: 'แทนที่ไม่ได้ {count} แห่ง',
  editReplaceNone: 'ไม่มีสิ่งที่จะแทนที่',
  editReplaceNotHere: 'ไม่สามารถแทนที่ตำแหน่งนี้ได้',
  editAutoSave: 'บันทึกอัตโนมัติ',
  editAutoSaveTip: 'บันทึกทุก 30 วินาทีและเมื่อหน้าต่างไม่ได้รับโฟกัส',
  editUnsaved: 'มีการแก้ไขที่ยังไม่ได้บันทึก',
  editLocked: 'แก้ไขไม่ได้ระหว่างที่กำลังแปลหนังสือ',
  editRefused: 'ไม่สามารถทำการแก้ไขนี้ได้',
  editHistoryFailed: 'ประวัติการเลิกทำไม่ตรงกับหนังสือแล้วจึงถูกล้าง',
} satisfies Record<keyof typeof zh, string>
