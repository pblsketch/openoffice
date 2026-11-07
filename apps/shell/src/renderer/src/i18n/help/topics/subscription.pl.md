# Połączenie z subskrypcją

GenOffice korzysta z AI w ramach subskrypcji, którą już masz: subskrypcji Claude (Anthropic) albo planu ChatGPT (OpenAI). ChatGPT łączy się bezpośrednio w GenOffice; jeśli już korzystasz na tym komputerze z programu Codex firmy OpenAI, możesz zamiast tego połączyć się przez Codex. Nie potrzebujesz klucza API, a GenOffice nie ma własnego konta, które trzeba by zakładać.

## Jak to działa

- AI nie jest wbudowane w GenOffice. Claude działa przez program **Claude Code** zainstalowany na tym komputerze: GenOffice prosi ten program o odpowiedź, a program jest zalogowany na twoje własne konto, więc każde żądanie liczy się do twojego planu.
- ChatGPT łączy samo GenOffice, bez żadnego programu. Zaloguj się na stronie logowania ChatGPT firmy OpenAI, która otworzy się w przeglądarce, i zezwól tej aplikacji na korzystanie z twojego planu ChatGPT. Żądania trafiają z tego komputera prosto do OpenAI, a zużycie jest liczone w ramach tego planu ChatGPT.
- **Codex** to program firmy OpenAI. Gdy ChatGPT jest połączony przez Codex, GenOffice prosi program Codex o odpowiedź, tak samo jak w przypadku Claude Code.
- GenOffice nie ma w aplikacji własnego formularza logowania. Logujesz się w programie samej firmy albo na jej stronie internetowej, która otwiera się w przeglądarce. GenOffice nigdy nie odczytuje ani nie przechowuje danych logowania Claude Code ani Codex. Jedyne logowanie, które GenOffice przechowuje, to to, które OpenAI przyznaje tej aplikacji, gdy łączysz ChatGPT bezpośrednio. Pozostaje ono na tym komputerze (w systemie Windows jest zaszyfrowane). GenOffice nigdy nie widzi twojego hasła do ChatGPT.

## Zanim zaczniesz

Potrzebujesz jednego z poniższych. Możesz mieć oba.

- Subskrypcja Claude (plan Pro lub Max; darmowe konto Claude nie może się połączyć) oraz program Claude Code zainstalowany i zalogowany na tym komputerze.
- Plan ChatGPT. Przy połączeniu bezpośrednim nie trzeba instalować żadnego programu. Darmowy plan pozwala tylko na niewielkie użycie. Jeśli już korzystasz z programu Codex na tym komputerze, możesz zamiast tego połączyć się przez Codex.

Jeśli Claude Code lub Codex nie jest jeszcze zainstalowany albo zalogowany, zajmą się tym przyciski opisane w następnej części.

## Łączenie

1. Otwórz **Ustawienia** z wiersza w lewym dolnym rogu strony głównej i wybierz **AI**. W części **Połączenie z subskrypcją** są karty Claude, ChatGPT i Codex, w tej kolejności. Jeśli masz plan ChatGPT, połącz się na karcie ChatGPT. Karta Codex jest dla osób, które korzystają z programu Codex na tym komputerze.
2. Przeczytaj, co pokazuje karta, i naciśnij jej przycisk. Tabela poniżej wyjaśnia każdy stan.
3. Wróć do okna GenOffice. Karta sama sprawdzi stan ponownie, a **Sprawdź ponownie** robi to od razu.

W drugim kroku ekranów powitalnych przy pierwszym uruchomieniu oraz w panelu AI, gdy żadne AI nie jest połączone, najpierw pojawia się pytanie „Z jakiego AI już korzystasz?”. Wybierz płatną subskrypcję Claude, ChatGPT albo „jeszcze z żadnego”, a zobaczysz tylko kroki tej ścieżki i jedną jej kartę. Dla Claude kroki to Instalacja programu → Logowanie → Połączono, a dla ChatGPT: Logowanie → Połączono. Na ścieżce ChatGPT opcja **Używasz już programu Codex na tym komputerze? Połącz przez Codex** przełącza na ścieżkę Codex (Instalacja programu → Logowanie → Połączono), a opcja **Połącz bezpośrednio w aplikacji, bez programu Codex** na tamtej ścieżce przywraca połączenie bezpośrednie. Jeśli Codex jest już połączony, od początku widać ścieżkę Codex. **Wybierz inny sposób** pozwala wybrać ponownie, a całość możesz pominąć i połączyć się później. Jeśli nadal nie da się połączyć, naciśnij **Kopiuj informacje dla pomocy** i wyślij skopiowaną treść osobie, która Ci pomaga. Nie zawiera ona konta ani ścieżek plików.

