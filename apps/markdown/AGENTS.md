# apps/markdown (`@genoffice/markdown`)

Markdown 에디터다. 일반 `.md` 파일 위에서 TipTap 블록 편집기를 돌리고, 일반 텍스트와 JSON은 원문 편집기로 연다. AI는 공용 배선 위에 Markdown용 skill을 얹은 얇은 구성이다.

## 맡은 범위

- 렌더러(`src/renderer/`): 블록 편집기와 확장(`editor/`), Markdown 직렬화와 블록 단위 저장(`markdown/roundtripSerializer.ts`, `markdown/sourceSplice.ts`), 원문 편집기(`source/`), 내보내기 화면(`export/`).
- 메인 프로세스(`src/main/markdown-main.ts`와 주변): 열기·저장, 문서가 소유한 자산 폴더 관리(`asset-lifecycle.ts`), 이미지 호스트 업로드(`image-host.ts`), 이미지 내보내기 세션(`image-export.ts`), PDF 인쇄(`print-pdf.ts`), 변환 임시 세션(`conversion-lifecycle.ts`), ODT 내보내기(`odt-export.ts`), PDF 편집기의 "노트에 넣기"를 받는 대기열(`note-append.ts`, 화면 쪽은 `src/renderer/note-append.ts`), 내부 링크의 경로 풀기와 IPC(`link-resolve.ts`, `link-ipc.ts`).
- 공유 계약 `src/shared/`: IPC(`ipc.ts`의 `MARKDOWN_CHANNELS`), 열기 방식 판정(`text-mode.ts`), 원문 형식 보존(`source-text.ts`), 링크·위키링크 해석(`internal-links.ts`).
- 내부 링크(결정 0059): 위키링크 장식·`Ctrl+클릭`·그림 임베드·`[[` 자동완성(`src/renderer/editor/internalLinks.ts`), 따라간 링크의 처리(`src/renderer/internal-link-host.ts`), `[[` 목록(`components/NoteLinkMenu.tsx`).
- Markdown의 AI: 패널(`src/renderer/ai/AiPanel.tsx`), skill과 도구(`markdown-skill.ts`, `tools.ts`, `doc-writer.ts`, `search-skill.ts`), 막힌 실행과 이미지 도구 판정(`ai-connection.ts`), 연결 상태(`subscription-client.ts`), 가림 표시(`src/renderer/editor/redact.ts`).

## 맡지 않는 것 (경계)

- AI 요청의 실행은 이 모듈의 범위가 아니다. 공용 `ai:*` 채널과 구독 IPC 채널은 `apps/docs/src/main/docs-main.ts`의 `registerAiIpc`가 등록하고 이 모듈은 등록하지 않는다. 단독 실행(`startMarkdownStandalone`)에는 AI 핸들러가 없어 패널의 연결 상태가 `checking`에 머문다.
- 제공자 선택은 `packages/ai-provider`, 보내기 규칙과 연결 카드·알림은 `packages/ui`, 가림 규칙의 공통 부분(표식 생성·검사, 범위의 모델용 글)은 `packages/agent-core`의 범위다. 이 모듈의 `redact.ts`는 Markdown에 필요한 명세만 넘긴다.
- docx 생성 자체는 `packages/docx-engine`의 범위다. "변환해서 문서 에디터로 열기"로 만든 docx는 shell이 문서 탭으로 보낸다.
- 탭, 창, 구독 프로그램의 수명은 `apps/shell`의 범위다.

## 항상 지켜야 하는 것

