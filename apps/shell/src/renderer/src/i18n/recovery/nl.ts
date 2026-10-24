import type { zh } from './zh'

export const nl = {
  title: 'Documenten met niet-opgeslagen inhoud',
  intro:
    'Deze documenten bevatten nog inhoud die u niet hebt opgeslagen. Kies per document of u het wilt herstellen of verwerpen. Verworpen inhoud kan niet worden teruggehaald.',
  restore: 'Herstellen',
  discard: 'Verwerpen',
  restoreAll: 'Alles herstellen',
  discardAll: 'Alles verwerpen',
  confirm: 'Toepassen',
  later: 'Later beslissen',
  laterHint: 'Als u deze lijst sluit, wordt er niets verwijderd; u krijgt de vraag later opnieuw.',
  untitledFolder: 'Nieuw document, nooit opgeslagen',
  lastCopy: 'Bewaard op {time}',
  changedAfter: 'Het bestand is daarna gewijzigd',
  changedAfterNote:
    'Een ander programma of cloudsynchronisatie heeft het misschien gewijzigd. "Verwerpen" is geselecteerd zodat het bestand blijft zoals het nu is.',
  missing: 'Oorspronkelijk bestand niet gevonden',
  missingNote:
    'Bij herstellen opent het als nieuw document zonder titel. Bij opslaan wordt de oorspronkelijke locatie voorgesteld.',
  choiceLabel: 'Keuze voor {name}',
} satisfies Record<keyof typeof zh, string>
