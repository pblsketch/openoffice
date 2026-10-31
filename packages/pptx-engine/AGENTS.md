# pptx-engine

## 맡은 범위

pptx 한 파일의 모델과 저장을 맡는다. `openPptx`가 zip 전체를 메모리에 올리고, 레이아웃·마스터·테마의 상속을 풀어 슬라이드마다 요소 트리를 만든다. 요소에는 원본 XML 조각(`ByteAnchor`)이 붙어 있고, 편집 함수가 모델과 변경 표시를 바꾸면 `savePptx`/`savePptxToFile`이 바뀐 요소만 다시 써서 zip을 묶는다. 슬라이드 추가·복제·덱 간 병합, 표·차트·그림·미디어 삽입, 애니메이션, 노트와 메모, 구역, 마스터 편집, 내장 글꼴 풀기, 쓰이지 않게 된 자원 정리, 빈 덱 템플릿이 여기 있다.

## 맡지 않는 것 (경계)

- 화면에 그리기 위한 계산(EMU→px, 텍스트 줄바꿈, 차트 도형)은 `packages/pptx-render`다. 엔진은 좌표를 EMU 그대로 둔다.
- op 이름, 인자 검증, 원자적 적용과 되돌리기, 모델에 보여 줄 op 문서로 이루어진 편집 계약은 `packages/pptx-ops`다. 엔진 함수는 저수준 변경자다. 대부분 실패를 `false`나 `null`로 알리고 사용자에게 보일 오류 문구를 만들지 않는다.
- Konva 캔버스, 선택과 끌기, 실행 취소 기록, IPC, AI 도구는 `apps/slides`다.
- 스펙에서 새 덱을 만드는 일은 `packages/pipelines`가 엔진 함수를 불러서 한다.
- 압축 폭탄 판정의 구현은 `packages/zip-gate`다.

## 항상 지켜야 하는 것

