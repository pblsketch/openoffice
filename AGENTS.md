# 이음오피스 (IeumOffice)

워드·엑셀·파워포인트·PDF·마크다운·HTML·한글(HWP) 문서와 마인드맵(XMind 파일 `.xmind`), Excalidraw 그림(Obsidian 그림 노트 `.excalidraw.md`, `.excalidraw`)을 한 창에서 열고 고치는 데스크톱 오피스 프로그램이다. AI가 문서를 직접 고친다. 누구나 무료로 쓰도록 배포하며, 특정 직업군용이 아니다.

AI는 쓰는 사람이 이미 내고 있는 **Claude 또는 Codex 구독**으로 돌아간다. 앱은 PC에 설치된 그 회사의 프로그램을 실행해 답 한 차례를 받아 오고, 문서를 고치는 일은 앱이 한다. 요금이 나가는 쪽으로는 사용자가 직접 고르지 않는 한 가지 않는다.

한 사람이 자기 PC에서 쓰는 로컬 프로그램이다. 서버, 회원 계정, 사용 통계가 없다. 오픈소스 GenOffice(Apache-2.0)의 포크이고, 원본의 문서 엔진 개선을 계속 골라 받아온다. 그래서 코드 내부 이름은 원본 그대로이고, 고치는 범위는 필요한 만큼으로 좁게 잡는다. 배포하는 운영체제는 Windows이고, Apple Silicon Mac용과 Linux(x64)용은 베타로 낸다(결정 0031). Mac과 Linux는 저장소 주인이 직접 확인하지 못하고 사용자들의 보고로 확인한다. 화면 언어는 21개다.

## 프로젝트 구조

