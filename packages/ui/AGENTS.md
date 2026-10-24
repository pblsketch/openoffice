# packages/ui (`@genoffice/ui`)

모든 에디터와 shell의 렌더러가 함께 쓰는 React 부품, 디자인 토큰, 그리고 "모든 에디터가 똑같이 동작해야 하는" AI 패널 규칙을 담는다. 소스(TS/CSS)를 그대로 내보내고 빌드 단계가 없다.

## 맡은 범위

- 디자인 토큰 `src/tokens.css`. UI 크롬 색의 유일한 정의처다.
- AI 패널 공용 부품: 작성기 `AiComposer`, 모델 선택 `AiModelPicker`(`src/ai-model-picker-options.ts`의 `aiProviderPickerGroups`·`withAiProviderSelection`), 대기열 `useChatRunQueue`(`src/chat-run-queue.ts`), 패널 표시 설정(`src/ai-panel-prefs.ts`).
- 구독 연결 화면 부품과 그 규칙: `AiSubscriptionCard`·`AiConnectPrompt`, 연결 도우미 `AiConnectGuide`(규칙은 `src/connect-guide.ts`), `AiBlockedNotice`, `AiSubscriptionUsageLine`, `AiFirstConnectionNotice`·`AiCodexNotice`·`AiMeteredWarning`·`AiInputTruncatedNotice`, `AiMark`. 무엇을 보여 줄지는 순수 함수(`src/ai-subscription.ts`)가 정하고 컴포넌트는 배치만 한다.
- AI 창의 "Google 드라이브에서 첨부" 버튼 `DriveAttachButton`과 그 문구(`src/strings-drive-attach.ts`, 결정 0033). 편집기 preload의 `window.aiOfficeDriveAi`가 있고 드라이브가 연결돼 있을 때만 그린다. 고르기 창과 내려받기는 껍데기 앱의 일이고, 이 부품은 돌아온 경로와 알림 글을 편집기에 넘길 뿐이다.
- AI 창의 "이음오피스 문서에서 첨부" 버튼 `DocAttachButton`과 그 문구(`src/strings-doc-attach.ts`, 결정 0035). 편집기 preload의 `window.aiOfficeDocs`가 있을 때만(껍데기 앱 안에서 돌 때만) 그린다. 열린 문서·최근 문서의 고르기 창은 껍데기 앱의 일이고, 이 부품은 고른 파일 경로와 알림 글(`docPickedOf`로 거른 `{ paths, notes }`)을 편집기에 넘길 뿐이다. 고르는 동안에는 잠긴다.
- AI 창 입력란의 `@` 문서 목록(결정 0051): 규칙(`doc-mention-model.ts` — 여는 `@`, 고른 `@이름` 기억, 걸러 내기·정렬, 넣는 글과 이름이 겹칠 때의 `(폴더)`), 훅(`use-doc-mention.tsx` — `useDocMentionInput`, 스킬 목록과 함께 쓰는 `useComposerPickers`), 목록 `DocMentionPicker`, 문구 21개 언어(`strings-doc-mention.ts`), 편집기가 넘기는 붙이기·더 찾아보기(`doc-mention-actions.ts`의 `docMentionActions`), 폴더 이름 규칙(`attachment-folder.ts`, 편집기의 AI 첨부 목록도 같은 함수를 쓴다). `AiComposer`는 `docs` 속성이 있을 때만 목록을 연다. 목록은 `window.aiOfficeDocs.list()`로 받고, 껍데기 앱이 없으면 열리지 않는다.
- 사용자 스킬의 AI 창 부품(결정 0048): `/`·`$` 목록과 칩(`SkillPicker`, 규칙은 `skill-picker-model.ts`, 엑셀의 `$`는 입력칸 맨 앞만), 작성기 배선 `useComposerSkills`, 보낼 때 스킬 글을 요청에 넣기(`skill-send.ts`, 150,000자 상한), 스킬 카드 `SkillProposalCard`(`skill-card-model.ts`, `use-skill-proposals.tsx`의 `panelUserSkills`), 양식 동작 `SkillTemplateActions`(`use-skill-templates.tsx`, 비운 양식 만들기·그대로 저장·이 양식으로 새 문서 열기), 기본 스킬 설명과 문구 21개 언어(`strings-builtin-skills.ts`, `strings-skill-*.ts`). 목록·칩·카드는 스킬 이름을 보인다(`skillDisplayName`, 결정 0053). 스킬 파일을 읽고 쓰는 일은 껍데기 앱이 하고, 이 부품들은 다리를 부를 뿐이다.
- 보내기 규칙: `aiSendGate`와 관련 순수 함수(`src/ai-send-gate.ts`), 그것을 패널에 배선한 훅 `useAiSendGate`(`src/use-ai-send-gate.ts`).
- 구독 연결 관련 문자열 21개 언어(`src/strings-ai-subscription/<lang>.ts`, 집계 파일 `src/strings-ai-subscription.ts`)와 실행 오류 문장 `aiRunErrorText`.
- 보이는 로그인 창의 글(결정 0059): `aiSubscriptionLoginWindowText`(`src/ai-subscription-login-window.ts`, 하위 경로 `@genoffice/ui/ai-subscription-login-window`). 편집기 뒷단이 창을 열 때 부르므로 React와 화면 코드를 가져오지 않는다. 창 제목, 번호 붙은 단계(Claude 넷, Codex 둘), 끝나지 않았을 때의 글을 만든다. 그 회사 프로그램의 창이므로 제품 이름을 넣지 않는다(다른 구독 문구와 같은 시험이 지킨다). 아랍어·히브리어·힌디어·태국어는 콘솔이 그리지 못해 창에만 영어를 쓴다.
- AI와 무관한 공용 부품: `Dropdown`, 색 선택기, 찾기 패널, 리본 접기, 이미지 대화 상자·뷰어, `Markdown`, 아이콘, 글꼴 목록, WordArt 프리셋.
- 디자인 템플릿 글꼴: 폴더 `template-fonts/`(글꼴 파일, 패밀리마다의 라이선스 글, `README.md`)와 그 목록 `src/template-fonts.ts`(`@genoffice/ui/template-fonts`). 폴더는 `src/` 밖에 있어 어느 편집기 빌드에도 복사되지 않는다.

