# file-parse

## 맡은 범위

첨부 파일을 모델에 보낼 평문으로 바꾼다. `parseFileToText(경로)`가 확장자와 매직 바이트를 보고 PDF, docx, doc, odt, pptx, ppt, xlsx/xlsm, 마인드맵(`.xmind`), 한글(hwp, hwpx), EPUB 책(`.epub`), 텍스트 계열 파일을 글자로 풀고, 이미지는 내용을 읽지 않고 `kind: 'image'`와 MIME만 돌려준다. Docs·Sheets·Slides·HTML·Mindmap·EPUB 메인 프로세스의 첨부 처리, 셸의 파일 색인·지식 베이스, 만들기 창의 자료 확인과 AI 없이 바꾸기가 쓴다. 앱 안에서 파일이 "다른 파일로" 읽히는 길은 모두 여기를 지난다.

다른 파일로 읽힐 때의 가리기도 맡는다. 자기 편집기가 AI에게 가리는 자리를 여기서도 똑같이 `{{이름}}`으로 바꿔 내준다.

첨부할 수 있는 형식 목록도 여기서 한 벌로 정의한다(`attachable.ts`, 결정 0035). `ATTACHABLE_EXTS`(글자로 읽는 형식과 그림을 합친 한 벌), `ATTACHABLE_IMAGE_EXTS`(그림 확장자), `ATTACHABLE_MAX_BYTES`(50MB)·`ATTACHABLE_IMAGE_MAX_BYTES`(5MB), 판정 함수 `isAttachableExt`를 내주고, 일곱 편집기(워드·엑셀·PPT·HTML·마인드맵·한글·EPUB)의 메인 프로세스가 이것을 가져다 쓴다. `.epub`도 이 목록에 있다.

| 형식     | 파일                    | 가리는 자리                                                                                                                                                                       |
| -------- | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PPT      | `pptx-redaction.ts`     | 실행(run)의 `<a:rPr>` 안 확장 자리에 표시가 있는 글 구간(필드 포함), 슬라이드 본문과 발표자 노트. 그림의 표시는 글이 없어 모양만 검사한다                                         |
| 마크다운 | `markdown-redaction.ts` | 마크다운 편집기가 저장하는 `<span class="redact-span" data-redaction="" data-label="…">` 구간. `.md`, `.markdown`, 그리고 그 편집기가 열고 다른 이름으로 저장하는 `.txt`, `.json` |
| HTML     | `html-redaction.ts`     | `data-gx-redact`(요소의 내용), `data-gx-redact-<속성>`(그 속성의 값), `<script>` 안의 `/*gx:redact:이름*/` 뒤 문자열. 색인의 HTML 갈래도 `redactHtmlSource`를 쓴다                |

## 맡지 않는 것 (경계)

- 편집용 파싱이 아니다. 서식, 위치, 왕복 보존에 필요한 정보는 버린다. 문서를 열고 저장하는 일은 `packages/docx-engine`, `packages/odt-engine`, `packages/pptx-engine`, `packages/xlsx-gateway`와 Rust 사이드카가 한다.
- ODT의 글자 풀기는 `packages/odt-engine`의 `odtToText`가 한다. 이 패키지는 그 결과를 그대로 쓰고, 출력 모양을 고치려면 엔진 쪽을 고친다.
- 이미지를 모델에 넘기는 일은 호출자와 `packages/ai-provider`가 한다.
- 첨부 개수와 크기 제한, 모델 입력 길이에 맞춘 자르기는 호출자가 한다. 이 패키지에는 파일 크기 상한이 없다.
- 스캔한 PDF의 글자 인식은 하지 않는다. PDF를 문서로 되살리는 일은 `packages/pdf2docx`다.
- 지도 파일의 해석과 개요 글은 `packages/xmind-engine`이 한다. 여기는 `openXmind`와 `sheetsToOutline`을 부를 뿐이다(`xmind.ts`).
- EPUB 책의 해석(zip 관문, DRM 판정, 장 글 뽑기)은 `packages/epub-engine`이 한다. 여기는 번역을 싣지 않는 진입점 `@genoffice/epub-engine/core`에서 `openEpub`과 `extractChapterText`를 가져와 부를 뿐이다(`epub.ts`). 패키지 루트를 가져오면 이 패키지를 쓰는 모든 편집기가 `pdf2docx` 소스까지 형 검사하게 된다. 출력 모양을 고치려면 엔진 쪽을 고친다.
- 워드(`.docx`)의 가리기 표시는 처리하지 않는다. 이 저장소에도 원본의 공개 저장소에도 그 표시를 쓰거나 읽는 코드가 없어 모양을 확인하지 못했고, 확인되기 전에 짐작으로 만들지 않는다.
- 파일을 읽기 전에 "저장하지 않은 변경이 있는 파일인가"를 묻는 일은 호출자가 한다(`packages/electron-utils`의 `assertFileSaved`·`withoutUnsavedFiles`).
- 터미널 명령어(`packages/cli`)의 읽기는 이 패키지를 지나지 않고, 가리기를 적용하지 않는다.
- 한글 문서를 고치거나 저장하지 않는다. 그것은 `apps/hwp`의 편집기가 한다. 여기서는 같은 엔진(`@rhwp/core`)으로 열어 글자만 꺼낸다.
- 읽기에 시간 제한을 두지 않는다. 칸이 수만 개인 표가 든 한글 문서는 엔진이 여는 데만 10초 넘게 걸린다. 파일 색인은 작업자 스레드와 120초 제한 안에서 부르지만, 첨부·MCP·열린 탭 읽기는 메인 프로세스에서 바로 부른다.

