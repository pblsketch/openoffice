import type { zh } from './zh'

export const ko = {
  windowTitle: '에이전트',
  homeCardSub: '폴더에서 Claude Code·Codex로 일하기',
  intro:
    '에이전트는 고른 폴더에서 Claude Code나 Codex를 실행합니다. 폴더 안의 파일을 읽고, 새 파일을 만들고, 스킬을 쓰고, 스크립트를 실행하고, GenOffice에 열린 문서를 고칠 수 있습니다.',
  folderLabel: '프로젝트 폴더',
  folderPick: '폴더 고르기…',
  folderNone: '고른 폴더가 없습니다',
  recentLabel: '최근 폴더',
  providerLabel: '프로그램',
  providerClaude: 'Claude Code',
  providerCodex: 'Codex',
  providerClaudeNote:
    'Windows에서는 허락한 명령이 격리 없이 실행되어 PC 전체와 인터넷에 닿을 수 있습니다.',
  providerCodexNote:
    '명령은 Codex의 격리 공간에서 실행됩니다. 프로젝트 폴더에만 쓸 수 있고 인터넷은 막힙니다.',
  providerBlocked:
    '아직 쓸 수 없습니다. Codex가 자기 로그인 파일을 읽지 못하게 막는 방법을 아직 찾지 못했습니다.',
  connChecking: '연결을 확인하는 중…',
  connUnavailable: '연결되지 않았습니다. 설정 → AI에서 로그인하세요.',
  connMetered: '허용해 둔 종량제 로그인으로 연결되어 있습니다.',
  modeLabel: '언제 물을까요',
  modeAskCommands: '명령 실행마다 묻기',
  modeAskCommandsDesc:
    '프로젝트 폴더의 파일 읽기와 쓰기는 바로 합니다. 명령이나 스크립트 실행은 먼저 묻습니다.',
  modeAskWrites: '파일 쓰기와 명령 실행마다 묻기',
  modeAskWritesDesc: '읽기만 바로 합니다. 파일 쓰기와 명령 실행은 둘 다 먼저 묻습니다.',
  modeTrust: '이 프로젝트는 믿고 맡기기',
  modeTrustDesc:
    '묻지 않습니다. Codex는 그래도 격리 공간 안에서만 움직이고, Claude Code는 자체 검사 모델이 행동마다 대신 확인합니다.',
  warningTitle: '시작하기 전에',
  warningCommands:
    '에이전트가 실행하는 명령은 파일을 바꾸고 인터넷을 쓸 수 있습니다. 남에게 받은 문서에는 숨은 지시가 들어 있을 수 있습니다.',
  warningRedaction:
    'AI에게서 가린 부분은 GenOffice에 열린 문서에서만 가려집니다. 에이전트가 폴더에서 직접 읽는 파일은 그대로 보내집니다.',
  warningUsage: '에이전트는 여러 단계로 일하므로 AI 창보다 구독 한도를 많이 씁니다.',
  warningAccept: '이해했습니다',
  start: '시작',
  starting: '시작하는 중…',
  stop: '멈추기',
  newSession: '새로 시작',
  send: '보내기',
  inputPlaceholder: '에이전트에게 무엇을 시킬까요?',
  you: '나',
  agent: '에이전트',
  startedLine: '{program}을(를) {folder}에서 시작했습니다',
  skillsLine: '스킬 {n}개를 쓸 수 있습니다',
  skillsLineOne: '스킬 {n}개를 쓸 수 있습니다',
  toolRunning: '진행 중',
  toolDone: '완료',
  toolFailed: '실패',
  toolDenied: '거절됨',
  actRead: '읽기',
  actWrite: '쓰기',
  actCommand: '실행',
  actAppTool: '열린 문서 고치기',
  actSkill: '스킬 사용',
  actOther: '도구 사용',
  openFile: '열기',
  permTitle: '에이전트가 허락을 구합니다:',
  permCommand: '이 명령을 실행',
  permWrite: '이 파일에 쓰기',
  permRead: '프로젝트 폴더 밖의 파일 읽기',
  permOther: '“{tool}” 도구 사용',
  permReason: '이유: {reason}',
  permAllow: '허락',
  permDeny: '거절',
  turnFailed: '에이전트가 이 요청을 끝내지 못했습니다.',
  ended: '세션이 끝났습니다.',
  errBadFolder:
    '이 폴더는 쓸 수 없습니다. 작업하는 폴더를 고르세요. 드라이브 전체, 사용자 폴더 전체, 로그인·앱 데이터 폴더는 안 됩니다.',
  errNotConnected:
    '이 프로그램은 연결되어 있지 않습니다. 설정 → AI에서 로그인한 뒤 다시 시도하세요.',
  errNotAccepted: '위의 안내를 읽고 먼저 확인해 주세요.',
  errUnsafeTools: '프로그램이 앱이 주지 않은 도구를 가진 채 시작해서 멈췄습니다.',
  errRateLimit: '구독 한도를 다 썼습니다. 나중에 다시 시도하세요.',
  errSignedOut: '프로그램이 로그아웃되어 있습니다. 설정 → AI에서 로그인하세요.',
  errMetered: '프로그램이 허용하지 않은 종량제 로그인으로 되어 있습니다.',
  errSandboxUnavailable:
    '이 PC에서는 Codex가 명령을 가둘 격리 공간을 열 수 없어서 시작하지 않았습니다. Windows를 최신으로 업데이트하거나 Claude Code를 고르세요.',
  errNeedsUpdate:
    '프로그램이 에이전트 모드를 쓰기에는 오래되었습니다. 업데이트한 뒤 다시 시도하세요.',
  errNotInstalled: '프로그램이 설치되어 있지 않습니다.',
  errGeneric: '문제가 생겼습니다. 다시 시도하세요.',
  documentsUnprotected:
    '세션을 시작한 뒤 연 문서 {n}개는 프로그램의 직접 쓰기 보호를 받지 않습니다. 보호하려면 세션을 멈추고 다시 시작하세요.',
} satisfies Record<keyof typeof zh, string>
