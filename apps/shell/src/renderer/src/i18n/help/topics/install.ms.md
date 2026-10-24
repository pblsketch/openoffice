# Pemasangan GenOffice

Setiap versi diterbitkan pada [halaman Keluaran](https://github.com/pblsketch/openoffice/releases/latest) projek ini di GitHub. Versi ini dikeluarkan untuk Windows.

## Memilih fail untuk mesin anda

| Platform    | Keperluan                                      | Fail                            |
| ----------- | ---------------------------------------------- | ------------------------------- |
| **Windows** | Windows 10 atau lebih baharu, Intel/AMD 64-bit | `GenOffice-Setup-<version>.exe` |

Versi lama kekal pada halaman Keluaran.

## Pada Windows

1. Muat turun `GenOffice-Setup-<version>.exe` daripada halaman Keluaran.
2. Jalankannya. Pemasang ini tidak ditandatangani dengan sijil kod, jadi Windows mungkin memaparkan tetingkap biru "Windows protected your PC" dahulu. Pilih **More info**, kemudian **Run anyway**. Perkataan sebenar bergantung pada versi Windows anda.
3. Ikut langkah pemasang itu hingga selesai.

Ia meletakkan GenOffice dalam menu Start dan mendaftarkan `.docx`, `.xlsx`, `.pptx`, `.pdf` dan yang lain supaya mengklik dua kali pada fail membukanya.

Oleh sebab pemasang ini tidak ditandatangani, jalankan hanya pemasang yang anda muat turun daripada halaman Keluaran di atas.

## Kemas kini

- GenOffice mencari versi yang lebih baharu pada halaman GitHub Releases yang sama. Apabila versi baharu diterbitkan, **Tetapan ▸ Perihal** menawarkannya: tekan **Kemas kini ke …**, tunggu muat turun selesai, kemudian tekan **Mulakan semula dan pasang**.
- **Menu (☰) ▸ Semak Kemas Kini** menyemak pada bila-bila masa anda mahu. Pada Mac, ia ialah **Bantuan ▸ Semak Kemas Kini**.
- Apabila semakan gagal — tiada rangkaian, atau belum ada apa-apa yang diterbitkan — tiada apa yang berlaku, dan aplikasi terus berfungsi seperti biasa.
- **Saluran Kemas Kini**, juga di bawah Tetapan ▸ Perihal, ialah Stabil atau Beta. Menukarnya berkuat kuasa serta-merta dan akan menyemak kemas kini; ia tidak akan menurunkan pemasangan Beta kembali ke Stabil.
- Kemas kini juga tidak ditandatangani dengan sijil kod. Sebelum memasangnya, aplikasi menyemak fail yang dimuat turun terhadap checksum yang diterbitkan bersama keluaran itu.

## Keluaran yang anda jalankan

**Tetapan ▸ Perihal** ialah tempat aplikasi melaporkan versi yang anda ada, saluran yang diikutinya dan di mana projek itu terletak. Ia juga menamakan projek sumber terbuka yang menjadi asas aplikasi ini.

## Baris arahan yang disertakan

Setiap pemasangan meliputi satu perintah `ieumoffice` yang bercakap dengan enjin yang sama seperti yang digunakan oleh tetingkap itu, jadi kedua-duanya tidak pernah berselisih tentang sesuatu fail. `ieumoffice install-cli` meletakkannya pada `PATH` anda. Lihat [Baris arahan dan ejen](help://cli) untuk apa yang boleh ia lakukan.
