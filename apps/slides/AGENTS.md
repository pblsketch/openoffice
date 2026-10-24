# apps/slides (`@genoffice/slides`)

PowerPoint 프레젠테이션(.pptx) 에디터다. 파일을 바이트 그대로 열어 Konva 캔버스에 높은 충실도로 그리고, 고친 요소만 패치해 저장한다. AI는 슬라이드를 만들고 고치는 도구를 가장 많이 가진 에디터다.

## 맡은 범위

- 렌더러(`src/renderer/`): 캔버스(`SlideCanvas.tsx`, `NodeBody.tsx`, `konva-adapter.ts`), 편집 동작(`*-actions.ts`), 발표 화면, 내보내기 렌더링(`export-*.ts`), 리본과 패널(`components/`).
- 메인 프로세스(`src/main/`): 세션과 실행 취소 이력(`session-state.ts`), 문서 변경의 단일 통로와 IPC(`slides-main.ts`), 글꼴 탐색과 사용자 글꼴 설치(`fonts.ts`, `font-store.ts`), PDF 내보내기와 인쇄, 발표자 화면(`presenter-show.ts`), 생성된 쪽 임시 파일 정리(`generated-page-temp.ts`).
- 슬라이드의 AI: 패널과 skill(`src/renderer/ai/AiPanel.tsx`, `slides-skill.ts`), 편집 대기 카드, 레이아웃 스크립트 해석기(`layout-script-interpreter.ts`), 슬라이드 품질 검사(`slide-qc.ts`), 가림 처리(`redact.ts`, `redact-guard.ts`), 모델 프롬프트(`ai/prompts/*.md`). 첨부 칸에는 로컬 파일, "Google 드라이브에서 첨부", "이음오피스 문서에서 첨부"(`DocAttachButton`, 결정 0035)가 있고, 열린 문서 고르기는 `window.aiOfficeDocs`가 있을 때만 나온다. 자체 입력란은 스킬과 `@` 문서 목록(결정 0051)을 함께 여는 `useComposerPickers`를 쓰고, `docMention`(`docMentionActions`)으로 같은 첨부 길에 붙인다. 받는 형식 목록은 `packages/file-parse`의 `attachable.ts` 한 곳을 따르고(`slides:files-*`), 첨부는 드라이브 첨부와 같은 길로 첨부 칸에 든다.
- AI IPC(`src/main/ai-ipc.ts`): 단독 실행용 공용 핸들러 `registerAiIpc`(`ai:read-url` 포함), 슬라이드에만 있는 핸들러 `registerSlidesOnlyAiIpc`, 그 규칙(`ai-stream.ts`).

## 맡지 않는 것 (경계)

- pptx의 해석·모델·연산·렌더 모델은 이 모듈의 범위가 아니다. `packages/pptx-engine`, `packages/pptx-ops`, `packages/pptx-render`가 한다. 가림 표식을 파일에 쓰고 읽는 것도 엔진이 한다(`<a:extLst>`). 이 모듈의 `redact.ts`는 파일을 건드리지 않는다.
- 배포되는 앱에서 공용 `ai:*` 채널(`ai:stream`, `ai:get-settings`, `ai:web-search` 등)은 `apps/docs/src/main/docs-main.ts`의 `registerAiIpc`가 응답한다. 이 모듈의 `registerAiIpc`는 shell 안에서는 호출되지 않고 단독 실행에서만 돈다.
- 제공자 선택과 구독 프로그램 실행은 `packages/ai-provider`, 이미지 생성·미디어 분석의 경로 결정은 `packages/ai-search`, 보내기 규칙과 연결 카드·알림은 `packages/ui`의 범위다.
- 탭, 창, 구독 프로그램의 잔여 프로세스 정리는 `apps/shell`의 범위다.

## 항상 지켜야 하는 것

