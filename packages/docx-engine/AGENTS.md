# docx-engine

## 맡은 범위

docx 한 파일의 읽기와 쓰기 전부를 맡는다.

- `parseDocx`: 본문 파트의 최상위 요소를 블록 트리로 바꾸고, 블록마다 원본 XML 조각과 순번(`originalXml`, `docxIndex`)을 붙인다.
- `generate.ts`: 편집된 블록을 OOXML 조각으로 만든다.
- `saveDocx`: 바뀐 블록만 원본 XML에 끼워 넣고 zip을 다시 묶는다.
- 그 밖에 빈 문서 템플릿, 구역·머리글·각주·메모·워터마크·차트·스타일·번호 매기기 수정, 보호 암호 해시, 수식 변환(`./math`), EMF/WMF 변환(`./metafile`), 큰 문서의 그림을 디스크에 남겨 두는 지연 미디어(`./lazy-media`, `./zip-splice`)를 가진다.

## 맡지 않는 것 (경계)

- 편집기(Tiptap), 쪽 나눔과 화면 그리기, 어느 블록이 고쳐졌는지의 추적, 원본 파일 보관, IPC는 `apps/docs`다. 엔진은 "어느 블록이 원본 그대로이고 어느 블록이 새로 만들어졌는가"(`SaveBlock[]`)를 받아 바이트를 돌려줄 뿐이다.
- AI 도구 정의와 실행은 `apps/docs`와 `packages/agent-core`다. 엔진은 AI를 모른다.
- HTML→docx는 `packages/html2docx`, PDF→docx는 `packages/pdf2docx`다. 후자는 이 엔진의 `buildBlankDocx` → `parseDocx` → `saveDocx`를 호출한다. `w:altChunk` 안의 HTML을 펼칠 변환기는 엔진이 갖지 않고 호스트가 `setAltChunkHtmlConverter`로 넣어 준다.
- 압축 폭탄 판정의 구현은 `packages/zip-gate`에 있고, 여기서는 다시 내보내기만 한다.
- 첨부용 평문 추출은 `packages/file-parse`가 `parseDocx` 결과를 납작하게 만들어 쓴다.

## 항상 지켜야 하는 것

- 바뀐 것이 없으면 `saveDocx`는 `originalBytes`를 그대로 돌려준다. 다시 압축하지 않는다. 이 판정은 `isUnchanged`에 옵션을 하나씩 나열한 조건이므로, `SaveOptions`에 필드를 추가하면 이 조건에도 추가한다. 빠뜨리면 그 옵션만 바꾼 저장이 원본 바이트를 돌려주며 변경이 조용히 사라진다.
- 건드리지 않은 블록은 원본 본문 XML의 부분 문자열을 그대로 복사한다. XML 전체를 파싱했다가 다시 직렬화하지 않는다. 그렇게 하면 속성 순서, 자기 닫힘 표기, 엔티티 표기가 바뀐다. 위치는 `scanBody`가 문자 범위로 잡는다.
- 본문 밖의 zip 항목은 내용을 바꾸지 않고 옮긴다. 다만 변경이 있는 저장은 zip을 새로 만들어 DEFLATE 6단계로 묶으므로 파일 전체 바이트는 달라진다. 충실도는 항목별 내용으로 비교한다.
- 새로 만든 블록은 문서에 이미 있는 스타일만 참조한다(`headingStyleIds`, `listParagraphStyleId`). 없는 스타일 id를 지어내지 않는다.
- 엔진이 손대지 않은 바이트를 일부러 바꾸는 경우는 다음 네 가지뿐이고, 늘리지 않는다.
  - ISO Strict 이름공간과 비표준 접두사를 불러올 때 과도기(transitional) 표기로 정규화한다. 저장 결과도 과도기형이 된다.
  - 최종 본문에서 닿지 않게 된 자원을 정리한다(`cleanupDocxOwnedResources`).
  - 필드의 begin/separate/end 짝을 맞춘다(`balanceFieldChars`). 짝이 어긋난 필드는 Word가 손상 파일로 본다.
  - 개인 정보 제거 플래그가 켜진 문서에서 작성자·조직 메타데이터를 지운다. 이 경우에는 편집이 없어도 원본 바이트를 그대로 돌려주지 않는다.
