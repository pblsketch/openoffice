# 인쇄 미리보기 계획

상태: **구현됨**(2026-10-29, 작업 트리). 아직 커밋·배포 전이다. 2026-10-28에 들어온 외부 사용자 기능 제안에서 시작했다.

구현한 것:

- 한글: 전체 탭 미리보기, `previewPage` 플러그인 호출, 쪽 이동·확대·한 쪽/맞쪽/2×2~8×8, 여백 보기, 현재 쪽 편집(Ctrl+Enter), 인쇄/PDF, Ctrl+P·Alt+P, 21개 언어.
- 마크다운: `printToPDF`로 만든 PDF를 pdf.js로 보는 인쇄 창, 쪽 범위·쪽 맞춤/실제 크기·용지(A4/Letter)·방향, 같은 HTML과 옵션으로 인쇄, 21개 언어.
- 확인: 한글 `typecheck`·`build`·전체 테스트(표 조판 테스트 10건은 이번 변경과 무관한 `vendor/rhwp-core` 수정 때문에 실패), 마크다운 `typecheck`·`build`·전체 테스트(`image-export` 1건은 Windows에서 원래 실패).
- 빌드한 앱(Playwright)에서 한글 1쪽 미리보기와 마크다운 2쪽 미리보기를 열어 쪽 그림, 쪽 번호, 도구 줄을 확인했다. 한글 여백 보기의 빨간 점선, Ctrl+Enter로 미리보기가 닫히는 것, 마크다운 Letter 가로 전환도 확인했다.

## 1. 들어온 의견

- 2026-10-28 접수, 기능 제안. 인쇄할 때 미리보기를 볼 수 있게 해 달라는 내용이었다.
- 앱이 복사해 준 정보(버전·운영체제·화면 언어)와 이메일 칸은 비어 있었다.
- 그때의 최신 배포판은 v0.12.7이었다(0.12.8은 같은 날 18:19 KST 배포). 워드(0.12.4부터), 엑셀, 파워포인트, HTML에는 이미 인쇄 미리보기가 있었다.
- 그래서 남은 후보는 **한글(HWP), 마크다운, PDF, 마인드맵**이다. 본문에 편집기 이름이 없어 어느 것인지 단정할 수 없다.
- 한글이 가장 유력하다. 인쇄가 2026-10-14에 들어갔고, 한컴 한글 사용자는 "파일 > 미리 보기"를 인쇄의 기본 동작으로 기대한다. 다만 마크다운도 인쇄가 시스템 대화 상자로 바로 가므로 같은 의견이 나올 수 있다.
- 이 계획은 **한글을 1단계, 마크다운을 2단계**로 둔다. PDF와 마인드맵은 지금 넣지 않는다(6절).

### 1.1 이 계획이 정하는 것(제안)

1. **인쇄는 미리보기를 거친다.** 한글·마크다운에서 `인쇄`와 `Ctrl+P`는 곧바로 시스템 대화 상자를 열지 않고 미리보기를 연다. 미리보기의 `인쇄` 단추가 시스템 대화 상자를 연다. 워드·엑셀·파워포인트가 이미 그렇게 동작한다.
2. **미리보기는 인쇄물을 만드는 같은 코드로 만든다.** 따로 그린 비슷한 그림이 아니라, 인쇄에 보내는 바로 그 SVG/PDF를 보여 준다.
3. **쪽은 필요할 때 그린다.** 미리보기를 열 때 문서 전체를 그리지 않는다. 쪽 수를 먼저 읽고, 보이는 쪽만 그린다.
4. **한글은 전체 탭 모드, 마크다운은 대화 상자**로 한다. 한글은 한컴 한글의 "미리 보기 탭"을, 마크다운은 이 앱의 다른 편집기 인쇄 창을 따른다.
5. **PDF와 마인드맵은 이번에 바꾸지 않는다.** PDF는 편집 화면 자체가 인쇄물과 같고, 마인드맵은 한 쪽짜리라 미리보기의 이득이 작다.

## 2. 기준이 되는 레퍼런스

### 2.1 동작 기준: 한컴오피스 한글 2024

한글의 "파일 > 미리 보기"는 인쇄될 모양을 **편집 화면과 다른 미리 보기 상태**에서 보여 준다. 공식 도움말에서 확인한 동작은 다음과 같다.

| 항목         | 한글 2024의 동작                                         | 이 계획                                          |
| ------------ | -------------------------------------------------------- | ------------------------------------------------ |
| 들어가기     | 파일 > 미리 보기. 미리 보기 탭이 나타나고 편집할 수 없다 | 파일 > 인쇄/미리 보기, Ctrl+P. 읽기 전용         |
| 첫 화면      | 커서가 있던 쪽                                           | 커서가 있던 쪽(`getSelectionContext().page`)     |
| 쪽 이동      | 이전/다음, PageUp/PageDown, Ctrl+PageUp/Down(처음/끝)    | 같게                                             |
| 확대         | 쪽 맞춤, 폭 맞춤, 100~500%, 25%씩 확대/축소              | 쪽 맞춤, 폭 맞춤, 10~500%, 25%씩                 |
| 쪽 보기      | 한 쪽, 맞쪽(홀수 쪽이 오른쪽), 여러 쪽(최대 8×8)         | 한 쪽, 맞쪽, 여러 쪽(최대 8×8)                   |
| 안내선       | 여백 보기(빨간 점선), 편집 용지 보기(초록 선)            | 여백 보기(빨간 점선). 편집 용지 보기는 종이 자체 |
| 상태 줄      | 현재 쪽/전체 쪽, 편집 용지 종류, 확대 비율               | 현재 쪽/전체 쪽, 용지 크기(mm), 확대 비율        |
| 인쇄         | 미리 보기에서 인쇄 대화 상자를 연다                      | 미리보기의 `인쇄` 단추가 시스템 대화 상자를 연다 |
| 닫기         | 닫기 또는 Esc. 편집 화면의 커서 자리로 돌아간다          | 같게                                             |
| 기억         | 한/글이 실행되는 동안 보기 상태를 기억한다               | 앱이 실행되는 동안 기억한다(디스크에 쓰지 않음)  |
| 현재 쪽 편집 | Ctrl+Enter로 그 쪽 첫 줄에서 편집                        | Ctrl+Enter로 그 쪽 첫 문단에서 편집              |

