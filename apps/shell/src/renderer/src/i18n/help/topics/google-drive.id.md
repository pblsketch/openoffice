# Google Drive

Hubungkan Google Drive untuk membuka file Drive yang Anda pilih di GenOffice dan mengeditnya. Saat Anda menyimpan, file kembali ke Drive. GenOffice hanya dapat membuka file yang Anda pilih di jendela Google; GenOffice tidak melihat file lain di Drive Anda.

## Menghubungkan

1. Buka **Pengaturan ▸ Integrasi**.
2. Baca **Sebelum memakai file Drive dengan AI**, matikan pelatihan model di akun AI yang Anda pakai dengan file Drive, lalu centang item itu.
   - Claude: di **Pengaturan ▸ Privasi** milik Claude, matikan pelatihan model.
   - ChatGPT dan Codex: di **Pengaturan ▸ Kontrol data** milik ChatGPT, matikan **Improve the model for everyone**.
   - Penyedia kunci API secara bawaan tidak memakai data API untuk pelatihan.
   - Koneksi AI gratis (model gratis OpenRouter, Gemini) tidak pernah diberi file Drive.
3. Klik **Hubungkan Google Drive**. Halaman login Google terbuka di browser. Masuk dan izinkan akses.
4. Kembali ke GenOffice. Kartu menampilkan akun yang terhubung.

Google tidak mengizinkan file Drive dikirim ke layanan AI yang memakainya untuk melatih modelnya, jadi Anda tidak dapat menghubungkan atau memilih file sebelum item itu dicentang.

Login disimpan di PC ini dengan enkripsi yang disediakan sistem operasi untuk akun pengguna Anda (perlindungan bawaan Windows, rantai kunci macOS, atau keyring desktop di Linux). Jika PC ini tidak dapat mengenkripsinya, koneksi hanya bertahan sampai Anda menutup aplikasi.

## Membuka file Drive

- Klik **Google Drive** di bilah samping Beranda, lalu **Pilih dari Google Drive**.
- Pemilih file Google terbuka di browser. Pilih file yang ingin dibuka (boleh beberapa sekaligus); GenOffice kembali dan membukanya di editor yang sesuai.
- File yang pernah Anda pilih tetap ada di daftar **File yang Anda pilih**. Buka lagi dari sana, atau cari berdasarkan nama dan isi.
- Format yang tidak dapat dibuka GenOffice tampil redup. Google Dokumen, Spreadsheet, dan Slide dibuka sebagai file Word, Excel, dan PowerPoint.

## Menyimpan kembali ke Drive

- Simpan seperti biasa. Sesaat kemudian file diunggah ke Drive.
- Jika seseorang mengubah file di Drive setelah Anda membukanya, Anda ditanya apakah akan menimpa file di Drive, menyimpan salinan ke Drive, atau menyimpan perubahan di PC ini saja.
- File yang hanya dapat Anda lihat disimpan ke Drive sebagai salinan, atau disimpan di PC ini.
- Dokumen Google dibiarkan apa adanya. Perubahan Anda disimpan sebagai file Office di folder yang sama, atau di Drive Saya jika folder itu tidak dapat ditulisi.
- Jika pengunggahan gagal, perubahan Anda tetap di PC ini dan GenOffice mencoba lagi, termasuk saat aplikasi dimulai berikutnya.

## AI dan Drive

- Di panel AI editor Word, Excel, PowerPoint, HTML, peta pikiran, dan Hangul, klik **Lampirkan dari Google Drive** di samping tombol lampiran untuk memilih file di jendela Google di browser dan melampirkannya seperti file dari PC ini. Hingga 20 sekaligus.
- Selama **Izinkan AI mencari dan membaca file di Drive** aktif (aktif saat Anda terhubung), AI di setiap editor dapat mencari dan membaca file Drive yang Anda pilih di GenOffice. Contoh: "Cari notulen rapat bulan lalu di Drive saya dan buat ringkasannya." Jika file tidak ditemukan, pilih dulu file itu di layar Beranda.
- Yang dibaca AI dikirim ke penyedia AI yang Anda gunakan. Bagian yang disembunyikan dari AI tetap tersembunyi.
- Selama AI yang dipakai adalah koneksi gratis, melampirkan dari Drive dan pembacaan Drive oleh AI tidak berjalan.
- AI tidak dapat mengubah, menghapus, atau membagikan file Drive.
- Setelah percakapan berisi konten yang dibaca dari Drive, percakapan itu berhenti memakai pencarian web, pencarian gambar, pembacaan halaman melalui alamat web, dan penyisipan gambar melalui alamat web. Mulai percakapan baru untuk menggunakannya lagi.

## Memutuskan koneksi

Klik **Putuskan** di **Pengaturan ▸ Integrasi**. GenOffice menghapus login dari PC ini dan meminta Google mencabut aksesnya. Salinan file yang sudah ada di PC ini tetap tersimpan. Anda juga dapat menghapus akses kapan saja di **Koneksi pihak ketiga** pada Akun Google Anda.
