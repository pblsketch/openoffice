# apps/docs (`@genoffice/docs`)

Word 문서(.docx)와 ODT(.odt) 에디터다. 그리고 배포되는 앱 전체에서 공용 `ai:*` 채널에 응답하는 "AI 호스트"이기도 하다. 문서·PDF·Markdown·HTML 에디터는 물론, shell 안에서는 시트와 슬라이드의 AI 요청도 이 모듈의 핸들러를 지난다.

## 맡은 범위

- docx 편집 화면(`src/renderer/`): Tiptap 편집기와 확장(`editor/`), 쪽 나눔(`pagination*.ts`), 머리글·바닥글, 변경 내용 추적, 메모, 리본과 대화 상자(`components/`).
- 메인 프로세스(`src/main/docs-main.ts`): 창과 뷰 생성, 열기·저장·내보내기·인쇄, 암호화된 docx(`docx-encryption.ts`), 큰 문서의 지연 미디어(`lazy-media.ts`), 디스크의 외부 변경 감지(`external-change.ts`), 최근 파일과 별표(`starred-files.ts`).
- 공용 AI 핸들러 `registerAiIpc`: `ai:get-settings`, `ai:set-settings`, `ai:stream`, `ai:stream-cancel`, `ai:chat`, `ai:web-search`, `ai:read-url`, `ai:image-search`, `ai:fetch-image`, `ai:tool-capabilities`, `ai:codex-models`, `ai:custom-models` 등과 구독 IPC 채널. 그 규칙은 Electron 없이 테스트되는 `src/main/ai-run.ts`에 있다.
- 무료 연결 채널(`FREE_AI_IPC_CHANNELS`: `ai:free-connect`, `ai:free-connect-cancel`, `ai:free-disconnect`, `ai:free-quota`, `ai:free-open-key-page`)은 `src/main/free-ai-ipc.ts`의 `registerFreeAiIpc`가 `registerAiIpc` 안에서 등록한다. OpenRouter 브라우저 연결로 받은 키는 여기서 바로 설정 파일에 쓰고 화면에는 넘기지 않는다. 브라우저가 돌아온 뒤 보이는 페이지의 문구는 `src/main/free-ai-strings.ts`(21개 언어)다.
- 문서 에디터의 AI 패널과 skill(`src/renderer/ai/`): `AiPanel.tsx`, `docs-skill.ts`, 도구(`tools.ts`, `*-ops.ts`), 편집 대기 카드(`edit-queue.ts`), 전송(`transport.ts`). AI 창 첨부 칸에는 로컬 파일(끌어다 놓기·`aiAttachTitle`)과 "Google 드라이브에서 첨부"(`DriveAttachButton`), "이음오피스 문서에서 첨부"(`DocAttachButton`, 결정 0035)가 함께 있다. 입력란의 `@` 문서 목록(결정 0051)은 `docMention`(`docMentionActions`)을 `AiComposer`의 `docs`로 넘기고, 같은 첨부 길로 붙인다. 열린 문서 고르기는 `window.aiOfficeDocs`가 있을 때만 나오고, 고른 파일은 드라이브 첨부와 같은 길(`docs:files-*`)로 첨부 칸에 들어간다.
- 다른 에디터가 쓰는 문서 생성 흐름 `createAiDocument`(시트와 PDF의 AI가 새 docx·pdf·md를 만들 때 이 함수로 들어온다)와 프로젝트 IPC(`registerProjectIpc`).

## 맡지 않는 것 (경계)

- docx의 해석·조각 생성·바이트 단위 문단 패치는 이 모듈의 범위가 아니다. `packages/docx-engine`이 한다. 형식 문제를 렌더러나 메인에서 우회해 고치지 않는다.
- 제공자 선택 규칙과 구독 프로그램 실행은 `packages/ai-provider`, 검색·이미지·미디어 도구는 `packages/ai-search`, 에이전트 루프는 `packages/agent-core`, 보내기 규칙과 연결 카드·알림은 `packages/ui`의 범위다. 이 모듈은 그것들을 배선한다.
- 탭, 홈 화면, 설정 화면, 구독 프로그램의 종료와 잔여 프로세스 정리는 `apps/shell`의 범위다. `initSubscriptionChildTracking`은 단독 실행 진입(`startDocsStandalone`)에서만 부르고 `registerAiIpc` 안에서는 부르지 않는다.
- 시트·슬라이드·PDF·HTML에만 있는 AI 채널(`sheets:…`, `slides:…`, `pdf:…`, `html:…` 접두사)은 각 에디터가 등록한다.

