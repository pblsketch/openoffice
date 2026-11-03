# packages/drawio-model (`@genoffice/drawio-model`)

다이어그램 파일(`.drawio`·`.dio`·`.drawio.svg`·`.drawio.png`)을 읽고, 도형·선 읽기 표를 만들고, 연산을 검사해 기본 변경으로 바꾸고, 그 변경을 XML에 쓰는 순수 모듈이다. 원본 프로그램에서 온 것이 아니라 이 프로젝트가 만든 패키지다. Electron에 묶이지 않고, 편집기 화면·껍데기 앱·터미널 명령어·`packages/file-parse`가 같은 코드를 쓴다. 연산의 뜻은 **이 패키지에만** 있다(기획 8.2, 결정 "연산은 한 모듈로 검사하고 같은 기본 변경으로 바꾼다").

## 맡은 범위

- 형식과 꺼내기(`format.ts`): 형식은 파일 이름 끝으로 정한다(`detectDiagramFormat`, 대소문자 무시, `.drawio.svg`·`.drawio.png`는 두 겹 확장자만). `extractDiagramXml`은 `.drawio`/`.dio`의 UTF-8 글(BOM 기억), SVG 뿌리의 `content` 속성(그대로·URI 인코딩·base64 셋 다), PNG의 `tEXt`/`zTXt`/`iTXt` 덩이(열쇠말 `mxfile` 또는 예전 `mxGraphModel`, 보통 URI 인코딩)에서 draw.io XML을 꺼낸다. 열지 못하는 까닭은 여섯 가지다: `unsupported`(다이어그램 이름이 아님, `.vsdx`는 앱의 가져오기), `no_original`(원본이 들지 않은 SVG·PNG), `corrupt_image`(읽을 수 없는 PNG), `not_xml`(파일·쪽이 XML이나 UTF-8이 아님), `decompress_failed`(압축된 쪽·안에 든 원본을 풀 수 없음), `no_diagram`(`mxfile`/`mxGraphModel`이 없거나 쪽이 하나도 없음).
- 파일(`file.ts`): `openDiagram`·`parseDiagramXml`이 `DiagramFile`(형식, XML 글, BOM, 쪽 목록과 압축 여부, 상태)을 만든다. 쪽은 압축됐든 아니든 읽고, 빈 `<diagram/>`은 빈 쪽이다. 뿌리가 `mxGraphModel` 하나인 파일은 쪽 하나(`page-1`, `Page-1`)로 읽는다. id 없는 쪽은 `page-N`을 지어 부른다(파일에는 쓰지 않는다). `createDiagramFile`은 압축하지 않은 새 다이어그램이다.
- 압축(`codec.ts`): draw.io 압축 쪽 = `base64(rawDeflate(encodeURIComponent(xml)))`. deflate 자체는 `PageCodec`으로 받는다. Node에서는 `@genoffice/drawio-model/node`의 `nodePageCodec`(zlib), 화면에서는 draw.io가 이미 싣는 `pako`를 감싸 넘긴다.
- 쪽 모델(`model.ts`): `<root>` 아래의 `mxCell`과 그것을 감싼 `UserObject`/`object`(id와 라벨 `label`은 감싼 쪽에)를 `DiagramCell`로 읽는다. 편집기는 draw.io에서 쪽마다 `mxGraphModel` XML을 받아 `diagramStateFromPages`로 같은 상태를 만든다.
- 읽기 표(`table.ts`): 기획 8.1의 `pages`·`page`(shapes, edges, 앱에서만 selected). 라벨은 글자만(HTML 태그를 벗기고 `<br>`·문단 끝은 `\n`, 엔티티 풀기). `shape`는 스타일의 `shape=` 값, 없으면 앞의 낱말, 그것도 없으면 `rectangle`(`rounded=1`이면 `rounded`). `cylinder3`→`cylinder`, `umlActor`→`actor`로 연산 이름에 맞춘다. 낱말 `group`은 `group`, `container=1`·`swimlane`·`table`은 `container`. x·y는 저장된 값 그대로라 `parent`가 있으면 그 도형 기준이다. 선에 딸린 라벨 도형(부모가 선인 도형)은 도형 목록에 넣지 않고 그 선의 라벨에 줄을 바꿔 붙인다. 글 표는 한 요소 한 줄(`|` 구분, 라벨의 줄바꿈은 `\n`, 80자에서 자름)이다(`formatDiagramRead`, 모든 쪽은 `formatDiagramText`).
- 연산 정의(`ops.ts`): `DIAGRAM_OPS`가 연산마다 이름·설명·입력 스키마(JSON Schema 꼴)·`changes`·`needsApp`를 담은 자료다. AI 도구·MCP 도구·`guide diagram`은 이것에서 만든다. `checkOpInput`이 같은 스키마로 형(유한한 수, 문자열, 문자열 목록), 필수 키, 고르는 값, 모르는 키를 검사한다.
- 계획(`plan.ts`): `planDiagramOps(state, ops, options)`가 연산을 차례로 검사하고 기본 변경(`DiagramPrimitive`: `add_cell`, `update_cell`, `remove_cells`, `add_page`, `rename_page`, `remove_page`)으로 바꾼다. 뒤 연산은 앞 연산의 결과를 본다. 기본 변경의 값은 최종 값(합친 스타일, 이스케이프한 HTML 라벨, 지울 id 전부)이라 앱과 터미널은 판단 없이 적용만 한다. `applyPrimitives`는 같은 변경을 상태에 적용한다.
- 쓰기(`write.ts`): `writeDiagramPrimitives`가 기본 변경을 `.drawio`/`.dio` XML에 쓰고, `applyDiagramOpsToFile`이 계획과 쓰기를 묶는다(터미널의 `diagram apply`).

