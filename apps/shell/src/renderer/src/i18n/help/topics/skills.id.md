# Skill

Skill adalah sekumpulan petunjuk kerja untuk AI. Tuliskan sekali saja hal yang Anda kerjakan berulang kali — langkah merapikan catatan rapat, gaya bahasa sebuah laporan, hal-hal yang harus diperiksa setiap kali — lalu panggil skill itu di panel AI, atau biarkan AI memakainya sendiri saat cocok. Skill berupa folder berisi file `SKILL.md` dalam format terbuka, sehingga skill yang dibuat di GenOffice juga bisa langsung dipakai di Claude Code atau Codex.

## Mengaktifkan dan menonaktifkan skill

**Pengaturan ▸ Skill** menampilkan skill yang ada di PC ini, dikelompokkan menurut asalnya. Setiap skill ditampilkan dengan namanya, seperti di agen pemrograman. Pakai kotak pencarian di bagian atas untuk mencari menurut nama atau deskripsi.

| Sumber                  | Isinya                                                       | Awalnya  |
| ----------------------- | ------------------------------------------------------------ | -------- |
| **Bawaan**              | 5 skill yang disertakan bersama GenOffice                    | Aktif    |
| **Skill saya**          | Skill yang Anda tambahkan atau buat (`~/.ieumoffice/skills`) | Aktif    |
| **Folder skill Claude** | Skill di `~/.claude/skills`                                  | Nonaktif |
| **Plugin Claude**       | Skill dari plugin Claude yang terpasang                      | Nonaktif |
| **Folder skill Codex**  | Skill di `~/.agents/skills`                                  | Nonaktif |

- Sakelar mengaktifkan atau menonaktifkan skill. Pengaturan yang sama berlaku untuk panel AI di semua editor, Tanya AI di Beranda, dan jendela agen.
- Untuk skill yang aktif, pilih **AI yang menentukan** atau **Hanya saat dipanggil**. Awalnya disetel ke AI yang menentukan. Dengan Hanya saat dipanggil, skill hanya dipakai jika Anda sendiri yang memanggilnya.
- Skill dari sumber yang berbeda bisa bernama sama. Label sumber di setiap baris membedakannya.
- Menu lainnya berisi **Lihat isi**, **Edit** (hanya skill saya), **Ekspor (zip)** (hanya skill saya), dan **Buka folder**.
- **Pindahkan ke tempat sampah** memindahkan salah satu skill saya ke tempat sampah sistem, dan dari sana skill itu bisa dipulihkan.
- Skill bawaan tidak dihapus, melainkan disembunyikan: pilih **Sembunyikan**. **Tampilkan lagi** di bagian bawah daftar mengembalikannya seperti semula.
- Untuk mengubah skill bawaan atau skill dari program lain, pilih **Salin ke skill saya**. Salinannya muncul di skill saya dan skill aslinya dinonaktifkan.
- Saat skill yang memiliki templat diekspor, dokumen templatnya ikut masuk ke file zip. Pastikan dokumen itu tidak berisi informasi pribadi sebelum Anda mengekspornya.

## Menambahkan skill

1. Di **Pengaturan ▸ Skill**, klik **Tambah**.
2. Pilih **Dari folder**, **Dari file zip**, atau **Dari tautan GitHub**. Untuk GitHub, masukkan alamat repositori publik atau `owner/repo`, lalu klik **Cari**.
3. Periksa skill yang ditemukan di pratinjau. Pratinjau menampilkan jumlah dan ukuran file, ada tidaknya skrip, alamat web di dalam teks, dan file lisensi.
4. Centang hanya skill yang ingin dipasang, lalu klik **Pasang**. Skill yang dipasang langsung aktif.

Di bawah pratinjau selalu tertulis: "Pasang skill hanya dari sumber yang Anda percayai. Skill memberi AI instruksi, dan di jendela agen skill dapat menjalankan skrip." Baca dulu skill dari sumber yang tidak dikenal sebelum memasangnya.

- Jika skill saya sudah memiliki skill dengan nama yang sama, pilih **Ganti** atau **Lewati** pada baris tersebut.
- Saat mengunduh dari GitHub, GenOffice hanya terhubung ke `github.com`, `api.github.com`, dan `codeload.github.com`, dan tidak mengirim data login apa pun. Jika arsipnya terlalu besar atau tidak lolos pemeriksaan keamanan, tidak ada yang dipasang.
- **Skill baru** membuka editor kosong tempat Anda menulis sendiri nama, deskripsi, dan petunjuknya.

