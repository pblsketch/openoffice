# PDF: czytanie, adnotowanie i zaciemnianie

Edytor PDF ma pięć kart na wstążce: **Narzędzia główne / Adnotacje / Edycja / Strony / Widok**. Czyta i zapisuje: tekst można edytować, treść zaciemniać i podpisywać, a formularze wypełniać.

## Czytanie i nawigacja

- Lewy pasek boczny: **miniatury** (kliknij, aby przejść, widoczny zakres wyróżniony) albo **spis treści** (zakładki, jeśli są).
- Powiększenie: regulator współczynnika w prawym dolnym rogu; ctrl+kółko zmienia powiększenie stopniowo.
- Przesuwanie widoku: włącz **Narzędzie Rączka** (karty Narzędzia główne i Widok) i przeciągaj, aby przesuwać stronę w każdą stronę. Gdy jest włączone, przeciąganie nie zaznacza tekstu, a zwykłe kliknięcie nadal otwiera łącze. Przeciąganie z wciśniętym środkowym przyciskiem (kółkiem) przesuwa widok bez narzędzia. Esc lub wybór innego narzędzia je wyłącza.
- Obracanie: dla jednej strony lub wszystkich z menu Strony; obroty są zapisywane w pliku przy zapisie.
- Wyszukiwanie: ctrl+F na pełnym tekście z podświetleniem wszystkich trafień.
- Zaszyfrowane pliki PDF: otwiera je monit o haśle (we własnym małym oknie); hasło jest używane tylko w tej sesji. Taki dokument można edytować i zapisywać; zapis zachowuje hasło. **Adnotacje → Chroń** ustawia, zmienia lub usuwa hasło oraz to, co wolno czytelnikom.

## Zaznaczanie tekstu i oznaczanie (Adnotacje)

Spróbuj na dowolnym akapicie:

1. **Przeciągnij mysz przez zdanie** — po puszczeniu nad tekstem pojawia się pasek adnotacji:

![Pasek adnotacji po zaznaczeniu tekstu](img/pdf-highlight.png)

2. Wybierz jeden z trzech kolorów **wyróżnienia** albo **podkreślenie**, **falistą** linię lub **przekreślenie**. Aby zmienić kolor wyróżnienia, kliknij go prawym przyciskiem i wybierz nowy. Po podkreśleniu, linii falistej lub przekreśleniu na pasku otwiera się rząd kolorów: kliknij inny kolor, aby go zmienić, a kolejne oznaczenie też będzie w tym kolorze. **Zapytaj AI** wysyła zaznaczenie razem z Twoim pytaniem do panelu AI.
3. Aby cofnąć adnotację, zaznacz przeciągnięciem ten sam fragment i kliknij aktywny przycisk na pasku (przełącznik w stylu Worda), albo zaznacz go i naciśnij Usuń.

Oczekiwane działanie:

- Przeciągnięcie po tekście wyświetla pasek: **wyróżnienie / podkreślenie / przekreślenie / kopiuj / Zapytaj AI**.
- Kolory pochodzą z palety; **nałożenie tego samego oznaczenia na już oznaczony zakres je usuwa** (przełącznik w stylu Worda).
- Oznaczenia zapisane już w pliku można zaznaczyć i usunąć (⋯ menu lub Usuń).
- **Uwaga**: gdy aktywne jest narzędzie rysowania, warstwa tekstu nie jest dostępna do zaznaczenia — narzędzie wyłącza się samo po każdym umieszczeniu, więc przed następną czynnością znów jesteś w trybie zaznaczania.

## Narzędzia rysowania (Adnotacje)

Sześć narzędzi: **tusz, prostokąt, elipsa, strzałka, notatka**, a ponadto **ramka zaciemniania** w karcie Adnotacje.

