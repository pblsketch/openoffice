# apps/shell (`@genoffice/shell`)

실제로 배포되는 앱이다. Electron 프로세스 하나, 창 하나에 홈 화면과 에디터들을 탭(`WebContentsView`)으로 띄운다. 설치 프로그램에 들어가는 것은 이 앱뿐이고, 에디터들의 메인 프로세스 코드는 이 앱의 메인 번들 안에서 돈다.

## 맡은 범위

- 앱의 수명 주기(`src/main/index.ts`): 단일 인스턴스 잠금, userData 위치, 확장자에 따른 파일 라우팅, 탭별 메뉴 전환, 종료 처리, `--headless-export` 진입.
- 탭과 창: `src/main/tab-manager.ts`, 떼어 낸 창(`detached-windows.ts`), 닫기 확인(`window-close-guard.ts`), 렌더러 자원 감시(`renderer-watchdog.ts`).
- 홈 화면과 설정(`src/renderer/src/`): `Home.tsx`, `Onboarding.tsx`, `SettingsModal.tsx`, AI 설정 `SettingsAiSection.tsx`·`settings-ai.ts`, 통합 탭 `IntegrationsPane.tsx`, 별표 파일에 묻는 `KbAskPanel.tsx`, 앱 안 도움말(`i18n/help/`).
- 파일 색인과 지식 기반(`src/main/file-index/`, `knowledge-base.ts`), 최근 파일, 폴더 트리. 홈의 질문을 별표 그룹 하나로 좁히는 일(`knowledge-base.ts`의 `KbRunScopes`, `kb:open-scope`·`kb:close-scope`).
- 문서로 새 문서 만들기(`src/main/generate/`): 만들기 창(`generate-window.ts`, 화면은 `src/renderer/generate.html`과 `src/renderer/src/generate/`), 창 하나의 상태와 동작(`session.ts`), 요청 검사(`request.ts`), 자료의 상태와 글 길이(`materials.ts`), 자료가 열린 탭과 그 저장(`open-materials.ts`), AI 없이 바꾸기(`convert.ts`, `converted-tab.ts`), 조정 가능한 값(`limits.ts`). 홈의 입구는 `generate:open-with-paths`·`generate:open-with-group`이다.
- 출처 기록(`document-links.ts`, 껍데기 쪽 배선 `document-links-shell.ts`)과 모든 에디터의 파일 메뉴에 붙는 "이 문서로 다른 문서 만들기"·"자료 보기"·"이 문서로 만든 문서"(`document-links-menu.ts`).
- 열린 탭 가운데 저장하지 않은 문서의 목록을 에디터 뒷단에 알려 주는 일(`index.ts`에서 `setOpenFilesSource`).
- 자동 업데이트(`updater.ts`, `update-window.ts`, `update-resume.ts`)와 패키징 설정 `electron-builder.cjs`.
- 외부에서 들어오는 입구: 앱 안 MCP 서버(`src/main/mcp/`), 명령줄용 제어 채널(`control-server.ts`), 열린 문서 목록 게시(`open-documents.ts`), 명령줄 PATH 연결과 실행기 위치 기록(`cli-link.ts`), 스킬·MCP 등록 IPC(`integrations-ipc.ts`).
- 기본 앱 등록과 파일 연결(`default-app.ts`).
- PDF 구조 작업과 보관소 채널(`src/main/pdf-structure-ipc.ts`, 로직은 `src/main/pdf-structure/`): PDF 편집기의 `structure*`·`store*` 채널을 등록하고, 구조 작업마다 Electron `utilityProcess`를 하나 띄운다(`runner.ts`, 진입점 `pdf-structure-process.ts`). 앱 안 저장 뒤 끝나지 않은 작업 기록 옮기기(`job-migration.ts`), 출력 형식별 끼움 자리(`plugins.ts`)도 여기 있다.
- 설정 → 일반의 "PDF AI 결과 보관소" 줄(`SettingsResultStore.tsx`): `<userData>/pdf-store`가 차지한 용량과 "모두 지우기". 채널은 `result-store-ipc.ts`, preload는 `window.aiOfficeResultStore`다.

## 맡지 않는 것 (경계)

