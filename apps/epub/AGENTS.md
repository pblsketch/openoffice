# apps/epub (`@genoffice/epub`)

전자책 편집기다. EPUB 책(`.epub`)을 탭에서 열어 읽고, 보이는 책 화면에서 본문 글을 고치고, AI 창으로 읽고 고치고, 책을 번역해 새 EPUB으로 낸다(결정 0066). 파일을 다루는 일은 `packages/epub-engine`이 하고, 이 모듈은 책 한 벌을 쥔 뒷단과 화면을 잇는다. 사람이 읽는 계획은 `docs/plans/epub-editor.md`에 있다.

## 맡은 범위

- 메인 프로세스(`src/main/`). 셸이 상대 경로로 가져와 셸 번들 안에서 돈다.
  - `epub-main.ts`: 보기 만들기(`createEpubView`), 열기와 거절, 저장·다른 이름으로 저장·닫기 확인, 이름 바뀜 따라가기, 메뉴 명령 전달, 링크 열기, `epub-asset://` 등록, 번역 결과 경로 고르기와 결과 책 쓰기, 단독 실행(`startEpubStandalone`). 셸에 내보내는 함수는 `configureEpubRuntime`, `requestEpubSave`, `requestEpubClose`, `epubSaveToPath`, `epubReadText`, `sendEpubMenuCommand`, `epubFileRenamed`, `setEpubFileSavedHook`, `epubIsDirty`, `epubIsTranslationLocked` 등이다.
  - `book-session.ts`: 보기 하나의 책. 바이트 한 벌, 엔진이 연 책, 읽은 장마다 저장된 글·지금 글·그 사이의 범위 바꾸기. 편집 거절(번역 잠금, 고정 배치, 깨진 장, 지금 판이 아닌 장)도 여기서 한다. 화면이 보낸 범위 바꾸기(`epub:replace-ranges`)는 모든 범위가 블록 안쪽이거나, 결과 글이 그 장이 이번 세션에 가졌던 글(되돌리기·다시 하기)일 때만 받는다. 바이트는 엔진에 넘겨(`takeOwnership`) 한 벌만 두고, 저장은 이미 연 책으로 한다(다시 열지 않는다). 읽던 자리 파일은 한 번만 읽고 바꾸기를 차례로 쓴다(`reading-state.ts`). Electron 없이 돈다.
  - `asset-protocol.ts`: `epub-asset://<보기 토큰>/<항목 경로>`. 그 보기의 책 zip 항목만, GET·HEAD만, 정해 둔 내용 형식과 `nosniff`, 스크립트와 바깥 연결을 막는 CSP로 내준다. 감춘 글꼴은 풀어서 내준다. 스크립트 항목은 내주지 않는다.
  - `save-pipeline.ts`: 저장과 보관된 번역 옮기기(`ResultStore.migrateDocument` → 셸의 `migrateJobRecords`). `atomic-write.ts`: 원자적 쓰기.
  - `store-handlers.ts`: `epub:store-*` 창구. 번역 작업이 읽고 쓰는 것(번역, `translate` 작업 기록)만, 그 보기가 연(또는 저장한) 책의 해시로만 받는다.
  - `result-paths.ts`: 결과 책을 쓸 수 있는 경로(원본이 아니고, 열린 탭이 아니고, `.epub`).
  - `reading-state.ts`: 읽던 자리와 보기 설정(`<userData>/epub-reading.json`, 최근 1,000권).
  - `mcp-queries.ts`: 앱 안 MCP의 읽기(spine 순서의 글, 제목은 `#`). `ai-attachments.ts`: AI 창 첨부(`epub:files-*`). `i18n-main.ts`: 저장 창과 닫기 확인 문구.