- Każde narzędzie jest przełącznikiem: kliknij, aby je włączyć; **wyłącza się samo, gdy tylko zostanie umieszczona figura** (aby kontynuować, kliknij narzędzie ponownie); kliknięcie już włączonego narzędzia również je wyłącza.
- Tusz podąża za grubością pociągnięcia; prostokąt, elipsę i strzałkę rysuje się przez przeciągnięcie; kolory pochodzą z palety rysowania.
- Umieszczone figury można zaznaczyć, usunąć, przeciągnąć oraz (prostokąt i elipsę) przeskalować.
- **Zaciemnianie, cały przepływ** (na przykład ukrycie wiersza tekstu):

  1. Karta Adnotacje ▸ kliknij **Zaczernij obszar** (narzędzie się włącza).
  2. **Przeciągnij ramkę na treść** — zostanie zakryta znacznikiem kreskowanym, a na pasku narzędzi pojawią się przyciski **wyczyść oznaczenia / zastosuj zaczernienia**.

  3. Kliknij **Zastosuj zaczernienia** i potwierdź — powstanie kopia robocza, w której zakryty tekst i obrazy są fizycznie usunięte (a nie tylko przykryte), a operacji nie można cofnąć; oryginalny dokument pozostaje nietknięty.

  Pomyliłeś się? Przycisk wyczyszczenia oznaczeń kasuje bieżące oznaczenia, więc możesz narysować od nowa.

## Przypięte notatki i wątki komentarzy

- **Narzędzie notatki** umieszcza pinezkę i otwiera kartę przy marginesie na tekst (imię autora można ustawić); po potwierdzeniu zapisuje się jako standardowa adnotacja tekstowa PDF.
- Kliknij pinezkę, aby otworzyć wątek: **odpowiedz** (odpowiedzi tworzą jedną płaską listę, bez zagnieżdżania), **edytuj** własny komentarz, **usuń** pojedynczy komentarz lub cały wątek.
- Trwające zmiany pozostają aktywne, dopóki zapis nie wpisze nowego tekstu do tej samej adnotacji w pliku, zachowując łańcuch odpowiedzi.

## Edycja zawartości PDF (Edycja)

- **Edytuj tekst**: kliknij tekst, aby edytować go blokami (silnik pdfium; dopasowanie krojów najlepsze, jak to możliwe).
- **Wstaw tekst**: wstawia przeszukiwalny tekst o wybranym kroju, rozmiarze i kolorze.
- **Wstaw obraz / pieczęć**.
- Formularze: pola AcroForm wypełnia się bezpośrednio; wartości są zapisywane przy zapisie.

## Podpisy

- **Podpis odręczny**: narysuj go; można go powiązać z polem podpisu w formularzu.
- **Podpis obrazkowy**: umieść obraz jako podpis.
- Zapisane podpisy można wykorzystywać ponownie.
- **Podpis certyfikatem** (karta Adnotacje): podpisz certyfikatem z magazynu systemowego lub z pliku .p12/.pfx; opcjonalnie pokaż podpis na stronie i opcjonalnie certyfikuj dokument przed późniejszymi zmianami.
- Podpisanie zawsze zapisuje **nowy plik** (aktualizacja przyrostowa — wcześniejsze podpisy zostają ważne) i otwiera podpisaną kopię na miejscu. Zapisz najpierw: podpis obejmuje plik taki, jaki leży na dysku.
- Baner nad dokumentem wylicza istniejące podpisy; **Pokaż podpisy** prezentuje ważność, zakres i łańcuch certyfikatów każdego. Odwołania (CRL/OCSP) nie są sprawdzane.

## Operacje na stronach (Strony)