가져오지 않는 것: 워터마크, 컬러/회색조, 선택 인쇄. 이 앱의 한글 편집기에는 그 기능이 없거나, 있더라도 이번 피드백과 관계가 없다.

출처: 한컴오피스 도움말 "미리 보기", "미리 보기 탭", "단축키 일람"(한글 2024 기준).

### 2.2 구현 기준: LibreOffice 26.8

LibreOffice는 미리보기를 **문서 위에 얹은 별도 보기(view)**로 만들고, 인쇄와 같은 조판 코드를 쓴다. 소스에서 확인한 것은 다음과 같다.

| 파일                                            | 확인한 것                                                                                                                                                                                                                         | 이 계획에 가져오는 것                                                         |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `sw/source/uibase/uiview/pview.cxx`             | `SFX_IMPL_NAMED_VIEWFACTORY(SwPagePreview, "PrintPreview")`. 미리보기는 대화 상자가 아니라 문서에 등록된 이름난 보기다. `SwPreviewZoomDlg`가 행×열을 받고, `PrintSettingsChanged()`가 `ReInit()`과 `ChgPage(MV_DOC_STT)`를 부른다 | 미리보기를 편집기와 분리된 화면 상태로 두고, 인쇄 설정이 바뀌면 다시 배치한다 |
| `sw/source/core/view/pagepreviewlayout.cxx`     | `Init(cols, rows, winSize)`로 보기 격자를 만들고, `Paint()`가 `bVisible`인 쪽만 그린다(`IsPageVisible`)                                                                                                                           | 보이는 쪽만 그린다. 여러 쪽 보기는 격자로 계산한다                            |
| `sc/source/ui/view/preview.cxx`                 | `CalcPages()`가 인쇄와 같은 `ScPrintFunc`로 쪽 수를 센다. `DoPrint()`는 `Range(nPageNo+1, nPageNo+1)`로 **현재 쪽 하나만** 그린다. `GetOptimalZoom()`이 쪽/폭 맞춤을 계산하고 `SetZoom()`은 20~400%로 자른다                      | 쪽 수는 인쇄 조판에서 얻고, 현재 쪽만 그린다. 확대 범위를 둔다                |
| `sc/source/ui/view/prevwsh.cxx`, `prevwsh2.cxx` | 이전/다음/처음/끝, 확대/축소, 여백 보기 슬롯이 있다. `ScPrintOptions`가 바뀌면 `DataChanged(true)`로 미리보기를 무효화한다                                                                                                        | 쪽 이동·확대·안내선을 도구 줄에 두고, 설정이 바뀌면 다시 그린다               |
| `sw/source/uibase/uiview/pview.cxx`의 인쇄 부분 | 미리보기에서 인쇄할 때 문서의 프린터를 그대로 쓴다(별도 렌더러가 아니다)                                                                                                                                                          | 미리보기의 `인쇄`는 기존 인쇄 경로를 그대로 부른다                            |

여기서 가져오는 원칙은 다섯 가지다.

1. **미리보기는 두 번째 조판기가 아니다.** 인쇄와 같은 조판/그리기 코드를 쓴다.
2. **쪽은 지연해서 그린다.** 쪽 수를 먼저 알고, 화면에 보이는 쪽만 그린다.
3. **쪽 수는 전체를 그리지 않고 센다.** LibreOffice Calc는 시트마다 `ScPrintFunc`로 쪽 수를 세고, "마지막 쪽"을 요청받을 때만 끝까지 센다.
4. **설정이 바뀌면 미리보기를 다시 배치한다.** 인쇄 설정과 미리보기가 어긋나지 않게 한다.
5. **미리보기의 인쇄는 같은 인쇄 경로를 쓴다.** 미리보기용 별도 인쇄기를 만들지 않는다.

### 2.3 이 앱에 이미 있는 것

| 편집기     | 지금 인쇄                      | 미리보기                      | 방식                                                                                    |
| ---------- | ------------------------------ | ----------------------------- | --------------------------------------------------------------------------------------- |
| 워드       | `PrintDialog`                  | 있음                          | 쪽 나눔 미리보기의 `.pv-page`를 복제해 한 쪽씩 보여 준다. 인쇄도 같은 `.pv-page`를 쓴다 |
| 엑셀       | `PrintDialog`                  | 있음                          | 설정을 바꾸면 인쇄 HTML을 다시 만들고, 그 HTML의 한 쪽을 iframe으로 보여 준다           |
| 파워포인트 | `PrintDialog`                  | 있음                          | 슬라이드를 PNG로 한 번 그려 미리보기와 인쇄에 함께 쓴다                                 |
| HTML       | 인쇄 대화 상자                 | 있음                          | 내보내는 바로 그 PDF를 메모리로 받아 pdf.js로 쪽 축소판을 그린다(`html:print-preview`)  |
| 한글       | 시스템 인쇄 대화 상자          | **없음**                      | 인쇄용 SVG를 모아 숨은 창에서 인쇄한다                                                  |
| 마크다운   | 숨은 iframe의 `window.print()` | **없음**                      | PDF 내보내기는 `printToPDF`, 인쇄는 iframe                                              |
| PDF        | 시스템 인쇄 대화 상자          | 없음(편집 화면이 곧 미리보기) | 쪽을 그림으로 만들어 인쇄한다                                                           |
| 마인드맵   | 시스템 인쇄 대화 상자          | 없음                          | 한 장짜리 HTML을 숨은 창에서 인쇄한다                                                   |

