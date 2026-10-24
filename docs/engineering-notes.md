# 알아 두지 않으면 걸리는 것

## 빌드와 실행

- **편집기 뒷단을 고쳤는데 아무 변화가 없다.** `apps/*/src/main`의 코드는 껍데기 앱을 빌드할 때 함께 묶인다. 고친 뒤 껍데기 앱을 다시 빌드하지 않으면 예전 코드가 그대로 돈다. 오류도 나지 않는다. → `npm run build -w @genoffice/shell` 후 실행해 확인한다.
- **개발 모드에서 편집기 화면이 하얗다.** preload를 고치고 다시 빌드하지 않으면 낡은 preload가 실려 화면이 비어 나온다. → preload를 고쳤으면 다시 빌드한다.
- **설치본이 켜자마자 죽는다.** 앱의 `dependencies`에 넣은 작업 공간 패키지를 `externalizeDepsPlugin`의 `exclude`에 넣지 않았을 때다. 개발 모드에서는 멀쩡하다. → 둘을 함께 고친다.
- **`npm run lint`가 수천 건의 구문 오류를 낸다.** 저장소 안에 다른 작업 사본(작업 트리)을 두면 그 안의 tsconfig까지 읽혀서 그렇다. → 그 폴더를 빼고 돌린다(`npx eslint . --ignore-pattern "<폴더>/**"`).
- **`cargo`를 못 찾는다.** 이 PC에서는 Rust가 설치돼 있어도 PATH에 없다. → `export PATH="$HOME/.cargo/bin:$PATH"`.
- **설치 파일 만들기가 엑셀 처리 프로그램을 못 찾고 멈춘다.** 빌드 설정은 `apps/sheets/native/xlsx-engine/target/x86_64-pc-windows-gnu/release/xlsx-sidecar.exe`를 찾는데, 이 PC의 Rust 빌드는 `target/release/`에 만든다. → 만들기 전에 그 파일을 앞의 경로로 복사한다.
- **설치본(`release/win-unpacked`)을 띄우면 아무 창 없이 바로 끝난다.** 설치된 이음오피스가 켜져 있으면, 설치본은 같은 데이터 폴더와 단일 실행 잠금을 쓰므로 바로 끝나고 실행 인자를 켜져 있는 앱에 넘긴다. 설치본은 `GENOFFICE_USER_DATA`를 일부러 듣지 않는다. → 사용자의 앱을 끄지 말고 `--user-data-dir=<임시 폴더>`를 붙여 띄운다(Playwright `electron.launch`의 `args`에도 같다).
- **WebAssembly 파일을 찾는 코드가 개발 실행에서만 맞다.** 묶어 빌드한 코드 옆에는 `node_modules`가 없다. 단위 테스트는 `node_modules`에서 돌아 이 차이를 보지 못한다. → 새 WebAssembly 의존성은 `extraResources`로 `resources/wasm`에 넣고, 빌드한 앱(가능하면 설치본)에서 한 번 돌려 본다.
- **설치 파일 만들기가 GitHub에 올리려다 실패한다.** 빌드 설정에 릴리스 올리기 대상이 항상 들어 있다. → `npm run dist:win -- -- --publish never`. `--`를 두 번 써야 인자가 끝까지 전달된다.
- **새로 띄우는 창이 빈 채로 뜬다.** 껍데기 앱의 별도 창(드라이브 고르기, 문서 고르기)은 `apps/shell/electron.vite.config.ts`의 preload 목록과 renderer 입력 목록 양쪽에 넣어야 한다. 한쪽만 넣으면 화면이 비어 나오고 오류도 잘 보이지 않는다. → 개발 모드에서도 다시 빌드한 뒤 확인한다.
- **preload에서 `@genoffice/electron-utils` 루트를 가져오면 실행 직후 죽는다.** 루트 진입점은 Electron에 묶여 있다. 문서 고르기 다리(`doc-attach-bridge`)와 채널(`doc-attach-channels`)처럼 preload가 쓰는 모듈은 `package.json`의 `exports`에 하위 경로로 내보낸 것으로만 가져온다.
- **화면(renderer)에서 `@genoffice/file-parse`를 값으로 가져올 수 없다.** Node에 묶여 있다. 첨부할 수 있는 형식 목록을 화면에도 보여야 하면, 그림 확장자 목록처럼 각 앱의 몫으로 둔다. 값은 편집기마다 같게 맞춘다(결정 0035).

## 테스트

- **`npm test`가 첫 실패에서 멈춘다.** 작업 공간을 `&&`로 이어 돌리기 때문이다. Windows에서는 원본 코드 그대로도 실패하는 테스트가 있어(경로 구분자, 크롬 없음, 시간 초과), 한 번에 끝까지 가지 않는다. → 작업 공간별로 따로 돌리고(`npm run test -w @genoffice/<이름>`) 실패 목록을 이전 결과와 비교한다.
- **부하가 걸리면 시간 초과로 떨어지는 테스트가 있다.** 껍데기 앱의 `third-party-notices`, `update-resume`, `pdf2docx-local-argv`, 워드 엔진의 암호 해시·압축 폭탄 테스트, AI 연결부의 실제 프로세스 끝내기 테스트(`subscription-process`의 "really ends a child and the grandchild"), 엑셀 편집기의 `table-design-create`가 그렇다. → 여러 작업을 동시에 돌리던 중의 실패는 그 파일만 따로 돌려 본 뒤 판단한다.
- **마인드맵 화면 테스트가 CI에서만 가끔 실패한다(매번 다른 시험).** 엔진은 `.xmind`를 JSZip으로 읽고 쓰는데, JSZip은 일을 잘게 나눠 `setImmediate`로 이어 간다. `setTimeout(0)`을 정해진 횟수만 돌리는 기다림(`settle`)은 빠른 PC에서는 그 사이에 열기·저장이 끝나지만, 느린 CI에서는 끝나기 전에 시험이 확인을 시작한다. → 열기와 저장, 그림 읽기를 기다릴 때는 `apps/mindmap/tests/helpers/wait.ts`의 `until`로 그 상태("불러오는 중"이 사라짐, 저장이 넘어옴, 그림에 `blob:` 주소가 붙음)를 기다린다. 느린 PC는 시험 설정에서 `setImmediate`마다 몇 ms 늦춰 흉내 낼 수 있다.
- **`npx vitest run --root packages/pdf-structure`로 돌리면 `markdown-roundtrip.test.ts`가 파일째 실패한다.** 같은 파일을 패키지 폴더에서 돌리면 통과한다. 원인은 아직 보지 않았다. → `pdf-structure` 시험은 그 폴더에서 `npx vitest run`으로 돌린다.
- **엑셀 편집기 테스트가 Rust 빌드를 시작한다.** `npm run test -w @genoffice/sheets`는 먼저 엑셀 처리 프로그램을 빌드한다. → 필요 없으면 `apps/sheets`에서 `npx vitest run`을 쓴다.
- **Rust를 고쳤는데 테스트는 예전 동작을 본다.** 엑셀 처리 프로그램이 필요한 엑셀 편집기 테스트는 `native/xlsx-engine/target/release/`의 실행 파일을 직접 연다. `XLSX_SIDECAR_PATH`는 듣지 않고, `cargo test`는 그 실행 파일을 다시 만들지 않는다. → Rust를 고쳤으면 release 빌드(`npm run native:build -w @genoffice/sheets`)를 먼저 한다. 저장소의 다른 사본에서는 그 파일이 없어 이 테스트들이 돌지 않는다.
- **명령어 패키지의 엑셀 테스트가 아무것도 시험하지 않고 통과한다.** 엑셀 처리 프로그램을 찾지 못하면 그 테스트들은 조용히 건너뛴다. → 통과 수가 아니라 건너뛴 수를 본다.
- **구독 제공자로 가는 테스트는 진짜 프로그램을 띄운다.** 제공자가 `claude-code`나 `codex`로 정해지는데 연결부를 가짜로 바꾸지 않으면, 테스트가 사용자 PC의 실제 프로그램을 실행해 구독 한도를 쓴다. 테스트는 통과한 것처럼 보인다. → 연결부를 가짜로 바꾼 것을 확인한다.
- **AI에게 보내는 화면 시험은 진짜 프로그램에 닿을 수 있다.** 구독이 연결된 PC에서는 보내기 문지기가 통과해 시험이 실제 Claude를 부르고 한도를 쓴다. 연결이 없는 PC(CI)에서는 문지기가 막아 보낸 말이 화면에 나오지 않고 시험이 실패한다. → 보내는 시험은 편집기 화면이 뜬 뒤 `e2e/helpers.ts`의 `stubAiReady(app)`을 부른다. 구독 상태와 `ai:stream`을 가짜로 바꾸고 열린 탭에 그 상태를 알린다.
- **화면 시험의 제품 이름과 기본 저장 폴더는 `packages/i18n/src/product.ts`에서 읽는다.** 화면은 사전의 `GenOffice`를 제품 이름으로 바꿔 보이고, 기본 저장 폴더는 `Documents/<제품 이름>`이다. 홈의 새 문서 카드는 순번이 자주 밀리므로(한글, PDF 도구 카드가 더해졌다) 순번 대신 글자나 속성으로 집는다.
- **실제 화면 확인은 스크립트로 한다.** `e2e/helpers.ts`의 `launchShell`이 빌드된 껍데기 앱을 임시 데이터 폴더로 띄운다. 구독에 로그인된 PC에서는 첫 연결 안내가 설정과 질문 창을 덮으므로, 기본으로 "안내를 봤다"는 설정을 심는다(`subscriptionNoticeSeen: false`로 끌 수 있다). 편집기 화면은 `waitForPageWithUrl(app, '://docs/')`로 잡는다.
- **한 시험 파일이 통째로 시간 초과로 죽어도 다시 돌려 보라.** vite의 변환 캐시가 찬 상태에서 `apps/sheets/tests/table-design.test.ts` 같은 단위 시험이 기본 5초를 넘겨 `Test timed out`으로 떨어진다(문서화된 부하성 실패). 단독 재실행이나 캐시가 데워진 뒤에는 통과한다.
- **이 PC에서 화면 시험이 `launchShell`에서 멈춘다.** 창 녹화(Playwright의 Electron 화면 캡처)가 페이지 연결을 붙잡아, 앱이 뜬 뒤 아무 응답이 없다. → `E2E_NO_VIDEO=1`을 붙여 녹화를 끄고 돌린다. 시험 전의 `npm run build:all`은 엑셀 처리 프로그램을 빌드하므로 `cargo`가 PATH에 있어야 한다("빌드와 실행"의 `cargo` 항목).
- **화면 시험(e2e) 전체는 Windows에서 초록이 아니다.** 경로 구분자를 `/`로 가정하는 시험(`text-source` 등)과 화면 캡처·타이밍에 민감한 시험, 이 PC의 실제 설정을 읽는 시험(CLI 계열)이 **손대지 않은 검사본에서도 똑같이** 실패한다. 판정은 항상 "손대지 않은 사본에서도 실패하는가"로 한다. 같은 시험 파일 묶음을 원본 검사본에서 한 번 돌려 실패 목록을 견주면 된다.

