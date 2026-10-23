# packages/excalidraw-engine (`@genoffice/excalidraw-engine`)

그림 파일을 열고 저장하는 엔진이다. Obsidian Excalidraw 플러그인의 그림 노트(`.excalidraw.md`)와 Excalidraw 웹 앱의 `.excalidraw`(JSON)를 다룬다. 원본 프로그램에서 온 것이 아니라 이 프로젝트가 직접 만든 패키지다(결정 0060). 화면 코드와 Node 전용 기능을 쓰지 않는 순수 코드라서 편집기 화면(`apps/excalidraw`), 편집기 뒷단, 껍데기 앱, 마크다운 편집기가 같은 코드를 쓴다.

## 맡은 범위

- 열기(`document.ts`의 `openDrawing`): 결과는 넷이다. `ok`, `not-a-drawing`(앞머리 표시도 `Drawing` 블록도 없는 마크다운, Excalidraw 장면이 아닌 JSON), `unreadable`(UTF-8이 아님, 압축이 풀리지 않음, JSON이 아님, 요소에 `id`·`type`이 없음, 표시는 있는데 블록이 없음), `too-large`(`MAX_DRAWING_BYTES` 64MB 초과). `ok`일 때만 문서(`DrawingDocument`)가 생긴다.
- 노트 안의 자리 찾기(`note-layout.ts`): 앞머리의 `excalidraw-plugin` 키, `Text Elements`·`Embedded Files` 구역, `Drawing` 제목 아래의 `compressed-json`·`json` 블록. 지금 형식(`## …`, `# Excalidraw Data` 아래)과 예전 형식(`# Text Elements`, `# Drawing`)을 모두 읽는다. 플러그인이 데이터를 끝에 붙이므로 블록이 딸린 마지막 `Drawing` 제목을 쓴다.
- 두 글 구역(`note-sections.ts`): `Text Elements`(`<글> ^<요소 id>`) 읽기와 쓰기, `Embedded Files`(`<파일 id>: [[그림]]`) 읽기.
- 장면(`scene.ts`): 열린 값이 장면인지 검사, 편집기용 사본(노트의 글 목록을 JSON 위에 덮는다), 바뀐 저장이 쓸 장면.
- 새 파일(`create.ts`), 파일 이름으로 형식 정하기(`paths.ts`), `.md`가 그림 노트인지 보기(`looksLikeDrawingNote`).

## 맡지 않는 것 (경계)

- 그림을 그리는 일, 되돌리기, 화면의 바뀜 판정은 `apps/excalidraw`가 한다. 이 패키지는 그리기 라이브러리를 모른다.
- 파일을 디스크에 쓰는 일(임시 파일에 쓴 뒤 바꿔치기)과 노트가 가리키는 그림을 보관함에서 찾는 일은 편집기 뒷단이 한다. 여기는 저장할 바이트만 만든다.

## 항상 지켜야 하는 것

- **바뀐 것이 없는 저장은 원본과 바이트까지 같다.** `save(null)`은 연 때의 바이트를 돌려준다.
- **노트에서 다시 쓰는 곳은 두 곳뿐이다.** `Text Elements` 구역의 본문과 `Drawing` 블록의 내용이다. 앞머리, 사용자가 쓴 본문, `Embedded Files`, `Element Links`, 줄 끝(CRLF), BOM, 블록의 방식(`compressed-json`·`json`)은 그대로다. 압축 블록이 원래 줄 나눔이었으면 256자씩 나눈다.
- **모르는 것을 지우지 않는다.** 장면 최상위의 모르는 키, 요소의 모르는 키는 저장 때 그대로 나간다. 그리기 라이브러리가 돌려주지 않은 요소 키는 같은 `id`의 원래 요소에서 되살린다(`overStored`). 형(`types.ts`)도 닫힌 모양으로 만들지 않는다.
- **노트가 가리키기만 하는 그림은 파일에 넣지 않는다.** `Embedded Files`에 있는 파일 id의 그림은 편집기가 넘겨도 `files`에 쓰지 않는다. 새 그림은 살아 있는 요소가 쓸 때만 쓴다.
- **`ok`로 열리지 않은 파일에서는 문서가 생기지 않는다.** `DrawingDocument`의 생성자는 봉인 값을 요구하고, 패키지 밖으로는 형만 내보낸다.
- **`src/`에서 Node 내장 모듈, `Buffer`, `require`, DOM을 쓰지 않는다.** `tests/browser-safety.test.ts`가 지킨다. 해독은 엄격하다(`fatal: true`, BOM 유지).

## 테스트

- 실행: `npm run test -w @genoffice/excalidraw-engine`, `npm run typecheck -w @genoffice/excalidraw-engine`.
- 시험 파일은 `tests/helpers.ts`가 플러그인의 모양대로 그때그때 만든다. 다른 사람이 그린 그림 파일은 저장소에 넣지 않는다.
- 바꾸면 반드시 테스트하는 것(`tests/open-save.test.ts`): 바뀐 것 없는 저장의 바이트 일치, 바뀐 저장에서 두 구역 밖의 바이트가 그대로인 것, 노트의 글이 JSON을 이기는 것, 모르는 키와 `rawText`의 되살림, 가리키기만 하는 그림을 넣지 않는 것, CRLF·BOM·블록 방식 유지, 열기의 네 결과.
- 만든 파일이 Obsidian에서 열리는지는 자동 테스트로 확인하지 못한다. 실제 Obsidian(Excalidraw 플러그인)에 올려 확인한다.
