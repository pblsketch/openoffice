# PDF: membaca, memberi anotasi, dan menutupi

Editor PDF punya lima tab di pita: **Beranda / Anotasi / Edit / Halaman / Tampilan**. Ia bisa membaca dan menulis: teks dapat diedit, konten dapat ditutupi, ditandatangani, dan formulir dapat diisi.

## Membaca dan navigasi

- Bilah sisi kiri: **Gambar mini** (klik untuk melompat, rentang yang terlihat disorot) atau **Kerangka** (bookmark, jika ada).
- Zoom: kendali rasio di kanan bawah; ctrl+roda mengubah tingkat zoom.
- Menggeser tampilan: aktifkan **Alat Tangan** (tab Beranda dan Tampilan) lalu seret untuk menggeser halaman ke segala arah. Selama aktif, menyeret tidak memilih teks dan klik biasa tetap membuka tautan. Menyeret sambil menahan tombol tengah (roda) menggeser tampilan tanpa alat ini. Esc atau memilih alat lain mematikannya.
- Rotasi: per halaman atau semua halaman dari menu Halaman; rotasi ditulis kembali saat menyimpan.
- Cari: ctrl+F untuk mencari seluruh teks dengan semua hasil disorot.
- PDF terenkripsi: akan muncul Kotak Dialog Kata Sandi (jendela kecil tersendiri) untuk membukanya; kata sandi hanya dipakai untuk sesi ini. Dokumen seperti ini dapat disunting dan disimpan; saat disimpan, kata sandinya tetap ada. **Anotasi → Lindungi** menetapkan, mengubah, atau menghapus kata sandi dan hal yang boleh dilakukan pembaca.

## Memilih teks dan memberi markup (Anotasi)

Coba pada paragraf mana pun:

1. **Seret mouse melewati sebuah kalimat** — saat dilepas, sebuah bilah anotasi melayang di atasnya:

![Bilah anotasi setelah memilih teks](img/pdf-highlight.png)

2. Pilih salah satu dari tiga warna **Sorot**, atau **Garis bawah**, **Berombak**, atau **Coret**. Untuk mengganti warna sorotan, klik kanan warna itu lalu pilih warna baru. Setelah garis bawah, garis berombak, atau coretan, sebaris warna terbuka di bilah: klik warna lain untuk menggantinya, dan tanda berikutnya juga memakai warna itu. **Tanya AI** mengirim pilihan beserta pertanyaan Anda ke panel AI.
3. Untuk membatalkan sebuah anotasi, seret-pilih ulang bagian yang sama lalu klik tombol aktif pada bilah itu (sakelar bergaya Word), atau pilih bagian itu dan tekan Delete.

Catatan:

- Seret melewati teks dan sebuah bilah muncul: **Sorot / Garis bawah / Coret / Salin / Tanya AI**.
- Warna diambil dari palet; **menerapkan markup yang sama pada rentang yang sudah ditandai akan menghapusnya** (sakelar bergaya Word).
- Markup yang sudah tersimpan di dalam file dapat dipilih dan dihapus (menu ⋯ atau Delete).
- **Catatan**: selagi alat gambar aktif, lapisan teks tidak dapat dipilih — alatnya menonaktifkan diri sendiri setelah tiap penempatan, sehingga Anda kembali ke mode pilih untuk tindakan berikutnya.

## Alat gambar (Anotasi)

Enam alat: **Gambar, Persegi, Elips, Panah, Catatan**, ditambah **Redaksi area** pada tab Anotasi.

- Tiap alat adalah sakelar: klik untuk mengaktifkan; **alatnya menonaktifkan diri sendiri begitu sebuah bentuk ditempatkan** (klik lagi alatnya untuk melanjutkan); mengklik alat yang aktif juga menonaktifkannya.
- Ik mengikuti lebar goresan; persegi/elips/panah digambar dengan menyeret; warna diambil dari palet gambar.
- Bentuk yang ditempatkan dapat dipilih, dihapus, diseret, dan (persegi/elips) diubah ukurannya.
- **Menutupi konten, alur lengkapnya** (menyembunyikan satu baris teks):

  1. Tab Anotasi ▸ klik **Redaksi area** (alat aktif).
  2. **Seret sebuah kotak di atas konten** — isinya tertutup tanda arsir, dan bilah alat memperoleh tombol **Hapus tanda / Terapkan redaksi**.

  3. Klik **Terapkan redaksi** lalu konfirmasi — hasilnya adalah salinan kerja tempat teks dan gambar yang tertutup benar-benar dihapus (bukan sekadar ditutupi) dan tidak dapat dibatalkan; dokumen asli tidak tersentuh.

  Terlalu keliru? Tombol hapus tanda menghapus tanda saat ini sehingga Anda bisa menggambar ulang.

## Catatan tempel dan utas komentar

