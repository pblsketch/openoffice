# 0060 — Excalidraw 그림은 전용 편집기로 열고 고치며, Obsidian 커뮤니티 플러그인은 앱에 올리지 않는다

## 맥락

Obsidian의 Excalidraw 플러그인으로 그린 그림(`.excalidraw.md`)을 이음오피스에서 보고 고치고 싶다는 요청이 있었다. 더 일반적인 길로, Obsidian 커뮤니티 플러그인을 앱이 돌릴 수 있게 하고 Excalidraw는 그 플러그인을 설치해서 지원하자는 안도 함께 나왔다.

Obsidian 플러그인은 Obsidian이 실행 중에 넣어 주는 `obsidian` 모듈(보관함, 작업 공간, 메타데이터 캐시, 마크다운 그리기, CodeMirror 6 확장, DOM 도우미)에 기댄다. 공개된 것은 형 선언뿐이고 구현은 공개되지 않았다. Excalidraw 플러그인은 그 가운데에서도 가장 크고 Obsidian 내부에 깊이 기대는 플러그인이다(작업 공간 몽키패치, 마크다운 보기 전환, 임베드 그리기, 자체 스크립트 엔진). 그리고 플러그인은 Node와 Electron 전체 권한으로 임의 코드를 실행한다.

## 결정

- Obsidian 커뮤니티 플러그인을 앱에 올리는 기능은 만들지 않는다.
- Excalidraw 그림은 전용 편집기(`apps/excalidraw`)로 연다. 그리기와 편집은 Excalidraw 공식 라이브러리(`@excalidraw/excalidraw`, MIT)가 하고 `0.18.1`로 정확히 고정한다. 파일은 이 프로젝트의 엔진(`packages/excalidraw-engine`)이 다룬다. 마인드맵(결정 0014)과 같은 나눔이다.
- 여는 파일은 두 가지다. Obsidian의 그림 노트(`.excalidraw.md`, 또는 앞머리에 `excalidraw-plugin`이 있는 `.md`)와 Excalidraw 웹 앱의 `.excalidraw`(JSON)이다. 파일은 연 형식 그대로 저장한다. 새 그림은 Obsidian 그림 노트로 만든다.
- 노트에서 저장 때 다시 쓰는 곳은 `Text Elements` 목록과 `Drawing` 블록의 내용 두 곳뿐이다. 앞머리, 사용자가 쓴 본문, `Embedded Files`, `Element Links`와 그 밖의 바이트는 그대로 둔다. 바뀐 것이 없으면 원본 바이트 그대로 저장한다.
- 라이브러리가 모르는 요소 속성(플러그인의 `rawText` 등)은 저장할 때 원래 요소에서 되살린다. 화면에서 글을 고친 글 요소는 `rawText`도 그 글로 맞춘다.
- 노트가 가리키는 그림(`Embedded Files`의 `[[그림.png]]`)은 뒷단이 노트의 보관함 폴더(`.obsidian`이 있는 가장 가까운 위 폴더, 없으면 노트 폴더) 안에서만 찾아 읽는다. 그 밖으로 나가는 경로, 그림이 아닌 파일, 숨은 폴더, 20MB를 넘는 그림은 읽지 않는다. 읽은 그림은 파일에 넣지 않는다.
- 1단계에서는 노트에 그림을 새로 넣지 못하게 한다(그림 도구를 끄고 끌어 놓기를 막는다). 노트에 넣은 그림은 보관함 파일이 아니라 이 파일 안에만 남아, Obsidian에서 보이는지 보장할 수 없다.
- 그림 편집기는 네트워크에 닿지 않는다. 글꼴은 패키지에 든 것을 빌드 때 화면 폴더로 복사해 쓰고, 공유 라이브러리·실시간 공동 작업·AI·웹 임베드는 끈다. CSP가 바깥 주소를 모두 막는다.

## 택하지 않은 것

