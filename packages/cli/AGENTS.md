# packages/cli (`@genoffice/cli`)

`ieumoffice` 명령줄과 MCP 서버다. 앱과 같은 문서 엔진으로 문서를 만들고·읽고·고치고·변환하며, 창 없이 앱에 번들된 Node 런타임에서 돈다. 사람이 아니라 코딩 에이전트나 스크립트가 부르는 "자동 호출 경로"의 입구이기도 하다.

## 맡은 범위

- 진입과 명령 표: `runCli`·`defaultRegistry`(`src/cli.ts`), `CommandDef`·`CommandRegistry`(`src/registry.ts`), 결과 봉투와 종료 코드(`src/result.ts`), 명령 구현(`src/commands/`), 형식별 어댑터(`src/formats/`).
- MCP 서버: stdio(`src/mcp/server.ts`)와 HTTP(`src/mcp/http.ts`), 명령 표를 MCP 도구로 바꾸는 `src/mcp/tools.ts`.
- 검색·이미지·미디어 명령의 준비 과정 `headlessCall`·`cloudToolError`(`src/cloud.ts`)와 `capabilities` 명령.
- 웹 페이지 읽기 명령 `read-url`(`src/commands/read-url.ts`, MCP `read_url`): 주소 하나를 그 사이트에서 받아 글자 offset과 함께 돌려준다. 제공자·구독·자동 호출 장부를 쓰지 않는다.
- PDF 구조 명령: `convert --to md|epub`, `pdf read --structured`, `pdf images`(`src/commands/convert.ts`, `pdf.ts`, `src/formats/pdf-structure.ts`, `pdf-outputs.ts`). 문서 나무와 출력은 `packages/pdf-structure`를 명령 프로세스 안에서 부른다.
- PDF 문서 작업 명령: `pdf ai-read`, `pdf translate`, `pdf status`(`src/commands/pdf-ai-read.ts`, `pdf-translate.ts`, `pdf-status.ts`, 공통 준비 `pdf-job.ts`), 이 작업들의 AI 연결(`src/pdf-ai.ts`), MCP 도구로 띄운 작업의 추적(`src/pdf-jobs.ts`).
- EPUB 책 번역 명령: `epub translate`, `epub status`(`src/commands/epub.ts`, `epub-translate.ts`, `epub-status.ts`, MCP `epub_translate`·`epub_status`, 결정 0066). 단위·작업·결과 책은 `packages/epub-engine`을, 작업 엔진과 보관소는 `pdf-structure`를 명령 프로세스 안에서 부른다. AI 연결과 공통 준비는 PDF 작업 명령의 것(`src/pdf-ai.ts`, `pdf-job.ts`)을 함께 쓴다.
- PC에 등록하는 이름(`src/names.ts`)과 등록 작업: PATH 연결(`src/install.ts`), 에이전트 MCP 설정에 항목 쓰기(`src/agent-mcp.ts`), 스킬 설치(`src/agent-skills.ts`), MCP 클라이언트가 실행할 명령 조립(`src/mcp-launch.ts`).
- 실행 중인 앱과의 연결: 제어 채널(`src/control.ts`, `src/control-protocol.ts`), 열려 있는 문서 확인(`src/gui.ts`), 앱 실행 파일과 번들 자원 찾기(`src/resources.ts`).
- 경로 정책과 감사 기록(`src/fs.ts`, `src/audit.ts`), 번들 빌드(`build.mjs`, `collect-deps.mjs`), 실행기(`bin/ieumoffice`, `bin/ieumoffice.cmd`).

## 맡지 않는 것 (경계)

