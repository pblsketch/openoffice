# pdf2docx

## 맡은 범위

PDF를 편집 가능한 문서로 되살린다. PDFium으로 글자·이미지·벡터 경로를 뽑고(`src/extract`), 좌표만으로 줄·문단·단·표·목록·반복 머리글을 추론해 IR을 만들고(`src/analyze`), 형식별로 다시 조립한다: docx(`src/rebuild`), pptx(`src/rebuild-pptx`), xlsx(`src/rebuild-xlsx`). 스캔 페이지를 위한 OCR 정책(`src/ocr.ts`)과 OS OCR 보조 프로그램의 소스(`ocr-helper/`)도 여기 있다. 셸 메인 프로세스의 로컬 변환, PDF 앱, 명령줄 도구가 쓴다.

## 맡지 않는 것 (경계)

- PDF 보기, 주석, 텍스트 편집은 `apps/pdf`다.
- PDFium wasm을 읽고 초기화하는 일은 호출자가 한다(`init({ wasmBinary })` 뒤 `_PDFiumExt_Init()`). 초기화된 모듈을 `ConvertOptions.pdfium`으로 넘겨받는다.
- OOXML 직렬화 규칙은 `packages/docx-engine`과 `packages/pptx-engine`이 갖는다. 이 패키지는 그 공개 API에 블록을 넘길 뿐이다. xlsx만 예외로 `rebuild-xlsx/workbook.ts`가 새 통합 문서를 직접 쓰고 `packages/xlsx-gateway`를 쓰지 않는다.
- 문자 인식 엔진 자체는 OS의 것이다. 이 패키지는 인식 결과를 받아들일지 정하는 정책과, OS 엔진을 부르는 보조 프로그램만 가진다.
- 첨부 파일의 평문 추출은 `packages/file-parse`다. AI 모델은 부르지 않는다. 분석은 전부 기하 규칙이다.

## 항상 지켜야 하는 것

- 망가진 텍스트보다 충실한 이미지가 낫다. 페이지 신뢰도가 0.5(`PAGE_CONFIDENCE_MIN`) 미만이거나, 텍스트 인코딩을 믿을 수 없거나, 그려진 내용 대부분을 IR이 잃은 페이지는 전체 페이지 이미지로 내보내고 `pageResults`에 `degraded`와 사유를 남긴다. 깨진 글자나 빈 페이지를 조용히 내보내지 않는다.
- OCR은 덧붙이는 경로다. 쓸 만한 텍스트 레이어가 있는 페이지는 들어가지 않는다. 엔진 실패, 글자 8자 미만, 평균 신뢰도 0.55 미만, 종이 색 비율 0.45 미만 등 어느 관문에서든 걸리면 전체 페이지 이미지로 돌아간다.
- `OcrEngine`은 동기 함수여야 한다. 파이프라인이 동기 PDFium 문서 범위 안에서 돈다. 보조 프로그램은 `spawnSync`로 부르고 제한은 30초, 출력 64 MiB다.
- `src/index.ts`에서 `ocr-vision.ts`를 내보내지 않는다. `node:child_process`를 끌어오기 때문이고, Node에서 도는 호출자가 직접 import해 `ConvertOptions.ocr`로 넘긴다.
- 형제 패키지는 패키지 이름이 아니라 상대 경로(`../../../docx-engine/src/index` 등)로 import한다. `node_modules`가 다른 체크아웃으로 이어진 작업 트리에서는 패키지 이름이 엉뚱한 사본을 실행한다. 이 import를 패키지 이름으로 "정리"하지 않는다.
- Electron을 import하지 않는다.
- PDF를 열지 못하면(암호 등) `PdfLoadError`를 코드와 함께 던진다. 조용히 빈 결과를 돌려주지 않는다.
- 엔진 동작은 원본(GenOffice)의 수정을 받아올 때 바뀐다. 예외는 사람이 정해 아래 "원본과 다른 점"에 적은 수정뿐이다(결정 0058). 파일 이동, 재포맷, 이름 변경을 하지 않는다.

## 이 모듈의 방식

- `extractIrDocument`(`pipeline.ts`)가 세 출력 형식의 공통 줄기다. 추출 → 반복되는 머리글·바닥글 가려내기 → 페이지 분석 → 신뢰도에 따른 강등. 형식마다 정책이 갈리는 곳은 옵션으로 연다. `cellData`(xlsx)는 글자가 남아 있으면 레이아웃 사유의 강등을 건너뛰고, `absoluteLayout`(pptx)은 블록 겹침 같은 흐름 전용 신호로 신뢰도를 깎지 않는다.
- docx 조립은 빈 문서를 만들어 파싱한 뒤 블록을 저장 함수에 넘기는 방식이다(`buildBlankDocx` → `parseDocx` → `saveDocx`). 단위는 docx-engine 관례를 따른다. 길이는 twip, 글자 크기는 반포인트, 이미지 표시 크기는 CSS px다.
- 결과가 PC에 설치된 글꼴에 따라 달라진다. 조립 단계가 `packages/font-metrics`로 출력 글꼴의 실제 폭을 재어 넘치는 줄의 자간과 글자 크기를 조이고(`rebuild/fit.ts`), 설치되지 않은 패밀리를 치수가 맞는 설치 글꼴로 바꾼다(`rebuild/fontmap.ts`). 같은 PDF라도 글꼴 구성이 다른 PC에서는 출력이 다를 수 있다.
- 줄 맞춤은 조이기만 한다. 음수 자간은 0.05em까지, 글자 크기는 0.5pt씩 최대 3번, 6pt와 원래 크기의 85% 밑으로는 내리지 않는다. 설치되지 않은 글꼴에 대응표가 없으면 건드리지 않는다. 틀린 "호환" 글꼴이 렌더러의 자체 대체보다 나쁘다.
- 그림 손실 감시가 따로 있다. 글자 수준 검사는 다 통과했는데 표지나 인포그래픽처럼 벡터 그림이 대부분인 페이지가 있다. 원본에 칠해진 면적이 페이지의 0.3 이상인데 IR이 그중 0.35 미만만 그리면 그 페이지는 이미지로 내보낸다.
- 한 경로에 점이 10만 개 넘게 올 수 있다. 좌표 배열을 `Math.min(...points)`처럼 펼치지 않는다. 엔진의 인자 수 한도를 넘어 던진다.
- `ocr-helper/`는 TypeScript 빌드 밖이다. `win-ocr.cs`는 `build-win.mjs`가 Windows에 기본으로 있는 .NET Framework 컴파일러로 `win-ocr.exe`로 만들고, Windows Kits 메타데이터가 있어야 한다. 설치본을 만들 때 `apps/shell/electron-builder.cjs`가 이 빌드를 부른다. macOS용과 규약이 같다. PNG를 stdin으로 받고 JSON 줄을 stdout으로 낸다.