- 문서를 바꾸는 모든 것은 연산 실행기를 지나고, 실제로 적용되는 트랜잭션은 `journaledTxn` 하나를 통한다. IPC 핸들러에서 `runTxn`을 직접 불러 문서를 바꾸지 않는다. 직접 호출이 허용되는 것은 검증용 `dryRun`과 끌기 도중의 미리 보기 프레임뿐이다(중간 프레임을 기록하면 기록이 넘치므로 확정된 결과만 남긴다). 이 통로를 우회한 변경은 연산 기록에 남지 않아 같은 문서를 보는 다른 화면이 따라오지 못한다.
- 슬라이드 내용은 테마가 다시 칠하지 않는다. 슬라이드 요소의 색, 내보내기·인쇄 결과, 차트 색상표, WordArt 프리셋은 문서 데이터이고 크롬 토큰을 참조하지 않는다. 캔버스에 그리는 편집용 표시의 색은 `src/renderer/canvas-colors.ts`의 `CANVAS_COLORS` 표에 두고 그리기 호출에 색을 직접 적지 않는다. 지금 표에 있는 가림 틀은 축소판에도 그려지므로 두 테마에서 같은 색이다.
- AI가 낸 레이아웃 스크립트는 `eval`·`Function`·VM·워커로 실행하지 않는다. Acorn으로 파싱해 제한된 AST 해석기로만 돌린다. 식별자는 해석기가 만든 범위에서만 풀리고, 호출은 해석기가 만든 함수와 명시된 내장만 허용하며, 단계 수·호출 깊이·정규식 단계에 상한이 있다. 편집은 버퍼에 쌓였다가 수동 편집과 같은 통로로 적용되고, 오류가 나면 버퍼를 전부 버린다. 해석기가 네트워크·IPC·DOM에 닿을 길을 만들지 않는다.
- 가려진 내용은 지워지지 않는다. 가려진 run은 실제 글자를 담은 채 남고 모델에게 직렬화될 때만 `{{label}}`로 나간다. 모델이 표식을 쪼개거나 지어낼 수 있으므로 모델의 편집은 덱에 들어가기 전에 검사한다. 가려진 그림·영상·음성은 모델에게 참조 자체를 주지 않는다(연결된 미디어의 주소는 재사용 가능한 서명 URL일 수 있다).
- 문서 옆에 쓰는 파일의 이름을 바꾸지 않는다. 생성된 초안 옆의 스타일 기록은 같은 이름의 `.styleskill.json`이다. 생성된 쪽의 표식 `cloudpptx:`와 임시 폴더 이름(`genoffice-cloud-pages`, `genoffice-local-pages`)은 "생성된 쪽"을 뜻하는 내부 이름이라 그대로 둔다.
- shell 안에서도 필요한 슬라이드 전용 AI 채널은 `registerSlidesOnlyAiIpc`에 둔다(`slides:ai-tool-capabilities`, `ai:generate-image`, `ai:analyze-media`, `ai:insert-image-url`, `ai:save-sidecar` 등). `registerAiIpc`에 두면 배포 앱에서 "핸들러 없음" 오류가 난다. 반대로 문서 에디터가 이미 등록하는 공용 채널을 여기서 또 등록하면 예외가 난다.
- 요청은 다른 제공자로 넘어가지 않는다. 단독 실행의 `ai:stream`은 `resolveStreamTarget`으로 대상을 정하고, 실행할 수 없는 선택은 원인을 담아 거절한다. 이 규칙은 문서 에디터의 것과 같은 답을 내야 한다.
- 모델에게 주는 도구는 실제 경로가 있는 것만이다. 렌더러는 메인의 가용성 보고(`slides:ai-tool-capabilities`)가 답하기 전에는 이미지 생성·미디어 분석 도구를 내놓지 않는다(`toolGatesOf`).
- 구독 IPC는 `ensureSubscriptionIpc`로만 등록하고 `initSubscriptionChildTracking`은 부르지 않는다. 단독 실행 진입은 `will-quit`와 `process.on('exit')`에서 `shutdownSubscriptionChildren`을 부른다.
- 지금은 글꼴을 내려받는 기능이 없다. 글꼴 목록은 PC에 설치된 것과 앱에 든 것이고, "글꼴 파일 설치"는 사용자가 가진 파일을 앱의 글꼴 폴더(`<userData>/fonts`)로 복사한다. 시스템에는 설치하지 않는다. 디자인 템플릿 글꼴 폴더는 읽기만 한다.
- 디자인 템플릿의 동작 지시는 `prompts/system.md`에 넣지 않는다. 템플릿을 고른 문서에만 붙는 문맥 블록(`slides-skill.ts`, "The user chose a design template …")에 둔다. 템플릿을 고르지 않은 요청은 템플릿이 생기기 전과 같은 글을 보내야 한다.
- 쪽 작성기의 시스템 프롬프트는 `buildPageSystemPrompt`(`src/renderer/ai/page-system-prompt.ts`)가 만든다. 템플릿이 없는 요청의 글은 `tests/fixtures/page-system-prompt.baseline.json`과 바이트까지 같아야 한다(`tests/page-system-prompt.test.ts`). 템플릿 장치 예외(`TEMPLATE_DEVICES_EXEMPTION`)는 내장 템플릿이나 거기서 저장한 스타일일 때만 끝에 붙인다. 테스트를 통과시키려고 이 고정 자료를 고치지 않는다.
- 문서마다 고른 템플릿은 `.pptx` 안이나 곁에 쓰지 않는다. `<userData>/slides-template-selections.json` 한 파일에 정규 경로를 키로 두고(`src/main/template-selection-store.ts`, 최대 2,000개, 오래 안 쓴 것부터 버림), 채널 `slides:ai-template-selection-get`·`-set`은 `registerSlidesOnlyAiIpc`에 있다. 문서는 인자가 아니라 호출한 창의 세션으로 정한다. 첫 저장, 다른 이름으로 저장, 외부 도구의 저장은 기록을 새 경로로 따라가게 하고, 앱 안의 이름 바꾸기·옮기기는 기록을 옮긴다(shell의 `tests/slides-template-selection-move.test.ts`).
- 열기 암호가 걸린 덱(결정 0041)은 `preparePptxOpen`이 암호를 받아 풀고, 세션에 `password`를 남긴다. 덱을 디스크에 쓰는 모든 길(저장, 다른 이름으로 저장, MCP 저장, 30초 복구 사본)은 `writeDeckFile`·`deckFileBytes`를 지나 같은 암호로 잠긴다. `savePptxToFile`을 직접 부르는 새 저장 길을 만들지 않는다. 화면 없는 내보내기에서는 묻지 않고 열지 않는다.
- AI로 만든 덱은 어디에도 저장하지 않는다(결정 0061). 제목 없는 덱은 저장 안 됨으로 남고 만든 이름이 첫 저장의 처음 이름(`firstSaveName`)이 되며, 사용자 파일에 덧붙이면 그 파일을 그대로 가리킨다(`nameGeneratedDeck`). 제목 없는 덱의 첫 저장은 언제나 저장 창을 띄운다. 기본 폴더에 조용히 저장하는 길을 다시 만들지 않는다. MCP 저장(`saveSessionDeckTo`)은 경로를 받으므로 묻지 않는다.
- 복구 사본은 공용 저장소(`createRecoveryStore`, `slides-autosave`)로만 쓰고 지운다. 제목 없는 덱의 사본도 앱 데이터 폴더의 제목 없는 칸에 두고, 문서 폴더에는 아무것도 만들지 않는다(이전 버전이 문서 폴더에 남긴 초안은 건드리지 않는다). 사본을 쓰기 전에 `beginWrite`로 표를 받고 나서 직렬화한다. 암호 없는 덱은 `writeCopyStreamed`로 사본 폴더의 임시 파일에 바로 흘려 쓰고(`writeDeckFile`), 암호 덱만 메모리에서 잠근 바이트를 `writeCopy`로 넘긴다. 30초마다 덱 전체를 메모리에 모으는 길로 되돌리지 않는다(8GB PC의 메모리). 저장은 `'saved'`, "저장 안 함"과 MCP의 저장 없이 닫기(`discardSlidesRecovery`)는 `'dontSave'`, 깨끗한 닫기(`releaseSlidesRecovery`)는 `'closedClean'`으로 지운다. 앱이 끝나는 중에는 저장소가 깨끗한 닫기의 지우기를 거절하므로 그 길을 우회하지 않는다. 사본이 있는 파일을 열 때는 `resolveRecoveryOnOpen`이 먼저 묻고, 시작 목록에서 정한 문서는 묻지 않는다. 실패 뒤 건너뛰기(`autosaveBackoff`)는 그대로 둔다.
- 견본 표지 그리기 채널 `slides:template-cover-render`(`src/main/template-cover.ts`)는 `registerSlidesIpc`에서 등록한다(shell 안에서도 불린다). 카탈로그 id와 `'ko'`·`'en'`만 받는다. 결과를 캐시하고, 열린 문서를 건드리지 않는다.

