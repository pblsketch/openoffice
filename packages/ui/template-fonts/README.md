# Template fonts

이 폴더의 글꼴은 슬라이드·문서·시트 디자인 템플릿이 함께 쓰는 글꼴입니다. 모두 원래 배포처의
파일 이름과 글꼴 이름 그대로이고(잘라 내거나 이름을 바꾸지 않았습니다), SIL Open Font License 1.1로
배포됩니다. 본명조(Noto Serif KR) 두 파일만 PDF로 내보낼 때 글꼴이 그대로 들어가도록 글자 윤곽을
TrueType 방식으로 바꿨고, 나머지는 배포처의 파일과 똑같습니다.
PC에 설치하려면 글꼴 파일을 두 번 눌러 설치하면 됩니다. 앱은 글꼴을 Windows에 설치하지 않습니다.

The fonts the slide, document and sheet design templates share. Every file keeps the original
distributor's file name, family names and metrics (no subsetting, no renaming), so a document that
uses one of these families opens the same way on a PC that has the real font installed. All files
but the two Noto Serif KR faces are the distributor's own, byte for byte; those two carry TrueType
outlines in place of the distributor's CFF (see below). All of them are licensed
under the SIL Open Font License 1.1; each family's license text sits beside its files. The app
does not download fonts at run time and does not install them into Windows.

This folder holds only the font files, their license texts and this readme. The list the app
reads is `packages/ui/src/template-fonts.ts`; it ships once in the installer as
`resources/template-fonts`.

All files were downloaded on 2026-10-14. "License evidence" is the distributor's license file
that was read; each one states "This Font Software is licensed under the SIL Open Font License,
Version 1.1" and carries the full license text.

## Korean

### Pretendard (프리텐다드)

| File                     | Weight | Size      |
| ------------------------ | ------ | --------- |
| `Pretendard-Regular.otf` | 400    | 1,574,352 |
| `Pretendard-Bold.otf`    | 700    | 1,576,660 |

- License: SIL OFL 1.1, with Reserved Font Name "Pretendard" — `Pretendard-OFL.txt`
- License evidence: https://github.com/orioncactus/pretendard/blob/v1.3.9/packages/pretendard/dist/LICENSE.txt
- Distributor: https://github.com/orioncactus/pretendard
- Source: https://github.com/orioncactus/pretendard/tree/v1.3.9/packages/pretendard/dist/public/static
- Version: 1.309 (release v1.3.9)

### Noto Serif KR (본명조)

| File                      | Weight | Size       |
| ------------------------- | ------ | ---------- |
| `NotoSerifKR-Regular.otf` | 400    | 12,099,724 |
| `NotoSerifKR-Bold.otf`    | 700    | 12,055,044 |

- License: SIL OFL 1.1 — `NotoSerifKR-OFL.txt`
- License evidence: https://github.com/notofonts/noto-cjk/blob/f8d157532fbfaeda587e826d4cd5b21a49186f7c/Serif/LICENSE
- Distributor: https://github.com/notofonts/noto-cjk
- Source: https://github.com/notofonts/noto-cjk/tree/f8d157532fbfaeda587e826d4cd5b21a49186f7c/Serif/SubsetOTF/KR
- Version: 2.003
- Copyright: Adobe (Noto CJK), stated in the font files.
- Modified: the distributor's CFF outlines (7,669,020 / 7,910,236 bytes) are converted to
  TrueType (glyf) by `tools/convert-cff-to-glyf.py`, because Chromium's PDF export draws CFF
  faces as Type3 paths instead of embedding them. File names, name table, cmap, advances, OS/2,
  hhea/vhea and layout tables are unchanged (the script asserts it). The upstream Reserved Font
  Name is "Source", which is not this family's name, so the OFL allows the Modified Version to
  keep "Noto Serif KR".

### Black Han Sans (검은고딕)

| File                       | Weight | Size    |
| -------------------------- | ------ | ------- |
| `BlackHanSans-Regular.ttf` | 400    | 998,424 |

- License: SIL OFL 1.1 — `BlackHanSans-OFL.txt`
- License evidence: https://github.com/google/fonts/blob/66928797f271fed5ee428544e7229685e2d90127/ofl/blackhansans/OFL.txt
- Distributor: https://github.com/google/fonts/tree/main/ofl/blackhansans
- Source: https://github.com/google/fonts/tree/66928797f271fed5ee428544e7229685e2d90127/ofl/blackhansans
- Version: 1.001
- A single-weight display family.

### Do Hyeon (도현)

| File                  | Weight | Size    |
| --------------------- | ------ | ------- |
| `DoHyeon-Regular.ttf` | 400    | 879,764 |

