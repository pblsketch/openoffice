import type { zh } from './zh'

export const ms = {
  loading: 'Membuka lukisan…',
  openFailedTitle: 'Lukisan ini tidak dapat dibuka',
  openFailedNotDrawing: 'Fail ini bukan lukisan Excalidraw.',
  openFailedUnreadable: 'Fail ini tidak dapat dibaca. Ia mungkin rosak.',
  openFailedTooLarge: 'Fail terlalu besar untuk dibuka.',
  openFailedError: 'Berlaku masalah semasa membuka fail.',
  saveFailed: 'Lukisan tidak dapat disimpan.',
  picturesMissing: '{count} gambar yang digunakan lukisan ini tidak ditemui dalam peti besi nota.',
  picturesNotInNote: 'Gambar belum boleh ditambah pada lukisan Obsidian di sini.',
  linkNotOpened: 'Pautan ini tidak dapat dibuka.',
  autoSave: 'Simpan automatik',
} satisfies Record<keyof typeof zh, string>