- 문서 편집과 형식별 저장·내보내기는 이 모듈의 범위가 아니다. 각 에디터(`apps/docs`, `apps/sheets`, `apps/slides`, `apps/pdf`, `apps/markdown`, `apps/html`, `apps/mindmap`, `apps/hwp`)가 한다. shell은 그 메인 모듈의 내보낸 함수(`createDocsView`, `configureSheetsRuntime` 등)를 부른다.
- AI 요청의 실행은 범위가 아니다. `ai:*` 채널과 구독 IPC 채널은 `apps/docs/src/main/docs-main.ts`의 `registerAiIpc`가 등록한다. shell은 그것을 한 번 호출할 뿐이고, AI와 관련해 직접 응답하는 채널은 `home:open-subscription-install-help`(벤더의 설치 안내 페이지 열기)와 `ai:open-model-settings`(홈 탭의 설정 화면 열기)뿐이다.
- 제공자 선택 규칙, 구독 프로그램 실행은 `packages/ai-provider`, 연결 카드와 알림 컴포넌트는 `packages/ui`의 범위다.
- 새 문서의 글을 쓰는 것은 만들 문서 쪽 에디터(PPT, HTML, 마인드맵)의 AI다. 이 모듈은 생성 코드를 갖지 않고, 요청을 새 탭 앞으로 맡겨 둘 뿐이다. 맡겨 두는 곳은 `packages/electron-utils`의 `generate-handoff.ts`이고(`src/main/generate/handoff.ts`는 그것을 다시 내보낸다), 가져가는 창구(`<에디터>:handoff-take`)는 각 에디터가 등록한다.
- 파일을 글로 읽는 일과 가리기 적용은 `packages/file-parse`, 지도 파일의 해석과 개요 글은 `packages/xmind-engine`의 범위다.
- 명령줄과 그 MCP 서버의 구현은 `packages/cli`의 범위다. 앱 안 MCP 서버의 창 없는 도구들은 그 명령줄을 프로세스로 실행해 결과 봉투를 옮길 뿐, 문서 엔진을 다시 구현하지 않는다(`src/main/mcp/cli-runner.ts`).
- 제품 이름과 저장소 좌표의 정의는 `packages/i18n/src/product.ts`의 범위다.

## 항상 지켜야 하는 것

