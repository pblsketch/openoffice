# packages/electron-utils (`@genoffice/electron-utils`)

shell과 에디터들의 메인 프로세스(일부는 preload)가 함께 쓰는 도우미 모음이다. 보안 관문(외부 URL, 원격 주소, 탐색 잠금), 파일 쓰기, 메뉴, 인쇄, headless 내보내기 계약처럼 "앱마다 따로 구현하면 어긋나는 것"을 한 곳에 둔다.

## 맡은 범위

- 보안 관문: 외부로 여는 URL 검사 `safeExternalUrl`(`src/safe-external-url.ts`), 원격 주소 검사와 홉마다 재검사하는 `fetchWithSsrfGuard`(`src/safe-remote-url.ts`. `signal`로 요청을 끊고, `headersForHop`으로 홉마다 다른 머리글을 준다 — 비밀 토큰은 그 호스트 홉에만), 이미지 다운로드 `fetchRemoteImage`·`readBodyCapped`(`src/remote-image.ts`), 모든 webContents의 탐색 잠금 `installNavigationGuard`(`src/navigation-guard.ts`).
- 파일: 원자적 쓰기 `atomicWriteFile`·`writeJsonAtomic`과 흘려 쓴 임시 파일(`tempPathBeside`)을 제자리로 옮기는 `atomicMoveFile`(`src/atomic-write.ts`), 생성 이미지 임시 저장소(`src/generated-images.ts`), 사용자 글꼴 저장소(`src/font-store.ts`), 디자인 템플릿 글꼴 파일의 응답 `templateFontResponse`(`src/template-font-response.ts`, 하위 경로 `/template-font-response`. 목록에 있는 파일 이름만 글꼴 MIME과 CORS 머리글로 내준다. 워드 편집기의 미디어 프로토콜과 단독 실행한 시트가 함께 쓴다. `@genoffice/ui/template-fonts`를 import하지만 `@genoffice/i18n`처럼 `dependencies`에 적지 않고 workspace 호이스팅에 기댄다), 디자인 템플릿 글꼴 폴더의 위치 `templateFontsDir`(`src/template-fonts-dir.ts`, 하위 경로 `/template-fonts-dir`. 설치본은 `<resources>/template-fonts`, 개발 실행은 저장소의 `packages/ui/template-fonts`. fs도 Electron도 쓰지 않고 `app`의 값을 인자로 받는다), 이미지 저장(`src/save-image.ts`), 기본 저장 폴더(`src/default-save-dir.ts`), 마지막 폴더를 기억하는 열기·저장 대화 상자(`src/dialog-memory.ts`).
- 창과 메뉴: 공용 메뉴 템플릿(`src/app-menu.ts`), 우클릭 메뉴(`src/context-menu.ts`), 저장소 주소 상수(`src/github-menu.ts`), 파일 끌어다 놓기 다리(`src/drop-open.ts`), 렌더러 스킴과 프로토콜(`src/renderer-scheme.ts`, `src/renderer-protocol.ts`).
- 인쇄와 내보내기: `printHtmlToPdf`·`sanitizePrintableBody`(`src/print-html-pdf.ts`), 인쇄 대화 상자용 임시 창(`src/print-window.ts`), headless 내보내기의 인자 문법·종료 코드·출력 봉투(`src/headless-export.ts`), 프로세스 전역 headless 플래그(`src/headless-mode.ts`).
- 열기 암호(`src/office-encryption.ts`, 하위 경로 `/office-encryption`, 결정 0041): 엑셀·파워포인트 뒷단이 함께 쓰는 암호 파일 판별(`isEncryptedOoxml`·`isEncryptedOfficeFile`), 풀기(`decryptOfficeFile`, 실패 이유 `wrong-password`·`unsupported`), 다시 잠그기(`encryptOoxml`, Agile), 묻기 반복(`unlockOfficeFile`: 엑셀 기본 암호를 먼저 시도하고, 틀리면 다시 묻고, 취소면 `null`). `officecrypto-tool`을 부르는 곳은 여기 하나다(워드는 자기 `docx-encryption.ts`를 쓴다). 라이브러리는 앱 번들에 들어가므로 `devDependencies`에 둔다.
- 스트림 정리: 렌더러가 사라지면 요청을 끊는 `abortOnDestroyed`(`src/abort-on-destroyed.ts`).
- 저장하지 않은 파일 확인(`src/unsaved-files.ts`): 파일을 다른 파일로 읽기 전에 "어떤 탭에 열려 있고 저장하지 않은 변경이 있는가"를 묻는 `assertFileSaved`·`withoutUnsavedFiles`·`fileHasUnsavedChanges`. 열린 문서의 목록은 shell이 `setOpenFilesSource`로 건다.
- 생성 넘겨주기(`src/generate-handoff.ts`): 만들기 창의 요청을 새 탭의 webContents 앞으로 맡겨 두고(`queueGenerateHandoff`), 그 탭의 에디터가 한 번 가져가며(`takeGenerateHandoff`), 실행 시작(`reportGenerateRunStarted`)과 AI 없이 바꾼 사실(`recordGenerateConverted`)을 메모리에 남긴다. shell의 출처 기록이 이 사건들을 읽는다.
- 문서 첨부 다리(`src/doc-attach-bridge.ts`, `src/doc-attach-channels.ts`, 하위 경로 `/doc-attach-bridge`·`/doc-attach-channels`, 결정 0035): 편집기 preload가 `window.aiOfficeDocs`(`DOC_ATTACH_BRIDGE_KEY`)로 내주는 다리다. `available()`(껍데기 앱이 문서 고르기를 내주는지)과 `pick()`(문서 고르기 창을 열어 고른 파일 경로를 받음)을 준다. `drive-ai-bridge`처럼 껍데기 앱이 없으면 `available`이 거짓, `pick`이 `{ ok: false, reason: 'unavailable' }`로 닫힌 쪽 실패를 한다. 채널은 `doc:attach-available`, `doc:pick-attachments`.
- 사용자 스킬 다리(`src/user-skills-bridge.ts`, `src/user-skills-channels.ts`, 하위 경로 `/user-skills-bridge`·`/user-skills-channels`, 결정 0048): 편집기 preload가 `window.aiOfficeUserSkills`(`USER_SKILLS_BRIDGE_KEY`)로 내주는 다리와 `skills:*` 채널 이름·주고받는 모양·입력 검사(`skillIdOf`, `statePatchOf`). 양식 스킬의 새 탭으로 요청과 칩을 맡기는 일(스킬 넘겨주기)은 `generate-handoff.ts`의 같은 한 번 가져가기 규칙을 쓴다.
- 복구 사본(결정 0061): 여덟 편집기와 shell이 함께 쓰는 저장소 `createRecoveryStore`(`src/recovery-store.ts`), 편집기 약속 `RecoveryEditorContract`와 그 등록표(`src/recovery-contract.ts`의 `registerRecoveryEditor`·`recoveryEditor`·`recoveryEditors`), 파일을 열 때의 문서별 물음 `promptRecoveryForFile`·`resolveRecoveryOnOpen`(`src/recovery-prompt.ts`), 그 물음과 암호 문서 알림(`unprotectableNoticeText`)의 21개 언어 문구(`src/recovery-labels.ts`). 저장소는 사본 경로(`<userData>/<종류>-autosave/<sha1(경로) 앞 16글자><확장자>`, 제목 없는 문서는 `untitled/<식별자><확장자>`), 내용 없는 곁 정보(`.meta.json`: 종류, 원본 경로, 제목 없는 식별자, 탭 제목, 쓴 시각, 실행 식별자, 상태 `undecided`·`later`·`restoreChosen`, 제목 없는 사본에만 있을 수 있는 `originalPath`: 편집기가 되돌려 쓸 수 없는 원래 파일, 엑셀의 CSV·변환 통합 문서), 원자적 쓰기(`writeCopy`, 큰 문서는 흘려 쓰는 `writeCopyStreamed`), 지우는 이유(`saved`·`dontSave`·`discarded`·`closedClean`), 목록 조회와 "파일이 그 뒤에 바뀜"·"원본 없음" 판정, 시작 목록의 결정(`applyLaunchDecision`), 30일 정리(`pruneStaleCopies`), 정상 종료 판정에 쓰는 `hasUnresolvedCopies`, 종료 래치(`markAppShuttingDown`·`resetAppShuttingDown`·`isAppShuttingDown`)를 맡는다.

