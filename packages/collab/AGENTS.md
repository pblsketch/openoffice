# packages/collab (`@genoffice/collab`)

같은 네트워크(LAN)에 있는 사람들이 한 문서를 함께 보고 고치는 기능의 화면 쪽 공용 부품이다(결정 0073). 편집기 렌더러가 쓰는 세션, 접속자 표시, 호스트가 순서를 정하는 연산 기록, 편집기 엔진별 연결부, 공유와 참여 창과 그 문구(21개 언어)를 담는다. 소스(TS/CSS)를 그대로 내보내고 빌드 단계가 없다.

## 맡은 범위

- 세션(`src/session.ts`의 `CollabSession`): 공유 상태 `Y.Doc`, 접속자 상태(`awareness`), 앱 메시지(`send`, `on`), 손님에서 호스트로 가는 요청(`request`, `handle`), 끝남 알림.
- 중계 위의 Yjs 프로토콜(`src/provider.ts`): y-protocols의 동기화 메시지와 접속자 메시지에 앱 메시지, 요청, 응답을 더한 것. 호스트 탭이 기준이고, 손님은 호스트하고만 처음 동기화한다.
- 시작(`src/connect.ts`): 호스트 시작(`startHosting`, 공유 상태를 먼저 채운 뒤 LAN을 연다), 손님 탭의 세션 받기(`takeGuestSession`).
- 호스트가 순서를 정하는 연산 기록(`src/op-log.ts`의 `OpLog`): Yjs 형이 아닌 모델(엑셀, 슬라이드, 마인드맵)용. 손님 연산은 제안으로 가고, 호스트가 순서를 정해 모두에게 다시 보낸다. 순서가 어긋났거나, 거절되었거나, 받은 연산이 적용되지 않으면 손님은 호스트의 현재 바이트로 다시 맞춘다(epoch). 손님은 `snapshot`을 부른 뒤 기록된 연산을 모두 다시 적용하므로, 편집이 `submit`보다 먼저 모델에 닿는 편집기는 그 편집을 바이트에서 빼거나 손님에게 건너뛰라고 알려야 한다.
- React 훅 `useCollab`(`src/use-collab.ts`): 편집기가 "무엇을 공유하는가(`describe`)", "어떻게 연결하는가(`bind`)"만 알려 주면 공유, 참여, 손님 탭 넘겨받기, 끝남을 모두 처리한다.
- 화면 부품: `CollabButton`(리본 진입점, 들어와 있는 사람의 머리글자), `CollabDialog`(공유와 참여 창, PIN, 주소, 사람 목록, LAN에서 찾기), `CollabNotice`(끝남 알림), 문구 `src/strings/<언어>.ts`(`zh`가 키 집합을 정한다).
- 엔진별 연결부: TipTap(`@genoffice/collab/tiptap`, 워드와 마크다운)과 CodeMirror(`@genoffice/collab/codemirror`, HTML).

## 맡지 않는 것 (경계)

- 네트워크는 이 패키지의 일이 아니다. LAN 서버, 연결, PIN 검사, 찾기 알림은 껍데기 앱 뒷단(`apps/shell/src/main/collab/`)이 하고, 이 패키지는 preload 다리(`window.aiOfficeCollab`, `@genoffice/electron-utils/collab-bridge`)만 부른다.
- 손님 탭을 여는 일은 껍데기 앱이 한다. 호스트가 보낸 바이트를 임시 폴더에 쓰고 양식 사본과 같은 길(`openTemplateCopyTab`)로 같은 편집기의 제목 없는 새 탭을 연다. 편집기는 문서가 화면에 뜬 뒤 `useCollab`이 세션을 넘겨받는다.
- 저장은 편집기의 일이다. 호스트는 평소처럼 저장하고, 손님은 세션 동안 저장하지 않는다.

## 항상 지켜야 하는 것

