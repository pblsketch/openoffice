import type { zh } from './zh'

export const ms = {
  windowTitle: 'Ejen',
  homeCardSub: 'Bekerja dalam folder dengan Claude Code atau Codex',
  intro:
    'Ejen menjalankan Claude Code atau Codex anda dalam folder yang anda pilih. Ejen boleh membaca fail di dalamnya, mencipta fail baharu, menggunakan kemahiran anda, menjalankan skrip dan mengubah dokumen yang dibuka dalam GenOffice.',
  folderLabel: 'Folder projek',
  folderPick: 'Pilih folder…',
  folderNone: 'Tiada folder dipilih',
  recentLabel: 'Folder terkini',
  providerLabel: 'Program',
  providerClaude: 'Claude Code',
  providerCodex: 'Codex',
  providerClaudeNote:
    'Pada Windows, arahan yang anda benarkan berjalan tanpa pengasingan dan boleh mencapai seluruh PC anda serta internet.',
  providerCodexNote:
    'Arahan berjalan dalam ruang terasing Codex: hanya folder projek yang boleh ditulis, dan tiada internet.',
  providerBlocked:
    'Belum tersedia: Codex belum dapat dihalang daripada membaca fail log masuknya sendiri.',
  connChecking: 'Menyemak sambungan…',
  connUnavailable: 'Tidak bersambung. Log masuk di Tetapan → AI.',
  connMetered: 'Log masuk dengan akaun bayar ikut penggunaan yang telah anda terima.',
  modeLabel: 'Bila hendak bertanya kepada anda',
  modeAskCommands: 'Tanya sebelum setiap arahan',
  modeAskCommandsDesc:
    'Membaca dan menulis fail dalam folder projek dilakukan terus. Sebelum menjalankan arahan atau skrip, ejen akan bertanya dahulu.',
  modeAskWrites: 'Tanya sebelum menulis dan menjalankan arahan',
  modeAskWritesDesc:
    'Hanya membaca dilakukan terus. Sebelum menulis fail dan sebelum menjalankan arahan, ejen akan bertanya dahulu.',
  modeTrust: 'Percayai projek ini',
  modeTrustDesc:
    'Tiada apa-apa ditanya. Codex tetap kekal dalam ruang terasingnya; bagi Claude Code, penyemaknya sendiri memeriksa setiap tindakan bagi pihak anda.',
  warningTitle: 'Sebelum anda mula',
  warningCommands:
    'Arahan yang dijalankan oleh ejen boleh mengubah fail dan menggunakan internet. Dokumen yang dihantar oleh orang lain kepada anda mungkin mengandungi arahan tersembunyi.',
  warningRedaction:
    'Bahagian yang anda sembunyikan daripada AI hanya kekal tersembunyi dalam dokumen yang dibuka dalam GenOffice. Fail yang dibaca oleh ejen dari folder dihantar seadanya.',
  warningUsage:
    'Ejen bekerja dalam banyak langkah dan menggunakan lebih banyak kuota langganan anda berbanding panel AI.',
  warningAccept: 'Saya faham',
  start: 'Mula',
  starting: 'Memulakan…',
  stop: 'Henti',
  newSession: 'Sesi baharu',
  send: 'Hantar',
  inputPlaceholder: 'Apakah yang perlu dilakukan oleh ejen?',
  you: 'Anda',
  agent: 'Ejen',
  startedLine: '{program} dimulakan dalam {folder}',
  skillsLine: '{n} kemahiran tersedia',
  skillsLineOne: '{n} kemahiran tersedia',
  toolRunning: 'Sedang berjalan',
  toolDone: 'Selesai',
  toolFailed: 'Gagal',
  toolDenied: 'Ditolak',
  actRead: 'Baca',
  actWrite: 'Tulis',
  actCommand: 'Jalankan',
  actAppTool: 'Sunting dokumen yang dibuka',
  actSkill: 'Guna kemahiran',
  actOther: 'Guna alat',
  openFile: 'Buka',
  permTitle: 'Ejen meminta kebenaran untuk:',
  permCommand: 'Menjalankan arahan ini',
  permWrite: 'Menulis fail ini',
  permRead: 'Membaca fail di luar folder projek',
  permOther: 'Menggunakan alat “{tool}”',
  permReason: 'Sebab: {reason}',
  permAllow: 'Benarkan',
  permDeny: 'Tolak',
  turnFailed: 'Ejen tidak dapat menyelesaikan permintaan ini.',
  ended: 'Sesi telah tamat.',
  errBadFolder:
    'Folder ini tidak boleh digunakan. Pilih folder kerja anda sendiri: bukan keseluruhan pemacu, bukan folder rumah anda dan bukan folder data log masuk atau data aplikasi.',
  errNotConnected: 'Program ini tidak bersambung. Log masuk di Tetapan → AI dan cuba lagi.',
  errNotAccepted: 'Baca nota di atas dan sahkan dahulu.',
  errUnsafeTools:
    'Program dimulakan dengan alat yang tidak diberikan oleh aplikasi, jadi ia dihentikan.',
  errRateLimit: 'Had langganan anda telah habis. Cuba lagi kemudian.',
  errSignedOut: 'Program telah log keluar. Log masuk di Tetapan → AI.',
  errMetered: 'Program log masuk dengan akaun bayar ikut penggunaan yang belum anda terima.',
  errSandboxUnavailable:
    'Codex tidak dapat membuka kotak pasir yang mengurung arahannya pada PC ini, jadi ia tidak dimulakan. Kemas kini Windows, atau pilih Claude Code.',
  errNeedsUpdate: 'Program terlalu lama untuk mod ejen. Kemas kini dan cuba lagi.',
  errNotInstalled: 'Program tidak dipasang.',
  errGeneric: 'Berlaku masalah. Cuba lagi.',
  documentsUnprotected:
    'Dokumen yang dibuka selepas sesi dimulakan ({n}) tidak dilindungi oleh perlindungan tulis program itu sendiri. Hentikan dan mulakan semula sesi untuk melindunginya.',
} satisfies Record<keyof typeof zh, string>
