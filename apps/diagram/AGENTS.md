# apps/diagram (`@genoffice/diagram`)

다이어그램 편집기다. draw.io(jgraph/drawio, Apache-2.0) 웹 편집기를 PC 안에서만 띄워 `.drawio`·`.dio`·`.drawio.svg`·`.drawio.png`를 탭에서 열고 고치고 저장하고 내보낸다. 화면에 보이는 이름은 "다이어그램"이고, "draw.io"는 어떤 파일을 다루는지 알리는 데만 쓴다(열기·저장 창의 형식 이름). draw.io 로고는 쓰지 않는다. 파일 형식·읽기 표·연산의 뜻은 `packages/drawio-model`에 있고, 이 모듈은 draw.io를 띄워 그 결과를 디스크와 잇는다. 기준 문서는 다이어그램 작업의 `spec.md` 3·4·5·6절이다.

## 맡은 범위

- 메인 프로세스(`src/main/`). 셸이 상대 경로로 가져와 셸 번들 안에서 돈다.
  - `diagram-main.ts`: 보기 만들기(`createDiagramView`), 열기와 거절, 저장 두 단계(`diagram:save-target`이 어디에 쓸지 정하고 한 번 쓰는 표를 주면, `diagram:save`가 그 형식으로 draw.io가 만든 바이트를 쓴다), 프로젝트로 저장, 닫기 확인, 이름 바뀜 따라가기, 링크 열기, 메뉴·내보내기·인쇄 요청 전달, 복구 사본 계약 등록, 단독 실행(`startDiagramStandalone`). 셸에 내보내는 함수는 아래 "셸과의 약속"에 있다.
  - `diagram-session.ts`: 다이어그램 탭 전용 **지속 세션 파티션**(`persist:ieum-diagram`). 이 세션에 `drawio-app://`와 앱 렌더러 프로토콜(`genoffice-app://diagram/…`)을 등록하고, 요청 거절(`webRequest.onBeforeRequest`), 맞춤법 사전 받기 끔, 권한(클립보드 쓰기만)을 건다. 세션이 본 요청 수와 거절한 주소를 `diagramRequestLog()`로 내준다.
  - `drawio-protocol.ts`: `drawio-app://editor/…`. 정리한 draw.io 묶음 폴더 안의 파일만 GET·HEAD로 낸다(`..`·인코딩한 구분자·NUL·폴더 밖 경로 거절). `index.html`을 낼 때만 `<head>` 맨 앞에 우리 다리 스크립트(`/__ieum/bridge.js`) 한 줄을 끼운다. 인쇄할 쪽 문서는 `/__ieum/print/<표>`로 한 번만 낸다. 모든 응답에 CSP와 `nosniff`를 붙인다.
  - `network-guard.ts`: 요청 허용 판정(앱 렌더러 스킴, `drawio-app:`, `data:`, `blob:`만, 개발 실행일 때만 개발 서버의 localhost), 새 창 거절, 이동 규칙, 요청 기록.
  - `export-main.ts`·`export-paths.ts`·`print-document.ts`: PNG·SVG 파일 쓰기(쪽이 여럿이면 `<이름>-p<쪽 번호>.<확장자>`, 이미 있는 파일은 물은 뒤 바꿈), PDF와 인쇄. PDF와 인쇄는 다이어그램 세션의 숨은 창에 쪽마다 한 장(그 쪽의 용지 크기, draw.io 단위 1/100인치)인 문서를 띄워 Electron이 만든다. draw.io의 인쇄 창은 쓰지 않는다.
  - `recovery-main.ts`: 복구 사본(결정 0061). 마인드맵 편집기의 것과 같고 `<userData>/diagram-autosave`에 둔다. 공용 저장소가 `diagram` 종류를 알기 전(`RECOVERY_EDITOR_KINDS`, 셸 연결 작업이 더한다)에는 사본을 쓰지 않고 파일을 그대로 연다.
  - `i18n-main.ts`: 뒷단이 직접 보이는 글(저장·내보내기 창, 닫기 확인). 글은 `renderer/i18n/app`의 사전 하나에 있다.
