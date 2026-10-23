# Editor Markdown

Editor Markdown membuka .md / .markdown — dan .txt / .json, langsung ke tampilan sumber — dengan sumber plus pratinjau terender.

- **Buka**: dari Beranda atau File ▸ Buka…; perintah baris perintah juga bisa.
- **Sunting**: penyuntingan teks biasa; ekstensi GFM (tabel, daftar tugas, coret, autolink) dirender di pratinjau.
- **Pratinjau**: langsung; aset relatif seperti gambar diselesaikan di samping dokumen.
- **Menyimpan**: setia byte demi byte — BOM, CRLF, dan keberadaan baris baru di akhir file dipertahankan; penyimpanan tanpa perubahan tidak menulis ulang file.
- **Cari dan ganti**: ctrl+F mencari di sumber; Ganti Semua menuliskan hasilnya kembali.
- **AI**: tombol siap pakai membiarkan asisten menulis ulang, memperpanjang, atau menerjemahkan dokumen. Seleksi bisa disembunyikan dari AI (lihat bab panel AI).

## Bilah alat

Satu baris tombol di atas editor (arahkan kursor untuk melihat keterangan):

- **File & riwayat**: Simpan, Simpan Sebagai…, Urungkan, Ulangi, Temukan; sakelar **Simpan Otomatis** di sebelah kanan menulis perubahan ke disk secara berkala.
- **Tombol AI**: membuka panel AI; di sebelahnya adalah siap-siap untuk menulis ulang / memperpanjang / menerjemahkan.
- **Gaya paragraf** (drop-down): berpindah antara teks isi dan berbagai tingkat judul.
- **Format sebaris**: **tebal**, _miring_, ~~coret~~, `kode sebaris`, tautan.
- **Daftar**: daftar poin, daftar bernomor, daftar tugas.
- **Sisipkan**: tabel, gambar, garis pemisah.
- **Properti**: menyisipkan atau melompat ke blok YAML front matter di bagian atas file.
- **Kerangka**: melompat menurut hierarki judul.
- **Ejaan**: menyalakan atau mematikan pemeriksaan ejaan untuk dokumen ini.
- **Pengaturan host gambar**: gambar yang ditempel dan dijatuhkan pergi lebih dulu ke penyimpanan Anda sendiri — kompatibel S3 (R2/OSS/COS/MinIO), SM.MS, atau GitHub — salinan assets lokal tetap menjadi cadangan.

Tiga contoh singkat:

- **Judul**: letakkan kursor di baris itu ▸ drop-down gaya paragraf ▸ "Judul 1".
- **Tabel**: klik **Sisipkan tabel** ▸ seret untuk memilih jumlah baris/kolom ▸ ketik di dalam sel; pratinjau langsung merendernya.
- **Daftar tugas**: pilih beberapa baris ▸ klik **Daftar tugas** ▸ setiap baris menjadi `- [ ]`, dan di pratinjau tampil sebagai kotak centang.

## Tautan antarcatatan

Tautan di catatan diikuti dengan **Ctrl+klik** (**⌘+klik** di Mac). Klik biasa tetap untuk menyunting teks.

- **Judul**: `[teks](#judul)` dan `[[#Judul]]` melompat ke judul itu di catatan yang sama.
- **Berkas lain**: `[teks](other.md)` atau `[teks](../folder/report.pdf)` membuka berkas di tab tersendiri, dihitung dari folder catatan. Tautan ke judul di catatan Markdown lain membuka catatan itu tepat di judulnya.
- **Tautan wiki**: `[[Catatan]]`, `[[Catatan#Judul]]`, dan `[[Catatan|teks tampil]]` dicari di mana saja dalam brankas catatan — folder terdekat di atas catatan yang berisi `.obsidian`, atau folder catatan itu sendiri jika tidak ada. Jika dua berkas bernama sama, yang lebih dekat ke catatan yang dipakai.
- **Pelengkapan**: ketik `[[` lalu pilih catatan dari brankas di daftar; hasilnya ditulis sebagai `[[Nama]]`.
- **Gambar**: `![[gambar.png]]` menampilkan gambar di bawah teksnya, dan `![[gambar.png|300]]` mengatur lebarnya. Hanya gambar di dalam brankas hingga 20 MB yang ditampilkan.
- **Yang tidak berubah**: tautan wiki tetap teks biasa di berkas, jadi menyimpan tidak pernah menulis ulang tautan itu. Tautan web dibuka di peramban. Jalur jaringan (`\\server\share`), tautan di tampilan sumber, dan AI tidak membuka apa pun.

## Ekspor

Menu File, semuanya lokal dan semuanya menanyakan tempat untuk menaruh hasilnya:

- **Ekspor sebagai Word…** dan **Ekspor sebagai PDF…** menulis .docx atau .pdf yang sungguhan.
- **Ekspor sebagai ODT…** menulis file .odt (teks OpenDocument) lewat konversi yang sama dengan ekspor Word; jika ada yang berubah atau hilang di tengah jalan, Anda melihat daftarnya dan mengonfirmasi lebih dulu.
- **Ekspor sebagai gambar…** menulis satu PNG per halaman ke dalam direktori yang Anda pilih.
- **Konversi dan buka di Docs** mengonversi ke .docx dan membukanya di tab Docs bawaan di dalam aplikasi ini — ini bukan serah terima ke apa pun di cloud, dan salinan hasil konversi tinggal di folder cache yang dibersihkan setelah sekitar seminggu.

## Tampilan Sumber

Pita memuat sakelar **Sumber** (ikut dilokalkan bersama aplikasi). Nyalakan, dan editor diganti oleh Markdown mentah: persis teks yang ditulis sebuah penyimpanan, tidak ada yang dirapikan, tidak ada yang dinormalisasi di bawah Anda.

- **Penyuntingan setia byte demi byte.** Penyimpanan dari tampilan sumber menghasilkan byte yang sama dengan penyimpanan dari editor — BOM, CRLF, dan keberadaan baris baru di akhir file semuanya tetap utuh.
- **Ini dokumen yang sama.** Berganti bolak-balik sesuka hati; sumber itu adalah teks milik editor itu sendiri, bukan salinan yang harus digabungkan.
- **Bilah alat format tidak tersedia** selama tampilan ini terbuka, karena sebagian besar tombol itu menyisipkan konstruksi editor yang hanya bermakna di sisi hasil render. Bilah alat itu kembali begitu Anda menutup tampilan ini.
- **.txt dan .json** terbuka di sini langsung dalam tampilan sumber: tak ada yang perlu dirender, jadi sumbernya _adalah_ dokumennya.
