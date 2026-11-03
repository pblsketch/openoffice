# Diagramy: rysowanie i edycja plików draw.io

Edytor diagramów otwiera pliki draw.io na karcie. Rysujesz w nim schematy blokowe, diagramy architektury i inne diagramy, zapisujesz je w formacie, w jakim przyszły, eksportujesz je jako obrazy lub PDF i możesz zlecić AI ich czytanie, zmienianie i rysowanie. Edytor działa w całości na Twoim komputerze.

## Otwieranie diagramu

- Edytor otwiera pliki `.drawio`, `.dio`, `.drawio.svg` i `.drawio.png`: z okna otwierania, po przeciągnięciu pliku na okno, z listy ostatnich plików, z drzewa folderów, a pliki `.drawio` i `.dio` także z listy Dysku Google. W systemie Windows instalacja GenOffice sprawia, że staje się on programem dla plików `.drawio` i `.dio`.
- Plik `.drawio.svg` lub `.drawio.png` otworzy się tylko wtedy, gdy diagram jest zapisany wewnątrz obrazu. Zwykły obraz SVG lub PNG nie jest otwierany jako diagram. Uszkodzone pliki również się nie otwierają, a przyczyna jest wyświetlana.
- Plik Visio (`.vsdx`) jest importowany jako nowy diagram bez tytułu. Przy pierwszym zapisie proponowany jest plik `.drawio` w folderze pliku Visio, a sam plik Visio pozostaje bez zmian. Jeśli części obrazów z niego nie dało się przekonwertować, edytor podaje ich liczbę. W systemie Windows pliki `.vsdx` są dostępne tylko w menu „Otwórz za pomocą”.
- Nowy, pusty diagram zaczniesz kafelkiem **Diagram** na stronie głównej albo poleceniem Nowy w menu Plik.
- Jeśli diagram jest już otwarty, jego karta przechodzi na wierzch.

## Edycja

- Ekran edycji to ekran draw.io w niezmienionej postaci: menu u góry, kształty po lewej, panel formatowania po prawej i karty stron na dole.
- Zapisz (Ctrl+S), Zapisz jako (Ctrl+Shift+S) i Drukuj (Ctrl+P) obsługuje GenOffice. Przełączanie kart i pozostałe skróty całej aplikacji nadal działają. Wszystkie inne skróty należą do samego edytora, łącznie z cofaniem (Ctrl+Z).
- Polecenie **Pomoc** (F1) w menu edytora otwiera tę stronę.
- Edytor używa języka interfejsu GenOffice. Po zmianie języka edytor uruchamia się ponownie: niezapisane zmiany zostają, ale historia cofania przepada.
- Edytor stosuje motyw GenOffice. W ciemnym motywie rysunek też jest pokazywany w ciemnych kolorach, ale zapisany plik, PNG, PDF i wydruki są dokładnie takie same jak w jasnym motywie.

## Zapisywanie

- Zapisz, Zapisz jako, **Autozapis** na pasku stanu i pytanie przed zamknięciem działają tak samo jak w innych edytorach.
- Diagram jest zapisywany w formacie, w którym go otwarto. Zapisz jako oferuje `.drawio`, `.dio`, `.drawio.svg` i `.drawio.png`. Nowy diagram za pierwszym razem zapisuje się jako `.drawio`.
- Jeśli nic się nie zmieniło, plik nie jest zapisywany ponownie. Strony przechowywane w pliku w postaci skompresowanej pozostają skompresowane.
- Obraz pliku `.drawio.png` pokazuje pierwszą stronę, a cały diagram jest zapisany w jego wnętrzu.
- Dopóki diagram ma niezapisane zmiany, w folderze danych aplikacji przechowywana jest kopia odzyskiwania, więc praca przetrwa awarię.

## Eksport i drukowanie

- Wybierz eksport do PNG, SVG lub PDF w menu Plik (polecenia eksportu we własnych menu edytora otwierają to samo okno). Następnie wybierz **Wszystkie strony** (domyślnie) albo **Tylko bieżąca strona**.
- Przy wszystkich stronach PNG i SVG dają osobny plik dla każdej strony, o nazwie `<nazwa>-p<numer strony>`. PDF ma jeden arkusz na stronę, w rozmiarze strony ustawionym w diagramie.
- Drukowanie (Ctrl+P) również daje jeden arkusz na stronę. Eksport i wydruki zawsze mają jasne kolory, niezależnie od motywu.

## Panel AI

- Poproś AI o narysowanie schematu blokowego, diagramu sekwencji lub schematu organizacyjnego, o wyjaśnienie diagramu, uporządkowanie strony albo dodanie kolejnego kroku po zaznaczonych kształtach.
- AI czyta diagram jako tekst: strony, a dla każdego kształtu i łącznika jego id, tekst, kształt, położenie i połączenia, a do tego informację, które kształty zaznaczyłeś. Nie widzi diagramu jako obrazu.
- Zmiany wprowadzone przez AI pojawiają się od razu. Każda zmiana to jeden krok cofania (Ctrl+Z), a lista „Cofnij turę AI” w panelu wycofuje całą turę AI. Jeśli którakolwiek część zmiany zostanie odrzucona, diagram pozostaje taki, jaki był.
- Przy nowym schemacie blokowym, diagramie sekwencji i podobnych AI pisze kod Mermaid, a GenOffice zamienia go na kształty na Twoim komputerze. Układ może się trochę różnić od tego, który tworzy witryna draw.io.
- Diagramy można też załączać w panelu AI innych edytorów, wybierać przez `@` i znajdować wyszukiwaniem plików na stronie głównej. [Polecenia terminala](help://cli) również czytają, edytują i tworzą diagramy (`ieumoffice diagram read`, `ieumoffice diagram apply`, `ieumoffice create --type drawio`).

## Korzystanie z internetu

- Karta diagramu nie wysyła niczego do internetu. Edytor działa z plików zainstalowanych razem z GenOffice, a jego magazyn w chmurze, udostępnianie, wtyczki i własna AI są wyłączone.
- Obrazy i czcionki, które diagram pobiera z internetu, nie są wczytywane; przy otwieraniu pliku pojawia się o tym informacja. Link do strony WWW lub adresu e-mail na kształcie otwiera się w domyślnej przeglądarce dopiero po kliknięciu.
- Notatnik, dodane przez Ciebie biblioteki kształtów i ostatnio używane kolory zostają na tym komputerze, w folderze danych aplikacji. Panel AI, tak jak w innych edytorach, wysyła tekst diagramu do wybranej przez Ciebie AI.

## Jeszcze nieobsługiwane

- Wstawianie i edycja PlantUML. Kształty PlantUML w pliku są pokazywane jako zapisany w nich obraz.
- Automatyczne układy korzystające z ELK oraz łączniki omijające kształty. Takie łączniki są rysowane jako zwykłe łączniki.
- Stare formaty Visio (`.vsd`, `.vss`) i zapisywanie z powrotem do `.vsdx`.
- Magazyn w chmurze, udostępnianie, publikowanie, wtyczki i własne funkcje AI edytora.
- Ukrywanie części diagramu przed AI.