## 항상 지켜야 하는 것

- `parseFileToText`는 실패를 던지지 않고 `{ ok: false, error }`로 돌려준다. 깨진 파일 하나가 채팅 요청 전체를 막으면 안 된다. 따로 내보낸 `docxToText` 같은 개별 함수는 던진다.
- 확장자를 믿지 않는다. 매직 바이트와 어긋나면 `Content mismatch`로 거부한다. 예외는 `.doc` 이름의 zip 하나이고 OOXML로 읽는다. `.ppt` 이름의 zip은 거부한다. `.hwpx`는 zip이어야 하고, `.hwp`는 OLE(HWP 5), `HWP Document File`로 시작하는 옛 HWP 3, zip(이름만 `.hwp`인 HWPX) 셋을 받는다. `.odt`는 zip이어야 하고, 그 안의 `mimetype`이 `application/vnd.oasis.opendocument.text`가 아니면(docx, 스프레드시트, 서식 파일 `.ott`) 역시 `Content mismatch`다. 다른 이름(`.docx` 등)으로 저장된 ODT는 내용으로 알아보지 않으며 그 이름의 형식으로 읽다가 `ok: false`가 된다. 열기 암호가 걸린 `.docx`·`.xlsx`·`.xlsm`·`.pptx`(OLE 안에 `EncryptedPackage` 스트림)는 불일치가 아니라 `Password-protected .<확장자>`로 거부한다. 빠른 보기는 이 글을 보고 "암호가 걸린 문서"로 보여 준다.
- zip 기반 형식은 풀기 전에 관문을 거친다. pptx와 xlsx는 `assertZipInflatesWithinLimits`를 먼저 부르고 그다음에 선언 크기 검사를 한다. hwpx도 zip이므로 엔진에 넘기기 전에 같은 관문을 거친다. docx는 `parseDocx` 안에서, odt는 `odtToText`(엔진의 `openOdt`) 안에서 같은 검사가 돈다. 순서를 바꾸거나 선언 크기 검사만 남기지 않는다.
- 암호 걸린 ODT(manifest에 `manifest:encryption-data`)는 읽지 않고 `ok: false`와 암호를 풀어 다시 첨부하라는 오류를 돌려준다. 깨진 ODT와 관문에서 거부된 ODT도 `ok: false`다. 개별 함수 `odtToText`는 엔진의 `OdtOpenError`를 그대로 던진다.
- 관계(rels) 대상은 `resolveTarget`으로만 푼다. `..`은 zip 루트에서 멈추고, 스킴이 붙은 대상과 디코딩할 수 없는 대상은 빈 문자열이 된다. Windows 계열 생성기가 쓰는 역슬래시 구분자도 여기서 처리한다.
- 글자를 바꾸지 않는다. XML 파서 설정은 `trimValues: false`, `parseTagValue: false`로 둔다. `02139` 같은 값이 숫자로 바뀌거나 런 사이의 공백이 사라지면 안 된다.
- 적대적인 xlsx에 메모리를 내주지 않는다. 열 번호가 16,384(`MAX_XLSX_COLS`) 이상이거나 참조가 잘못된 셀은 그 자리를 채우지 않고 뒤에 붙이고, 빈 칸이 8개 넘게 이어지면 `(N empty)`로 줄인다.
- 입력 바이트를 바꾸지 않는다. pdfjs는 받은 버퍼의 소유권을 가져가므로 복사본을 넘긴다.
- **가리기는 닫힌 쪽으로 실패한다.** 표시가 있는데 무엇을 감추는지 확실히 정할 수 없으면 원문을 내주지 않고 `RedactionMarkError`를 던진다. `parseFileToText`는 이것을 `{ ok: false, error }`로 바꾼다. 실패하면 원문으로 돌아가는 대체 경로를 만들지 않는다. 덜 가리느니 읽지 않는다.
- **가리는 자리는 그 형식의 편집기가 가리는 자리와 같아야 한다.** 이 패키지는 앱이나 문서 엔진을 가져올 수 없어서 표시의 모양을 다시 적었다. 편집기나 엔진의 표시를 바꾸면 여기도 같이 바꾼다. PPT의 확장 식별자는 테스트가 엔진의 상수와 견준다. 결과는 편집기보다 더 가릴 수는 있어도 덜 가리면 안 된다.
- **마크다운 구간의 끝을 짐작하지 않는다.** 이 패키지에는 편집기의 마크다운 파서가 없다. 처음 나오는 `</span>`가 확실히 그 구간의 끝일 때만 거기서 닫고(코드·강조·링크 같은 구조가 걸쳐 있지 않을 때), 그 밖에는 읽기를 실패시킨다(`markdown-redaction.ts` 머리 주석의 세 조건). 표시 이름을 글로 언급만 한 파일은 그대로 읽는다.
- **HTML은 파서가 본 표시를 모두 확인한다.** 편집기의 검사가 놓치는 꼴(값 없는 `data-gx-redact`, 대문자 이름)을 파서(parse5)가 보면 읽기를 실패시킨다.
- **PPT는 표시의 흔적이 모두 실행이나 그림으로 설명돼야 한다.** 이름이 없거나, 부모가 틀렸거나, 닫히지 않는 표시는 덱 전체를 읽지 않는다. 가린 실행은 글 걷기가 읽기 전에 이름표만 든 실행으로 바뀐다.
- `.epub`은 zip이 아니면 `Content mismatch`로 거부한다. 열리지 않는 책(zip 관문의 거절, EPUB이 아님, DRM)은 `epubToText`가 이유를 담아 던지고 `parseFileToText`에서는 `ok: false`다. 글자 인코딩이 맞지 않는 장은 표시 한 줄을 남기고 빼며, 읽히는 장이 하나도 없는 책은 거절한다. 깨진 글자가 색인이나 모델에 들어가지 않게 한다.
- `.xmind`는 zip이 아니면 `Content mismatch`로 거부한다. `ok`로 열리지 않는 지도(예전 형식, 암호, 읽을 수 없음, zip 안전 검사 거절)는 던지고, `parseFileToText`에서는 `ok: false`다.
- **첨부 형식 목록은 워드 편집기의 목록을 기준으로 삼는다.** 그 목록을 바꾸려면 여기(`attachable.ts`)와 워드 편집기가 실제로 읽는 형식을 함께 본다. 형식을 넓히는 것만 하고, 이미 되던 형식을 빼지 않는다. 이 목록은 "무엇을 첨부할 수 있나"만 정하고, 실제로 읽히는지는 `parseFileToText`의 형식 판정과 매직 바이트 검사가 정한다.

