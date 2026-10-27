import type { zh } from './zh'

export const id = {
  button: 'Kolaborasi',
  dialogTitle: 'Kolaborasi',
  tabShare: 'Bagikan dokumen ini',
  tabJoin: 'Bergabung',
  nameLabel: 'Nama saya',
  nameHint: 'Ditampilkan di samping kursor Anda di layar orang lain.',
  colorLabel: 'Warna saya',
  colorChoice: 'Warna {n}',
  shareIntro:
    'Orang di jaringan yang sama (LAN) dapat melihat dan mengedit dokumen ini bersama Anda setelah memasukkan PIN. File hanya disimpan di PC ini.',
  shareStart: 'Mulai berbagi',
  shareStarting: 'Memulai…',
  shareStop: 'Berhenti berbagi',
  pinLabel: 'PIN',
  pinNew: 'PIN baru',
  pinChanged:
    'Terlalu banyak PIN salah yang dicoba, jadi PIN telah diganti. Orang yang sudah bergabung tetap terhubung.',
  addressLabel: 'Alamat PC ini',
  peopleLabel: 'Peserta',
  nobodyYet: 'Belum ada yang bergabung.',
  you: 'Anda',
  hostBadge: 'berbagi',
  joinIntro:
    'Masukkan PIN yang diberikan oleh orang yang berbagi. Pilih dokumen yang ditemukan di jaringan ini, atau ketik alamatnya.',
  searching: 'Mencari dokumen yang dibagikan di jaringan ini…',
  foundLabel: 'Ditemukan',
  foundBy: 'dibagikan oleh {name}',
  addressInput: 'Alamat',
  addressPlaceholder: 'mis. 192.168.0.12',
  pinInput: 'PIN (6 digit)',
  join: 'Bergabung',
  joining: 'Menghubungkan…',
  close: 'Tutup',
  leave: 'Keluar',
  errPin: 'PIN tidak benar.',
  errLocked: 'Terlalu banyak PIN salah. PC ini tidak dapat mencoba lagi selama 10 menit.',
  errFull: 'Sesi ini sudah penuh.',
  errVersion:
    'PC lain menjalankan versi aplikasi yang berbeda. Perbarui kedua PC ke versi yang sama.',
  errUnreachable:
    'Tidak dapat terhubung ke alamat tersebut. Periksa alamat, jaringan, dan firewall PC yang berbagi.',
  errTimeout: 'PC yang berbagi tidak merespons.',
  errInvalid: 'Periksa kembali alamat dan PIN.',
  errUnavailable: 'Dokumen ini tidak dapat dibuka di PC ini.',
  errShareNetwork:
    'Berbagi tidak dapat dimulai di PC ini. Periksa apakah ada program lain yang memblokir jaringan.',
  errShareTooLarge: 'Dokumen ini terlalu besar untuk dibagikan.',
  errShareBusy: 'Tab ini sudah berada dalam sesi.',
  errShareSaveFirst: 'Ada perubahan yang belum disimpan. Simpan dulu, lalu bagikan.',
  errShareEncrypted: 'Dokumen yang dilindungi kata sandi tidak dapat dibagikan.',
  errShareUnsupported: 'Dokumen ini tidak dapat dibagikan saat ini.',
  endedByHost:
    'Orang yang berbagi telah mengakhiri sesi. Dokumen ini sekarang menjadi salinan yang belum disimpan di PC ini.',
  endedLost:
    'Koneksi ke PC yang berbagi terputus. Dokumen ini sekarang menjadi salinan yang belum disimpan di PC ini.',
  endedLeft:
    'Anda telah keluar dari sesi. Dokumen ini sekarang menjadi salinan yang belum disimpan di PC ini.',
  endedHostStopped: 'Berbagi dihentikan.',
  guestSaveBlocked: 'Selama sesi berlangsung, orang yang berbagilah yang menyimpan file.',
  guestBlocked: 'Fitur ini tidak tersedia selama sesi.',
  hostBlocked: 'Fitur ini tidak tersedia selama ada orang lain dalam sesi.',
  viewOnly:
    'Dalam format ini hanya orang yang berbagi yang dapat mengedit; orang yang bergabung melihatnya secara langsung.',
  lanNotice:
    'Isi yang dipertukarkan dienkripsi, jadi hanya orang yang memasukkan PIN yang dapat membacanya. Selama berbagi, nama Anda dan judul dokumen terlihat di jaringan.',
  firewallHint:
    'Jika Windows Firewall bertanya saat pertama kali Anda berbagi, izinkan di jaringan pribadi.',
  statusHosting: 'Berbagi · {count}',
  statusGuest: 'Di dokumen {name}',
  dismiss: 'Mengerti',
} satisfies Record<keyof typeof zh, string>