## 원본과 다른 점 (결정 0058)

원본의 개선을 받아온 뒤 아래 시험이 모두 통과해야 한다. 충돌을 풀 때 이 동작이 사라지지 않게 한다.

- **돌아간 글자 묶음.** 바른 쪽에서 3자 이상 이어진 돌아간 글자(여백의 arXiv 도장 등)는 본문 글자 흐름에서 빠져, 그 방향으로 읽은 문단 하나로 쪽 끝에 붙는다. 괘선 표 안의 돌아간 머리글과 2자 이하 조각은 그대로다. `analyze/turned.ts`, `analyze/index.ts`. 시험 `tests/turned.test.ts`.
- **줄 끝 하이픈 표시.** PDFium은 줄 끝 하이픈을 제어 문자 0x02(IsHyphen)로 준다. 추출 단계의 제어 문자 필터와 깨진 글자 비율이 이 글자를 빼지 않는다(`extract/index.ts`). 대문자 앞의 하이픈("non-|English")은 원래 하이픈으로 되돌린다(`analyze/lines.ts`). 하이픈으로 끝난 줄은 문단이나 표지 없는 목록 항목의 끝이 아니다(`analyze/blocks.ts`). 시험 `tests/hyphen-marker.test.ts`.
- **조판기가 짧게 끝낸 줄.** 표지 없는 목록 판정(P8 C)은 다음 단어보다 3em 넘게 남은 줄 하나, 또는 경계의 1/3 이상에서 되풀이되는 작은 차이가 있어야 목록으로 본다. 짧은 줄 규칙은 같은 굵기의 라틴 소문자로 시작하는 다음 줄을 같은 문단으로 읽는다(남은 자리가 결정적이면 끝). `analyze/blocks.ts`. 시험 `tests/blocks.test.ts`의 "keeps ragged-right prose whole…", "still splits a list whose entries miss by a little…", "short-line paragraph ends".
- **쪽의 단 틈을 가로지르는 나란한 표.** 산문 줄이 가로지르지 않는 x 틈을 단 틈으로 보고, 그 틈을 가로지르되 행 대부분이 한쪽에만 내용이 있는 테두리 없는 표는 틈 양쪽에서 따로 다시 찾는다. 전체 폭 표는 그대로다. `analyze/stream.ts`의 `splitSideBySide`. 시험 `tests/stream.test.ts`의 "side-by-side tables across a page gutter".

## 테스트

- `npm run test -w @genoffice/pdf2docx`, 또는 패키지 폴더에서 `npx vitest run`. 타임아웃은 20초다. PDFium wasm은 `tests/helpers/wasm.ts`가 `node_modules`에서 읽어 초기화한다.
- 입력 PDF는 저장소에 없고 `tests/helpers/fixtures.ts`가 그때그때 만든다. `tests/golden/`에는 아직 견본이 없고 안내문만 있다. `npm run fixtures`는 필요 없다.
- 한중일 문자와 오른쪽에서 왼쪽으로 쓰는 문자의 통합 테스트는 `fixtures.ts`에 적힌 글꼴 파일이 있을 때만 돈다. Windows에서 찾는 경로는 `C:\Windows\Fonts\arialuni.ttf` 하나다. 이 파일이 없는 PC에서는 그 묶음이 건너뛰어지므로, 해당 스크립트의 분석을 바꿨다면 통과 표시만으로 검증됐다고 보지 않는다.
- 테스트가 쓰는 `pdf-lib`는 이 패키지의 `package.json`에 없고 `apps/pdf`의 의존성으로 설치된 것을 쓴다.
- 손으로 만든 글자(`tests/helpers/chars.ts`)로 하는 시험은 추출 단계를 거치지 않는다. 추출 단계의 필터에 걸리는 동작(PDFium의 하이픈 표시 등)은 `pdf-lib`로 만든 PDF에서 시작하는 시험으로 지킨다. 줄 끝이 "글자-" 다음 줄이 글자로 시작하면 합성 PDF에서도 PDFium이 하이픈 표시를 준다.
- 분석 규칙을 바꾸면 그 규칙만 겨냥한 합성 페이지 사례와, 인접 규칙이 그대로인지 보는 사례를 함께 넣는다. 강등 기준을 바꾸면 강등되는 쪽과 유지되는 쪽을 둘 다 넣는다.
- `ocr-helper/smoke-win.mjs`는 vitest 밖의 별도 점검이다. 보조 프로그램을 빌드하고 견본 PNG로 규약을 확인한다.
- Windows에서 원본 코드 그대로도 실패하는 테스트는 없다.
