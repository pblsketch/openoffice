# 엑셀 처리 프로그램 (xlsx-engine)

통합 문서 파일을 읽고 다시 묶는 Rust 프로그램이다. 폴더 이름은 `xlsx-engine`이지만 패키지와 실행 파일의 이름은 `xlsx-sidecar`(라이브러리는 `xlsx_sidecar`)다. TypeScript 쪽이 자식 프로세스로 띄우고 표준 입출력으로 요청을 주고받는다. 원본(GenOffice)의 문서 엔진을 그대로 쓰는 곳이다.

## 맡은 범위

- 열기와 읽기. `open`은 압축 파일을 검사하고 시트 목록·서식·도형·정의된 이름 같은 메타데이터만 돌려준다. 셀은 `read_range`가 주고, `read_formula_cells`·`read_row_outline`·`read_media`·`find_cells`가 같은 세션을 읽는다.
- 저장용 묶기(`src/archive.rs`): `archive_manifest`, `read_entries`, `scan_entries`, `save_archive`. 세션 없이 파일 경로만 받는다.
- 수식 재계산 `recalc_cells`(IronCalc)와 옛 형식 가져오기 `convert_workbook`(calamine).
- 표준 입출력 프로토콜(`src/main.rs`의 `Command`, `Request`, `Response`).

## 맡지 않는 것 (경계)

- 고친 XML을 만드는 일은 `packages/xlsx-gateway`가 한다(`saveWorkbookViaSidecar`, `planCellEditsToXlsx`). 이 프로그램은 항목을 꺼내 주고 받은 내용 파일로 압축 파일을 다시 묶을 뿐, 무엇이 편집됐는지 모른다. 저장 전후 목록 비교(`assertManifestPreserved`)와 임시 대상을 최종 경로로 옮기는 일(`promoteFileAtomically`)도 그쪽이다.
- 프로세스를 띄우고 죽이는 일, 시간 제한(기본 30초, 묶기·변환·재계산 180초), 응답 짝 맞추기는 `apps/sheets/src/main/xlsx-sidecar-client.ts`가 한다. 어느 파일을 열지도 뒷단이 정한다. `sheets-main.ts`는 사용자의 파일이 아니라 스냅숏 사본의 경로를 `open`에 넘긴다.
- 응답 검증은 `apps/sheets/src/shared/desktop-api.ts`의 zod 스키마(`workbookRangeResultSchema`, `workbookFindCellsResultSchema` 등)가 한다.
- 저장하지 않은 편집은 여기서 보이지 않는다. `find_cells`는 파일에 있는 값만 찾고, 편집분은 렌더러가 덧씌운다.
- CLI(`packages/cli/src/formats/xlsx.ts`의 `withSidecar`)는 호출마다 프로세스를 새로 띄우고 끝나면 멈춘다. 실행 파일을 찾는 순서는 `packages/cli/src/resources.ts`의 `xlsxSidecarPath()`가 정한다.
- 설치 파일에 실행 파일을 넣는 일은 `apps/shell/electron-builder.cjs`가 한다.

## 항상 지켜야 하는 것