## 이 모듈의 방식

- 출력 모양은 테스트가 고정한다. docx는 제목을 `#`, 목록을 `-`, 표의 칸 구분을 `|`로 적고 각주와 미주를 끝에 붙인다. odt는 엔진의 모양을 따른다: 문단은 한 줄씩, 표는 행마다 한 줄에 칸을 탭으로 나누고, 한컴이 글상자에 넣은 표는 그 문단 자리에, 각주·미주는 끝에 번호와 함께 붙인다. pptx는 슬라이드마다 `## Slide N`, 발표자 노트는 `### Notes`이고, 메모(클래식 댓글)가 있으면 `### Comments` 블록(`- 작성자 (시각): 본문`)을 슬라이드 끝에 붙인다. 메모 파트가 없거나 깨졌으면 블록 없이 넘어간다(읽기 전체를 실패시키지 않는다). ppt(바이너리)는 본문과 발표자 노트만 읽는다. xlsx는 시트마다 `# 시트이름`, PDF는 페이지 사이에 빈 줄을 둔다.
- EPUB은 spine 순서로 장마다 엔진의 장 글을 잇는다. 제목은 `#`, 블록 사이와 장 사이에 빈 줄, 표 칸은 탭이다. 잘 짜이지 않은 장은 엔진이 HTML 파서로 읽는다.
- 지도는 엔진의 개요 글 그대로다(시트마다 `# 제목`, 토픽은 `- ` 목록, 라벨·링크·메모 표기 포함). 화면의 마크다운 개요 내보내기, 앱 안 MCP의 읽기와 같은 결과다.
- pptx의 슬라이드 순서는 파일 이름이 아니라 `presentation.xml`의 슬라이드 목록을 따른다. 목록에 없는 슬라이드 파트는 빼고, 목록 파일이 없을 때만 파일 번호순으로 읽는다.
- 글자가 없고 그림만 있는 슬라이드와 시트는 제목만 남기지 않고 그림 수와 함께 추출할 글자가 없다는 표시를 넣는다. 표시가 없으면 모델과 사용자가 내용이 전달되지 않은 슬라이드를 읽힌 것으로 여긴다.
- 텍스트 파일은 BOM을 보고 UTF-8과 UTF-16을 풀고, UTF-8로 읽히지 않으면 windows-1252로 읽는다. BOM이 UTF-32라고 알리는 파일만 거부한다.
- 설치본에서만 깨지는 문제를 막는 우회가 두 군데 있고, 개발 실행에서는 드러나지 않으므로 지우지 않는다. pdfjs는 `DOMMatrix`가 없으면 import 단계에서 죽어서 순수 JS 대체 구현을 먼저 설치하고, 워커 모듈을 글자 그대로의 경로로 import해 번들에 넣는다. `ppt-to-text`는 의존성을 번들러가 따라가지 못하는 require 뒤에 숨기므로 `globalThis.CFB`와 `cptable`을 먼저 채운 뒤 지연 import한다.
- 옛 PPT의 글자 디코딩은 코드페이지 1200(UTF-16LE)만 지원한다.
- 한글 문서는 문단을 한 줄로, 표를 행마다 칸을 `|`로 이어 적는다. 병합된 칸은 첫 자리에 적고 걸친 자리는 비우되, 줄 끝에 이어지는 빈 자리는 적지 않는다. 한 칸에 문단이 셋을 넘는 표(글을 배치하려고 쓴 표)는 행으로 적지 않고 칸의 문단을 줄로 푼다.
- 문단과 표를 따라가는 읽기가 닿지 못한 글자(글상자, 머리말, 표 안의 표 등)는 엔진의 평문 내보내기에서 찾아 제자리에 끼워 넣는다(`withMissingText`). 엔진 평문만 쓰지 않는 이유는 그쪽이 빈 누름틀에 안내 문구를 적고 표를 줄 구분 없이 풀기 때문이다.
- 엔진 WASM(`rhwp_bg.wasm`, 약 12MB)은 한글 문서를 처음 읽을 때 한 번 올린다. 위치는 `GENOFFICE_RHWP_WASM`, `node_modules`의 `@rhwp/core`, 설치본의 `Resources/wasm` 순으로 찾는다. `@rhwp/core`는 패치해 빌드한 `vendor/rhwp-core`를 가리킨다(결정 0050). 연 문서는 반드시 `free()`한다(WASM 메모리는 저절로 풀리지 않는다).
- 암호가 걸린 한글 문서는 읽지 않고 그렇다고 알린다. 암호를 받는 길은 없다.

