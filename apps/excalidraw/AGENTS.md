# apps/excalidraw (`@genoffice/excalidraw`)

그림 편집기다. Obsidian Excalidraw 플러그인의 그림 노트(`.excalidraw.md`, 앞머리에 `excalidraw-plugin`이 있는 `.md`)와 `.excalidraw` 파일을 열고 고치고 저장한다(결정 0060). 그리는 일은 Excalidraw 라이브러리(`@excalidraw/excalidraw`, `0.18.1`로 고정)가 하고, 파일은 `packages/excalidraw-engine`이 다룬다. 이 모듈은 둘 사이를 잇는다.

## 맡은 범위

- 렌더러(`src/renderer/`): 그림판과 저장 흐름(`App.tsx`), 열린 그림 하나와 바뀜 판정(`document/session.ts`), 노트 그림 요청(`pictures.ts`), 그림판의 언어(`lang.ts`)와 밝기(`theme.ts`), 21개 언어 문구(`i18n/app/<언어>.ts`, `zh`가 키 목록).
- 메인 프로세스(`src/main/excalidraw-main.ts`): 파일 읽기·쓰기, 뷰마다 허용된 경로, 형식 지키기, 닫기 전 저장 확인, 이름 바뀜 따라가기, 링크 열기, 단독 실행. 노트가 가리키는 그림 찾기는 `src/main/embedded.ts`, 저장 이름은 `src/main/save-name.ts`, 뒷단 문구는 `src/main/i18n-main.ts`.
- IPC 계약 `src/shared/ipc.ts`(`EXCALIDRAW_CHANNELS`). 창구 이름은 모두 `excalidraw:`로 시작한다.
- 글꼴(`scripts/excalidraw-fonts.mjs`): 패키지에 든 글꼴을 빌드 때 `public/fonts`(추적하지 않음)로 복사하고, 같은 곳에 `asset-path.js`를 써서 `window.EXCALIDRAW_ASSET_PATH`를 화면 자기 폴더로 둔다. 이 파일은 모듈보다 먼저 도는 일반 스크립트로 `index.html`이 불러온다. 라이브러리는 자기 모듈이 평가될 때 글꼴을 등록하고, Vite가 라이브러리를 진입 코드보다 먼저 불러오는 묶음으로 빼기 때문에 진입 코드에서 정하면 늦다.
- 글꼴 CDN 줄 지우기(같은 파일의 `dropCdnFallback`): 라이브러리는 글꼴마다 앱 폴더 뒤에 공개 CDN(`esm.sh`) 주소를 붙이고, Chromium은 첫 주소를 읽어 와도 뒤의 주소까지 요청한다(CSP가 막지만 요청은 나간다). 그래서 빌드 때 그 줄을 지운다. 고정한 판의 축약 코드 모양을 찾고, 찾지 못하면 빌드가 실패한다. 라이브러리를 올리면 이 모양을 다시 확인한다(`tests/fonts-plugin.test.ts`). 개발 서버는 라이브러리를 미리 묶어 이 패치를 거치지 않으므로 CSP만 막는다.

## 맡지 않는 것 (경계)

- 파일 형식의 해석과 저장 바이트는 엔진의 범위다. 엔진에 문제가 보이면 여기서 돌려 막지 않는다.
- 탭, 창, 메뉴, 열기 대화 상자, 파일 이름이나 앞머리로 이 편집기를 고르는 일은 `apps/shell`의 범위다(`app-routing.ts`의 `EXCALIDRAW_RE`, `drawing-note.ts`). 이 모듈은 껍데기가 부르는 함수(`createExcalidrawView`, `requestExcalidrawSave`, `requestExcalidrawClose`, `sendExcalidrawMenuCommand` 등)를 내보낼 뿐이다.
- AI는 아직 없다. 공용 `ai:*` 창구와 구독 창구를 부르지도 등록하지도 않는다.

## 항상 지켜야 하는 것

