# Google Drive

Sambungkan Google Drive untuk membuka fail Drive yang anda pilih dalam GenOffice dan mengeditnya. Apabila anda menyimpan, fail kembali ke Drive. GenOffice hanya boleh membuka fail yang anda pilih dalam tetingkap Google; ia tidak nampak fail lain dalam Drive anda.

## Menyambung

1. Buka **Tetapan ▸ Integrasi**.
2. Baca **Sebelum menggunakan fail Drive dengan AI**, matikan latihan model dalam akaun AI yang anda gunakan dengan fail Drive, kemudian tandakan item itu.
   - Claude: dalam **Tetapan ▸ Privasi** Claude, matikan latihan model.
   - ChatGPT dan Codex: dalam **Tetapan ▸ Kawalan data** ChatGPT, matikan **Improve the model for everyone**.
   - Penyedia kunci API secara lalai tidak menggunakan data API untuk latihan.
   - Sambungan AI percuma (model percuma OpenRouter, Gemini) tidak pernah diberi fail Drive.
3. Klik **Sambungkan Google Drive**. Halaman log masuk Google dibuka dalam pelayar. Log masuk dan benarkan akses.
4. Kembali ke GenOffice. Kad menunjukkan akaun yang disambungkan.

Google tidak membenarkan fail Drive dihantar kepada perkhidmatan AI yang menggunakannya untuk melatih modelnya, jadi anda tidak boleh menyambung atau memilih fail sehingga item itu ditanda.

Log masuk disimpan pada PC ini dengan penyulitan yang disediakan sistem pengendalian untuk akaun pengguna anda (perlindungan Windows sendiri, rantai kunci macOS, atau keyring desktop pada Linux). Jika PC ini tidak dapat menyulitkannya, sambungan kekal hanya sehingga anda menutup aplikasi.

## Membuka fail Drive

- Klik **Google Drive** di bar sisi Laman Utama, kemudian **Pilih daripada Google Drive**.
- Pemilih fail Google dibuka dalam pelayar. Pilih fail yang mahu dibuka (boleh beberapa sekali gus); GenOffice kembali dan membukanya dalam editor yang sesuai.
- Fail yang pernah anda pilih kekal dalam senarai **Fail yang anda pilih**. Buka semula dari situ, atau cari mengikut nama dan kandungan.
- Format yang tidak dapat dibuka oleh GenOffice dipaparkan malap. Google Docs, Sheets dan Slides dibuka sebagai fail Word, Excel dan PowerPoint.

## Menyimpan semula ke Drive

- Simpan seperti biasa. Sebentar kemudian fail dimuat naik ke Drive.
- Jika seseorang mengubah fail dalam Drive selepas anda membukanya, anda akan ditanya sama ada mahu menulis ganti fail dalam Drive, menyimpan salinan ke Drive, atau menyimpan perubahan pada PC ini sahaja.
- Fail yang hanya boleh anda lihat disimpan ke Drive sebagai salinan, atau kekal pada PC ini.
- Dokumen Google dibiarkan seperti asal. Perubahan anda disimpan sebagai fail Office dalam folder yang sama, atau dalam Drive Saya jika folder itu tidak boleh ditulis.
- Jika muat naik gagal, perubahan anda kekal pada PC ini dan GenOffice mencuba lagi, termasuk apabila aplikasi dimulakan seterusnya.

## AI dan Drive

- Dalam panel AI editor Word, Excel, PowerPoint, HTML, peta minda dan Hangul, klik **Lampirkan daripada Google Drive** di sebelah butang lampiran untuk memilih fail dalam tetingkap Google dalam pelayar dan melampirkannya seperti fail daripada PC ini. Sehingga 20 pada satu masa.
- Selagi **Benarkan AI mencari dan membaca fail dalam Drive** dihidupkan (ia hidup apabila anda menyambung), AI dalam setiap editor boleh mencari dan membaca fail Drive yang anda pilih dalam GenOffice. Contohnya: "Cari minit mesyuarat bulan lepas dalam Drive saya dan ringkaskan." Jika fail tidak dijumpai, pilih fail itu dahulu di Laman Utama.
- Apa yang dibaca AI dihantar kepada penyedia AI yang anda gunakan. Bahagian yang disembunyikan daripada AI kekal tersembunyi.
- Selagi AI yang digunakan ialah sambungan percuma, melampirkan daripada Drive dan pembacaan Drive oleh AI tidak berjalan.
- AI tidak boleh mengubah, memadam atau berkongsi fail Drive.
- Sebaik sahaja kandungan yang dibaca daripada Drive ada dalam sembang, sembang itu berhenti menggunakan carian web, carian imej, pembacaan halaman melalui alamat web dan sisipan gambar melalui alamat web. Mulakan sembang baharu untuk menggunakannya semula.

## Memutuskan sambungan

Klik **Putuskan sambungan** dalam **Tetapan ▸ Integrasi**. GenOffice membuang log masuk daripada PC ini dan meminta Google menarik balik aksesnya. Salinan fail yang sudah ada pada PC ini kekal. Anda juga boleh membuang akses pada bila-bila masa di **Sambungan pihak ketiga** dalam Akaun Google anda.