- **Obróć / usuń / zmień kolejność**: przeciągaj miniatury, aby zmienić kolejność; usuwanie wymaga potwierdzenia.
- **Importuj strony**: wciągnij strony z innego pliku PDF. **Wstaw pustą stronę** dodaje pustą stronę.
- **Zamień strony** podmienia cały zakres na strony skąd indziej; **Przytnij strony** przycina krawędzie, z opcją zastosowania tego do wszystkich stron.
- **Rozmiar strony** skaluje wszystkie strony do jednego rozmiaru papieru; **Odwróć kolejność** odwraca dokument od końca do początku.
- **Wyodrębnij strony**: eksportuje wybrane strony do nowego pliku PDF.
- **Podziel PDF**: dwie postacie — podział według zakresów na kilka plików albo pocięcie każdej strony na siatkę mniejszych stron.
- **Scal PDF**: dwie postacie — dołączenie innych plików PDF albo połączenie kilku stron na jednym arkuszu. Rozmiary są sumowane **zanim cokolwiek zostanie odczytane**, a łączna wartość powyżej **1 GiB jest odrzucana** z czytelnym komunikatem błędu (aby ograniczyć zużycie pamięci).
- Zmiany na poziomie strony są zapisywane przy następnym zapisie; Zapisz jako… pozostawia oryginał nietknięty.

## Eksport i drukowanie

- **Eksportuj jako Word… / PowerPoint… / Excel…** w menu Plik albo te same trzy z **Konwertuj PDF** na wstążce — wszystko lokalnie, bez wysyłania na serwer. Plik .pptx wychodzi ze slajdem na stronę, a .xlsx z arkuszem na stronę. Każdy z nich pyta, gdzie zapisać.
- **Drukuj**: bieżąca kolejność i obroty przez okno systemowe; obsługiwane są zakresy stron.

## Zapisywanie

- Zwykłe zapisywanie, ręczne lub automatyczne, zapisuje adnotacje i edycje z powrotem w pliku (atomowo).
- **Zaciemnianie przechodzi przez własny przepływ aplikowania** i tworzy kopię, pozostawiając oryginał nietknięty, dzięki czemu wrażliwa treść nie pozostaje w pliku źródłowym.

## Skróty paska zaznaczenia

Dopóki nad zaznaczonym tekstem widać pasek adnotacji, jeden klawisz od razu wykonuje działanie.

| Klawisz | Działanie                              |
| ------- | -------------------------------------- |
| H       | Wyróżnienie (usuwa je, jeśli już jest) |
| U       | Podkreślenie                           |
| S       | Przekreślenie                          |
| N       | Notatka na końcu zaznaczenia           |
| E       | Wyjaśnienie AI (karta fragmentu)       |
| T       | Tłumaczenie AI (karta fragmentu)       |
| Enter   | Otwarcie pola **Zapytaj AI**           |

- Klawisze działają tak samo przy koreańskiej lub dowolnej innej metodzie wprowadzania. Są pomijane, gdy piszesz w polu tekstowym albo trzymasz Ctrl lub Alt.
- W dokumencie zablokowanym przed edycją (hasło właściciela zabrania zmian) H, U, S i N nic nie robią i pokazują powód, tak jak przyciski paska.

## Karty fragmentów

Naciśnij **E** lub **T** albo żetony wyjaśnienia i tłumaczenia w polu **Zapytaj AI**, a odpowiedź pojawi się w małej karcie obok zaznaczenia. Karty są przechowywane, więc zostają po ponownym otwarciu dokumentu, i można je kopiować. Ponowne pytanie o ten sam fragment otwiera istniejącą kartę bez wysyłania czegokolwiek.

- **Zostaw jako notatkę** tworzy w tym miejscu notatkę. Jej pierwszy wiersz to „Wyjaśnienie AI” lub „Tłumaczenie AI”, a autorem jest nazwa Twojego konta na komputerze. Do pliku trafia przy zapisie PDF; do tego czasu karta pokazuje „Czeka na zapis”.
- **Pytaj dalej w panelu AI** przekazuje fragment i odpowiedź do panelu AI bez wysyłania; **Dodaj do notatki** dopisuje je na końcu notatki tego PDF.
- Tylko **Utwórz ponownie** wysyła fragment do AI jeszcze raz.
- **Usuń** kasuje wyłącznie przechowywaną kartę. Zostawiona już notatka pozostaje.
- Delikatna kropkowana linia oznacza każdy fragment z kartą; kliknięcie jej ponownie otwiera kartę. Linia istnieje tylko na ekranie i nigdy nie jest zapisywana ani drukowana. Włączysz ją lub wyłączysz w Widok ▸ **Oznaczenia fragmentów**.

