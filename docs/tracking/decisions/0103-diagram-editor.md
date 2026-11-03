# 0103 — 다이어그램은 draw.io 본체를 PC 안에서만 띄우고, AI와 바깥 연결은 글 표와 한 모듈의 연산으로 다룬다

## 맥락

2026-11-03 의견 보내기로 제안이 들어왔다. 개발 일을 하는 사람이 순서도·구성도를 diagrams.net(draw.io)으로 많이 그리니, 그 편집기도 이음오피스에 들어가면 좋겠다는 내용이다. 이음오피스에는 다이어그램 편집기가 없었다.

같은 날 draw.io v32.6.9 배포본을 네트워크를 막은 Electron 창에 띄워 시험했다. 불러오기, 내보내기, 기능 20여 개, Mermaid 변환을 하는 동안 바깥 요청이 0건이었다. 임베드 방식(부모 창과 `postMessage`로 주고받기)이 PC 안 파일에서도 그대로 돌았다. 자세한 것은 `docs/plans/diagram-editor.md` 2절에 있다.

지켜야 할 것이 넷 있었다. 다이어그램 탭은 PC 밖으로 요청을 하지 않아야 한다. 설치본에는 라이선스 허용 목록(`tools/license-allowlist.mjs`) 밖의 부품을 싣지 않는다(결정 0038도 같은 까닭으로 번들을 버렸다). draw.io는 등록 상표이고 제휴처럼 보이게 이름과 로고를 쓰지 말라고 적혀 있다(결정 0052). 그리고 "문서 내용의 색은 테마가 다시 칠하지 않는다"(`docs/standards.md` "화면 색")는 규칙이 있다.

## 결정

