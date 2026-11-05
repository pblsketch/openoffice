# PDF: membaca, menganotasi, dan redact

Editor PDF mempunyai lima tab pada reben: **Laman Utama / Anotasi / Edit / Halaman / Pandangan**. Ia boleh membaca dan menulis, yang bermaksud teks boleh disunting, kandungan boleh di-redact dan ditandatangani, serta borang boleh diisi.

## Membaca dan navigasi

- Bar sisi kiri: **lakaran kenit** untuk melompat ke slaid dengan julat yang kelihatan ditanda, atau **kerangka** untuk penanda halaman apabila ia wujud.
- Zum: kawalan nisbah di penjuru kanan bawah. Gunakan ctrl dan roda tetikus untuk menukar zum secara berperingkat.
- Mengalihkan paparan: hidupkan **Alat Tangan** (tab Laman Utama dan Pandangan) dan seret untuk mengalihkan halaman ke semua arah. Semasa ia hidup, menyeret tidak memilih teks dan klik biasa masih membuka pautan. Menyeret sambil menekan butang tengah (roda) mengalihkan paparan tanpa alat ini. Esc atau memilih alat lain mematikannya.
- Putaran: setiap halaman atau kesemua halaman melalui menu Halaman, dan putaran itu ditulis semula semasa menyimpan.
- Carian: ctrl+F untuk mencari teks penuh, dengan semua hasil ditanda.
- PDF yang disulitkan: prompts pertanyaan kata laluan dalam tetingkap kecil tersendiri, dan kata laluan itu hanya digunakan untuk sesi ini. Dokumen seperti ini boleh disunting dan disimpan; apabila disimpan, kata laluannya kekal. **Anotasi → Lindung** menetapkan, menukar atau membuang kata laluan dan perkara yang dibenarkan kepada pembaca.

## Memilih teks dan menanda (Anotasi)

Cuba pada mana-mana perenggan:

1. **Seret tetikus melepasi ayat** dan selepas dilepaskan, bar anotasi akan muncul di atas teks:

![Bar anotasi selepas memilih teks](img/pdf-highlight.png)

2. Pilih salah satu daripada tiga warna **sorotan**, atau **garisan bawah**, **gelombang** atau **potongan garis**. Untuk menukar warna sorotan, klik kanan warna itu dan pilih warna baharu. Selepas garisan bawah, gelombang atau potongan garis, satu baris warna terbuka pada bar: klik warna lain untuk menukarnya, dan tanda seterusnya juga memakai warna itu. **Tanya AI** menghantar pilihan itu bersama soalan anda ke panel AI.
3. Untuk membatalkan anotasi, pilih semula petikan yang sama dan klik butang yang sedang aktif pada bar tersebut, atau pilih dan tekan Delete.

Butiran yang perlu diketahui:

- Menu lungsur muncul apabila anda menyeret teks, dan ia menyediakan **sorotan / garisan bawah / potongan garis / salin / Tanya AI**.
- Warna dipilih daripada palet tersebut, dan **memasang tanda yang sama pada julat yang sudah ditandakan akan mengeluarkannya**, seperti suis dalam Word.
  **FUNKTION** mengeluarkan tanda itu, seperti suis dalam Word.
- Tanda yang telah disimpan ke dalam fail masih boleh dipilih dan dipadam melalui menu atau kekunci Delete.
- **Nota**: semasa alat lukis diaktifkan, lapisan teks tidak boleh dipilih. Alat itu menekan dirinya sendiri selepas setiap bentuk diletakkan, jadi anda kembali ke mod pilih selepas itu.

## Alat lukis (Anotasi)

Enam alat disediakan: **dakwat, segi empat, elips, anak panah, dan nota**, serta **kotak redact** pada tab Anotasi.