## 이 모듈의 방식

- 메인 코드는 shell 번들에 들어간다(`../../../slides/src/main/slides-main`을 상대 경로로 import한다). `src/main`을 고친 뒤에는 shell을 다시 빌드한다.
- 쓸 만한 답을 내지 못한 실행의 사후 기록(`ai:log-run-failure` → `userData/ai-run-failures.jsonl`, 2MB에서 한 세대 회전)은 `registerAiIpc`에 있어 단독 실행에서만 남는다. shell 안에서는 이 채널에 핸들러가 없다.
- 패널은 공용 부품으로 조립한다. 보내기는 `useAiSendGate`, 연결 상태와 막힌 실행 판정은 `src/renderer/ai/subscription.ts`, 문장은 `aiRunErrorText`를 쓴다. 메인의 핸들러는 먼저 로드된 모듈이 등록하므로 렌더러 쪽 호출은 모두 실패를 견딘다(없으면 상태는 `checking`).
- 프롬프트 파일(`src/renderer/ai/prompts/*.md`)은 Prettier 대상이 아니다. Prettier가 강조 표식과 목록 들여쓰기를 바꾸면 모델이 읽는 글이 달라진다. 이 파일들을 포매터에 넣지 않는다.
- 메인 프로세스의 Node `fetch`는 시스템 프록시를 쓰지 않아 `applyMainProcessProxy`가 환경 변수나 시스템 설정의 프록시를 전역 디스패처에 건다. 이 프록시는 구독 프로그램에는 전달되지 않는다(그쪽은 물려받은 환경 변수만 본다).
- 메모(클래식 검토 댓글)는 `slides:get-comments`(현재 페이지)와 `slides:get-all-comments`(전 덱, 읽기 전용)로 읽는다. 메모 창은 현재 페이지/모든 페이지 두 보기를 쓰고(순수 함수는 `comments-view.ts`), AI는 `read_comments` 도구와 덱 문맥의 메모 힌트로 읽는다. 메모는 가리기 표식 대상이 아니며, 저장은 기존 댓글 경로 그대로다.
- 문자열은 `src/renderer/i18n/`의 언어별 조각(`ai/`, `app/`, `panes/`, `ribbon/`)이고 `zh.ts`가 키 집합을 정한다. 21개 언어 모두에 넣는다. 구독 연결 문장은 `@genoffice/ui`의 것을 쓴다.
- 렌더러에서 문서의 템플릿 선택과 덧붙인 요청은 `src/renderer/ai/template-selection-state.ts` 하나가 쥔다. 기억된 키가 더 이상 풀리지 않으면(지운 저장 스타일 등) 선택 없음으로 읽는다. 템플릿 자료는 `@genoffice/pipelines/slides/templates`에서 가져온다(렌더러에서 써도 되는 하위 경로).
- 템플릿 글꼴: `src/main/template-fonts.ts`가 `templateFontsDir`로 공용 폴더를 찾고, `fonts.ts`가 그 폴더를 사용자 글꼴 저장소 다음의 두 번째 읽기 전용 개인 글꼴로 색인한다. 같은 패밀리가 PC에 설치되어 있으면 그것이 먼저다. 캔버스, PDF 내보내기, 인쇄가 이 글꼴로 그린다. 발표 화면의 청중 창은 따로 된 문서라서 그리기 전에 개인 글꼴을 따로 등록한다. 폴더 열기 채널 `slides:open-template-fonts-folder`는 shell이 부르는 `registerSlidesIpc`에 있고, 정확히 그 폴더만 연다.
- `vitest.config.ts`는 `@genoffice/pptx-*` 패키지를 이 저장소의 소스 경로로 고정한다. 하위 경로 별칭은 패키지 이름 별칭보다 앞에 둔다(문자열 별칭은 접두사 치환이다).

