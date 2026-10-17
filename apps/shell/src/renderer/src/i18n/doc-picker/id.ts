import type { zh } from './zh'

export const id = {
  docPickTitle: 'Lampirkan dari dokumen GenOffice',
  docPickOpen: 'Dokumen yang terbuka',
  docPickRecent: 'Dokumen terbaru',
  docPickEmpty: 'Tidak ada dokumen untuk dilampirkan.',
  docPickMissing: 'File tidak ditemukan.',
  docPickUnsaved: 'Simpan dulu.',
  docPickUnavailable: 'Daftar dokumen tidak dapat dibaca.',
  docPickLimit: 'Anda hanya dapat memilih hingga 20 dokumen.',
  docPickSelected: '{n} dipilih',
  docPickAttach: 'Lampirkan',
  docPickCancel: 'Batal',
  docPickWorking: 'Melampirkan…',
} satisfies Record<keyof typeof zh, string>
