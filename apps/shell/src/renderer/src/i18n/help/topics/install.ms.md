# Pemasangan GenOffice

Setiap versi diterbitkan pada [halaman Keluaran](https://github.com/pblsketch/openoffice/releases/latest) projek ini di GitHub. Binaan Windows diterbitkan bersama binaan Mac dan Linux yang dikeluarkan sebagai beta. Pembangun tidak dapat menguji binaan Mac dan Linux secara langsung; kedua-duanya disahkan melalui laporan pengguna.

## Memilih fail untuk mesin anda

| Platform                                 | Keperluan                                            | Fail                              |
| ---------------------------------------- | ---------------------------------------------------- | --------------------------------- |
| **Windows**                              | Windows 10 atau lebih baharu, Intel/AMD 64-bit       | `GenOffice-Setup-<version>.exe`   |
| **Mac (beta)**, Apple Silicon            | macOS 12 atau lebih baharu, cip M1 atau lebih baharu | `GenOffice-<version>-arm64.dmg`   |
| **Mac (beta)**, Intel                    | macOS 12 atau lebih baharu, pemproses Intel          | `GenOffice-<version>-x64.dmg`     |
| **Linux (beta)**, mana-mana pengedaran   | 64-bit (x86_64)                                      | `GenOffice-<version>.AppImage`    |
| **Linux (beta)**, keluarga Ubuntu/Debian | 64-bit (x86_64)                                      | `ieumoffice_<version>_amd64.deb`  |
| **Linux (beta)**, Fedora/RHEL/openSUSE   | 64-bit (x86_64)                                      | `ieumoffice-<version>.x86_64.rpm` |

Untuk mengetahui Mac yang anda miliki, buka menu Apple ▸ **Perihal Mac Ini**. Jika "Cip" menyebut Apple M…, ambil fail yang berakhir dengan `-arm64.dmg`; jika "Pemproses" menyebut Intel …, ambil fail yang berakhir dengan `-x64.dmg`. Fail lain pada halaman Keluaran (`.zip`, `.yml`, `.blockmap`) digunakan oleh aplikasi itu sendiri untuk mengemas kini; anda tidak perlu memuat turunnya. Versi lama kekal pada halaman Keluaran.

## Pada Windows

1. Muat turun `GenOffice-Setup-<version>.exe` daripada halaman Keluaran.
2. Jalankannya. Pemasang ini tidak ditandatangani dengan sijil kod, jadi Windows mungkin memaparkan tetingkap biru "Windows protected your PC" dahulu. Pilih **More info**, kemudian **Run anyway**. Perkataan sebenar bergantung pada versi Windows anda.
3. Ikut langkah pemasang itu hingga selesai.

Ia meletakkan GenOffice dalam menu Start dan mendaftarkan `.docx`, `.xlsx`, `.pptx`, `.pdf` dan yang lain supaya mengklik dua kali pada fail membukanya.

Oleh sebab pemasang ini tidak ditandatangani, jalankan hanya pemasang yang anda muat turun daripada halaman Keluaran di atas.

## Apabila Windows menyekat muat turun atau pemasangan

### Edge menyatakan fail itu "isn't commonly downloaded"

Microsoft Defender SmartScreen memberi amaran begini tentang fail yang belum dilihatnya dimuat turun oleh ramai orang. Panduan Microsoft untuk mengekalkan fail itu:

1. Buka senarai muat turun Edge (**Ctrl+J**), tekan **…** di sebelah fail itu dan pilih **Keep**.
2. Dalam tetingkap yang terbuka, tekan **Show more**, kemudian **Keep anyway**. Fail itu kekal dalam folder Muat Turun anda.

Tetingkap itu juga mempunyai butang yang melaporkan fail itu sebagai selamat. Butang itu hanya membuka halaman laporan Microsoft (`feedback.smartscreen.microsoft.com`) dan tidak mengekalkan fail. Tutup halaman itu dan tekan **Show more** dalam tetingkap tadi.

Jika tetingkap itu tiada **Show more** atau tiada **Keep anyway**:

- Pada PC yang diurus oleh sekolah atau syarikat, pentadbir boleh mematikan pilihan untuk melangkau amaran ini (dasar Edge). Jika begitu, tiada sesiapa pada PC itu boleh mengekalkan fail; minta pentadbir memasangnya atau membenarkannya.
- Memuat turun dari halaman Keluaran dalam pelayar lain memberi anda fail yang sama.
- Jika kedua-duanya tidak membantu dan ini PC anda sendiri, panduan penyelesaian masalah muat turun Microsoft membenarkan Microsoft Defender SmartScreen dimatikan seketika sebagai jalan terakhir. Dalam Edge, buka **Seting dan banyak lagi (…) ▸ Seting ▸ Privasi, carian dan perkhidmatan ▸ Keselamatan**, matikan **Microsoft Defender SmartScreen**, muat turun fail itu semula, kemudian hidupkannya semula dengan segera. Semasa ia dimatikan, Edge tidak memberi amaran kepada anda tentang muat turun mahupun tapak berbahaya seperti halaman pancingan data.

### Tetingkap "Windows protected your PC" muncul

Microsoft Defender SmartScreen memaparkan tetingkap ini kali pertama ia menemui pemasang yang tidak ditandatangani. Tekan **More info** dan butang **Run anyway** akan muncul. Pada PC yang diurus oleh sekolah atau syarikat, tetapan pentadbir boleh menyembunyikan butang itu; tanya pentadbir.

### Smart App Control menyekatnya

Apabila Smart App Control pada Windows 11 dihidupkan, ia menghentikan pemasang yang tidak ditandatangani dan tidak menawarkan laluan **More info**. Microsoft menyatakan tiada cara untuk membenarkan satu aplikasi sahaja: satu-satunya pilihan ialah mematikan Smart App Control, di bawah **Windows Security ▸ App & browser control ▸ Smart App Control settings**. Itu juga menghapuskan perlindungan ini untuk semua aplikasi lain. Dengan kemas kini Windows terkini, ia boleh dihidupkan semula tanpa memasang semula Windows.

## Pada Mac (beta)

Anda memerlukan macOS 12 (Monterey) atau lebih baharu. Binaan Mac tidak mempunyai tandatangan pembangun Apple, jadi apabila anda membukanya buat kali pertama, macOS menyatakan ia tidak dapat mengesahkan aplikasi itu bebas daripada perisian hasad dan tidak membukanya. Anda membenarkannya sekali sahaja, seperti di bawah.

1. Buka dmg dan seret `GenOffice.app` ke dalam folder **Aplikasi**.
2. Buka GenOffice dari folder Aplikasi. Apabila amaran muncul, tekan **Selesai**.
3. Buka **Tetapan Sistem ▸ Privasi & Keselamatan**. Berhampiran bahagian bawah, di sebelah baris yang menyatakan GenOffice disekat, tekan **Open Anyway** dan masukkan kata laluan Mac anda. Butang itu dipaparkan selama kira-kira sejam selepas anda cuba membuka aplikasi itu.
4. Dalam tetingkap yang muncul semula, tekan **Buka**. Selepas itu ia dibuka tanpa amaran.

Pada macOS 12 tempatnya ialah **Keutamaan Sistem ▸ Keselamatan & Privasi ▸ Umum**, dan butangnya di sana ialah **Open Anyway**.

Jika macOS menyatakan aplikasi itu "is damaged and can't be opened", jangan alihkannya ke Tong Sampah. Jalankan baris di bawah dalam Terminal, kemudian buka aplikasi itu semula dan benarkannya seperti di atas. Ia membuang tanda yang dilekatkan oleh macOS pada fail yang dimuat turun daripada internet.

```sh
xattr -dr com.apple.quarantine /Applications/GenOffice.app
```

Jika macOS menyatakan aplikasi itu tidak disokong pada Mac ini, semak dua perkara:

- Mac Intel tidak dapat menjalankan fail Apple Silicon (`-arm64.dmg`). Semak "Pemproses" di bawah **Perihal Mac Ini**, padam aplikasi yang telah anda pasang, dan pasang fail `-x64.dmg` sebagai gantinya.
- macOS 11 atau lebih lama tidak dapat menjalankan GenOffice. **Perihal Mac Ini** juga menunjukkan versi macOS.

Juga pada Mac:

- Kad sambungan AI tiada butang pasang. Ikut pautan panduan pemasangan rasmi pada kad itu untuk memasang Claude Code atau Codex. Aplikasi desktop Claude bukan Claude Code, jadi Claude Code perlu dipasang berasingan walaupun aplikasi desktop sudah ada.
- Log masuk diselesaikan dalam pelayar. Jika pelayar meminta anda menampal kod, jalankan sendiri `claude auth login` atau `codex login` dalam Terminal. Lihat [Sambungan langganan](help://subscription).

## Pada Linux (beta)

- **AppImage**: jadikan ia boleh laku (`chmod +x GenOffice-<version>.AppImage`) dan jalankan failnya. Tiada langkah pemasangan.
- **deb**: pasang dengan `sudo apt install ./ieumoffice_<version>_amd64.deb`.
- **rpm**: pasang dengan `sudo dnf install ./ieumoffice-<version>.x86_64.rpm`. Pada openSUSE, gunakan `sudo zypper install ./ieumoffice-<version>.x86_64.rpm`.

Pakej deb dan rpm dipasang ke `/opt/GenOffice` dan memaut perintah terminal `/usr/bin/ieumoffice`. Seperti pada Mac, kad sambungan AI tiada butang pasang, dan apabila log masuk meminta kod, anda menjalankan sendiri `claude auth login` atau `codex login` dalam terminal.

## Kemas kini

- GenOffice mencari versi yang lebih baharu pada halaman GitHub Releases yang sama. Apabila versi baharu diterbitkan, **Tetapan ▸ Perihal** menawarkannya: tekan **Kemas kini ke …**, tunggu muat turun selesai, kemudian tekan **Mulakan semula dan pasang**. Pada Windows, satu tetingkap menunjukkan kemajuan pemasangan; apabila selesai, GenOffice dibuka semula bersama dokumen yang dibuka tadi. Pada Mac, aplikasi ditutup, digantikan dengan versi baharu, lalu dibuka semula bersama dokumen yang dibuka tadi. Ini berlaku untuk aplikasi dalam folder Aplikasi; aplikasi yang dibuka terus dari imej cakera akan menunjukkan halaman muat turun. Kemas kini hanya dipasang apabila anda menekan butang itu, bukan apabila anda sekadar menutup aplikasi.
- Pada Linux hanya AppImage yang mengemas kini dirinya sendiri. Dengan pemasangan deb atau rpm, aplikasi memberitahu anda tentang versi baharu dan membuka halaman muat turun; pasang fail baharu itu dengan cara yang sama.
- **Menu (☰) ▸ Semak Kemas Kini** menyemak pada bila-bila masa anda mahu. Pada Mac, ia ialah **Bantuan ▸ Semak Kemas Kini**.
- Apabila semakan gagal — tiada rangkaian, atau belum ada apa-apa yang diterbitkan — tiada apa yang berlaku, dan aplikasi terus berfungsi seperti biasa.
- **Saluran Kemas Kini**, juga di bawah Tetapan ▸ Perihal, ialah Stabil atau Beta. Menukarnya berkuat kuasa serta-merta dan akan menyemak kemas kini; ia tidak akan menurunkan pemasangan Beta kembali ke Stabil.
- Kemas kini juga tidak ditandatangani dengan sijil kod. Sebelum memasangnya, aplikasi menyemak fail yang dimuat turun terhadap checksum yang diterbitkan bersama keluaran itu.
- Jika **Mulakan semula dan pasang** menutup aplikasi tetapi versi baharu tidak muncul, pelancaran seterusnya memberitahu perkara itu dan menawarkan kemas kini sekali lagi. Kali ini pemasang dibuka dalam tetingkapnya sendiri, jadi anda boleh mengikutinya dan menjawab permintaan pentadbir. Jika masih tidak berjaya, tetingkap kemas kini menunjukkan halaman muat turun; memasang dengan fail dari sana mengekalkan tetapan dan dokumen anda. Apa yang dilakukan oleh pengemas kini dicatat dalam `update-log.txt` di folder data aplikasi (taip `%APPDATA%\GenOffice` dalam bar alamat File Explorer untuk membukanya). Lampirkan fail itu apabila melaporkan masalah.

## Keluaran yang anda jalankan

**Tetapan ▸ Perihal** ialah tempat aplikasi melaporkan versi yang anda ada, saluran yang diikutinya dan di mana projek itu terletak. Ia juga menamakan projek sumber terbuka yang menjadi asas aplikasi ini.

## Baris arahan yang disertakan

Setiap pemasangan meliputi satu perintah `ieumoffice` yang bercakap dengan enjin yang sama seperti yang digunakan oleh tetingkap itu, jadi kedua-duanya tidak pernah berselisih tentang sesuatu fail. `ieumoffice install-cli` meletakkannya pada `PATH` anda. Lihat [Baris arahan dan ejen](help://cli) untuk apa yang boleh ia lakukan.