## Memeriksa pembaruan

- Untuk skill yang dipasang dari GitHub, **Periksa pembaruan** di menu lainnya mencari isi yang baru. GitHub hanya dihubungi saat Anda mengekliknya.
- Jika tidak ada perubahan, tertulis "Sudah terbaru". Jika ada, tinjau file yang berubah dan pratinjaunya, lalu klik **Perbarui**.
- Jika Anda sendiri sudah mengedit skill itu setelah memasangnya, akan muncul juga "Suntingan Anda sendiri akan hilang".
- Pembaruan tetap mempertahankan status aktif/nonaktif skill serta pilihan AI yang menentukan / Hanya saat dipanggil.

## Memanggil skill di panel AI

1. Ketik `/` atau `$` di awal kotak input AI atau tepat setelah spasi. Daftar skill yang aktif akan muncul.
2. Lanjutkan mengetik untuk mempersempit daftar. Misalnya, `/meet` menemukan `meeting-minutes`. Kata dalam deskripsi juga bisa dipakai, jadi `/notu` juga menemukannya.
3. Pilih salah satu dengan tombol panah, lalu tekan Enter atau Tab. Skill itu menjadi chip di atas kotak input.
4. Tulis apa yang Anda inginkan, lalu kirim. GenOffice menambahkan isi skill ke permintaan Anda.

- Di panel AI Excel, `$` hanya membuka daftar di awal kotak input, supaya tidak mengganggu alamat sel seperti `$A$1`.
- Anda bisa menambahkan beberapa chip dan menghapus salah satunya dengan ×. Esc hanya menutup daftar; Esc tidak menghentikan AI yang sedang berjalan.
- **Kelola skill…** di bagian bawah daftar membuka **Pengaturan ▸ Skill**.
- Chip tetap melekat pada pesan yang Anda kirim dan pada percakapan yang tersimpan. Saat Anda membuka lagi percakapan itu dan mengirim pesan baru, isi skill yang terkini dibaca ulang. Skill yang sementara itu dihapus atau dinonaktifkan ditandai "Tidak ada" pada chipnya.
- Jika teks skill yang ikut dikirim terlalu panjang, muncul "Skill terlalu besar untuk ikut dikirim" dan tidak ada yang dikirim.

## Skill yang dipakai AI dengan sendirinya

- Untuk skill yang aktif dan disetel ke AI yang menentukan, nama dan deskripsinya diberikan kepada AI dalam bentuk daftar. Jika salah satunya cocok dengan permintaan, AI mengambil isinya dan memakainya.
- Saat AI memakai sebuah skill, percakapan menampilkan "Memakai skill 〈nama〉".
- AI memutuskan dari deskripsi apakah sebuah skill perlu dipakai. Deskripsi yang menyebutkan kapan skill itu dimaksudkan untuk dipakai membantu AI memilih dengan tepat.

## Membuat skill dengan meminta

1. Di panel AI, ucapkan sesuatu seperti "Simpan yang barusan kita kerjakan sebagai skill" atau "Buat skill yang menulis laporan dengan gaya kantor kita".
2. AI memilih langkah dan aturan yang layak diulang, lalu menampilkan kartu **Skill baru**. Nilai yang hanya dipakai sekali ini, seperti nama dan tanggal, tidak dimasukkan ke petunjuk.
3. Periksa dan edit nama, deskripsi, dan petunjuk di kartu. Nama adalah yang ditampilkan di daftar skill dan yang Anda ketik setelah `/`: huruf kecil bahasa Inggris, angka, dan tanda hubung.
4. Klik **Simpan**. Skill baru ditambahkan ke skill saya dalam keadaan aktif, dan langsung muncul di daftar `/`.

- Tidak ada file yang ditulis sebelum Anda mengeklik **Simpan**. Jika Anda mengeklik **Batal**, percakapan hanya menyimpannya sebagai "Usulan skill yang tidak disimpan".
- Anda juga bisa meminta agar skill yang sudah ada diubah, misalnya "Ubah skill notulen rapat sesuai cara kita bekerja". Kartunya lalu berjudul **Ubah skill**. Skill saya ditimpa dengan **Ganti**; skill bawaan atau skill dari program lain disimpan sebagai salinan di skill saya dan skill aslinya dinonaktifkan.