| Co pokazuje karta                            | Co to znaczy                                                                                                           | Co zrobić                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Sprawdzanie…**                             | GenOffice pyta program o jego stan.                                                                                    | Chwilę poczekaj.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| **Nie zainstalowano**                        | Programu nie znaleziono na tym komputerze.                                                                             | Naciśnij **Zainstaluj**. Oficjalne polecenie instalacji tej firmy uruchomi się w nowym oknie terminala, więc widzisz, co robi. GenOffice niczego samo nie pobiera. Jeśli wolisz zainstalować program ręcznie, **Oficjalna instrukcja instalacji** otwiera wskazówki firmy.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| **Nie zalogowano**                           | Program jest, ale nikt nie jest w nim zalogowany.                                                                      | Naciśnij **Zaloguj się**. W przeglądarce otworzy się strona logowania firmy: zaloguj się tam i zezwól na dostęp, a karta połączy się sama. Nie spiesz się; logowanie może chwilę potrwać. Jeśli przeglądarka w ogóle się nie otworzy, naciśnij na karcie **Przeglądarka się nie otworzyła?** (po 25 sekundach w tym miejscu pojawi się przycisk **Otwórz okno logowania**). Nie naciskaj go, jeśli wciąż logujesz się w przeglądarce: przerywa to bieżące logowanie i zaczyna je od nowa. U góry otwartego okna logowania po kolei opisano, co zrobić. Aby wkleić do niego kod, kliknij prawym przyciskiem myszy wewnątrz okna, a potem naciśnij Enter. To normalne, że wklejony kod nie jest widoczny; jeśli pojawi się "Invalid code", wklej kod ponownie do tego samego okna. Aby przerwać logowanie, naciśnij **Anuluj logowanie**. |
| **Połączono**                                | Potwierdzono logowanie w ramach subskrypcji. Nazwa planu jest widoczna, jeśli program ją podaje.                       | Nic. AI jest gotowe do pracy.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| **Zalogowano, ale nie w ramach subskrypcji** | Program jest zalogowany kluczem API albo na konto rozliczane za zużycie, albo nie udało się ustalić rodzaju logowania. | Zobacz „Logowania rozliczane za zużycie” poniżej.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| **Nie udało się sprawdzić połączenia**       | Nie powiodło się samo sprawdzanie. Przyczyna jest podana na karcie.                                                    | Naciśnij **Sprawdź ponownie**. Jeśli karta informuje, że program jest zbyt stary, naciśnij **Zaktualizuj**: oficjalna aktualizacja firmy uruchomi się w nowym oknie. Gdy się tam zakończy, wróć do GenOffice.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| **Wyłączone w tej aplikacji**                | Program został wyłączony dla tej aplikacji w ustawieniach. Aplikacja go nie sprawdza i nic do niego nie wysyła.        | Kliknij **Używaj ponownie**. Aplikacja znów sprawdzi program i zacznie z niego korzystać.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |

Karta ChatGPT nie korzysta z żadnego programu, więc nigdy nie pokazuje **Nie zainstalowano** ani **Zalogowano, ale nie w ramach subskrypcji**. Gdy pokazuje **Nie zalogowano**, naciśnij **Kontynuuj z ChatGPT**: w przeglądarce otworzy się strona logowania ChatGPT firmy OpenAI. Zaloguj się i zezwól tej aplikacji na korzystanie z twojego planu ChatGPT, a karta sama zmieni się na **Połączono**. Jeśli nie udzielisz zgody albo logowanie nie zakończy się w ciągu 10 minut, karta poinformuje, że logowanie nie zostało ukończone; ponowne naciśnięcie przycisku zaczyna wszystko od nowa. Nie ma okna logowania ani kodu do wklejenia. W trakcie logowania przycisk **Anuluj logowanie** je przerywa.

