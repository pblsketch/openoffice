# Projek

Projek ialah satu folder pada PC anda. Pilih projek dalam panel AI dan AI akan bekerja dengan mengetahui fail, arahan, ingatan dan perbualan dalam folder itu. Simpan dokumen untuk satu kerja dalam satu folder, dan perbualan yang dimulakan dalam Docs boleh diteruskan dalam Hangul atau Slides tanpa perlu menerangkan latar belakangnya semula dalam setiap dokumen.

## Memilih projek

- Dalam panel AI setiap editor dan dalam **Ask AI** di Laman Utama, nama projek semasa terletak di sebelah kiri, di bawah kotak input. Jika belum ada yang dipilih, ia tertulis **Tanpa projek**.
- Klik nama itu untuk membuka senarai: projek **Disemat** dan **Terkini**, **Projek baharu**, **Tambah folder** dan **Tanpa projek**. Taip dalam kotak di bahagian atas untuk mencari; jika tiada projek yang sepadan, anda boleh terus mencipta projek baharu dengan nama itu.
- Halakan kursor ke sesuatu baris untuk memaparkan semat, **Buka folder** dan **Alih keluar daripada senarai**. Mengalih keluar projek daripada senarai tidak menyentuh folder dan fail di dalamnya.
- Projek yang foldernya telah dialihkan atau dipadam kelihatan malap dengan tanda **Folder tiada**. Klik projek itu dan pilih folder yang telah dialihkan untuk meneruskan projek yang sama.
- Apabila anda membuka dokumen di dalam folder projek, projek itu sudah dipilih. Jika anda menukar dokumen itu kepada **Tanpa projek**, pilihan itu kekal apabila dokumen dibuka semula. Projek yang anda pilih untuk dokumen di luar folder juga diingati untuk dokumen itu.
- Projek yang dipilih mula digunakan pada permintaan seterusnya daripada panel itu. Menukar projek di tengah-tengah perbualan akan memulakan perbualan baharu; perbualan yang sedang berjalan kekal di tempatnya.

## Projek baharu dan Tambah folder

- **Projek baharu**: taip nama, dan folder dengan nama itu dicipta dalam folder simpanan lalai anda (pada mulanya `Dokumen\GenOffice`; boleh ditukar dalam Tetapan). **Cipta di tempat lain…** membolehkan anda memilih lokasi lain. Jika folder dengan nama itu sudah wujud, anda akan ditanya sama ada hendak menggunakannya sebagai projek, dan **Guna folder ini** bermula dengannya. Jika folder itu sudah menjadi projek dalam senarai anda, projek itu terus dibuka tanpa bertanya.
- **Tambah folder** (**Guna folder sedia ada** pada skrin Projek di Laman Utama): gunakan folder yang sudah anda ada. Subfoldernya turut disertakan. Keseluruhan pemacu, keseluruhan folder pengguna anda, dan folder yang menyimpan data log masuk atau data aplikasi tidak boleh dipilih.
- Jika anda membuka dokumen dalam folder projek yang tiada dalam senarai, "Dokumen ini berada dalam folder projek '…'" dipaparkan di bawah kotak input bersama butang **Guna**. Mengkliknya sama seperti Tambah folder.
- Jika folder yang anda terima daripada orang lain sudah mengandungi arahan atau ingatan, `AGENTS.md` atau `CLAUDE.md`, atau perbualan yang ditulis pada PC lain, aplikasi akan memaparkannya sekali dan bertanya. **Lihat semua** membolehkan anda membaca kesemuanya dahulu. **Guna dengan arahan** menggunakan kesemuanya. **Guna tanpa arahan** menjauhkan arahan dan ingatan itu daripada AI, menyembunyikan perbualan dari PC lain dan berhenti menambah ingatan; membaca fail masih berfungsi. Anda boleh menukarnya kemudian dengan **Guna arahan juga** di halaman projek. Mengklik **Batal** atau menutup soalan itu tanpa memilih bermakna folder itu tidak ditambah.
- Selepas itu aplikasi tidak bertanya lagi. Jika arahan atau ingatan berubah di luar GenOffice, panel AI memaparkan "Arahan telah berubah" sekali, dan **Lihat** membuka bahagian itu di halaman projek.

