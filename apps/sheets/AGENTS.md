# apps/sheets (`@genoffice/sheets`)

Excel 통합 문서(.xlsx, .csv 등) 에디터다. 화면은 Univer 격자 위에 Excel식 리본을 얹은 것이고, 파일의 읽기·쓰기는 별도 프로세스로 도는 Rust 사이드카가 한다.

## 맡은 범위

- 렌더러(`src/renderer/`): Univer 구성(`create-univer.ts`), Excel식 동작을 맞추는 수많은 보정 모듈, 리본과 대화 상자, 편집 기록(`edit-journal.ts`).
- 메인 프로세스(`src/main/sheets-main.ts`): 탭 세션, 열기·저장·복구, PDF·CSV 내보내기, 인쇄, 사이드카 클라이언트(`xlsx-sidecar-client.ts`), 큰 저장의 조각 전송(`save-edits-transfer.ts`).
- xlsx 엔진 `native/xlsx-engine`(Rust). 사이드카 실행 파일로 빌드되어 요청·응답 프로토콜로 통합 문서를 스트리밍한다.
- IPC 계약 `src/shared/ipc-channels.ts`(`IPC_CHANNELS`)와 `src/shared/desktop-api.ts`.
- 시트의 AI: 패널 `src/renderer/ai/AiChatPanel.tsx`, skill과 도구(`workbook-skill.ts`, `tools.ts`, `image-skill.ts`, `search-skill.ts`), 막힌 실행 판정(`subscription-state.ts`), 모델에게 보낼 열을 거르는 정책(`src/ai/privacy-policy.ts`).
- 단독 실행용 AI 핸들러 `registerSheetsAiIpc`(`ai:read-url` 포함)와 그 규칙(`src/main/ai-run.ts`).

## 맡지 않는 것 (경계)

- 배포되는 앱에서 공용 `ai:*` 채널(`ai:stream`, `ai:chat`, `ai:get-settings` 등)은 이 모듈이 응답하지 않는다. shell은 시트 뷰를 `createSheetsView({ includeAiHandlers: false })`로 만들고, 그 채널들은 `apps/docs/src/main/docs-main.ts`의 `registerAiIpc`가 담당한다. `registerSheetsAiIpc`는 단독 실행에서만 돈다.
- 제공자 선택과 구독 프로그램 실행은 `packages/ai-provider`, 검색·이미지 도구의 경로 결정은 `packages/ai-search`, 보내기 규칙과 연결 카드·알림은 `packages/ui`의 범위다.
- 셀 주소·서식 색·차트 표현 같은 통합 문서 도메인 타입은 `packages/xlsx-gateway`의 범위다.
- 새 docx·pdf·md 파일을 만드는 AI 도구(`create_document`)의 실제 생성은 문서 에디터의 `createAiDocument`가 한다. shell이 `configureSheetsRuntime`으로 주입한다.
- 탭, 창, 구독 프로그램의 잔여 프로세스 정리는 `apps/shell`의 범위다.

## 항상 지켜야 하는 것

