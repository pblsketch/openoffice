# pptx-ops

## 맡은 범위

열려 있는 덱(`OpenedPptx`)을 고치는 일을 "op"라는 하나의 공개 계약으로 묶는다. op 등록부(`ops/registry.ts`), 트랜잭션 실행기(`runTxn`), op 구현(`ops/*-ops.ts`), 모델이 읽는 op 문서(`prompts/ops/*.md`와 그것을 파싱하는 `op-docs.ts`), 편집기 텍스트를 모델 문단으로 옮기는 매핑(`edit-text.ts`), 편집 스크립트를 op로 바꾸는 변환(`mapScriptOps`), 길이 단위 정규화, 글자 크기 사다리(`./font-size`)가 여기 있다. Slides 메인 프로세스와 명령줄 도구(`packages/cli`)가 `runTxn`을 부르고, 셸의 MCP 서버는 같은 op 어휘로 op 목록을 만들어 명령줄 도구에 넘긴다.

## 맡지 않는 것 (경계)

- XML을 직접 만들거나 고치지 않는다. 바이트 수준의 변경은 전부 `packages/pptx-engine` 함수가 한다. op는 인자를 검증하고, 엔진 호출을 조합하고, 전후 기록을 남긴다.
- 렌더링과 측정은 `packages/pptx-render`, 레이아웃 점검과 스펙 기반 생성은 `packages/pipelines`다.
- AI 도구 등록(`apply_ops`, `load_guide`), IPC, 실행 취소 기록, 저장 시점은 `apps/slides`다. 이 패키지는 파일을 쓰지 않는다.
- 모델 호출은 `packages/agent-core`와 `packages/ai-provider`다.

## 항상 지켜야 하는 것

- 덱을 고치는 길은 `runTxn` 하나로 유지한다. 실행기가 유일한 쓰기 관문이어서 XML 금지 문자 검사와 영속 id 강화가 한 곳에서 걸린다. 호출 표면이 엔진 변경자를 직접 부르는 길을 새로 내면 이 보장이 빠진다.
- 모든 op는 `validate`와 `apply`를 함께 낸다. `validate`는 덱을 바꾸지 않아야 한다. dry run과 원자적 트랜잭션의 사전 검증이 이것만 부른다.
- 원자적 트랜잭션(기본값)은 전부 적용되거나 전혀 적용되지 않는다. 하나라도 실패하면 스냅샷으로 되돌린다. `per_op`는 실패한 op만 건너뛰고 실패를 색인별로 모은다.
- 스냅샷은 슬라이드를 깊게, 아카이브 항목 맵을 얕게 복사한다. 그래서 op와 엔진 함수는 항목 버퍼를 제자리에서 고치지 않고 통째로 바꿔 넣어야 한다. 제자리 수정은 되돌려지지 않는다.
- 호출자가 `parts`로 넘긴 파싱된 파트에 가한 변경은 되돌리기 대상이 아니다. 검증을 끝낸 뒤에만 변경하는 단일 op 트랜잭션에만 쓴다.
- 오류는 `GuidedError`로 내고, 무엇이 틀렸는지와 어떻게 고칠지를 함께 적는다(쓸 수 있는 id 목록 포함). 모델은 이 문구를 보고 스스로 고치고, 이유 없는 실패에는 같은 호출을 되풀이한다. 실패한 op의 사용법 한 줄은 실행기가 덧붙인다.
- 문자열 필드는 계획 단계에서 XML 1.0 금지 문자(탭·개행을 뺀 C0 제어 문자, U+FFFE/FFFF, 짝 없는 서로게이트)를 한 곳에서 거른다. 색은 6자리나 8자리 hex만, XML 속성으로 들어가는 숫자는 유한수만 받는다. 표 삽입은 75×75까지다.
- 등록된 op와 `prompts/ops/*.md`의 `### op이름` 블록은 정확히 일치해야 한다. 테스트가 양쪽 방향으로 검사한다. op를 추가·삭제·개명하면 문서 블록과 그 아래 서명 줄을 같이 고친다. 문서 안의 `json` 예시는 전부 dry run을 통과해야 하고, 문서는 영어로만 쓴다(CJK 문자와 전각 문장부호가 있으면 테스트가 실패한다).
- op 이름과 인자 모양은 앱 밖(명령줄 도구, MCP)에도 그대로 드러나는 계약이다. 이름을 바꾸면 그쪽 사용자도 깨진다.
- Electron을 import하지 않는다. 렌더러는 기본 진입점이 아니라 `./op-docs`와 `./font-size` 하위 경로만 가져간다. 기본 진입점은 엔진 런타임을 끌고 온다.

## 이 모듈의 방식

