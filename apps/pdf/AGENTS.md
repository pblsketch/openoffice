# apps/pdf (`@genoffice/pdf`)

PDF 보기·주석·편집 에디터다. 화면은 PDF.js로 그리고, 저장은 pdf-lib로, 글자 편집과 영구 가림은 PDFium(WASM)으로 한다. AI는 공용 배선 위에 PDF용 skill만 얹은 얇은 구성이다.

## 맡은 범위

- 메인 프로세스(`src/main/pdf-main.ts`와 주변): 저장(`save-pdf.ts`), 글자 편집(`text-edit.ts`, 글꼴 찾기·부분 집합 `font-*.ts`), 영구 가림(`redaction.ts`), 이미지 편집·내보내기, 셸의 PDF 도구 창이 부르는 처리(그림 여러 장으로 PDF 만들기 `images-to-pdf.ts`, 양면 인쇄 맞추기 `print-prep.ts`, 배경 겹치기 `overlay.ts`, 주석 한꺼번에 지우기 `annot-strip.ts`, 사본에 주석을 굽기 `annot-flatten.ts`, 빈 페이지 후보 찾기 `blank-pages.ts`(셸의 구조 작업 프로세스에서 돈다), 용량 줄이기 `compress.ts`(그림 처리는 셸이 넘긴 크로미움 코드), 암호 걸기·풀기 `qpdf.ts`(qpdf WebAssembly, 경로는 `locateFile`로 준다), 파일 복구 `repair.ts`(PDFium으로 다시 쓰고, 못 읽으면 pdf-lib로 온전한 페이지만 옮긴다)), OCR(`ocr.ts`), 전자 서명(`pdf-sign.ts`, `pdf-signatures.ts`, `signature-store.ts`), 빈 PDF 생성(`blank-pdf.ts`).
- 렌더러(`src/renderer/`): 쪽 렌더링과 글자 계층, 축소판, 주석·서식·그리기 덧그림, 메모 여백, 리본. 이미 있는 형광펜·밑줄·취소선은 우클릭 메뉴에서 지우거나 색을 바꾼다(저장된 주석은 같은 자리에 새 표시를 더하고 옛 표시를 지우는 방식).
- IPC 계약 `src/shared/ipc.ts`(`PDF_CHANNELS`)와 편집 연산 설명(`src/shared/op-docs.ts`).
- 페이지 탭의 "PDF 도구" 메뉴(결정 0030): 저장하지 않은 편집을 먼저 저장한 뒤 `pdf:open-in-pdf-tools`로 그 뷰의 파일과 도구 이름(`PDF_TOOLS_HANDOFF`)을 넘긴다. 메인은 그 뷰에 허가된 파일만 받아 셸이 주입한 `openPdfTools`를 부른다. 단독 실행에는 이 주입이 없어 메뉴가 아무것도 열지 못한다고 알린다.
- PDF의 AI: 패널(`src/renderer/ai/AiPanel.tsx`), skill과 도구(`pdf-skill.ts`, `tools.ts`), 막힌 실행 판정(`ai-connection.ts`), 연결 상태 훅(`useSubscriptionConnection.ts`), preload가 내보내는 구독 API의 모양(`src/shared/subscription-api.ts`).
- Markdown·EPUB 변환 화면(`src/renderer/convert/`): 변환 창(`ConvertDialog.tsx`, 페이지 범위·저장 위치·진행·취소, EPUB은 표지와 책 정보), 책 정보 "AI로 채우기"(`BookInfoAiFill.tsx`, `book-info-ai.ts`), "이미지를 폴더로 내보내기"의 "페이지 안의 그림만"(`ExportImagesMenu.tsx`, `embedded-images.ts`).
- AI 페이지 읽기 화면(`src/renderer/ai-read/`): 페이지 고르기와 시작 전 확인(`AiReadDialog.tsx`), 작업·진행·이어하기 제안·이 문서의 보관분 지우기(`AiPageReading.tsx`), 페이지 그림 그리기(`render-page.ts`, 170dpi), 뷰어 검색의 "AI로 읽은 글에서 찾음"(`search-texts.ts`).
- 문서 번역 화면(`src/renderer/translate/`): 언어·범위·형식 고르기와 시작 전 확인(`TranslateDialog.tsx`), 작업·멈춘 뒤의 선택·결과 파일 쓰기(`DocumentTranslation.tsx`), 결과 보고(`TranslateReport.tsx`).
- 문서 작업 공용 부품(`src/renderer/doc-jobs/`): 탭의 작업 세션(`job-session.ts`), 쓸 제공자 정하기와 고정(`route.ts`), `ai:stream`으로 가는 모델 호출 하나(`model-call.ts`), 셸의 보관소 채널을 엔진의 보관소로 감싼 것(`ipc-store.ts`), 진행 줄(`JobProgressStrip.tsx`), 이어하기 제안(`ResumeOffer.tsx`), 작업에 고른 페이지 기억(`job-pages.ts`, 페이지 번호만).
- AI 창에서 작업을 여는 도구 `start_ai_page_reading`, `start_document_translation`(`tools.ts`). 창만 열고 바로 끝난다.
- PDF 읽기 도우미(결정 0043, 계획 `docs/plans/pdf-reading-assist.md`). 본체는 기능마다 자기 폴더에 있고 `App.tsx`에는 연결만 있다.
  - 선택 막대 단축키와 구절 카드(`src/renderer/reading/`): 단축키 판정(`shortcuts.ts`, 순수 함수), 앞뒤 글 뽑기(`passage-text.ts`), 지시문(`passage-prompt.ts`), 카드 보관·같은 구절 찾기(`passage-cards.ts`, `passage-controller.ts`, `usePassageCards.ts`), 카드와 점선(`PassageCard.tsx`, `PassageUnderlines.tsx`, `PassageReading.tsx`), 저장 성공 때 확정하는 장치(`save-confirmations.ts`, 카드와 AI 핵심 표시가 같이 쓴다).
  - 주석 모아 보기(`src/renderer/annot-panel/`): 목록 만들기(`items.ts`, `scan.ts`), 표시 아래의 글(`text-under.ts`), 거르기(`filter.ts`), Markdown 내보내기 글(`export.ts`), 단독 실행 판정(`host-capability.ts`), 패널과 깜빡임(`AnnotPanel.tsx`, `AnnotPanelHost.tsx`, `AnnotFlash.tsx`).
  - AI 창의 추천 질문(`ai/AiPanel.tsx`), 문단까지 가는 인용(`ai/pdf-nav.ts`의 `?q=`, 찾기 `ai/quote-find.ts`, 강조 `ai/QuoteFlash.tsx`), 문서 개요(`ai/insights/`: 나눔 계획 `insights-text.ts`, 지시문과 답 해석 `insights-prompt.ts`, 보관·작업 `insights-controller.ts`, 칸 `InsightsCard.tsx`).
  - 대역 보기(`src/renderer/bilingual/`): 페이지와 블록 잇기(`model.ts`), 나무와 보관된 번역 읽기(`useBilingualData.ts`, `useBilingual.tsx`), 번역 칸(`BilingualColumn.tsx`, `BilingualBar.tsx`), 페이지 번역·고치기·다시 번역(`actions-controller.ts`, `BilingualActions.tsx`, `retranslate.ts`). 폭과 글자 크기 기억은 `view-config.ts`.
  - AI 핵심 표시(`src/renderer/highlight/`): 분류 묶음(`presets.ts`), 시작 창과 시작 전 확인(`HighlightDialog.tsx`), 작업(`highlight-controller.ts`, `ipc-highlight-store.ts`), 글자 층에서 위치 찾기(`locate.ts`), 미리 보기(`HighlightPreview.tsx`), 패널 묶음(`panel.tsx`), 연결(`AiHighlights.tsx`, `useAiHighlights.ts`). 묶기·검사·지시문·`runId`는 `packages/pdf-structure/src/highlight`의 것이다.
  - PDF마다 노트: 화면의 단추(`src/renderer/notes/`), 메인의 노트 연결과 넣을 글 만들기(`src/main/note-link.ts`). 받아들인 AI 형광펜의 `/Subj` 읽기는 `src/main/annot-subjects.ts`.