## 항상 지켜야 하는 것

- 요청은 다른 제공자로 넘어가지 않는다. `ai:stream`과 `ai:chat`은 `resolveAiRun`으로 대상을 정하고, 실행할 수 없으면 어떤 제공자도 부르지 않고 원인(`errorCode`, `errorProvider`)이 담긴 오류 조각으로 답한다. `auto`는 `ready`인 구독으로만 풀리고, 돈이 드는 것(키 제공자, 종량제 로그인)은 저장된 선택일 때만 실행된다.
- 렌더러가 보낸 설정은 저장할 때도, 요청마다도 `sanitizeAiSettings`를 거친다. 설정의 `cliPath`는 프로세스 실행에, `baseUrl`은 API 키 전송에 쓰이므로 렌더러의 사본을 그대로 믿지 않는다. 설정 파일을 읽을 때는 항상 `normalizeAiSettings`를 거친다(`storedAiSettings`). 사라진 선택을 덮어쓰거나 "고쳐서 다시 쓰는" 코드를 `ai:get-settings`에 넣지 않는다.
- 구독 IPC는 `ensureSubscriptionIpc`로만 등록한다. 여러 에디터의 메인이 한 프로세스에서 돌고, 먼저 부른 쪽이 등록한다. 이 모듈이 넘기는 `setMeteredAccepted`는 정규화된 설정 전체를 원자적으로 쓰고(`withMeteredAccepted`) `ai:settings-changed`를 모든 창에 알린다.
- 오류 조각은 `aiStreamErrorChunk`로 만든다. `errorCode`·`errorProvider`·`errorResetsAt`이 빠지면 렌더러가 "막힌 실행" 알림 대신 날것의 문장을 보여 준다. 구독 사용량과 입력 축소는 `subscriptionStreamCallbacks`가 `subscription-usage`·`input-truncated` 조각으로 넘긴다. 입력이 줄었는데 알리지 않는 경로를 만들지 않는다.
- 이미지·미디어 도구에는 `screenToolContext()`(`{ path: 'screen', statuses: sharedSubscriptionStatuses() }`)를 넘긴다. 컨텍스트 없이 부르면 구독이 연결되지 않은 것으로 취급된다.
- AI 도구 호출에서 온 주소는 `fetchRemoteImage`와 크기 상한을 거친다(웹 검색 결과를 통한 프롬프트 주입이 가능한 값이다). 사설·링크 로컬 주소와 http(s)가 아닌 스킴은 거절된다.
- 문서 내용은 테마가 다시 칠하지 않는다. 어두운 쪽 표시(`src/renderer/editor/dark-page.ts`)는 화면 전용 변환이다. 작성된 색은 실제 인라인 선언으로 남고, 변환된 값은 `--dk-*` 사용자 정의 속성으로 덧붙여 `.workspace.page-dark` 아래의 화면 전용 규칙이 바꿔 칠한다. 쪽 나눔 미리 보기, 인쇄, PDF 내보내기, 클립보드 HTML은 두 테마에서 같은 결과여야 한다.
- 저장은 좁은 패치다. 원본 파일이 기준이고, 고친 블록만 OOXML 조각으로 바꿔 원래 `document.xml`에 끼워 넣으며, 손대지 않은 블록과 다른 zip 항목은 바이트 그대로 남는다. 열기·저장 경로를 바꾸면 손대지 않은 내용이 그대로 살아남는지 왕복 테스트로 증명한다.
- UI 크롬 색은 토큰만 쓴다(`var(--surface)` 등). 렌더러 CSS에 새 `#hex`·`rgb()`를 넣으면 `npm run check:theme-colors`가 실패한다. 강조색(`--accent` 계열)은 이 앱의 `styles.css`에서 정의한다.
- 모델에게 주는 system prompt에서 제품을 가리키는 이름은 `brandText(…, 'en')`을 거친다(`ai/protocol.ts`, `ai/doc-writer.ts`). HTTP 사용자 에이전트는 `PRODUCT_NAME`으로 만든다.
- **AI 첨부가 받는 형식 목록의 기준은 이 에디터의 첨부 목록이다.** 여섯 에디터가 함께 쓰는 목록(`ATTACHABLE_EXTS` 등)은 `packages/file-parse`의 `attachable.ts` 한 곳에 있고, 이 에디터가 받던 글자·코드 확장자가 그 기준이 된다. 다른 에디터는 이 목록을 넓히기만 하고 줄이지 않는다. 그림 확장자처럼 렌더러가 봐야 하는 값은 Node 결합(`file-parse`)을 렌더러로 못 가져오므로 이 앱의 `src/shared/ipc.ts`(`ATTACHMENT_IMAGE_EXTS`)에 그대로 두되 값은 공용 목록과 같게 맞춘다. 목록은 무엇을 첨부할 수 있는지만 정하고, 실제로 읽히는지는 첨부할 때 `parseFileToText`가 정한다.

