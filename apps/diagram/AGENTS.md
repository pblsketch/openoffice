# apps/diagram (`@genoffice/diagram`)

다이어그램 편집기다. draw.io(jgraph/drawio, Apache-2.0) 웹 편집기를 PC 안에서만 띄워 `.drawio`·`.dio`·`.drawio.svg`·`.drawio.png`를 탭에서 열고 고치고 저장하고 내보낸다. 화면에 보이는 이름은 "다이어그램"이고, "draw.io"는 어떤 파일을 다루는지 알리는 데만 쓴다(열기·저장 창의 형식 이름). draw.io 로고는 쓰지 않는다. 파일 형식·읽기 표·연산의 뜻은 `packages/drawio-model`에 있고, 이 모듈은 draw.io를 띄워 그 결과를 디스크와 잇는다. 계획과 까닭은 `docs/plans/diagram-editor.md`와 결정 0103(`docs/tracking/decisions/0103-diagram-editor.md`)에 있다.

## 맡은 범위

- 메인 프로세스(`src/main/`). 셸이 상대 경로로 가져와 셸 번들 안에서 돈다.
  - `diagram-main.ts`: 보기 만들기(`createDiagramView`), 열기와 거절, 저장 두 단계(`diagram:save-target`이 어디에 쓸지 정하고 한 번 쓰는 표를 주면, `diagram:save`가 그 형식으로 draw.io가 만든 바이트를 쓴다), 프로젝트로 저장, 닫기 확인, 이름 바뀜 따라가기, 링크 열기, 메뉴·내보내기·인쇄 요청 전달, 복구 사본 계약 등록, 단독 실행(`startDiagramStandalone`). 셸에 내보내는 함수는 아래 "셸과의 약속"에 있다.
  - `diagram-session.ts`: 다이어그램 탭 전용 **지속 세션 파티션**(`persist:ieum-diagram`). 이 세션에 `drawio-app://`와 앱 렌더러 프로토콜(`genoffice-app://diagram/…`)을 등록하고, 요청 거절(`webRequest.onBeforeRequest`), 맞춤법 사전 받기 끔, 권한(클립보드 쓰기만)을 건다. 세션이 허락한 요청 수, 거절한 요청 수(`refused`)와 마지막으로 거절한 주소 100개(`blocked`, 쿼리 없이)를 `diagramRequestLog()`로 내준다. 창 없는 일의 결과 `detail.requests`도 이 셋이다.
  - `drawio-protocol.ts`: `drawio-app://editor/…`. 정리한 draw.io 묶음 폴더 안의 파일만 GET·HEAD로 낸다(`..`·인코딩한 구분자·NUL·폴더 밖 경로 거절). `index.html`을 낼 때만 `<head>` 맨 앞에 우리 다리 스크립트(`/__ieum/bridge.js`) 한 줄을 끼운다. 인쇄할 쪽 문서는 `/__ieum/print/<표>`로 한 번만 낸다. 모든 응답에 CSP와 `nosniff`를 붙인다.
  - `network-guard.ts`: 요청 허용 판정(앱 렌더러 스킴, `drawio-app:`, `data:`, `blob:`만, 개발 실행일 때만 개발 서버의 localhost), 새 창 거절, 이동 규칙, 요청 기록.
  - `export-main.ts`·`export-paths.ts`·`print-document.ts`: PNG·SVG 파일 쓰기(모든 쪽이면 쪽이 하나여도 쪽마다 `<이름>-p<쪽 번호>.<확장자>`, 지금 쪽이면 고른 이름 하나. 명령줄 `convert`도 같은 `pageFilePaths`를 쓴다. 이미 있는 파일은 물은 뒤 바꿈), PDF와 인쇄. PDF와 인쇄는 다이어그램 세션의 숨은 창에 쪽마다 한 장(그 쪽의 용지 크기, draw.io 단위 1/100인치)인 문서를 띄워 Electron이 만든다. draw.io의 인쇄 창은 쓰지 않는다.
  - `headless-main.ts`: 창 없는 일(`--headless-export`의 다이어그램 몫, `docs/headless-pdf-export.md`). 셸이 `exportDiagramHeadless`를 부른다. `createDiagramHiddenWindow`(`diagram-main.ts`)가 탭과 같은 세션·막기·허락한 파일로 숨은 창을 만들고(복구 사본은 묻지 않고 저장된 파일을 연다), 화면은 일 하나를 하고 보고한다(`diagram:headless-job`·`diagram:headless-done`). PDF·PNG·SVG는 내보내기 메뉴와 같은 함수로 만들고, 다이어그램 파일은 AI 창의 실행기(`applyLiveOps`, 묶음 방식과 기본 쪽을 받는다)로 연산을 한 뒤 저장과 같은 직렬화로 받아, 다이어그램으로 열리는 바이트만 쓴다. 파일은 뒷단이 쓴다.
  - `open-check.ts`: 셸이 탭을 열기 전에 묻는 "다이어그램으로 열리는가"(Electron 없음). `diagramOpenRefusal`은 `.drawio`·`.dio`·`.drawio.svg`·`.drawio.png`를 모델의 `openDiagram`으로 열어 보고, 열리지 않으면 편집기의 실패 문구(`shared/open-failure.ts`의 `OPEN_FAILURE_KEYS`, 원본이 없는 그림은 `failNoOriginal`)를 앱 언어로 돌려준다. 그 파일의 복구 사본이 있으면 거절하지 않는다(편집기가 사본을 권한다). `visioOpenRefusal`은 `.vsdx`가 압축 관문(`@genoffice/zip-gate`)을 지나고 Visio 도면(`visio/document.xml`과 Visio 내용 형식)인지만 본다. 실제 가져오기는 탭 안의 draw.io가 한다.
  - `recovery-main.ts`: 복구 사본(결정 0061). 마인드맵 편집기의 것과 같고 `<userData>/diagram-autosave`에 둔다. 공용 저장소가 `diagram` 종류를 알기 전(`RECOVERY_EDITOR_KINDS`, 셸 연결 작업이 더한다)에는 사본을 쓰지 않고 파일을 그대로 연다.
  - `i18n-main.ts`: 뒷단이 직접 보이는 글(저장·내보내기 창, 닫기 확인). 글은 `renderer/i18n/app`의 사전 하나에 있다.
  - `mcp-queries.ts`: 앱 안 MCP 서버가 화면에 묻는 것(`diagram:read-request`·`diagram:apply-request`). `diagramReadText`는 모든 쪽, `diagramReadPage`는 한 쪽(쪽을 주지 않으면 화면의 쪽, `current: true`)의 읽기 표를 글(`text`)과 값(`pages`, `page`. 앱 안 MCP `read_diagram`의 객체)으로 함께 준다. 값은 화면이 `diagram:read-result`에 `read`로 실어 보낸다. 읽기는 draw.io가 뜨는 동안 답이 없으므로 답이 올 때까지 다시 묻는다. `diagramApplyOps`는 읽기에 답이 온 뒤(화면이 듣고 있다는 뜻) 연산 목록을 **한 번만** 보낸다(다시 보내면 두 번 적용된다). 한 보기의 적용은 하나씩 차례로 돈다. 답은 질문의 id와 물은 보기에서 온 것만 받는다. 파일은 쓰지 않는다(저장은 `diagramSaveToPath`).
  - `ai-attachments.ts`: AI 창의 첨부(`diagram:files-*`: 고르기, 끌어다 놓기·붙여넣기, 클립보드 그림, 글 읽기, 그림 읽기)와 이름 없는 다이어그램의 임시 이름(`diagram:provisional-title`, 첫 요청의 첫 줄). 마인드맵 편집기의 것과 같은 규칙이다(형식 목록은 `packages/file-parse`, 바뀐 채 열린 파일은 읽지 않음, 한 번에 48,000자). `registerDiagramAiIpc`는 `createDiagramView`가 부르는 등록 함수 안에서 불리고 두 번째 호출은 아무것도 하지 않는다. 파일이 있거나 가져온 파일로 만든 탭에는 임시 이름을 붙이지 않는다.
