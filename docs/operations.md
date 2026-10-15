# 운영

배포하고 확인하는 운영체제는 Windows뿐이다. Apple Silicon용 서명 없는 dmg는 `.github/workflows/build-mac.yml`(macos-14, `workflow_dispatch`)이 만들고 공증하지 않는다. Linux 패키징은 확인하지 않는다.

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
- 원본 코드에서도 실패하던 테스트인지는 손대지 않은 원본 사본에서 같은 파일을 돌려 확인한다. 짐작으로 넘기지 않는다.

## 환경변수

| 이름                                       | 역할                                                                                                          | 쓰이는 곳                                                                                                         |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `GENOFFICE_USER_DATA`                      | 데이터 폴더를 다른 곳으로 돌린다                                                                              | 앱, 명령어. 화면 확인 스크립트가 임시 폴더를 줄 때 쓴다                                                           |
| `GENOFFICE_LANG`                           | 화면 언어를 강제한다                                                                                          | 앱. 화면 확인 스크립트는 기본으로 영어를 준다                                                                     |
| `GENOFFICE_AI_SETTINGS`                    | 명령어가 읽을 AI 설정 파일 위치                                                                               | 명령어, MCP                                                                                                       |
| `GENOFFICE_APP_BIN`                        | 명령어가 띄울 앱 실행 파일 위치                                                                               | 명령어(화면이 필요한 변환)                                                                                        |
| `GENOFFICE_ALLOWED_ROOTS`                  | 명령어가 읽고 쓸 수 있는 폴더를 제한한다(PATH처럼 여러 개)                                                    | 명령어, MCP                                                                                                       |
| `GENOFFICE_AUDIT_LOG`                      | 명령어 실행 기록의 위치. `off`면 끈다                                                                         | 명령어                                                                                                            |
| `GENOFFICE_MCP_TOKEN`                      | `ieumoffice mcp --http`가 요청마다 요구할 값. `--token`이 없을 때 읽는다                                      | MCP                                                                                                               |
| `GENOFFICE_TRUST_PROXY_HEADERS`            | `1`이면 HTTP MCP 서버가 앞단 프록시가 붙인 `X-Forwarded-*` 머리글을 믿는다. 믿을 수 있는 프록시 뒤에서만 켠다 | MCP(`--http`)                                                                                                     |
| `GENOFFICE_AUTH_DIR`                       | `~/.ieumoffice` 대신 쓸 폴더. 명령어 실행 기록과 명령어 위치 기록이 여기로 간다                               | 명령어, 앱                                                                                                        |
| `GENOFFICE_HOME`                           | 에이전트 설정 폴더를 찾을 때의 홈 폴더                                                                        | 명령어(`mcp install`, 스킬 설치)                                                                                  |
| `GENOFFICE_MCP_COMPACT_SCHEMAS`            | MCP 도구 설명을 짧게 낸다                                                                                     | MCP                                                                                                               |
| `XLSX_SIDECAR_PATH`                        | 엑셀 처리 프로그램의 위치를 바꾼다. 설치본과 엑셀 편집기 테스트에는 듣지 않는다                               | 혼자 띄운 엑셀 편집기, 명령어                                                                                     |
| `HTTPS_PROXY` / `HTTP_PROXY` / `ALL_PROXY` | 프록시                                                                                                        | 앱이 직접 보내는 요청, 명령어. 구독 프로그램에는 이 변수가 그대로 전달된다(프로그램이 따르는지는 확인하지 않았다) |

이름에 `GENOFFICE_`가 남아 있는 것은 일부러다. 내부 이름은 원본과 같게 둔다.

## 실제 구독으로 확인하기

구독 연동을 고쳤으면 테스트만으로 끝내지 않고 이 PC의 실제 구독으로 확인한다. 사용자의 한도를 쓰는 일이므로 필요한 횟수만 한다.

1. `npm run build:all`
2. 빌드된 앱을 임시 데이터 폴더로 띄운다(`e2e/helpers.ts`의 `launchShell`). 제공자와 모델은 그 폴더의 `ai-settings.json`에 미리 적는다. 예: `{ "provider": "claude-code", "providers": { "claude-code": { "apiKey": "", "model": "haiku" } }, "subscriptionNoticeSeen": true }`. 확인에는 가장 작은 모델을 쓴다.
3. 확인할 것: Claude로 도구 호출이 든 대화 한 번(문서에 문단을 넣게 하고 **한 번만** 들어갔는지 본다), Claude로 사진이 든 대화 한 번, Codex로 도구 호출이 든 대화 한 번, 실행 중 중단했을 때와 실행 중 앱을 껐을 때 앱의 하위 프로세스에 `claude`·`codex`가 남지 않는지.
4. 하위 프로세스는 앱 프로세스의 자손만 센다. 같은 PC에서 사람이 따로 쓰는 Claude·Codex와 구분해야 한다.

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
