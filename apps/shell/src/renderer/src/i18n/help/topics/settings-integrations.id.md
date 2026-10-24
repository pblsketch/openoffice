# Pengaturan, bahasa, tema, dan integrasi MCP

## Membuka pengaturan

Baris di kiri bawah Beranda membuka panel pengaturan (bacaannya Hubungkan AI sampai ada AI yang terhubung). Panel ini punya lima bagian: Akun, AI, Umum, Integrasi, dan Tentang.

**Akun** menunjukkan keadaan langganan Claude dan Codex Anda, dan **Kelola koneksi** membawa Anda ke bagian AI. AI punya artikel tersendiri: [Koneksi langganan](help://subscription) dan [Model AI dan pengaturan](help://ai-models).

## Bahasa

- Pengaturan menawarkan **21 bahasa antarmuka**: Inggris, Tionghoa Sederhana, Jepang, Korea, Prancis, Jerman, Spanyol, Thai, Indonesia, Rusia, Arab, Portugis, Italia, Polandia, Ceko, Belanda, Melayu, Ibrani, Hindi, Tionghoa Tradisional, Vietnam.
- Beralih bahasa berlaku seketika dan bertahan; bilah menu sistem dibangun ulang mengikuti bahasa tersebut.

## Tema

Terang / Gelap / Ikuti Sistem. Mode Ikuti Sistem mengikuti tampilan sistem operasi, dan para editor mengganti tema senada tanpa berkedip.

## Umum

- **Posisi bilah samping AI** (kiri atau kanan), **Ukuran teks panel AI** dan **Pemeriksaan ejaan di obrolan AI**.
- **Buka panel AI di dokumen baru** — nonaktif, dokumen baru dimulai dengan panel tertutup, sekali klik lagi.
- **Simpan otomatis semua dokumen** menyalakan AutoSave secara default di setiap editor; Anda tetap bisa mematikannya untuk satu jendela.
- **Lokasi penyimpanan** dengan tombol **Ubah**, dan **Aplikasi default untuk dokumen Office** untuk mengambil alih .docx / .xlsx / .pptx bagi GenOffice.

GenOffice tidak mengumpulkan atau mengirim statistik penggunaan, jadi tidak ada sakelar untuk itu.

## AI ▸ Lanjutan

Tertutup sampai Anda membukanya; kebanyakan orang tidak pernah memerlukannya. Tab **Model AI** berisi kunci API dan server yang Anda jalankan sendiri, untuk obrolan. Di tab **Media & Pencarian AI**, setiap kemampuan memilih vendor yang melayaninya, dan kunci serta URL dasar sebuah vendor cukup diisi sekali lalu dipakai bersama:

- **Pencarian web**, **Pembuatan gambar**, **Analisis gambar** dan **Analisis video**, masing-masing dengan satu provider, satu model, satu kunci, dan satu URL dasar.
- **Pencarian berkas lokal** berjalan di mesin ini. Di bawahnya, **reranking pencarian Jev** **nonaktif secara bawaan**. Diaktifkan, kutipan 20 hit lokal teratas — hingga 1.200 karakter per dokumen, plus nama berkas dan folder — pergi ke endpoint keputusan pilihan Anda (Jev via OpenRouter atau TypeSafe, Perplexity, Liquid AI d1, Cloudflare, mesin lokal, atau URL kustom) untuk diurutkan ulang menurut relevansi. Nonaktif, tak ada yang meninggalkan perangkat.
- **Izinkan permintaan otomatis memakai langganan** **nonaktif secara bawaan**. Sakelar ini menentukan apakah permintaan dari baris perintah atau dari agen pemrograman yang terhubung boleh memakai langganan Claude atau Codex Anda; lihat [Menghubungkan agen coding](help://mcp).

## Tentang

- **Versi**, alamat GitHub proyek, dan satu baris yang menyebutkan proyek sumber terbuka yang menjadi dasar aplikasi ini.
- **Saluran Pembaruan**: Stabil atau Beta. Mengubahnya langsung berlaku dan memeriksa pembaruan; ini tidak akan menurunkan instalasi Beta kembali ke Stabil.

## Pengikatan aplikasi predefinida

Pengaturan dapat mendaftarkan GenOffice sebagai aplikasi penangan .docx / .xlsx / .pptx / .pdf dan sejenisnya (pendaftaran aplikasi predefinida tingkat sistem; konfirmasi saat diminta).

## Pemberitahuan pihak ketiga dan pembaruan

- Bantuan ▸ Pemberitahuan Perangkat Lunak Pihak Ketiga: inventaris lengkap lisensi OSS yang disertakan dengan aplikasi.
- Menu (☰) ▸ Periksa Pembaruan… (di Mac: Bantuan ▸ Periksa Pembaruan…): memicu pemeriksaan manual; versi yang lebih baru menawarkan dipasang.

## Integrasi MCP (untuk pengguna lanjutan / klien AI)

**Integrasi** adalah panel yang menghubungkan GenOffice dengan agen pemrograman, dan ia punya artikel tersendiri: Menghubungkan agen pemrograman. Versi singkat — pilih jalurnya (baris perintah, atau MCP), ikuti bagian itu, lalu mulai obrolan baru dan bertanya.

Di bawah **Server HTTP lokal**, aplikasi juga bisa menjalankan server itu sendiri — sakelar aktif dan port — dan **Lanjutan** menambahkan URL pemeriksaan kesehatan serta file log, alih-alih menghandalkannya kepada asisten. Ia hanya mendengarkan di localhost.

## Lembar pintasan baris perintah

| Perintah            | Fungsinya                |
| ------------------- | ------------------------ |
| `ieumoffice <file>` | membuka sebuah file      |
| `ieumoffice mcp`    | memulai server MCP lokal |
| `ieumoffice --help` | semua perintah dan opsi  |
