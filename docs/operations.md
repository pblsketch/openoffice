# 운영

배포하는 운영체제는 Windows이고, Mac용(Apple Silicon·Intel)은 Apple 개발자 서명 없는 베타로 낸다(결정 0031, 0065). Mac판은 GitHub Actions의 Mac 빌드 기계에서 두 가지를 함께 만들고, Mac 사용자들의 보고로 확인한다.

## 처음 한 번

필요한 것: Node 22.12 이상(npm 10 이상), Rust(`cargo`), 설치 파일을 만들려면 Windows 10/11 SDK.

```bash
git clone https://github.com/pblsketch/openoffice.git
cd openoffice
export PATH="$HOME/.cargo/bin:$PATH"   # cargo가 PATH에 없을 때(Git Bash). 엑셀 처리 프로그램 빌드에 필요
npm ci                                  # 잠금 파일 그대로 설치. 용량이 크다
npm run fixtures                        # 테스트용 문서 만들기. 테스트보다 먼저
npm run native:build -w @genoffice/sheets   # 엑셀 처리 프로그램(Rust) 빌드
```

- `npm ci` 대신 `npm install`을 쓰면 잠금 파일이 바뀔 수 있다. 의존성을 실제로 바꿀 때만 쓴다.
- 커밋하려면 저장소에 작성자 정보를 넣는다. 주소는 GitHub의 비공개 주소를 쓴다(`git config user.email "<계정>@users.noreply.github.com"`).

## 개발과 실행

| 하려는 일                         | 명령                                | 알아 둘 것                                                          |
| --------------------------------- | ----------------------------------- | ------------------------------------------------------------------- |
| 모든 편집기와 앱 창을 개발 모드로 | `npm run dev`                       | preload를 고쳤으면 다시 빌드해야 화면이 뜬다                        |
| 전체를 빌드해서 앱 실행           | `npm run shell`                     | 편집기들, 명령어, 껍데기 앱 순으로 빌드한 뒤 실행                   |
| 전체 빌드만                       | `npm run build:all`                 | 화면 확인 스크립트(`npm run test:e2e`)는 이 결과물을 띄운다         |
| 껍데기 앱만 다시 빌드             | `npm run build -w @genoffice/shell` | 편집기 뒷단(`apps/*/src/main`)을 고친 뒤에는 이것까지 해야 반영된다 |

개발·시험 실행은 설치본과 다른 데이터 폴더(`%APPDATA%\IeumOffice-Dev`)를 쓴다. 설치본은 `%APPDATA%\IeumOffice`다.

## 검사

```bash
npm run typecheck
npx eslint . --ignore-pattern "<저장소 안의 다른 작업 사본 폴더>/**"   # 사본이 없으면 npm run lint
npm run format:check
npm run licenses
npm run check:theme-colors
npm run check:english-comments
npm run check:help-langs
npm run check:skill-version
npm run check:no-genspark
```

테스트는 작업 공간별로 돌린다. `npm test`는 첫 실패에서 멈추는데, Windows에서는 원본 코드 그대로도 실패하는 테스트가 있기 때문이다.

```bash
npm run test -w @genoffice/ai-provider      # 작업 공간 하나
cd apps/sheets && npx vitest run            # 엑셀 편집기: Rust 빌드를 건너뛰고 테스트만
cd apps/shell && npx vitest run tests/<파일>.test.ts   # 파일 하나만
```

- 실패가 나오면 그 파일만 따로 다시 돌려 본다. 여러 작업을 동시에 돌릴 때만 시간 초과로 떨어지는 테스트가 있다.
- `npm run test:parallel`(`tools/run-workspace-tests.mjs`)은 같은 작업 공간들을 2개씩 동시에 돌린다. 출력은 작업 공간별로 모아 보여 주고, 끝에 작업 공간마다 걸린 시간과 성공 여부 표가 나온다. 동시 실행 수는 `TEST_JOBS=<n>`, 작업 공간마다의 vitest 워커 수는 `VITEST_MAX_WORKERS`로 바꾼다. 빠르지만 다른 일이 도는 PC에서는 시간 초과가 날 수 있으므로, 합치기 전 검사는 `npm test`로 한다.
- 원본 코드에서도 실패하던 테스트인지는 손대지 않은 원본 사본에서 같은 파일을 돌려 확인한다. 짐작으로 넘기지 않는다.

