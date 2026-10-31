import type { zh } from './zh'

export const ms = {
  driveNav: 'Google Drive',
  driveDesc:
    'Pilih fail dalam Google Drive, kemudian buka dan edit dalam GenOffice; apabila disimpan, fail kembali ke Drive. GenOffice hanya boleh membuka fail yang anda pilih.',
  driveConnect: 'Sambungkan Google Drive',
  driveConnecting: 'Log masuk dengan akaun Google anda dalam pelayar dan benarkan akses…',
  driveCancel: 'Batal',
  driveConnectedAs: 'Disambungkan sebagai {email}',
  driveDisconnect: 'Putuskan sambungan',
  driveDisconnectConfirm:
    'Ini membuang log masuk Drive daripada PC ini dan meminta Google menarik balik akses GenOffice. Salinan yang sudah ada pada PC ini kekal.',
  driveDisconnectYes: 'Putuskan sambungan',
  driveNotPersisted:
    'PC ini tidak dapat menyimpan log masuk secara tersulit, jadi sambungan tamat apabila aplikasi ditutup.',
  driveExpired:
    'Google menamatkan sambungan: akses ditarik balik atau log masuk tamat tempoh. Sambung semula.',
  driveAiAccess: 'Benarkan AI mencari dan membaca fail dalam Drive',
  driveAiAccessDesc:
    'Apabila dihidupkan, AI dalam editor boleh mencari dan membaca fail Drive yang anda pilih di sini. Apa yang dibacanya dihantar kepada penyedia AI yang anda gunakan. AI tidak boleh mengubah, memadam atau berkongsi fail Drive.',
  drivePrivacy:
    'Senarai dan kandungan fail hanya bergerak antara PC ini dan Google. Ia tidak pernah melalui pelayan pembuat GenOffice.',
  driveFailDenied: 'Sambungan gagal kerana Google tidak membenarkannya.',
  driveFailScope:
    'Sambungan gagal kerana akses Drive tidak ditanda. Sambung semula dan tandakan item Drive.',
  driveFailTimeout: 'Log masuk tidak selesai dalam 10 minit. Cuba lagi.',
  driveFailNetwork: 'Google tidak dapat dihubungi. Semak sambungan internet anda dan cuba lagi.',
  driveRecent: 'Fail yang anda pilih',
  driveSearchPlaceholder: 'Cari dalam fail yang anda pilih',
  driveSearchResults: 'Hasil untuk “{q}”',
  driveRefresh: 'Muat semula',
  driveNotConnectedTitle: 'Google Drive belum disambungkan',
  driveNotConnectedBody:
    'Selepas disambungkan, anda boleh memilih fail Drive, membuka dan mengeditnya di sini, dan apabila disimpan fail kembali ke Drive.',
  driveOpenSettings: 'Sambungkan dalam Tetapan',
  driveEmpty: 'Belum ada fail. Klik “Pilih daripada Google Drive” untuk memilih fail.',
  driveLoading: 'Memuatkan…',
  driveLoadMore: 'Tunjukkan lagi',
  driveOpening: 'Membuka…',
  driveGoogleBadge: 'Format Google',
  driveGoogleNote:
    'Dokumen Google dibuka sebagai fail Office. Apabila disimpan, yang asal kekal seperti biasa dan fail Office disimpan di sebelahnya, atau dalam Drive Saya.',
  driveReadOnly: 'Lihat sahaja',
  driveReadOnlyNote:
    'Anda tidak boleh mengedit fail ini. Apabila menyimpan, anda akan ditanya sama ada mahu menyimpan salinan ke Drive.',
  driveUnsupported: 'Aplikasi ini tidak dapat membuka jenis fail ini.',
  driveErrNotConnected: 'Google Drive telah diputuskan. Sambung semula dalam Tetapan.',
  driveErrNotFound: 'Fail tidak ditemui. Ia telah dipadam, atau akaun ini tidak dapat melihatnya.',
  driveErrForbidden: 'Akaun ini tidak dibenarkan memuat turun fail ini.',
  driveErrTooLarge: 'Fail terlalu besar untuk dibuka.',
  driveErrRateLimit: 'Google menahan permintaan seketika. Cuba lagi sebentar nanti.',
  driveErrNetwork: 'Google Drive tidak dapat dihubungi. Semak sambungan internet anda.',
  driveErrDisk: 'Fail tidak dapat disimpan pada PC ini.',
  drivePick: 'Pilih daripada Google Drive',
  drivePicking: 'Pilih fail dalam tetingkap Google yang terbuka dalam pelayar anda…',
  drivePickNote:
    'GenOffice hanya boleh membuka fail Drive yang anda pilih dalam tetingkap Google. Fail yang pernah anda pilih kekal dalam senarai ini.',
  driveTrainingTitle: 'Sebelum menggunakan fail Drive dengan AI',
  driveTrainingBody:
    'Google tidak membenarkan fail Drive dihantar kepada perkhidmatan AI yang menggunakannya untuk melatih modelnya. Pelan peribadi Claude, ChatGPT dan Codex mungkin menggunakan sembang anda untuk latihan melainkan anda mematikannya: dalam Claude di Tetapan → Privasi, dalam ChatGPT di Tetapan → Kawalan data → “Improve the model for everyone”. Penyedia kunci API secara lalai tidak melatih model dengan data API. Sambungan AI percuma tidak pernah diberi fail Drive.',
  driveTrainingAck:
    'Latihan model telah dimatikan dalam akaun AI yang saya gunakan dengan fail Drive',
  driveFailTraining: 'Tandakan dahulu item tentang latihan model di atas.',
} satisfies Record<keyof typeof zh, string>
