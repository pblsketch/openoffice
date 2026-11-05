# 바깥에 내놓는 약속

이 프로그램을 밖에서 쓰는 쪽은 일곱이다. 터미널 명령어를 부르는 스크립트와 에이전트, 명령어 쪽 MCP 클라이언트, 앱 안 MCP 서버에 붙는 클라이언트, 사용자의 설정 파일, 원본 프로그램과 주고받는 문서, 프로젝트 폴더의 `.ieumoffice/`를 읽거나 고치는 사람과 다른 프로그램, 그리고 앱이 클라이언트로 붙는 사용자 MCP 서버(결정 0100).

## 공통

- 모든 바깥 이름은 `ieumoffice`다. 명령어, MCP 등록 이름, 에이전트 스킬 이름과 폴더, 홈 폴더 아래 `.ieumoffice`, 프로젝트 폴더 안의 `.ieumoffice`.
- 원본이 쓰는 이름(`genoffice` 명령어, `~/.genoffice`, `genoffice` 연동 항목과 스킬 폴더)은 읽지도 쓰지도 않는다. 두 프로그램은 한 PC에 함께 있을 수 있다.
- 문서 명령은 PC 안에서 끝난다. 밖으로 무언가를 보내는 명령은 `search`, `image`, `media`, `read-url`, `pdf ai-read`, `pdf translate`, `epub translate` 일곱뿐이다. 뒤의 셋은 `--yes`가 있을 때만 보낸다.

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
- ODT에서 꺼 둔 기능의 편집(메모, `--track`, 변경 내용 받아들이기·되돌리기, 목차, 수식, 차트, 글상자, 다단, 워터마크, 콘텐츠 컨트롤 감싸기·풀기, 그림 번호·상호 참조·인용·목차 같은 `insertField` 필드)은 `unsupported`, 한컴에서 잠근 칸과 잠긴 개체를 고치는 편집은 `op_rejected`로 거절한다. 묶음 처리는 docx와 같다. 기본은 하나라도 거절되면 묶음 전체를 쓰지 않고, `--best-effort`·`--stop-on-error`일 때만 나머지를 쓰고 `status: "partial"`로 답한다.
- `convert`가 받는 경로: `odt → docx | pdf | md | html`, `docx | md | html → odt`. `odt → pdf | html`과 `html → odt`는 임시 docx를 거쳐 앱으로 내보내고, 그 임시 파일은 실패해도 지운다.
- 바꾸는 중에 모양이 바뀌거나 빠지는 것이 있으면 파일은 쓰고, 항목마다 `warnings[]`로 알린다. 코드는 `odt_converted`(바뀜)와 `odt_dropped`(빠짐)다. 같은 목록이 `detail.odt_report`에 `[{ kind: "converted" | "dropped", feature, count }]`로 온다. `feature`는 바뀌지 않는 식별자다: `toc`, `chart`, `equation`, `shape`, `textbox`, `columns`, `citation`, `cross_reference`, `page_color`, `mirror_margins`, `theme`, `comment`, `revision`, `ink`, `watermark`, `password`, `protection`, `form_field`, `object`.
- 암호가 걸린 ODT는 열지 않는다. 종료 코드 2, `error: "unsupported"`, `suggestion`은 "암호를 푼 뒤 다시 시도하라"다.

**옛 워드 문서(`.doc`·`.dot`).**

- `convert <file.doc|.dot> --to docx`만 받는다. 앱을 띄우지 않고 `@genoffice/doc2docx`로 바꾼다. `.doc`로 다시 쓰는 길은 없다.
- 바꾸며 빠지거나 바뀐 것은 파일을 쓰고 `detail.warnings`에 적는다. 암호가 걸린 문서, Word 97보다 오래된 판, 깨진 파일은 종료 코드 3으로 끝나고, `detail.reason`에 `doc2docx`의 이유 코드(`encrypted`, `unsupported_version`, `not_cfb`, `corrupt` 등)가 온다.

**엑셀 외부 연결(`sheet links`).**

- `sheet links <file.xlsx>`는 수식이 `[n]`으로 가리키는 다른 통합 문서 목록을 읽기만 한다. `detail.links[]`의 `index`가 수식의 `[n]`, `source`가 푼 경로, `reachable`이 그 파일이 있는지다.
- `--update`는 닿는 원본을 다시 읽어 계산한 값을 수식의 저장된 값(`<v>`)에만 쓴다. 수식은 그대로이고, 닿지 않는 연결은 예전 값을 둔다. `--break <1부터 센 번호들>`은 그 연결을 끊는다. 수식은 저장된 값이 되고 연결 파트를 지우며, 남은 연결의 번호를 다시 매긴다. 둘을 함께 주면 종료 코드 1, `invalid_argument`.
- 쓰는 두 옵션은 `sheet apply`와 같은 파일 규칙(`--out`, `--force`, 허용 폴더, 앱에 열린 파일)을 따른다.

## PDF 명령

`pdf read`, `pdf images`, `pdf status`와 `convert`는 PC 안에서 끝난다. `pdf ai-read`와 `pdf translate`는 아래 "AI를 부르는 PDF 명령"의 규칙을 따른다.

| 명령                                                                                                                                                                                        | 동작                                                                                                                                                                                                                                                           |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `convert <file.pdf> --to md\|epub [--pages <목록>] [--password <pw>] [--out <경로>] [--force]`                                                                                              | 다시 흐르는 글로 바꾼다. Markdown은 그림을 옆의 `assets/`에 쓴다. 이 프로그램이 쓰지 않은 같은 이름의 파일이 거기 있으면 종료 코드 2, `output_exists`                                                                                                          |
| `convert … --to epub [--title <글>] [--author <글>] [--no-cover] [--page-breaks]`                                                                                                           | 제목·저자는 PDF 정보에서, 없으면 파일 이름에서 가져온다. 표지는 첫 페이지이고 기본으로 켜져 있다. `--page-breaks`는 원본 쪽마다 XHTML 파일을 하나씩 써서 리더가 쪽마다 새 화면에서 시작하게 한다. 이 옵션들을 다른 경로에 주면 종료 코드 1, `invalid_argument` |
| `pdf read … --structured`                                                                                                                                                                   | 페이지별 `text`가 문서 나무의 구조화 글(제목 `#`, 목록, 표, `[figure]` 캡션, 각주)이다. `detail.structured: true`. 범위는 `--page`/`--range`를 그대로 쓰고, 나머지 출력 모양도 `pdf read`와 같다                                                               |
| `pdf images <file.pdf> --out <폴더> [--pages <목록>] [--password <pw>]`                                                                                                                     | 페이지에 그려진 그림을 원래 해상도의 PNG로 `<이름>-p<페이지>-<n>.png`에 쓴다. 이미 있는 파일은 바꾸지 않고 이름 뒤에 ` (2)`를 붙인다                                                                                                                           |
| `pdf ai-read <file.pdf> --pages <목록> [--yes] [--allow-paid] [--password <pw>]`                                                                                                            | 페이지 그림을 AI 제공자에게 한 페이지씩 보내 읽힌다. 이미 읽은 페이지는 보내지 않는다                                                                                                                                                                          |
| `pdf translate <file.pdf> --to <언어 코드> [--pages <목록>] [--format pdf,md,epub] [--bilingual] [--out <경로>] [--partial] [--restart] [--yes] [--allow-paid] [--password <pw>] [--force]` | 고른 페이지의 글을 묶음으로 보내 번역하고 결과 파일을 쓴다. `--format`의 기본은 `pdf`다. `--bilingual`은 md·epub에서는 원문 문단 다음에 번역 문단을, pdf에서는 원문 쪽 옆에 번역한 쪽을 둔다(결정 0057). 언어 코드는 화면 언어 21개다                          |
| `pdf status <file.pdf>`                                                                                                                                                                     | 보관소에 있는 그 문서의 AI 읽기와 번역별 진행. 아무것도 보내지 않는다                                                                                                                                                                                          |

- `<목록>`은 `1-5,8,10-12` 꼴이고 1부터 센다. 문서 밖의 페이지는 종료 코드 1, `out_of_range`, `detail.valid_range`.
- 동사마다 받는 옵션이 정해져 있다. 다른 동사의 옵션을 주면 종료 코드 1, `unknown_option`.
- 변환·구조화 글·번역은 보관소에 있는 AI 읽기 결과를 그 페이지 대신 쓴다. 변환 결과의 `detail.ai_read_pages`가 그 페이지들이다.
- 고른 페이지가 모두 글자를 읽을 수 없는 그림이면 변환은 페이지 그림으로 끝나고 경고 `pages_as_images`가 붙는다.
- **보관소**: 앱과 같은 데이터 폴더의 `pdf-store`다(`GENOFFICE_USER_DATA`로 바꿀 수 있다). 앱과 명령어가 같은 문서를 동시에 다뤄도 항목 단위로 원자적으로 쓴다.

**성공 `detail`**

| 명령            | 성공 `detail`                                                                                                                                                                 |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `convert`(md)   | `{ pages, warnings, assets_written, assets_reused, ai_read_pages? }`                                                                                                          |
| `convert`(epub) | `{ pages, title, author?, cover, page_breaks?, ai_read_pages? }`                                                                                                              |
| `pdf images`    | `{ images: { page, file, width, height }[] }`                                                                                                                                 |
| `pdf ai-read`   | `{ pages_read: number[], pages_skipped: number[], pages_failed: { page, reason }[], provider, model }`                                                                        |
| `pdf translate` | `{ lang, provider, model, translated_blocks, untranslated_blocks: { page, reason }[], overflowed_blocks: { page }[], original_pages: { page, reason }[], outputs: string[] }` |
| `pdf status`    | `{ ai_read: { pages: number[], job }, translations: { lang, provider, model, done_blocks, total_blocks, complete, job }[] }`                                                  |

- `model`이 빈 글이면 구독 프로그램의 기본 모델이다.
- `pdf translate`의 `overflowed_blocks`는 번역 PDF에 자리가 모자라 원문 글자를 그대로 둔 블록이다(결정 0057). 번역 자체는 끝난 블록이라 `translated_blocks`에 세고, 그 번역문은 Markdown·EPUB에 들어간다.
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
  - 앱의 쉬운 풀이(번역의 두 번째 방식)가 도는 중이면 `detail.job`에 선택 필드 `mode: "easy"`가 더해진다. `kind`는 그대로 `translate`나 `translate-page`이고, 다섯 종류의 값 집합도 그대로다. 일반 번역과 다른 작업에는 `mode`가 없다.
  - 사람이 읽는 `message`는 종류마다 다르다(예: `a page translation (de)`, `an AI highlighting`). 쉬운 풀이는 그렇다고 밝힌다(예: `an easy explanation (ko)`, `an easy explanation of a page (en)`).
- **`pdf translate`는 끝날 때까지 앞에서 돈다.** 진행은 오류 출력(stderr)에 쓴다. `pdf ai-read`도 같다. Ctrl+C는 작업을 `interrupted`로 멈추고 답하게 한다.
- **한도 소진·연속 실패로 멈췄을 때**
  - `--partial`이 없으면 파일을 쓰지 않고 기존 약속대로 실패로 답한다: 종료 코드 4, `error: "app_unavailable"`, `detail.errorCode`(`rate-limit`, `failures` 등), `detail.resetsAt`. 끝난 분량은 `detail.done_blocks`·`detail.total_blocks`로 함께 준다. `ai-read`는 `detail.done_pages`·`detail.total_pages`와 `pages_read`, `pages_failed`를 준다.
  - `--partial`이 있으면(`translate`만) 끝난 부분만 반영하고 나머지는 원문으로 둔 파일을 쓰고 `status: "partial"`로 답한다. 성공 `detail`에 `detail.stopped: { errorCode, resetsAt? }`와 `done_blocks`·`total_blocks`가 더해진다.
  - 다시 실행하면 보관소에서 이어 간다. 끝난 블록과 페이지는 다시 보내지 않는다. `--restart`면 그 언어의 보관된 번역 가운데 사람이 앱에서 고친 블록(`edited`)은 남기고 나머지를 지운 뒤 처음부터 한다. 고친 블록은 끝난 것으로 쳐서 다시 보내지 않는다. 고친 블록까지 지우는 옵션은 없다(앱의 "처음부터 다시 번역"에서 고를 수 있다).
