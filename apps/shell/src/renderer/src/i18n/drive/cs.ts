import type { zh } from './zh'

export const cs = {
  driveNav: 'Disk Google',
  driveDesc:
    'Vyberte soubory na Disku Google a pak je otevírejte a upravujte v GenOffice; při uložení se vrátí na Disk. GenOffice může otevřít jen soubory, které vyberete.',
  driveConnect: 'Připojit Disk Google',
  driveConnecting: 'Přihlaste se v prohlížeči účtem Google a povolte přístup…',
  driveCancel: 'Zrušit',
  driveConnectedAs: 'Připojeno jako {email}',
  driveDisconnect: 'Odpojit',
  driveDisconnectConfirm:
    'Tím se z tohoto počítače odstraní přihlášení k Disku a Google dostane žádost o odebrání přístupu GenOffice. Kopie v tomto počítači zůstanou.',
  driveDisconnectYes: 'Odpojit',
  driveNotPersisted:
    'Tento počítač neumí uložit přihlášení zašifrované, takže připojení skončí po zavření aplikace.',
  driveExpired:
    'Google ukončil připojení: přístup byl odebrán nebo přihlášení vypršelo. Připojte se znovu.',
  driveAiAccess: 'Nechat AI vyhledávat a číst soubory na Disku',
  driveAiAccessDesc:
    'Když je zapnuto, AI v editorech může prohledávat a číst soubory z Disku, které jste zde vybrali. Co přečte, odchází poskytovateli AI, kterého používáte. AI nemůže soubory na Disku měnit, mazat ani sdílet.',
  drivePrivacy:
    'Seznamy a obsah souborů putují jen mezi tímto počítačem a Googlem. Nikdy neprocházejí serverem tvůrců GenOffice.',
  driveFailDenied: 'Připojení se nezdařilo, protože ho Google nepovolil.',
  driveFailScope:
    'Připojení se nezdařilo, protože přístup k Disku nebyl zaškrtnut. Připojte se znovu a zaškrtněte položku Disku.',
  driveFailTimeout: 'Přihlášení nebylo dokončeno do 10 minut. Zkuste to znovu.',
  driveFailNetwork: 'Google není dostupný. Zkontrolujte připojení k internetu a zkuste to znovu.',
  driveRecent: 'Vybrané soubory',
  driveSearchPlaceholder: 'Hledat ve vybraných souborech',
  driveSearchResults: 'Výsledky pro „{q}“',
  driveRefresh: 'Obnovit',
  driveNotConnectedTitle: 'Disk Google není připojen',
  driveNotConnectedBody:
    'Po připojení můžete vybrat soubory z Disku, otevírat je a upravovat zde a při uložení se vrátí na Disk.',
  driveOpenSettings: 'Připojit v Nastavení',
  driveEmpty: 'Zatím žádné soubory. Klikněte na „Vybrat z Disku Google“ a nějaké vyberte.',
  driveLoading: 'Načítání…',
  driveLoadMore: 'Zobrazit další',
  driveOpening: 'Otevírání…',
  driveGoogleBadge: 'Formát Google',
  driveGoogleNote:
    'Dokument Google se otevře jako soubor Office. Při uložení zůstane originál beze změny a vedle něj nebo do složky Můj disk se uloží soubor Office.',
  driveReadOnly: 'Jen ke čtení',
  driveReadOnlyNote:
    'Tento soubor nemůžete upravovat. Při uložení se zobrazí dotaz, zda uložit kopii na Disk.',
  driveUnsupported: 'Tato aplikace takový soubor otevřít neumí.',
  driveErrNotConnected: 'Disk Google je odpojen. Připojte ho znovu v Nastavení.',
  driveErrNotFound: 'Soubor nebyl nalezen. Byl smazán, nebo ho tento účet nevidí.',
  driveErrForbidden: 'Tento účet nesmí stáhnout tento soubor.',
  driveErrTooLarge: 'Soubor je příliš velký na otevření.',
  driveErrRateLimit: 'Google na chvíli zdržuje požadavky. Zkuste to za chvíli.',
  driveErrNetwork: 'Disk Google není dostupný. Zkontrolujte připojení k internetu.',
  driveErrDisk: 'Soubor se nepodařilo uložit do tohoto počítače.',
  drivePick: 'Vybrat z Disku Google',
  drivePicking: 'Vyberte soubory v okně Google, které se otevřelo v prohlížeči…',
  drivePickNote:
    'GenOffice může otevřít jen soubory z Disku, které vyberete v okně Google. Jednou vybrané soubory v tomto seznamu zůstanou.',
  driveTrainingTitle: 'Než použijete soubory z Disku s AI',
  driveTrainingBody:
    'Google nedovoluje posílat soubory z Disku službě AI, která na nich trénuje své modely. Osobní tarify Claude, ChatGPT a Codex mohou vaše konverzace používat k trénování, pokud to nevypnete: v Claude v Nastavení → Soukromí, v ChatGPT v Nastavení → Ovládací prvky dat → „Improve the model for everyone“. Poskytovatelé s klíčem API ve výchozím stavu na datech z API netrénují. Bezplatná připojení AI soubory z Disku nikdy nedostanou.',
  driveTrainingAck: 'V účtech AI, které používám se soubory z Disku, je trénování modelů vypnuté',
  driveFailTraining: 'Nejdřív zaškrtněte položku o trénování modelů výše.',
} satisfies Record<keyof typeof zh, string>