## 맡지 않는 것 (경계)

- AI 요청의 실행은 이 모듈의 범위가 아니다. `ai:stream`·`ai:get-settings` 등 공용 채널과 구독 IPC 채널은 `apps/docs/src/main/docs-main.ts`의 `registerAiIpc`가 등록한다. 이 모듈은 그중 어느 것도 등록하지 않는다. 그래서 단독 실행(`startPdfStandalone`)에는 AI 핸들러가 없고, 그때 패널의 연결 상태는 계속 `checking`이다. 배포되는 앱에는 항상 핸들러가 있다.
- 제공자 선택은 `packages/ai-provider`, 보내기 규칙과 연결 카드·알림은 `packages/ui`, 에이전트 루프는 `packages/agent-core`의 범위다.
- PDF를 Word·PowerPoint·Excel로 바꾸는 변환은 `packages/pdf2docx`와 shell(`apps/shell/src/main/pdf2docx-local.ts` 등)의 범위다. AI가 새 docx·md를 만드는 흐름은 문서 에디터의 `createAiDocument`가 하고 shell이 `configurePdfRuntime`으로 주입한다.
- 탭, 창, 암호 입력 창, 구독 프로그램의 수명은 `apps/shell`의 범위다.
- 구조 작업과 보관소의 채널(`PDF_CHANNELS`의 `structure*`, `store*`)은 이 모듈이 이름과 모양만 정하고(`src/shared/ipc.ts`), 처리는 셸이 등록한다(`apps/shell/src/main/pdf-structure-ipc.ts`). 구조 작업은 셸이 작업마다 띄우는 별도 프로세스에서 돈다. 단독 실행에는 이 채널이 없어 `not-available`로 답한다. 화면은 preload의 `window.pdfApi.structure`(`pickTarget`, `tree`, `text`, `convert`, `extractImages`, `writeBack`, `cancel`, `onProgress`)와 `window.pdfApi.store`(`docHash`, `aiReadPages`, `translations`, `translation`, `unfinishedJobs`, `write`, `migrate`, `deleteDocument`, 그리고 읽기 도우미의 읽기 `passages`, `highlightRuns`, `highlightBlocks`, `latestHighlight`, `insights`, `deleteCounts`, `pageFingerprints`, `translationRecency`)로 부른다. 읽기 도우미의 쓰기는 따로 채널을 두지 않고 `write`의 `PdfStoreWriteRequest`에 종류를 더했다(`passage`, `deletePassage`, `highlightRun`, `highlightBlocks`, `highlightSuggestionStates`, `deleteHighlightRun`, `insights`, `editedTranslationBlock`, `deleteTranslationExceptEdited`). 답은 `{ ok: true, … }` 또는 `{ ok: false, error, message?, validRange? }`다.
- 보관소가 아닌 읽기 도우미 채널은 넷이고, 이 모듈의 메인(`pdf-main.ts`)이 등록한다. `pdf:annot-subjects`(그 창에 허가된 파일의 주석 `/Subj` 읽기), `pdf:note-open`·`pdf:note-insert`(노트 열기와 노트에 넣기), `pdf:note-unsaved`(그 창의 PDF가 아직 저장되지 않았는지, 경로를 받지 않는다). 노트 탭을 열고 글을 넣는 일은 셸이 `configurePdfRuntime`의 `openNote`·`insertIntoNote`로 주입하고(`apps/shell/src/main/pdf-note-tabs.ts`), 편집기 끝에 넣는 일은 마크다운 편집기가 한다(`apps/markdown/src/main/note-append.ts`). 단독 실행에는 이 주입이 없어 노트 단추가 이유를 보인다.
- 문서 나무, 변환, AI 읽기·번역의 규칙과 작업 엔진은 `packages/pdf-structure`의 범위다. 이 모듈은 그것을 화면에 잇는다.

