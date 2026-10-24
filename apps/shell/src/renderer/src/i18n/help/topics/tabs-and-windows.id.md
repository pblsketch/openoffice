# Tab dan pengelolaan jendela

Semua file yang terbuka berbagi satu jendela; bilah tab di atas berpindah di antaranya, ala peramban.

![Bilah tab: Beranda dan dua dokumen](img/tabs.png)

## Dasar-dasar

- **Berpindah**: klik tab, tekan **Ctrl+Tab** (berikutnya) / **Ctrl+Shift+Tab** (sebelumnya), atau gulir roda mouse di atas bilah.
- **Menutup**: tanda × pada tab, atau ⌘W/ctrl+W. Perubahan yang belum disimpan akan ditanyakan lebih dulu.
- **Baru**: tanda + di ujung kanan bilah.
- **Aktif seketika**: menekan sebuah tab langsung berpindah begitu ditekan, tanpa menunggu klik selesai.

## Mengganti nama: klik dua kali sebuah tab

**Klik dua kali tab file mana pun** dan judulnya berubah menjadi kolom isian langsung: Enter menyimpan, Escape membatalkan, klik ke luar juga menyimpan; tombol Enter yang dipakai untuk mengonfirmasi kandidat IME tidak disalahartikan sebagai penyimpanan. Penggantian nama ini melewati pemeriksaan keamanan yang sama seperti perubahan nama baris di Beranda (karakter terlarang, nama yang bentrok), menukar nama file di disk, dan menyegarkan daftar terbaru.

## Seret untuk menyusun ulang

Tekan dan seret sebuah tab ke samping untuk menyusun ulang; tab di sebelahnya bergeser seketika dan urutan akan berhenti pada saat Anda melepaskan mouse. Zona mati 4 piksel mencegah klik biasa agar tab tidak bergoyang.

## Menu konteks

Klik kanan sebuah tab untuk **Buka di Jendela Baru** — tersedia pada setiap tab dokumen yang dapat dilepas — dan **Tutup**, yang tampil abu-abu pada tab yang tidak dapat ditutup. Keduanya mengikuti bahasa aplikasi.

## Lepaskan menjadi jendela

**Seret sebuah tab keluar dari bilah** (atau gunakan Buka di Jendela Baru) dan tab itu menjadi jendela tersendiri yang membawa dokumen yang masih hidup; seret kembali untuk menambkannya ke dalam bilah. Jendela yang terlepas adalah jendela yang setara penuh — Anda tetap bisa mengedit dan menyimpan di sana.

## Daftar Semua tab

Ketika tab melebihi bilah, ikon bilah tab kecil di ujung kanan bilah membuka daftar lengkap (menu native, tidak pernah tertutup area konten); pilih dengan tombol panah.

## Baris alat di dalam setiap editor

Setiap tab editor punya satu baris alat di bagian atas (tata letaknya sedikit berbeda per editor):

- **Simpan** (⌘S/ctrl+S) dan **Simpan Sebagai…**.
- **Urungkan / Ulangi**: beberapa tingkat; setiap editor menyimpan riwayatnya sendiri.
- **Temukan** (ctrl+F): membuka panel pencarian milik editor tersebut.
- Sakelar **Simpan Otomatis**: saat aktif, perubahan ditulis ke disk secara berkala; saat nonaktif, hanya penyimpanan manual yang menulis (penanda belum tersimpan pada tab/judul mengingatkan Anda).

## Tab Beranda

Tab Beranda paling kiri tidak bisa ditutup; untuk kembali dari editor mana pun, klik tab itu atau gunakan File ▸ **Kembali ke Beranda**.

## Tampilan terbagi: dua panel

**Seret tab ke tepi kanan jendela**: tab mengikuti sebagai salinan kecil yang melayang, petunjuk "Bagi di sini" muncul di dekat tepi, dan saat dilepas terbentuk dua panel berdampingan. Lepaskan di tepi bawah untuk dua panel bertumpuk. Menu klik kanan tab menawarkan hal yang sama dengan **Bagi ke Kanan** dan **Bagi ke Bawah**, dan **Batalkan Bagi** pada tab yang berada di panel.

- Tab yang diseret masuk ke panel tempat Anda melepaskannya; panel lain mempertahankan dokumen yang baru saja Anda lihat.
- Jika hanya ada satu dokumen terbuka, salinan dokumen yang sama diletakkan di kedua panel, agar awal dan akhir dokumen bisa dilihat bersamaan. Dokumen baru yang belum disimpan juga bisa dibagi.
- Seret **pembatas** di antara kedua panel untuk mengubah rasionya, klik ganda untuk membagi rata, atau dorong sampai ujung untuk menutup panel itu; dokumen tetap terbuka sebagai tab.

## Satu jendela AI yang mengikuti fokus

