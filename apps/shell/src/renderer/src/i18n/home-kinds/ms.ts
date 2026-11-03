import type { zh } from './zh'

export const ms = {
  setHomeKinds: 'Dokumen baharu di Laman Utama',
  setHomeKindsDesc:
    'Jenis yang dimatikan tidak lagi muncul pada kad dokumen baharu di Laman Utama dan dalam menu Baharu. Fail jenis itu masih dibuka seperti biasa.',
  homeKindUp: 'Naikkan {name}',
  homeKindDown: 'Turunkan {name}',
  homeKindsReset: 'Pulihkan susunan asal',
} satisfies Record<keyof typeof zh, string>
