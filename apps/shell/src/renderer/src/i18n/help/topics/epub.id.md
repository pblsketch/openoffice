# Buku elektronik EPUB: membaca, menyunting, dan menerjemahkan

Editor e-book membuka buku EPUB (`.epub`) di sebuah tab. Anda bisa membaca buku, memperbaiki teksnya langsung di halaman, bertanya kepada AI tentang isinya, dan menerjemahkannya menjadi file EPUB baru. Tidak ada layar untuk menyunting kode sebuah bab.

## Membuka buku

- Buka file `.epub` lewat dialog buka, dengan menyeretnya ke jendela, dari file terbaru, pohon folder, atau daftar Google Drive. Di Windows, file ini juga muncul di menu "Buka dengan". Memasang GenOffice tidak menjadikannya program default untuk file `.epub`.
- Jika buku itu sudah terbuka, tabnya langsung dibawa ke depan.
- Buku yang dilindungi salin (DRM) tidak dapat dibuka; bukalah di aplikasi toko tempat Anda membelinya. File yang rusak dan file yang bukan buku EPUB juga tidak dapat dibuka, dan alasannya ditampilkan.
- **Buku bertata letak tetap** (disusun halaman demi halaman, seperti buku bergambar dan komik) hanya dibuka untuk dibaca. Penyuntingan, penyuntingan oleh AI, penggantian, dan penerjemahan dimatikan, dan baris status menjelaskan alasannya. Membaca dan bertanya kepada AI tetap bisa dilakukan.
- Bab yang filenya cacat ditampilkan sebaik mungkin tetapi tidak dapat disunting, dan sebuah catatan di bagian atasnya memberitahukan hal itu. Bab itu disimpan tanpa perubahan dan tetap dalam bahasa aslinya di hasil terjemahan.

## Membaca

- Panel **Daftar isi** di sebelah kiri menampilkan daftar isi buku. Klik sebuah entri untuk menuju ke sana. Buku yang tidak punya daftar isi mendapat daftar babnya sebagai gantinya.
- Setiap bab digulir ke atas dan ke bawah. Teruskan menggulir melewati akhir bab untuk pindah ke bab berikutnya, atau melewati awalnya untuk kembali. Baris status menunjukkan bab tempat Anda berada.
- Tab **Tampilan** mengubah ukuran teks dan spasi baris, serta menyalakan dan mematikan **Tampilan gelap**. Pengaturan ini hanya mengubah tampilan layar, tidak pernah mengubah buku, dan berlaku untuk semua buku.
- Posisi terakhir Anda membaca diingat untuk setiap file, di folder data aplikasi, bukan di dalam buku.
- **Cari di buku** (Ctrl+F) mencari di semua bab. Klik sebuah hasil untuk menuju ke sana.
- Tautan di dalam buku membawa Anda ke tempat tujuannya. Tautan web dan email dibuka di peramban default Anda; alamat jenis lain tidak dibuka.
- Skrip bawaan buku tidak pernah dijalankan dan tidak ada yang dimuat dari internet. Suara dan video tidak diputar.

## Menyunting teks

- Klik sebuah paragraf lalu mulailah mengetik. Paragraf, judul, butir daftar, kutipan, sel tabel, dan keterangan gambar dapat disunting. Gambar dan tata letak tabel tidak dapat disunting.
- Menempel hanya menyisipkan teks biasa.
- **Enter** membelah paragraf menjadi dua dan **Shift+Enter** membuat baris baru di dalamnya. **Backspace** di awal paragraf menggabungkannya dengan paragraf sebelumnya, dan **Delete** di akhir paragraf menarik paragraf berikutnya ke dalamnya. Di sel tabel, keterangan gambar, dan daftar definisi, Enter tidak melakukan apa-apa: yang berubah hanya teks di dalamnya.
- **Tebal** (Ctrl+B) dan **Miring** (Ctrl+I) dinyalakan dan dimatikan dengan tombol yang sama. Teks yang dibuat tebal atau miring oleh stylesheet buku tetap seperti adanya.
- **Urungkan** (Ctrl+Z) dan **Ulangi** (Ctrl+Y) tetap berfungsi setelah Anda menyimpan. Mengurungkan perubahan di bab lain akan membawa Anda ke bab itu.
- **Ganti** (Ctrl+H) bekerja di seluruh buku, satu paragraf setiap kali: kecocokan tidak pernah melintasi dua paragraf. Bab yang hanya-baca dilewati, dan jumlah tempat yang dilewati ditampilkan. **Ganti semua** diurungkan dalam satu langkah.

## Menyimpan