- Setiap alat berfungsi sebagai suis. Klik untuk mengaktifkannya, dan ia akan **mematikan dirinya sendiri sebaik sahaja satu bentuk diletakkan**. Klik semula pada alat itu untuk meneruskan secara berturutan, dan klik pada alat yang sedang aktif akan mematikannya.
- Dakwat mengikut lebar garisan, segi empat, elips dan anak panah dilukis dengan menyeret, dan warna diambil daripada palet lukis.
- Bentuk yang diletakkan boleh dipilih, dipadam, diseret, dan dalam kes segi empat atau elips, diubah saiznya.
- **Redact, aliran kerja penuh** untuk menyembunyikan satu baris teks:

  1. Pergi ke tab Anotasi dan klik **Redaksi kawasan** untuk mengaktifkan alat itu.

  2. **Seret satu kotak di atas kandungan** supaya ia ditutup dengan tanda bercorak, dan bar alat akan memperoleh dua butang **Kosongkan tanda** serta **Gunakan redaksi**.

  3. Klik **Gunakan redaksi** dan sahkan. Hasilnya ialah salinan kerja yang teks dan imej yang ditutup itu akan dibuang secara fizikal, dan tindakan ini tidak boleh dibatalkan. Dokumen asal kekal tidak berubah.

  Jika silap, tekan butang kosongkan tanda untuk menghapuskan tanda semasa dan melukis semula.

## Nota melekat dan utas komen

- **Alat nota** menetapkan pin dan membuka kad pada margin untuk teks tersebut, dengan nama pengarang yang boleh dikonfigurasikan. Setelah disahkan, ia disimpan sebagai anotasi teks PDF biasa.
- Klik pin untuk membuka utas, yang membolehkan anda **balas**, **sunting** komen sendiri, atau **padam** satu komen atau keseluruhan utas.
- Suntingan yang sedang berjalan kekal sehingga proses menyimpan menulis teks baharu itu ke dalam anotasi yang sama, dan ini mengekalkan rantaian balasan.

## Menyunting kandungan PDF (Edit)

- **Sunting teks**: klik teks untuk menyuntingnya blok demi blok, menggunakan enjin pdfium dan memadankan fon sebaik mungkin.
- **Sisip teks**: masukkan teks yang boleh dicari dengan pilihan fon, saiz, dan warna.
- **Sisip imej atau set**.
- Borang: medan AcroForm boleh diisi terus, dan nilainya ditulis semasa menyimpan.

## Tandatangan

- **Tandatangan dakwat**: lukis tanda tangan itu dan ia boleh dikaitkan dengan medan tanda tangan borang.
- **Tandatangan imej**: letakkan gambar sebagai tanda tangan.
- Tandatangan yang telah disimpan boleh digunakan semula.
- **Tandatangan sertifikat** (tab Anotasi): tandatangani dengan sertifikat daripada storan sistem atau fail .p12/.pfx; pilihan tunjukkan tandatangan pada halaman, dan pilihan bersertifikatkan dokumen daripada perubahan kemudian.
- Menandatangani sentiasa menulis **fail baharu** (kemas kini bertambah — tandatangan terdahulu kekal sah) dan membuka salinan bertandatangan di tempatnya. Simpan dahulu: tandatangan meliputi fail seperti tersimpan pada cakera.
- Sepanduk di atas dokumen menyenaraikan tandatangan sedia ada; **Lihat tandatangan** menunjukkan kesahihan, liputan dan rantaian sertifikat setiap satu. Pembatalan (CRL/OCSP) tidak disemak.

## Operasi halaman (Halaman)

