import type { zh } from './zh'

export const id = {
  driveNav: 'Google Drive',
  driveDesc:
    'Pilih file di Google Drive, lalu buka dan edit di GenOffice; saat disimpan, file dikembalikan ke Drive. GenOffice hanya dapat membuka file yang Anda pilih.',
  driveConnect: 'Hubungkan Google Drive',
  driveConnecting: 'Masuk dengan akun Google Anda di browser dan izinkan akses…',
  driveCancel: 'Batal',
  driveConnectedAs: 'Terhubung sebagai {email}',
  driveDisconnect: 'Putuskan',
  driveDisconnectConfirm:
    'Ini menghapus login Drive dari PC ini dan meminta Google mencabut akses GenOffice. Salinan yang sudah ada di PC ini tetap tersimpan.',
  driveDisconnectYes: 'Putuskan',
  driveNotPersisted:
    'PC ini tidak dapat menyimpan login secara terenkripsi, jadi koneksi berakhir saat aplikasi ditutup.',
  driveExpired: 'Google mengakhiri koneksi: akses dicabut atau login kedaluwarsa. Hubungkan lagi.',
  driveAiAccess: 'Izinkan AI mencari dan membaca file di Drive',
  driveAiAccessDesc:
    'Jika aktif, AI di editor dapat mencari dan membaca file Drive yang Anda pilih di sini. Yang dibacanya dikirim ke penyedia AI yang Anda gunakan. AI tidak dapat mengubah, menghapus, atau membagikan file Drive.',
  drivePrivacy:
    'Daftar dan isi file hanya berpindah antara PC ini dan Google. Tidak pernah melewati server pembuat GenOffice.',
  driveFailDenied: 'Koneksi gagal karena Google tidak mengizinkannya.',
  driveFailScope:
    'Koneksi gagal karena akses Drive tidak dicentang. Hubungkan lagi dan centang item Drive.',
  driveFailTimeout: 'Login tidak selesai dalam 10 menit. Coba lagi.',
  driveFailNetwork: 'Google tidak dapat dihubungi. Periksa koneksi internet Anda dan coba lagi.',
  driveRecent: 'File yang Anda pilih',
  driveSearchPlaceholder: 'Cari di file yang Anda pilih',
  driveSearchResults: 'Hasil untuk “{q}”',
  driveRefresh: 'Muat ulang',
  driveNotConnectedTitle: 'Google Drive belum terhubung',
  driveNotConnectedBody:
    'Setelah terhubung, Anda dapat memilih file Drive, membuka dan mengeditnya di sini, dan saat disimpan file dikembalikan ke Drive.',
  driveOpenSettings: 'Hubungkan di Pengaturan',
  driveEmpty: 'Belum ada file. Klik “Pilih dari Google Drive” untuk memilih file.',
  driveLoading: 'Memuat…',
  driveLoadMore: 'Tampilkan lebih banyak',
  driveOpening: 'Membuka…',
  driveGoogleBadge: 'Format Google',
  driveGoogleNote:
    'Dokumen Google dibuka sebagai file Office. Saat disimpan, aslinya tetap seperti semula dan file Office disimpan di sebelahnya, atau di Drive Saya.',
  driveReadOnly: 'Hanya lihat',
  driveReadOnlyNote:
    'Anda tidak dapat mengedit file ini. Saat menyimpan, Anda akan ditanya apakah ingin menyimpan salinan ke Drive.',
  driveUnsupported: 'Aplikasi ini tidak dapat membuka jenis file ini.',
  driveErrNotConnected: 'Google Drive terputus. Hubungkan lagi di Pengaturan.',
  driveErrNotFound:
    'File tidak ditemukan. File telah dihapus, atau akun ini tidak dapat melihatnya.',
  driveErrForbidden: 'Akun ini tidak diizinkan mengunduh file ini.',
  driveErrTooLarge: 'File terlalu besar untuk dibuka.',
  driveErrRateLimit: 'Google sedang menahan permintaan sebentar. Coba lagi sesaat lagi.',
  driveErrNetwork: 'Google Drive tidak dapat dihubungi. Periksa koneksi internet Anda.',
  driveErrDisk: 'File tidak dapat disimpan di PC ini.',
  drivePick: 'Pilih dari Google Drive',
  drivePicking: 'Pilih file di jendela Google yang terbuka di browser Anda…',
  drivePickNote:
    'GenOffice hanya dapat membuka file Drive yang Anda pilih di jendela Google. File yang pernah Anda pilih tetap ada di daftar ini.',
  driveTrainingTitle: 'Sebelum memakai file Drive dengan AI',
  driveTrainingBody:
    'Google tidak mengizinkan file Drive dikirim ke layanan AI yang memakainya untuk melatih modelnya. Paket pribadi Claude, ChatGPT, dan Codex dapat memakai percakapan Anda untuk pelatihan kecuali Anda mematikannya: di Claude pada Pengaturan → Privasi, di ChatGPT pada Pengaturan → Kontrol data → “Improve the model for everyone”. Penyedia kunci API secara bawaan tidak melatih model dengan data API. Koneksi AI gratis tidak pernah diberi file Drive.',
  driveTrainingAck: 'Pelatihan model sudah dimatikan di akun AI yang saya pakai dengan file Drive',
  driveFailTraining: 'Centang dulu item tentang pelatihan model di atas.',
} satisfies Record<keyof typeof zh, string>