## Menambahkan dokumen sebagai templat

Saat Anda membuat skill di panel AI sebuah editor, dokumen yang sedang terbuka bisa ikut disertakan sebagai templat. Centang **Simpan juga dokumen ini sebagai templat** di kartu, dan tombolnya menjadi dua.

- **Buat templat kosong**: salinan dokumen terbuka di tab baru, "Pratinjau templat - 〈judul〉", dan AI di tab itu mengosongkan nilai yang sudah diisi, seperti nama, tanggal, dan data pribadi. Periksa tab itu, ubah lagi secara manual bila perlu, lalu klik **Simpan tab ini sebagai templat**; isi tab pada saat itulah yang menjadi templat.
- **Simpan dokumen apa adanya**: menyimpan dokumen saat ini sebagai templat tanpa diubah. Jika dokumen memiliki bagian yang Anda sembunyikan dari AI, tombol ini diblokir agar konten tersembunyi tidak masuk ke templat begitu saja.
- Templat disimpan sebagai salinan dokumen di dalam folder skill. Dokumen aslinya tidak berubah.

## Memakai skill yang memiliki templat

- Skill yang memiliki templat ditandai **Ada templat** di daftar.
- Panggil skill itu sebagai chip lalu kirim, dan salinan templatnya terbuka sebagai dokumen baru tanpa judul; AI di tab itu melanjutkan permintaan Anda. Panel semula menampilkan "Bekerja dengan templat di tab baru" dan **Buka tab**.
- Saat AI sendiri yang memilih skill bertemplat, tab tidak langsung terbuka. Sebagai gantinya, percakapan menampilkan tombol **Buka dokumen baru dari templat ini**.
- Biasanya Anda menentukan lokasi dokumen baru itu saat pertama kali menyimpannya. Editor Markdown dan HTML menyimpan ke folder bawaan seperti biasa. File templatnya sendiri tetap seperti semula.

## Skill yang memiliki skrip

- Di panel AI biasa dan di Tanya AI pada Beranda, skrip sebuah skill tidak pernah dijalankan. Hanya teks skill yang sampai ke AI.
- Skill yang memiliki skrip ditandai **Ada skrip · berfungsi penuh di jendela agen**, dan saat ditambahkan sebagai chip muncul "Skrip skill ini tidak dijalankan di panel AI biasa". Pengiriman tidak diblokir.
- Untuk ikut memakai skripnya, panggil skill itu di jendela agen. Lihat [Mode agen](help://agent-mode).

## Skill bawaan

| Skill             | Fungsinya                                                                                 |
| ----------------- | ----------------------------------------------------------------------------------------- |
| `meeting-minutes` | Mengubah catatan rapat menjadi notulen yang menampilkan keputusan dan tugas tindak lanjut |
| `internal-comms`  | Menulis pengumuman, buletin, laporan kemajuan, FAQ, dan pesan internal lainnya            |
| `humanizer`       | Mencari ungkapan yang terdengar ditulis AI dan membuatnya wajar                           |
| `copy-editing`    | Memeriksa ulang teks bahasa Inggris yang Anda tulis agar lebih jelas dan ringkas          |
| `find-skills`     | Mencari skill yang Anda perlukan di jendela agen dan mengusulkan pemasangannya            |

`copy-editing` dibuat untuk teks pemasaran berbahasa Inggris. `find-skills` hanya berfungsi di jendela agen.

## Di jendela agen

- Jendela agen mengikuti pengaturan aktif/nonaktif yang sama di **Pengaturan ▸ Skill**, dan skill dipanggil di kotak inputnya dengan `/` atau `$` dengan cara yang sama.
- Skill di `.claude/skills` dan `.agents/skills` pada folder proyek dipakai dalam sesi itu tanpa perlu diaktifkan.
- Daftar skill ditetapkan saat sesi dimulai. Jika Anda mengaktifkan atau menonaktifkan skill selama sesi berjalan, muncul "Skill yang diubah berlaku mulai sesi berikutnya".
- Saat agen membuat skill, kartu yang sama muncul di jendela. Untuk templat, pilih di antara dokumen yang terbuka di tab dan file di folder proyek.
- Saat agen menemukan skill yang layak dipasang, muncul usulan pemasangan. Buka dengan **Buka pratinjau** dan klik sendiri **Pasang**; tanpa itu tidak ada yang dipasang. Skill yang dipasang tersedia mulai sesi berikutnya.
