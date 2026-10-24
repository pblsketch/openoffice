# Buku elektronik EPUB: membaca, menyunting dan menterjemah

Editor e-buku membuka buku EPUB (`.epub`) dalam satu tab. Anda boleh membaca buku itu, membetulkan teksnya terus pada halaman, bertanya kepada AI tentangnya dan menterjemahkannya menjadi fail EPUB baharu. Tiada skrin untuk menyunting kod sesuatu bab.

## Membuka buku

- Buka fail `.epub` melalui dialog buka, dengan menyeretnya ke dalam tetingkap, daripada fail terkini, pepohon folder atau senarai Google Drive. Dalam Windows, fail ini juga ditawarkan di bawah "Buka dengan". Memasang GenOffice tidak menjadikannya program lalai untuk fail `.epub`.
- Jika buku itu sudah dibuka, tabnya akan dibawa ke hadapan.
- Buku yang dilindungi salinan (DRM) tidak boleh dibuka: bukanya dalam aplikasi kedai tempat anda membelinya. Fail yang rosak dan fail yang bukan buku EPUB juga tidak boleh dibuka, dan sebabnya akan dipaparkan.
- **Buku susun atur tetap** (disusun halaman demi halaman, seperti buku bergambar dan komik) dibuka untuk dibaca sahaja. Penyuntingan, penyuntingan AI, penggantian dan terjemahan dimatikan, dan baris status menerangkan sebabnya. Membaca dan bertanya kepada AI masih boleh dilakukan.
- Bab yang failnya tidak sempurna dipaparkan sebaik mungkin tetapi tidak boleh disunting, dan nota di bahagian atasnya menyatakan perkara itu. Bab itu disimpan tanpa diubah dan kekal dalam bahasa asal dalam terjemahan.

## Membaca

- Anak tetingkap **Kandungan** di sebelah kiri memaparkan senarai kandungan buku. Klik satu entri untuk pergi ke situ. Buku yang tiada senarai kandungan akan mendapat senarai babnya.
- Setiap bab ditatal ke atas dan ke bawah. Teruskan menatal melepasi hujung bab untuk ke bab seterusnya, atau melepasi permulaannya untuk berundur. Baris status menunjukkan bab yang sedang anda baca.
- Tab **Paparan** menukar saiz teks dan jarak baris, serta menghidupkan dan mematikan **Paparan gelap**. Tetapan ini hanya mengubah skrin, tidak sekali-kali buku, dan digunakan untuk semua buku.
- Tempat anda berhenti membaca diingati bagi setiap fail, dalam folder data aplikasi dan bukan dalam buku.
- **Cari dalam buku** (Ctrl+F) mencari dalam semua bab. Klik satu hasil untuk pergi ke situ.
- Pautan di dalam buku membawa anda ke tempat yang dipautkan. Pautan web dan e-mel dibuka dalam pelayar lalai anda; alamat lain tidak dibuka.
- Skrip milik buku itu sendiri tidak pernah dijalankan dan tiada apa-apa dimuatkan dari internet. Bunyi dan video tidak dimainkan.

## Menyunting teks

- Klik pada perenggan dan mula menaip. Perenggan, tajuk, item senarai, petikan, sel jadual dan kapsyen gambar boleh disunting. Gambar dan susun atur jadual tidak boleh.
- Tampal hanya memasukkan teks biasa.
- **Enter** memecahkan perenggan kepada dua dan **Shift+Enter** memulakan baris baharu di dalamnya. **Backspace** pada permulaan perenggan mencantumkannya dengan perenggan sebelumnya, dan **Delete** pada hujung perenggan mencantumkan perenggan seterusnya kepadanya. Dalam sel jadual, kapsyen dan senarai takrifan, Enter tidak berbuat apa-apa: hanya teks di dalamnya yang berubah.
- **Tebal** (Ctrl+B) dan **Condong** (Ctrl+I) dihidupkan dan dimatikan secara bergilir. Teks yang dijadikan tebal atau condong oleh helaian gaya buku kekal seperti asal.
- **Buat asal** (Ctrl+Z) dan **Buat semula** (Ctrl+Y) masih berfungsi selepas anda menyimpan. Membuat asal perubahan dalam bab lain akan membawa anda ke bab itu.
- **Ganti** (Ctrl+H) berjalan ke seluruh buku, satu perenggan pada satu masa: padanan tidak pernah merentas dua perenggan. Bab baca sahaja dilangkau, dan bilangan tempat yang dilangkau dipaparkan. **Ganti semua** dibuat asal dalam satu langkah.

## Menyimpan

