# Koneksi langganan

GenOffice menjalankan AI dengan langganan yang sudah Anda miliki: langganan Claude (Anthropic) atau paket ChatGPT (OpenAI). ChatGPT terhubung langsung di GenOffice; jika Anda sudah memakai program Codex buatan OpenAI di PC ini, Anda bisa menghubungkannya lewat Codex sebagai gantinya. Anda tidak memerlukan kunci API, dan GenOffice tidak punya akun sendiri yang harus Anda daftarkan.

## Cara kerjanya

- AI tidak tertanam di dalam GenOffice. Claude berjalan lewat program **Claude Code** yang terpasang di PC ini: GenOffice meminta jawaban kepada program tersebut, dan program itu masuk dengan akun Anda sendiri, sehingga setiap permintaan dihitung ke paket Anda sendiri.
- ChatGPT dihubungkan oleh GenOffice sendiri, tanpa program apa pun. Masuklah di halaman masuk ChatGPT milik OpenAI yang terbuka di browser Anda, lalu izinkan aplikasi ini memakai paket ChatGPT Anda. Permintaan dikirim dari PC ini langsung ke OpenAI, dan pemakaiannya diambil dari paket ChatGPT tersebut.
- **Codex** adalah program buatan OpenAI. Bila ChatGPT dihubungkan lewat Codex, GenOffice meminta jawaban kepada program Codex, sama seperti dengan Claude Code.
- GenOffice tidak punya formulir masuk sendiri di dalam aplikasi. Anda masuk di program milik perusahaan itu sendiri, atau di halaman web perusahaan itu yang terbuka di browser Anda. GenOffice tidak pernah membaca atau menyimpan data login Claude Code maupun Codex. Satu-satunya data masuk yang disimpan GenOffice adalah yang diberikan OpenAI kepada aplikasi ini saat Anda menghubungkan ChatGPT secara langsung, dan data itu tetap berada di PC ini (dienkripsi di Windows). GenOffice tidak pernah melihat kata sandi ChatGPT Anda.

## Sebelum mulai

Anda memerlukan salah satu dari ini. Memiliki keduanya juga boleh.

- Langganan Claude (paket Pro atau Max; akun Claude gratis tidak bisa terhubung), serta program Claude Code yang terpasang dan sudah masuk di PC ini.
- Paket ChatGPT. Jika dihubungkan langsung, tidak ada program yang perlu dipasang. Paket gratis hanya memungkinkan sedikit pemakaian. Jika Anda sudah memakai program Codex di PC ini, Anda bisa menghubungkannya lewat Codex sebagai gantinya.

Jika Claude Code atau Codex belum terpasang, atau belum masuk, tombol-tombol di bagian berikutnya akan mengurusnya.

## Menghubungkan

1. Buka **Pengaturan** dari baris di kiri bawah Beranda, lalu pilih **AI**. Di bawah **Koneksi langganan** ada kartu untuk Claude, ChatGPT, dan Codex, dengan urutan itu. Jika Anda punya paket ChatGPT, hubungkan di kartu ChatGPT. Kartu Codex ditujukan bagi yang memakai program Codex di PC ini.
2. Baca tulisan pada kartu, lalu tekan tombolnya. Tabel di bawah menjelaskan setiap keadaan.
3. Kembalilah ke jendela GenOffice. Kartu memeriksa ulang dengan sendirinya, dan **Periksa lagi** memeriksa saat itu juga.

Di langkah kedua layar selamat datang saat aplikasi pertama kali dijalankan, dan di panel AI ketika belum ada AI yang terhubung, Anda lebih dulu ditanya "AI apa yang sudah Anda gunakan?". Pilih langganan Claude berbayar, ChatGPT, atau belum punya keduanya, lalu hanya langkah jalur itu dan satu kartunya yang ditampilkan. Untuk Claude, langkahnya Pasang program → Masuk → Terhubung; untuk ChatGPT, Masuk → Terhubung. Di jalur ChatGPT, **Sudah memakai program Codex di PC ini? Hubungkan dengan Codex** beralih ke jalur Codex (Pasang program → Masuk → Terhubung), dan **Hubungkan langsung di aplikasi, tanpa Codex** di jalur itu membawa Anda kembali ke koneksi langsung. Jika Codex sudah terhubung, jalur Codex ditampilkan sejak awal. **Pilih cara lain** memungkinkan Anda memilih ulang, dan Anda bisa melewati semuanya lalu menghubungkan nanti. Jika masih belum terhubung, tekan **Salin info untuk bantuan** dan kirim hasil salinannya ke orang yang membantu Anda. Isinya tidak memuat akun maupun jalur file.

