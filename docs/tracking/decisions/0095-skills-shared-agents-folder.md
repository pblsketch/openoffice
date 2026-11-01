# 0095 스킬은 공용 폴더 `~/.agents`에 설치하고, 도구 폴더에 남은 예전 사본은 지우지 않고 계속 맞춘다

## 맥락

설정 → 연동과 `ieumoffice skill install`은 `ieumoffice` 스킬을 도구마다 그 도구의 폴더에 복사했다(`~/.claude/skills`, `~/.codex/skills`, `~/.cursor/skills`, `~/.gemini/skills`, `~/.copilot/skills`, `~/.config/opencode/skills`, `~/.codeium/windsurf/skills`).

2026-11-01에 각 도구의 공식 문서를 다시 확인했다.

- Codex: 사용자 스킬은 `$HOME/.agents/skills`에서만 읽는다. 문서에 `~/.codex/skills`는 없다. 지금 Codex는 우리가 쓰던 자리를 읽지 않을 가능성이 높다.
- Cursor: `~/.agents/skills`와 `~/.cursor/skills`를 읽는다.
- Gemini CLI: `~/.gemini/skills`와 그 별칭 `~/.agents/skills`를 같은 단계로 읽고, 이름이 겹치면 별칭이 이긴다.
- GitHub Copilot CLI: `~/.copilot/skills`와 `~/.agents/skills`를 읽는다.
- OpenCode: `~/.config/opencode/skills`에 더해 호환을 위해 `~/.claude/skills`, `~/.agents/skills`도 읽는다.
- Claude Code는 `~/.claude/skills`만, Windsurf는 `.agents` 자리를 문서에 적지 않았다.

