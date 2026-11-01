# 0096 구독 모델의 생각 깊이를 고른다

## 맥락

모델 선택기에서 모델은 고를 수 있지만 생각 깊이(Effort)는 고를 수 없었다. 2026-11-01 사용자 요청이다. 두 구독 프로그램 모두 단계를 받는다. Claude Code 2.1.287은 `--effort low|medium|high|xhigh|max`를 받고, 시작 응답의 모델마다 `supportsEffort`와 `supportedEffortLevels`를 준다(모델이 받지 않는 단계는 받는 단계로 낮춘다). Codex 0.159는 `turn/start`의 `effort`를 받고, `model/list`의 모델마다 `supportedReasoningEfforts`와 `defaultReasoningEffort`를 준다. `turn/start`의 단계는 그 차례와 그 뒤 차례에 적용된다.

앱은 Claude를 `--setting-sources ""`로 띄우므로 사용자가 Claude Code 설정에 정한 단계는 지금도 쓰이지 않는다. Codex는 사용자의 `config.toml`에 `model_reasoning_effort`가 있으면 그 값을 쓴다.

## 결정

- **단계는 구독 제공자마다 하나를 저장한다.** `providers.<id>.effort`이고, 없으면 프로그램의 기본이다. 단계 목록은 `none`, `minimal`, `low`, `medium`, `high`, `xhigh`, `max` 일곱이고, 다른 값은 저장할 때 지운다.
- **화면은 프로그램이 알려 준 단계만 보인다.** 모델 선택기의 목록 아래에 "생각 깊이" 줄을 두고, 지금 답할 모델의 단계와 "기본"을 보인다. 프로그램이 그 모델에 단계를 알려 주지 않으면 줄이 없다. 다른 모델을 고를 때 그 모델이 받지 않는 단계는 지운다.
- **실행은 다시 거른다.** Claude 명령줄에는 고정 목록의 다섯 단어만 오른다. 그 밖의 값은 `--effort` 없이 띄운다. Codex에는 그 모델이 목록에서 받는다고 한 값만 차례에 넘기고, 그 확인에 쓰는 목록은 기본 모델을 고를 때 읽는 목록과 같이 프로세스마다 한 번 읽는다. 단계가 설정되지 않으면 목록을 따로 읽지 않는다. 목록을 읽지 못하면 단계 없이 돈다.
- **Codex는 단계가 바뀌면 새 스레드를 연다.** 같은 스레드에서 단계를 "기본"으로 되돌릴 방법이 없다(넘기지 않으면 앞 차례의 단계가 남는다).
- **에이전트 모드도 같은 값을 쓴다.** Claude 세션은 `--effort`, Codex 세션은 차례마다 `effort`를 넘긴다.

## 택하지 않은 것

- **모델마다 단계를 저장하기.** 모델을 바꿀 때마다 단계가 따라 바뀌어 무엇이 걸려 있는지 알기 어렵다. 제공자마다 하나를 두고, 받지 않는 모델로 바꿀 때만 지운다.
- **앱이 단계 목록을 고정해 늘 보이기.** 모델마다 받는 단계가 다르고(예: `max`는 일부 모델만), 받지 않는 값을 Codex에 넘기면 차례가 실패할 수 있다. 프로그램이 알려 주는 대로 보인다.
- **Codex 스레드 설정(`config.model_reasoning_effort`)으로 넘기기.** 사용자 `config.toml`과 겹치고, 모델이 받는지 확인할 자리가 없다. 차례의 `effort`가 공식 경로다.
- **키 제공자와 ChatGPT 직접 연결까지 한 번에.** 회사마다 요청 필드(`reasoning_effort`, `output_config.effort`, `thinkingConfig`)와 모델별 지원이 다르고, 목록이 단계를 알려 주지 않는다. 이번에는 구독 프로그램만 한다.
- **설정 화면에 같은 칸을 두기.** 단계는 모델과 함께 고르는 것이라 모델 선택기 한 곳에 둔다.

## 결과

- `packages/ai-provider/src/effort.ts`가 단계 목록과 검사를 맡는다. Claude 브리지는 `claudeCodeCliLaunchArgs(model, schema, effort)`와 `claudeAgentLaunchArgs`, Codex 브리지는 `effortFor`·`codexListedEffort`가 넘긴다. 상태의 모델 목록에 `efforts`·`defaultEffort`가 실린다.
- `packages/ui`의 `aiEffortChoice`·`withAiEffort`·`withAiEffortFitted`와 `AiModelPicker`의 줄, 문구 `AI_EFFORT_STRINGS`(21개 언어).
- 설정 파일 약속(`docs/contracts.md`)과 동작 규칙(`docs/business-rules.md`의 "생각 깊이"), Claude 명령줄의 가변 값 목록(`packages/ai-provider/AGENTS.md`)을 고쳤다.
- 실제 구독으로 단계가 적용되는지는 사람이 확인한다. 시험은 프로그램을 가짜로 바꿔 인자와 요청만 본다.
