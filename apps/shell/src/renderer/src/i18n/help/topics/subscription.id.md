# Koneksi langganan

GenOffice menjalankan AI dengan langganan yang sudah Anda miliki: langganan Claude (Anthropic) atau langganan Codex (OpenAI). Codex adalah program buatan OpenAI, dan Anda masuk ke dalamnya dengan paket ChatGPT Anda. Anda tidak memerlukan kunci API, dan GenOffice tidak punya akun sendiri yang harus Anda daftarkan.

## Cara kerjanya

- AI tidak tertanam di dalam GenOffice. Sebuah program dari perusahaan itu terpasang di PC ini — **Claude Code** untuk langganan Claude, **Codex** untuk langganan ChatGPT — dan GenOffice meminta jawaban kepada program tersebut.
- Program itu masuk dengan akun Anda sendiri, sehingga setiap permintaan dihitung ke paket Anda sendiri.
- GenOffice tidak pernah menampilkan formulir masuk miliknya sendiri, dan tidak pernah membaca atau menyimpan data login Anda. Anda masuk di program dan halaman web milik perusahaan itu sendiri.

## Sebelum mulai

Anda memerlukan salah satu dari ini. Memiliki keduanya juga boleh.

- Langganan Claude (paket Pro atau Max; akun Claude gratis tidak bisa terhubung), serta program Claude Code yang terpasang dan sudah masuk di PC ini.
- Langganan ChatGPT, serta program Codex yang terpasang dan sudah masuk di PC ini.

Jika programnya belum terpasang, atau belum masuk, tombol-tombol di bagian berikutnya akan mengurusnya.

## Menghubungkan

1. Buka **Pengaturan** dari baris di kiri bawah Beranda, lalu pilih **AI**. Di bawah **Koneksi langganan** ada satu kartu untuk Claude dan satu untuk Codex.
2. Baca tulisan pada kartu, lalu tekan tombolnya. Tabel di bawah menjelaskan setiap keadaan.
3. Kembalilah ke jendela GenOffice. Kartu memeriksa ulang dengan sendirinya, dan **Periksa lagi** memeriksa saat itu juga.

Di langkah kedua layar selamat datang saat aplikasi pertama kali dijalankan, dan di panel AI ketika belum ada AI yang terhubung, Anda lebih dulu ditanya "AI apa yang sudah Anda gunakan?". Pilih langganan Claude berbayar, ChatGPT, atau belum punya keduanya, lalu hanya langkah jalur itu (Pasang program → Masuk → Terhubung) dan satu kartunya yang ditampilkan. **Pilih cara lain** memungkinkan Anda memilih ulang, dan Anda bisa melewati semuanya lalu menghubungkan nanti. Jika masih belum terhubung, tekan **Salin info untuk bantuan** dan kirim hasil salinannya ke orang yang membantu Anda. Isinya tidak memuat akun maupun jalur file.