## 맡지 않는 것 (경계)

- 창·탭·수명 주기의 소유는 이 모듈의 범위가 아니다. 창을 만들고, IPC 핸들러를 등록하고, 단일 인스턴스 잠금을 잡는 일은 `apps/shell`과 각 에디터의 `src/main`이 한다. 여기 함수는 호출자가 넘긴 창·`app`·`dialog`를 받아 쓴다.
- headless 내보내기를 실제로 수행하는 호스트는 `apps/shell/src/main/headless-export.ts`이고, 형식별 내보내기는 각 에디터가 한다. 여기는 문법과 봉투만 정의한다.
- 업데이트 확인의 구현은 shell(`updater.ts`)의 범위다. 메뉴는 `setUpdateCheckInvoker`로 주입된 함수를 클릭 시점에 부를 뿐이다. "업데이트 확인…"은 Windows·Linux에서 탭 줄 ☰ 팝업의 맨 아래 항목이고(`appMenuPopupTemplate`, shell의 `showAppMenu`가 붙인다), 도움말 메뉴에는 macOS에서만 들어간다(`helpCheckUpdatesItems`). 도움말 메뉴를 새로 만들 때 `checkUpdatesMenuItem`을 직접 넣지 않는다.
- 제품 이름과 저장소 좌표의 정의는 `packages/i18n`의 범위다. `github-menu.ts`는 그 값으로 URL을 만들기만 한다.
- AI 제공자, 구독 프로그램, 문서 엔진과는 무관하다. 구독 프로그램의 실행·종료를 여기에 두지 않는다.