- 한 단어를 고친 저장이 파일 전체를 다시 쓰지 않는다. 저장은 원문을 최상위 블록으로 나눠 바뀐 블록만 다시 직렬화한다(`sourceSplice.ts`). 전체 재직렬화는 목록 기호, 강조 표기, 빈 줄을 정규화하고 스키마가 담지 못하는 것(링크 참조 정의, 각주 정의, 원시 HTML 블록)을 떨어뜨린다. 사용자가 git으로 관리하는 노트에 무관한 diff를 만든다.
- 원문 편집에서는 BOM, 줄 끝 형식, 끝 개행이 바이트 그대로 살아남아야 한다(`source-text.ts`). 일반 텍스트와 JSON은 블록 편집기로 열지 않는다(`text-mode.ts`). 블록 편집기는 `---`, `*x*`, `1.`을 다르게 해석하고 줄 끝을 정규화해 고치지 않은 파일을 다시 써 버린다.
- 문서 옆에 두는 파일의 이름을 바꾸지 않는다. 문서와 같은 폴더의 `assets/` 안에 앱이 소유한 파일 목록 `.genoffice-assets.json`(`ASSET_MANIFEST_FILENAME`)이 있고, 이것으로 "앱이 넣은 이미지"와 "사용자가 넣은 파일"을 구분한다. 이름을 바꾸면 기존 문서의 자산을 더는 앱의 것으로 알아보지 못한다. 앱이 넣지 않은 파일은 지우지 않는다.
- 가려진 범위는 실제 글자 위의 표시다. 문서와 디스크의 파일은 원래 글자를 그대로 갖고, 모델에게 직렬화될 때만 `{{label}}`로 나간다. 변환은 Markdown 직렬화 전에 JSON에서 한다(`redactJson`). 텍스트 노드에 걸린 mark는 직렬화기가 mark의 렌더 함수로 보내지 않아, 직렬화 뒤에 바꾸려 하면 아무 일도 일어나지 않는다. `redactJson`은 throw하지 않고 모르는 노드는 통과시킨다. 모델의 편집은 표식이 쪼개지지 않았는지 검사한 뒤에만 받아들인다.
- 이 모듈이 갖는 AI 채널은 `markdown:ai-generate-image` 하나다. 호출할 때 `{ path: 'screen', statuses: sharedSubscriptionStatuses() }`를 넘기고 로컬 경로는 문서 폴더와 붙여 넣기 임시 폴더로 제한한다. 가용성은 `AI_TOOL_CAPABILITIES_CHANNEL`(문서 에디터의 메인이 등록한 채널과 같은 이름이어야 한다)로 묻고, 답이 없으면 이미지 도구를 내놓지 않는다.
- 구독 API의 채널 이름과 판독 함수는 `@genoffice/ai-provider/browser`의 것을 쓰고 사본을 만들지 않는다. 보내기 판단은 `useAiSendGate`만 쓴다. 다른 제공자로 저절로 넘어가는 코드를 넣지 않는다.
- 이미지 호스트의 자격 증명은 메인 프로세스에만 둔다. 업로드는 메인에서 하고 로컬 `assets/` 사본을 대체 경로로 유지한다.
- ODT로 내보내기(`'odt'` 요청, `markdown:export-odt`)는 docx 내보내기가 만든 바로 그 바이트(`exportDocxBytes`)를 `@genoffice/odt-engine`의 `docxToOdt`로 바꾼 것이다. ODT용 문서를 따로 만들지 않는다. 그래서 가린 범위도 docx 내보내기와 똑같이 다뤄진다(가림은 모델에게만 적용되고 내보낸 파일에는 원래 글자가 들어간다). ODT 경로가 docx보다 더 드러내는 것이 없다.
- ODT 내보내기 순서: 저장 창(`.odt`) → docx → ODT → `report`가 비어 있지 않으면 "바뀌는 것·빠지는 것" 확인 창(뒷단의 `dialog.showMessageBox`, 문구는 `odt-export.ts`의 21개 언어 사전) → 쓰기. 취소하면 아무것도 쓰지 않는다. 테마 부분이 있다는 것만으로는 보고하지 않으므로, 보통의 마크다운 문서는 확인 창 없이 바로 쓴다. 편집 화면 그림(`renderedObjects`)은 넘기지 않고, 수식은 엔진의 이름표 상자가 된다.
- **"노트에 넣기"(결정 0043)는 노트 파일에 쓰지 않는다.** 셸이 노트 탭의 webContents에 글을 맡기면(`queueMarkdownNoteAppendFor`, 알림 `markdown:note-append-ready`), 그 탭의 화면이 `markdown:note-append-take`로 한 번만 가져가 블록 편집기의 문서 **끝에** 되돌릴 수 있는 편집으로 넣고 "바뀜" 상태로 만든다. 저장은 사람이 그 탭에서 한다. 이 편집기는 바깥에서 바뀐 파일을 다시 읽지 않으므로, 파일에 직접 쓰면 열린 탭과 디스크가 어긋난다. 맡긴 글은 그 노트 파일을 보여 주는 탭만 가져간다. 제목 없는 탭, 다른 파일을 보여 주는 탭, 원문 편집기로 연 파일, 가져간 뒤 다시 불러온 탭, 먼저 닫힌 탭은 아무것도 받지 않는다.
- 미리 보기와 내보내기의 문서 스타일은 문서 내용이다. 크롬 색 토큰은 리본·패널 같은 UI에만 쓴다.
- **위키링크(`[[…]]`, `![[…]]`)는 문서에서 글자다(결정 0059).** 링크 모양과 임베드 그림은 ProseMirror 장식으로만 그린다. 새 노드나 mark로 바꾸면 블록 저장이 원문을 바꿀 수 있다. 코드 칸·코드 블록 안은 꾸미지 않는다.
- **링크의 경로는 뒷단만 만든다.** 화면은 링크 글자만 보내고(`markdown:open-link`), 뒷단이 그 탭의 파일을 기준으로 푼다. 네트워크 경로(`\\서버`, `//서버`)는 파일이 있는지도 보지 않는다. 찾은 파일은 껍데기 앱의 문서 라우터(`openLinkedPath`)로만 열고 `shell.openPath`를 쓰지 않는다. 링크를 여는 것은 사람의 `Ctrl+클릭`뿐이고 AI 도구에는 주지 않는다.
- 그림 임베드는 보관함 안의 20MB 이하 그림만 보여 준다. 뒷단이 푼 실제 경로를 그 탭에 허가하고(`isEmbedGranted`), 탭이 닫히면 `forgetLinkState`로 지운다. `md-asset://`의 문서 폴더 검사를 넓히지 않는다.