- 변경 표시가 없는 요소는 `anchor.originalXml`을 그대로 내보낸다. 변경된 슬라이드도 `bodyPrefix` + 요소들(요소 사이의 `gapAfter` 포함) + `bodySuffix`를 이어 붙일 뿐이다. 슬라이드 XML을 파싱했다가 다시 직렬화하지 않는다.
- 변경 없이 저장하면 모든 파트의 내용이 원본과 바이트 동일해야 한다. zip 자체는 매번 새로 묶으므로(XML과 rels는 DEFLATE 6단계, 나머지는 무압축 저장) 파일 전체가 아니라 파트 단위로 비교한다.
- 변경은 종류별 표시로 알린다: `dirty`(텍스트), `dirtyTransform`, `dirtyFill`, `dirtyStroke`, `dirtySrcRect`, `dirtyPPr`, 그리고 슬라이드의 `structureDirty`. 모델 필드만 바꾸고 표시를 세우지 않으면 저장에 반영되지 않는다. 반대로 표시가 선 요소에는 저장할 때 `a16:creationId`가 새겨지므로, 바뀌지 않은 요소에 표시를 세우지 않는다.
- `archive.entries`의 버퍼는 제자리에서 고치지 않고 통째로 갈아 끼운다. 되돌리기 스냅샷이 이 맵을 얕게 복사한다.
- 저장할 때 슬라이드 파트 이름을 바꾸지 않는다. 슬라이드 영속 id(`s_<n>`)가 파트 경로에서 나온다.
- `mc:AlternateContent`에 걸린 요소는 모델을 만든 가지에 패치한다. 위치·채움·선·자르기 패치는 같은 태그의 형제 가지에도 똑같이 적용하고, 텍스트 패치는 형제 가지에 적용하지 않는다. Choice 쪽 본문이 수식 같은 다른 어휘일 수 있다.
- "모델에 숨김" 표시는 실제 글자를 지우지 않는다. 표시는 런의 `a:rPr`(그림은 `nvPr`) 안 `a:extLst` 확장으로 저장하고, 파싱할 때 모델로 읽어 저장할 때 다시 쓴다.
- 문서 안에 남는 식별자는 바꾸지 않는다: 가리기 확장의 `uri`(`REDACT_EXT_URI`), 가리기 기능의 이름공간 주소(`REDACT_NS`, `@genoffice/agent-core/redact-range`에서 가져온다), 이 앱이 만든 차트를 알아보는 `descr="aislides-chart"`, 3D 모델 참조 표지 `aislides-3d:`.
- 열 때 거부하는 한도는 파트 10,000개, 파트당 512 MiB, 합계 1.5 GiB(`PPTX_ZIP_LIMITS`)다. 파트를 실제로 풀어 보는 검사가 JSZip 로드보다 먼저다.
- 예산을 넘는 입력은 버리지 않고 원본 바이트를 지닌 `passthrough`로 남긴다: 그룹 중첩 64단계, 한 슬라이드의 도형 10,000개. 그 밖의 상한은 차트 점 1,048,576개·계열 256개, chartEx 점 10,000개, 글자 크기 1pt 이상 4000pt 이하, 표 삽입 75×75다. 슬라이드 id는 256 이상 2147483647 이하에서만 낸다.
- 관계 대상은 `resolveTarget`으로만 푼다. 스킴이 붙은 대상과 디코딩할 수 없는 대상은 빈 경로가 된다.
- 자원 정리는 관계를 따라간다. 도형 하나가 그림을 안 쓰게 됐다고 파트를 지우지 않는다. 복제된 슬라이드가 같은 대상을 가리킬 수 있다. 먼저 쓰이지 않는 관계만 끊고, 그 결과 아무 데서도 닿지 않는 파트만 지운다.
- 기본 진입점은 Node 전용이다(`node:crypto`, `Buffer`). 렌더러가 가져가는 것은 하위 경로 `./custgeom`, `./table-grid`, `./identity`, `./named-action`, `./background-promote`뿐이다. 이 파일들과 그 import 사슬에 Node 의존을 들이면 브라우저 빌드가 깨진다.
- `@genoffice/agent-core`에서는 `redact-range` 하위 경로만 import한다. 그 패키지의 기본 진입점은 Electron에 닿는다.
- `src/vendor/`는 가져온 원본과 바이트가 같아야 한다.
- 엔진 동작은 원본(GenOffice)의 수정이 병합될 때만 바뀐다. 파일 이동, 재포맷, 이름 변경을 하지 않는다. 예외는 아래 "원본과 다른 점"에 적은 것뿐이고, 더할 때는 사람이 정한다.

## 이 모듈의 방식

