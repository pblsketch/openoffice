import type { zh } from './zh'

export const pt = {
  setHomeKinds: 'Novos documentos no Início',
  setHomeKindsDesc:
    'Os tipos desativados saem dos cartões de novo documento do Início e dos menus Novo. Os arquivos desses tipos continuam abrindo normalmente.',
  homeKindUp: 'Mover {name} para cima',
  homeKindDown: 'Mover {name} para baixo',
  homeKindsReset: 'Restaurar a ordem original',
} satisfies Record<keyof typeof zh, string>