- preload(`src/preload/index.ts`): 편집기 화면에만 `window.diagramApi`와 셸 공용 다리(화면 나누기, 프로젝트 폴더, 끌어다 놓기)를 연다. draw.io 틀에는 아무것도 주지 않는다.
- 다리 스크립트(`src/bridge/`, 빌드 결과 `out/bridge/bridge.js`): draw.io 틀 안에서 도는 우리 스크립트 하나.
  - `bridge.ts`: draw.io보다 먼저 돌며 `DRAWIO_CONFIG`를 고정하고(draw.io의 PreConfig가 덮지 못하게), 로고·draw.io 사이트 링크·도움말 아이콘을 숨기고, `App.main`을 잡아 편집기 객체를 얻는다. 그 뒤 화면에서 뺄 동작을 숨기고, 앱이 대신할 동작(도움말, 인쇄, PNG·SVG·PDF 내보내기, 저장)을 앱으로 보내고, Ctrl+S·Ctrl+Shift+S·Ctrl+P를 앱으로 보내고, 사람이 누른 링크만 앱으로 보내고, 되돌리기 기록으로 바뀜 여부를 알리고, 앱의 요청(쪽 XML, 선택, 기본 변경 적용, 어두운 보기, 압축, 쪽 그림, 메뉴 동작)에 답한다.
  - `apply-primitives.ts`: 기본 변경(`DiagramPrimitive`)을 살아 있는 다이어그램에 **되돌리기 한 번**으로 넣는 규칙. 먼저 전부 검사하고, `beginUpdate()`/`endUpdate()` 한 번 안에서 넣고, 다른 쪽의 셀은 그 안에서 쪽을 바꿔(draw.io의 `SelectPage`) 고친 뒤 원래 쪽으로 돌아온다. draw.io가 도중에 실패하면 그 단계를 되돌리고 기록에서 지운다.
  - `drawio-adapter.ts`: 위 규칙을 draw.io의 객체(`EditorUi`, 모델, 쪽, 되돌리기 관리자)에 잇는다. `shortcuts.ts`: 앱이 가져가는 단축키.
- 공용(`src/shared/`): 창구 표와 자료 모양(`ipc.ts`), 형식별 저장 판단(`formats.ts`), 틀과 다리 사이 메시지와 출처 확인(`bridge-protocol.ts`), draw.io 시작 인자·설정·숨길 목록(`drawio-start.ts`), 열 때 알림 세기(`notices.ts`), 링크 규칙(`links.ts`).
- 화면(`src/renderer/`)
  - `App.tsx`: draw.io 틀, 시작 진행 표시, 알림 띠, 상태 줄(바뀜 표시, 자동 저장), 내보내기 창(모든 쪽/지금 쪽), 열기 흐름, 저장, 자동 저장(30초와 창이 초점을 잃을 때), 복구 사본, 언어·테마 따라가기, 셸 메뉴와 앱 안 MCP 질문(읽기 표, 연산 적용, 저장할 바이트)에 답하기.
  - `drawio/frame-client.ts`: 틀 쪽 통신(`DrawioFrame`). draw.io 임베드 방식(`init`·`load`·`export`)과 다리 요청을 번호로 짝짓는다. 내보내기는 하나씩 차례로 한다.
  - `document/importers.ts`: 다른 프로그램 파일(`.vsdx`)을 새 다이어그램으로 바꾸는 자리. Visio 작업이 `registerDiagramImporter('vsdx', …)`로 채운다. `document/live-ops.ts`: 연산을 지금 다이어그램에 계획해 한 번에 넣기(AI 창·앱 안 MCP가 쓴다). `document/recovery-copies.ts`: 사본 만들기 시점.
  - `i18n/app/<언어>.ts` 21개(`zh.ts`가 키 집합), `strings-app.ts`, `locale.tsx`. `theme.ts`: 앱 테마 → draw.io 어두운 보기.

## 맡지 않는 것 (경계)

