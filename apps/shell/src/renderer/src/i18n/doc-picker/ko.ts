import type { zh } from './zh'

export const ko = {
  docPickTitle: 'GenOffice 문서에서 첨부',
  docPickOpen: '열린 문서',
  docPickRecent: '최근 문서',
  docPickEmpty: '붙일 문서가 없습니다.',
  docPickMissing: '파일을 찾을 수 없습니다.',
  docPickUnsaved: '먼저 저장해 주세요.',
  docPickUnavailable: '문서 목록을 읽을 수 없습니다.',
  docPickLimit: '문서는 20개까지만 고를 수 있습니다.',
  docPickSelected: '{n}개 선택',
  docPickAttach: '첨부',
  docPickCancel: '취소',
  docPickWorking: '첨부하는 중…',
} satisfies Record<keyof typeof zh, string>