- 문서 형식의 해석과 저장은 이 모듈의 범위가 아니다. `packages/docx-engine`, `packages/pptx-engine`·`pptx-ops`·`pptx-render`, `packages/xlsx-gateway`와 xlsx 사이드카, `packages/pdf2docx`, `packages/pdf-structure`가 한다. 여기 `src/formats/`는 얇은 어댑터다. 한글 문서는 `packages/file-parse`의 `hwpToText`로 읽기만 한다(`hwp read`, `info`). 만들거나 고치지 않는다. PDF 문서 작업의 호출 순서·멈춤·이어하기·보관소도 `pdf-structure`의 작업 엔진과 보관소가 맡는다. EPUB 책의 열기·번역 단위·결과 책은 `packages/epub-engine`이 맡는다. 명령어는 EPUB을 고치지 않고 번역 결과를 새 파일로 쓸 뿐이다.
- 어느 경로(무료·키·구독)로 갈지, 구독 요청의 차례를 어떻게 지키는지는 `packages/ai-search`의 범위다. 이 모듈은 "자동 호출 경로다"라는 사실과 `dataDir`, 연결 상태를 넘길 뿐이다. 구독 프로그램의 시작·종료는 `packages/ai-provider`의 범위다.
- 앱 안의 MCP 서버(`apps/shell/src/main/mcp`)와 설정 화면의 통합 탭은 shell의 범위다. shell은 이 패키지를 프로세스로 실행하거나 하위 진입점(`/install`, `/agent-skills`, `/mcp-launch`, `/control-protocol`)을 import한다.
- 렌더러가 필요한 변환(PDF 내보내기 등)은 앱 실행 파일의 `--headless-export`가 한다. 이 모듈은 그것을 찾아 실행하고 결과 봉투를 읽는다.
- AI 설정 파일과 종량 허용 기록은 앱의 것이다. 명령줄은 둘 다 읽기만 한다.

## 항상 지켜야 하는 것