## Przegląd adnotacji

- Widok ▸ **Adnotacje** wyświetla w lewym pasku bocznym listę wyróżnień, podkreśleń, przekreśleń, notatek i rysunków dokumentu, jeszcze niezapisanych oznaczeń oraz kart fragmentów. Oznaczenia pokazują tekst, który przykrywają.
- Filtruj według rodzaju, koloru, zakresu stron lub tekstu, a sortuj według strony albo kolejności utworzenia.
- Kliknięcie pozycji przenosi w to miejsce z krótkim mignięciem. Notatka otwiera swój wątek na marginesie, karta otwiera kartę.
- Polecenia menu **Kopiuj jako Markdown**, **Otwórz jako dokument Markdown** i **Otwórz jako dokument Word** używają listy w obecnym przefiltrowaniu. AI nie bierze w tym udziału. Nowe dokumenty można tworzyć tylko z PDF otwartego w GenOffice.

## Tłumaczenie obok

- Włącz Widok ▸ **Tłumaczenie obok**, a po prawej stronie każdej strony pojawi się kolumna tłumaczenia przewijana razem z nią. Samo włączenie niczego nie wysyła do AI. Dokument przetłumaczony już przez **Przetłumacz dokument** od razu pokazuje tłumaczenie; akapity bez tłumaczenia widać jako przygaszony tekst źródłowy.
- **Przetłumacz tę stronę** (lub **Przetłumacz resztę**, gdy część jest gotowa) wysyła stronę jednym kliknięciem, gdy korzystasz z subskrypcji; obok przycisku widać nazwę docelowej AI. Przy połączeniu rozliczanym za użycie pierwsze kliknięcie na karcie najpierw pyta „pobierze za to opłatę · Przetłumacz / Anuluj”.
- Kliknij dwukrotnie przetłumaczony akapit, aby go edytować. Edytowane akapity są przechowywane jako zwykły tekst i trafiają bez zmian do przetłumaczonych plików PDF, Markdown i EPUB. **Przetłumacz ponownie** przy akapicie wysyła tylko ten akapit i najpierw pyta, jeśli był edytowany.
- Najechanie myszą na przetłumaczony akapit obrysowuje jego miejsce na stronie źródłowej. Szerokość kolumny i rozmiar tekstu można zmieniać. **Przetłumacz wszystkie strony…** otwiera okno **Przetłumacz dokument**, którego format **Tylko zachowaj (bez pliku)** zachowuje tłumaczenie bez zapisywania pliku.
- Nowo przetłumaczone akapity są połączone zdanie po zdaniu. Najechanie na przetłumaczone zdanie zaznacza to zdanie na stronie oryginału, a najechanie na zdanie oryginału podświetla jego tłumaczenie. Tam, gdzie zdania nie da się znaleźć na stronie, oraz w akapitach przetłumaczonych wcześniej lub poprawionych przez Ciebie połączenie pozostaje akapitami.
- Pasek nad kolumną przełącza między **Tłumaczenie** a **Proste wyjaśnienie**. Proste wyjaśnienie pisze tekst od nowa codziennymi słowami i krótkimi zdaniami, dla dzieci, osób starszych lub uczących się języka; fakty, liczby i nazwy zostają bez zmian. Wybór jest zapamiętywany, a przełączenie niczego nie wysyła. Gdy widać wyjaśnienie, przyciski strony i akapitu oraz edycja działają na nim.
- W prostym wyjaśnieniu **Wyjaśnij prosto wszystkie strony…** otwiera okno **Przetłumacz dokument** z rodzajem **Proste wyjaśnienie**. Wyjaśnienie jest dłuższe od oryginału, więc nie może stać się przetłumaczonym PDF; zapisuje się je jako Markdown lub EPUB. Po włączeniu **Oryginał, potem wyjaśnienie** po każdym akapicie oryginału jest jego wyjaśnienie; po wyłączeniu plik zawiera tylko wyjaśnienie. Język to na początku język interfejsu; może to być też język dokumentu.

