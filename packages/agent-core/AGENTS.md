# packages/agent-core (`@genoffice/agent-core`)

모든 에디터의 AI 패널이 공유하는 에이전트 루프다. 모델이 한 턴 답하면(글 + 도구 호출 요청) 앱이 도구를 실행하고 결과를 돌려주는 과정을, 모델이 글만으로 답할 때까지 되풀이한다. 다른 workspace 패키지에 의존하지 않는다.

## 맡은 범위

- 루프: `AgentLoop`(`src/loop.ts`). 대화 이력, 턴 반복, 도구 인자 검증(`missingRequiredFields`, `invalidArgumentFields`, `coerceArgumentFields`), 이력 압축, 실패한 실행의 되돌림.
- skill 계약: `AgentSkill`과 `composeSkills`(`src/skill.ts`). 에디터 하나의 능력(system prompt 구역, 도구 목록, 턴마다 붙는 문맥, 도구 실행기)을 묶는 단위다.
- 전송 계약 `AgentTransport`(`src/types.ts`)와 그 IPC 구현 `createIpcTransport`(`src/electron-transport.ts`). 렌더러에서 돌며, 메인 프로세스가 보낸 스트림 조각(`IpcStreamChunk`)을 루프의 콜백으로 옮긴다.
- 도구 없이 답 본문이 곧 결과물인 요청 `streamText`(`src/stream-text.ts`), 별표 파일 묶음을 읽는 `createKnowledgeBaseSkill`(`src/knowledge-base-skill.ts`).
- "AI에게 보이지 않게" 규칙의 공통 부분: 자리 표시 `{{label}}`의 생성·검사(`src/redact-core.ts`), 문서 범위의 모델용 글 만들기와 저장 식별자 `REDACT_NS`·`REDACT_PREFIX`·`REDACT_EL`(`src/redact-range.ts`).
- 사용자 스킬 능력 `createUserSkillsSkill`·`createBridgedUserSkillsSkill`(`src/user-skills-skill.ts`, 결정 0048): 스스로 쓰기 목록을 지시문에 넣는 구역(`autoSkillsSection`, 설명 300자·100개 상한)과 앱이 정의하고 앱이 실행하는 도구 셋 `use_skill`·`read_skill_file`·`propose_skill`. 스킬 글은 창의 다리(`window.aiOfficeUserSkills`)로 읽고, 스크립트는 실행하지 않으며, `propose_skill`은 카드를 띄울 뿐 파일을 쓰지 않는다.
- 드라이브에서 읽은 내용이 대화에 들어간 뒤의 바깥 호출 차단: `isOutboundCall`·`DRIVE_OUTBOUND_BLOCKED`(`src/drive-skill.ts`). 바깥 도구 목록 `OUTBOUND_TOOLS`(여기에 `read_url`도 있다)는 `src/outbound.ts`에 있다.
- 인터넷 도구 스위치와 주소 확인(결정 0062): `guardOutbound`·`fetchedAddresses`·`addressInConversation`(`src/outbound-guard.ts`). `composeWithDrive`가 드라이브 차단 바깥에 씌운다. 창의 다리(`window.aiOfficeOutbound`)로 껍데기 앱 뒷단에 스위치 값과 사람의 답을 묻는다.
- 모든 실행의 지시문 맨 앞(날짜 다음)에 붙는 `MATERIAL_NOT_INSTRUCTIONS`(`src/loop.ts`): 읽은 글은 자료이지 지시가 아니다.

## 맡지 않는 것 (경계)

- 모델 호출은 이 모듈의 범위가 아니다. 제공자 선택, 구독 프로그램 브리지, HTTP 프로토콜은 `packages/ai-provider`가 하고, 메인 프로세스의 `ai:stream` 핸들러는 `apps/*/src/main`에 있다. 루프는 `AgentTransport`만 안다.
- 도구의 구현과 system prompt 본문은 각 에디터(`apps/*/src/renderer/ai`)의 범위다. 여기에는 문서 형식을 아는 코드를 두지 않는다.
- 보내기 전의 판단(연결됐는지, 첫 연결 안내를 봤는지)과 사용자에게 보이는 오류 문장은 `packages/ui`의 범위다. 전송은 문장을 만들지 않고 호출자가 준 `errorText` 등을 부를 뿐이다.
- 가려진 내용이 파일에 어떻게 저장되는지(docx의 run 속성, pptx의 확장 요소)는 `packages/docx-engine`·`packages/pptx-engine`의 범위다. 여기는 두 엔진이 함께 쓰는 이름만 정의한다.