| Tulisan pada kartu                             | Artinya                                                                                                                        | Yang perlu dilakukan                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Memeriksa…**                                 | GenOffice sedang menanyakan keadaan program itu.                                                                               | Tunggu sebentar.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| **Belum terpasang**                            | Program tidak ditemukan di PC ini.                                                                                             | Tekan **Pasang**. Perintah pemasangan resmi dari perusahaan itu dijalankan di jendela terminal baru, sehingga Anda bisa melihat apa yang dilakukannya. GenOffice sendiri tidak mengunduh apa pun. Untuk memasang secara manual, **Panduan pemasangan resmi** membuka petunjuk dari perusahaan itu.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| **Belum masuk**                                | Programnya ada, tetapi belum ada yang masuk.                                                                                   | Tekan **Masuk**. Halaman masuk perusahaan terbuka di browser Anda: masuk di sana dan izinkan akses, lalu kartu tersambung sendiri. Tidak perlu terburu-buru; proses masuk bisa memakan waktu. Jika browser sama sekali tidak terbuka, tekan **Browser tidak terbuka?** pada kartu (setelah 25 detik tombol itu berubah menjadi tombol **Buka jendela masuk**). Jangan menekannya saat Anda masih sedang masuk di browser: tombol itu menghentikan proses masuk tersebut dan memulai lagi dari awal. Jendela masuk yang terbuka mencantumkan langkah-langkahnya di bagian atas. Untuk menempelkan kode ke jendela itu, klik kanan di dalam jendela, lalu tekan Enter. Kode yang ditempel memang tidak terlihat, itu normal; jika muncul "Invalid code", tempelkan kode itu lagi ke jendela yang sama. Untuk berhenti masuk, tekan **Batalkan masuk**. |
| **Terhubung**                                  | Login dengan langganan sudah dipastikan. Nama paket ditampilkan bila program melaporkannya.                                    | Tidak ada. AI siap dipakai.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| **Sudah masuk, tetapi bukan dengan langganan** | Program masuk dengan kunci API atau akun bayar sesuai pemakaian, atau jenis loginnya tidak dapat dipastikan.                   | Lihat "Login bayar sesuai pemakaian" di bawah.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| **Koneksi tidak dapat diperiksa**              | Pemeriksaannya sendiri gagal. Alasannya ditampilkan pada kartu.                                                                | Tekan **Periksa lagi**. Jika tertulis bahwa programnya terlalu lama, tekan **Perbarui**: pembaruan resmi dari perusahaan itu berjalan di jendela baru. Setelah selesai di sana, kembali ke GenOffice.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| **Dimatikan di aplikasi ini**                  | Anda mematikan program itu untuk aplikasi ini di pengaturan. Aplikasi tidak memeriksanya dan tidak mengirim apa pun kepadanya. | Tekan **Pakai lagi**. Aplikasi memeriksa program itu lagi lalu memakainya.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |

Kartu ChatGPT tidak melewati program apa pun, sehingga tidak pernah bertuliskan **Belum terpasang** atau **Sudah masuk, tetapi bukan dengan langganan**. Bila bertuliskan **Belum masuk**, tekan **Lanjutkan dengan ChatGPT**: halaman masuk ChatGPT milik OpenAI terbuka di browser Anda. Masuklah dan izinkan aplikasi ini memakai paket ChatGPT Anda, maka kartu berubah menjadi **Terhubung** dengan sendirinya. Jika Anda tidak mengizinkannya, atau prosesnya tidak selesai dalam 10 menit, kartu menyatakan proses masuk belum selesai; menekan tombolnya lagi akan memulai dari awal. Tidak ada jendela masuk dan tidak ada kode yang perlu ditempel. Selama proses masuk berlangsung, **Batalkan masuk** menghentikannya.