- 의미 파싱(fast-xml-parser)과 바이트 위치 잡기(`scanSlide`)가 따로 돌고, 최상위 도형 순서로 일대일 대응한다. `spTree` 머리의 `nvGrpSpPr`/`grpSpPr`는 도형이 아니라 `bodyPrefix`에 들어간다.
- `passthrough`는 모델이 다루지 않는 요소다. 표시용 미리보기만 싣고 원본 바이트로 저장한다.
- 텍스트 패치는 두 갈래다. 모델과 XML의 런 수가 같으면 각 `a:t`만 제자리에서 고치고, 다르면 `rebuildTxBody`가 `a:txBody`를 모델에서 새로 만든다. 뒤쪽 경로에서는 모델이 싣지 않은 것이 사라진다. 런에 새 속성을 추가할 때는 파싱·모델·생성 세 곳을 함께 고쳐야 하는 이유다. 문단 속성 패치(`dirtyPPr`)도 문단 수가 어긋나면 전체 재생성으로 떨어진다.
- 저장은 세 함수가 한 묶음이다. `savePptx`는 결과 전체를 한 버퍼에 만들기 때문에 큰 덱에서 메모리 할당 실패로 죽는다. 디스크에 쓸 때는 스트리밍하는 `savePptxToFile`을 쓴다. 저장이 성공한 뒤에만 `commitSaved`를 불러 변경 표시를 비운다. 저장 도중에 들어온 편집은 스냅샷과 달라서 표시가 남고 다음 저장에 실린다.
- JSZip의 스트림 오류는 반환된 promise가 아니라 스트림의 `error` 이벤트로 나온다. 처리하지 않으면 잡히지 않은 예외로 프로세스가 죽는다.
- 저장할 때마다 `stripStaleEmbeddedFonts`가 돈다. 내장 글꼴 서브셋은 늘릴 수 없어서, 편집으로 서브셋에 없는 글자가 들어간 face는 떼어 낸다. 그대로 두면 서브셋을 엄격히 따르는 뷰어에서 글자가 보이지 않는다. 손대지 않은 덱은 영향이 없다.
- 요소 영속 id는 요소 자신의 `p:cNvPr` 안에서만 찾는다. `a16:creationId`가 있으면 `e_<GUID 앞 8자>`, 없으면 `e_<cNvPr id>`다. 그룹 조각에는 자식의 바이트가 들어 있어서 범위를 좁히지 않으면 그룹이 자식의 GUID를 물려받는다. GUID를 새긴 뒤에도 예전 `e_<cNvPr id>` 형태는 별칭으로 계속 통한다.
- 레이아웃 관계를 잃은 손상된 슬라이드는 열기를 거부하지 않고 첫 마스터의 레이아웃으로 그린다. 가운데 제목 자리표시자가 있으면 제목 레이아웃, 아니면 첫 레이아웃이다.
- 어두운 마스터는 색 이름을 바꿔 매핑한다(`clrMap`). 색을 풀기 전에 매핑부터 세운다.

## 원본과 다른 점

원본을 받아올 때 아래 시험이 통과하는지 본다. 충돌이 나면 이 동작을 남긴다.

- **강조 색·문자 간격의 제자리 패치(결정 0094).** `TextRun.highlightEdited`·`letterSpacingEdited`가 선 런만 `patchRunProps`가 `<a:highlight>`(채움·효과 뒤, 글꼴 앞)와 `spc`를 쓰거나 지운다. 런이 없던 `a:rPr`에 강조 색을 넣는 길도 같다. `ElementFontPatch`에 `highlight`(`null`은 지움)·`letterSpacingPt`(0·`null`은 표준)가 있다. 시험: `tests/run-highlight-spacing-visibility.test.ts`.
- **도형 숨기기·이름(결정 0094).** `setElementHidden`·`setElementName`이 원본 조각의 첫 `p:cNvPr` 여는 태그에서 `hidden`·`name` 속성 하나만 바꾸고 `structureDirty`를 세운다. 숨기기 뒤의 모델은 부르는 쪽이 `materializeSlide`로 다시 읽는다. 시험: 같은 파일.

## 테스트

- `npm run test -w @genoffice/pptx-engine`, 또는 패키지 폴더에서 `npx vitest run`. 픽스처는 `tests/fixtures/`의 pptx 두 개(라이선스 고지 동봉)와, 테스트가 그때그때 `pptxgenjs`와 `createBlankPptx`로 만드는 덱이다. `npm run fixtures`는 필요 없다.
- OOXML 스키마 검사 테스트는 `xmllint`가 PATH에 있을 때만 돈다. 없고 `CI` 환경 변수도 없으면 경고를 찍고 건너뛴다. 건너뛴 채 통과한 결과는 스키마 적합성을 보증하지 않으므로, 생성하는 XML을 바꿨다면 CI 결과까지 확인한다.
- `corpus-edit-fuzz.test.ts`는 `CORPUS_DIRS`를 줄 때만 돌고, 단언 없이 `FUZZ_OUT`에 보고서를 쓴다.
- 열기·저장 경로를 바꾸면 "변경 없음 → 파트 바이트 동일"과 "한 요소 편집 → 나머지 바이트 그대로"를 테스트로 증명한다. 새 변경자는 자식 요소가 스키마 순서에 맞는 자리에 들어가는지도 본다.
- Windows에서 원본 코드 그대로도 실패하는 테스트는 없다.
