import type { zh } from './zh'

export const en = {
  docPickTitle: 'Attach from GenOffice documents',
  docPickOpen: 'Open documents',
  docPickRecent: 'Recent documents',
  docPickEmpty: 'There are no documents to attach.',
  docPickMissing: 'The file could not be found.',
  docPickUnsaved: 'Save it first.',
  docPickUnavailable: 'The document list could not be read.',
  docPickLimit: 'You can pick up to 20 documents.',
  docPickSelected: '{n} selected',
  docPickAttach: 'Attach',
  docPickCancel: 'Cancel',
  docPickWorking: 'Attaching…',
} satisfies Record<keyof typeof zh, string>
