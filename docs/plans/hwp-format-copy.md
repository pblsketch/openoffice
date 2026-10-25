# 한글 편집기 모양 복사(서식 복사) 분석과 설계

상태: **1단계 구현됨**(2026-10-25). 빌드한 앱에서 `Alt+C` 대화상자, 표 칸 복사와 양식 칸 보존을 확인했다. 2단계(다른 문서)는 아직 구현하지 않았다. 10절의 결정은 13절에 적었다.

## 1. 한 줄 결론

이미 rhwp-studio 안에 `모양 복사`가 있다. `Alt+C`, 도구 줄 단추, 편집 메뉴의 `모양 복사`·`모양 붙여넣기`가 그것이다. 그러나 한컴 한글 2024의 `모양 복사`와 비교하면 (1) 무엇을 복사할지 고르는 대화상자가 없고, (2) 언어별 글꼴·글자 테두리/배경·문단 테두리/배경이 빠지고, (3) 표에서 글자 블록과 셀 블록을 다루는 방식이 한컴과 다르며, (4) 양식 칸의 이름을 지울 수 있고, (5) 한 번 적용이 실행 취소 2~3단계가 되고, (6) 복사한 모양이 한 번 쓰면 사라진다.

권장안은 **기존 명령·도구 줄 단추·메뉴·단축키는 그대로 두고 실행부만 새 플러그인 모듈로 바꾸는 것**이다. 이름은 한컴과 이미 쓰고 있는 `모양 복사`를 유지한다. 흔히 `서식 복사`라고 부르지만 화면 이름을 새로 만들지 않는다.

## 2. 지금 있는 것

`vendor/rhwp-core`의 rhwp 0.8.7과, 그 편집기(rhwp-studio)를 빌드해 쓴다. 모양 복사는 앱이 만든 것이 아니라 편집기에 원래 들어 있다.

| 자리      | 내용                                                                                                                            |
| --------- | ------------------------------------------------------------------------------------------------------------------------------- |
| 명령      | `command/commands/edit.ts`의 `edit:format-copy`(Alt+C), `edit:format-paste`                                                     |
| 단추·메뉴 | `index.html`의 도구 줄 `data-cmd="edit:format-copy"`, 편집 메뉴의 두 항목                                                       |
| 단축키    | `command/shortcut-map.ts`의 `Alt+C`와 한글 `ㅊ`(macOS Option+C 포함)                                                            |
| 실행부    | `engine/input-handler.ts`의 `performFormatCopy`, `performFormatPaste`, `applyCopiedFormatToCurrentTarget`, `copyFormatAtCursor` |

동작은 이렇다.

1. 복사해 둔 모양이 없으면 커서 자리의 서식을 `formatCopyState`에 담는다.
2. 복사해 둔 모양이 있고 블록이 있으면 블록에 덮어쓴다.
3. 담는 값은 글자 서식 일부, 문단 서식 일부, 표 칸 안이면 칸 속성 일부다.
4. 덮어쓰면 복사해 둔 모양을 지운다.
5. 대화상자는 없다. `Alt+C`나 단추를 누르면 곧바로 복사하거나 적용한다.

## 3. 한컴 한글 2024의 동작

공식 도움말(편집-모양 복사)과 표 안의 모양 복사 문서를 기준으로 한다.

- **보통 상태(블록 없음)**: 커서 자리의 모양을 기억시킨다. 이때 `모양 복사` 대화상자가 열린다.
- **블록 상태**: 기억해 둔 모양을 블록에 덮어쓴다. 대화상자는 열리지 않는다.
- **대화상자**:
  - 본문 모양 복사(하나를 고른다): `글자 모양`, `문단 모양`, `글자 모양과 문단 모양 둘 다`, `글자 스타일`, `문단 스타일`
  - 셀 모양 복사(표 안에서만, 여러 개를 고를 수 있다): `셀 속성`, `셀 테두리`, `셀 배경`
  - 표에서 적용 대상: `본문 모양과 셀 모양 둘다`, `셀 모양만`
  - `복사` 단추로 기억시킨다.
- **기억**: 한글을 끝낼 때까지 마지막에 복사한 모양을 기억한다. 다른 문서에서도 적용할 수 있다.
- **표**: 글자 블록(F3)이나 셀 블록(F5)에 적용한다. 표 밖에서 덮어쓰면 셀 모양은 무시된다.
- **제약**: 글자·문단·스타일을 하나도 복사하지 않고 셀 속성만 복사할 수는 없다. 본문 모양은 반드시 하나 고른다.

## 4. 지금 구현과 한컴의 차이