```
openoffice/
├── AGENTS.md                      ← Codex 등이 읽는 진입점
├── CLAUDE.md                      ← Claude Code가 읽는 진입점. 내용은 AGENTS.md와 같다
├── README.md / README.en.md       ← 사용자용 소개(한국어 / 영어)
├── PRIVACY.md                     ← 무엇이 어디로 전송되는지 전체 목록
├── CONTRIBUTING.md / SECURITY.md  ← 기여 방법, 보안 문제 신고
├── docs/
│   ├── architecture.md            ← 조각들이 어떻게 맞물리는지, AI 요청 한 번의 흐름
│   ├── business-rules.md          ← 구독 연결 상태, 제공자 선택, 막혔을 때, 자동 호출 등 동작 규칙
│   ├── security.md                ← 로그인·요금 경로·프로그램 실행·문서 내용에 대한 정책
│   ├── standards.md               ← 어기면 깨지는 규칙 전체, 합치기 전 검사
│   ├── engineering-notes.md       ← 모르면 걸리는 것(증상 → 원인 → 대응)
│   ├── operations.md              ← 설치, 실행, 검사, 실제 구독 확인, 설치 파일, 원본 받아오기
│   ├── contracts.md               ← 터미널 명령어·MCP·설정 파일·문서 호환의 약속
│   ├── releasing.ko.md            ← 새 버전 내는 절차(저장소 주인용)
│   ├── headless-pdf-export.md     ← 창 없이 PDF로 내보내는 진입점
│   ├── slides-op-journal.md       ← 슬라이드 편집 기록 형식
│   ├── plans/
│   │   ├── ai-web-reading.md      ← AI 웹 읽기 계획(초안)
│   │   ├── connect-guide.md       ← AI 연결 도우미 계획(진행 중)
│   │   ├── pdf-reading-assist.md  ← PDF 읽기 도우미 계획
│   │   ├── pdf-tools.md           ← PDF 도구 모음 계획(초안)
│   │   └── update-details.md      ← 업데이트 상세 내역 표시 계획(확정)
│   └── tracking/
│       ├── status.md              ← 된 것과 남은 것
│       ├── findings.md            ← 풀리지 않은 문제
│       └── decisions/
│           ├── index.md           ← 결정 기록 목록
│           └── NNNN-*.md          ← 결정 하나씩(맥락, 결정, 버린 대안, 결과)
├── apps/
│   ├── shell/AGENTS.md            ← 껍데기 앱: 창·탭·홈·설정·첫 실행 안내·업데이트, 만들기 창과 출처 기록
│   ├── docs/AGENTS.md             ← 워드 편집기, 공용 AI 창구를 등록하는 뒷단
│   ├── sheets/AGENTS.md           ← 엑셀 편집기
│   ├── sheets/native/xlsx-engine/AGENTS.md ← 엑셀 처리 프로그램(Rust)
│   ├── slides/AGENTS.md           ← 파워포인트 편집기, 슬라이드 생성
│   ├── pdf/AGENTS.md              ← PDF 편집기
│   ├── markdown/AGENTS.md         ← 마크다운·텍스트 편집기
│   ├── html/AGENTS.md             ← HTML 편집기
│   ├── mindmap/AGENTS.md          ← 마인드맵 편집기(`.xmind`)
│   ├── hwp/AGENTS.md              ← 한글(HWP·HWPX) 편집기, 편집 화면은 rhwp
│   └── excalidraw/AGENTS.md       ← 그림 편집기(Obsidian 그림 노트·`.excalidraw`), 그림판은 Excalidraw
├── packages/
│   ├── ai-provider/AGENTS.md      ← 제공자 목록·선택 규칙, 구독 프로그램 실행부
│   ├── ai-search/AGENTS.md        ← 검색·이미지 생성·미디어 분석 도구, 자동 호출 제한
│   ├── agent-core/AGENTS.md       ← AI 실행 반복, 화면↔뒷단 전송, 가리기
│   ├── ui/AGENTS.md               ← 편집기 공용 AI 화면 부품과 문구
│   ├── i18n/AGENTS.md             ← 화면 언어 목록, 제품 이름 정의
│   ├── cli/AGENTS.md              ← 터미널 명령어 `ieumoffice`, MCP 도구
│   ├── electron-utils/AGENTS.md   ← 뒷단 공용 도구
│   ├── docx-engine/AGENTS.md      ← 워드 문서 엔진
│   ├── odt-engine/AGENTS.md       ← ODT 열기·되돌려 쓰기·docx → ODT
│   ├── pptx-engine/AGENTS.md      ← 파워포인트 문서 모델
│   ├── pptx-ops/AGENTS.md         ← 슬라이드 편집 연산
│   ├── pptx-render/AGENTS.md      ← 슬라이드 그리기
│   ├── xlsx-gateway/AGENTS.md     ← 엑셀 저장 경로
│   ├── pdf2docx/AGENTS.md         ← PDF → 워드 변환
│   ├── pdf-structure/AGENTS.md    ← PDF 문서 나무, Markdown·EPUB 변환, AI 페이지 읽기·번역, 결과 보관소
│   ├── html2docx/AGENTS.md        ← HTML → 워드 변환
│   ├── xmind-engine/AGENTS.md     ← 마인드맵 파일 엔진(열기, 원본 보존, 맞추기, 개요 글, 테마 표)
│   ├── excalidraw-engine/AGENTS.md ← 그림 파일 엔진(Obsidian 노트·`.excalidraw` 열기, 바뀐 곳만 다시 쓰기)
│   ├── file-parse/AGENTS.md       ← 첨부·검색용 파일 읽기, 다른 파일로 읽을 때의 가리기
│   ├── zip-gate/AGENTS.md         ← 압축 파일 안전 검사
│   ├── google-drive/AGENTS.md     ← Google 드라이브 로그인과 파일 주고받기
│   ├── font-metrics/AGENTS.md     ← 글꼴 치수
│   ├── pipelines/AGENTS.md        ← 슬라이드 생성 단계
│   └── project-store/AGENTS.md    ← 프로젝트와 대화 기록 저장
├── skills/ieumoffice/SKILL.md     ← 코딩 에이전트에 설치되는 스킬
├── .claude/skills/release-ieumoffice/SKILL.md ← 릴리스 작업 스킬(에이전트용)
└── tools/                         ← 검사 도구(`check-*.mjs`), 브랜드 그림·도움말 그림 생성기
```