HTML 편집기의 `html:print-preview`는 마크다운 2단계의 좋은 본보기다. 메인의 `printToPDF`가 만든 바로 그 PDF를 화면에 보여 주고, 인쇄는 같은 HTML을 같은 설정으로 보낸다.

## 3. 설계 원칙

1. **같은 인쇄물, 같은 코드.** 한글은 `renderPageSvgWithProfile(page, 'print')`가 만든 SVG를, 마크다운은 `printToPDF`가 만든 PDF를 보여 준다. 미리보기만을 위한 두 번째 레이아웃을 만들지 않는다.
2. **쪽 수 먼저, 그림은 나중.** 미리보기를 열 때 전체 쪽을 그리지 않는다. 첫 쪽을 그리는 동안에도 쪽 수와 용지 크기는 보여 준다.
3. **읽기 전용.** 미리보기에서는 문서를 고칠 수 없다. AI 창과 AI 레일을 숨기고, 문서가 바뀌면 미리보기를 낡은 것으로 표시한다.
4. **인쇄 설정과 미리보기는 한 몸.** 종이·여백·방향·범위를 바꾸면 미리보기가 그 자리에서 다시 배치된다.
5. **엔진과 저장 바이트를 건드리지 않는다.** 한글은 엔진의 읽기/그리기 호출만 쓴다. 새 저장 경로를 만들지 않는다.
6. **앱의 관례를 따른다.** 색은 토큰만 쓰고, 문구는 21개 언어를 채우고, 키는 그 편집기가 이미 쓰는 자리에 둔다.

## 4. 한글(HWP) 인쇄 미리보기

### 4.1 화면

전체 탭을 덮는 미리보기 모드다. 셸의 탭 줄은 그대로 두고, 그 아래 편집기 화면만 미리보기로 바뀐다.

```
┌──────────────────────────────────────────────────────────────┐
│ [인쇄] [PDF] │ ‹  3 / 12  ›  │ 쪽 맞춤 ▾ │ 한 쪽 ▾ │  닫기  │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│                    ┌────────────────┐                        │
│                    │                │                        │
│                    │   3쪽 (SVG)    │                        │
│                    │                │                        │
│                    └────────────────┘                        │
│                                                              │
├──────────────────────────────────────────────────────────────┤
│ 3 / 12 · 210 × 297 mm · 쪽 맞춤                              │
└──────────────────────────────────────────────────────────────┘
```

- 배경은 `--canvas`, 종이는 흰색이다. 종이 위의 내용은 문서 색 그대로다(테마가 다시 칠하지 않는다).
- 도구 줄은 왼쪽에 `인쇄`(주 단추)와 `PDF`, 가운데에 쪽 이동과 쪽 번호, 오른쪽에 확대/보기/닫기.
- 상태 줄은 현재 쪽/전체 쪽, 용지 크기(mm), 확대 상태(`쪽 맞춤`, `폭 맞춤`, `2×2`, `150%`)를 보여 준다.
- 쪽을 그리는 동안에는 종이 모양의 빈 자리와 `쪽을 그리는 중…`을 보여 준다. 실패하면 그 자리에 `이 쪽을 그리지 못했습니다`와 `다시 시도`를 둔다.

### 4.2 데이터 흐름

```
파일 > 인쇄 / 미리 보기, Ctrl+P
        │
        ▼
shell/hwp-main: HWP_CHANNELS.previewRequest { action: 'print' | 'open' }
        │
        ▼
App: getSelectionContext().page → 첫 쪽 (실패하면 1쪽)
     previewOpen = true (AI 창·레일 숨김)
        │
        ▼
PrintPreview: bridge.previewPage(page)
        │  (플러그인, 인쇄용 글자 폭)
        ▼
{ pageCount, page, svg, width, height }
        │
        ▼
Blob URL → <img> → 종이 위에 그린다

인쇄:
PrintPreview의 [인쇄] → App의 runPrint('print')
        → gatherPrintJob(...) → hwp:print-pages
        → 숨은 창 → 시스템 인쇄 대화 상자
```

중요한 점: **미리보기를 여는 것만으로 `gatherPrintJob`을 부르지 않는다.** 지금은 인쇄를 누르면 전체 쪽을 모으느라 381쪽 문서에서 81초가 걸린다. 미리보기는 첫 쪽만 그리고, 인쇄할 때 기존 경로로 전체를 모은다.

### 4.3 플러그인 API

`apps/hwp/studio-plugin/agent-plugin.mjs`에 `previewPage(page)`를 더한다. `printPages`와 같은 `withPortableWidths` 안에서 한 쪽만 그린다.

```ts
// studio-plugin/agent-plugin.d.mts
export interface AgentPreviewPage {
  pageCount: number
  page: number // 0-based
  svg: string
  width: number // CSS px
  height: number
}

previewPage(page: number): AgentPreviewPage
```