| ID  | 무엇이 다른가                                    | 지금 보이는 일                                                                                                   | 근거      | 무게          |
| --- | ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- | --------- | ------------- |
| G1  | 대화상자가 없다                                  | 무엇을 복사할지 고를 수 없고, 글자·문단·칸을 한꺼번에 담는다                                                     | 코드      | 높음          |
| G2  | 언어별 글꼴을 잃는다                             | 한글은 `맑은 고딕`, 라틴은 `Arial`인 글을 복사하면 대상 글자의 일곱 언어가 모두 한 글꼴이 된다                   | 엔진 재현 | 높음          |
| G3  | 글자 테두리/배경을 잃는다                        | 글자에 준 테두리·채우기가 대상에 가지 않는다                                                                     | 코드      | 중간          |
| G4  | 문단 테두리/배경을 잃는다                        | 문단에 준 테두리·채우기가 대상에 가지 않는다                                                                     | 코드      | 중간          |
| G5  | 탭 위치를 잃는다                                 | 문단의 탭 정지가 대상에 가지 않는다. 엔진은 `applyParaFormat`으로 탭을 쓸 수 있는데 지금 구현이 키 목록에서 뺐다 | 코드      | 중간          |
| G6  | 스타일을 복사할 수 없다                          | `글자 스타일`, `문단 스타일` 선택지가 없다                                                                       | 코드      | 중간          |
| G7  | 표 안 글자 블록에 칸 모양을 적용하지 않는다      | 한 칸 안의 글자를 블록으로 잡고 복사해도 칸 속성·테두리·배경은 그대로다                                          | 코드      | 높음          |
| G8  | 본문에서 복사한 모양을 셀 블록에 적용하지 못한다 | 본문 모양을 복사한 뒤 셀 블록에서 `Alt+C`를 누르면 적용되지 않고, 그 셀의 모양으로 복사 상태를 덮어쓴다          | 코드      | 높음          |
| G9  | 셀 블록에 글자·문단 모양을 적용하지 않는다       | 셀 블록에서는 칸 모양만 바뀌고 글자·문단은 그대로다                                                              | 코드      | 높음          |
| G10 | 양식 칸 이름을 지운다                            | 칸 속성에 `fieldName`이 들어 있어, 셀 블록에 복사할 때 일반 칸의 빈 이름이 이름 있는 칸의 필드를 지운다          | 엔진 재현 | **매우 높음** |
| G11 | 표 안의 표에서 조용히 틀리거나 실패한다          | 중첩 표의 칸 속성을 바깥 칸 것으로 읽거나, 적용을 포기한 뒤 복사 상태를 덮어쓴다                                 | 코드      | 높음          |
| G12 | 한 번 적용이 실행 취소 2~3단계다                 | 글자와 문단이 각각 한 단계, 칸 속성이 또 한 단계다                                                               | 코드      | 중간          |
| G13 | 복사한 모양이 한 번 쓰면 사라진다                | 여러 곳에 이어서 적용하려면 매번 다시 복사해야 한다. 한컴은 마지막 모양을 계속 기억한다                          | 코드      | 중간          |
| G14 | 다른 문서로 가져갈 수 없다                       | 편집기 인스턴스마다 상태가 따로다. 한컴은 한글을 끝낼 때까지 다른 문서에도 적용한다                              | 코드      | 중간          |
| G15 | 적용할 수 없는 자리에서도 조용하다               | 머리말·각주·중첩 표·본문과 표에 걸친 선택에서 아무 일도 없거나 엉뚱한 곳이 바뀌어도 알리지 않는다                | 코드      | 중간          |
| G16 | 복사만 해도 문서가 바뀔 수 있다                  | 글꼴 ID를 복사할 때 찾거나 만들어 문서의 글꼴 목록에 넣는다. 적용하지 않아도 문서가 달라질 수 있다               | 코드      | 중간          |

### 엔진으로 확인한 것

`@rhwp/core`(이 저장소의 패치한 0.8.7)로 직접 확인했다.

- `getCharPropertiesAt`은 `fontFamilies`(7개 이름)를 주지만 `fontId`/`fontIds`는 주지 않는다.
- `applyCharFormat`에 `fontId` 하나를 주면 일곱 언어가 모두 그 글꼴이 된다. 언어별로 다른 글꼴을 복사하려면 `fontFamilies`의 이름을 언어마다 `findOrCreateFontIdForLang`으로 풀어 `fontIds`로 넘겨야 한다.
- `getCharPropertiesAt`이 주는 값(테두리·채우기 포함)에서 문서 고유 번호만 빼고 `applyCharFormat`에 넘기면 글자 모양이 그대로 복사된다. 엔진이 같은 모양을 알아보고 같은 `charShapeId`를 다시 쓴다.
- `applyParaFormat`은 여백·들여쓰기·문단 간격을 픽셀로 받아 150/75로 곱해야 한다. 테두리·채우기는 그대로 복사된다.
- `applyParaFormat`은 `tabStops`·`tabAutoLeft`·`tabAutoRight`도 받아 쓴다. 지금 구현은 키 목록에서 이것을 빼서 잃는다.
- `setCellProperties`에 `fieldName: ''`을 넘기면 그 칸의 셀 필드가 목록에서 사라진다. `editableInForm`도 함께 넘기면 양식 편집 가능 여부가 바뀔 수 있다.
- `setCellProperties`는 안 여백·세로 정렬·제목 셀·세로쓰기·셀 보호·테두리·배경을 모두 받고, 같은 테두리/배경은 같은 번호로 알아본다.
- 중첩 표는 `getCellPropertiesByPath`로 읽을 수 있지만, 칸 속성을 쓰는 by-path 호출은 없다. 문단 서식도 중첩 표의 칸을 가리키는 호출이 없다.

## 5. 설계 원칙

