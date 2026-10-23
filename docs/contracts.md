# 바깥에 내놓는 약속

이 프로그램을 밖에서 쓰는 쪽은 다섯이다. 터미널 명령어를 부르는 스크립트와 에이전트, 명령어 쪽 MCP 클라이언트, 앱 안 MCP 서버에 붙는 클라이언트, 사용자의 설정 파일, 그리고 원본 프로그램과 주고받는 문서.

## 공통

- 모든 바깥 이름은 `ieumoffice`다. 명령어, MCP 등록 이름, 에이전트 스킬 이름과 폴더, 홈 폴더 아래 `.ieumoffice`.
- 원본이 쓰는 이름(`genoffice` 명령어, `~/.genoffice`, `genoffice` 연동 항목과 스킬 폴더)은 읽지도 쓰지도 않는다. 두 프로그램은 한 PC에 함께 있을 수 있다.
- 문서 명령은 PC 안에서 끝난다. 밖으로 무언가를 보내는 명령은 `search`, `image`, `media`, `read-url`, `pdf ai-read`, `pdf translate` 여섯뿐이다. 뒤의 둘은 `--yes`가 있을 때만 보낸다.

## 터미널 명령어 `ieumoffice`

**부르는 법.** 설치본은 명령어 폴더(`<설치 폴더>\resources\cli`)를 사용자 PATH에 넣는다. PATH에 없어도 `~/.ieumoffice/launcher`에 그 폴더의 위치가 적혀 있다. 전체 명령 목록은 `ieumoffice help`.

**출력.**

- 기본은 사람이 읽는 한 줄 요약이다. `--json`을 주면 JSON 객체 하나를 낸다.
- 성공: `{ status, command, summary, output_path?, warnings?, detail? }`. `status`는 `ok` 또는 `partial`이다. `partial`은 파일은 썼지만 묶음 안의 일부 편집이 빠졌다는 뜻이고, 빠진 것은 `detail.batch`·`detail.failures`에 있다. `warnings[]`는 `{ code, message, suggestion? }`이고, 성공했지만 알려 둘 것이 있을 때 온다.
- 실패: `{ status: "error", command, code, error, message, suggestion?, detail? }`. `command`는 명령을 알아내지 못했으면 `null`이다. `code`는 종료 코드, `error`는 바뀌지 않는 영어 소문자 이유(`unknown_op`, `target_not_found`, `out_of_range`, `sheet_not_found`, `file_open_in_gui`, `app_unavailable` 등)다. 다시 시도하는 데 필요한 사실(유효한 범위, 쓸 수 있는 식별자, 시트 이름, 사용법)은 `message` 안이 아니라 `detail`의 항목으로 온다.

**종료 코드.** `0` 성공, `1` 사용법 오류, `2` 파일 문제, `3` 변환 실패, `4` 앱이나 필요한 경로를 쓸 수 없음.

**파일 규칙.**

- `GENOFFICE_ALLOWED_ROOTS`가 있으면 그 폴더들 밖의 파일은 읽지도 쓰지도 않는다. 심볼릭 링크는 풀어서 본다. 벗어나면 종료 코드 2와 `detail.allowed_roots`.
- 이미 있는 다른 파일 위에 쓰려면 `--force`가 필요하다. 제자리 편집에는 필요 없다. 모르는 옵션은 무시하지 않고 거절한다.
- 앱의 탭에 열려 있는 파일은 제자리에서 고치지 않는다(종료 코드 2, `detail.gui_pid`). `--force`면 쓴다.
- 실행한 명령마다 `~/.ieumoffice/cli-audit.jsonl`에 한 줄을 남긴다(`ts`, `pid`, `command`, `argv`, `status`, `code`, `output_path`, `ms`, `cwd`). 2MB에서 돌린다.

**ODT(`.odt`).**

- `docs read`·`docs apply`는 `.odt`를 `.docx`와 같은 방식으로 받는다. `apply`는 `.odt`로 다시 쓰고(`--out`도 `.odt`), 고치지 않은 부분은 원래 바이트 그대로 둔다. `info`처럼 형식을 가리지 않는 명령도 `.odt`를 알아본다.
- ODT에서 꺼 둔 기능의 편집(메모, `--track`, 변경 내용 받아들이기·되돌리기, 목차, 수식, 차트, 글상자, 다단, 워터마크, 그림 번호·상호 참조·인용·목차 같은 `insertField` 필드)은 `unsupported`, 한컴에서 잠근 칸과 잠긴 개체를 고치는 편집은 `op_rejected`로 거절한다. 묶음 처리는 docx와 같다. 기본은 하나라도 거절되면 묶음 전체를 쓰지 않고, `--best-effort`·`--stop-on-error`일 때만 나머지를 쓰고 `status: "partial"`로 답한다.
- `convert`가 받는 경로: `odt → docx | pdf | md | html`, `docx | md | html → odt`. `odt → pdf | html`과 `html → odt`는 임시 docx를 거쳐 앱으로 내보내고, 그 임시 파일은 실패해도 지운다.
- 바꾸는 중에 모양이 바뀌거나 빠지는 것이 있으면 파일은 쓰고, 항목마다 `warnings[]`로 알린다. 코드는 `odt_converted`(바뀜)와 `odt_dropped`(빠짐)다. 같은 목록이 `detail.odt_report`에 `[{ kind: "converted" | "dropped", feature, count }]`로 온다. `feature`는 바뀌지 않는 식별자다: `toc`, `chart`, `equation`, `shape`, `textbox`, `columns`, `citation`, `cross_reference`, `page_color`, `mirror_margins`, `theme`, `comment`, `revision`, `ink`, `watermark`, `password`, `protection`, `form_field`, `object`.
- 암호가 걸린 ODT는 열지 않는다. 종료 코드 2, `error: "unsupported"`, `suggestion`은 "암호를 푼 뒤 다시 시도하라"다.

## PDF 명령

`pdf read`, `pdf images`, `pdf status`와 `convert`는 PC 안에서 끝난다. `pdf ai-read`와 `pdf translate`는 아래 "AI를 부르는 PDF 명령"의 규칙을 따른다.