- 이 프로젝트는 원본의 수정을 병합할 때만 이 크레이트의 동작을 바꾼다. 같은 파일에서 나오는 결과는 원본이 내는 것과 같아야 한다. 이름(`xlsx-sidecar`, 명령과 필드 이름, 기본 로캘 `"zh"`, 임시 폴더 접두사)을 고치지 않고, 파일을 옮기거나 다시 포맷하지 않는다. 그래야 원본의 수정이 충돌 없이 들어온다.
- 요청과 응답은 한 줄에 JSON 하나다. 요청은 `version`, `requestId`, `command`(snake_case 값)와 그 명령의 필드(camelCase)를 한 객체에 평평하게 담는다. 응답은 `version`, `requestId`, `ok`와 `result` 또는 `error: { code, message }` 중 하나다. 이 모양과 이름을 바꾸지 않는다.
- `PROTOCOL_VERSION`(지금 1)은 `src/main.rs`와 `xlsx-sidecar-client.ts`에 따로 있다. 한쪽만 올리지 않는다. 클라이언트는 버전이 다른 줄을 잡음으로 버리므로, 어긋나면 오류가 아니라 모든 요청의 시간 초과로 나타난다. 깨진 JSON 요청도 같다. `invalid_json` 응답은 `requestId`가 비어 있어 짝이 맞지 않는다.
- stdout에는 `write_response`로만 쓴다. `println!` 같은 출력을 넣지 않는다. 응답은 요청 루프, `xlsx-reader`, `xlsx-recalc` 세 스레드가 한 잠금 아래에서 쓰므로 요청 순서와 다르게 나올 수 있고, 짝은 `requestId`로만 맞춘다.
- 오류 문장도 계약이다. 클라이언트는 `error.code`를 버리고 `message`만 `Error`로 넘긴다. 렌더러(`univer-sync.ts`)는 재계산이 겹쳤는지를 `busy with another recalculation`이라는 문장 조각으로 알아본다. `recalc_busy`의 문장을 바꾸면 "바쁨"이 실패로 세어지고, 실패가 쌓이면 렌더러가 재계산을 끈다.
- 원본의 수정이 응답에 필드를 더할 때는 zod 스키마도 함께 고치고 선택 필드로 받는다. `.strict()`로 선언된 객체에 모르는 필드가 생기면 응답 전체가 거절되고, 반대로 낡은 실행 파일이 붙으면 그 필드가 없다. 새 명령 variant에는 `#[serde(rename_all = "camelCase")]`를 붙인다. `Command`의 `rename_all`은 명령 이름에만 걸리므로 빼먹으면 필드를 snake_case로 기다린다.
- `save_archive`는 손대지 않은 항목을 압축된 바이트 그대로 옮긴다(`raw_copy_file_rename`). 풀었다가 다시 압축하지 않는다. 바뀐 항목과 새 항목만 `contentPath` 파일을 읽어 Deflate로 쓴다. 항목은 원본 순서를 따르고 새 항목은 끝에 붙는다. 응답의 `beforeEntries`·`afterEntries`(이름, CRC, 압축 크기, 원래 크기)가 보존을 증명하는 자료이므로 그 뜻을 바꾸지 않는다.
- `save_archive`는 `targetPath`를 바로 덮어쓴다. 원본과 같은 파일이면 `Save target must differ from the source archive.`로 거절한다. 원본을 읽으면서 쓰기 때문이다. 한 이름은 `replacements`·`removals`·`additions` 중 한 곳에만 올 수 있고, 없는 항목의 교체·삭제와 있는 항목의 추가는 거절한다.
- 읽기 명령은 통합 문서 파일에 쓰지 않는다. 재계산도 값만 돌려주고 IronCalc 모델을 파일로 저장하지 않는다. 예외는 `convert_workbook` 하나다. 값·수식·날짜 서식만 담은 새 파일을 만드는 것이고 보존 저장이 아니다.
- 크기 한도는 아래 상수가 정한다. 값을 바꾸지 않는다.

  | 상수                                        | 값                 | 걸리는 곳                                                       |
  | ------------------------------------------- | ------------------ | --------------------------------------------------------------- |
  | `MAX_ENTRY_COUNT`                           | 10,000개           | `open`과 묶기 명령의 압축 항목 수. 저장은 원본 항목 + 추가 항목 |
  | `MAX_EXTRACTED_ENTRY_BYTES`                 | 500 MiB            | `read_entries`가 꺼내는 항목, `read_zip_string`으로 읽는 부품   |
  | `MAX_MEDIA_BYTES`                           | 20 MiB             | `read_media` 한 건                                              |
  | `MAX_RANGE_CELLS`                           | 100,000칸          | `read_range` 한 번                                              |
  | `MAX_FIND_MATCHES`, `FIND_TIME_BUDGET`      | 100,000건, 8초     | `find_cells` 한 쪽. 넘으면 `nextCursor`를 주고 끊는다           |
  | `MAX_RECALC_EDITS`, `MAX_RECALC_READ_CELLS` | 10,000건, 20,000칸 | `recalc_cells` 한 번                                            |

