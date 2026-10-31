import type { zh } from './zh'

export const pl = {
  driveNav: 'Dysk Google',
  driveDesc:
    'Wybieraj pliki na Dysku Google, a potem otwieraj i edytuj je w GenOffice; po zapisaniu wracają na Dysk. GenOffice może otworzyć tylko wybrane przez Ciebie pliki.',
  driveConnect: 'Połącz z Dyskiem Google',
  driveConnecting: 'Zaloguj się na konto Google w przeglądarce i zezwól na dostęp…',
  driveCancel: 'Anuluj',
  driveConnectedAs: 'Połączono jako {email}',
  driveDisconnect: 'Rozłącz',
  driveDisconnectConfirm:
    'Logowanie do Dysku zostanie usunięte z tego komputera, a Google otrzyma prośbę o cofnięcie dostępu GenOffice. Kopie na tym komputerze pozostaną.',
  driveDisconnectYes: 'Rozłącz',
  driveNotPersisted:
    'Ten komputer nie może przechowywać logowania w postaci zaszyfrowanej, więc połączenie kończy się po zamknięciu aplikacji.',
  driveExpired:
    'Google zakończył połączenie: dostęp został cofnięty lub logowanie wygasło. Połącz ponownie.',
  driveAiAccess: 'Pozwól AI wyszukiwać i czytać pliki na Dysku',
  driveAiAccessDesc:
    'Po włączeniu AI w edytorach może przeszukiwać i czytać pliki z Dysku wybrane tutaj. To, co przeczyta, trafia do używanego dostawcy AI. AI nie może zmieniać, usuwać ani udostępniać plików na Dysku.',
  drivePrivacy:
    'Listy i zawartość plików przesyłane są tylko między tym komputerem a Google. Nigdy nie przechodzą przez serwer twórców GenOffice.',
  driveFailDenied: 'Nie połączono, ponieważ Google na to nie zezwolił.',
  driveFailScope:
    'Nie połączono, ponieważ dostęp do Dysku nie został zaznaczony. Połącz ponownie i zaznacz pozycję Dysku.',
  driveFailTimeout: 'Logowanie nie zakończyło się w ciągu 10 minut. Spróbuj ponownie.',
  driveFailNetwork:
    'Nie można połączyć się z Google. Sprawdź połączenie z internetem i spróbuj ponownie.',
  driveRecent: 'Wybrane pliki',
  driveSearchPlaceholder: 'Szukaj w wybranych plikach',
  driveSearchResults: 'Wyniki dla „{q}”',
  driveRefresh: 'Odśwież',
  driveNotConnectedTitle: 'Dysk Google nie jest połączony',
  driveNotConnectedBody:
    'Po połączeniu możesz wybrać pliki z Dysku, otwierać je i edytować tutaj, a po zapisaniu wracają na Dysk.',
  driveOpenSettings: 'Połącz w Ustawieniach',
  driveEmpty: 'Nie ma jeszcze plików. Kliknij „Wybierz z Dysku Google”, aby je wybrać.',
  driveLoading: 'Wczytywanie…',
  driveLoadMore: 'Pokaż więcej',
  driveOpening: 'Otwieranie…',
  driveGoogleBadge: 'Format Google',
  driveGoogleNote:
    'Dokument Google otwiera się jako plik Office. Po zapisaniu oryginał pozostaje bez zmian, a obok niego albo w folderze „Mój dysk” zapisywany jest plik Office.',
  driveReadOnly: 'Tylko do odczytu',
  driveReadOnlyNote:
    'Nie możesz edytować tego pliku. Przy zapisie pojawi się pytanie, czy zapisać kopię na Dysku.',
  driveUnsupported: 'Ta aplikacja nie może otworzyć tego rodzaju pliku.',
  driveErrNotConnected: 'Dysk Google został rozłączony. Połącz go ponownie w Ustawieniach.',
  driveErrNotFound: 'Nie znaleziono pliku. Został usunięty albo to konto go nie widzi.',
  driveErrForbidden: 'To konto nie może pobrać tego pliku.',
  driveErrTooLarge: 'Plik jest za duży, aby go otworzyć.',
  driveErrRateLimit: 'Google chwilowo wstrzymuje żądania. Spróbuj za moment.',
  driveErrNetwork: 'Nie można połączyć się z Dyskiem Google. Sprawdź połączenie z internetem.',
  driveErrDisk: 'Nie udało się zapisać pliku na tym komputerze.',
  drivePick: 'Wybierz z Dysku Google',
  drivePicking: 'Wybierz pliki w oknie Google, które otworzyło się w przeglądarce…',
  drivePickNote:
    'GenOffice może otworzyć tylko te pliki z Dysku, które wybierzesz w oknie Google. Raz wybrane pliki zostają na tej liście.',
  driveTrainingTitle: 'Zanim użyjesz plików z Dysku z AI',
  driveTrainingBody:
    'Google nie pozwala przekazywać plików z Dysku do usługi AI, która trenuje na nich swoje modele. Osobiste plany Claude, ChatGPT i Codex mogą używać Twoich rozmów do trenowania, jeśli tego nie wyłączysz: w Claude w Ustawienia → Prywatność, w ChatGPT w Ustawienia → Kontrola danych → „Improve the model for everyone”. Dostawcy z kluczem API domyślnie nie trenują na danych z API. Darmowe połączenia AI nigdy nie dostają plików z Dysku.',
  driveTrainingAck:
    'Trenowanie modeli jest wyłączone na kontach AI, których używam z plikami z Dysku',
  driveFailTraining: 'Najpierw zaznacz powyżej pozycję o trenowaniu modeli.',
} satisfies Record<keyof typeof zh, string>