- **Alat Catatan** menjatuhkan pin dan membuka kartu di margin untuk teks (nama penulis dapat diatur); setelah dikonfirmasi tersimpan sebagai anotasi Teks PDF standar.
- Klik sebuah pin untuk membuka utasnya: **Balas** (balasan tersusun dalam satu daftar datar, tidak bersarang), **Edit** komentar Anda, **Hapus** satu komentar atau seluruh utas.
- Edit yang sedang berjalan bertahan sampai penyimpanan menuliskan teks baru ke anotasi yang sama di dalam file, sehingga rantai balasan tetap utuh.

## Mengedit konten PDF (Edit)

- **Edit teks**: klik teks untuk mengeditnya per blok (mesin pdfium; pencocokan font-contain semaksimal mungkin).
- **Sisipkan teks**: tempatkan teks yang bisa dicari dengan pilihan font/ukuran/warna.
- **Sisipkan gambar / stempel**.
- Formulir: bidang AcroForm dapat diisi langsung; nilainya ditulis saat menyimpan.

## Tanda tangan

- **Tanda tangan tinta**: gambar tangan; dapat ditautkan ke bidang tanda tangan formulir.
- **Tanda tangan gambar**: tempatkan sebuah gambar sebagai tanda tangan.
- Tanda tangan yang tersimpan dapat digunakan lagi.
- **Tanda tangan sertifikat** (tab Anotasi): tanda tangani dengan sertifikat dari penyimpanan sistem atau berkas .p12/.pfx; opsional tampilkan tanda tangan di halaman, dan opsional sertifikatkan dokumen terhadap perubahan lanjutan.
- Menandatangani selalu menulis **berkas baru** (pembaruan inkremental — tanda tangan sebelumnya tetap sah) dan membuka salinan bertanda tangan di tempatnya. Simpan dulu: tanda tangan mencakup berkas sebagaimana tersimpan di diska.
- Spanduk di atas dokumen mendaftar tanda tangan yang ada; **Lihat tanda tangan** menampilkan validitas, cakupan, dan rantai sertifikat masing-masing. Pencabutan (CRL/OCSP) tidak diperiksa.

## Operasi halaman (Halaman)

- **Putar / Hapus halaman / Ubah urutan**: seret gambar mini untuk mengubah urutan; penghapusan meminta konfirmasi.
- **Impor halaman**: tarik halaman dari PDF lain ke dalam dokumen. **Sisipkan halaman kosong** menambahkan satu halaman kosong.
- **Ganti halaman** menukar sebuah rentang dengan halaman dari tempat lain; **Pangkas halaman** memotong tepinya, dengan opsi menerapkannya ke semua halaman.
- **Ukuran halaman** menskalakan ulang setiap halaman ke satu ukuran kertas; **Balik urutan** membalik dokumen dari ujung ke ujung.
- **Ekstrak halaman ini**: ekspor halaman yang dipilih ke PDF baru.
- **Pisahkan PDF**: ada dua bentuk — memecah menurut rentang menjadi beberapa file, atau memotong setiap halaman menjadi kisi halaman yang lebih kecil.
- **Gabungkan PDF**: ada dua bentuk — menambahkan PDF lain, atau menggabungkan beberapa halaman ke satu lembar. Ukuran dijumlahkan **sebelum** apa pun dibaca, dan total yang melebihi **1 GiB akan ditolak** dengan pesan yang bisa dibaca (menjaga pemakaian memori tetap terkendali).
- Perubahan tingkat halaman ditulis kembali pada penyimpanan berikutnya; Simpan Sebagai membiarkan dokumen asli tidak tersentuh.

## Ekspor dan pencetakan

- **Ekspor sebagai Word… / PowerPoint… / Excel…** di menu File, atau ketiganya dari **Konversi PDF** pada pita — semuanya lokal, tanpa unggahan. .pptx keluar dengan satu slide per halaman dan .xlsx dengan satu lembar kerja per halaman. Masing-masing menanyakan tempat penyimpanan.
- **Cetak**: urutan dan rotasi saat ini melalui dialog sistem; rentang halaman didukung.

## Menyimpan

- Simpan biasa/otomatis menuliskan anotasi dan editan kembali ke dalam file (secara atomik).
- **Penutupan konten lewat alur Terapkan miliknya sendiri** sehingga menghasilkan salinan dan membiarkan dokumen asli tidak tersentuh, supaya konten sensitif tidak tertinggal di sana.

## Pintasan bilah pilihan

Selama bilah anotasi tampil di atas teks yang dipilih, satu tombol saja langsung menjalankan sebuah tindakan.

| Tombol | Tindakan                                 |
| ------ | ---------------------------------------- |
| H      | Sorot (menghapus sorotan bila sudah ada) |
| U      | Garis bawah                              |
| S      | Coret                                    |
| N      | Tambahkan catatan di akhir pilihan       |
| E      | Penjelasan AI (kartu kutipan)            |
| T      | Terjemahan AI (kartu kutipan)            |
| Enter  | Buka kotak **Tanya AI**                  |

