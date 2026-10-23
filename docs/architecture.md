# 구조

## 한 프로그램으로 배포되는 여러 조각

설치되는 것은 Electron 프로그램 하나다. 그 안에 껍데기 앱 하나와 편집기들(워드, 엑셀, 파워포인트, PDF, 마크다운, HTML, 마인드맵, 한글, 그림)이 들어 있고, 편집기들은 화면과 무관한 공용 패키지(문서 엔진, AI 연결부)를 가져다 쓴다.

```
apps/shell      껍데기 앱. 창, 탭, 홈 화면, 설정, 첫 실행 안내, 자동 업데이트, 파일 색인과 지식 자료 검색,
                앱 안 MCP 서버, 명령어가 실행 중인 앱에 말을 거는 제어 창구, 만들기 창, AI 없이 바꾸기, 출처 기록,
                AI 창의 "이음오피스 문서에서 첨부"가 쓰는 문서 고르기 창
apps/docs       워드(.docx) 편집기. 뒷단이 공용 AI 창구(`ai:*`)를 등록한다. 설치본에서는 모든 편집기의
                모델 호출·설정·검색 요청을 이 뒷단이 받는다
apps/sheets     엑셀(.xlsx) 편집기        ┐ 모델 호출용 뒷단 코드는 편집기를 혼자 띄울 때만 돈다. 설치본에서는
apps/slides     파워포인트(.pptx) 편집기  ┘ 전용 AI 창구만 등록한다. 엑셀은 이름 앞에 `sheets:`를 붙인다. PPT는 예외로
                이름을 붙이지 않은 `ai:generate-image`·`ai:analyze-media` 등을 직접 등록한다(워드는 같은 일에 `docs:`를 붙인다)
apps/pdf        PDF 편집기
apps/markdown   마크다운·텍스트 편집기
apps/html       HTML 편집기
apps/mindmap    마인드맵(.xmind) 편집기. 지도를 그리는 일은 mind-elixir, 파일은 packages/xmind-engine이 맡는다
apps/excalidraw 그림 편집기. Obsidian의 그림 노트(.excalidraw.md, 앞머리로 알아보는 .md)와 .excalidraw를 연다.
                그리는 일은 Excalidraw 라이브러리, 파일은 packages/excalidraw-engine이 맡는다(결정 0060)
apps/hwp        한글(.hwp·.hwpx) 편집기. 편집 화면은 오픈소스 rhwp의 웹 편집기를 앱 안에 넣어 띄운다. AI는
                그 편집기 안에 넣은 자체 플러그인을 거쳐 글자와 서식을 바꾸고, 문단과 표를 넣고, 표의 칸과 누름틀을 채운다
packages/ai-provider   제공자 목록, 제공자 선택 규칙, 구독 프로그램 실행부, 키 방식 제공자 연결
packages/ai-search     검색·이미지 생성·미디어 분석 도구, 자동 호출 경로의 구독 요청 차례
packages/agent-core    AI 실행 반복(모델 → 도구 → 모델), 화면↔뒷단 전송 통로, 가리기
packages/ui            편집기들이 함께 쓰는 AI 화면 부품과 그 문구(21개 언어)
packages/i18n          화면 언어 목록, 제품 이름 한 곳 정의
packages/cli           터미널 명령어 `ieumoffice`, MCP 도구, 에이전트 스킬 설치
packages/electron-utils 편집기 뒷단 공용 도구(메뉴, 저장소 주소, 원격 이미지 받기 등), 저장하지 않은 파일 확인,
                       생성 요청을 새 탭에 맡겨 두는 곳(`generate-handoff.ts`)
packages/odt-engine    ODT 열기(다리 docx로 바꾸기), 고친 부분만 원본 ODT에 되돌려 쓰기, docx → 새 ODT
packages/pdf-structure PDF의 문서 나무(다시 흐르는 글), Markdown·EPUB 쓰기, 그림 원본 꺼내기, AI 페이지 읽기,
                       번역, 번역 PDF 써 넣기, 문서 작업 엔진, 결과 보관소. pdf2docx의 IR을 읽기만 한다
packages/excalidraw-engine 그림 파일 엔진(Obsidian 노트에서는 글 목록과 Drawing 블록만 다시 쓴다). 화면과 Node 양쪽에서 돈다
packages/xmind-engine  마인드맵 파일 엔진(열기, 원본 보존, 맞추기, 저장, 개요 글, 테마 표). 이 프로젝트가 만든 것이고,
                       화면과 Node 양쪽에서 돈다
packages/docx-engine, pptx-engine, pptx-ops, pptx-render, xlsx-gateway,
         pdf2docx, html2docx, file-parse, zip-gate, font-metrics, pipelines, project-store
                       문서 엔진과 그 주변. 원본(GenOffice)에서 온 그대로 두는 영역. `file-parse`에는 이 프로젝트가
                       `.xmind` 읽기, 다른 파일로 읽을 때의 가리기, 첨부할 수 있는 형식 목록(`attachable.ts`)을 새 파일로 더했다
apps/sheets/native/xlsx-engine   엑셀 계산·입출력을 맡는 별도 프로그램(Rust). 표준 입출력으로 대화한다
```