- `runTxn`의 순서는 이렇다. 모든 op를 먼저 검증한다(트랜잭션 이전 상태 기준) → `dryRun`이면 계획만 돌려준다 → 스냅샷 → 순서대로 적용 → 마스터·레이아웃 파트를 건드렸으면 트랜잭션 끝에 한 번만 항목에 써 넣고 모든 슬라이드를 다시 구체화한다. 슬라이드가 상속 스타일을 그 파트에 기대어 풀기 때문에, 파트가 바뀌면 슬라이드 모델이 낡는다.
- 대상 주소는 `{ slide, el }`이고 마스터·레이아웃은 `{ part, el }`이다. `slide`는 0부터 세는 색인이나 `s_<n>`, `el`은 파싱 시점 id나 영속 id(`e_<GUID 앞 8자>`, `e_<cNvPr id>`)를 모두 받는다. 파트 대상은 슬라이드 모델만 바꾸는 op만 받아들인다(`allowPart`).
- 기록(`OpRecord`)의 `slideId`는 적용 직전에 찍는다. 트랜잭션이 끝난 뒤 숫자 색인으로 슬라이드를 다시 찾으면 삭제·이동 op 때문에 어긋난다. 후속 처리는 `slideId`를 쓴다.
- op가 요소를 고치면 실행기가 그 요소에 `a16:creationId`를 새긴다(없을 때만). 남이 만든 덱의 요소 id가 번호 재배치에도 살아남게 하려는 것이다. 건드리지 않은 요소의 바이트는 그대로다.
- 길이 필드는 검증 전에 제자리에서 EMU 정수로 바뀐다. `"2.54cm"`, `"1in"`, `"12pt"`, `"96px"` 같은 값을 받고, 단위 없는 숫자는 EMU다. 대상은 `x/y/cx/cy/dx/dy`, 이름이 `Emu`로 끝나는 키, `insets`/`insetsEmu` 아래의 `l/t/r/b`다. 새 길이 필드는 이 이름 규칙을 따라야 단위가 먹는다.
- 그림과 미디어 바이트는 `Uint8Array` 말고도 base64 문자열과 data URL로 받는다. AI 도구 경로는 바이너리를 실을 수 없다.
- op 문서는 `?raw` import로 빌드에 들어가고 런타임에 디스크를 읽지 않는다. Vite가 아닌 번들러에는 같은 로더가 필요하다. 블록 머리말의 `(not-ai-callable)`은 실행기로는 되지만 모델에는 알리지 않는 op이고, `(pending)`은 아직 등록되지 않은 op라 어휘와 사용법 양쪽에서 숨긴다.
- `edit-text.ts`는 편집기가 돌려준 `srcPara`/`srcRun` 색인으로 원래 문단과 런을 찾아, 편집기가 표현하지 못하는 속성을 원래 런에서 이어받는다. 위치로 대응시키면 문단을 쪼개거나 지울 때 서식이 밀린다. `link`와 `redact`는 세 상태다. `undefined`는 원래 값 유지, `null`은 명시적 해제, 값은 설정이다.
- 수식 op는 `@genoffice/docx-engine/math`의 LaTeX→OMML 변환을 쓴다. docx-engine에 대한 의존은 이 하위 경로 하나다.

## 원본과 다른 점

원본을 받아올 때 아래 시험이 통과하는지 본다. 충돌이 나면 이 동작을 남긴다.

- **강조 색·문자 간격(결정 0094).** `EditRun`에 `highlight`(`null`은 없음)·`letterSpacing`(pt)이 있고, `applyEditParagraphs`는 값이 실제로 바뀐 런에만 `highlightEdited`·`letterSpacingEdited`를 세운다(문자 간격은 0.05pt 미만 차이를 같은 값으로 본다). `setFont`가 `font.highlight`·`font.letterSpacingPt`를 검증해 받는다. 시험: `tests/selection-pane-ops.test.ts`.
- **`setElementHidden`·`renameElement`(결정 0094).** 최상위 요소의 `p:cNvPr`만 고친다. `setElementHidden`은 적용 끝에 슬라이드를 다시 읽어(`materializeSlide`) 그 슬라이드의 요소 id가 모두 바뀐다. 문서는 `prompts/ops/element.md`. 시험: 같은 파일.

## 테스트

- `npm run test -w @genoffice/pptx-ops`, 또는 패키지 폴더에서 `npx vitest run`. 픽스처 파일은 없고, 테스트가 `createBlankPptx` 등으로 덱을 코드에서 만든다.
- `tests/op-docs-sync.test.ts`가 등록부와 문서의 일치, 서명 줄, 영어 전용을 검사한다. 문서 예시를 dry run에 태우는 테스트는 이 패키지가 아니라 `apps/slides/tests/op-docs-examples.test.ts`에 있다. op나 예시를 바꾸면 그쪽도 돌린다.
- vitest 별칭이 `pptx-engine`과 `docx-engine/math`를 소스 경로로 묶는다. 엔진의 새 하위 경로를 import하면 `vitest.config.ts`와 `tsconfig.json`의 경로에도 추가한다.
- op를 추가하면 정상 적용, 인자 거부(안내 문구 포함), 원자적 트랜잭션에서 실패했을 때 덱이 그대로인지를 덮는다.
- Windows에서 원본 코드 그대로도 실패하는 테스트는 없다.
