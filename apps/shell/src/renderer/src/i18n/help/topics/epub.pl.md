# E-booki EPUB: czytanie, edycja i tłumaczenie

Edytor e-booków otwiera książki EPUB (`.epub`) na karcie. Możesz czytać książkę, poprawiać jej tekst bezpośrednio na stronie, pytać o nią AI i przetłumaczyć ją do nowego pliku EPUB. Nie ma ekranu do edycji kodu rozdziału.

## Otwieranie książki

- Plik `.epub` otworzysz w oknie otwierania, przeciągając go na okno, z listy ostatnich plików, z drzewa folderów albo z listy Dysku Google. W systemie Windows jest też dostępny w menu „Otwórz za pomocą”. Instalacja GenOffice nie sprawia, że staje się on domyślnym programem dla plików `.epub`.
- Jeśli książka jest już otwarta, jej karta przechodzi na wierzch.
- Książki zabezpieczone przed kopiowaniem (DRM) się nie otwierają: otwórz je w aplikacji księgarni, w której je kupiono. Nie otwierają się też uszkodzone pliki ani pliki, które nie są książkami EPUB, a aplikacja podaje przyczynę.
- **Książki o stałym układzie** (składane strona po stronie, jak książki obrazkowe i komiksy) otwierają się tylko do czytania. Edycja, edycja przez AI, zamiana i tłumaczenie są wyłączone, a wiersz stanu wyjaśnia dlaczego. Czytanie i zadawanie pytań AI nadal działają.
- Rozdział z wadliwym plikiem jest pokazywany najlepiej, jak się da, ale nie można go edytować; informuje o tym uwaga na jego początku. Zapisuje się bez zmian, a w tłumaczeniach zostaje w języku oryginału.

## Czytanie

- Panel **Spis treści** po lewej pokazuje spis treści książki. Kliknij pozycję, aby do niej przejść. Książka bez spisu treści dostaje listę swoich rozdziałów.
- Każdy rozdział przewija się w górę i w dół. Przewijaj dalej za koniec rozdziału, aby przejść do następnego, albo przed jego początek, aby wrócić. Wiersz stanu pokazuje, w którym rozdziale jesteś.
- Karta **Widok** zmienia rozmiar tekstu i interlinię oraz włącza i wyłącza **Widok ciemny**. Te ustawienia zmieniają tylko ekran, nigdy książkę, i dotyczą wszystkich książek.
- Miejsce, w którym skończyłeś czytać, jest zapamiętywane osobno dla każdego pliku, w folderze danych aplikacji, a nie w książce.
- **Znajdź w książce** (Ctrl+F) przeszukuje wszystkie rozdziały. Kliknij wynik, aby do niego przejść.
- Odnośnik w książce przenosi do wskazanego miejsca. Odnośniki do stron internetowych i adresów e-mail otwierają się w domyślnej przeglądarce; inne adresy nie są otwierane.
- Skrypty zapisane w książce nigdy się nie uruchamiają i nic nie jest pobierane z internetu. Dźwięk i wideo nie są odtwarzane.

## Edycja tekstu

- Kliknij akapit i pisz. Edytować można akapity, nagłówki, elementy list, cytaty, komórki tabel i podpisy pod obrazami. Obrazów i układu tabel edytować nie można.
- Wklejanie wstawia tylko zwykły tekst.
- **Enter** dzieli akapit na dwa, a **Shift+Enter** zaczyna nowy wiersz w jego obrębie. **Backspace** na początku akapitu łączy go z poprzednim, a **Delete** na końcu dołącza do niego następny. W komórkach tabel, podpisach i listach definicji Enter nic nie robi: zmienia się tylko tekst wewnątrz.
- **Pogrubienie** (Ctrl+B) i **Kursywa** (Ctrl+I) włączają się i wyłączają. Tekst pogrubiony lub pochylony przez arkusz stylów książki zostaje bez zmian.
- **Cofnij** (Ctrl+Z) i **Ponów** (Ctrl+Y) działają także po zapisaniu. Cofnięcie zmiany w innym rozdziale przenosi do tego rozdziału.
- **Zamień** (Ctrl+H) działa w całej książce, po jednym akapicie: dopasowanie nigdy nie obejmuje dwóch akapitów. Rozdziały tylko do odczytu są pomijane, a liczba pominiętych miejsc jest wyświetlana. **Zamień wszystko** cofa się jednym krokiem.

## Zapisywanie

- Zapisz (Ctrl+S), Zapisz jako (Ctrl+Shift+S, tylko `.epub`), **Autozapis** na wstążce i pytanie przed zamknięciem działają tak samo jak w innych edytorach.
- Jeśli nic się nie zmieniło, plik nie jest zapisywany ponownie. Przy zapisywaniu zmian przepisywane są tylko akapity, które zmieniłeś. Obrazy, czcionki, style i wszystkie pozostałe części książki zostają dokładnie takie, jakie były. W książce EPUB 3 aktualizowana jest też data „ostatniej modyfikacji”.
- Jeśli inny program zmienił plik po tym, jak go otworzyłeś, plik nie zostanie nadpisany.