- 구독 프로그램을 끝내는 책임은 이 프로세스에 있다. `src/main/index.ts`는 `app.whenReady` 뒤 userData 경로가 확정된 다음 `initSubscriptionChildTracking(app.getPath('userData'))`를 한 번 부르고(강제 종료된 이전 실행이 남긴 프로세스를 정리하고 이번 실행의 기록을 시작한다), `will-quit`와 `process.on('exit')` 양쪽에서 `shutdownSubscriptionChildren()`을 부른다. `app.exit()`·`process.exit()`은 `will-quit`를 건너뛰므로(headless 내보내기가 그렇게 끝난다) 둘 중 하나만으로는 부족하다. 에디터 코드에서 `initSubscriptionChildTracking`을 또 부르지 않는다.
- 구독 IPC 채널(`SUBSCRIPTION_IPC_CHANNELS`)을 shell에서 등록하지 않는다. 같은 채널을 두 번 등록하면 예외가 난다. preload는 채널 이름과 판독 함수를 `@genoffice/ai-provider/browser`에서 가져와 `window.aiOfficeSubscription`으로 내보낸다. 핸들러가 없으면 상태는 `checking`으로 읽힌다. 로그아웃(`ai:subscription-logout`)을 내보내는 preload는 이 앱의 것뿐이다. 에디터의 preload에 넣지 않는다(`tests/preload-subscription.test.ts`가 지킨다).
- 계정 바꾸기와 로그아웃은 확인을 받은 뒤에만 실행한다. 둘 다 벤더 프로그램 자신의 명령이고 이 PC 전체에 적용되어, 터미널에서 쓰는 같은 프로그램도 함께 바뀐다. 설정 화면은 프로그램 이름과 이 사실을 적은 확인(`setSubLogoutConfirm`, `setSubSwitchConfirm`)을 카드 아래에 띄우고, 확인 버튼을 눌렀을 때만 `connection.logout`·`connection.switchAccount`를 부른다. 확인 없이 이 둘을 부르는 경로를 만들지 않는다. 버튼은 설정의 카드에만 있고 첫 실행 안내와 홈의 질문 패널에는 없다.
- 로그인된 계정(이메일)은 설정 → AI의 카드에만 그린다. 계정 구역의 요약 줄에도, 다른 화면에도 넣지 않는다. 저장하거나 기록에 남기지 않는다.
- preload는 로그인·설치 실패의 원문 오류를 렌더러에 넘기지 않는다(`subscriptionLaunchResultOf`). 실행 파일 경로가 들어 있을 수 있어서다. 화면은 번역된 일반 문장을 쓴다.
- PC에 등록되는 이름은 이 제품의 것이고 원본 GenOffice와 겹치지 않는다. 앱 id `io.github.pblsketch.ieumoffice`, 제품 이름 `IeumOffice`, 패키징된 앱 이름 `ieumoffice`(업데이트 캐시 폴더 이름이 여기서 나온다), userData는 설치본 `<appData>/IeumOffice`, 패키징되지 않은 실행 `<appData>/IeumOffice-Dev`다. 원본 앱의 프로필 폴더를 물려받거나 읽지 않는다. `electron-builder.cjs`의 상수, `package.json`의 `productName`, `packages/i18n`의 상수는 서로 같아야 한다.
- 원본이 PC에 등록한 것(`genoffice` 명령, `~/.genoffice`, 원본의 MCP 항목과 스킬 폴더)은 건드리지 않는다. 실행기 위치 기록은 `~/.ieumoffice/launcher`에만 쓴다.
- 패키징되지 않은 실행은 설치본과 userData·단일 인스턴스 잠금을 공유하지 않는다. 공유하면 개발 실행이 조용히 종료되면서 인자를 설치된 앱으로 넘겨 버린다. 테스트 드라이버는 `GENOFFICE_USER_DATA`로 임시 폴더를 지정한다.
- headless 진입은 모듈 최상위에서 처리한다. `parseHeadlessExportArgv`와 `setHeadlessMode(true)`가 에디터 모듈이 무엇이든 등록하기 전에 실행되어야 한다. 구독 상태 확인은 첫 `statuses` 요청 때 시작하므로 headless 실행은 벤더 프로그램을 띄우지 않는다. 이 순서를 깨는 "시작 시 미리 확인"을 넣지 않는다.
- 업데이트는 이 제품의 공개 저장소의 GitHub Releases에서만 받는다. 저장소는 `electron-builder.cjs`의 `publish`에서 `app-update.yml`로 구워지고, 빌드 시 주입되는 값이나 토큰이 없다. 확인 실패(릴리스 없음, 네트워크 없음)는 조용히 넘긴다. 설치 프로그램은 서명하지 않는다.
- 앱 안 MCP 서버와 제어 채널은 로컬 전용이다. MCP 서버는 루프백에만 바인드하고 Host 헤더를 검사한다(인증이 없으므로). 제어 채널은 userData의 소켓·명명된 파이프와 실행마다 새로 만든 토큰을 쓰고, 명령은 "이 위치를 보여 줘"와 "선택을 읽어 줘"뿐이다. 요청으로 파일을 쓰거나 코드를 실행하는 명령을 추가하지 않는다.
- 스킬과 MCP 등록은 통합 탭에서 사용자가 누를 때만 쓴다. 시작 시 자동으로 에이전트 설정 파일을 고치지 않는다.
- **만들기 창은 AI 실행을 시작하지 않는다.** "만들기"는 만들 종류의 제목 없는 새 탭을 열고 그 탭의 webContents 앞으로 요청을 한 번 맡겨 둘 뿐이다. 실행은 그 탭의 에디터가 자기 보내기 판단을 지나 시작한다. 탭이 열렸다는 이유만으로 실행하는 길을 만들지 않는다. "만들기"를 누르면 뒷단이 요청과 자료를 창의 마지막 상태와 무관하게 다시 검사한다.
- **자료의 글은 `parseFileToText`로만 읽고, 길이만 남긴다.** 만들기 창은 알림용 길이를 재는 데만 글을 쓰고 그 자리에서 버린다. AI 없이 바꾸기도 자료를 `parseFileToText`로만 읽는다(가린 자리는 이름표). 마크다운 자료에 가린 부분이 있는지 알리는 판단(`markdownRedactionNotice`)만 파일의 원문과 견주고, 그 결과는 예/아니오뿐이다.
- **저장하지 않은 자료로는 만들지 않는다.** 어떤 탭에 열려 있고 저장하지 않은 변경이 있는 자료가 하나라도 있으면 만들기와 바꾸기를 막는다. 한 번도 저장하지 않은 문서는 자료가 될 수 없다. 마지막 저장본으로 진행하는 길을 만들지 않는다.
- **출처 기록은 문서 밖에만 쓴다.** `document-links.json`(userData)에만 적고 문서 파일에는 아무것도 넣지 않는다. 요청 글을 적지 않는다(읽는 이벤트에 글이 없고, 기록에도 그 칸이 없다). 기록은 넘겨받은 자료가 하나라도 붙은 실행이 그 탭에서 시작됐거나 바꾸기가 이루어졌고, 그 탭의 문서가 처음 저장됐을 때만 쓴다. 디스크에 없는 파일이라는 이유로 기록을 지우지 않는다.
- **그룹으로 좁힌 질문은 main이 지킨다.** 패널은 실행마다 그룹 이름 하나만 넘기고, main이 그 실행의 불투명한 범위 값을 만든다. `kb:*` 호출마다 main이 별표 저장소에서 그룹의 파일을 다시 구한다. 화면이 보낸 파일 목록을 믿지 않고, main이 갖고 있지 않은 범위 값은 거절한다(범위 없는 질문으로 읽지 않는다). 좁히기는 기존 검사(별표 파일만, 저장하지 않은 파일 거절, 디스크와 같은 색인의 발췌만)가 허락한 것을 더 거르기만 한다.
- **PC 밖으로 나가는 색인 발췌는 두 번 거른다.** 묻기의 검색과 재정렬은 색인이 디스크의 지금 파일과 같은 파일(`pathsIndexedAsOnDisk`)이면서 저장하지 않은 변경이 없는 파일(`withoutUnsavedFiles`)의 발췌만 쓴다. 색인 본문에 들어가는 것을 바꾸면 `file-index/store.ts`의 `EXTRACT_VERSION`을 올린다. 올리면 다음 실행 때 색인을 통째로 다시 만든다.
- **Windows 설치본은 `.xmind`를 파일 연결로 등록하지 않는다**(`electron-builder.cjs`의 `WIN_OPEN_WITH_ONLY_EXTS`, `.txt`·`.json`과 같다). 설치가 사용자의 기본 프로그램을 가져가지 않게 하기 위해서다.
- "GenOffice를 기반으로 합니다" 고지(문자열 키 `setBasedOn`, 값에 `{{GenOffice}}`)는 21개 언어 모두에 남긴다. 원본 이름이 화면에 나오는 곳은 이 한 줄뿐이어야 한다. 다른 문자열과 도움말 제목·본문에 `{{GenOffice}}`를 쓰면 `tests/product-identity.test.ts`가 실패한다.
- 없앤 기능(사용 통계 전송, 자체 계정 로그인, 클라우드 프로젝트 목록 등)의 모듈·IPC·호출부를 되살리지 않는다. `tests/removed-features.test.ts`가 지킨다. 원본의 변경을 병합할 때 특히 본다.
- 모든 창은 `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`다. `shell.openExternal`은 `safeExternalUrl`을 거친 값만 받는다.
- 구조 작업은 셸 메인 프로세스에서 돌리지 않는다. 큰 문서에서 창이 멈추지 않도록 작업마다 별도 프로세스를 띄우고, 답했을 때, 실패했을 때, 화면이 취소했을 때, 그 탭(webContents)이 사라졌을 때, 앱이 끝날 때 프로세스를 끝낸다. 한 창이 동시에 돌리는 작업은 4개(`MAX_JOBS_PER_OWNER`)까지다. 기존 워드·PPT·엑셀 변환(`pdf2docx-local.ts` 등)은 예전처럼 메인에서 돈다. 이 경로는 바꾸지 않는다.
- 구조 작업과 보관소 채널은 화면이 보낸 경로를 믿지 않는다. 읽는 파일은 그 창에 허가된 파일(`pdfPathGranted`)이어야 하고, 쓰는 곳은 셸의 저장 창이 고른 대상(`structurePickTarget`, 작업 하나에 한 번)뿐이며 원본 파일은 쓸 수 없다. 보관소 읽기·쓰기는 셸이 그 창의 파일에서 계산한 문서 해시로만 받는다. 단독 실행처럼 채널이 없으면 화면은 `not-available`을 받는다.
- 보관소의 "모두 지우기"는 설정 화면에서 확인을 받은 뒤에만 부른다. 도는 작업이 있는지는 보지 않는다(그 작업은 이후 항목을 다시 쓴다).