- **사람이 고친 번역**: 앱의 대역 보기에서 고친 블록은 서식 없는 글로 보관되고, `pdf translate`의 결과 파일(PDF·Markdown·EPUB)에 그 글 그대로 쓰인다. 출력 구조와 성공 `detail`의 모양은 바뀌지 않는다. 고친 블록은 `translated_blocks`에 든다.
- **`pdf status`**: 출력 모양은 그대로다. `ai_read`와 `translations`만 보이고, 앱의 페이지 번역·AI 핵심 표시·개요의 작업 기록은 나오지 않는다. 쉬운 풀이도 보이지 않는다. 쉬운 풀이의 결과와 작업 기록은 `translations` 항목을 만들지 않고 어떤 수도 바꾸지 않는다(`epub status`도 같다). 페이지 번역은 번역 작업 기록(`job`)과 진행(`done_blocks`·`total_blocks`)을 바꾸지 않는다.
- **결과 파일 위치**: `--out`이 없으면 원본 옆에 `〈원본 이름〉.〈언어 코드〉.〈확장자〉`로 쓴다. 형식이 하나면 `--out`이 그 파일이고, 여럿이면 `--out`은 형식마다 확장자를 붙일 기준 경로다. 이미 있으면 `--force`가 필요하다(기존 파일 규칙). 실행할 때는 보내기 전에 확인하고, 예상만 답할 때는 경고(`output_exists`)로만 알린다.
- **PDF로 쓸 수 없는 경우**: 목표 언어가 `ar`, `he`, `hi`이거나 PDF가 암호화돼 있으면 `--format pdf`를 보내기 전에 거절한다. 종료 코드 1, `unsupported`, `detail.supported_formats: ["md", "epub"]`.
- 번역할 글이 없는 범위(스캔 문서 등)는 종료 코드 1, `unsupported`이고 `pdf ai-read`를 먼저 권한다.
- 결과 파일을 쓰지 못하면 작업 기록은 `stopped`, `last_error: "output-write-failed"`가 된다. 보관된 번역은 남는다.

## EPUB 명령

`epub translate`는 EPUB 책을 번역한다. 위 "AI를 부르는 PDF 명령"의 규칙(예상만 답하기, 요금 경로, 자동 호출 스위치, 한 문서에 작업 하나, 앞에서 돌기와 stderr 진행, Ctrl+C의 `interrupted`, `--partial`, 다시 실행하면 이어 가기, `--restart`, `output-write-failed`)을 그대로 따르고, 다른 점만 아래에 적는다. `epub status`는 PC 안에서 끝난다.

| 명령                                                                                                                                                                    | 동작                                                                                                                           |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `epub translate <file.epub> --to <언어 코드> [--chapters <목록>] [--kind translated,bilingual] [--out <경로>] [--partial] [--restart] [--yes] [--allow-paid] [--force]` | 고른 장의 고칠 수 있는 블록과 책 제목·목차 항목 글을 묶음으로 보내 번역하고 번역본·대역본을 쓴다. 언어 코드는 화면 언어 21개다 |
| `epub status <file.epub>`                                                                                                                                               | 보관소에 있는 그 책의 번역별 진행. 아무것도 보내지 않는다                                                                      |

- 두 명령 모두 디스크에 저장된 책을 읽는다. 앱의 편집 잠금은 앱 안에서 시작한 번역에만 걸린다. 원본 파일은 바뀌지 않는다.
- `<목록>`은 `1-5,8` 꼴이고 spine 순서로 1부터 센다. 기본은 모든 장이다. 책 밖의 장은 종료 코드 1, `out_of_range`, `detail.valid_range`.
- `--kind`의 기본은 `translated`(번역본)다. `bilingual`(대역본)은 원문 블록마다 바로 뒤에 번역문을 둔다. 다른 값은 종료 코드 1, `invalid_argument`.
- **결과 파일 위치**: `--out`이 없으면 원본 옆에 `〈원본 이름〉.〈언어 코드〉.epub`(번역본)과 `〈원본 이름〉.〈언어 코드〉.bilingual.epub`(대역본)로 쓴다. 종류가 하나면 `--out`이 그 파일이고, 둘이면 `--out`은 기준 경로라서 번역본은 `.epub`, 대역본은 `.bilingual.epub`가 붙는다(`--out`이 `.epub`로 끝나면 그것을 떼고 붙인다). 이미 있으면 `--force`가 필요하다. 원본과 같은 경로는 종료 코드 1, `invalid_argument`.
- **예상만 답하기**: `detail.estimate`는 `{ calls, chapters, provider, route, metered }`이고 `chapters`는 고른 장의 수다. `detail.done_blocks`·`detail.total_blocks`, 필요하면 `detail.provider_change`가 PDF와 같이 오고, `detail.chapters: { index, title, read_only }[]`가 더해진다. 책의 모든 장이 spine 순서로 나오고, `index`는 `--chapters`에 쓰는 번호, `title`은 목차 제목(없으면 `null`), `read_only`는 깨졌거나 고정 배치라서 번역하지 않는 장이다.
- **번역하지 않는 책**: 종료 코드 1, `unsupported`, `detail.reason`이 이유다.
  - `drm`: DRM이 걸린 책
  - `fixed-layout`: 고정 배치 책
  - `not-epub`: EPUB이 아닌 파일(확장자가 `.epub`이 아닌 것 포함)
  - `damaged`, `too-large`: 손상되었거나 압축을 풀면 너무 큰 파일(zip 관문)
  - `no-text`: 고른 장에 번역할 글이 없음
- `job.kind`는 `translate`다. 같은 책에 작업이 돌고 있으면 PDF와 같이 `document-job-running`으로 거절하고, `suggestion`은 `epub status`를 가리킨다.
- 보관소는 PDF와 같은 `pdf-store`이고, 문서 열쇠는 책 파일 바이트의 SHA-256이다. 책을 다시 저장하면 다른 문서가 된다.

**성공 `detail`**

| 명령             | 성공 `detail`                                                                                                                                           |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `epub translate` | `{ lang, provider, model, translated_blocks, untranslated_blocks: { chapter, reason }[], original_chapters: { chapter, reason }[], outputs: string[] }` |
| `epub status`    | `{ translations: { lang, provider, model, done_blocks, total_blocks, complete, job }[] }`                                                               |

- `chapter`는 `--chapters`와 같은 1부터의 장 번호다.
- `translated_blocks`는 번역문이 들어간 장 블록의 수다. 책 제목과 목차 항목은 세지 않는다.
- `untranslated_blocks`는 고른 장에서 원문으로 남은 블록이다. `reason`은 `not-translated`(멈춘 작업에서 아직 번역하지 않은 블록), `placeholder-mismatch`, `empty-translation` 또는 작업이 포기한 이유다.
- `original_chapters`는 원문 그대로 결과 책에 들어간 장이다. `reason`은 `not-chosen`(고르지 않음), `broken`(깨짐), `fixed-layout`이다.
- `--partial`로 멈춘 경우 `pdf translate`처럼 `status: "partial"`이고, `detail.stopped: { errorCode, resetsAt? }`와 `done_blocks`·`total_blocks`가 더해진다.
- `epub status`의 `done_blocks`·`total_blocks`와 `job` 모양은 `pdf status`와 같다. 진행에는 책 제목과 목차 항목 단위도 든다.

## 다이어그램 명령

draw.io 다이어그램(`.drawio`, `.dio`, `.drawio.svg`, `.drawio.png`)을 읽고 고치고 만들고 그림으로 바꾼다. 연산은 앱의 AI 창과 같은 정의(`@genoffice/drawio-model`의 `DIAGRAM_OPS`)이고 같은 규칙으로 검사한다. `.vsdx`는 종료 코드 2, `unsupported`다. Visio 파일은 앱에서 열어 가져온다.

| 명령                                                                                                                        | 동작                                                                                                                                                                                                                                                                                                       | 앱                                                                                                |
| --------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `diagram read <파일> [--page <id\|이름>]`                                                                                   | 쪽마다 도형·선 읽기 표. `--json`의 `detail`은 `{ pages: [{ id, name, shapes, edges }] }`이고, `--page`를 주면 그 쪽 하나다                                                                                                                                                                                 | 필요 없음                                                                                         |
| `diagram apply <파일> --ops <JSON\|@파일\|-> [--page <id\|이름>] [--out <경로>] [--best-effort\|--stop-on-error] [--force]` | 연산 묶음을 적용해 쓴다. `page`가 없는 연산은 `--page`의 쪽, 없으면 첫 쪽에서 한다. 쓰는 형식은 `--out`(없으면 그 파일)의 이름이 정한다                                                                                                                                                                    | `.drawio`·`.dio`는 필요 없음. `.drawio.svg`·`.drawio.png`를 쓰거나 `insert_mermaid`가 있으면 필요 |
| `create --type drawio --out <경로> [--ops <JSON\|@파일\|->] [--mermaid <파일\|->]`                                          | 빈 쪽 하나인 새 다이어그램. 둘 중 하나는 있어야 하고, 둘 다면 Mermaid를 먼저 그린 뒤 연산을 한다. 압축하지 않은 `.drawio`로 쓰고, `--out`이 `.drawio.svg`·`.drawio.png`면 그 형식으로 쓴다                                                                                                                 | `--mermaid`가 있거나 그림 형식이면 필요                                                           |
| `convert <파일> --to pdf\|png\|svg [--page <id\|이름>] [--out <경로>]`                                                      | PDF는 파일 하나다(쪽마다 한 장, 그 쪽의 용지 크기). PNG·SVG·PDF는 늘 밝은 색이다(SVG에 어두운 뷰어에서 바뀌는 색을 넣지 않는다). PNG·SVG는 `--page`를 주면 파일 하나, 아니면 쪽이 하나여도 쪽마다 `<이름>-p<쪽 번호>.<확장자>`다. `--page`가 있으면 `--out`은 그 파일, 없으면 폴더다(기본은 다이어그램 옆) | 필요                                                                                              |
| `guide diagram`                                                                                                             | 연산 목록. `DIAGRAM_OPS`에서 만든다                                                                                                                                                                                                                                                                        | 필요 없음                                                                                         |