## 절대 어기지 않는 것

1. **구독 로그인 정보에 손대지 않는다.** Codex의 로그인 파일(`~/.codex/auth.json`)과 Claude의 로그인 저장소를 읽거나 복사하거나 저장하는 코드를 쓰지 않는다. 시험이나 디버깅 중에도 마찬가지다. 앱 화면에 Claude·ChatGPT 로그인 양식을 만들지 않고, 두 회사의 프로그램을 고치지 않는다.
2. **AI 대화를 요금이 나가는 연결로 스스로 바꾸지 않는다.** 키 제공자와 종량 로그인은 사용자가 직접 골랐을 때만 대화에 쓰인다. 막히면 멈추고 알린다.
3. **구독 프로그램은 앱이 끌 수 있는 도구를 모두 끈 채로, 셸 없이, 앱보다 오래 살지 않게 실행한다.** Claude는 프로그램이 보고한 도구가 0개일 때만 진행한다. Codex는 끌 수 없는 자체 도구를 읽기 전용으로 가둔다. 프로그램은 실제 실행 파일로 직접 띄우고, 중단·종료 때 하위 프로세스까지 끝낸다. 예외는 에이전트 모드 하나다(결정 0032). 사람이 고른 프로젝트 폴더에서만 정해 둔 도구를 켜고, 프로그램이 보고한 도구가 그 목록과 같을 때만 진행하며, 모든 권한 요청은 앱의 판단(`agentPolicyVerdict`)이나 사람의 답을 거친다. 셸 없는 실행, 정리된 환경, 하위 프로세스까지의 종료는 그대로다.
4. **문서 엔진의 동작과 문서 안에 저장되는 식별자를 바꾸지 않는다.** 저장·내보내기 결과는 원본과 같아야 하고, 원본 프로그램과 문서를 주고받을 수 있어야 한다.
5. **코드 내부 이름을 바꾸지 않고, 원본이 PC에 등록한 것을 건드리지 않는다.** `@genoffice/*`, `GENOFFICE_*`는 그대로다. `genoffice` 명령어와 `~/.genoffice`는 읽지도 고치지도 않는다. `LICENSE`, `NOTICE`, 출처 표시는 남긴다.

전체 규칙은 `docs/standards.md`, 보안 정책은 `docs/security.md`에 있다.

## 일을 시작하기 전에

항상: `docs/standards.md`, `docs/engineering-notes.md`, 고칠 모듈의 `AGENTS.md`.

하려는 일에 따라 먼저 읽을 것:

