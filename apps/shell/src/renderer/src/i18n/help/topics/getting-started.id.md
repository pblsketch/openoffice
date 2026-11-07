# Mulai cepat: antarmuka dan dasar-dasarnya

GenOffice adalah rangkaian perkantoran yang berjalan di komputer Anda: satu jendela, satu deret tab, dengan delapan editor — Docs (pemrosesan kata), Sheets (spreadsheet), Slides (presentasi), PDF, Markdown dan teks biasa, HTML, HWP/HWPX (dokumen Hangul), dan peta pikiran (.xmind). Setiap editor membuka dan menyimpan file dalam formatnya sendiri: .docx, .xlsx, .pptx, .pdf, .md, .html, .hwp/.hwpx, dan .xmind. Menyunting tidak memerlukan jaringan; fitur AI memerlukannya. Editor peta pikiran juga mengimpor file FreeMind dan Freeplane (.mm) sebagai peta baru, yang disimpan sebagai .xmind.

## Sekilas antarmuka

Jendela ini terdiri dari tiga bagian:

- **Bilah tab (atas)**: setiap file yang terbuka adalah sebuah tab. Tab Beranda paling kiri selalu ada dan tidak bisa ditutup; tab lainnya adalah dokumen Anda. Klik dua kali sebuah tab untuk mengganti nama file-nya secara langsung.
- **Area konten**: editor (atau Beranda) milik tab yang sedang aktif.
- **Bilah menu**: pada menu bar sistem di macOS, di bagian atas jendela pada Windows/Linux. Menu File/Edit/Tampilan berganti mengikuti editor yang aktif.

## Membuat dokumen

Pilih salah satu:

