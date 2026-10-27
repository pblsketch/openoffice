import type { zh } from './zh'

export const pl = {
  button: 'Współpraca',
  dialogTitle: 'Współpraca',
  tabShare: 'Udostępnij ten dokument',
  tabJoin: 'Dołącz',
  nameLabel: 'Moje imię',
  nameHint: 'Wyświetlane obok twojego kursora na ekranach innych osób.',
  colorLabel: 'Mój kolor',
  colorChoice: 'Kolor {n}',
  shareIntro:
    'Osoby w tej samej sieci (LAN) mogą po wpisaniu kodu PIN przeglądać i edytować ten dokument razem z tobą. Plik jest zapisywany tylko na tym komputerze.',
  shareStart: 'Rozpocznij udostępnianie',
  shareStarting: 'Uruchamianie…',
  shareStop: 'Zatrzymaj udostępnianie',
  pinLabel: 'PIN',
  pinNew: 'Nowy PIN',
  pinChanged:
    'Wpisano zbyt wiele błędnych kodów PIN, więc PIN został zmieniony. Osoby, które już dołączyły, pozostają w sesji.',
  addressLabel: 'Adres tego komputera',
  peopleLabel: 'Uczestnicy',
  nobodyYet: 'Nikt jeszcze nie dołączył.',
  you: 'ty',
  hostBadge: 'udostępnia',
  joinIntro:
    'Wpisz PIN otrzymany od osoby udostępniającej. Wybierz dokument znaleziony w tej sieci albo wpisz adres.',
  searching: 'Wyszukiwanie udostępnionych dokumentów w tej sieci…',
  foundLabel: 'Znalezione',
  foundBy: 'udostępnia: {name}',
  addressInput: 'Adres',
  addressPlaceholder: 'np. 192.168.0.12',
  pinInput: 'PIN (6 cyfr)',
  join: 'Dołącz',
  joining: 'Łączenie…',
  close: 'Zamknij',
  leave: 'Opuść',
  errPin: 'Ten PIN jest nieprawidłowy.',
  errLocked: 'Zbyt wiele błędnych kodów PIN. Ten komputer nie może ponowić próby przez 10 minut.',
  errFull: 'Ta sesja jest pełna.',
  errVersion:
    'Na drugim komputerze działa inna wersja aplikacji. Zaktualizuj oba komputery do tej samej wersji.',
  errUnreachable:
    'Nie udało się połączyć z tym adresem. Sprawdź adres, sieć i zaporę komputera udostępniającego.',
  errTimeout: 'Komputer udostępniający nie odpowiada.',
  errInvalid: 'Sprawdź adres i PIN.',
  errUnavailable: 'Nie udało się otworzyć tego dokumentu na tym komputerze.',
  errShareNetwork:
    'Nie udało się rozpocząć udostępniania na tym komputerze. Sprawdź, czy inny program nie blokuje sieci.',
  errShareTooLarge: 'Ten dokument jest za duży, aby go udostępnić.',
  errShareBusy: 'Ta karta już uczestniczy w sesji.',
  errShareSaveFirst: 'Masz niezapisane zmiany. Najpierw zapisz, a potem udostępnij.',
  errShareEncrypted: 'Nie można udostępnić dokumentu chronionego hasłem.',
  errShareUnsupported: 'Tego dokumentu nie można teraz udostępnić.',
  endedByHost:
    'Osoba udostępniająca zakończyła sesję. Ten dokument jest teraz niezapisaną kopią na tym komputerze.',
  endedLost:
    'Utracono połączenie z komputerem udostępniającym. Ten dokument jest teraz niezapisaną kopią na tym komputerze.',
  endedLeft: 'Opuszczono sesję. Ten dokument jest teraz niezapisaną kopią na tym komputerze.',
  endedHostStopped: 'Udostępnianie zatrzymane.',
  guestSaveBlocked: 'Podczas sesji plik zapisuje osoba udostępniająca.',
  guestBlocked: 'Ta funkcja jest niedostępna podczas sesji.',
  hostBlocked: 'Ta funkcja jest niedostępna, gdy w sesji są inne osoby.',
  viewOnly:
    'W tym formacie edytować może tylko osoba udostępniająca, a pozostali oglądają zmiany na żywo.',
  lanNotice:
    'Przesyłane treści są szyfrowane, więc odczytać je mogą tylko osoby, które wpisały PIN. Podczas udostępniania twoje imię i tytuł dokumentu są widoczne w sieci.',
  firewallHint:
    'Jeśli przy pierwszym udostępnianiu Zapora systemu Windows zapyta o zgodę, zezwól na dostęp w sieciach prywatnych.',
  statusHosting: 'Udostępnianie · {count}',
  statusGuest: 'W dokumencie: {name}',
  dismiss: 'Rozumiem',
} satisfies Record<keyof typeof zh, string>