- Tombol-tombol ini bekerja sama saja saat metode input Korea atau bahasa lain aktif. Tombol tidak dianggap pintasan selama Anda mengetik di kolom isian atau menahan Ctrl atau Alt.
- Di dokumen yang dikunci dari penyuntingan (kata sandi pemiliknya melarang perubahan), H, U, S, dan N tidak melakukan apa pun dan menampilkan alasannya, sama seperti tombol di bilah.

## Kartu kutipan

Tekan **E** atau **T**, atau cip jelaskan dan terjemahkan di kotak **Tanya AI**, lalu jawabannya muncul di kartu kecil di samping pilihan. Kartu disimpan, jadi masih ada ketika dokumen dibuka lagi, dan bisa disalin. Bila Anda menanyakan kutipan yang sama lagi, kartu yang sudah ada dibuka tanpa mengirim apa pun.

- **Simpan sebagai catatan** membuat catatan di tempat itu. Baris pertamanya berbunyi "Penjelasan AI" atau "Terjemahan AI", dan penulisnya adalah nama akun PC Anda. Catatan masuk ke file saat PDF disimpan; sampai saat itu kartu menampilkan "Menunggu disimpan".
- **Tanya lagi di panel AI** meneruskan kutipan dan jawaban ke panel AI tanpa mengirimnya; **Tambahkan ke catatan** menaruhnya di akhir catatan PDF ini.
- Hanya **Buat ulang** yang mengirim kutipan ke AI sekali lagi.
- **Hapus** hanya menghapus kartu yang disimpan. Catatan yang sudah Anda simpan tetap ada.
- Garis titik-titik samar menandai setiap kutipan yang punya kartu; klik garis itu untuk membuka kartunya lagi. Garis ini hanya ada di layar dan tidak pernah disimpan atau dicetak. Nyalakan atau matikan lewat Tampilan ▸ **Tanda kutipan**.

## Semua anotasi dalam satu daftar

- Tampilan ▸ **Anotasi** menampilkan di bilah samping kiri daftar sorotan, garis bawah, coretan, catatan, dan gambar di dokumen, tanda yang belum disimpan, serta kartu kutipan. Tanda juga memperlihatkan teks di bawahnya.
- Saring menurut jenis, warna, rentang halaman, atau teks, lalu urutkan menurut halaman atau urutan pembuatan.
- Klik sebuah item untuk menuju tempatnya dengan kedipan singkat. Catatan membuka utas di margin; kartu membuka kartunya.
- Perintah menu **Salin sebagai Markdown**, **Buka sebagai dokumen Markdown**, dan **Buka sebagai dokumen Word** memakai daftar sesuai saringan saat ini. AI tidak dipakai. Dokumen baru hanya bisa dibuat dari PDF yang dibuka di dalam GenOffice.

## Terjemahan berdampingan

- Nyalakan Tampilan ▸ **Terjemahan berdampingan**, dan kolom terjemahan muncul di sebelah kanan setiap halaman serta ikut bergulir. Menyalakannya saja tidak mengirim apa pun ke AI. Dokumen yang sudah diterjemahkan dengan **Terjemahkan Dokumen** langsung menampilkan terjemahannya; paragraf tanpa terjemahan tampil sebagai teks asli yang samar.
- **Terjemahkan halaman ini** (atau **Terjemahkan sisanya** bila sebagian sudah selesai) mengirim halaman itu dengan sekali tekan saat Anda memakai langganan; nama AI tujuannya tertera di samping tombol. Pada koneksi yang ditagih per pemakaian, tekanan pertama di sebuah tab lebih dulu bertanya "akan mengenakan biaya untuk ini · Terjemahkan / Batal".
- Klik dua kali paragraf terjemahan untuk menyuntingnya. Paragraf yang disunting disimpan sebagai teks polos dan dipakai apa adanya di file PDF, Markdown, dan EPUB terjemahan. **Terjemahkan ulang** pada sebuah paragraf hanya mengirim paragraf itu, dan bertanya dulu bila Anda sudah menyuntingnya.
- Saat tetikus berada di atas paragraf terjemahan, tempatnya di halaman asli diberi bingkai. Lebar dan ukuran huruf kolom bisa diubah. **Terjemahkan semua halaman…** membuka jendela **Terjemahkan Dokumen**, yang format **Simpan saja (tanpa file)**-nya menyimpan terjemahan tanpa menulis file.
- Paragraf yang baru diterjemahkan ditautkan kalimat demi kalimat. Mengarahkan penunjuk ke kalimat terjemahan menyorot kalimat itu di halaman sumber, dan mengarahkannya ke kalimat sumber menerangkan terjemahannya. Jika letak kalimat tidak ditemukan di halaman, serta untuk paragraf yang diterjemahkan sebelumnya atau Anda ubah sendiri, tautannya tetap per paragraf.
- Bilah di atas kolom beralih antara **Terjemahan** dan **Penjelasan sederhana**. Penjelasan sederhana menulis ulang teks dengan kata sehari-hari dan kalimat pendek, untuk anak-anak, orang lanjut usia, atau orang yang sedang belajar bahasa itu; fakta, angka, dan nama tetap seperti semula. Pilihan diingat, dan beralih tidak mengirim apa pun. Selama penjelasan ditampilkan, tombol halaman dan paragraf serta penyuntingan berlaku untuk penjelasan.
- Dalam penjelasan sederhana, **Jelaskan semua halaman dengan sederhana…** membuka jendela **Terjemahkan Dokumen** dengan jenis **Penjelasan sederhana**. Penjelasan lebih panjang daripada aslinya, jadi tidak bisa menjadi PDF terjemahan; penjelasan ditulis sebagai Markdown atau EPUB. Jika **Asli lalu penjelasan** dinyalakan, setiap paragraf asli diikuti penjelasannya; jika dimatikan, file hanya berisi penjelasan. Bahasanya awalnya bahasa antarmuka dan boleh sama dengan bahasa dokumen.