Połączenie jest sprawdzane przy uruchomieniu aplikacji, po otwarciu Ustawień oraz po powrocie do okna, gdy wcześniej rozpoczęto instalację lub logowanie.

Jeśli karta Claude lub Codex informuje, że logowanie nie zostało ukończone, wybierz **Otwórz okno logowania**. Kod pokazany w przeglądarce trzeba wkleić w tym oknie; wcześniej pokazany kod nie jest już ważny.

Jeśli strona w przeglądarce lub okno logowania pokazuje `3p_delegated_access_policy_denied`, możliwe, że zasady nałożone na konto Claude zablokowały to logowanie. Jeśli kolejna próba kończy się tak samo, zapytaj osobę, która zarządza kontem, albo sprawdź, czy działa inne konto.

## Bez subskrypcji: darmowe AI

Nie masz subskrypcji Claude ani ChatGPT? W Ustawienia ▸ AI opcja **Korzystaj za darmo** pozwala zamiast tego połączyć darmowe AI. Wybranie **Jeszcze z żadnego** w drugim kroku ekranów powitalnych pokazuje te same karty, a wybranie tej odpowiedzi w panelu AI, gdy nic nie jest połączone, daje opcję **Połącz darmowe AI**.

- **OpenRouter**: naciśnij **Połącz w przeglądarce**. Przeglądarka otworzy OpenRouter; zarejestruj się lub zaloguj i zezwól na dostęp. Gdy przeglądarka pokaże, że połączono, zamknij tę kartę przeglądarki i wróć. Nie trzeba kopiować żadnego klucza, a karta w GenOffice pokazuje, ile darmowych żądań zostało na dziś.
- **Google Gemini**: naciśnij **Uzyskaj klucz**, utwórz klucz w Google AI Studio, wklej go na karcie i naciśnij **Połącz**. Tylko dla osób, które mają co najmniej 18 lat. Klucz utworzony w projekcie Google z włączonymi płatnościami może generować opłaty.
- Po połączeniu to AI zostaje wybrane w polu **Używane AI**. Gdy połączone są oba, przycisk **Użyj tego AI** na karcie przełącza między nimi. **Rozłącz** usuwa klucz z GenOffice.
- Darmowe modele są słabsze niż modele z subskrypcji, a liczba żądań na dzień jest ograniczona. Jedna edycja dokumentu może zużyć kilka z nich. Gdy dzisiejszy limit się wyczerpie, panel AI o tym poinformuje i poda, kiedy znów będzie można z niego korzystać.
- Podczas darmowego korzystania to, co wysyłasz, może posłużyć do ulepszania AI tej firmy. Uważaj na dokumenty zawierające dane osobowe.

## Logowania rozliczane za zużycie

Karta z napisem **Zalogowano, ale nie w ramach subskrypcji** zawiera ostrzeżenie: „To nie jest subskrypcja: płacisz za faktyczne zużycie.”

- GenOffice nie używa tego logowania, dopóki nie naciśniesz **Użyj mimo to**. Od tej chwili każde żądanie obciąża to konto.
- Nawet wtedy nie jest ono nigdy wybierane automatycznie. Wybierz je samodzielnie w polu **Używane AI**, gdzie jest oznaczone jako **Płatne**.
- Zgoda jest zapamiętywana tylko dla tego programu. Znika, gdy program zostanie wylogowany albo zmieni się jego logowanie.
- Aby zamiast tego korzystać z subskrypcji, zaloguj program na konto z subskrypcją i naciśnij **Sprawdź ponownie**.

## Zmiana konta i wylogowanie

Zalogowana karta pokazuje konto, na które jest zalogowana. Karty Claude i Codex pokazują też nazwę planu, jeśli program ją podaje. Pojawiają się również dwa przyciski.

