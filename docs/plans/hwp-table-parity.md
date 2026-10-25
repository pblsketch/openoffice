# HWP 표 편집 한컴 호환 고도화 계획

상태: **계획 + 핸드오프 준비**(2026-10-25). 아직 코드는 바꾸지 않았다.
작업 위치: `E:\github\openoffice\.dryforge\worktrees\hwp-table-parity`
브랜치: `feat/hwp-table-parity` (`origin/main` = `cb1af81c`)

## 0. 왜 이 작업을 하는가

이음오피스의 한글(HWP) 탭은 rhwp-studio v0.8.7을 편집 화면으로 쓰고, 그 위에 한컴 키 레이어(`apps/hwp/studio-plugin/hancom-keys.mjs`)와 AI 표 도구(`apps/hwp/studio-plugin/agent-plugin.mjs`)를 얹었다.

2026-10-25에 v0.12.4 릴리스 빌드로 실제 Electron 앱을 띄워 표를 만들고 편집해 본 결과:

- 표 만들기(3×3), 셀 입력, `Tab` 이동, 마지막 셀 `Tab` 줄 추가, `Alt+Insert`, `Ctrl+N,K`, `S`, `F5`는 동작했다.
- `H`/`W`는 명령이 비활성인데도 키가 셀에 글자로 들어가는 경우가 있었다.
- `Ctrl+Enter`는 줄 추가가 아니라 표 밖으로 나가 페이지를 나눴다.
- `Ctrl+Backspace`는 줄 지우기가 아니라 셀에서 아무 일도 하지 않았다.
- 셀 안에서 `Ctrl+N,T`는 표 만들기가 비활성이라 표 안의 표가 만들어지지 않았다.
- `F7`/`F8`, `Alt+화살표`, `Ctrl+Tab`, `Shift+Esc`, 표 개체 선택 상태의 `T`/`P`/`L`/`C`/`Ctrl+E`, 셀 블록 복사/오려두기는 한컴과 다르다.
- `M` 셀 합치기는 F5 키보드 선택만으로는 이번 E2E에서 재현하지 못했다. 마우스 드래그 선택은 추가 확인이 필요하다.

즉 기본 표 작성은 되지만, 한컴 사용자가 익숙한 표 편집 흐름과는 거리가 있다. 이 계획은 그 차이를 단계적으로 줄인다.

## 1. 이번 세션(Phase 1A)의 범위

**목표: 엔진을 고치지 않고, 한컴 사용자가 표에서 가장 자주 쓰는 키와 개체 조작을 맞춘다.**

### 1.1 줄 추가·삭제 키

- 표 칸 안에서 `Ctrl+Enter` → 현재 줄 아래에 줄 추가.
  - 기존 `table:insert-row-below` 명령을 사용한다.
  - 한 번의 실행 취소로 되돌아가야 한다.
- 표 칸 안에서 `Ctrl+Backspace` → 현재 줄 지우기.
  - 기존 `table:delete-row` 명령을 사용한다.
  - 표를 비우지 않는 만큼만 지우고, 마지막 줄은 지우지 않는다.
- 표 밖에서는 지금 뜻(페이지 나누기, 이전 단어 지우기)을 유지한다.
- `hancom-keys.mjs`의 문맥 키 처리(`hancomContextKey`)에 표 안 분기를 더하고, `scripts/rhwp-patches.mjs`의 `studio-hancom-chords`가 이 모듈을 먼저 부르게 한다.
- `apps/hwp/tests/hancom-keys.test.ts`에 “표 안에서만” 동작하는 시험을 더한다.

### 1.2 H/W를 안전하게 만든다

현재 `H`/`W`는 메뉴에 단축키처럼 보이지만 명령이 `canExecute: false`인 스텁이고, 키를 누르면 셀에 글자가 들어갈 수 있다. 둘 중 하나를 고른다.

1. **구현이 가능하면 구현한다.**
   - `services.wasm.resizeTableCells`로 같은 줄/칸의 폭·높이를 같게 만든다.
   - 병합 칸이 있거나 계산이 애매하면 아무것도 하지 않고 이유를 알린다.
   - 한 번의 실행 취소로 되돌아가야 한다.
