# Menyambungkan pelayan MCP

Pelayan MCP ialah perkhidmatan yang menyediakan alat yang boleh digunakan oleh AI dari luar aplikasi, seperti mencari undang-undang atau mencari bahan yang diuruskan oleh pasukan anda. Setelah anda menyambungkan pelayan, tetingkap AI dalam GenOffice boleh memanggil alatnya semasa sembang. Anda sendiri yang menentukan, alat demi alat, apa yang boleh digunakan oleh AI dan bagaimana.

## Menambah pelayan

1. Buka **Tetapan ▸ Integrasi** dan tekan **Tambah pelayan** pada kad **Pelayan MCP**.
2. Pilih cara menambahnya.
   - **Tampal teks tetapan**: tampal seluruh teks tetapan daripada panduan pelayan dan tekan **Baca**. GenOffice mengisi ruang-ruangnya. Jika satu teks mengandungi beberapa pelayan, anda mengesahkannya satu demi satu. Jika teks itu membaca kunci atau nilai daripada pemboleh ubah PC (`${NAMA}`), ruangan itu dibiarkan kosong untuk anda isi.
   - **Masukkan sendiri**: taip nama dan alamat. Jika panduan pelayan memberikan kunci, letakkannya dalam ruang **Kunci (pilihan)**.
3. Baca notis di atas butang tambah, kemudian tekan **Tambah**.
4. Selepas ditambah, GenOffice terus menyemak sambungan dan mendapatkan senarai alat. Pelayan yang memerlukan log masuk menunggu anda dan tidak membuka pelayar sendiri. Tekan **Semak sambungan** untuk melihat senarai alat yang disediakan oleh pelayan. Bagi pelayan yang memerlukan log masuk, tekan **Log masuk dengan pelayar** dan selesaikan log masuk di situ.

Nama pelayan menggunakan huruf, digit, `-` dan `_`, sehingga 24 aksara. AI melihat alat pelayan ini dengan nama berbentuk `mcp__name__tool`. Jika sesuatu kemahiran memanggil alat dengan nama berbentuk ini, tambahkan pelayan dengan nama yang sama seperti yang digunakan oleh kemahiran itu.

## Pelayan melalui alamat dan pelayan pada PC ini

- Pelayan **melalui alamat** disambungkan melalui alamat web. Alamat internet mesti bermula dengan `https://`. `http://` hanya berfungsi untuk PC ini dan alamat rangkaian persendirian di rumah atau di tempat kerja, dan anda mesti mengesahkan dahulu bahawa kunci dan kandungan dokumen akan dihantar tanpa penyulitan.
- Pelayan **pada PC ini** ialah program yang dijalankan oleh GenOffice pada PC ini. Skrin tambah menunjukkan program sebenar yang akan dijalankan, argumennya dan nama pemboleh ubah persekitaran yang diberikan kepadanya. Ia dijalankan buat kali pertama hanya selepas anda menekan **Benarkan berjalan**. Jika arahan berubah kemudian, pelayan kekal berhenti sehingga anda membenarkannya semula.
- Jika pelayan pada PC ini memerlukan program yang tiada pada PC ini (Node.js, atau uv untuk pelayan Python), GenOffice bertanya pada kad pelayan dalam Tetapan sama ada hendak memuat turunnya. Saiz muat turun ditunjukkan, dan tiada apa-apa dimuat turun sehingga anda menekan **Muat turun**. Program yang dimuat turun kekal di dalam folder data GenOffice, dan tetapan PC anda tidak diubah.
- Pelayan pada PC ini bermula apabila diperlukan dan berhenti selepas 10 minit tanpa digunakan. Ia juga berhenti apabila anda menutup GenOffice.

## Memilih apa yang boleh dilakukan oleh setiap alat