## Sorotan AI

- Di Beranda ▸ **Sorotan AI**, pilih satu set kategori (Riset & laporan, Kontrak & ketentuan, Buku pelajaran & panduan, atau Buat sendiri) dan halamannya. Tidak ada yang dikirim sampai Anda memeriksa perkiraan jumlah panggilan dan AI tujuannya lalu menekan **Mulai**.
- Kalimat yang dipilih AI ditampilkan sebagai pratinjau berupa kotak berwarna tembus pandang di halaman. Pratinjau tidak pernah disimpan; nyalakan atau matikan lewat Tampilan ▸ **Pratinjau sorotan**.
- Di panel **Anotasi**, tekan **Terima** atau **Buang** untuk tiap saran, atau terima satu kategori sekaligus. Kalimat yang tidak ditemukan di teks halaman tidak bisa diterima.
- Saran yang diterima menjadi sorotan dengan warna kategorinya, dan nama kategori disimpan sebagai subjek anotasi, sehingga penampil PDF lain juga menampilkannya di daftar komentar. Sorotan masuk ke file saat PDF disimpan.
- Sorotan AI tidak bisa dimulai di dokumen yang dikunci dari penyuntingan. Kalimat karangan AI yang tidak ada di teks dibuang, dan laporan akhir menyebut berapa yang diterima dan berapa yang dibuang.

## Ikhtisar dokumen dan kutipan paragraf

- Di bagian atas panel AI, **Ikhtisar dokumen** ▸ **Buat ikhtisar** membuat ringkasan tiga baris, ringkasan, dan istilah kunci (beserta artinya dan halaman pertama kemunculannya). Dokumen panjang diringkas per bagian, jadi Anda lebih dulu mengonfirmasi perkiraan jumlah panggilan.
- Ikhtisar disimpan dan tetap ada ketika dibuka lagi; hanya **Buat ulang** yang mengirim lagi. Klik sebuah istilah untuk mencarinya di dokumen; setiap bagian bisa disalin atau ditambahkan ke catatan.
- Saat percakapan masih kosong, panel AI menawarkan tiga pertanyaan yang disarankan. Mengklik salah satunya mengirimnya sekali.
- Mengklik tautan halaman (p.N) yang diberikan AI sebagai bukti akan membuka halaman itu dan menonjolkan kalimat yang dikutip selama dua detik. Bila kalimatnya tidak ditemukan, hanya halamannya yang dibuka.

## Satu catatan untuk setiap PDF

- Saat pertama kali menekan **Buka catatan** (tab Tampilan atau panel **Anotasi**), jendela simpan terbuka, dengan bawaan folder PDF dan nama "nama PDF catatan.md". Setelah itu catatan langsung terbuka di tab Markdown.
- Bila Anda memilih file yang sudah ada, Windows mungkin bertanya apakah akan menggantinya, tetapi file tidak ditimpa: file itu ditautkan sebagai catatan apa adanya.
- **Tambahkan ke catatan** (pada kartu, item panel, dan ikhtisar dokumen) menaruh kutipan dan tautan halaman di akhir tab catatan dan membiarkannya belum disimpan; Anda sendiri yang menyimpan di tab catatan. Tautan ini membuka PDF di halaman tersebut juga di program lain, seperti peramban.
- PDF yang belum pernah disimpan menampilkan "Simpan PDF terlebih dahulu". Catatan hanya berfungsi untuk PDF yang dibuka di dalam GenOffice.