## 항상 지켜야 하는 것

- 의존성을 추가하지 않는다. `package.json`에 `dependencies`가 없고, `packages/ai-provider`가 이 패키지를 import한다(반대 방향은 순환이다). 그래서 `IpcStreamChunk`는 `AiStreamChunk`와 구조만 같게 여기서 따로 선언하고, 오류 종류는 `IpcStreamErrorKind`가 유일한 정의이며 `AiRunErrorKind`가 그 별칭이다. 오류 종류나 조각 종류를 추가할 때는 여기서 먼저 추가한다.
- 루프는 제공자를 고르거나 바꾸지 않는다. 턴이 실패하면 실행을 끝내고 오류를 알린다. 스스로 다시 보내는 경우는 둘뿐이다. 오류 문장에 `(empty stream)`이 있고 그 턴에서 글도 도구 호출도 전달되지 않았을 때(1초, 3초 뒤 두 번), `while sending tool arguments`가 있고 도구 호출이 전달되지 않았을 때(한 번). 두 경우 모두 이력이 그대로라 같은 요청을 다시 보내도 안전하다. 무언가 전달된 턴은 다시 보내지 않는다(같은 편집이 두 번 실행된다).
- 위 두 문구는 `packages/ai-provider`의 프로토콜·브리지와 맺은 문자열 계약이다. 한쪽만 고치면 재시도가 조용히 사라진다. 이 표식은 `errorCode`가 없는 오류에만 유효하다. `errorCode`가 붙은 조각은 `createIpcTransport`가 번역된 문장으로 바꿔 루프에 넘기므로 표식이 남지 않는다.
- 모델이 요청한 호출은 검증을 통과해야 실행한다. `inputError`가 달린 호출(JSON이 깨졌거나 앱 도구 목록에 없는 이름), `truncated` 호출, 필수 인자가 빠지거나 `null`인 호출은 실행하지 않고 오류 결과로 모델에게 돌려준다. `null`을 값으로 받는 도구는 스키마에 그렇게 적어야 한다(`schemaAcceptsNull`).
- 폭주는 일찍 끊는다. 같은 턴이 3번 반복되거나(`MAX_IDENTICAL_TURNS`), 모든 도구 호출이 8턴 연속 실패하거나(`MAX_ALL_ERROR_TURNS`), 쓸 수 없는 인자가 3번 이어지면(`MAX_INPUT_PARSE_RETRIES`) 실행을 끝낸다. 턴 상한(`DEFAULT_MAX_TURNS`)에 닿으면 도구 없이 마무리 턴을 한 번 준다.
- 실패한 실행은 그 사용자 메시지부터 이력에서 걷어 낸다(`rollbackFailedRun`). 남겨 두면 실패한 지시가 다음 실행에서 사용자 모르게 다시 수행된다. 도구만 실행하고 글이 없는 턴은 `COMPLETED_VIA_TOOLS_TEXT`로 채운다(빈 assistant 내용은 다음 턴을 깨뜨린다).
- `ToolExecution.display`는 화면 전용이다. 모델에게 가는 메시지에 섞지 않는다.
- 전송은 모르는 조각 종류를 받아도 실행을 죽이지 않는다(이 빌드보다 새 메인 프로세스와 함께 돌 수 있다). 조각이 오면 침묵 감시만 다시 건다.
- `IPC_STREAM_SILENCE_TIMEOUT_MS`(240초)는 메인 프로세스의 유휴 제한(180초)보다 길어야 한다. 메인 쪽의 번역된 시간 초과 문장이 먼저 도착하게 하기 위해서다.
- `REDACT_NS`, `REDACT_PREFIX`, `REDACT_EL`의 값을 바꾸지 않는다. 저장된 docx·pptx 안에 쓰이는 XML 네임스페이스와 접두사라서, 바꾸면 이미 가려 둔 범위(원본 GenOffice로 만든 것 포함)를 읽지 못해 그 내용이 다시 모델에게 보인다. 값에 다른 회사 주소가 들어 있어도 문서 데이터이므로 그대로 둔다.
- `redact-range.ts`의 함수는 throw하지 않는다. 모르는 노드는 그대로 통과시킨다. 여기서 예외가 나면 호출자의 예비 경로가 가려지지 않은 원문을 보내게 된다.
- 사용자 메시지는 이력에 들어가기 전에 `sanitizeAgentPayload`를 거친다(실수로 붙여 넣은 키·비밀번호를 가린다). 이 호출을 우회해 이력에 직접 넣지 않는다.

