# Karty i zarządzanie oknami

Wszystkie otwarte pliki zajmują jedno okno; pasek kart u góry przełącza się między nimi w sposób znany z przeglądarek.

![Pasek kart: strona główna i dwa dokumenty](img/tabs.png)

## Podstawy

- **Przełączanie**: kliknij kartę, naciśnij **Ctrl+Tab** (następna) / **Ctrl+Shift+Tab** (poprzednia) albo przewiń kółkiem myszy nad paskiem.
- **Zamknij**: × na karcie albo ⌘W/ctrl+W. Przy niezapisanych zmianach najpierw zostanie zapytanie.
- **Nowa**: + na prawym końcu paska.
- **Aktywacja jest natychmiastowa**: naciśnięcie karty przełącza od razu, bez czekania, aż kliknięcie się zakończy.

## Zmiana nazwy: kliknij dwukrotnie kartę

**Kliknij dwukrotnie dowolną kartę pliku**, a tytuł zmieni się w pole edycji w miejscu: Enter zatwierdza, Esc anuluje, utrata fokusu zatwierdza; Enter potwierdzający kandydata IME nie jest mylony z zatwierdzeniem. Zmiana nazwy przechodzi te same kontrole bezpieczeństwa co zmiana nazwy w wierszu na stronie głównej (niedozwolone znaki, konflikty nazw), zmienia nazwę pliku na dysku i odświeża listę ostatnich.

## Przeciąganie i zmiana kolejności

Przytrzymaj kartę i przeciągnij ją w bok, aby zmienić kolejność; sąsiednie karty odsuwają się na bieżąco, a kolejność ustala się po puszczeniu. Strefa martwa o szerokości 4 pikseli sprawia, że zwykłe kliknięcia nie przesuwają kart.

## Menu kontekstowe

Kliknij prawym przyciskiem kartę, aby otworzyć: **Otwórz w nowym oknie** — dostępne na każdej karcie dokumentu, którą można odłączyć — oraz **Zamknij**, wyszarzone na karcie, której nie można zamknąć. Obie pozycje są lokalizowane wraz z językiem aplikacji.

## Odłączenie okna

**Przeciągnij kartę poza pasek** (lub użyj Otwórz w nowym oknie), a stanie się ona oknem zawierającym aktywny dokument; przeciągnij je z powrotem, aby zamocować je na pasku. Odłączone okno jest pełnoprawnym oknem — możesz tam dalej edytować i zapisywać.

## Lista wszystkich kart

Gdy kart jest więcej, niż mieści się na pasku, mała ikona paska kart na prawym końcu otwiera pełną listę (menu natywne, nigdy niezasłonięte przez obszar zawartości); wybierz strzałkami.

## Pasek narzędzi w każdym edytorze

Każda karta edytora ma u góry pasek narzędzi (dokładny układ różni się nieco między edytorami):

- **Zapisz** (⌘S/ctrl+S) i **Zapisz jako…**.
- **Cofnij / Ponów**: wielopoziomowe; każdy edytor prowadzi własną historię.
- **Znajdź** (ctrl+F): otwiera panel wyszukiwania tego edytora.
- Przełącznik **Autozapisu**: gdy jest włączony, zmiany są zapisywane na dysku w określonych odstępach czasu; gdy jest wyłączony, zapis następuje tylko ręcznie (przypomina o tym znacznik niezapisanych zmian na karcie lub w tytule).

## Karta strony głównej

Karta strony głównej, najbardziej z lewej, nie można zamknąć; aby wrócić do niej z dowolnego edytora, kliknij ją lub użyj Plik ▸ **Wróć do strony głównej**.

## Widok podzielony: dwa okienka

**Przeciągnij kartę na prawą krawędź okna**: karta podąża jako mała unosząca się kopia, przy krawędzi pojawia się podpowiedź „Podziel tutaj”, a po upuszczeniu powstają dwa okienka obok siebie. Upuszczenie na dolnej krawędzi daje dwa okienka jedno nad drugim. Menu podręczne karty oferuje to samo przez **Podziel w prawo** i **Podziel w dół**, a przy karcie znajdującej się w okienku także **Cofnij podział**.

- Przeciągnięta karta trafia do okienka, w którym ją upuszczono; drugie okienko zachowuje dokument, który był przed chwilą oglądany.
- Gdy otwarty jest tylko jeden dokument, do obu okienek trafia kopia tego samego dokumentu — można patrzeć na początek i koniec razem. Nowy, jeszcze niezapisany dokument też można podzielić.
- Przeciągnij **przegrodę** między okienkami, aby zmienić proporcje; dwuklik daje podział na pół, a dociśnięcie do końca zamyka to okienko. Dokument pozostaje otwarty jako karta.

## Jedno okno AI podążające za fokusem