Koneksi diperiksa saat aplikasi dimulai, saat Anda membuka Pengaturan, dan saat Anda kembali ke jendela setelah memulai pemasangan atau proses masuk.

Jika kartu Claude atau Codex menyatakan proses masuk belum selesai, pilih **Buka jendela masuk**. Kode yang ditampilkan browser harus ditempel di jendela itu; kode yang muncul sebelumnya sudah tidak berlaku.

Jika halaman browser atau jendela masuk menampilkan `3p_delegated_access_policy_denied`, mungkin ada kebijakan pada akun Claude yang memblokir proses masuk ini. Jika dicoba lagi hasilnya tetap sama, tanyakan kepada orang yang mengelola akun itu, atau periksa apakah akun lain bisa dipakai.

## Tanpa langganan: AI gratis

Tidak punya langganan Claude atau ChatGPT? Di Pengaturan ▸ AI, **Pakai gratis** menghubungkan AI gratis sebagai gantinya. Memilih **Belum punya keduanya** di langkah kedua layar selamat datang menampilkan kartu yang sama, dan memilihnya di panel AI ketika belum ada yang terhubung menawarkan **Hubungkan AI gratis**.

- **OpenRouter**: tekan **Hubungkan di browser**. Browser Anda membuka OpenRouter; daftar atau masuk, lalu izinkan akses. Setelah browser menyatakan sudah terhubung, tutup tab itu dan kembalilah. Tidak ada kunci yang perlu disalin, dan kartu menampilkan sisa permintaan gratis hari ini.
- **Google Gemini**: tekan **Dapatkan kunci**, buat kunci di Google AI Studio, tempelkan ke kartu, lalu tekan **Hubungkan**. Hanya untuk yang berusia 18 tahun ke atas. Kunci yang dibuat di proyek Google dengan penagihan aktif bisa dikenai biaya.
- Setelah terhubung, AI itu menjadi **AI yang digunakan**. Jika keduanya terhubung, **Pakai AI ini** di kartu akan beralih di antara keduanya. **Putuskan** menghapus kunci dari GenOffice.
- Model gratis lebih lemah daripada model langganan, dan jumlah permintaan per hari terbatas. Satu kali pengeditan dokumen bisa memakai beberapa permintaan. Saat jatah hari ini habis, panel AI memberitahukannya, beserta kapan AI itu bisa dipakai lagi.
- Selama Anda memakainya secara gratis, apa yang Anda kirim bisa dipakai untuk meningkatkan AI perusahaan itu. Berhati-hatilah dengan dokumen yang berisi data pribadi.

## Login bayar sesuai pemakaian

Kartu yang bertuliskan **Sudah masuk, tetapi bukan dengan langganan** memuat peringatan: "Ini bukan langganan: Anda ditagih sesuai pemakaian."

- GenOffice tidak memakai login itu sampai Anda menekan **Tetap gunakan**. Sejak saat itu, setiap permintaan ditagihkan ke akun tersebut.
- Bahkan setelah itu, login tersebut tidak pernah dipilih secara otomatis. Pilih sendiri di **AI yang digunakan**, tempat login itu ditandai **Berbayar**.
- Izin Anda diingat hanya untuk program itu. Izin dihapus ketika program tersebut keluar dari akun atau loginnya berubah.
- Untuk memakai langganan Anda saja, masuklah di program itu dengan akun langganan Anda lalu tekan **Periksa lagi**.

## Mengganti akun atau keluar

Kartu yang sudah masuk menampilkan akun yang sedang dipakai. Kartu Claude dan Codex juga menampilkan nama paket, bila program melaporkannya. Dua tombol lagi juga muncul.