- Klik salah satu kartu pembuatan cepat di bagian [Mulai cepat](help://getting-started) pada **Beranda** (AI Docs, AI Sheets, AI Slides, ...).
- Menu **File ▸ Baru**: Docs (⌘N/ctrl+N), Sheets, Slides, Markdown, HTML, atau PDF.
- Seret sebuah file ke jendela, atau klik dua kali di aplikasi file Anda (jika GenOffice adalah aplikasi default).

Dokumen baru terbuka tanpa nama; file di disk baru dibuat saat disimpan pertama kali.

## Membuka file

- Menu **File ▸ Buka…** (⌘O/ctrl+O) membuka pemilih file sistem: .docx / .doc / .odt / .xlsx / .xls / .csv / .tsv / .pptx / .ppt / .pdf / .md / .html.
- Klik apa pun di daftar **Terbaru** pada Beranda.
- `ieumoffice <file>` dari terminal juga dapat membuka file.

## Dokumen ODT

File .odt (teks OpenDocument, format yang disimpan Hancom Office, LibreOffice, dan program lain) terbuka di tab Docs, dari semua tempat yang bisa membuka .docx. Dokumen baru tetap berformat .docx.

- **Berjalan seperti biasa**: mengedit teks, format karakter dan paragraf, tabel (menambah dan menghapus baris serta kolom, menggabung dan memisah sel), gambar, header dan footer, catatan kaki dan catatan akhir, pengaturan halaman dan bagian, poin dan penomoran, gaya judul, tautan, cari dan ganti, ejaan, cetak, ekspor PDF dan HTML, serta penyuntingan oleh AI.
- **Dimatikan di ODT**: komentar, lacak perubahan, bandingkan, tanda air, tinta, daftar isi, menyisipkan persamaan, bentuk, kotak teks, atau bagan, kolom, kutipan dan bibliografi, keterangan dan referensi silang, warna halaman, kata sandi dan pembatasan pengeditan, anjuran baca-saja, font dan warna tema, margin cermin. Tombolnya tampil abu-abu; simpan sebagai .docx untuk memakainya.
- **Dibiarkan seperti semula**: persamaan, bagan, dan gambar olahan dari dokumen asli tampil sebagai gambar terkunci yang bisa dihapus tetapi tidak bisa diedit, dan sel tabel yang terkunci tetap terkunci. Bagian yang tidak Anda sentuh disimpan kembali tanpa perubahan. ODT yang berkata sandi tidak bisa dibuka; hapus kata sandinya terlebih dahulu.
- **Simpan Sebagai** menawarkan .docx dan .odt. Sebelum mengganti format, aplikasi menampilkan daftar hal yang berubah atau hilang, lalu membuka ulang tab dengan file baru. Markdown dan HTML juga punya **Ekspor sebagai ODT…**.

## Cara kerja penyimpanan

- **Simpan manual**: ⌘S/ctrl+S, atau File ▸ Simpan / Simpan Sebagai. Penyimpanan pertama kali akan meminta lokasi dan nama.
- **Simpan Otomatis** mengikuti tombol di setiap editor (dan nilai bawaan aplikasi). PDF yang hanya Anda baca tidak akan pernah diam-diam ditulis ulang, dan dokumen baru tanpa berkas sendiri mulai disimpan otomatis setelah penyimpanan pertamanya.
- Menutup tab yang belum disimpan akan lebih dulu meminta Simpan / Buang / Batal.
- Setiap penulisan bersifat atomik (file sementara + ganti nama), sehingga kalau listrik mati tidak akan tertinggal file yang hanya separuh.

## Pintasan yang sering dipakai

| Tindakan         | macOS | Windows / Linux |
| ---------------- | ----- | --------------- |
| Dokumen baru     | ⌘N    | ctrl+N          |
| Buka             | ⌘O    | ctrl+O          |
| Simpan           | ⌘S    | ctrl+S          |
| Tutup tab        | ⌘W    | ctrl+W          |
| Buka panduan ini | F1    | F1              |
| Ciutkan Pita     | ⌥⌘R   | Ctrl+F1         |

**Ciutkan Pita** berfungsi di setiap editor. Baris tab tetap ada dan pita perintah di bawahnya tersembunyi; tab yang sedang dipilih sekaligus menjadi kendali pencetakan, sehingga selama pita terlipat tidak ada tab yang dipilih dan menekan tab mana pun mengembalikan pita itu. Klik ganda pada tab melakukan hal yang sama. Cara Anda meninggalkannya diingat per editor. Docs menambah kepadatan menengah: **⌥⌘K** / Ctrl+Alt+K memampatkan pita menjadi ikon saja, diingat dengan cara yang sama.

Pintasan di dalam tiap editor (penyalin format, cari dan ganti, operasi tabel, ...) ada di bab masing-masing; Docs juga menyediakan dialog pintasan papan tikik yang bisa dicari (**⌘/**) (lihat babnya).

## Pintasan Option+Command

Option+Command adalah lapisan yang dicadangkan Word untuk lompatan terstruktur, dan GenOffice mengisinya dengan cara yang sama. Docs mengambil sebagian besarnya, Sheets mengambil dua miliknya sendiri demi kesetaraan dengan Excel, dan satu pintasan berlaku di mana-mana.

**Docs**

| Pintasan (macOS) | Fungsinya              | Windows / Linux    |
| ---------------- | ---------------------- | ------------------ |
| ⌥⌘1 / ⌥⌘2 / ⌥⌘3  | Judul 1 / 2 / 3        | Ctrl+Alt+1 / 2 / 3 |
| ⌥⌘0              | Normal                 | Ctrl+Alt+0         |
| ⌥⌘M              | Paragraf               | Ctrl+Alt+M         |
| ⌥⌘A              | Komentar Baru          | Ctrl+Alt+A         |
| ⌥⌘F              | Sisipkan Catatan Kaki  | Ctrl+Alt+F         |
| ⌥⌘E              | Sisipkan Catatan Akhir | Ctrl+Alt+D         |
| ⌥⌘G              | Pergi ke               | Ctrl+G             |

Dua di antaranya berpindah di Windows, karena alasan yang sama seperti saat Word memisahkannya. **macOS memiliki ⌥⌘D** — ia menampilkan dan menyembunyikan Dock — sehingga catatan akhir memakai ⌥⌘E di Mac dan Ctrl+Alt+D di tempat lain. Dan **Pergi ke** melepas Alt: Ctrl+G, sedangkan pintasan di Mac tetap membawanya.

**Sheets**, selagi kisi memiliki fokus

| Pintasan (macOS) | Fungsinya   | Windows / Linux |
| ---------------- | ----------- | --------------- |
| ⌥⌘0              | Batas luar  | Ctrl+Shift+7    |
| ⌥⌘−              | Tanpa batas | Ctrl+Shift+−    |

Windows bukan tulis ulang pasangan Mac. Excel for Mac memberi Sheets **keduanya** — ⌘⇧7 dan ⌥⌘0 adalah dua tombol untuk batas luar yang sama — sehingga di Windows perintah itu tetap memakai slot Ctrl+Shift yang memang sudah dimilikinya, dan lapisan Option memang tidak ada.

Perhatikan bahwa **⌥⌘0 berarti Normal di Docs dan Batas luar di Sheets**. Keduanya tidak pernah muncul di editor yang sama, jadi tidak ada benturan dalam pemakaian, tetapi ⌥⌘0 sudah terpakai dan tidak tersedia sebagai pintasan global.

**Setiap editor**: **⌥⌘R / Ctrl+F1** melipat pita, seperti yang dijelaskan di atas.

Dengan begitu ⌥⌘D tetap bebas untuk dipakai GenOffice di macOS, bila suatu perintah memutuskan membutuhkannya.

## Ke mana selanjutnya

- Letak file Anda: [Layar Beranda](help://home-screen).
- Mengelola banyak file terbuka: [Tab dan pengelolaan jendela](help://tabs-and-windows).
- Membiarkan AI mengerjakan pekerjaan: [Panel asisten AI](help://ai-panel).
- Menghubungkan AI lebih dulu: [Koneksi langganan](help://subscription).
- Bahasa, tema, aplikasi default: [Pengaturan, bahasa, tema, dan integrasi MCP](help://settings-integrations).
