# packages/epub-engine (`@genoffice/epub-engine`)

EPUB 책 엔진이다(결정 0066). 원본 프로그램에서 온 것이 아니라 이 프로젝트가 만든 패키지다. Electron에 묶이지 않고 화면과 Node 양쪽에서 돈다. 편집기(`apps/epub`의 뒷단과 화면), `packages/file-parse`, `packages/cli`가 같은 코드를 쓴다.

## 맡은 범위

- 열기(`open.ts`, `package.ts`, `types.ts`): `openEpub`이 정해진 순서로 검사하고 처음 걸린 것을 이유로 거절한다. ① zip 관문(`packages/zip-gate`, 한도 `EPUB_ZIP_LIMITS` = `DEFAULT_ZIP_LIMITS`) → `damaged`·`too-large`, ② `META-INF/container.xml`이 OPF를 가리킴 → `not-epub`, ③ `rights.xml`이 없고 `encryption.xml`에 글꼴 감추기 두 방식만 → `drm`, ④ OPF가 XML이고 manifest·spine이 있음 → `not-epub`. `mimetype` 항목의 순서·압축은 보지 않는다. 열린 책(`EpubBook`)은 책 정보, manifest, spine, 배치(`reflowable`/`pre-paginated`, 항목별 덮어쓰기 포함), 목차, 감춘 글꼴 목록을 담고, 항목은 부를 때만 읽는다.
- 경로(`paths.ts`): 링크·manifest 경로를 그 항목 기준으로 풀고 `..`는 zip 루트에서 멈춘다. 스킴이 붙거나 `//`로 시작하는 대상은 zip 항목이 아니다.
- 글꼴 감추기(`fonts.ts`, `sha1.ts`): IDPF·Adobe 방식으로 풀고 다시 감춘다. 둘 다 같은 XOR라 풀기와 감추기가 같은 연산이다.
- 글자 인코딩(`encoding.ts`): UTF-8, BOM이 있는 UTF-16. BOM을 글 안에 남겨 오프셋이 항목 전체를 덮고, 같은 바이트로 다시 쓸 수 있다. 잘못된 바이트는 `valid: false`로 알린다.
- 목차(`toc.ts`): EPUB 3 `nav`의 `toc`, 없으면 EPUB 2 NCX, 둘 다 없으면 spine 항목마다 첫 제목(없으면 파일 이름). 루비의 읽기는 제목에서 뺀다.
- 위치 있는 XML(`xml-positions.ts`): `saxes`로 장을 읽어 요소·글의 원본 오프셋을 둔다. 잘 짜이지 않은 장은 `parse5`로 읽는다. 책의 다른 XML 파일은 `xml.ts`의 작은 나무로 읽는다.
- 블록 지도(`blocks.ts`): 인라인 내용만 가진 `p`, `h1`~`h6`, `li`, 글만 든 `blockquote`·`div`(흐르는 글 블록)와 `td`, `th`, `figcaption`, `dt`, `dd`(구조 블록). 블록마다 내용 범위와 장 안에서만 유일한 id가 있다. 깨진 장은 `broken: true`다.
- 블록 글 표기(`notation.ts`, `marks.ts`): 굵게 `<b>`, 기울임 `<i>`, 줄바꿈 `<br/>`, 그 밖의 인라인 요소는 `<xN>…</xN>`·`<xN/>`. 되돌릴 때 자리 표시는 원래 요소를 글자 그대로 돌려놓는다. `checkNotation`이 되받은 글의 자리 표시를 검사한다.
- 범위 바꾸기와 편집(`ranges.ts`, `edits.ts`): 모든 편집은 장 원본 글의 범위 바꾸기 목록으로 바뀐다. 글 바꾸기, 나누기, 합치기, 뒤에 넣기, 지우기, 굵게·기울임. 합치거나 지운 블록의 `id`는 이웃 블록 안 빈 `span`으로 남긴다.
- 저장(`save.ts`): `saveEpub`. 아래 "항상 지켜야 하는 것"의 원본 보존 규칙대로 zip을 새로 쓴다. 바뀐 것이 없으면 그렇다고만 답한다. 원본 바이트 대신 `openEpub`이 연 책을 받으면 그 zip을 그대로 써서 다시 열거나 관문을 다시 지나지 않는다. 결과 바이트는 어느 쪽이든 같다. `openEpub`의 `takeOwnership`은 넘긴 버퍼를 복사하지 않고 그대로 읽는다(호출자는 그 버퍼를 바꾸지 않는다). 8GB PC에서 책을 한 벌만 두려는 것이다.
- 저장 뒤 옮기기(`translate/migrate.ts`): `epubMigrationInfo`가 저장된 책의 번역 단위 열쇠를 `keepBlockKeys`로 넘긴다. 장 경로와 글이 그대로인 블록의 번역만 옮긴다.
- 글 뽑기(`text.ts`): `extractChapterText`. 읽는 순서대로, 제목은 `#`, 블록 사이 빈 줄, 표 칸은 탭. 깨진 장은 HTML 파서로 읽는다.
- 세로쓰기 판정(`writing-mode.ts`): OPF의 `primary-writing-mode`나 CSS의 `writing-mode: vertical-*`.
- 책 번역(`translate/`):
  - `units.ts`: 고른 장의 블록, 책 제목, 목차 항목 글을 번역 단위로 만든다. 루비의 읽기는 빼고, 글자가 없는 단위는 빼고, 깨진 장·고정 배치 장은 통째로 빼서 알린다.
  - `keys.ts`: 보관 열쇠. 문서 열쇠는 파일 바이트의 SHA-256, "페이지 지문" 자리는 장 경로의 SHA-256, 제목·목차는 정해 둔 지문 하나. PDF 열쇠와 같은 모양이라 같은 보관소와 작업 엔진을 쓴다.
  - `prompt.ts`: EPUB 지시문. 메시지 모양과 답 읽기는 PDF 번역의 것을 쓰고, 지시문만 블록 글 표기를 설명한다.
  - `call.ts`: 묶기(PDF의 `TRANSLATION_BATCH_TOKENS`)와 모델 호출. 자리 표시가 맞지 않거나 비어 돌아온 단위는 `EPUB_TRANSLATION_MAX_RESENDS`(2)번까지 다시 보내고, 그래도 안 되면 이유와 함께 실패로 남긴다.
  - `job.ts`: `pdf-structure`의 작업 엔진 위의 책 번역 작업(예상, 계획, 시작).
  - `language.ts`: 기본 목표 언어(화면 언어, 책이 그 언어면 영어). 책 언어는 첫 `dc:language`, 없으면 `pdf-structure`의 글자 추정.
  - `migrate.ts`: 앱 안 저장 뒤 보관된 번역을 새 해시로 옮길 입력(`epubMigrationInfo`).
  - `output.ts`, `output-markup.ts`: `buildTranslatedEpub`. 저장된 책 바이트와 보관된 결과로 번역본·대역본을 만든다.