- 모든 IPC 핸들러는 보낸 쪽을 확인한다. `sessionFor(event)`가 등록된 시트 탭이 아니면 예외를 던지고, 입력은 zod 스키마(`aiStreamRequestSchema` 등)로 파싱한 뒤에 쓴다. 새 핸들러도 이 두 가지를 먼저 한다.
- 원본 파일이 기준이다. 저장은 편집 기록을 사이드카에 넘겨 좁게 패치하는 방식이고, 에디터가 건드리지 않은 것은 그대로 남아야 한다. 열기·저장 경로를 바꾸면 왕복 테스트로 증명한다. 문서 엔진의 동작(해석, 저장, 내보내기)을 AI나 UI 작업의 일부로 바꾸지 않는다.
- 저장 결과는 사용자 파일보다 먼저 다음 세션의 스냅숏 자리(`reserveSnapshotPath`)에 쓰고, 사이드카가 그것을 연 뒤에야 대상에 옮긴다(`placeStagedSave`, 암호 문서는 다시 잠가 쓴다). 열지 못하면 대상은 그대로 두고 이전 세션도 살려 둔 채 `errSaveUnreadable`로 알린다. 대상에 먼저 쓰고 나중에 다시 열던 때는, 다시 열기가 실패하면 원본이 이미 바뀌었고 세션도 사라져 그 뒤 모든 저장이 `Unknown workbook session.`으로 끝났다(2026-10-21 신고). 저장 경로를 고칠 때 이 순서를 지킨다(`tests/save-verify-before-overwrite.test.ts`).
- 문서 내용은 테마가 다시 칠하지 않는다. 어두운 시트는 Univer의 `darkMode`를 쓰는 화면 전용 변환이고, 셀 채우기·글자색·차트 색상표는 문서 데이터다. 저장·내보내기·인쇄 결과는 두 테마에서 같아야 한다. 리본 등 크롬 색은 토큰만 쓴다.
- 요청은 다른 제공자로 넘어가지 않는다. 단독 실행의 `ai:stream`·`ai:chat`은 `resolveAiRunTarget`으로 대상을 정하고, 실행할 수 없으면 제공자를 부르지 않고 원인을 담아 거절한다. 이 규칙은 문서 에디터의 `ai-run.ts`와 같은 답을 내야 한다. 한쪽만 바꾸면 단독 실행과 배포 앱의 동작이 갈린다.
- 종량 허용을 쓸 때는 정규화된 설정 전체를 쓴다(`withMeteredAccepted`). `providers` 표가 없는 설정 파일은 제공자 도입 이전 파일로 읽혀 기본값이 되고, 그러면 방금 쓴 동의가 사라진다.
- 구독 IPC는 `ensureSubscriptionIpc`로만 등록하고 `initSubscriptionChildTracking`은 부르지 않는다. 단독 실행 진입은 `will-quit`와 `process.on('exit')`에서 `shutdownSubscriptionChildren`을 부른다.
- shell 안에서도 필요한 시트 전용 AI 채널은 `registerSheetsAiIpc`가 아니라 `registerSheetsIpc`에 등록하고 `sheets:` 접두사를 붙인다(`sheets:ai-generate-image`, `sheets:ai-tool-capabilities`, 첨부 관련 `sheets:files-*`). `registerSheetsAiIpc`에 두면 배포 앱에서 "핸들러 없음"이 된다.
- 이미지 도구에는 `{ path: 'screen', statuses: sharedSubscriptionStatuses() }`를 넘기고, 읽을 수 있는 로컬 경로는 그 탭이 연 통합 문서들의 폴더와 붙여 넣기 임시 폴더로 제한한다(`sheetsMediaRoots`).
- 열기 암호가 걸린 통합 문서(결정 0041)는 평문이 사용자 폴더와 데이터 폴더에 닿지 않게 한다. `prepareEncryptedWorkbook`이 암호를 받아 푼 사본을 임시 폴더(`importTempDir`)에 두고, 세션은 그 사본에서 돈다(`.xlsx`·`.xlsm`은 `restoreTarget`이 사용자 파일, `.xls`는 첫 저장이 다른 이름으로 저장). 저장은 사이드카 결과를 그 임시 폴더에 받은 뒤 `encryptOoxml`로 잠가 대상에 원자적으로 쓰고, 다음 세션도 그 평문 사본에서 연다. 암호 세션은 `automaticRecoveryDisabled`라 복구 사본을 쓰지 않고, 그 탭에서 처음 열릴 때 한 번 되살릴 수 없다는 알림(`unprotectableNoticeText`, `workbook:recovery-notice`)을 띄운다. 사이드카 결과를 대상 경로에 바로 쓰는 새 저장 길을 만들 때 `session.password`를 확인한다.
- 복구 사본은 공용 저장소(`createRecoveryStore`, 폴더 `sheets-autosave`, 경로 sha1 앞 16글자 + `.xlsx`)로만 쓰고 지운다. 어느 사본을 쓰는지는 `sessionRecoveryIdentity`가 정한다(새 통합 문서는 임시 폴더 파일로 열려도 제목 없는 문서의 사본, 암호 세션은 사본 없음). CSV와 변환해 연 `.xls`·`.tsv` 세션은 원본이 통합 문서를 담을 수 없으므로 제목 없는 `.xlsx` 사본을 두고, 제목은 원래 파일 이름, 곁 정보의 `originalPath`는 원래 경로다(`convertedSessionRecovery`). 되살린 탭의 첫 저장은 `saveAsDefaultFor`(원래 폴더, 원래 이름에 `.xlsx`)를 보여 준다. 병합할 때 고른 파일은 사본이 없다. 지우는 때는 저장(`saved`), 닫기 확인의 "저장 안 함"과 MCP·AI의 저장하지 않고 닫기(`dontSave`, 껍데기 앱이 `discardSheetsRecovery`를 부른다), 깨끗하게 닫힌 탭이 쓴 사본(`closedClean`)뿐이고, 앱이 끝나는 중에는 저장소가 거절한다. "저장 안 함" 뒤에 창 닫기나 끝내기가 취소되면(`resetSheetsShuttingDown`) 그 탭은 다시 사본을 쓴다. 사본은 `writeCopyStreamed`로 파일째 넘겨 통합 문서를 메모리에 읽어 들이지 않는다. 렌더러가 세션을 닫는 `closeWorkbook`은 사본을 지우지 않는다(앱 종료 중에도 불린다). 파일을 열 때 사본이 있으면 내용을 읽기 전에 `resolveRecoveryOnOpen`으로 묻고, 되살리기는 사본 바이트를 임시 파일로 옮겨 `restoreTarget`을 원본으로 둔 세션으로 연다. 사본을 준비하지 못하면 원본을 열고 사본은 "나중에"로 남기며, 다른 탭이 이미 그 파일의 사본을 쓰고 있으면(나란히 보기의 두 번째 창) 묻지 않고 원본을 연다. 두 경우 모두 그 탭은 그 사본을 쓰지도 지우지도 않는다(`held`). 이전 버전의 `unsaved-new.json`은 `migrateSheetsLegacyRecovery`가 제목 없는 "나중에" 사본으로 옮기고, 읽을 수 없는 목록은 지우지 않고 둔다.
- 모델에게 보내는 열은 `applyPrivacyPolicy`를 거친다. `deny`는 보내지 않고 `statistics-only`는 값 없이 개수만 보낸다. 값을 직접 읽어 프롬프트에 넣는 우회 경로를 만들지 않는다.