- 자원 정리는 좁게 한다. 문서 루트에서는 그림·차트·다이어그램·하이퍼링크·OLE 관계만 끊고, 머리글처럼 살아남은 다른 파트가 가리키는 대상은 남기며, 모르는 종류나 사용자 정의 파트는 지우지 않는다.
- 새 id는 기존 것과 겹치지 않게 낸다. 관계 id는 따옴표 종류와 `=` 주변 공백에 상관없이 읽은 최대값 다음부터, `wp:docPr` id는 9000번대에서 문서에 이미 있는 값을 피해, 책갈피 id는 문서 최대값 위에서 낸다. 이미 있는 id를 "없다"고 읽으면 중복 id가 생기고 Word가 복구를 묻는다.
- 문서 안에 남는 이름은 바꾸지 않는다: 새 그림 파트 `word/media/aidocs<N>.<확장자>`, 잉크 그림의 `wp:docPr` 이름 접두 `aidocs-ink`와 파트 `word/media/aidocsink<N>.png`. 다시 열었을 때 자기가 만든 것을 알아보는 열쇠이고, 원본 프로그램과 주고받는 문서에 이미 들어 있다.
- 지연 미디어의 URL 스킴 `genoffice-docx-media`와 자리표시자 머리말 `GENOFFICE-LAZY-MEDIA`도 바꾸지 않는다. 자리표시자가 든 zip은 렌더러에 건네는 사본일 뿐이다. 사용자 파일로 쓰기 전에는 반드시 `materializeDocx`로 원본 바이트를 되돌린다.
- 열 때 거부하는 한도는 파트 10,000개, 파트당 512 MiB, 합계 1.5 GiB(`DOCX_ZIP_LIMITS`)이고 zip64와 암호화 항목도 거부한다. `loadDocxZip`은 파트를 실제로 풀어 보는 검사를 JSZip 로드보다 먼저 돌린다. 이 순서를 바꾸지 않는다.
- 그 밖의 방어 상한: 표 중첩 8단계 초과는 1×1 표로 납작하게 만든다. `altChunk` 64 MiB, gzip 메타파일 해제 64 MiB, TIFF 1억 5천만 픽셀·한 변 16,384, 차트 캐시 점 1,048,576개·계열 256개, 지연 미디어 경로 512자(`..` 마디 거부). 보호 암호의 `spinCount`는 1,000,000으로 자른다.
- 깨진 XML이 문서 전체를 실패시키면 안 된다. 파싱하지 못한 문단은 원본 바이트를 지닌 `passthrough` 블록이 되고, 읽히지 않는 `styles.xml`은 빈 스타일 표로 내려간다.
- Electron과 UI에 의존하지 않는다. 기본 진입점은 Docs 렌더러 번들에 들어가므로 `node:*`를 import하지 않는다. Node 전용 코드는 `./zip-splice` 하위 경로에만 두고, `zip-load.ts`가 `zip-splice`를 import하게 만들지 않는다(테스트가 막고 있다).
- `src/vendor/`는 가져온 원본과 바이트가 같아야 한다. 포매터 대상에서도 빠져 있다.
- 엔진 동작은 원본(GenOffice)의 수정을 받아올 때 바뀐다. 예외는 사람이 정해 아래 "원본과 다른 점"에 적은 수정뿐이다(결정 0092). 파일 이동, 재포맷, 이름 변경을 하지 않고 `@genoffice/*` 이름을 그대로 둔다.

## 이 모듈의 방식

- 여는 길은 `loadDocxZip` 하나다. 여기서 Info-ZIP 유니코드 경로 필드(0x7075)를 무력화하고, 압축 폭탄 검사를 하고, Strict 정규화를 한다. Word는 헤더의 파일 이름으로 파트를 찾는데 JSZip은 저 필드를 따르므로, 충돌하는 필드가 본문 파트를 다른 항목으로 가릴 수 있다. 정규화를 이 한 곳에서만 하는 이유는 파싱의 위치값과 저장의 끼워 넣기가 같은 텍스트를 봐야 하기 때문이다.
- 본문 파트가 `word/document.xml`이 아닌 문서가 있다. 경로를 고정하지 말고 `resolveMainDocumentPath`로 찾는다.
- `passthrough`는 엔진이 이해하지 못했거나 편집을 지원하지 않는 요소다. 표시용 미리보기만 붙이고 저장할 때 원본 조각을 그대로 내보낸다. 내용은 못 고쳐도 통째로 옮길 수는 있다.
- `SaveBlock`의 갈래는 `original`(원본 복사), `generated`(모델에서 생성), `xml`(편집기가 만든 완결 조각), `image`/`images`(새 그림), `chart`(새 차트)다. 숨은 뒤쪽 요소(마지막 `w:sectPr`)는 엔진이 알아서 붙인다.
- 본문의 주석·CDATA·처리 명령은 "불투명 영역"으로 따로 보존한다. 단, `w:t` 같은 텍스트 요소 안의 CDATA는 이미 런 텍스트로 읽혔으므로 넣지 않는다. 넣으면 저장할 때 글자가 두 번 나온다.
- 메모와 각주처럼 평문으로 편집하는 항목은 `patchParagraphTexts`가 바뀐 문단의 `w:t`만 고친다. 문단 수가 달라지거나 바뀐 문단에 기댈 `w:t`가 없으면 `null`을 돌려주고, 호출부가 항목 전체를 다시 만든다.
- 같은 바이트의 새 그림은 미디어 파트 하나를 공유한다. 그래서 그림 순번과 `docPr` 순번을 따로 센다.
- "전체 목록" 옵션(`comments`, `footnotes`, `endnotes`, `sources`, `inks`)은 값을 주면 해당 파트를 목록에서 다시 만들고, `undefined`면 바이트를 유지한다. `inks: []`는 이 앱이 넣은 잉크를 전부 지운다는 뜻이다.
- `settings.xml`의 자식은 스키마 순서(`SETTINGS_CHILD_ORDER`)에 맞는 자리에 끼운다. 순서가 틀리면 Word가 복구를 제안한다.

