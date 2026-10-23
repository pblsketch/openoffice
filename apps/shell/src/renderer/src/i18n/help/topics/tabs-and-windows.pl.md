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
- **Ponowne uruchomienie aplikacji bez pliku** przywraca ostatnią parę podzielonych dokumentów dokładnie tak, jak były; uruchomienie z plikiem otwiera tylko ten plik.
- Karty Strona główna, Pomoc i Prezentacja (podgląd) nie mogą trafić do okienka; gdy któraś jest otwarta, oba okienka chowają się na chwilę i wracają po powrocie na kartę dokumentu.

Trzy lub więcej okienek, dzielenie wewnątrz odłączonego okna i synchronizacja kopii na żywo zostają na później.