## 이 모듈의 방식

- **발표 모드는 격자만 남긴다.** Ctrl+F5는 전체화면으로 열고 A1부터 보여 주며, Shift+F5는 지금 셀을 유지한 채 연다. Esc·F5로 끝난다. 엑셀의 plain F5는 기존 Go To이므로 가져오지 않는다. `.app-shell.sheet-presenting`이 이 앱의 리본(`.excel-header`), AI 창(`.copilot`), 상태 표시줄을 숨긴다. Univer의 이름 상자·수식 입력줄·시트 탭은 격자의 일부라 그대로 둔다. 키 판정은 `@genoffice/ui`의 `presentationKeyOf` 하나다.
- 메인 코드는 shell 번들에 들어간다(`../../../sheets/src/main/sheets-main`을 상대 경로로 import한다). `src/main`을 고친 뒤에는 shell을 다시 빌드한다.
- 사이드카 위치는 주입받는다. 배포 앱은 `resources/native/`, 개발 실행은 `native/xlsx-engine/target/release/`의 실행 파일을 쓰고 `XLSX_SIDECAR_PATH`로 바꿀 수 있다. 사이드카가 죽으면 `workbook:sidecar-crashed`로 알리고 같은 경로를 정상 열기 경로로 다시 연다.
- 큰 저장은 조각으로 나눠 보낸다. 편집이 `SAVE_EDITS_INLINE_MAX`(1만 건)를 넘으면 JSON 문자열 조각으로 올린 뒤 저장 요청에 전송 id만 싣는다. 살아 있는 객체 그래프를 context bridge로 넘기면 속성 하나씩 건너가 매우 느리기 때문이다. 상한 상수는 zod 스키마와 preload의 수동 검증이 함께 쓴다(preload는 zod를 쓰지 않는다).
- 첨부 칸의 "이음오피스 문서에서 첨부"(`DocAttachButton`, 결정 0035)는 "Google 드라이브에서 첨부"(`DriveAttachButton`)와 같은 `onDrivePicked`(`DriveAttachPicked`)로 들어온다. `AiChatPanel.tsx`는 `onDrivePicked`가 있을 때만 두 버튼을 그리고, 고른 경로는 드라이브 첨부와 같은 길로 첨부 칸에 든다. 버튼은 `window.aiOfficeDocs`가 있을 때만 스스로 나온다. 입력란의 `@` 문서 목록(결정 0051)은 `App.tsx`가 만든 `docMention`(`docMentionActions`)을 `ExcelShell` → `AiChatPanel` → `AiComposer`의 `docs`로 내려보낸다. 받는 형식 목록은 `packages/file-parse`의 `attachable.ts` 한 곳을 따르고, 실제로 읽히는지는 `parseFileToText`가 정한다.
- 패널 배선: 보내기 규칙은 `App.tsx`의 `useAiSendGate`가 쥐고, `AiChatPanel.tsx`는 `admitQueued`·`onAcknowledgeNotice` 등을 props로 받는다. 전송은 `aiRunErrorText`로 다른 에디터와 같은 문장을 쓰고, 막힌 실행 여부는 `aiBlockedRunOf`가 정한다(전송이 기록한 마지막 실패와 실행이 끝난 문장이 같을 때만 같은 실패로 본다. 루프가 스스로 재시도한 턴이 섞이기 때문이다).
- `dependencies`에 올린 `@genoffice/*` 패키지는 `electron.vite.config.ts`의 `externalizeDepsPlugin` `exclude`에도 있어야 한다. preload는 샌드박스에서 임의의 npm 패키지를 require할 수 없으므로 `@genoffice/ai-provider`(구독 채널 이름)와 `@genoffice/electron-utils`를 번들에 넣는다.
- 디자인 템플릿 글꼴은 쓸 때만 불러온다. 시작할 때는 면마다 `genoffice-docx-media://template-fonts/<file>` 주소의 `FontFace`를 바이트를 읽지 않고 등록만 한다. shell 안에서는 워드 편집기의 메인이 이 주소에 답하고(`apps/docs/src/main/lazy-media.ts`, 응답은 `@genoffice/electron-utils/template-font-response`, 면 목록과 주소는 `@genoffice/ui/template-fonts`), 시트를 단독으로 띄우면 시트 메인이 직접 답한다(`src/main/template-fonts.ts`, 목록에 있는 파일 이름만). 통합 문서를 열면 그 문서가 쓰는 템플릿 패밀리를 먼저 불러(최대 3초) 첫 레이아웃이 실제 글꼴로 재게 하고, 면 하나가 다 불러지면 글자 측정 캐시를 버리고 시트를 다시 그린다. PDF 내보내기와 인쇄의 숨은 창은 페이지가 선언한 글꼴만 보므로 같은 파일을 `file://` `@font-face`로 적는다. 저장되는 .xlsx는 바뀌지 않는다.
- 문자열은 `src/renderer/i18n/`의 언어별 조각(`ai/`, `app/`, `dialogs/`)이고 `zh.ts`가 키 집합을 정한다. 21개 언어 모두에 넣는다. 구독 연결 문장은 `@genoffice/ui`의 것을 쓴다.

