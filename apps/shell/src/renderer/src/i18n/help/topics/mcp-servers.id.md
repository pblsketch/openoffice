# Menghubungkan server MCP

Server MCP adalah layanan yang menyediakan alat yang bisa dipakai AI dari luar aplikasi, misalnya mencari undang-undang atau mencari bahan yang dikelola tim Anda. Setelah Anda menghubungkan server, jendela AI di GenOffice bisa memanggil alatnya selama obrolan. Anda sendiri yang menentukan, alat demi alat, apa yang boleh dipakai AI dan bagaimana caranya.

## Menambahkan server

1. Buka **Pengaturan ▸ Integrasi** lalu tekan **Tambah server** pada kartu **Server MCP**.
2. Pilih cara menambahkannya.
   - **Tempel teks pengaturan**: tempel seluruh teks pengaturan dari panduan server lalu tekan **Baca**. GenOffice mengisi kolom-kolomnya. Jika satu teks berisi beberapa server, Anda mengonfirmasinya satu per satu. Jika teks itu membaca kunci atau nilai dari variabel PC (`${NAMA}`), kolom itu dibiarkan kosong untuk Anda isi.
   - **Isi sendiri**: ketik nama dan alamat. Jika panduan server memberi kunci, masukkan ke kolom **Kunci (opsional)**.
3. Baca pemberitahuan di atas tombol tambah, lalu tekan **Tambah**.
4. Setelah ditambahkan, GenOffice langsung memeriksa koneksi dan mengambil daftar alat. Server yang memerlukan login menunggu Anda, bukan membuka browser sendiri. Tekan **Periksa koneksi** untuk melihat daftar alat yang disediakan server. Untuk server yang memerlukan login, tekan **Masuk lewat browser** dan selesaikan proses masuk di sana.

Nama server memakai huruf, angka, `-` dan `_`, maksimal 24 karakter. AI melihat alat server ini dengan nama berbentuk `mcp__name__tool`. Jika sebuah skill memanggil alat dengan nama berbentuk ini, tambahkan server dengan nama yang sama seperti yang dipakai skill tersebut.

## Server lewat alamat dan server di PC ini

- Server **lewat alamat** dijangkau melalui alamat web. Alamat internet harus diawali `https://`. `http://` hanya bisa untuk PC ini dan alamat jaringan pribadi di rumah atau di kantor, dan Anda harus mengonfirmasi dulu bahwa kunci dan isi dokumen akan dikirim tanpa enkripsi.
- Server **di PC ini** adalah program yang dijalankan GenOffice di PC ini. Layar tambah menampilkan program yang sebenarnya akan dijalankan, argumennya, dan nama variabel lingkungan yang diteruskan kepadanya. Program baru berjalan untuk pertama kali setelah Anda menekan **Izinkan berjalan**. Jika perintahnya berubah kemudian, server tetap berhenti sampai Anda mengizinkannya lagi.
- Jika server di PC ini membutuhkan program yang tidak ada di PC ini (Node.js, atau uv untuk server Python), GenOffice bertanya di kartu server dalam Pengaturan apakah program itu mau diunduh. Ukuran unduhan ditampilkan, dan tidak ada yang diunduh sampai Anda menekan **Unduh**. Program yang diunduh tetap berada di dalam folder data GenOffice, dan pengaturan PC Anda tidak diubah.
- Server di PC ini mulai berjalan saat dibutuhkan dan berhenti setelah 10 menit tidak dipakai. Server juga berhenti saat Anda menutup GenOffice.

## Memilih apa yang boleh dilakukan tiap alat

- Untuk tiap alat, pilih **Selalu izinkan**, **Tanya dulu** atau **Jangan pakai**.
- Pada awalnya, alat yang ditandai server sebagai hanya membaca diatur ke **Selalu izinkan**, dan sisanya ke **Tanya dulu**.
- Saat AI memanggil alat **Tanya dulu**, sebuah kartu muncul di jendela AI. Lihat apa yang akan dikirim, lalu tekan **Izinkan kali ini saja**, **Selalu izinkan di percakapan ini** atau **Blokir**. Tidak ada yang berjalan sebelum Anda menekan salah satunya. Menghentikan AI atau menutup jendela dihitung sebagai memblokir.
- Jika server mengubah deskripsi sebuah alat atau nilai yang diterimanya, alat itu menampilkan **Perlu diperiksa** dan disembunyikan dari AI sampai Anda melihat perubahannya dan menekan **Setujui perubahan**. Perubahan pada panduan yang diberikan server kepada AI diperiksa dengan cara yang sama.
- Alat baru pada server diaktifkan dengan pengaturan awal yang sama, dan kartu serta tombol di jendela AI menampilkan **Alat baru: n**. Tandanya hilang saat Anda membuka daftar alat server itu di Pengaturan.

## Memakai server di jendela AI

- Server bekerja di jendela AI editor dan di Tanya AI pada Beranda. Selama ada server yang aktif, tombol **Server yang terhubung** muncul di samping kolom input.
- Tekan tombol itu untuk melihat status tiap server, dan untuk mematikan atau menyalakan server hanya di percakapan ini. Percakapan baru dimulai dengan semua server yang Anda aktifkan di Pengaturan. Server yang koneksinya belum pernah diperiksa tampil sebagai **Belum diperiksa**; periksa di Pengaturan untuk mendapatkan alatnya.
- Mematikan **Izinkan AI memakai alat internet** di **Pengaturan ▸ Media & Pencarian AI** juga menghapus semua alat server MCP.
- Jika sebuah skill mengharapkan alat dari server yang saat ini tidak bisa Anda pakai, AI menyebutkan dalam jawabannya langkah mana yang tidak bisa dikerjakan. **Pengaturan ▸ Skill** juga menampilkan server yang dibutuhkan sebuah skill di samping skill itu.
- Jendela Agen juga bisa memakai alat dari server yang aktif. Izin yang sama berlaku, dan sebuah sesi mempertahankan pengaturan saat ia dimulai. Lihat [Mode agen](help://agent-mode).

## Melindungi isi yang dikirim server

Setiap server punya **Lindungi isi yang dikirim server ini**, yang aktif pada awalnya. Selama aktif, begitu ada sesuatu dari server itu di dalam sebuah obrolan, alat yang mengirim sesuatu keluar dari aplikasi berhenti untuk obrolan itu: pencarian web, membaca halaman lewat alamat, alat server MCP lain, dan sejenisnya. Alat dari server yang sama tetap berfungsi. Mulai percakapan baru untuk memakai yang lain lagi. Anda bisa mematikannya untuk server yang hanya memberi bahan publik.

Jendela Agen tidak bisa mempertahankan perlindungan ini. Saat sebuah sesi dimulai dengan server seperti itu, jendela memberi tahu Anda.

## Apa dikirim ke mana

- Saat AI memanggil alat, teks yang dipilih AI dikirim ke server itu. Isinya bisa mencakup konten dari dokumen yang terbuka dan dari lampiran. Bagian yang disembunyikan dari AI tetap tersembunyi.
- Apa yang dikembalikan server dikirim ke penyedia AI yang sedang Anda pakai. Tambahkan hanya server yang pengelolanya Anda percaya.
- Kunci, data login, dan nilai variabel lingkungan disimpan dengan enkripsi sistem operasi di PC ini. Jika PC ini tidak bisa mengenkripsinya, semuanya hanya diingat sampai Anda menutup aplikasi.
- Menghapus server akan menghapus kunci dan login-nya, dan meminta server mengakhiri login itu jika server mendukungnya.