| Tulisan pada kartu                             | Artinya                                                                                                      | Yang perlu dilakukan                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Memeriksa…**                                 | GenOffice sedang menanyakan keadaan program itu.                                                             | Tunggu sebentar.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| **Belum terpasang**                            | Program tidak ditemukan di PC ini.                                                                           | Tekan **Pasang**. Perintah pemasangan resmi dari perusahaan itu dijalankan di jendela terminal baru, sehingga Anda bisa melihat apa yang dilakukannya. GenOffice sendiri tidak mengunduh apa pun. Untuk memasang secara manual, **Panduan pemasangan resmi** membuka petunjuk dari perusahaan itu.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| **Belum masuk**                                | Programnya ada, tetapi belum ada yang masuk.                                                                 | Tekan **Masuk**. Halaman masuk perusahaan terbuka di browser Anda: masuk di sana dan izinkan akses, lalu kartu tersambung sendiri. Tidak perlu terburu-buru; proses masuk bisa memakan waktu. Jika browser sama sekali tidak terbuka, tekan **Browser tidak terbuka?** pada kartu (setelah 25 detik tombol itu berubah menjadi tombol **Buka jendela masuk**). Jangan menekannya saat Anda masih sedang masuk di browser: tombol itu menghentikan proses masuk tersebut dan memulai lagi dari awal. Jendela masuk yang terbuka mencantumkan langkah-langkahnya di bagian atas. Untuk menempelkan kode ke jendela itu, klik kanan di dalam jendela, lalu tekan Enter. Kode yang ditempel memang tidak terlihat, itu normal; jika muncul "Invalid code", tempelkan kode itu lagi ke jendela yang sama. Untuk berhenti masuk, tekan **Batalkan masuk**. |
| **Terhubung**                                  | Login dengan langganan sudah dipastikan. Nama paket ditampilkan bila program melaporkannya.                  | Tidak ada. AI siap dipakai.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| **Sudah masuk, tetapi bukan dengan langganan** | Program masuk dengan kunci API atau akun bayar sesuai pemakaian, atau jenis loginnya tidak dapat dipastikan. | Lihat "Login bayar sesuai pemakaian" di bawah.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| **Koneksi tidak dapat diperiksa**              | Pemeriksaannya sendiri gagal. Alasannya ditampilkan pada kartu.                                              | Tekan **Periksa lagi**. Jika tertulis bahwa programnya terlalu lama, tekan **Perbarui**: pembaruan resmi dari perusahaan itu berjalan di jendela baru. Setelah selesai di sana, kembali ke GenOffice.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |

Koneksi diperiksa saat aplikasi dimulai, saat Anda membuka Pengaturan, dan saat Anda kembali ke jendela setelah memulai pemasangan atau proses masuk.

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

Saat program sudah masuk, kartunya menampilkan akun yang sedang dipakai di samping nama paket, bila program melaporkannya. Kartu itu juga punya dua tombol.

- **Masuk dengan akun lain** memulai lagi proses masuk milik program itu sendiri. Selesaikan di jendela yang terbuka, dengan akun yang lain.
- **Keluar** menjalankan proses keluar milik program itu sendiri. Setelah itu kartu menampilkan **Belum masuk**.
- Keduanya berlaku untuk program itu di seluruh PC ini, bukan hanya di GenOffice. Jika Anda juga memakai Claude Code atau Codex di terminal, di sana program itu ikut keluar atau berpindah ke akun yang lain. Karena itu GenOffice meminta konfirmasi Anda lebih dulu.
- Akun dan kedua tombol ini hanya ada di sini, di Pengaturan ▸ AI. GenOffice hanya menampilkan akun itu dan tidak menyimpannya di mana pun.

## AI mana yang dipakai

**AI yang digunakan**, di Pengaturan ▸ AI, awalnya diatur ke **Otomatis**. Mode Otomatis memutuskan dengan urutan ini:

1. Claude, bila kartunya bertuliskan Terhubung.
2. Kalau tidak, Codex, bila kartunya bertuliskan Terhubung.
3. Kalau tidak, belum ada AI yang terhubung, dan panel AI menampilkan panduan koneksi, bukan pesan galat.

Mode Otomatis tidak pernah memilih apa pun yang menimbulkan biaya tambahan: bukan kunci API, dan bukan login bayar sesuai pemakaian. Keduanya hanya dipakai selama Anda sendiri yang memilihnya.

Anda juga bisa memilih sendiri satu AI, di tempat yang sama atau di daftar model di bagian bawah panel AI. Jika AI pilihan Anda berhenti berfungsi, GenOffice tidak diam-diam pindah ke AI lain. GenOffice memberi tahu apa yang terjadi dan menunjukkan cara menghubungkan kembali.

Daftar model menampilkan model yang dilaporkan program itu sendiri: masing-masing dengan namanya dan ID model persisnya di sebelahnya, dan **Model bawaan** menyebutkan model yang sedang diwakilinya. Label di bagian bawah panel AI dan **AI yang digunakan** juga menyebut model itu. Membaca daftar ini tidak menanyakan apa pun kepada AI, jadi tidak dihitung dalam paket Anda. Jika program terlalu lama untuk melaporkan modelnya, yang ditampilkan adalah daftar singkat bawaan aplikasi.