## 항상 지켜야 하는 것

- 파일 경로는 허가된 것만 다룬다. 뷰마다 읽기가 허용된 경로와 "다른 이름으로 저장" 대상이 따로 기록되고(메인 프로세스의 대화 상자가 고른 것만), 핸들러는 그 밖의 경로를 거절한다. 렌더러가 보낸 경로를 그대로 읽거나 쓰는 핸들러를 추가하지 않는다.
- 쪽 비트맵은 문서 내용이다. 테마가 다시 칠하지 않는다. 야간 읽기는 쪽 비트맵에만 CSS 필터를 거는 화면 전용 표시이고(덧그림은 DOM에서 분리돼 있다) 저장·내보내기·인쇄 결과에는 영향이 없어야 한다. 리본 등 크롬 색은 토큰만 쓴다.
- 영구 가림은 되돌릴 수 없는 내용 제거다. `redactPdf`는 영역과 겹치는 글자·그림을 PDFium으로 실제로 지운 사본을 만든다. 검은 사각형을 위에 그리는 것으로 대체하지 않는다. 입력 영역은 `validateRedactionRegions`를 거친다.
- 문서 안에 쓰이는 값은 바꾸지 않는다. 주석 작성자(`/T`)의 기본값 `GenOffice`(`save-pdf.ts`)는 파일에 저장되는 데이터라 제품 이름으로 치환하지 않는다. 화면에 보이는 문구와 모델에게 주는 system prompt의 제품 이름만 `brandText`를 거친다(`ai/pdf-skill.ts`).
- `save-pdf.ts`의 `addMarkup`에 더한 것은 선택 필드 `MarkupInput.subject` 하나다. 있으면 앞뒤 공백을 떼고 200자까지 잘라 `/Subj`로 쓰고, 비었거나 글이 아니면 쓰지 않는다. 이 필드가 없는 형광펜·밑줄·취소선의 저장 결과는 예전과 바이트 단위로 같아야 한다(`tests/highlight-save-subject.test.ts`). 그 밖의 저장 경로는 고치지 않는다. 연산 설명(`op-docs.ts`)의 `addMarkup`에도 이 필드가 적혀 있다.
- **주석 처리는 "다른 이름으로 저장" 사본에만 고른다.** 사본은 주석을 그대로 두거나(`keep`, 기본), PDFium으로 페이지 내용에 굽거나(`flatten`, `annot-flatten.ts`), 메모·형광펜·그리기·도장만 빼고 링크와 입력란을 남긴다(`strip`, `annot-strip.ts`의 `stripCommentAnnotsBytes`). 그 자리 저장(`targetPath` 없음)에는 `keep`만 허용하고, `copyOnly`는 대상이 원본과 다를 때만 받는다. 원본 파일은 언제나 그대로다. 편집이 없는 사본은 `copyPdfToPath`로 바이트 그대로 복사한다.
- **인쇄는 주석을 기본으로 그린다.** PDF.js의 `annotationMode` 기본값은 `ENABLE`이므로, 인쇄 창의 "주석 포함"을 끌 때만 `DISABLE`(0)을 넘긴다. 이 값을 생략하면 형광펜·메모가 인쇄물에 들어간다(당시 동작). 인쇄는 파일을 먼저 저장하고 그 파일을 다시 읽어 그리므로, 화면의 덧그림이 아니라 파일의 주석이 인쇄된다.
- **PDF 읽기 도우미의 AI 결과는 보관소가 기본이다.** 파일은 사람이 "메모로 남기기"·"받아들이기"를 누르고 PDF를 저장할 때만 바뀐다. 카드의 `savedAsNote`, 제안의 `accepted`는 그 주석을 담은 저장이 성공하고 `store.migrate`가 끝난 뒤 새 해시에만 쓴다(`reading/save-confirmations.ts`). 저장 전에 보관소에 확정 상태를 쓰는 코드를 넣지 않는다. 버리기(`dismissed`)는 파일과 무관해서 곧바로 쓴다. **"모두 받아들이고 저장"도 같은 규칙이다.** 받아들인 markups가 렌더에 반영된 다음 effect에서 저장하고(`acceptSaveRequest`·`saveRef`), 저장이 성공해야만 `accepted`가 기록된다. 같은 클릭에서 `save()`를 부르면 이전 렌더의 `markups`가 저장되어 방금 받아들인 것이 빠진다.
- **선택 막대 단축키는 막대가 보일 때만 받는다.** `KeyboardEvent.code`로 판정하고(한글 입력 상태에서도 같은 키), 조합 중(`isComposing`), 입력란·글 편집 영역의 포커스, Ctrl·Alt·Meta는 무시한다. 고칠 수 없는 문서에서 `H`·`U`·`S`·`N`은 동작하지 않고 단추와 같은 이유를 보인다. 키를 더하거나 바꾸면 막대 단추의 툴팁·접근성 이름과 도움말도 고친다.
- **시작 전 확인의 예외는 대역 보기의 페이지 번역 하나다.** 구독이면 한 번 누름에 보내고, 요금 경로면 탭마다 처음 한 번(제공자가 바뀌면 다시) 단추 자리에서 요금 문구를 거친다. 제공자 고정(`documentJobRoute`·`jobRouteRefusal`)과 바로 멈추기는 그대로다. 이 예외를 다른 작업으로 넓히지 않는다. 페이지 번역은 `translate-page.<언어>` 기록만 쓰고 `translate.<언어>` 기록과 이어하기 제안을 건드리지 않으며, 번역 메타는 없을 때만 만든다.
- 한 번만 보내는 읽기 도우미 호출(구절 카드, 문단 다시 번역, 짧은 문서의 개요)은 `useAiSendGate`를 거친다. 여러 번 보내는 것(AI 핵심 표시, 긴 문서의 개요)은 문서 작업의 시작 전 확인을 거친다. 스크롤·문서 열기·패널 펼치기·보기 켜기로 보내는 길을 만들지 않는다.
- **노트 경로는 렌더러에서 받지 않는다.** `pdf:note-open`·`pdf:note-insert`의 요청에는 글 조각(구절, 페이지, 본문, 제목)만 있다. PDF는 그 창에 열린 자기 문서이고, 노트는 메인의 저장 창이 고른 경로나 `note-links.json`에서 읽은 경로뿐이다. 노트 파일은 없을 때 한 번만 만들고(이미 있으면 그 파일을 잇는다), 노트에 넣기는 셸을 거쳐 열린 마크다운 탭의 편집기에 넣는다. 노트 파일을 직접 고쳐 쓰지 않는다. 넣는 글의 그림 문법(`![…]`)과 `<img>`는 백슬래시로 무력화한다(`note-link.ts`의 `withoutImages`). 바깥 그림을 받아 오지 않게 하는 장치라 지우지 않는다. 저장된 경로가 없는 PDF(셸이 만든 빈 PDF를 아직 한 번도 저장하지 않은 것 포함)는 노트를 막는다. 빈 PDF는 첫 제자리 저장에서 풀린다(`unsavedBlankPdfPaths`). 자동 이름 짓기가 보는 `untitledPdfPaths`와는 따로다.
- `pdf:annot-subjects`는 그 창에 허가된 파일만 읽는다(`pdfPathGranted`). 화면의 PDF.js가 `/Subj`를 읽지 않아서 둔 읽기 전용 채널이다.
- 페이지 위 덧그림(카드 점선, 핵심 표시 미리 보기, 대역 보기의 잇기 테두리, 인용 강조)은 화면 전용이다. 저장·인쇄·내보내기에 나오지 않아야 한다. 받아들인 형광펜의 색은 문서 자료라 토큰을 참조하지 않는다.
- 이 모듈이 갖는 AI 채널은 `PDF_CHANNELS.generateImage` 하나다. 슬라이드의 `ai:generate-image`는 슬라이드 뷰가 있어야 등록되므로 PDF는 자기 채널을 갖는다. 호출할 때 `{ path: 'screen', statuses: sharedSubscriptionStatuses() }`를 넘기고, 읽을 수 있는 로컬 경로는 열린 파일의 폴더와 붙여 넣기 임시 폴더로 제한한다(`documentMediaRoots`).
- 이미지 생성 도구는 추측으로 내놓지 않는다. 메인의 가용성 보고(`AI_TOOL_CAPABILITIES_CHANNEL`)를 `imageGenerationAvailableOf`로 읽고, 핸들러가 없거나 답이 이상하면 "불가"로 본다.
- 구독 API는 preload가 `window.pdfApi.subscription`으로 내보내며 채널 이름과 판독 함수는 `@genoffice/ai-provider/browser`의 것을 쓴다. 이 모듈에 판독 함수의 사본을 만들지 않는다. 모든 호출은 실패를 견딘다(핸들러 없음 = `checking`, 동작 없음).
- 보내기 판단을 따로 만들지 않는다. 패널은 `useAiSendGate`를 쓰고, 막힌 실행은 `aiBlockedRunOf`가 `isAiBlockedRunKind`로 판정한다. 다른 제공자로 저절로 넘어가는 코드를 넣지 않는다.
- **문서 작업(AI 페이지 읽기, 번역, AI 핵심 표시, 긴 문서의 개요)은 사용자가 시작 전 확인에서 "시작"을 눌렀을 때만 보낸다.** 확인은 예상 호출 수, 쓰일 제공자, 이미 해 둔 분량을 보여 주고, 요금 경로면 요금 부과 문구를 붙인다. 번역·AI 페이지 읽기·AI 핵심 표시·긴 문서 개요의 확인 창에는 `AiModelPicker`가 있어 쓰일 모델도 보여 주고 그 자리에서 바꿀 수 있다. 그 선택은 설정의 "사용할 AI"에 저장되므로 다른 편집기의 대화에도 적용된다. 확인을 건너뛰는 길을 만들지 않는다(예외는 아래의 페이지 번역 하나). AI 창의 도구는 창을 열 뿐 작업을 시작하지 않는다(`requestOpen`은 바로 돌아온다). 작업 창과 책 정보 채우기도 패널처럼 `useAiSendGate`를 거친다.
- 쓸 제공자는 확인 전에 `documentJobRoute`로 한 번 정하고 작업 내내 그 제공자에 고정한다. 호출마다 `jobRouteRefusal`이 같은 제공자인지, 아직 쓸 수 있는지, 새로 요금 경로가 되지 않았는지 보고, 아니면 그 호출을 실패시켜 작업을 멈춘다.
- 모델 호출에는 도구를 주지 않는다. 답은 문서 데이터로만 쓰고, 모델이 도구를 요청해도 무시한다.
- 한 문서에 문서 작업 하나. 탭의 세션(두 작업이 공유), 화면 프로세스의 잠금(`documentJobs`), 다른 프로세스가 30초 안에 갱신한 `running` 기록 셋을 모두 본다.
- 작업은 탭에 묶인다. 탭이 사라지면(탭 닫기, 앱 종료) 세션이 모든 작업을 `interrupted`로 멈추고, 셸이 그 탭의 스트림과 구독 프로그램을 끝낸다. 작업을 스스로 시작하거나 이어 가는 코드를 넣지 않는다.
- **이어하기 제안**(`ResumeOffer`)은 문서를 열 때 끝나지 않은 작업 기록이 있으면 한 번 보인다. 제안하는 종류는 `ai-read`, `translate`, `highlight` 셋뿐이고(`RESUMABLE_JOB_KINDS`), 문구는 종류마다 다르다. "이어서 하기"는 그 작업의 시작 전 확인을 열 뿐이다(AI 핵심 표시는 기록의 분류와 페이지를 채운 시작 창). 이어 갈 페이지는 `job-pages.ts`에 기억해 둔 것을 쓴다. 작업 기록은 `(종류, 열쇠)`로 찾는다. 열쇠는 언어(`translate`, `translate-page`, `summary`) 또는 `runId`(`highlight`)다.
- 앱 안에서 저장해 파일 내용이 바뀌면 `store.migrate`로 보관분과 끝나지 않은 작업 기록을 새 해시로 옮긴다. 다른 이름으로 저장한 사본과 영구 가림 사본은 옮기지 않는다(알려진 한계). PDF 넣기·페이지 교체·페이지 크기·자르기처럼 파일을 그 자리에서 다시 쓰는 편집 뒤에는 다시 읽기 전에 같은 옮기기를 부른다(`afterPageOperation`). 지문이 같은 페이지의 것만 따라온다.
- 번역 창의 "대역"은 모든 형식에 쓰인다. Markdown·EPUB은 원문 문단 다음에 번역 문단을 두고, 번역 PDF는 원문 쪽 옆에 번역한 쪽을 둔다(`writeBack`의 `payload.bilingual`, 결정 0057).
- 번역 PDF는 목표 언어가 `ar`, `he`, `hi`이거나 문서에 암호가 걸렸으면 고를 수 없게 하고 이유를 보인다. 저장 위치는 보내기 전에 고른다. 페이지 범위를 줘도 번역 PDF는 모든 페이지를 담고, 고른 페이지만 번역된다.
- AI로 읽은 글은 뷰어 검색에서 위치 있는 글(본문 글자와 OCR)에 검색어가 없는 페이지에만 페이지 단위 결과로 더한다. 글자 선택과 워드·PPT·엑셀 변환에는 쓰지 않는다.
- 첫 연결 안내는 이 모듈에서 `codexKeepsHistory`와 `sendsWholeDocument`를 켠 채로 띄운다(패널, AI 읽기 창, 번역 창, 책 정보 채우기). 페이지 그림과 문서 전체 글이 보내질 수 있다는 문장은 PDF 편집기만 보인다.
- **복구 사본(결정 0061).** 저장하지 않은 편집이 있으면 화면이 약 30초마다, 입력이 약 2초 멈췄고 저장이 돌고 있지 않을 때만 사본을 요청하고(`src/renderer/recovery/copy-scheduler.ts`, 실패하면 열 번 건너뛴다), 뒷단이 저장 경로로 편집을 적용한 바이트를 공용 저장소로 `<userData>/pdf-autosave`에 둔다(`src/main/pdf-recovery.ts`). 원본 파일에는 쓰지 않는다. 사본이 있는 파일을 열면 화면이 아무것도 읽기 전에 묻고, 되살린 뷰는 그 바이트를 메모리에 두고 읽고, 저장은 그 바이트에서 시작하며, 저장 대상은 원래 경로다. 암호가 걸렸거나 암호화된 PDF는 사본이 없고 탭마다 한 번 알린다. 제목 없는 문서(스킬 양식의 사본, 되살린 제목 없는 사본)는 운영체제 임시 폴더(`genoffice-pdf-recovery`)의 작업 파일로 열리고 사본은 제목 없는 칸에 둔다. 이 모듈이 만든 작업 파일은 탭이 닫힐 때와 파일로 저장(`adopted`)한 뒤 지우고, 켤 때 그 폴더에서 하루 지난 것만 치운다. 다른 이름으로 저장은 사본을 남긴다(원래 탭이 여전히 저장 안 됨이므로). 영구 가림 사본과 서명 사본으로 옮겨 갈 때는 옛 사본을 새 파일로 옮기지 않고 지운다(`movedToNewFile`). 옮기면 되살릴 때 가림이 풀린다. "저장 안 함" 뒤에는 창 닫기가 다른 탭을 묻는 동안 새 사본을 쓰지 않고(`superseded`), 뷰가 사라질 때 저장 안 됨이어도 사본을 지운다. 닫기가 취소되면 껍데기 앱의 `pdfCloseCancelled(contents)`나, 그 뷰에 다시 들어온 키·포인터 입력으로 사본 쓰기가 다시 시작된다. 암호화 여부는 화면의 보고와 별개로 뒷단이 원본 바이트의 `/Encrypt`로도 확인한다. 껍데기 앱은 `pdfRecoveryEditor`, `pdfRecoveryIdentity`, `createPdfView`(제목 없는 사본을 열 때. `createPlainEditorView('pdf')`는 경로 없이 열지 못한다)를 쓴다.