## 이 모듈의 방식

- 에디터의 메인 코드는 패키지가 아니라 상대 경로로 가져온다(`../../../docs/src/main/docs-main`). `electron.vite.config.ts`는 메인에 대해 아무것도 외부화하지 않고 전부 한 번들로 묶는다. 그래서 `apps/*/src/main`을 고친 뒤에는 shell을 다시 빌드해야 한다. 안 하면 변경이 조용히 실행되지 않는다. 렌더러와 preload는 각 에디터의 빌드 결과(`apps/<앱>/out`, 패키징 시 `resources/modules/`)에서 불러오므로 그쪽도 먼저 빌드되어 있어야 한다(`npm run shell`은 `build:all` 뒤에 실행한다).
- 개발 모드에서 preload를 고쳤으면 다시 빌드한다. 낡은 preload는 렌더러를 빈 화면으로 만든다(`npm run dev`의 `predev`가 `tools/build-stale-preloads.mjs`를 돌린다).
- 에디터는 `configure<앱>Runtime({ preloadPath, rendererUrl, rendererFile, … })`으로 자기 빌드 결과의 위치를 주입받는다. 공용 `ai:*` 핸들러는 `registerAiIpc()` 한 번으로 모든 창(문서, 시트, 홈)을 담당한다. 시트 뷰를 `createSheetsView({ includeAiHandlers: false })`로 만드는 이유다.
- 무료 연결 카드(`FreeAiCards.tsx`, 규칙은 `free-ai-cards.ts`)는 설정 → AI의 "무료로 쓰기"와 첫 실행 안내의 연결 단계에 같은 부품으로 들어간다. 연결·해제·남은 요청 수는 preload의 `connectFreeAi`·`disconnectFreeAi`·`getFreeAiQuota`가 워드 뒷단의 `ai:free-*` 채널을 부르고, 카드는 설정 파일이 바뀐 알림을 받아 다시 읽는다. OpenRouter 키는 이 화면에 오지 않는다.
- 설정 화면에서 쓰는 AI는 "사용할 AI" 선택 하나로 정해진다. 고급 영역의 제공자 드롭다운은 어느 제공자의 입력란을 보여 줄지만 고른다. 설정은 읽을 때(`readAiSettings`)와 쓸 때(`writeAiSettings`) 모두 `normalizeAiSettings`를 거쳐, 사라진 선택이 다시 저장되지 않는다.
- 홈의 질문 패널은 에디터와 같은 보내기 규칙을 쓴다. `askSendGate`(`src/renderer/src/kb-ask-connection.ts`)는 `packages/ui`의 `aiSendGate`가 내린 판단을 그대로 읽는다. 연결 상태나 설정을 아직 모르면 질문을 붙잡았다가(`askHeldStep`) 실행할 수 있게 되면 시작하고, "연결 필요"로 정해지면 버리고 연결 안내를 보인다. 이 패널만의 차이는 하나다. 첫 연결 안내는 홈 화면이 띄우므로, 안내가 떠 있는 동안에는 패널이 보내지 않고 붙잡아 둔 질문도 시작하지 않는다.
- 첫 연결 안내의 Codex 문장은 `CODEX_MAY_KEEP_HISTORY`로 켜져 있다. 브리지가 대화 이력 파일은 끄지만 Codex가 자체 진단 로그를 남기고, 앱은 그것을 읽을 수도 막을 수도 없기 때문이다.
- 문자열은 세 군데에 있다. 렌더러 사전 `src/renderer/src/strings.ts`(언어 21개가 한 파일에 있고 `zh`가 키 집합을 정한다), 메인 프로세스의 인라인 사전(`src/main/index.ts`의 `tMain`), 도움말 `i18n/help/topics/<id>.<lang>.md`. 도움말 항목은 `help-registry.ts`의 `HELP_TOPICS`에 등록해야 보이고, 모든 언어 파일의 구조는 영어 원본과 같아야 한다(`npm run check:help-langs`).
- 새 한글 문서는 홈의 카드, "+" 메뉴, 파일 메뉴에서 만든다(`newHwpTab`, `home:new-hwp`). 다른 새 문서처럼 만든 폴더를 기억해 두고(`rememberPendingDir`), 첫 저장 뒤 한글 저장 훅이 파일을 그 폴더로 옮긴다(`applyPendingDir`). 탭 이름은 저장 전까지 "제목 없는 한글 문서"(`untitledHwp`)다.
- 한글 문서는 편집기 밖에서 읽기만 한다. 파일 색인·지식 자료는 `parseFileToText`로, 앱 안 MCP의 `read_hwp`(`src/main/mcp/tools/hwp-tools.ts`)는 `hwpToText`로 디스크의 파일을 읽고, 열린 문서 읽기(`open_documents`)는 한글 탭이면 `apps/hwp`의 `hwpReadText`로 저장하지 않은 내용까지 읽는다. 열린 문서를 MCP로 저장하는 길은 한글 탭에 없다. 엔진 WASM은 `electron-builder.cjs`의 `extraResources`가 `Resources/wasm/rhwp_bg.wasm`으로 넣는다.
- 렌더러 CSS의 크롬 색은 토큰만 쓴다(`npm run check:theme-colors`). shell의 강조색(`--accent` 계열)은 `src/renderer/src/home.css`에서 정의한다.
- 구조 작업 프로세스는 메인 번들과 따로 묶인다. `pdf-structure-ipc.ts`가 진입점을 `?modulePath`로 가져오고, 빌드 결과는 `out/main/pdf-structure-process-*.js`다. `electron-builder.cjs`의 `beforePack`이 `assertPdfStructureProcessBuilt`로 이 파일이 있는지 확인하고, 없으면 패키징을 멈춘다. 이 파일이 빠진 설치본은 다른 기능은 되는데 Markdown·EPUB 변환, 그림 꺼내기, 번역 PDF만 실행 중에 실패한다. 번역 PDF에 필요한 `hb-subset.wasm`은 `extraResources`로 `wasm/`에 들어간다(명령줄도 같은 파일을 쓴다).
- 디자인 템플릿 글꼴(`packages/ui/template-fonts`)은 `electron-builder.cjs`의 extraResources 항목 하나로 `resources/template-fonts`에 한 번만 들어간다. 편집기마다 넣지 않고, 편집기는 `templateFontsDir`로 이 폴더를 읽는다. `tests/template-fonts-resource.test.ts`가 항목이 정확히 하나인지, 어느 편집기의 `src`도 그 글꼴 파일을 빌드 자산으로 가져오지 않는지(import, `new URL`, CSS `url()`) 확인한다. 폴더의 `README.md`가 없으면 빌드 설정이 바로 멈춘다(`assertExtraResourceSources`).
- 패키징은 저장소 루트에서 한다: `npm run dist:win -- -- --publish never`. `--`가 두 번 필요하고, `--publish never`가 없으면 electron-builder가 업로드를 시도한다. xlsx 사이드카는 `target/x86_64-pc-windows-gnu/release/`에 있어야 하므로 Windows에서 MSVC로 빌드했다면 `target/release/xlsx-sidecar.exe`를 그리로 복사한다. OCR 도우미 컴파일에는 Windows SDK가 필요하다. 동작을 확인한 배포는 Windows다. 서명 없는 Apple Silicon dmg는 `.github/workflows/build-mac.yml`이 macos-14에서 만든다(`CSC_IDENTITY_AUTO_DISCOVERY=false`, `identity: null`, 공증 없음). 엑셀 처리 프로그램은 `aarch64-apple-darwin`으로 빌드해 `target/aarch64-apple-darwin/release/xlsx-sidecar`에 둔다. Linux 패키징에는 원본의 이름이 남아 있다.