## 원본과 다른 점 (결정 0092)

원본의 개선을 받아온 뒤 아래 시험이 모두 통과해야 한다. 충돌을 풀 때 이 동작이 사라지지 않게 한다. 같은 수정을 원본 genspark-ai/genoffice#2331에 보냈다. 원본이 받아들이면 그 항목을 지운다.

- **머리글·꼬리말의 `SECTIONPAGES`.** 필드는 `SECTION_PAGES_MARK`(U+E002)가 되고, 고친 머리글·꼬리말을 저장하면 `SECTIONPAGES` 필드로 돌아간다. `PAGE`·`NUMPAGES`보다 먼저 판정한다. 단어 경계 검사로는 `SECTIONPAGES` 안의 `PAGES`를 알아보지 못한다. `types.ts`, `parse.ts`의 `hfContentFromXml`, `patch.ts`의 `headerFooterPartXml`. 시험 `tests/hf-section-pages.test.ts`.
- **직접 만든 스타일의 목차 줄.** `PAGEREF`가 있는 문단은 스타일 이름이 `toc N`이 아니어도 목차 줄로 읽는다. 조건은 스타일 사슬을 거친 탭 정의에 오른쪽 탭이 있고, 문단 안에 런 단위 탭이 있는 것이다. 채움 문자도 그 탭에서 읽는다. `parse-fields.ts`의 `unstyledTocEntry`, `tocLeaderOf`. 시험 `tests/field-display.test.ts`의 "an entry whose right tab stop comes only from a custom style is still a toc line (#2331)", "a PAGEREF cross-reference without a run tab stays plain text under a right-tab style".
- **쪽 기준 도형의 감싸기.** 쪽·여백 기준이면서 감싸기(wrapNone 아님)가 있는 도형 가운데 본문 맨 위를 덮는 wrapTopAndBottom 띠, 칸 폭을 거의 다 덮는 도형, 본문 영역 밖에 통째로 있는 도형은 흐름에서 빼서 쪽 위치에 그린다. 칸 안의 좁은 상자는 예전처럼 흐름에 둔다. 쪽 기준 세로 정렬(`wp:align`, 백분율 위치)은 흐름 밖에 그려지는 상자에 적용한다. `parse.ts`의 `applyAnchor`와 첫 쪽 고정 경로, `parse-drawing-geometry.ts`의 `resolveAnchorPageYEmu`. 시험 `tests/page-anchored-wrap.test.ts` 전체, `tests/wrap-topbottom-band.test.ts`의 "floats a page-relative topAndBottom box and bands it from the body top", "keeps a narrow page-relative topAndBottom box low on the page in the flow".

## 테스트

- 패키지 폴더에서 `npx vitest run`, 또는 저장소 루트에서 `npm run test -w @genoffice/docx-engine`. 테스트 타임아웃은 20초다.
- 단위 테스트는 `tests/helpers/build-docx.ts`로 docx를 메모리에서 만들고, `tests/fixtures/`에는 메타파일 견본만 있다. 엔진 테스트를 돌리는 데 `npm run fixtures`는 필요 없다.
- `npm run fixtures`는 `fixtures/generated/*.docx`를 다시 만든다. 이 파일들은 저장소에 들어 있고 CI가 생성 결과와 커밋된 파일의 차이를 검사한다. 생성기(`scripts/generate-fixtures.ts`, `tests/helpers/build-docx.ts`)를 바꿨다면 다시 만들어 함께 커밋한다.
- 열기·저장 경로를 건드리면 왕복 테스트로 증명한다. 편집 없음 → 결과가 원본 파일과 바이트 동일, 한 블록 편집 → 다른 zip 항목과 다른 `w:p`가 바이트 동일(`tests/roundtrip.test.ts`의 형태).
- 한도와 방어 코드를 바꾸면 거부 사례와 정상 문서가 통과하는 사례를 둘 다 넣는다.
- Windows에서 원본 코드 그대로도 실패하는 테스트는 없다.