- **draw.io 본체(jgraph/drawio, Apache-2.0)를 싣는다.** 제안한 사람이 쓰는 편집기라 파일이 그대로 오가고, 관리가 활발하다. draw.io 데스크톱판과 VS Code 확장은 GPL-3.0이라 코드를 가져오지 않는다.
- **draw.io 화면을 그대로 쓴다.** 저장소 주인이 골랐다. 메뉴 줄, 도형 칸, 서식 칸, 쪽 탭은 draw.io의 것이다. draw.io를 쓰던 사람에게 익숙하고, draw.io가 바뀔 때마다 우리 리본을 맞추는 일이 없다. 화면에서 빼는 것은 로고와 "draw.io 정보", 바깥 사이트로 가는 도움말·지원·의견 항목, 클라우드 저장소·게시·공유·임베드 메뉴, 플러그인, draw.io 자체 AI, PlantUML, 웹 글꼴 고르기, draw.io의 모양·테마·언어 바꾸기, 끝내기 단추다. draw.io의 "도움말"은 앱 안 도움말의 다이어그램 주제를 연다. 저장·인쇄·PNG·SVG·PDF 내보내기와 Ctrl+S·Ctrl+Shift+S·Ctrl+P는 앱이 맡는다.
- **draw.io는 빌드 때 내려받는다.** 저장소 주인이 골랐다. 저장소에는 판, 주소, SHA-256, 뺄 목록, 잘라내기 하나, 싣는 부품의 라이선스 목록만 둔다(`vendor/drawio/`). 빌드는 GitHub 릴리스의 `draw.war`를 받아 해시를 확인하고 캐시에 둔다. 해시가 다르면 빌드가 실패한다. draw.io는 거의 매주 새 판을 내므로, 저장소에 실으면 올릴 때마다 수십 MB씩 커진다. 판은 v32.6.9로 시작한다.
- **draw.io의 파일은 고치지 않는다.** 바꿀 것은 프로토콜이 `index.html`을 낼 때 끼우는 다리 스크립트 하나와 설정(`DRAWIO_CONFIG`)으로 한다. 예외는 아래 잘라내기 하나다.
- **허용 목록 밖의 부품은 뺀다.** 저장소 주인이 PlantUML 변환기(`js/plantuml`, LGPL 조각), libavoid(`js/libavoid-js`, LGPL-2.1), ELK(`js/elk`, EPL-2.0) 모두 빼기를 골랐다. 지금까지 설치본에 허용 목록 밖 부품을 싣지 않은 원칙을 지킨다. 검사 중에 Glyphicons 공유 아이콘(`images/glyphicons_*.png`, CC BY 3.0)도 나와 뺐다. 쓰지 않는 개발용 원본, 서버용 파일, 쓰지 않는 묶음, 클라우드 연결 화면, 서비스 워커, 개발 실행에서만 읽는 Base64 도우미(`js/deflate/base64.js`)도 싣지 않는다. 목록은 `vendor/drawio/README.md`에 있다.
- **`js/extensions.min.js`만은 ELK·libavoid 부분을 잘라낸 사본을 싣는다.** 저장소 주인이 승인했다(2026-11-03). draw.io는 시작할 때 이 파일을 반드시 읽고, Visio 가져오기와 Mermaid 변환도 이 파일이 있어야 돈다. 그런데 이 파일 안에 ELK(`js/elk/drawio-elk.min.js`)와 libavoid(`js/libavoid-js/libavoid.min.js`, `libavoid-routing.js`)가 바이트 그대로 들어 있다는 것을 구현 중에 알았다. 그래서 같은 릴리스의 세 파일 내용을 이 파일 안에서 찾아 그 바이트 구간만 들어낸다. 나머지 바이트는 그대로다. 세 파일 중 하나라도 정확히 한 번 나오지 않으면 빌드가 실패하고, 결과의 SHA-256은 `vendor/drawio/drawio.json`에 고정해 둔다. 잘라낸 사실과 방법은 `THIRD-PARTY-NOTICES.txt`의 draw.io 절에 적힌다. 잘라낸 사본으로 편집기가 열리고, Mermaid 결과가 같았고, 바깥 요청은 0건이었다.
- **도형·아이콘 모음과 템플릿은 싣는다.** 도형·아이콘 모음(`img/`, `shapes/`, `stencils/`)은 draw.io의 Apache-2.0에 Atlassian 제품 관련 사용 제한 글이 붙은 것으로 분류한다. 그 제한은 이 앱과 사용자가 만든 그림에 걸리지 않는다. 제한 글은 고지에 원문 그대로 옮긴다. 템플릿은 CC BY 4.0이고 출처를 밝힌다. 싣는 파일이 모두 라이선스 목록(`vendor/drawio/inventory.json`)에 들고 허용 목록 안인지는 `npm run licenses`가 검사한다.
- **다이어그램 탭은 PC 밖으로 요청을 하지 않는다. 세 겹으로 막는다.** ① draw.io 시작 인자(`embed=1&proto=json&offline=1&stealth=1&lockdown=1`)와 설정으로 클라우드·웹 글꼴·내보내기 서버·플러그인·자체 AI를 끈다. ② 다이어그램 탭은 자기 지속 세션 파티션(`persist:ieum-diagram`)을 쓰고, 그 세션은 앱의 프로토콜·`drawio-app:`·`data:`·`blob:` 밖의 요청을 모두 거절한다. ③ 새 창 열기와 다른 주소로의 이동을 거절한다. 여기에 draw.io 쪽 CSP가 더해진다. 다이어그램이 가리키는 바깥 그림·글꼴은 불러오지 않고, 열 때 한 번 알린다.
- **어두운 테마를 따라간다.** 저장소 주인이 골랐다. 앱이 어두우면 draw.io의 어두운 보기를 켜고, 테마가 바뀌면 바로 따라간다. 어두운 보기는 화면에 보이는 그림 색도 바꾼다. 이것은 `docs/standards.md` "화면 색"의 "문서 내용의 색은 테마가 다시 칠하지 않는다"의 예외다. 대신 저장 파일, PNG, PDF, 인쇄는 두 테마에서 같다. PNG·SVG·PDF 내보내기와 인쇄는 늘 밝은 색으로 낸다(SVG 내보내기에는 어두운 뷰어에서 어두워지는 draw.io의 `light-dark()` 색을 넣지 않는다). `.drawio.svg` 저장은 테마와 상관없는 draw.io 출력 그대로다.
- **언어는 앱을 따른다.** draw.io가 21개 언어를 모두 가졌다. 앱 언어가 바뀌면 저장하지 않은 내용을 지킨 채 편집기를 다시 띄운다. 이때 되돌리기 기록은 사라진다.
- **저장은 draw.io의 직렬화 그대로이고, 형식은 연 파일을 따른다.** `.drawio`·`.dio`·`.drawio.svg`·`.drawio.png`를 열고 그 형식으로 저장한다. 쪽 압축은 연 파일을 따르고, 새 다이어그램은 압축하지 않는다. 새 다이어그램의 첫 저장은 `.drawio`를 먼저 제안한다. 바뀐 것이 없으면 파일을 다시 쓰지 않는다. 복구 사본과 자동 저장은 다른 편집기와 같다(결정 0061, 0069). draw.io 자체의 초안·자동 저장은 쓰지 않는다.
- **PDF와 인쇄는 앱이 만든다.** draw.io의 인쇄 창은 쓰지 않는다. 쪽마다 한 장, 다이어그램에 정해 둔 용지 크기로 Electron이 만든다. 내보내기 창에서 모든 쪽과 지금 쪽만을 고른다.
- **AI는 글 표만 받는다.** 저장소 주인이 골랐다. 쪽 목록과 쪽마다 도형·선의 id, 글, 도형 이름, 위치, 연결 관계를 표로 넘기고, 그림은 보내지 않는다. 가볍고 모든 AI 연결에서 된다.
- **연산은 한 모듈이 검사하고 같은 기본 변경으로 바꾼다.** 연산의 뜻은 `packages/drawio-model`의 `DIAGRAM_OPS`에만 있다. 앱 안에서는 그 기본 변경을 draw.io 모델에 넣고, 터미널에서는 XML에 직접 쓴다. 두 길의 결과가 갈라지지 않게 한다.
- **AI 도구 호출 하나는 되돌리기 한 번이다.** 연산 하나라도 거절되면 그 호출 전체를 거절하고 다이어그램은 바뀌지 않는다. Mermaid 그림이 섞인 호출도 같다. AI가 Mermaid 글을 쓰면 draw.io의 변환기가 PC 안에서 도형으로 바꾼다. 변환에 실패하면 그 까닭을 AI에게 돌려준다.
- **바깥 연결까지 넣는다.** 저장소 주인이 골랐다. 앱 안 MCP(설정 → 연동)는 열린 다이어그램의 목록·읽기·저장·닫기에 고치기 도구 `read_diagram`·`apply_diagram_ops`까지 둔다. 터미널 명령어와 명령어 쪽 MCP는 `diagram read`·`diagram apply`, Mermaid로 새로 만들기를 포함한 `create --type drawio`, `convert`(PNG·SVG·PDF), `guide diagram`을 둔다. 에이전트 모드(결정 0032)의 세션 MCP 서버에는 도구를 더하지 않는다. 그쪽 도구 목록은 보안 규칙으로 고정돼 있다.
- **Windows 기본 프로그램으로도 등록한다.** 저장소 주인이 골랐다. `.drawio`·`.dio`는 다른 문서 형식처럼 기본 프로그램 자리에도 등록한다. `.vsdx`는 Visio 자리를 건드리지 않게 "연결 프로그램"에만 올린다. `.drawio.svg`·`.drawio.png`는 확장자가 `.svg`·`.png`라 등록하지 않는다. 홈에 "다이어그램" 새 문서 타일을 둔다.
- **Visio 가져오기를 이번에 넣는다.** 저장소 주인이 골랐다. `.vsdx`를 열면 draw.io의 가져오기가 PC 안에서 새 다이어그램으로 바꾸고, 첫 저장은 `.vsdx`가 있던 폴더의 `.drawio`를 제안한다. `.vsdx`로 되돌려 쓰지 않는다. 바꾸지 못한 그림(WMF 등)이 있어도 열고 그 수를 알린다. 예전 형식 `.vsd`·`.vss`는 열지 않는다.
- **화면 이름은 "다이어그램"이다.** "draw.io"는 어떤 파일을 다루는지 알리는 데만 쓴다(열기·저장 창의 형식 이름). draw.io 로고는 쓰지 않는다. 파일 아이콘은 이 저장소의 그림 규칙을 따른다(결정 0052).
- **외부 PR #68(Excalidraw)은 따로 정한다.** 저장소 주인이 골랐다. 이 작업에서는 그 PR에 아무것도 하지 않았다.