## 이 모듈의 방식

- 메인 코드는 shell 번들에 들어간다. shell이 `../../../docs/src/main/docs-main`을 상대 경로로 import하므로 `src/main`을 고친 뒤에는 shell을 다시 빌드해야 변경이 실행된다. 단독 실행(`src/main/index.ts` → `startDocsStandalone`)은 개발용이다.
- **발표 모드는 읽기 모드를 전체화면으로 쓴다.** F5는 읽기 모드 + HTML 전체화면(셸 탭 줄까지 덮인다) + 쪽 맞춤, Ctrl+F5는 전체화면 없이 읽기 모드만, F5·Esc는 끝낸다. 키 판정은 `@genoffice/ui`의 `presentationKeyOf` 하나이고, 발표 중에는 `.presentation-mode`가 상태 표시줄을 숨긴다. 전체화면이 OS에서 풀려도(`fullscreenchange`) 읽기 모드까지 끝낸다.
- 채널 이름으로 소유를 구분한다. `ai:*`는 앱 전체가 공유하고 여기서 한 번 등록된다. 다른 에디터와 겹칠 수 있는 것은 `docs:` 접두사를 붙인다(`docs:analyze-media`, `docs:ai-generate-image`). 슬라이드가 같은 프로세스에서 자기 `ai:generate-image`·`ai:analyze-media`를 등록하기 때문이다.
- 스트림 중에는 제공자 쪽에서 움직임이 있을 때 `ping` 조각을 보낸다(5초에 한 번을 넘지 않는다). 렌더러의 침묵 감시가 "느린 턴"과 "죽은 턴"을 구별하는 근거다. 렌더러가 사라지면 `abortOnDestroyed`가 요청을 끊는다.
- `ai:stream`의 조각은 `createChunkCoalescer`(`src/main/stream-coalesce.ts`)를 거친다. `delta`·`reasoning`은 32ms 동안 모아 한 조각으로 보내고, 다른 종류의 조각은 모은 것을 먼저 보낸 뒤 보낸다. 토큰마다 IPC 메시지와 대화 다시 그리기가 생기지 않게 하기 위해서다. 이 처리기에서 조각을 보내는 새 경로는 `send`가 아니라 같은 묶음(`out.push`)을 거쳐야 순서가 지켜진다.
- AI 실행의 되돌리기 지점은 JSON 사본이 아니라 문서 노드 그대로다(`ai/rollback-snapshot.ts`). 바뀌지 않는 노드라 그 뒤의 문서와 손대지 않은 부분을 함께 쓴다. 되돌리기는 `setContent`에 노드를 넘기고, 편집기가 다시 만들어져 스키마가 다르면 JSON으로 바꿔 넣는다.
- `ai:stream-cancel`은 그 id의 스트림과 함께, 보낸 창이 진행 중인 이미지 생성·미디어 분석 호출도 끊는다(`abortMediaCalls`). 도구가 실행되는 동안의 중단은 이미 끝난 턴의 id로 오기 때문에 호출을 창으로 찾는다. shell 안에서는 이 핸들러가 모든 에디터의 중단에 응답하므로, 이미지·미디어 핸들러는 어느 에디터의 것이든 `withMediaCallSignal`로 감싼다. 두 번째 인자로 `'request'`를 받으면 그 id의 스트림만 끊고 미디어 호출은 두는데, 도구를 쓰지 않는 PDF 문서 작업의 호출이 이렇게 중단해 같은 탭의 AI 창 작업을 건드리지 않는다.
- 렌더러의 패널은 공용 부품으로 조립한다. 보내기는 `useAiSendGate`의 `admit`을 지나고, 연결이 없으면 `AiConnectPrompt`, 구독 첫 사용이면 `AiFirstConnectionNotice`(Codex가 진단 기록을 남길 수 있다는 문장을 켠 채로, `codexKeepsHistory`), 막힌 실행이면 `AiBlockedNotice`를 그린다. 전송은 `errorText: (cause) => aiRunErrorText(lang, cause)`를 넘겨 다른 에디터와 같은 문장을 쓴다. 구독 API는 preload가 `window.aiOfficeSubscription`으로 내보내고, 없거나 실패하면 상태는 `checking`으로 남는다.
- 문자열은 언어별 조각이다. `i18n/strings-ai.ts`·`strings-app.ts`·`strings-ribbon.ts`는 `i18n/<영역>/<lang>.ts`를 모으는 집계 파일이고 `zh.ts`가 키 집합을 정한다. 키를 추가하면 21개 조각 모두에 넣는다. 구독 연결 문장은 `@genoffice/ui`의 공용 문자열을 쓰고 여기에 복제하지 않는다. `useI18n()`의 `t`는 훅 의존성 배열에 넣지 않는다.
- `electron.vite.config.ts`의 `externalizeDepsPlugin`은 `dependencies`의 패키지를 번들 밖에 둔다. `@genoffice/*` 패키지는 TS 소스라 밖에 두면 실행 시 해석에 실패하므로, `dependencies`에 workspace 패키지를 추가하면 `exclude` 목록에도 넣는다.
- ODT는 다리 docx로 편집한다(`@genoffice/odt-engine`). 열 때 렌더러가 `parseOdtOffThread`(파싱 일꾼 안에서 `odtToDocx` → `parseDocx`)로 열고, 문서 상태에 `format: 'docx' | 'odt'`와 `odt`(원본 ODT 바이트, 다리 지도, docx로 바꿀 때의 보고)를 둔다(`doc-state.ts`의 `DocState`, `isOdtDoc`). 형식은 경로의 확장자가 정한다(`shared/open-file.ts`의 `docFormatOfPath`).
  - 저장은 `buildDocBytes`의 docx를 `saveOdt`로 **연 때의** 원본 ODT와 다리 지도에 되돌려 쓴다(`odtBytesFor`). 저장해도 이 기준은 바꾸지 않는다. 편집기의 비교 기준(`parsed`)만 docx 문서처럼 방금 저장한 docx로 바뀐다. 저장한 ODT로 기준을 다시 만들면 ODF 쓰기가 만든 모양이 편집 화면과 달라(굵게, 글자 크기, 문단 나누기) 화면을 다시 그리고 되돌리기 기록을 지운다(측정해서 확인함). 고치지 않은 부분은 몇 번을 저장해도 원본 바이트 그대로이고, 같은 편집은 늘 같은 바이트가 된다. 기준은 파일을 다시 열 때(복구본, 형식 바꿔 저장 뒤 다시 불러오기 포함) 새로 잡는다.
  - 뒷단은 확장자로 형식을 가리고(`main/doc-format.ts`), 받은 바이트가 그 형식이 아니면 쓰지 않는다. docx 전용 처리(지연 미디어, 열기 암호)는 ODT에 하지 않는다. 복구본도 형식을 지킨다(ODT 탭의 복구본은 ODT 바이트, 확장자 `.odt`).
  - 암호 ODT는 열지 않고 "암호를 푼 뒤 다시 열어 달라"고 알린다(`isOdtOpenError(err, 'encrypted')`).
  - 다른 이름으로 저장은 두 단계다: `docs:save-as-pick`(창, docx·ODT 필터, 고른 경로만 기억)과 `docs:save-as`(그 경로에만 쓴다). 형식이 바뀌면 `saveWithFormatChange`가 보고를 확인 창(`components/FormatChangeDialog.tsx`, `format-change-bus.ts`)으로 보이고, 확인하면 쓰고 탭을 새 파일로 다시 연다. docx→ODT는 편집 화면의 차트·수식·도형·글상자를 찍어(`odt-objects.ts`, `docs:capture-rect`) `renderedObjects`로 넘긴다.
