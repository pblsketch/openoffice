import type { zh } from './zh'

export const id = {
  editUndo: 'Urungkan',
  editRedo: 'Ulangi',
  editBold: 'Tebal',
  editItalic: 'Miring',
  editReplace: 'Ganti',
  editReplaceWith: 'Ganti dengan',
  editReplaceOne: 'Ganti',
  editReplaceAll: 'Ganti semua',
  editReplaceDone: '{count} diganti',
  editReplaceSkipped: '{count} di bab hanya-baca dilewati',
  editReplaceFailed: '{count} tidak dapat diganti',
  editReplaceNone: 'Tidak ada yang perlu diganti',
  editReplaceNotHere: 'Kecocokan ini tidak dapat diganti',
  editAutoSave: 'Simpan otomatis',
  editAutoSaveTip: 'Menyimpan setiap 30 detik dan saat jendela kehilangan fokus',
  editUnsaved: 'Ada perubahan yang belum disimpan',
  editLocked: 'Tidak dapat mengedit selama buku sedang diterjemahkan',
  editRefused: 'Perubahan ini tidak dapat diterapkan',
  editHistoryFailed: 'Riwayat urungkan tidak lagi sesuai dengan buku dan telah dihapus',
} satisfies Record<keyof typeof zh, string>