| 명령                                                                                                                                                                                        | 동작                                                                                                                                                                                             |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `convert <file.pdf> --to md\|epub [--pages <목록>] [--password <pw>] [--out <경로>] [--force]`                                                                                              | 다시 흐르는 글로 바꾼다. Markdown은 그림을 옆의 `assets/`에 쓴다. 이 프로그램이 쓰지 않은 같은 이름의 파일이 거기 있으면 종료 코드 2, `output_exists`                                            |
| `convert … --to epub [--title <글>] [--author <글>] [--no-cover]`                                                                                                                           | 제목·저자는 PDF 정보에서, 없으면 파일 이름에서 가져온다. 표지는 첫 페이지이고 기본으로 켜져 있다. 이 옵션들을 다른 경로에 주면 종료 코드 1, `invalid_argument`                                   |
| `pdf read … --structured`                                                                                                                                                                   | 페이지별 `text`가 문서 나무의 구조화 글(제목 `#`, 목록, 표, `[figure]` 캡션, 각주)이다. `detail.structured: true`. 범위는 `--page`/`--range`를 그대로 쓰고, 나머지 출력 모양도 `pdf read`와 같다 |
| `pdf images <file.pdf> --out <폴더> [--pages <목록>] [--password <pw>]`                                                                                                                     | 페이지에 그려진 그림을 원래 해상도의 PNG로 `<이름>-p<페이지>-<n>.png`에 쓴다. 이미 있는 파일은 바꾸지 않고 이름 뒤에 ` (2)`를 붙인다                                                             |
| `pdf ai-read <file.pdf> --pages <목록> [--yes] [--allow-paid] [--password <pw>]`                                                                                                            | 페이지 그림을 AI 제공자에게 한 페이지씩 보내 읽힌다. 이미 읽은 페이지는 보내지 않는다                                                                                                            |
| `pdf translate <file.pdf> --to <언어 코드> [--pages <목록>] [--format pdf,md,epub] [--bilingual] [--out <경로>] [--partial] [--restart] [--yes] [--allow-paid] [--password <pw>] [--force]` | 고른 페이지의 글을 묶음으로 보내 번역하고 결과 파일을 쓴다. `--format`의 기본은 `pdf`다. `--bilingual`은 md·epub에만 쓰인다(대역 PDF는 만들지 않는다). 언어 코드는 화면 언어 21개다              |
| `pdf status <file.pdf>`                                                                                                                                                                     | 보관소에 있는 그 문서의 AI 읽기와 번역별 진행. 아무것도 보내지 않는다                                                                                                                            |

- `<목록>`은 `1-5,8,10-12` 꼴이고 1부터 센다. 문서 밖의 페이지는 종료 코드 1, `out_of_range`, `detail.valid_range`.
- 동사마다 받는 옵션이 정해져 있다. 다른 동사의 옵션을 주면 종료 코드 1, `unknown_option`.
- 변환·구조화 글·번역은 보관소에 있는 AI 읽기 결과를 그 페이지 대신 쓴다. 변환 결과의 `detail.ai_read_pages`가 그 페이지들이다.
- 고른 페이지가 모두 글자를 읽을 수 없는 그림이면 변환은 페이지 그림으로 끝나고 경고 `pages_as_images`가 붙는다.
- **보관소**: 앱과 같은 데이터 폴더의 `pdf-store`다(`GENOFFICE_USER_DATA`로 바꿀 수 있다). 앱과 명령어가 같은 문서를 동시에 다뤄도 항목 단위로 원자적으로 쓴다.

**성공 `detail`**

| 명령            | 성공 `detail`                                                                                                                                                                 |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `convert`(md)   | `{ pages, warnings, assets_written, assets_reused, ai_read_pages? }`                                                                                                          |
| `convert`(epub) | `{ pages, title, author?, cover, ai_read_pages? }`                                                                                                                            |
| `pdf images`    | `{ images: { page, file, width, height }[] }`                                                                                                                                 |
| `pdf ai-read`   | `{ pages_read: number[], pages_skipped: number[], pages_failed: { page, reason }[], provider, model }`                                                                        |
| `pdf translate` | `{ lang, provider, model, translated_blocks, untranslated_blocks: { page, reason }[], overflowed_blocks: { page }[], original_pages: { page, reason }[], outputs: string[] }` |
| `pdf status`    | `{ ai_read: { pages: number[], job }, translations: { lang, provider, model, done_blocks, total_blocks, complete, job }[] }`                                                  |

- `model`이 빈 글이면 구독 프로그램의 기본 모델이다.
- `pdf status`의 `done_blocks`·`total_blocks`는 그 번역 작업이 마지막으로 기록한 진행이다(작업의 페이지 범위 기준). 작업 기록이 없으면 보관소에 있는 블록 수다. `complete`는 `job.state`가 `complete`일 때 참이다.
- **`job` 모양**: `{ state, last_error?, resetsAt?, outputs, progress? }`.
  - `state`는 `idle | running | stopped | complete` 넷 중 하나다. `idle`은 기록이 없다는 뜻이다.
  - `running`은 작업 기록이 최근 30초 안에 갱신된 경우다. 그보다 오래 갱신되지 않은 `running` 기록은 `stopped`, `last_error: "interrupted"`로 읽는다.
  - `last_error`는 `rate-limit | cancelled | failures | interrupted | store-write-failed | output-write-failed | <기존 errorCode>`(`signed-out`, `credits` 등) 중 하나다.
  - `resetsAt`은 한도가 풀리는 시각(밀리초)이다.
  - `outputs`는 그 작업이 쓴 결과 파일 경로다.
  - `progress`는 `{ done, total }`이다(페이지 또는 블록 수).

**AI를 부르는 PDF 명령(`pdf ai-read`, `pdf translate`)**

- 가는 길은 대화에 쓰는 AI 제공자다. 고르는 규칙은 대화와 같고, 자동 호출이므로 구독은 스위치가 켜져 있을 때만 쓴다(아래 `search` · `image` · `media`와 같은 규칙). 다른 제공자로 저절로 넘어가지 않는다. 그림을 읽지 못하는 모델이면 `ai-read`는 시작하지 않는다.
- **예상만 답하기**: `--yes`가 없으면 아무것도 보내지 않는다. 종료 코드 0, `detail.started: false`, `detail.estimate: { calls, pages, provider, route, metered }`.
  - `calls`는 보낼 요청 수, `pages`는 보낼 페이지 수(`ai-read`) 또는 범위의 페이지 수(`translate`)다.
  - `route`는 `subscription` 또는 `key`다. 허용된 종량 로그인은 `key`로 친다.
  - `metered`는 쓴 만큼 요금이 나가는 경로(키 제공자, 허용된 종량 로그인)인지다. 참이면 실행에 `--allow-paid`가 필요하다.
  - `ai-read`는 `detail.pages_skipped`(이미 읽은 페이지)를 함께 준다. `translate`는 `detail.done_blocks`·`detail.total_blocks`를 주고, 보관된 번역과 제공자·모델이 다르면 `detail.provider_change: { stored: { provider, model }, next: { provider, model } }`도 준다.
- **요금 경로**: `metered`인 길에서 `--yes`를 주면서 `--allow-paid`가 없으면 아무것도 보내지 않고 종료 코드 4, `error: "paid_route_not_allowed"`, `detail.route`, `detail.via`.
- **쓸 수 있는 길이 없으면**: 종료 코드 4, `app_unavailable`, `detail.errorCode`(`unavailable`, `not-connected`, `signed-out` 등).
- **한 문서에 작업 하나**: 같은 문서에 작업이 돌고 있으면(같은 프로세스든 다른 프로세스든) 종료 코드 4, `app_unavailable`, `detail.errorCode: "document-job-running"`, `detail.job: { kind, lang?, runId?, progress? }`.
  - `kind`는 `ai-read | translate | translate-page | highlight | summary` 다섯 중 하나다. 뒤의 셋은 앱의 PDF 읽기 도우미(결정 0043)가 도는 중인 작업이다(대역 보기의 페이지 번역, AI 핵심 표시, 긴 문서의 개요). 명령어로 시작할 수는 없지만 "작업 중" 판정에는 모두 든다.
  - `lang`은 `translate`·`translate-page`·`summary`에만, `runId`(AI 핵심 표시의 분류 묶음 열쇠)는 `highlight`에만 있다. `ai-read`에는 둘 다 없다.
  - 사람이 읽는 `message`는 종류마다 다르다(예: `a page translation (de)`, `an AI highlighting`).
