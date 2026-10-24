import type { zh } from './zh'

export const ko = {
  editUndo: '실행 취소',
  editRedo: '다시 실행',
  editBold: '굵게',
  editItalic: '기울임',
  editReplace: '바꾸기',
  editReplaceWith: '바꿀 글',
  editReplaceOne: '바꾸기',
  editReplaceAll: '모두 바꾸기',
  editReplaceDone: '{count}곳을 바꿨습니다',
  editReplaceSkipped: '읽기 전용 장의 {count}곳은 건너뛰었습니다',
  editReplaceFailed: '{count}곳은 바꾸지 못했습니다',
  editReplaceNone: '바꿀 곳이 없습니다',
  editReplaceNotHere: '이 자리는 바꿀 수 없습니다',
  editAutoSave: '자동 저장',
  editAutoSaveTip: '30초마다, 그리고 창이 포커스를 잃을 때 자동으로 저장합니다',
  editUnsaved: '저장하지 않은 고침이 있습니다',
  editLocked: '번역 중에는 고칠 수 없습니다',
  editRefused: '이 고침을 적용하지 못했습니다',
  editHistoryFailed: '되돌리기 기록이 책과 맞지 않아 지웠습니다',
} satisfies Record<keyof typeof zh, string>
