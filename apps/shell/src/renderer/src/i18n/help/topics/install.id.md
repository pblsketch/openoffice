# Memasang GenOffice

Setiap versi dipublikasikan di [halaman Rilis](https://github.com/pblsketch/openoffice/releases/latest) proyek ini di GitHub. Build Windows dipublikasikan bersama build Mac dan Linux yang dirilis sebagai beta. Pengembang tidak dapat menguji build Mac dan Linux secara langsung; keduanya dipastikan lewat laporan para pengguna.

## Pilih berkas untuk komputer Anda

| Platform                                 | Kebutuhan                                         | Berkas                            |
| ---------------------------------------- | ------------------------------------------------- | --------------------------------- |
| **Windows**                              | Windows 10 atau lebih baru, Intel/AMD 64-bit      | `GenOffice-Setup-<version>.exe`   |
| **Mac (beta)**, Apple Silicon            | macOS 12 atau lebih baru, chip M1 atau lebih baru | `GenOffice-<version>-arm64.dmg`   |
| **Mac (beta)**, Intel                    | macOS 12 atau lebih baru, prosesor Intel          | `GenOffice-<version>-x64.dmg`     |
| **Linux (beta)**, distribusi apa pun     | 64-bit (x86_64)                                   | `GenOffice-<version>.AppImage`    |
| **Linux (beta)**, keluarga Ubuntu/Debian | 64-bit (x86_64)                                   | `ieumoffice_<version>_amd64.deb`  |
| **Linux (beta)**, Fedora/RHEL/openSUSE   | 64-bit (x86_64)                                   | `ieumoffice-<version>.x86_64.rpm` |

Untuk mengetahui Mac Anda yang mana, buka menu Apple ▸ **Tentang Mac Ini**. Jika "Chip" menyebut Apple M…, ambil berkas yang berakhiran `-arm64.dmg`; jika "Prosesor" menyebut Intel …, ambil yang berakhiran `-x64.dmg`. Berkas lain di halaman Rilis (`.zip`, `.yml`, `.blockmap`) dipakai oleh aplikasi itu sendiri untuk memperbarui diri; Anda tidak perlu mengunduhnya. Versi lama tetap ada di halaman Rilis.

## Di Windows

1. Unduh `GenOffice-Setup-<version>.exe` dari halaman Rilis.
2. Jalankan. Installer ini tidak ditandatangani secara digital, sehingga Windows mungkin lebih dulu menampilkan jendela biru "Windows melindungi PC Anda". Pilih **Info selengkapnya**, lalu **Tetap jalankan**. Kata-kata persisnya bergantung pada versi Windows Anda.
3. Ikuti installer sampai selesai.

Installer menaruh GenOffice di menu Start dan mendaftarkan `.docx`, `.xlsx`, `.pptx`, `.pdf` dan sejenisnya sehingga klik ganda pada berkas langsung membukanya.

Karena installer tidak ditandatangani, jalankan hanya installer yang Anda unduh dari halaman Rilis di atas.

## Saat Windows memblokir unduhan atau pemasangan

### Edge menyebut berkas "tidak umum diunduh"

Microsoft Defender SmartScreen memberi peringatan seperti ini untuk berkas yang belum banyak diunduh orang. Panduan Microsoft untuk menyimpan berkas tersebut:

1. Buka daftar unduhan Edge (**Ctrl+J**), tekan **…** di sebelah berkas lalu pilih **Keep**.
2. Di jendela yang terbuka, tekan **Show more**, lalu **Keep anyway**. Berkas tetap tersimpan di folder Unduhan Anda.

Jendela itu juga punya tombol untuk melaporkan berkas sebagai aman. Tombol itu hanya membuka halaman laporan Microsoft (`feedback.smartscreen.microsoft.com`) dan tidak menyimpan berkas. Tutup halaman itu dan tekan **Show more** di jendela tadi.

Jika jendela tidak punya **Show more** atau tidak punya **Keep anyway**:

- Di PC yang dikelola sekolah atau perusahaan, administrator dapat mematikan kemampuan melewati peringatan ini (sebuah kebijakan Edge). Maka tidak ada seorang pun di PC itu yang dapat menyimpan berkas; minta administrator untuk memasangnya atau mengizinkannya.
- Mengunduh dari halaman Rilis dengan peramban lain memberi Anda berkas yang sama.
- Jika keduanya tidak membantu dan ini PC milik Anda sendiri, panduan pemecahan masalah unduhan dari Microsoft memperbolehkan mematikan Microsoft Defender SmartScreen sebentar sebagai upaya terakhir. Di Edge, buka **Pengaturan dan lainnya (…) ▸ Pengaturan ▸ Privasi, pencarian, dan layanan ▸ Keamanan**, matikan **Microsoft Defender SmartScreen**, unduh berkas lagi, lalu segera nyalakan kembali. Selama dimatikan, Edge tidak memperingatkan Anda tentang unduhan maupun situs berbahaya seperti halaman phishing.

### Muncul jendela "Windows melindungi PC Anda"

Microsoft Defender SmartScreen menampilkan jendela ini saat pertama kali menemukan installer yang tidak ditandatangani. Tekan **Info selengkapnya** dan tombol **Tetap jalankan** akan muncul. Di PC yang dikelola sekolah atau perusahaan, pengaturan administrator dapat menyembunyikan tombol itu; tanyakan kepada administrator.

### Smart App Control memblokirnya

Saat Smart App Control di Windows 11 aktif, fitur itu menghentikan installer yang tidak ditandatangani dan tidak menyediakan jalur **Info selengkapnya**. Microsoft menyatakan tidak ada cara untuk mengizinkan satu aplikasi saja: satu-satunya pilihan adalah mematikan Smart App Control, di **Windows Security ▸ App & browser control ▸ Smart App Control settings**. Itu juga menghapus perlindungan ini untuk semua aplikasi lain. Dengan pembaruan Windows terbaru, fitur ini dapat dinyalakan kembali tanpa memasang ulang Windows.

## Di Mac (beta)

Anda memerlukan macOS 12 (Monterey) atau lebih baru. Build Mac tidak memiliki tanda tangan pengembang Apple, jadi saat pertama kali dibuka macOS menyatakan tidak dapat memastikan aplikasi bebas dari malware dan tidak membukanya. Anda mengizinkannya sekali, seperti di bawah ini.

1. Buka berkas dmg dan seret `GenOffice.app` ke folder **Aplikasi**.
2. Buka GenOffice dari folder Aplikasi. Saat peringatan muncul, tekan **Selesai**.
3. Buka **Pengaturan Sistem ▸ Privasi & Keamanan**. Di dekat bagian bawah, di samping baris yang menyatakan GenOffice diblokir, tekan **Tetap Buka** dan masukkan kata sandi Mac Anda. Tombol itu tampil sekitar satu jam setelah Anda mencoba membuka aplikasi.
4. Di jendela yang muncul lagi, tekan **Buka**. Setelah itu aplikasi terbuka tanpa peringatan.

Di macOS 12 tempatnya adalah **Preferensi Sistem ▸ Keamanan & Privasi ▸ Umum**, dan tombolnya di sana adalah **Tetap Buka**.

Jika macOS menyatakan aplikasi "is damaged and can't be opened", jangan pindahkan ke Tempat Sampah. Jalankan baris di bawah ini di Terminal, lalu buka aplikasi lagi dan izinkan seperti di atas. Baris ini menghapus tanda yang dilekatkan macOS pada berkas yang diunduh dari internet.

```sh
xattr -dr com.apple.quarantine /Applications/GenOffice.app
```

Jika macOS menyatakan aplikasi tidak didukung di Mac ini, periksa dua hal:

- Mac Intel tidak dapat menjalankan berkas Apple Silicon (`-arm64.dmg`). Periksa "Prosesor" di **Tentang Mac Ini**, hapus aplikasi yang sudah Anda pasang, lalu pasang berkas `-x64.dmg` sebagai gantinya.
- macOS 11 atau yang lebih lama tidak dapat menjalankan GenOffice. **Tentang Mac Ini** juga menampilkan versi macOS.

Juga di Mac:

- Kartu koneksi AI tidak punya tombol instal. Ikuti tautan panduan instalasi resmi di kartu untuk memasang Claude Code atau Codex. Aplikasi desktop Claude bukan Claude Code, jadi Claude Code tetap harus dipasang terpisah walaupun aplikasi desktopnya sudah ada.
- Proses masuk diselesaikan di peramban. Jika peramban meminta Anda menempelkan kode, jalankan sendiri `claude auth login` atau `codex login` di Terminal. Lihat [Koneksi langganan](help://subscription).

## Di Linux (beta)

- **AppImage**: jadikan dapat dieksekusi (`chmod +x GenOffice-<version>.AppImage`) lalu jalankan berkasnya. Tidak ada langkah pemasangan.
- **deb**: pasang dengan `sudo apt install ./ieumoffice_<version>_amd64.deb`.
- **rpm**: pasang dengan `sudo dnf install ./ieumoffice-<version>.x86_64.rpm`. Di openSUSE, gunakan `sudo zypper install ./ieumoffice-<version>.x86_64.rpm`.

Paket deb dan rpm dipasang di `/opt/GenOffice` dan menautkan perintah terminal `/usr/bin/ieumoffice`. Seperti di Mac, kartu koneksi AI tidak punya tombol instal, dan saat proses masuk meminta kode, Anda menjalankan sendiri `claude auth login` atau `codex login` di terminal.

## Pembaruan

- GenOffice mencari versi yang lebih baru di halaman Rilis GitHub yang sama. Ketika ada yang diterbitkan, **Pengaturan ▸ Tentang** menawarkannya: tekan **Perbarui ke …**, tunggu unduhannya, lalu tekan **Mulai ulang & instal**. Di Windows, sebuah jendela menampilkan kemajuan pemasangan; setelah selesai, GenOffice terbuka lagi bersama dokumen yang tadi terbuka. Di Mac, aplikasi ditutup, diganti dengan versi baru, lalu dibuka kembali bersama dokumen yang tadi terbuka. Ini berlaku untuk aplikasi di folder Aplikasi; aplikasi yang dibuka langsung dari image disk akan menunjukkan halaman unduhan. Pembaruan hanya dipasang saat Anda menekan tombol itu, tidak saat Anda sekadar menutup aplikasi.
- Di Linux hanya AppImage yang memperbarui dirinya sendiri. Pada pemasangan deb atau rpm, aplikasi memberi tahu adanya versi baru dan membuka halaman unduhan; pasang berkas yang baru dengan cara yang sama.
- **Menu (☰) ▸ Periksa Pembaruan…** memeriksa kapan pun Anda minta. Di Mac, letaknya di **Bantuan ▸ Periksa Pembaruan…**.
- Ketika pemeriksaan gagal — tidak ada jaringan, atau belum ada yang diterbitkan — tidak terjadi apa-apa, dan aplikasi tetap berjalan seperti sebelumnya.
- **Saluran Pembaruan**, juga di Pengaturan ▸ Tentang, berisi Stabil atau Beta. Mengubahnya langsung berlaku dan memeriksa pembaruan; ini tidak akan menurunkan instalasi Beta kembali ke Stabil.
- Pembaruan juga tidak ditandatangani secara digital. Sebelum memasangnya, aplikasi mencocokkan berkas yang diunduh dengan checksum yang diterbitkan bersama rilis itu.
- Jika **Mulai ulang & instal** menutup aplikasi tetapi versi baru tidak muncul, peluncuran berikutnya memberi tahu hal itu dan menawarkan pembaruan lagi. Kali ini penginstal terbuka di jendelanya sendiri, sehingga Anda dapat mengikutinya dan menjawab permintaan administrator. Jika masih tidak berhasil, jendela pembaruan mengarahkan ke halaman unduhan; memasang dengan berkas dari sana tetap mempertahankan pengaturan dan dokumen Anda. Apa yang dilakukan pembaru dicatat di `update-log.txt` dalam folder data aplikasi (ketik `%APPDATA%\GenOffice` di bilah alamat File Explorer untuk membukanya). Lampirkan berkas itu saat melaporkan masalah.

## Build yang sedang Anda jalankan

**Pengaturan ▸ Tentang** adalah tempat aplikasi melaporkan versi yang Anda pakai, saluran yang diikutinya, dan letak proyeknya. Di sana juga disebutkan proyek sumber terbuka yang menjadi dasar aplikasi ini.

## Baris perintahnya sudah ikut

Setiap pemasangan membawa perintah `ieumoffice` yang berbicara dengan mesin yang sama dengan jendela, sehingga keduanya tidak pernah berbeda pendapat tentang sebuah berkas. `ieumoffice install-cli` menaruhnya di `PATH` Anda. Lihat [Baris perintah dan agen](help://cli) untuk mengetahui apa saja yang dapat dilakukannya.