## 테스트

- 실행: `npm run test -w @genoffice/slides`(또는 이 폴더에서 `npx vitest run`), `npm run typecheck -w @genoffice/slides`. Windows에서 전부 통과한다.
- 열기·저장 경로를 바꾸면 손대지 않은 내용이 바이트 그대로 남는지 왕복 테스트를 붙인다.
- 해석기를 바꾸면 탈출 시도를 테스트한다. 생성자·프로토타입 체인으로 호스트 함수에 닿으려는 스크립트, 계산된 속성 이름, 끝나지 않는 루프, 재앙적 정규식이 모두 상한 안에서 거절되어야 한다.
- 가림을 바꾸면 쪼개진 표식, 지어낸 표식, 가려진 미디어의 주소가 모델용 직렬화에 남지 않는지 테스트한다.
- AI 배선(`tests/ai-stream.test.ts`, `tests/ai-subscription.test.ts`): 연결 없는 요청의 거절과 원인 필드, 가용성 보고가 오기 전의 도구 목록. `claude-code`·`codex`로 가는 테스트는 `AiStreamRun`의 `stream` 주입 지점이나 mock을 써서 실제 프로그램이 뜨지 않게 한다.
- 캔버스 그리기와 글꼴 측정의 실제 결과는 단위 테스트로 다 확인되지 않는다. 빌드한 앱에서 확인한다.