1. **한컴의 이름과 자리를 지킨다.** 명령 id(`edit:format-copy`, `edit:format-paste`), 도구 줄 단추, 편집 메뉴, `Alt+C`를 그대로 둔다. 새 단추나 새 단축키를 만들지 않는다.
2. **로직은 앱의 플러그인 모듈에 둔다.** `apps/hwp/studio-plugin/format-copy.mjs`가 대화상자·상태·복사·적용을 맡는다. 편집기 소스는 실행부를 잇는 작은 빌드 패치 두 곳만 고친다.
3. **한 번의 적용은 실행 취소 한 단계다.** 글자·문단·칸 속성을 한 명령으로 묶는다. 스타일이 끼면 편집기가 이미 쓰는 스냅샷 한 번으로 묶는다.
4. **할 수 없으면 하지 않는다.** 중첩 표·머리말·각주·본문과 표에 걸친 선택처럼 온전히 적용할 수 없는 자리는 일부만 바꾸지 않고 이유를 알린다.
5. **양식의 것은 건드리지 않는다.** 칸 속성에서 `fieldName`, `editableInForm`은 복사하지 않는다. 칸의 크기(`width`, `height`)도 복사하지 않는다.
6. **문서 바이트를 직접 고치지 않는다.** 모든 변경은 엔진 호출과 편집기의 실행 취소 기록을 지난다. 저장·되돌리기·복구는 지금과 같다.
7. **한글 화면 문구는 한국어·영어만 있다.** 편집기 안 대화상자도 그 둘만 쓴다. 앱 바깥의 21개 언어 문구를 새로 만들지 않는다. 편집기 언어가 한국어가 아니면 영어로 보인다.
8. **AI와 섞지 않는다.** 이 기능은 사람이 쓰는 편집 동작이다. AI 창의 도구 목록이나 지시문을 바꾸지 않는다.
9. **상위에도 낸다.** 언어별 글꼴과 빠진 속성은 rhwp에도 해당하는 문제다. 이 저장소에서 먼저 고치고, 같은 수정을 rhwp 상위에 제안한다. 상위가 받아들이면 패치를 뺀다.

## 6. 구조

### 6.1 파일

| 파일                                                  | 하는 일                                                                                                                                                                                                                                           |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/hwp/studio-plugin/format-copy.mjs` (새 파일)    | 대화상자, 복사 상태, 대상 고르기, 글자·문단·칸 적용, 스타일, 거절 문구                                                                                                                                                                            |
| `apps/hwp/scripts/rhwp-patches.mjs` (고침)            | `studio-format-copy-safety`(input-handler.ts, 0단계), `studio-format-copy`(edit.ts), `studio-format-copy-state`(input-handler.ts) 패치 추가. 실행부를 새 모듈로 바꾸고, `hasCopiedFormat`이 새 상태를 보게 한다. 새 모듈을 `hancomHooks`에 넣는다 |
| `apps/hwp/scripts/rhwp-patches.d.mts` (고침)          | 새 모듈 이름과 세 패치 이름 선언                                                                                                                                                                                                                  |
| `apps/hwp/scripts/build-studio.mjs` (고침)            | `@ieum/format-copy` 별칭, 빌드 스탬프에 새 파일 해시                                                                                                                                                                                              |
| `apps/hwp/tests/format-copy.test.ts` (새 파일)        | 가짜 편집기로 선택·옵션·상태·묶음·거절 시험                                                                                                                                                                                                       |
| `apps/hwp/tests/format-copy-engine.test.ts` (새 파일) | 실제 엔진으로 글자·문단·칸·스타일·저장 왕복·양식 칸 보존 시험                                                                                                                                                                                     |

### 6.2 패치 세 곳

1. `src/engine/input-handler.ts` (0단계 안전 패치)
   - `FORMAT_COPY_CELL_KEYS`에서 `fieldName`·`editableInForm`을 뺀다. 옛 복사 경로가 양식 칸 필드를 지우지 않게 한다.
2. `src/command/commands/edit.ts`
   - `import { ieumFormatCopy, ieumFormatPaste } from '@ieum/format-copy';`
   - `execute(services) { services.getInputHandler()?.performFormatCopy(); }` → `execute(services) { ieumFormatCopy(services, formatCopyStudio()); }`
   - `execute(services) { services.getInputHandler()?.performFormatPaste(); }` → `execute(services) { ieumFormatPaste(services, formatCopyStudio()); }`
   - `edit:format-copy`의 `canExecute`에 `!ctx.isFormMode`를 더한다.
   - 대화상자 부품은 `edit.ts`가 이미 쓰는 `@/ui/...`처럼 `ModalDialog`와 `showToast`를 새 모듈에 넘긴다. 실행 취소 명령 부품(`ApplyCharFormatCommand`, `ApplyParaFormatCommand`)과 셀 블록 부품(`selectCellIndicesInRange`, `paraFormatTargetsForCellBlock`, `withCellPathTarget`)도 넘긴다. 새 모듈은 편집기 소스를 import하지 않는다.
3. `src/engine/input-handler.ts` (상태 연결 패치)
   - `hasCopiedFormat(): boolean { return this.formatCopyState !== null; }` → `return ieumHasCopiedFormat(this);`
   - 그래야 편집 메뉴의 `모양 붙여넣기` 활성 여부가 새 상태를 본다. 기존 `performFormatCopy`/`performFormatPaste`는 더 이상 명령에서 불리지 않는다. 지우지는 않는다(다른 곳에서 부르지 않는 것은 코드 검색으로 확인했다).

`hancomHooks`에 새로 기대는 이름을 적는다: `edit.ts`의 두 실행 줄, `input-handler.ts`의 `hasCopiedFormat`·`getCharProperties`·`getParaProperties`·`getSelection`·`getCursorPosition`·`focus`·`executeOperation`, `cursor`의 선택 API, `engine/command.ts`의 두 명령 클래스, `engine/cell-block-format.ts`의 세 함수, `wasm-bridge`의 엔진 호출 이름. 하나라도 없으면 빌드가 멈춘다.

### 6.3 복사 한 번

```
Alt+C / 도구 줄 / 편집 메뉴
  → edit:format-copy
  → ieumFormatCopy(services)
      ├─ 편집 모드가 양식이면 아무것도 하지 않는다
      ├─ 머리말·꼬리말·각주·미주 안이면 "아직 지원하지 않는다"고 알린다
      ├─ 그림·표가 개체로 선택된 상태면 "글자나 표 칸을 골라 주세요"고 알린다
      ├─ 복사해 둔 모양이 있고 블록이 있으면 → 적용(6.4)
      └─ 그 밖에는 대화상자를 연다
            ├─ 취소: 상태를 바꾸지 않는다
            └─ 복사: 커서(블록이 있으면 블록 시작)의 모양을 담고 상태를 바꾼다
