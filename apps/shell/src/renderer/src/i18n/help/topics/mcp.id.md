# Menghubungkan agen coding

GenOffice berbicara dalam Model Context Protocol, jadi agen pemrograman dapat membaca, menulis, dan merender dokumen Anda lewat mesin yang sama dengan yang dipakai aplikasi. Agen itu tidak sedang menebak-nebak format berkas: ia memperoleh skema op bertipe dari definisi yang sama dengan yang dipakai eksekutor untuk memvalidasi.

## Mendaftarkannya dari aplikasi

Inilah tempatnya: **Pengaturan ▸ Integrasi**. Panel ini punya dua bagian, dan Anda bisa memakai salah satunya atau keduanya.

**Skill-nya.** Satu baris per agen pemrograman yang ditemukan di komputer ini — Claude Code, Codex, Cursor, Gemini CLI, Copilot CLI, OpenCode, Windsurf —, masing-masing dengan **Pasang**, **Perbarui**, dan **Hapus**, ditambah **Pasang ke folder lain…**, **Unduh skill (zip)**, dan **Salin path**. Jika asisten Anda tidak ada di daftar, tunjukkan folder tempat ia membaca `SKILL.md` kepada GenOffice, atau simpan zip-nya dan biarkan asisten yang memasangnya. Skill dan MCP bisa berdampingan: asisten memilih salah satu, dan keduanya melakukan hal yang persis sama.

**MCP.** Ada dua jalur yang ditawarkan: **Dijalankan oleh asisten (disarankan)**, tempat Anda menambahkan konfigurasi yang ditampilkan ke klien dan asisten menjalankan servernya sendiri, serta **Server HTTP lokal**, yang dijalankan aplikasi untuk Anda. Cara mana pun, asisten akhirnya berbicara dengan GenOffice dan Anda tidak pernah mengetik satu perintah pun.

## Mendaftarkannya dari baris perintah

Hal yang sama dari sebuah terminal — inilah jalur mahir, dan yang sebaiknya dipakai ketika agen ada di tempat yang tidak bisa ditemukan panel:

```sh
ieumoffice mcp install all
```

Perintah ini menemukan agen pemrograman di komputer ini — Claude Code, Codex, Cursor, Gemini CLI, Copilot CLI, OpenCode, Windsurf — dan menulis entri server stdio ke dalam konfigurasi masing-masing, meninggalkan sisa berkas itu persis seperti ditemukannya. Entri itu bernama `ieumoffice`. Jika dilakukan secara manual untuk Claude Code, pendaftaran yang sama adalah `claude mcp add --transport stdio ieumoffice -- ieumoffice mcp`.

```sh
ieumoffice mcp list             # where each agent stands
ieumoffice mcp install cursor    # just one
ieumoffice mcp uninstall cursor  # take it back out
```

Agen yang Anda pasang di lokasi tidak biasa menerima `--dir <path>`; `--force` menulis ulang entri yang sudah ada di sana.

`ieumoffice mcp --help` menampilkan semua yang diterima server dalam satu layar: bentuk untuk mendaftar, melepas, dan mencantumkan, menyajikan lewat HTTP, serta dua opsi skema.

## Menjalankannya tanpa asisten

Untuk klien di komputer lain, sajikan lewat HTTP sebagai gantinya:

```sh
ieumoffice mcp --http 8765 --token <secret>
```

`--host <addr>` menentukan ke mana ia mendengarkan. Berikan token yang sama kepada kliennya.

Berkas juga bisa lewat HTTP: `PUT /files/<name>` mengunggah satu berkas, setiap alat menerima URL `http(s)` menggantikan path, dan keluarannya kembali sebagai URL unduhan — serta, bila cukup kecil, sebagai resource yang ditanamkan. Op, spec, dan Markdown diteruskan inline baik ke sini maupun ke sana.

## Yang diterima agen

Setiap perintah adalah sebuah alat. Yang menarik:

- **`docs`, `sheet`, `slides`** — membaca dan menyunting berkas lewat jalur tulis milik aplikasi itu sendiri, satu **op** setiap kali. Deck baru berjalan `deck_start`, `deck_page`, `deck_build`.
- **`render`** — satu PNG per halaman, diletakkan oleh perender aplikasi, jadi agen bisa melihat sebuah slide alih-alih menebaknya.
- **`pdf`** — lapisan teks sebuah PDF, halaman demi halaman, tanpa proses aplikasi.
- **`info`** — metadata dan ringkasan struktur, yang biasanya merupakan panggilan pertama yang paling murah untuk berkas yang belum dikenal.
- **`search`, `image`, `media`** — pencarian web dan gambar, pembuatan gambar, dan analisis media lewat apa yang disiapkan di aplikasi, jadi agen tidak memerlukan kunci sendiri. Bagian berikutnya menjelaskan apa yang boleh dipakainya.
- **`merge`** — mengisi templat `{{key}}`.

## Pencarian, gambar, dan media: apa yang boleh dipakai agen

