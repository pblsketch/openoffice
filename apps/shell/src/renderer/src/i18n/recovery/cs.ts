import type { zh } from './zh'

export const cs = {
  title: 'Dokumenty s neuloženým obsahem',
  intro:
    'Tyto dokumenty stále obsahují obsah, který jste neuložili. U každého zvolte, zda ho obnovit, nebo zahodit. Zahozený obsah nelze získat zpět.',
  restore: 'Obnovit',
  discard: 'Zahodit',
  restoreAll: 'Obnovit vše',
  discardAll: 'Zahodit vše',
  confirm: 'Potvrdit',
  later: 'Rozhodnout později',
  laterHint: 'Zavřením tohoto seznamu se nic nesmaže; zeptáme se znovu později.',
  untitledFolder: 'Nový dokument, nikdy neuložený',
  lastCopy: 'Uchováno {time}',
  changedAfter: 'Soubor se poté změnil',
  changedAfterNote:
    'Mohl ho změnit jiný program nebo synchronizace s cloudem. Je vybráno „Zahodit“, aby soubor zůstal tak, jak je teď.',
  missing: 'Původní soubor nebyl nalezen',
  missingNote:
    'Po obnovení se otevře jako nový dokument bez názvu. Při ukládání bude nabídnuto původní umístění.',
  choiceLabel: 'Volba pro {name}',
} satisfies Record<keyof typeof zh, string>
