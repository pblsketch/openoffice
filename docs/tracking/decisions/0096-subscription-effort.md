# 0096 모델의 생각 깊이를 고른다

## 맥락

모델 선택기에서 모델은 고를 수 있지만 생각 깊이(Effort)는 고를 수 없었다. 2026-11-01 사용자 요청이다. 처음에는 구독 프로그램만 했고, 같은 날 사용자 승인으로 모델 목록이 단계를 알려 주는 키 제공자 넷과 Ollama를 더했다. 두 구독 프로그램 모두 단계를 받는다. Claude Code 2.1.287은 `--effort low|medium|high|xhigh|max`를 받고, 시작 응답의 모델마다 `supportsEffort`와 `supportedEffortLevels`를 준다(모델이 받지 않는 단계는 받는 단계로 낮춘다). Codex 0.159는 `turn/start`의 `effort`를 받고, `model/list`의 모델마다 `supportedReasoningEfforts`와 `defaultReasoningEffort`를 준다. `turn/start`의 단계는 그 차례와 그 뒤 차례에 적용된다.

앱은 Claude를 `--setting-sources ""`로 띄우므로 사용자가 Claude Code 설정에 정한 단계는 지금도 쓰이지 않는다. Codex는 사용자의 `config.toml`에 `model_reasoning_effort`가 있으면 그 값을 쓴다.

## 결정

- **단계는 구독 제공자마다 하나를 저장한다.** `providers.<id>.effort`이고, 없으면 프로그램의 기본이다. 단계 목록은 `none`, `minimal`, `low`, `medium`, `high`, `xhigh`, `max` 일곱이고, 다른 값은 저장할 때 지운다.
- **화면은 프로그램이 알려 준 단계만 보인다.** 모델 선택기의 목록 아래에 "생각 깊이" 줄을 두고, 지금 답할 모델의 단계와 "기본"을 보인다. 프로그램이 그 모델에 단계를 알려 주지 않으면 줄이 없다. 다른 모델을 고를 때 그 모델이 받지 않는 단계는 지운다.
- **실행은 다시 거른다.** Claude 명령줄에는 고정 목록의 다섯 단어만 오른다. 그 밖의 값은 `--effort` 없이 띄운다. Codex에는 그 모델이 목록에서 받는다고 한 값만 차례에 넘기고, 그 확인에 쓰는 목록은 기본 모델을 고를 때 읽는 목록과 같이 프로세스마다 한 번 읽는다. 단계가 설정되지 않으면 목록을 따로 읽지 않는다. 목록을 읽지 못하면 단계 없이 돈다.
- **Codex는 단계가 바뀌면 새 스레드를 연다.** 같은 스레드에서 단계를 "기본"으로 되돌릴 방법이 없다(넘기지 않으면 앞 차례의 단계가 남는다).
- **에이전트 모드도 같은 값을 쓴다.** Claude 세션은 `--effort`, Codex 세션은 차례마다 `effort`를 넘긴다.
- **키 제공자는 모델 목록이 단계를 알려 주는 곳만 한다.** 2026-11-01 각 회사 문서로 확인한 것은 넷이다. Anthropic `GET /v1/models`의 `capabilities.effort.<단계>.supported`(요청은 `output_config.effort`), OpenRouter `GET /api/v1/models`의 `reasoning.supported_efforts`·`default_effort`(요청은 `reasoning.effort`), DeepSeek `GET /models`의 `effort.supported_levels`·`default_level`(요청은 `reasoning_effort`), xAI의 `capabilities.reasoning_effort`·`default_reasoning_effort`(요청은 `reasoning_effort`)다. xAI는 짧은 목록이 이 값을 빼기도 해서 전체 목록(`language-models`)도 읽는다. 단계는 결정 0087의 목록 조회 답에서 함께 받아 `providers.<id>.modelEfforts`에 둔다. 앱 화면이 저장할 때는 파일의 값을 쓴다. 실행에서 받는 설정 검사는 이 표를 아는 단계만 남겨 통과시킨다. 표가 그 모델에 그 단계를 적은 경우에만 요청에 넣는다.
- **로컬 서버는 Ollama만 한다.** `/api/show`의 `thinking.values`·`default`를 모델 프로필에 두고(설정의 "서버에서 다시 확인" 때), 고른 단계는 그 서버 항목(`customEndpoints[].effort`)에 둔다. 쓰는 서버의 단계와 그 모델의 단계표가 `providers.custom`으로 옮겨지고, 요청은 `/v1/chat/completions`의 `reasoning_effort`다.