- 앱이 필요한데 찾지 못하면 종료 코드 4, `app_unavailable`이고 아무것도 쓰지 않는다. 앱은 창 없이 `--headless-export`(`docs/headless-pdf-export.md`)로 돌고 다이어그램 탭의 세션에서 일한다. 그래서 다이어그램 탭처럼 이 PC 밖으로 요청을 하나도 보내지 않는다.
- `.drawio`·`.dio`를 앱 없이 쓸 때는 바뀌지 않은 `<diagram>` 요소를 바이트 그대로 두고, 바뀐 쪽만 원래 압축 형태로 다시 쓰며, `mxfile`의 다른 속성은 건드리지 않는다. 앱을 거쳐 쓰면 draw.io의 저장과 같은 직렬화이고, 쪽 압축은 연 파일을 따른다.
- 묶음은 기본으로 모두 아니면 아무것도 아니다. 하나라도 거절되면 쓰지 않고 종료 코드 1이며, `error`는 첫 실패의 이유(`unknown_op`, `target_not_found`, `invalid_argument`)다. `detail.failures`·`detail.batch`·`detail.results`에 모든 연산의 결과가 있다. `--best-effort`·`--stop-on-error`는 남은 것을 쓰고 `status: "partial"`로 답한다. 읽기 연산만 든 묶음은 파일을 쓰지 않는다. 없는 `--page`는 종료 코드 1, `target_not_found`이고 `detail.pages`에 쪽 목록이 있다.
- `--ops`는 JSON 글 그대로, `@<파일>`, 파일 경로, `-`(표준 입력)를 받는다. 배열이나 `{ "ops": [...] }`다.
- 성공 `detail`: `diagram apply`는 `{ format, via?, results, created, batch, failures? }`다. `results[]`는 연산마다 `{ index, op, status, created?, error?, read? }`이고, `created`는 이 묶음이 만든 id 전부다. `create --type drawio`는 같은 모양에 `mermaid: { created }`가 더해지고, `results`의 `index`는 `--ops` 안의 차례다. `convert`는 `{ pages, output_paths? }`이고 `output_paths`는 파일이 여럿일 때만 있다.
- 이미 있는 다른 파일 위에 쓰기와 앱이 탭으로 연 파일은 공통 규칙(`--force`)을 따른다. `convert`는 쓸 파일마다 검사하고, 하나라도 걸리면 앱을 띄우지 않는다.

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

| 항목                                                                                               | 값                                                                                                                                                                                                                       |
| -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `search`, `image_search`, `image_generation`, `image_analysis`, `video_analysis`, `media_analysis` | 각각 `{ available, via, route, metered?, message? }`                                                                                                                                                                     |
| `pdf_ai_read`, `pdf_translation`                                                                   | 같은 모양. PDF의 AI 페이지 읽기와 문서 번역이 갈 길(대화에 쓰는 AI 제공자)                                                                                                                                               |
| `via`                                                                                              | 누가 답하는지(검색 경로, 키 제공자, 대화용 AI 제공자). 없으면 `null`                                                                                                                                                     |
| `route`                                                                                            | 비용이 어디로 가는지. `free` \| `key` \| `subscription`. 쓸 수 없으면 `null`                                                                                                                                             |
| `metered`                                                                                          | `true`면 쓴 만큼 요금이 나가는 로그인                                                                                                                                                                                    |
| `message`                                                                                          | 쓸 수 없을 때만 온다. 명령이 실제로 답할 글 그대로다                                                                                                                                                                     |
| `automatic_calls`                                                                                  | `{ subscription_enabled }`. 켜져 있을 때만 `{ used, limit: null, remaining: null }`이 더해진다                                                                                                                           |
| `app`                                                                                              | `{ available }`. 화면이 필요한 변환에 쓸 앱 실행 파일을 찾았는지                                                                                                                                                         |
| `wasm`                                                                                             | `{ available, reason?, limit_bytes? }`. PDF·한글 엔진과 네트워크 명령이 쓰는 WebAssembly 메모리를 지금 만들 수 있는지. 가상 메모리 상한(`ulimit -v`)에 걸리면 `reason: "virtual_memory"`와 그 상한(`limit_bytes`)이 온다 |
| `settings_path`                                                                                    | 이 답을 읽어 온 설정 파일                                                                                                                                                                                                |

- `wasm.available`이 거짓이면 `pdf read`·`hwp read`·`search`·`read-url`처럼 WebAssembly를 쓰는 명령은 그 환경에서 돌지 않는다. 그때 명령은 크래시 대신 종료 코드 3, `error: "resource_limit"`, `detail.reason: "virtual_memory"`와 `ulimit -v`를 올리라는 `suggestion`으로 답한다. DOCX·XLSX·PPTX·Markdown·HTML·CSV·ODT 문서 작업은 WebAssembly를 쓰지 않는다.

- `media_analysis`는 예전 호출자를 위해 남긴 항목이다. `image_analysis`와 같고, 영상만 될 때는 `video_analysis`와 같다.
- 웹·이미지 검색은 키 제공자를 고르지 않는 한 항상 `available`이고 `route`는 `free`다.
- `automatic_calls.used`는 최근 한 시간 동안 처리한 자동 호출 수이고 정보용이다. 한도가 없으므로 `limit`, `remaining`은 `null`이고 `resetsAt`은 오지 않는다.

**실패.** 세 명령이 실행될 수 없으면 종료 코드 4, `error: "app_unavailable"`.

| `detail.errorCode`                                                                                                                                    | 뜻                                                                | 다시 시도                                     |
| ----------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | --------------------------------------------- |
| `unavailable`                                                                                                                                         | 그 기능에 설정된 것이 없다                                        | 하지 않는다. 설정을 바꿔야 한다               |
| `headless-limit`                                                                                                                                      | 더 이상 쓰이지 않음. 자동 호출의 시간당 한도가 없어져 내지 않는다 | 해당 없음                                     |
| `rate-limit`                                                                                                                                          | 구독 한도 소진                                                    | `detail.resetsAt`이 있으면 그 이후            |
| `free-limit`                                                                                                                                          | 무료 연결의 오늘 사용량 소진                                      | `detail.resetsAt`이 있으면 그 이후            |
| `free-tier-model`                                                                                                                                     | 고른 모델이 키의 무료 등급에 없음(Gemini가 무료 한도 0으로 답함)  | 하지 않는다. 다른 모델을 고르거나 결제를 켠다 |
| `http_error`                                                                                                                                          | 서버가 2xx가 아닌 상태로 답함(`read-url`)                         | 주소를 확인한 뒤 다시                         |
| `auth`                                                                                                                                                | GitHub가 읽기 토큰을 거절함(`read-url`)                           | 설정의 GitHub 읽기 토큰을 확인                |
| `not-connected`, `signed-out`, `not-installed`, `metered-not-accepted`, `needs-update`, `unsafe-tools`, `timeout`, `network`, `overloaded`, `credits` | 실행이 그 이유로 실패                                             | 이유에 따라                                   |

## MCP 서버 (`ieumoffice mcp`)

- 표준 입출력으로 같은 명령들을 도구로 내놓는다. `--http <포트>`를 주면 Streamable HTTP로 내놓는다(`--host`, `--token`).
- 등록 예: `claude mcp add --transport stdio ieumoffice -- ieumoffice mcp`. `ieumoffice mcp install <에이전트|all>`이 각 에이전트의 설정 파일에 `ieumoffice` 항목만 쓴다. 같은 이름의 항목이 다른 프로그램을 가리키면 `occupied`로 알리고 `--force` 없이는 건드리지 않는다.
- 도구는 명령 동사마다 하나다(`docs_read`, `docs_apply`, `hwp_read`, `hwp_apply`, `diagram_read`, `diagram_apply`, `create_drawio`, `sheet_apply`, `slides_render`, `convert`, `read_url`, `pdf_read`, `pdf_images`, `pdf_ai_read`, `pdf_translate`, `pdf_status`, `epub_translate`, `epub_status` 등). 매개변수는 명령의 옵션 목록에서 그대로 나온다(`allow-paid`는 `allow_paid`, `no-cover`는 `no_cover`). 두 표면이 어긋나지 않는다. `diagram_read`·`diagram_apply`·`convert`의 `page`는 다이어그램 쪽의 id나 이름(글자)이고, `create_drawio`의 `mermaid`는 Mermaid 글 그대로다.
- `pdf_ai_read`·`pdf_translate`·`epub_translate`는 `yes`가 없으면 명령처럼 예상만 답한다. `yes`가 있으면 작업을 MCP 서버 프로세스 안에서 띄우고 바로 답한다(`detail.started: true`, `detail.estimate`). 진행, 멈춘 이유, `resetsAt`, 결과 파일 경로는 `pdf_status`(EPUB은 `epub_status`)의 `job`으로 본다. 이어하기는 같은 도구를 다시 부르면 된다.
- 그 결과 파일은 작업이 끝날 때 쓴다. `partial: true`로 부른 작업은 멈출 때 끝난 부분만 반영해 쓴다. 위치 규칙은 명령어와 같고, 경로는 `job.outputs`로 알려 준다.
- 서버가 끝나면 그 작업도 멈춘다(`last_error: "interrupted"`). 보관된 결과는 남는다.
- 결과는 `--json`이 내는 것과 같은 객체다. 실패는 `isError`와 같은 `error` 이유로 온다.
- 환경변수 `GENOFFICE_MCP_COMPACT_SCHEMAS`는 예전 철자를 유지한다. `--http`의 토큰은 `--token`, 없으면 `GENOFFICE_MCP_TOKEN`에서 읽고, 둘 다 없으면 인증 없이 받는다. 인증 없이 받는 것은 이 PC 주소(`127.0.0.1`, `localhost`, `::1`)에서 열 때뿐이다. 그 밖의 `--host`에 토큰이 없으면 서버를 열지 않고 종료 코드 1, `error: "invalid_argument"`로 끝난다. 에이전트 설정 폴더를 찾을 때의 홈 폴더는 `GENOFFICE_HOME`으로 바꿀 수 있다.
- 안내 자료는 리소스로도 내놓는다(`ieumoffice://guide/docs`, `…/sheets`, `…/hwp`, `…/diagram`, `…/slides`, `…/slides/design`, `…/slides/spec`, `…/slides/templates`, 내장 템플릿마다 `…/slides/templates/<id>`).
- 내장 디자인 템플릿은 `ieumoffice guide slides templates [<id>]`로 고른다. 목록의 `--json`은 `detail.templates`(`[{ id, name, scheme, description, fonts }]`, 정해진 순서), 템플릿 하나는 `detail`(`{ id, name, scheme, description, fonts, styleSheet }`)이다. 모르는 id는 종료 코드 1, `error: "invalid_argument"`, `detail.templates`에 쓸 수 있는 id 목록이다. MCP `guide` 도구는 세 번째 위치 인자 `name`으로 id를 받는다.
- 앱의 설정 → 연동 화면이 지금 설치본에 맞는 등록 예시를 보여 준다.

## 앱 안 MCP 서버

명령어 쪽 서버와 다른 것이다. 실행 중인 앱이 직접 여는 서버이고, 열려 있는 문서를 다룬다.

