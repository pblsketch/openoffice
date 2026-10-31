import type { zh } from './zh'

export const id = {
  windowTitle: 'Agen',
  homeCardSub: 'Bekerja di folder dengan Claude Code atau Codex',
  intro:
    'Agen menjalankan Claude Code atau Codex Anda di folder yang Anda pilih. Agen dapat membaca file di sana, membuat file baru, memakai skill Anda, menjalankan skrip, dan mengubah dokumen yang terbuka di GenOffice.',
  folderLabel: 'Folder proyek',
  folderPick: 'Pilih folder…',
  folderNone: 'Belum ada folder yang dipilih',
  recentLabel: 'Folder terbaru',
  providerLabel: 'Program',
  providerClaude: 'Claude Code',
  providerCodex: 'Codex',
  providerClaudeNote:
    'Di Windows, perintah yang Anda izinkan berjalan tanpa isolasi dan dapat menjangkau seluruh PC Anda serta internet.',
  providerCodexNote:
    'Perintah berjalan di ruang terisolasi Codex: hanya folder proyek yang dapat ditulisi, dan tidak ada internet.',
  providerBlocked: 'Belum tersedia: Codex belum dapat dicegah membaca file masuknya sendiri.',
  connChecking: 'Memeriksa koneksi…',
  connUnavailable: 'Tidak terhubung. Masuk di Pengaturan → AI.',
  connMetered: 'Masuk dengan login bayar per pemakaian yang sudah Anda setujui.',
  modeLabel: 'Kapan bertanya kepada Anda',
  modeAskCommands: 'Tanya sebelum setiap perintah',
  modeAskCommandsDesc:
    'Membaca dan menulis file di folder proyek langsung dilakukan. Sebelum menjalankan perintah atau skrip, agen bertanya dulu.',
  modeAskWrites: 'Tanya sebelum menulis dan menjalankan perintah',
  modeAskWritesDesc:
    'Hanya membaca yang langsung dilakukan. Sebelum menulis file dan sebelum menjalankan perintah, agen bertanya dulu.',
  modeTrust: 'Percayai proyek ini',
  modeTrustDesc:
    'Tidak ada pertanyaan. Codex tetap berada di ruang terisolasinya; pada Claude Code, pemeriksanya sendiri yang memeriksa setiap tindakan menggantikan Anda.',
  warningTitle: 'Sebelum mulai',
  warningCommands:
    'Perintah yang dijalankan agen dapat mengubah file dan memakai internet. Dokumen yang dikirim orang lain kepada Anda bisa berisi instruksi tersembunyi.',
  warningRedaction:
    'Bagian yang Anda sembunyikan dari AI hanya tetap tersembunyi di dokumen yang terbuka di GenOffice. File yang dibaca agen dari folder dikirim apa adanya.',
  warningUsage:
    'Agen bekerja dalam banyak langkah dan memakai lebih banyak kuota langganan Anda dibandingkan panel AI.',
  warningAccept: 'Saya mengerti',
  start: 'Mulai',
  starting: 'Memulai…',
  stop: 'Hentikan',
  newSession: 'Sesi baru',
  send: 'Kirim',
  inputPlaceholder: 'Apa yang harus dilakukan agen?',
  you: 'Anda',
  agent: 'Agen',
  startedLine: '{program} dimulai di {folder}',
  skillsLine: '{n} skill tersedia',
  skillsLineOne: '{n} skill tersedia',
  toolRunning: 'Sedang berjalan',
  toolDone: 'Selesai',
  toolFailed: 'Gagal',
  toolDenied: 'Ditolak',
  actRead: 'Baca',
  actWrite: 'Tulis',
  actCommand: 'Jalankan',
  actAppTool: 'Edit dokumen yang terbuka',
  actSkill: 'Pakai skill',
  actOther: 'Pakai alat',
  openFile: 'Buka',
  permTitle: 'Agen meminta izin untuk:',
  permCommand: 'Menjalankan perintah ini',
  permWrite: 'Menulis file ini',
  permRead: 'Membaca file di luar folder proyek',
  permOther: 'Memakai alat “{tool}”',
  permReason: 'Alasan: {reason}',
  permAllow: 'Izinkan',
  permDeny: 'Tolak',
  turnFailed: 'Agen tidak dapat menyelesaikan permintaan ini.',
  ended: 'Sesi telah berakhir.',
  errBadFolder:
    'Folder ini tidak dapat dipakai. Pilih folder berisi pekerjaan Anda sendiri: bukan seluruh drive, bukan folder pengguna Anda, dan bukan folder data login atau data aplikasi.',
  errNotConnected: 'Program ini tidak terhubung. Masuk di Pengaturan → AI, lalu coba lagi.',
  errNotAccepted: 'Baca catatan di atas dan konfirmasikan terlebih dahulu.',
  errUnsafeTools:
    'Program dimulai dengan alat yang tidak diberikan aplikasi, jadi program dihentikan.',
  errRateLimit: 'Kuota langganan Anda sudah habis. Coba lagi nanti.',
  errSignedOut: 'Program sudah keluar dari akun. Masuk di Pengaturan → AI.',
  errMetered: 'Program masuk dengan login bayar per pemakaian yang belum Anda setujui.',
  errSandboxUnavailable:
    'Codex tidak dapat membuka sandbox yang mengurung perintahnya di PC ini, jadi tidak dijalankan. Perbarui Windows, atau pilih Claude Code.',
  errNeedsUpdate: 'Versi program terlalu lama untuk mode agen. Perbarui program, lalu coba lagi.',
  errNotInstalled: 'Program belum terpasang.',
  errGeneric: 'Terjadi masalah. Coba lagi.',
  documentsUnprotected:
    'Dokumen yang dibuka setelah sesi dimulai ({n}) tidak tercakup perlindungan tulis program itu sendiri. Hentikan dan mulai ulang sesi untuk melindunginya.',
} satisfies Record<keyof typeof zh, string>
