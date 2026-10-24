import type { zh } from './zh'

export const cs = {
  editUndo: 'Zpět',
  editRedo: 'Znovu',
  editBold: 'Tučné',
  editItalic: 'Kurzíva',
  editReplace: 'Nahradit',
  editReplaceWith: 'Nahradit čím',
  editReplaceOne: 'Nahradit',
  editReplaceAll: 'Nahradit vše',
  editReplaceDone: 'Nahrazeno: {count}',
  editReplaceSkipped: 'Přeskočeno v kapitolách jen pro čtení: {count}',
  editReplaceFailed: 'Nepodařilo se nahradit: {count}',
  editReplaceNone: 'Není co nahradit',
  editReplaceNotHere: 'Tento výskyt nelze nahradit',
  editAutoSave: 'Automatické ukládání',
  editAutoSaveTip: 'Ukládá každých 30 sekund a když okno ztratí fokus',
  editUnsaved: 'Neuložené změny',
  editLocked: 'Během překladu knihy nelze upravovat',
  editRefused: 'Tuto změnu se nepodařilo provést',
  editHistoryFailed: 'Historie kroků zpět už neodpovídala knize, a proto byla vymazána',
} satisfies Record<keyof typeof zh, string>