- ODT 문서에서 꺼 두는 기능과 잠금은 `odt-gate.ts`(세션·꺼 둔 기능 목록·안내 `appOdtOff`)와 `editor/odt-guard.ts`(편집기 플러그인)가 맡는다. docx 문서에는 세션이 없어 아무것도 바뀌지 않는다.
  - 세션은 렌더러의 모듈 상태다. `loadFile`이 내용을 넣기 **전에** `beginOdtSession`을 부르고(자리 표시 이름표가 그릴 때 정해진다), 저장 뒤 다시 읽을 때 `rebaseOdtSession`으로 `docxIndex`의 기준을 바꾼다. 컴포넌트는 `useOdtSession`, 단추는 `odtOffProps`(눌리지 않음 + 화면 팁 아래 안내)를 쓴다. 동작 입구(리본 콜백, 단축키, 메뉴 명령, 메모·잉크·비교 동작)는 `refuseInOdt`로 막는다. 네이티브 메뉴의 수식·메모 항목은 `docs:view-menu-state`의 `odt`로 꺼진다(`buildDocsMenu`).
  - AI·MCP: `ai/odt-tools.ts`가 꺼 둔 기능의 도구를 목록에서 빼고(`docs-skill.ts`), 실행을 거절한다(`executeTool`). 편집기 가드가 거절한 편집(보호된 칸, 잠긴 자리 표시)도 오류로 돌려준다.
  - 가드: 한컴이 잠근 칸(`protectedCellsOf`, 열 때 최상위 표의 `docxIndex` = 다리 요소 번호로 찾고 그 뒤로는 위치를 따라간다. 저장 뒤 다시 읽으면 표 순서와 격자 칸으로 잇는다)과 자리 표시 그림(`odt-keep:`, 통째 삭제만)을 건드리는 트랜잭션을 거절한다. 붙여넣기(`cleanOdtPaste`, App의 transformPasted)와 그 밖의 삽입(appendTransaction)으로 들어온 글상자·수식·차트·목차·메모·변경 표시는 보이는 그림이나 글로 바뀐다.
  - 미리 보기 그림이 없는 자리 표시는 이름표 SVG로 그린다(`odt-labels.ts`, 화면·인쇄·PDF 같음). 인쇄·PDF 전에 한 번 알린다. ODT→docx 다른 이름으로 저장은 그 그림을 이름표 PNG로 바꿔 쓴다(`odt-label-docx.ts`, 다른 zip 항목은 바이트 그대로 복사).
