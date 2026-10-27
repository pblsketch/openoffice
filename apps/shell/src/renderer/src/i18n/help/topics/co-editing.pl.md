# Wspólna edycja w sieci

Osoby w tej samej sieci (LAN) mogą razem otworzyć jeden dokument, edytować go jednocześnie i widzieć nawzajem swoje kursory i imiona. Nie potrzeba serwera ani konta: sesję prowadzi komputer, który udostępnia dokument, i tylko on zapisuje plik.

## Udostępnianie dokumentu

1. Otwórz dokument i kliknij **Współpraca** na pasku narzędzi edytora.
2. Wpisz **Moje imię** i wybierz **Mój kolor**. Inni widzą je obok Twojego kursora.
3. Kliknij **Rozpocznij udostępnianie**. Pojawią się 6-cyfrowy **PIN** i **Adres tego komputera**.
4. Przekaż PIN osobom, które mają dołączyć, a jeśli nie mogą znaleźć dokumentu, także adres.

Jeśli dokument ma niezapisane zmiany, najpierw go zapisz. Dokumentów chronionych hasłem nie można udostępniać. **Nowy PIN** nadaje dokumentowi nowy PIN; osoby, które już dołączyły, pozostają w sesji.

Aby zakończyć, otwórz ponownie okno **Współpraca** i kliknij **Zatrzymaj udostępnianie**. Każda osoba, która dołączyła, zachowuje niezapisaną kopię na swoim komputerze.

## Dołączanie

1. W dowolnym edytorze kliknij **Współpraca** i przejdź na kartę **Dołącz**.
2. Wybierz dokument w sekcji **Znalezione** albo wpisz adres komputera udostępniającego w polu **Adres**.
3. Wpisz PIN i kliknij **Dołącz**. Udostępniony dokument otworzy się w nowej karcie.

Podczas uczestnictwa plik zapisuje osoba udostępniająca. Twoje polecenie Zapisz nic nie robi i informuje Cię o tym, a karta nigdy nie pyta o zapisanie przy zamykaniu. **Opuść** wyprowadza Cię z sesji. Gdy sesja się kończy, karta pozostaje otwarta jako niezapisana kopia, którą możesz zapisać w dowolnym miejscu.

## Wspólna praca nad dokumentem

- Kursor lub zaznaczenie każdej osoby jest wyświetlane w jej kolorze, razem z jej imieniem.
- Cofnij cofa tylko Twoje własne zmiany.
- Niektóre funkcje są wyłączone podczas sesji, na przykład te, które zmieniają części dokumentu inne niż jego treść. Edytor informuje, gdy odmawia wykonania którejś z nich.
- W edytorze Hangul edytować może tylko osoba udostępniająca. Osoby, które dołączyły, oglądają zmiany na żywo.
- Pliki zwykłego tekstu i JSON otwierają się w widoku źródła edytora Markdown i nie można ich jeszcze udostępniać.

## Bezpieczeństwo

- PIN nigdy nie jest wysyłany przez sieć. Jest sprawdzany za pomocą wymiany kluczy, a wszystko, co następuje potem, jest szyfrowane. Inni w sieci nie mogą odczytać dokumentu, zmian ani PIN-u.
- Po 5 błędnych PIN-ach z jednego komputera ten komputer musi odczekać 10 minut. Po łącznie 20 błędnych PIN-ach każdy udostępniony dokument dostaje nowy PIN, a osoba udostępniająca jest o tym powiadamiana.
- Do jednego dokumentu może dołączyć do 16 osób.
- Podczas udostępniania Twoje imię i tytuł dokumentu są ogłaszane w sieci, aby inni mogli go znaleźć.
- Przy pierwszym udostępnianiu Zapora systemu Windows może poprosić o zgodę. Zezwól na dostęp w sieciach prywatnych. Jeśli zablokujesz dostęp, inne komputery nie będą mogły się połączyć.