- preload(`src/preload/index.ts`): `window.epubApi`와 공용 AI·구독·첨부·스킬 다리.
- IPC 계약 `src/shared/ipc.ts`(`epub:` 창구 전부와 주고받는 자료 모양), 자원 주소와 결과 이름 `src/shared/asset-url.ts`, 바깥 링크 규칙 `src/shared/links.ts`.
- 렌더러(`src/renderer/`)
  - `App.tsx`: 리본(파일·홈·보기), 목차·찾기 창, 장 틀, 상태 줄, 단축키, 자동 저장(30초마다와 창이 초점을 잃을 때), 메뉴 명령.
  - `reader/`: 그리는 사본(`chapter-html.ts`: 블록에 `data-epub-block`, 스크립트·`on…`·`javascript:`·틀·`<base>` 지우기, CSP와 `epub-asset:` 기준 주소), 장 틀 안의 일(`frame-dom.ts`), 장 넘기기(`navigation.ts`), 책 안 링크(`links.ts`), 책 안에서 찾기(`book-search.ts`, 500곳까지), 보기 설정(`view-prefs.ts`).
  - `components/`: 리본, 장 틀(`ChapterFrame.tsx`: `sandbox="allow-same-origin"`, `allow-scripts` 없음), 목차·찾기 창, 편집 도구, 그림.
  - `edit/`: 편집 컨트롤러(`controller.ts`), 블록 표기와 화면 요소의 짝(`inline-roles.ts`), 블록 안 찾아 바꾸기(`block-text.ts`), 단축키(`shortcuts.ts`), 화면이 쓰는 엔진 모듈(`engine.ts`).
  - `ai/`: AI 창(`AiPanel.tsx`, `AiDock.tsx`), 책 스킬과 지시문(`epub-skill.ts`), 다섯 도구가 하는 일(`book-tools.ts`), 첨부·검색 스킬, 전송과 연결 상태.
  - `translate/`: 책 번역 창과 확인(`BookTranslateDialog.tsx`), 작업·진행·멈춤·이어하기·결과 쓰기(`BookTranslation.tsx`, `job-session.ts`), 보고(`BookTranslateReport.tsx`), 리본 단추, 제공자 고정(`route.ts`), 모델 호출(`model-call.ts`), 보관소 창구(`ipc-store.ts`), 화면에서 쓰는 번역 엔진 부분(`engine.ts`, `pdf-structure-browser.ts`), 순수 함수(`translate-model.ts`).
  - `i18n/`: 21개 언어 조각(`app/`, `edit/`, `ai/`, `translate/`의 `<언어>.ts`, `zh.ts`가 키 집합을 정한다)과 그것을 모으는 `strings-*.ts`.

## 맡지 않는 것 (경계)

- EPUB 해석, 블록 지도, 블록 글 표기, 범위 바꾸기, 저장할 바이트, 번역 단위·열쇠·지시문·결과 책은 `packages/epub-engine`의 범위다. 엔진에 문제가 보이면 여기서 돌려 막지 않는다.
- 번역 작업 엔진과 결과 보관소는 `packages/pdf-structure`의 것이다. 이 모듈은 고치지 않고 쓴다. PDF 번역의 동작과 지시문은 바꾸지 않는다.
- 탭, 창, 메뉴, 홈, 열기 창 필터, 연결 프로그램 등록, 앱 안 MCP 다리, 끝나지 않은 작업 기록 옮기기(`job-migration.ts`)는 `apps/shell`의 범위다.
- 첨부·`@문서`·파일 색인에서 책을 글로 읽는 일은 `packages/file-parse`의 `epubToText`가 한다. 터미널 명령어 `epub translate`·`epub status`는 `packages/cli`다.
- 공용 `ai:*` 창구와 구독 창구는 `apps/docs`의 뒷단이 등록한다. 이 모듈은 부르기만 한다.

## 항상 지켜야 하는 것