- Simpan (Ctrl+S), Simpan Sebagai (Ctrl+Shift+S, `.epub` sahaja), **Simpan automatik** pada reben dan soalan sebelum menutup berfungsi sama seperti dalam editor lain.
- Jika tiada apa-apa yang berubah, fail tidak ditulis semula. Apabila anda menyimpan perubahan, hanya perenggan yang anda ubah ditulis semula. Gambar, fon, gaya dan setiap bahagian lain buku kekal sama seperti sebelumnya. Dalam buku EPUB 3, tarikh "terakhir diubah suai" turut dikemas kini.
- Jika program lain mengubah fail itu selepas anda membukanya, fail itu tidak akan ditimpa.

## Panel AI

- Tanya tentang buku, minta ringkasan sesuatu bab, atau minta teksnya dibetulkan atau ditulis semula. AI membaca senarai kandungan dan bab-bab buku serta mencari teks di dalamnya.
- Perubahan yang dibuat oleh AI muncul serta-merta, dan satu kali buat asal (Ctrl+Z) mengembalikan semua yang diubahnya dalam giliran itu. AI boleh menjadikan teks tebal atau condong, tetapi tidak boleh menambah gambar, jadual atau bab.
- Teks buku ialah bahan untuk AI, bukan arahan kepadanya.
- Minta "Terjemah buku ini ke bahasa Perancis" dan AI akan membuka tetingkap terjemahan dengan bahasa itu sudah diisi. Tiada apa-apa dihantar sehingga anda menekan **Mula**.
- Buku EPUB juga boleh dilampirkan dalam panel AI editor lain, dipilih dengan `@`, dan ditemui melalui carian fail di skrin Laman Utama.

## Menterjemah buku

1. Pada tab **Laman Utama**, klik **Terjemah buku** (atau Fail ▸ Terjemah buku…).
2. Pilih bahasa, bab (semuanya dipilih pada mulanya) dan hasilnya: **Buku terjemahan**, **Buku dwibahasa** (asal dan terjemahan), atau kedua-duanya. Pilih tempat setiap satu disimpan.
3. Klik **Seterusnya**. Pengesahan menunjukkan anggaran bilangan permintaan AI, AI yang akan menerimanya, bahagian yang sudah diterjemah (tidak dihantar lagi) dan, bagi sambungan yang dicaj mengikut penggunaan, bahawa caj akan dikenakan. Jika buku mempunyai perubahan yang belum disimpan, butang itu menjadi **Simpan dan terjemah**.
4. Klik **Mula**. Kemajuan dan **Henti** muncul di bahagian atas. Penyuntingan dikunci sehingga terjemahan selesai; panel AI masih boleh digunakan.
5. Pada akhirnya, laporan menyenaraikan apa yang telah diterjemah, apa yang kekal dalam bahasa asal dan fail hasil, setiap satu dengan **Buka**.

- Buku asal tidak berubah. Setiap hasil ialah fail EPUB baharu dengan identiti tersendiri, jadi aplikasi pustaka e-buku mengasingkannya daripada buku asal.
- Tajuk dan senarai kandungan turut diterjemah. Dalam buku dwibahasa, setiap perenggan diikuti oleh terjemahannya; dalam jadual, kapsyen dan senarai, terjemahan diletakkan di dalam sel atau item yang sama. Tajuknya memaparkan kedua-duanya, seperti "Tajuk asal (Tajuk terjemahan)".
- Bab yang tidak anda pilih kekal dalam bahasa asal dalam hasil.
- Buku yang ditulis secara menegak menjadi mendatar, kecuali jika diterjemah ke bahasa Jepun, Cina atau Korea. Terjemahan bahasa Arab dan Ibrani dibaca dari kanan ke kiri.
- Apa yang telah diterjemah akan disimpan. Jika anda berhenti, pilih **Eksport yang sudah diterjemah** (selebihnya kekal dalam bahasa asal) atau **Sambung kemudian**. Apabila anda membuka buku yang terjemahannya belum selesai, GenOffice menawarkan untuk menyambungnya. **Terjemah semula dari awal** terlebih dahulu memadam terjemahan yang disimpan bagi bahasa itu.
- Terjemahan yang disimpan dikira di bawah Tetapan ▸ Umum ▸ **Hasil AI yang disimpan**, bersama-sama hasil dokumen PDF, dan **Padam semua** turut memadamnya.
- Terjemahan yang sama juga boleh dijalankan daripada [arahan terminal](help://cli) sebagai `ieumoffice epub translate`.

## Belum disokong

- Menambah, memadam atau menyusun semula bab; menukar tajuk, pengarang atau kulit buku; menyisipkan gambar atau jadual; menukar perenggan menjadi tajuk atau senarai.
- Menyunting atau menterjemah buku susun atur tetap, dan membuka buku yang dilindungi salinan.
- Menyelak halaman seperti buku bercetak, dan mencipta buku baharu yang kosong.
- Membandingkan teks asal dan terjemahan bersebelahan di dalam editor. Sebaliknya, buka buku dwibahasa, dan betulkan buku terjemahan seperti buku lain.
- Menyembunyikan bahagian buku daripada AI.