Di mana pun Codex bisa dipilih, satu baris ditampilkan bersamanya: "Memakai langganan Codex di dalam aplikasi bukan cara yang direkomendasikan secara resmi oleh OpenAI." Putuskan dengan mempertimbangkan hal itu.

## Ketika permintaan dihentikan

Permintaan berhenti ketika batas paket habis, ketika sesi masuk berakhir, atau ketika programnya sudah tidak ada. GenOffice tidak beralih sendiri ke AI lain.

- Alasannya ditampilkan di tempat balasan terhenti. Untuk batas yang habis, waktu pengaturan ulangnya juga ditampilkan, bila program melaporkannya.
- Jika langganan Anda yang lain terhubung, muncul tombol **Lanjutkan dengan …**, misalnya **Lanjutkan dengan Codex**. Menekannya menjadikan langganan itu AI yang digunakan — daftar model menunjukkan perubahannya — lalu menjalankan permintaan itu lagi.
- Jika satu-satunya koneksi lain adalah login bayar sesuai pemakaian yang sudah Anda izinkan, tombol yang sama disertai catatan tentang biayanya.
- Tidak pernah ada tombol yang memindahkan Anda ke kunci API.

## Baris pemakaian

Setelah Anda memakai 80% atau lebih dari sebuah batas, panel AI menampilkan baris seperti "85% terpakai · diatur ulang pada 15.00". Claude melaporkan batas 5 jam dan batas 7 hari, dan Codex ditampilkan dengan cara yang sama bila melaporkannya. Di bawah 80%, atau bila program tidak melaporkan apa pun, tidak ada baris yang ditampilkan.

## Apa yang dikirim, dan ke mana

Saat langganan pertama kali bisa dipakai, GenOffice menampilkan pemberitahuan satu kali. Untuk membacanya lagi, buka Pengaturan ▸ AI ▸ **Pemberitahuan koneksi pertama** lalu tekan **Lihat lagi**. Isinya tiga hal:

- Isi dokumen dan percakapan Anda dikirim ke Anthropic atau OpenAI dengan akun Anda sendiri.
- Apakah isi itu dipakai untuk melatih AI ditentukan oleh pengaturan akun Anda sendiri di perusahaan tersebut, bukan oleh GenOffice.
- GenOffice mematikan penyimpanan riwayat percakapan Codex, tetapi Codex masih dapat menyimpan log diagnostiknya sendiri di PC ini.

Apa pun yang Anda sembunyikan dengan **Sembunyikan seleksi dari AI** tidak dikirim, AI mana pun yang Anda pakai.

## Baik untuk diketahui

- **Kecepatan.** Balasan lewat langganan dimulai beberapa detik lebih lambat daripada lewat kunci API, karena program perusahaan itu harus dijalankan lebih dulu.
- **Paket ChatGPT gratis.** Paket ini tampil sebagai Terhubung, tetapi batasnya kecil, sehingga permintaan lebih cepat terhenti. Baris pemakaian tidak muncul untuk paket ini.
- **Pembuatan gambar.** Pada versi ini langganan tidak membuat gambar, di paket mana pun. Untuk itu diperlukan kunci penyedia gambar; lihat [Model AI dan pengaturan](help://ai-models).
- **Proxy.** Claude Code dan Codex tidak mengambil pengaturan proxy dari GenOffice. Keduanya memakai proxy yang diatur untuk PC ini, misalnya variabel lingkungan `HTTPS_PROXY`, sama seperti saat Anda menjalankannya di terminal. Jika keduanya tidak bisa terhubung di terminal, dari sini pun tidak bisa.
- **Perintah dan program lain.** Permintaan yang datang dari perintah `ieumoffice` atau dari agen pemrograman yang terhubung tidak memakai langganan Anda kecuali Anda mengizinkannya. Lihat [Menghubungkan agen coding](help://mcp).