- 의존 방향은 한쪽이다. `apps/*` → `packages/*`. 패키지끼리는 `ai-provider` → `agent-core`·`i18n`(그래서 `agent-core`는 `ai-provider`를 가져올 수 없다), `ai-search` → `ai-provider`·`electron-utils`, `ui` → `ai-provider`·`agent-core`·`i18n`·`pptx-render`, `odt-engine` → `docx-engine`·`zip-gate`, `cli` → 엔진 패키지·`pdf-structure`·`ai-search`·`ai-provider`·`i18n`, `electron-utils` → `i18n`, `file-parse` → `agent-core`(가리기 이름표)·`xmind-engine`·`docx-engine`, `xmind-engine` → `zip-gate`·`i18n`. `pdf-structure`는 `pdf2docx`·`i18n`·`ai-provider`(그림 입력 판정)·`agent-core`(형)·`font-metrics`의 소스를 상대 경로로 가져오고, `apps/pdf`·`apps/shell`·`cli`도 `pdf-structure`를 상대 경로로 가져온다. `pdf-structure`는 다른 작업 공간 패키지를 이름으로 가져오지 않고 Electron에 기대지 않는다. `i18n`과 `agent-core`는 다른 작업 공간 패키지에 기대지 않는다.
- `ai-provider`는 진입점이 나뉘어 있다. 화면(renderer)과 preload가 **값**으로 가져오는 것은 `@genoffice/ai-provider/browser`뿐이다. 대표 진입점에서는 형(`import type`)만 가져온다. 프로그램을 실행하는 코드(`/subscription`, `/claude-code-cli`, `/codex-app-server`)는 뒷단에서만 가져온다.
- 편집기들의 뒷단 코드는 따로 실행되지 않는다. 껍데기 앱을 빌드할 때 함께 묶여, 껍데기 앱의 한 프로세스 안에서 돈다. 그래서 창구 이름(IPC 채널)은 프로세스 전체에서 하나뿐이어야 한다.
- 편집기 화면은 껍데기 창 위에 얹히는 별도 화면(WebContentsView)이다. 홈 탭만 껍데기 앱 자신의 화면이다.

## ODT 문서가 지나는 길

ODT 전용 화면은 없다. 워드 편집기가 ODT를 "다리 docx"로 바꿔 보여 주고, 저장 때 고친 부분만 원본 ODT에 되돌려 쓴다.

1. 열기: `odtToDocx`가 ODT를 다리 docx와 다리 지도(JSON, docx의 블록이 원본 ODT의 어느 요소였는지)로 바꾼다. 편집기는 그 docx를 보통 docx처럼 연다. 탭의 형식은 `odt`가 되고, ODT에 담을 수 없는 기능은 꺼진다.
2. 저장: 편집기가 평소처럼 docx를 만들면 `saveOdt`가 연 때의 ODT·다리 지도·그 docx를 받아 요소를 짝짓는다. 다리 docx와 같은 요소는 원본 ODF 바이트를 그대로 쓰고, 바뀐 요소만 ODF로 새로 쓴다. 표는 칸 단위로 고친다.
3. 다른 형식으로: docx → ODT는 `docxToOdt`가 새 ODT를 만든다. ODT에 담을 수 없는 차트·수식·도형·글상자는 그림이 된다(화면이 있으면 편집 화면을 찍은 그림, 없으면 문서 안의 대체 그림이나 이름표). ODT → docx는 다리 docx를 쓴다. 어느 쪽이든 바뀌거나 빠지는 것은 화면에서는 확인 창, 명령어에서는 `warnings[]`로 알린다.

