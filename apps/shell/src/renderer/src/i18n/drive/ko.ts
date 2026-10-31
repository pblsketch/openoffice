import type { zh } from './zh'

export const ko = {
  driveNav: 'Google 드라이브',
  driveDesc:
    'Google 드라이브에서 파일을 골라 GenOffice에서 열어 고치고, 저장하면 드라이브에 다시 올립니다. GenOffice는 사용자가 고른 파일만 열 수 있습니다.',
  driveConnect: 'Google 드라이브 연결',
  driveConnecting: '브라우저에서 Google 계정으로 로그인하고 허용하세요…',
  driveCancel: '취소',
  driveConnectedAs: '{email} 계정에 연결됨',
  driveDisconnect: '연결 끊기',
  driveDisconnectConfirm:
    '이 PC에서 드라이브 로그인을 지우고, Google에도 GenOffice의 접근을 거두라고 요청합니다. 이 PC에 받아 둔 사본은 남습니다.',
  driveDisconnectYes: '연결 끊기',
  driveNotPersisted: '이 PC에서는 로그인을 암호화해 보관할 수 없어서, 앱을 끄면 연결이 끊깁니다.',
  driveExpired:
    'Google이 연결을 끝냈습니다. 접근 권한을 거두었거나 로그인이 만료됐습니다. 다시 연결하세요.',
  driveAiAccess: 'AI가 드라이브에서 파일을 찾아 읽기',
  driveAiAccessDesc:
    '켜 두면 편집기의 AI가 여기서 고른 드라이브 파일을 찾고 글을 읽을 수 있습니다. 읽은 내용은 지금 쓰는 AI 제공자에게 갑니다. AI는 드라이브의 파일을 고치거나 지우거나 공유하지 못합니다.',
  drivePrivacy:
    '파일 목록과 내용은 이 PC와 Google 사이에서만 오갑니다. GenOffice 제작자의 서버를 거치지 않습니다.',
  driveFailDenied: 'Google에서 허용하지 않아 연결하지 못했습니다.',
  driveFailScope:
    '드라이브 접근에 체크하지 않아 연결하지 못했습니다. 다시 연결하면서 드라이브 항목을 체크하세요.',
  driveFailTimeout: '10분 안에 로그인이 끝나지 않았습니다. 다시 시도하세요.',
  driveFailNetwork: 'Google에 연결하지 못했습니다. 인터넷 연결을 확인하고 다시 시도하세요.',
  driveRecent: '고른 파일',
  driveSearchPlaceholder: '고른 파일에서 검색',
  driveSearchResults: '“{q}” 검색 결과',
  driveRefresh: '새로 고침',
  driveNotConnectedTitle: 'Google 드라이브가 연결되지 않았습니다',
  driveNotConnectedBody:
    '연결하면 드라이브에서 파일을 골라 여기서 열고 고칠 수 있고, 저장하면 드라이브에 다시 올라갑니다.',
  driveOpenSettings: '설정에서 연결하기',
  driveEmpty: '아직 고른 파일이 없습니다. “Google 드라이브에서 고르기”를 눌러 파일을 고르세요.',
  driveLoading: '불러오는 중…',
  driveLoadMore: '더 보기',
  driveOpening: '여는 중…',
  driveGoogleBadge: 'Google 형식',
  driveGoogleNote:
    'Google 문서 형식이라 Office 파일로 엽니다. 저장하면 원본은 그대로 두고 그 옆이나 내 드라이브에 Office 파일로 저장합니다.',
  driveReadOnly: '보기 전용',
  driveReadOnlyNote:
    '이 파일을 고칠 권한이 없습니다. 저장하면 드라이브에 사본으로 저장할지 묻습니다.',
  driveUnsupported: '이 앱에서 열 수 없는 형식입니다.',
  driveErrNotConnected: 'Google 드라이브 연결이 끊겼습니다. 설정에서 다시 연결하세요.',
  driveErrNotFound: '파일을 찾을 수 없습니다. 지워졌거나 이 계정으로는 볼 수 없습니다.',
  driveErrForbidden: '이 계정에는 이 파일을 내려받을 권한이 없습니다.',
  driveErrTooLarge: '파일이 너무 커서 열 수 없습니다.',
  driveErrRateLimit: 'Google이 요청을 잠시 막았습니다. 조금 뒤에 다시 시도하세요.',
  driveErrNetwork: 'Google 드라이브에 연결하지 못했습니다. 인터넷 연결을 확인하세요.',
  driveErrDisk: '파일을 이 PC에 저장하지 못했습니다.',
  drivePick: 'Google 드라이브에서 고르기',
  drivePicking: '브라우저에 열린 Google 창에서 파일을 고르세요…',
  drivePickNote:
    'GenOffice는 Google 창에서 고른 드라이브 파일만 열 수 있습니다. 한 번 고른 파일은 이 목록에 남습니다.',
  driveTrainingTitle: '드라이브 파일을 AI와 쓰기 전에',
  driveTrainingBody:
    'Google은 드라이브 파일을 모델 학습에 쓰는 AI 서비스로 보내는 것을 허락하지 않습니다. Claude·ChatGPT·Codex 개인 요금제는 끄지 않으면 대화를 학습에 쓸 수 있습니다. Claude는 설정 → 개인정보 보호에서, ChatGPT는 설정 → 데이터 제어의 “모두를 위한 모델 개선”에서 끄세요. API 키 제공자는 기본적으로 API로 받은 내용을 학습에 쓰지 않습니다. 무료 AI 연결에는 드라이브 파일을 보내지 않습니다.',
  driveTrainingAck: '드라이브 파일과 함께 쓰는 AI 계정에서 모델 학습을 껐습니다',
  driveFailTraining: '위의 모델 학습 항목에 먼저 체크하세요.',
} satisfies Record<keyof typeof zh, string>
