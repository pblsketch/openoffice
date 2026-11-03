# Diagram: menggambar dan menyunting file draw.io

Editor diagram membuka file draw.io di sebuah tab. Anda bisa menggambar diagram alir, diagram arsitektur, dan diagram lainnya, menyimpannya dalam format aslinya, mengekspornya sebagai gambar atau PDF, dan meminta AI membaca, mengubah, serta menggambarnya. Editor ini berjalan sepenuhnya di PC Anda.

## Membuka diagram

- Editor membuka file `.drawio`, `.dio`, `.drawio.svg`, dan `.drawio.png`: lewat dialog buka, dengan menyeret file ke jendela, dari file terbaru, pohon folder, atau (untuk `.drawio` dan `.dio`) daftar Google Drive. Di Windows, memasang GenOffice menjadikannya program untuk file `.drawio` dan `.dio`.
- File `.drawio.svg` atau `.drawio.png` hanya terbuka jika diagramnya tersimpan di dalam gambar itu. Gambar SVG atau PNG biasa tidak dibuka sebagai diagram. File yang rusak juga tidak dapat dibuka, dan alasannya ditampilkan.
- File Visio (`.vsdx`) diimpor sebagai diagram baru tanpa judul. Saat pertama kali disimpan, editor menawarkan file `.drawio` di folder file Visio tersebut, dan file Visio itu sendiri tidak berubah. Jika ada gambar di dalamnya yang tidak dapat dikonversi, editor menyebutkan jumlahnya. Di Windows, file `.vsdx` hanya muncul di menu "Buka dengan".
- Diagram baru yang kosong dimulai dari ubin **Diagram** di Beranda atau dari Baru di menu File.
- Jika diagram itu sudah terbuka, tabnya langsung dibawa ke depan.

## Menyunting

- Layar penyuntingan adalah layar draw.io apa adanya: menu di atas, bentuk di kiri, panel format di kanan, dan tab halaman di bawah.
- Simpan (Ctrl+S), Simpan Sebagai (Ctrl+Shift+S), dan Cetak (Ctrl+P) ditangani oleh GenOffice. Berpindah tab dan pintasan lain yang berlaku di seluruh aplikasi tetap berfungsi. Semua pintasan lainnya milik editor itu sendiri, termasuk urungkan (Ctrl+Z).
- **Bantuan** (F1) di menu editor membuka halaman ini.
- Editor memakai bahasa GenOffice. Saat Anda mengganti bahasa, editor dimulai ulang: perubahan yang belum disimpan tetap ada, tetapi riwayat urungkan hilang.
- Editor mengikuti tema GenOffice. Pada tema gelap, gambarnya juga ditampilkan dengan warna gelap, tetapi file yang disimpan, PNG, PDF, dan hasil cetak persis sama seperti pada tema terang.

## Menyimpan

- Simpan, Simpan Sebagai, **Simpan Otomatis** di baris status, dan pertanyaan sebelum menutup bekerja sama seperti di editor lain.
- Diagram disimpan dalam format saat ia dibuka. Simpan Sebagai menawarkan `.drawio`, `.dio`, `.drawio.svg`, dan `.drawio.png`. Diagram baru pertama kali disimpan sebagai `.drawio`.
- Jika tidak ada yang berubah, file tidak ditulis ulang. Halaman yang tersimpan dalam bentuk terkompresi di file tetap terkompresi.
- Gambar pada file `.drawio.png` menampilkan halaman pertama; seluruh diagram tersimpan di dalamnya.
- Selama diagram punya perubahan yang belum disimpan, salinan pemulihan disimpan di folder data aplikasi, sehingga pekerjaan Anda tetap aman jika aplikasi tiba-tiba tertutup.

## Mengekspor dan mencetak

- Pilih ekspor PNG, SVG, atau PDF di menu File (item ekspor di menu editor sendiri membuka jendela yang sama). Lalu pilih **Semua halaman** (bawaan) atau **Hanya halaman saat ini**.
- Dengan semua halaman, PNG dan SVG menghasilkan satu file per halaman, bernama `<nama>-p<nomor halaman>`. PDF berisi satu lembar per halaman, dengan ukuran halaman yang diatur di diagram.
- Cetak (Ctrl+P) juga mencetak satu lembar per halaman. Ekspor dan hasil cetak selalu memakai warna terang, apa pun temanya.

## Panel AI

- Minta AI menggambar diagram alir, diagram urutan, atau bagan organisasi, menjelaskan diagram, merapikan sebuah halaman, atau menambahkan langkah berikutnya setelah bentuk yang Anda pilih.
- AI membaca diagram sebagai teks: halaman-halamannya, dan untuk setiap bentuk dan konektor, id, teks, jenis bentuk, posisi, dan sambungannya, ditambah bentuk mana yang Anda pilih. AI tidak melihat diagram sebagai gambar.
- Perubahan dari AI langsung terlihat. Setiap perubahan adalah satu langkah urungkan (Ctrl+Z), dan daftar giliran di panel membatalkan satu giliran AI secara utuh. Jika ada bagian perubahan yang ditolak, diagram tetap seperti semula.
- Untuk diagram alir baru, diagram urutan, atau yang serupa, AI menulis Mermaid lalu GenOffice mengubahnya menjadi bentuk di PC Anda. Tata letaknya bisa sedikit berbeda dari hasil situs web draw.io.
- Diagram juga dapat dilampirkan di panel AI editor lain, dipilih dengan `@`, dan ditemukan lewat pencarian file di Beranda. [Perintah terminal](help://cli) juga dapat membaca, menyunting, dan membuat diagram (`ieumoffice diagram read`, `ieumoffice diagram apply`, `ieumoffice create --type drawio`).

## Penggunaan internet

- Tab diagram tidak mengirim apa pun ke internet. Editor berjalan dari file yang dipasang bersama GenOffice, dan penyimpanan cloud, berbagi, plugin, serta AI bawaannya dimatikan.
- Gambar dan font yang diambil diagram dari internet tidak dimuat; sebuah catatan memberitahukannya saat file dibuka. Tautan web atau email pada sebuah bentuk hanya dibuka di peramban default Anda saat Anda mengkliknya.
- Scratchpad, pustaka bentuk yang Anda tambahkan, dan warna terbaru tetap ada di PC ini, di folder data aplikasi. Panel AI mengirim teks diagram ke AI yang Anda pilih, sama seperti di editor lain.

## Tidak tersedia

- Menyisipkan atau menyunting PlantUML. Bentuk PlantUML di dalam file ditampilkan sebagai gambar tersimpannya.
- Tata letak otomatis yang memakai ELK, dan konektor yang memutari bentuk. Konektor seperti itu digambar sebagai konektor biasa.
- Format Visio lama (`.vsd`, `.vss`) dan menyimpan kembali ke `.vsdx`.
- Penyimpanan cloud, berbagi, penerbitan, plugin, dan fitur AI bawaan editor.
- Menyembunyikan bagian diagram dari AI.