- preload(`src/preload/index.ts`): 편집기 화면에만 `window.diagramApi`(편집기 창구와 AI 창의 다리: 첨부, 공용 `ai:*`·구독 창구 부르기, 창 설정)와 셸 공용 다리(화면 나누기, 프로젝트 폴더, 끌어다 놓기, 대화 기록 `projectApi`, 드라이브, 인터넷 도구 스위치, 사용자 MCP, 사용자 스킬, 문서 붙이기)를 연다. draw.io 틀에는 아무것도 주지 않는다.
- 다리 스크립트(`src/bridge/`, 빌드 결과 `out/bridge/bridge.js`): draw.io 틀 안에서 도는 우리 스크립트 하나.
  - `bridge.ts`: draw.io보다 먼저 돌며 `DRAWIO_CONFIG`를 고정하고(draw.io의 PreConfig가 덮지 못하게), 로고·draw.io 사이트 링크·도움말 아이콘을 숨기고, `App.main`을 잡아 편집기 객체를 얻는다. 그 뒤 화면에서 뺄 동작을 숨기고, 앱이 대신할 동작(도움말, 인쇄, PNG·SVG·PDF 내보내기, 저장)을 앱으로 보내고, draw.io의 도움말 메뉴에 앱 도움말과 단축키 그림(draw.io 대화상자 안)을 두고, Ctrl+S·Ctrl+Shift+S·Ctrl+P와 F1(도움말)을 앱으로 보내고, 사람이 누른 링크만 앱으로 보내고, 되돌리기 기록으로 바뀜 여부를 알리고, 앱의 요청(쪽 XML, 선택, 기본 변경 적용, Visio 가져오기, 어두운 보기, 압축, 쪽 그림, 메뉴 동작)에 답한다.
  - `apply-primitives.ts`: 기본 변경(`DiagramPrimitive`)을 살아 있는 다이어그램에 **되돌리기 한 번**으로 넣는 규칙. 먼저 전부 검사하고, `beginUpdate()`/`endUpdate()` 한 번 안에서 넣고, 다른 쪽의 셀은 그 안에서 쪽을 바꿔(draw.io의 `SelectPage`) 고친 뒤 원래 쪽으로 돌아온다. draw.io가 도중에 실패하면 그 단계를 되돌리고 기록에서 지운다.
    AI 도구 호출 하나는 단계 목록(`applyStepsLive`)이다. 기본 변경 묶음과 변환된 Mermaid 그림(`kind: 'mermaid'`)을 차례로, 같은 검사 규칙과 **같은 한 번의 편집** 안에서 넣는다. 그림이 아무것도 더하지 않거나 draw.io가 도중에 실패하면 호출 전체를 되돌린다.
  - `mermaid.ts`: draw.io 자신의 Mermaid 변환기(`EditorUi.parseMermaidDiagram`, draw.io의 삽입 › Mermaid와 같은 그룹 감싸기)로 바꾸기만 한다(다이어그램은 바뀌지 않는다). 지금 기본값이 웹 글꼴을 쓰면(Mermaid 12의 redux 테마) 버전 없이(Mermaid 11 기본값) 바꿔 바깥 글꼴 주소가 그림에 들어가지 않게 한다. 변환기가 거절하면 그 까닭 그대로 실패한다.
  - `visio.ts`: draw.io 자신의 Visio 가져오기(`EditorUi.importVisio`, 그 안의 `mxVsdxCodec`)로 `.vsdx` 바이트를 draw.io XML로 바꾸기만 한다(화면의 다이어그램은 바뀌지 않는다). 가져오기에는 늘 `.vsdx` 이름(`drawing.vsdx`)을 주어 draw.io가 옛 형식(`.vsd`·`.vdx`·`.vss`…)의 다른 변환 경로를 타지 않게 한다. draw.io는 압축된 쪽을 내므로 쪽을 풀어(`Graph.decompress`) 돌려주고, 바꾸지 못한 그림 수(`shared/visio-pictures.ts`)를 함께 센다.
  - `libavoid-guard.ts`: 묶음에 libavoid 경로 계산 핵심(`AvoidRouting`)이 없는 동안 draw.io의 실시간 자동 경로(`LibavoidRouting.installAutoRouting`)를 설치하지 않게 막는다. 설치되면 도형을 옮길 때마다 없는 핵심을 불러 "AvoidRouting is not defined"로 실패했다(도형 끌기, 가져오기, Mermaid 넣기 모두).
  - `drawio-adapter.ts`: 위 규칙을 draw.io의 객체(`EditorUi`, 모델, 쪽, 되돌리기 관리자)에 잇는다. 편집 중에 쪽을 바꿀 때는 떠나는 쪽을 "바뀜"으로 표시해 그 쪽의 저장 XML을 다시 받게 한다(draw.io는 화면의 쪽만 다시 받으므로, 표시하지 않으면 다른 쪽에 넣은 셀이 저장에서 빠진다). Mermaid 그림은 draw.io의 `importXml`로 넣는다(잘라 맞추기, 변환된 다이어그램의 선 스타일, 오류는 던지기). `shortcuts.ts`: 앱이 가져가는 단축키.
  - `dirty.ts`: 바뀜 표시가 셈하는 단계. draw.io가 보기만 바꾼 단계(`ignoreEdit`, 쪽 바꾸기)는 되돌리기 기록에 있어도 셈하지 않는다. 쪽만 바꾼 다이어그램은 바뀌지 않았고, 저장해도 쓰지 않는다.
  - `link-clicks.ts`: 사람이 누른 링크(도형 아래 링크, 글 안의 링크, 대화상자의 링크)를 틀이 따라가지 못하게 막고 `http:`·`https:`·`mailto:`만 앱에 넘긴다. 한 번 누름이 draw.io의 `openLink`와 클릭으로 두 번 와도 한 번만 넘긴다.