| 하려는 일                                              | 먼저 읽을 것                                                                                             |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| 구독 연동(프로그램 실행, 상태 판정, 환경변수)을 고친다 | `docs/security.md` 전체, `packages/ai-provider/AGENTS.md`, `docs/engineering-notes.md`의 "구독 프로그램" |
| 제공자 선택이나 AI 창의 보내기·막힘 처리를 고친다      | `docs/business-rules.md`의 "제공자 선택", "보내기 전의 문지기", "실행 중 막혔을 때"                      |
| 편집기 뒷단(`apps/*/src/main`)이나 preload를 고친다    | `docs/engineering-notes.md`의 "빌드와 실행". 껍데기 앱을 다시 빌드해야 반영된다                          |
| 화면 문구나 도움말을 더하거나 고친다                   | `docs/standards.md`의 "글과 언어", "제품 이름". 21개 언어 모두 채운다                                    |
| 화면 스타일을 고친다                                   | `docs/standards.md`의 "화면 색"                                                                          |
| 아이콘·그림을 더하거나 다른 회사 이름을 화면에 적는다  | `docs/standards.md`의 "상표와 아이콘"(결정 0052)                                                         |
| 터미널 명령어·MCP·스킬을 고친다                        | `docs/contracts.md`. 출력 구조와 이름은 밖에서 기대고 있다                                               |
| 가리기나 다른 파일로 읽기를 고친다                     | `docs/security.md`의 "문서 내용", `packages/file-parse/AGENTS.md`                                        |
| 마인드맵 파일의 열기·저장을 고친다                     | `packages/xmind-engine/AGENTS.md`. 바뀐 것이 없는 저장은 원본 바이트 그대로다                            |
| 설정 파일의 값을 더하거나 읽는 방식을 바꾼다           | `docs/engineering-notes.md`의 "설정 파일", `docs/contracts.md`의 "설정 파일"                             |
| 원본의 변경을 받아온다                                 | `docs/operations.md`의 "원본의 개선 받아오기". 끝나면 `npm run check:no-genspark`                        |
| 문서 엔진 패키지를 고쳐야 할 것 같다                   | 멈추고 사람에게 묻는다. 그 패키지의 `AGENTS.md`를 읽는다                                                 |
| 에이전트 모드(도구를 켠 구독 프로그램)를 고친다        | `docs/tracking/decisions/0032-agent-mode-in-project-folder.md`, `docs/security.md`의 "에이전트 모드"     |
| AI를 실제 구독으로 돌려 확인한다                       | `docs/operations.md`의 "실제 구독으로 확인하기". 사용자의 한도를 쓴다                                    |
| 새 버전을 낸다                                         | `docs/releasing.ko.md`. 첫 항목은 저장소 주인의 약관 동의다                                              |

- **릴리스 본문은 사용자가 앱 안에서 그대로 읽는다.** 첫 문단 요약 → 새로 들어간 것 → 고친 것 → 설치 안내(맨 아래) 순서와 humanize-korean 윤문은 `docs/releasing.ko.md` 6번이 정한다. 에이전트는 `.claude/skills/release-ieumoffice/SKILL.md`도 함께 읽는다.
- **새 버전을 공개하면 소개 사이트에 업데이트 소식을 올린다.** https://ieumoffice.vercel.app 의 내려받기 버튼은 저절로 바뀌지만, 업데이트 페이지(`/updates`)의 새 항목과 메인의 한 줄 안내는 손으로 더한다. 절차는 `docs/releasing.ko.md` 13번과 사이트 저장소(`E:\github\ieumoffice-site`) `README.md`의 "새 버전을 낸 뒤"에 있다.

## 문제가 생기면

다음은 **즉시 사람에게 알린다.** 스스로 고치고 넘어가지 않는다.

- 코드가 구독 로그인 파일이나 로그인 저장소에 닿는 것을 발견했다.
- 사용자가 고르지 않은 요금 경로(키 제공자, 종량 로그인)로 요청이 나갔거나 나갈 수 있다.
- Claude가 도구를 가진 채 실행됐거나, 구독 프로그램이 앱이 꺼진 뒤에도 남아 있었다.
- 가리기로 감춘 내용이 제공자에게 전송됐다.
- 저장·내보내기 결과가 달라졌거나, 원본 프로그램으로 만든 문서를 열지 못한다.
- 원본이 PC에 등록한 것(`genoffice` 명령어, `~/.genoffice`)을 읽거나 고쳤다.
- 테스트나 확인 작업이 사용자의 구독 한도를 반복해서 썼다.
- 약관에 걸리는 판단이 필요하다(구독을 새 경로로 쓰는 기능, 두 회사 이름·로고의 사용).

그 밖의 문제는 먼저 풀어 본다. 지금 풀 수 없으면 `docs/tracking/findings.md`에 "어떤 조건에서 무엇이 보이는지, 왜 중요한지, 왜 지금 못 푸는지"를 적는다.