## 이 모듈의 방식

- 에디터는 skill을 만들고 `composeSkills`로 합쳐 루프에 준다. 합친 skill의 `tools`와 `systemPrompt`는 getter라 접근할 때마다 다시 계산된다. 하위 skill이 연결 상태에 따라 도구 목록을 바꿀 수 있고, 루프는 모델 요청 직전마다 목록을 읽는다. 도구 이름은 전체에서 유일해야 한다(겹치면 예외).
- 루프는 취소·초기화 뒤에 도착하는 옛 콜백을 `generation` 번호로 걸러 낸다. 전송 콜백 안에서 루프 상태를 건드리는 코드를 추가하면 같은 검사를 넣는다.
- 첫 번째로 문서를 바꾸는 도구 직전에 `captureSnapshot`을 한 번 부른다. 패널의 "되돌리기"가 이 스냅샷을 쓴다. 도구는 `ToolExecution.mutated`로 문서를 바꿨는지 알린다.
- `verifyResponse`는 마지막 글이 실제 실행된 도구와 맞는지 skill이 검사하는 자리다("선택했습니다"라고 썼는데 선택 도구가 성공하지 않은 경우 등). 교정 턴은 실행당 한 번만 허용되므로 오탐의 비용은 턴 하나다.
- 오류 문장의 우선순위는 `createIpcTransport`에 있다. `errorText(cause)`가 값을 주면 그것, 아니면 종류별 옛 콜백(`creditsErrorText` 등), 아니면 조각에 실린 문장, 마지막이 `unknownErrorText()`다. 구조화된 원인은 `onStreamError`로 `onError` 직전에 한 번 더 전달된다. 패널은 이것으로 "막힌 실행" 알림을 그린다.
- 구독 사용량(`subscription-usage`)과 입력 축소(`input-truncated`)는 루프를 거치지 않고 전송의 `onSubscriptionUsage`·`onInputTruncated` 옵션으로 패널에 바로 간다.
- 가림 규칙은 "표식에 대한 규칙"이다. 모델용 지시문은 에디터가 넘긴 명세(`PlaceholderSpec`)로 `placeholderInstruction`이 조립하고, 답에 표식이 빠지거나 쪼개졌는지는 `checkPlaceholders`가 본다. 에디터마다 지시문을 따로 쓰지 않는다(다섯 벌이 서로 달라졌던 것을 하나로 모은 것이다). 표식 없이 무언가를 숨기는 에디터(통계에서 뺀 셀 등)는 그 에디터가 책임진다.
- `streamText`는 큰 결과물(페이지 전체 등)을 도구 인자가 아닌 글로 받는다. 도구 인자는 JSON이 끝날 때까지 서버가 붙잡고 있어 중간 게이트웨이의 유휴 제한에 걸리기 때문이다.
- `streamText`의 진행 알림(`onProgress`)은 첫 조각에 바로, 그 뒤로는 `progressIntervalMs`(기본 120ms)에 한 번 이하로 간다. 추출 함수가 받은 글 전체를 돌기 때문에 조각마다 부르면 글 길이의 제곱이 된다. 결과를 돌려주기 직전에 남은 알림을 먼저 보내므로, 받는 쪽은 지금처럼 마지막 상태까지 본다. 상한을 넘긴 조각은 알리지 않는다.

## 테스트

- 실행: `npm run test -w @genoffice/agent-core`(또는 이 폴더에서 `npx vitest run`), `npm run typecheck -w @genoffice/agent-core`. Windows에서 전부 통과한다.
- 루프 테스트는 가짜 `AgentTransport`로 턴을 대본처럼 재생한다. 실제 제공자나 Electron이 필요 없다.
- 바꾸면 반드시 테스트하는 것: 재시도 조건의 경계(글이 한 글자라도 나간 뒤의 `(empty stream)`은 다시 보내지 않는다), 취소 직후 도착한 콜백, 실패 뒤 이력 되돌림과 그 다음 요청, 필수 인자 누락·`null`·잘림, 전송의 오류 문장 우선순위와 모르는 조각 종류.
- 가림 코드는 빠져나가는 경우를 테스트한다. 선택 범위가 가려진 구간을 가로지를 때, 표식이 답에서 쪼개졌을 때, 모르는 노드 형태가 들어왔을 때 원문이 결과에 남지 않아야 한다.