- 공용(`src/shared/`): 창구 표와 자료 모양(`ipc.ts`), 형식별 저장 판단(`formats.ts`), 틀과 다리 사이 메시지와 출처 확인(`bridge-protocol.ts`), draw.io 시작 인자·설정·숨길 목록(`drawio-start.ts`), 열 때 알림 세기(`notices.ts`), Visio 가져오기에서 그려지지 않는 그림 세기(`visio-pictures.ts`), 링크 규칙(`links.ts`).
- 화면(`src/renderer/`)
  - `headless.ts`: 창 없는 일의 화면(`?headless=1`). 편집기 대신 draw.io 틀만 띄워 일 하나(`runHeadlessJob`)를 하고 보고한다. 저장·자동 저장·복구 사본·AI는 없다. `document/page-pictures.ts`: 쪽 그림(PNG, SVG 파일 머리, PDF용 밝은 SVG)을 `App.tsx`와 함께 쓴다.
  - `App.tsx`: draw.io 틀, 시작 진행 표시, 알림 띠, 상태 줄(바뀜 표시, 자동 저장), 내보내기 창(모든 쪽/지금 쪽), 열기 흐름, 저장, 자동 저장(30초와 창이 초점을 잃을 때), 복구 사본, 언어·테마 따라가기, 셸 메뉴와 앱 안 MCP 질문(읽기 표, 연산 적용, 저장할 바이트)에 답하기.
  - `drawio/frame-client.ts`: 틀 쪽 통신(`DrawioFrame`). draw.io 임베드 방식(`init`·`load`·`export`)과 다리 요청을 번호로 짝짓는다. 내보내기는 하나씩 차례로 한다.
  - `document/importers.ts`: 다른 프로그램 파일(`.vsdx`)을 새 다이어그램으로 바꾸는 자리. 등록된 것이 없는 종류는 "열 수 없는 파일"로 거절한다. `document/visio-import.ts`: 화면이 시작할 때(`main.tsx`) `vsdx`를 등록한다. 다리의 `importVisio` 한 번으로 바꾸고, 바꾸지 못한 그림 수를 알림 띠(`noticeVisioPictures`)에 더한다. draw.io가 읽지 못한 파일, 쪽이 없는 파일, 빈 파일은 그 까닭(`importVisioUnreadable`·`importVisioNoPages`)과 함께 거절한다. `document/open-failure.ts`: 탭이 열린 뒤에 파일이 열리지 않으면(가져오기 실패, 셸이 본 뒤에 깨진 파일, 복구 사본을 고르지 않은 깨진 파일) `diagram:open-failed`로 셸에 탭을 닫고 까닭을 앱 경고로 보이게 한다. 셸이 닫지 않을 때(단독 실행)만 탭 안에 까닭을 보인다. `document/live-ops.ts`: 연산을 지금 다이어그램에 계획해 한 번에 넣기(AI 창·앱 안 MCP가 쓴다). `document/recovery-copies.ts`: 사본 만들기 시점.
  - `document/live-ops.ts`(AI 창과 앱 안 MCP가 같이 쓰는 실행기): `liveDiagramRead(frame, page?)`는 한 쪽의 읽기 표 글(쪽을 주지 않으면 지금 쪽, 그 쪽의 선택 id 포함), `liveDiagramText`는 모든 쪽, `applyLiveOps(frame, ops)`는 연산 목록을 지금 다이어그램에 계획해 **다리 요청 한 번**(`applyBatch`)으로 넣는다. `insert_mermaid`는 먼저 draw.io로 바꾸고(바꾸기는 읽기다), 하나라도 거절되면 아무것도 보내지 않는다. 결과의 Mermaid id는 draw.io가 실제로 준 id다. `undoLiveBatches`는 AI 차례를 되돌린다(그 뒤에 다른 변경이 없을 때만). `formatApplyResult`는 모델이 읽는 결과 글이다.
  - `document/mermaid.ts`: `convertMermaidInEditor(frame, text)`(변환만, 이름 없는 새 다이어그램을 Mermaid로 만들 때도 이것을 쓴다)와, 계획이 그림 뒤의 연산을 맞게 보도록 변환된 XML을 계획용 셀(`m1`, `m2`…, 그 자리로 옮김)로 바꾸는 `plannedMermaidCells`. 다이어그램에 들어가는 것은 이 셀이 아니라 draw.io의 XML 그대로다(선의 꺾임점까지).
  - `ai/`: AI 창. 다른 편집기와 같은 부품과 규칙(제공자 선택은 `selectAiProvider`를 거친 공용 설정, 보내기 문지기 `useAiSendGate`, 막힌 실행 알림, 오류 글 `aiRunErrorText`, 첨부·검색·사용자 스킬·MCP)을 쓰고, 다이어그램 능력만 따로 있다.
    - `diagram-tools.ts`: 도구 두 개를 `DIAGRAM_OPS` 한 곳에서 만든다. `read_diagram`(= `read`), `apply_diagram_ops`(바꾸는 연산 전부의 목록, 항목 스키마는 모든 연산의 키를 합친 것). 호출 하나가 되돌리기 한 번이고, 하나라도 거절되면 다이어그램은 그대로다.
    - `diagram-skill.ts`: 지시문(영어, `brandText`)과 요청마다 붙는 문맥. 모델은 다이어그램을 **글로만** 읽는다. 요청마다 지금 쪽의 읽기 표가 `<diagram_page>` 안에 선택 id와 함께 가고, 그림은 만들지 않는다. 새 순서도·시퀀스·ER 등은 `insert_mermaid`를 먼저 쓰라고 적는다.
    - `AiPanel.tsx`·`AiDock.tsx`: 창과 오른쪽 끝 자리. AI 차례마다 그 차례의 호출들을 되돌리는 목록이 있다. `diagramAiHost`가 틀 쪽 실행기(`live-ops.ts`)를 도구에 잇는다.
    - `files-skill.ts`·`search-skill.ts`·`transport.ts`·`connection.ts`·`subscription-client.ts`·`lang-directive.ts`: 마인드맵 편집기의 것과 같다.
  - `i18n/app/<언어>.ts` 21개(`zh.ts`가 키 집합)와 `strings-app.ts`, AI 창의 `i18n/ai/<언어>.ts` 21개와 `strings-ai.ts`, 둘을 언어별로 합치는 `strings.ts`, `locale.tsx`. `theme.ts`: 앱 테마 → draw.io 어두운 보기.