- 중첩 표가 든 칸의 자기 문단은 엔진의 칸 글자 패치(`patchTableCellTexts`)가 닿지 않는다(중첩 표만 고친다). 그래서 `pmDocToSavePlan`이 그 칸의 자기 문단만 떼어 혼자 있는 칸으로 엔진 패치에 넘기고 제자리에 돌려놓는다(`patchHostCellParas`). 문단 스타일, 중첩 표, 다른 칸의 바이트는 그대로다. 칸 안에서 문단 수가 바뀌었으면 예전처럼 표를 다시 쓴다(`generateTableModelXml`). 예전에는 그 칸에 친 글자가 저장에서 빠졌다.
- 한 번도 저장하지 않은 문서의 첫 저장(직접 저장, 닫기 확인의 "저장")은 언제나 저장 창을 띄운다(결정 0061). AI 실행 뒤에 조용히 저장하지 않고, 첫 제목은 저장 창의 처음 이름으로만 쓴다. 저장 창을 취소하면 아무것도 쓰지 않고 닫기도 멈춘다. MCP 저장은 경로를 직접 주므로(`explicitTarget`) 묻지 않는다.
- 복구 사본은 공용 복구 저장소(`@genoffice/electron-utils`의 `createRecoveryStore`)에 둔다. 폴더와 이름(`docs-autosave`, 경로 sha1 앞 16글자 + `.docx`/`.odt`)은 이전 버전 그대로라 업데이트 전 사본도 열 때 묻는다. 탭마다 어떤 사본을 썼는지, 닫기가 어떻게 정해졌는지는 `src/main/docs-recovery.ts`가 기억하고, 지우기는 저장(`saved`), "저장 안 함"·MCP 버리기(`dontSave`, `discardDocsRecovery`), 깨끗한 닫기(`closedClean`, 그 탭이 쓴 사본만)로만 한다. 앱이 끝나는 중에는 깨끗한 닫기도 지우지 않고, 화면이 죽은 탭과 응답 없는 탭을 "그래도 닫기"로 닫은 탭은 사본을 남긴다(뒤의 것은 "나중에"로 둔다). 저장은 어느 것이든 그 탭의 제목 없는 사본 자리도 지운다. 사본 바이트는 저장할 때와 같다: 나중에 불러오는 그림도 쓰기 표를 받은 뒤 채워 넣으므로(`prepareRecoveryBytes`), 원본 파일이 없어져도 사본만으로 열린다. 암호가 맞지 않아 원본으로 연 사본은 "나중에"로 돌린다. 제목 없는 문서의 사본은 앱 데이터의 `untitled/` 자리에만 쓰고, 사용자 폴더에 파일을 만들지 않는다. 열 때는 문서 이름이 든 공용 물음(Esc·닫기 = 되살리기, 파일이 더 새로우면 그 줄을 보임)이나 시작 목록의 결정을 따른다. 껍데기 앱은 `registerDocsIpc`가 등록한 `RecoveryEditorContract`로 탭을 되살린다.
- 문서 바이트는 IPC 응답이 아니라 미디어 프로토콜의 일회용 주소로 렌더러에 건넨다(`byte-handoff.ts`). IPC 직렬화가 버퍼를 통째로 복사해 1GB 파일에서 메인 프로세스가 죽었기 때문이다.
- 디자인 템플릿 글꼴은 설치 파일에 한 번만 들어 있고(`resources/template-fonts`) 렌더러 빌드 자산으로 import하지 않는다. 같은 미디어 프로토콜의 `template-fonts` 호스트가 목록에 있는 파일만 내주고(`main/lazy-media.ts`가 `@genoffice/electron-utils/template-font-response`로 답한다. 면 목록과 주소는 `@genoffice/ui/template-fonts`에 있다), 렌더러가 시작할 때 실제 패밀리 이름으로 등록한다(`renderer/template-fonts.ts`). 인쇄와 PDF 내보내기(창 없는 내보내기 포함)는 같은 렌더러에서 돌므로 따로 등록하지 않는다.

