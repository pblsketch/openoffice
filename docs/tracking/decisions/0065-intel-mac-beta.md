# 0065 — Intel Mac용도 Apple Silicon과 같은 서명 없는 베타로 함께 낸다

## 맥락

0031은 Mac판을 Apple Silicon용으로만 냈다. Intel Mac까지 내면 확인할 것이 두 배가 된다는 이유였다. 그 뒤 Intel Mac 사용자들이 Intel용 설치 파일을 요청했다(2026-10-24, 0.12.4 준비 중).

Intel판을 묶는 장치는 원본에서 받은 그대로 저장소에 있다. 설치 파일 설정의 `GENOFFICE_MAC_X64`, 두 CPU를 담는 엑셀 처리 프로그램 빌드(`native:build:universal`), 두 CPU로 컴파일하는 글자 인식 도우미, 그리고 두 앱이 그 파일들을 나눠 쓰는지 확인하는 검사다. 원본 설정의 주석은 "Intel판은 회사 인증서로 서명해서만 낸다"고 적었지만, 이 저장소는 Mac판 어느 쪽에도 Apple 인증서를 쓰지 않는다(0031).

## 결정

- **대상.** Mac판은 Apple Silicon용과 Intel용 두 dmg로 낸다. 같은 Mac 빌드 기계(Apple Silicon)에서 한 번에 만들고 같은 릴리스에 올린다. 둘 다 macOS 12 이상이다.
- **서명과 업데이트.** Intel판도 0031과 같다. ad hoc 서명, 공증 없음, hardened runtime 끔, 스스로 업데이트하지 않고 새 버전을 알려 다운로드 페이지를 연다.
- **빌드.** `mac-build.yml`이 `GENOFFICE_MAC_X64=1`로 묶는다. 엑셀 처리 프로그램은 `native:build:universal`로 두 CPU를 담는다. 빌드는 두 앱 각각의 서명과, 들어 있는 프로그램이 그 앱의 CPU를 담는지 검사한다. 그리고 두 앱을 창 없이 띄워 Markdown·CSV 파일을 PDF로 내보낸다. Intel판은 Rosetta로 띄운다. 손으로 만드는 `dist:mac`은 지금처럼 Apple Silicon 하나다.
- **파일 이름.** dmg는 CPU를 이름에 적는다(`IeumOffice-<버전>-arm64.dmg`, `IeumOffice-<버전>-x64.dmg`). electron-builder는 x64 이름에서 CPU를 빼므로 `config.dmg.artifactName`으로 정한다. Apple Silicon dmg의 이름은 전과 같아 사이트와 README의 링크가 그대로 맞는다. zip은 기본 이름(Intel은 `IeumOffice-<버전>-mac.zip`)이고 `latest-mac.yml` 하나에 둘이 함께 적힌다.

## 택하지 않은 것

- **두 CPU를 담은 앱 하나(universal).** 받는 파일이 두 배로 커지고, 원본 설정이 두 앱으로 나누는 쪽에 맞춰져 있다.
- **Intel Mac 빌드 기계에서 따로 만든다.** GitHub의 Intel Mac 기계는 줄어드는 중이고, 두 앱이 나눠 쓰는 파일을 기계 둘에서 맞추는 일이 생긴다. Apple Silicon 기계 하나에서 만들고 Intel판은 Rosetta로 띄워 본다.
- **Intel판을 내지 않는다(0031 그대로).** 요청이 있고 장치가 이미 있어, 늘어나는 일은 빌드 검사와 사용자 보고를 받는 것 정도다.

## 결과

- Intel Mac 사용자도 릴리스 페이지에서 Intel용 dmg를 받는다. 처음 열 때의 경고와 허용 순서는 Apple Silicon판과 같다(README의 "Mac (베타)").
- 저장소 주인은 어느 Mac판도 직접 확인할 수 없다. Intel판은 빌드 기계의 Rosetta 실행이 실제 Intel CPU를 대신하는 확인이라, Intel Mac에서 무엇이 되는지는 사용자 보고로 `docs/tracking/status.md`에 남긴다.
- Mac 빌드는 앱 둘을 묶고 엑셀 처리 프로그램을 두 번 컴파일해 시간이 늘었다(제한 시간 90분).
- 시험 `apps/shell/tests/update-feed-config.test.ts`가 기본 설정은 Apple Silicon 하나이고, `GENOFFICE_MAC_X64=1`이면 두 CPU와 CPU 이름이 붙은 dmg가 나오는 것을 지킨다.
- 0031의 "대상"과 "택하지 않은 것"의 Intel 항목은 이 결정으로 바뀌었다.
