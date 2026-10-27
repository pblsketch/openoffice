# xlsx-gateway

## 맡은 범위

xlsx 파일에 대한 쓰기 관문과 통합 문서 도메인 로직을 맡는다.

- `src/gateway/`: 편집 내용을 zip 항목 단위의 변경 계획(`MutationPlan`)으로 바꾸는 OOXML 패치. 셀 값과 수식, 행·열 삽입·삭제와 그에 따른 참조 이동, 시트 추가·삭제·이름 변경, 스타일, 조건부 서식, 유효성 검사, 표, 피벗, 차트·도형·그림, 메모, 하이퍼링크, 보호, 페이지 설정, CSV 가져오기, HTML 표 가져오기.
- `src/domain/`: AI와 명령줄 도구가 쓰는 통합 문서 명령 언어(`workbook-dsl`)와 그 실행 모델, 피벗 계산, 차트 추천, 수식 참조 이동.
- `src/shared/`: 렌더러와 함께 쓰는 편집 스키마(zod)와 격자 한계.

Sheets 앱(메인과 렌더러)과 명령줄 도구(`packages/cli`)가 쓴다.

## 맡지 않는 것 (경계)

- 통합 문서를 읽어 격자에 올리는 일과 큰 파일의 zip 재조립은 Rust 사이드카(`apps/sheets/native/xlsx-engine`)가 한다. 이 패키지는 사이드카를 띄우지 않고 `ArchiveClient` 인터페이스로만 만난다. 테스트는 그 자리에 대역을 끼운다.
- 격자 UI, 수식 계산 엔진(Univer), IPC, 저장 시점 결정은 `apps/sheets`다. 이 패키지는 Univer와 Electron을 import하지 않는다.
- AI 도구 정의와 모델 호출은 `apps/sheets`와 `packages/agent-core`다. 여기 있는 것은 명령 스키마와 그 실행 규칙까지다.
- 첨부용 평문 추출은 `packages/file-parse`다. PDF에서 새 통합 문서를 만드는 일은 `packages/pdf2docx`가 이 패키지 없이 직접 한다.
- 압축 폭탄 판정의 구현은 `packages/zip-gate`다.

## 항상 지켜야 하는 것

- 계획에 없는 항목은 바이트가 바뀌면 안 된다. 저장 뒤에 `assertOnlyTouchedEntriesChanged`(메모리 경로)나 `assertManifestPreserved`(사이드카 경로)가 항목별 해시·CRC를 전후로 비교하고, 뜻하지 않은 수정·삭제·생성이 하나라도 있으면 저장을 중단한다. 새 패치 단계는 고친 항목을 `touchedEntries`에, 만든 항목을 `addedEntries`에, 지운 항목을 `removedEntries`에 빠짐없이 올린다.
- 패치는 XML 문자열에 대한 좁은 치환이다. 파트를 파싱해 통째로 다시 쓰지 않는다. 손대지 않은 셀과 행의 바이트가 남아야 한다.
- 이해하지 못하는 구조 위에서는 추측해서 쓰지 않고 거부한다. x14 확장 유효성 검사와 조건부 서식, 새 피벗과 시트 관리 변경의 동시 저장이 그런 경우다. 반쯤 맞는 파일을 쓰느니 저장을 실패시킨다.
- 오류 문구는 계약의 일부다. Sheets 렌더러가 부분 문자열로 찾아 번역한다(`apps/sheets/src/renderer/save-actions.ts`의 `SAVE_ERROR_PATTERNS`). 문구를 다듬으면 그 표와 함께 고친다. 표에 없는 문구는 영어 그대로 사용자에게 보인다.
- 열 때의 한도는 docx·pptx보다 좁다. 항목 10,000개, 파트당 256 MiB, 합계 256 MiB(`XLSX_ZIP_LIMITS`)다. `loadSafeZip`은 파트를 실제로 풀어 보는 검사 → CRC32 검증을 켠 로드 → 항목 이름 정규화 순으로 돈다. 루트를 벗어나는 `..`과 NUL이 든 이름은 거부하고, 역슬래시·맨 앞 `/`·빈 마디는 접는다.
- 사이드카 경로에서 한 항목을 메모리에 올려 고칠 수 있는 크기는 500 MiB(`MAX_PATCH_ENTRY_BYTES`)다. 더 큰 항목은 보존은 되지만 고칠 수 없다. V8의 문자열 최대 길이보다 일부러 작게 잡은 값이다.
- 셀 주소는 격자 범위(1,048,576행 × 16,384열) 안이어야 한다. 범위를 넘는 주소는 쓰기에 성공한 것처럼 보이고 다시 열면 값이 없다. 주소 문자열로 정규식을 만들기 전에 `isGridCellAddress`로 거른다.
- 사용자 파일을 제자리에서 고치지 않는다. 같은 폴더의 임시 파일에 쓰고 바꿔치기한다. Windows에서는 백신·색인·동기화 프로그램이 잠깐 잡고 있으면 rename이 EPERM/EACCES/EBUSY로 실패하므로 재시도하고, 그래도 안 되면 대상을 백업한 뒤 덮어쓰고 도중에 실패하면 복원한다. fsync가 거부되는 것은 저장 실패로 치지 않는다.
- 저장 전에 원본이 그사이 바뀌지 않았는지 확인한다. `mutateXlsxFile`은 파일 전체의 SHA-256, `applyPlanToXlsx`는 셀마다의 이전 값, 사이드카 경로는 계획 전후의 매니페스트를 본다.
- 엔진 동작은 원본(GenOffice)의 수정이 병합될 때만 바뀐다. 파일 이동, 재포맷, 이름 변경을 하지 않는다.