```

- 블록이 없으면 언제나 대화상자를 연다. 한컴과 같다. 복사해 둔 모양이 있어도 새로 복사한다.
- 블록이 있고 복사해 둔 모양이 없으면 대화상자를 연다. 복사할 곳을 블록으로 잡았을 수 있으므로 블록 시작 자리를 읽는다.
- 복사 뒤 편집기 포커스를 돌려주고, 짧은 알림(`모양을 복사했습니다`)을 띄운다.
- 복사한 모양은 덮어쓰기 전까지, 이 편집기(이 탭의 이 문서) 안에서 계속 쓴다. 한 번 적용해도 지우지 않는다. 새로 복사하려면 블록 없이 `Alt+C`를 눌러 대화상자를 연다.

### 6.4 적용 한 번

```
Alt+C(블록 있음) / 모양 붙여넣기
  → ieumFormatPaste(services)
      ├─ 복사한 모양이 없으면 "복사한 모양이 없습니다"고 알린다
      ├─ 대상이 없으면 "적용할 부분을 선택하세요"고 알린다
      ├─ 지원하지 않는 대상이면 이유를 알리고 상태를 지우지 않는다
      └─ 대상마다 적용 계획을 세운다
            ├─ 글자: 글자 모양 또는 글자 스타일
            ├─ 문단: 문단 모양 또는 문단 스타일
            └─ 칸: 셀 속성·테두리·배경 중 고른 것
          → 한 실행 취소 단계로 실행
```

- 성공해도 복사 상태를 지우지 않는다. 여러 곳에 이어서 적용할 수 있다.
- 실패하면 아무것도 바꾸지 않고 상태도 지우지 않는다.
- 적용 뒤 알림은 띄우지 않는다(화면이 이미 바뀐다). 거절할 때만 이유를 띄운다.

### 6.5 복사 상태

한 편집기 안의 `WeakMap<InputHandler, CopyState>`에 둔다. 문서 글자나 파일 경로를 담지 않는다. JSON으로 바꿀 수 있는 값만 담는다.

```js
{
  version: 1,
  body: 'chars' | 'paragraph' | 'both' | 'charStyle' | 'paragraphStyle',
  cell: null | {
    properties: boolean,   // 안 여백, 세로 정렬, 제목 셀, 세로쓰기, 셀 보호
    border: boolean,       // 네 방향 테두리, 대각선, 중심선
    background: boolean,   // 채우기 종류·색·무늬
    target: 'bodyAndCell' | 'cellOnly',
  },
  chars: null | { ...언어별 글꼴 이름, 크기, 굵게, ... 테두리/배경 },
  para: null | { ...정렬, 줄 간격, 여백, 들여쓰기, 문단 간격, 테두리/배경, 번호 ... },
  charStyle: null | { name, englishName },
  paraStyle: null | { name, englishName },
  source: { kind: 'body' | 'cell' | 'textBox', inTable: boolean },
}
```

- `body`는 반드시 하나다. 한컴처럼 셀 모양만 복사하는 상태는 만들지 않는다.
- `cell`은 복사한 자리가 표 안일 때만 있다. 표 밖이면 `null`이고, 나중에 표 안에 적용해도 칸 모양은 바뀌지 않는다.
- 본문 모양은 `chars`, `para`, `charStyle`, `paraStyle` 가운데 고른 것만 채운다. `both`면 `chars`와 `para`를 모두 채운다.
- 복사한 자리의 글자 스타일이 없으면 `charStyle`은 `null`이고 대화상자의 `글자 스타일`을 끈다.
- 상태 크기는 32KB를 넘지 않게 한다(글꼴 이름 64자, 스타일 이름 250자, 배열 7개).

### 6.6 대화상자

편집기의 `ModalDialog`를 쓴다. 쪽 번호 매기기 대화상자와 같은 방식이다.

```
모양 복사
────────────────────────────────
본문 모양 복사
  ( ) 글자 모양
  ( ) 문단 모양
  (•) 글자 모양과 문단 모양 둘 다
  ( ) 글자 스타일          ← 그 자리에 글자 스타일이 없으면 끔
  ( ) 문단 스타일
셀 모양 복사                 ← 표 안에서 복사할 때만 보인다
  [x] 셀 속성   [x] 셀 배경   [ ] 셀 테두리
표에서 적용 대상             ← 위 셀 항목을 하나라도 골랐을 때만 보인다
  (•) 본문 모양과 셀 모양 둘 다
  ( ) 셀 모양만
────────────────────────────────
                [복사] [취소]
