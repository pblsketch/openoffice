# Editor lukisan

Editor lukisan membuka lukisan Excalidraw dalam tabnya sendiri dan menyimpannya semula ke fail yang sama.

- **Apa yang dibuka**: nota lukisan yang dibuat dengan pemalam Excalidraw untuk Obsidian (`.excalidraw.md`, atau `.md` yang front matternya mengandungi `excalidraw-plugin`) dan fail `.excalidraw` daripada aplikasi web Excalidraw.
- **Lukisan baharu**: kad **Lukisan Excalidraw** di Laman Utama, atau **Fail ▸ Baharu**. Lukisan baharu ialah nota lukisan Obsidian (`.excalidraw.md`), dan anda menamakannya semasa simpanan pertama.
- **Melukis**: bentuk, anak panah, garis, lukisan bebas dan teks, dengan bar alat dan pintasan kanvas itu sendiri. ctrl+Z membuat asal.
- **Simpanan**: ctrl+S. Fail disimpan dalam format ia dibuka. Autosimpan menulis setiap 30 saat dan apabila tetingkap hilang fokus, tetapi melangkau lukisan yang belum mempunyai nama fail. Lukisan yang anda hanya lihat disimpan bait demi bait seperti asalnya.

## Nota lukisan Obsidian

- Simpanan hanya menulis semula senarai teks nota dan data lukisannya. Front matter, teks yang anda tulis dalam nota dan pautannya kekal seperti asal, jadi nota dibuka dengan cara yang sama dalam Obsidian.
- Imej yang dirujuk oleh nota (`[[imej.png]]` di bawah Embedded Files) dipaparkan apabila ia berada dalam peti besi nota: folder terdekat di atas nota yang mengandungi folder `.obsidian`, atau folder nota itu sendiri jika tiada. Imej melebihi 20 MB, dalam folder tersembunyi atau di luar peti besi tidak dipaparkan.
- Anda belum boleh menambah imej baharu pada nota. Alat imej dimatikan dan menjatuhkan fail ke kanvas disekat, kerana imej yang disimpan hanya di dalam nota mungkin tidak dipaparkan dalam Obsidian.

## Apa yang belum dilakukannya

- Tiada panel AI. AI tidak boleh membaca atau mengubah lukisan.
- Tiada eksport ke PNG atau SVG.
- Editor tidak menggunakan rangkaian. Fonnya terbina dalam, dan pustaka kongsi, kerjasama langsung serta benaman web dimatikan. Pautan dalam lukisan dibuka dalam pelayar hanya jika ia alamat web atau alamat e-mel.

## Membuka lukisan dari File Explorer

Pemasang menambah aplikasi ke **Buka dengan** untuk fail `.excalidraw` tanpa menjadikannya program lalai. Nota lukisan ialah fail `.md`, jadi ia dibuka di mana-mana sahaja fail Markdown dibuka dalam aplikasi, dan masuk ke editor lukisan, bukan editor Markdown.