## 환경변수

| 이름                                                            | 역할                                                                                                               | 쓰이는 곳                                                                                                         |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| `GENOFFICE_USER_DATA`                                           | 데이터 폴더를 다른 곳으로 돌린다                                                                                   | 앱, 명령어. 화면 확인 스크립트가 임시 폴더를 줄 때 쓴다                                                           |
| `GENOFFICE_LANG`                                                | 화면 언어를 강제한다                                                                                               | 앱. 화면 확인 스크립트는 기본으로 영어를 준다                                                                     |
| `GENOFFICE_AI_SETTINGS`                                         | 명령어가 읽을 AI 설정 파일 위치                                                                                    | 명령어, MCP                                                                                                       |
| `GENOFFICE_APP_BIN`                                             | 명령어가 띄울 앱 실행 파일 위치                                                                                    | 명령어(화면이 필요한 변환)                                                                                        |
| `GENOFFICE_ALLOWED_ROOTS`                                       | 명령어가 읽고 쓸 수 있는 폴더를 제한한다(PATH처럼 여러 개)                                                         | 명령어, MCP                                                                                                       |
| `GENOFFICE_AUDIT_LOG`                                           | 명령어 실행 기록의 위치. `off`면 끈다                                                                              | 명령어                                                                                                            |
| `GENOFFICE_MCP_TOKEN`                                           | `ieumoffice mcp --http`가 요청마다 요구할 값. `--token`이 없을 때 읽는다                                           | MCP                                                                                                               |
| `GENOFFICE_TRUST_PROXY_HEADERS`                                 | `1`이면 HTTP MCP 서버가 앞단 프록시가 붙인 `X-Forwarded-*` 머리글을 믿는다. 믿을 수 있는 프록시 뒤에서만 켠다      | MCP(`--http`)                                                                                                     |
| `GENOFFICE_AUTH_DIR`                                            | `~/.ieumoffice` 대신 쓸 폴더. 명령어 실행 기록과 명령어 위치 기록이 여기로 간다                                    | 명령어, 앱                                                                                                        |
| `GENOFFICE_HOME`                                                | 에이전트 설정 폴더를 찾을 때의 홈 폴더                                                                             | 명령어(`mcp install`, 스킬 설치)                                                                                  |
| `GENOFFICE_MCP_COMPACT_SCHEMAS`                                 | MCP 도구 설명을 짧게 낸다                                                                                          | MCP                                                                                                               |
| `GENOFFICE_GOOGLE_CLIENT_ID` / `GENOFFICE_GOOGLE_CLIENT_SECRET` | 껍데기 앱을 빌드할 때 넣는 Google OAuth 클라이언트(결정 0033). 없으면 드라이브 기능이 빠진다. 저장소에 적지 않는다 | 빌드(`npm run build -w @genoffice/shell`, `build:all`, 설치 파일 만들기)                                          |
| `XLSX_SIDECAR_PATH`                                             | 엑셀 처리 프로그램의 위치를 바꾼다. 설치본과 엑셀 편집기 테스트에는 듣지 않는다                                    | 혼자 띄운 엑셀 편집기, 명령어                                                                                     |
| `HTTPS_PROXY` / `HTTP_PROXY` / `ALL_PROXY`                      | 프록시                                                                                                             | 앱이 직접 보내는 요청, 명령어. 구독 프로그램에는 이 변수가 그대로 전달된다(프로그램이 따르는지는 확인하지 않았다) |

이름에 `GENOFFICE_`가 남아 있는 것은 일부러다. 내부 이름은 원본과 같게 둔다.

## 실제 구독으로 확인하기

구독 연동을 고쳤으면 테스트만으로 끝내지 않고 이 PC의 실제 구독으로 확인한다. 사용자의 한도를 쓰는 일이므로 필요한 횟수만 한다.

