# Editor gambar

Editor gambar membuka gambar Excalidraw di tabnya sendiri dan menyimpannya kembali ke file yang sama.

- **Yang dibuka**: catatan gambar yang dibuat dengan plugin Excalidraw untuk Obsidian (`.excalidraw.md`, atau `.md` yang front matter-nya berisi `excalidraw-plugin`) dan file `.excalidraw` dari aplikasi web Excalidraw.
- **Gambar baru**: kartu **Gambar Excalidraw** di Beranda, atau **File ▸ Baru**. Gambar baru dibuat sebagai catatan gambar Obsidian (`.excalidraw.md`), dan Anda memberinya nama saat menyimpan pertama kali.
- **Menggambar**: bentuk, panah, garis, gambar bebas, dan teks, dengan bilah alat dan pintasan milik kanvas itu sendiri. ctrl+Z membatalkan.
- **Menyimpan**: ctrl+S. File disimpan dalam format saat file itu dibuka. Simpan Otomatis menulis setiap 30 detik dan saat jendela kehilangan fokus, tetapi melewati gambar yang belum punya nama file. Gambar yang hanya Anda lihat disimpan byte demi byte persis seperti semula.

## Catatan gambar Obsidian

- Penyimpanan hanya menulis ulang daftar teks catatan dan data gambarnya. Front matter, teks yang Anda tulis di catatan, dan tautannya tetap seperti semula, jadi catatan terbuka dengan cara yang sama di Obsidian.
- Gambar yang dirujuk catatan (`[[gambar.png]]` di bawah Embedded Files) ditampilkan jika berada di dalam brankas catatan: folder terdekat di atas catatan yang berisi folder `.obsidian`, atau folder catatan itu sendiri jika tidak ada. Gambar di atas 20 MB, di folder tersembunyi, atau di luar brankas tidak ditampilkan.
- Anda belum bisa menambahkan gambar baru ke catatan. Alat gambar dimatikan dan menjatuhkan file ke kanvas diblokir, karena gambar yang hanya disimpan di dalam catatan mungkin tidak tampil di Obsidian.

## Yang belum bisa dilakukan

- Tidak ada panel AI. AI tidak bisa membaca atau mengubah gambar.
- Tidak ada ekspor ke PNG atau SVG.
- Editor tidak memakai jaringan. Fontnya sudah tertanam, dan pustaka bersama, kolaborasi langsung, serta sematan web dimatikan. Tautan di gambar hanya dibuka di browser jika berupa alamat web atau alamat email.

## Membuka gambar dari File Explorer

Penginstal menambahkan aplikasi ke **Buka dengan** untuk file `.excalidraw` tanpa menjadikannya program default. Catatan gambar adalah file `.md`, jadi catatan itu terbuka di mana pun file Markdown terbuka di aplikasi, dan masuk ke editor gambar, bukan editor Markdown.