- **Putar, padam, atau susun semula**: seret lakaran kenit untuk menyusun semula, dan pemadaman memerlukan pengesahan.
- **Import halaman**: seret halaman daripada PDF lain ke dalam dokumen. **Sisipkan halaman kosong** menambah satu halaman kosong.
- **Ganti halaman** menukar satu julat dengan halaman dari tempat lain, manakala **Pangkas halaman** memotong tepinya, dengan pilihan untuk menerapkannya kepada semua halaman.
- **Saiz halaman** menskalakan semula setiap halaman kepada satu saiz kertas yang sama, dan **Terbalikkan susunan** membalikkan dokumen dari hujung ke hujung.
- **Kekalkan halaman**: eksport halaman yang dipilih ke PDF baharu.
- **Pisah PDF**: ada dua bentuk — pecahkan mengikut julat menjadi beberapa fail, atau potong setiap halaman menjadi grid halaman yang lebih kecil.
- **Gabung PDF**: ada dua bentuk — tambah PDF lain, atau gabungkan beberapa halaman ke atas satu helaian. Saiz akan dikira **sebelum** apa-apa yang lain dibaca, dan jumlah melebihi 1 GiB akan ditolak dengan ralat yang jelas, bagi memastikan penggunaan memori kekal terhad.
- Perubahan peringkat halaman ditulis semula semasa simpanan seterusnya, dan pilihan Simpan Sebagai membiarkan fail asal tidak berubah.

## Eksport dan cetakan

- **Eksport sebagai Word… / PowerPoint… / Excel…** dalam menu Fail, atau ketiga-tiganya daripada **Tukar PDF** pada reben — semuanya setempat, tiada muat naik. Fail .pptx keluar dengan satu slaid bagi setiap halaman dan fail .xlsx dengan satu lembar kerja bagi setiap halaman. Setiap satu akan bertanya di mana untuk disimpan.
- **Cetak** menggunakan susunan halaman dan putaran semasa melalui dialog sistem, dan julat halaman disokong.

## Simpanan

- Simpanan biasa, sama ada manual atau automatik, menulis anotasi dan suntingan kembali ke dalam fail secara atomik.
- **Penggunaan redaksi** melalui aliran Guna sendiri menghasilkan satu salinan, sambil membiarkan fail asal tidak berubah, jadi kandungan sensitif tidak kekal di dalamnya.

## Pintasan bar pilihan

Selagi bar anotasi kelihatan di atas teks yang dipilih, satu kekunci sahaja terus menjalankan sesuatu tindakan.

| Kekunci | Tindakan                                  |
| ------- | ----------------------------------------- |
| H       | Serlah (membuang serlahan jika sudah ada) |
| U       | Garisan bawah                             |
| S       | Potongan garis                            |
| N       | Tambah nota di hujung pilihan             |
| E       | Penerangan AI (kad petikan)               |
| T       | Terjemahan AI (kad petikan)               |
| Enter   | Buka kotak **Tanya AI**                   |

- Kekunci ini berfungsi sama walaupun kaedah input bahasa Korea atau bahasa lain dihidupkan. Kekunci tidak dikira pintasan semasa anda menaip dalam medan atau menahan Ctrl atau Alt.
- Dalam dokumen yang dikunci daripada disunting (kata laluan pemiliknya melarang perubahan), H, U, S dan N tidak berbuat apa-apa dan memaparkan sebabnya, sama seperti butang pada bar.

## Kad petikan

Tekan **E** atau **T**, atau cip terangkan dan terjemah dalam kotak **Tanya AI**, lalu jawapannya muncul dalam kad kecil di sebelah pilihan. Kad disimpan, jadi masih ada apabila dokumen dibuka semula, dan boleh disalin. Jika anda bertanya tentang petikan yang sama sekali lagi, kad sedia ada dibuka tanpa menghantar apa-apa.

- **Simpan sebagai nota** mencipta nota di tempat itu. Baris pertamanya berbunyi "Penerangan AI" atau "Terjemahan AI", dan penulisnya ialah nama akaun PC anda. Nota masuk ke dalam fail apabila PDF disimpan; sebelum itu kad memaparkan "Menunggu simpanan".
- **Tanya lagi dalam panel AI** memindahkan petikan dan jawapan ke panel AI tanpa menghantarnya; **Tambah ke nota** meletakkannya di hujung nota PDF ini.
- Hanya **Jana semula** yang menghantar petikan kepada AI sekali lagi.
- **Padam** hanya memadam kad yang disimpan. Nota yang sudah anda simpan kekal.
- Garisan titik-titik yang samar menandakan setiap petikan yang ada kad; klik garisan itu untuk membuka kad semula. Garisan ini hanya pada skrin dan tidak sekali-kali disimpan atau dicetak. Hidupkan atau matikan melalui Pandangan ▸ **Tanda petikan**.