- Simpan (Ctrl+S), Simpan Sebagai (Ctrl+Shift+S, hanya `.epub`), **Simpan otomatis** di pita, dan pertanyaan sebelum menutup bekerja sama seperti di editor lain.
- Jika tidak ada yang berubah, file tidak ditulis ulang. Saat Anda menyimpan perubahan, hanya paragraf yang Anda ubah yang ditulis ulang. Gambar, font, gaya, dan semua bagian lain buku tetap persis seperti semula. Pada buku EPUB 3, tanggal "terakhir diubah" juga diperbarui.
- Jika program lain mengubah file setelah Anda membukanya, file itu tidak ditimpa.

## Panel AI

- Tanyakan tentang buku, minta ringkasan sebuah bab, atau minta teksnya diperbaiki atau ditulis ulang. AI membaca daftar isi dan bab-bab buku, serta mencari teks di dalamnya.
- Perubahan dari AI langsung terlihat, dan satu kali urungkan (Ctrl+Z) membatalkan semua yang diubahnya pada giliran itu. AI dapat membuat teks tebal atau miring, tetapi tidak dapat menambahkan gambar, tabel, atau bab.
- Teks buku adalah bahan bagi AI, bukan perintah untuknya.
- Ketik "Terjemahkan buku ini ke bahasa Prancis" dan AI membuka jendela terjemahan dengan bahasa itu sudah terisi. Tidak ada yang dikirim sebelum Anda menekan **Mulai**.
- Buku EPUB juga dapat dilampirkan di panel AI editor lain, dipilih dengan `@`, dan ditemukan lewat pencarian file di layar Beranda.

## Menerjemahkan buku

1. Di tab **Beranda**, klik **Terjemahkan buku** (atau File ▸ Terjemahkan buku…).
2. Pilih bahasa, bab (awalnya semua terpilih), dan hasilnya: **Buku terjemahan**, **Buku dwibahasa** (asli dan terjemahan), atau keduanya. Pilih tempat menyimpan masing-masing.
3. Klik **Berikutnya**. Konfirmasi menampilkan perkiraan jumlah permintaan AI, AI yang akan menerimanya, bagian yang sudah diterjemahkan (tidak dikirim lagi), dan, pada koneksi yang ditagih sesuai pemakaian, pemberitahuan bahwa akan ada biaya. Jika buku punya perubahan yang belum disimpan, tombolnya menjadi **Simpan dan terjemahkan**.
4. Klik **Mulai**. Kemajuan dan **Hentikan** muncul di bagian atas. Penyuntingan dikunci sampai terjemahan selesai; panel AI tetap bisa dipakai.
5. Di akhir, sebuah laporan mencantumkan apa yang sudah diterjemahkan, apa yang tetap dalam bahasa asli, dan file hasilnya, masing-masing dengan **Buka**.

- Buku aslinya tidak berubah. Setiap hasil adalah file EPUB baru dengan identitasnya sendiri, sehingga aplikasi pustaka e-book memisahkannya dari buku asli.
- Judul dan daftar isi juga diterjemahkan. Di buku dwibahasa, setiap paragraf diikuti terjemahannya; di tabel, keterangan gambar, dan daftar, terjemahan masuk ke sel atau butir yang sama. Judulnya menampilkan keduanya, seperti "Judul asli (Judul terjemahan)".
- Bab yang tidak Anda pilih tetap dalam bahasa aslinya di hasil.
- Buku yang ditulis secara vertikal menjadi horizontal, kecuali diterjemahkan ke bahasa Jepang, Tionghoa, atau Korea. Terjemahan bahasa Arab dan Ibrani dibaca dari kanan ke kiri.
- Bagian yang sudah diterjemahkan disimpan. Jika Anda berhenti, pilih **Ekspor yang sudah diterjemahkan** (sisanya tetap dalam bahasa asli) atau **Lanjutkan nanti**. Saat Anda membuka buku yang terjemahannya belum selesai, GenOffice menawarkan untuk melanjutkannya. **Terjemahkan ulang dari awal** lebih dulu menghapus terjemahan tersimpan untuk bahasa itu.
- Terjemahan tersimpan dihitung di Pengaturan ▸ Umum ▸ **Hasil AI tersimpan**, bersama hasil dari dokumen PDF, dan **Hapus semua** ikut menghapusnya.
- Terjemahan yang sama juga dapat dijalankan dari [perintah terminal](help://cli) sebagai `ieumoffice epub translate`.

## Belum didukung

- Menambah, menghapus, atau mengurutkan ulang bab; mengubah judul, penulis, atau sampul; menyisipkan gambar atau tabel; mengubah paragraf menjadi judul atau daftar.
- Menyunting atau menerjemahkan buku bertata letak tetap, dan membuka buku yang dilindungi salin.
- Membalik halaman seperti buku cetak, dan membuat buku baru yang kosong.
- Membandingkan teks asli dan terjemahan berdampingan di dalam editor. Sebagai gantinya, buka buku dwibahasa, lalu perbaiki buku terjemahan seperti buku lainnya.
- Menyembunyikan bagian buku dari AI.