## 맡지 않는 것 (경계)

- 연결 상태를 알아내거나 로그인·설치를 실행하는 일은 이 모듈의 범위가 아니다. 그것은 `packages/ai-provider`(메인 프로세스)가 하고, 여기 컴포넌트는 상태를 props로 받고 버튼은 콜백(`AiSubscriptionCardActions`)만 부른다. IPC를 직접 부르지 않는다.
- 이 패키지는 `@genoffice/ai-provider/browser`만 import한다. Node에 묶인 루트·`/subscription` 진입점을 import하면 렌더러 번들이 깨진다.
- 에디터 고유의 화면(리본, 문서 캔버스, 에디터별 문자열)과 앱별 강조색(`--accent` 계열)은 각 `apps/*/src/renderer`의 범위다.
- 문서 내용의 색은 범위가 아니다. `src/wordart-presets.ts`의 색처럼 문서에 저장되는 값은 문서 데이터이고 토큰을 참조하지 않는다.
- 설정 화면(`apps/shell/src/renderer/src/SettingsAiSection.tsx`)과 홈의 질문 패널은 shell의 범위다. 질문 패널의 `askSendGate`는 이 패키지의 `aiSendGate`를 그대로 읽는다. 따로 판단하지 않는다.
- 계정 바꾸기·로그아웃을 실행하기 전의 확인과 그 문장은 shell의 범위다. 이 패키지의 카드는 버튼을 보여 주고 콜백만 부른다.

## 항상 지켜야 하는 것

