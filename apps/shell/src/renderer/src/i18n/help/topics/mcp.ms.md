# Menyambungkan ejen penulisan kod

GenOffice bercakap dengan Model Context Protocol, jadi ejen penulisan kod boleh membaca, menulis dan memaparkan dokumen anda melalui enjin yang sama seperti yang digunakan oleh aplikasi. Ejen itu tidak meneka format fail: ia mendapat skema op bertip daripada definisi yang sama seperti yang disahkan oleh pelaku.

## Mendaftarkannya dari aplikasi

Tempatnya ialah **Tetapan ▸ Integrasi**. Panel itu mempunyai dua bahagian, dan anda boleh menggunakan satu sahaja atau kedua-duanya.

**Skill.** Satu baris bagi setiap ejen penulisan kod yang ditemui pada mesin ini — Claude Code, Codex, Cursor, Gemini CLI, Copilot CLI, OpenCode, Windsurf —, setiap satu dengan **Pasang**, **Kemas kini** dan **Nyahpasang**, tambahan lagi **Pasang ke folder lain…**, **Muat turun skill (zip)** dan **Salin laluan**. Jika pembantu anda tidak tersenarai, tunjukkan GenOffice folder tempat ia membaca `SKILL.md`, atau simpan fail zip itu dan biarkan pembantu memasangnya. Skill dan MCP boleh bersebelahan: pembantu akan memilih salah satu, dan keduanya melakukan perkara yang sama sekali.

**MCP.** Dua laluan ditawarkan: **Dimulakan oleh pembantu (disyorkan)**, di mana anda menambah konfigurasi yang dipaparkan pada klien anda dan pembantu memulakan pelayan itu sendiri, serta **Pelayan HTTP tempatan**, yang dijalankan aplikasi untuk anda. Bagaimanapun, pembantu akhirnya bercakap dengan GenOffice dan anda tidak sekali pun perlu menaip arahan.

## Mendaftarkannya dari baris arahan

Perkara yang sama daripada satu terminal — inilah laluan lanjutan, dan laluan yang perlu digunakan apabila ejen berada di tempat yang tidak dapat dicari oleh panel:

```sh
ieumoffice mcp install all
```

Ia menemui ejen penulisan kod pada mesin ini — Claude Code, Codex, Cursor, Gemini CLI, Copilot CLI, OpenCode, Windsurf — lalu menulis entri pelayan stdio ke dalam konfigurasi sendiri setiap satu, dan meninggalkan bahagian lain fail itu seperti yang dijumpainya. Entri itu dinamakan `ieumoffice`. Jika dilakukan secara manual untuk Claude Code, pendaftaran yang sama ialah `claude mcp add --transport stdio ieumoffice -- ieumoffice mcp`.

```sh
ieumoffice mcp list             # where each agent stands
ieumoffice mcp install cursor    # just one
ieumoffice mcp uninstall cursor  # take it back out
```

Ejen yang anda pasang di tempat yang luar biasa menggunakan `--dir <path>`; `--force` menulis semula entri yang sudah ada di situ.

`ieumoffice mcp --help` memaparkan segala yang diterima oleh pelayan itu pada satu skrin: borang untuk mendaftar, mengeluarkan dan menyenaraikan, penyajian melalui HTTP, dan dua pilihan skema.

## Menjalankannya tanpa pembantu

Bagi klien pada mesin lain, layankannya melalui HTTP:

```sh
ieumoffice mcp --http 8765 --token <secret>
```

`--host <addr>` menukar tempat ia mendengarkan. Berikan token yang sama kepada klien.

Fail bergerak melalui HTTP juga: `PUT /files/<name>` memuat naik satu fail, setiap alat menerima URL `http(s)` menggantikan laluan, dan output kembali sebagai URL muat turun — dan, apabila cukup kecil, sebagai sumber terbenam. Op, spec dan Markdown dihantar secara langsung dalam kedua-dua kes.

## Apa yang diterima oleh ejen

Setiap perintah ialah sebuah alat. Yang menarik:

- **`docs`, `sheet`, `slides`** — membaca dan menyunting fail melalui laluan tulis aplikasi itu sendiri, satu **op** pada satu masa. Dek baharu bermula dengan `deck_start`, `deck_page`, `deck_build`.
- **`render`** — satu PNG bagi setiap halaman, disusun oleh penjana aplikasi, jadi ejen boleh melihat slaid itu dan bukan meneka.
- **`pdf`** — lapisan teks PDF, halaman demi halaman, tanpa proses aplikasi.
- **`info`** — metadatan dan ringkasan struktur, yang biasanya merupakan panggilan pertama yang termurah bagi fail yang tidak dikenali.
- **`search`, `image`, `media`** — carian web dan imej, penjanaan imej dan analisis media melalui apa yang disediakan dalam aplikasi, jadi ejen tidak perlukan kunci sendiri. Bahagian seterusnya menerangkan apa yang boleh digunakannya.
- **`merge`** — mengisi templat `{{key}}`.

## Carian, imej dan media: apa yang boleh digunakan oleh ejen