- 파일 형식, 원본 꺼내기, 읽기 표, 연산의 뜻과 거절 이유, XML에 쓰기는 `packages/drawio-model`의 범위다. 여기서 다시 판단하지 않는다.
- draw.io 묶음을 받고 정리하고 라이선스를 검사하는 일은 `vendor/drawio/`(빌드 때 `prepare.mjs`)가 한다.
- 탭, 창, 메뉴, 홈, 열기 창 필터, 연결 프로그램 등록, 특권 프로토콜 목록, 앱 안 MCP 다리, 도움말 창 열기는 `apps/shell`의 범위다. 이 모듈은 셸이 부를 함수와 넣을 항목을 내보내기만 한다.
- AI 창과 다이어그램 도구, Mermaid 넣기, Visio 가져오기는 각자의 작업이 이 모듈에 더한다(창구 이름은 `ipc.ts`에 이미 있다).

## 항상 지켜야 하는 것

- **다이어그램 탭은 이 PC 밖으로 요청을 하나도 보내지 않는다.** 세 겹을 모두 유지한다. ① draw.io 시작 인자(`embed=1&proto=json&offline=1&stealth=1&lockdown=1`)와 설정(자체 AI·웹 글꼴·내보내기 서버·플러그인·서비스 워커 끔). ② 전용 파티션의 요청 거절(앱 렌더러 스킴·`drawio-app:`·`data:`·`blob:`만, 개발 서버는 개발 실행에서만). ③ 새 창은 늘 거절, 화면은 제자리, draw.io 틀은 draw.io 시작 쪽에만. 여기에 draw.io 쪽 CSP(스크립트는 우리 스킴에서만, `unsafe-eval` 없음, 바깥 연결 없음)가 더해진다. 셋 중 하나라도 느슨하게 하지 않는다.
- **draw.io의 파일은 고치지 않는다.** 바꿔야 할 것은 프로토콜이 `index.html`에 끼우는 다리 스크립트 한 줄과 설정으로만 한다. `out/drawio/`의 파일은 `vendor/drawio/`가 만든 그대로 낸다.
- **`file://`로 draw.io를 띄우지 않는다.** draw.io는 `drawio-app://editor/`에서만 돈다.
- **메시지는 보낸 창과 출처를 확인한다.** 화면은 draw.io 틀의 창·`drawio-app://editor`에서 온 것만, 다리는 부모 창·부모 출처에서 온 것만 읽는다. 우리가 보내는 메시지는 그 출처로만 보내고 `*`로 보내지 않는다.
- **바뀐 것이 없으면 파일을 다시 쓰지 않는다.** Ctrl+S, 자동 저장, 메뉴 저장, 앱 안 MCP 저장 모두. 뒷단이 마지막으로 열었거나 쓴 경로에 바뀜 없이 오는 저장은 쓰지 않는다.
- **열지 못한 파일에는 쓰지 않는다.** 경로가 저장 대상이 되는 것은 뒷단이 그 바이트를 다이어그램으로 연 뒤다. 렌더러가 보낸 바이트도 대상 형식으로 열려야 쓴다. 가져온 `.vsdx`에는 쓰지 않는다.
- **저장은 draw.io의 직렬화 그대로다.** `.drawio`·`.dio`는 `xml`, `.drawio.svg`는 `xmlsvg`(테마와 상관없게 `theme: 'auto'`), `.drawio.png`는 `xmlpng`(웹판처럼 첫 쪽 그림). 쪽 압축은 연 파일을 따르고 새 다이어그램은 압축하지 않는다.
- **PNG·PDF·인쇄는 앱 테마와 상관없이 같다.** PNG는 다리가 `light`로 그리고, PDF·인쇄는 `light` SVG와 흰 바탕으로 만든다. 어두운 보기는 화면에서만이다(결정 0103의 "화면 색" 예외).
- **링크는 사람이 누른 것만, `http:`·`https:`·`mailto:`만 연다.** 다리는 사용자 동작이 있을 때만 앱에 넘기고, 뒷단이 `openableLink`로 다시 확인한 뒤 기본 브라우저로 연다. draw.io 화면의 일반 링크는 틀을 떠나지 못하게 막는다.
- **창구 이름은 `diagram:`으로 시작한다.** `src/shared/ipc.ts`에 있는 이름만 쓴다. 공용 `ai:*`와 구독 창구는 등록하지 않는다.
- 문구는 21개 언어 조각에 모두 넣는다. 제품 이름은 `GenOffice`로 적는다.