- **`pdf translate`는 끝날 때까지 앞에서 돈다.** 진행은 오류 출력(stderr)에 쓴다. `pdf ai-read`도 같다. Ctrl+C는 작업을 `interrupted`로 멈추고 답하게 한다.
- **한도 소진·연속 실패로 멈췄을 때**
  - `--partial`이 없으면 파일을 쓰지 않고 기존 약속대로 실패로 답한다: 종료 코드 4, `error: "app_unavailable"`, `detail.errorCode`(`rate-limit`, `failures` 등), `detail.resetsAt`. 끝난 분량은 `detail.done_blocks`·`detail.total_blocks`로 함께 준다. `ai-read`는 `detail.done_pages`·`detail.total_pages`와 `pages_read`, `pages_failed`를 준다.
  - `--partial`이 있으면(`translate`만) 끝난 부분만 반영하고 나머지는 원문으로 둔 파일을 쓰고 `status: "partial"`로 답한다. 성공 `detail`에 `detail.stopped: { errorCode, resetsAt? }`와 `done_blocks`·`total_blocks`가 더해진다.
  - 다시 실행하면 보관소에서 이어 간다. 끝난 블록과 페이지는 다시 보내지 않는다. `--restart`면 그 언어의 보관된 번역 가운데 사람이 앱에서 고친 블록(`edited`)은 남기고 나머지를 지운 뒤 처음부터 한다. 고친 블록은 끝난 것으로 쳐서 다시 보내지 않는다. 고친 블록까지 지우는 옵션은 없다(앱의 "처음부터 다시 번역"에서 고를 수 있다).
- **사람이 고친 번역**: 앱의 대역 보기에서 고친 블록은 서식 없는 글로 보관되고, `pdf translate`의 결과 파일(PDF·Markdown·EPUB)에 그 글 그대로 쓰인다. 출력 구조와 성공 `detail`의 모양은 바뀌지 않는다. 고친 블록은 `translated_blocks`에 든다.
- **`pdf status`**: 출력 모양은 그대로다. `ai_read`와 `translations`만 보이고, 앱의 페이지 번역·AI 핵심 표시·개요의 작업 기록은 나오지 않는다. 페이지 번역은 번역 작업 기록(`job`)과 진행(`done_blocks`·`total_blocks`)을 바꾸지 않는다.
- **결과 파일 위치**: `--out`이 없으면 원본 옆에 `〈원본 이름〉.〈언어 코드〉.〈확장자〉`로 쓴다. 형식이 하나면 `--out`이 그 파일이고, 여럿이면 `--out`은 형식마다 확장자를 붙일 기준 경로다. 이미 있으면 `--force`가 필요하다(기존 파일 규칙). 실행할 때는 보내기 전에 확인하고, 예상만 답할 때는 경고(`output_exists`)로만 알린다.
- **PDF로 쓸 수 없는 경우**: 목표 언어가 `ar`, `he`, `hi`이거나 PDF가 암호화돼 있으면 `--format pdf`를 보내기 전에 거절한다. 종료 코드 1, `unsupported`, `detail.supported_formats: ["md", "epub"]`.
- 번역할 글이 없는 범위(스캔 문서 등)는 종료 코드 1, `unsupported`이고 `pdf ai-read`를 먼저 권한다.
- 결과 파일을 쓰지 못하면 작업 기록은 `stopped`, `last_error: "output-write-failed"`가 된다. 보관된 번역은 남는다.

## 웹 페이지 읽기 (`read-url`)

`ieumoffice read-url <url> [--offset <n>]`은 http(s) 주소 하나를 그 사이트에서 받아 읽을 수 있는 글로 돌려준다. HTML은 글자로 바꾸고, GitHub `blob` 주소는 raw 주소로 바꿔 읽는다. 주소는 `fetchWithSsrfGuard`를 지나며 사설·루프백 주소와 그런 곳으로 가는 리다이렉트는 거절한다. 한 번에 50,000자를 주고, 이어 읽기는 `--offset`(기본 0)으로 한다. 제공자·구독·자동 호출 장부를 쓰지 않는다. 비공개 GitHub 파일은 설정의 읽기 토큰을 쓰며, 그 토큰은 `api.github.com` 요청에만 실린다.

- 성공 요약: `<host>: characters <offset>..<end> of <totalChars> (continue with --offset <next>)`. 더 읽을 글이 없으면 끝에 `(end)`가 붙는다.
- 성공 `detail`: `{ url, title?, text, offset, totalChars, truncated, nextOffset? }`. `url`은 리다이렉트를 따른 최종 주소, `title`은 페이지 제목이 있을 때, `text`는 이번에 준 글, `offset`은 그 글의 시작 위치, `totalChars`는 글 전체 길이, `truncated`는 뒤에 더 있을 때 참, `nextOffset`은 다음 시작 위치(뒤에 더 있을 때만)다.

| 상황                                   | 종료 | `error`            | `detail`                                 |
| -------------------------------------- | ---- | ------------------ | ---------------------------------------- |
| `<url>` 없음                           | 1    | `missing_argument` | —                                        |
| `--offset`이 0 이상 정수 아님          | 1    | `invalid_argument` | —                                        |
| 주소가 http(s) 아님/형식 오류          | 1    | `invalid_argument` | —                                        |
| 가드 거절(사설·루프백·리다이렉트 문제) | 1    | `unsupported`      | `{ reason: "blocked" }`                  |
| 글 페이지 아님                         | 1    | `unsupported`      | `{ content_type? }`                      |
| 읽을 글자 없음                         | 1    | `unsupported`      | `{ reason: "no_text" }`                  |
| 10MB 초과                              | 4    | `resource_limit`   | `{ max_bytes: 10485760 }`                |
| 연결·DNS·전송 실패                     | 4    | `app_unavailable`  | `{ errorCode: "network" }`               |
| 30초 초과                              | 4    | `app_unavailable`  | `{ errorCode: "timeout" }`               |
| HTTP 상태 2xx 아님                     | 4    | `app_unavailable`  | `{ errorCode: "http_error", status }`    |
| GitHub 인증 실패                       | 4    | `app_unavailable`  | `{ errorCode: "auth" }` + 토큰 확인 제안 |

## `search` · `image` · `media`와 `capabilities`

이 셋은 자동 호출이다. 화면을 보는 사람이 없는 요청이므로 갈 수 있는 길이 제한된다.