## Semua anotasi dalam satu senarai

- Pandangan ▸ **Anotasi** memaparkan dalam bar sisi kiri senarai serlahan, garisan bawah, potongan garis, nota dan lukisan dokumen, tanda yang belum disimpan, serta kad petikan. Tanda turut menunjukkan teks di bawahnya.
- Tapis mengikut jenis, warna, julat halaman atau teks, dan isih mengikut halaman atau tertib penciptaan.
- Klik sesuatu item untuk pergi ke tempatnya dengan kelipan singkat. Nota membuka bebenang di jidar; kad membuka kad.
- Arahan menu **Salin sebagai Markdown**, **Buka sebagai dokumen Markdown** dan **Buka sebagai dokumen Word** menggunakan senarai seperti yang ditapis sekarang. AI tidak digunakan. Dokumen baharu hanya boleh dibuat daripada PDF yang dibuka di dalam GenOffice.

## Terjemahan sebelah-menyebelah

- Hidupkan Pandangan ▸ **Terjemahan sebelah-menyebelah**, dan lajur terjemahan muncul di sebelah kanan setiap halaman serta menatal bersamanya. Menghidupkannya sahaja tidak menghantar apa-apa kepada AI. Dokumen yang sudah diterjemah dengan **Terjemah Dokumen** terus memaparkan terjemahannya; perenggan tanpa terjemahan kelihatan sebagai teks asal yang pudar.
- **Terjemah halaman ini** (atau **Terjemah bakinya** jika sebahagian sudah siap) menghantar halaman itu dengan sekali tekan semasa anda menggunakan langganan; nama AI penerima tertera di sebelah butang. Pada sambungan yang dicaj mengikut penggunaan, tekanan pertama dalam sesuatu tab bertanya dahulu "akan mengenakan caj untuk ini · Terjemah / Batal".
- Klik dua kali pada perenggan terjemahan untuk menyuntingnya. Perenggan yang disunting disimpan sebagai teks biasa dan digunakan seadanya dalam fail PDF, Markdown dan EPUB terjemahan. **Terjemah semula** pada sesuatu perenggan hanya menghantar perenggan itu, dan bertanya dahulu jika anda telah menyuntingnya.
- Apabila tetikus berada di atas perenggan terjemahan, tempatnya pada halaman asal diberi bingkai. Lebar dan saiz huruf lajur boleh diubah. **Terjemah semua halaman…** membuka tetingkap **Terjemah Dokumen**, dan format **Simpan sahaja (tiada fail)** di situ menyimpan terjemahan tanpa menulis fail.
- Perenggan yang baru diterjemah dipautkan ayat demi ayat. Meletakkan penuding pada ayat terjemahan menyerlahkan ayat itu di halaman sumber, dan meletakkannya pada ayat sumber menerangkan terjemahannya. Di tempat ayat tidak ditemui pada halaman, serta bagi perenggan yang diterjemah sebelum ini atau yang anda sunting sendiri, pautan kekal mengikut perenggan.
- Bar di atas lajur bertukar antara **Terjemahan** dan **Penerangan mudah**. Penerangan mudah menulis semula teks dengan perkataan harian dan ayat pendek, untuk kanak-kanak, warga emas atau orang yang sedang belajar bahasa itu; fakta, nombor dan nama kekal seperti asal. Pilihan diingat, dan bertukar tidak menghantar apa-apa. Selagi penerangan dipaparkan, butang halaman dan perenggan serta suntingan dikenakan pada penerangan.
- Dalam penerangan mudah, **Terangkan semua halaman dengan mudah…** membuka tetingkap **Terjemah Dokumen** dengan jenis **Penerangan mudah**. Penerangan lebih panjang daripada asalnya, jadi tidak boleh menjadi PDF terjemahan; ia ditulis sebagai Markdown atau EPUB. Jika **Asal kemudian penerangan** dihidupkan, setiap perenggan asal diikuti penerangannya; jika dimatikan, fail hanya mengandungi penerangan. Bahasanya pada mulanya bahasa antara muka dan boleh sama dengan bahasa dokumen.