- 크롬 색은 토큰으로만 쓴다. 이 폴더의 CSS에 `#hex`·`rgb()`를 직접 쓰지 않고 `var(--surface)` 등을 참조한다. `npm run check:theme-colors`는 `apps/*/src/renderer`의 CSS만 검사하므로 이 패키지의 CSS는 검사에 걸리지 않는다. 그래서 직접 지켜야 한다.
- 토큰을 추가하면 `tokens.css`의 세 블록(`:root`, `[data-theme='dark']`, `prefers-color-scheme: dark` 미디어 쿼리 안의 시스템 모드)에 모두 넣는다. 한 곳이라도 빠지면 그 테마에서 값이 비어 버린다. 경고 전용 토큰은 없다. 비용 표시와 경고는 `--danger` 계열을 쓴다.
- 보내기 규칙은 `aiSendGate` 하나다. 상태 확인이 아직 답하지 않았으면 요청을 붙잡았다가 실행 가능해지는 즉시 시작한다. 실행할 수 있는 것이 없으면 아무것도 보내지 않고, 작성기의 글은 남기고, 연결 안내를 보여 준다. 이때는 나중에 저절로 시작하지 않는다(로그인은 몇 분 걸릴 수 있고 실행은 다시 요청받아야 한다). 구독을 처음 쓰려는 순간이면 첫 연결 안내이 먼저이고 확인을 눌러야 시작한다.
- 에디터는 자기만의 보내기 판단을 만들지 않는다. `tests/editors-consistency.test.ts`가 모든 에디터의 소스를 읽어 `useAiSendGate`를 쓰는지, 자체 gate 함수를 내보내지 않는지 확인한다.
- **화면이 나뉜 동안 AI 창은 하나만 보인다.** 초점이 있는 칸의 AI 창이 보이고 다른 칸의 것은 레일로 접히며, 접힌 동안에도 그 칸의 대화와 진행 중이던 AI 작업은 살아 있어야 한다(결정 0037). 대화는 문서별로 저장된다.
- 저절로 다른 제공자로 바꾸지 않는다. 막힌 실행 뒤의 "다른 연결로 계속"은 사용자가 버튼을 눌렀을 때만이고, 후보(`aiContinueOption`)는 `ready`인 다른 구독, 없으면 이미 동의한 종량제 로그인이다. 막힌 제공자 자신과 키 제공자는 후보가 아니다. 누르면 그 제공자가 저장된 선택이 되어 모델 선택기에 보인다(`withAiContinueProvider`).
- 로그인된 계정은 설정 화면의 카드에만 보인다. `AiSubscriptionCard`는 `showAccount`를 받았을 때만 계정을 그리고, `onSwitchAccount`·`onLogout`을 둘 다 받았을 때만 두 버튼을 낸다. `compact` 카드는 무엇을 받든 둘 다 내지 않는다. `AiConnectPrompt`와 에디터 패널에는 이 props를 넘기지 않는다. 두 버튼은 강조 버튼(`primary`)이 되지 않는다.
- 구독 그룹의 모델 목록은 프로그램이 알려 준 것이 있으면 그것을 쓴다(`status.models`). 항목마다 표시 이름과 실제 모델 식별자를 함께 보이고(`AiProviderPickerGroup.details`), 기본 항목에는 그것이 가리키는 모델을 적는다. 목록이 없으면 `AI_PROVIDERS`의 고정 목록을 예전처럼 보인다. 고르면 저장되는 값은 프로그램이 받는 `id`이고 표시 이름이 아니다. 저장된 값이 목록에 없어도 그 값은 목록에 남는다. 모델 선택기를 열 때는 `onRefreshSubscriptions`로 구독 상태를 다시 확인해, 앱을 다시 시작하지 않아도 새 모델이 나타나게 한다(`AI_MODEL_PICKER_REFRESH_MS`로 2분에 한 번).
- 선택 표시(칩)와 설정의 "사용할 AI"는 `aiSubscriptionModelName`으로 모델 이름을 얻는다. 자동일 때도 실제로 답할 모델을 보인다. 목록이 없으면 이름을 붙이지 않고 예전 글을 그대로 쓴다.
- 모델 선택기에 올리는 항목은 고르는 즉시 실행 가능한 것만이다. `auto`는 구독으로 풀릴 때만 나오고, 종량제 로그인은 동의한 것만 비용 표시와 함께 나온다. 목록에 없는 상태로 되돌리는 일은 설정 화면에서 한다.
- 패널이 설정을 쓸 때는 `changeStoredAiSettings`를 거친다. 패널이 쥐고 있는 사본이 아니라 지금 저장된 값에 변경을 적용한다. 다른 창이나 설정 화면이 그사이 쓴 값을 덮어쓰지 않기 위해서다.
- 구독 제공자는 글자 이름으로만 표시한다(`Claude`, `Codex`). 벤더 로고를 넣지 않으며 `src/provider-logos.tsx`의 `'claude-code': null`은 의도된 값이다. AI 표시는 `AiMark`를 쓴다.
- 구독 연결에 관한 문장은 이 패키지의 문자열만 쓴다. 에디터 사전에 같은 문장을 복제하지 않는다. AI 진입 버튼과 패널 제목의 이름도 공용 키 `aiAssistant` 하나다.
- 문자열 키는 21개 언어 조각 모두에 있어야 한다. `zh.ts`가 키 집합을 정의하고 나머지는 타입으로 같은 키를 강제받는다. 다른 언어에 영어 문장을 복사해 넣지 않는다(비라틴 문자 언어에서 영어와 같은 값은 테스트가 잡는다).
- `template-fonts/`의 글꼴 파일을 Vite 자산으로 가져오지 않는다(import, `new URL(…, import.meta.url)`, CSS `url()`). 그러면 편집기 빌드마다 사본이 들어간다. 설치 파일에는 `apps/shell/electron-builder.cjs`의 extraResources 항목 하나로 한 번만 들어가고(`resources/template-fonts`), 편집기는 `templateFontsDir`(`@genoffice/electron-utils/template-fonts-dir`)로 그 폴더를 읽는다. shell의 `tests/template-fonts-resource.test.ts`가 둘 다 지킨다.
- 템플릿 글꼴 파일은 배포처의 것 그대로 둔다. 잘라 내거나 이름을 바꾸지 않는다. 라이선스 글도 배포처의 바이트 그대로다(`.gitattributes`의 `-text`). 글꼴 파일 합계는 `TEMPLATE_FONTS_MAX_BYTES`(45 MiB) 이하여야 하고 `tests/template-fonts.test.ts`가 지킨다. 상한은 사용자가 받아들인 설치 파일 증가(수십 MB) 안에 머물기 위한 값이고, 글꼴은 편집기마다가 아니라 한 벌만 실리기 때문에 이 안에 들어간다. 올리려면 그 범위를 넘지 않는지 먼저 따진다. 글꼴을 더하거나 바꾸면 `src/template-fonts.ts`, 폴더의 `README.md`, 저장소 루트의 `NOTICE`를 함께 고친다.
- 상태 확인의 오류 문장(`status.error`)을 그대로 화면에 찍지 않는다. `subscriptionStatusErrorKind`로 종류를 읽어 번역된 문장을 쓴다. 로그인·설치 실패의 원문도 마찬가지다(실행 파일 경로가 들어 있을 수 있다).