| 명령     | 가는 길                                                                                                                                                       |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `search` | 기본은 무료 경로(Parallel 무료 검색 → DuckDuckGo). 이미지 검색은 DuckDuckGo. 앱 설정에서 고른 키 방식 검색 제공자가 있고 키가 있으면 그것. 구독은 쓰지 않는다 |
| `image`  | 키 방식 이미지 제공자만. 없으면 "쓸 수 없음". `--model`은 무시된다(성공 결과의 `detail.note`에 적힌다)                                                        |
| `media`  | 사진은 대화에 쓰는 AI 제공자 또는 고른 키 방식 분석 제공자. 영상·소리는 영상 분석이 되는 키 방식 제공자만                                                     |

- 구독은 사용자가 설정에서 허용했을 때만 쓰인다(기본 꺼짐). 꺼져 있으면 구독이 없는 것처럼 답한다. 켜져 있으면 모든 명령 실행과 MCP 호출을 통틀어 AI 요청을 하나씩 차례로 처리한다. 차례의 단위는 작업이 아니라 요청 하나라서, 긴 PDF 작업도 다른 호출자와 요청마다 번갈아 처리된다. 시간당 한도는 없다.
- 시간당 한도가 있던 예전 경고에 동의해 켜 둔 스위치는 꺼진 것으로 읽는다. 새 경고에 다시 동의해야 켜진다(설정 파일의 `headlessSubscriptionConsentVersion`).
- 사용자가 허용하고 직접 고른 종량 로그인은 구독이 아니라 키 경로로 친다.
- 구독에 로그인된 계정(이메일)과 프로그램의 모델 목록은 이 명령들의 출력 어디에도 나오지 않는다. `capabilities`의 답, 도구 결과, 실행 기록(`cli-audit.jsonl`) 모두 같다. 계정은 앱의 설정 화면에만 보인다.

**`ieumoffice capabilities --json`** 은 모델을 부르지 않고, 위 세 명령이 지금 무엇을 할지 알려 준다. `detail`:

| 항목                                                                                               | 값                                                                                             |
| -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `search`, `image_search`, `image_generation`, `image_analysis`, `video_analysis`, `media_analysis` | 각각 `{ available, via, route, metered?, message? }`                                           |
| `pdf_ai_read`, `pdf_translation`                                                                   | 같은 모양. PDF의 AI 페이지 읽기와 문서 번역이 갈 길(대화에 쓰는 AI 제공자)                     |
| `via`                                                                                              | 누가 답하는지(검색 경로, 키 제공자, 대화용 AI 제공자). 없으면 `null`                           |
| `route`                                                                                            | 비용이 어디로 가는지. `free` \| `key` \| `subscription`. 쓸 수 없으면 `null`                   |
| `metered`                                                                                          | `true`면 쓴 만큼 요금이 나가는 로그인                                                          |
| `message`                                                                                          | 쓸 수 없을 때만 온다. 명령이 실제로 답할 글 그대로다                                           |
| `automatic_calls`                                                                                  | `{ subscription_enabled }`. 켜져 있을 때만 `{ used, limit: null, remaining: null }`이 더해진다 |
| `app`                                                                                              | `{ available }`. 화면이 필요한 변환에 쓸 앱 실행 파일을 찾았는지                               |
| `settings_path`                                                                                    | 이 답을 읽어 온 설정 파일                                                                      |

- `media_analysis`는 예전 호출자를 위해 남긴 항목이다. `image_analysis`와 같고, 영상만 될 때는 `video_analysis`와 같다.
- 웹·이미지 검색은 키 제공자를 고르지 않는 한 항상 `available`이고 `route`는 `free`다.
- `automatic_calls.used`는 최근 한 시간 동안 처리한 자동 호출 수이고 정보용이다. 한도가 없으므로 `limit`, `remaining`은 `null`이고 `resetsAt`은 오지 않는다.

**실패.** 세 명령이 실행될 수 없으면 종료 코드 4, `error: "app_unavailable"`.

| `detail.errorCode`                                                                                                                                    | 뜻                                                                | 다시 시도                          |
| ----------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | ---------------------------------- |
| `unavailable`                                                                                                                                         | 그 기능에 설정된 것이 없다                                        | 하지 않는다. 설정을 바꿔야 한다    |
| `headless-limit`                                                                                                                                      | 더 이상 쓰이지 않음. 자동 호출의 시간당 한도가 없어져 내지 않는다 | 해당 없음                          |
| `rate-limit`                                                                                                                                          | 구독 한도 소진                                                    | `detail.resetsAt`이 있으면 그 이후 |
| `free-limit`                                                                                                                                          | 무료 연결의 오늘 사용량 소진                                      | `detail.resetsAt`이 있으면 그 이후 |
| `http_error`                                                                                                                                          | 서버가 2xx가 아닌 상태로 답함(`read-url`)                         | 주소를 확인한 뒤 다시              |
| `auth`                                                                                                                                                | GitHub가 읽기 토큰을 거절함(`read-url`)                           | 설정의 GitHub 읽기 토큰을 확인     |
| `not-connected`, `signed-out`, `not-installed`, `metered-not-accepted`, `needs-update`, `unsafe-tools`, `timeout`, `network`, `overloaded`, `credits` | 실행이 그 이유로 실패                                             | 이유에 따라                        |

## MCP 서버 (`ieumoffice mcp`)

- 표준 입출력으로 같은 명령들을 도구로 내놓는다. `--http <포트>`를 주면 Streamable HTTP로 내놓는다(`--host`, `--token`).
- 등록 예: `claude mcp add --transport stdio ieumoffice -- ieumoffice mcp`. `ieumoffice mcp install <에이전트|all>`이 각 에이전트의 설정 파일에 `ieumoffice` 항목만 쓴다. 같은 이름의 항목이 다른 프로그램을 가리키면 `occupied`로 알리고 `--force` 없이는 건드리지 않는다.
- 도구는 명령 동사마다 하나다(`docs_read`, `docs_apply`, `sheet_apply`, `slides_render`, `convert`, `read_url`, `pdf_read`, `pdf_images`, `pdf_ai_read`, `pdf_translate`, `pdf_status` 등). 매개변수는 명령의 옵션 목록에서 그대로 나온다(`allow-paid`는 `allow_paid`, `no-cover`는 `no_cover`). 두 표면이 어긋나지 않는다.
- `pdf_ai_read`·`pdf_translate`는 `yes`가 없으면 명령처럼 예상만 답한다. `yes`가 있으면 작업을 MCP 서버 프로세스 안에서 띄우고 바로 답한다(`detail.started: true`, `detail.estimate`). 진행, 멈춘 이유, `resetsAt`, 결과 파일 경로는 `pdf_status`의 `job`으로 본다. 이어하기는 같은 도구를 다시 부르면 된다.
- 그 결과 파일은 작업이 끝날 때 쓴다. `partial: true`로 부른 작업은 멈출 때 끝난 부분만 반영해 쓴다. 위치 규칙은 명령어와 같고, 경로는 `job.outputs`로 알려 준다.
- 서버가 끝나면 그 작업도 멈춘다(`last_error: "interrupted"`). 보관된 결과는 남는다.
- 결과는 `--json`이 내는 것과 같은 객체다. 실패는 `isError`와 같은 `error` 이유로 온다.
- 환경변수 `GENOFFICE_MCP_COMPACT_SCHEMAS`는 예전 철자를 유지한다. `--http`의 토큰은 `--token`, 없으면 `GENOFFICE_MCP_TOKEN`에서 읽고, 둘 다 없으면 인증 없이 받는다. 에이전트 설정 폴더를 찾을 때의 홈 폴더는 `GENOFFICE_HOME`으로 바꿀 수 있다.
- 안내 자료는 리소스로도 내놓는다(`ieumoffice://guide/docs`, `…/sheets`, `…/slides`, `…/slides/design`, `…/slides/spec`, `…/slides/templates`, 내장 템플릿마다 `…/slides/templates/<id>`).
- 내장 디자인 템플릿은 `ieumoffice guide slides templates [<id>]`로 고른다. 목록의 `--json`은 `detail.templates`(`[{ id, name, scheme, description, fonts }]`, 정해진 순서), 템플릿 하나는 `detail`(`{ id, name, scheme, description, fonts, styleSheet }`)이다. 모르는 id는 종료 코드 1, `error: "invalid_argument"`, `detail.templates`에 쓸 수 있는 id 목록이다. MCP `guide` 도구는 세 번째 위치 인자 `name`으로 id를 받는다.
- 앱의 설정 → 연동 화면이 지금 설치본에 맞는 등록 예시를 보여 준다.