- Widoczne jest tylko jedno okno AI. Okienko, w którym właśnie pracujesz, pokazuje swoje; okno drugiego zwija się do szyny, a kliknięcie okienka wysuwa jego okno AI na wierzch.
- Gdy jest zwinięte, rozmowa tego okienka i trwająca praca AI pozostają żywe. Rozmowy są przechowywane osobno dla każdego dokumentu.
- **Dwie kopie tego samego dokumentu**: po zapisaniu w jednym okienku zapis z drugiego najpierw pyta „Ten dokument zmienił się gdzie indziej”. Autozapis cicho czeka.
- Po zwykłym zamknięciu **ponowne uruchomienie aplikacji bez pliku** przywraca ostatnią parę podzielonych dokumentów dokładnie tak, jak były; uruchomienie z plikiem otwiera tylko ten plik. Po nagłym wyłączeniu poprzednie karty wracają tak, jak opisano niżej.
- Karty Strona główna, Pomoc i Prezentacja (podgląd) nie mogą trafić do okienka; gdy któraś jest otwarta, oba okienka chowają się na chwilę i wracają po powrocie na kartę dokumentu.

Trzy lub więcej okienek, dzielenie wewnątrz odłączonego okna i synchronizacja kopii na żywo zostają na później.

## Gdy aplikacja lub komputer nagle się wyłączy

Dopóki dokument ma niezapisane zmiany, GenOffice mniej więcej co 30 sekund zachowuje jego kopię odzyskiwania we własnym folderze danych aplikacji. Robią to wszystkie edytory, także dla nowego dokumentu, którego nigdy nie zapisano. Sam plik nie zmienia się, dopóki go nie zapiszesz.

- **Karty wracają**: jeśli aplikacja lub komputer wyłączyły się bez zwykłego zamknięcia (zanik zasilania, awaria, wymuszone zamknięcie aplikacji, wyłączenie komputera lub ponowne uruchomienie po aktualizacji), przy następnym uruchomieniu GenOffice otwarte karty dokumentów wrócą w tej samej kolejności, razem z podziałem ekranu, jeśli był. Dzieje się tak również wtedy, gdy uruchamiasz aplikację, otwierając plik.
- **Jedna lista na stronie głównej**: dokumenty, w których została niezapisana zawartość, są wyświetlane razem na ekranie głównym. Dla każdego wybierz **Przywróć** lub **Odrzuć** albo użyj **Przywróć wszystkie** lub **Odrzuć wszystkie**, a następnie naciśnij **Zatwierdź**. Jeśli inny program lub usługa synchronizacji zmieniły później plik, na początku zaznaczone jest **Odrzuć**, aby plik pozostał taki, jaki jest teraz. Jeśli oryginalnego pliku nie da się już znaleźć, przywrócenie otwiera zawartość jako nowy dokument bez tytułu.
- **Zdecyduj później**: zamknięcie listy niczego nie usuwa. Gdy po raz pierwszy otworzysz jeden z tych dokumentów, okno z jego nazwą zapyta ponownie; naciśnięcie Esc lub zamknięcie okna oznacza przywrócenie. Jeśli przywrócona zawartość nie jest potrzebna, zamknij dokument przyciskiem **Nie zapisuj**.
- **Karty wczytują się po otwarciu**: przywrócone karty od razu pokazują tytuły, ale każdy dokument wczytuje się dopiero po pierwszym kliknięciu jego karty. Otwarcie wszystkiego naraz mogłoby ponownie wyłączyć komputer, któremu brakuje pamięci.
- **Przy wyłączaniu komputera**: jeśli są niezapisane dokumenty, GenOffice nie pyta, czy je zapisać. Zachowuje kopie, zamyka się i proponuje je przy następnym uruchomieniu.
- **Dokumenty bez kopii**: chronione hasłem pliki Excel, HWP i PDF nie dostają kopii odzyskiwania, więc ich niezapisanych zmian nie da się przywrócić; komunikat informuje o tym raz przy otwarciu takiego dokumentu. Zapisuj je często. Chronione hasłem dokumenty Word i PowerPoint mają kopię zabezpieczoną tym samym hasłem.
- **Pliki CSV, starsze .xls i .tsv**: edytor arkuszy przechowuje ich kopię jako skoroszyt bez nazwy. Po przywróceniu otwiera się jako skoroszyt bez nazwy, a pierwsze zapisanie proponuje folder i nazwę oryginalnego pliku jako .xlsx.

Kopia jest usuwana, gdy zapiszesz dokument, zamkniesz go przyciskiem **Nie zapisuj** lub wybierzesz **Odrzuć**, a także po 30 dniach bez zmian. Po zwykłym zamknięciu GenOffice uruchamia się jak dawniej i nie przywraca kart.

**To nie jest Autozapis.** Autozapis zapisuje zmiany w samym pliku i działa dopiero po pierwszym zapisaniu. Kopia odzyskiwania nigdy nie dotyka pliku; przechowuje tylko to, czego jeszcze nie zapisano, dopóki tego nie zapiszesz lub nie odrzucisz.