## 셸과의 약속

- 셸이 할 일: 특권 스킴 목록에 `DRAWIO_SCHEME_PRIVILEGE`를 더한다. `configureDiagramRuntime({ preloadPath, rendererUrl, rendererFile, drawioDir?, bridgeFile?, packaged?, newDocumentDir?, writeNewDocument? })`로 경로를 준다(묶음은 기본으로 `<모듈 출력>/drawio`, 다리는 `<모듈 출력>/bridge/bridge.js`). 기본 세션의 `installRendererProtocol`에 `diagram`을 더한다(파티션 쪽은 이 모듈이 등록한다). 복구 저장소의 편집기 목록에 `diagram`을 더한다.
- 내보내는 함수: `createDiagramView`, `requestDiagramSave`, `requestDiagramClose`, `diagramSaveToPath`, `diagramIsDirty`, `diagramFilePath`, `diagramFileRenamed`, `diagramTabIdentity`, `discardDiagramRecovery`, `diagramRecoveryIdentity`, `writeDiagramCopiesNow`, `openDiagramFileWithDecision`, `openDiagramUntitledCopy`, `queueDiagramSeedFor`, `sendDiagramMenuCommand`, `sendDiagramExportRequest`, `sendDiagramPrintRequest`, `setDiagramFileSavedHook`, `setDiagramRecoveryTitleHook`, `setDiagramHelpHook`, `diagramRequestLog`, 상수 `DIAGRAM_PARTITION`, `DRAWIO_SCHEME_PRIVILEGE`.
- 탭의 정체(`DiagramTabIdentity`): `{ sourcePath, untitled, title, imported? }`. 가져온 `.vsdx` 탭은 `sourcePath`가 그 파일, `untitled: true`, `imported: 'vsdx'`다. 같은 경로를 다시 열 때 이 값으로 그 탭을 찾는다.

## 테스트

- 실행: `npm run test -w @genoffice/diagram`, `npm run typecheck -w @genoffice/diagram`, `npm run build -w @genoffice/diagram`(draw.io 묶음과 다리 스크립트까지).
- 바꾸면 반드시 테스트하는 것: 형식별 저장·압축·이름(`formats.test.ts`), 프로토콜 경로·끼우기·CSP(`protocol.test.ts`), 요청 허용·이동·새 창·링크(`network-guard.test.ts`), 메시지 출처와 틀 통신(`bridge-protocol.test.ts`), 기본 변경의 한 번 되돌리기·쪽 바꾸기·실패 시 원상(`apply-primitives.test.ts`, draw.io를 흉내 낸 가짜 모델), 알림 세기·인쇄 문서·시작 인자·사본·21개 언어(`editor-parts.test.ts`), 뒷단의 열기·거절·저장 생략·저장 대상(`main.test.ts`, Electron은 가짜).
- 빌드한 편집기에서만 확인되는 것(draw.io를 띄운 바깥 요청 0건, 실제 저장·다시 열기, 밝은·어두운 테마의 결과 비교)은 스크립트로 Electron을 직접 띄워 확인하고, 셸 연결 뒤에는 E2E(`e2e/diagram-*.spec.ts`)가 맡는다.

## 알려진 한계

- 언어를 바꾸면 draw.io를 다시 띄우므로 되돌리기 기록이 사라진다(저장하지 않은 내용은 지킨다).
- PDF는 Chromium이 만든 날짜(`CreationDate`·`ModDate`)만 매번 다르다. 그 밖의 바이트는 두 테마에서 같다.
- `.drawio.svg` 저장과 SVG 내보내기에는 draw.io가 매번 새로 짓는 무작위 id가 들어간다. 같은 테마에서도 바이트가 매번 다르고, 그 id를 빼면 두 테마의 결과가 같다.
- draw.io 코드가 스스로 틀의 주소를 바꾸면(우리가 남긴 화면에서는 일어나지 않는다) 바깥 요청은 CSP와 세션이 막지만 틀이 오류 쪽이 된다. 일반 링크 클릭은 다리가 막는다.
