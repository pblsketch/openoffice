import type { zh } from './zh'

export const id = {
  aiAssistant: 'Asisten AI',
  cardChecking: 'Memeriksa…',
  cardNotInstalled: 'Belum terpasang',
  cardSignedOut: 'Belum masuk',
  cardSigningIn: 'Sedang masuk…',
  cardReady: 'Terhubung',
  cardReadyPlan: 'Terhubung · {plan}',
  cardMetered: 'Sudah masuk, tetapi bukan dengan langganan',
  cardMeteredAccepted: 'Sedang dipakai · ditagih sesuai pemakaian',
  cardError: 'Koneksi tidak dapat diperiksa',
  cardErrNeedsUpdate: 'Program {provider} di PC ini terlalu lama. Perbarui, lalu periksa lagi.',
  cardErrNeedsUpdateVersion:
    'Program {provider} di PC ini ({version}) terlalu lama; diperlukan versi {minimum} atau yang lebih baru. Jalankan {command} di terminal, lalu periksa lagi.',
  cardErrNeedsUpdatePath: 'File yang dijalankan aplikasi ini:',
  cardErrNeedsUpdateWindows:
    'Memperbarui {provider} di dalam WSL (Ubuntu) atau di folder lain tidak mengubah file ini. Jalankan {command} di Windows PowerShell.',
  cardErrTimeout: 'Program {provider} tidak menjawab tepat waktu. Periksa lagi sebentar lagi.',
  cardErrFailed: 'Terjadi masalah saat memeriksa {provider}. Periksa lagi.',
  actionInstall: 'Pasang',
  actionLogin: 'Masuk',
  actionLoginWindow: 'Browser tidak terbuka?',
  actionRecheck: 'Periksa lagi',
  actionAcceptMetered: 'Tetap gunakan',
  actionInstallHelp: 'Panduan pemasangan resmi',
  actionOpenSettings: 'Buka pengaturan',
  actionDismiss: 'Tutup',
  actionSwitchAccount: 'Masuk dengan akun lain',
  actionLogout: 'Keluar',
  installNote: 'Perintah pemasangan resmi dari {vendor} dijalankan di jendela terminal baru.',
  loginNote: 'Halaman masuk yang terbuka adalah milik {vendor}.',
  signingInBrowserNote:
    'Masuk ke akun {vendor} Anda di browser yang terbuka, lalu izinkan akses. Koneksi akan tersambung sendiri setelah selesai.',
  signingInWindowNote:
    'Ikuti panduan di bagian atas jendela masuk yang baru terbuka. Masuk di halaman {vendor} yang terbuka di browser Anda: jendela itu lalu tertutup sendiri dan koneksi tersambung. Halaman masuk yang sudah terbuka sebelumnya tidak berlaku lagi; tutup saja.',
  meteredWarning: 'Ini bukan langganan: Anda ditagih sesuai pemakaian.',
  meteredMeaning:
    'Login ini memakai kunci API atau akun bayar sesuai pemakaian, atau jenisnya tidak dapat dipastikan. Dengan "Tetap gunakan", AI berjalan melalui koneksi ini dan setiap permintaan ditagihkan ke akun tersebut.',
  connectTitle: 'Hubungkan AI untuk memulai',
  connectBody:
    'AI berjalan dengan langganan Claude atau Codex yang sudah Anda miliki. Kunci API tidak diperlukan.',
  connectProviderTitle: 'Koneksi {provider} belum bisa dipakai saat ini',
  connectKeyBody:
    'Penyiapan {provider} belum selesai. Selesaikan di Pengaturan, atau pilih AI lain.',
  errNotConnected:
    'Belum ada AI yang terhubung. Hubungkan dulu langganan Claude atau Codex, atau AI gratis.',
  errNotInstalled: 'Program {provider} tidak ditemukan di PC ini.',
  errSignedOut: 'Sesi masuk {provider} sudah berakhir. Masuk lagi untuk melanjutkan.',
  errRateLimit: 'Batas langganan {provider} sudah habis.',
  errRateLimitReset: 'Batas langganan {provider} sudah habis. Batas diatur ulang pada {time}.',
  errUnsafeTools:
    'Program {provider} dimulai dengan alat bawaannya masih aktif, sehingga proses dihentikan demi keamanan.',
  errMeteredNotAccepted:
    'Koneksi {provider} ditagih sesuai pemakaian dan belum Anda izinkan. Pilih "Tetap gunakan" di pengaturan koneksi untuk memakainya.',
  errNeedsUpdate: 'Program {provider} terlalu lama untuk fitur ini. Perbarui lalu coba lagi.',
  errHeadlessLimit: 'Batas per jam untuk permintaan otomatis sudah tercapai.',
  errHeadlessLimitReset:
    'Batas per jam untuk permintaan otomatis sudah tercapai. Permintaan bisa dilakukan lagi pada {time}.',
  connectFreeHint:
    'Tidak punya langganan? Anda bisa menghubungkan AI gratis di Pengaturan dalam sekitar satu menit.',
  actionConnectFree: 'Hubungkan AI gratis',
  errFreeLimit:
    'Jatah gratis hari ini sudah habis. Coba lagi besok, atau pilih AI lain di Pengaturan.',
  errFreeLimitReset: 'Jatah gratis hari ini sudah habis. Anda bisa memakainya lagi pada {time}.',
  continueWith: 'Lanjutkan dengan {provider}',
  continueMeteredNote:
    'Koneksi {provider} bukan langganan: melanjutkan akan ditagih sesuai pemakaian.',
  usageLine: '{percent}% terpakai · diatur ulang pada {time}',
  usageWindowFiveHour: 'Batas 5 jam',
  usageWindowSevenDay: 'Batas 7 hari',
  noticeTitle: 'Sebelum memakai AI dengan langganan Anda',
  noticeSend:
    'Isi dokumen dan percakapan Anda dikirim ke Anthropic atau OpenAI dengan akun Anda sendiri. Setiap permintaan juga membawa nama, judul, dan deskripsi setiap skill yang disetel ke "AI yang menentukan"; skill yang dipakai dan file skill yang dibaca AI juga ikut dikirim.',
  noticeTraining:
    'Apakah isi itu dipakai untuk melatih AI ditentukan oleh pengaturan akun Anda sendiri di perusahaan tersebut.',
  noticeCodexHistory:
    'Aplikasi ini mematikan penyimpanan riwayat percakapan Codex, tetapi Codex masih dapat menyimpan log diagnostiknya sendiri di PC ini.',
  noticePdfWholeDocument:
    'Di editor PDF, pembacaan halaman dengan AI dan terjemahan dokumen dapat mengirim gambar halaman dan seluruh teks dokumen.',
  noticeAck: 'Mengerti',
  codexNotice:
    'Memakai langganan Codex di dalam aplikasi bukan cara yang direkomendasikan secara resmi oleh OpenAI.',
  truncatedNotice: 'Masukan terlalu panjang, sehingga sebagian dipotong sebelum dikirim.',
  pickerAuto: 'Otomatis',
  pickerAutoUsing: 'Otomatis · {provider}',
  pickerAutoUsingModel: 'Otomatis · {provider} · {model}',
  pickerDefaultModel: 'Model bawaan',
  pickerDefaultModelNamed: 'Model bawaan · {model}',
  pickerSubscription: 'Langganan',
  pickerPaid: 'Berbayar',
  pickerPaidTitle: 'Ditagih sesuai pemakaian, tidak termasuk dalam langganan',
  pickerNotConnected: 'Hubungkan AI',
  guideQuestion: 'AI apa yang sudah Anda gunakan?',
  guidePathClaudeTitle: 'Saya punya langganan Claude berbayar',
  guidePathClaudeBody: 'Perlu paket Pro atau Max. Akun Claude gratis tidak bisa terhubung.',
  guidePathCodexTitle: 'Saya memakai ChatGPT',
  guidePathCodexBody:
    'Masuk ke program Codex dari OpenAI dengan akun ChatGPT Anda. Paket gratis hanya memberi sedikit pemakaian.',
  guidePathFreeTitle: 'Belum punya keduanya',
  guidePathFreeBody:
    'Hubungkan AI gratis dalam sekitar satu menit. Selama Anda memakainya secara gratis, konten yang Anda kirim dapat digunakan untuk meningkatkan AI perusahaan tersebut.',
  guideBack: 'Pilih cara lain',
  guideBadgeReady: 'Terhubung',
  guideBadgeInstalled: 'Terpasang',
  guideBadgeCheck: 'Perlu dicek',
  guideStepsLabel: 'Langkah koneksi',
  stepInstall: 'Pasang program',
  stepLogin: 'Masuk',
  stepReady: 'Terhubung',
  installReturnNote:
    'Setelah pemasangan di jendela itu selesai, kembali ke sini. Aplikasi akan memeriksa lagi dengan sendirinya.',
  loginHowNote:
    'Browser akan terbuka saat Anda menekannya. Masuk dengan akun {vendor} Anda dan tekan Izinkan; koneksi akan selesai dengan sendirinya.',
  signingInStalledNote:
    'Jika halaman masuk tidak terbuka di browser Anda, buka jendela masuk dengan tombol di bawah. Jika Anda masih sedang masuk di browser, selesaikan saja di sana: tombol ini menghentikan proses masuk itu dan memulai lagi dari awal.',
  actionLoginWindowOpen: 'Buka jendela masuk',
  loginWindowTitle: 'Masuk ke {provider}',
  loginWindowIntro:
    'Ini jendela masuk program {provider}. Teks berbahasa Inggris di bawah berasal dari program {provider}.',
  loginWindowStepBrowser:
    'Saat halaman masuk {vendor} terbuka di browser Anda, masuk lalu izinkan akses. Setelah itu jendela ini tertutup sendiri.',
  loginWindowStepAddress:
    'Jika browser tidak terbuka, seret mouse pada alamat di bawah yang diawali https:// untuk memilihnya, lalu klik kanan untuk menyalinnya. Tempelkan alamat itu ke bilah alamat browser untuk membuka halaman masuk.',
  loginWindowStepCode:
    'Jika browser menampilkan kode setelah Anda masuk, salin seluruh kodenya (gunakan tombol salin jika ada). Klik kanan sekali di dalam jendela ini untuk menempelkannya, lalu tekan Enter. Kode yang ditempel memang tidak terlihat; itu normal.',
  loginWindowStepInvalid:
    'Jika muncul "Invalid code", berarti kode tidak tersalin seluruhnya. Biarkan jendela ini tetap terbuka, salin kodenya lagi, lalu tempelkan.',
  loginWindowClosing:
    'Proses masuk belum selesai. Setelah membaca pesan di atas, tekan Enter untuk menutup jendela ini. Untuk mencoba lagi, tekan lagi tombol masuk.',
  actionCancelLogin: 'Batalkan masuk',
  actionUpdate: 'Perbarui',
  updateNote:
    'Saat Anda menekannya, pembaruan resmi dari {vendor} berjalan di jendela baru. Setelah selesai di sana, kembali ke sini.',
  guideInfoHint:
    'Masih belum berhasil? Salin info koneksi dan kirim ke orang yang membantu Anda. Info ini tidak berisi akun maupun jalur file.',
  actionCopyInfo: 'Salin info untuk bantuan',
  copyInfoDone: 'Disalin',
  actionConnectHelp: 'Lihat setiap langkah di layar (halaman berbahasa Korea)',
} satisfies Record<keyof typeof zh, string>