원본도 같은 문제를 고쳤다(genoffice#2281, #2289). 다섯 도구를 공용 줄 하나로 묶고, 도구 폴더에 남은 예전 사본은 바이트가 그대로면 자동으로 지운다.

## 결정

- 공용 줄(`agents`, "공용 폴더(~/.agents): Codex, Cursor, Gemini CLI, Copilot, OpenCode")을 더한다. `~/.agents/skills/ieumoffice/SKILL.md`에 쓴다. `~/.agents`가 있거나 다섯 도구 중 하나의 폴더가 있으면 보인다(`CODEX_HOME`, `XDG_CONFIG_HOME`를 따른다).
- Claude Code와 Windsurf 줄은 그대로다.
- Codex, Cursor, Gemini CLI, Copilot, OpenCode는 자기 폴더에 새로 설치하지 않는다. 공용 줄이 이 도구들을 맡는다.
- 이 앱이 예전에 그 다섯 도구의 폴더에 쓴 사본(설치 장부에 있고 폴더가 남아 있는 것)은 남긴다.
  - 설정 → 연동에 공용 줄 아래 들여 쓴 줄로 나오고, "이제 공용 폴더가 이 도구에 스킬을 준다. 공용 폴더에 설치한 뒤에는 이 사본을 지워도 된다"는 안내가 붙는다(21개 언어). 업데이트와 제거 단추는 전처럼 있다.
  - 공용 줄을 설치·업데이트하면, 손대지 않은 채 버전만 뒤처진 예전 사본도 함께 새 버전으로 쓴다. 확인 줄에 그 경로를 먼저 보인다. 손으로 고친 사본은 그 줄의 단추를 따로 눌러야 바뀐다.
  - 명령어도 같다. `skill install agents`와 `all`은 예전 사본을 함께 맞추고, 고친 사본은 경고(`legacy_copy_left`)와 함께 두며 `--force`일 때만 덮어쓴다.
  - 어떤 경로로도 자동으로 지우지 않는다. 지우는 것은 사람이 그 줄의 제거 단추를 누르거나 `ieumoffice skill remove <도구>`를 실행할 때뿐이다. 이 명령은 이번에 더했다. 다섯 도구의 이름은 그 도구 자기 폴더의 예전 사본을 가리키고(`skill remove codex`는 `~/.codex/skills/ieumoffice`), 공용 사본은 `skill remove agents`로 지운다. 이 앱이 쓰지 않은 파일은 지우지 않는다.
- 장부에 없는 사본(다른 설치 프로그램, `npx skills add`, 손으로 넣은 것)은 다섯 도구의 폴더에 있어도 목록에 올리지 않고 건드리지 않는다.
- 명령어 약속: `ieumoffice skill install codex|cursor|gemini|copilot|opencode`는 계속 받는다. 그 도구가 이 PC에 있는지(없으면 `--force`)를 보고 공용 줄에 쓰며, 그 도구의 예전 사본이 있으면 함께 맞춘다. `skill install agents`도 받는다. `skill list`는 Claude Code·공용·Windsurf 줄과 예전 사본 줄을 낸다. 출력의 기존 필드는 그대로이고, 줄마다 `legacy`(예전 사본인지)만 더한다.
- `ieumoffice mcp`의 도구 찾기는 스킬 줄과 상관없이 각 도구의 자기 폴더로 한다(`agentPresent`, `agentLabel`).

## 버린 대안

- **원본처럼 예전 사본을 자동으로 지우기**: 바이트가 그대로인 것만 지운다 해도, 사람이 모르는 사이에 파일이 사라진다. 이 앱은 "모든 쓰기는 사람의 클릭이나 명시한 명령으로만"을 지켜 왔고, 지우기는 쓰기보다 되돌리기 어렵다. Codex처럼 이제 그 폴더를 읽지 않는 도구도, 예전 버전의 도구를 쓰는 사람에게는 그 사본이 유일한 스킬일 수 있다.
- **예전 사본을 목록에서 감추고 그대로 두기**: 아무도 다시 맞추지 않아 낡는다. Cursor·Copilot·OpenCode처럼 두 자리를 모두 읽는 도구는 같은 이름의 서로 다른 버전을 보게 되고, Gemini CLI는 별칭이 이기므로 다행히 새것을 쓰지만 다른 도구는 어느 쪽을 쓸지 문서에 없다.
- **도구별 줄을 그대로 두고 공용 줄만 더하기**: 한 사람이 같은 스킬을 여러 번 설치하게 되고, 위와 같은 겹침이 처음부터 생긴다. Codex 줄은 읽히지 않는 자리에 계속 쓰게 된다.
- **공용 줄 없이 Codex만 `~/.agents`로 옮기기**: 다섯 도구가 같은 폴더를 읽는다는 사실을 버리고, 같은 파일을 여러 번 쓰는 줄이 남는다.

## 결과

- 새 설치는 Claude Code, 공용 폴더, Windsurf 세 곳 중에서 고른다. 다섯 도구는 공용 폴더 하나로 스킬을 받는다.
- 예전에 `~/.codex/skills`(등)에 설치한 사람은 설정 → 연동에서 공용 줄이 새로 보이고("설치" 단추), 그 아래에 예전 사본 줄이 안내와 함께 남는다. 공용 줄을 설치하면 예전 사본도 같은 버전이 된다. 지울지는 그 사람이 정한다.
- `~/.agents/skills`는 앱 안 사용자 스킬의 `codex` 출처이기도 하다. 이름 `ieumoffice`는 어느 출처에서도 읽지 않으므로(결정 0048) 설치한 스킬이 앱 안 스킬 목록에 나오지 않는다. 시험이 지킨다(`packages/ai-provider/tests/user-skills-sources.test.ts`). 앱이 띄우는 Codex는 사용자 스킬 목록을 지시문에 넣지 않으므로(`skills.include_instructions=false`) 앱 안 대화에도 섞이지 않는다.
- 스킬 문서의 `skill` 명령 줄에 `skill remove`와 공용 폴더를 적고 `metadata.version`을 2.73.4로 올렸다. 스킬이 요구하는 명령어 최소 버전(`cli`)은 그대로 두었다.
- 실제 도구(Codex, Cursor, Gemini CLI, Copilot CLI, OpenCode)가 공용 폴더의 스킬을 읽는지는 사람이 확인한다.