## Serlahan AI

- Di Laman Utama ▸ **Serlahan AI**, pilih satu set kategori (Penyelidikan & laporan, Kontrak & terma, Buku teks & manual, atau Tentukan sendiri) dan halamannya. Tiada apa-apa dihantar sehingga anda menyemak anggaran bilangan panggilan dan AI penerima, kemudian menekan **Mula**.
- Ayat yang dipilih AI dipratonton sebagai kotak berwarna lut sinar pada halaman. Pratonton tidak sekali-kali disimpan; hidupkan atau matikan melalui Pandangan ▸ **Pratonton serlahan**.
- Dalam panel **Anotasi**, tekan **Terima** atau **Buang** bagi setiap cadangan, atau terima satu kategori sekali gus. Ayat yang tidak ditemui dalam teks halaman tidak boleh diterima.
- Cadangan yang diterima menjadi serlahan dalam warna kategorinya, dan nama kategori disimpan sebagai subjek anotasi, jadi pemapar PDF lain turut memaparkannya dalam senarai komen. Serlahan masuk ke dalam fail apabila PDF disimpan.
- Serlahan AI tidak boleh dimulakan dalam dokumen yang dikunci daripada disunting. Ayat rekaan AI yang tiada dalam teks dibuang, dan laporan akhir menyatakan berapa yang diterima dan berapa yang dibuang.

## Gambaran keseluruhan dokumen dan petikan perenggan

- Di bahagian atas panel AI, **Gambaran keseluruhan dokumen** ▸ **Buat gambaran keseluruhan** menghasilkan ringkasan tiga baris, ringkasan dan istilah utama (beserta maksud dan halaman pertama ia muncul). Dokumen panjang diringkaskan mengikut bahagian, jadi anda mengesahkan anggaran bilangan panggilan terlebih dahulu.
- Gambaran keseluruhan disimpan dan masih ada apabila dibuka semula; hanya **Jana semula** yang menghantar sekali lagi. Klik sesuatu istilah untuk mencarinya dalam dokumen; setiap bahagian boleh disalin atau ditambah ke nota.
- Apabila perbualan masih kosong, panel AI menawarkan tiga soalan yang dicadangkan. Klik salah satu untuk menghantarnya sekali.
- Mengklik pautan halaman (p.N) yang diberikan AI sebagai bukti akan membawa anda ke halaman itu dan menonjolkan ayat yang dipetik selama dua saat. Jika ayat itu tidak ditemui, hanya halaman itu yang dibuka.

## Satu nota bagi setiap PDF

- Kali pertama anda menekan **Buka nota** (tab Pandangan atau panel **Anotasi**), tetingkap simpan dibuka, dengan lalai folder PDF dan nama "nama PDF nota.md". Selepas itu nota terus dibuka dalam tab Markdown.
- Jika anda memilih fail yang sudah wujud, Windows mungkin bertanya sama ada mahu menggantikannya, tetapi fail itu tidak ditulis ganti: ia dipautkan sebagai nota seadanya.
- **Tambah ke nota** (pada kad, item panel dan gambaran keseluruhan dokumen) meletakkan petikan beserta pautan halaman di hujung tab nota dan membiarkannya belum disimpan; anda sendiri yang menyimpannya dalam tab nota. Pautan ini membuka PDF pada halaman itu dalam program lain juga, seperti pelayar.
- PDF yang belum pernah disimpan memaparkan "Simpan PDF dahulu". Nota hanya berfungsi untuk PDF yang dibuka di dalam GenOffice.