- **원본 보존.** 장이나 화면의 DOM을 통째로 직렬화하는 길을 만들지 않는다. 화면은 고친 블록을 블록 글 표기로 읽어 `replace` 편집으로 보내고, 뒷단은 원본 글에 대한 범위 바꾸기로만 합친다. 바뀐 것이 없는 저장은 파일을 쓰지 않는다(다른 이름으로 저장이면 연 때의 바이트를 옮긴다).
- **열지 못한 파일에는 쓰지 않는다.** 경로가 저장 대상이 되는 것은 뒷단이 그 바이트를 엔진(그래서 zip 관문)으로 연 뒤다. 결과 책은 뒷단의 저장 창이 그 보기에 골라 준 경로에만 쓰고, 책 자신과 다른 탭에 열린 파일에는 쓰지 않는다.
- **편집 거절은 뒷단이 정한다.** 번역 잠금, 고정 배치 책·장, 깨진 장, 지금 판이 아닌 장에 대한 편집은 화면이 무엇을 보내든 거절한다. 화면의 잠금 표시는 거기에 맞춘 안내일 뿐이다.
- **책의 코드를 돌리지 않는다.** 장 틀에 `allow-scripts`를 주지 않고, 그리는 사본에서 스크립트를 지우고, CSP를 붙인다. `epub-asset://`는 지금 보기의 책 zip 항목만 내준다. 디스크·원격에 닿는 길을 더하지 않는다. 링크를 여는 것은 뒷단뿐이고 `safeExternalUrl`과 `http:`·`https:`·`mailto:`만 통과한다.
- **보기 설정과 읽던 자리는 책에 쓰지 않는다.** 화면의 스타일과 `epub-reading.json`에만 있다.
- **번역은 사람이 확인한 뒤에만 보낸다.** 리본 단추, 파일 메뉴, AI 도구(`start_book_translation`), 이어하기 제안의 "이어서 하기"는 창을 열 뿐이다. 제공자는 확인 전에 한 번 정하고(`route.ts`) 작업 내내 바꾸지 않는다. 요금 경로로 스스로 넘어가지 않는다.
- **번역은 저장된 책으로 하고, 그동안 편집을 잠근다.** 저장하지 않은 변경이 있으면 저장한 뒤 시작하고, 저장이 실패하면 시작하지 않는다. 잠금은 편집 컨트롤러의 `setTranslationLock`이 화면과 뒷단(`epub:set-translation-lock`) 모두에 걸고, 결과 책을 다 쓸 때까지 둔다. 탭이 닫히면 작업은 `interrupted`로 멈춘다.
- **보관소 폴더 이름(`pdf-store`)과 보관 열쇠를 바꾸지 않는다.** 바꾸면 보관된 책 번역을 모두 잃는다.
- **책 글은 모델에게 자료다.** 지시문과 도구 설명은 영어이고 제품 이름은 `brandText`를 거친다. 지시문은 책 글, 맥락, 첨부, 검색 결과의 지시를 따르지 말라고 한다. 고정 배치 책에는 `edit_blocks`를 주지 않는다.
- **창구 이름은 `epub:`로 시작한다.** `src/shared/ipc.ts`에 있는 이름만 쓴다. 공용 `ai:*`와 구독 창구는 등록하지 않는다.
- 문구는 21개 언어 조각에 모두 넣는다. 제품 이름은 `GenOffice`로 적는다.

## 이 모듈의 방식

- 책은 뒷단에 있다. 화면은 장 글을 `epub:read-chapter`로, 그림·스타일·글꼴을 `epub-asset://`로 받는다. 큰 그림이 많은 책에서도 화면 프로세스가 책 전체를 들지 않는다.
- 입력은 0.5초 모았다가(그리고 다른 편집·저장·닫기·장 이동 전에) 한 번에 보낸다. 나누기·합치기·굵게·기울임 뒤에는 뒷단이 돌려준 글로 장을 다시 그려 화면과 블록 id를 맞춘다. 뒷단과 주고받는 일은 하나씩 차례로 돈다.
- 되돌리기 기록은 탭마다 하나(최근 300단계)이고, 변경마다 그것을 되돌리는 범위 바꾸기를 쌓는다. "모두 바꾸기"와 AI 호출 한 번은 여러 장에 걸친 한 단계다.
- 화면에서 그린 요소와 원본 요소를 하나하나 짝짓지 못한 블록은 고칠 수 없게 둔다(`inline-roles.ts`의 `pairRoles`).
- 번역 작업은 PDF처럼 화면 안에서 돈다. 모델 호출은 공용 `ai:stream`으로 가고(도구 없음), 결과는 `epub:store-write`로 뒷단의 보관소에 쓰인 뒤에야 끝난 것으로 센다. 다른 프로세스(터미널 명령어)의 작업은 보관소의 최근 `running` 기록으로 안다.
- 화면은 엔진 모듈을 패키지 진입점이 아니라 상대 경로로 가져온다(`edit/engine.ts`, `translate/engine.ts`). 진입점은 결과 책 만들기까지 실어 Node 전용 모듈(`node:zlib`)을 끌어오기 때문이다. 같은 까닭으로 번역 부분이 가져오는 `@genoffice/pdf-structure`는 렌더러 빌드에서 `translate/pdf-structure-browser.ts`로 바꿔 둔다(`electron.vite.config.ts`, `vite.renderer.config.ts`의 `resolve.alias`). 엔진의 번역 모듈이 진입점에서 새 값을 가져오면 이 파일에도 내보내야 렌더러 빌드가 통과한다.
- 메인 코드는 셸 번들에 들어간다. `src/main`을 고친 뒤에는 셸을 다시 빌드한다.