- 공유 상태를 채우는 쪽은 호스트뿐이다. `bind`에서 호스트는 지금 문서를 공유 상태에 넣고, 손님은 첫 동기화(`synced`) 뒤에 연결되어 호스트의 내용을 받는다. 손님이 자기 사본으로 공유 상태를 덮어쓰는 길을 만들지 않는다.
- 다른 사람의 변경은 실행 취소 대상이 아니다. TipTap 편집기는 `CollabHistory`를 확장 목록에 넣어 `undo`와 `redo`가 세션 동안 자기 변경만 되돌리게 하고, 다른 사람이 글을 쓴 블록을 내 실행 취소가 지우지 않도록 자기 블록 노드 이름을 `bindTiptap`의 `protectedNodes`로 넘긴다. 세션 중에 기록을 비울 때는 `clearCollabHistory`를 쓴다(편집기의 history 플러그인을 다시 등록하면 연결이 끊긴다). CodeMirror 연결부는 원격 변경을 기록에서 뺀다. 연산 기록을 쓰는 편집기는 원격 연산을 적용할 때 자기 되돌리기 기록에 넣지 않는다.
- 손님은 저장하지 않는다. 저장 요청은 `guestSaveBlocked` 알림으로 막고, 복구 사본도 쓰지 않는다. 세션이 끝나면 손님의 사본은 그 PC의 저장하지 않은 문서가 된다(`onEnded`에서 "바뀜"으로 만든다).
- 남의 커서와 선택 표시는 화면 전용이다. 인쇄, 내보내기, 썸네일에 들어가면 안 된다. DOM을 복제해 인쇄하는 편집기는 `stripCollabMarks`를 거친다. 표시는 `.collab-caret`, `.collab-selection` 클래스와 `--collab-<n>` 토큰만 쓴다.
- 문구는 21개 언어 모두에 있어야 한다. `zh.ts`가 키 집합을 정하고 나머지는 `satisfies Record<keyof typeof zh, string>`으로 같은 키를 강제받는다. 영어를 다른 언어에 복사해 넣지 않는다.
- 색은 토큰이다. 사람마다 `--collab-0`…`--collab-7`(`packages/ui/src/tokens.css`의 세 묶음)과 글자색 `--collab-ink`. 캔버스에 그리는 편집기는 그릴 때 `getComputedStyle`로 값을 읽는다.

## 편집기를 붙이는 방법

1. preload에 다리를 연다: `contextBridge.exposeInMainWorld(COLLAB_BRIDGE_KEY, collabBridge())`.
2. 편집기 앱의 `package.json`에 `@genoffice/collab`을 넣고, 렌더러 dedupe에 `yjs`를 넣는다(TipTap 편집기는 `@tiptap/y-tiptap`도).
3. 렌더러에서 `useCollab({ kind, ready, describe, bind, shareBlock?, onEnded? })`를 부르고 `CollabButton`, `CollabDialog`, `CollabNotice`를 그린다. 편집기별 코드는 새 모듈(`src/renderer/collab.ts` 등)에 두고 `App.tsx`에는 훅 호출과 판정 몇 줄만 둔다.
4. `describe`는 저장했다면 쓸 바이트를 준다(복구 사본과 같은 값). 공유할 수 없는 문서(암호 문서, 먼저 저장해야 하는 상태 등)는 `shareBlock`으로 거절한다.
5. `bind`에서 엔진별 연결부를 부르고, 손님일 때 저장, 복구 사본, "바뀜" 표시를 끈다. 세션 동안 쓸 수 없는 기능은 `guestBlocked`, `hostBlocked` 문구로 막는다.

## 테스트

- 실행: `npm run test -w @genoffice/collab`(또는 이 폴더에서 `npx vitest run`), `npm run typecheck -w @genoffice/collab`.
- `tests/fake-relay.ts`가 껍데기 앱의 중계를 메모리에서 흉내 낸다. 손님의 메시지는 탭이 세션을 넘겨받을 때까지 붙잡혀 있다가 나간다.
- 바꾸면 반드시 테스트하는 것: 늦게 들어온 손님이 같은 상태를 받는지, 손님이 나가면 접속자 목록에서 빠지는지, 호스트가 끝내면 손님 세션이 끝나는지, 연산 기록의 순서, 거절, 다시 맞추기, epoch.
- 두 앱을 띄운 실제 확인은 편집기마다 `e2e/collab-<편집기>.spec.ts`다(빌드 후 `E2E_NO_VIDEO=1`로 하나씩 돌린다). 손님은 기본 포트로 접속하므로 두 시험을 동시에 돌리지 않는다.
