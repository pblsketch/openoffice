import type { zh } from './zh'

export const ko = {
  loading: '그림을 여는 중…',
  openFailedTitle: '이 그림을 열 수 없습니다',
  openFailedNotDrawing: '이 파일은 Excalidraw 그림이 아닙니다.',
  openFailedUnreadable: '이 파일을 읽을 수 없습니다. 손상되었을 수 있습니다.',
  openFailedTooLarge: '파일이 너무 커서 열 수 없습니다.',
  openFailedError: '파일을 여는 중에 문제가 생겼습니다.',
  saveFailed: '그림을 저장하지 못했습니다.',
  picturesMissing: '이 그림이 쓰는 사진 {count}개를 노트의 보관함에서 찾지 못했습니다.',
  picturesNotInNote: 'Obsidian 그림에는 아직 여기서 사진을 넣을 수 없습니다.',
  linkNotOpened: '이 링크는 열 수 없습니다.',
  autoSave: '자동 저장',
} satisfies Record<keyof typeof zh, string>