```js
// agent-plugin.mjs (요지)
previewPage: guarded((page) =>
  host.read((doc) =>
    withPortableWidths(doc, () => {
      const pageCount = doc.pageCount()
      if (!Number.isInteger(page) || page < 0 || page >= pageCount) {
        throw fail('BAD_ARGUMENT', 'page out of range')
      }
      const info = JSON.parse(doc.getPageInfo(page))
      return {
        pageCount,
        page,
        svg: doc.renderPageSvgWithProfile(page, 'print'),
        width: info.width,
        height: info.height,
      }
    }),
  ),
)
```

- `printPages`의 쪽 그리기 부분을 `printPageOf(doc, page)`로 뽑아 두 함수가 같은 코드를 쓰게 한다. `printPages`의 동작(2초 묶음, 페이지 수, 순서)은 바꾸지 않는다.
- `AgentBridge`의 `METHODS`에 `'previewPage'`를 더한다. AI 도구 목록에는 넣지 않는다(앱 화면만 쓴다).
- 엔진(`rhwp`)은 고치지 않는다. 이미 있는 `getPageInfo`, `renderPageSvgWithProfile`, `pageCount`만 쓴다.

### 4.4 쪽 그리기와 캐시

- SVG는 `Blob`으로 만들어 `URL.createObjectURL`한 뒤 `<img>`로 그린다. 렌더러 CSP가 `img-src ... blob:`을 허용한다. `innerHTML`로 SVG를 넣지 않는다(문서 속 스크립트가 앱 화면에서 돌 수 있다).
- 페이지 캐시는 `Map<number, { url, width, height, margins }>`와 LRU 순서를 둔다. 상한은 72쪽(8×8 화면 64쪽에 앞뒤 미리 그리기 자리를 더한 값). 화면에 보이는 쪽은 캐시에서 밀어내지 않는다. 밀려난 쪽의 URL은 `revokeObjectURL`한다.
- 첫 쪽을 그린 뒤 앞뒤 한 쪽씩 미리 그린다. 여러 쪽 보기에서는 다음 줄의 첫 쪽을 미리 그린다.
- `<img>`가 `onerror`를 내면 한 번 다시 요청하고, 또 실패하면 그 쪽만 오류 상태로 둔다. 다른 쪽은 계속 볼 수 있다.
- HTML/SVG가 아주 큰 쪽(수십 MB)은 캐시에 하나만 남긴다. 메모리 상한을 넘기면 가장 오래된 쪽부터 버린다.

### 4.5 조작과 단축키

| 조작           | 키                          | 비고                                                             |
| -------------- | --------------------------- | ---------------------------------------------------------------- |
| 이전/다음 화면 | PageUp / PageDown           | 한 쪽 보기에서는 한 쪽씩, 여러 쪽 보기에서는 격자 한 화면씩      |
| 처음/끝        | Ctrl+PageUp / Ctrl+PageDown | 끝으로 갈 때 쪽 수가 이미 있으므로 바로 간다                     |
| 확대/축소      | Num + / Num −               | 25%씩. 10~500%                                                   |
| 닫기           | Esc                         | 편집 화면으로 돌아간다                                           |
| 인쇄           | Ctrl+P, Alt+P               | 미리보기가 열려 있으면 바로 인쇄, 닫혀 있으면 미리보기를 연다    |
| 미리 보기      | (없음)                      | 한글의 Alt+P,V는 2단계다. 지금 키 층은 Ctrl 계열 연속키만 받는다 |
| 여백 보기      | `.`                         | 빨간 점선으로 본문 영역을 표시                                   |
| 현재 쪽 편집   | Ctrl+Enter                  | 그 쪽에서 시작하는 첫 문단으로 커서를 옮기고 미리보기를 닫는다   |

- 미리보기 모드에서는 편집기 iframe이 초점을 받지 않게 한다. 키는 미리보기 화면이 window capture로 받는다.
- `Ctrl+Enter`는 플러그인의 `pageTarget(page)`가 찾은 첫 문단으로 `focusTarget`을 부른다. 한 문단이 여러 쪽에 걸쳐 그 쪽에서 시작하는 문단이 없으면 이동하지 않고 이유를 보여 준다.

### 4.6 메뉴와 IPC