같은 엔진을 명령어(`docs read`·`apply`·`convert`), AI 첨부와 파일 색인(`file-parse`의 `odtToText`), 마크다운·HTML 편집기의 "ODT로 내보내기"가 함께 쓴다.

## AI 요청 한 번의 흐름 (화면 경로)

1. 사용자가 편집기의 AI 창에 요청을 적는다. 화면 쪽 문지기(`packages/ui`의 `aiSendGate`)가 설정과 구독 연결 상태를 보고 넷 중 하나로 정한다. 실행, 확인 중이라 보류, 첫 연결 안내 먼저, 연결 안내 표시.
2. 실행이면 화면에서 AI 실행 반복(`agent-core`의 `AgentLoop`)이 시작된다. 반복은 화면 프로세스 안에 있다.
3. 반복의 한 차례마다 화면이 전송 통로(`createIpcTransport`)로 뒷단에 "모델에게 물어 달라"고 보낸다. 실리는 것은 시스템 지시문, 지금까지의 대화, 앱 도구 목록이다.
4. 뒷단은 저장된 설정을 정리하고(`normalizeAiSettings`), 연결 상태와 함께 제공자를 정한다(`selectAiProvider`). 쓸 제공자가 없으면 모델을 부르지 않고 오류 종류(`not-connected` 등)를 돌려준다.
5. 제공자가 정해지면 그 제공자의 연결부로 넘긴다.
   - Claude 구독: 차례마다 Claude Code 프로그램을 하나 새로 띄운다. 빈 임시 폴더에서, 내장 도구를 모두 끈 채로. 표준 입력으로 지시문과 대화를 넣고 표준 출력의 조각을 읽는다. 답이 끝나면 프로그램도 끝난다.
   - Codex 구독: Codex의 `app-server`를 띄워 두고 차례마다 임시 대화를 연다. 쓰지 않은 채 2분이 지나면 스스로 끝낸다.
   - 키 방식 제공자: 그 회사의 주소로 직접 요청한다.
6. 뒷단은 글 조각, 도구 호출 요청, 사용량, "입력을 줄였다"는 알림, 오류(종류·제공자·풀리는 시각)를 화면으로 흘려보낸다.
7. 모델이 도구 호출을 요청하면 **화면 쪽의 앱이** 그 도구를 실행한다(문서 읽기·고치기, 검색 등). 결과를 대화에 붙여 3으로 돌아간다. 도구 호출이 없으면 반복이 끝난다.
8. 사용자가 중단하면 화면이 통로에 중단을 알리고, 뒷단이 띄워 둔 프로그램을 하위 프로세스까지 끝낸다.

구독 프로그램은 "한 차례의 답"만 내는 두뇌다. 앱의 도구를 직접 실행하지 못하고 요청만 한다. 문서 변경, 변경 내용 표시, 되돌리기는 모두 7번의 앱 쪽에서 일어난다.

## 문서로 새 문서를 만드는 흐름 (넘겨주기)

새 생성 엔진은 없다. 껍데기 앱은 자료와 요청을 만들 문서 쪽 편집기의 새 탭에 넘겨줄 뿐이고, 글은 그 편집기의 AI가 평소 방식대로 쓴다.