- **Masuk dengan akun lain** memulai lagi proses masuk milik program itu sendiri. Selesaikan di jendela yang terbuka, dengan akun yang lain.
- **Keluar** menjalankan proses keluar milik program itu sendiri. Setelah itu kartu menampilkan **Belum masuk**.
- Di kartu Claude dan Codex, keduanya berlaku untuk program itu di seluruh PC ini, bukan hanya di GenOffice. Jika Anda juga memakai Claude Code atau Codex di terminal, di sana program itu ikut keluar atau berpindah ke akun yang lain. Karena itu GenOffice meminta konfirmasi Anda lebih dulu.
- Kartu Claude dan Codex juga punya **Jangan pakai di aplikasi ini**. Program dan login-nya tetap seperti semula, hanya GenOffice yang berhenti memakainya: tidak ada pemeriksaan status, tidak ada permintaan, dan **Otomatis** melewatinya. Pemakaiannya di terminal tidak berubah. Kartu lalu menampilkan **Dimatikan di aplikasi ini**, dan **Pakai lagi** menyalakannya kembali. Keduanya tidak meminta konfirmasi karena tidak ada yang berubah di luar GenOffice.
- Kartu ChatGPT berbeda. **Keluar** meminta konfirmasi Anda dengan "Tindakan ini memutus koneksi ChatGPT dari aplikasi ini"; setelah Anda mengonfirmasi, GenOffice meminta OpenAI mengakhiri koneksi aplikasi ini dan menghapus data masuk yang disimpannya di PC ini. **Masuk dengan akun lain** langsung membuka halaman masuk di browser Anda, tanpa bertanya. Keduanya tidak memengaruhi program lain di PC ini, termasuk Codex.
- Kartu ChatGPT yang terhubung bertuliskan "AI di aplikasi ini berjalan dengan paket ChatGPT Anda" dan punya tautan **Kelola pemakaian**. Tautan itu membuka halaman pemakaian di pengaturan ChatGPT Anda, tempat Anda bisa melihat seberapa banyak aplikasi ini memakai paket Anda dan menetapkan batas khusus untuk aplikasi ini saja.
- Akun dan kedua tombol ini hanya ada di sini, di Pengaturan ▸ AI. GenOffice hanya menampilkan akun itu dan tidak menyimpannya di mana pun.

## AI mana yang dipakai

**AI yang digunakan**, di Pengaturan ▸ AI, awalnya diatur ke **Otomatis**. Mode Otomatis memutuskan dengan urutan ini:

1. Claude, bila kartunya bertuliskan Terhubung.
2. Kalau tidak, ChatGPT, bila kartunya bertuliskan Terhubung.
3. Kalau tidak, Codex, bila kartunya bertuliskan Terhubung.
4. Kalau tidak, belum ada AI yang terhubung, dan panel AI menampilkan panduan koneksi, bukan pesan galat.

Mode Otomatis tidak pernah memilih apa pun yang menimbulkan biaya tambahan: bukan kunci API, dan bukan login bayar sesuai pemakaian. Keduanya hanya dipakai selama Anda sendiri yang memilihnya.

Anda juga bisa memilih sendiri satu AI, di tempat yang sama atau di daftar model di bagian bawah panel AI. Jika AI pilihan Anda berhenti berfungsi, GenOffice tidak diam-diam pindah ke AI lain. GenOffice memberi tahu apa yang terjadi dan menunjukkan cara menghubungkan kembali.

Daftar model menampilkan model yang dilaporkan program itu sendiri (untuk ChatGPT, model yang menurut OpenAI dapat dipakai paket Anda; model pertama dipakai sampai Anda memilih salah satunya): masing-masing dengan namanya dan ID model persisnya di sebelahnya, dan **Model bawaan** menyebutkan model yang sedang diwakilinya. Label di bagian bawah panel AI dan **AI yang digunakan** juga menyebut model itu. Membaca daftar ini tidak menanyakan apa pun kepada AI, jadi tidak dihitung dalam paket Anda. Jika program terlalu lama untuk melaporkan modelnya, yang ditampilkan adalah daftar singkat bawaan aplikasi.

Di mana pun Codex bisa dipilih, satu baris ditampilkan bersamanya: "Memakai langganan Codex di dalam aplikasi bukan cara yang direkomendasikan secara resmi oleh OpenAI." Putuskan dengan mempertimbangkan hal itu.

## Ketika permintaan dihentikan

Permintaan berhenti ketika batas paket habis, ketika sesi masuk berakhir, atau ketika programnya sudah tidak ada. GenOffice tidak beralih sendiri ke AI lain.

