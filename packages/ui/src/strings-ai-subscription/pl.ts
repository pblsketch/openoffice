import type { zh } from './zh'

export const pl = {
  aiAssistant: 'Asystent AI',
  cardChecking: 'Sprawdzanie…',
  cardNotInstalled: 'Nie zainstalowano',
  cardSignedOut: 'Nie zalogowano',
  cardSigningIn: 'Logowanie…',
  cardReady: 'Połączono',
  cardReadyPlan: 'Połączono · {plan}',
  cardMetered: 'Zalogowano, ale nie w ramach subskrypcji',
  cardMeteredAccepted: 'W użyciu · opłata za zużycie',
  cardError: 'Nie udało się sprawdzić połączenia',
  cardErrNeedsUpdate:
    'Program {provider} na tym komputerze jest zbyt stary. Zaktualizuj go, a potem sprawdź ponownie.',
  cardErrNeedsUpdateVersion:
    'Program {provider} na tym komputerze ({version}) jest zbyt stary; potrzebna jest wersja {minimum} lub nowsza. Uruchom {command} w terminalu, a potem sprawdź ponownie.',
  cardErrNeedsUpdatePath: 'Plik uruchamiany przez tę aplikację:',
  cardErrNeedsUpdateWindows:
    'Aktualizacja {provider} w WSL (Ubuntu) lub w innym folderze nie zmienia tego pliku. Uruchom {command} w Windows PowerShell.',
  cardErrTimeout: 'Program {provider} nie odpowiedział na czas. Sprawdź ponownie za chwilę.',
  cardErrFailed: 'Podczas sprawdzania {provider} wystąpił problem. Sprawdź ponownie.',
  actionInstall: 'Zainstaluj',
  actionLogin: 'Zaloguj się',
  actionLoginWindow: 'Przeglądarka się nie otworzyła albo pokazuje kod?',
  actionRecheck: 'Sprawdź ponownie',
  actionAcceptMetered: 'Użyj mimo to',
  actionInstallHelp: 'Oficjalna instrukcja instalacji',
  actionOpenSettings: 'Otwórz ustawienia',
  actionDismiss: 'Zamknij',
  actionSwitchAccount: 'Zaloguj się na inne konto',
  actionLogout: 'Wyloguj się',
  installNote:
    'Oficjalne polecenie instalacji firmy {vendor} zostanie uruchomione w nowym oknie terminala.',
  loginNote: 'Strona logowania, która się otworzy, należy do firmy {vendor}.',
  signingInBrowserNote:
    'Zaloguj się na swoje konto {vendor} w otwartej przeglądarce i zezwól na dostęp. Połączenie nastąpi samo, gdy skończysz.',
  signingInWindowNote:
    'Jeśli przeglądarka się nie otworzyła, skopiuj adres widoczny w oknie, które właśnie się otworzyło, i otwórz go w przeglądarce. Gdy przeglądarka pokaże kod, skopiuj go, wklej raz w tym oknie i naciśnij Enter. Wklejony kod może nie być widoczny w oknie.',
  meteredWarning: 'To nie jest subskrypcja: płacisz za faktyczne zużycie.',
  meteredMeaning:
    'To logowanie korzysta z klucza API lub konta rozliczanego za zużycie albo nie udało się ustalić jego rodzaju. Po wybraniu „Użyj mimo to” AI będzie działać przez to połączenie, a każde żądanie obciąży to konto.',
  connectTitle: 'Połącz AI, aby zacząć',
  connectBody:
    'AI działa w ramach subskrypcji Claude lub Codex, którą już masz. Klucz API nie jest potrzebny.',
  connectProviderTitle: 'Połączenie {provider} jest teraz niedostępne',
  connectKeyBody:
    'Konfiguracja dostawcy {provider} nie została ukończona. Dokończ ją w Ustawieniach lub wybierz inne AI.',
  errNotConnected:
    'Żadne AI nie jest połączone. Najpierw połącz subskrypcję Claude lub Codex albo darmowe AI.',
  errNotInstalled: 'Na tym komputerze nie znaleziono programu {provider}.',
  errSignedOut: 'Logowanie do {provider} wygasło. Zaloguj się ponownie, aby kontynuować.',
  errRateLimit: 'Limit subskrypcji {provider} został wyczerpany.',
  errRateLimitReset: 'Limit subskrypcji {provider} został wyczerpany. Odnowi się o {time}.',
  errUnsafeTools:
    'Program {provider} uruchomił się z włączonymi własnymi narzędziami, więc ze względów bezpieczeństwa zatrzymano działanie.',
  errMeteredNotAccepted:
    'Połączenie {provider} jest rozliczane za zużycie i nie zostało jeszcze dopuszczone. Aby z niego korzystać, wybierz „Użyj mimo to” w ustawieniach połączenia.',
  errNeedsUpdate:
    'Program {provider} jest zbyt stary dla tej funkcji. Zaktualizuj go i spróbuj ponownie.',
  errHeadlessLimit: 'Osiągnięto godzinny limit żądań automatycznych.',
  errHeadlessLimitReset:
    'Osiągnięto godzinny limit żądań automatycznych. Będą znów możliwe o {time}.',
  connectFreeHint: 'Nie masz subskrypcji? W Ustawieniach połączysz darmowe AI w około minutę.',
  actionConnectFree: 'Połącz darmowe AI',
  errFreeLimit:
    'Dzisiejszy darmowy limit został wykorzystany. Spróbuj ponownie jutro lub wybierz inne AI w Ustawieniach.',
  errFreeLimitReset:
    'Dzisiejszy darmowy limit został wykorzystany. Możesz znów korzystać o {time}.',
  continueWith: 'Kontynuuj z {provider}',
  continueMeteredNote:
    'Połączenie {provider} nie jest subskrypcją: dalsza praca jest płatna za zużycie.',
  usageLine: 'Wykorzystano {percent}% · odnowienie o {time}',
  usageWindowFiveHour: 'Limit 5-godzinny',
  usageWindowSevenDay: 'Limit 7-dniowy',
  noticeTitle: 'Zanim użyjesz AI w ramach subskrypcji',
  noticeSend:
    'Treść dokumentu i rozmowa są wysyłane do Anthropic lub OpenAI z Twojego własnego konta. Każde żądanie zawiera też nazwę, tytuł i opis każdej umiejętności ustawionej na „Decyduje AI”; wysyłane są też używane umiejętności i pliki umiejętności odczytane przez AI.',
  noticeTraining:
    'To, czy te treści służą do trenowania AI, zależy od ustawień Twojego konta w danej firmie.',
  noticeCodexHistory:
    'Ta aplikacja wyłącza zapisywanie historii rozmów w Codex, ale Codex może nadal przechowywać własne dzienniki diagnostyczne na tym komputerze.',
  noticePdfWholeDocument:
    'W edytorze PDF odczytywanie stron przez AI i tłumaczenie dokumentu mogą wysyłać obrazy stron i cały tekst dokumentu.',
  noticeAck: 'Rozumiem',
  codexNotice:
    'Korzystanie z subskrypcji Codex wewnątrz aplikacji nie jest metodą oficjalnie zalecaną przez OpenAI.',
  truncatedNotice:
    'Dane wejściowe były zbyt długie, więc ich część została obcięta przed wysłaniem.',
  pickerAuto: 'Automatycznie',
  pickerAutoUsing: 'Automatycznie · {provider}',
  pickerAutoUsingModel: 'Automatycznie · {provider} · {model}',
  pickerDefaultModel: 'Model domyślny',
  pickerDefaultModelNamed: 'Model domyślny · {model}',
  pickerSubscription: 'Subskrypcja',
  pickerPaid: 'Płatne',
  pickerPaidTitle: 'Opłata za zużycie, nieobjęte subskrypcją',
  pickerNotConnected: 'Połącz AI',
  guideQuestion: 'Z jakiego AI już korzystasz?',
  guidePathClaudeTitle: 'Mam płatną subskrypcję Claude',
  guidePathClaudeBody:
    'Potrzebny jest plan Pro lub Max. Darmowe konto Claude nie może się połączyć.',
  guidePathCodexTitle: 'Korzystam z ChatGPT',
  guidePathCodexBody:
    'Zaloguj się do programu Codex firmy OpenAI kontem ChatGPT. Darmowy plan pozwala tylko na niewielkie użycie.',
  guidePathFreeTitle: 'Jeszcze z żadnego',
  guidePathFreeBody:
    'Połącz darmowe AI w około minutę. Dopóki korzystasz z niego za darmo, wysyłane treści mogą posłużyć do ulepszania AI tej firmy.',
  guideBack: 'Wybierz inny sposób',
  guideBadgeReady: 'Połączono',
  guideBadgeInstalled: 'Zainstalowano',
  guideBadgeCheck: 'Do sprawdzenia',
  guideStepsLabel: 'Kroki połączenia',
  stepInstall: 'Instalacja programu',
  stepLogin: 'Logowanie',
  stepReady: 'Połączono',
  installReturnNote:
    'Gdy instalacja w tamtym oknie się zakończy, wróć tutaj. Aplikacja sama sprawdzi ponownie.',
  loginHowNote:
    'Po kliknięciu otworzy się przeglądarka. Zaloguj się na konto {vendor} i kliknij Zezwól, a połączenie nastąpi samo.',
  signingInStalledNote:
    'Przeglądarka się nie otworzyła albo pokazuje kod? Otwórz okno logowania przyciskiem poniżej. Wklej adres z tego okna do przeglądarki albo wklej kod z przeglądarki do okna.',
  actionLoginWindowOpen: 'Otwórz okno logowania',
  actionCancelLogin: 'Anuluj logowanie',
  actionUpdate: 'Zaktualizuj',
  updateNote:
    'Po kliknięciu oficjalna aktualizacja firmy {vendor} uruchomi się w nowym oknie. Gdy się tam zakończy, wróć tutaj.',
  guideInfoHint:
    'Nadal nie działa? Skopiuj informacje o połączeniu i wyślij je osobie, która Ci pomaga. Nie zawierają konta ani ścieżek plików.',
  actionCopyInfo: 'Kopiuj informacje dla pomocy',
  copyInfoDone: 'Skopiowano',
  actionConnectHelp: 'Zobacz każdy krok na ekranie (strona po koreańsku)',
} satisfies Record<keyof typeof zh, string>
