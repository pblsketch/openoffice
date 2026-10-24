---
name: release-ieumoffice
description: IeumOffice의 새 버전을 내는 작업(버전 올리기, Windows 설치 파일, GitHub 릴리스와 latest.yml, 베타 채널 예행, Mac 빌드)과 앱의 업데이트 창에 그대로 보이는 릴리스 본문 작성·윤문을 맡을 때 읽는다. Use when cutting a release, shipping a version, publishing an installer, writing or polishing release notes, or rehearsing an update on the beta channel.
---

# 릴리스 작업

## 정본은 문서다

- `docs/releasing.ko.md`를 처음부터 끝까지 읽는다. 명령, 파일 이름, 순서, 확인 항목은 그 문서가 정한다.
- 이 스킬은 그 문서에 없는 **판단 기준·금지·승인 절차**만 더한다. 문서와 어긋나면 문서를 따른다. 문서가 바뀌면 이 스킬도 고친다.
- 배경: `docs/plans/update-details.md`, 결정 `docs/tracking/decisions/0044-update-notes-in-the-window.md`.

## 사람의 승인 없이는 진행하지 않는다

1. Anthropic 상업 약관 동의 확인(releasing.ko.md 1번). 확인 전에는 아무것도 만들지 않는다.
2. 이번 버전 번호와 공개 방식 — 프리릴리스 예행인지 정식 공개인지. Windows 설치 파일은 Actions의 **Windows build**로 만들어 출처 증명을 붙이는 것이 기본이다(결정 0056). 손 빌드로 바꾸려면 그 이유와 함께 묻는다.
3. **GitHub에서 "Publish release"를 누르기 전.**
4. **예행 릴리스의 프리릴리스 표시를 풀기 전** — 그 순간 모든 사용자에게 나간다.
5. 게시할 릴리스 본문 최종본.
6. **소개 사이트 저장소(`ieumoffice-site`)에 push하기 전** — push가 곧 공개다. 바뀐 글과 캡처를 먼저 보여 준다.

## 릴리스 본문 — 사용자가 앱 안에서 읽는 글

설치된 앱의 업데이트 창에 본문이 그대로 보인다. GitHub 웹페이지 전용 글이 아니고, 앱은 본문을 번역하지 않는다.

- 순서: 첫 문단에 **한두 줄 요약** → `## 새로 들어간 것` → `## 고친 것` → (선택) `## 알려진 한계` → **맨 아래 `## 설치`**.
- 사용자가 체감하는 변화만 쓴다. 내부 리팩터·테스트·의존성 갱신은 동작이 바뀐 경우에만 한 줄. 과장과 약속은 쓰지 않는다.
- **초안을 쓴 뒤 humanize-korean 스킬로 윤문한다.** AI 티와 번역투를 걷어낸다. 윤문 전 본문으로 게시하지 않는다.
- 한 화면에 핵심이 보이게 쓴다. 창의 내용 상자는 200px에서 스크롤되고, 상한은 원문 256KB·표시 48,000자·12섹션이다.
- 한국어로 쓴다.
- `## 설치`에는 그 릴리스에 올리는 플랫폼을 모두 적는다. 지금은 Windows, Mac(베타, Apple Silicon·Intel 두 dmg), Linux(베타) 셋이다. 도름스 업데이트 소식이나 사이트처럼 본문을 옮겨 쓰는 곳도 같다.

본문 골격:

```markdown
한두 줄 요약.

## 새로 들어간 것

- …

## 고친 것

- …

## 알려진 한계

- …

## 설치

- Windows: …
- Mac (베타): … (Apple Silicon은 `-arm64.dmg`, Intel은 `-x64.dmg`)
- Linux (베타): … (AppImage·deb·rpm, README의 "Linux (베타)")
```

## 릴리스 전에 확인하는 것

- 합치기 전 검사는 `docs/standards.md`의 목록을 따른다.
- 개발 미리보기: `GENOFFICE_FAKE_UPDATE=9.9.9 npm run dev`로 업데이트 창을 띄운다. 내용 상자, 스크롤, 두 섹션일 때 `vX.Y.Z` 머리글, "GitHub에서 전체 보기"를 본다.
- 베타 예행(releasing.ko.md 8번)에서 설치본으로 확인한다.
  - 새 버전 번호와 바뀐 점이 함께 보이는가
  - 본문이 스크롤되고 글자가 선택되는가
  - 건너뛴 버전이 있으면 버전 머리글이 붙는가
  - `<p>` 같은 HTML 찌꺼기나 깨진 목록이 없는가
  - "지금 업데이트" → 진행률 → "다시 시작 및 설치"가 끝까지 되는가
  - Mac은 "다운로드 페이지 열기"가 릴리스 페이지를 여는가

## 하지 않는 것

- 확인 없이 Publish하거나 프리릴리스 표시를 풀지 않는다.
- 태그·파일 이름을 바꾸거나 낮은 번호로 되돌리지 않는다. 문제가 있으면 번호를 하나 더 올린다(releasing.ko.md 10번).
- 설치 파일과 `latest.yml`을 다른 빌드에서 섞지 않는다.
- 구독 로그인 파일을 읽거나 만지지 않는다(AGENTS.md의 절대 규칙).
- 릴리스 본문에 내부 이슈 번호만 나열하지 않는다.

## 마무리 — 정식 공개 뒤 빠뜨리지 않는 것

- **소개 사이트에 업데이트 소식을 올린다(releasing.ko.md 13번).** 내려받기 버튼은 저절로 새 버전을 가리키지만, 업데이트 페이지(`/updates`)의 새 항목과 메인의 한 줄 안내는 손으로 더한다. 사이트 저장소 `README.md`의 "새 버전을 낸 뒤"를 따른다. 내용은 윤문한 릴리스 본문의 "새로 들어간 것"에서 체감이 큰 것만 고르고, 문구는 humanizer로 검토해 추상적인 말과 전문 용어를 쉬운 말로 바꾼다.
- **사이트의 질문 도우미가 새 버전을 따라갔는지 확인한다(releasing.ko.md 13번의 8).** 지식베이스는 사이트 저장소의 Actions "Question helper knowledge base"가 새 릴리스 태그로 다시 만들어 커밋한다. 그 실행이 초록이고 `lib/kb-data.js` 첫 줄 버전이 새 태그면 끝이다. 실패하면 ✗ 줄을 읽고 고친 뒤 Run workflow로 다시 돌린다.
- 릴리스 뒤 달라진 기준 버전과 확인한 내용을 저장소 주인과 함께 `docs/tracking/status.md`에 반영한다.
- 병합이 끝난 기능 가지와 작업 폴더를 정리한다. 메인 폴더 node_modules에 링크된 작업 폴더는 링크부터 끊고 지운다.