- **Zaloguj się na inne konto** ponownie uruchamia logowanie samego programu. Dokończ je w oknie, które się otworzy, używając drugiego konta.
- **Wyloguj się** uruchamia wylogowanie samego programu. Potem na karcie widać **Nie zalogowano**.
- Na kartach Claude i Codex obie czynności dotyczą tego programu na całym komputerze, a nie tylko GenOffice. Jeśli używasz Claude Code lub Codex także w terminalu, tam również nastąpi wylogowanie albo zmiana konta. Dlatego GenOffice najpierw prosi o potwierdzenie.
- Na kartach Claude i Codex jest też **Nie używaj w tej aplikacji**. Program i jego logowanie pozostają bez zmian, tylko GenOffice przestaje z niego korzystać: nie sprawdza stanu, nie wysyła żądań, a **Automatycznie** go pomija. Korzystanie z programu w terminalu się nie zmienia. Karta pokazuje wtedy **Wyłączone w tej aplikacji**, a **Używaj ponownie** włącza go z powrotem. Żadna z tych czynności nie prosi o potwierdzenie, bo poza GenOffice nic się nie zmienia.
- Karta ChatGPT działa inaczej. **Wyloguj się** prosi o potwierdzenie komunikatem „Spowoduje to odłączenie ChatGPT od tej aplikacji”; po potwierdzeniu GenOffice prosi OpenAI o zakończenie połączenia tej aplikacji i usuwa logowanie przechowywane na tym komputerze. **Zaloguj się na inne konto** od razu, bez pytania, otwiera stronę logowania w przeglądarce. Żadna z tych czynności nie wpływa na inne programy na tym komputerze, także na Codex.
- Połączona karta ChatGPT pokazuje napis „AI w tej aplikacji działa w ramach Twojego planu ChatGPT” i ma link **Zarządzaj użyciem**. Otwiera on stronę użycia w ustawieniach ChatGPT, gdzie widać, ile zużywa ta aplikacja, i można ustawić limit tylko dla niej.
- Konto i te dwa przyciski są tylko tutaj, w Ustawienia ▸ AI. GenOffice pokazuje konto i nigdzie go nie zapisuje.

## Które AI jest używane

Pole **Używane AI** w Ustawienia ▸ AI jest początkowo ustawione na **Automatycznie**. Tryb automatyczny decyduje w tej kolejności:

1. Claude, gdy jego karta pokazuje Połączono.
2. W przeciwnym razie ChatGPT, gdy jego karta pokazuje Połączono.
3. W przeciwnym razie Codex, gdy jego karta pokazuje Połączono.
4. W przeciwnym razie żadne AI nie jest połączone, a panel AI zamiast błędu pokazuje przewodnik połączenia.

Tryb automatyczny nigdy nie wybiera niczego, co kosztuje dodatkowo: ani klucza API, ani logowania rozliczanego za zużycie. Są one używane tylko wtedy, gdy wybierzesz je samodzielnie.

Możesz też samodzielnie wybrać jedno AI — w tym samym miejscu albo na liście modeli u dołu panelu AI. Jeśli wybrane AI przestanie działać, GenOffice nie przejdzie po cichu na inne. Poinformuje, co się stało, i pokaże, jak połączyć się ponownie.

Lista modeli pokazuje modele podawane przez sam program (w przypadku ChatGPT: modele, z których według OpenAI może korzystać twój plan; dopóki nie wybierzesz modelu, używany jest pierwszy z nich): każdy z nazwą i dokładnym identyfikatorem obok, a przy pozycji **Model domyślny** widać, któremu modelowi ona teraz odpowiada. Etykieta u dołu panelu AI i pole **Używane AI** również podają ten model. Odczytanie listy o nic nie pyta AI, więc nie wlicza się do twojego planu. Jeśli program jest zbyt stary, by podać swoje modele, zamiast tego pokazywana jest krótka wbudowana lista.

Wszędzie tam, gdzie można wybrać Codex, towarzyszy mu jedno zdanie: „Korzystanie z subskrypcji Codex wewnątrz aplikacji nie jest metodą oficjalnie zalecaną przez OpenAI.” Weź to pod uwagę przy wyborze.

## Gdy żądanie zostaje zatrzymane

Żądanie zatrzymuje się, gdy limit planu został wyczerpany, gdy logowanie wygasło albo gdy programu już nie ma. GenOffice samo nie przełącza się na inne AI.