- **`ok`로 열리지 않은 파일에는 쓰지 않는다.** 경로가 저장 대상이 되는 것은 메인 프로세스가 그 파일을 엔진으로 직접 열어 `ok`를 본 뒤다. 그 전과, 열리지 않았다면 끝까지, 저장 호출·메뉴 저장·닫기 확인이 모두 거절된다. 저장으로 넘어온 바이트도 그 뷰의 형식으로 열릴 때만 쓴다.
- **저장은 파일의 형식을 바꾸지 않는다.** 노트는 노트로, `.excalidraw`는 `.excalidraw`로 저장한다. 렌더러가 다른 형식을 보내면 거절한다. 새 그림은 노트(`.excalidraw.md`)다.
- **열기만 한 그림은 원본 바이트 그대로 저장된다.** 라이브러리는 불러올 때 요소를 다시 만들므로, 첫 변경 알림을 기준으로 삼고 요소 판(`hashElementsVersion`)과 저장하는 그림판 설정(`SAVED_APP_STATE_KEYS`)이 달라졌을 때만 바뀜이다. 스크롤·확대·선택은 바뀜이 아니다. 바뀐 저장은 달라진 그림판 설정만 파일의 설정 위에 덮는다.
- **노트가 가리키는 그림은 보관함 안에서만 읽는다.** `.obsidian`이 있는 가장 가까운 위 폴더(없으면 노트 폴더) 안의 그림 파일만, 실제 경로(연결을 푼 경로)까지 확인한 뒤 읽는다. 숨은 폴더, 그림이 아닌 파일, 20MB를 넘는 그림, 바깥으로 나가는 경로는 읽지 않는다. 열린 노트가 없는 뷰는 아무것도 읽지 않는다.
- **노트에는 그림을 새로 넣지 않는다.** 노트를 열면 그림 도구를 끄고(붙여 넣기도 함께 막힌다), 파일 끌어 놓기는 모든 형식에서 막는다. 그림판은 끌어 놓은 파일 안의 장면을 열린 그림 위에 불러오기 때문이다. 문서 파일을 끌어 놓으면 preload가 먼저 받아 탭으로 연다(`installDocumentDropFirst`).
- **네트워크에 닿지 않는다.** 글꼴은 앱 안에서 읽고, 공유 라이브러리·실시간 공동 작업·AI·웹 임베드는 끄며(`validateEmbeddable={false}`, `aiEnabled={false}`), 렌더러 CSP(`index.html`)가 바깥 주소와 프레임을 막는다. 라이브러리의 이미지 내보내기·장면 불러오기 메뉴도 끈다.
- **링크는 글자로만 다루고 여는 것은 메인 프로세스다.** `onLinkOpen`은 라이브러리의 기본 열기를 막고 `openLink` 창구로 넘긴다. 메인 프로세스가 `safeExternalUrl`을 통과한 주소(http, https, mailto)만 연다.
- 그림의 색은 문서 내용이다. 라이브러리의 어두운 그림판은 보이는 모습만 바꾸고 저장 내용은 같다. 편집기가 그리는 틀(자동 저장 칸, 알림)만 토큰으로 칠한다.

## 이 모듈의 방식

- 메인 코드는 shell 번들에 들어간다. `src/main`을 고친 뒤에는 shell을 다시 빌드한다.
- 메뉴의 되돌리기·다시 하기는 그림판이 읽는 단축키 이벤트를 보내서 한다(라이브러리에 되돌리기 함수가 없다). 단축키 자체는 그림판이 받으므로 메뉴는 단축키를 등록하지 않는다.
- 저장은 Ctrl+S를 캡처 단계에서 받아 글을 치는 중에도 된다. 자동 저장(30초, 창이 포커스를 잃을 때)은 제목 없는 그림을 건너뛰고, 글 상자를 고치는 중에는 그 차례를 건너뛴다.
- 라이브러리의 화면 언어는 `lang.ts`가 앱 언어에서 고른다. 말레이어는 라이브러리에 없어 영어다.

## 테스트

- 실행: `npm run test -w @genoffice/excalidraw`, `npm run typecheck -w @genoffice/excalidraw`.
- 바꾸면 반드시 테스트하는 것: 열기만 한 그림이 바뀜이 아니고 원본 바이트로 저장되는 것과 저장한 뒤의 바뀜(`tests/session.test.ts`), 열리지 않은 파일에 어떤 길로도 쓰지 않는 것·형식을 바꾸는 저장 거절·링크 거절(`tests/main.test.ts`), 보관함 밖과 숨은 폴더의 그림을 읽지 않는 것(`tests/embedded.test.ts`), 21개 언어 문구(`tests/i18n.test.ts`).
- 그림판 자체(그리기, 붙여 넣기, 글꼴)는 단위 테스트가 보지 않는다. 빌드한 앱에서 확인한다.