## 항상 지켜야 하는 것

- `shell.openExternal`로 가는 모든 URL은 `safeExternalUrl`을 거친다. 허용 프로토콜은 http·https이고(호출자가 옵션으로 넓힌 경우만 추가) `file:`, `javascript:`, 사용자 정의 스킴은 항상 거절한다. 반환값이 `null`이면 열지 않는다. 원래 입력으로 되돌아가 여는 코드를 쓰지 않는다. 검사한 값이 아니라 반환된(공백이 잘린) 문자열을 연다.
- AI 도구 호출에서 온 주소는 프롬프트 주입으로 조작될 수 있다. 원격 요청은 `fetchWithSsrfGuard`로 하고, 리다이렉트를 자동으로 따라가게 두지 않는다. `isSafeRemoteUrl`로 한 번 검사하고 일반 `fetch`를 부르는 것은 충분하지 않다(검사와 요청 사이에 DNS가 바뀔 수 있다). 응답 본문은 `readBodyCapped`로 상한을 둔다.
- 로컬 파일을 URL로 읽어 주지 않는다. `readGeneratedImage`는 `GENERATED_IMAGE_DIR` 안의, uuid 이름에 이미지 확장자를 가진 파일만 읽고 그 밖의 `file://`에는 `null`을 준다. `saveImageFromUrl`은 `file:`을 받지 않는다.
- 모든 webContents는 한 번 로드된 뒤 다른 곳으로 탐색하지 않는다. `installNavigationGuard`가 같은 주소의 새로 고침 외의 탐색을 막고 `window.open`을 기본 거절한다. 외부 링크를 열어야 하는 에디터는 특정 webContents에만 자기 핸들러를 다시 건다. 이 잠금을 푸는 예외를 여기에 추가하지 않는다.
- 여러 번 설치되어도 한 번만 동작해야 한다. 에디터마다 이 패키지의 사본이 번들에 들어가고 shell이 그것들을 한 프로세스에서 돌리므로, 설치 표시는 모듈 변수가 아니라 사본들이 공유하는 `Symbol.for(...)` 키로 둔다(`navigation-guard.ts`는 `app` 객체에, `drop-open.ts`도 같은 방식이다). 새 "한 번만 설치" 함수도 같은 방식을 쓴다.
- 저장은 실패보다 완료가 우선이다. `atomicWriteFile`은 같은 폴더의 임시 파일에 쓰고 rename하되, Windows에서 백신·색인기가 대상을 잠깐 잠그면 다시 시도하고, 끝내 안 되면(일부 네트워크 드라이브는 덮어쓰는 rename을 거절한다) 제자리에 쓴다. fsync가 거절돼도 저장을 실패시키지 않는다. 이 대체 경로를 "원자성이 깨진다"는 이유로 지우지 않는다.
- headless 내보내기의 계약(`--headless-export <입력> --to <형식> --out <경로> [--json]`, 종료 코드 1 인자 오류 / 2 입력 파일 오류 / 3 변환 실패, 한 줄 봉투)은 `packages/cli`와 shell이 함께 읽는다. 바꾸려면 양쪽을 같이 바꾼다.
- 패키지 루트 진입점은 Electron에 묶여 있다(`renderer-protocol.ts`가 `net`·`protocol`을, `drop-open.ts`가 `ipcRenderer`·`webUtils`를 실행 시점에 import한다). Electron 없이 도는 코드(`packages/cli`의 번들, `packages/ai-search`)는 `package.json`의 `exports`에 있는 하위 경로(`/remote-image`, `/generated-images`, `/safe-remote-url`, `/atomic-write`, `/headless-export` 등)로만 import한다. 그런 코드가 써야 할 모듈을 새로 만들면 하위 경로로도 내보낸다.
- 내부 식별자는 원본 표기를 유지한다. 렌더러 스킴 `genoffice-app`(`RENDERER_SCHEME`), 임시 폴더 이름 `genoffice-ai-images`, 심볼 키 등은 사용자에게 보이지 않는 이름이라 바꾸지 않는다. 사용자에게 보이는 이름(메뉴의 제품 이름, 기본 저장 폴더 `<문서>/IeumOffice`)은 `@genoffice/i18n`의 `PRODUCT_NAME`·`productName`·`brandText`에서 가져온다.
- 저장하지 않은 파일 확인과 생성 넘겨주기의 상태는 `Symbol.for(...)` 키에 둔다. shell이 건 목록과 맡겨 둔 요청을, 번들에 따로 들어간 에디터의 사본이 같은 것으로 읽어야 한다. 열린 문서 목록이 없는 실행(에디터 단독 실행)에서는 아무것도 막지 않는다.
- 넘겨주기는 실행을 시작하지 않는다. 요청은 맡겨진 webContents와 종류에서만, 한 번만 가져갈 수 있고, 가져가기 전에 탭이 닫히면 버린다. 디스크에 아무것도 쓰지 않는다.
- 저장소 URL을 문자열로 다시 적지 않는다. `GITHUB_REPO_URL`·`GITHUB_ISSUES_URL`·`GITHUB_LATEST_RELEASE_URL`·`githubReleaseTagUrl`을 쓴다.
- **복구 사본의 이름 규칙을 바꾸지 않는다.** 워드(`docs-autosave`, `.docx`·ODT는 `.odt`)·엑셀(`sheets-autosave`, `.xlsx`)·파워포인트(`slides-autosave`, `.pptx`)의 폴더와 "편집기가 쥔 경로 문자열의 sha1 앞 16글자 + 확장자"는 이전 버전이 남긴 사본을 찾는 열쇠다. 경로를 정규화하거나 이름을 바꾸면 업데이트 전의 사본을 잃는다. 곁 정보가 없는 사본은 `later`로 읽는다.
- **곁 정보에 문서 내용을 넣지 않는다.** 저장소는 받은 바이트를 그대로 쓴다. 지킬 수 없는 문서(암호 엑셀·한글·PDF)의 평문을 넘기지 않는 것은 부르는 쪽의 책임이고, 워드·파워포인트는 같은 암호로 잠근 바이트를 넘긴다.
- **종료 래치가 서 있으면 `saved`·`dontSave` 말고는 지우지 않는다.** `deleteCopy`는 `'refused'`를 돌려주고, `pruneStaleCopies`와 `applyLaunchDecision`의 버리기도 아무것도 하지 않는다. 편집기의 닫기 정리가 방금 쓴 사본을 지우지 못하게 하는 장치다. 예외를 넓히지 않는다.
- **지우기 뒤에 끝나는 쓰기는 사본을 되살리지 않는다.** 지우기는 그 문서의 순번을 올리고, 그 전에 받은 표(`beginWrite`)로 쓰는 일은 `'superseded'`로 끝나 디스크에 아무것도 남기지 않는다. 메인 프로세스에서 오래 직렬화하는 호출자는 직렬화를 시작하기 전에 표를 받는다.
- **"저장 안 함"으로 지운 문서는 다시 쓰지 않는다.** `deleteCopy(id, 'dontSave')`는 그 문서를 막아 두고, 막힌 동안 `writeCopy`·`writeCopyStreamed`는 쓰지 않고(흘려 쓰는 함수도 부르지 않고) `'superseded'`를 돌려준다. 창 닫기는 탭을 하나씩 묻기 때문에, 먼저 "저장 안 함"으로 답한 탭도 뒤 탭의 물음이 끝날 때까지 편집 내용을 쥔 채 살아 있다. 막음은 닫기가 취소될 때(`resumeDiscardedCopies`, 껍데기 앱이 부른다) 모두 풀리고, 그 문서를 다시 열 때(`openPlan`, `markCopyLoaded`, `clearDiscarded`) 그 문서만 풀린다. 같은 파일을 보는 다른 창이 있어 그 사본을 계속 써야 하면 편집기가 `clearDiscarded`를 부른다.
- 종료 래치, 지우기 순번, 문서별 쓰기 줄, "저장 안 함" 막음, 실행 식별자, 편집기 약속 등록표는 `Symbol.for(...)` 키에 둔다. 편집기마다 이 패키지의 사본이 번들에 들어가므로, shell이 세운 래치와 등록표를 편집기의 사본이 같은 것으로 읽어야 한다.
- 문서별 물음은 문서 이름을 보이고, 단추는 "되살리기"·"버리기" 둘이며, Esc와 창 닫기는 되살리기다. 파일이 사본보다 새로우면 그 줄을 더하고 사본을 조용히 지우지 않는다. 이 기본값을 바꾸지 않는다.