Permintaan daripada perintah `ieumoffice` atau daripada klien MCP tidak ditaip oleh anda dalam aplikasi, jadi GenOffice berhati-hati dengannya.

- **Carian** sentiasa berfungsi dan percuma secara lalai. Kunci penyedia carian digunakan hanya jika anda memilihnya.
- **Menjana gambar** memerlukan kunci penyedia imej. Dalam versi ini, langganan tidak menjana imej.
- **Menghuraikan gambar** menggunakan penyedia berasaskan kunci apabila ada yang disediakan. Langganan Claude atau Codex anda **tidak digunakan melainkan anda membenarkannya**.
- **Video dan audio** memerlukan penyedia berasaskan kunci yang menyokong video.

Untuk membenarkan penggunaan langganan, buka Tetapan ▸ AI ▸ **Lanjutan** dan hidupkan **Benarkan permintaan automatik menggunakan langganan**. Satu amaran dipaparkan dahulu — "Tiada had sejam, jadi program boleh menghantar seberapa banyak permintaan yang dikehendaki, dan permintaan itu mungkin mengandungi seluruh teks dokumen serta imej halamannya. Kedua-dua syarikat tidak mengesyorkan program menggunakan langganan anda secara automatik, dan akaun anda mungkin dihadkan." — dan suis itu dihidupkan hanya selepas **Hidupkan juga**.

Walaupun suis itu dihidupkan:

- Permintaan dikendalikan satu demi satu. Yang lain menunggu giliran.
- Tiada had sejam. Giliran dikira mengikut permintaan, bukan mengikut tugas, jadi terjemahan PDF yang panjang bergilir-gilir dengan pemanggil lain dan tidak menahannya. Suis yang dihidupkan di bawah amaran lama telah dimatikan; baca amaran baharu dan hidupkannya semula.
- Log masuk bayar ikut guna yang anda benarkan dengan **Guna juga** tidak dikira sebagai langganan di sini. Ia dilayan seperti kunci: jika anda memilihnya sebagai AI yang digunakan, huraian gambar dibuat melaluinya walau apa pun kedudukan suis itu, dan setiap satu dicaj.

Apabila suis dimatikan dan tiada kunci disediakan, alat itu menjawab bahawa ciri tersebut tidak tersedia dan menamakan tetapan ini. Ejen boleh menyemak dahulu dengan alat `capabilities`; lihat [Baris arahan dan ejen](help://cli).

## Skema, dan bajet yang lebih kecil

`apply` dan `create` membentangkan parameter `ops`, `cells` dan `data` mereka bersama skema bertip bagi setiap op, yang dijana daripada `ieumoffice guide <domain> --json`. Itu tepat, tetapi tidak kecil. Klien dengan tetingkap konteks yang sempit boleh meminta tatasusunan biasa sebagai gantinya:

```sh
ieumoffice mcp --compact-schemas
GENOFFICE_MCP_COMPACT_SCHEMAS=1 ieumoffice mcp
```

## Mengapa perlu skill

Ejen yang tidak tahu kosa kata op akan meneka. Skill itu membawa rujukan dan panduan reka bentuk — bahan yang sama seperti yang dicetak oleh `ieumoffice guide` —, jadi pembantu menulis op yang spesifikasinya memang telah dibaca. Pasang ia daripada panel di atas, atau dengan `ieumoffice skill` daripada terminal.

## Apa yang boleh dicapainya dalam aplikasi

Pelayan itu tidak terhad kepada fail pada cakera. Selagi GenOffice berjalan, ejen juga boleh bekerja melalui tetingkap:

- **`open_in_genoffice`** membuka fail dalam satu tab dan memberikan tumpu kepadanya.
- **`open_documents`** menyenaraikan setiap dokumen yang anda buka — id, jenis, laluan, dan sama ada ia mempunyai perubahan yang belum disimpan —, kemudian membaca kandungan terkini sesuatu dokumen, menyimpannya di tempatnya, atau menutupnya, dengan menyimpan dahulu melainkan anda menyuruhnya membuang.
- **Alat kandungan** mengambil id itu (atau laluannya) sebagai argumen `document`, jadi satu suntingan mendarat pada tab yang memang sudah anda buka, dan tetingkap bertukar untuk mempaparkannya.

Dua perkara kekal di luar jangkauan: tiada panel AI, dan dialog kemas kini dalam aplikasi tidak terpakai.

## Panel Pelayan HTTP tempatan

Di bawah **Pelayan HTTP tempatan**, aplikasi menjalankan pelayan itu sendiri dan bukannya menyerahkankannya kepada pembantu: satu suis mendayakan, medan **Port**, penunjuk **Sedang berjalan / Tidak berjalan** dan **Penjanaan latar belakang** (menulis dokumen terus ke laluan tanpa membuka UI), serta **Contoh tetapan klien** untuk disalin. Membuka **Lanjutan** menambah dua URL sambungan — Streamable HTTP dan URL SSE yang lama —, URL **Semakan kesihatan** dan suis **Pencatuman log** yang mencatat aktiviti pelayan dan alat ke dalam fail setempat yang boleh anda **Buka**, **Segarkan** atau **Kosongkan** dari situ. Ia hanya mendengarkan pada localhost.