## 택하지 않은 것

- **maxGraph.** 그리기 라이브러리만 있고 편집 화면이 없다. 아직 1.0 전이다.
- **tldraw.** 배포에 라이선스 키가 필요하고, 무료판은 화면에 워터마크를 띄워야 한다.
- **Excalidraw를 이 편집기로 삼기.** 손그림 화이트보드라 정밀한 구성도와 쓰임이 다르다. PR #68은 따로 정한다.
- **draw.io를 우리 리본으로 감싸기.** 일이 크고, draw.io가 바뀔 때마다 맞춰야 한다.
- **draw.io 파일을 저장소에 커밋하기.** 판을 올릴 때마다 저장소가 수십 MB씩 커진다.
- **PlantUML·libavoid·ELK 싣기.** 허용 목록 밖이다. 고치지 않은 파일로 따로 싣는 안도 있었지만, 지금까지 설치본에 허용 목록 밖 부품을 싣지 않은 원칙을 지켰다.
- **`js/extensions.min.js`를 통째로 빼기.** 편집기가 열리지 않고 Mermaid 변환과 Visio 가져오기도 멈춘다.
- **처음엔 밝게 두고 사람이 바꾸면 기억하기.** 앱 테마를 따르는 쪽을 골랐다.
- **AI에게 그림도 보내기.** 무겁고, 그림을 받지 못하는 연결이 있다.
- **Visio 가져오기를 다음 단계로 미루기.**
- **에이전트 모드에도 다이어그램 도구 주기.** 그 서버의 도구 목록은 보안 규칙으로 고정돼 있다.
- **`file://`로 draw.io 띄우기.** 다른 파일까지 닿을 수 있다. 앱 전용 프로토콜(`drawio-app://`)로만 낸다.
- **draw.io의 인쇄 창 쓰기.** 다른 편집기와 결과·모양이 달라지고, 테마와 상관없는 결과를 지키기 어렵다.

