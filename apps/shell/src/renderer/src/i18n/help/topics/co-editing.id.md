# Penyuntingan bersama di jaringan

Orang-orang di jaringan yang sama (LAN) dapat membuka satu dokumen bersama, mengeditnya pada saat yang sama, dan melihat kursor serta nama satu sama lain. Tidak perlu server atau akun: PC yang membagikan dokumen menjalankan sesi, dan hanya PC itu yang menyimpan file.

## Membagikan dokumen

1. Buka dokumen dan klik **Kolaborasi** di baris alat editor.
2. Isi **Nama saya** dan pilih **Warna saya**. Orang lain melihatnya di samping kursor Anda.
3. Klik **Mulai berbagi**. **PIN** 6 digit dan **Alamat PC ini** akan muncul.
4. Beri tahu PIN kepada orang yang akan bergabung, juga alamatnya jika mereka tidak dapat menemukan dokumen.

Simpan dokumen terlebih dahulu jika ada perubahan yang belum disimpan. Dokumen yang dilindungi kata sandi tidak dapat dibagikan. **PIN baru** memberi dokumen PIN yang baru; orang yang sudah bergabung tetap di dalam sesi.

Untuk berhenti, buka lagi **Kolaborasi** lalu klik **Berhenti berbagi**. Setiap orang yang telah bergabung tetap memiliki salinan yang belum disimpan di PC mereka.

## Bergabung

1. Di editor mana pun, klik **Kolaborasi** lalu beralih ke **Bergabung**.
2. Pilih dokumen di bawah **Ditemukan**, atau ketik alamat PC yang berbagi di **Alamat**.
3. Masukkan PIN lalu klik **Bergabung**. Dokumen yang dibagikan terbuka di tab baru.

Selama Anda bergabung, orang yang berbagilah yang menyimpan file. Perintah Simpan Anda tidak melakukan apa pun dan memberi tahu Anda soal itu, dan tab tidak pernah meminta disimpan saat Anda menutupnya. **Keluar** mengeluarkan Anda dari sesi. Saat sesi berakhir, tab tetap terbuka sebagai salinan yang belum disimpan, yang dapat Anda simpan di mana saja.

## Mengedit bersama

- Kursor atau pilihan setiap orang ditampilkan dengan warnanya, disertai namanya.
- Urungkan hanya membatalkan suntingan Anda sendiri.
- Beberapa fitur dinonaktifkan selama sesi, misalnya fitur yang mengubah bagian dokumen selain isinya. Editor memberi tahu Anda saat menolak salah satunya.
- Di editor Hangul, hanya orang yang berbagi yang dapat mengedit. Orang yang bergabung melihat perubahannya secara langsung.
- File teks biasa dan JSON terbuka di tampilan sumber editor Markdown dan belum dapat dibagikan.

## Keamanan

- PIN tidak pernah dikirim melalui jaringan. PIN diperiksa dengan pertukaran kunci, dan semua yang dikirim setelahnya dienkripsi. Orang lain di jaringan tidak dapat membaca dokumen, suntingan, atau PIN.
- Setelah 5 PIN salah dari satu PC, PC itu harus menunggu 10 menit. Setelah total 20 PIN salah, setiap dokumen yang dibagikan mendapat PIN baru dan orang yang berbagi diberi tahu.
- Hingga 16 orang dapat bergabung ke satu dokumen.
- Selama Anda berbagi, nama Anda dan judul dokumen diumumkan di jaringan agar orang lain dapat menemukannya.
- Saat pertama kali Anda berbagi, Windows Firewall mungkin meminta izin. Izinkan di jaringan pribadi. Jika Anda memblokirnya, PC lain tidak dapat terhubung.
