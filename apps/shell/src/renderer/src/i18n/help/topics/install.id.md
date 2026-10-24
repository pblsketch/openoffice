# Memasang GenOffice

Setiap versi dipublikasikan di [halaman Rilis](https://github.com/pblsketch/openoffice/releases/latest) proyek ini di GitHub. Versi ini dirilis untuk Windows.

## Pilih berkas untuk komputer Anda

| Platform    | Kebutuhan                                    | Berkas                          |
| ----------- | -------------------------------------------- | ------------------------------- |
| **Windows** | Windows 10 atau lebih baru, Intel/AMD 64-bit | `GenOffice-Setup-<version>.exe` |

Versi lama tetap ada di halaman Rilis.

## Di Windows

1. Unduh `GenOffice-Setup-<version>.exe` dari halaman Rilis.
2. Jalankan. Installer ini tidak ditandatangani secara digital, sehingga Windows mungkin lebih dulu menampilkan jendela biru "Windows melindungi PC Anda". Pilih **Info selengkapnya**, lalu **Tetap jalankan**. Kata-kata persisnya bergantung pada versi Windows Anda.
3. Ikuti installer sampai selesai.

Installer menaruh GenOffice di menu Start dan mendaftarkan `.docx`, `.xlsx`, `.pptx`, `.pdf` dan sejenisnya sehingga klik ganda pada berkas langsung membukanya.

Karena installer tidak ditandatangani, jalankan hanya installer yang Anda unduh dari halaman Rilis di atas.

## Pembaruan

- GenOffice mencari versi yang lebih baru di halaman Rilis GitHub yang sama. Ketika ada yang diterbitkan, **Pengaturan ▸ Tentang** menawarkannya: tekan **Perbarui ke …**, tunggu unduhannya, lalu tekan **Mulai ulang & instal**.
- **Menu (☰) ▸ Periksa Pembaruan…** memeriksa kapan pun Anda minta. Di Mac, letaknya di **Bantuan ▸ Periksa Pembaruan…**.
- Ketika pemeriksaan gagal — tidak ada jaringan, atau belum ada yang diterbitkan — tidak terjadi apa-apa, dan aplikasi tetap berjalan seperti sebelumnya.
- **Saluran Pembaruan**, juga di Pengaturan ▸ Tentang, berisi Stabil atau Beta. Mengubahnya langsung berlaku dan memeriksa pembaruan; ini tidak akan menurunkan instalasi Beta kembali ke Stabil.
- Pembaruan juga tidak ditandatangani secara digital. Sebelum memasangnya, aplikasi mencocokkan berkas yang diunduh dengan checksum yang diterbitkan bersama rilis itu.

## Build yang sedang Anda jalankan

**Pengaturan ▸ Tentang** adalah tempat aplikasi melaporkan versi yang Anda pakai, saluran yang diikutinya, dan letak proyeknya. Di sana juga disebutkan proyek sumber terbuka yang menjadi dasar aplikasi ini.

## Baris perintahnya sudah ikut

Setiap pemasangan membawa perintah `ieumoffice` yang berbicara dengan mesin yang sama dengan jendela, sehingga keduanya tidak pernah berbeda pendapat tentang sebuah berkas. `ieumoffice install-cli` menaruhnya di `PATH` Anda. Lihat [Baris perintah dan agen](help://cli) untuk mengetahui apa saja yang dapat dilakukannya.