2. **Phase 1A에서 구현이 어려우면 안전한 no-op으로 만든다.**
   - 셀 블록에서 `H`/`W`가 글자로 들어가지 않게 키를 소비한다.
   - 메뉴의 `H`/`W` 단축키 글자를 지우고, “아직 지원하지 않음”을 메뉴/도움말에 적는다.
   - `docs/tracking/findings.md`에 왜 지금 못 하는지 적는다.

어느 쪽이든 **“된다고 표시만 하고 안 되는” 상태를 남기지 않는다.**

### 1.3 표 개체 선택 상태의 한컴 키

표를 개체로 선택했을 때(테두리 클릭, `Esc` 등) 다음을 연결한다.

- `P` → 표/셀 속성. 기존 `format:object-properties` 또는 `table:cell-props`를 표 개체 선택 상태에서 실행.
- `T` → 표 뒤집기. `services.wasm.transposeTableCellsInPlace(sec, ppi, ci)`를 snapshot 안에서 호출하는 새 명령을 `hancom-keys.mjs`에 둔다.
- `L`/`C` → 표 테두리/배경. 기존 `table:border-each`/`table:border-one` 대화상자를 표 개체 선택 상태에서 연다.
- `Ctrl+E` → 표 지우기. 기존 `table:delete`를 실행한다. `Delete`도 지금처럼 동작해야 한다.
- `F5` → 표의 첫 셀 선택. 가능하면 커서를 첫 셀로 옮기고 셀 블록에 들어간다. 어려우면 Phase 1B로 미룬다.

`hancom-keys.mjs`에 표 개체 문맥 키 처리(`hancomTableObjectKey`)를 두고, 스튜디오 키 처리기에서 표 개체 선택 분기 전에 부른다. 표 개체 선택 상태에서 글자가 문서에 들어가지 않게 한다.

### 1.4 E2E 회귀 시험

`e2e/hwp-table.spec.ts`를 새로 만든다. 기존 `e2e/helpers.ts`의 `launchShell`을 쓰고, scratch userData로 앱을 띄운다.

시나리오:

1. 홈 → `AI HWP` 카드 → HWP 창 + studio frame.
2. `Table` 메뉴 → `Insert Table (Ctrl+N,T)` → 3×3 표.
3. `ieum-agent` 플러그인의 `listTables`/`readTable`로 표 구조 확인.
4. `A1`, `Tab`, `B1`, `Tab`, `C1` 입력.
5. 마지막 셀에서 `Tab` → 줄 3→4.
6. `Ctrl+Enter` → 줄 4→5, 표 밖으로 나가지 않음.
7. `Ctrl+Backspace` → 줄 5→4, 페이지 나누기/글자 지우기 아님.
8. `H`/`W` → 글자가 들어가지 않음. 구현했으면 크기가 같아짐.
9. `Ctrl+N,K` → `Table/Cell Properties` 대화상자.
10. 셀 안 `Ctrl+N,T` → 표 수가 늘지 않음(현재 엔진 한계).
11. 표 개체 선택에서 `P`/`T`/`L`/`C`/`Ctrl+E` 중 구현한 것.
12. 스크린샷은 `e2e/artifacts/hwp-table/`에 남긴다.

E2E는 production 빌드에서 `window.rhwpStudio.automation`과 `window.rhwpStudio.plugins`를 쓴다. `window.__wasm`은 DEV 전용이라 쓰지 않는다.

## 2. Phase 1B (다음 세션)

- `F7`/`F8`: 현재 칸/줄 전체 블록.
- `Alt+화살표`: 셀 단위 이동, 표 크기 고정 조절.
- `Ctrl+Tab`: 표 안에 탭 삽입(`InsertTabCommand`).
- `Shift+Esc`: 표 빠져나가기.
- `Ctrl+X`/`Ctrl+C`/`Ctrl+E`: F5 셀 블록 오려두기·복사·내용 지우기.
- 표 개체 `Shift+화살표` 크기, `Shift+PageUp/Down`·`Shift+Home/End` 순서.
- `F5` 첫 셀, `Shift+F5` 확장 선택.

## 3. Phase 2 (엔진 작업, 별도 세션)