## 테스트

- `npm run test -w @genoffice/sheets`는 Rust 테스트와 사이드카 빌드를 먼저 돌린다(`cargo` 필요). TypeScript 쪽만 볼 때는 이 폴더에서 `npx vitest run`을 쓴다. Windows에서 `cargo`가 PATH에 없으면 `%USERPROFILE%\.cargo\bin`을 앞에 붙인다.
- 사이드카를 쓰는 테스트(`tests/xlsx-*.test.ts`, `tests/ole-roundtrip.test.ts` 등)는 테스트 파일 기준 `../native/xlsx-engine/target/release/`의 실행 파일을 직접 찾는다. 한 번은 `npm run native:build`가 돌아 있어야 한다.
- 환경은 `node`이고 기본 시간 제한(5초)을 쓴다. 부하가 큰 PC에서는 `tests/table-design.test.ts`, `tests/table-design-create.test.ts`가 시간 초과로 실패할 수 있다. 단독으로 다시 돌려 확인한다.
- Windows에서 `tests/promote-file-atomically.test.ts`의 두 건은 변경과 무관하게 실패한다(단독으로 돌려도 같다).
- AI 배선에서 바꾸면 반드시 테스트하는 것(`tests/ai-run.test.ts`, `tests/ai-subscription-state.test.ts`, `tests/ai-chat-panel-subscription.test.ts`): 연결 없는 요청의 거절과 원인 필드, 종량 허용 뒤 다시 읽은 설정, 재시도된 턴 뒤의 막힌 실행 판정. `claude-code`·`codex`로 가는 테스트는 브리지를 mock한다.
- 형식 충실도 검증(`npm run compat`, `npm run fixtures`, 벤치마크)은 필요할 때 따로 돌린다.