Permintaan dari perintah `ieumoffice` atau dari klien MCP tidak Anda ketik sendiri di aplikasi, jadi GenOffice memperlakukannya dengan hati-hati.

- **Pencarian** selalu berfungsi dan gratis secara bawaan. Kunci penyedia pencarian hanya dipakai jika Anda memilihnya.
- **Membuat gambar** memerlukan kunci penyedia gambar. Pada versi ini langganan tidak membuat gambar.
- **Mendeskripsikan gambar** memakai penyedia berbasis kunci bila ada yang disiapkan. Langganan Claude atau Codex Anda **tidak dipakai kecuali Anda mengizinkannya**.
- **Video dan audio** memerlukan penyedia berbasis kunci yang mendukung video.

Untuk mengizinkan pemakaian langganan, buka Pengaturan ▸ AI ▸ **Lanjutan** lalu aktifkan **Izinkan permintaan otomatis memakai langganan**. Peringatan muncul lebih dulu — "Tidak ada batas per jam, jadi program dapat mengirim permintaan sebanyak yang diinginkan, dan permintaan itu dapat memuat seluruh teks dokumen serta gambar halamannya. Kedua perusahaan tidak menyarankan program memakai langganan Anda secara otomatis, dan akun Anda bisa dibatasi." — dan sakelar baru aktif setelah Anda memilih **Tetap aktifkan**.

Bahkan saat sakelar aktif:

- Permintaan ditangani satu per satu. Yang lain menunggu giliran.
- Tidak ada batas per jam. Giliran dihitung per permintaan, bukan per tugas, sehingga terjemahan PDF yang panjang tetap bergantian dengan pemanggil lain alih-alih menahannya. Sakelar yang diaktifkan dengan peringatan lama sudah dimatikan; baca peringatan baru lalu aktifkan lagi.
- Login bayar sesuai pemakaian yang Anda izinkan dengan **Tetap gunakan** tidak dihitung sebagai langganan di sini. Login itu diperlakukan seperti kunci: jika Anda memilihnya sebagai AI yang digunakan, deskripsi gambar berjalan lewat login itu apa pun posisi sakelarnya, dan masing-masing ditagih.

Jika sakelar nonaktif dan tidak ada kunci yang disiapkan, alat menjawab bahwa fiturnya tidak tersedia dan menyebutkan pengaturan ini. Agen bisa memeriksa lebih dulu dengan alat `capabilities`; lihat [Baris perintah dan agen](help://cli).

## Skema, dan anggaran yang lebih kecil

`apply` dan `create` mengumumkan parameter `ops`, `cells`, dan `data` dengan skema bertipe per-op, yang dibangkitkan dari `ieumoffice guide <domain> --json`. Itu akurat, dan ukurannya tidak kecil. Klien dengan jendela konteks sempit bisa meminta larik biasa sebagai gantinya:

```sh
ieumoffice mcp --compact-schemas
GENOFFICE_MCP_COMPACT_SCHEMAS=1 ieumoffice mcp
```

## Mengapa perlu skill

Agen yang tidak mengenal kosakata op akan menebak. Skill itu membawa referensi dan panduan desain — materi yang sama dengan yang dicetak `ieumoffice guide` —, sehingga asisten menulis op yang spesifikasinya memang sudah dibacanya. Pasang dari panel di atas, atau dengan `ieumoffice skill` dari terminal.

## Apa yang bisa dicapainya di dalam aplikasi

Server itu tidak dibatasi pada berkas di disk. Selama GenOffice berjalan, agen juga bisa bekerja melalui jendela:

- **`open_in_genoffice`** membuka berkas di sebuah tab dan memfokuskannya.
- **`open_documents`** mencantumkan setiap dokumen yang Anda buka — id, jenis, path, dan apakah ada perubahan yang belum disimpan —, lalu membaca isi terkini salah satunya, menyimpannya di tempatnya, atau menutupnya, dengan menyimpan lebih dulu kecuali Anda menyuruhnya membuang.
- **Alat konten** mengambil id itu (atau path-nya) sebagai argumen `document`, sehingga hasil suntingan mendarat di tab yang memang sudah Anda buka, dan jendela beralih menampilkannya.

Dua hal tetap di luar jangkauan: tidak ada panel AI, dan dialog pembaruan di dalam aplikasi tidak berlaku.

## Panel Server HTTP lokal

Di bawah **Server HTTP lokal**, aplikasi menjalankan servernya sendiri alih-alih menyerahkannya kepada asisten: sebuah sakelar pengaktif, kolom **Port**, indikator **Berjalan / Tidak berjalan**, dan **Generasi latar belakang** (menulis dokumen langsung ke sebuah path tanpa membuka UI) dan **Contoh konfigurasi klien** untuk disalin. Membuka **Lanjutan** menambahkan dua URL koneksi — Streamable HTTP dan URL SSE yang lama —, URL **Pemeriksaan kesehatan**, dan sakelar **Pencatuman log** yang mencatat aktivitas server dan alat ke berkas lokal yang dapat Anda **Buka**, **Segarkan**, atau **Hapus** dari sana. Ia hanya mendengarkan di localhost.