1. 입구는 홈의 별표 그룹("이 그룹으로 새 문서 만들기"), 홈의 선택 막대와 파일 줄 메뉴, 모든 편집기의 파일 메뉴("이 문서로 다른 문서 만들기"), 마인드맵 편집기의 도구 줄 단추다. 어디서 시작하든 껍데기 앱이 만들기 창을 띄운다. 만들기 창은 따로 뜨는 작은 창이다. 편집기 탭은 껍데기 화면 위에 얹힌 별도 화면이라, 껍데기 화면이 그 위에 무언가를 그릴 수 없기 때문이다.
2. 창은 자료마다 `parseFileToText`로 읽어 글 길이만 재고 글은 그 자리에서 버린다(사용량·긴 자료 알림용). 어떤 탭에 열려 있고 저장하지 않은 변경이 있는 자료는 읽지 않고, "만들기"를 막는다.
3. "만들기"를 누르면 뒷단이 요청을 다시 검사하고 자료를 다시 확인한 뒤, 만들 종류(PPT, HTML, 마인드맵)의 제목 없는 새 탭을 열면서 그 탭 앞으로 요청을 맡겨 둔다(`packages/electron-utils`의 `generate-handoff.ts`). 창은 닫힌다. 여기까지 AI는 돌지 않는다.
4. 새 탭의 편집기 화면이 준비되면 `<편집기>:handoff-take`로 요청을 한 번 가져간다. 요청은 그 탭 앞으로만 맡겨지므로 다른 탭은 받지 않고, 두 번째 가져가기와 다시 불러오기도 아무것도 받지 않는다. 가져가기 전에 탭이 닫히면 요청은 버려진다.
5. 편집기는 자료를 AI 창의 첨부로, 요청 글을 입력 칸에 넣고 보내기 버튼과 같은 길로 보낸다. 그래서 실행은 보내기 전의 문지기를 그대로 지나고, 막히면 글과 첨부가 그 창에 남는다. 첨부는 그 편집기의 평소 첨부 읽기로 읽힌다.
6. 넘겨받은 자료가 하나라도 붙은 실행이 실제로 시작되면 편집기가 `<편집기>:handoff-run-started`로 알린다. 껍데기 앱은 이것을 메모리에만 둔다.
7. 그 탭의 문서가 처음 저장되면(6과의 순서는 상관없다) 껍데기 앱이 데이터 폴더의 `document-links.json`에 출처 기록을 적는다. 문서 파일에는 아무것도 넣지 않는다.

**AI 없이 바꾸기.** 자료가 하나이고 종류가 맞으면(지도 → 마크다운, 지도 → PPT 뼈대, 마크다운 → 지도) 3에서 껍데기 앱이 직접 바꾼다(`apps/shell/src/main/generate/convert.ts`). 자료는 `parseFileToText`로만 읽으므로 가린 자리는 이름표로 옮겨진다. 결과는 그 종류의 새 탭 앞으로 맡겨 두고, 새 탭이 한 번 가져가 저장하지 않은 새 문서로 연다. 바꾼 사실은 7의 기록에 같이 쓰인다.

## 이음오피스 문서에서 첨부하는 흐름

1. 편집기 AI 창의 "이음오피스 문서에서 첨부" 단추(`packages/ui`의 `DocAttachButton`)를 누르면, 편집기 preload가 내준 다리(`window.aiOfficeDocs`)로 껍데기 앱에 부탁한다. 껍데기 앱이 없으면(편집기를 혼자 띄우면) 다리가 없어 단추가 나오지 않는다.
2. 껍데기 앱이 문서 고르기 창(별도 창, preload `doc-picker`)을 띄운다. 목록은 묻는 편집기 기준으로 껍데기 앱이 아는 옆 칸 탭, 열린 탭과 떼어 낸 창, 그리고 최근 연 문서에서 만든다(`doc-list.ts`, 묻는 편집기는 `doc-asker.ts`). 지금 문서와 같은 경로는 빠진다. 형식(`file-parse`의 `ATTACHABLE_EXTS`)과 크기 상한 안인 것만 넣고, 저장하지 않은 문서·저장 안 된 변경이 있는 문서·없는 파일도 항목으로 두되 흐리게 표시한다. 같은 경로는 앞 그룹이 이긴다.
3. 저장된 문서의 식별자는 그 경로다. 사용자가 고르고 "첨부"를 누르면 껍데기 앱이 방금 창에 건넨 목록에서 고를 수 있는 상태인 식별자일 때만 받아들여 그 경로를 편집기로 돌려준다. 창을 닫으면 취소다.
4. 편집기는 돌려받은 경로를 평소 PC 파일 첨부와 같은 길로 넣는다. 형식과 크기는 이미 걸러졌고, 실제 읽기(가리기 포함)는 그 편집기의 첨부 읽기가 한다.
5. 입력란의 `@`(결정 0051)는 같은 목록을 `doc:attach-list`로 받아 입력란 위에 띄운다(`packages/ui`의 `use-doc-mention.tsx`, 규칙은 `doc-mention-model.ts`). 고르면 편집기가 넘긴 `docMentionActions`가 같은 첨부 길로 붙이고, 붙은 문서만 입력란 글이 `@이름`으로 바뀐다.

