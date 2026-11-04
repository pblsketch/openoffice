# vendor/drawio — 다이어그램 편집기가 싣는 draw.io

다이어그램 편집기(`apps/diagram`)는 draw.io(jgraph/drawio, Apache-2.0)의 웹 편집기를 그대로 띄운다. 이 폴더에는 draw.io의 파일을 두지 않는다. 판, 내려받을 주소, SHA-256, 뺄 목록, 승인된 잘라내기 하나, 싣는 부품의 라이선스 목록만 둔다(`docs/plans/diagram-editor.md` 5절, 결정 0103 `docs/tracking/decisions/0103-diagram-editor.md`).

| 파일             | 내용                                                                                                                                                            |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `drawio.json`    | 판(`version`), 릴리스 자산 `draw.war`의 주소·SHA-256·크기, 뺄 목록(`remove`, 경로 패턴), 잘라내기(`cut`)와 그 결과의 SHA-256                                    |
| `inventory.json` | 싣는 파일 안의 부품마다 이름·판·라이선스(SPDX)·저작권·들어 있는 파일. 두 라이선스 중 고른 것은 `offered`에 원래 식을 함께 적는다                                |
| `LICENSE`        | draw.io 저장소 `v32.6.9` 태그의 `LICENSE`(Apache-2.0) 원문                                                                                                      |
| `bundle.mjs`     | 내려받기·해시 확인·캐시, 뺄 목록 적용, 잘라내기, 라이선스 목록 검사의 함수들                                                                                    |
| `prepare.mjs`    | 빌드 단계. 정리한 파일을 `apps/diagram/out/drawio/`에 놓는다                                                                                                    |
| `.cache/`        | 내려받은 `draw.war`(`.cache/<판>/draw.war`). git에 넣지 않는다. 이 저장소의 작업 사본은 `node_modules/.cache`가 다른 사본으로 이어진 연결일 수 있어 여기에 둔다 |

## 빌드에서 하는 일

`npm run build -w @genoffice/diagram`(그리고 `dev`, `dev:renderer`)가 `node ../../vendor/drawio/prepare.mjs`를 부른다.

1. `.cache/<판>/draw.war`가 있으면 그 해시를 확인한다. 없으면 `drawio.json`의 주소에서 받아 해시를 확인한 뒤 캐시에 둔다. 해시가 다르면 빌드가 실패하고 캐시에 아무것도 남기지 않는다. 캐시가 있으면 다시 받지 않는다(캐시 파일의 해시가 틀리면 실패하고, 그 파일을 지우라고 알린다).
2. 뺄 목록에 걸리는 파일을 빼고 나머지를 `apps/diagram/out/drawio/`에 그대로(바이트 그대로) 푼다.
3. `js/extensions.min.js`만 예외다. 아래 "잘라내기"를 본다.
4. 같은 판·같은 설정으로 이미 만든 결과가 있으면(`apps/diagram/out/drawio.stamp.json`) 아무것도 하지 않는다.

다른 코드는 다이어그램 모듈의 빌드 결과 폴더 아래 `drawio/`에서 찾는다. 개발 실행에서는 `apps/diagram/out/drawio/`, 설치본에서는 `resources/modules/diagram/drawio/`다(`apps/shell/electron-builder.cjs`가 `apps/diagram/out`을 `modules/diagram`으로 싣는다. 도장 파일은 싣지 않는다). 셸이 다른 모듈처럼 `DIAGRAM_OUT`을 정하면 `join(DIAGRAM_OUT, 'drawio')`다.

## 잘라내기 (단 하나 승인된 예외)

draw.io는 `js/extensions.min.js`를 시작할 때 읽는다. 이 파일은 여러 파일을 이어 붙인 묶음이고, 그 안에 ELK(`js/elk/drawio-elk.min.js`, EPL-2.0)와 libavoid(`js/libavoid-js/libavoid.min.js`, `js/libavoid-js/libavoid-routing.js`, LGPL-2.1)가 바이트 그대로 들어 있다. 파일을 통째로 빼면 편집기가 열리지 않고 Mermaid 변환과 Visio 가져오기도 멈춘다.

