# Proyek

Proyek adalah satu folder di PC Anda. Pilih proyek di panel AI, dan AI bekerja dengan mengetahui file, instruksi, memori, dan obrolan di folder itu. Simpan dokumen untuk satu pekerjaan di satu folder, maka obrolan yang dimulai di Docs bisa dilanjutkan di Hangul atau Slides tanpa harus menjelaskan latar belakangnya lagi di setiap dokumen.

## Memilih proyek

- Di panel AI setiap editor dan di **Ask AI** pada Beranda, nama proyek yang sedang dipakai ada di sebelah kiri, di bawah kotak masukan. Jika belum ada yang dipilih, tertulis **Tanpa proyek**.
- Klik nama itu untuk membuka daftarnya: proyek **Disematkan** dan **Terbaru**, **Proyek baru**, **Tambah folder**, dan **Tanpa proyek**. Ketik di kotak paling atas untuk mencari; jika tidak ada proyek yang cocok, Anda bisa langsung membuat proyek baru dengan nama itu.
- Arahkan kursor ke sebuah baris untuk menampilkan sematkan, **Buka folder**, dan **Hapus dari daftar**. Menghapus proyek dari daftar tidak mengubah folder maupun file di dalamnya.
- Proyek yang foldernya dipindahkan atau dihapus tampak redup dengan tulisan **Folder tidak ditemukan**. Klik, lalu pilih folder yang sudah dipindahkan untuk melanjutkan proyek yang sama.
- Saat Anda membuka dokumen di dalam folder proyek, proyek itu sudah langsung terpilih. Jika dokumen itu Anda ubah ke **Tanpa proyek**, pilihan itu tetap berlaku saat dokumen dibuka lagi. Proyek yang Anda pilih untuk dokumen di luar folder juga diingat untuk dokumen tersebut.
- Proyek yang dipilih berlaku mulai permintaan berikutnya dari panel itu. Mengganti proyek di tengah obrolan akan memulai obrolan baru; obrolan sebelumnya tetap tersimpan di tempatnya.

## Proyek baru dan Tambah folder

- **Proyek baru**: ketik sebuah nama, lalu folder dengan nama itu dibuat di folder simpan bawaan Anda (awalnya `Dokumen\GenOffice`; bisa diubah di Pengaturan). **Buat di tempat lain…** memungkinkan Anda memilih lokasi lain. Jika folder dengan nama itu sudah ada, Anda akan ditanya apakah folder itu mau dipakai sebagai proyek, dan **Gunakan folder ini** memulai dengan folder itu. Jika folder itu sudah menjadi proyek di daftar Anda, proyek itu langsung dibuka tanpa bertanya.
- **Tambah folder** (**Gunakan folder yang ada** di layar Proyek pada Beranda): memakai folder yang sudah Anda punya. Subfoldernya ikut disertakan. Seluruh drive, seluruh folder pengguna Anda, dan folder yang berisi data login atau data aplikasi tidak dapat dipilih.
- Jika Anda membuka dokumen di folder proyek yang belum ada di daftar, di bawah kotak masukan muncul "Dokumen ini ada di folder proyek '…'" beserta tombol **Gunakan**. Mengekliknya sama dengan Tambah folder.
- Jika folder yang Anda terima dari orang lain sudah berisi instruksi atau memori, `AGENTS.md` atau `CLAUDE.md`, atau obrolan yang ditulis di PC lain, aplikasi menampilkannya sekali dan bertanya. **Lihat semua** memungkinkan Anda membaca semuanya lebih dulu. **Gunakan dengan instruksi** memakai semuanya. **Gunakan tanpa instruksi** menjauhkan instruksi dan memori itu dari AI, menyembunyikan obrolan dari PC lain, dan berhenti menambah memori; membaca file tetap bisa. Nanti Anda bisa mengubahnya dengan **Gunakan instruksi juga** di halaman proyek. Mengeklik **Batal** atau menutup pertanyaan itu tanpa memilih berarti folder tidak ditambahkan.
- Setelah itu aplikasi tidak bertanya lagi. Jika instruksi atau memori diubah di luar GenOffice, panel AI menampilkan "Instruksi berubah" satu kali, dan **Lihat** membuka bagian itu di halaman proyek.

