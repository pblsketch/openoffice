import type { zh } from './zh'

export const id = {
  title: 'Dokumen dengan konten yang belum disimpan',
  intro:
    'Dokumen-dokumen ini masih berisi konten yang belum Anda simpan. Pilih untuk masing-masing apakah akan dipulihkan atau dibuang. Konten yang dibuang tidak dapat dikembalikan.',
  restore: 'Pulihkan',
  discard: 'Buang',
  restoreAll: 'Pulihkan semua',
  discardAll: 'Buang semua',
  confirm: 'Terapkan',
  later: 'Putuskan nanti',
  laterHint: 'Menutup daftar ini tidak menghapus apa pun; Anda akan ditanya lagi nanti.',
  untitledFolder: 'Dokumen baru, belum pernah disimpan',
  lastCopy: 'Disimpan pada {time}',
  changedAfter: 'File berubah setelahnya',
  changedAfterNote:
    'Program lain atau sinkronisasi cloud mungkin telah mengubahnya. "Buang" dipilih agar file tetap seperti sekarang.',
  missing: 'File asli tidak ditemukan',
  missingNote:
    'Jika dipulihkan, dokumen dibuka sebagai dokumen baru tanpa judul. Saat menyimpan, lokasi asli akan disarankan.',
  choiceLabel: 'Pilihan untuk {name}',
} satisfies Record<keyof typeof zh, string>