- Bagi setiap alat, pilih **Sentiasa benarkan**, **Tanya dahulu** atau **Jangan guna**.
- Pada mulanya, alat yang ditandakan oleh pelayan sebagai baca sahaja ditetapkan kepada **Sentiasa benarkan**, dan yang lain kepada **Tanya dahulu**.
- Apabila AI memanggil alat **Tanya dahulu**, sekeping kad muncul dalam tetingkap AI. Lihat apa yang akan dihantar dan tekan **Benarkan kali ini sahaja**, **Sentiasa benarkan dalam perbualan ini** atau **Sekat**. Tiada apa-apa dijalankan sehingga anda menekan salah satunya. Menghentikan AI atau menutup tetingkap dikira sebagai menyekat.
- Jika pelayan mengubah keterangan sesuatu alat atau nilai yang diterimanya, alat itu menunjukkan **Perlu disemak** dan disembunyikan daripada AI sehingga anda melihat perubahan itu dan menekan **Luluskan perubahan**. Perubahan pada panduan yang diberikan pelayan kepada AI disemak dengan cara yang sama.
- Alat baharu pada pelayan dihidupkan dengan tetapan awal yang sama, dan kad serta butang dalam tetingkap AI menunjukkan **Alat baharu: n**. Tanda itu hilang apabila anda membuka senarai alat pelayan itu dalam Tetapan.

## Menggunakan pelayan dalam tetingkap AI

- Pelayan berfungsi dalam tetingkap AI penyunting dan dalam Tanya AI di Laman Utama. Semasa sesebuah pelayan dihidupkan, butang **Pelayan yang disambungkan** muncul di sebelah ruang input.
- Tekan butang itu untuk melihat keadaan setiap pelayan dan untuk mematikan atau menghidupkan pelayan bagi perbualan ini sahaja. Perbualan baharu bermula dengan semua pelayan yang anda hidupkan dalam Tetapan. Pelayan yang sambungannya belum pernah disemak dipaparkan sebagai **Belum disemak**; semak dalam Tetapan untuk mendapatkan alatnya.
- Mematikan **Benarkan AI menggunakan alat internet** di bawah **Tetapan ▸ Media & Carian AI** turut mengalihkan semua alat pelayan MCP.
- Apabila sesuatu kemahiran mengharapkan alat daripada pelayan yang tidak dapat anda gunakan sekarang, AI menyatakan dalam jawapannya langkah mana yang tidak dapat dilakukannya. **Tetapan ▸ Kemahiran** juga menunjukkan pelayan yang diperlukan oleh sesuatu kemahiran di sebelah kemahiran itu.
- Tetingkap Ejen juga boleh menggunakan alat pelayan yang dihidupkan. Kebenaran yang sama terpakai, dan sesi mengekalkan tetapan semasa ia bermula. Lihat [Mod ejen](help://agent-mode).

## Melindungi apa yang dikembalikan pelayan

Setiap pelayan mempunyai **Lindungi apa yang dikembalikan pelayan ini**, yang dihidupkan pada mulanya. Semasa ia hidup, sebaik sahaja sesuatu yang dikembalikan oleh pelayan itu berada dalam sesuatu sembang, alat yang menghantar sesuatu keluar daripada aplikasi berhenti berfungsi untuk sembang itu: carian web, membaca halaman melalui alamat, alat pelayan MCP lain dan seumpamanya. Alat pelayan yang sama terus berfungsi. Mulakan perbualan baharu untuk menggunakan yang lain semula. Anda boleh mematikannya bagi pelayan yang hanya memberikan bahan awam.

Tetingkap Ejen tidak dapat mengekalkan perlindungan ini. Apabila sesi bermula dengan pelayan sedemikian, tetingkap memberitahu anda.

## Apa pergi ke mana

- Apabila AI memanggil alat, teks yang dipilih oleh AI dihantar ke pelayan itu. Ia boleh merangkumi kandungan daripada dokumen yang dibuka dan daripada lampiran. Bahagian yang disembunyikan daripada AI kekal tersembunyi.
- Apa yang dikembalikan oleh pelayan dihantar kepada penyedia AI yang anda gunakan. Tambahkan hanya pelayan yang pengendalinya anda percayai.
- Kunci, log masuk dan nilai pemboleh ubah persekitaran disimpan dengan penyulitan sistem pengendalian pada PC ini. Jika PC ini tidak dapat menyulitkannya, ia hanya diingat sehingga anda menutup aplikasi.
- Memadam pelayan akan memadam kunci dan log masuknya, dan meminta pelayan menamatkan log masuk itu jika ia menyokongnya.
