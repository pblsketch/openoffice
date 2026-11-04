# Rajah: melukis dan menyunting fail draw.io

Editor rajah membuka fail draw.io dalam satu tab. Anda boleh melukis carta alir, rajah seni bina dan rajah lain, menyimpannya dalam format asalnya, mengeksportnya sebagai gambar atau PDF, dan meminta AI membaca, mengubah serta melukisnya. Editor ini berjalan sepenuhnya pada PC anda.

## Membuka rajah

- Editor membuka fail `.drawio`, `.dio`, `.drawio.svg` dan `.drawio.png`: melalui dialog buka, dengan menyeret fail ke dalam tetingkap, daripada fail terkini, pepohon folder, atau (untuk `.drawio` dan `.dio`) senarai Google Drive. Dalam Windows, memasang GenOffice menjadikannya program untuk fail `.drawio` dan `.dio`.
- Fail `.drawio.svg` atau `.drawio.png` hanya dibuka jika rajah itu disimpan di dalam gambar. Gambar SVG atau PNG biasa tidak dibuka sebagai rajah. Fail yang rosak juga tidak dibuka, dan sebabnya dipaparkan.
- Fail Visio (`.vsdx`) diimport sebagai rajah baharu tanpa tajuk. Simpanan pertama mencadangkan fail `.drawio` dalam folder fail Visio itu, dan fail Visio itu sendiri tidak diubah. Jika sesetengah gambar di dalamnya tidak dapat ditukar, editor memberitahu bilangannya. Dalam Windows, fail `.vsdx` hanya ditawarkan di bawah "Buka dengan".
- Rajah baharu yang kosong dimulakan daripada jubin **Rajah** di Laman Utama atau daripada Baharu dalam menu Fail.
- Jika rajah itu sudah dibuka, tabnya akan dibawa ke hadapan.

## Menyunting

- Skrin penyuntingan ialah skrin draw.io seperti asalnya: menu di bahagian atas, bentuk di sebelah kiri, panel format di sebelah kanan dan tab halaman di bahagian bawah.
- Simpan (Ctrl+S), Simpan Sebagai (Ctrl+Shift+S) dan Cetak (Ctrl+P) dikendalikan oleh GenOffice. Menukar tab dan pintasan lain untuk seluruh aplikasi terus berfungsi. Semua pintasan lain ialah milik editor itu sendiri, termasuk buat asal (Ctrl+Z).
- **Bantuan** (F1) dalam menu editor membuka halaman ini.
- Editor menggunakan bahasa GenOffice. Apabila anda menukar bahasa, editor dimulakan semula: perubahan yang belum disimpan kekal, tetapi sejarah buat asal hilang.
- Editor mengikut tema GenOffice. Dalam tema gelap, lukisan juga dipaparkan dalam warna gelap, tetapi fail yang disimpan, PNG, PDF dan cetakan adalah sama persis seperti dalam tema cerah.

## Menyimpan

- Simpan, Simpan Sebagai, **Simpan Automatik** pada bar status dan soalan sebelum menutup berfungsi sama seperti dalam editor lain.
- Rajah disimpan dalam format semasa ia dibuka. Simpan Sebagai menawarkan `.drawio`, `.dio`, `.drawio.svg` dan `.drawio.png`. Rajah baharu disimpan sebagai `.drawio` pada kali pertama.
- Jika tiada apa-apa yang berubah, fail tidak ditulis semula. Halaman yang disimpan dalam bentuk mampat di dalam fail kekal mampat.
- Gambar fail `.drawio.png` menunjukkan halaman pertama; keseluruhan rajah disimpan di dalamnya.
- Selagi rajah mempunyai perubahan yang belum disimpan, salinan pemulihan disimpan dalam folder data aplikasi, jadi kerja anda selamat jika aplikasi ranap.

## Mengeksport dan mencetak

- Pilih eksport PNG, SVG atau PDF dalam menu Fail (item eksport dalam menu editor sendiri membuka tetingkap yang sama). Kemudian pilih **Semua halaman** (lalai) atau **Halaman semasa sahaja**.
- Dengan semua halaman, PNG dan SVG menghasilkan satu fail bagi setiap halaman, dinamakan `<nama>-p<nombor halaman>`. PDF mempunyai satu helaian bagi setiap halaman, pada saiz halaman yang ditetapkan dalam rajah.
- Cetak (Ctrl+P) juga mencetak satu helaian bagi setiap halaman. Eksport dan cetakan sentiasa menggunakan warna cerah, walau apa pun temanya.

## Panel AI

- Minta AI melukis carta alir, rajah jujukan atau carta organisasi, menerangkan rajah, mengemaskan sesuatu halaman, atau menambah langkah seterusnya selepas bentuk yang anda pilih.
- AI membaca rajah sebagai teks: halaman-halamannya dan, bagi setiap bentuk dan penyambung, id, teks, bentuk, kedudukan dan sambungannya, serta bentuk mana yang anda pilih. AI tidak melihat rajah sebagai gambar.
- Perubahan yang dibuat oleh AI muncul serta-merta. Setiap perubahan ialah satu langkah buat asal (Ctrl+Z), dan senarai "Buat asal giliran AI" dalam panel mengembalikan satu giliran AI sepenuhnya. Jika mana-mana bahagian perubahan ditolak, rajah kekal seperti sebelumnya.
- Untuk carta alir, rajah jujukan atau yang seumpamanya yang baharu, AI menulis Mermaid dan GenOffice menukarnya menjadi bentuk pada PC anda. Susun aturnya mungkin sedikit berbeza daripada yang dihasilkan oleh laman web draw.io.
- Rajah juga boleh dilampirkan dalam panel AI editor lain, dipilih dengan `@`, dan ditemui melalui carian fail di Laman Utama. [Arahan terminal](help://cli) juga boleh membaca, menyunting dan mencipta rajah (`ieumoffice diagram read`, `ieumoffice diagram apply`, `ieumoffice create --type drawio`).

## Penggunaan internet

- Tab rajah tidak menghantar apa-apa ke internet. Editor berjalan daripada fail yang dipasang bersama GenOffice, dan storan awan, perkongsian, pemalam serta AI editor itu sendiri dimatikan.
- Gambar dan fon yang diambil oleh rajah daripada internet tidak dimuatkan; satu nota memberitahu hal ini apabila fail dibuka. Pautan web atau e-mel pada sesuatu bentuk hanya dibuka dalam pelayar lalai anda apabila anda mengkliknya.
- Pad conteng, pustaka bentuk yang anda tambah dan warna terkini kekal pada PC ini, dalam folder data aplikasi. Panel AI menghantar teks rajah kepada AI yang anda pilih, sama seperti editor lain.

## Belum disokong

- Menyisipkan atau menyunting PlantUML. Bentuk PlantUML dalam fail dipaparkan sebagai gambar yang disimpan.
- Susun atur automatik yang menggunakan ELK, dan penyambung yang melencong di sekeliling bentuk. Penyambung sedemikian dilukis sebagai penyambung biasa.
- Format Visio lama (`.vsd`, `.vss`) dan menyimpan semula ke `.vsdx`.
- Storan awan, perkongsian, penerbitan, pemalam dan ciri AI editor itu sendiri.
- Menyembunyikan bahagian rajah daripada AI.