- **Obsidian 커뮤니티 플러그인 지원.** Obsidian API를 흉내 내는 층을 새로 만들어야 하고, 그래도 Excalidraw 플러그인은 제대로 돌지 않을 가능성이 높다. 플러그인이 Node 권한으로 돌면 모든 창을 `sandbox`로 띄우는 원칙(`docs/security.md`)과 구독 로그인 정보에 손대지 않는다는 규칙(CLAUDE.md "절대 어기지 않는 것" 1번)을 지킬 수 없다. 격리된 환경에서 플러그인을 돌리는 설계는 보안 정책을 바꾸는 일이라 저장소 주인의 판단이 필요하다.
- **마크다운 편집기 안에서 그림 블록을 그리기.** 블록 편집기가 노트를 다시 직렬화하면서 데이터 블록을 바꿀 위험이 있고, 그림 편집 화면을 블록 편집기 안에 넣는 일이 전용 편집기보다 크다.
- **라이브러리의 불러오기·저장(`loadFromBlob`, `serializeAsJSON`)만 쓰기.** Obsidian 노트 형식을 모르고, 모르는 속성과 사용자가 쓴 본문을 지킨다는 약속을 할 수 없다.
- **버전 범위 지정.** 라이브러리가 화면과 파일 자료 모양을 함께 바꾸므로, 올릴 때마다 저장 결과를 다시 확인해야 한다.

## 결과

- 의존성: `@excalidraw/excalidraw@0.18.1`이 쓰는 `@radix-ui/react-tabs@1.0.2`는 React 18까지만 허용해서, 설치하면 저장소 루트의 `react-dom`이 18로 내려간다. 루트 `overrides`로 `@radix-ui/react-tabs`를 `1.1.3`(React 19 허용, 같은 API)으로 올린다. npm은 작업 공간 패키지의 의존성에 `overrides`를 적용하지 않아, 루트 `devDependencies`에도 같은 판을 적는다.
- 빌드한 그림 편집기 화면은 약 26MB다(글꼴 14MB, 라이브러리의 Mermaid 변환 포함).
- 노트를 바꾼 저장에서 `Drawing` 블록은 탭 들여쓰기 JSON으로 다시 쓰인다(압축 블록은 256자씩 줄을 나눈다). 플러그인이 쓰는 모양과 같다.
- 라이브러리는 불러올 때 모든 요소를 다시 만들기 때문에, 열기만 한 그림을 바뀜으로 보지 않도록 첫 변경 알림을 기준으로 삼는다. 되돌리기로 처음 모습에 돌아가도 요소의 판 번호가 달라서 "바뀜"으로 남는다.
- 그림 아이콘은 다른 파일 아이콘과 같은 생성기(`tools/gen-file-association-icons.mjs`)의 `excalidraw` 형식이다. 올리브색 등판에 손으로 그린 상자·원과 자유 곡선(16px에서는 굵은 곡선 하나)이고, Excalidraw의 상표 색과 그림을 따르지 않는다(결정 0052). 탭과 홈 화면의 파일 목록(`.excalidraw`, `*.excalidraw.md`)이 쓴다. 설치 프로그램은 `.excalidraw`를 마인드맵(`.xmind`, 결정 0019)처럼 "연결 프로그램" 후보로만 등록하고 기본 프로그램은 가져오지 않는다(Windows `IeumOffice.Drawing`과 `excalidraw.ico`, Mac·Linux는 `Alternate`, MIME `application/vnd.excalidraw+json`). 형식 이름은 다른 제품 이름 대신 "Drawing"이다.
- 남은 일(다음 단계): AI 창과 도구, MCP·첨부·검색에서 그림 노트의 글 읽기(`packages/file-parse`), PNG·SVG 내보내기, 만들기 넘겨주기, 노트에 그림 넣기, 다른 노트 임베드. 설치 프로그램의 `.excalidraw` 연결, 홈 화면의 새 그림 카드, 앱 안 도움말(`drawing` 주제)은 했다.
