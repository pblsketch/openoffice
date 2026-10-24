import type { zh } from './zh'

export const pt = {
  editUndo: 'Desfazer',
  editRedo: 'Refazer',
  editBold: 'Negrito',
  editItalic: 'Itálico',
  editReplace: 'Substituir',
  editReplaceWith: 'Substituir por',
  editReplaceOne: 'Substituir',
  editReplaceAll: 'Substituir tudo',
  editReplaceDone: '{count} substituído(s)',
  editReplaceSkipped: '{count} ignorado(s) em capítulos somente leitura',
  editReplaceFailed: 'Não foi possível substituir {count}',
  editReplaceNone: 'Nada para substituir',
  editReplaceNotHere: 'Esta ocorrência não pode ser substituída',
  editAutoSave: 'Salvamento automático',
  editAutoSaveTip: 'Salva a cada 30 segundos e quando a janela perde o foco',
  editUnsaved: 'Alterações não salvas',
  editLocked: 'Não é possível editar enquanto o livro está sendo traduzido',
  editRefused: 'Não foi possível fazer esta alteração',
  editHistoryFailed: 'O histórico de desfazer não correspondia mais ao livro e foi limpo',
} satisfies Record<keyof typeof zh, string>
