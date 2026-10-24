import type { zh } from './zh'

export const pl = {
  editUndo: 'Cofnij',
  editRedo: 'Ponów',
  editBold: 'Pogrubienie',
  editItalic: 'Kursywa',
  editReplace: 'Zamień',
  editReplaceWith: 'Zamień na',
  editReplaceOne: 'Zamień',
  editReplaceAll: 'Zamień wszystko',
  editReplaceDone: 'Zamieniono: {count}',
  editReplaceSkipped: 'Pominięto w rozdziałach tylko do odczytu: {count}',
  editReplaceFailed: 'Nie udało się zamienić: {count}',
  editReplaceNone: 'Nic do zamiany',
  editReplaceNotHere: 'Tego wystąpienia nie można zamienić',
  editAutoSave: 'Autozapis',
  editAutoSaveTip: 'Zapisuje co 30 sekund i gdy okno traci fokus',
  editUnsaved: 'Niezapisane zmiany',
  editLocked: 'Nie można edytować podczas tłumaczenia książki',
  editRefused: 'Nie udało się wprowadzić tej zmiany',
  editHistoryFailed: 'Historia cofania przestała pasować do książki i została wyczyszczona',
} satisfies Record<keyof typeof zh, string>