## 이 모듈의 방식

- 계획과 조립이 나뉘어 있다. `planCellEditsToXlsx(EntrySource, …)`는 항목을 어떻게 읽는지 모르는 채로 `MutationPlan`을 만든다. 조립은 둘 중 하나다. `assembleWithJsZip`은 메모리에서 모든 항목을 다시 압축하므로 전체 크기 한도에 묶인다. `saveWorkbookViaSidecar`는 고친 항목만 임시 파일로 넘기고 나머지는 사이드카가 압축된 바이트 그대로 복사한다. 큰 파일은 이 경로로 간다.
- 계획 단계들은 `PackageEditor`를 통해 읽는다. 원본 위에 대기 중인 수정을 덧씌운 뷰라서 뒤 단계가 앞 단계의 결과를 본다. 원본 `EntrySource`를 직접 읽으면 앞선 수정을 잃는다.
- 사이드카 원본에서 500 MiB를 넘는 항목은 읽을 수 없다. 그런 항목을 고쳐야 하는 단계는 `canPatch`로 먼저 묻고, 건너뛰어도 되는지는 `containsText`로 참조 여부를 확인한 뒤 정한다. 참조가 있으면 실패시킨다.
- 일부 생성기는 spreadsheetml 이름공간에 접두사를 붙인다(`<x:workbook>`). 접두사 없는 요소 패턴이 먹도록 읽을 때 `normalizeOoxmlPartPrefix`로 벗긴다. 계획이 다시 쓰는 파트만 파일에 닿으므로 손대지 않은 항목은 원래 바이트다.
- Excel 2007 이후에 생긴 함수는 파일 안에서 `_xlfn.`(일부 동적 배열 함수는 `_xlfn._xlws.`) 표지를 달고 저장된다. 사이드카가 읽을 때 떼어 내므로, 수식을 시트 XML로 쓸 때 다시 붙인다. 빠지면 Excel이 `#NAME?`로 고친다.
- 행·열을 밀 때는 같은 묶음 안에서 그 시트에 걸린 도형 앵커, 표 범위, VML 앵커, 차트 참조, 다른 시트의 수식, 정의된 이름도 함께 민다.
- CSV 가져오기는 값만 옮긴다. 숫자처럼 보이는 칸만 숫자가 되고 앞자리 0은 살며, 수식처럼 보이는 글자는 수식이 아니라 글자로 남는다. Excel은 CSV를 시스템의 옛 문자셋으로 쓰므로, UTF-8로 읽히지 않으면 후보 문자셋(gb18030, shift_jis, big5, euc-kr, windows-1252)을 점수로 고른다.
- HTML 표 가져오기(`gateway/html-import.ts`)도 값만 옮긴다. 웹 시스템이 `.xls` 이름으로 내려 주는 HTML 표를 사이드카 앞에서 읽으며, `colspan`·`rowspan`은 병합으로, `<br>`은 줄바꿈으로 남기고 `<x:Name>`이 있으면 시트 이름으로 쓴다. 스크립트·스타일은 읽지 않고, 숫자로 확정되는 칸만 숫자가 된다. 파일 내용을 보고 HTML인지 판단하는 일과 읽기 크기 한도는 `apps/sheets`의 `legacy-import.ts`가 맡는다.
- 진입점 묶음 파일이 없다. `exports`가 `./*`를 `./src/*.ts`로 풀어서 `@genoffice/xlsx-gateway/gateway/xlsx-gateway`처럼 파일 경로로 import한다. 렌더러가 `domain/`·`shared/`와 `gateway/`의 일부 파일을 골라 가져가므로, `node:*` import는 지금처럼 `gateway/xlsx-gateway.ts`와 `gateway/xlsx-package-io.ts`에만 둔다.
- 이 패키지만 문서 주석을 `///`로 쓰고, 저장소 공통 설정을 상속하지 않는 자체 `tsconfig.json`(`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`)을 쓴다. 주변 방식을 따른다.
- 명령 언어의 범위 연산은 2,000칸(`MAX_EXPANDED_CELL_OPS`)까지만 셀 단위로 펼치고, 그보다 크면 범위 연산 그대로 넘긴다. 범위 연산의 상한은 200,000칸이다.

## 테스트

- `npm run test -w @genoffice/xlsx-gateway`, 또는 패키지 폴더에서 `npx vitest run`. 타임아웃은 20초다. 테스트는 통합 문서를 코드로 만들어 쓰고, 사이드카 바이너리나 Rust 빌드가 필요 없다. `npm run fixtures`도 필요 없다.
- 저장 경로를 건드리면 왕복으로 증명한다. 아무것도 바꾸지 않은 저장에서 손대지 않은 항목이 바이트 동일한지(`tests/csv-roundtrip.test.ts`에 그 형태가 있다), 편집한 저장에서 신고한 항목만 달라지는지를 본다.
- HTML 표 가져오기는 `tests/html-import.test.ts`가 값·병합·줄바꿈·숫자·시트 이름·charset을 덮는다. 여러 시트를 쓰는 최소 통합 문서(`xlsxBufferFromSheets`)를 고치면 CSV 가져오기 시험도 함께 본다.
- 패치 정규식을 바꾸면 생성기마다 다른 표기를 사례로 넣는다. 자기 닫힘 `<c/>`·`<row/>`, 속성 순서가 다른 요소, 접두사가 붙은 이름공간이 실제로 문제를 일으켰던 것들이다.
- 사이드카를 실제로 거치는 검증은 `apps/sheets`의 테스트 몫이다.
- Windows에서 원본 코드 그대로도 실패하는 테스트는 없다.