- Hanya satu jendela AI yang terlihat. Panel tempat Anda bekerja menampilkan jendela AI-nya; jendela panel lain melipat menjadi rel, dan mengklik sebuah panel memunculkan jendela AI panel itu.
- Selagi terlipat, percakapan panel itu dan pekerjaan AI yang sedang berjalan tetap hidup. Percakapan disimpan per dokumen.
- **Dua salinan dokumen yang sama**: setelah menyimpan di satu panel, menyimpan dari panel lain lebih dulu menanyakan "Dokumen ini berubah di tempat lain". Sementara simpan otomatis menunggu dengan tenang.
- Setelah ditutup dengan normal, **menjalankan ulang aplikasi tanpa file** mengembalikan pasangan dokumen terbagi terakhir persis seperti sebelumnya; menjalankannya dengan file hanya membuka file itu. Setelah mati mendadak, tab sebelumnya kembali seperti dijelaskan di bawah.
- Tab Beranda, Bantuan, dan Presentasi (pratinjau) tidak bisa masuk ke panel; selagi salah satunya terbuka, kedua panel bersembunyi sebentar dan kembali saat Anda kembali ke tab dokumen.

Tiga panel atau lebih, pembagian di dalam jendela yang dilepas, dan sinkronisasi langsung kedua salinan ditunda nanti.

## Saat aplikasi atau PC mati mendadak

Selama sebuah dokumen punya perubahan yang belum disimpan, GenOffice menyimpan salinan pemulihannya kira-kira setiap 30 detik di folder data milik aplikasi. Semua editor melakukannya, juga untuk dokumen baru yang belum pernah disimpan. Berkas Anda sendiri tidak berubah sampai Anda menyimpannya.

- **Tab Anda kembali**: jika aplikasi atau PC mati tanpa ditutup dengan normal (listrik padam, aplikasi macet, aplikasi ditutup paksa, PC dimatikan atau dimulai ulang untuk pembaruan), tab dokumen yang terbuka akan kembali saat GenOffice dijalankan berikutnya, dalam urutan yang sama dan dengan tampilan terbagi jika Anda memakainya. Ini juga terjadi jika Anda menjalankannya dengan membuka sebuah file.
- **Satu daftar di Beranda**: dokumen yang masih punya konten belum disimpan ditampilkan bersama di layar Beranda. Pilih **Pulihkan** atau **Buang** untuk masing-masing, atau gunakan **Pulihkan semua** atau **Buang semua**, lalu tekan **Terapkan**. Jika program lain atau layanan sinkronisasi mengubah berkas itu sesudahnya, **Buang** dipilih lebih dulu agar berkas tetap seperti sekarang. Jika berkas aslinya tidak dapat ditemukan lagi, memulihkannya membuka konten sebagai dokumen baru tanpa nama.
- **Putuskan nanti**: menutup daftar tidak menghapus apa pun. Saat Anda pertama kali membuka salah satu dokumen itu, kotak berisi namanya akan bertanya lagi; menekan Esc atau menutup kotak berarti memulihkan. Jika konten yang dipulihkan tidak diperlukan, tutup dokumen dengan **Jangan Simpan**.
- **Tab dimuat saat dibuka**: tab yang dipulihkan langsung menampilkan judulnya, tetapi setiap dokumen baru dimuat saat Anda pertama kali mengeklik tabnya. Membuka semuanya sekaligus bisa membuat PC yang kekurangan memori mati lagi.
- **Saat PC dimatikan**: jika ada dokumen yang belum disimpan, GenOffice tidak bertanya apakah akan menyimpan. Aplikasi menyimpan salinannya, menutup diri, dan menawarkannya saat dijalankan berikutnya.
- **Dokumen tanpa salinan**: berkas Excel, HWP, dan PDF yang dilindungi kata sandi tidak mendapat salinan pemulihan, jadi perubahannya yang belum disimpan tidak dapat dipulihkan; sebuah pemberitahuan menyebutkan hal ini sekali saat dokumen seperti itu dibuka. Sering-seringlah menyimpan dokumen ini. Dokumen Word dan PowerPoint yang dilindungi kata sandi mendapat salinan yang dikunci dengan kata sandi yang sama.
- **Berkas CSV, .xls lama, dan .tsv**: editor lembar kerja menyimpan salinannya sebagai buku kerja tanpa judul. Saat dipulihkan, salinan itu terbuka sebagai buku kerja tanpa judul, dan penyimpanan pertamanya menyarankan folder dan nama berkas asli sebagai .xlsx.

Salinan dihapus saat Anda menyimpan dokumen, menutupnya dengan **Jangan Simpan**, atau memilih **Buang**, dan juga setelah 30 hari tanpa perubahan. Setelah ditutup dengan normal, GenOffice dimulai seperti biasa tanpa mengembalikan tab.

**Ini bukan Simpan Otomatis.** Simpan Otomatis menulis perubahan ke berkas itu sendiri, dan hanya setelah Anda menyimpannya sekali. Salinan pemulihan tidak pernah menyentuh berkas Anda; salinan itu hanya menyimpan bagian yang belum Anda simpan, sampai Anda menyimpan atau membuangnya.
