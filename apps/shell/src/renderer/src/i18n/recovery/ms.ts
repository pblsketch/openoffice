import type { zh } from './zh'

export const ms = {
  title: 'Dokumen dengan kandungan yang belum disimpan',
  intro:
    'Dokumen ini masih mengandungi kandungan yang belum anda simpan. Pilih bagi setiap satu sama ada mahu memulihkan atau membuangnya. Kandungan yang dibuang tidak boleh diperoleh semula.',
  restore: 'Pulihkan',
  discard: 'Buang',
  restoreAll: 'Pulihkan semua',
  discardAll: 'Buang semua',
  confirm: 'Sahkan',
  later: 'Tentukan kemudian',
  laterHint: 'Menutup senarai ini tidak memadam apa-apa; anda akan ditanya semula kemudian.',
  untitledFolder: 'Dokumen baharu, tidak pernah disimpan',
  lastCopy: 'Disimpan pada {time}',
  changedAfter: 'Fail berubah selepas itu',
  changedAfterNote:
    'Program lain atau penyegerakan awan mungkin telah mengubahnya. "Buang" dipilih supaya fail kekal seperti sekarang.',
  missing: 'Fail asal tidak ditemui',
  missingNote:
    'Jika dipulihkan, ia dibuka sebagai dokumen baharu tanpa tajuk. Semasa menyimpan, lokasi asal akan dicadangkan.',
  choiceLabel: 'Pilihan untuk {name}',
} satisfies Record<keyof typeof zh, string>