## Instruksi dan memori

- **Instruksi** adalah aturan untuk proyek ini, misalnya "Tulis laporan dalam bentuk butir, dan jangan pernah menyingkat nama instansi". Tulis di halaman proyek pada Beranda lalu tekan **Simpan**. Jika bagian teratas folder berisi `AGENTS.md` atau `CLAUDE.md`, file itu ikut dibaca, dan Anda bisa menonaktifkannya di halaman proyek.
- **Memori** adalah catatan yang ditulis AI selama obrolan: fakta, preferensi, dan keputusan yang berguna nanti, masing-masing satu baris dengan tanggalnya. Setiap kali AI menulis catatan, panel AI menampilkan "Diingat: …" dengan tombol **Hapus**. Jika catatan itu sudah dihapus, baris itu berbunyi "Memori dihapus: …" dan tidak punya tombol **Hapus**. AI tidak meminta izin Anda lebih dulu.
- Saat memori makin panjang, panel AI menampilkan "Memori mulai panjang" dengan tombol **Rapikan**. Menekannya menggabungkan catatan yang tumpang tindih atau sudah usang. Versi sebelumnya tetap disimpan, dan **Urungkan** mengembalikannya. Perapian hanya terjadi saat Anda menekan tombol itu, dan memakai satu permintaan AI.
- Di halaman proyek Anda bisa menghapus catatan, menyunting seluruh memori, dan menonaktifkan memori. Jika dinonaktifkan, tidak ada catatan baru yang ditulis, tetapi memori yang sudah ada tetap dibaca.
- Instruksi yang sangat panjang akan terpotong bagian akhirnya, dan panel AI memberi tahu Anda. Memori selalu dikirim utuh, sepanjang apa pun.

## File yang dilihat AI