## 테스트

- 실행: `npm run test -w @genoffice/docs`(또는 이 폴더에서 `npx vitest run`), `npm run typecheck -w @genoffice/docs`. 환경은 `jsdom`이다. docx 픽스처가 필요한 테스트가 있으므로 처음 한 번, 그리고 `packages/docx-engine`을 바꾼 뒤에는 저장소 루트에서 `npm run fixtures`를 돌린다.
- `vitest.config.ts`는 workspace 패키지를 `node_modules`가 아니라 이 체크아웃의 소스 경로로 해석한다. 다른 체크아웃의 낡은 코드로 테스트되는 일을 막기 위해서다.
- ODT에서 꺼 둔 기능·잠금·이름표·붙여넣기: `tests/odt-gating.test.ts`.
- ODT 열기·저장·다른 이름으로 저장·복구본: `tests/odt-open-save.test.ts`(실제 편집기와 가짜 뒷단), 뒷단 형식 규칙: `tests/odt-doc-format.test.ts`, 개체 그림 열쇠: `tests/odt-objects.test.ts`. 저장 경로를 바꾸면 "연속 두 번 저장"에서 고치지 않은 부분이 바이트 그대로인지 본다.
- AI 배선에서 바꾸면 반드시 테스트하는 것(`tests/ai-run.test.ts`, `tests/ai-subscription-panel.test.ts`): 연결되지 않은 요청이 제공자를 부르지 않고 원인과 함께 거절되는지, 오류 조각에 원인 필드가 실리는지, 사용량·입력 축소가 전달되는지, 설정 읽기가 정규화되는지.
- `claude-code`·`codex` 제공자로 가는 테스트는 브리지를 반드시 mock한다. 안 하면 실제 프로그램이 떠서 개발자의 구독 사용량을 쓴다.
- Windows에서 `tests/protect-dialog.test.ts`의 "setting a modify password…" 한 건은 변경과 무관하게 실패한다.
- 실제 화면(쪽 나눔, 인쇄 결과, 어두운 쪽)은 단위 테스트로 다 확인되지 않는다. 빌드한 앱에서 확인한다.
