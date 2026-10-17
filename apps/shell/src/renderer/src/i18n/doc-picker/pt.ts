import type { zh } from './zh'

export const pt = {
  docPickTitle: 'Anexar de documentos do GenOffice',
  docPickOpen: 'Documentos abertos',
  docPickRecent: 'Documentos recentes',
  docPickEmpty: 'Não há documentos para anexar.',
  docPickMissing: 'O arquivo não foi encontrado.',
  docPickUnsaved: 'Salve o arquivo primeiro.',
  docPickUnavailable: 'Não foi possível ler a lista de documentos.',
  docPickLimit: 'Você pode escolher até 20 documentos.',
  docPickSelected: '{n} selecionado(s)',
  docPickAttach: 'Anexar',
  docPickCancel: 'Cancelar',
  docPickWorking: 'Anexando…',
} satisfies Record<keyof typeof zh, string>