## 맡지 않는 것 (경계)

- 디스크에 쓰는 일(원자적 쓰기, 충돌 검사)은 호출자가 한다. 여기는 바이트만 만든다.
- 화면에 그리는 일, 화면 요소와 표기의 짝, 되돌리기 기록, 편집 잠금은 `apps/epub`이 한다.
- 번역 작업 엔진(동시 요청, 다시 보내기, 멈춤, 이어하기, 문서마다 작업 하나)과 결과 보관소는 `packages/pdf-structure`가 한다. 여기는 EPUB의 단위·열쇠·지시문·호출만 얹는다.
- 첨부·색인에서 책을 글로 읽는 일은 `packages/file-parse`의 `epubToText`가 이 패키지를 불러 한다. 터미널 명령어는 `packages/cli`다.
- 가리기는 없다.

## 항상 지켜야 하는 것

- **원본 보존.** 아무것도 바꾸지 않은 저장은 쓸 것이 없다고 답한다. 바꾼 저장에서 바뀌지 않은 항목은 원본의 압축 바이트·날짜·압축 방식 그대로이고, 바뀐 장은 원본 글에 범위 바꾸기만 적용해 원래 인코딩과 BOM으로 다시 쓴다. 예외는 둘이다. `mimetype`을 맨 앞에 압축 없이 두고(없으면 더한다), EPUB 3 OPF의 `dcterms:modified`를 저장 시각(UTC, 초 단위, `Z`)으로 바꾸거나 그 `meta` 한 줄을 더한다. EPUB 2 OPF는 건드리지 않는다. 나무에서 다시 써 내는 길을 만들지 않는다.
- **저장 전에 바뀐 장을 다시 읽는다.** 잘 짜인 XML이 아니면 저장하지 않고 그 장을 알린다. 깨진 장과 인코딩이 맞지 않는 장은 편집하지 않고 원본 그대로 둔다.
- **zip 관문을 거치지 않은 바이트는 들이지 않는다.** 관문 다음에야 압축을 푼다. 장은 부를 때만 읽는다(목차를 spine으로 만들 때만 예외).
- **zip 밖을 가리키지 않는다.** 경로는 `paths.ts`로만 풀고, 스킴이 붙은 대상은 항목이 아니다.
- **자리 표시는 원래 요소를 그대로 돌려놓는다.** 속성이 붙은 `strong`·`b`·`em`·`i`·`br`도 자리 표시로 둔다. 되받은 글은 자리 표시의 종류·개수·짝이 맞아야 받아들인다. 새로 만드는 표시는 `strong`·`em`·`br`뿐이다.
- **흐르는 글 블록만 나누고 합치고 넣고 지운다.** 구조 블록은 안의 글만 바꾼다. `id`를 남길 이웃이 없는 지우기는 거절한다.
- **번역 결과는 새 책이다.** 새 `urn:uuid` 식별자(원본은 `dc:source`), 감춘 글꼴은 새 키로 다시 감춘다. 원본 바이트는 바꾸지 않는다. 대역본의 구조 블록과 `li`는 복사본을 두지 않고 같은 요소 안에 `<br/>`과 `ieum-translation` 표시의 `span`으로 넣는다.
- **보관 열쇠(`keys.ts`)와 `EPUB_METADATA_FINGERPRINT_SOURCE`를 바꾸지 않는다.** 바꾸면 보관된 책 번역을 모두 잃는다. `epubTranslationKeys`는 `pdf-structure`의 열쇠 함수와 같은 값을 내야 한다(시험이 지킨다).
- **PDF 번역을 바꾸지 않는다.** `pdf-structure`는 공개된 것만 쓰고, PDF 지시문 글자를 건드리지 않는다.
- **`src/`에서 Node 내장 모듈, `Buffer`, `require`, `process`를 쓰지 않는다.** 화면에도 묶여 들어간다. SHA-1을 직접 둔 것도 그 때문이다. `tests/browser-safety.test.ts`가 지킨다.
- 새 바깥 의존성을 들이지 않는다(`jszip`, `saxes`, `parse5`, 작업 공간의 `zip-gate`·`pdf-structure`).