```

- 처음 열 때의 기본값: 본문 `둘 다`, 셀 `속성`·`배경` 선택, `테두리` 해제, 적용 대상 `둘 다`.
- 복사 자리가 표 안의 표면 본문 선택지를 `글자 모양`·`글자 스타일`만 남긴다. 그 자리에서는 문단·칸 모양을 온전히 적용할 수 없다.
- 마지막으로 고른 값을 이 편집기 안에서 기억해 다음 대화상자의 처음 값으로 쓴다. 그 자리에서 고를 수 없는 값(글자 스타일 없음)은 `둘 다`로 되돌린다.
- `셀 모양만`은 셀 항목을 하나라도 골랐을 때만 고를 수 있다. 하나도 고르지 않으면 `둘 다`만 남긴다.
- 확인 단추 글자는 `복사`, 취소는 `취소`다. `ModalDialog`의 기본 `확인`을 `show()`에서 바꾼다.
- 한국어가 아닌 편집기 언어에서는 영어로 보인다: `Format Painter`, `Character Format`, `Paragraph Format`, `Character and Paragraph Formats`, `Character Style`, `Paragraph Style`, `Cell Format`, `Cell Properties`, `Cell Borders`, `Cell Background`, `Apply in Tables`, `Text and Cell Formats`, `Cell Formats Only`, `Copy`, `Cancel`.

### 6.7 실행 취소 한 단계

| 고른 본문 모양          | 적용 방법                                                      | 실행 취소      |
| ----------------------- | -------------------------------------------------------------- | -------------- |
| `글자 모양`             | `ApplyCharFormatCommand`(한 범위) 또는 셀 블록이면 칸마다      | 묶음 명령      |
| `문단 모양`             | `ApplyParaFormatCommand`(여러 대상)                            | 그 명령        |
| `둘 다`                 | 위 둘을 묶음                                                   | 묶음 명령 하나 |
| `글자 스타일`           | `setCharShapeId`/`setCharShapeIdInCellByPath`를 감싼 작은 명령 | 그 명령        |
| `문단 스타일`           | 스냅샷 안에서 `applyStyle`/`applyCellStyle`                    | 스냅샷 하나    |
| 위 + 셀 모양            | 칸 속성 명령을 같은 묶음에 넣는다                              | 묶음 명령 하나 |
| `문단 스타일` + 셀 모양 | 스냅샷 하나 안에서 모두 한다                                   | 스냅샷 하나    |

- 묶음 명령은 자식 명령을 차례로 실행하고, 하나라도 실패하면 이미 실행한 자식을 거꾸로 되돌린 뒤 예외를 던진다. 편집기는 변경을 통째로 되돌린다.
- 묶음 명령의 `type`은 `applyCharFormat`(글자가 있을 때) 또는 `applyParaFormat`을 쓴다. 편집기가 그 두 종류에서 선택을 유지하기 때문이다. `mergeWith`는 null이다.
- 셀 속성 명령은 대상 칸마다 `getCellOwnProperties`(또는 `getCellProperties`)로 이전 값을 잡아 두고, `setCellProperties`로 되돌린다. 새 테두리/배경 항목이 문서 정보에 남을 수 있지만, 같은 모양은 엔진이 알아보므로 반복 복사에서 늘어나지 않는다. 반복 적용·되돌리기 뒤 파일 크기가 눈에 띄게 늘지 않는지 시험한다.
- 한 번 적용에 대상이 너무 많으면(예: 500칸, 5,000문단) 적용하지 않고 "선택이 너무 큽니다"라고 알린다. AI 플러그인의 `MAX_FORMATTED_CELLS`, `MAX_SELECTED_RUNS`와 같은 취지다.

### 6.8 대상 고르기

| 선택                               | 글자·문단                     | 칸 모양           |
| ---------------------------------- | ----------------------------- | ----------------- |
| 본문 블록(한 구역)                 | 블록이 걸친 문단들            | 없음              |
| 한 칸 안의 글자 블록               | 그 칸의 문단들                | 그 칸 하나        |
| 셀 블록(F5, 칸에서 칸으로 끈 선택) | 고른 칸마다 그 칸의 모든 문단 | 고른 칸들         |
| 글상자 안                          | 글상자의 문단들               | 없음(표가 아니다) |
| 본문과 표에 걸친 선택              | 지원하지 않음                 | 지원하지 않음     |
| 두 구역에 걸친 선택                | 지원하지 않음                 | 지원하지 않음     |
| 머리말·꼬리말·각주·미주            | 지원하지 않음(1단계)          | 없음              |
| 개체(그림·표) 선택                 | 지원하지 않음                 | 지원하지 않음     |
| 표 안의 표                         | 글자 모양·글자 스타일만 지원  | 지원하지 않음     |
| 양식 모드                          | 명령 자체를 끈다              | –                 |

- 그림·표가 개체로 선택된 상태에서는 글자나 칸 대상이 없다. 이유를 알린다.
- 셀 블록은 `cursor.isInCellSelectionMode()`, `getCellTableContext()`, `getSelectedCellRange()`, `getExcludedCells()`로 고른다. 셀 인덱스와 문단 대상은 편집기의 `selectCellIndicesInRange`, `paraFormatTargetsForCellBlock`을 그대로 쓴다.
- 표 안의 표에서 `글자 모양`이나 `글자 스타일`만 골랐으면 by-path 글자 호출로 적용할 수 있다. `문단 모양`, `둘 다`, `문단 스타일`, 셀 모양이 끼면 그 표 전체를 거절한다. 일부만 바꾸지 않는다.
- 표 밖에서 `셀 모양만`을 고른 상태로 적용하면 아무것도 바꾸지 않고 "표 안에서만 셀 모양을 적용할 수 있습니다"라고 알린다.

### 6.9 값 복사 범위

복사할 자리는 블록이 있으면 문서 순서 첫 자리, 없으면 커서다. 그 자리의 글자·문단 모양을 엔진에 직접 묻는다(선택의 활성 끝과 문서 순서 시작이 다를 수 있다). 칸 모양은 그 자리가 든 칸에서 읽는다.

**글자 모양** — `getCharPropertiesAt`이 주는 값 가운데 다음을 담는다.

- 담는다: `fontSize`, `bold`, `italic`, `underline`, `strikethrough`, `textColor`, `shadeColor`, `emboss`, `engrave`, `underlineType`, `underlineColor`, `outlineType`, `shadowType`, `shadowColor`, `shadowOffsetX`, `shadowOffsetY`, `strikeColor`, `subscript`, `superscript`, `ratios`, `spacings`, `relativeSizes`, `charOffsets`, `emphasisDot`, `underlineShape`, `strikeShape`, `kerning`, `borderLeft/Right/Top/Bottom`, `fillType`, `fillColor`, `patternColor`, `patternType`, `fontFamilies`(7개 이름)
- 뺀다: `charShapeId`, `fontId`, `fontIds`, `fontFamily`, `fontName`, `borderFillId`(문서 고유 번호)
- 적용할 때 `fontFamilies`의 이름을 언어마다 `findOrCreateFontIdForLang`으로 풀어 `fontIds`로 넘긴다. 이름이 비어 있으면 그 언어는 지금 글꼴을 그대로 둔다.
- 글꼴 ID는 복사할 때 찾지 않고 적용할 때 변경 안에서만 찾는다. 복사는 문서를 바꾸지 않아야 한다(저장 안 됨 표시도 바뀌지 않아야 한다).

**문단 모양** — `getParaPropertiesAt`이 주는 값 가운데 다음을 담는다.

- 담는다: `alignment`, `lineSpacing`, `lineSpacingType`, `marginLeft`, `marginRight`, `indent`, `spacingBefore`, `spacingAfter`, `headType`, `paraLevel`, `numberingId`(같은 문서일 때만), `widowOrphan`, `keepWithNext`, `keepLines`, `pageBreakBefore`, `fontLineHeight`, `singleLine`, `autoSpaceKrEn`, `autoSpaceKrNum`, `verticalAlign`, `englishBreakUnit`, `koreanBreakUnit`, `borderLeft/Right/Top/Bottom`, `fillType`, `fillColor`, `patternColor`, `patternType`, `borderSpacing`, `borderConnect`, `borderIgnoreMargin`, `tabAutoLeft`, `tabAutoRight`, `tabStops`
- 뺀다: `paraShapeId`, `defaultTabSpacing`, `borderFillId`
- 여백·들여쓰기는 픽셀을 150배, 문단 위아래 간격은 75배 해서 엔진에 넘긴다. 엔진이 픽셀로 보고하는 값이다.
- 탭 정지(`tabStops`)와 자동 탭 설정(`tabAutoLeft`, `tabAutoRight`)도 담는다. 엔진이 그대로 쓴다.
- `numberingId`는 같은 문서에서만 쓴다. 다른 문서로 가져갈 때는 번호/글머리표를 건너뛴다(2단계에서 결정).

**셀 모양**

- 셀 속성: `paddingLeft/Right/Top/Bottom`, `applyInnerMargin`, `verticalAlign`, `textDirection`, `isHeader`, `cellProtect`
- 셀 테두리: `borderLeft/Right/Top/Bottom`, `diagonalLine`, `diagonalSlash`, `diagonalBackSlash`, `diagonalWidth`, `diagonalColor`, `centerLine`
- 셀 배경: `fillType`, `fillColor`, `patternColor`, `patternType`
- 뺀다: `width`, `height`, `fieldName`, `editableInForm`, `borderFillId`
- `fieldName`을 빼는 것이 특히 중요하다. 지금 구현은 이것을 복사해 양식 칸의 필드를 지운다.

**스타일**

- 글자 스타일: 복사한 자리의 `charShapeId`와 같은 `charShapeId`를 쓰는 글자 스타일(`getStyleList()`의 `type === 1`)을 찾는다. 정확히 하나면 이름을 담고, 없거나 여럿이면 대화상자에서 끈다.
- 문단 스타일: `getStyleAt`(칸이면 `getCellStyleAt`)이 주는 스타일의 이름을 담는다.
- 적용할 때 같은 문서면 번호를, 다른 문서면 이름(영어 이름 포함)으로 찾는다. 없으면 그 문서의 스타일 목록과 함께 거절한다.
- 글자 스타일은 그 스타일의 `charShapeId`를 글자 범위에 놓는다. 문단 스타일은 `applyStyle`/`applyCellStyle`을 쓴다. 한컴처럼 직접 서식이 남는다(엔진 패치 13).

## 7. 다른 문서로의 기억 (2단계)

1단계는 이 편집기 안에서만 기억한다. 한컴처럼 "한글을 끝낼 때까지, 다른 문서에도"를 하려면 앱 실행 단위의 공유 저장소가 필요하다. 후보는 둘이다.

- **localStorage + 앱 실행 토큰(권장)**: 앱이 실행될 때마다 하나의 임의 토큰을 만들고, 각 한글 편집기의 주소에 `&session=<토큰>`으로 붙인다. 새 모듈은 `ieum-format-copy:<토큰>` 키로만 읽고 쓴다. 앱을 다시 켜면 토큰이 달라져 지난번 모양은 쓰이지 않는다. 탭·창 사이는 같은 토큰이라 공유된다. 값은 서식뿐이고 문서 글자는 없다. 토큰을 만드는 IPC 한 개와 preload 한 줄이 든다.
- **메인 프로세스 저장소**: `hwp:format-copy-get/set` 채널을 만들고 메인 프로세스가 앱이 끝날 때 지운다. 정확하지만 편집기 안 플러그인과 바깥 앱 사이에 비동기 왕복이 생겨, 복사·적용 명령이 지금처럼 한 번에 끝나지 않는다.

1단계에서는 하지 않는다. 화면에도 "다른 문서"를 약속하지 않는다.

## 8. 하지 않는 것

- **연속 붓 모드**: 한컴의 모양 복사는 두 단계(복사 → 블록 적용)이지, Word의 서식 붓처럼 클릭할 때마다 적용하는 모드가 아니다. 워드 편집기의 서식 복사는 붓이지만, 한글 탭은 한컴을 따른다.
- **개체 모양 복사**: 그림·도형의 크기·선·채우기를 복사하는 한컴의 `개체 모양 복사/붙이기`는 별개 기능이다.
- **쪽·구역·단 모양**: 문서 전체 서식이 아니라 글자·문단·표 칸만 다룬다.
- **머리말·꼬리말·각주·미주**: 1단계에서 지원하지 않고 이유를 알린다. 엔진의 적용 경로가 본문·칸과 달라 별도 설계가 필요하다.
- **표 안의 표의 문단·칸 모양**: 엔진에 by-path 적용 호출이 없다. 글자 모양만 허용한다.
- **AI 도구**: AI가 이 기능을 부르게 하지 않는다. AI는 이미 자기 서식 도구가 있다.
- **원본 rhwp 엔진의 바이트 수정**: 없다. 모든 변경은 엔진의 공개 호출로 한다.

## 9. 단계

### 0단계 — 양식 칸 보호(먼저)

지금 구현이 `fieldName`·`editableInForm`을 칸 모양으로 복사해 양식 칸의 필드를 지울 수 있다. 대화상자 설계와 별개로, `FORMAT_COPY_CELL_KEYS`에서 두 키를 빼는 작은 패치를 먼저 넣는 것이 좋다. 실제 엔진 시험으로 "이름이 있는 칸에 일반 칸의 모양을 복사해도 필드가 남는지"를 확인한다. 이 단계만 먼저 내보내도 데이터 손실은 막을 수 있다.

### 1단계 — 대화상자와 정확한 복사 (권장)

1. `format-copy.mjs`에 상태·대화상자·복사·적용·거절을 만든다.
2. 빌드 패치 세 곳과 별칭·스탬프·훅을 넣는다.
3. 글자(언어별 글꼴·테두리/배경), 문단(테두리/배경·번호·탭), 칸(속성·테두리·배경)을 고친다.
4. `fieldName`·`editableInForm`을 빼서 양식 칸을 지키게 한다.
5. `둘 다`, 셀 블록, 본문→셀 블록, 한 칸 글자 블록을 한컴처럼 적용한다.
6. 한 번 적용을 실행 취소 한 단계로 묶는다.
7. 복사 상태를 적용 뒤에도 유지한다.
8. 중첩 표·머리말·각주·걸친 선택을 이유와 함께 거절한다.
9. 시험과 빌드한 앱 확인을 한다.

### 2단계 — 다른 문서와 남은 자리

- 앱 실행 토큰을 붙여 다른 문서·다른 탭에 적용한다.
- 머리말·꼬리말·각주·미주 적용을 엔진 호출이 있는 만큼 넣는다.
- rhwp 상위에 같은 수정(언어별 글꼴, 빠진 속성, 대화상자)을 제안한다. 상위가 받아들이면 앱 패치를 뺀다.

## 10. 정한 것 (2026-10-25)

1. **범위**: 대화상자까지 하는 B안으로 한다.
2. **다른 문서**: 1단계는 이 편집기 안에서만 기억하고, 다른 문서는 2단계로 미룬다.
3. **셀 기본값**: `셀 속성`, `셀 테두리`, `셀 배경` 셋 다 켠다.
4. **중첩 표**: `글자 모양`·`글자 스타일`만 허용하고 문단·칸 모양은 거절한다.
5. **스타일**: `글자 스타일`·`문단 스타일`을 1단계에 넣는다.
6. **알림**: 복사와 거절에 짧은 알림을 띄운다.

## 11. 검증

- **단위(가짜 편집기)**: 옵션 조합, 상태 스키마, 본문/칸/셀 블록/중첩 표/머리말 분류, 묶음 명령의 실행 순서와 실패 되돌리기, `fieldName` 제외, 글꼴 이름 풀기, 픽셀→엔진 단위, 거절 문구, 복사만으로 문서가 바뀌지 않는지.
- **실제 엔진**: 글자·문단·칸 왕복, 언어별 글꼴(한글 맑은 고딕 + 라틴 Arial), 글자/문단 테두리·배경, 글자·문단 스타일, 셀 블록, 한 번 적용의 실행 취소, 양식 칸 이름 보존, 중첩 표 거절, `exportHwp` 뒤 다시 읽어도 같은지.
- **패치**: `tests/rhwp-patches.test.ts`가 새 패치가 받아 온 소스에 정확히 한 번 걸리는지, `hancomHooks`의 이름이 다 있는지 본다.
- **빌드한 앱**: 빈 문서로 `Alt+C` 대화상자 열기·복사·블록 적용(대화상자 없이 적용)을 확인했다(`e2e/hwp-format-copy.spec.ts`). 표가 있는 문서로 `셀 속성`·`셀 테두리`·`셀 배경`이 모두 켜진 대화상자, 일반 칸의 모양을 양식 칸에 적용한 뒤에도 `이름1`·`이름2` 필드가 남는 것을 확인했다(`e2e/hwp-format-copy-cell.spec.ts`). 중첩 표·머리말 안내, 문단 스타일 화면 적용은 아직 눈으로 확인하지 않았다.
- **한컴 비교**: 같은 문서를 한컴 한글 2024에서 복사해 글자·문단·칸 결과를 눈과 `tools/odt-hancom/hancom.py look`으로 견준다. 중첩 표·머리말처럼 이번 단계에서 못 하는 것은 차이로 기록한다.

## 12. 참고

- 한컴 도움말: <https://help.hancom.com/hoffice/multi/ko_kr/hwp/format/quick_format/quick_format.htm>, 표 안: <https://help.hancom.com/hoffice/multi/ko_kr/hwp/format/quick_format/quick_format(cell).htm>
- 편집기 소스(빌드 때 받는 사본): `rhwp-studio/src/engine/input-handler.ts`, `src/command/commands/edit.ts`, `src/command/shortcut-map.ts`, `index.html`
- 앱의 같은 일: `apps/hwp/studio-plugin/agent-plugin.mjs`의 `formatOf`, `resolveFormat`, `formatSelection`(AI 서식), `tests/agent-plugin-format.test.ts`(단위·단위 변환 시험)
- 빌드·패치: `apps/hwp/scripts/build-studio.mjs`, `apps/hwp/scripts/rhwp-patches.mjs`, `apps/hwp/AGENTS.md`의 "rhwp 소스에 거는 패치"
- 결정 0060(한글 단축키), 0055(한글 스타일), 0022(한글 AI 편집)

## 13. 구현 결과 (2026-10-25)

### 바뀐 것

- `apps/hwp/studio-plugin/format-copy.mjs`(새 파일): 한컴식 대화상자, 복사 상태(편집기마다), 글자·문단·칸·스타일 적용, 대상 분류, 거절 이유, 한 실행 취소 단계로 묶는 합성 명령, 글꼴 이름 풀기, 페이지 픽셀 변환.
- `apps/hwp/scripts/rhwp-patches.mjs`(고침): `studio-format-copy-safety`(양식 칸 이름·편집 가능 여부를 옛 키 목록에서 뺀다), `studio-format-copy`(edit 명령의 실행부를 새 모듈로 바꾸고 양식 모드에서는 끈다), `studio-format-copy-state`(`hasCopiedFormat`이 새 상태를 본다) 패치와 `hancomHooks` 이름.
- `apps/hwp/scripts/build-studio.mjs`(고침): `@ieum/format-copy` 별칭과 빌드 스탬프 해시.
- `apps/hwp/scripts/rhwp-patches.d.mts`(고침): 모듈 이름과 세 패치 이름 선언.
- `apps/hwp/tests/format-copy.test.ts`(새 파일): 상태·대상·계획·합성 명령·셀 필드 보존 단위 시험 23개.
- `apps/hwp/tests/format-copy-engine.test.ts`(새 파일): 실제 엔진으로 언어별 글꼴, 글자·문단 테두리/배경, 탭, 스타일, 양식 칸 보존, 저장 왕복 시험 5개.
- `apps/hwp/tests/fixtures/format-copy-table.hwp`(새 파일): 셀 모양·양식 칸 확인용 2×2 표 문서.
- `apps/hwp/tests/rhwp-patches.test.ts`(고침): 안전 패치 시험, 새 패치 대상 파일.
- `e2e/hwp-format-copy.spec.ts`, `e2e/hwp-format-copy-cell.spec.ts`(새 파일): 빌드한 앱에서 `Alt+C` 대화상자, 복사·블록 적용, 셀 항목 세 개(테두리 포함), 양식 칸 보존.

### 확인한 것

- `npm run test -w @genoffice/hwp`: 45개 파일, 616개 시험 통과(새 시험 포함).
- `npm run typecheck -w @genoffice/hwp`: 통과.
- `npm run build -w @genoffice/hwp`: 통과(studio 빌드에서 세 패치가 받아 온 소스에 적용됨).
- `E2E_NO_VIDEO=1 npx playwright test ... e2e/hwp-format-copy*.spec.ts`: 2개 통과.
- `npm run check:english-comments`: 통과.
- 한 번 적용이 한 명령인 것은 단위 시험에서 `executeOperation` 호출 수가 1인 것으로 확인했다. 실제 화면에서 `Ctrl+Z` 한 번을 눌러 견주는 확인은 아직이다.

### 아직 아닌 것

- 다른 문서·다른 탭으로의 기억(2단계).
- 머리말·꼬리말·각주·미주.
- 표 안의 표에서 문단·칸 모양(글자 모양·글자 스타일만 된다).
- 한컴 한글 2024와 같은 문서를 나란히 두고 글자·문단·칸 결과를 눈으로 견주는 확인.
- rhwp 상위에 같은 수정(언어별 글꼴, 빠진 속성, 대화상자)을 제안하는 일.