- PC에 등록하는 이름은 전부 이 제품의 것이다. 명령 `ieumoffice`, MCP 항목 `ieumoffice`, 스킬 `ieumoffice`, 홈 폴더 `~/.ieumoffice`이고 `src/names.ts`의 상수로만 쓴다. 문자열로 다시 적지 않는다.
- 원본 GenOffice가 같은 PC에 설치돼 있을 수 있다. 그 앱이 등록한 것(`genoffice` 명령, `[mcp_servers.genoffice]` 같은 MCP 항목, `genoffice` 스킬 폴더, `~/.genoffice`, 그 앱의 실행 파일)은 읽지도, 우리 것으로 간주하지도, 바꾸지도, 지우지도, 실행하지도 않는다. `isOurLauncher`·`isGenofficeLauncher`·`installedAppBinaries`가 이 구분을 한다.
- 번들 파일 이름 `genoffice.cjs`(`CLI_BUNDLE_FILE`)는 앱 안의 내부 파일이라 원본 이름을 유지한다. 그래서 "이 번들을 실행한다"만으로는 우리 항목인지 알 수 없다. 원본 실행 파일로 이 이름의 번들을 실행하는 MCP 항목은 원본의 것으로 판정한다.
- 내부 이름은 바꾸지 않는다. 패키지 이름 `@genoffice/cli`, 환경 변수 `GENOFFICE_*`(`GENOFFICE_USER_DATA`, `GENOFFICE_AI_SETTINGS`, `GENOFFICE_APP_BIN`, `GENOFFICE_ALLOWED_ROOTS`, `GENOFFICE_AUDIT_LOG` 등), 함수 이름(`genofficeUserDataDir`)은 원본 표기 그대로다.
- 도움말·도구 설명 같은 고정 문구는 소스에 `GenOffice`로 적고 출력할 때 `branded()`로 바꾼다. 경로를 담은 메시지에는 `branded()`를 쓰지 않고 `PRODUCT_NAME`을 직접 넣는다(실제로 `GenOffice`라는 이름의 폴더는 있는 그대로 찍혀야 한다).
- 이 모듈의 모든 명령과 그것을 실행하는 모든 MCP 도구는 자동 호출 경로다. 검색·이미지·미디어 명령은 반드시 `headlessCall`로 얻은 컨텍스트(`path: 'headless'`, `dataDir`)를 도구에 넘긴다. 컨텍스트 없이 도구를 부르면 화면 경로로 취급되어 스위치와 차례가 적용되지 않는다.
- 자동 호출 경로는 사용자가 앱 설정에서 켰을 때만 구독을 쓴다. 켜져 있다는 것은 지금 판의 경고(시간당 한도 없음, 문서 전체와 페이지 그림이 보내질 수 있음, 계정 제한 위험)에 동의했다는 뜻이고, 예전 판에 동의한 스위치는 꺼진 것으로 읽는다. 횟수 한도는 없다(결정 0011). 명령·MCP 프로세스를 통틀어 요청을 하나씩 차례로 처리한다. 꺼져 있으면 구독이 없는 것처럼 동작한다. 검색은 구독을 쓰지 않는다.
- `pdf ai-read`·`pdf translate`·`epub translate`(MCP `pdf_ai_read`·`pdf_translate`·`epub_translate`)는 `--yes`(`yes`)가 없으면 아무것도 보내지 않고 예상(`detail.estimate`, `detail.started: false`)만 답한다. 가는 길이 요금 경로(키 제공자, 허용된 종량 로그인)면 `--allow-paid`(`allow_paid`)도 있어야 하고, 없으면 종료 코드 4, `paid_route_not_allowed`다. 사용자가 대화용으로 키 제공자를 골라 둔 경우도 같다. 이 두 검사를 건너뛰는 옵션이나 환경 변수를 만들지 않는다.
- 이 명령들은 대화와 같은 규칙으로 제공자를 정하고 작업 내내 바꾸지 않는다. 그림을 읽지 못하는 모델이면 `ai-read`는 시작하지 않는다. 한도 소진(`rate-limit`)과 다시 보내도 소용없는 오류는 즉시 멈춘다. 끝난 결과는 보관소에 남고, 다시 실행하면 이어 간다. 스스로 다시 시작하지 않는다.
- 한 문서에 작업 하나다. 같은 문서에 다른 프로세스(앱 포함)의 작업이 돌고 있으면 `document-job-running`으로 거절한다(`assertNoRunningJob`, EPUB이면 `suggestion`이 `epub status`를 가리킨다).
- 터미널 명령은 작업이 끝날 때까지 앞에서 돌고 진행을 stderr에 쓴다. Ctrl+C는 작업을 `interrupted`로 멈추고 답한다. MCP 도구는 작업을 서버 프로세스 안에 띄우고 바로 답한다(`trackBackgroundJob`). 서버가 끝나면 그 작업은 `interrupted`로 멈춘다.
- `epub translate`는 저장된 책 파일을 읽고 원본을 바꾸지 않는다. 결과 파일이 이미 있으면 `--force`가 있어야 하고, 원본과 같은 경로는 `invalid_argument`다. 번역하지 않는 책(DRM, 고정 배치, EPUB이 아님, 손상, 너무 큼, 고른 장에 글 없음)은 보내기 전에 종료 코드 1, `unsupported`와 `detail.reason`으로 거절한다. 앱의 편집 잠금은 앱 안에서 시작한 번역에만 걸리므로, 명령어는 앱에 열린 책도 디스크의 상태로 번역한다.
- 목표 언어가 `ar`, `he`, `hi`이거나 PDF가 암호화돼 있으면 `--format pdf`를 보내기 전에 거절한다(`PDF_UNWRITABLE_LANGUAGES`). 원본 PDF는 바꾸지 않는다.
- 필요 없는 상태 확인으로 벤더 프로그램을 띄우지 않는다. `subscriptionProvidersInPlay`가 결과를 바꿀 수 있는 제공자만 고르고, 없으면 상태 확인을 건너뛴다. 확인이 실패하거나 시간이 넘으면 연결되지 않은 것으로 본다.
- 구독 프로그램을 띄울 수 있는 프로세스는 끝날 때 그것을 끝낸다(`endSubscriptionChildrenWith`: `exit`와 `SIGHUP`·`SIGINT`·`SIGTERM`). 실제 요청을 실행하는 경우에는 강제 종료에 대비해 `dataDir`에 자식 기록도 남긴다. 앱의 다음 시작이 그 기록으로 정리한다.
- 로그인 정보를 다루지 않는다. 명령줄에는 자체 로그인이 없고 자격 증명을 저장하지 않는다. 종량 허용은 앱의 기록을 읽기만 하고(`write`는 아무것도 하지 않는다) 맞지 않는 동의는 "동의 안 됨"으로 보고 앱이 지우게 둔다.
- 결과 계약을 지킨다. 표준 출력의 JSON 봉투(`status`, `command`, `summary`, `output_path`, `detail`)와 종료 코드 0~4, 오류의 `error` 값(`ErrorReason`)은 프로그램이 분기하는 값이다. 이름을 바꾸지 않고 함부로 늘리지 않는다. 검색·이미지·미디어 실패는 종료 코드 4, `error: "app_unavailable"`, 원인은 `detail.errorCode`, 한도가 풀리는 시각은 `detail.resetsAt`이다. `read-url`(`read_url`)도 기존 `ErrorReason`만 다시 쓴다(`missing_argument`, `invalid_argument`, `unsupported`, `resource_limit`, `app_unavailable`). 이유는 `detail.reason`(`blocked`, `no_text`), `detail.errorCode`(`network`, `timeout`, `http_error`, `auth`)와 `detail.status`·`detail.max_bytes`로 알린다.
- 쓰기는 한 곳을 거친다. 출력 경로는 `src/fs.ts`에서 풀고, `GENOFFICE_ALLOWED_ROOTS`를 symlink를 푼 뒤 검사하고, 앱이 탭으로 열어 둔 파일은 `--force` 없이는 덮어쓰지 않는다. 파일은 같은 폴더의 임시 파일에 쓴 뒤 rename한다.
- 비밀 값은 감사 기록에 남기지 않는다. 기록은 실패해도 명령을 실패시키지 않는다.