## 설정 파일

- **`providers` 표가 없는 설정 파일은 "예전 파일"로 읽힌다.** `ai-settings.json`에 `providers`가 없으면 제공자 설정 이전의 파일로 보고 기본값을 돌려준다. 이때 같은 파일에 적어 둔 다른 값(종량 허용, 첫 연결 안내를 봤는지)도 함께 버려진다. → 설정을 쓸 때는 정리된 전체 설정을 쓴다. 값 하나만 든 파일을 쓰지 않는다. 시험용으로 심을 때도 `{ "providers": {} }`를 넣는다.
- **화면이 보낸 설정에 모르는 제공자 식별자가 있으면 거절된다.** 저장된 파일의 모르는 식별자는 조용히 기본값으로 읽히지만, 화면에서 뒷단으로 보내는 요청에서는 잘못된 설정으로 거절된다. 화면은 정리된 설정만 읽으므로 평소에는 만나지 않는다.
- **제공자 선택을 바꿀 때는 저장된 사본을 먼저 읽는다.** 모델 목록과 "…로 계속" 버튼은 그 순간 저장된 설정을 읽어 선택값만 바꿔 쓴다. 화면이 들고 있던 낡은 사본을 통째로 쓰면 다른 창에서 바꾼 값이 되돌아간다.

## 웹 읽기 (`read_url`)

- **같은 주소를 다시 읽었는데 바뀐 글이 보이지 않는다.** `read_url`은 받은 글을 프로세스 메모리에만 3분 동안, 최종 주소(리다이렉트 뒤)와 요청 주소로 찾아 둔다(8개까지). 명령줄·MCP는 프로세스마다 캐시가 따로다. → 3분이 지나거나 프로세스를 다시 띄우면 새로 받는다. 캐시는 디스크에 쓰지 않는다.
- **`fetchWithSsrfGuard`가 주소 거절과 호출자 취소를 모두 `null`로 돌려준다.** 가드는 `signal`이 끊겼을 때도, 사설·루프백 주소를 거절할 때도 `null`을 준다. → 어느 쪽인지는 호출자가 따로 본다. `read_url`은 30초 deadline과 호출자 signal을 `AbortSignal.any`로 함께 넘기고, deadline이 끊겼으면 `timeout`, 호출자 쪽이면 취소로 답한다.
- **리다이렉트를 따라가면 머리글이 다음 홉에도 그대로 간다.** `headersForHop`을 주지 않으면 첫 요청에 준 `headers`가 모든 홉에 붙는다. → 홉마다 달라야 하는 비밀 값은 `headersForHop`으로 그 호스트의 홉에만 준다. `read_url`의 GitHub 토큰은 `api.github.com` 홉에만 실린다.
- **`ai-settings.json`의 키가 `sealed:v1:…`로 보인다(Windows, 키링이 있는 Linux).** 앱이 운영체제 암호화로 봉인한 것이다(결정 0063). → 평문으로 바꿔 적어도 읽히고 다음 저장 때 다시 봉인된다. 다른 PC·계정에서 가져온 파일, Windows에서 데이터 폴더의 `Local State`를 지운 뒤의 파일, Linux에서 키링 항목을 지운 뒤의 파일은 풀리지 않아 빈 키가 된다. 키를 다시 넣는다.
- **Linux에서 키가 봉인되지 않고 평문으로 남는다.** Electron이 고른 저장소가 `basic_text`(키링 없음, 알아보지 못한 데스크톱)이면 일부러 봉인하지 않는다(`platformSeals`). → 의도된 동작이다. 프로그램에 박힌 키로 감싼 값은 보호가 아니다.
- **Linux에서 명령줄이 봉인된 키를 못 푼다.** 명령줄이 띄운 앱이 데스크톱 세션의 키링에 닿지 못하면(SSH 접속, `XDG_CURRENT_DESKTOP`이 없는 환경) 다른 저장소를 골라 풀지 못하고 빈 키가 된다. → 데스크톱 세션의 터미널에서 실행하거나 환경 변수 키(`SERPER_API_KEY` 등)를 쓴다.
- **명령줄이 봉인된 키를 읽을 때 1~2초 멈춘다.** 앱을 창 없이 `--reveal-ai-secrets`로 띄워 풀기 때문이다. 설정 파일마다 프로세스당 한 번이다. → 시험에서 이 길을 타지 않으려면 설정 픽스처에 평문 키를 넣는다. 풀기 길을 시험할 때는 `cliSecretCodec`의 `spawn`을 바꾼다.
- **설정을 디스크에 쓰는 새 길을 만들면 `sealAiSecrets`를 거친다.** 거치지 않으면 그 저장이 키를 평문으로 되돌린다. 읽기는 `resolveAiSettings`가 풀어 주므로 따로 할 일이 없다.

## 구독 프로그램