## 테스트

- 실행: `npm run test -w @genoffice/shell`(또는 이 폴더에서 `npx vitest run`), `npm run typecheck -w @genoffice/shell`. 환경은 `node`다.
- `src/main/index.ts`는 실행 중인 Electron이 있어야 불러올 수 있다. 그래서 배선은 소스 글자를 읽어 고정한다(`tests/subscription-lifetime.test.ts`, `tests/main-locale-tables.test.ts`). 종료 처리나 인라인 사전의 모양을 바꾸면 이 테스트들이 깨진다. 로직은 Electron을 import하지 않는 모듈로 빼서 테스트한다(`settings-ai.ts`, `kb-ask-connection.ts`, `app-routing.ts`).
- PDF 구조 작업(`tests/pdf-structure-*.test.ts`)은 가짜 프로세스로 실행기의 수명(답·취소·탭 닫기 때 끝나는지)과 채널의 경로 검사를 본다. 진입점 배선은 `pdf-structure-wiring.test.ts`, 설정의 보관소 줄은 `settings-result-store.test.ts`·`result-store-ipc.test.ts`가 본다. `beforePack`을 거치는 패키징 테스트(`packaged-cli-version.test.ts`)는 구조 프로세스 파일이 있는 것처럼 가짜 목록을 준다. 확인 조건을 바꾸면 그 가짜도 고친다.
- 바꾸면 반드시 테스트하는 것: preload가 내보내는 구독 API(핸들러 없음, 깨진 답), 계정 버튼의 확인 흐름(취소하면 아무것도 실행되지 않는지), 설정 저장 뒤 다시 읽은 값, 제품 정체성(`tests/product-identity.test.ts`: 빌더 설정·`package.json`·HTML 제목·ProgId·저장소 좌표의 일치), 업데이트 피드 설정, 탭 IPC의 인자 검증.
- 바꾸면 반드시 테스트하는 것(만들기와 기록): 요청 검사(`tests/generate-request.test.ts`), 저장하지 않은 자료의 차단과 한 번만 맡겨 두기(`tests/generate-session*.test.ts`, `tests/generate-handoff.test.ts`), 자료의 크기·글 길이와 읽을 수 없는 자료의 이유(`tests/generate-materials.test.ts`), 바꾸기와 가린 자리의 이름표(`tests/generate-convert.test.ts`), 시작되지 않은 실행은 기록하지 않는 것·이름 바뀜 따라가기·망가진 파일(`tests/document-links.test.ts`), 다른 파일로 읽기의 가리기와 저장 안 한 파일(`tests/cross-file-redaction.test.ts`), 그룹 밖 파일 읽기의 거절(`tests/kb-ask-scope.test.ts`, `tests/kb-ask-group.test.ts`), `.xmind`가 Windows에서 등록되지 않는 것(`tests/file-associations.test.ts`), 앱 안 MCP의 지도(`tests/mcp/open-documents-mindmap.test.ts`).
- Windows에서 변경과 무관하게 실패하는 테스트: `tests/headless-export.test.ts`(16건, `/docs/a.docx` 같은 POSIX 경로를 전제로 한다)와 `tests/default-app.test.ts`의 Linux 사례 한 건. `tests/update-resume.test.ts`와 `tests/third-party-notices.test.ts`는 부하가 큰 PC에서 가끔 실패하므로 단독으로 다시 돌려 확인한다.
- E2E(`npm run test:e2e`, 저장소 루트의 `e2e/`)는 전체 빌드가 필요하다. 실행기(`e2e/helpers.ts`)는 `ai-settings.json`에 `{ providers: {}, subscriptionNoticeSeen: true }`를 미리 써서, Claude·Codex에 로그인된 PC에서 첫 연결 안내이 화면을 가리지 않게 한다(`providers`가 없으면 파일 전체가 기본값으로 읽힌다).
- 실제 릴리스에서의 업데이트 내려받기·설치, 설치 프로그램 자체는 자동 테스트로 확인하지 못한다. 실제 빌드로 확인한다.
