# Dysk Google

Połącz Dysk Google, aby otwierać w GenOffice wybrane przez siebie pliki z Dysku i je edytować. Po zapisaniu plik wraca na Dysk. GenOffice może otworzyć tylko pliki wybrane w oknie Google; pozostałych plików na Twoim Dysku nie widzi.

## Łączenie

1. Otwórz **Ustawienia ▸ Integracje**.
2. Przeczytaj **Zanim użyjesz plików z Dysku z AI**, wyłącz trenowanie modeli na kontach AI, których używasz z plikami z Dysku, a potem zaznacz tę pozycję.
   - Claude: w **Ustawienia ▸ Prywatność** w Claude wyłącz trenowanie modeli.
   - ChatGPT i Codex: w **Ustawienia ▸ Kontrola danych** w ChatGPT wyłącz **Improve the model for everyone**.
   - Dostawcy z kluczem API domyślnie nie używają danych z API do trenowania.
   - Darmowe połączenia AI (darmowe modele OpenRouter, Gemini) nigdy nie dostają plików z Dysku.
3. Kliknij **Połącz z Dyskiem Google**. W przeglądarce otworzy się strona logowania Google. Zaloguj się i zezwól na dostęp.
4. Wróć do GenOffice. Karta pokazuje połączone konto.

Google nie pozwala przekazywać plików z Dysku do usługi AI, która trenuje na nich swoje modele, dlatego dopóki pozycja nie jest zaznaczona, nie można się połączyć ani wybrać plików.

Logowanie jest przechowywane na tym komputerze z szyfrowaniem, które system operacyjny zapewnia Twojemu kontu użytkownika (ochrona Windows, pęk kluczy macOS albo pęk kluczy pulpitu w Linuksie). Jeśli ten komputer nie może go zaszyfrować, połączenie trwa tylko do zamknięcia aplikacji.

## Otwieranie plików z Dysku

- Kliknij **Dysk Google** na pasku bocznym strony głównej, a potem **Wybierz z Dysku Google**.
- W przeglądarce otworzy się okno wyboru plików Google. Wybierz pliki do otwarcia (można kilka naraz); GenOffice wróci na wierzch i otworzy je w odpowiednim edytorze.
- Raz wybrane pliki zostają na liście **Wybrane pliki**. Możesz otwierać je stamtąd ponownie albo wyszukiwać po nazwie i treści.
- Formaty, których GenOffice nie otworzy, są przygaszone. Dokumenty, Arkusze i Prezentacje Google otwierają się jako pliki Word, Excel i PowerPoint.

## Zapisywanie z powrotem na Dysku

- Zapisuj jak zwykle. Po chwili plik zostanie wysłany na Dysk.
- Jeśli ktoś zmienił plik na Dysku po jego otwarciu, pojawi się pytanie, czy zastąpić plik na Dysku, zapisać kopię na Dysku, czy zachować zmianę tylko na tym komputerze.
- Plik, który możesz tylko oglądać, zapisuje się na Dysku jako kopia albo zostaje na tym komputerze.
- Dokument Google pozostaje bez zmian. Twoje zmiany zapisują się jako plik Office w tym samym folderze albo w folderze „Mój dysk”, jeśli do tamtego folderu nie można zapisywać.
- Jeśli wysyłanie się nie uda, zmiany zostają na tym komputerze, a GenOffice próbuje ponownie, także przy następnym uruchomieniu aplikacji.

## AI i Dysk

- W panelu AI edytorów Word, Excel, PowerPoint, HTML, map myśli i Hangul kliknij **Załącz z Dysku Google** obok przycisku załączania, aby wybrać pliki w oknie Google w przeglądarce i załączyć je jak pliki z tego komputera. Do 20 naraz.
- Dopóki opcja **Pozwól AI wyszukiwać i czytać pliki na Dysku** jest włączona (włącza się po połączeniu), AI w każdym edytorze może przeszukiwać i czytać pliki z Dysku wybrane w GenOffice. Na przykład: „Znajdź na moim Dysku notatki ze spotkania z zeszłego miesiąca i streść je”. Jeśli pliku nie da się znaleźć, najpierw wybierz go na stronie głównej.
- To, co przeczyta AI, trafia do używanego dostawcy AI. Części ukryte przed AI pozostają ukryte.
- Gdy używane AI jest darmowym połączeniem, załączanie z Dysku i czytanie Dysku przez AI nie działają.
- AI nie może zmieniać, usuwać ani udostępniać plików na Dysku.
- Gdy rozmowa zawiera treść przeczytaną z Dysku, ta rozmowa przestaje korzystać z wyszukiwania w sieci, wyszukiwania obrazów, czytania stron z adresu internetowego i wstawiania obrazów z adresu internetowego. Zacznij nową rozmowę, aby znów z nich korzystać.

## Rozłączanie

Kliknij **Rozłącz** w **Ustawienia ▸ Integracje**. GenOffice usunie logowanie z tego komputera i poprosi Google o cofnięcie dostępu. Kopie plików na tym komputerze pozostaną. Dostęp możesz też w każdej chwili usunąć w sekcji **Połączenia z aplikacjami innych firm** na koncie Google.