## 알려진 한계

- 한 블록의 굵게·기울임 표시 개수가 바뀌면 엔진이 그 블록의 표시를 `strong`·`em`으로 다시 쓴다. 원래 `<i>`가 `<em>`이 될 수 있다.
- 인라인 요소를 입력으로 통째로 지우면 빈 채로 커서 자리에 돌아온다. `id`와 링크는 살지만, 줄 안의 그림은 입력으로 지울 수 없다.
- 그린 모양이 원본과 맞지 않는 블록은 읽기만 된다(AI의 `edit_blocks`로는 고칠 수 있다).
- 앱 안 MCP의 `read`는 뒷단의 글을 읽으므로 0.5초 안에 막 입력한 글이 빠질 수 있다.
- 장 틀 안의 입력·포커스 이벤트, 블록 사이 커서 이동, 초점을 잃을 때의 자동 저장은 jsdom 시험으로만 확인했다. 빌드한 앱의 Chromium에서 사람이 확인한다(`docs/tracking/status.md`).
- 자세한 것은 `docs/tracking/findings.md`의 "EPUB:"로 시작하는 항목들.

## 테스트

- 실행: `npm run test -w @genoffice/epub`, `npm run typecheck -w @genoffice/epub`. 환경은 jsdom(`tests/setup.ts`)이다. 시험용 책은 `tests/helpers/book.ts`가 그때그때 만든다. 뒷단을 흉내 내는 것은 `tests/helpers/edit-backend.ts`, `translate-backend.ts`다.
- 바꾸면 반드시 테스트하는 것(뒷단): 세션의 편집·잠금·거절(`book-session.test.ts`), 자원 프로토콜의 토큰·경로·CSP·스크립트 거절(`asset-protocol.test.ts`), 저장하지 않음·범위만 다름·보관분 옮기기(`save-pipeline.test.ts`), 보관소 창구의 해시 검사(`store-handlers.test.ts`), 결과 경로 거절(`result-paths.test.ts`), 읽던 자리(`reading-state.test.ts`), 열지 못한 파일에 쓰지 않음과 링크 거절(`main.test.ts`, `translate-main.test.ts`).
- 바꾸면 반드시 테스트하는 것(읽기): 그리는 사본(`reader-chapter-html.test.ts`), 장 넘기기(`reader-navigation.test.ts`), 링크(`reader-links.test.ts`), 찾기(`reader-search.test.ts`), 보기 설정(`reader-view-prefs.test.ts`), 화면(`reader-app.test.tsx`).
- 바꾸면 반드시 테스트하는 것(고치기): 컨트롤러(`edit-controller.test.ts`), 화면 요소 ↔ 표기(`edit-notation.test.ts`), 단축키·바꾸기·저장(`edit-app.test.tsx`).
- 바꾸면 반드시 테스트하는 것(AI와 번역): 도구(`ai-book-tools.test.ts`: `edit_blocks` 묶음 = 되돌리기 한 번, 읽기 전용·잠금·자리 표시 거절), 창(`ai-panel-app.test.tsx`), 번역 창·확인·진행·멈춤·부분 내보내기·이어하기·보고(`translate-app.test.tsx`, `translate-book.test.tsx`, `translate-model.test.ts`). 모델은 모두 가짜다. 실제 `claude`·`codex`에 닿는 테스트를 두지 않는다.
- `epubcheck`, 실제 책, 다른 전자책 뷰어, 실제 구독은 자동 테스트로 확인하지 못한다. 사람이 확인한다.