## 에이전트 모드의 흐름

결정 0032. 기본 AI 창과 달리 반복은 프로그램 안에서 돈다. 앱은 프로그램을 띄우고, 권한 요청에 답하고, 열린 문서를 다루는 도구를 MCP로 내준다.

```
에이전트 창(화면) ── agent-window:* ──→ 껍데기 앱 뒷단 agent/agent-window.ts ─ agent-sessions.ts
   ↑ 진행·권한 요청                        │ 시작: 폴더 검사, 연결 확인, 스킬 복사, 세션 MCP 서버
   └────────────────────────────────────┘ │
                                          ↓ packages/ai-provider/agent-session
                               Claude Code(-p, stream-json) 또는 Codex app-server(스레드 하나)
                                          │ 프로젝트 폴더에서 자기 도구로 일한다
                                          └→ 세션 MCP 서버(루프백, 토큰) → 열린 문서의 편집기 실행기
```

1. 홈 사이드바의 "에이전트" 항목이 창을 띄운다(`home:open-agent-window`). 창의 preload(`agent.ts`)는 자기 세션 채널만 내준다.
2. "시작"을 누르면 뒷단이 경고 확인, 폴더(`projectFolderProblem`), 연결(`subscriptionConnection`)을 본다. 그다음 세션 임시 폴더와 세션 MCP 서버(`startAgentMcpServer`)를 만들고, 켜진 스킬(`userSkills.enabledForAgent`)로 스킬 묶음을 새로 맞춘다(`buildAgentSkillBundle`). Claude는 묶음을 플러그인으로, Codex는 읽기 경로와 지시문의 목록으로 받는다.
3. 실행부(`startClaudeAgentSession`, `startCodexAgentSession`)가 프로그램을 띄우고 시작 보고를 확인한다. Claude는 도구 목록, Codex는 권한 프로필과 MCP 목록이다.
4. 사람이 메시지를 보내면 그 차례가 시작된다. 프로그램이 권한을 물으면 실행부가 `agentPolicyVerdict`로 판단한다. "묻기"면 창에 카드를 띄우고 사람의 답을 프로그램에 돌려준다.
5. 프로그램의 글, 도구 사용, 차례의 끝, 오류 종류가 창으로 흘러간다. 오류 문장은 창에 보내지 않는다.
6. 멈추기, 창 닫기, 30분 쉼, 앱 종료 때 프로세스 트리를 끝내고 세션 MCP 서버와 임시 폴더를 정리한다.

## 사용자 스킬이 지나는 길 (결정 0048)

```
설정 → 스킬(화면) ─┐                         ┌─ @genoffice/ai-provider user-skills
편집기 AI 창·홈 AI 질문 ─ aiOfficeUserSkills ─┼→ 껍데기 앱 뒷단 user-skills/ ─┤  출처 읽기·판정, 가져오기·업데이트·내보내기
에이전트 창(일부) ──────┘   (preload 다리)     │  (쓰기는 ~/.ieumoffice/skills 하나) └─ 깃허브 세 주소
                                              └→ app-settings.json의 skills 값
```

- 스킬을 읽고 쓰는 일은 모두 껍데기 앱 뒷단의 게이트웨이(`apps/shell/src/main/user-skills/`)가 한다. 편집기 렌더러는 파일 시스템을 만지지 않고 다리(`aiOfficeUserSkills`, `@genoffice/electron-utils/user-skills-bridge`)로 부른다.
- 기본 AI 창: 입력칸의 `/`·`$` 목록과 칩은 `@genoffice/ui`(`useComposerSkills`)에 있다. 보낼 때 칩의 본문을 요청 글에 붙인다. AI가 스스로 쓰는 도구(`use_skill`, `read_skill_file`, `propose_skill`)는 `@genoffice/agent-core`의 기능 묶음(`createBridgedUserSkillsSkill`)이고 편집기의 도구 반복에서 돈다. 구독 프로그램은 여전히 도구 0개다.
- 양식: 양식 스킬을 부르면 뒷단(`templateTabs`)이 양식 사본을 그 형식 편집기의 제목 없는 새 탭으로 열고, 넘겨주기(`queueSkillHandoffFor`/`takeSkillHandoff`)로 요청과 칩을 그 탭의 AI 창에 넘긴다. 받는 창은 보내기 전 문지기를 거쳐 실행한다.
- 에이전트 창: 세션을 시작할 때 켜진 스킬이 묶음으로 복사된다(위 "에이전트 모드의 흐름"). 세션 MCP 서버의 `propose_skill`·`propose_skill_install`은 창에 카드와 미리보기를 띄우기만 한다.