그래서 이 파일만, 같은 릴리스의 세 파일 내용을 그 안에서 찾아(각각 정확히 한 번 나와야 한다) 그 바이트 구간만 들어낸 사본을 싣는다. 나머지 바이트는 그대로이고, 결과의 SHA-256을 `drawio.json`에 고정해 둔다. 세 파일 중 하나라도 찾지 못하거나 두 번 나오거나 결과 해시가 다르면 빌드가 실패한다. 저장소 주인이 승인한 예외이고(2026-11-03), 어떤 구간을 어떻게 뺐는지는 `THIRD-PARTY-NOTICES.txt`의 draw.io 절에 적힌다. ELK가 없으면 draw.io의 Mermaid 변환은 dagre 배치로 돈다.

## 뺀 것과 그 까닭

- 허용 목록(`tools/license-allowlist.mjs`) 밖: PlantUML 변환기(`js/plantuml`), libavoid(`js/libavoid-js`), ELK(`js/elk`), Glyphicons 공유 아이콘(`images/glyphicons_*.png`, CC BY 3.0).
- 쓰지 않는 것: 개발용 원본(`js/diagramly`, `js/grapheditor`), 서버용(`WEB-INF`, `META-INF`), 쓰지 않는 묶음(`js/integrate.min.js`, `js/viewer.min.js`), 클라우드 연결 화면(`connect`, `teams.html`, `onedrive3.html`, `js/onedrive`), 서비스 워커(`service-worker*`, `workbox-*`), 따로 떨어진 Base64 도우미(`js/deflate/base64.js`, 개발 실행에서만 읽는다).
- `js/deflate/base64.js`의 코드는 webtoolkit.info의 예제를 바탕으로 했고, 같은 코드가 `js/app.min.js`·`js/viewer-static.min.js`에도 들어 있다. 그 파일들은 draw.io의 것(머리말이 JGraph 저작권)으로 분류하고, 고지에 출처를 밝힌다.

## 검사

`npm run licenses`가 `tools/check-drawio-bundle.mjs`도 돌린다. 고정한 릴리스를 열어(필요하면 한 번 내려받는다) 다음이면 실패한다.

- 뺄 목록의 파일이 실린다.
- 싣는 파일 가운데 `inventory.json`의 어느 부품에도 들지 않는 것이 있다.
- 부품의 라이선스가 허용 목록 밖이거나, 두 라이선스 중 고른 것이 원래 식에 없다.
- `inventory.json`이나 뺄 목록의 패턴이 아무 파일에도 걸리지 않는다(판을 올린 뒤 남은 항목).
- `apps/diagram/out/drawio/`가 있으면, 그 안의 파일이 싣는 파일과 정확히 같고 바이트도 같다.

도형·아이콘 모음(`img/`, `shapes/`, `stencils/`)은 draw.io의 Apache-2.0에 Atlassian 제품 관련 사용 제한 글이 붙은 것으로 분류해 싣는다. 그 제한은 이 앱과 사용자가 만든 그림에 걸리지 않는다. 제한 글은 고지에 각 폴더의 `LICENSE`에서 원문 그대로 옮긴다. 템플릿(`templates/`)은 CC BY 4.0이고, 라이선스 전문을 `templates/LICENSE`에서 옮긴다.

## 판 올리기

1. `drawio.json`의 `version`, `url`을 새 판으로 바꾸고, 새 `draw.war`를 받아 `sha256`·`size`를 적는다.
2. `node vendor/drawio/prepare.mjs`를 돌린다. 잘라내기가 실패하면 새 `js/extensions.min.js`가 세 파일을 어떻게 담는지 보고 `cut`을 고친다. 결과 해시가 다르다고 나오면, 바뀐 것을 확인한 뒤 알려 준 실제 값을 `cut[].sha256`에 적는다.
3. `npm run licenses`를 돌려 나오는 항목마다 `inventory.json`이나 `remove`를 고친다. 새 부품은 라이선스를 직접 확인해 적는다. 허용 목록 밖이면 빼고, 빼서 편집의 핵심(열기·고치기·저장·내보내기·Mermaid)이 깨지면 멈추고 저장소 주인에게 묻는다.
4. `LICENSE`를 새 태그의 것으로 바꾸고 `npm run notices`의 draw.io 절을 확인한다.
