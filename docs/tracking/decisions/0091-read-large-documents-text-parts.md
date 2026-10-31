# 0091 — 사진이 많아 큰 문서도 AI가 글을 읽는다

## 맥락

한 사용자가 프로젝트 폴더에서 강의 원고 PPT를 AI에게 읽혔더니 "파일이 너무 커서 바로 열리지 않았습니다"라는 답이 왔다. AI는 같은 원고의 PDF를 대신 읽었고, PPT에만 있는 장면은 읽지 못했다.

AI가 다른 파일을 읽는 길(첨부, 프로젝트 파일 읽기, 별표 자료, 만들기 창의 자료)은 모두 50MB(`ATTACHABLE_MAX_BYTES`, [0035](0035-attach-from-open-documents.md))를 넘는 파일을 열기 전에 거절했다. 상한을 둔 까닭은 파일 전체를 메모리에 올려 푸는 비용이었다. 그런데 사진이 많은 PPT·워드·한글(HWPX) 문서는 크기 대부분이 사진이고, 글은 몇 MB의 XML에 들어 있다. 글을 읽는 데는 사진이 필요 없다.

## 결정

- **zip으로 된 문서가 50MB를 넘으면 글이 든 파트만 디스크에서 읽는다.** `packages/file-parse`의 `readZipTextParts`가 zip의 목차(중앙 디렉터리)를 읽고, XML·관계·JSON·HTML·평문 파트만 압축된 채로 옮긴다. 사진·영상·글꼴·포함 개체 파트는 이름만 남기고 내용을 비운다. 결과는 작은 zip이고, 형식별 읽기와 zip 관문은 전과 같이 거친다. 50MB 이하 문서는 전처럼 통째로 읽는다(`WHOLE_ZIP_READ_MAX_BYTES`).
- **사진이 크기를 차지하는 형식에는 크기 상한을 두지 않는다.** pptx·docx·xlsx·xlsm·hwpx·odt·epub·xmind·pdf다. PDF는 글을 읽을 때 그림을 풀지 않는다. `attachableMaxBytes(확장자)`가 형식별 상한을 돌려주고, 일곱 편집기의 첨부 읽기, 셸의 별표 자료·프로젝트 파일 읽기, 만들기 창의 자료가 이것을 쓴다.
- **통째로 읽어야 하는 형식은 상한을 그대로 둔다.** 평문(txt·md·csv 등), 예전 바이너리 형식(hwp·doc·ppt·xls)은 50MB, 그림은 5MB다. hwp는 한글 엔진(WebAssembly)이 파일 전체를 받아야 한다.

## 버린 대안

- **상한을 올리기만 하기**: 300MB PPT를 통째로 올리면 시험 사용자 PC(8GB)에서 메모리가 모자랄 수 있고, 다음 큰 파일에서 같은 일이 생긴다. 같은 일을 싸게 하는 쪽을 골랐다.
- **모든 크기의 zip 문서를 글 파트만 읽기**: 지금 잘 읽히는 문서의 읽는 길까지 바뀐다. 거절되던 파일만 새 길로 보낸다.
- **사진 파트를 목록에서 빼기**: 관계 파일과 목록(manifest)이 없는 파트를 가리키게 되어 엔진에 따라 열기가 실패할 수 있다. 이름은 남기고 내용만 비운다.

## 결과

- 사진 15장(파트당 10MB)이 든 150MB PPT를 21ms에 읽었고, 메모리는 1MB 안쪽으로 늘었다.
- zip64 문서(4GB 이상, 파트 65,535개 이상)는 글 파트만 읽기를 하지 못하고 이유와 함께 거절된다.
- 50MB를 넘는 hwp(예전 한글 형식)는 여전히 읽지 못한다. OLE 안의 그림 스트림을 건너뛰고 엔진에 넘기는 길이 필요하다.
- 관련 코드: `packages/file-parse/src/zip-text-parts.ts`, `parse.ts`의 `readDocumentBytes`, `attachable.ts`의 `attachableMaxBytes`. 시험: `packages/file-parse/tests/large-documents.test.ts`(통째로 읽은 글과 글 파트만 읽은 글이 같은지, 사진이 든 HWPX 포함), `apps/shell/tests/knowledge-base-read.test.ts`, `apps/shell/tests/generate-materials.test.ts`.