## 맡지 않는 것 (경계)

- 파일 형식, 원본 꺼내기, 읽기 표, 연산의 뜻과 거절 이유, XML에 쓰기는 `packages/drawio-model`의 범위다. 여기서 다시 판단하지 않는다.
- draw.io 묶음을 받고 정리하고 라이선스를 검사하는 일은 `vendor/drawio/`(빌드 때 `prepare.mjs`)가 한다.
- 탭, 창, 메뉴, 홈, 열기 창 필터, 연결 프로그램 등록, 특권 프로토콜 목록, 앱 안 MCP 다리, 도움말 창 열기는 `apps/shell`의 범위다. 이 모듈은 셸이 부를 함수와 넣을 항목을 내보내기만 한다.
- Visio 파일을 바꾸는 일은 draw.io의 것이다(`mxVsdxCodec`). 이 모듈은 바이트를 넘기고 결과를 새 다이어그램으로 연다. 앱 안 MCP의 다이어그램 도구는 셸이 `diagram:read-request`·`diagram:apply-request`로 묻고, 화면은 AI 창과 같은 실행기(`document/live-ops.ts`)로 답한다.
- 프로젝트 폴더(결정 0088)는 아직 다이어그램 창에 없다. `packages/project-store`의 편집기 목록(`PROJECT_EDITORS`)에 `diagram`이 없어서, 대화 기록은 문서별 기록(`projectApi`)만 쓴다.