## 테스트

- `npm run test -w @genoffice/file-parse`, 또는 패키지 폴더에서 `npx vitest run`. 타임아웃은 20초다.
- OOXML 픽스처는 `tests/helpers/fixtures.ts`가 JSZip으로 그때그때 만들어 임시 폴더에 쓴다. ODT 픽스처는 `tests/odt.test.ts`가 손으로 묶거나(글상자 안 표, 각주, 암호 manifest) docx 픽스처를 `docxToOdt`로 바꿔 만든다. 파일로 들어 있는 것은 옛 형식 두 개(`tests/fixtures/legacy-sample.doc`, `legacy-sample.ppt`)뿐이다. `npm run fixtures`는 필요 없다. 한글 문서는 `tests/hwp.test.ts`가 엔진으로 직접 만든다(문단을 모두 만든 뒤 표를 붙인다. 표가 놓인 문단을 나누면 엔진이 표를 옮긴다).
- 형식 처리를 바꾸면 정상 추출, 깨진 파일이 던지지 않고 `ok: false`가 되는 경우, 글자 원형 보존(앞자리 0, 런 사이 공백)을 덮는다. zip을 여는 경로를 건드리면 `tests/zip-bomb-gate.test.ts`도 함께 본다.
- 가리기를 바꾸면 형식마다, 표시 종류마다 "가린 글이 결과에 남지 않는다"와 "표시를 처리하지 못하면 원문이 아니라 실패가 나온다"를 덮는다(`tests/redaction.test.ts`). 마크다운은 "끝을 짐작하지 않는다"와 "표시가 될 수 있는 것만 실패한다"를 함께 본다. 지도 읽기는 `tests/xmind.test.ts`, EPUB 읽기와 DRM·손상·인코딩 거절은 `tests/epub.test.ts`.
- Windows에서 원본 코드 그대로도 실패하는 테스트는 없다.
