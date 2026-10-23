import type { zh } from './zh'

export const id = {
  loading: 'Membuka gambar…',
  openFailedTitle: 'Gambar ini tidak dapat dibuka',
  openFailedNotDrawing: 'File ini bukan gambar Excalidraw.',
  openFailedUnreadable: 'File ini tidak dapat dibaca. Mungkin rusak.',
  openFailedTooLarge: 'File terlalu besar untuk dibuka.',
  openFailedError: 'Terjadi masalah saat membuka file.',
  saveFailed: 'Gambar tidak dapat disimpan.',
  picturesMissing: '{count} gambar yang dipakai gambar ini tidak ditemukan di vault catatan.',
  picturesNotInNote: 'Gambar belum dapat ditambahkan ke gambar Obsidian di sini.',
  linkNotOpened: 'Tautan ini tidak dapat dibuka.',
  autoSave: 'Simpan otomatis',
} satisfies Record<keyof typeof zh, string>