## Wyróżnianie przez AI

- W Narzędzia główne ▸ **Wyróżnianie przez AI** wybierz zestaw kategorii (Badania i raporty, Umowy i regulaminy, Podręczniki i instrukcje albo Własne) i strony. Nic nie zostanie wysłane, dopóki nie sprawdzisz szacowanej liczby wywołań i docelowej AI i nie naciśniesz **Rozpocznij**.
- Zdania wybrane przez AI pojawiają się w podglądzie jako półprzezroczyste kolorowe ramki na stronie. Podgląd nigdy nie jest zapisywany; włączysz go lub wyłączysz w Widok ▸ **Podgląd wyróżnień**.
- W panelu **Adnotacje** możesz **Akceptuj** lub **Odrzuć** sugestie pojedynczo albo zaakceptować całą kategorię. Zdania, którego nie znaleziono w tekście strony, nie można zaakceptować.
- Zaakceptowana sugestia staje się wyróżnieniem w kolorze swojej kategorii, a nazwa kategorii zostaje zapisana jako temat adnotacji, więc inne przeglądarki PDF pokazują ją na liście komentarzy. Do pliku trafia przy zapisie PDF.
- Wyróżniania przez AI nie można uruchomić w dokumencie zablokowanym przed edycją. Zmyślone zdania, których nie ma w tekście, są odrzucane, a raport końcowy podaje, ile otrzymano i ile odrzucono.

## Przegląd dokumentu i cytaty akapitów

- Na górze panelu AI **Przegląd dokumentu** ▸ **Utwórz przegląd** tworzy streszczenie w trzech zdaniach, podsumowanie i kluczowe pojęcia (ze znaczeniem i pierwszą stroną). Długi dokument jest streszczany częściami, więc najpierw potwierdzasz szacowaną liczbę wywołań.
- Przegląd jest przechowywany i zostaje po ponownym otwarciu; dopiero **Utwórz ponownie** wysyła znowu. Kliknięcie pojęcia wyszukuje je w dokumencie; każdą sekcję można skopiować lub dodać do notatki.
- Gdy rozmowa jest pusta, panel AI proponuje trzy sugerowane pytania. Kliknięcie wysyła pytanie jeden raz.
- Kliknięcie odnośnika do strony (p.N), który AI podaje jako dowód, przenosi na tę stronę i podświetla cytowane zdanie przez dwie sekundy. Jeśli zdania nie da się znaleźć, otwiera się tylko strona.

## Notatka dla każdego PDF

- Gdy pierwszy raz naciśniesz **Otwórz notatkę** (karta Widok lub panel **Adnotacje**), otworzy się okno zapisu, domyślnie w folderze PDF z nazwą „nazwa PDF notatka.md”. Później notatka otwiera się od razu na karcie Markdown.
- Jeśli wybierzesz plik, który już istnieje, Windows może zapytać, czy go zastąpić, ale plik nie zostanie nadpisany: zostanie połączony jako notatka w obecnej postaci.
- **Dodaj do notatki** (na kartach, pozycjach panelu i w przeglądzie dokumentu) wstawia cytat z odnośnikiem do strony na końcu karty notatki i zostawia ją niezapisaną; zapisujesz sam na karcie notatki. Odnośnik otwiera PDF na tej stronie także w innych programach, np. w przeglądarce.
- PDF, którego nigdy nie zapisano, pokazuje „Najpierw zapisz PDF”. Notatki działają tylko dla PDF otwartych w GenOffice.