- **Claude가 이미 실행한 편집을 또 요청한다.** Claude는 차례마다 새로 띄우고, 대화 전체를 사용자 글 한 덩어리로 읽는다. 작은 모델은 이때 맨 앞의 사용자 요청에 다시 답하면서 이미 실행된 도구 호출을 또 요청하곤 한다(실제로 문단 하나가 네 번 들어갔다). → 도구 결과 사건마다 "이 호출들은 이미 한 번 실행됐다, 다시 요청하지 말라"는 안내를 그 사건의 한 항목(`note`)으로 넣는다(`AFTER_TOOL_RESULTS`).
- **안내 글을 대화 끝에 따로 붙이면 구독 한도를 더 쓴다.** 제공자 쪽 캐시는 블록 목록의 앞부분이 지난 차례와 똑같을 때 재사용된다. 안내를 맨 끝의 별도 블록으로 붙이면, 다음 차례에는 그 자리에 새 사건이 와서 앞부분이 달라지고 도구 목록 전체를 매 차례 새로 읽게 된다. → 차례마다 달라지는 글을 사건 블록들 뒤에 두지 않는다. 앞 차례의 블록 목록은 다음 차례 목록의 앞부분과 글자 그대로 같아야 한다.
- **Claude가 정해 준 구조 대신 글만 답한다.** 도구 호출이 끝난 뒤의 마지막 차례에 모델이 구조 없이 "done" 같은 글만 내는 일이 있다. 이것을 구조 오류로 다시 시도시키면 같은 답이 반복돼 실행이 오류로 끝난다(실제로 그랬다). → 중괄호가 하나도 없는 답은 도구 호출 없는 글로 받는다(`parseClaudeCodeTurn`). 중괄호가 있는데 해석되지 않는 답만 다시 시도한다.
- **Claude의 내장 도구를 꺼도 도구가 남는다.** 도구를 끄는 옵션만으로는 사용자 설정의 MCP 연결이 딸려 온다(이 PC에서 63개). → 설정 원천을 비우고 MCP 설정을 엄격 모드로 주고, 그래도 프로그램이 보고한 목록을 확인한다.
- **Claude의 시작 알림은 첫 사용자 글이 들어간 뒤에야 온다.** 그래서 도구 0개 확인은 첫 글을 보낸 뒤에 이루어진다. 목록이 비어 있지 않으면 모델 출력을 쓰기 전에 끝낸다. Windows에서 프로세스 끝내기는 비동기라, 끝내는 것과 프로그램의 첫 동작 사이에 틈이 있다.
- **Claude 사용량의 초기화 시각은 초 단위다.** 화면으로 올릴 때 밀리초로 바꾼다.
- **Codex에 모델을 주지 않으면 사용자 설정의 모델로 간다.** 이 PC의 Codex 설정은 로컬 중계 서버를 가리키고 있어 요청이 400으로 실패했다. → 연결부가 주소와 제공자를 덮어쓰고, 모델이 비어 있으면 Codex에 모델 목록을 물어 기본 모델을 직접 지정한다.
- **맥에서 ChatGPT·Codex 앱에는 새 모델이 보이는데 이음오피스에는 없다.** ChatGPT 데스크톱 앱과 Codex CLI는 서로 다른 버전일 수 있고, 모델은 계정·클라이언트·배포 시점에 따라 열린다. → macOS에서도 데스크톱 앱이 든 CLI(`/Applications/Codex.app/Contents/Resources/codex`, `ChatGPT.app`)를 찾아 PATH의 사본과 비교해 더 최근에 쓰인 것을 쓴다. 그래도 목록이 낡았으면 모델 선택기를 열 때 2분에 한 번 다시 확인한다. 사용자가 다른 사본을 쓰려면 설정의 `cliPath`로 고른다.
- **Codex 기능을 끄려고 `--disable <이름>`을 쓰면 안 된다.** 모르는 이름이 하나라도 있으면 Codex가 시작하지 않는다. → `-c features.<이름>=false`를 쓴다.
- **Codex의 오류 알림은 실패가 아닐 수 있다.** 경고에도 같은 알림이 온다. 성공과 실패는 실행 결과로 판단한다.
- **Codex 프로세스는 요청이 없어도 잠깐 떠 있다.** 상태 확인이 계정 종류를 읽으려고 `app-server`를 띄운다. Claude만 쓰는 사람의 PC에서도 Codex 프로세스가 보일 수 있다. 2분 동안 쓰지 않으면 끝나고, 앱을 끄면 함께 끝난다.
- **사용자가 업데이트했다는데 카드는 계속 버전이 낮다고 한다.** 앱이 찾는 것은 Windows 쪽 사본뿐이다(PATH, `~\.local\bin`, `%APPDATA%\npm`, WinGet). WSL(Ubuntu) 터미널에서 `claude update`를 하면 리눅스 안의 사본만 바뀌고, 예전에 Windows에 깔아 둔 사본은 그대로다. 실제로 이런 신고가 있었다(WSL 2.1.305, Windows 2.1.114). → 카드에 보이는 경로의 사본을 Windows PowerShell에서 업데이트하게 안내한다. npm으로 깐 사본이면 `npm install -g @anthropic-ai/claude-code@latest`도 된다.
- **껍데기 파일(`.cmd`)은 셸 없이 실행되지 않는다.** npm으로 설치한 프로그램은 `%APPDATA%\npm`의 `.cmd`다. 셸을 켜면 사용자 글이 명령으로 해석될 수 있다. → 껍데기 뒤의 실제 파일을 찾아 직접 실행한다. `%APPDATA%\npm`은 앱이 물려받은 PATH에 없을 수 있으므로 따로 찾아본다.
- **표준 입력을 열어 둔 채 기다리게 하면 안 된다.** Claude는 3초를 버리고 Codex는 끝없이 기다린다.
- **구독으로 받는 답은 몇 초 늦게 시작한다.** 프로그램이 먼저 켜져야 한다. 이 PC에서 Claude(가장 작은 모델)의 첫 글자까지 3.5초에서 4.5초 사이였다.
- **앱의 프록시 설정은 구독 프로그램에 전달되지 않는다.** 프로그램은 물려받은 환경의 프록시 변수만 본다. Windows 설정에만 둔 프록시는 닿지 않는다.

## PDF

- **인쇄물에 형광펜·메모가 들어가거나 빠진다.** PDF.js `page.render`의 `annotationMode`는 기본값이 `ENABLE`(1)이라 따로 주지 않으면 주석이 인쇄물에 그려진다. 인쇄 창의 "주석 포함"을 끌 때만 `DISABLE`(0)을 넘긴다. 이 값을 `undefined`로 두고 "꺼졌다"고 착각하면 형광펜이 그대로 인쇄된다.
- **"페이지에 굽기"는 PDFium의 `FPDFPage_Flatten(page, 0)`을 쓴다.** 페이지의 모든 주석과 입력란을 내용 스트림에 넣고 주석 객체를 지운다. 결과는 주석을 그리지 않는 뷰어에서도 보이지만, 주석을 다시 고칠 수 없고 입력란도 함께 굳는다. 주석이 없는 페이지는 건드리지 않는다. 원본이 아니라 "다른 이름으로 저장" 사본에만 부른다.
- **"주석 빼기"는 링크와 입력란을 남긴다.** `annot-strip.ts`의 `stripCommentAnnotsBytes`가 메모·형광펜·그리기·도장만 지운다. 링크와 위젯까지 지우는 PDF 도구의 "주석 한꺼번에 지우기"와 종류가 다르다.
- **"받아들이고 저장"이 방금 받아들인 형광펜을 빠뜨린다.** 받아들이기는 markups를 state에 넣지만, 같은 클릭에서 `save()`를 부르면 그 `save`는 이전 렌더의 markups를 들고 있다. → 받아들이기 뒤 `acceptSaveRequest`를 올리고, 새 렌더가 끝난 뒤의 effect에서 `saveRef.current`로 저장한다. `accepted`는 그 저장이 성공한 뒤에만 쓴다.

## ODT