## 이 모듈의 방식

- 명령은 `CommandDef` 하나다. `defaultRegistry()`에 등록하면 도움말, README 예시, 스킬 문서, MCP 도구가 같은 표에서 나온다. `tests/help-sync.test.ts`가 등록된 명령과 옵션이 `README.md`와 `skills/ieumoffice/SKILL.md`에 모두 나오는지 확인하므로, 옵션을 추가하면 세 곳을 함께 고친다.
- `slides read --comments`는 저장된 pptx의 클래식 메모를 페이지별 `comments`(`authorId`·`idx`·`작성자`·`시각`·`본문`)와 `hidden`으로 낸다. `--slide`·`--full`과 독립이고, 터미널 읽기는 다른 읽기 명령처럼 가리기를 적용하지 않는다.
- 스킬 본문을 고치면 `metadata.version`을 올린다. 스킬은 사용자의 에이전트 폴더로 복사되고 버전이 커질 때만 교체되기 때문이다(`npm run check:skill-version`).
- MCP 도구는 명령의 두 번째 구현이 아니다. 도구 호출을 명령줄 인자로 바꿔(`buildArgv`) 같은 명령을 실행한다. 인라인 값(ops, 명세, Markdown)은 임시 파일에 써서 경로로 넘긴다.
- 명령줄은 Electron 없이 앱의 userData를 찾는다(`genofficeUserDataDir`). AI 설정은 그 안의 `ai-settings.json`이고, 자동 호출의 잠금·장부와 종량 허용 기록은 같은 폴더에 둔다(`aiDataDir`). PDF 결과 보관소도 같은 폴더의 `pdf-store`다. 앱과 모든 명령줄 프로세스가 같은 폴더를 써야 차례가 하나로 지켜지고 보관된 결과를 함께 쓴다.
- 번역 PDF는 HarfBuzz의 `hb-subset.wasm`이 있어야 쓴다. 설치본에서는 `Resources/wasm/hb-subset.wasm`, 저장소에서는 `harfbuzzjs`의 것을 찾고, `GENOFFICE_HB_SUBSET_WASM`으로 바꿀 수 있다(`hbSubsetWasmPath`).
- 패키징: `build.mjs`가 전체를 CommonJS 파일 하나로 묶고, 설치된 앱은 그것을 `ELECTRON_RUN_AS_NODE=1`로 자기 실행 파일에서 돌린다(`bin/ieumoffice.cmd`). `node_modules`는 함께 배포되지 않는다. 번들의 버전은 `GENOFFICE_APP_VERSION`으로 주입되어 앱 버전과 어긋나지 않는다.
- 한글 엔진의 WASM은 번들에 들어가지 않는다. `rhwpWasmPath`(`src/resources.ts`)가 설치본의 `Resources/wasm`이나 체크아웃의 `node_modules`에서 찾아 `GENOFFICE_RHWP_WASM`으로 넘긴다. 번들 안에서는 `import.meta.url`이 비어서 읽는 쪽이 스스로 찾지 못한다.
- MCP 도구 목록 전체의 크기에는 상한이 있다(`tests/mcp.test.ts`, 91KiB). 도구를 더할 때는 설명과 옵션 설명을 짧게 쓴다.
- MCP 클라이언트는 셸 없이 프로세스를 띄운다. Windows에서 `.cmd`나 `cmd /c`를 등록하면 공백이 든 경로가 쪼개지므로, 등록하는 명령은 "앱 실행 파일을 Node로, 번들 CLI를 인자로"다(`src/mcp-launch.ts`). 이 파일은 순수 문자열 코드라 렌더러도 import한다.
- 에이전트 설정 파일은 키 하나만 쓰거나 지운다. `ieumoffice` 이름의 항목이 우리 실행기가 아닌 것을 가리키면 강제 옵션 없이는 바꾸지 않는다. JSON 설정은 다시 직렬화되고 TOML은 해당 표만 줄 단위로 바꾼다. symlink인 설정은 대상에 써서 링크를 보존한다.
- ODT(`src/formats/odt.ts`): `.odt`는 `odtToDocx`의 다리 docx로 열고(`openDocumentFile`이 `OpenDocument.odt`에 원본·다리 지도·보고를 둔다) `saveDocument`가 `saveOdt`로 원본에 좁게 되돌려 쓴다. 엔진 패키지(`@genoffice/odt-engine`)는 공개 API만 쓰고 고치지 않는다.
  - 꺼 둔 기능의 작업 목록은 `odtDisabledFeature` 한 곳에 있다(메모, 변경 내용, 목차, 수식 `<formula>`, 차트, 글상자, 워터마크, 다단 `set_page_setup.columns`, 그림 번호·상호 참조·인용 `insertField`). 거절 이유는 `unsupported`다. `--track`과 확장자가 다른 `--out`은 `docs apply`가 작업 전에 거절한다.
  - `OdtEditGuard`는 작업마다 앞뒤를 비교한다. 잠긴 칸(`isProtectedCell`, 셀 안 표는 바깥 칸)과 `odt-keep:` 자리 표시가 바뀌면 편집기 상태와 곁 상태를 되돌리고 `op_rejected`로 거절한다. 자리 표시를 통째로 지우는 것과 잠긴 칸 둘레의 행 추가는 된다. 격자 모양이 그대로면(칸 합치기·나누기 포함) 같은 자리에서 비교한다. 행만 또는 열만 바뀌었으면 앞뒤 행(열)을 맞춰 잠긴 칸이 옮겨 간 자리에서 비교한다(`movedLockedCell`). 둘 다 바뀌었을 때만 칸 지문의 개수로 본다.
  - `convert`의 ODT 경로는 docx를 거친다. 앱의 `--headless-export`는 `.odt`를 받지 않으므로 odt→pdf/html은 출력 폴더 안의 임시 폴더(`.ieumoffice-odt-*`)에 docx를 쓰고 끝나면(실패해도) 지운다. html→odt도 같은 임시 폴더를 쓴다. 변환 보고는 항목마다 `warnings[]`(`odt_converted`/`odt_dropped`)와 `detail.odt_report`로 낸다.
  - 암호 ODT는 종료 코드 2, `unsupported`와 암호를 풀라는 `suggestion`이다(`odtOpenFailure`). 기본 이유 `file_not_found`로 두지 않는다.