## 택하지 않은 것

- **모델마다 단계를 저장하기.** 모델을 바꿀 때마다 단계가 따라 바뀌어 무엇이 걸려 있는지 알기 어렵다. 제공자마다 하나를 두고, 받지 않는 모델로 바꿀 때만 지운다.
- **앱이 단계 목록을 고정해 늘 보이기.** 모델마다 받는 단계가 다르고(예: `max`는 일부 모델만), 받지 않는 값을 Codex에 넘기면 차례가 실패할 수 있다. 프로그램이 알려 주는 대로 보인다.
- **Codex 스레드 설정(`config.model_reasoning_effort`)으로 넘기기.** 사용자 `config.toml`과 겹치고, 모델이 받는지 확인할 자리가 없다. 차례의 `effort`가 공식 경로다.
- **목록이 단계를 알려 주지 않는 회사(OpenAI, Gemini, Kimi, GLM, Mistral, Hunyuan, Upstage, Doubao 등)에 앱의 모델별 단계표를 두기.** 모델마다 받는 값이 다르고, OpenAI·GLM처럼 받지 않는 값에 400을 주는 곳이 있다. 표는 새 모델이 나올 때마다 앱을 고쳐야 해서, 결정 0087에서 고정 목록이 낡은 것과 같은 문제가 된다. 요청이 생기면 그때 본다.
- **켜고 끄기만 되는 회사(MiMo, Qwen, MiniMax-M3)를 같은 줄에 넣기.** 단계가 아니라 켜기·끄기라 이 줄과 성격이 다르다.
- **LM Studio.** 단계는 앱이 읽지 않는 자체 API(`/api/v1/models`)에만 있고, 대부분의 모델은 켜기·끄기뿐이다.
- **ChatGPT 직접 연결.** 요청은 `reasoning.effort`를 받지만, 앱이 쓰는 모델 목록이 단계를 알려 주지 않는다.
- **설정 화면에 같은 칸을 두기.** 단계는 모델과 함께 고르는 것이라 모델 선택기 한 곳에 둔다.

## 결과

- `packages/ai-provider/src/effort.ts`가 단계 목록과 검사를, `src/key-effort.ts`가 키 제공자에 무엇을 넣을지를 맡는다. `key-models.ts`가 목록에서 단계를 읽고(`listKeyProviderModelListing`), `key-model-refresh.ts`가 저장한다. Ollama는 `local-models.ts`가 읽고 `local-profile.ts`가 프로필에 둔다. Claude 브리지는 `claudeCodeCliLaunchArgs(model, schema, effort)`와 `claudeAgentLaunchArgs`, Codex 브리지는 `effortFor`·`codexListedEffort`가 넘긴다. 상태의 모델 목록에 `efforts`·`defaultEffort`가 실린다.
- `packages/ui`의 `aiEffortChoice`·`withAiEffort`·`withAiEffortFitted`와 `AiModelPicker`의 줄, 문구 `AI_EFFORT_STRINGS`(21개 언어).
- 설정 파일 약속(`docs/contracts.md`)과 동작 규칙(`docs/business-rules.md`의 "생각 깊이"), Claude 명령줄의 가변 값 목록(`packages/ai-provider/AGENTS.md`)을 고쳤다.
- 실제 구독으로 단계가 적용되는지는 사람이 확인한다. 시험은 프로그램을 가짜로 바꿔 인자와 요청만 본다.
