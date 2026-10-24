import type { zh } from './zh'

export const pt = {
  title: 'Documentos com conteúdo não salvo',
  intro:
    'Estes documentos ainda têm conteúdo que você não salvou. Escolha para cada um se deseja restaurar ou descartar. O conteúdo descartado não pode ser recuperado.',
  restore: 'Restaurar',
  discard: 'Descartar',
  restoreAll: 'Restaurar tudo',
  discardAll: 'Descartar tudo',
  confirm: 'Confirmar',
  later: 'Decidir depois',
  laterHint: 'Fechar esta lista não apaga nada; você será perguntado novamente mais tarde.',
  untitledFolder: 'Documento novo, nunca salvo',
  lastCopy: 'Guardado em {time}',
  changedAfter: 'O arquivo foi alterado depois',
  changedAfterNote:
    'Outro programa ou uma sincronização na nuvem pode tê-lo alterado. “Descartar” está selecionado para manter o arquivo como está agora.',
  missing: 'Arquivo original não encontrado',
  missingNote:
    'Se você restaurar, ele abrirá como um novo documento sem título. Ao salvar, o local original será sugerido.',
  choiceLabel: 'Escolha para {name}',
} satisfies Record<keyof typeof zh, string>