- **한컴 ODT는 표준 검사기에서 처음부터 오류가 난다.** 한컴이 쓴 ODT는 `mimetype`이 맨 앞이 아니고 압축돼 있으며, `office:version`이 없고 스키마 오류도 있다. → ODF 검사기로는 "우리가 새 오류를 만들지 않았다"만 본다. 받은 파일의 오류는 고치지 않는다. 합격 여부는 한컴 한글 2024가 읽은 결과로 정한다.
- **한컴 ODT의 표는 대부분 글상자 안에 있다.** 표의 60%가 글자처럼 놓인 틀(`draw:frame` > `draw:text-box`) 안이다. 문단마다 자동 스타일과 탭 위치 목록이 붙고, 제목 요소(`text:h`)는 거의 없다. 누름틀은 `NormalField…` 이름의 책갈피다. → ODT를 읽는 코드는 이 모양을 기본으로 가정한다. 글상자 안의 표를 글자로 납작하게 읽으면 한컴 문서의 표 대부분을 놓친다.
- **한컴의 `draw:equation`은 수식이 아니다.** 도형의 계산식이다. 한컴 수식 개체는 `draw:object`로 온다.
- **`<table:table\b`로 표를 찾으면 행과 칸까지 걸린다.** `\b`는 `-` 앞에서도 끊겨 `table:table-row`에 맞는다. → `<table:table(?=[\s>/])`처럼 다음 글자를 정한다.
- **한컴을 자동으로 돌릴 때 ODT 저장 형식 이름은 `"ODF"`다.** `"ODT"`는 실패한다(`hwp.SaveAs(path, "ODF", "")`, 한글 2024 공식 자동화). docx로 저장하는 형식 이름은 찾지 못했다.
- **암호 ODT는 시험 파일도 만들 수 없다.** 한컴은 암호 ODT를 만들지 못하고, 다른 곳에서 만든 암호 ODT를 열려고 하면 멈춘다. 그래서 이음오피스도 암호 ODT는 열지 않고 "암호를 푼 뒤 다시 열어 달라"고 알린다.
- **ODT 문서를 저장한 뒤에도 되돌려 쓰는 기준은 연 때의 ODT다.** 방금 저장한 ODT로 기준을 다시 만들면 ODF 쓰기가 만든 모양이 편집 화면과 달라(굵게, 글자 크기, 문단 나누기) 화면이 다시 그려지고 되돌리기 기록이 지워진다. 편집기의 비교 기준만 docx 문서처럼 옮긴다.
- **한컴은 ODT의 줄 간격을 다른 숫자로 보여 준다.** 한컴은 ODF의 비율 줄 간격에 글꼴별 배수를 곱해 읽는다(`115%` → SimSun 150%, Calibri 183%, Times New Roman 194%). 한컴이 자기 문서를 ODT로 낼 때는 반대로 나눠 쓴다(한글 160% → `117%`). 그래서 새 ODT를 한컴에서 열면 줄 간격 숫자가 docx와 다르고, 라틴 글이 대부분인 문서는 쪽 수가 늘어난다. 같은 docx를 한컴이 직접 열어도 쪽 수가 거의 같이 늘어난다. → 표준값(docx 값 그대로)을 적는다. 한컴에 맞춘 보정값은 LibreOffice 등에서 줄 간격을 좁히므로 쓰지 않는다(사용자 결정, 2026-10-16).
- **한컴 확인 도구는 `tools/odt-hancom/`에 있다.** 받은 ODT를 고친 사본 만들기, 한컴으로 읽어 쪽·표·개체·누름틀·서식 적기, ODF 검사, 판정까지 한다(사용법은 그 폴더의 `README.md`). 한컴 한글 2024가 설치된 Windows에서만 돈다.
- **확인 자료는 저장소 밖에 있다.** 한컴·정부 ODT와 시험용 docx, 한컴이 읽은 기준값은 `E:\github\odt-corpus`에 있다. 정부 문서에는 개인정보가 있어 저장소에 넣지 않는다.

## PDF 분석(`pdf2docx`)

- **줄 끝 하이픈으로 나뉜 단어가 "clas sification"처럼 띄어 나온다.** PDFium은 줄 끝 하이픈을 제어 문자 0x02(IsHyphen)로 준다. 깨진 글자를 지우는 제어 문자 필터가 이것까지 지우면 줄 묶기의 하이픈 판정이 볼 글자가 없어, 두 줄이 띄어쓰기로 이어진다. → 필터는 하이픈 표시를 남긴다(결정 0058). 손으로 만든 글자로 하는 시험은 이 필터를 거치지 않으므로, 추출 단계가 걸린 동작은 PDF로 시작하는 시험으로 지킨다.
- **InDesign으로 짠 오른쪽이 들쭉날쭉한 단은 다음 단어가 들어갈 자리를 남기고 줄을 넘긴다.** 문단 전체를 보고 줄을 나누는 조판기라서, 한 줄씩 채우는 줄바꿈을 가정한 규칙(짧은 줄이면 문단 끝, 남은 자리에 다음 단어가 들어가면 목록 항목 끝)이 산문을 줄마다 끊는다. 미국 통계 보고서에서 2em 안팎의 차이가 열 줄에 하나꼴로 나왔다. → 그런 규칙은 결정적인 차이(3em 넘게)나 되풀이를 요구하고, 같은 굵기의 소문자로 이어지는 줄은 같은 문단으로 읽는다.
- **분석 규칙을 바꾼 뒤에는 실제 문서의 블록 구조를 고치기 전과 비교한다.** 합성 시험은 겨냥한 모양만 본다. 공개 PDF 몇 개를 `extractIrDocument`로 돌려 블록마다 쪽·줄 수·글을 적고, 고치기 전 코드로 같은 것을 만들어 `diff`한다. 고치기 전의 여러 줄 블록이 새 결과의 어느 블록 안에 그대로 있는지 보면, 합쳐지기만 했는지 쪼개진 것도 있는지 바로 보인다.

## 한글(HWP·HWPX) 호환

