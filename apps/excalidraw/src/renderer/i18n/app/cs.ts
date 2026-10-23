import type { zh } from './zh'

export const cs = {
  loading: 'Otevírání kresby…',
  openFailedTitle: 'Tuto kresbu nelze otevřít',
  openFailedNotDrawing: 'Tento soubor není kresba Excalidraw.',
  openFailedUnreadable: 'Soubor nelze přečíst. Může být poškozený.',
  openFailedTooLarge: 'Soubor je příliš velký na otevření.',
  openFailedError: 'Při otevírání souboru došlo k potížím.',
  saveFailed: 'Kresbu se nepodařilo uložit.',
  picturesMissing: 'V trezoru poznámky nebyly nalezeny obrázky, které kresba používá: {count}.',
  picturesNotInNote: 'Do kresby Obsidian zde zatím nelze přidávat obrázky.',
  linkNotOpened: 'Tento odkaz nelze otevřít.',
  autoSave: 'Automatické ukládání',
} satisfies Record<keyof typeof zh, string>