## 앱 안 MCP 서버

명령어 쪽 서버와 다른 것이다. 실행 중인 앱이 직접 여는 서버이고, 열려 있는 문서를 다룬다.

- 설정 → 연동에서 켠다. 기본은 꺼짐이다. 기본 포트는 3093이고 이 PC(`127.0.0.1`)에서만 닿는다. 인증은 없고, 요청의 Host·Origin이 이 PC의 것이 아니면 거절한다.
- 도구: `get_app_info`, `open_documents`, `open_in_genoffice`(이 이름은 예전 철자를 유지한다), `create_session`, `save_session`, `read_document`, `read_docx`, `read_sheet`, `read_deck`, `read_pdf`, `create_docx`, `create_xlsx`, `create_pptx`, `apply_ops`, `apply_sheet_ops`, `apply_slide_ops`, `insert_content`, `replace_blocks`.
- 열린 ODT 탭은 워드 문서로 다룬다(`open_documents`의 `format`이 `odt`). `read_docx`는 `.odt` 파일도 읽는다. `save_session`은 탭의 형식으로만 저장한다. 다른 확장자의 경로를 주면 거절하고 `ieumoffice convert`를 쓰라고 안내한다. 대화 상자가 없는 경로에서 형식이 조용히 바뀌지 않게 하기 위해서다.
- 에이전트 설정에 넣는 항목 이름은 `ieumoffice-editor`다. 명령어 쪽 서버의 `ieumoffice`와 겹치지 않는다.
- 에이전트 모드(결정 0032)의 세션 MCP 서버는 이것과 별개다. 앱이 띄운 프로그램만 쓰고, 세션마다 운영체제가 고른 포트와 새 토큰(`Authorization: Bearer`)을 요구하며, 도구는 `open_documents`(`list`·`read`만), `read_document`, `insert_content`, `replace_blocks`, `apply_ops`, `read_sheet`, `apply_sheet_ops`, `read_deck`, `apply_slide_ops`, `read_hwp`, `read_pdf`다. 읽기는 가린 자리를 `{{이름}}`으로 내보내고, `read_hwp`·`read_pdf`는 프로젝트 폴더 안만 읽는다. 결정 0048·0049로 `propose_skill`(에이전트 창에 스킬 카드를 띄움)과 `propose_skill_install`(깃허브 설치 미리보기를 띄움)이 더해져 13개다. 둘 다 파일을 쓰지 않는다. 바깥 호출자에게 약속하는 출력이 아니다. 위 서버의 출력은 바뀌지 않는다.
- `open_documents`의 목록에 마인드맵 탭이 `kind: "mindmap"`, `type: "mind map"`으로 나온다(떼어 낸 창도 같다). `read`의 `content`는 지금 지도의 개요 글 문자열이고 저장하지 않은 편집이 들어 있다. 마크다운·HTML 탭의 읽기와 같은 모양이다. `close`의 저장은 편집기의 저장과 같은 길을 지나고, 한 번도 저장하지 않은 지도는 기본 저장 폴더에 겹치지 않는 이름의 `.xmind`로 저장된다. `ok`로 열리지 않은 지도는 어떤 경우에도 쓰지 않는다. 지도를 만들거나 고치는 도구는 없다.
- `get_app_info`의 `families`에 `{ family: "xmind", label: "mind map", editor: { open: ["xmind"], save: ["xmind"], export: ["png", "pdf", "md"] } }`가 있다. `mcp` 항목은 없다.

## 에이전트 스킬

- 이름과 폴더는 `ieumoffice`다. 저장소의 `skills/ieumoffice/SKILL.md`가 원본이고, 앱의 설정 → 연동에서 고른 에이전트에 설치한다. 터미널에서는 `npx skills add pblsketch/openoffice`.
- 스킬 문서는 사용자의 에이전트 폴더로 복사되고, 문서의 `metadata.version`이 커졌을 때만 새것으로 바뀐다. 본문을 고치고 버전을 올리지 않으면 고친 내용이 아무에게도 닿지 않는다(검사 `npm run check:skill-version`).
- 스킬과 도움말이 에이전트에게 알려 주는 명령은 모두 `ieumoffice`로 시작한다.
- 이 스킬은 앱 안의 사용자 스킬 목록에는 나오지 않는다(이름 `ieumoffice`는 어느 출처에서든 읽지 않는다, 결정 0048).

## 사용자 스킬 (결정 0048)

앱 안에서 쓰는 스킬이다. 위 "에이전트 스킬"(바깥 에이전트에 설치하는 것)과 다르다. 터미널 명령어 `ieumoffice`와 그 MCP 서버는 사용자 스킬을 쓰지 않는다.

**스킬 폴더 형식.** 공개 표준을 따른다. 폴더 하나에 `SKILL.md`가 있고, 앞머리에 `name`(1~64자)과 `description`이 있어야 한다. 이음오피스는 표준의 `metadata`에 두 값을 쓴다. 다른 프로그램은 이 값을 무시해도 스킬이 동작한다.

```yaml
---
name: home-letter
description: 가정통신문을 학교 말투로 쓴다.
metadata:
  ieum-title: 가정통신문
  ieum-template: assets/양식.hwpx
---
```

- `ieum-title`: 화면과 `/` 목록의 제목. 없으면 `name`.
- `ieum-template`: 스킬 폴더 안 `assets/` 아래 양식 문서의 상대 경로.
- 이음오피스가 새로 만드는 이름은 소문자·숫자·하이픈만 쓰고, 하이픈으로 시작하거나 끝나지 않으며 `--`가 없다.

**깃허브 출처 기록(`〈스킬 폴더〉/.ieum-source.json`).** 깃허브에서 설치한 스킬에만 있다. 내보내기(zip)에는 들어가지 않는다.