- 표 칸 안에 표 만들기.
- 표 안의 표에 행/열 넣기·지우기.
- 표 안의 표 합치기/나누기.
- 필요하면 rhwp `@rhwp/core` WASM과 studio API를 함께 고친다. `vendor/rhwp-core` 패치 절차와 `tools/build-rhwp-core.mjs`를 따른다.
- 이 작업은 저장 결과와 조판을 바꿀 수 있으므로 한컴 2024 저장 왕복 검증이 필수다.

## 4. Phase 3 (확장 기능)

- H/W 실제 구현(1.2에서 못 한 경우).
- 계산식 필드(재계산) 또는 “값 고정”을 UI에 명확히 표시.
- 표마당/표 스타일, 표 정렬, 표 자동 채우기, 문자열↔표, 표에서 차트.
- 표 개체 순서/맞춤, 셀 붙이기 옵션.

## 5. 공통 규칙

- **이 저장소의 HWP 편집 동작은 rhwp를 넘지 못하는 경계가 아니다.** 편집기에 없는 동작은 `hancom-keys.mjs`의 명령/키 처리로 채운다. 엔진에 호출 자체가 없는 일만 엔진 작업으로 넘긴다.
- **문서를 바꾸는 모든 동작은 하나의 실행 취소 단계**여야 한다. `ih.executeOperation({ kind: 'snapshot', ... })` 또는 `host.transaction`을 쓴다.
- **저장 형식과 문서 식별자를 바꾸지 않는다.** `docs/standards.md`와 `docs/security.md`를 따른다.
- **HWP 편집기 소스는 빌드 때 받아 온 rhwp-studio v0.8.7이다.** 직접 소스를 저장소에 넣지 않고, `scripts/rhwp-patches.mjs`의 패치로만 고친다. 패치가 못 찾으면 빌드가 실패해야 한다.
- **메뉴에 보이는 단축키 글자와 실제 동작이 같아야 한다.** `hancom-keys.mjs`의 `LABELS`를 함께 고친다.
- **화면 문구를 더하면 21개 언어를 채운다.** HWP 편집기 안쪽은 rhwp의 한국어/영어만 맞춘다.
- **E2E는 production 빌드로 돈다.** `window.__wasm`에 기대지 말고 `automation`/`plugins`를 쓴다.
- **다른 에이전트의 체크아웃을 건드리지 않는다.** 이 작업은 `hwp-table-parity` worktree에서만 한다.

## 6. 검증 명령

```powershell
# 이 worktree에는 node_modules가 없다. 처음 한 번:
npm ci

# HWP 편집기 + 앱
npm run studio -w @genoffice/hwp
npm run test -w @genoffice/hwp
npm run typecheck -w @genoffice/hwp
npm run build -w @genoffice/hwp
npm run build -w @genoffice/shell

# 새 E2E
npx playwright test --config e2e/playwright.config.ts hwp-table.spec.ts --reporter=list
```

## 7. 받아들일 기준 (Phase 1A)

- [ ] 표 칸에서 `Ctrl+Enter`가 페이지 나누기가 아니라 **아래 줄 추가**를 한다.
- [ ] 표 칸에서 `Ctrl+Backspace`가 **현재 줄 지우기**를 한다.
- [ ] 표 밖에서 두 키의 기존 뜻이 유지된다.
- [ ] `H`/`W`가 셀에 글자를 넣지 않는다. 구현했으면 크기가 같아지고, 못 했으면 메뉴 라벨과 안내가 실제와 같다.
- [ ] 표 개체 선택에서 `P`/`T`/`L`/`C`/`Ctrl+E`가 글자를 넣지 않고 해당 동작을 한다(구현한 범위).
- [ ] 새 E2E `hwp-table.spec.ts`가 통과한다.
- [ ] `npm run test -w @genoffice/hwp`와 `typecheck`가 통과한다.
- [ ] HWP 저장 왕복 결과가 달라지지 않는다(기존 시험 통과).
- [ ] `docs/tracking/status.md`와 `apps/hwp/AGENTS.md`에 바뀐 동작과 남은 한계를 적는다.

## 8. 핸드오프 프롬프트