- **한글은 스키마와 다르게 저장하는 곳이 있다.** 결정 0024·0026·0027·0028이 그런 곳을 하나씩 찾아 고친 기록이고, Filee(v1.11.0)의 HWPX writer 문서는 같은 종류를 다섯으로 정리해 두었다(https://github.com/KnifeLemon/Filee/blob/v1.11.0/docs/ENGINES.md). 아래 표가 둘을 합친 점검표다. rhwp를 올리거나 저장 직렬화를 고치거나 HWPX 쓰기를 새로 만들 때 "미확인"부터 본다. 확인은 `tools/odt-hancom/hancom.py look`(한컴 한글 2024가 어떻게 읽는지)과 저장 왕복 절차로 한다(결정 0038).
- **Filee 항목 다섯은 아직 우리 저장 결과에서 직접 확인하지 않았다(2026-10-18).** 채우는 것은 rhwp 버전 업이나 저장 쪽 변경 때 함께 한다. Filee는 자기 생성물을 rhwp·Unhwp·LibreOffice 세 리더로 다시 읽어 확인한다 — 독립 리더 여럿으로 견주는 방식은 이 저장소의 한컴 판독과 같은 취지다.

| 버릇                             | 내용                                                                                             | 이 저장소 현황                                      | 확인 방법                                     |
| -------------------------------- | ------------------------------------------------------------------------------------------------ | --------------------------------------------------- | --------------------------------------------- |
| 문단 여백·고정 줄 간격 이중 기록 | Filee: `hp:default`에 값을 두 배로 겹쳐 쓰고 실제 값은 `hp:case`에 둔다                          | 미확인                                              | 저장한 HWPX의 `hp:case`와 한컴 판독의 줄 간격 |
| 용지 돌리기                      | Filee: width·height는 항상 세로 값으로 쓰고 가로는 `landscape="NARROWLY"`로 표시한다             | 미확인                                              | 왕복 코퍼스의 가로 문서와 `look.json`의 용지  |
| 행잉 문단                        | Filee: 첫 줄은 `left`로, 나머지 줄만 들여쓰기로 적는다                                           | 미확인                                              | 들여쓰기 있는 샘플의 한컴 판독                |
| 개체 오프셋                      | Filee: 여백으로 나간 개체는 부호 없는 값으로, 용지 기준으로 옮겨 적는다                          | 미확인                                              | 여백에 걸친 그림·표 샘플                      |
| 조판 캐시                        | Filee: 표 행 높이·인라인 탭 폭 같은 캐시를 추정해 써 둔다(한컴이 캐시를 그대로 쓰는 경우가 있다) | 미확인                                              | 쪽 수·표 높이를 한컴 판독과 견주기            |
| 구역 뒤 바탕쪽·메모              | 결정 0024: rhwp 0.8.7이 고친 구역을 다시 쓸 때 목록 일부를 빠뜨려 한컴이 열지 못한다             | 고침(저장 때 원본에서 다시 붙임)                    | `apps/hwp/tests/section-tails.test.ts`        |
| 새 탭 폭                         | 결정 0026: rhwp가 새 탭에 폭 0을 쓴다                                                            | 고침(저장 때 측정값을 써 넣음)                      | `apps/hwp/tests/tab-widths.test.ts`           |
| 필드 여는 글자 종류              | 결정 0026: rhwp가 여는 글자를 `%unk`로 다시 써서 메모가 메모로 읽히지 않는다                     | 고침(제어 기록의 종류로 되돌림)                     | `apps/hwp/tests/field-kinds.test.ts`          |
| 수식 캡션                        | 결정 0028: 엔진이 수식 제어 기록 아래의 캡션 목록을 쓰지 않는다                                  | 고침(저장 때 다시 붙임)                             | `apps/hwp/tests/section-tails.test.ts`        |
| 변경 추적 두 번째 본문           | 결정 0027: 두 번째 본문(ViewText)을 그대로 읽고 쓰면 한컴이 열지 못한다                          | 처리(지금의 내용으로 열고, 저장하면 추적 기록 없이) | `apps/hwp/tests/tracked-changes.test.ts`      |

### 한글 엔진 빌드(`vendor/rhwp-core`, 결정 0050)

- **한글 문서의 겹침이 한컴과 다르다.** 먼저 엔진만으로 그려 본다(`@rhwp/core`의 `renderPageSvg`, 또는 같은 태그의 rhwp 명령줄 `export-svg`·`dump-pages`). 엔진에서도 겹치면 편집기 문제가 아니라 조판이다. 한컴 쪽은 `HWPFrame.HwpObject`의 `CreatePageImage(경로, 쪽(0부터), 96, 24, "bmp")`로 그림을 받아 견준다. png를 달라고 해도 bmp로 쓴다.
- **문서에 저장된 줄 위치가 한컴 화면과 다를 수 있다.** 예전 버전의 한글이나 다른 도구가 저장한 줄 정보가 남아 있으면, 한컴 한글 2024는 열 때 다시 나누고 rhwp는 저장된 것을 따른다. 저장된 줄 위치를 정답으로 삼기 전에 한컴으로 다시 저장해 줄 정보가 바뀌는지 본다.
- **`wasm-opt`가 "액세스가 거부되었습니다"로 멈춘다.** wasm-pack이 받아 둔 wasm-opt 파일이 깨졌거나 잠긴 것으로 보인다. → `%LOCALAPPDATA%\.wasm-pack\.wasm-opt-*`를 지우고 다시 돌린다.
- **패치가 적용되지 않는다.** Windows의 `core.autocrlf=true`로 받은 사본은 줄 끝이 CRLF라 패치와 맞지 않고 `cargo fmt` 검사도 깨진다. → 빌드 스크립트는 `-c core.autocrlf=false`로 받는다. 손으로 rhwp 사본을 만들 때도 같게 한다. Git Bash에서 sparse 패턴(`!/samples/`)을 넘길 때는 `MSYS_NO_PATHCONV=1`이 필요하다.
- **WASM에 빌드한 PC의 사용자 폴더가 들어간다.** 크레이트의 panic 위치 문자열에 cargo 레지스트리 경로가 남는다. → 스크립트가 `--remap-path-prefix`로 `/cargo`, `/rhwp`로 바꾸고, 빌드 뒤 사용자 폴더 이름이 남았는지 검사한다.
- **한글 편집기에서 글자를 칠 때 무겁다(결정 0054).** 키 하나에 편집기는 보이는 쪽을 다시 그리고(`refreshPages`), 문서 전체에서 캔버스 측정 요청을 모은다(`prepareCanvasMetrics` → 엔진 `collectCanvasMetricRequests`). 앱 쪽의 저장 상태 확인(`commands.context()`)과 AI 창의 선택 조회는 한 번에 0.05ms 아래라 원인이 아니다. → 비용은 CDP `Profiler`로 본다. `Performance.getMetrics`의 `ScriptDuration`은 마이크로태스크 안에서 도는 WASM 시간을 빼고 세서 실제보다 훨씬 작다. 한 문단에 계속 치면 문단이 길어져 키마다 비용이 커지므로, 경우끼리 견줄 때는 회차마다 새 문단에서 친다. 한글 조합은 CDP의 `Input.imeSetComposition`·`Input.insertText`로 흉내 낼 수 있고, 조합 갱신마다 영어 한 글자와 같은 일을 한다.
- **한글 탭에 한 글자를 치고 바로 닫았더니 저장 확인 없이 닫혔다(결정 0054 이전).** 메인은 닫을 때 렌더러가 알려 둔 저장 상태 사본만 보는데, 렌더러는 키를 친 50ms 뒤에야 편집기에 물어 알렸다. 빈 문서에서는 6번 모두 재현되고, 큰 문서는 편집기가 느려 우연히 피했다. → 저장 상태는 플러그인이 편집과 같은 작업에서 쏘는 알림(`DIRTY_EVENT`)으로 받는다. 확인은 빌드한 앱에서 문서를 새로 열 때마다 한 글자 치고 바로 닫아 본다(이미 고친 문서는 늘 확인 창이 떠서 시험이 되지 않는다).
- **작업 사본에서 엔진이 npm 0.8.7로 풀린다.** 사본의 `node_modules/@rhwp/core`가 본 검사본의 npm 패키지를 가리키는 연결이면 시험과 빌드가 패치 전 엔진을 쓴다. → 사본의 `node_modules/@rhwp`를 실제 폴더로 두고 `core`만 사본의 `vendor/rhwp-core`로 연결한다. 사본을 지우기 전에는 이 연결부터 끊는다.

## 에이전트 모드

- **Claude의 권한 요청이 앱에 오지 않고 "This command requires approval"로 끝난다.** `--permission-prompts host`만으로는 표준 출력으로 오지 않는다. → `--permission-prompt-tool stdio`를 함께 준다. 그러면 `control_request`(`can_use_tool`)로 오고, `{ behavior: 'allow', updatedInput }` 또는 `{ behavior: 'deny', message }`로 답한다.
- **`--restricted`를 켜면 사용자 스킬이 하나도 실리지 않는다.** `--setting-sources user`를 줘도 같다. 반대로 `--restricted` 없이 사용자 설정을 읽게 하면 모델을 부르기 전에 사용자 훅이 실행된다. → 스킬 폴더를 복사한 플러그인을 `--plugin-dir`로 준다.
- **디렉터리 연결(junction)로 붙인 스킬의 스크립트가 막힌다.** `blockReadsOutsideWorkingDirectories`가 연결을 실제 위치로 풀어 "작업 폴더 밖"으로 본다. → 복사하고, 그 폴더를 `--add-dir`로 준다.
- **Claude `auto` 모드가 `--model haiku`에서 `default`로 내려간다.** `auto`는 지원하는 모델에서만 켜진다. 시작 요청의 `current_permission_mode`로 확인할 수 있다(모델 호출 없음).
- **Codex 권한 프로필이 "elevated Windows sandbox requires effective `:root` read access"로 시작하지 않는다.** 기본 격리(권한 상승 방식)는 `:root` 읽기가 있어야 하고, 큰 폴더(`~/.codex`)를 막으면 처음 80초, 그 뒤 19초가 걸리거나 `thread/start`가 끝나지 않는다. → MXC 격리(`-c windows.sandbox="mxc"`)를 쓴다. MXC는 `{ ':minimal': 'read', <PATH의 프로그램 폴더>: 'read', <프로젝트>: 'write', <열린 문서>: 'read', <보호 폴더>: 'deny' }`를 1~3초에 받는다. 막는 값은 `deny`다(`none`이 아니다). 드라이브 루트(예: `G:\`)를 읽기로 주면 MXC가 거절하므로 PATH에서 뺀다. 격리 확인은 모델 호출 없이 `codex sandbox -c windows.sandbox='mxc' -c default_permissions=... -c permissions.<이름>.filesystem=... -- cmd /c ...`로 한다. PowerShell 5.1은 네이티브 인자의 큰따옴표를 지우므로 TOML 값은 작은따옴표 문자열로 쓴다.
- **Codex `on-request`에서 허락한 명령이 격리 밖에서 돈다.** 모델이 격리 밖 실행을 요청하고 승인 요청이 오는데, 요청에는 그것을 가리는 표시가 없다(`reason`만 붙는다). `untrusted`에서 허락한 명령은 격리 안에서 돈다. → 묻는 방식은 `untrusted`만 쓰고, `thread/start` 응답의 `approvalPolicy`가 요청과 같은지 본다. 승인 요청의 `availableDecisions`에 `decline`이 없을 수 있다. 그때는 `cancel`로 거절한다.
- **"믿고 맡기기"(승인 정책 `never`)에서 Codex가 앱 MCP 도구를 묻지 않고 거절한다.** `never`는 확인 요청을 보내지 않고 거절로 처리한다. → 앱 서버 설정에 `default_tools_approval_mode = "approve"`를 준다(값은 `auto`·`prompt`·`writes`·`approve`).
- **격리 시험의 `findstr` 출력에서 경로가 깨진다.** `findstr`는 경로를 콘솔 코드 페이지로 내보내므로, 사용자 폴더 이름이 한글이면 UTF-8로 읽은 경로가 원래 경로와 다르다. → 표식 파일 이름(ASCII)으로만 판정한다.
- **Codex가 앱 MCP 도구를 "user rejected MCP tool call"로 바로 실패시킨다.** 도구를 부르기 전에 `mcpServer/elicitation/request`(`_meta.codex_approval_kind: "mcp_tool_call"`, 빈 양식)로 확인을 받는데, 모르는 요청으로 거절하면 이렇게 된다. → 앱 서버의 그 요청에만 `{ action: 'accept', content: {}, _meta: null }`로 답한다. 프로토콜 전체는 `codex app-server generate-ts --out <폴더>`로 받아 볼 수 있다.
- **Codex 파일 변경 승인 요청에는 경로가 없다.** 앞서 오는 `item/started`(`fileChange`의 `changes[].path`)에서 기억해 둔다.

## 무료 연결

- **Gemini 무료 등급이 Flash 모델을 "수요 많음(503)"으로 거절한다.** 2026-10-14 시험에서 3.5~3.8 Flash가 번갈아 거절됐고, 작은 요청은 가끔 통과해도 앱의 실제 요청(약 1만 6천 토큰)은 두 번 다 거절됐다. `gemini-3.5-flash-lite`는 매번 답했다. → 무료 연결은 Flash-Lite로 시작한다. 503은 앱이 두 번까지 다시 보내지만 길게 막히면 소용없다.
- **Gemini의 예전 모델은 새 사용자에게 열려 있지 않다.** `gemini-2.5-flash`는 "no longer available to new users"(404)를 낸다. 3.1 Pro 미리보기는 무료 한도가 0이라 바로 429다.
- **OpenRouter의 어떤 무료 모델은 등록된 앱에서만 열린다.** `thinkingmachines/inkling:free`는 "only available on agentic harnesses"(403)를 낸다. 무료 모델 목록에 넣기 전에 실제 키로 도구 호출을 한 번 시험한다.
- **도구 호출을 지원한다고 나온 무료 모델도 앱에서는 실패한다.** 2026-10-15 시험에서 도구 하나짜리 짧은 요청은 대부분 통과했지만, 워드 편집기에서 두 요청(문단 넣기, 제목 바꾸고 요약 목록 넣기)을 끝까지 해낸 것은 `nvidia/nemotron-3.5-lightning:free`와 `dots-studio/dots-3-note-preview:free`뿐이었다. `cohere/north-mini-code:free`는 두 번째 요청에서 모델을 계속 부르며 4분 넘게 끝내지 않았고, `poolside/laguna-s-2.1:free`와 `google/gemma-4-26b-a4b-it:free`는 제공 회사가 혼잡(429)으로 자주 거절했고, `nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free`는 한 번 답하는 데 59초가 걸렸다. → 목록에는 앱에서 두 요청을 모두 해낸 모델만 넣는다. 시험은 `npm run free-models:trial`이다(`docs/operations.md`의 "무료 모델 점검". 실제 키와 무료 요청을 쓰므로 평소 검사에 넣지 않는다).
- **`process.exit()`로 끝낸 도구 스크립트가 Windows에서 비정상 종료한다.** `fetch` 직후 `process.exit()`을 부르면 Node가 `Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)`로 죽고 종료 코드가 127이 된다. → 네트워크를 쓴 뒤에는 `process.exitCode`만 정하고 끝까지 흘러가게 둔다.
- **OpenRouter의 하루 무료 요청 수는 모델 호출 수다.** 문서를 한 번 고치는 데 2~5번이 든다. 남은 수는 `GET /api/v1/key`의 `free_model_daily_requests`로 읽는다(무료 요청을 쓰지 않는다). 사용한 수는 늦게 반영된다. 2026-10-15에는 몇 분씩 그대로였다.
- **브라우저 연결의 돌아올 주소는 `localhost`다.** 브라우저가 `localhost`를 IPv6(`::1`)로 먼저 풀 수 있어 서버를 두 루프백 주소에 함께 연다. `::1`이 없는 PC에서는 그쪽만 조용히 건너뛴다.

## Linux 패키지

- **Ubuntu 24.04에서 deb 설치가 의존성 오류로 멈춘다.** 24.04와 Debian 13은 64비트 time_t 전환으로 여러 라이브러리를 `*t64` 이름으로 다시 지었다(24.04만 봐도 `libgtk-3-0`·`libatspi2.0-0`의 옛 이름은 없다). electron-builder의 기본 `depends`는 옛 이름만 적고, `deb.depends`를 설정하면 기본 목록이 통째로 바뀐다. → `electron-builder.cjs`의 `depends`가 기본 목록을 그대로 적고, 이름이 바뀐 것에는 `libgtk-3-0 | libgtk-3-0t64`처럼 대안을 붙인다. `tests/linux-deb-dependencies.test.ts`와 `linux-build.yml`의 검사가 지킨다.
- **"apt가 libnotify4를 못 찾는다"는 보고는 빈 24.04에서 재현되지 않는다.** 24.04의 t64 패키지가 옛 이름을 `Provides:`로 제공하고 `libnotify4`·`libxtst6`·`libsecret-1-0`은 24.04에 옛 이름 그대로 남아 있어, 지난 배포본도 `sudo apt install ./ieumoffice_버전_amd64.deb`로는 풀린다(`dpkg -i`는 의존성을 스스로 풀지 않으니 실패한다). → 그래도 대안 표기를 유지한다. 24.10 이후 배포판과 32비트 아키텍처에서는 옛 이름이 아예 없을 수 있다.

## 작업 사본을 여럿 둘 때

- **작업 사본을 지웠더니 본 저장소의 `node_modules`가 비었다.** 의존성을 연결(정션)로 나눠 쓰는 작업 사본을 `git worktree remove`로 지우면, 삭제가 연결을 따라가 본 설치를 지운다. → 지우기 전에 연결부터 끊는다. 지운 뒤 `node_modules/.bin`의 항목 수가 그대로인지 확인한다.
- 연결로 나눠 쓰는 사본 안에서는 `npm install`·`npm ci`를 돌리지 않는다. 같은 이유다.
- **작업 사본에서 한글 편집기 짓기가 실패한다.** `apps/hwp/scripts/build-studio.mjs`는 rhwp 스튜디오를 `apps/hwp/node_modules/.cache`에 받아 짓는데, 사본의 `node_modules`는 본 검사본을 가리키는 연결이라 캐시 경로가 사본 밖으로 풀린다. vite가 결과 이름에 `../../…/openoffice/…` 같은 상대 경로를 만들려다 "must be strings that are neither absolute nor relative paths"로 멈춘다. → **이미 지어 둔 검사본의 결과물**(`apps/hwp/public/studio`)을 사본에 복사해 온다. 스탬프(스크립트·플러그인 해시)가 같으면 다시 짓지 않는다.
- **작업 사본에서 슬라이드를 열거나 내보내면 "slides renderer stopped (crashed)"가 난다.** 껍데기 앱은 슬라이드 화면을 `apps/slides/out`에서 읽는데, 새 사본에는 이 폴더가 없다. → 껍데기 앱과 함께 `npm run build -w @genoffice/slides`도 돌린다.
- **작업 사본에서 마크다운 시험이 통째로 죽는다.** `Denied ID: …/node_modules/katex/dist/katex.min.css?inline` — vitest의 파일 접근 허용은 실제 경로로 따지는데, 연결된 `node_modules`가 사본 밖으로 풀려서다. → `node_modules/katex`처럼 `?inline`으로 불러오는 패키지는 연결 대신 실제 폴더로 복사한다.

## 화면

- **워드 리본이 선택을 옮겨도 그대로다.** Tiptap 3의 `useEditor`는 거래마다 React를 다시 그리지 않는다(`shouldRerenderOnTransaction` 기본값). 워드 `App.tsx`에서는 거래마다 새 객체를 넣는 `setHistState`가 App을, 따라서 리본(글꼴 이름·크기, 굵게 등)을 다시 그리는 계기다. → 이 갱신을 "값이 같으면 건너뛰기"로 바꾸지 않는다. 다시 그리기를 줄이려면 리본이 쓰는 값을 따로 구독하게 바꾼 뒤에 한다(`docs-font-combos` e2e가 잡는다).

- **슬라이드 글자의 띄어쓰기가 사라지고 간격·높이가 들쭉날쭉하다.** 글자 위치는 메인 프로세스가 실제 글꼴 파일로 재서 정하고, 캔버스는 같은 이름을 CSS로 찾아 그린다. Windows의 Chromium이 그 이름을 못 찾으면 맑은 고딕 같은 대체 글꼴로 그려 폭이 어긋난다. `나눔스퀘어 Bold`처럼 굵은 파일이 따로 붙인 이름(PowerPoint 글꼴 목록에 보이는 이름)이 그렇다. Chromium은 이름 끝의 Light·Medium·ExtraBold 등은 떼고 찾아 주지만 Bold는 떼지 않는다. → 그런 이름은 측정한 파일을 그 이름의 개인 글꼴(FontFace)로 등록해 그리게 한다(`fonts.ts`의 "Family Weight" 등록). 새 이름 유형을 의심할 때는 Electron 창에서 `measureText`로 `'<이름>', monospace`와 `monospace`의 폭이 다른지 보면 Chromium이 그 이름을 찾는지 알 수 있다.
- **첫 실행 안내의 두 번째 단계에서 첫 연결 안내가 겹쳐 뜬다.** 구독이 이미 연결된 PC에서는 연결 단계에 들어서는 순간 "처음 쓸 수 있게 된 때"가 되기 때문이다. 의도된 동작이다. 확인을 누르면 연결 카드가 보인다.
- **편집기 화면은 껍데기 앱의 화면보다 위에 그려진다.** 편집기 탭이 켜져 있으면 껍데기 앱의 겹침 화면(첫 실행 안내 등)은 가려진다. 그래서 그런 화면은 홈 탭이 켜져 있을 때만 그린다.
- **Electron은 잡히지 않은 예외로 꺼지지 않는다.** 대화 상자를 띄우고 계속 돈다. 그래서 동작을 바꾸는 예외 처리기를 두지 않았고, 프로그램 정리는 종료 경로(`will-quit`, 프로세스 `exit`)에 걸려 있다. 크래시 기록은 보기만 하는 `uncaughtExceptionMonitor`로 받는다. `uncaughtException`에 처리기를 붙이면 Electron의 대화 상자가 사라진다.

## 메모리와 크래시

- **창을 여러 번 열고 닫으면 메모리가 계속 는다.** 닫은 워드 탭과 떼어 낸 워드 창은 UI 멈춤을 피하려고 webContents를 닫지 않는다. 예전에는 렌더러 프로세스(빈 문서 하나에 약 215MB)까지 앱이 끝날 때까지 남아, 8GB PC에서 메모리가 바닥날 수 있었다. → 닫을 때 `releaseClosedRenderer`로 프로세스만 끝낸다(`renderer-disposal.ts`). 다른 열린 화면과 프로세스를 함께 쓰면 끝내지 않는다. 다른 편집기는 `webContents.close()`로 프로세스가 끝난다. 빌드한 앱에서 탭을 닫은 뒤 `app.getAppMetrics()`의 `Tab` 수가 처음으로 돌아오는지 본다.
- **앱이 꺼졌는데 흔적이 없다.** 렌더러·GPU 프로세스의 비정상 종료와 메인 프로세스의 예외는 데이터 폴더의 `crash-log.jsonl`에 한 줄씩 남는다(`crash-log.ts`, `crash-watch.ts`). 시각, 종류, 이유, 종료 코드, 편집기와 그때의 메모리 숫자(`appMB` 앱 전체 working set, `freeMB`·`totalMB` PC 메모리, `aiStreams` 진행 중인 AI 요청, `cliChildren` 떠 있는 구독 프로그램)만 적고, 64KB를 넘으면 오래된 줄부터 버린다. 앱이 일부러 끝낸 렌더러(닫은 워드 탭)와 유틸리티 프로세스는 적지 않는다.
- **AI 작업 중에 PC가 굳었는데 꺼짐 기록이 없다.** 구독 프로그램(Claude·Codex)은 `app.getAppMetrics()`에 잡히지 않고, PC가 굳기만 하면 꺼짐 줄도 생기지 않는다. → AI 요청이 진행 중일 때 15초마다 PC의 남은 메모리를 보고, 512MB나 전체의 8% 중 큰 값보다 적으면 `low-memory` 줄을 남긴다(10분에 한 번 이하). `appMB`가 작은데 `freeMB`가 바닥이면 앱 밖(구독 프로그램이나 다른 프로그램)이 메모리를 쓴 것이다. 기록만 하고 작업을 끊지 않는다(`docs/plans/ai-edit-resources.md` 2절).
- **열린 문서의 렌더러가 죽으면 알린다.** 슬라이드는 덱이 메인 프로세스에 있어 다시 불러오면 되살아난다. 다른 편집기는 저장하지 않은 상태가 렌더러에 있었으므로, 탭을 저장 확인 없이 닫고 파일을 다시 연다. 복구 사본이 남아 있으면 다시 열 때 문서별 물음으로 묻는다(결정 0061). 제목 없는 문서는 사본이 있으면 묻지 않고 그 사본으로 제목 없는 탭을 다시 열고, 없으면 닫기만 한다. 사본의 식별자는 `render-process-gone`에서 화면이 사라지기 전에 읽는다(`crash-watch.ts`, `crashedUntitledCopy`).

## 복구 사본과 되살린 탭 (결정 0061)

- **되살린 탭에 MCP 도구를 대었더니 "열려 있지 않다"고 한다.** 갑자기 꺼진 뒤 돌아온 탭은 처음 누를 때까지 편집기 화면이 없다(불러오지 않은 탭). `TabManager.webContentsForTab`은 동기 함수로 남겨 두었고 그런 탭에는 `undefined`를 준다. → 열린 문서의 화면이 필요한 길(앱 안 MCP의 `open_documents`와 열린 문서를 대상으로 하는 내용 도구)은 `ensureTabLoaded`를 거친다. AI 창의 `@` 목록에도 불러오지 않은 탭이 나오지만, 붙이기는 저장된 파일을 읽으므로 화면이 필요 없다. 껍데기 앱의 `liveDocumentContents`(`launch-recovery.ts`의 `liveTabContents`)가 탭을 앞에 내지 않고 불러와 편집기 페이지가 다 뜰 때까지(`did-finish-load`) 기다린다. 문서 내용을 다 읽을 때까지 기다리는 것은 아니다. `ensureTabLoaded`는 불러오기 전과, 불러왔지만 페이지가 아직 뜨지 않았을 때 탭의 `needsUser`를 묻는다(`recovery-shell.ts`의 `restoredTabOpener`). 시작 목록에 아직 답하지 않았거나 파일 탭의 사본 처리가 "묻기"(`openPlan`의 `ask`)이면 `needs-user`이고, 도구에는 `the user must open this document in the app first`가 든 실패로 돌아간다. 페이지가 다 뜬 뒤에는 다시 묻지 않는다. 그 뒤에 편집기가 띄운 문서별 물음은 사람이 답하고, 그동안 도구는 아직 열리는 중인 다른 문서에서와 같이 움직인다. 새 길도 `webContentsForTab`을 바로 쓰지 말고 이것을 쓴다. `findTabByPath`도 불러오지 않은 탭을 불러온다.
- **불러오지 않은 탭은 저장 안 됨 계산·닫기 확인·저장 메뉴에서 빠진다.** 바뀐 것이 없는 탭으로 다루고, 닫아도 편집기 정리가 돌지 않아 사본이 그대로 남는다. 떼어 내기는 먼저 불러온다. 엑셀 탭을 `createPlainEditorView`로 열면 통합 문서 알림(`startQueuedWorkbookNudge`)이 시작되지 않으므로 그 일은 `index.ts`가 따로 한다.
- **앱을 평소처럼 껐는데 다음에 탭이 되살아난다.** 정상 종료는 "종료 절차를 끝까지 지남(`will-quit`의 `markSessionCleanExit`)"과 "정하지 않음·되살리기로 정함 상태의 사본이 남지 않음"이 함께일 때다(`judgePreviousExit`). 앱을 끌 때 저장 질문 없이 사본에 맡기는 길(엑셀)이 정하지 않은 사본을 남기면 비정상으로 판정된다. 의도된 동작이다. 세션 기록이 아예 없으면(처음 실행, 이 기능이 든 버전으로 처음 업데이트) 정상으로 본다. 알림 영역에 남는 경우(`shouldKeepQuickLookInTray`)는 창이 닫힐 때 탭 목록을 비우고 정상 표시를 남긴다(`markSessionClosedToTray`). PC가 꺼질 때의 `markSessionOsEnd`는 그 뒤의 정상 표시를 막는다.
- **메뉴로 앱을 껐는데 다음에 탭과 시작 목록이 돌아오고, 사본이 파일과 똑같다.** 고쳤다가 되돌리기로 처음 상태로 돌아온 탭은 "정하지 않음" 사본을 그대로 쥐고 있다. 메뉴로 끄면 `before-quit`에서 종료 래치가 탭이 닫히기 전에 서므로, 탭이 닫힐 때의 정리가 그 사본을 지우지 못한다(`'refused'`). 정하지 않은 사본이 남았으니 다음 실행은 비정상으로 판정되고, 탭과 시작 목록이 파일과 내용이 같은 사본을 들고 돌아온다. 알려진 동작이다. 시작 목록에서 "버리기"를 고르면 사본이 지워진다.
- **창 없는 PDF 내보내기 때문에 다음 실행이 비정상으로 판정된다.** 세션 기록은 `initSessionRecord`를 부른 실행만 읽고 쓴다. 껍데기 앱은 단일 실행 잠금을 얻고 창 없는 내보내기가 아님을 안 뒤에만 부른다. 두 번째 실행도 `will-quit`를 지나지만, 기록을 시작하지 않았으므로 도우미가 아무 일도 하지 않는다. 새 진입 경로를 만들면 이 순서를 지킨다.
- **사본 폴더와 이름.** 데이터 폴더의 `<편집기>-autosave`이고(`recoveryFolderName`), 파일 사본은 편집기가 쥔 경로 문자열의 sha1 앞 16글자 + 확장자, 제목 없는 사본은 `untitled/<식별자><확장자>`다. 곁의 `<사본 이름>.meta.json`에 상태가 있다. 워드(`.docx`, ODT 탭은 `.odt`)·엑셀(`.xlsx`)·파워포인트(`.pptx`)의 폴더와 이름은 이전 버전 그대로라, 곁 정보 없는 이전 사본도 "나중에"로 읽혀 파일을 열 때 묻는다. 이름 규칙을 바꾸면 업데이트 전의 사본을 잃는다. 경로는 정규화하지 않고 편집기가 쥔 문자열 그대로 해시한다. 세션 기록은 `session-record.json`이다.
- **편집기마다 이 패키지의 사본이 번들에 들어간다.** 종료 래치, 지우기 순번, 쓰기 줄, 실행 식별자, 편집기 약속 목록은 `Symbol.for(...)` 키에 있어, 껍데기 앱이 세운 래치를 편집기의 사본이 같은 것으로 읽는다. 모듈 변수로 옮기지 않는다.
- **앱이 끝나는 중에 편집기 정리가 사본을 지운다.** 종료가 시작되면 `markAppShuttingDown`이 먼저 서야 한다(`before-quit`, PC 끄기). 그 뒤로 저장소는 `saved`·`dontSave`가 아닌 지우기를 `'refused'`로 거절한다. 닫기가 취소되면 `resetAppShuttingDown`으로 내린다(엑셀의 `resetSheetsShuttingDown`도 함께 내린다). 편집기의 닫기 정리에서 저장소를 거치지 않고 사본 파일을 직접 지우는 길을 만들지 않는다. 창 닫기가 탭을 하나씩 묻는 동안 먼저 "저장 안 함"으로 답한 탭도 살아 있으므로, `deleteCopy(id, 'dontSave')`는 그 문서의 쓰기를 닫기가 취소될 때(`resumeDiscardedCopies`)나 그 문서를 다시 열 때까지 `'superseded'`로 막는다.
- **저장한 뒤에 늦게 도착한 사본 쓰기가 사본을 되살린다.** 지우기는 그 문서의 순번을 올리고, 순번이 바뀐 뒤에 끝나는 쓰기는 `'superseded'`로 버려진다. 렌더러가 IPC로 바이트를 보내는 편집기는 도착할 때 받는 기본 표로 충분하다(한 렌더러의 IPC는 순서대로 처리되고 저장 요청은 그 뒤에 온다). 메인 프로세스에서 오래 직렬화하는 편집기(슬라이드, 엑셀)는 직렬화를 **시작하기 전에** `beginWrite`로 표를 받아 `writeCopy`·`writeCopyStreamed`에 넘긴다. 직렬화가 끝난 뒤에 표를 받으면 그사이의 저장을 보지 못한다.
- **큰 덱의 사본이 메모리를 많이 쓴다.** 사본을 통째 버퍼로 넘기는 `writeCopy` 대신 `writeCopyStreamed`로 저장소가 준 임시 파일에 흘려 쓴다(슬라이드의 암호 없는 덱). 30초마다 문서 전체를 메모리에 모으는 길로 되돌리지 않는다(8GB PC).
- **PC가 꺼질 때 닫기 확인이 뜨거나 사본이 지워진다.** 운영체제의 세션 종료(`query-session-end`·`session-end`, macOS·Linux의 `powerMonitor` `shutdown`)는 `createOsSessionEnd`가 맡는다. 래치를 세우고, 세션 기록의 정상 표시를 막고, 등록된 편집기마다 `writeCopiesNow`를 불러(최대 10초) 기다린 뒤 `app.exit(0)`으로 끝낸다. `app.exit`는 `before-quit`·`will-quit`와 창 닫기 정리를 건너뛰므로 닫기 확인이 뜨지 않고 정상 표시도 남지 않는다. 대신 프로그램 정리(`releaseAppResources`)를 그 앞에서 직접 부른다. macOS·Linux의 이 경로는 실제 기기로 확인하지 못했다.
- **편집기의 세 가지 시간 값.** 사본 간격 약 30초, 무거운 편집기(한글, PDF, 큰 마인드맵)가 기다리는 입력 멈춤 약 2초, 실패 뒤 건너뛰는 차례 10번. 성능 문제를 이 값을 키우거나 사본을 끄는 것으로 풀지 않는다.