- License: SIL OFL 1.1 — `DoHyeon-OFL.txt`
- License evidence: https://github.com/google/fonts/blob/66928797f271fed5ee428544e7229685e2d90127/ofl/dohyeon/OFL.txt
- Distributor: https://github.com/google/fonts/tree/main/ofl/dohyeon
- Source: https://github.com/google/fonts/tree/66928797f271fed5ee428544e7229685e2d90127/ofl/dohyeon
- Version: 1.001
- A single-weight display family.

### Gowun Dodum (고운돋움)

| File                     | Weight | Size      |
| ------------------------ | ------ | --------- |
| `GowunDodum-Regular.ttf` | 400    | 7,229,088 |

- License: SIL OFL 1.1 — `GowunDodum-OFL.txt`
- License evidence: https://github.com/yangheeryu/Gowun-Dodum/blob/6d9ef10fc745cf3b0a4aba02dad1c740f94d029b/OFL.txt
- Distributor: https://github.com/yangheeryu/Gowun-Dodum
- Source: https://github.com/yangheeryu/Gowun-Dodum/tree/6d9ef10fc745cf3b0a4aba02dad1c740f94d029b/fonts/ttf
- Version: 2.000
- The distributor publishes a Regular only; there is no Bold to ship.

### Gowun Batang (고운바탕)

| File                      | Weight | Size      |
| ------------------------- | ------ | --------- |
| `GowunBatang-Regular.ttf` | 400    | 8,433,296 |
| `GowunBatang-Bold.ttf`    | 700    | 8,178,712 |

- License: SIL OFL 1.1 — `GowunBatang-OFL.txt`
- License evidence: https://github.com/yangheeryu/Gowun-Batang/blob/4e73f5a9a004927220354f4b68a4c720da538147/OFL.txt
- Distributor: https://github.com/yangheeryu/Gowun-Batang
- Source: https://github.com/yangheeryu/Gowun-Batang/tree/4e73f5a9a004927220354f4b68a4c720da538147/fonts/ttf
- Version: 2.000

## Latin title faces

### Bebas Neue

| File                    | Weight | Size   |
| ----------------------- | ------ | ------ |
| `BebasNeue-Regular.ttf` | 400    | 61,400 |

- License: SIL OFL 1.1 — `BebasNeue-OFL.txt`
- License evidence: https://github.com/google/fonts/blob/66928797f271fed5ee428544e7229685e2d90127/ofl/bebasneue/OFL.txt
- Distributor: https://github.com/google/fonts/tree/main/ofl/bebasneue
- Source: https://github.com/google/fonts/tree/66928797f271fed5ee428544e7229685e2d90127/ofl/bebasneue
- Version: 2.000

### Space Grotesk

| File                    | Weight | Size    |
| ----------------------- | ------ | ------- |
| `SpaceGrotesk-Bold.ttf` | 700    | 116,056 |

- License: SIL OFL 1.1 — `SpaceGrotesk-OFL.txt`
- License evidence: https://github.com/floriankarsten/space-grotesk/blob/03507d024a01282884232081fc6011c09ff4e849/OFL.txt
- Distributor: https://github.com/floriankarsten/space-grotesk
- Source: https://github.com/floriankarsten/space-grotesk/tree/03507d024a01282884232081fc6011c09ff4e849/fonts/ttf/static
- Version: 2.000

### Playfair Display

| File                        | Weight                      | Size    |
| --------------------------- | --------------------------- | ------- |
| `PlayfairDisplay[wght].ttf` | variable 400–900 (Bold 700) | 300,724 |

- License: SIL OFL 1.1, with Reserved Font Name "Playfair Display" — `PlayfairDisplay-OFL.txt`
- License evidence: https://github.com/google/fonts/blob/66928797f271fed5ee428544e7229685e2d90127/ofl/playfairdisplay/OFL.txt
- Distributor: https://github.com/google/fonts/tree/main/ofl/playfairdisplay
- Source: https://github.com/google/fonts/tree/66928797f271fed5ee428544e7229685e2d90127/ofl/playfairdisplay
- Version: 1.203
- A variable font: Google Fonts publishes Playfair Display only in this form (the designer's
  repository now carries its successor, Playfair 2). Its named instances include Bold (700).

### Archivo Black

| File                       | Weight | Size   |
| -------------------------- | ------ | ------ |
| `ArchivoBlack-Regular.ttf` | 400    | 90,988 |

- License: SIL OFL 1.1 — `ArchivoBlack-OFL.txt`
- License evidence: https://github.com/google/fonts/blob/66928797f271fed5ee428544e7229685e2d90127/ofl/archivoblack/OFL.txt
- Distributor: https://github.com/google/fonts/tree/main/ofl/archivoblack
- Source: https://github.com/google/fonts/tree/66928797f271fed5ee428544e7229685e2d90127/ofl/archivoblack
- Version: 1.006

## Total

13 font files, 53,594,232 bytes (51.1 MiB).