## 이 모듈의 방식

- **발표 모드의 키는 한 곳에서 판정한다.** `src/presentation-keys.ts`의 `presentationKeyOf`가 F5(처음부터), Ctrl/Cmd+F5(지금 위치), Esc/F5(끝)를 가른다. F11은 Electron의 전체화면 역할이므로 여기서 다루지 않는다. 에디터는 이 결과를 자기 화면(워드는 읽기 모드, PDF는 뷰어, 마인드맵은 지도)에 맞게 쓴다.
- 규칙은 순수 함수, 컴포넌트는 배치다. 연결 상태 여섯 가지에 카드가 무엇을 보이는지는 `aiSubscriptionCardView`, 연결 안내의 구성은 `aiConnectPromptView`, 어떤 오류가 "막힌 실행" 알림을 받는지는 `AI_BLOCKED_RUN_KINDS`·`isAiBlockedRunKind`가 정한다. 동작을 바꿀 때는 이 함수와 그 테스트를 먼저 바꾼다.
- 패널 배선은 `useAiSendGate` 하나로 한다. 보내기 경로는 `admit(request)`를 묻고(거짓이면 보내지 않고 작성기 글을 남긴다), 대기열은 `admitQueued`를, 첫 연결 안내의 확인 버튼은 `acknowledgeNotice`를, 막힌 실행의 버튼은 `continueWith(provider, rerun)`을 부른다. 붙잡힌 요청은 `start`로 되돌아오고 패널의 보내기 경로를 다시 지나며 `admit`을 한 번 더 묻는다.
- 붙잡힌 요청의 운명은 `aiHeldRequestStep`이 정한다. 상태 확인 때문에 붙잡힌 요청은 답이 "연결 안 됨"이면 버려진다. 알림 때문에 붙잡힌 요청은 확인 버튼만이 시작시키고, 다른 이유로 알림이 사라지면(제공자 변경, 연결 끊김) 버려진다.
- `AiModelPicker`는 `subscriptionStatuses`를 받는다. 넘기지 않으면 어떤 구독도 연결된 것으로 치지 않는다. 선택 변경은 `withAiProviderSelection`으로 쓴다. `showLabel`을 주면 칩 앞에 "모델" 라벨을 보인다(문서 작업 확인 창처럼 작성기 바깥에 놓일 때). 팝오버는 `aiModelPopoverStyle`이 칩 위·아래의 남은 공간을 보고 연다.
- 아무것도 연결되지 않은 "AI 연결" 안내(`aiConnectPromptView`의 `free`)는 카드 두 개 대신 `AiConnectGuide`를 그린다. 도우미는 어느 AI가 있는지 묻고(`aiConnectGuideView`), 고른 구독 길에 단계(`aiConnectStepsView`)와 그 카드 하나를 보인다. 무료 길의 버튼은 호스트가 준 `onOpenSettings`를 부른다(설정 → AI가 열린다). 첫 실행 안내처럼 무료 카드를 그 자리에 그릴 호스트는 `freeContent`와 `freeConnected`를 준다. 이 패키지는 무료 연결을 직접 실행하지 않는다. 고른 길은 컴포넌트 상태일 뿐 저장하지 않는다.
- 카드의 업데이트 버튼과 로그인 취소 링크는 호스트가 `onUpdate`·`onCancelLogin`을 줬을 때만 나온다. 업데이트는 터미널 창을 여는 일이라 `terminalWindows`(Windows)일 때만이다. 브라우저 로그인이 `AI_SIGNING_IN_STALLED_MS`를 넘으면 카드가 스스로 로그인 창 링크를 버튼으로 올린다. 링크로 그릴 동작은 `aiSubscriptionCardView`의 `links`가 정한다.
- 도우미 아래쪽의 "연결하는 방법 화면으로 보기"는 호스트가 `onOpenConnectHelp`를 줬을 때만, 연결된 것이 없을 때만 나온다. 누르면 펼친 길(`claude-code`·`codex`·`free`, 묻는 중이면 `null`)만 호스트에 넘긴다. 주소는 `subscriptionConnectHelpUrl`(`@genoffice/ai-provider/browser`)이 소개 사이트의 `/connect`와 절 이름(`#claude`·`#codex`·`#free`)으로 만든다. 사이트가 한국어뿐이라 다른 언어의 문구에는 "한국어 페이지"를 적는다. 껍데기 앱 안의 편집기는 `home:open-connect-help` 창구로 뒷단이 열고, 워드·엑셀·파워포인트는 설치 안내와 같은 길로 연다.
- "도움 요청용 정보 복사"(`aiConnectInfoText`)에는 상태의 종류·오류 종류·버전 모양의 값·로그인 중인지·종량 허용 여부와 `navigator`의 플랫폼·사용자 에이전트만 들어간다. 계정, 경로, 오류 원문은 넣지 않는다. 새 값을 넣을 때도 이 원칙을 지킨다.
- `free-limit`(무료 연결의 오늘 사용량 소진)은 막힌 실행 종류(`AI_BLOCKED_RUN_KINDS`)다. 문장은 `errFreeLimit`·`errFreeLimitReset`이다.
- 오류 문장: `aiRunErrorText(lang, cause)`는 구독 계약의 종류에만 문장을 주고 `timeout`·`credits`·`network`·`overloaded`에는 `undefined`를 돌려준다. 그래서 전송의 `errorText` 옵션에 그대로 꽂으면 에디터의 기존 문장이 살아 있다. `unsafe-tools`에 제공자가 없으면 Claude로 읽는다.
- 문자열은 `createI18n`을 거치므로 사전 안의 `GenOffice`는 출력에서 제품명으로 바뀐다. 사전은 원본의 표기를 유지한다.
- CSS는 컴포넌트가 스스로 import한다(`ai-subscription.css`, `ai-usage.css`). 새 클래스는 `ai-sub-` 접두사를 쓴다. 에디터가 따로 import해야 하는 CSS는 `package.json`의 `exports`에 올린 것뿐이다.
- 브랜드 로고는 두 테마에서 공식 색을 유지한다(크롬이 아니라 브랜드 자산). 단색 로고는 `currentColor`를 써서 어두운 테마에서 읽히게 한다.