## 항상 지켜야 하는 것

- **다이어그램 탭은 이 PC 밖으로 요청을 하나도 보내지 않는다.** 세 겹을 모두 유지한다. ① draw.io 시작 인자(`embed=1&proto=json&offline=1&stealth=1&lockdown=1`)와 설정(자체 AI·웹 글꼴·내보내기 서버·플러그인·서비스 워커 끔). ② 전용 파티션의 요청 거절(앱 렌더러 스킴·`drawio-app:`·`data:`·`blob:`만, 개발 서버는 개발 실행에서만). ③ 새 창은 늘 거절, 화면은 제자리, draw.io 틀은 draw.io 시작 쪽에만. 여기에 draw.io 쪽 CSP(스크립트는 우리 스킴에서만, `unsafe-eval` 없음, 바깥 연결 없음)가 더해진다. 셋 중 하나라도 느슨하게 하지 않는다.
- **draw.io의 파일은 고치지 않는다.** 바꿔야 할 것은 프로토콜이 `index.html`에 끼우는 다리 스크립트 한 줄과 설정으로만 한다. `out/drawio/`의 파일은 `vendor/drawio/`가 만든 그대로 낸다.
- **`file://`로 draw.io를 띄우지 않는다.** draw.io는 `drawio-app://editor/`에서만 돈다.
- **메시지는 보낸 창과 출처를 확인한다.** 화면은 draw.io 틀의 창·`drawio-app://editor`에서 온 것만, 다리는 부모 창·부모 출처에서 온 것만 읽는다. 우리가 보내는 메시지는 그 출처로만 보내고 `*`로 보내지 않는다.
- **바뀐 것이 없으면 파일을 다시 쓰지 않는다.** Ctrl+S, 자동 저장, 메뉴 저장, 앱 안 MCP 저장 모두. 뒷단이 마지막으로 열었거나 쓴 경로에 바뀜 없이 오는 저장은 쓰지 않는다.
- **열리지 않는 파일은 탭으로 남기지 않는다.** 셸은 탭을 열기 전에 `open-check.ts`로 묻고, 탭이 열린 뒤에 실패하면 편집기가 `diagram:open-failed`로 셸에 그 탭을 닫게 한다. 이 창구는 파일이 열리지 않은 보기나 아직 파일이 되지 않은 가져오기 보기만 쓸 수 있다.
- **열지 못한 파일에는 쓰지 않는다.** 경로가 저장 대상이 되는 것은 뒷단이 그 바이트를 다이어그램으로 연 뒤다. 렌더러가 보낸 바이트도 대상 형식으로 열려야 쓴다. 가져온 `.vsdx`에는 쓰지 않는다.
- **Visio 가져오기는 이 PC 안에서만 한다.** draw.io의 가져오기가 `.vsdx`를 직접 읽고 EMF 그림도 PC 안에서 바꾼다(`emfToSvg`). 바깥 서버로 그림을 바꾸러 가는 경로는 없고, 옛 형식 경로는 `.vsdx` 이름으로 막는다. 바꾸지 못한 그림(WMF, draw.io가 거절한 EMF, 형식이 맞지 않는 그림)은 그대로 두고 수만 알린다. 옛 `.vsd`·`.vss`는 열지 않는다(뒷단이 "열 수 없는 파일"로 거절).
- **저장은 draw.io의 직렬화 그대로다.** `.drawio`·`.dio`는 `xml`, `.drawio.svg`는 `xmlsvg`(테마와 상관없게 `theme: 'auto'`), `.drawio.png`는 `xmlpng`(웹판처럼 첫 쪽 그림). 쪽 압축은 연 파일을 따르고 새 다이어그램은 압축하지 않는다.
- **PNG·SVG·PDF·인쇄는 앱 테마와 상관없이 같다.** PNG는 다리가 `light`로 그리고, SVG 내보내기는 `light` SVG(draw.io의 `light-dark()` 색 없음), PDF·인쇄는 `light` SVG와 흰 바탕으로 만든다. `.drawio.svg` 저장만 draw.io의 `auto` 직렬화다. 어두운 보기는 화면에서만이다(결정 0103의 "화면 색" 예외).
- **링크는 사람이 누른 것만, `http:`·`https:`·`mailto:`만 연다.** 다리는 사용자 동작이 있을 때만 앱에 넘기고, 뒷단이 `openableLink`로 다시 확인한 뒤 기본 브라우저로 연다. draw.io 화면의 일반 링크는 틀을 떠나지 못하게 막는다.
- **창구 이름은 `diagram:`으로 시작한다.** `src/shared/ipc.ts`에 있는 이름만 쓴다. 공용 `ai:*`와 구독 창구는 등록하지 않는다.
- **AI 도구 호출 하나는 되돌리기 한 번이고, 하나라도 거절되면 아무것도 바뀌지 않는다.** 기본 변경과 Mermaid 그림을 다리 요청 한 번(`applyBatch`)으로 보내고, 다리는 모델 편집 한 번 안에서 넣는다. 연산 묶음을 여러 요청으로 나누지 않는다.
- **모델에게 다이어그램의 그림을 보내지 않는다.** 읽기 표 글만 간다. 사람이 첨부한 그림 파일은 다른 편집기처럼 메시지와 함께 간다.
- **draw.io 자체 AI는 꺼 둔다.** AI는 이 창으로만 쓴다(구독·요금 규칙은 공용 부품이 지킨다).
- 문구는 21개 언어 조각에 모두 넣는다. 제품 이름은 `GenOffice`로 적는다.

