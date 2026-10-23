import type { zh } from './zh'

export const pt = {
  loading: 'Abrindo o desenho…',
  openFailedTitle: 'Não é possível abrir este desenho',
  openFailedNotDrawing: 'Este arquivo não é um desenho do Excalidraw.',
  openFailedUnreadable: 'Não é possível ler este arquivo. Ele pode estar danificado.',
  openFailedTooLarge: 'O arquivo é grande demais para ser aberto.',
  openFailedError: 'Ocorreu um problema ao abrir o arquivo.',
  saveFailed: 'Não foi possível salvar o desenho.',
  picturesMissing:
    '{count} imagens usadas por este desenho não foram encontradas no cofre da nota.',
  picturesNotInNote: 'Ainda não é possível adicionar imagens a um desenho do Obsidian aqui.',
  linkNotOpened: 'Não é possível abrir este link.',
  autoSave: 'Salvamento automático',
} satisfies Record<keyof typeof zh, string>