## 화면 나누기와 초점 (결정 0037)

한 창의 탭 관리자가 두 칸(split)을 안다. 칸에 들어간 탭은 각각 지금의 편집기 화면(WebContentsView)이고, 칸의 자리·크기·초점은 탭 관리자가 계산한다(`apps/shell/src/main/split-layout.ts`의 순수 계산, 구분선 틈 6px). 끌어다 놓기와 탭 메뉴의 결과는 `SplitDropIntent` 여섯 갈래(생성·교체·방향 전환·초점·뒤집기·무동작)로만 표현되고, 실행은 `TabManager`가 한다. 초점이 바뀌면 껍데기가 각 칸 화면에 역할(`focus`/`secondary`)을 알리고(`app:split-role-changed`), 비포커스 칸의 AI 패널은 강제로 레일로 접힌다 — 패널은 마운트된 채 남아 대화와 진행 중 실행이 살아 있다. 나눔 상태는 껍데기 설정 파일(`app-settings.json`)에 남아, 파일 지정 없는 시작에서 두 문서가 디스크에 있으면 다시 열어 복원한다. 같은 문서가 두 칸에 있을 때의 저장 확인은 편집기 저장 길목의 공용 조각(`packages/electron-utils/src/save-conflict.ts`)이 맡는다: 그 경로가 앱 안 다른 곳에도 열려 있고 디스크가 그사이 바뀌었을 때만 직접 저장은 확인을 받고 자동 저장은 조용히 미룬다.

## 구독 연결 상태가 화면에 닿는 길

- 뒷단: 상태 서비스가 두 프로그램에 "설치됐나, 로그인됐나, 어떤 방식인가"를 묻는다(버전·로그인 상태 명령. 모델 호출이 아니다). 결과는 프로세스에 하나뿐인 저장소에 있고, AI 요청의 제공자 선택(위 4번)이 같은 값을 읽는다.
- 앱이 쓸 수 있는 로그인(구독, 또는 허용된 종량)의 프로그램에는 모델 목록도 묻는다. 상태가 먼저 화면에 나가고, 목록은 도착하는 대로 변경 알림에 실려 같은 길로 간다. 목록을 얻지 못해도 상태는 그대로다.
- 창구: `ensureSubscriptionIpc`가 채널을 등록한다. 한 프로세스에서 여러 번 불러도 한 번만 등록된다. 첫 조회가 올 때 첫 확인을 시작한다.
- 화면: 각 편집기와 껍데기 앱의 preload가 조회·다시 확인·로그인 띄우기·설치 띄우기·종량 허용 기록·변경 알림을 화면에 내준다. 로그아웃은 껍데기 앱의 preload만 내준다. 화면은 받은 값을 공용 검사 함수(`subscriptionStatusMapOf`)로 거른 뒤 쓴다. 계정 이메일과 모델 목록도 이 함수가 모양을 확인한 것만 통과시킨다.

## 바깥에서 들어오는 길 (자동 호출 경로)

```
터미널의 `ieumoffice …`  ──┐
MCP 클라이언트(`ieumoffice mcp`) ─┴→ packages/cli → 문서 엔진(파일 읽기·만들기·변환, PC 안에서 끝남)
                                         ├→ packages/pdf-structure (PDF 변환·그림·보관소, PC 안에서 끝남)
                                         ├→ packages/ai-search (search / image / media / read-url, 밖으로 나감)
                                         └→ packages/ai-provider (pdf ai-read / translate, `--yes`일 때만 밖으로 나감)
```