## Arahan dan ingatan

- **Arahan** ialah peraturan untuk projek ini, contohnya "Tulis laporan dalam bentuk poin, dan jangan sekali-kali memendekkan nama organisasi". Tulis arahan di halaman projek di Laman Utama dan tekan **Simpan**. Jika bahagian atas folder mempunyai `AGENTS.md` atau `CLAUDE.md`, fail itu turut dibaca, dan anda boleh mematikannya di halaman projek.
- **Ingatan** ialah nota yang ditulis oleh AI semasa perbualan: fakta, pilihan dan keputusan yang berguna kemudian, satu baris setiap satu bersama tarikh. Setiap kali AI menulis nota, panel AI memaparkan "Diingati: …" bersama butang **Padam**. Jika nota itu sudah dipadam, baris itu berbunyi "Memori dipadam: …" dan tiada butang **Padam**. AI tidak bertanya kepada anda dahulu.
- Apabila ingatan menjadi panjang, panel AI memaparkan "Ingatan semakin panjang" bersama butang **Kemaskan**. Menekannya akan menggabungkan nota yang bertindih atau sudah lapuk. Versi sebelumnya disimpan, dan **Buat asal** mengembalikannya. Pengemasan hanya berlaku apabila anda menekan butang itu, dan ia menghantar satu permintaan AI.
- Di halaman projek anda boleh memadam nota, menyunting keseluruhan ingatan dan mematikan ingatan. Apabila dimatikan, tiada nota baharu ditulis tetapi ingatan sedia ada masih dibaca.
- Arahan yang terlalu panjang akan kehilangan bahagian hujungnya, dan panel AI memberitahu anda. Ingatan sentiasa dihantar sepenuhnya, walau sepanjang mana pun.

## Fail yang dilihat oleh AI