## 이 모듈의 방식

- **발표 모드는 뷰어만 남긴다.** F5는 첫 쪽부터, Ctrl+F5는 지금 쪽부터 HTML 전체화면으로 열고 한 쪽 맞춤(`fitModeRef = 'page'`)으로 그린다. F5·Esc로 끝나며, 나가면 발표 전의 맞춤 모드로 돌아간다. `.pdf-presenting`이 리본·상태 표시줄·축소판·AI 창·검색 줄을 숨긴다. 키 판정은 `@genoffice/ui`의 `presentationKeyOf` 하나다.
- 저장된 읽기 위치가 없는 PDF를 처음 열 때의 보기(너비 맞춤·페이지 맞춤)는 보기 탭의 "PDF 열 때"에서 정하고 `view-config.ts`가 브라우저 저장소에 기억한다. 파일마다 저장된 읽기 위치와 보기(`view-state.ts`)가 있으면 그것이 먼저다.
- 메인 코드는 shell 번들에 들어간다(`../../../pdf/src/main/pdf-main`을 상대 경로로 import한다). `src/main`을 고친 뒤에는 shell을 다시 빌드한다.
- AI 편집은 연산 목록으로 한다. 연산의 한 줄 설명은 `src/shared/op-docs.ts`가 유일한 원천이고 테스트가 등록된 연산과 정확히 일치하는지 확인한다. 연산을 추가하면 이 표에 넣는다. 좌표는 PDF 사용자 공간의 포인트(y가 위쪽)이고 쪽 번호는 원본의 0부터 시작하는 번호다.
- 패널은 다른 에디터와 같은 부품으로 조립한다. 연결이 없으면 `AiConnectPrompt`, 구독 첫 사용이면 `AiFirstConnectionNotice`(Codex 진단 기록 문장 `codexKeepsHistory`와 페이지 그림·문서 전체 글 문장 `sendsWholeDocument`를 켠 채로), 문장은 `aiRunErrorText`다. 대기열의 메시지는 `admitQueued`를 지나고, 연결이 없으면 대기열을 멈춘다.
- PDF.js의 CMap·표준 글꼴·wasm은 `electron.vite.config.ts`가 렌더러 출력에 복사한다. 임베드되지 않은 한중일 글꼴의 문서가 이것으로 그려진다. 복사 경로는 POSIX 구분자여야 한다(Windows에서 `join`은 깨진다).
- OCR은 플랫폼 도우미 실행 파일을 쓴다(Windows는 `Windows.Media.Ocr`). 도우미가 없는 빌드에서는 엔진이 없는 것으로 풀리고 뷰어는 OCR 없이 동작한다.
- 문자열은 `src/renderer/i18n/strings.ts`(한 파일에 21개 언어, `zh`가 키 집합)와 `cert-sign-strings.ts`에 있다. 새 기능의 문자열은 언어별 조각으로 나뉘어 있다(`i18n/convert/`, `i18n/ai-read/`, `i18n/translate/`, 읽기 도우미의 `i18n/reading/`, `i18n/annot-panel/`, `i18n/ai-reading/`, `i18n/bilingual/`, `i18n/highlight/`, `i18n/notes/`, 각각 `zh`가 키 집합, 묶는 파일은 `strings-<기능>.ts`). 노트 저장 창의 문구는 메인의 `note-link.ts`에 있다. 구독 연결 문장과 AI 진입 이름은 `@genoffice/ui`의 것을 쓴다.
- 문서 작업 엔진은 화면 프로세스에서 돈다. 페이지 그림은 화면이 자기 PDF.js 사본으로 그리고, 모델 호출은 AI 창과 같은 `ai:stream`으로 간다. 결과 쓰기는 `ipc-store.ts`를 거쳐 셸의 보관소로 간다. 셸은 그 창에 열린 파일에서 자기가 계산한 해시만 받아들인다.
- `src/shared/ipc.ts`의 `structure*`·`store*` 채널 모양을 바꾸면 셸의 처리 코드(`apps/shell/src/main/pdf-structure/`)도 함께 고치고 셸을 다시 빌드한다.