```json
{
  "kind": "github",
  "repo": "owner/repo",
  "ref": "main",
  "path": "skills/meeting-minutes",
  "commit": "68e58890cbc67c797d1356a6558adc5b12148fd4",
  "installedAt": "2026-10-21T09:00:00Z",
  "contentHash": "설치한 폴더(이 파일 제외)의 경로·크기·내용 sha256"
}
```

**앱 설정(`app-settings.json`)의 값.** 데이터 폴더에 있다.

| 값                      | 종류                                                                                           | 기본                   |
| ----------------------- | ---------------------------------------------------------------------------------------------- | ---------------------- |
| `skills.states`         | 식별자 → `{ enabled?, invoke?: 'auto' \| 'manual' }`. 사람이 바꾼 것만 적는다                  | 없음(출처별 처음 상태) |
| `skills.hiddenBuiltins` | 숨긴 기본 스킬 이름 목록                                                                       | 없음                   |
| `agentSkillNoticeSeen`  | 참/거짓. 에이전트 창의 스킬 안내를 봤는지                                                      | 없음                   |
| `agentProjectPrefs`     | 프로젝트 폴더 절대 경로 → `{ codexWebSearch: 'cached' \| 'live' \| 'disabled', codexNetwork }` | 없음(`cached`, 거짓)   |

- 식별자는 `〈출처〉:〈이름〉`, 플러그인은 `plugin:〈플러그인〉:〈이름〉`이다. 출처 값은 `builtin`(기본), `app`(`~/.ieumoffice/skills`, 깃허브 포함), `user`(`~/.claude/skills`), `plugin`(설치된 Claude 플러그인), `codex`(`~/.agents/skills`)다. 저장되는 값이라 바꾸지 않는다. 프로젝트 스킬(`project`)은 저장하지 않는다.
- 알 수 없는 값은 무시하고 처음 상태로 읽는다. 처음 상태는 `builtin`·`app`이 켜짐·스스로 쓰기, `user`·`plugin`·`codex`가 꺼짐이다.

## 설정 파일 (`ai-settings.json`)

데이터 폴더(`%APPDATA%\IeumOffice`, 개발 실행은 `IeumOffice-Dev`)에 있다. 사람이 직접 고칠 수 있고, 명령어와 MCP는 읽기만 한다.

| 값                                   | 종류                                             | 기본                                                       |
| ------------------------------------ | ------------------------------------------------ | ---------------------------------------------------------- |
| `provider`                           | `auto` 또는 제공자 식별자                        | `auto`                                                     |
| `providers`                          | 제공자별 `{ apiKey, model, baseUrl?, cliPath? }` | 빈 표                                                      |
| `meteredAccepted`                    | 구독 제공자별 참/거짓                            | 거짓                                                       |
| `headlessSubscriptionEnabled`        | 참/거짓. 자동 호출 경로의 구독 사용              | 거짓                                                       |
| `headlessSubscriptionConsentVersion` | 자동 호출 스위치를 켤 때 동의한 경고의 판(정수)  | 없음                                                       |
| `subscriptionNoticeSeen`             | 참/거짓. 첫 연결 안내를 봤는지                   | 거짓                                                       |
| `customEndpoints`, `customEndpoint`  | 직접 운영하는 서버 목록과 지금 쓰는 것의 식별자  | 없음                                                       |
| `maxOutputTokens`                    | 모델 한 차례의 출력 상한                         | 코드의 기본값                                              |
| `media`, `search`                    | 이미지·분석·검색 제공자 선택과 그 키             | 이미지 분석은 `chat`, 영상 분석은 `none`, 검색은 무료 경로 |
| `readUrl`                            | `{ githubToken }`                                | 없음                                                       |

- `readUrl.githubToken`은 비공개 GitHub 파일을 읽는 읽기 토큰이다. 설정 파일에 평문으로 저장되고(AI 키와 같다), `api.github.com` 요청에만 실린다. 다른 사이트나 리다이렉트 홉에는 보내지 않는다.
- `headlessSubscriptionEnabled`가 참이어도 `headlessSubscriptionConsentVersion`이 지금 경고의 판(2)보다 작거나 없으면 꺼진 것으로 읽는다. 판 1은 시간당 한도가 있던 예전 경고이고, 그때는 판을 저장하지 않았다.
- 이미지 생성 제공자의 저장값 기본은 `codex`다. Codex 구독 이미지 생성이 들어 있지 않은 지금은 `none`(선택 없음)과 똑같이 동작한다.
- 구독 제공자의 식별자는 `claude-code`, `codex`다. 인증 방식은 `claude-subscription`, `codex-chatgpt`, `api-key` 셋이다.
- 모르는 제공자 식별자나 없어진 값이 있어도 오류 없이 읽는다. 그 자리는 기본값이 되고, 다음에 앱이 저장할 때 지워진다.
- `providers` 표가 아예 없는 파일은 제공자 설정 이전의 파일로 읽혀, 다른 값까지 기본값이 된다.
- 종량 허용은 이 파일의 값만으로는 유효하지 않다. 같은 폴더의 기록(`subscription-metered.json`)에 적힌 로그인 종류가 지금 감지된 것과 같아야 한다.
- 구독 제공자의 `model`에는 프로그램이 받는 값이 그대로 들어간다(Claude의 `opus`·`claude-opus-5-5` 같은 별칭이나 식별자, Codex의 모델 식별자). 빈 값은 프로그램의 기본 모델이다. 화면에 보이는 표시 이름은 저장하지 않는다.
- 구독에 로그인된 계정은 이 파일에도, `subscription-metered.json`에도 적히지 않는다. 그 기록에 남는 것은 로그인 방식의 종류뿐이다.

## 출처 기록 (`document-links.json`)

같은 데이터 폴더에 있다. 만들기로 만든 문서가 어떤 자료에서 왔는지를 적는다. 문서 파일 안에는 아무것도 넣지 않는다.

```json
{
  "version": 1,
  "links": [
    {
      "derived": "C:\\Users\\me\\Documents\\slides.pptx",
      "sources": ["C:\\Users\\me\\Documents\\notes.docx"],
      "createdAt": "2026-10-14T09:00:00.000Z",
      "via": "ai"
    }
  ]
}
```

| 값          | 뜻                                                                 |
| ----------- | ------------------------------------------------------------------ |
| `derived`   | 만든 문서의 절대 경로. 기록 사이에 겹치지 않는다                   |
| `sources`   | 넘겨받은 자료의 절대 경로 목록. 한 자료가 여러 기록에 나올 수 있다 |
| `createdAt` | 기록을 적은 시각(ISO 8601)                                         |
| `via`       | `ai`(만들 문서 쪽 편집기의 AI로 만듦) 또는 `convert`(AI 없이 바꿈) |