## 이 모듈의 방식

- Electron 타입은 `import type`으로만 쓰거나 필요한 부분만 구조적으로 선언한다(`PathProvider`, `DestroyableSender`, `PrintWindow`). 그래서 대부분의 함수가 Electron 없이 단위 테스트된다. 새 도우미도 `app`·`dialog`·창을 인자로 받게 만든다.
- 프로세스에 하나뿐인 상태는 모듈 변수로 둔다. `setHeadlessMode`는 shell이 `--headless-export` 진입에서 에디터 코드가 등록되기 전에 한 번 켠다. 저장 뒤에 탭을 열거나 폴더를 보여 주는 코드는 `isHeadlessMode()`를 먼저 확인한다.
- `registerSchemesAsPrivileged`는 프로세스에서 한 번만 부를 수 있다. 다른 스킴도 등록하는 호스트는 `registerRendererScheme`을 부르지 않고 `RENDERER_SCHEME_PRIVILEGE`를 자기 목록에 펼쳐 넣는다. `resolveRendererFile`은 모르는 호스트와 폴더를 벗어나는 경로에 `null`을 준다.
- 끌어다 놓기는 preload에서 경로를 풀어 채널 하나(`DROP_OPEN_CHANNEL`)로 보낸다. 받을 수 있는 확장자 `OPENABLE_DOC_RE`는 shell의 라우팅과 홈 화면의 열기 대화 상자 목록과 맞춰야 한다. `.odt`는 워드 탭이 여는 지원 형식이고, "지원하지 않음" 목록 `KNOWN_UNSUPPORTED_DOC_RE`는 shell `launch-paths.ts`의 `UNSUPPORTED_LAUNCH_RE`와 같아야 한다. 자기 영역의 드롭을 직접 처리하는 화면 요소는 이벤트를 취소해 이 다리가 끼어들지 않게 한다.
- AI가 만든 HTML을 인쇄할 때는 `sanitizePrintableBody`로 허용 태그만 남기고 속성과 URL을 모두 지운 뒤, 임시 파일로 불러온다(`data:` URL은 긴 문서를 잘라 버린다). 창과 임시 폴더는 어떤 결과에서도 치운다.
- 기본 저장 폴더는 설정된 폴더가 쓸 수 없으면(뽑힌 드라이브, 권한 회수) 대체 폴더로 내려간다. 조용한 저장이 깨지지 않게 하기 위해서다.
- 이 패키지는 `@genoffice/i18n`을 import하지만 `package.json`의 `dependencies`에는 `parse5`만 있다(workspace 호이스팅에 기대는 기존 구조다).