- 항목이 선언한 크기를 믿지 않는다. 항목을 메모리나 파일로 옮길 때는 `copy_entry_bounded`를 거친다. 선언 크기와 한도 중 작은 값보다 1바이트를 더 읽어 보고, 읽히면 `ZIP entry inflates past the size it declares.`로 거절한다. `visuals.rs`의 `read_optional_xml`은 원본 그대로 `read_to_string`을 쓴다. 이것을 근거로 한도 없는 읽기를 더하지 않는다.
- 500 MiB를 512 MiB로 올리지 않는다. 뒷단은 항목을 JavaScript 문자열로 고치는데 V8 문자열의 최대 길이가 536,870,888바이트라, 그 사이 크기의 항목은 한도를 통과한 뒤 문자열로 만들다 실패한다. `packages/xlsx-gateway/src/shared/edit-schemas.ts`의 `MAX_PATCH_ENTRY_BYTES`와 같은 값이어야 한다. 압축 파일 전체 크기의 한도는 이 프로그램에 없다.
- 항목 이름 검사를 더 엄격하게 만들지 않는다. `canonical_entry_name`은 앞의 `/`, `\` 구분자, `./`, 빈 구간을 접어 준다(Excel이 여는 파일이다). 거절하는 것은 NUL 문자와 `..`로 패키지 밖으로 나가는 이름뿐이다. 저장하면 접힌 이름으로 다시 쓴다.
- `open`마다 UUID v4 세션 id를 만들고 시스템 임시 폴더 아래에 "접두사 + 세션 id" 폴더를 하나 둔다. 접두사는 원본 시절의 접두사를 일부러 그대로 둔 것이다. 이 문자열은 `src/lib.rs`(`create_cache_directory`)와 `src/tests.rs`에만 있고, 저장소의 이름 검사는 그 두 파일에서만 이를 허용한다. 바꾸지 않고, 다른 파일(이 문서 포함)에 옮겨 적지 않는다.
- 세션과 임시 폴더는 짝이다. 폴더는 `CacheDirectory`가 쥐고, `commit` 전에 끝나는 모든 경로(취소, 오류, panic)에서 지운다. `commit`은 세션을 등록한 바로 뒤에만 한다. 등록된 폴더는 `close`가 색인 스레드를 멈추고 기다린 뒤 지운다. 세션 없는 폴더나 폴더 없는 세션이 남는 순서로 고치지 않는다.
- 남은 세션의 일괄 정리(`WorkbookSessions`의 `Drop`)는 stdin이 닫혀 `main`이 끝날 때만 돈다. `XlsxSidecarClient.stop()`은 프로세스를 `kill()`하므로, 그 전에 `close`를 받지 못한 세션의 폴더는 이 프로그램이 지우지 못한다.
- `read_entries`는 호출자가 준 `outputDir`에 `entry-{index}.bin`으로 쓴다. 그 폴더는 이미 있어야 하고, 이 프로그램은 만들지도 지우지도 않는다.
- 네트워크를 쓰지 않는다. 코드에 `std::net`이 없고 `Cargo.lock`에 HTTP 클라이언트가 없다. 다른 통합 문서를 가리키는 수식은 그 파일을 찾아가지 않고 파일에 저장된 값을 고정한다(`pin_unparsable_formulas`). URI 스킴이 붙은 관계 대상은 `resolve_relationship_target`이 거절한다. 네트워크나 다른 프로세스를 여는 의존성을 더하지 않는다.

## 이 모듈의 방식

- 명령줄 인자를 받지 않고 설정용 환경 변수도 없다. 클라이언트의 첫 요청 때(또는 `start()`로 미리) 뜨고, 앱의 모든 시트 탭이 한 프로세스를 같이 쓴다. 세션은 메모리에만 있어서 다시 뜬 프로세스는 이전 세션 id를 모두 `Unknown workbook session.`으로 거절한다.
- `xlsx-reader` 스레드가 stdin을 읽어 길이 8의 큐에 넣고, 요청 루프가 도착 순서대로 하나씩 실행한다. `cancel`만 리더 스레드가 큐를 거치지 않고 처리한다.
- 오래 걸리는 일을 요청 루프에서 직접 돌리지 않는다. 재계산이 `xlsx-recalc` 스레드로 빠진 이유다. 수식이 많은 파일의 첫 가져오기는 몇 분이 걸리고, 그동안 뒤에 선 `read_range`가 전부 시간 초과되어 시트가 빈 화면이 됐다. 재계산은 한 번에 하나만 돌고 겹치면 바로 `recalc_busy`로 답한다.
- 읽기 흐름: `open`은 셀을 주지 않는다. 시트별 색인 스레드(`xlsx-index-{n}`)는 그 시트를 처음 읽을 때 뜨고(`ensure_parser`), 256행(`CHUNK_ROW_COUNT`)씩 임시 폴더의 `sheet-{i}-chunk-{n}.json`에 쓴다. `read_range`는 색인이 `endRow`에 닿기를 최대 750ms(`RANGE_WAIT`) 기다리고, 색인보다 4,096행(`RANGE_WAIT_MAX_LAG_ROWS`) 이상 앞선 범위는 기다리지 않고 바로 답한다. 호출자는 응답의 `indexedThroughRow`·`indexingComplete`를 보고 다시 묻는다.
- 조건부 서식, 자동 필터, 데이터 유효성, 시트 보호, 페이지 나누기, 보호 범위, 인쇄 설정은 `indexingComplete`가 참일 때만 채운다. 그 전의 빈 값은 "없음"이 아니라 "아직 모름"이다.
- 응답의 시트 id는 `sheet-` 뒤에 통합 문서의 `sheetId` 값을 붙인 것이고, 조각 파일 이름의 `{i}`는 시트의 순번이다. 둘을 섞지 않는다. 행과 열은 0부터 세고, 1부터 세는 IronCalc에는 `recalc.rs`가 1을 더해 넘긴다.
- 저장 흐름: `archive_manifest`로 목록을 받고, `read_entries`로 고칠 항목을 파일로 꺼내고, 뒷단이 고친 내용을 파일로 쓴 뒤, `save_archive`가 다시 묶는다. 큰 내용은 stdout의 JSON이 아니라 파일 경로로 오간다. `scan_entries`는 고치기에는 너무 큰 항목이 편집된 시트를 가리키는지 XML 글자만 훑어 알려 준다.
- 재계산 모델은 경로별로 최대 2개(`MAX_RESIDENT_MODELS`)를 쥐고, 원본이 8,000,000바이트(`HEAVY_SOURCE_BYTES`)를 넘는 것은 하나만 둔다. 파일의 수정 시각이나 크기가 달라졌거나, 앞서 넣은 편집이 이번 편집 목록에 없으면(되돌리기) 파일에서 다시 가져온다. `close`는 모델을 바로 버리고(재계산 중이면 예약한다), `save_archive`는 대상 경로의 모델만 버리도록 예약한다. 원본 경로의 모델을 남기는 것은 복구 사본을 저장할 때마다 처음부터 다시 가져오지 않기 위해서다.
- IronCalc의 가져오기는 엄격해서 panic할 수 있다. `catch_unwind`로 그 요청만 `workbook_error`가 되게 하고, 작업 중인 모델은 캐시에서 빼 두어 실패한 모델이 다시 쓰이지 않게 한다.
- 취소는 두 갈래다. 큐에서 기다리는 요청은 `CancelledRequests`(최대 256개, 넘치면 오래된 것부터 잊는다)가 실행 직전에 걸러 내고, 이미 실행 중인 `open`과 `find_cells`는 `InFlightRequest`의 깃발을 단계 경계에서 확인한다. 그 밖의 실행 중인 명령은 멈추지 않는다. 취소된 `open`은 세션도 폴더도 남기지 않는다.
- `lib.rs`가 하위 모듈을 `use workbook::*`처럼 통째로 들이고 대부분의 모듈은 `use super::*`로 받는다. 항목이 어느 파일에 있든 크레이트 루트의 이름으로 쓰이므로, 같은 이름을 두 모듈에 두면 충돌한다.
- cargo는 `.cargo/config.toml`을 `--manifest-path`가 아니라 현재 폴더에서 찾는다. `apps/sheets`에서 도는 `native:build`가 `--config`로 따로 넘기는 이유다. 이 설정이 MSVC CRT를 정적으로 묶는다. 빠지면 VC++ 재배포 패키지가 없는 PC에서 실행 파일이 뜨지 않아 모든 열기가 실패한다.
- 산출물 위치가 둘이다. `native:build`와 `cargo build --release`는 `target/release/xlsx-sidecar.exe`를 만든다(개발 실행, 테스트, CLI가 찾는 곳). 설치 파일 빌더는 x64에서 `target/x86_64-pc-windows-gnu/release/xlsx-sidecar.exe`를 찾고, 없으면 `beforePack`에서 `win extraResources source missing`으로 멈춘다. MSVC 도구로 빌드하는 PC에서는 실행 파일을 그 폴더로 복사해 둔다. 이 복사를 해 주는 스크립트는 없으므로, 다시 빌드하고 복사를 빠뜨리면 예전 실행 파일이 설치 파일에 들어간다.
- 의존성을 더하면 `Cargo.lock`도 함께 커밋하고, 라이선스가 `deny.toml`의 허용 목록에 있어야 한다(CI가 `cargo deny`로 확인한다).
- 배포하고 검증하는 플랫폼은 Windows뿐이다. Apple Silicon dmg는 `npm run native:build:darwin-arm64`(`cargo build --release --target aarch64-apple-darwin`)의 `target/aarch64-apple-darwin/release/xlsx-sidecar`를 넣는다. 그 빌드는 macOS 러너에서만 되고, 이 저장소에서 Mac으로 열어 본 검증은 없다. Linux 패키징 경로는 원본의 것이 남아 있다.

## 테스트

- 빌드 PC의 PATH에는 `cargo`가 없다. Git Bash에서 `export PATH="$HOME/.cargo/bin:$PATH"`를 먼저 하고 이 폴더에서 `cargo test`를 돌린다. 저장소 어디서든 `npm run native:test -w @genoffice/sheets`로도 같다.
- 테스트는 `src/tests.rs`, `src/visuals/tests.rs`와 `archive.rs`·`main.rs`·`recalc.rs`·`find.rs` 등의 `mod tests`에 있다. 따로 둔 `tests/` 폴더나 픽스처 파일은 없다. 통합 문서는 `open_fixture(&[(항목 이름, XML)])`로 테스트 안에서 만든다.
- `cargo test`는 `target/release`의 실행 파일을 다시 만들지 않는다. `apps/sheets/tests`의 사이드카 테스트(`xlsx-sidecar.test.ts`, `xlsx-streaming-save.test.ts`, `xlsx-recalc.test.ts`, `xlsx-borders.test.ts`, `ole-roundtrip.test.ts`)는 `XLSX_SIDECAR_PATH`를 읽지 않고 `native/xlsx-engine/target/release/`의 실행 파일을 직접 연다. Rust를 고친 뒤 `cargo build --release`(또는 `npm run native:build -w @genoffice/sheets`) 없이 돌리면 예전 실행 파일을 시험하게 된다.
- `XLSX_SIDECAR_PATH`를 읽는 곳은 둘이다. CLI의 `xlsxSidecarPath()`는 이 값을 가장 먼저 본다. 시트 뒷단의 `resolveSidecarPath()`는 주입된 `runtime.sidecarPath` 다음에 보는데, shell이 항상 경로를 주입하므로 통합 앱에서는 이 변수가 효과가 없고 시트 단독 실행에서만 적용된다.
- `packages/cli/tests`의 사이드카 테스트는 실행 파일을 찾지 못하면 `skipIf`로 건너뛴다. 실패가 없다는 것만 보지 말고 건너뛴 수를 본다.
- 바꾼 곳에 따라 반드시 덮는 것:
  - 프로토콜: `main.rs`의 테스트처럼 `handle_line`에 요청 한 줄을 넣어 확인하고, `xlsx-sidecar.test.ts`로 실제 응답이 zod 스키마를 통과하는지 본다.
  - 저장: 손대지 않은 항목의 저장 전후 목록이 같은지(`saves_with_raw_copy_replacement_removal_and_addition`), 겹치거나 없는 항목의 편집이 거절되는지, 그리고 `xlsx-streaming-save.test.ts`.
  - 한도: 한도를 넘는 입력의 거절과, 선언보다 크게 풀리는 항목의 거절(`rejects_xml_entry_that_inflates_past_its_declared_size`, `rejects_media_entry_that_inflates_past_its_declared_size`).
  - 세션과 취소: `cancelled_open_registers_no_session`, `cancel_after_the_cache_directory_is_created_reclaims_it`, `cancel_during_an_in_flight_open_abandons_it`.
  - 재계산 캐시: `save_archive_keeps_the_source_resident_model_warm`, `concurrent_recalc_reports_busy`.
- 원본의 수정을 병합할 때는 그 수정의 테스트도 함께 가져오고, 병합 뒤에 Rust 테스트와 TypeScript 사이드카 테스트를 둘 다 돌린다.