1. `npm run build:all`
2. 빌드된 앱을 임시 데이터 폴더로 띄운다(`e2e/helpers.ts`의 `launchShell`). 제공자와 모델은 그 폴더의 `ai-settings.json`에 미리 적는다. 예: `{ "provider": "claude-code", "providers": { "claude-code": { "apiKey": "", "model": "haiku" } }, "subscriptionNoticeSeen": true }`. 확인에는 가장 작은 모델을 쓴다.
3. 확인할 것: Claude로 도구 호출이 든 대화 한 번(문서에 문단을 넣게 하고 **한 번만** 들어갔는지 본다), Claude로 사진이 든 대화 한 번, Codex로 도구 호출이 든 대화 한 번, 실행 중 중단했을 때와 실행 중 앱을 껐을 때 앱의 하위 프로세스에 `claude`·`codex`가 남지 않는지.
4. 하위 프로세스는 앱 프로세스의 자손만 센다. 같은 PC에서 사람이 따로 쓰는 Claude·Codex와 구분해야 한다.

## Google 드라이브 준비하기 (저장소 주인)

드라이브 연결(결정 0033)에는 저장소 주인의 Google Cloud 프로젝트가 있어야 한다. Google API 약관에 동의하는 일이라 주인만 한다.

1. [Google Cloud 콘솔](https://console.cloud.google.com/)에서 프로젝트를 만들고 **Google Drive API**를 켠다.
2. **Google 인증 플랫폼 → 브랜딩**: 앱 이름(이음오피스), 지원 이메일, 홈페이지(`https://ieumoffice.vercel.app`), 개인정보 처리방침(`PRIVACY.md`를 소개 사이트에 올린 주소). 승인된 도메인에 홈페이지 도메인을 넣는다.
3. **대상**: 사용자 유형 "외부". 처음에는 게시 상태를 "테스트"로 두고 시험할 Google 계정을 테스트 사용자로 넣는다(100명까지). 테스트 상태의 로그인은 7일마다 끊긴다.
4. **데이터 액세스**: 범위 `https://www.googleapis.com/auth/drive` 하나를 넣는다. 제한 등급이다.
5. **클라이언트**: 유형 "데스크톱 앱"으로 만들고 클라이언트 ID와 비밀값을 받는다.
6. 빌드할 때 두 값을 환경변수로 준다. 예(Git Bash): `GENOFFICE_GOOGLE_CLIENT_ID=… GENOFFICE_GOOGLE_CLIENT_SECRET=… npm run build:all`. 값은 저장소, 커밋, 로그에 남기지 않는다.
7. 공개 전: 게시 상태를 "프로덕션"으로 바꾸고 검증을 신청한다. 필요한 것은 Search Console의 도메인 소유 확인, 홈페이지와 같은 도메인의 개인정보 처리방침, 로그인과 권한 허용 과정을 보여 주는 영어 시연 영상, 드라이브 전체 권한이 필요한 이유(드라이브의 파일을 열고 제자리에 저장, AI의 드라이브 검색)다. Google이 요구하면 지정 기관의 연간 보안 심사를 받는다. 검증 전에는 공개 설치 파일에 클라이언트를 넣지 않는다.

확인할 것(시험 계정으로): 연결, 내 드라이브·공유 문서함·최근·검색, PDF·워드·Google 문서 열기, 저장 뒤 드라이브에 올라갔는지, 다른 곳에서 고친 뒤 저장할 때의 질문, 보기 전용 파일 저장, AI 창의 "드라이브에서 찾아 요약해 줘", 드라이브를 읽은 대화에서 웹 검색이 거절되는지, 연결 끊기 뒤 Google 계정의 "서드 파티 앱" 목록에서 사라졌는지.

## 무료 모델 점검

OpenRouter 무료 연결에서 고를 수 있는 모델은 `packages/ai-provider/src/free-ai.ts`의 `OPENROUTER_FREE_MODELS`다. 무료 모델은 예고 없이 생기고 사라지므로 두 단계로 살핀다.

1. **목록 확인(매주, 자동).** `.github/workflows/free-models.yml`이 월요일 오전 9시에 OpenRouter의 공개 모델 목록과 비교한다. 키를 쓰지 않고 무료 요청도 쓰지 않는다. 앱이 보여 주는 모델이 사라졌거나 도구 호출 지원이 꺼졌으면, 또는 시험해 볼 새 무료 모델이 있으면 실행이 실패로 끝나고 실행 결과 요약에 보고서가 남는다. 실패한 예약 실행은 GitHub이 저장소 주인에게 메일로 알린다. 이 PC에서는 `npm run free-models:check`로 같은 보고서를 본다.
2. **앱에서 시험(사람이).** `npm run build:all` 뒤 `npm run free-models:trial`. 후보마다 도구 하나짜리 짧은 요청을 보내고, 통과하면 빌드된 앱의 워드 편집기에서 두 요청(문단 넣기, 제목 바꾸고 요약 목록 넣기)을 시킨 뒤 결과를 표로 낸다. 모델 이름을 붙이면 그 모델만, `--listed`를 붙이면 앱이 지금 보여 주는 모델을 다시 시험한다.

- 시험은 설치된 앱에 저장된 OpenRouter 키(`%APPDATA%/IeumOffice/ai-settings.json`)로 하고 그 키의 하루 무료 요청을 쓴다. 키는 화면에 찍히지 않는다. 모델 하나에 짧은 확인 1번, 앱 시험 약 12번이 든다. 남은 수가 모자라면 그 모델은 건너뛴다.
- 통과한 모델은 실행기가 알려 주는 대로 `OPENROUTER_FREE_MODELS`에 더한다. 순서가 곧 새 연결의 기본 모델 순위이므로 맨 앞은 함부로 바꾸지 않는다.
- 떨어진 모델은 실행기가 `tools/free-models-rejected.json`에 날짜·이유와 함께 적는다. 거기 있는 모델은 매주 확인에서 후보로 다시 나오지 않는다. 다시 시험하려면 그 줄을 지운다.
- 앱이 보여 주는 모델이 사라졌다는 보고가 오면 목록에서 빼고 새 버전을 낸다. 새 버전이 나가기 전까지는 그 모델을 고른 사용자가 실패를 본다.

## Windows 설치 파일 만들기

```bash
export PATH="$HOME/.cargo/bin:$PATH"
npm run native:build -w @genoffice/sheets
# 만들어진 apps/sheets/native/xlsx-engine/target/release/xlsx-sidecar.exe 를
#   apps/sheets/native/xlsx-engine/target/x86_64-pc-windows-gnu/release/ 로 복사한다
npm run dist:win -- -- --publish never
```

- 결과물은 `apps/shell/release`에 생긴다. 설치 파일 `IeumOffice-Setup-<버전>.exe`와 `latest.yml`.
- `--publish never`를 빼면 빌드 도구가 GitHub에 올리려 한다.
- 스캔 문서 글자 인식 도우미(`win-ocr.exe`)가 이 과정에서 컴파일된다. Windows SDK가 없으면 여기서 멈춘다.
- 설치 파일에는 서명이 없다. 설치할 때 Windows가 "알 수 없는 게시자" 경고를 띄운다.

## 성장 기록

이용자 수는 앱이 보내는 통계가 없으므로, GitHub가 공개하는 배포 신호로만 본다.
`npm run growth`를 실행하면 그날의 기록(릴리스 다운로드 수, 스타, 포크)을
`docs/tracking/growth-history.json`에 더하고, 소개 문서의 배지가 읽는 요약을
`docs/tracking/growth-latest.json`에 쓴다. GitHub Actions의 Growth 워크플로우가
매일 00:17 UTC에 같은 일을 하고, 바뀐 것이 있으면 기록 커밋 하나를 `main`에 쌓는다.

```bash
npm run growth           # 그날 기록을 더한다(수동 실행)
npm run growth:report    # 전일 대비 증감과 7일 추이 보기
```

숫자의 뜻:

- 다운로드 합계는 설치 파일 전체 합계다. Windows 설치 수는 `.exe`, macOS 설치 수는
  `.dmg`와 `.zip`, Linux 설치 수는 `.AppImage`·`.deb`·`.rpm`을 더한 것이다.
- 업데이트 확인(`latest*.yml` 내려받기)은 설치된 앱의 자동 업데이트 확인 횟수다.
  설치 수와 섞어 보지 않는다.
- 같은 PC에서의 재설치도 설치 수에 더해진다. 정확한 이용자 수가 아니라 추이다.

주 확인 루틴: `npm run growth:report`로 7일 Windows 설치 추이를 본다. 숫자가
눈에 띄게 자라면 소개 문서의 배지를 더 눈에 띄는 자리로 옮기는 것을 생각한다.

## Mac 설치 파일 만들기

저장소 주인에게 Mac이 없으므로 GitHub Actions에서 만든다.

1. GitHub 저장소의 Actions 탭 → **macOS build** → **Run workflow**. 가지는 릴리스 태그가 가리킬 커밋이 있는 가지를 고른다.
2. 끝나면 실행 결과의 Artifacts에서 `ieumoffice-mac`을 내려받는다. 안에 `IeumOffice-<버전>-arm64.dmg`, `IeumOffice-<버전>-x64.dmg`, `IeumOffice-<버전>-arm64-mac.zip`, `IeumOffice-<버전>-mac.zip`(Intel), `latest-mac.yml`(베타 버전 번호면 `beta-mac.yml`)이 있다.

- 빌드는 `GENOFFICE_MAC_X64=1`로 두 앱을 묶는다. 두 앱이 한 자리를 나눠 쓰는 엑셀 처리 프로그램과 글자 인식 도우미는 두 CPU를 담은 파일(`native:build:universal`, lipo)이어야 한다. 빌드는 두 앱 모두 ad hoc 서명이 되었는지, 들어 있는 프로그램이 그 앱의 CPU를 담는지 검사하고, 두 앱을 창 없이 띄워(Intel판은 Rosetta로) Markdown·CSV 파일을 PDF로 내보내 본다. 하나라도 실패하면 결과를 올리지 않는다.
- 비밀 값을 쓰지 않는다. **release_tag**를 적고 `main`에서 실행하면, 빌드가 통과한 뒤 그 태그의 이미 공개된 릴리스에 dmg, zip, `latest-mac.yml`을 붙인다(빌드한 버전과 태그가 같을 때만). 비워 두면 결과물만 남는다. 순서는 `docs/releasing.ko.md`의 "Mac 설치 파일"이다.
- Mac에서 직접 만들 때: `npm ci`, `npm run build:all`, `npm run dist:mac -w @genoffice/shell -- --publish never`(Apple Silicon만). Intel용까지 묶으려면 그 전에 `npm run native:build:universal -w @genoffice/sheets`를 하고 `GENOFFICE_MAC_X64=1`을 켠다. 루트의 `npm run dist:mac`은 원본의 경로라 쓰지 않는다.

## Linux 설치 파일 만들기

GitHub Actions에서 만든다.

1. GitHub 저장소의 Actions 탭 → **Linux build** → **Run workflow**. 가지는 릴리스 태그가 가리킬 커밋이 있는 가지를 고른다.
2. 끝나면 실행 결과의 Artifacts에서 `ieumoffice-linux-x64`를 내려받는다. 안에 `IeumOffice-<버전>.AppImage`, `ieumoffice_<버전>_amd64.deb`, `ieumoffice-<버전>.x86_64.rpm`, `latest-linux.yml`(베타 버전 번호면 `beta-linux.yml`)이 있다.

- 빌드는 앱 실행 파일, 엑셀 처리 프로그램, 터미널 명령어가 실행 가능하게 들어갔는지 검사하고, deb의 의존성이 Ubuntu 24.04(64비트 time_t 전환으로 `t64` 이름이 쓰이는 곳)에서도 풀리는지 확인한 뒤, 만든 앱을 Xvfb 아래에서 창 없이 띄워 Markdown·CSV 파일을 PDF로 내보내 본다. 하나라도 실패하면 결과를 올리지 않는다.
- 비밀 값을 쓰지 않는다. **release_tag**를 적고 `main`에서 실행하면, 빌드가 통과한 뒤 그 태그의 이미 공개된 릴리스에 AppImage, deb, rpm, `latest-linux.yml`을 붙인다(빌드한 버전과 태그가 같을 때만). 비워 두면 결과물만 남는다. 순서는 `docs/releasing.ko.md`의 "Linux 설치 파일"이다.
- Linux(x64)에서 직접 만들 때(`rpm` 패키지가 설치되어 있어야 한다): `npm ci`, `npm run build:all`, `npm run dist:linux -w @genoffice/shell -- --publish never`.

## 새 버전 내기

순서:

1. **공개 배포 전에 Anthropic 상업 약관에 동의했는지 확인한다.** 저장소 주인이 직접 해야 하는 일이고, 동의하지 않았으면 여기서 멈춘다.
2. 버전 번호를 올리고 설치 파일을 만든다.
3. GitHub 릴리스를 `v<버전>` 태그로 만들고 `IeumOffice-Setup-<버전>.exe`와 `latest.yml`을 올린다. 초안이 아니라 공개로 낸다.
4. 설치된 앱은 켠 직후 한 번, 그 뒤 4시간마다 릴리스를 확인한다.

## 원본의 개선 받아오기

원본의 문서 엔진 쪽 커밋을 하나씩 골라 옮긴다. 원본 가지를 통째로 합치지 않는다. 통째로 합치면 걷어낸 제작사 연결과 화면이 한꺼번에 되돌아온다.

```bash
git remote add upstream <원본 저장소 주소>     # 처음 한 번. 주소는 소개 문서의 출처 단락에 있다
git fetch upstream
# 엔진 폴더에 닿은 원본 커밋만 본다
git log --oneline HEAD..upstream/main -- packages/docx-engine packages/pptx-engine packages/pptx-ops \
  packages/pptx-render packages/xlsx-gateway packages/pdf2docx packages/html2docx packages/file-parse \
  packages/zip-gate packages/font-metrics apps/sheets/native
git checkout -b sync/<날짜>
git cherry-pick -x <커밋>                      # 하나씩. -x가 원본 커밋 번호를 커밋 글에 남긴다
npm run check:no-genspark                      # 원본에서 다시 딸려 온 제작사 표기·연결을 여기서 잡는다
npm run typecheck
```

- 엔진 밖의 파일까지 고치는 커밋은 엔진 쪽 변경만 받는다. 화면 문구 파일, 껍데기 앱의 뒷단, AI 연결부에서 충돌이 나면 이 프로젝트의 것을 남긴다.
- 원본이 화면 문구 키를 늘렸으면 21개 언어 모두에 들어왔는지 형 검사로 확인한다.
- 옮긴 뒤 위의 검사 전체와, 건드린 엔진 패키지의 테스트를 돌린다.
- `packages/pdf2docx`에는 원본과 다른 동작이 있다(결정 0058). 그 패키지의 `AGENTS.md` "원본과 다른 점"에 적힌 시험이 옮긴 뒤에도 통과하는지 본다. 충돌이 나면 그 목록의 동작을 남긴다.

## 한글 엔진(rhwp) 다시 빌드하기

한글 편집기와 한글 파일 읽기가 쓰는 엔진은 `vendor/rhwp-core`에 빌드해 둔 것이다(결정 0050). 앱을 빌드할 때는 Rust가 필요 없다. 패치를 바꾸거나 rhwp 태그를 올릴 때만 다시 빌드한다.

```bash
export PATH="$HOME/.cargo/bin:$PATH"
cargo install wasm-pack --version 0.15.0 --locked   # 처음 한 번
node tools/build-rhwp-core.mjs                      # 태그 받기 → 커밋 확인 → patches 적용 → wasm-pack → 파일과 해시 갱신
npm run test -w @genoffice/hwp                      # 엔진 시험(engine-layout)과 편집기 시험
```

- 패치는 `vendor/rhwp-core/patches/`에 번호 순으로 두고 `package.json`의 `rhwp.patches`에 적는다. 만드는 방법은 같은 태그를 받은 rhwp 사본에서 커밋한 뒤 `git format-patch`로 뽑는 것이다.
- 패치 묶음이 바뀌면 `package.json`의 버전(`0.8.7-ieum.N`)을 올리고 `package-lock.json`의 같은 항목도 고친다.
- 빌드에는 10분 남짓 걸린다. 빌드 뒤 `rhwp.js`·`rhwp.d.ts`가 npm의 같은 버전과 같은지, WASM에 이 PC의 사용자 폴더 경로가 없는지 본다(스크립트가 경로를 검사한다).