## Panel AI

- Pytaj o książkę, poproś o streszczenie rozdziału albo o poprawienie lub przeredagowanie jego tekstu. AI czyta spis treści i rozdziały książki oraz wyszukuje w niej tekst.
- Zmiany wprowadzone przez AI pojawiają się od razu, a jedno cofnięcie (Ctrl+Z) wycofuje wszystko, co AI zmieniła w danej turze. AI może pogrubić tekst lub zapisać go kursywą, ale nie może dodawać obrazów, tabel ani rozdziałów.
- Tekst książki jest dla AI materiałem, a nie poleceniami.
- Napisz „Przetłumacz tę książkę na francuski”, a AI otworzy okno tłumaczenia z już wybranym tym językiem. Nic nie zostanie wysłane, dopóki nie klikniesz **Rozpocznij**.
- Książki EPUB można też załączać w panelu AI innych edytorów, wybierać przez `@` i znajdować wyszukiwaniem plików na stronie głównej.

## Tłumaczenie książki

1. Na karcie **Narzędzia główne** kliknij **Przetłumacz książkę** (albo Plik ▸ Przetłumacz książkę…).
2. Wybierz język, rozdziały (na początku zaznaczone są wszystkie) i wyniki: **Przetłumaczona książka**, **Książka dwujęzyczna (oryginał i tłumaczenie)** albo obie. Dla każdej wybierz, gdzie ma zostać zapisana.
3. Kliknij **Dalej**. Potwierdzenie pokazuje szacowaną liczbę zapytań do AI, AI, do której trafią, części już przetłumaczone (nie są wysyłane ponownie), a przy połączeniu rozliczanym za użycie także informację, że zostanie naliczona opłata. Jeśli książka ma niezapisane zmiany, przycisk nazywa się **Zapisz i przetłumacz**.
4. Kliknij **Rozpocznij**. U góry pojawiają się postęp i przycisk **Zatrzymaj**. Edycja jest zablokowana do końca tłumaczenia; panel AI działa dalej.
5. Na koniec raport wymienia, co zostało przetłumaczone, co zostało w języku oryginału, oraz pliki wynikowe, każdy z przyciskiem **Otwórz**.

- Sama książka się nie zmienia. Każdy wynik to nowy plik EPUB z własną tożsamością, więc aplikacje do bibliotek e-booków odróżniają go od oryginału.
- Tytuł i spis treści też są tłumaczone. W książce dwujęzycznej po każdym akapicie następuje jego tłumaczenie; w tabelach, podpisach i listach tłumaczenie trafia do tej samej komórki lub pozycji. Jej tytuł zawiera obie wersje, w postaci „Tytuł oryginalny (Tytuł przetłumaczony)”.
- Rozdziały, których nie wybrano, zostają w wyniku w języku oryginału.
- Książka pisana pionowo staje się pozioma, chyba że jest tłumaczona na japoński, chiński lub koreański. Tłumaczenia na arabski i hebrajski czyta się od prawej do lewej.
- To, co już przetłumaczono, jest zachowywane. Jeśli zatrzymasz tłumaczenie, wybierz **Eksportuj to, co już przetłumaczono** (reszta zostaje w języku oryginału) albo **Kontynuuj później**. Gdy otworzysz książkę z niedokończonym tłumaczeniem, GenOffice zaproponuje jego dokończenie. **Przetłumacz od nowa** najpierw usuwa zachowane tłumaczenie na ten język.
- Zachowane tłumaczenia są liczone w Ustawienia ▸ Ogólne ▸ **Zapisane wyniki AI** razem z wynikami dokumentów PDF, a **Usuń wszystko** usuwa także je.
- To samo tłumaczenie można też uruchomić z [poleceń terminala](help://cli) jako `ieumoffice epub translate`.

## Jeszcze nieobsługiwane

- Dodawanie, usuwanie i zmiana kolejności rozdziałów; zmiana tytułu, autora lub okładki; wstawianie obrazów i tabel; zamiana akapitu w nagłówek lub listę.
- Edycja i tłumaczenie książek o stałym układzie oraz otwieranie książek zabezpieczonych przed kopiowaniem.
- Przewracanie stron jak w drukowanej książce i tworzenie nowej, pustej książki.
- Porównywanie oryginału i tłumaczenia obok siebie w edytorze. Zamiast tego otwórz książkę dwujęzyczną, a przetłumaczoną książkę poprawiaj jak każdą inną.
- Ukrywanie części książki przed AI.
