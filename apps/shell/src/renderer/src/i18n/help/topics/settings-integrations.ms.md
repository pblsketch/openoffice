# Tetapan, bahasa, tema dan integrasi MCP

## Membuka tetapan

Baris di penjuru kiri bawah pada Laman Utama akan membuka panel tetapan. Ia memaparkan Sambungkan AI sehingga ada AI yang disambungkan. Panel ini mempunyai lima bahagian: Akaun, AI, Umum, Integrasi dan Perihal.

**Akaun** menunjukkan keadaan langganan Claude dan Codex anda, dan **Urus sambungan** membawa anda ke bahagian AI. AI mempunyai babnya sendiri: [Sambungan langganan](help://subscription) dan [Model AI dan tetapan](help://ai-models).

## Bahasa

- Tetapan menawarkan **21 bahasa antara muka**: Inggeris, Cina ringkas, Jepun, Korea, Perancis, Jerman, Sepanyol, Thai, Indonesia, Rusia, Arab, Portugis, Itali, Poland, Czech, Belanda, Melayu, Ibrani, Hindi, Cina tradisional, dan Vietnam.
- Pertukaran bahasa berkuat kuasa serta-merta dan kekal, manakala bar menu sistem dibina semula dalam bahasa baharu itu.

## Tema

Tiga pilihan ialah Cerah, Gelap, dan Ikut Sistem. Mod Ikut Sistem mengikut rupa sistem pengendalian, dan editor akan mengubah warnanya mengikut tema itu tanpa kelip.

## Umum

- **Kedudukan bar sisi AI** (kiri atau kanan), **Saiz teks panel AI** dan **Semakan ejaan dalam sembang AI**.
- **Buka panel AI dalam dokumen baharu** — dimatikan, dokumen baharu bermula dengan panel tertutup, sekali klik sahaja.
- **Simpan automatik semua dokumen** membolehkan AutoSave secara lalai dalam setiap editor; anda masih boleh mematikannya untuk satu tetingkap sahaja.
- **Lokasi simpanan** dengan butang **Tukar**, dan **Apl lalai untuk dokumen Office** untuk menuntut .docx / .xlsx / .pptx bagi GenOffice.

GenOffice tidak mengumpul atau menghantar statistik penggunaan, jadi tiada suis untuknya.

## AI ▸ Lanjutan

Tertutup sehingga anda membukanya; kebanyakan orang tidak pernah memerlukannya. Tab **Model AI** menyimpan kunci API dan pelayan yang anda jalankan sendiri, untuk sembang. Pada tab **Media & Carian AI**, setiap keupayaan memilih penyedia yang menyediakannya, dan kunci serta URL asas setiap penyedia dimasukkan sekali sahaja lalu dikongsi bersama:

- **Carian web**, **Penjanaan imej**, **Analisis imej** dan **Analisis video**, setiap satu dengan penyedia, model, kunci dan URL asas.
- **Carian fail tempatan** berjalan pada mesin ini. Di bawahnya, **penyusunan semula carian Jev** **mati secara lalai**. Apabila dihidupkan, petikan 20 hitungan setempat teratas — sehingga 1,200 aksara setiap dokumen, bersama nama fail dan folder — pergi ke titik akhir keputusan pilihan anda (Jev melalui OpenRouter atau TypeSafe, Perplexity, Liquid AI d1, Cloudflare, enjin setempat atau URL tersuai) untuk disusun semula mengikut kaitan. Apabila mati, tiada apa meninggalkan peranti.
- **Benarkan permintaan automatik menggunakan langganan** **dimatikan secara lalai**. Ia menentukan sama ada permintaan daripada baris arahan atau daripada ejen penulisan kod yang disambungkan boleh menggunakan langganan Claude atau Codex anda; lihat [Menyambungkan ejen penulisan kod](help://mcp).

## Perihal

- **Versi**, alamat GitHub projek, dan satu baris yang menamakan projek sumber terbuka yang menjadi asas aplikasi ini.
- **Saluran Kemas Kini**: Stabil atau Beta. Menukarnya berkuat kuasa serta-merta dan akan menyemak kemas kini; ia tidak akan menurunkan pemasangan Beta kembali ke Stabil.

## Penetapan sebagai aplikasi lalai

Tetapan boleh mendaftar GenOffice sebagai aplikasi yang mengendalikan fail .docx, .xlsx, .pptx, .pdf, dan yang lain. Pendaftaran ini dilakukan pada peringkat sistem, dan pengesahan diperlukan apabila diminta.

## Notis perisian pihak ketiga dan kemas kini

- Bantuan ▸ Notis Perisian Pihak Kedua memaparkan senarai penuh lesen perisian sumber terbuka yang disertakan dengan aplikasi.
- Menu (☰) ▸ Semak Kemas Kini (pada Mac, Bantuan ▸ Semak Kemas Kini) memulakan pemeriksaan secara manual. Jika terdapat versi yang lebih baharu, aplikasi akan meminta anda memasangnya.

## Integrasi MCP

**Integrasi** ialah panel yang menyambungkan GenOffice kepada ejen penulisan kod, dan ia ada babnya sendiri: Menyambungkan ejen penulisan kod. Versi ringkas — pilih satu laluan (baris arahan, atau MCP), ikut bahagian itu, kemudian mulakan sembang baharu dan bertanya.

Di bawah **Pelayan HTTP tempatan**, aplikasi ini juga boleh menjalankan pelayan itu sendiri — suis pendayakan dan port — dan **Lanjutan** menambah URL semakan kesihatan serta fail log, dan bukannya meninggalkannya kepada pembantu. Ia hanya mendengarkan pada localhost.

## Ringkasan baris arahan

| Perintah            | Fungsinya                             |
| ------------------- | ------------------------------------- |
| `ieumoffice <fail>` | membuka fail                          |
| `ieumoffice mcp`    | memulakan pelayan MCP tempatan        |
| `ieumoffice --help` | memaparkan semua perintah dan pilihan |