## 이 모듈의 방식

- 장 하나 = 원본 글 + 블록 지도. 편집은 지도를 바꾸지 않고 범위 바꾸기를 돌려주며, 호출자가 바뀐 글로 지도를 다시 만든다(`remapChapter`). 오프셋은 장 글의 UTF-16 오프셋이고 범위는 반열림 `[start, end)`다.
- 굵게·기울임·줄바꿈은 개수가 그대로면 원래 표시를 글자 그대로 되쓴다. 개수가 바뀌면 그 블록의 표시를 `strong`·`em`·`br`로 다시 쓴다(`notation.ts`).
- 진입점은 둘이다. `@genoffice/epub-engine/core`(`src/core.ts`)는 열기·블록 지도·표기·편집·글 뽑기·저장만 내보내고 번역을 싣지 않는다. 책을 읽기만 하는 쪽(`file-parse`)은 이것을 쓴다. 패키지 진입점(`.`)은 거기에 번역(`./translate`)을 더한 것이고, 그 길이 `pdf-structure` 진입점을 거쳐 `pdf2docx`와 Node 전용 모듈에 닿는다. 루트를 가져오면 그 쪽의 형 검사가 `pdf2docx` 소스까지 읽어 자기 `bidi-js` 형 선언과 부딪힐 수 있다(워드 편집기에서 실제로 났다). 화면은 필요한 모듈을 상대 경로로 가져온다(`apps/epub`의 `edit/engine.ts`, `translate/engine.ts`).
- `translate/index.ts`의 `/// <reference>`는 `pdf-structure` 진입점이 끌어오는 `pdf2docx`의 `bidi-js` 형 선언을 이 패키지를 컴파일하는 쪽에 알리려는 것이다.

## 테스트

- 실행: `npm run test -w @genoffice/epub-engine`, `npm run typecheck -w @genoffice/epub-engine`. 시험 책은 `tests/helpers.ts`, `chapter-helpers.ts`, `save-helpers.ts`, `translate-helpers.ts`가 그때그때 만든다. 다른 프로그램이 만든 책은 저장소에 없다. 이 앱의 PDF → EPUB 결과는 `tests/pdf-structure-book.test.ts`가 `pdf-structure`로 만들어 쓴다.
- 바꾸면 반드시 테스트하는 것: 열기의 거절 네 가지와 고정 배치·깨진 장(`open.test.ts`), zip 밖 경로(`paths.test.ts`), 글꼴 감추기(`fonts.test.ts`), 인코딩(`encoding.test.ts`), 위치(`xml-positions.test.ts`), 블록 지도(`blocks.test.ts`), 표기 왕복과 자리 표시 거절·루비 빼기(`notation.test.ts`), 편집과 `id` 남기기·인라인 요소 보존·엔티티·CDATA(`edits.test.ts`, `ranges.test.ts`), 저장하지 않음·범위만 다름·`mimetype`·`dcterms:modified`·거절(`save.test.ts`), 글 뽑기(`text.test.ts`), 세로쓰기(`writing-mode.test.ts`), 번역 단위·호출·작업(`translate-units.test.ts`, `translate-call.test.ts`, `translate-job.test.ts`), 번역본·대역본(`translate-output*.test.ts`), 화면과 Node 양쪽에서 도는지(`browser-safety.test.ts`), 공개 진입점(`index.test.ts`).
- 모델 호출은 모두 가짜다. 만든 책이 `epubcheck`를 통과하는지와 다른 뷰어에서 열리는지는 자동 테스트로 확인하지 못한다. 사람이 확인한다(`docs/tracking/status.md`).