## 테스트

- 실행: `npm run test -w @genoffice/electron-utils`(또는 이 폴더에서 `npx vitest run`), `npm run typecheck -w @genoffice/electron-utils`.
- 바꾸면 반드시 테스트하는 것: `safeExternalUrl`의 거절 목록(앞뒤 공백, 대소문자가 섞인 스킴), 차단 주소 판정(IPv4로 매핑된 IPv6, 정규화된 표기), 리다이렉트가 내부 주소로 향하는 경우, 본문이 상한을 넘는 응답과 `Content-Length`가 거짓인 응답, `readGeneratedImage`에 준 저장소 밖 경로, rename이 계속 실패할 때의 제자리 쓰기.
- 바꾸면 반드시 테스트하는 것(복구 사본): 이전 세 편집기와 같은 경로 규칙, 원자적 쓰기와 흘려 쓰기, 지우기와 늦은 쓰기의 경쟁, 곁 정보에 내용이 없음, 종료 래치 동안의 거절, 30일 정리, 상태 셋의 바뀜, 문서별 물음의 Esc(`tests/recovery-store.test.ts`, `tests/recovery-prompt.test.ts`, `tests/recovery-contract.test.ts`).
- 네트워크를 쓰는 함수는 `fetchImpl` 옵션으로 `fetch`를 주입받는다. 테스트는 가짜를 넘겨 요청이 실제로 나가지 않게 한다. 주소 검사는 호스트 이름을 실제로 조회하므로 `tests/remote-image.test.ts`처럼 이름을 쓰는 테스트는 DNS가 되는 환경이어야 한다.
- Windows에서 변경과 무관하게 실패하는 테스트가 세 건 있다. `tests/dialog-memory.test.ts` 두 건은 기대값이 `/work`인데 Windows에서는 `\work`가 나오고, `tests/default-save-dir.test.ts`의 "쓰기 불가 폴더" 한 건은 `chmod`로 만든 읽기 전용 폴더가 Windows에서는 쓰기 가능으로 판정된다.
- 실제 Electron이 있어야 하는 부분(프로토콜 등록, 실제 인쇄 대화 상자, 실제 끌어다 놓기)은 단위 테스트로 돌릴 수 없다. 앱을 띄워 확인한다.
