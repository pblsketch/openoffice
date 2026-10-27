import type { zh } from './zh'

export const ms = {
  button: 'Bekerjasama',
  dialogTitle: 'Bekerjasama',
  tabShare: 'Kongsi dokumen ini',
  tabJoin: 'Sertai',
  nameLabel: 'Nama saya',
  nameHint: 'Dipaparkan di sebelah kursor anda pada skrin orang lain.',
  colorLabel: 'Warna saya',
  colorChoice: 'Warna {n}',
  shareIntro:
    'Orang dalam rangkaian yang sama (LAN) boleh melihat dan mengedit dokumen ini bersama anda selepas memasukkan PIN. Fail hanya disimpan pada PC ini.',
  shareStart: 'Mula berkongsi',
  shareStarting: 'Memulakan…',
  shareStop: 'Henti berkongsi',
  pinLabel: 'PIN',
  pinNew: 'PIN baharu',
  pinChanged:
    'Terlalu banyak PIN salah dicuba, jadi PIN telah diganti. Orang yang sudah menyertai kekal dalam sesi.',
  addressLabel: 'Alamat PC ini',
  peopleLabel: 'Peserta',
  nobodyYet: 'Belum ada sesiapa yang menyertai.',
  you: 'anda',
  hostBadge: 'berkongsi',
  joinIntro:
    'Masukkan PIN yang diberikan oleh orang yang berkongsi. Pilih dokumen yang ditemui dalam rangkaian ini, atau taip alamatnya.',
  searching: 'Mencari dokumen yang dikongsi dalam rangkaian ini…',
  foundLabel: 'Ditemui',
  foundBy: 'dikongsi oleh {name}',
  addressInput: 'Alamat',
  addressPlaceholder: 'cth. 192.168.0.12',
  pinInput: 'PIN (6 digit)',
  join: 'Sertai',
  joining: 'Menyambung…',
  close: 'Tutup',
  leave: 'Keluar',
  errPin: 'PIN itu tidak betul.',
  errLocked: 'Terlalu banyak PIN salah. PC ini tidak boleh mencuba lagi selama 10 minit.',
  errFull: 'Sesi ini sudah penuh.',
  errVersion:
    'PC yang satu lagi menjalankan versi apl yang berbeza. Kemas kini kedua-dua PC kepada versi yang sama.',
  errUnreachable:
    'Tidak dapat menyambung ke alamat itu. Semak alamat, rangkaian dan tembok api PC yang berkongsi.',
  errTimeout: 'PC yang berkongsi tidak memberi respons.',
  errInvalid: 'Semak semula alamat dan PIN.',
  errUnavailable: 'Dokumen ini tidak dapat dibuka pada PC ini.',
  errShareNetwork:
    'Perkongsian tidak dapat dimulakan pada PC ini. Semak sama ada program lain sedang menyekat rangkaian.',
  errShareTooLarge: 'Dokumen ini terlalu besar untuk dikongsi.',
  errShareBusy: 'Tab ini sudah berada dalam sesi.',
  errShareSaveFirst: 'Terdapat perubahan yang belum disimpan. Simpan dahulu, kemudian kongsi.',
  errShareEncrypted: 'Dokumen yang dilindungi kata laluan tidak boleh dikongsi.',
  errShareUnsupported: 'Dokumen ini tidak boleh dikongsi buat masa ini.',
  endedByHost:
    'Orang yang berkongsi telah menamatkan sesi. Dokumen ini kini salinan yang belum disimpan pada PC ini.',
  endedLost:
    'Sambungan ke PC yang berkongsi telah terputus. Dokumen ini kini salinan yang belum disimpan pada PC ini.',
  endedLeft:
    'Anda telah keluar daripada sesi. Dokumen ini kini salinan yang belum disimpan pada PC ini.',
  endedHostStopped: 'Perkongsian dihentikan.',
  guestSaveBlocked: 'Semasa sesi, orang yang berkongsi yang menyimpan fail.',
  guestBlocked: 'Ciri ini tidak tersedia semasa sesi.',
  hostBlocked: 'Ciri ini tidak tersedia selagi ada orang lain dalam sesi.',
  viewOnly:
    'Dalam format ini, hanya orang yang berkongsi boleh mengedit; orang yang menyertai menontonnya secara langsung.',
  lanNotice:
    'Kandungan yang ditukar disulitkan, jadi hanya orang yang memasukkan PIN boleh membacanya. Semasa berkongsi, nama anda dan tajuk dokumen kelihatan dalam rangkaian.',
  firewallHint:
    'Jika Tembok Api Windows bertanya kali pertama anda berkongsi, benarkan akses pada rangkaian peribadi.',
  statusHosting: 'Berkongsi · {count}',
  statusGuest: 'Dalam dokumen {name}',
  dismiss: 'Faham',
} satisfies Record<keyof typeof zh, string>
