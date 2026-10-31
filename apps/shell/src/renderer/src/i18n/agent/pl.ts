import type { zh } from './zh'

export const pl = {
  windowTitle: 'Agent',
  homeCardSub: 'Pracuj w folderze z Claude Code lub Codex',
  intro:
    'Agent uruchamia Twój Claude Code lub Codex w wybranym przez Ciebie folderze. Może czytać znajdujące się tam pliki, tworzyć nowe, korzystać z Twoich umiejętności, uruchamiać skrypty i zmieniać dokumenty otwarte w GenOffice.',
  folderLabel: 'Folder projektu',
  folderPick: 'Wybierz folder…',
  folderNone: 'Nie wybrano folderu',
  recentLabel: 'Ostatnie foldery',
  providerLabel: 'Program',
  providerClaude: 'Claude Code',
  providerCodex: 'Codex',
  providerClaudeNote:
    'W systemie Windows polecenia, na które pozwolisz, działają bez izolacji i mają dostęp do całego komputera oraz internetu.',
  providerCodexNote:
    'Polecenia działają w izolowanej przestrzeni Codex: zapisywać można tylko w folderze projektu i nie ma dostępu do internetu.',
  providerBlocked:
    'Jeszcze niedostępne: nie da się jeszcze zablokować Codexowi odczytu własnego pliku logowania.',
  connChecking: 'Sprawdzanie połączenia…',
  connUnavailable: 'Brak połączenia. Zaloguj się w Ustawienia → AI.',
  connMetered: 'Zalogowano kontem rozliczanym za użycie, zaakceptowanym przez Ciebie.',
  modeLabel: 'Kiedy pytać',
  modeAskCommands: 'Pytaj przed każdym poleceniem',
  modeAskCommandsDesc:
    'Odczyt i zapis plików w folderze projektu odbywa się od razu. Przed uruchomieniem polecenia lub skryptu agent zapyta.',
  modeAskWrites: 'Pytaj przed zapisem i poleceniami',
  modeAskWritesDesc:
    'Od razu odbywa się tylko odczyt. Przed zapisem pliku i przed uruchomieniem polecenia agent zapyta.',
  modeTrust: 'Ufaj temu projektowi',
  modeTrustDesc:
    'Agent o nic nie pyta. Codex nadal pozostaje w swojej izolowanej przestrzeni; w Claude Code każdą czynność zamiast Ciebie sprawdza jego własny weryfikator.',
  warningTitle: 'Zanim zaczniesz',
  warningCommands:
    'Polecenia uruchamiane przez agenta mogą zmieniać pliki i korzystać z internetu. Dokument, który ktoś Ci przysłał, może zawierać ukryte instrukcje.',
  warningRedaction:
    'Fragmenty ukryte przed AI pozostają ukryte tylko w dokumentach otwartych w GenOffice. Pliki, które agent czyta z folderu, są wysyłane bez zmian.',
  warningUsage: 'Agent pracuje w wielu krokach i zużywa więcej limitu subskrypcji niż panel AI.',
  warningAccept: 'Rozumiem',
  start: 'Rozpocznij',
  starting: 'Uruchamianie…',
  stop: 'Zatrzymaj',
  newSession: 'Nowa sesja',
  send: 'Wyślij',
  inputPlaceholder: 'Co ma zrobić agent?',
  you: 'Ty',
  agent: 'Agent',
  startedLine: 'Uruchomiono {program} w folderze {folder}',
  skillsLine: 'Dostępne umiejętności: {n}',
  skillsLineOne: 'Dostępna {n} umiejętność',
  toolRunning: 'W toku',
  toolDone: 'Gotowe',
  toolFailed: 'Niepowodzenie',
  toolDenied: 'Odrzucono',
  actRead: 'Odczyt',
  actWrite: 'Zapis',
  actCommand: 'Uruchomienie',
  actAppTool: 'Edycja otwartego dokumentu',
  actSkill: 'Użycie umiejętności',
  actOther: 'Użycie narzędzia',
  openFile: 'Otwórz',
  permTitle: 'Agent prosi o zgodę na:',
  permCommand: 'Uruchomienie tego polecenia',
  permWrite: 'Zapis do tego pliku',
  permRead: 'Odczyt pliku spoza folderu projektu',
  permOther: 'Użycie narzędzia „{tool}”',
  permReason: 'Powód: {reason}',
  permAllow: 'Zezwól',
  permDeny: 'Odrzuć',
  turnFailed: 'Agent nie mógł dokończyć tego zadania.',
  ended: 'Sesja została zakończona.',
  errBadFolder:
    'Tego folderu nie można użyć. Wybierz folder ze swoją pracą: nie cały dysk, nie folder domowy i nie folder z danymi logowania lub aplikacji.',
  errNotConnected:
    'Ten program nie jest połączony. Zaloguj się w Ustawienia → AI i spróbuj ponownie.',
  errNotAccepted: 'Najpierw przeczytaj powyższe uwagi i je potwierdź.',
  errUnsafeTools:
    'Program uruchomił się z narzędziami, których aplikacja mu nie dała, więc został zatrzymany.',
  errRateLimit: 'Limit subskrypcji został wyczerpany. Spróbuj ponownie później.',
  errSignedOut: 'Program jest wylogowany. Zaloguj się w Ustawienia → AI.',
  errMetered: 'Program jest zalogowany kontem rozliczanym za użycie, na które nie wyrażono zgody.',
  errSandboxUnavailable:
    'Codex nie może otworzyć na tym komputerze piaskownicy, która izoluje jego polecenia, więc nie został uruchomiony. Zaktualizuj system Windows albo wybierz Claude Code.',
  errNeedsUpdate: 'Program jest zbyt stary na tryb agenta. Zaktualizuj go i spróbuj ponownie.',
  errNotInstalled: 'Program nie jest zainstalowany.',
  errGeneric: 'Coś poszło nie tak. Spróbuj ponownie.',
  documentsUnprotected:
    'Dokumenty otwarte po rozpoczęciu sesji ({n}) nie są objęte ochroną zapisu programu. Zatrzymaj i uruchom sesję ponownie, aby je chronić.',
} satisfies Record<keyof typeof zh, string>