## 맡지 않는 것 (경계)

- draw.io 모델에 기본 변경을 넣는 일, 되돌리기 한 묶음, Mermaid 변환, `.drawio.svg`·`.drawio.png` 쓰기는 편집기가 한다. 여기서 `.drawio.svg`·`.drawio.png`의 쓰기는 `needs_app`이다.
- 파일을 디스크에 쓰는 일, `--force` 같은 덮어쓰기 규칙, 출력 형식(`--json`, 종료 코드)은 `packages/cli`가 한다.
- 첨부·색인에서 글로 읽는 일은 `packages/file-parse`가 이 패키지를 불러 한다.

## 항상 지켜야 하는 것

- **고치지 않은 쪽은 바이트 그대로다.** 쓰기는 XML을 다시 읽어, 바뀐 것만 다시 만든다. 손대지 않은 `<diagram>` 요소, `mxfile` 시작 태그와 그 밖의 글은 원래 글을 그대로 옮긴다. 이름만 바꾼 쪽은 시작 태그만, 모델이 바뀐 쪽은 원래 모양(압축이면 압축)으로 다시 쓴다. 바뀐 압축하지 않은 쪽 안에서도 손대지 않은 셀은 원래 글 그대로다. 새 쪽은 파일이 압축 형식(`mxfile compressed="true"`이거나 모든 쪽이 압축)이면 압축하고, 아니면 압축하지 않는다. 뿌리가 `mxGraphModel`뿐인 파일은 쪽을 더하거나 이름을 바꾸거나 지울 때만 `mxfile`로 감싼다.
- **읽기만 한 묶음은 쓰지 않는다.** 기본 변경이 없으면 `changed: false`, `applyDiagramOpsToFile`의 `write.status`는 `unchanged`다.
- **같은 연산은 같은 결과다.** 새 id는 파일 전체(모든 쪽의 쪽 id·셀 id)와 그 묶음에서 쓴 id를 피해 차례로 짓는다: 도형 `s1, s2, …`, 선 `e1, …`, 쪽 `page-1, …`. 주어진 id가 이미 있으면 거절한다. 무작위 값을 쓰지 않는다.
- **거절 이유.** 없는 id·쪽은 `target_not_found`, 잘못된 값은 `invalid_argument`, 모르는 연산은 `unknown_op`. 마지막 남은 쪽 지우기, 같은 이름의 쪽이 여럿인 이름 참조, 쪽의 뿌리·층 셀을 고치거나 지우기, 선에 위치·크기 주기, 바꿀 것이 없는 `update`, `=` 없는 스타일 조각은 모두 `invalid_argument`다. `insert_mermaid`는 검사만 하고, 앱이 변환기(`options.mermaid`)를 주지 않으면 `needs_app`이다. 변환기의 실패는 그 까닭 그대로 돌려준다.
- **묶음 규칙.** 기본(`all-or-nothing`, 앱은 항상 이것)은 하나라도 거절되면 기본 변경 없이 `rejected`이고, 그래도 모든 연산의 결과를 끝까지 알린다. `best-effort`는 거절된 연산만 빼고, `stop-on-error`는 처음 거절 앞까지 남기고 나머지를 `skipped`로 둔다. 일부만 남으면 `partial`, 남은 변경이 없으면 `rejected`다.
- **`page`가 없을 때.** `defaultPage`(터미널의 `--page`), 없으면 `currentPage`(앱의 지금 쪽), 없으면 첫 쪽이다. `currentPage`는 읽기 결과에 `current: true`로, `selected`는 지금 쪽을 읽을 때만 나온다.
- **라벨은 글자다.** 결과 스타일이 `html=1`이면 이스케이프하고 줄바꿈을 `<br>`로 넣고, 아니면 글자 그대로 넣는다. 새 도형·선의 기본 스타일은 `html=1`이다.
- **`src/`에서 Node 내장 모듈, `Buffer`, `require`를 쓰지 않는다.** 예외는 `node-codec.ts` 하나이고 `./node`로만 내보낸다. `tests/browser-safety.test.ts`가 지킨다.

## 테스트

- 실행: `npm run test -w @genoffice/drawio-model`, `npm run typecheck -w @genoffice/drawio-model`.
- 시험 파일 `tests/fixtures/`는 draw.io v32.6.9 시험 도구가 이 프로젝트의 `sample.drawio`로 써낸 것이다(`out.drawio` 압축 없음, `out.drawio.svg` 압축된 쪽, `out.drawio.png` `tEXt` 덩이). 나머지는 테스트 코드가 그때그때 만든다.
- 바꾸면 반드시 테스트하는 것: 세 형식에서 꺼내기와 열지 못하는 까닭(`format.test.ts`), 읽기 표와 글 표(`table.test.ts`), 모든 연산과 거절 이유·id 짓기·묶음 규칙(`plan.test.ts`), 압축 쪽 왕복·고치지 않은 쪽의 바이트 보존·쓴 파일을 다시 연 상태가 계획한 상태와 같은 것(`write.test.ts`).
- 우리가 쓴 파일이 실제 draw.io에서 열리는지는 자동 테스트로 확인하지 못한다. 실제 프로그램에 올려 확인한다.
