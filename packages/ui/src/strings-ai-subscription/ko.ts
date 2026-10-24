import type { zh } from './zh'

export const ko = {
  aiAssistant: 'AI 도우미',
  cardChecking: '확인 중…',
  cardNotInstalled: '설치되지 않음',
  cardSignedOut: '로그인 필요',
  cardSigningIn: '로그인하는 중…',
  cardReady: '연결됨',
  cardReadyPlan: '연결됨 · {plan}',
  cardMetered: '구독이 아닌 방식으로 로그인됨',
  cardMeteredAccepted: '사용 중 · 쓴 만큼 요금 발생',
  cardError: '연결을 확인하지 못했습니다',
  cardErrNeedsUpdate: '이 PC의 {provider} 프로그램 버전이 낮습니다. 업데이트한 뒤 다시 확인하세요.',
  cardErrNeedsUpdateVersion:
    '이 PC의 {provider} 프로그램({version})이 오래되었습니다. {minimum} 이상이 필요합니다. 터미널에서 {command}를 실행한 뒤 다시 확인하세요.',
  cardErrNeedsUpdatePath: '이 앱이 실행하는 파일:',
  cardErrNeedsUpdateWindows:
    'WSL(Ubuntu)이나 다른 폴더에 설치된 {provider}를 업데이트해도 이 파일은 바뀌지 않습니다. Windows PowerShell에서 {command}를 실행하세요.',
  cardErrTimeout: '{provider} 프로그램이 제때 응답하지 않았습니다. 잠시 뒤 다시 확인하세요.',
  cardErrFailed: '{provider} 연결을 확인하는 중에 문제가 생겼습니다. 다시 확인해 보세요.',
  actionInstall: '설치',
  actionLogin: '로그인',
  actionLoginWindow: '브라우저가 안 열리거나 코드가 나오나요?',
  actionRecheck: '다시 확인',
  actionAcceptMetered: '그래도 사용',
  actionInstallHelp: '공식 설치 안내',
  actionOpenSettings: '설정 열기',
  actionDismiss: '닫기',
  actionSwitchAccount: '다른 계정으로 로그인',
  actionLogout: '로그아웃',
  installNote: '{vendor}의 공식 설치 명령이 새 터미널 창에서 실행됩니다.',
  loginNote: '열리는 로그인 화면은 {vendor}의 것입니다.',
  signingInBrowserNote:
    '열린 브라우저에서 {vendor} 계정으로 로그인하고 허용을 누르세요. 끝나면 저절로 연결됩니다.',
  signingInWindowNote:
    '브라우저가 안 열렸으면 방금 열린 창에 나온 주소를 복사해 브라우저에서 여세요. 브라우저에 코드가 나오면 복사해서 그 창에 한 번 붙여 넣고 Enter를 누르세요. 붙여 넣은 코드는 창에 보이지 않을 수 있습니다.',
  meteredWarning: '구독이 아니라 쓴 만큼 요금이 나갑니다.',
  meteredMeaning:
    'API 키나 종량제 계정으로 로그인되어 있거나, 로그인 방식을 확인하지 못한 상태입니다. "그래도 사용"을 누르면 이 연결로 AI를 쓰게 되고, 요청할 때마다 그 계정에 요금이 청구됩니다.',
  connectTitle: 'AI를 쓰려면 먼저 연결하세요',
  connectBody: '이미 쓰고 있는 Claude 또는 Codex 구독으로 AI를 씁니다. API 키는 필요 없습니다.',
  connectProviderTitle: '{provider} 연결을 지금 쓸 수 없습니다',
  connectKeyBody:
    '{provider} 설정이 아직 끝나지 않았습니다. 설정에서 마무리하거나 다른 AI를 선택하세요.',
  errNotConnected: '연결된 AI가 없습니다. Claude·Codex 구독이나 무료 AI를 먼저 연결하세요.',
  errNotInstalled: '이 PC에서 {provider} 프로그램을 찾지 못했습니다.',
  errSignedOut: '{provider} 로그인이 풀렸습니다. 다시 로그인한 뒤 계속하세요.',
  errRateLimit: '{provider} 구독 한도를 모두 썼습니다.',
  errRateLimitReset: '{provider} 구독 한도를 모두 썼습니다. {time}에 초기화됩니다.',
  errUnsafeTools:
    '{provider} 프로그램이 자체 도구를 켠 채로 시작되어, 안전을 위해 실행을 멈췄습니다.',
  errMeteredNotAccepted:
    '{provider} 연결은 쓴 만큼 요금이 나가는 로그인인데 아직 허용하지 않았습니다. 연결 설정에서 "그래도 사용"을 눌러야 쓸 수 있습니다.',
  errNeedsUpdate:
    '{provider} 프로그램 버전이 낮아 이 기능을 쓸 수 없습니다. 업데이트한 뒤 다시 시도하세요.',
  errHeadlessLimit: '자동 호출의 시간당 한도에 도달했습니다.',
  errHeadlessLimitReset: '자동 호출의 시간당 한도에 도달했습니다. {time}부터 다시 가능합니다.',
  connectFreeHint: '구독이 없나요? 설정에서 무료 AI를 1분 안에 연결할 수 있습니다.',
  actionConnectFree: '무료 AI 연결하기',
  errFreeLimit:
    '오늘 쓸 수 있는 무료 사용량을 다 썼습니다. 내일 다시 쓰거나 설정에서 다른 AI를 고르세요.',
  errFreeLimitReset: '오늘 쓸 수 있는 무료 사용량을 다 썼습니다. {time}부터 다시 쓸 수 있습니다.',
  continueWith: '{provider}로 계속',
  continueMeteredNote: '{provider} 연결은 구독이 아닙니다. 계속하면 쓴 만큼 요금이 나갑니다.',
  usageLine: '{percent}% 사용 · {time}에 초기화',
  usageWindowFiveHour: '5시간 한도',
  usageWindowSevenDay: '7일 한도',
  noticeTitle: '구독으로 AI를 쓰기 전에',
  noticeSend:
    '문서 내용과 대화는 사용자 본인 계정으로 Anthropic 또는 OpenAI에 전송됩니다. 요청마다 "스스로 쓰기"로 둔 스킬의 이름·제목·설명이 함께 가고, 쓰는 스킬의 글과 AI가 읽은 스킬 파일도 함께 전송됩니다.',
  noticeTraining: '그 내용이 AI 학습에 쓰이는지는 해당 회사의 사용자 계정 설정에 따라 정해집니다.',
  noticeCodexHistory:
    '이 앱은 Codex의 대화 기록 저장을 꺼 둡니다. 다만 Codex가 자체 진단 로그를 이 PC에 남길 수 있습니다.',
  noticePdfWholeDocument:
    'PDF 편집기에서는 AI 페이지 읽기와 문서 번역 때 페이지 그림과 문서 전체의 글이 보내질 수 있습니다.',
  noticeAck: '확인',
  codexNotice: '앱에서 Codex 구독을 쓰는 것은 OpenAI가 공식 권장하는 방식이 아닙니다.',
  truncatedNotice: '입력이 너무 길어 일부를 잘라내고 보냈습니다.',
  pickerAuto: '자동',
  pickerAutoUsing: '자동 · {provider}',
  pickerAutoUsingModel: '자동 · {provider} · {model}',
  pickerDefaultModel: '기본 모델',
  pickerDefaultModelNamed: '기본 모델 · {model}',
  pickerSubscription: '구독',
  pickerPaid: '유료',
  pickerPaidTitle: '구독이 아니라 쓴 만큼 요금이 나가는 연결입니다',
  pickerNotConnected: 'AI 연결',
  guideQuestion: '지금 쓰고 있는 AI가 있나요?',
  guidePathClaudeTitle: 'Claude 유료 구독이 있어요',
  guidePathClaudeBody:
    'Pro 또는 Max 요금제가 있어야 합니다. 무료 Claude 계정으로는 연결되지 않습니다.',
  guidePathCodexTitle: 'ChatGPT를 써요',
  guidePathCodexBody:
    'ChatGPT 계정으로 OpenAI의 Codex 프로그램에 로그인해서 씁니다. 무료 요금제는 쓸 수 있는 양이 적습니다.',
  guidePathFreeTitle: '아직 없어요',
  guidePathFreeBody:
    '무료 AI를 1분 안에 연결할 수 있습니다. 무료로 쓰는 동안 보낸 내용은 그 회사의 AI 개선에 쓰일 수 있습니다.',
  guideBack: '다른 방법 고르기',
  guideBadgeReady: '연결됨',
  guideBadgeInstalled: '설치됨',
  guideBadgeCheck: '확인 필요',
  guideStepsLabel: '연결 단계',
  stepInstall: '프로그램 설치',
  stepLogin: '로그인',
  stepReady: '연결 완료',
  installReturnNote: '창에서 설치가 끝나면 이 화면으로 돌아오세요. 앱이 저절로 다시 확인합니다.',
  loginHowNote:
    '누르면 브라우저가 열립니다. {vendor} 계정으로 로그인하고 허용을 누르면 저절로 연결됩니다.',
  signingInStalledNote:
    '브라우저가 열리지 않았거나 화면에 코드가 보이나요? 아래 버튼으로 로그인 창을 여세요. 창에 나온 주소를 브라우저에 붙여 넣거나, 브라우저에 나온 코드를 창에 붙여 넣으면 됩니다.',
  actionLoginWindowOpen: '로그인 창 열기',
  actionCancelLogin: '로그인 취소',
  actionUpdate: '업데이트',
  updateNote:
    '누르면 {vendor}의 공식 업데이트가 새 창에서 실행됩니다. 창에서 업데이트가 끝나면 이 화면으로 돌아오세요.',
  guideInfoHint:
    '그래도 안 되나요? 연결 정보를 복사해서 도와줄 사람에게 보내세요. 계정과 파일 경로는 들어가지 않습니다.',
  actionCopyInfo: '도움 요청용 정보 복사',
  copyInfoDone: '복사했습니다',
  actionConnectHelp: '연결하는 방법 화면으로 보기',
} satisfies Record<keyof typeof zh, string>