## 셸과의 약속

- 셸이 할 일(열기): 다이어그램 파일에 탭을 주기 전에 `diagramOpenRefusal`(`.vsdx`는 `visioOpenRefusal`)로 묻고, 까닭이 오면 탭 없이 앱 경고로 보인다. `setDiagramOpenFailedHook((wc, message) => …)`으로 탭이 열린 뒤의 실패를 받아 그 탭을 닫고 `message`를 앱 경고로 보인다(닫았으면 참).
- 셸이 할 일: 특권 스킴 목록에 `DRAWIO_SCHEME_PRIVILEGE`를 더한다. `configureDiagramRuntime({ preloadPath, rendererUrl, rendererFile, drawioDir?, bridgeFile?, packaged?, newDocumentDir?, writeNewDocument? })`로 경로를 준다(묶음은 기본으로 `<모듈 출력>/drawio`, 다리는 `<모듈 출력>/bridge/bridge.js`). 기본 세션의 `installRendererProtocol`에 `diagram`을 더한다(파티션 쪽은 이 모듈이 등록한다). 복구 저장소의 편집기 목록에 `diagram`을 더한다.
- 창 없는 일: 셸은 `headless-main.ts`의 `exportDiagramHeadless`를 `--headless-export`의 `diagram` 몫으로 건다.
- 내보내는 함수: `createDiagramView`, `createDiagramHiddenWindow`, `requestDiagramSave`, `requestDiagramClose`, `diagramSaveToPath`, `diagramIsDirty`, `diagramFilePath`, `diagramFileRenamed`, `diagramTabIdentity`, `discardDiagramRecovery`, `diagramRecoveryIdentity`, `writeDiagramCopiesNow`, `openDiagramFileWithDecision`, `openDiagramUntitledCopy`, `queueDiagramSeedFor`, `sendDiagramMenuCommand`, `sendDiagramExportRequest`, `sendDiagramPrintRequest`, `setDiagramFileSavedHook`, `setDiagramRecoveryTitleHook`, `setDiagramHelpHook`, `setDiagramOpenFailedHook`, `diagramOpenRefusal`, `visioOpenRefusal`, `diagramHasRecoveryCopy`, `diagramRequestLog`, 상수 `DIAGRAM_PARTITION`, `DRAWIO_SCHEME_PRIVILEGE`. 앱 안 MCP용으로 `mcp-queries.ts`의 `diagramReadText`, `diagramReadPage`, `diagramApplyOps`.
- AI 창: 셸이 따로 부를 등록 함수는 없다(`registerDiagramAiIpc`는 `createDiagramView` 안에서 불린다). 첫 요청으로 이름 없는 탭의 이름을 바꾸려면 `setDiagramProvisionalTitleHook((wc, title) => …)`을 건다. 공용 `ai:*`·구독 창구와 `home:open-path`, `app:*-ai-panel-prefs`는 셸·워드 뒷단의 것을 부르기만 한다.
- 탭의 정체(`DiagramTabIdentity`): `{ sourcePath, untitled, title, imported? }`. 가져온 `.vsdx` 탭은 `sourcePath`가 그 파일, `untitled: true`, `imported: 'vsdx'`다. 같은 경로를 다시 열 때 이 값으로 그 탭을 찾는다.