- 이 패키지는 `@genoffice/i18n`과 `@genoffice/electron-utils`를 import하지만 `package.json`의 `dependencies`에는 적혀 있지 않다(workspace 호이스팅에 기대는 기존 구조다).

## 테스트

- 실행: `npm run test -w @genoffice/cli`(또는 이 폴더에서 `npx vitest run`), `npm run typecheck -w @genoffice/cli`. 테스트는 `tests/helpers.ts`의 `run()`으로 `runCli`를 프로세스 안에서 부른다.
- 어떤 테스트도 벤더 프로그램이나 네트워크에 닿으면 안 된다. `tests/headless-tools.test.ts`처럼 `@genoffice/ai-provider/subscription`의 `detectSubscriptionLogin`과 키 제공자 호출을 `vi.mock`으로 바꾼다. 구독 경로에 닿을 수 있는 테스트는 도구나 이미지 생성기도 함께 바꾼다.
- `tests/upstream-coexistence.test.ts`는 원본 앱과의 공존을 고정한다. 등록·삭제·판정 코드를 바꾸면 "원본의 항목이 그대로 남는다"는 경우를 여기에 추가한다.
- 바꾸면 반드시 테스트하는 것: 설정 스위치 켬·끔·예전 판 동의에 따른 `capabilities`와 실제 명령의 답이 같은지, 한도 소진(`rate-limit`) 때 봉투의 `errorCode`·`resetsAt`, PDF 작업 명령의 예상만 답하기·요금 경로 거절·`--partial` 유무·이어하기·MCP가 바로 답하기·`pdf_status` 모양(`tests/pdf-ai-jobs.test.ts`, `tests/pdf-structure-commands.test.ts`), EPUB 번역 명령의 같은 것들과 `--chapters` 범위 오류·`unsupported` 이유·성공 `detail` 모양(`tests/epub-jobs.test.ts`), 허용 폴더 밖 경로와 symlink 우회, 앱이 열어 둔 파일 쓰기, 부분 적용 배치(`status: "partial"`).
- ODT 시험(`tests/odt.test.ts`, `tests/odt-convert.test.ts`)은 `packages/odt-engine/tests/helpers`의 합성 한컴 조각으로 파일을 만든다(`tests/odt-fixtures.ts`). 실제 파일은 넣지 않는다. 앱 경유 변환은 `exportViaApp`을 `vi.mock`으로 바꾼다.
- 저장소 검사 도구(`tools/check-no-genspark.mjs`, `tools/check-english-comments.mjs`)의 테스트도 이 폴더의 `tests/`에 있다.
- Windows에서는 원본에서 물려받은 테스트 여럿이 변경과 무관하게 실패한다. 이 PC에서 실패하는 파일은 `app-export`, `cli`, `cloud`, `control`, `errors`, `install`, `mcp-http`, `mcp-install`, `mcp`, `suggest`(모두 `tests/*.test.ts`)이다. 파일 권한 비트, POSIX 경로와 symlink, 준비 훅의 시간 제한 같은 전제가 Windows에서 맞지 않아서다. 이 파일들에서 새 실패를 봤다면 손대지 않은 체크아웃의 결과와 비교한다. CI는 Linux에서 돈다.
- `cli`·`errors` 테스트의 일부는 xlsx 사이드카 실행 파일이 필요하다. `XLSX_SIDECAR_PATH`로 빌드된 사이드카를 가리킬 수 있다.
- 실제 앱을 띄우는 변환과 실제 에이전트 설정 파일에 대한 등록은 자동 테스트로 돌리지 않는다. 테스트는 `GENOFFICE_HOME`·`GENOFFICE_USER_DATA`로 임시 폴더를 가리키게 해서 실제 홈 폴더를 건드리지 않는다.