- Bersama setiap permintaan, AI menerima nama projek, arahan dan ingatannya, serta senarai nama fail dalam folder itu. AI membaca kandungan fail sendiri apabila perlu, dengan cara yang sama seperti lampiran, jadi bahagian yang disembunyikan daripada AI kekal tersembunyi.
- AI tidak membaca dokumen terbuka yang mempunyai perubahan belum disimpan, fail tersembunyi yang namanya bermula dengan titik, atau folder `.ieumoffice`.
- Untuk menjauhkan sesuatu fail daripada AI, tekan **Sembunyikan daripada AI** di bahagian Fail pada halaman projek. Tindakan ini boleh dibuat asal. Fail itu masih dipaparkan dalam hasil carian Laman Utama.
- Dalam folder yang disegerakkan oleh OneDrive, Google Drive dan perkhidmatan seumpamanya, fail yang belum dimuat turun ke PC ini dipaparkan sebagai "Tiada pada PC ini". Apabila AI mahu membacanya, anda akan ditanya dahulu sama ada hendak memuat turunnya.
- Taip `@` dalam kotak input dan "Fail dalam projek ini" dipaparkan selepas dokumen yang dibuka. Memilih salah satu akan melampirkannya. Lihat [Panel pembantu AI](help://ai-panel).
- Dokumen baharu yang dibuat oleh AI dalam projek disimpan dalam folder dokumen semasa, atau di bahagian atas folder projek jika anda meminta dari Laman Utama. Jika nama itu sudah digunakan, `(2)` ditambah supaya tiada fail yang diganti.

## Perbualan

- Panel AI yang telah memilih projek memaparkan tajuk perbualan semasa di bahagian atas. Klik tajuk itu untuk senarai perbualan projek ini, kotak carian dan **Perbualan baharu**. Mana-mana perbualan dalam senarai boleh disambung semula dalam mana-mana editor.
- Kerja yang dilakukan dalam editor lain dipaparkan sebagai satu baris, seperti "Menjalankan 3 alatan dalam Hangul 'laporan.hwp'". AI hanya menggunakan alatan editor yang sedang anda gunakan.
- Apabila dokumen dibuka, perbualan yang terakhir digunakan dalam dokumen itu dipaparkan. Jika dua tetingkap membuka perbualan yang sama, mesej yang dihantar dalam satu tetingkap terus muncul dalam tetingkap yang satu lagi.
- Perbualan yang ditulis pada PC lain ditandakan **PC lain**.
- Anda boleh menamakan semula atau memadam perbualan dalam senarai. Perbualan yang dipadam dihantar ke tong sampah.
- Perbualan yang sudah ada pada dokumen sebelum ciri ini wujud terletak di bahagian bawah senarai, di bawah **Perbualan terdahulu dalam dokumen ini**.
- Perbualan dengan **Tanpa projek** disimpan mengikut dokumen seperti sebelum ini. Dalam Ask AI di Laman Utama tanpa projek, perbualan tamat apabila anda menutup aplikasi.

## Halaman projek di Laman Utama

**Projek** dalam bar sisi Laman Utama ialah tempat anda mencipta **Projek baharu**, memilih **Guna folder sedia ada** dan membuka sesuatu projek untuk mengurusnya.

- **Pengepala**: nama (menamakan semula projek tidak menamakan semula folder), laluan folder, **Buka dalam File Explorer** (pada Mac **Tunjukkan dalam Finder**) dan statusnya. Jika projek digunakan tanpa arahan, **Guna arahan juga** dipaparkan.
- **Arahan**: kotak arahan, serta `AGENTS.md` dan `CLAUDE.md` yang dibaca bersamanya.
- **Ingatan**: senarai nota, **Sunting semua**, **Kemaskan**, dan suis untuk menghidupkan atau mematikan ingatan.
- **Fail**: fail yang dilihat oleh AI dan fail yang dijauhkan daripadanya. Klik nama fail untuk membukanya.
- **Perbualan**: perbualan projek ini. Klik salah satu untuk membuka dokumen tempat perbualan itu terakhir digunakan dan teruskan dalam panel AI dokumen itu.
- Halaman ini membaca semula folder setiap kali dipaparkan, jadi nota yang baru diingati oleh AI terus kelihatan tanpa meninggalkan halaman. Jika fail arahan atau ingatan berubah di luar GenOffice semasa anda menyuntingnya, **Simpan** bertanya dahulu: **Muat semula** membaca fail yang berubah, dan **Simpan juga** menulis ganti fail itu dengan suntingan anda.

## Apa yang disimpan dalam folder, dan perkara yang perlu diketahui

- Arahan, ingatan dan perbualan disimpan sebagai fail teks dalam folder `.ieumoffice` di dalam folder projek. Jika folder itu dialihkan atau disalin ke PC lain, semuanya ikut bersama. Pada PC lain, pilih folder itu sekali dengan **Tambah folder** dalam panel AI atau **Guna folder sedia ada** pada skrin Projek di Laman Utama.
- Folder `.ieumoffice` hanya dicipta apabila ada sesuatu untuk ditulis. Anda boleh membuka dan menyunting failnya dalam Notepad.
- Apa yang anda taip dalam perbualan boleh masuk ke dalam ingatan. Untuk mengelakkan sesuatu disimpan, padamkannya dengan **Padam** pada baris "Diingati", atau matikan ingatan.
- Jika anda memilih folder yang disegerakkan sebagai projek, arahan, ingatan dan perbualannya turut dimuat naik ke perkhidmatan itu. Aplikasi memberitahu anda sekali, pada kali pertama anda memilihnya.
- Dalam folder kongsi yang digunakan oleh beberapa orang, ingatan dan perbualan boleh bercampur.
- Dalam folder yang tidak boleh ditulis oleh aplikasi, seperti folder baca sahaja, arahan dan pembacaan fail masih berfungsi tetapi perbualan dan ingatan tidak disimpan. Panel AI akan memberitahu anda.
- Tetingkap ejen belum menggunakan projek. Ejen juga boleh menukar fail dalam `.ieumoffice` sesuatu folder, jadi dalam folder yang mengandungi bahan yang anda tidak kenali, gunakan salah satu cara yang bertanya dahulu. Lihat [Mod ejen](help://agent-mode).
