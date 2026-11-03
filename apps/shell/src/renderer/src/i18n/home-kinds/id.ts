import type { zh } from './zh'

export const id = {
  setHomeKinds: 'Dokumen baru di Beranda',
  setHomeKindsDesc:
    'Jenis yang dimatikan tidak muncul di kartu dokumen baru di Beranda dan di menu Baru. File jenis itu tetap terbuka seperti biasa.',
  homeKindUp: 'Naikkan {name}',
  homeKindDown: 'Turunkan {name}',
  homeKindsReset: 'Kembalikan urutan awal',
} satisfies Record<keyof typeof zh, string>