아래는 새 세션에 그대로 넘길 프롬프트다. 새 세션은 `E:\github\openoffice\.dryforge\worktrees\hwp-table-parity`에서 시작한다.

---

당신은 이음오피스의 HWP(한글) 표 편집을 한컴 한글 2024에 더 가깝게 만드는 작업을 맡는다. 작업 디렉터리는 `E:\github\openoffice\.dryforge\worktrees\hwp-table-parity`, 브랜치는 `feat/hwp-table-parity`이고 기준은 `origin/main`의 `cb1af81c`다. 먼저 `docs/plans/hwp-table-parity.md`를 끝까지 읽어라.

### 배경

- HWP 탭은 rhwp-studio v0.8.7을 편집 화면으로 쓰고, 이 저장소는 `apps/hwp/studio-plugin/hancom-keys.mjs`로 한컴 키를 얹는다.
- 2026-10-25 E2E에서 기본 표 만들기·입력·Tab·마지막 셀 Tab 줄 추가·Alt+Insert·Ctrl+N,K·S·F5는 동작했다.
- 그러나 Ctrl+Enter는 페이지 나누기로 갔고, Ctrl+Backspace는 줄을 지우지 않았고, H/W는 비활성인데 H가 셀에 글자로 들어갔고, 셀 안 Ctrl+N,T는 표 안의 표를 만들지 못했고, 표 개체 T/P/L/C/Ctrl+E와 F7/F8/Alt+화살표/Ctrl+Tab/Shift+Esc는 한컴과 다르다.

### 이번 작업(Phase 1A) — 엔진을 고치지 말 것

1. 표 칸 안에서 `Ctrl+Enter` → `table:insert-row-below`, `Ctrl+Backspace` → `table:delete-row`. 표 밖에서는 기존 뜻 유지. 한 번의 실행 취소.
2. H/W를 안전하게: 구현 가능하면 `resizeTableCells`로 같게 만들고, 불가능하면 키를 소비해 글자가 들어가지 않게 하고 메뉴의 H/W 라벨을 지우고 한계를 문서화한다.
3. 표 개체 선택에서 `P`(속성), `T`(뒤집기), `L`/`C`(테두리/배경), `Ctrl+E`(표 지우기)를 연결한다. `T`는 `transposeTableCellsInPlace`를 snapshot 안에서 호출한다.
4. `e2e/hwp-table.spec.ts`를 만들어 위 동작과 기존 동작(3×3 생성, 입력, Tab, 마지막 셀 Tab, Ctrl+N,K, 셀 안 Ctrl+N,T 금지)을 검증한다.
5. `apps/hwp/tests/hancom-keys.test.ts`에 단위 시험을 더한다.
6. `apps/hwp/AGENTS.md`, `docs/tracking/status.md`(필요하면 `findings.md`)를 갱신한다.

### 하지 말 것

- 표 안의 표 생성/행열 편집(엔진 작업, Phase 2).
- HWP 저장 형식·문서 식별자 변경.
- rhwp-studio 소스를 저장소에 직접 넣기. `scripts/rhwp-patches.mjs` 패치로만.
- 다른 worktree/브랜치(`dryforge/local-ai`, `main`) 건드리기.
- `window.__wasm`에 기대는 E2E. production에서는 `window.rhwpStudio.automation`과 `plugins`를 쓴다.

### 시작

```powershell
npm ci
npm run studio -w @genoffice/hwp
npm run test -w @genoffice/hwp
npm run typecheck -w @genoffice/hwp
```

표 관련 실제 엔진 동작은 `apps/hwp/tests/agent-plugin-tables.test.ts`와 `agent-plugin-delete-table.test.ts`를 참고하라. 키 처리의 기존 패턴은 `apps/hwp/studio-plugin/hancom-keys.mjs`의 `hancomContextKey`, `MAIN_PROCESS_KEYS`, `apps/hwp/scripts/rhwp-patches.mjs`의 `studio-hancom-chords`를 읽어라.

완료하면 바뀐 파일, 통과한 시험, E2E 결과, 남은 한계를 짧게 보고하라. Phase 1B/2는 이번에 하지 말고 다음 세션으로 넘겨라.