- 이 경로는 창을 띄우지 않는다. 앱의 설정 파일과 종량 허용 기록을 읽기만 한다. PDF 명령은 앱과 같은 보관소(데이터 폴더의 `pdf-store`)를 읽고 쓴다.
- `ai-search`의 도구는 호출 맥락을 받는다. 화면 경로는 `{ path: 'screen', statuses }`, 이 경로는 `{ path: 'headless', statuses, dataDir }`. 구독을 쓸지, 요청을 차례에 세울지가 이 값으로 갈린다.
- 차례는 데이터 폴더의 잠금 파일로 지킨다. 구독 요청 하나가 잠금을 쥐고 도는 동안 다른 프로세스의 요청은 기다린다. 횟수 한도는 없고, 장부 파일에는 최근 한 시간의 요청 시각이 정보로만 남는다.
- PDF의 AI 페이지 읽기와 번역은 이 경로에서 `pdf-structure`의 작업 엔진을 명령 프로세스 안에서 돌린다. 모델 호출은 한 번마다 `ai-provider`의 `streamForProvider`로 가고, 구독이면 같은 잠금으로 차례를 기다린다(`runHeadlessSubscriptionCall`). 터미널 명령은 작업이 끝날 때까지 앞에서 돌고, MCP 도구는 작업을 MCP 서버 프로세스 안에 띄우고 바로 답한다. 서버가 끝나면 작업은 `interrupted`로 멈춘다.

## PDF 구조 작업과 문서 작업 (화면 경로)

PDF를 문서 나무로 분석하고 Markdown·EPUB·번역 PDF를 쓰는 일은 셸 메인 프로세스 밖에서 돈다. 큰 문서에서 창이 멈추지 않게 하려는 것이다. 기존 워드·PPT·엑셀 변환(`pdf2docx-local.ts` 등)은 예전처럼 메인 프로세스에서 돈다.

```
PDF 편집기 화면 ── pdfApi.structure.* ──→ 셸 메인(pdf-structure-ipc.ts) ── 작업마다 utilityProcess 하나 ──→ pdf-structure
               ── pdfApi.store.*     ──→ 셸 메인(ResultStore, <userData>/pdf-store)
               ── ai:stream          ──→ 공용 AI 창구 → 제공자(구독 프로그램 등)
```

- **구조 작업.** 화면이 `structure*` 채널로 나무 만들기, 구조화 글, 변환, 그림 꺼내기, 번역 PDF 쓰기를 부탁하면, 셸이 작업마다 Electron `utilityProcess`를 하나 띄운다(`apps/shell/src/main/pdf-structure/pdf-structure-process.ts`, 빌드 결과 `out/main/pdf-structure-process-*.js`). 그 프로세스가 PDFium과 Windows OCR을 준비해 작업 하나를 하고 답한다. 답하거나, 실패하거나, 화면이 취소하거나, 그 탭이 닫히거나, 앱이 끝나면 프로세스를 끝낸다. 진행은 `structureProgress`로 화면에 간다.
- **보관소.** `store*` 채널은 가벼운 일이라 셸 메인에서 바로 `ResultStore`로 처리한다. 화면은 경로를 주고 해시를 받으며(`storeDocHash`), 읽기·쓰기는 그 창에 열린 파일에서 셸이 계산한 해시로만 받아들인다. 설정 화면의 용량·모두 지우기는 셸 자신의 채널(`result-store-ipc.ts`)이다.
- **문서 작업(AI 페이지 읽기, 번역).** 작업 엔진(`pdf-structure`의 `startAiReadJob`·`startTranslationJob`)은 PDF 편집기 **화면** 안에서 돈다. 탭마다 세션(`apps/pdf/src/renderer/doc-jobs/job-session.ts`)이 작업을 쥐고, 탭이 사라지면 `interrupted`로 멈춘다.
  1. 사용자가 시작을 확인하면 세션이 작업을 띄운다. 쓸 제공자는 확인 전에 한 번 정해 고정한다(`doc-jobs/route.ts`).
  2. 페이지 그림은 화면이 PDF.js로 그린다. 문서 나무와 AI 읽기 결과를 반영한 나무는 구조 작업으로 받는다.
  3. 모델 호출 하나는 AI 창과 같은 `ai:stream` 채널로 간다(`doc-jobs/model-call.ts`). 도구 없이 지시문과 글·그림만 보내고, 답은 글로 받아 작업이 검사한다. 중단하면 스트림이 끊기고 뒷단이 구독 프로그램을 끝낸다.
  4. 결과는 `pdfApi.store.write`로 셸에 보내 보관소에 쓴다(`doc-jobs/ipc-store.ts`). 보관소에 쓰인 뒤에야 끝난 것으로 센다.
  5. 번역 PDF는 끝난 뒤 구조 작업(`structureWriteBack`)으로 쓴다. Markdown·EPUB도 구조 작업이다.