## 테스트

- 실행: `npm run test -w @genoffice/diagram`, `npm run typecheck -w @genoffice/diagram`, `npm run build -w @genoffice/diagram`(draw.io 묶음과 다리 스크립트까지).
- 바꾸면 반드시 테스트하는 것: 형식별 저장·압축·이름(`formats.test.ts`), 프로토콜 경로·끼우기·CSP(`protocol.test.ts`), 요청 허용·이동·새 창·링크(`network-guard.test.ts`), 메시지 출처와 틀 통신(`bridge-protocol.test.ts`), 기본 변경의 한 번 되돌리기·쪽 바꾸기·실패 시 원상(`apply-primitives.test.ts`, draw.io를 흉내 낸 가짜 모델), 알림 세기·인쇄 문서·시작 인자·사본·21개 언어(`editor-parts.test.ts`), 뒷단의 열기·거절·저장 생략·저장 대상(`main.test.ts`, Electron은 가짜).
- AI 창: 도구 정의가 `DIAGRAM_OPS`에서 나오는지, 읽기(지금 쪽·선택 id·다른 쪽), 모두 아니면 아무것도(거절·draw.io 실패 모두 그대로), Mermaid가 섞인 호출이 다리 요청 한 번·되돌리기 한 번인지, 변환 실패가 그 까닭과 함께 거절되는지, 문맥에 그림이 없는지(`ai-tools.test.ts`, 가짜 draw.io `tests/helpers/fake-drawio.ts`), 창의 실행과 차례 되돌리기, 21개 언어(`ai-panel.test.ts`). 연결부는 가짜다. 실제 `claude`·`codex`에 닿는 테스트를 만들지 않는다. 뒷단 첨부 창구와 임시 이름(`main.test.ts`), 단계 목록과 libavoid 막기(`apply-primitives.test.ts`).
- 열리지 않는 파일: 셸에 탭을 닫게 하는 창구(가져오기 실패, 열지 못한 파일, 열린 다이어그램과 빈 까닭의 거절, 셸이 없을 때)는 `visio-main.test.ts`, 화면 쪽 처리(`settleOpenFailure`)는 `visio-import.test.ts`, 탭을 열기 전의 판정(까닭마다, `.vsdx`)은 셸의 `tests/diagram-open-gate.test.ts`가 본다.
- Visio 가져오기: 등록과 "열 수 없는 파일"로의 거절, 거절 까닭, 그림 알림, 다리 요청(이름은 늘 `.vsdx`, 쪽 풀기, 실패 까닭), 그려지지 않는 그림 세기(`visio-import.test.ts`, 가짜 draw.io), 뒷단의 옛 형식 거절·`.vsdx`를 쓰지 않음·저장 뒤 탭 정체가 `.drawio`로 바뀜(`visio-main.test.ts`). 시험 파일 `tests/fixtures/visio-*.vsdx`는 같은 폴더의 `make-visio-fixtures.mjs`가 만든다(싣는 draw.io 판에 Visio 내보내기가 없어 VSDX 형식대로 손으로 짠다). 바꾸면 `node apps/diagram/tests/fixtures/make-visio-fixtures.mjs`로 다시 만든다.
- 빌드한 편집기에서만 확인되는 것(draw.io를 띄운 바깥 요청 0건, 실제 저장·다시 열기, 밝은·어두운 테마의 결과 비교)은 스크립트로 Electron을 직접 띄워 확인하고, 셸 연결 뒤에는 E2E(`e2e/diagram-*.spec.ts`)가 맡는다.
  실제 draw.io에서 Mermaid와 연산이 섞인 호출, 되돌리기 한 번, 새 쪽·화면 밖 쪽에 넣기, 변환 실패, 바깥 요청 0건은 스크립트(`F:\ieum-scratch\diagram-t4\smoke`)로 확인했다.
  Visio 가져오기(도형·연결선·PNG 그림·두 쪽, 첫 저장이 `.vsdx` 옆 `.drawio`, `.vsdx` 바이트 그대로, 저장한 `.drawio` 다시 열기, WMF·깨진 EMF 2개 알림과 PC 안 EMF 변환, 깨진 파일의 까닭, 바깥 요청 0건)는 스크립트(`F:\ieum-scratch\diagram-t5\smoke`)로 확인했다.