## 결과

- 새 편집기 `apps/diagram`과 파일 모델 패키지 `packages/drawio-model`이 생겼다. 셸에 탭 종류 `diagram`, 열기 창·끌어다 놓기·최근 파일·폴더 나무·명령줄 인자의 다이어그램, 떼어 낸 창, 홈의 "다이어그램" 타일, 파일 아이콘, Windows 등록, 앱 안 도움말 `diagram`(21개 언어)이 더해졌다.
- 다른 편집기 AI 창의 첨부·`@문서`, 홈의 파일 검색·지식 자료 색인이 `.drawio`·`.dio`·`.drawio.svg`·`.drawio.png`를 읽기 표 글로 읽는다(`packages/file-parse`). `.vsdx`는 읽지 않는다. Google 드라이브 목록에 `.drawio`·`.dio`가 더해졌다.
- 앱 안 MCP의 `open_documents`에 다이어그램 탭이 `kind: "diagram"`, `type: "diagram"`으로 나오고, 도구 `read_diagram`·`apply_diagram_ops`와 `get_app_info`의 `drawio` 항목이 생겼다. 터미널 명령어와 명령어 쪽 MCP에 `diagram read`·`diagram apply`(`diagram_read`·`diagram_apply`), `create --type drawio`(`create_drawio`), 다이어그램의 `convert`, `guide diagram`이 생겼다(`docs/contracts.md`, `skills/ieumoffice/SKILL.md`). 창 없는 내보내기 진입점이 다이어그램과 PNG·SVG까지 넓어졌다(`docs/headless-pdf-export.md`).
- 터미널의 `diagram apply`는 `.drawio`·`.dio`에서 고치지 않은 쪽을 원래 바이트 그대로 둔다. 그림 형식과 Mermaid는 앱을 창 없이 띄워 한다.
- 다이어그램 탭은 복구 사본을 `diagram-autosave`에 남긴다. draw.io가 자기 저장소에 두는 것(스크래치 패드, 사용자 도형 묶음, 최근 색)은 그 탭의 지속 파티션에 남고 밖으로 나가지 않는다(`docs/security.md`, `PRIVACY.md`).
- 설치 파일이 draw.io 묶음만큼 커졌다(계획 때 어림 30~40MB).
- 깨진 파일과 원본이 없는 `.drawio.svg`·`.drawio.png`, Visio 도면이 아닌 `.vsdx`는 탭을 열기 전에 걸러 탭 없이 까닭만 보인다. draw.io의 Visio 가져오기가 탭을 연 뒤에 실패하면 편집기가 셸에 그 탭을 닫게 하고 같은 까닭을 앱 경고로 보인다.
- 알려진 한계(언어를 바꾸면 되돌리기 기록이 사라짐, 앱 안 MCP와 AI 창의 고치기가 서로 줄 서지 않음, 프로젝트 폴더 맥락 없음 등)는 `docs/tracking/findings.md`와 `apps/diagram/AGENTS.md`에 있다. 실제 draw.io에서 우리가 저장한 파일 열기, 실제 Visio 파일, 21개 언어, Mac·Linux, 실제 구독 확인은 사람이 한다(`docs/tracking/status.md`).