- Alasannya ditampilkan di tempat balasan terhenti. Untuk batas yang habis, waktu pengaturan ulangnya juga ditampilkan, bila program melaporkannya.
- ChatGPT yang terhubung langsung berhenti ketika batas paket Anda habis, atau batas yang Anda tetapkan untuk aplikasi ini di pengaturan ChatGPT. Waktu pengaturan ulang tidak ditampilkan. Jika Anda memutus koneksi aplikasi ini di pengaturan ChatGPT, kartu berubah menjadi **Belum masuk**; masuklah lagi.
- Jika langganan Anda yang lain terhubung, muncul tombol **Lanjutkan dengan …**, misalnya **Lanjutkan dengan ChatGPT** atau **Lanjutkan dengan Codex**. Menekannya menjadikan langganan itu AI yang digunakan — daftar model menunjukkan perubahannya — lalu menjalankan permintaan itu lagi.
- Jika satu-satunya koneksi lain adalah login bayar sesuai pemakaian yang sudah Anda izinkan, tombol yang sama disertai catatan tentang biayanya.
- Tidak pernah ada tombol yang memindahkan Anda ke kunci API.

## Baris pemakaian

Setelah Anda memakai 80% atau lebih dari sebuah batas, panel AI menampilkan baris seperti "85% terpakai · diatur ulang pada 15.00". Claude melaporkan batas 5 jam dan batas 7 hari, dan Codex ditampilkan dengan cara yang sama bila melaporkannya. Di bawah 80%, atau bila program tidak melaporkan apa pun, tidak ada baris yang ditampilkan. ChatGPT yang terhubung langsung tidak menampilkan baris ini; lihat pemakaiannya lewat **Kelola pemakaian** di kartu ChatGPT.

## Apa yang dikirim, dan ke mana

Saat langganan pertama kali bisa dipakai, GenOffice menampilkan pemberitahuan satu kali. Untuk membacanya lagi, buka Pengaturan ▸ AI ▸ **Pemberitahuan koneksi pertama** lalu tekan **Lihat lagi**. Isinya tiga hal:

- Isi dokumen dan percakapan Anda dikirim ke Anthropic atau OpenAI dengan akun Anda sendiri.
- Apakah isi itu dipakai untuk melatih AI ditentukan oleh pengaturan akun Anda sendiri di perusahaan tersebut, bukan oleh GenOffice.
- GenOffice mematikan penyimpanan riwayat percakapan Codex, tetapi Codex masih dapat menyimpan log diagnostiknya sendiri di PC ini.

Permintaan lewat ChatGPT yang terhubung langsung tidak melewati program Codex; permintaan itu dikirim dari PC ini langsung ke OpenAI.

Apa pun yang Anda sembunyikan dengan **Sembunyikan seleksi dari AI** tidak dikirim, AI mana pun yang Anda pakai.

## Baik untuk diketahui

- **Kecepatan.** Balasan lewat Claude Code atau Codex dimulai beberapa detik lebih lambat daripada lewat kunci API, karena programnya harus dijalankan lebih dulu. ChatGPT yang terhubung langsung tidak menjalankan program apa pun.
- **Paket ChatGPT gratis.** Paket ini tampil sebagai Terhubung, tetapi batasnya kecil, sehingga permintaan lebih cepat terhenti. Baris pemakaian tidak muncul untuk paket ini.
- **Pembuatan gambar.** Pada versi ini langganan tidak membuat gambar, di paket mana pun. Untuk itu diperlukan kunci penyedia gambar; lihat [Model AI dan pengaturan](help://ai-models).
- **Proxy.** Claude Code dan Codex tidak mengambil pengaturan proxy dari GenOffice. Keduanya memakai proxy yang diatur untuk PC ini, misalnya variabel lingkungan `HTTPS_PROXY`, sama seperti saat Anda menjalankannya di terminal. Jika keduanya tidak bisa terhubung di terminal, dari sini pun tidak bisa.
- **Perintah dan program lain.** Permintaan yang datang dari perintah `ieumoffice` atau dari agen pemrograman yang terhubung tidak memakai langganan Anda kecuali Anda mengizinkannya. Bahkan saat diizinkan, permintaan itu memakai Claude Code atau Codex, tidak pernah ChatGPT yang terhubung langsung. Lihat [Menghubungkan agen coding](help://mcp).
- **Mode agen.** [Mode agen](help://agent-mode) menjalankan Claude Code atau Codex di PC ini. ChatGPT yang terhubung langsung tidak bisa menjalankan agen.