- 설정 → 연동에서 켠다. 기본은 꺼짐이다. 기본 포트는 3093이고 이 PC(`127.0.0.1`)에서만 닿는다. 인증은 없고, 요청의 Host·Origin이 이 PC의 것이 아니면 거절한다.
- 도구: `get_app_info`, `open_documents`, `open_in_genoffice`(이 이름은 예전 철자를 유지한다), `create_session`, `save_session`, `read_document`, `read_docx`, `read_sheet`, `read_deck`, `read_pdf`, `create_docx`, `create_xlsx`, `create_pptx`, `apply_ops`, `apply_sheet_ops`, `apply_slide_ops`, `insert_content`, `replace_blocks`, `insert_picture`, `read_diagram`, `apply_diagram_ops`.
- `insert_picture`는 열린 워드 탭에 그림을 넣는다(원본 genoffice#2267). 앱 안 AI의 같은 이름 도구를 그대로 거치므로 그림 주소는 http(s)와 `data:image/`만 받고, http(s) 주소면 앱이 그 주소에서 그림을 받아 온다. 에이전트 모드의 세션 서버에는 없다.
- 열린 ODT 탭은 워드 문서로 다룬다(`open_documents`의 `format`이 `odt`). `read_docx`는 `.odt` 파일도 읽는다. `save_session`은 탭의 형식으로만 저장한다. 다른 확장자의 경로를 주면 거절하고 `ieumoffice convert`를 쓰라고 안내한다. 대화 상자가 없는 경로에서 형식이 조용히 바뀌지 않게 하기 위해서다.
- 에이전트 설정에 넣는 항목 이름은 `ieumoffice-editor`다. 명령어 쪽 서버의 `ieumoffice`와 겹치지 않는다.
- 에이전트 모드(결정 0032)의 세션 MCP 서버는 이것과 별개다. 앱이 띄운 프로그램만 쓰고, 세션마다 운영체제가 고른 포트와 새 토큰(`Authorization: Bearer`)을 요구하며, 도구는 `open_documents`(`list`·`read`만), `read_document`, `insert_content`, `replace_blocks`, `apply_ops`, `read_sheet`, `apply_sheet_ops`, `read_deck`, `apply_slide_ops`, `read_hwp`, `read_pdf`다. 읽기는 가린 자리를 `{{이름}}`으로 내보내고, `read_hwp`·`read_pdf`는 프로젝트 폴더 안만 읽는다. 결정 0048·0049로 `propose_skill`(에이전트 창에 스킬 카드를 띄움)과 `propose_skill_install`(깃허브 설치 미리보기를 띄움)이 더해져 13개다. 둘 다 파일을 쓰지 않는다. 바깥 호출자에게 약속하는 출력이 아니다. 위 서버의 출력은 바뀌지 않는다.
- `open_documents`의 목록에 마인드맵 탭이 `kind: "mindmap"`, `type: "mind map"`으로 나온다(떼어 낸 창도 같다). `read`의 `content`는 지금 지도의 개요 글 문자열이고 저장하지 않은 편집이 들어 있다. 마크다운·HTML 탭의 읽기와 같은 모양이다. `close`의 저장은 편집기의 저장과 같은 길을 지나고, 한 번도 저장하지 않은 지도는 기본 저장 폴더에 겹치지 않는 이름의 `.xmind`로 저장된다. `ok`로 열리지 않은 지도는 어떤 경우에도 쓰지 않는다. 지도를 만들거나 고치는 도구는 없다.
- **갑자기 꺼진 뒤 되살린 탭(결정 0061).** 처음 누를 때까지 편집기 화면이 없는 탭도 `open_documents`의 목록에 보통 탭과 같은 필드로 나온다(저장하지 않은 변경은 없음으로). 도구가 그 탭을 대상으로 하면(`read`, `save`, `close`의 저장, 내용 도구의 열린 문서 대상) 앱이 그 탭을 앞에 내지 않고 불러와 편집기 화면이 다 뜰 때까지 기다린 뒤 이어 간다. 기다리는 것은 화면이 뜨는 것까지이고, 문서 내용을 다 읽는 것까지는 아니다. 시작 목록에 아직 답하지 않았거나, 파일 탭의 문서에 풀리지 않은 복구 사본이 있어 문서별 물음을 거쳐야 하면, 탭을 불러오지 않고 바로 실패로 돌아온다. 사람이 탭을 눌러 화면이 아직 뜨는 중일 때도 같다. 실패 글에는 `the user must open this document in the app first`가 들어 있다(`"<제목>" has recovered changes to decide on: …`). 화면이 다 뜬 뒤에 편집기가 문서별 물음을 띄우면 그 물음에는 사람이 답하고, 그동안 도구는 아직 열리는 중인 다른 문서에서와 같이 움직인다. 저장 없이 닫기(`unsaved: "discard"`)는 불러오지 않은 탭을 불러오지 않고 닫으며, 그 탭의 복구 사본은 남는다. 출력의 구조와 이름은 바뀌지 않았다.
- `get_app_info`의 `families`에 `{ family: "xmind", label: "mind map", editor: { open: ["xmind"], save: ["xmind"], export: ["png", "pdf", "md"] } }`가 있다. `mcp` 항목은 없다.
- `open_documents`의 목록에 EPUB 탭이 `kind: "epub"`, `type: "e-book"`으로 나온다(떼어 낸 창도 같다). `read`의 `content`는 spine 순서로 이은 책 글이고(제목은 `#`), 저장하지 않은 편집이 들어 있다. `close`의 저장은 편집기의 저장과 같은 규칙을 지나고, 바꾼 것이 없으면 파일을 쓰지 않는다. 책을 만들거나 고치는 도구는 없다.
- `get_app_info`의 `families`에 `{ family: "epub", label: "e-book", editor: { open: ["epub"], save: ["epub"], export: [] } }`가 있다.
- `open_documents`의 목록에 다이어그램 탭이 `kind: "diagram"`, `type: "diagram"`으로 나온다(떼어 낸 창도 같다). `format`은 파일의 형식(`drawio`, `dio`, `drawio.svg`, `drawio.png`)이고, 한 번도 저장하지 않은 다이어그램과 Visio 파일에서 만든 탭은 `drawio`다. `read`의 `content`는 모든 쪽의 읽기 표 글(쪽 목록, 쪽마다 도형과 선의 줄)이고 저장하지 않은 편집이 들어 있다. `save`와 `close`의 저장은 편집기의 저장과 같은 길을 지나고, 바꾼 것이 없으면 파일을 쓰지 않는다. 한 번도 저장하지 않은 다이어그램은 기본 저장 폴더에 겹치지 않는 이름의 `.drawio`로 저장된다. 열리지 않은 파일과 가져온 `.vsdx`에는 쓰지 않는다. 다이어그램은 `create_session`·`save_session`의 대상이 아니다.
- `read_diagram`(입력 `document?`, `page?`)은 다이어그램 한 쪽의 읽기 표를 글과 값으로 함께 낸다. 출력은 `{ id, title, path, dirty, content, pages, page }`다. `content`는 표의 글(쪽 목록 포함)이고, `pages`는 `[{ id, name, current? }]`, `page`는 `{ id, name, shapes: [{ id, label, shape, x, y, width, height, parent?, fill?, stroke? }], edges: [{ id, label, source, target, parent? }], selected? }`로 같은 내용이다(명령줄 `diagram read --json`의 쪽과 같은 모양). 예전 판의 편집기가 값을 보내지 않으면 `pages`·`page`는 빠지고 `content`만 있다. `page`(쪽 id나 이름)가 없으면 화면에 보이는 쪽이고, 그 쪽에서 사람이 고른 id가 함께 나온다(`selected`). 저장하지 않은 편집이 들어 있다.
- `apply_diagram_ops`(입력 `document?`, `ops`)는 연산 목록을 차례로 적용하고, 호출 하나가 편집기의 되돌리기 한 번이다. 출력은 `{ id, title, path, status: "ok", changed, created, results }`이고, `results`는 연산마다 `{ index, op, status, created?, error? }`, `created`는 만들어진 도형·선·쪽의 id다. 하나라도 거절되면 아무것도 바꾸지 않고 오류로 돌아오며, 오류 글에 연산마다 결과가 한 줄씩 있다(`<번호> <연산>: FAILED <code>: <까닭>` 또는 `ok (not applied)`). 저장은 하지 않는다(`open_documents`의 `save`). 두 도구의 입력 스키마는 `@genoffice/drawio-model`의 `DIAGRAM_OPS`에서 만든다(편집기 AI 창과 같은 정의). `ops`의 항목은 바꾸는 연산 전부의 키를 합친 것이고, 연산별 검사는 편집기의 계획이 한다.
- 두 도구의 `document`는 `open_documents`가 준 id나 경로다. 없으면 앞에 있는 다이어그램이다(초점을 가진 떼어 낸 창의 다이어그램, 아니면 앱 창에서 활성인 다이어그램 탭). 앞에 다이어그램이 없으면 열린 다이어그램의 목록(한 줄에 하나씩 id, 경로, 제목)을 오류 글에 담아 거절한다. 앱 안 MCP 서버의 오류는 글 하나(`isError`)이고 따로 `detail` 칸이 없어서, 목록은 오류 글에 있다. 다른 종류의 문서를 주면 거절한다. 뒤에 있는 탭을 고치면 그 탭을 앞으로 낸다.
- `get_app_info`의 `families`에 `{ family: "drawio", label: "diagram", editor: { open: ["drawio", "dio", "drawio.svg", "drawio.png", "vsdx"], save: ["drawio", "dio", "drawio.svg", "drawio.png"], export: ["png", "svg", "pdf"] } }`가 있다. `mcp` 항목은 없다.
- 에이전트 모드의 세션 서버에는 두 다이어그램 도구가 없다(도구 목록은 그대로다). 그 서버의 `open_documents`는 다이어그램 탭도 목록에 내고 `read`로 같은 글을 읽는다.

## 에이전트 스킬

- 이름과 폴더는 `ieumoffice`다. 저장소의 `skills/ieumoffice/SKILL.md`가 원본이고, 앱의 설정 → 연동에서 고른 에이전트에 설치한다. 터미널에서는 `npx skills add pblsketch/openoffice`.
- 스킬 문서는 사용자의 에이전트 폴더로 복사되고, 문서의 `metadata.version`이 커졌을 때만 새것으로 바뀐다. 본문을 고치고 버전을 올리지 않으면 고친 내용이 아무에게도 닿지 않는다(검사 `npm run check:skill-version`).
- 스킬과 도움말이 에이전트에게 알려 주는 명령은 모두 `ieumoffice`로 시작한다.
- 설치 자리(결정 0095). 새로 설치하는 줄은 셋이다. Claude Code(`~/.claude/skills`, `CLAUDE_CONFIG_DIR`를 따름), 공용 폴더 `agents`(`~/.agents/skills`), Windsurf(`~/.codeium/windsurf/skills`). 공용 폴더는 Codex, Cursor, Gemini CLI, Copilot, OpenCode가 읽고, `~/.agents`나 그 다섯 도구의 폴더 중 하나가 있으면(`CODEX_HOME`, `XDG_CONFIG_HOME`를 따름) 보인다.
- 다섯 도구의 자기 폴더(`~/.codex/skills` 등)에는 새로 쓰지 않는다. 이 앱이 예전에 거기 쓴 사본(설치 장부에 있고 아직 있는 것)은 예전 사본 줄로 남아, 업데이트·제거할 수 있고 공용 줄을 설치할 때 함께 새 버전이 된다(손으로 고친 것은 제외). 자동으로 지우지 않는다. 장부에 없는 사본은 목록에 없고 건드리지 않는다.
- `ieumoffice skill list`는 Claude Code·`agents`·Windsurf 줄과 예전 사본 줄을 낸다. 줄의 필드(`agent`, `label`, `detected`, `skills_dir`, `status`, `installed_version`, `up_to_date`)는 그대로이고 `legacy`(예전 사본이면 `true`)가 더해졌다.
- `ieumoffice skill install <agent|all>`의 이름은 `claude-code`, `agents`, `codex`, `cursor`, `gemini`, `copilot`, `opencode`, `windsurf`다. 다섯 도구의 이름은 그 도구가 이 PC에 있는지 보고(없으면 `--force`) 공용 폴더에 쓰며, 그 도구의 예전 사본이 있으면 함께 맞춘다. `all`은 있는 줄 모두와 예전 사본 모두다. 손으로 고친 예전 사본은 `--force`가 없으면 그대로 두고 경고 `legacy_copy_left`를 낸다. 결과 줄의 `action`은 `written`·`unchanged`다.
- `ieumoffice skill remove <agent> [--dir <path>]`는 이 앱이 쓴 사본 하나를 지운다(설정 → 연동의 제거와 같다). 다섯 도구의 이름은 그 도구 자기 폴더의 예전 사본, `agents`는 공용 사본이다. 이 앱이 쓰지 않은 파일은 지우지 않고 경고 `not_installed_by_app`을 낸다. 결과 줄의 `action`은 `removed`·`unchanged`다.
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

- `ieum-title`: 만들 때 적은 제목. 화면과 `/` 목록은 `name`을 보이고, 이름이 앱이 지어 준 무작위 이름(`skill-` 뒤 여섯 글자)일 때만 이 제목을 보인다(결정 0053). 새 스킬에는 쓰지 않고, 고친 스킬은 원래 값을 둔다.
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

| 값                      | 종류                                                                                                                                                                      | 기본                   |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| `skills.states`         | 식별자 → `{ enabled?, invoke?: 'auto' \| 'manual' }`. 사람이 바꾼 것만 적는다                                                                                             | 없음(출처별 처음 상태) |
| `skills.hiddenBuiltins` | 숨긴 기본 스킬 이름 목록                                                                                                                                                  | 없음                   |
| `agentSkillNoticeSeen`  | 참/거짓. 에이전트 창의 스킬 안내를 봤는지                                                                                                                                 | 없음                   |
| `agentProjectPrefs`     | 프로젝트 폴더 절대 경로 → `{ codexWebSearch: 'cached' \| 'live' \| 'disabled', codexNetwork }`                                                                            | 없음(`cached`, 거짓)   |
| `hwpDefaultFormat`      | `'hwp'` 또는 `'hwpx'`. 파일이 없는 새 한글 문서의 첫 저장에 먼저 제안할 형식                                                                                              | `hwp`                  |
| `homeKinds`             | `{ order?, hidden? }`. 홈의 새 문서 카드·새로 만들기 메뉴의 순서와 뺀 종류(`docx`·`xlsx`·`pptx`·`md`·`html`·`xmind`·`hwp`·`pdf`·`pdfTools`). 처음 상태와 다른 것만 적는다 | 없음(모두, 처음 순서)  |

- 식별자는 `〈출처〉:〈이름〉`, 플러그인은 `plugin:〈플러그인〉:〈이름〉`이다. 출처 값은 `builtin`(기본), `app`(`~/.ieumoffice/skills`, 깃허브 포함), `user`(`~/.claude/skills`), `plugin`(설치된 Claude 플러그인), `codex`(`~/.agents/skills`)다. 저장되는 값이라 바꾸지 않는다. 프로젝트 스킬(`project`)은 저장하지 않는다.
- 알 수 없는 값은 무시하고 처음 상태로 읽는다. 처음 상태는 `builtin`·`app`이 켜짐·스스로 쓰기, `user`·`plugin`·`codex`가 꺼짐이다.

## 설정 파일 (`ai-settings.json`)

데이터 폴더(`%APPDATA%\IeumOffice`, 개발 실행은 `IeumOffice-Dev`)에 있다. 사람이 직접 고칠 수 있고, 명령어와 MCP는 읽기만 한다.

| 값                                   | 종류                                                                              | 기본                                                       |
| ------------------------------------ | --------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `provider`                           | `auto` 또는 제공자 식별자                                                         | `auto`                                                     |
| `providers`                          | 제공자별 `{ apiKey, model, baseUrl?, cliPath?, models?, effort?, modelEfforts? }` | 빈 표                                                      |
| `meteredAccepted`                    | 구독 제공자별 참/거짓                                                             | 거짓                                                       |
| `headlessSubscriptionEnabled`        | 참/거짓. 자동 호출 경로의 구독 사용                                               | 거짓                                                       |
| `headlessSubscriptionConsentVersion` | 자동 호출 스위치를 켤 때 동의한 경고의 판(정수)                                   | 없음                                                       |
| `subscriptionNoticeSeen`             | 참/거짓. 첫 연결 안내를 봤는지                                                    | 거짓                                                       |
| `customEndpoints`, `customEndpoint`  | 직접 운영하는 서버 목록과 지금 쓰는 것의 식별자                                   | 없음                                                       |
| `maxOutputTokens`                    | 모델 한 차례의 출력 상한                                                          | 코드의 기본값                                              |
| `media`, `search`                    | 이미지·분석·검색 제공자 선택과 그 키                                              | 이미지 분석은 `chat`, 영상 분석은 `none`, 검색은 무료 경로 |
| `readUrl`                            | `{ githubToken }`                                                                 | 없음                                                       |
| `internetTools`                      | `false`면 편집기 AI 창의 인터넷 도구를 끈다                                       | 켬(값 없음)                                                |

- 로컬 서버 항목(`kind: 'local'`)은 `modelProfiles`와 `timeoutMs`를 더 든다. `modelProfiles`는 모델 id별 `{ contextLength, maxContextLength, tools, vision, contextSource, toolsSource, visionSource, checkedAt, notes, efforts, defaultEffort }`이고, source는 `server`·`user`·`test`뿐이다. `timeoutMs`는 60,000~600,000의 정수이고, 없으면 300,000으로 읽는다.
- `customEndpoint: ''`는 "쓸 사용자 서버 없음"이다. 이때 `providers.custom`은 `{ apiKey: '', model: '', baseUrl: '' }`로 비고, `customEndpoint` 값이 아예 없는 예전 파일만 첫 서버를 고른다.
- 키와 토큰(`providers.*.apiKey`, `customEndpoints[].apiKey`, `media.providers.*.apiKey`, `search.providers.*.apiKey`, `readUrl.githubToken`)은 Windows와 Linux(GNOME 키링·KWallet이 있을 때)에서 앱이 저장할 때 `sealed:v1:<base64>`로 봉인된다(결정 0063). 사람이 평문으로 적어 넣어도 읽히고, 앱이 다음에 저장하거나 시작할 때 봉인된다. 명령어와 MCP는 봉인된 값을 앱에게 풀어 받아 쓰고(처음 한 번 1~2초), 풀지 못한 값은 빈 키로 읽는다. 명령어는 봉인하지 않는다. macOS는 봉인하지 않는다.
- `readUrl.githubToken`은 비공개 GitHub 파일을 읽는 읽기 토큰이다. 키와 같은 방식으로 저장되고, `api.github.com` 요청에만 실린다. 다른 사이트나 리다이렉트 홉에는 보내지 않는다.
- `headlessSubscriptionEnabled`가 참이어도 `headlessSubscriptionConsentVersion`이 지금 경고의 판(2)보다 작거나 없으면 꺼진 것으로 읽는다. 판 1은 시간당 한도가 있던 예전 경고이고, 그때는 판을 저장하지 않았다.
- 이미지 생성 제공자의 저장값 기본은 `codex`다. Codex 구독 이미지 생성이 들어 있지 않은 지금은 `none`(선택 없음)과 똑같이 동작한다.
- 구독 제공자의 식별자는 `claude-code`, `chatgpt`, `codex`다. 인증 방식은 `claude-subscription`, `chatgpt-plan`, `codex-chatgpt`, `api-key` 넷이다. `provider`에 `chatgpt`를 저장할 수 있고, `providers.chatgpt.model`이 그 모델이다(빈 값은 요금제 목록의 첫 모델). `meteredAccepted`에는 `chatgpt` 항목이 없다(요금제 범위 연결이라 종량 로그인이 없다).
- ChatGPT 직접 연결(결정 0081)의 토큰은 이 파일이 아니라 같은 폴더의 `chatgpt-connection.json`에 있다. 앱만 읽고 쓴다. 손으로 고치거나 옮기지 않는다(다른 PC·계정에서는 봉인이 풀리지 않아 연결이 없는 것으로 읽힌다). 터미널 명령어와 MCP는 이 파일을 읽지 않는다. 명령어에서 `chatgpt`는 늘 로그인되지 않은 상태이고, `auto`는 Claude, Codex 순으로 고른다.
- 모르는 제공자 식별자나 없어진 값이 있어도 오류 없이 읽는다. 그 자리는 기본값이 되고, 다음에 앱이 저장할 때 지워진다.
- `providers` 표가 아예 없는 파일은 제공자 설정 이전의 파일로 읽혀, 다른 값까지 기본값이 된다.
- 종량 허용은 이 파일의 값만으로는 유효하지 않다. 같은 폴더의 기록(`subscription-metered.json`)에 적힌 로그인 종류가 지금 감지된 것과 같아야 한다.
- 구독 제공자의 `model`에는 프로그램이 받는 값이 그대로 들어간다(Claude의 `opus`·`claude-opus-5-5` 같은 별칭이나 식별자, Codex의 모델 식별자). 빈 값은 프로그램의 기본 모델이다. 화면에 보이는 표시 이름은 저장하지 않는다.
- `effort`는 생각 깊이다(결정 0096). `none`, `minimal`, `low`, `medium`, `high`, `xhigh`, `max` 가운데 하나이고, 없으면 프로그램이나 회사의 기본이다. 다른 값은 앱이 저장할 때 지우고, 손으로 적어도 실행에 넘기지 않는다. Claude에는 `low`~`max`만, Codex에는 그 모델이 받는 값만, 키 제공자에는 `modelEfforts`가 그 모델에 적은 값만 넘긴다. 로컬 서버는 `customEndpoints[].effort`에 두고, 쓰는 서버의 값이 `providers.custom`에 옮겨진다. 명령어와 MCP의 실행도 이 값을 쓴다.
- 키 제공자의 `modelEfforts`는 모델 id별 `{ efforts, defaultEffort? }`이고, 그 회사의 모델 목록이 알려 준 단계다(Anthropic, OpenRouter, DeepSeek, xAI). `models`와 함께 앱이 채우고, 앱 화면이 저장할 때는 파일에 있던 값이 그대로 남는다. 모르는 단계, 256자를 넘는 id, 2,000개를 넘는 항목은 읽을 때 버린다. 로컬 서버의 `efforts`·`defaultEffort`는 Ollama가 그 모델에 대해 알려 준 단계다.
- 키 제공자의 `models`는 그 회사가 저장된 키에 내준 대화 모델 목록이다(결정 0087). 앱이 시작할 때와 그 제공자의 키나 주소가 바뀌었을 때 앱이 채우고, 최신순이다. 앱만 쓴다. 손으로 고쳐도 다음 조회 때 바뀌고, 앱 화면이 저장할 때는 파일에 있던 값이 그대로 남는다. 문자열이 아닌 항목, 256자를 넘는 항목, 중복은 읽을 때 버린다. 명령어와 MCP는 이 값을 읽지 않는다.
- 저장된 Gemini 모델 `gemini-3.7-flash`는 `gemini-3.8-flash`로 읽는다(Google이 2026-10-08 내리고 그쪽으로 돌린다).
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

## 프로젝트 폴더 (`.ieumoffice/`, 결정 0088)

사람이 AI 창에서 고르는 프로젝트는 PC의 폴더 하나이고, 그 프로젝트의 지침·기억·대화는 그 폴더 안의 `.ieumoffice/`에 있다. 사람이 메모장으로 읽고 고칠 수 있고, 다른 프로그램도 이 모양에 기대어 읽고 쓸 수 있다. 폴더를 옮기거나 복사하면 함께 간다. 동작 규칙은 `docs/business-rules.md`의 "프로젝트 폴더"에 있다.

```
<프로젝트 폴더>/
├── AGENTS.md, CLAUDE.md        ← 있으면 지침으로 함께 읽는다(앱은 쓰지 않는다)
└── .ieumoffice/
    ├── project.json
    ├── instructions.md
    ├── memory.md
    ├── memory.<YYYYMMDD-HHmmss>.bak.md   (정리 전 백업, 최근 3개)
    ├── ignore
    └── chats/
        ├── <chatId>.json        대화 정보
        └── <chatId>.jsonl       대화 내용
```

- 폴더와 파일 이름은 화면 언어와 상관없이 고정이다. 글은 UTF-8이다.
- `.ieumoffice/`는 폴더를 고른 것만으로 생기지 않는다. 앱이 처음 무엇을 써야 할 때(지침 저장, 기억, 대화, 이름 바꾸기) 만든다.
- 앱은 JSON·MD를 같은 폴더의 임시 파일에 쓴 뒤 이름을 바꾼다. 다른 프로그램이 쓸 때도 같은 방식을 권한다.
- id(프로젝트 id, `chatId`)는 `^[A-Za-z0-9_-]+$`만 받는다. 어긋나는 파일은 무시한다.

**`project.json`**

```json
{ "version": 1, "id": "<프로젝트 id>", "name": "<이름, 128자까지>", "createdAt": "<ISO 시각>" }
```

| 값          | 뜻                                                                                                                                                              |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `version`   | 형식의 판. 지금 `1`                                                                                                                                             |
| `id`        | 프로젝트의 정체. 경로가 아니라 이 값으로 같은 프로젝트를 알아본다. 폴더를 복사해 같은 id가 두 곳에 있으면, 나중에 추가한 쪽을 복사본으로 보고 앱이 새 id를 쓴다 |
| `name`      | 화면의 이름. 128자까지. 바꿔도 폴더 이름은 그대로다                                                                                                             |
| `createdAt` | 만든 시각(ISO 8601)                                                                                                                                             |

**`instructions.md`** 는 사람이 쓰는 지침이다. 앱은 프로젝트 화면에서 사람이 저장할 때만 쓰고, AI는 고치지 않는다. 형식은 자유로운 마크다운이다.

**`memory.md`** 는 AI가 쌓는 기억이다. 사람이 고치거나 지워도 된다. 첫 줄은 설명 주석이고, 그 뒤로 한 줄에 한 항목(`- `로 시작)이다. 항목 끝의 괄호 안 날짜는 적힌 날이다.

```text
<!-- 이음오피스가 쌓는 기억. 고치거나 지워도 됩니다. -->
- 보고서는 개조식, 문장 끝은 "~함"으로 쓴다. (2026-10-29)
```

- 앱은 기억을 쓰기 직전에 파일을 다시 읽어 그 위에 고친다. 다른 프로그램이 그사이 고친 것을 덮어쓰지 않는다.
- 사람이 [정리하기]를 누르면, 바꾸기 전의 파일을 `memory.<YYYYMMDD-HHmmss>.bak.md`로 남긴다. 백업은 최근 3개만 남긴다.
- 같은 폴더의 `memory*.md` 가운데 `.bak`이 아닌 다른 이름(동기화 서비스의 충돌 사본)은 읽지 않고, 프로젝트 화면이 그 이름을 알린다.

**`ignore`** 는 AI가 보지 않을 파일·폴더다.

- 한 줄에 하나다. 빈 줄과 `#`으로 시작하는 줄은 무시한다.
- `*`(경로 구분자를 넘지 않는 아무 글자), `?`(한 글자), `**`(폴더 여러 단계)를 쓴다.
- 끝의 `/`는 폴더에만 맞는다. 앞의 `/`는 프로젝트 폴더 기준이다.
- `!`(되살리기)는 없다.
- 대소문자는 Windows와 Mac에서 구분하지 않는다.
- 걸린 파일은 AI 도구와 지시문의 파일 이름 목록, 홈 검색의 "바깥 AI로 다시 정렬"에 보내는 결과에서 빠진다. 홈 검색 결과 목록에는 보인다. 프로젝트 화면의 "AI가 보지 않게"는 그 경로 한 줄을 더한다.

**대화 정보 `chats/<chatId>.json`**

```json
{
  "version": 1,
  "id": "<chatId>",
  "projectId": "<이 대화가 생긴 프로젝트 id>",
  "title": "<제목>",
  "createdAt": "<ISO>",
  "updatedAt": "<ISO>",
  "origin": "<쓴 설치의 installId>",
  "lastEditor": "docs|sheets|slides|pdf|markdown|html|mindmap|hwp|epub|home",
  "documents": ["<이 대화를 쓴 문서의 폴더 안 상대 경로>", "..."]
}
```

| 값           | 뜻                                                                                                                               |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| `projectId`  | 이 대화가 생긴 프로젝트의 id. 지금 `project.json`의 `id`와 같은 대화만 목록에 보인다(복사한 폴더의 대화는 보이지 않는다)         |
| `title`      | 화면의 제목. 처음에는 첫 사용자 메시지의 앞 40자                                                                                 |
| `updatedAt`  | 마지막으로 메시지가 더해진 시각. 목록은 이 값의 늦은 순이다                                                                      |
| `origin`     | 이 대화를 만든 설치의 값(`app-settings.json`의 `projects.installId`, 설치마다 한 번 만드는 무작위 값)                            |
| `lastEditor` | 마지막으로 메시지를 보낸 편집기. `home`은 홈 AI 질문                                                                             |
| `documents`  | 이 대화를 쓴 문서의 프로젝트 폴더 안 상대 경로. 마지막으로 쓴 것이 맨 뒤다(다시 쓰면 맨 뒤로 옮긴다). 폴더 밖 문서는 넣지 않는다 |

**대화 내용 `chats/<chatId>.jsonl`**

- 줄마다 메시지 하나(JSON)다. 모양은 `project-store`의 메시지 기록과 같다(역할, 본문, 도구 기록, 범위, 스킬 칩, 스킬 제안, `seq`, 시각). 여기에 `editor`(그 메시지를 쓴 편집기, 위 `lastEditor`와 같은 값)와 `origin`(쓴 설치의 값)이 더해진다.
- 저장 상한은 본문 32,000자, 도구 필드 16,000자, 메시지당 도구 64개·첨부 32개다.
- 읽을 때 깨진 줄은 건너뛰고, 파일이 크면 끝 8 MiB만 읽는다.
- 파일은 첫 어시스턴트 답이 올 때 만든다. 대화를 지우면 두 파일을 운영체제 휴지통으로 옮긴다.
- **다른 PC의 대화**: 대화 정보의 `origin`이나 메시지 하나라도의 `origin`이 이 PC의 값과 다른 대화. 처음 믿음 확인의 대상이 되고, 목록에 "다른 PC"가 붙는다.

**이 PC에만 두는 것.** 고정·최근 목록, 믿음 기록(프로젝트 id마다 `use`·`without`과, 앱이 마지막으로 보거나 쓴 `instructions.md`·`memory.md`·`AGENTS.md`·`CLAUDE.md`의 해시), 문서마다 고른 프로젝트와 마지막 대화, "프로젝트 없이"로 바꾼 문서, 프로젝트별 설정(기억 쌓기, 루트 `AGENTS.md`·`CLAUDE.md` 읽기), `installId`는 폴더가 아니라 데이터 폴더의 `app-settings.json`(`projects`)에 있다. 앱만 읽고 쓴다.

**누가 쓰나.** 앱에서는 껍데기 앱 뒷단의 프로젝트 길잡이만 쓴다. 터미널 명령어와 MCP는 이 폴더를 읽지도 쓰지도 않는다. 에이전트 모드의 프로그램은 프로젝트 폴더에 쓸 수 있으므로 이 파일들을 바꿀 수 있다(`docs/tracking/findings.md`).

## Google 드라이브 (결정 0033, 0085)

같은 데이터 폴더에 둘이 있다. 터미널 명령어와 MCP는 둘 다 읽지도 쓰지도 않는다.

- `google-drive.json`: `{ "version": 1, "token": "<base64>" }`. `token`은 운영체제 암호화(Electron `safeStorage`: Windows는 DPAPI, macOS는 키체인, Linux는 키링이 있을 때만)로 감싼 갱신 토큰이다. 다른 사용자나 다른 PC에서는 풀리지 않고, 풀리지 않는 파일은 연결이 없는 것으로 읽는다. 암호화를 쓸 수 없는 PC에서는 이 파일을 만들지 않는다. 연결 끊기와 Google의 연결 종료(`invalid_grant`)에 지운다.
- `drive-cache/`: 연 드라이브 파일의 PC 사본. 파일마다 `drive-cache/<드라이브 파일 id>/<이름>`이고, `drive-cache/index.json`이 사본과 드라이브 파일을 잇는다. 항목에는 드라이브 파일 id, 이름, 상위 폴더 id, PC 경로, 마지막으로 맞춘 내용의 해시(SHA-256)와 드라이브 쪽 해시(MD5)·변경 시각, 저장이 갈 드라이브 파일 id, "이 PC에만 저장"을 골랐는지, 마지막으로 연 시각이 있다. 문서 내용은 사본 파일에만 있다. 한 달 동안 열지 않았고 올리지 못한 변경이 없는 사본은 시작할 때 지운다.

`app-settings.json`의 `driveAiAccess`(참/거짓, 기본 참)는 편집기의 AI가 드라이브를 찾고 읽어도 되는지다. 드라이브가 연결돼 있을 때만 뜻이 있다. `driveTrainingAck`(참일 때만 확인, 기본 없음)는 사람이 "드라이브 파일과 함께 쓰는 AI 계정에서 모델 학습을 껐습니다"에 체크했는지다. 참이 아니면 연결, 고르기, 첨부, AI의 드라이브 도구가 멈춘다.

창구 이름은 `drive:state`, `drive:connect`, `drive:cancel-connect`, `drive:disconnect`, `drive:set-ai-access`, `drive:set-training-ack`, `drive:list`(`recent`·`search`만), `drive:open`, `drive:pick-open`(Google 선택 창을 열고 고른 파일을 탭으로 연다)과 변경 알림 `drive:state-changed`, 편집기 AI용 `drive:ai-enabled`, `drive:ai-search`, `drive:ai-read`, 편집기 첨부용 `drive:connected`, `drive:pick-attachments`다. 앱이 그리던 고르기 창과 그 창구(`drive-picker:*`)는 없앴다(결정 0085). 토큰은 어느 창구로도 화면에 나가지 않는다.

빌드: `GENOFFICE_GOOGLE_CLIENT_ID`(`….apps.googleusercontent.com`)와 `GENOFFICE_GOOGLE_CLIENT_SECRET`이 껍데기 앱을 빌드하는 환경에 있을 때만 드라이브가 들어간다. 없으면 상태는 `unavailable`이고 화면에 드라이브가 나오지 않는다.

## 사용자 MCP 서버 (결정 0100)

앱이 MCP 클라이언트로 붙는 바깥 서버다. 사람이 설정 → 연동의 "MCP 서버" 카드에 등록한다. 터미널 명령어와 그 MCP 서버, 앱 안 MCP 서버는 이것을 쓰지 않는다.

**`mcp-servers.json`.** 데이터 폴더(`ai-settings.json`과 같은 곳)에 있다. 앱만 읽고 쓴다. 터미널 명령어는 읽지 않는다. 쓰기는 원자적 쓰기(`atomicWriteFile`)이고, JSON으로 읽을 수 없는 파일은 다음 저장 때 `mcp-servers.json.damaged`로 옮겨 둔다. 사람이 손으로 고치는 것을 약속하지 않는다(비밀값은 봉인돼 있다).

```jsonc
{
  "version": 1,
  // runtimes the person allowed the app to download; kept across app updates
  "runtimes": {
    "node": { "allowed": true },
    "uv": { "allowed": true },
    "python": { "allowed": true },
  },
  "servers": [
    {
      "id": "…", // made by the app; never shown as a name
      "name": "korean-law",
      "kind": "remote", // "remote" | "local"
      "enabled": true,
      "keepResultsInside": true,
      // remote only
      "url": "https://law.example.com/mcp",
      "transport": "auto", // "auto" (Streamable HTTP, then SSE) | "sse"
      "headers": { "Authorization": "sealed:v1:…" },
      "oauth": { "clientId": "…", "clientSecret": "sealed:v1:…", "tokens": "sealed:v1:…" }, // or null
      // local only
      "command": "npx",
      "args": ["-y", "some-mcp-server"],
      "env": { "API_KEY": "sealed:v1:…" },
      "approvedLaunch": "sha256:…", // or null until the person allows the command
      "approvedPlan": "sha256:…", // the resolved plan the person was shown and allowed, or null
      // both
      "instructions": { "approved": "sha256:…", "text": "…" }, // or null
      "pendingInstructions": null, // changed text awaiting approval
      "tools": {
        "search_law": {
          "permission": "always", // "always" | "ask" | "off"
          "approved": "sha256:…",
          "definition": { "description": "…", "inputSchema": {}, "annotations": {} },
          "pending": null, // a changed definition awaiting approval
        },
      },
      "newTools": ["get_law_text"],
    },
  ],
}
```

- 서버마다 자기 종류의 칸만 쓴다. `runtimes`는 처음에 `{}`이고, 사람이 받기를 허락한 것만 생긴다.
- 봉인되는 칸은 헤더 값, `oauth.clientSecret`, `oauth.tokens`, `env` 값이다(`sealed:v1:<base64>`, 운영체제 암호화). `oauth.tokens`는 토큰과 인증 서버 정보(만료, 인증 서버 주소, 그 메타데이터, 등록한 클라이언트)를 담은 JSON을 통째로 봉인한 것이다. 암호화를 쓸 수 없는 PC에서는 그 칸을 비워 두고 값은 메모리에만 있다. 다른 계정이나 PC에서 봉인한 값은 빈 값으로 읽힌다.
- 도구 정의와 안내 글은 비밀이 아니어서 봉인하지 않는다. `url`과 `command`·`args`도 평문이다. 주소의 질의 문자열에 넣은 열쇠는 평문으로 남는다.
- 지문은 `sha256:`과 16진수다. 도구 지문은 `{ name, description, inputSchema }`(설명은 줄바꿈을 `\n`으로, 유니코드를 NFC로 맞춤)를 키 순서로 정렬한 JSON의 해시이고, 표시(`annotations`)는 넣지 않는다. 안내 지문은 같은 정규화를 거친 글의 해시다. `approvedLaunch`는 명령, 인자, 환경 변수 **이름**의 해시다. `approvedPlan`은 확인 화면이 보인 계획, 곧 `{ command, args, env }`(풀린 실행 파일 전체 경로, 앱이 덧붙인 것까지의 인자 전부, 환경 변수 `{ name, origin }`을 이름 순으로 정렬)를 키 순서로 정렬한 JSON의 해시다. 값은 들어가지 않는다.
- 도구 하나의 "확인 필요"는 `pending`이 비어 있지 않은 것이다. 승인하면 `pending`이 `definition`이 되고 `approved`가 새 지문이 된다. 안내도 같다(`pendingInstructions`). 내 PC 서버의 "명령 확인 필요"는 지금 명령·인자·환경 변수 이름의 지문이 `approvedLaunch`와 다르거나, `approvedPlan`이 비었거나, 실행하려고 다시 계산한 계획의 지문이 `approvedPlan`과 다른 것이다. 마지막 것은 실행해 봐야 알므로 파일에 따로 적지 않는다. "실행 허락"(`mcp-servers:approve-launch`)은 서버 id와 확인 화면이 받은 계획 지문(`mcp-servers:planned-launch`의 답 `launch.fingerprint`)을 함께 보내고, 뒷단이 다시 계산한 계획과 다르면 `{ ok: false, problem: "launch-changed" }`로 답해 아무것도 바꾸지 않는다.
- `permission`이 세 값 밖이면 `ask`로 읽는다. 처음 값은 `annotations.readOnlyHint`가 `true`인 도구만 `always`다.

**값 집합(화면 표시).** 서버 상태는 `connected`, `ready`, `unchecked`, `connecting`, `failed`(까닭 하나: `unreachable`, `http-error`, `runtime-missing`, `start-failed`, `refused-redirect`, `insecure-address`), `login-required`, `review-required`(무엇이 바뀌었는지가 붙는다), `disabled`다. 여럿이면 `disabled` > `review-required`(명령) > `login-required` > `failed` > `connecting` > `unchecked` > `ready` > `connected`. `connected`는 이번 실행에서 그 서버의 도구 목록을 실제로 받았을 때(내 PC 서버는 떠 있을 때도)만이다. `unchecked`는 저장된 도구·안내가 하나도 없는 서버, `ready`는 저장된 승인 정의는 있지만 이번 실행에서 아직 붙지 않은 서버다. `http-error`는 서버가 MCP 대신 HTTP 오류 상태(401 밖의 4xx·5xx)로 답한 것이고, `unreachable`은 아예 닿지 못한 것이다. 도구 표시는 정상, 확인 필요, 켤 수 없음(이름) 셋이다.

**도구 이름.** AI 창과 에이전트 창에서 도구 이름은 `mcp__〈서버 이름〉__〈도구 이름〉`이다. 코딩 에이전트용으로 쓴 스킬에 적힌 이름과 그대로 맞게 하기 위해서다.

- 서버 이름: `^[A-Za-z0-9_-]+$`, 1~24자, `__` 없음, `_`로 시작하거나 끝나지 않음. 대소문자를 가리지 않고 서로 겹치지 않는다. `ieumoffice-editor`(앱 MCP 서버)는 쓸 수 없다.
- 도구 이름은 `[A-Za-z0-9_-]` 밖의 글자를 `_`로 바꾼다. 전체 이름은 `^[A-Za-z0-9_-]{1,64}$`여야 한다. 바꾼 이름이 비었거나, 64자를 넘거나, 같은 서버의 다른 도구와 같아지면(둘 다) 켤 수 없다.
- 앱 자체 도구는 `mcp__`로 시작하지 않는다. 이 앞붙이가 붙은 이름은 모두 바깥 도구로 친다.

**붙여넣기 형식.** 사람이 붙여넣은 글만 읽는다. 다른 프로그램의 설정 파일은 열지 않는다. 글에 코드 울타리(```)가 있으면 첫 블록을 읽는다.

- JSON `{"mcpServers": {"〈이름〉": 〈서버〉}}`
- 감싼 꼴 없는 `{"〈이름〉": 〈서버〉}`
- `{`로 시작하지 않으면 TOML로 읽고, `[mcp_servers.〈이름〉]` 표가 있어야 한다.

〈서버〉에서 받는 항목은 `type`, `command`, `args`, `env`, `url`, `serverUrl`, `headers`, `http_headers`, `bearer_token_env_var`다. `command`가 있으면 내 PC 서버(`type`은 없거나 `stdio`), 아니면 주소 서버다. `type`의 `http`·`streamable-http`·`streamableHttp`·`streamable_http`는 `transport: "auto"`, `sse`는 `"sse"`다. 주소도 명령도 없으면 등록할 수 없다고 알린다. 모르는 `type`은 막지 않고 "무시한 항목"에 `type`으로 보이며, 그 값과 함께 "보통 방식으로 연결해 봅니다"를 알린다(`typeIgnored`). `bearer_token_env_var`는 PC의 변수를 읽지 않고, 열쇠 칸을 비운 채 그 변수 이름을 보이며 사람에게 넣게 한다. 헤더와 환경 변수의 값이 `${이름}`이나 `${env:이름}`을 담고 있으면 그 값도 PC에서 읽지 않는다. 값을 비우고 변수 이름을 알린다(`headerVars`, `envVars`). `Authorization` 헤더가 그렇다면 헤더를 빼고 `bearer_token_env_var`와 같이 열쇠 칸에서 묻는다. 읽지 못한 글은 `{ ok: false, error: "unreadable", line }`으로 답하고, `line`은 JSON·TOML 문법 실수가 있는 붙여넣은 글의 줄(1부터)이다. 알 수 없으면 빠진다. 그 밖의 항목은 서버마다 "무시한 항목"으로 보인다. 맞지 않거나 겹치는 이름은 고친 이름을 제안한다. 붙여넣은 글은 1시간, 8개까지만 기억한다.

**클라이언트로서.** `initialize`의 `capabilities`는 `{}`, `clientInfo`는 제품 이름과 앱 판이다. 서버의 sampling, elicitation, roots 요청은 거절한다. 도구 목록과 호출(`tools/list`, `tools/call`), 목록 변경 알림(`notifications/tools/list_changed`)만 쓴다. 결과는 `content`의 글 블록과 `structuredContent`(JSON 글, 같은 JSON이 글 블록에 이미 있으면 뺌)만 AI에게 넘기고, 나머지 블록은 개수만 알린다. `isError`는 도구 오류다. 호출마다 60초, 결과는 200,000자에서 자른다. 주소 서버에는 설정한 헤더 가운데 프로토콜이 쓰는 이름(`content-type`, `accept`, `mcp-session-id`, `mcp-protocol-version`, `last-event-id`)은 보내지 않는다.

**편집기 다리.** 편집기 9곳과 홈 창의 preload가 `window.aiOfficeMcpTools`(`@genoffice/electron-utils/mcp-tools-bridge`)로 내준다. `list()`, `call(server, tool, input, callId)`, `cancel(callId)`, `onChanged(listener)`, `retry(server)`, `openSettings(server)`가 있고, 목록의 도구에는 서버가 `destructiveHint: true`를 붙였을 때만 `destructive: true`가 붙는다(허락 카드의 "지우거나 바꿀 수 있음" 표시). `call`의 답은 두 종류의 서버 모두 뒷단에서 거르고 자른 글 `{ ok: true, output, isError }`이거나 거절 `{ ok: false, error }`다(`@genoffice/agent-core/user-mcp/result`의 `McpCallAnswer`). 서버가 돌려준 결과 그대로는 창으로 건너가지 않는다. 창이 닫히면 그 창의 호출은 끊긴다. 창구는 `mcp-tools:list`, `mcp-tools:call`, `mcp-tools:cancel`, `mcp-tools:retry`, `mcp-tools:open-settings`와 변경 알림 `mcp-tools:changed`다. 목록에는 승인된 도구 정의와 상태만 있고 비밀값은 없다. 껍데기 앱이 없는 창은 빈 목록과 거절을 받는다. 설정 화면의 창구(`mcp-servers:*`)는 껍데기 앱의 메인 창에만 답한다. 바깥 프로그램에 약속하는 것은 아니다.

## 구독 연결 상태 (앱 안의 창구)

앱 안에서 뒷단이 화면에 주는 값이다. 바깥 프로그램에는 나가지 않는다.

| 항목              | 값                                                                                   |
| ----------------- | ------------------------------------------------------------------------------------ |
| `provider`        | `claude-code` \| `chatgpt` \| `codex`                                                |
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
- `chatgpt`의 `state`는 `checking`, `signed-out`, `ready`, `error`뿐이다. `-login`은 앱 자신의 브라우저 로그인을 시작하고, `-logout`은 이 앱의 연결만 끊는다. `-install`·`-update`는 `invalid`로 답한다. 답에 `chatgpt` 항목이 없으면(예전 앱) `signed-out`으로 읽는다.

## 문서 호환

- `.docx`·`.xlsx`·`.pptx`·PDF·마크다운·HTML 파일은 원본 프로그램과 같은 방식으로 읽고 쓴다. 한쪽에서 만든 문서를 다른 쪽에서 열 수 있다.
- **마인드맵.** XMind 파일(`.xmind`, `content.json`이 든 형식)을 열고 같은 형식으로 저장한다. 이 앱이 보여 주지 않는 요소와 모르는 값도 저장할 때 그대로 나가고, 바뀐 것이 없으면 원본과 바이트까지 같은 파일을 쓴다. 바뀌었으면 `content.json`만 다시 쓰고, 미리보기 그림(`Thumbnails/thumbnail.png`)은 새로 만들었을 때만 바꾸며, `manifest.json`은 고치지 않는다. 예전 형식(`content.xml`만 있는 파일)과 암호가 걸린 파일은 열지 않는다. 테마는 사용자가 고를 때와 새 시트를 만들 때(새 파일 포함, 기본 테마) 파일 형식의 속성표로 적고, 이 앱만의 표식은 넣지 않는다. 그 밖에는 이미 있는 시트의 테마를 그대로 둔다. 터미널 명령어와 그 MCP 서버는 `.xmind`를 다루지 않는다.
- **열기 암호.** 열기 암호가 걸린 `.docx`·`.xlsx`·`.xlsm`·`.xls`·`.pptx`는 열 때 암호를 묻고, 저장(다른 이름으로 저장 포함)할 때 같은 암호로 다시 잠근다. 다시 잠그는 방식은 Office 2013 이후의 기본(ECMA-376 Agile)이다. 수정 암호만 걸린 `.xls`처럼 엑셀의 기본 암호로 잠긴 파일은 묻지 않고 열며, 그런 `.xls`를 `.xlsx`로 저장하면 열기 암호를 걸지 않는다. 풀 수 없는 방식이면 열지 않고 알린다(결정 0041). 암호가 걸린 PDF도 열 때 암호를 묻고, 저장할 때 원래의 암호화 항목을 그대로 두어 다시 잠근다. PDF 편집기의 주석 → 보호에서 암호를 걸거나 바꾸거나 풀면 다음 저장이 AES-256(V5/R6)으로 새로 잠근다. 인증서로 잠긴 PDF는 열지 않고 알린다.
- 가리기 표시는 문서 안에 저장되고, 그 이름공간 주소는 원본과 같다. 원본으로 가린 문서를 열면 가리기가 그대로 인식된다.
- 문서 곁에 저장되는 보조 파일의 이름(`.genoffice-assets.json` 등)도 원본과 같다.
- `.odt`는 한컴 한글 2024가 읽은 결과를 기준으로 맞춘다. 받은 ODT를 고쳐 저장하면 고친 부분만 다시 쓰고, 나머지 zip 항목과 XML은 바이트 그대로다. 고친 것이 없으면 원본과 같은 파일이 나온다. 다시 묶을 때 `mimetype`을 맨 앞에 압축 없이 둔다(한컴은 이것을 받은 파일과 똑같이 읽는다). 한컴이 아닌 프로그램의 ODT도 같은 규칙으로 열지만, 합격 기준에는 넣지 않았다.
- 문서 안에 적히는 작성자 이름(PDF 주석 작성자, 엑셀 메모 작성자, 명령어가 넣는 메모 작성자)은 지금 "GenOffice"다. PDF 편집기에서 사람이 새로 단 메모와 구절 카드를 "메모로 남기기"한 메모는 PC 계정 이름이다(모를 때만 "GenOffice").
- PDF 편집기에서 받아들인 AI 핵심 표시는 표준 형광펜(`/Highlight`)이고, 분류 이름이 주석 제목(`/Subj`, 앞뒤 공백을 떼고 200자까지)에 들어간다. 이 값이 없는 주석의 저장 결과는 예전과 바이트 단위로 같다. 구절 카드에서 남긴 메모는 표준 `/Text` 메모이고, 내용 첫 줄이 화면 언어의 "AI 설명" 또는 "AI 번역(언어)"이다. "모두 받아들이고 저장"은 받아들이기와 PDF 저장을 한 번에 하는 **명시적 저장 동작**이고, 저장이 성공하기 전에는 보관소에 `accepted`를 쓰지 않는다.
- PDF 편집기의 "다른 이름으로 저장"은 **사본에만** 주석 처리를 고른다. 그대로 두기(기본, 다른 PDF 앱에서 고칠 수 있음), 페이지에 굽기(PDFium으로 주석·입력란을 페이지 내용으로 만들어 모든 뷰어에서 보이게 함, 되돌릴 수 없음), 주석 빼기(메모·형광펜·그리기·도장만 빼고 링크·입력란은 남김) 셋이다. 원본과 그 자리 저장은 바뀌지 않고, 편집이 없는 사본은 원본 바이트 그대로 복사한다. 인쇄는 주석을 기본으로 그리며, 인쇄 창에서 끌 수 있다.
- 파워포인트 편집기에서 고른 디자인 템플릿은 문서 안이나 곁에 쓰지 않는다. 문서에 남는 것은 평범한 도형·글·글꼴 이름뿐이다.
- 저장한 스타일 파일(`<데이터 폴더>/style-templates/<이름>.json`)에는 선택 항목 `basedOn`(기본 템플릿의 id)이 붙을 수 있다. 이 값을 모르는 예전 버전은 무시하고 그대로 읽는다.
- 한글 문서(`.hwp`·`.hwpx`)는 연 형식 그대로 저장한다. 파일이 없는 새 문서의 첫 저장은 설정 → 일반의 "새 한글 문서 저장 형식"(기본 HWP)을 먼저 제안한다. 한 탭이 파일을 처음 덮어쓰기 전에 원본을 같은 폴더에 `<파일 이름>.bak`으로 남긴다. 암호가 걸린 문서는 저장하지 않는다. AI는 한글 문서에서 글자를 바꾸고, 문단을 넣고 지우고, 본문에 표를 넣고, 있는 표의 빈 칸을 채우고(글자가 있는 칸은 사용자가 바꾸라고 했을 때만 덮어쓰고, 그림이 든 칸은 쓰지 않는다), 본문의 표에 행과 열을 넣고 빼고, 첨부한 파일(한글·워드·엑셀·파워포인트·PDF·글자 파일·그림)을 참고 자료로 읽고, 사용자가 편집기에서 선택한 부분만 고치고, 글자 모양 일부(굵게·기울임·밑줄·취소선·크기·색·형광펜)와 문단의 정렬·줄 간격을 바꾸고, 누름틀을 채운다. 표·그림·누름틀이 놓인 문단은 지우지 않는다.
- 앱 안에서 한글 문서는 편집기 밖에서 읽기만 한다. 홈의 파일 검색과 지식 자료, 다른 편집기 AI의 첨부, 터미널 명령어(`ieumoffice hwp read`, `info`), MCP(앱의 `read_hwp`, 명령어 쪽의 `hwp_read`)가 글자를 읽는다. 문단은 한 줄로, 표는 행마다 칸을 `|`로 이어 적는다. MCP의 열린 문서 읽기는 한글 탭의 저장하지 않은 내용까지 읽고, 저장은 하지 않는다. 앱 안 MCP로는 한글 문서를 고치지 않는다. 암호가 걸린 문서는 읽지 않는다.
- **터미널 명령어로 한글 문서를 만들고 고친다(결정 0079).** `ieumoffice hwp apply <파일> --ops`(MCP `hwp_apply`)와 `ieumoffice create --type hwp|hwpx --ops`(MCP `create_hwp`)다. 연산은 한글 편집기 AI의 도구 그대로이고(이름, 입력, 답한 글), 앱의 플러그인이 같은 엔진에서 한다. 그래서 찾은 말이 여러 곳이면 고르지 않고, 표·그림·누름틀·메모를 잃는 변경은 되돌리고 거절한다. 그림 넣기, 웹 읽기와 그림 찾기·만들기, 편집기 선택 도구는 명령어에 없다(`unsupported`). 연산 목록은 `ieumoffice guide hwp`이고 도구 정의에서 만든다. 저장은 앱의 저장과 같다. 연 형식 그대로(`--out`이면 그 확장자로) 쓰고, `.hwp`는 엔진이 다시 읽어 쪽수가 같을 때만 쓰며, 새 탭 폭·필드 종류·바탕쪽과 메모를 바로잡고(결정 0024·0026·0028), 덮어쓰는 파일은 먼저 `<파일 이름>.bak`으로 남긴다. 변경 추적이 든 `.hwp`는 지금의 내용으로 고치고(결정 0027) `detail.warnings`로 알린다. 읽기 연산만 든 묶음은 파일을 쓰지 않는다. 암호가 걸린 문서는 `unsupported`다. 앱이 탭으로 연 파일은 다른 형식처럼 `--force` 없이 쓰지 않는다.
- **한글 메모(결정 0072).** `.hwp`·`.hwpx`의 메모는 본문·표 칸·글상자에서 읽고, 앱의 메모 패널에서 평문으로 넣고 고치고 지운다(한 영역에 새 메모 하나, 서식 있는 메모는 읽기 전용). 작성자는 사용자 이름 설정 → PC 계정 이름 → `IeumOffice`(제품 이름), 새 메모의 날짜는 파일이 담고 있을 때만 보인다. 메모 편집기가 열려 있는 동안 저장은 `메모 작성을 먼저 저장하거나 취소해 주세요.`로 막고, 탭 닫기·종료는 메모를 버리고 닫을지 묻는다. AI는 메모를 읽을 수 있지만 쓰는 도구가 없고, 앵커를 지우는 편집은 그 요청에 한해 사람의 승인을 받는다. 저장은 연 형식 그대로 하고, `.hwpx`에서 실제로 빠진 메모가 있을 때만 수와 함께 HWP 저장을 안내한다. 메모가 없는 문서의 저장 결과는 예전과 같다.
- **한글 읽기의 메모.** `hwpToText`와 `parseFileToText`는 메모가 있으면 본문과 표 뒤에 `### Comments` 블록을 붙인다. 첫 줄은 `- 작성자 (p.N): 첫 줄`, 이어지는 줄은 두 칸 들여쓰며, 작성자가 없으면 `unknown`, 쪽을 모르면 `(p.N)`을 뺀다. 메모가 없으면 블록을 붙이지 않는다. 같은 읽기를 쓰는 터미널 명령어(`ieumoffice hwp read`, `info`)와 MCP(`read_hwp`, `hwp_read`)의 출력에도 이 블록이 붙는다. 메모를 읽지 못하면 블록 없이 본문만 돌려준다. 이미 색인된 파일의 메모는 그 파일이 바뀌어 다시 색인될 때 검색에 들어간다. `hwpMemosOf`는 저장 검증을 위해 메모를 구조로 돌려주며, 엔진이 모델에 담지 못한 원시 기록은 세지 않는다.

## 설치본과 업데이트

- 설치 파일 이름은 `IeumOffice-Setup-<버전>.exe`, 설치 식별자는 `io.github.pblsketch.ieumoffice`, 실행 파일은 `IeumOffice.exe`다.
- 파일 연결의 등록 이름은 `IeumOffice.<종류>` 꼴이다(`IeumOffice.WordDocument` 등).
- 이음오피스는 Windows 기본 앱 목록에 `RegisteredApplications`의 `IeumOffice`와 `Software\IeumOffice\Capabilities\FileAssociations`로 오른다. 이 등록은 기본 프로그램을 바꾸지 않고, 사용자가 기본 앱에서 이음오피스를 고를 때 앱 실행 파일이 아니라 확장자별 ProgId(문서 아이콘)가 기록되게 한다. `.hwp`·`.hwpx`·`.xmind`·`.odt`는 여기서도 "연결 프로그램" 후보일 뿐이다.
- `.odt`는 "연결 프로그램" 후보로만 등록한다(`IeumOffice.OpenDocumentText`와 `.odt\OpenWithProgids`의 값 하나, `apps/shell/build/installer.nsh`). 기본 프로그램은 바꾸지 않는다. 지울 때는 그 값과 등록 이름만 지운다.
- Windows 설치본은 `.txt`·`.json`·`.xmind`를 이 앱에 연결해 등록하지 않는다. 설치해도 그 파일들의 기본 프로그램이 바뀌지 않는다. 앱 안에서는 열기 창, 끌어다 놓기, 최근 파일, 폴더 나무로 열고, 실행 인자로 경로를 받으면 연다.
- 자동 업데이트는 `pblsketch/openoffice`의 GitHub 릴리스에서 `latest.yml`과 설치 파일을 읽는다. 릴리스는 `v<버전>` 태그여야 한다.