- 요청 글은 적지 않는다.
- 앱이 임시 파일에 쓴 뒤 바꿔치기한다. 읽을 수 없거나 망가진 파일은 빈 기록으로 읽고, 다음 기록을 적을 때 새 파일로 바뀐다.
- 앱 안에서 이름을 바꾸거나 옮기면 `derived`와 `sources`의 경로가 따라간다. 디스크에 없는 파일이라는 이유로 기록을 지우지 않는다.
- 터미널 명령어와 MCP는 이 파일을 읽지도 쓰지도 않는다.

## Google 드라이브 (결정 0033)

같은 데이터 폴더에 둘이 있다. 터미널 명령어와 MCP는 둘 다 읽지도 쓰지도 않는다.

- `google-drive.json`: `{ "version": 1, "token": "<base64>" }`. `token`은 운영체제 암호화(Electron `safeStorage`, Windows는 DPAPI)로 감싼 갱신 토큰이다. 다른 사용자나 다른 PC에서는 풀리지 않고, 풀리지 않는 파일은 연결이 없는 것으로 읽는다. 암호화를 쓸 수 없는 PC에서는 이 파일을 만들지 않는다. 연결 끊기와 Google의 연결 종료(`invalid_grant`)에 지운다.
- `drive-cache/`: 연 드라이브 파일의 PC 사본. 파일마다 `drive-cache/<드라이브 파일 id>/<이름>`이고, `drive-cache/index.json`이 사본과 드라이브 파일을 잇는다. 항목에는 드라이브 파일 id, 이름, 상위 폴더 id, PC 경로, 마지막으로 맞춘 내용의 해시(SHA-256)와 드라이브 쪽 해시(MD5)·변경 시각, 저장이 갈 드라이브 파일 id, "이 PC에만 저장"을 골랐는지, 마지막으로 연 시각이 있다. 문서 내용은 사본 파일에만 있다. 한 달 동안 열지 않았고 올리지 못한 변경이 없는 사본은 시작할 때 지운다.

`app-settings.json`의 `driveAiAccess`(참/거짓, 기본 참)는 편집기의 AI가 드라이브를 찾고 읽어도 되는지다. 드라이브가 연결돼 있을 때만 뜻이 있다.

창구 이름은 `drive:state`, `drive:connect`, `drive:cancel-connect`, `drive:disconnect`, `drive:set-ai-access`, `drive:list`, `drive:open`과 변경 알림 `drive:state-changed`, 편집기 AI용 `drive:ai-enabled`, `drive:ai-search`, `drive:ai-read`, 편집기 첨부용 `drive:connected`, `drive:pick-attachments`다. 고르기 창만 쓰는 창구는 `drive-picker:get-init`, `-list`, `-choose`, `-cancel`이고, 그 창이 아닌 곳에서 오면 답하지 않는다. 토큰은 어느 창구로도 화면에 나가지 않는다.

빌드: `GENOFFICE_GOOGLE_CLIENT_ID`(`….apps.googleusercontent.com`)와 `GENOFFICE_GOOGLE_CLIENT_SECRET`이 껍데기 앱을 빌드하는 환경에 있을 때만 드라이브가 들어간다. 없으면 상태는 `unavailable`이고 화면에 드라이브가 나오지 않는다.

## 구독 연결 상태 (앱 안의 창구)

앱 안에서 뒷단이 화면에 주는 값이다. 바깥 프로그램에는 나가지 않는다.

| 항목              | 값                                                                                   |
| ----------------- | ------------------------------------------------------------------------------------ |
| `provider`        | `claude-code` \| `codex`                                                             |
| `state`           | `checking` \| `not-installed` \| `signed-out` \| `ready` \| `metered` \| `error`     |
| `version`         | 프로그램 버전(있을 때)                                                               |
| `loginMethod`     | `subscription` \| `metered` \| `unknown`                                             |
| `planName`        | 요금제 이름(프로그램이 알려 줄 때, 표시용)                                           |
| `account`         | 로그인된 계정의 이메일(프로그램이 알려 줄 때, 표시용, 저장 금지)                     |
| `models`          | 프로그램이 알려 준 모델 목록(있을 때). 항목은 `{ id, label, resolved?, isDefault? }` |
| `meteredAccepted` | 참/거짓                                                                              |
| `error`           | 오류 내용(`error`일 때)                                                              |
| `programPath`     | 확인에 쓴 프로그램 파일의 절대 경로(버전이 낮은 `error`일 때만, 표시용)              |

- `account`와 `models`는 `ready`·`metered`일 때만 있다. `account`는 이메일 주소 모양이 아니면 빠진다.
- `programPath`는 버전이 낮은 `error`(`needs-update`)일 때만 있다. 한 줄짜리 절대 경로(드라이브, `\\` 공유, `/`로 시작)가 아니면 빠진다.
- `models`의 `id`는 프로그램이 받는 값이자 저장되는 선택값이다. 빈 `id`는 프로그램의 기본 모델을 뜻하고, 그것이 가리키는 모델이 `resolved`에 온다. 목록은 50개까지다.
- 창구 이름은 `ai:subscription-statuses`, `-recheck`, `-login`, `-logout`, `-install`, `-metered`, `-codex-image`와 변경 알림 `ai:subscription-changed`다. `-logout`은 껍데기 앱의 화면에서만 부른다.

## 문서 호환