- 앱 안에서 저장해 파일 내용이 바뀌면, 화면이 `storeMigrate`를 불러 같은 페이지의 결과와 끝나지 않은 작업의 기록을 새 해시로 옮긴다.
- 한 문서에 작업 하나는 세 겹으로 지킨다. 탭의 세션, 화면 프로세스 안의 잠금(`documentJobs`), 다른 프로세스가 최근 30초 안에 갱신한 작업 기록.

## 프로세스 경계를 넘는 것과 넘지 않는 것

| 경계                    | 넘어가는 것                                                                                                                                                                                                                                                            | 넘어가지 않는 것                                                                           |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| 앱 → 구독 프로그램      | 시스템 지시문, 대화, 앱 도구 목록, 첨부 이미지(표준 입력으로). 문서 작업이면 PDF 페이지 그림, 번역할 글 블록(도구 목록 없이)                                                                                                                                           | 사용자 글이 든 명령줄 인자, 요금 경로를 바꾸는 환경변수, 사용자 PC의 개인 설정·훅·MCP 연결 |
| 구독 프로그램 → 앱      | 글 조각, 구조화된 도구 호출 요청, 사용량, 오류, 계정 이메일(설정 화면 표시용. 저장하지 않는다), 모델 목록                                                                                                                                                              | 로그인 정보, 조직 이름(읽은 즉시 버린다)                                                   |
| 앱 → 인터넷(직접)       | 키 방식 제공자 요청, 검색어, 검색된 이미지 받기, 주소로 문서 읽기(`read_url`·`read-url`: 입력한 주소가 그 사이트로, GitHub 읽기 토큰은 `api.github.com`에만), 업데이트 확인. 사용자가 켠 경우에만: 파일 검색 재정렬(찾은 문서의 발췌), 마크다운 편집기의 이미지 올리기 | 사용 통계(보내지 않는다)                                                                   |
| 화면 ↔ 뒷단             | 설정(정리된 사본), 연결 상태, 스트림 조각. PDF 편집기는 문서 나무, 보관소 읽기·쓰기(뒷단이 계산한 문서 해시로만)                                                                                                                                                       | 프로그램 실행 권한(뒷단에만 있다)                                                          |
| 셸 메인 ↔ 구조 프로세스 | 작업 하나의 요청(파일 경로, 암호, 페이지 범위, 출력 경로), 진행, 결과                                                                                                                                                                                                  | 다른 작업. 프로세스는 작업 하나가 끝나면 끝난다                                            |

## 바깥 의존

- 사용자 PC의 **Claude Code**(2.1.248 이상)와 **Codex** 프로그램. 없으면 구독 연결이 "설치되지 않음"이 되고 나머지 기능은 그대로 동작한다.
- 무료 검색: Parallel의 무료 검색, 실패하면 DuckDuckGo.
- GitHub 릴리스(`pblsketch/openoffice`): 자동 업데이트와 설치 파일 배포.
- 키 방식 제공자와 키 방식 검색·이미지 서비스, 파일 검색 재정렬 서비스, 마크다운 편집기의 이미지 올리기 대상: 사용자가 설정에 넣은 경우에만.
- 주소로 문서 읽기(`read_url`·`read-url`): 입력한 주소가 그 사이트로 간다. 비공개 GitHub 파일을 읽을 때의 GitHub 읽기 토큰은 `api.github.com`에만 실린다.
- 문서가 스스로 부르는 것: HTML 문서는 자기 코드가 가리키는 온라인 자원을 불러오고, 마크다운 내보내기는 주소로 걸린 그림을 받아 온다.
- 빌드할 때만: 한글 편집기의 편집 화면은 rhwp 저장소(`edwardkim/rhwp`)의 고정된 태그에서 받아 빌드한다. 실행 중에는 그 편집기가 밖으로 나가는 요청을 하지 않는다(외부 글꼴도 빌드에서 끈다). 같은 엔진(`@rhwp/core`의 WASM, 저장소의 `vendor/rhwp-core`에 패치해 빌드해 둔 것)은 설치본에도 들어가, 편집기 밖에서 한글 문서의 글자를 읽는 데 쓰인다(`packages/file-parse`). 이 읽기도 PC 안에서만 돈다.