## 알려진 한계

- 언어를 바꾸면 draw.io를 다시 띄우므로 되돌리기 기록이 사라진다(저장하지 않은 내용은 지킨다).
- PDF는 Chromium이 만든 날짜(`CreationDate`·`ModDate`)만 매번 다르다. 그 밖의 바이트는 두 테마에서 같다.
- `.drawio.svg` 저장과 SVG 내보내기에는 draw.io가 매번 새로 짓는 무작위 id가 들어간다. 같은 테마에서도 바이트가 매번 다르고, 그 id를 빼면 두 테마의 결과가 같다.
- draw.io 코드가 스스로 틀의 주소를 바꾸면(우리가 남긴 화면에서는 일어나지 않는다) 바깥 요청은 CSP와 세션이 막지만 틀이 오류 쪽이 된다. 일반 링크 클릭은 다리가 막는다.
- Mermaid 그림은 draw.io처럼 크기가 없는 그룹(`transparentBounds=1`) 하나와 그 안의 도형으로 들어온다. 읽기 표에서 그 그룹은 0×0이고, 안의 도형 좌표가 곧 쪽 좌표다.
- Visio의 WMF 그림은 draw.io가 바꾸지 못해 깨진 그림으로 남는다(알림에 수가 나온다). 가져온 다이어그램은 처음에 "바뀜" 표시가 없어 저장하지 않고 닫아도 묻지 않는다(원본 `.vsdx`는 그대로 있다).
- AI 차례 되돌리기는 그 뒤에 사람이나 다른 호출이 다이어그램을 바꿨으면 그 앞에서 멈추고 알린다. 그때는 편집기의 실행 취소를 쓴다.
- 같은 호출 안에서 Mermaid 그림 뒤의 연산은 그림의 셀을 계획용 id(`m1`…)로 본다. 실제 id는 결과에 나오고, 그 셀을 고치려면 다음 호출에서 그 id를 쓴다.
