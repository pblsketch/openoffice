import type { zh } from './zh'

export const ms = {
  editUndo: 'Buat asal',
  editRedo: 'Buat semula',
  editBold: 'Tebal',
  editItalic: 'Condong',
  editReplace: 'Ganti',
  editReplaceWith: 'Ganti dengan',
  editReplaceOne: 'Ganti',
  editReplaceAll: 'Ganti semua',
  editReplaceDone: '{count} telah diganti',
  editReplaceSkipped: '{count} dalam bab baca sahaja dilangkau',
  editReplaceFailed: '{count} tidak dapat diganti',
  editReplaceNone: 'Tiada apa untuk diganti',
  editReplaceNotHere: 'Padanan ini tidak dapat diganti',
  editAutoSave: 'Simpan automatik',
  editAutoSaveTip: 'Menyimpan setiap 30 saat dan apabila tetingkap hilang fokus',
  editUnsaved: 'Ada perubahan yang belum disimpan',
  editLocked: 'Tidak boleh menyunting semasa buku sedang diterjemahkan',
  editRefused: 'Perubahan ini tidak dapat dibuat',
  editHistoryFailed: 'Sejarah buat asal tidak lagi sepadan dengan buku dan telah dikosongkan',
} satisfies Record<keyof typeof zh, string>
