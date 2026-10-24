import type { zh } from './zh'

export const ms = {
  aiAssistant: 'Pembantu AI',
  cardChecking: 'Sedang menyemak…',
  cardNotInstalled: 'Belum dipasang',
  cardSignedOut: 'Belum log masuk',
  cardSigningIn: 'Sedang log masuk…',
  cardReady: 'Disambungkan',
  cardReadyPlan: 'Disambungkan · {plan}',
  cardMetered: 'Sudah log masuk, tetapi bukan dengan langganan',
  cardMeteredAccepted: 'Sedang digunakan · dicaj mengikut penggunaan',
  cardError: 'Sambungan tidak dapat disemak',
  cardErrNeedsUpdate:
    'Program {provider} pada PC ini terlalu lama. Kemas kini, kemudian semak semula.',
  cardErrNeedsUpdateVersion:
    'Program {provider} pada PC ini ({version}) terlalu lama; versi {minimum} atau lebih baharu diperlukan. Jalankan {command} dalam terminal, kemudian semak semula.',
  cardErrNeedsUpdatePath: 'Fail yang dijalankan oleh aplikasi ini:',
  cardErrNeedsUpdateWindows:
    'Mengemas kini {provider} di dalam WSL (Ubuntu) atau dalam folder lain tidak mengubah fail ini. Jalankan {command} dalam Windows PowerShell.',
  cardErrTimeout:
    'Program {provider} tidak menjawab dalam masa yang ditetapkan. Semak semula sebentar lagi.',
  cardErrFailed: 'Masalah berlaku semasa menyemak {provider}. Semak semula.',
  actionInstall: 'Pasang',
  actionLogin: 'Log masuk',
  actionLoginWindow: 'Pelayar tidak dibuka, atau menunjukkan kod?',
  actionRecheck: 'Semak semula',
  actionAcceptMetered: 'Guna juga',
  actionInstallHelp: 'Panduan pemasangan rasmi',
  actionOpenSettings: 'Buka tetapan',
  actionDismiss: 'Tutup',
  actionSwitchAccount: 'Log masuk dengan akaun lain',
  actionLogout: 'Log keluar',
  installNote: 'Arahan pemasangan rasmi {vendor} dijalankan dalam tetingkap terminal baharu.',
  loginNote: 'Halaman log masuk yang dibuka ialah milik {vendor}.',
  signingInBrowserNote:
    'Log masuk ke akaun {vendor} anda dalam pelayar yang dibuka, kemudian benarkan akses. Sambungan akan dibuat sendiri apabila selesai.',
  signingInWindowNote:
    'Jika pelayar tidak dibuka, salin alamat yang ditunjukkan dalam tetingkap yang baru dibuka dan bukanya dalam pelayar. Apabila pelayar menunjukkan kod, salin dan tampalkannya sekali ke tetingkap itu, kemudian tekan Enter. Kod yang ditampal mungkin tidak kelihatan dalam tetingkap.',
  meteredWarning: 'Ini bukan langganan: anda dicaj mengikut penggunaan.',
  meteredMeaning:
    'Log masuk ini menggunakan kunci API atau akaun bayar ikut guna, atau jenisnya tidak dapat disahkan. Dengan "Guna juga", AI berjalan melalui sambungan ini dan setiap permintaan dicaj kepada akaun tersebut.',
  connectTitle: 'Sambungkan AI untuk bermula',
  connectBody:
    'AI berjalan dengan langganan Claude atau Codex yang anda sudah ada. Kunci API tidak diperlukan.',
  connectProviderTitle: 'Sambungan {provider} tidak boleh digunakan sekarang',
  connectKeyBody:
    'Persediaan {provider} belum selesai. Lengkapkannya dalam Tetapan, atau pilih AI lain.',
  errNotConnected:
    'Tiada AI yang disambungkan. Sambungkan langganan Claude atau Codex, atau AI percuma, dahulu.',
  errNotInstalled: 'Program {provider} tidak ditemui pada PC ini.',
  errSignedOut: 'Log masuk {provider} telah tamat. Log masuk semula untuk meneruskan.',
  errRateLimit: 'Had langganan {provider} telah habis digunakan.',
  errRateLimitReset:
    'Had langganan {provider} telah habis digunakan. Had ditetapkan semula pada {time}.',
  errUnsafeTools:
    'Program {provider} bermula dengan alatnya sendiri masih aktif, jadi proses dihentikan demi keselamatan.',
  errMeteredNotAccepted:
    'Sambungan {provider} dicaj mengikut penggunaan dan anda belum membenarkannya. Pilih "Guna juga" dalam tetapan sambungan untuk menggunakannya.',
  errNeedsUpdate: 'Program {provider} terlalu lama untuk ciri ini. Kemas kini dan cuba lagi.',
  errHeadlessLimit: 'Had sejam bagi permintaan automatik telah dicapai.',
  errHeadlessLimitReset:
    'Had sejam bagi permintaan automatik telah dicapai. Permintaan boleh dibuat semula pada {time}.',
  connectFreeHint:
    'Tiada langganan? Anda boleh menyambungkan AI percuma dalam Tetapan dalam masa kira-kira seminit.',
  actionConnectFree: 'Sambungkan AI percuma',
  errFreeLimit:
    'Peruntukan percuma hari ini telah habis. Cuba lagi esok, atau pilih AI lain dalam Tetapan.',
  errFreeLimitReset:
    'Peruntukan percuma hari ini telah habis. Anda boleh menggunakannya semula pada {time}.',
  continueWith: 'Teruskan dengan {provider}',
  continueMeteredNote:
    'Sambungan {provider} bukan langganan: meneruskan akan dicaj mengikut penggunaan.',
  usageLine: '{percent}% digunakan · ditetapkan semula pada {time}',
  usageWindowFiveHour: 'Had 5 jam',
  usageWindowSevenDay: 'Had 7 hari',
  noticeTitle: 'Sebelum menggunakan AI dengan langganan anda',
  noticeSend:
    'Kandungan dokumen dan perbualan anda dihantar kepada Anthropic atau OpenAI di bawah akaun anda sendiri. Setiap permintaan juga membawa nama, tajuk dan penerangan setiap kemahiran yang ditetapkan kepada "AI tentukan"; kemahiran yang digunakan dan fail kemahiran yang dibaca oleh AI turut dihantar.',
  noticeTraining:
    'Sama ada kandungan itu digunakan untuk melatih AI ditentukan oleh tetapan akaun anda sendiri di syarikat tersebut.',
  noticeCodexHistory:
    'Aplikasi ini mematikan penyimpanan sejarah perbualan Codex, tetapi Codex mungkin masih menyimpan log diagnostiknya sendiri pada PC ini.',
  noticePdfWholeDocument:
    'Dalam editor PDF, bacaan halaman dengan AI dan terjemahan dokumen mungkin menghantar imej halaman dan seluruh teks dokumen.',
  noticeAck: 'Faham',
  codexNotice:
    'Menggunakan langganan Codex di dalam aplikasi bukan kaedah yang disyorkan secara rasmi oleh OpenAI.',
  truncatedNotice: 'Input terlalu panjang, jadi sebahagiannya dipotong sebelum dihantar.',
  pickerAuto: 'Automatik',
  pickerAutoUsing: 'Automatik · {provider}',
  pickerAutoUsingModel: 'Automatik · {provider} · {model}',
  pickerDefaultModel: 'Model lalai',
  pickerDefaultModelNamed: 'Model lalai · {model}',
  pickerSubscription: 'Langganan',
  pickerPaid: 'Berbayar',
  pickerPaidTitle: 'Dicaj mengikut penggunaan, tidak diliputi langganan',
  pickerNotConnected: 'Sambungkan AI',
  guideQuestion: 'AI mana yang sudah anda gunakan?',
  guidePathClaudeTitle: 'Saya ada langganan Claude berbayar',
  guidePathClaudeBody:
    'Memerlukan pelan Pro atau Max. Akaun Claude percuma tidak boleh disambungkan.',
  guidePathCodexTitle: 'Saya guna ChatGPT',
  guidePathCodexBody:
    'Log masuk ke program Codex OpenAI dengan akaun ChatGPT anda. Pelan percuma hanya membenarkan sedikit penggunaan.',
  guidePathFreeTitle: 'Belum ada kedua-duanya',
  guidePathFreeBody:
    'Sambungkan AI percuma dalam masa kira-kira seminit. Semasa anda menggunakannya secara percuma, kandungan yang anda hantar mungkin digunakan untuk menambah baik AI syarikat itu.',
  guideBack: 'Pilih cara lain',
  guideBadgeReady: 'Disambungkan',
  guideBadgeInstalled: 'Dipasang',
  guideBadgeCheck: 'Perlu disemak',
  guideStepsLabel: 'Langkah sambungan',
  stepInstall: 'Pasang program',
  stepLogin: 'Log masuk',
  stepReady: 'Disambungkan',
  installReturnNote:
    'Apabila pemasangan dalam tetingkap itu selesai, kembali ke sini. Aplikasi akan menyemak semula dengan sendiri.',
  loginHowNote:
    'Pelayar akan dibuka apabila anda menekannya. Log masuk dengan akaun {vendor} anda dan tekan Benarkan; sambungan akan selesai dengan sendiri.',
  signingInStalledNote:
    'Pelayar tidak dibuka, atau menunjukkan kod? Buka tetingkap log masuk dengan butang di bawah. Tampalkan alamat yang ditunjukkan dalam tetingkap itu ke pelayar, atau tampalkan kod daripada pelayar ke tetingkap.',
  actionLoginWindowOpen: 'Buka tetingkap log masuk',
  actionCancelLogin: 'Batalkan log masuk',
  actionUpdate: 'Kemas kini',
  updateNote:
    'Apabila anda menekannya, kemas kini rasmi {vendor} dijalankan dalam tetingkap baharu. Apabila selesai di sana, kembali ke sini.',
  guideInfoHint:
    'Masih tidak berjaya? Salin maklumat sambungan dan hantar kepada orang yang membantu anda. Maklumat ini tidak mengandungi akaun atau laluan fail.',
  actionCopyInfo: 'Salin maklumat untuk bantuan',
  copyInfoDone: 'Disalin',
  actionConnectHelp: 'Lihat setiap langkah pada skrin (halaman dalam bahasa Korea)',
} satisfies Record<keyof typeof zh, string>