- Pada setiap permintaan, AI menerima nama proyek, instruksi dan memorinya, serta daftar nama file di folder itu. Isi file dibaca sendiri oleh AI saat diperlukan, dengan cara yang sama seperti lampiran, sehingga bagian yang disembunyikan dari AI tetap tersembunyi.
- AI tidak membaca dokumen terbuka yang punya perubahan belum disimpan, file tersembunyi yang namanya diawali titik, atau folder `.ieumoffice`.
- Agar sebuah file tidak dilihat AI, tekan **Sembunyikan dari AI** di bagian File pada halaman proyek. Ini bisa dibatalkan. File itu tetap muncul di hasil pencarian Beranda.
- Di folder yang disinkronkan oleh OneDrive, Google Drive, dan layanan sejenis, file yang belum diunduh ke PC ini ditandai "Tidak ada di PC ini". Saat AI ingin membacanya, Anda ditanya dulu apakah file itu mau diunduh.
- Ketik `@` di kotak masukan, dan "File di proyek ini" muncul setelah dokumen yang terbuka. Memilih salah satunya akan melampirkannya. Lihat [Panel asisten AI](help://ai-panel).
- Dokumen baru yang dibuat AI dalam proyek disimpan di folder dokumen yang sedang dibuka, atau di bagian teratas folder proyek jika Anda memintanya dari Beranda. Jika namanya sudah dipakai, `(2)` ditambahkan agar tidak ada file yang tertimpa.

## Obrolan

- Panel AI yang sudah memilih proyek menampilkan judul obrolan yang sedang berjalan di bagian atas. Klik judul itu untuk melihat daftar obrolan proyek ini, kotak pencarian, dan **Obrolan baru**. Obrolan mana pun di daftar bisa dilanjutkan lagi di editor mana pun.
- Pekerjaan yang dilakukan di editor lain tampil sebagai satu baris, misalnya "Menjalankan 3 alat di Hangul 'laporan.hwp'". AI hanya memakai alat milik editor tempat Anda berada.
- Saat dokumen dibuka, obrolan yang terakhir dipakai di dokumen itu langsung tampil. Jika dua jendela membuka obrolan yang sama, pesan yang dikirim di salah satunya langsung muncul di jendela lainnya.
- Obrolan yang ditulis di PC lain diberi tanda **PC lain**.
- Anda bisa mengganti nama atau menghapus obrolan di daftar. Obrolan yang dihapus masuk ke tempat sampah.
- Obrolan yang sudah dimiliki dokumen sebelum fitur ini ada berada di bagian bawah daftar, di bawah **Obrolan sebelumnya di dokumen ini**.
- Obrolan dengan **Tanpa proyek** tetap disimpan per dokumen seperti sebelumnya. Di Ask AI pada Beranda tanpa proyek, obrolan berakhir saat aplikasi ditutup.

## Halaman proyek di Beranda

**Proyek** di bilah sisi Beranda adalah tempat Anda membuat **Proyek baru**, memilih **Gunakan folder yang ada**, dan membuka sebuah proyek untuk mengelolanya.

- **Kepala halaman**: nama (mengganti nama proyek tidak mengganti nama folder), jalur folder, **Buka di File Explorer** (di Mac **Tampilkan di Finder**), dan statusnya. Jika proyek dipakai tanpa instruksi, muncul **Gunakan instruksi juga**.
- **Instruksi**: kotak instruksi, serta `AGENTS.md` dan `CLAUDE.md` yang ikut dibaca.
- **Memori**: daftar catatan, **Sunting semua**, **Rapikan**, dan sakelar memori.
- **File**: file yang dilihat AI dan file yang disembunyikan darinya. Klik nama file untuk membukanya.
- **Obrolan**: obrolan proyek ini. Klik salah satunya untuk membuka dokumen tempat obrolan itu terakhir dipakai dan melanjutkannya di panel AI dokumen itu.
- Halaman ini membaca ulang folder setiap kali ditampilkan, jadi catatan yang baru saja diingat AI langsung terlihat tanpa meninggalkan halaman. Jika file instruksi atau memori berubah di luar GenOffice saat Anda menyuntingnya, **Simpan** bertanya dulu: **Muat ulang** membaca file yang berubah, dan **Tetap simpan** menimpanya dengan suntingan Anda.

## Apa yang tersimpan di folder, dan hal yang perlu diketahui

- Instruksi, memori, dan obrolan disimpan sebagai file teks di folder `.ieumoffice` di dalam folder proyek. Jika folder dipindahkan atau disalin ke PC lain, semuanya ikut terbawa. Di PC lain, pilih folder itu sekali dengan **Tambah folder** di panel AI atau **Gunakan folder yang ada** di layar Proyek pada Beranda.
- Folder `.ieumoffice` hanya dibuat jika ada sesuatu yang perlu ditulis. Anda bisa membuka dan menyunting file di dalamnya dengan Notepad.
- Apa yang Anda ketik dalam obrolan bisa masuk ke memori. Agar sesuatu tidak tersimpan, hapus dengan **Hapus** pada baris "Diingat", atau nonaktifkan memori.
- Jika Anda memilih folder yang disinkronkan sebagai proyek, instruksi, memori, dan obrolannya juga ikut diunggah ke layanan tersebut. Aplikasi memberi tahu Anda sekali, saat pertama kali folder itu dipilih.
- Di folder bersama yang dipakai beberapa orang, memori dan obrolan bisa tercampur.
- Di folder yang tidak bisa ditulisi aplikasi, misalnya folder baca-saja, instruksi dan pembacaan file tetap berfungsi, tetapi obrolan dan memori tidak disimpan. Panel AI akan memberi tahu Anda.
- Jendela agen belum memakai proyek. Agen juga bisa mengubah file di folder `.ieumoffice`, jadi di folder yang isinya tidak Anda kenal, pakailah salah satu cara yang bertanya lebih dulu. Lihat [Mode agen](help://agent-mode).