## 이 모듈의 방식

- 메인 코드는 shell 번들에 들어간다(`../../../markdown/src/main/markdown-main`을 상대 경로로 import한다). `src/main`을 고친 뒤에는 shell을 다시 빌드한다.
- 경로는 뷰별로 허가된 것만 다룬다. 새 창을 만들 때 `grantAndTrack`으로 열 파일을 등록한다.
- TipTap 패키지는 `electron.vite.config.ts`의 `dedupe`로 이 앱의 사본 하나에 고정한다. 문서 에디터가 다른 버전을 쓰고 npm이 일부를 저장소 루트로 올리기 때문에, 고정하지 않으면 번들에 코어가 둘 들어간다. TipTap 확장을 추가하면 이 목록에도 넣는다.
- 패널은 다른 에디터와 같은 부품으로 조립한다(`AiConnectPrompt`, `AiFirstConnectionNotice`, `AiBlockedNotice`, `aiRunErrorText`). 막힌 실행의 원인은 전송이 기록한 마지막 실패가 그 메시지의 실패일 때만 쓴다.
- `odt-export.ts`는 HTML 편집기의 같은 이름 파일과 내용이 같다. 한쪽을 고치면 다른 쪽도 고친다.
- 문자열은 `src/renderer/i18n/strings.ts` 한 파일에 21개 언어가 있고 `zh`가 키 집합을 정한다. 구독 연결 문장과 AI 진입 이름은 `@genoffice/ui`의 것을 쓴다.

## 테스트

- 실행: `npm run test -w @genoffice/markdown`(또는 이 폴더에서 `npx vitest run`), `npm run typecheck -w @genoffice/markdown`. 환경은 `jsdom`이다.
- 저장 경로를 바꾸면 "고치지 않은 블록의 바이트가 그대로인지"를 테스트한다. 링크 참조 정의, 각주, 원시 HTML 블록, CRLF 파일, BOM이 있는 파일을 포함한다.
- 가림을 바꾸면 쪼개진 표식, 가려진 범위를 가로지르는 선택, 모르는 노드 형태에서 원문이 모델용 글에 남지 않는지 테스트한다.
- 노트에 넣기(`tests/note-append.test.ts`, `tests/note-append-editor.test.ts`): 그 노트를 보여 주는 탭만 한 번 가져가는지, 문서 끝에 넣고 바뀜이 되는지, 파일은 그대로인지.
- 내부 링크: 해석(`tests/internal-links.test.ts`), 보관함 검색·네트워크 경로·보관함 밖 거절(`tests/link-resolve.test.ts`), IPC와 그림 허가(`tests/link-ipc.test.ts`), 편집기의 장식·저장 바이트·`Ctrl+클릭`·임베드·`[[` 목록(`tests/internal-links-editor.test.ts`). 빌드한 앱에서는 `e2e/markdown-internal-links.spec.ts`.
- AI 배선: 가용성 답이 없을 때 이미지 도구가 빠지는지, 막힌 실행 판정, 핸들러가 없을 때의 연결 상태. 이 모듈의 테스트는 제공자를 부르지 않는다.
- Windows에서 `tests/image-export.test.ts`의 "disposes only the closing renderer's unfinished export" 한 건은 변경과 무관하게 실패한다(경로가 `/`로 시작하는지 비교한다).
- `node_modules`를 다른 체크아웃에 연결한 git worktree에서는 `ai-tools`·`slash-and-image` 테스트가 katex 모듈 해석 오류로 실패한다. 원래 체크아웃에서는 통과한다.