- Przyczyna jest podana w miejscu, w którym odpowiedź się urwała. Przy wyczerpanym limicie widać też godzinę jego odnowienia, jeśli program ją podaje.
- ChatGPT połączony bezpośrednio zatrzymuje się, gdy wyczerpie się limit twojego planu albo limit ustawiony dla tej aplikacji w ustawieniach ChatGPT. Godzina odnowienia nie jest pokazywana. Jeśli odłączysz tę aplikację w ustawieniach ChatGPT, karta zmieni się na **Nie zalogowano**; zaloguj się ponownie.
- Jeśli połączona jest twoja druga subskrypcja, pojawia się przycisk **Kontynuuj z …**, na przykład **Kontynuuj z ChatGPT** lub **Kontynuuj z Codex**. Po jego naciśnięciu to ona staje się używanym AI — lista modeli pokazuje zmianę — a żądanie jest wykonywane ponownie.
- Jeśli jedynym innym połączeniem jest dopuszczone przez ciebie logowanie rozliczane za zużycie, ten sam przycisk ma dopisek o kosztach.
- Nigdy nie ma przycisku, który przenosi na klucz API.

## Wiersz zużycia

Gdy wykorzystasz 80% limitu lub więcej, panel AI pokazuje wiersz taki jak „Wykorzystano 85% · odnowienie o 15:00”. Claude podaje limit 5-godzinny i limit 7-dniowy, a Codex jest pokazywany tak samo, jeśli je podaje. Poniżej 80% albo gdy program niczego nie podaje, wiersza nie ma. ChatGPT połączony bezpośrednio nie pokazuje takiego wiersza; zużycie sprawdzisz przez **Zarządzaj użyciem** na karcie ChatGPT.

## Co jest wysyłane i dokąd

Gdy subskrypcji można użyć po raz pierwszy, GenOffice jednorazowo pokazuje informację. Aby przeczytać ją ponownie, przejdź do Ustawienia ▸ AI ▸ **Informacja przy pierwszym połączeniu** i naciśnij **Pokaż ponownie**. Mówi ona trzy rzeczy:

- Treść dokumentu i rozmowa są wysyłane do Anthropic lub OpenAI z Twojego własnego konta.
- To, czy te treści służą do trenowania AI, zależy od ustawień Twojego konta w danej firmie, a nie od GenOffice.
- GenOffice wyłącza zapisywanie historii rozmów w Codex, ale Codex może nadal przechowywać własne dzienniki diagnostyczne na tym komputerze.

Żądania przez ChatGPT połączony bezpośrednio nie przechodzą przez program Codex; trafiają z tego komputera prosto do OpenAI.

To, co ukryjesz poleceniem **Ukryj zaznaczenie przed AI**, nie jest wysyłane, niezależnie od tego, z którego AI korzystasz.

## Warto wiedzieć

- **Szybkość.** Odpowiedź przez Claude Code lub Codex zaczyna się kilka sekund później niż przez klucz API, bo najpierw musi się uruchomić program. ChatGPT połączony bezpośrednio nie uruchamia żadnego programu.
- **Darmowy plan ChatGPT.** Jest pokazywany jako Połączono, ale ma małe limity, więc żądania zatrzymują się szybciej. Wiersz zużycia się dla niego nie pojawia.
- **Generowanie obrazów.** W tej wersji subskrypcja nie generuje obrazów, w żadnym planie. Do tego potrzebny jest klucz dostawcy obrazów; zobacz [Modele AI i ustawienia](help://ai-models).
- **Serwery proxy.** Claude Code i Codex nie przejmują ustawień proxy z GenOffice. Korzystają z proxy ustawionego dla tego komputera, na przykład ze zmiennej środowiskowej `HTTPS_PROXY`, tak samo jak po uruchomieniu w terminalu. Jeśli nie mogą się połączyć w terminalu, nie połączą się także stąd.
- **Polecenia i inne programy.** Żądanie, które przychodzi z polecenia `ieumoffice` albo od podłączonego agenta programistycznego, nie korzysta z subskrypcji, dopóki na to nie pozwolisz. Nawet wtedy korzysta z Claude Code lub Codex, nigdy z ChatGPT połączonego bezpośrednio. Zobacz [Podłączenie z agentem programistycznym](help://mcp).
- **Tryb agenta.** [Tryb agenta](help://agent-mode) uruchamia Claude Code lub Codex na tym komputerze. ChatGPT połączony bezpośrednio nie może uruchomić agenta.