## 테스트

- 실행: `npm run test -w @genoffice/ui`(또는 이 폴더에서 `npx vitest run`), `npm run typecheck -w @genoffice/ui`. Windows에서 전부 통과한다.
- 기본 환경은 `node`다. DOM이 필요한 테스트는 파일 첫 줄에 `/** @vitest-environment jsdom */`를 달고 `react-dom/client`의 `createRoot`와 `act`로 렌더링한다.
- `tests/editors-consistency.test.ts`는 저장소의 `apps/*` 소스를 읽는다. 에디터의 패널·리본 파일을 옮기거나 이름을 바꾸면 이 테스트의 `EDITORS` 표도 함께 고친다. 이 패키지만 떼어 놓고는 돌릴 수 없다.
- 바꾸면 반드시 테스트하는 것: `aiSendGate`의 네 결과(`run`, `checking`, `notice`, `connect`)와 붙잡힌 요청의 전이, 설정이나 상태가 아직 없을 때(`null`), `auto`에서 한쪽만 확인이 끝났을 때, 모델 선택기 목록이 `selectAiProvider`를 통과하는 항목만 담는지, 프로그램의 모델 목록이 있을 때와 없을 때의 항목과 칩 글, 계정과 계정 버튼이 요청받은 카드에만 나오는지, 새 문자열 키가 21개 언어에 있고 `{name}` 자리 표시가 언어마다 같은지.
- 토큰 변경은 자동 검사가 없다. 밝은 테마, 어두운 테마, 시스템 모드 세 경우를 실제 화면으로 확인한다.