| 곳                                          | 바꿀 것                                                                                                                                                                                                        |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/hwp/src/shared/ipc.ts`                | `previewRequest: 'hwp:preview-request'`, `PreviewRequest { action: 'print' \| 'open' }`                                                                                                                        |
| `apps/hwp/src/main/hwp-main.ts`             | `requestHwpPreview(contents, action)`. `installFileShortcuts`의 Ctrl+P, `hancomFileKey`의 Alt+P(인쇄), `fileCommand`의 `preview`/`print`가 이 함수를 부른다. PDF는 지금처럼 `requestHwpPrint(contents, 'pdf')` |
| `apps/hwp/src/preload/index.ts`             | `onPreviewRequest(handler)`                                                                                                                                                                                    |
| `apps/hwp/src/renderer/App.tsx`             | `previewOpen` 상태, `onPreviewRequest` 처리, `getSelectionContext().page`로 첫 쪽, AI 창·레일 숨김, `runPrint`를 미리보기에 넘김                                                                               |
| `apps/hwp/src/renderer/preview/`            | `PrintPreview.tsx`, `preview-model.ts`, `preview-cache.ts`, `preview.css`                                                                                                                                      |
| `apps/hwp/studio-plugin/agent-plugin.mjs`   | `previewPage`, File 메뉴에 `미리 보기` 항목, `ieum:file-command`의 `preview`                                                                                                                                   |
| `apps/hwp/studio-plugin/agent-plugin.d.mts` | `previewPage` 타입                                                                                                                                                                                             |
| `apps/shell/src/main/index.ts`              | `buildHwpMenu`에 `미리 보기` 항목(`menuPreview`), `인쇄`는 `requestHwpPreview(..., 'print')`                                                                                                                   |
| `apps/shell/src/main/index.ts`의 `tMain`    | `menuPreview` 21개 언어                                                                                                                                                                                        |
| `apps/hwp/src/renderer/i18n/app/*.ts`       | `filePreview`와 미리보기 문구 21개 언어                                                                                                                                                                        |

동작 규칙:

- `인쇄`/`Ctrl+P`는 `action='print'`를 보낸다. 미리보기가 닫혀 있으면 열고, 열려 있으면 바로 인쇄한다.
- `미리 보기`는 `action='open'`을 보낸다. 이미 열려 있으면 아무것도 하지 않는다.
- PDF는 지금처럼 메뉴에서 바로 내보낸다. 미리보기 도구 줄의 `PDF`는 같은 경로를 부른다(선택).
- 인쇄 중에는 미리보기의 `인쇄`와 `PDF`를 잠근다. 기존 `printingRef`를 그대로 쓴다.

### 4.7 인쇄와 PDF

- 미리보기의 `인쇄`는 App의 기존 `runPrint('print')`를 부른다. 지금 effect 안에 있는 인쇄 몸통을 `runPrint(mode)` 하나로 뽑아 IPC 처리와 미리보기가 함께 쓴다. `gatherPrintJob`이 모든 쪽을 모으고, `hwp:print-pages`가 숨은 창에서 시스템 대화 상자를 연다.
- 진행 알림은 미리보기 위에 보여야 한다. 지금 `.hwp-stage` 안의 알림은 미리보기에 가린다. 미리보기의 상태 줄에 같은 진행 문구(`printPreparing`)를 두거나, 알림을 미리보기보다 높은 층에 그린다.
- 미리보기가 낡은 상태(`stale`)면 인쇄를 막고 "문서가 바뀌었습니다. 미리보기를 다시 열어 주세요"를 보여 준다.
- 인쇄가 끝나거나 취소되면 미리보기로 돌아온다. 한글처럼 미리보기를 닫지 않는다.
- PDF 내보내기는 기존 `runPrint('pdf')`를 그대로 쓴다. 저장 창과 PDF 탭 열기도 바뀌지 않는다.

### 4.8 상태와 오류

| 상태                      | 화면                                                             |
| ------------------------- | ---------------------------------------------------------------- |
| 첫 쪽을 그리는 중         | 빈 종이 + `쪽을 그리는 중…`                                      |
| 쪽 그리기 실패            | 그 쪽 자리에 `이 쪽을 그리지 못했습니다` + `다시 시도`           |
| 쪽 수가 바뀜              | `문서가 바뀌었습니다. 미리보기를 다시 열어 주세요` + `다시 열기` |
| 인쇄할 쪽 없음            | `인쇄할 쪽이 없습니다`                                           |
| 인쇄 실패                 | 기존 `printFailed` 문구 + 원인                                   |
| 문서가 아직 준비되지 않음 | 미리보기를 열지 않고 무시                                        |

- 미리보기를 여는 동안 AI 창과 AI 레일을 숨긴다. AI가 문서를 고칠 수 있으면 미리보기와 인쇄물이 어긋나기 때문이다.
- 미리보기 중에는 발표 모드 키(F5, Ctrl+F5, Shift+F5)를 받지 않는다. 미리보기 자체가 화면을 덮고 있으므로 발표로 넘어가면 돌아올 길이 없다.
- 문서가 바뀌는 경로(자동 저장, 복구, 외부 도구)는 미리보기 중에 없다. 그래도 `previewPage`가 돌려준 `pageCount`가 처음 값과 다르면 낡은 것으로 본다.
- 5,000쪽을 넘는 문서는 인쇄 경로가 이미 거절한다(`MAX_PRINT_PAGES`). 미리보기는 열되, 인쇄할 때 기존 오류를 그대로 보여 준다.

### 4.9 성능

- 381쪽 문서의 인쇄가 81초 걸린다(쪽 그리기 약 15초, PDF 만들기 약 60초). 한 쪽 그리기는 대략 0.2초 안팎이다.
- 미리보기를 열 때 그리는 쪽은 **첫 쪽 하나**다. 쪽 수와 용지 크기는 첫 응답에 함께 온다.
- 캐시 72쪽, 앞뒤 한 쪽 미리 그리기. 4×4 보기에서 16쪽, 8×8 보기에서 64쪽을 한 화면에 둘 수 있다. 8×8은 쪽을 그리는 시간이 걸리므로 빈 종이를 먼저 보여 준다.
- 큰 문서에서 쪽 번호를 직접 입력해 멀리 뛰면 그 쪽 하나만 그린다. 전체를 다시 그리지 않는다.

### 4.10 문구(21개 언어)

| 키                    | ko                                                | en                                            |
| --------------------- | ------------------------------------------------- | --------------------------------------------- |
| `filePreview`         | 미리 보기…                                        | Print Preview…                                |
| `previewPrint`        | 인쇄                                              | Print                                         |
| `previewClose`        | 닫기                                              | Close                                         |
| `previewPrevPage`     | 이전 쪽                                           | Previous page                                 |
| `previewNextPage`     | 다음 쪽                                           | Next page                                     |
| `previewPageOf`       | {page} / {total}                                  | {page} of {total}                             |
| `previewZoomFitPage`  | 쪽 맞춤                                           | Fit page                                      |
| `previewZoomFitWidth` | 폭 맞춤                                           | Fit width                                     |
| `previewViewSingle`   | 한 쪽                                             | Single page                                   |
| `previewViewFacing`   | 맞쪽                                              | Facing pages                                  |
| `previewViewMulti`    | 여러 쪽                                           | Multiple pages                                |
| `previewMargins`      | 여백 보기                                         | Show margins                                  |
| `previewEditPage`     | 현재 쪽 편집                                      | Edit this page                                |
| `previewEditFailed`   | 이 쪽으로 이동하지 못했습니다.                    | Could not go to this page.                    |
| `previewRendering`    | 쪽을 그리는 중…                                   | Drawing the page…                             |
| `previewFailed`       | 이 쪽을 그리지 못했습니다.                        | Could not draw this page.                     |
| `previewRetry`        | 다시 시도                                         | Try again                                     |
| `previewStale`        | 문서가 바뀌었습니다. 미리보기를 다시 열어 주세요. | The document changed. Open the preview again. |
| `previewPaperSize`    | {width} × {height} mm                             | {width} × {height} mm                         |

`menuPreview`(셸 메뉴)도 21개 언어에 더한다. HWP의 기존 `printPreparing`, `printSending`, `printFailed`는 그대로 쓴다.

### 4.11 테스트

- `tests/print-preview-model.test.ts`(순수 함수): 쪽 맞춤/폭 맞춤/백분율 계산, 10~~500% 자름, 25% 단계, 한 쪽/맞쪽/2×2~~8×8의 쪽 배열, 홀수 쪽이 오른쪽인 맞쪽, PageUp/Down의 격자 이동, 처음/끝.
- `tests/print-preview-cache.test.ts`: LRU 상한, 보이는 쪽 고정, 밀려난 URL 해제, 같은 쪽 재요청.
- `tests/print.test.ts`(실제 엔진): `previewPage`의 0쪽·마지막 쪽, 범위 밖 거절, `pageCount` 일치, SVG가 `<svg`로 시작, width/height > 0·여백 값, `pageTarget`이 그 쪽 첫 문단을 찾는지. `printPages`의 기존 테스트도 그대로 통과해야 한다.
- `tests/print-preview.test.tsx`(jsdom, 가짜 브리지): 첫 쪽 로딩 → 표시, 이전/다음, 확대, 보기 전환, 실패 후 다시 시도, 낡은 쪽 수에서 인쇄 잠금.
- 빌드한 앱에서: 100쪽이 넘는 문서(그림·표·가로 용지 포함)를 열어 첫 쪽·중간 쪽·마지막 쪽을 보고, 4×4 보기와 맞쪽 보기를 확인한다. PDF로 내보낸 것과 화면의 같은 쪽을 눈으로 견준다. 인쇄는 시스템 대화 상자에서 PDF로 저장해 같은 쪽을 견준다.

## 5. 마크다운 인쇄 미리보기

### 5.1 왜 PDF를 먼저 만드는가

마크다운의 쪽 나눔은 브라우저의 인쇄 조판이 정한다. 편집기 DOM을 CSS로 흉내 내면 표·코드 블록·각주·그림에서 인쇄물과 어긋난다. 그래서 **인쇄·PDF 내보내기에 쓸 바로 그 HTML을 `printToPDF`로 한 번 구워** 미리보기로 보여 준다. HTML 편집기의 `html:print-preview`와 같은 방식이다.

### 5.2 데이터 흐름

```
파일 > 인쇄, Ctrl+P
        │
        ▼
renderer: buildPrintHtml(편집기 DOM 또는 원문, 제목)
          + printOptions(A4, 여백 0.6in, 머리글/바닥글 없음)
        │
        ▼
markdown:print-preview { html, options }
        → main: printToPDF → PDF 바이트
        │
        ▼
renderer: pdf.js → 쪽 수, 현재 쪽 그림
        │
        ▼
[인쇄] → markdown:print-document { html, options, pages }
        → main: 숨은 창 loadFile → webContents.print
        → 시스템 인쇄 대화 상자
```

### 5.3 화면

기존 편집기들의 인쇄 창과 같은 모양의 모달이다.

```
┌──────────────────────────────────────────────────────────────┐
│ 인쇄                                                         │
├───────────────────────────────┬──────────────────────────────┤
│                               │  쪽 범위: (•) 전체 ( ) 현재 ( ) 직접 │
│      ┌──────────────┐         │  [1] ~ [3]                   │
│      │              │         │  확대: [쪽 맞춤 ▾]            │
│      │  1쪽 (PDF)   │         │  쪽: ‹ 1 / 3 ›               │
│      │              │         │                              │
│      └──────────────┘         │  [취소]        [인쇄]        │
└───────────────────────────────┴──────────────────────────────┘
```

- 미리보기는 pdf.js로 현재 쪽 하나를 캔버스에 그린다. 쪽 이동은 이전/다음과 쪽 번호.
- 확대는 `쪽 맞춤`과 `100%` 두 가지만 둔다.
- 범위는 전체/현재/직접. 직접은 `3` 또는 `2-5` 한 범위를 쓴다.
- 용지(A4/Letter)와 방향(세로/가로)을 고르면 미리보기 PDF를 그 옵션으로 다시 만든다.
- 인쇄가 끝나거나 취소되면 창을 닫는다. 실패하면 창 안에 이유를 보여 준다.

### 5.4 인쇄 설정의 한 곳

`apps/markdown/src/shared/print-options.ts`에 한 벌의 설정을 둔다.

```ts
export interface MarkdownPrintOptions {
  pageSize: 'A4' | 'Letter'
  marginIn: 0.6
  landscape: boolean
  printBackground: true
}
```

- `printToPDF`와 `webContents.print`가 **같은 값**을 받는다. 지금은 PDF 내보내기(A4, 0.6in)와 인쇄(`window.print()`)가 서로 다른 경로였다. 이 계획은 둘을 하나로 모은다.
- `normalizeMarkdownPrintOptions`는 화면이 보낸 값에서 용지와 방향만 받고, 여백·배경·머리글은 앱이 정한 값을 쓴다.
- `buildPrintHtml`의 `@page`는 `size: auto; margin: 0`으로 두고, 용지·방향·여백은 인쇄 옵션으로 준다. CSS와 옵션이 겹치지 않게 한쪽만 쓴다. 구현할 때 `printToPDF`와 `webContents.print`의 결과를 견주어 확인한다(10절 위험).
- 머리글/바닥글은 끈다. `webContents.print`에 빈 `header`·`footer`를 준다.

### 5.5 IPC와 파일

| 곳                                           | 바꿀 것                                                                                              |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `apps/markdown/src/shared/ipc.ts`            | `printPreview: 'markdown:print-preview'`, `printDocument: 'markdown:print-document'`, 요청·결과 타입 |
| `apps/markdown/src/main/print-pdf.ts`        | `printToPDF` 옵션을 `MarkdownPrintOptions`에서 만든다. 미리보기와 PDF 내보내기가 함께 쓴다           |
| `apps/markdown/src/main/print-document.ts`   | 새 파일. 숨은 창에 HTML을 쓰고 `webContents.print`로 인쇄한다                                        |
| `apps/markdown/src/main/markdown-main.ts`    | 두 채널 등록. 입력 HTML/옵션 검사, 한 번에 하나만                                                    |
| `apps/markdown/src/preload/index.ts`         | `renderPrintPreview`, `printDocument`                                                                |
| `apps/markdown/src/renderer/print/`          | `PrintPreviewDialog.tsx`                                                                             |
| `apps/markdown/src/renderer/App.tsx`         | `printDoc`가 iframe `window.print()` 대신 미리보기 창을 연다. `onPrintRequest`도 같은 길             |
| `apps/shell/src/main/index.ts`               | 마크다운 메뉴의 `인쇄`는 지금 채널 그대로(렌더러가 미리보기를 연다). 새 메뉴 항목은 필요 없다        |
| `apps/markdown/src/renderer/i18n/strings.ts` | 미리보기 문구 21개 언어                                                                              |

### 5.6 캐시와 무효화

- 미리보기 PDF는 창을 열 때와 용지·방향을 바꿀 때 만든다. 창이 열려 있는 동안 문서를 고칠 수 없으므로(모달) 글 때문에 다시 만들 필요는 없다.
- 같은 HTML과 같은 옵션으로 인쇄하므로 미리보기와 인쇄물이 어긋나지 않는다.
- PDF가 아주 길면 쪽 그림은 현재 쪽만 그리고, 다른 쪽은 넘길 때 그린다. pdf.js 문서 객체는 새 옵션의 PDF로 바뀌거나 창이 닫힐 때 `destroy`한다.

### 5.7 테스트

- `tests/print-options.test.ts`: 용지·방향 정규화, 기본 A4 세로, 범위 문법.
- 빌드한 앱에서: 그림·표·코드 블록·각주·긴 문단이 든 문서를 미리보기와 PDF 내보내기, 시스템 인쇄(PDF로 저장)로 각각 만들어 쪽 나눔과 글자 위치를 견준다.
- 빌드한 앱에서 A4 세로(17쪽) → Letter 세로(18쪽) → Letter 가로(20쪽)로 바꾸어 미리보기 PDF가 다시 만들어지고 쪽 그림의 가로·세로가 바뀌는지 확인했다.

## 6. PDF와 마인드맵

- **PDF**: 편집 화면이 이미 인쇄물과 같고, 인쇄 대화 상자에 범위·주석 옵션이 있다. 인쇄 미리보기를 따로 두면 같은 것을 두 번 보여 주는 셈이다. 넣지 않는다. 다만 "주석을 인쇄에 넣을지" 같은 선택이 미리보기에서 보이면 좋다는 의견이 오면 그때 검토한다.
- **마인드맵**: 한 장짜리 가로 페이지다. 미리보기의 이득이 작고, 지도 전체를 보는 편집 화면이 이미 미리보기 역할을 한다. 넣지 않는다.

## 7. 기존 미리보기와의 관계

이번에 워드·엑셀·파워포인트·HTML의 인쇄 창을 갈아엎지 않는다. 이미 피드백의 요구를 만족하고, 각각 그 프로그램의 인쇄 화면을 따른다. 다만 다음은 다음 기회에 정리할 수 있다.

| 편집기     | 지금                               | 나중에 볼 것                      |
| ---------- | ---------------------------------- | --------------------------------- |
| 워드       | 한 쪽씩, 쪽 맞춤만                 | Word처럼 확대 비율과 여러 쪽 보기 |
| 엑셀       | 설정 왼쪽, 쪽 오른쪽, 쪽 맞춤/실제 | 없음(가장 완성도가 높다)          |
| 파워포인트 | 전체 덱을 이어서 보여 줌           | 쪽 이동 단추                      |
| HTML       | 쪽 축소판 레일                     | 없음                              |

한글과 마크다운이 같은 "쪽 이동/확대/보기" 부품을 쓰게 되면, 그때 `packages/ui`로 뽑을지 판단한다. 지금은 두 편집기의 요구가 달라(한글은 SVG, 마크다운은 PDF) 공용 패키지를 먼저 만들지 않는다.

## 8. 단계와 작업 목록

### 1단계: 한글 미리보기 (구현됨)

1. 플러그인 `previewPage` + 타입 + 실제 엔진 테스트. `printPages`와 그리기 코드 공유.
2. `preview-model.ts`(쪽 배열·확대·이동)와 `preview-cache.ts`(LRU·Blob URL) + 순수 테스트.
3. `PrintPreview.tsx` + CSS + 도구 줄 + 상태 줄. 가짜 브리지로 화면 테스트.
4. 메뉴·IPC 배선(셸 메뉴, 편집기 File 메뉴, Ctrl+P, Alt+P, preload).
5. 인쇄/PDF 연결, 진행 알림, 낡음/실패 처리.
6. 21개 언어 문구.
7. 빌드한 앱에서 실제 문서로 확인(4.11절).

### 2단계: 마크다운 미리보기 (구현됨)

1. `MarkdownPrintOptions` 한 곳으로 PDF 내보내기와 인쇄 옵션 통일.
2. `markdown:print-preview` + `print-document` + 입력 검사 + 테스트.
3. `PrintPreviewDialog` + pdf.js 쪽 그리기 + 범위·확대.
4. 21개 언어 문구.
5. 빌드한 앱에서 PDF·인쇄 견주기.

### 3단계: 한글 여백 보기·현재 쪽 편집·8×8, 마크다운 용지/방향 (구현됨)

- `getPageInfo`의 `marginLeft`·`marginTop`·`marginRight`·`marginBottom`을 쪽과 함께 받아 빨간 점선 사각형을 그린다.
- `pageTarget(page)`가 그 쪽에서 시작하는 첫 문단을 찾고, `focusTarget`으로 커서를 옮긴 뒤 미리보기를 닫는다.
- 여러 쪽 보기를 2×2~8×8까지 넓히고, 페이지 캐시를 72쪽으로 늘린다.
- 마크다운 미리보기에서 용지(A4/Letter)와 방향(세로/가로)을 고르면 그 옵션으로 PDF를 다시 만든다.

## 9. 확인 방법

- 단위 테스트는 `npm run test -w @genoffice/hwp`, `npm run test -w @genoffice/markdown`, `npm run typecheck -w …`.
- 화면은 빌드한 앱에서 본다. `npm run dev` 또는 설치본. 실제 인쇄는 시스템 대화 상자에서 "PDF로 저장"을 골라 결과를 견준다.
- AI 구독은 쓰지 않는다. 이 기능은 AI를 부르지 않는다.
- 실제 문서 묶음: 한글은 그림·표·가로 용지·구역이 섞인 100쪽 이상 문서, 마크다운은 그림·표·코드 블록·각주가 든 문서.

## 10. 위험과 열린 질문

1. **한글 SVG를 `<img>`로 그릴 때 인쇄와 똑같이 보이는가.** SVG-as-image는 스크립트와 바깥 자원을 막는다. 문서 속 그림은 data URL이라 들어가고, 글꼴은 PC에 설치된 것을 쓴다. 인쇄 창과 글꼴 대체가 같아야 한다. 실제 문서로 먼저 확인하고, 어긋나면 샌드박스 iframe에 CSP를 걸어 그리는 대안을 쓴다.
2. **마크다운의 `printToPDF`와 `webContents.print`가 같은 쪽 나눔을 내는가.** 둘 다 Chromium의 인쇄 조판을 쓰지만 옵션 해석이 다를 수 있다. A4/Letter, 세로/가로, 0.6in, 머리글 없음으로 두 경로를 견주고, 다르면 한쪽으로 맞춘다.
3. **Ctrl+P를 미리보기로 바꾸는 것이 기존 사용자에게 불편한가.** 지금은 바로 시스템 대화 상자가 열린다. 미리보기에서 `인쇄`를 한 번 더 눌러야 한다. 워드·엑셀·파워포인트와 같아지는 쪽을 택했다. 원하지 않으면 `인쇄`는 지금처럼 두고 `미리 보기`만 더할 수 있다.
4. **쪽 수가 아주 많은 문서.** 5,000쪽 상한은 인쇄 경로에만 있다. 미리보기는 열리지만 인쇄에서 거절한다. 미리보기 자체에도 상한을 둘지는 실제 문서로 재어 보고 정한다.
5. **한글 첫 쪽을 커서 자리로 여는 것.** `getSelectionContext().page`가 1부터 세는 UI 쪽 번호를 주므로 1을 빼서 인쇄 쪽 인덱스와 맞췄다. 쪽 번호가 구역마다 다시 시작하는 문서에서는 "UI 쪽 번호"와 "인쇄된 쪽 번호"가 다를 수 있으므로, 상태 줄은 UI 쪽 번호를 쓴다(한글도 그렇게 센다).
6. **공용 부품을 지금 뽑을지.** 한글은 SVG, 마크다운은 PDF라 지금은 공통 부분이 적다. 두 번째 구현이 끝난 뒤 실제로 겹치는 것만 뽑는다.