## 테스트

- 실행: `npm run test -w @genoffice/pdf`(또는 이 폴더에서 `npx vitest run`), `npm run typecheck -w @genoffice/pdf`. 환경은 `jsdom`이다.
- AI 배선(`tests/ai-connection.test.ts`, `tests/ai-panel-subscription.test.ts`, `tests/subscription-api.test.ts`, `tests/ai-transport.test.ts`): 막힌 실행 판정, 핸들러가 없을 때의 상태, 가용성 답이 깨졌을 때 이미지 도구가 빠지는지, 첫 연결 안내의 문장. 이 모듈의 테스트는 제공자를 부르지 않는다.
- 새 기능: 변환 창(`convert-dialog`, `convert-ai-fill`, `convert-export-images`, `convert-helpers`), 구조 채널의 preload 모양(`structure-api`), AI 페이지 읽기(`ai-page-reading`, `ai-read-pages-structured`, `ai-read-search-tool`), 번역(`document-translation`). 확인 전에 아무것도 보내지 않는지, 한 문서에 작업 하나, 탭이 사라지면 멈추는지, 이어하기 제안이 아무것도 시작하지 않는지, 한도 소진에서 바로 멈추는지는 이 테스트들이 지킨다. 바꾸면 함께 고친다.
- 읽기 도우미: 단축키(`reading-shortcuts`), 카드와 저장 성공 때 확정(`reading-passage-cards`, `reading-passage-ui`, `reading-note-save`, `reading-save-confirmations`, `reading-ask-routing`), 보관소 채널의 모양(`reading-store-api`, `doc-jobs-reading`), 주석 패널(`annot-panel-*`), 추천 질문·인용·개요(`ai-reading-panel`, `ai-citations`, `ai-insights`), 대역 보기(`bilingual-view`, `bilingual-actions`), AI 핵심 표시(`highlight-*`, `/Subj` 저장의 바이트 비교는 `highlight-save-subject`), 노트(`note-link`, `note-link-handler`, `notes-ui`). 누르기 전에 보내지 않는지, 페이지 번역이 `translate.<언어>` 기록과 번역 메타를 건드리지 않는지, 노트 핸들러가 화면이 보낸 경로를 받지 않는지는 이 테스트들이 지킨다. `highlight-suggestions`는 "모두 받아들이고 저장" 버튼의 개수·비활성·콜백을 본다.
- 사본의 주석 처리(`tests/annotations-save-copy.test.ts`): 기본은 그대로, `strip`은 형광펜만 지우고 링크를 남기는지, `flatten`은 주석이 사라지고 페이지 내용이 되는지, 편집 없는 `copyPdfToPath`가 바이트 그대로인지 본다. 인쇄의 `annotationMode`는 `tests/print.test.ts`가 본다.
- 저장·가림·글자 편집을 바꾸면 결과 PDF를 다시 읽어 확인하는 테스트를 붙인다. 가림은 지운 글자가 추출 결과에 남지 않는지를 본다.
- Windows에서 `tests/generated-output.test.ts`의 "sanitizes characters that are invalid in file names" 한 건은 변경과 무관하게 실패한다(`a:b?.pdf`에서 `basename`이 Windows의 드라이브 표기로 `a:`를 떼어 낸다).
- 실제 렌더링, 서명 검증, OCR은 단위 테스트로 다 확인되지 않는다. 빌드한 앱에서 확인한다.