- `.docx`·`.xlsx`·`.pptx`·PDF·마크다운·HTML 파일은 원본 프로그램과 같은 방식으로 읽고 쓴다. 한쪽에서 만든 문서를 다른 쪽에서 열 수 있다.
- **마인드맵.** XMind 파일(`.xmind`, `content.json`이 든 형식)을 열고 같은 형식으로 저장한다. 이 앱이 보여 주지 않는 요소와 모르는 값도 저장할 때 그대로 나가고, 바뀐 것이 없으면 원본과 바이트까지 같은 파일을 쓴다. 바뀌었으면 `content.json`만 다시 쓰고, 미리보기 그림(`Thumbnails/thumbnail.png`)은 새로 만들었을 때만 바꾸며, `manifest.json`은 고치지 않는다. 예전 형식(`content.xml`만 있는 파일)과 암호가 걸린 파일은 열지 않는다. 테마는 사용자가 고를 때와 새 시트를 만들 때(새 파일 포함, 기본 테마) 파일 형식의 속성표로 적고, 이 앱만의 표식은 넣지 않는다. 그 밖에는 이미 있는 시트의 테마를 그대로 둔다. 터미널 명령어와 그 MCP 서버는 `.xmind`를 다루지 않는다.
- **그림(Excalidraw).** Obsidian Excalidraw 플러그인의 그림 노트(`.excalidraw.md`, 또는 앞머리에 `excalidraw-plugin`이 있는 `.md`)와 `.excalidraw`(JSON)를 열고 같은 형식으로 저장한다. 새 그림은 그림 노트로 만든다. 노트에서 저장 때 다시 쓰는 곳은 `Text Elements` 목록과 `Drawing` 블록의 내용뿐이고, 앞머리·본문·`Embedded Files`·줄 끝·BOM·블록 방식(`compressed-json`·`json`)은 그대로다. 바뀐 것이 없으면 원본과 바이트까지 같은 파일을 쓴다. 노트가 가리키는 그림은 보관함 안에서 읽어 보여 주기만 하고 파일에 넣지 않는다. 터미널 명령어와 그 MCP 서버는 그림 파일을 다루지 않는다(결정 0060).
- **열기 암호.** 열기 암호가 걸린 `.docx`·`.xlsx`·`.xlsm`·`.xls`·`.pptx`는 열 때 암호를 묻고, 저장(다른 이름으로 저장 포함)할 때 같은 암호로 다시 잠근다. 다시 잠그는 방식은 Office 2013 이후의 기본(ECMA-376 Agile)이다. 수정 암호만 걸린 `.xls`처럼 엑셀의 기본 암호로 잠긴 파일은 묻지 않고 열며, 그런 `.xls`를 `.xlsx`로 저장하면 열기 암호를 걸지 않는다. 풀 수 없는 방식이면 열지 않고 알린다(결정 0041).
- 가리기 표시는 문서 안에 저장되고, 그 이름공간 주소는 원본과 같다. 원본으로 가린 문서를 열면 가리기가 그대로 인식된다.
- 문서 곁에 저장되는 보조 파일의 이름(`.genoffice-assets.json` 등)도 원본과 같다.
- `.odt`는 한컴 한글 2024가 읽은 결과를 기준으로 맞춘다. 받은 ODT를 고쳐 저장하면 고친 부분만 다시 쓰고, 나머지 zip 항목과 XML은 바이트 그대로다. 고친 것이 없으면 원본과 같은 파일이 나온다. 다시 묶을 때 `mimetype`을 맨 앞에 압축 없이 둔다(한컴은 이것을 받은 파일과 똑같이 읽는다). 한컴이 아닌 프로그램의 ODT도 같은 규칙으로 열지만, 합격 기준에는 넣지 않았다.
- 문서 안에 적히는 작성자 이름(PDF 주석 작성자, 엑셀 메모 작성자, 명령어가 넣는 메모 작성자)은 지금 "GenOffice"다. PDF 편집기에서 사람이 새로 단 메모와 구절 카드를 "메모로 남기기"한 메모는 PC 계정 이름이다(모를 때만 "GenOffice").
- PDF 편집기에서 받아들인 AI 핵심 표시는 표준 형광펜(`/Highlight`)이고, 분류 이름이 주석 제목(`/Subj`, 앞뒤 공백을 떼고 200자까지)에 들어간다. 이 값이 없는 주석의 저장 결과는 예전과 바이트 단위로 같다. 구절 카드에서 남긴 메모는 표준 `/Text` 메모이고, 내용 첫 줄이 화면 언어의 "AI 설명" 또는 "AI 번역(언어)"이다.
- 파워포인트 편집기에서 고른 디자인 템플릿은 문서 안이나 곁에 쓰지 않는다. 문서에 남는 것은 평범한 도형·글·글꼴 이름뿐이다.
- 저장한 스타일 파일(`<데이터 폴더>/style-templates/<이름>.json`)에는 선택 항목 `basedOn`(기본 템플릿의 id)이 붙을 수 있다. 이 값을 모르는 예전 버전은 무시하고 그대로 읽는다.
- 한글 문서(`.hwp`·`.hwpx`)는 연 형식 그대로 저장한다. 한 탭이 파일을 처음 덮어쓰기 전에 원본을 같은 폴더에 `<파일 이름>.bak`으로 남긴다. 암호가 걸린 문서는 저장하지 않는다. AI는 한글 문서에서 글자를 바꾸고, 문단을 넣고 지우고, 본문에 표를 넣고, 있는 표의 빈 칸을 채우고(글자가 있는 칸은 사용자가 바꾸라고 했을 때만 덮어쓰고, 그림이 든 칸은 쓰지 않는다), 본문의 표에 행과 열을 넣고 빼고, 첨부한 파일(한글·워드·엑셀·파워포인트·PDF·글자 파일·그림)을 참고 자료로 읽고, 사용자가 편집기에서 선택한 부분만 고치고, 글자 모양 일부(굵게·기울임·밑줄·취소선·크기·색·형광펜)와 문단의 정렬·줄 간격을 바꾸고, 누름틀을 채운다. 표·그림·누름틀이 놓인 문단은 지우지 않는다.
- 한글 문서는 편집기 밖에서 읽기만 한다. 홈의 파일 검색과 지식 자료, 다른 편집기 AI의 첨부, 터미널 명령어(`ieumoffice hwp read`, `info`), MCP(앱의 `read_hwp`, 명령어 쪽의 `hwp_read`)가 글자를 읽는다. 문단은 한 줄로, 표는 행마다 칸을 `|`로 이어 적는다. MCP의 열린 문서 읽기는 한글 탭의 저장하지 않은 내용까지 읽고, 저장은 하지 않는다. 암호가 걸린 문서는 읽지 않는다. 터미널 명령어와 MCP로 한글 문서를 만들거나 고치지 않는다.

## 설치본과 업데이트

- 설치 파일 이름은 `IeumOffice-Setup-<버전>.exe`, 설치 식별자는 `io.github.pblsketch.ieumoffice`, 실행 파일은 `IeumOffice.exe`다.
- 파일 연결의 등록 이름은 `IeumOffice.<종류>` 꼴이다(`IeumOffice.WordDocument` 등).
- 이음오피스는 Windows 기본 앱 목록에 `RegisteredApplications`의 `IeumOffice`와 `Software\IeumOffice\Capabilities\FileAssociations`로 오른다. 이 등록은 기본 프로그램을 바꾸지 않고, 사용자가 기본 앱에서 이음오피스를 고를 때 앱 실행 파일이 아니라 확장자별 ProgId(문서 아이콘)가 기록되게 한다. `.hwp`·`.hwpx`·`.xmind`·`.excalidraw`·`.odt`는 여기서도 "연결 프로그램" 후보일 뿐이다.
- `.odt`는 "연결 프로그램" 후보로만 등록한다(`IeumOffice.OpenDocumentText`와 `.odt\OpenWithProgids`의 값 하나, `apps/shell/build/installer.nsh`). 기본 프로그램은 바꾸지 않는다. 지울 때는 그 값과 등록 이름만 지운다.
- `.excalidraw`는 "연결 프로그램" 후보로만 등록한다(`IeumOffice.Drawing`, 그림 아이콘 `excalidraw.ico`). Mac·Linux에서도 대체 처리기(`Alternate`)로만 오른다. Obsidian 그림 노트(`*.excalidraw.md`)는 `.md` 연결로 열리고, 껍데기 앱이 그림 편집기로 보낸다.
- Windows 설치본은 `.txt`·`.json`·`.xmind`·`.excalidraw`를 이 앱에 연결해 등록하지 않는다. 설치해도 그 파일들의 기본 프로그램이 바뀌지 않는다. 앱 안에서는 열기 창, 끌어다 놓기, 최근 파일, 폴더 나무로 열고, 실행 인자로 경로를 받으면 연다.
- 자동 업데이트는 `pblsketch/openoffice`의 GitHub 릴리스에서 `latest.yml`과 설치 파일을 읽는다. 릴리스는 `v<버전>` 태그여야 한다.
