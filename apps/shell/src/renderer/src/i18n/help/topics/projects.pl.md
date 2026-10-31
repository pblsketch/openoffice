# Projekty

Projekt to jeden folder na twoim komputerze. Gdy wybierzesz projekt w panelu AI, AI pracuje, znając pliki, instrukcje, pamięć i rozmowy z tego folderu. Trzymaj dokumenty jednej sprawy w jednym folderze, a rozmowę zaczętą w Docs będzie można dokończyć w Hangul lub Slides, bez ponownego tłumaczenia kontekstu w każdym dokumencie.

## Wybieranie projektu

- W panelu AI każdego edytora i w **Ask AI** na stronie głównej nazwa bieżącego projektu jest po lewej, pod polem wpisywania. Gdy żaden nie jest wybrany, widać **Bez projektu**.
- Kliknij ją, aby otworzyć listę: projekty **Przypięte** i **Ostatnie**, **Nowy projekt**, **Dodaj folder** i **Bez projektu**. Pisz w polu u góry, aby wyszukiwać; gdy żaden projekt nie pasuje, możesz utworzyć nowy o tej nazwie.
- Po najechaniu na wiersz pojawiają się przypięcie, **Otwórz folder** i **Usuń z listy**. Usunięcie projektu z listy nie rusza folderu ani plików w nim.
- Projekt, którego folder przeniesiono lub usunięto, jest wyszarzony z napisem **Brak folderu**. Kliknij go i wskaż przeniesiony folder, aby dalej pracować z tym samym projektem.
- Gdy otworzysz dokument leżący w folderze projektu, ten projekt jest już wybrany. Jeśli przełączysz ten dokument na **Bez projektu**, tak zostanie przy następnym otwarciu. Projekt wybrany dla dokumentu spoza folderu też jest zapamiętywany dla tego dokumentu.
- Wybrany projekt obowiązuje od następnego zapytania w tym panelu. Zmiana w trakcie rozmowy zaczyna nową rozmowę; poprzednia zostaje tam, gdzie była.

## Nowy projekt i Dodaj folder

- **Nowy projekt**: wpisz nazwę, a w domyślnym folderze zapisu (na początku `Dokumenty\GenOffice`; można to zmienić w Ustawieniach) powstanie folder o tej nazwie. **Utwórz w innym miejscu…** pozwala wybrać inne miejsce. Jeśli folder o tej nazwie już istnieje, aplikacja zapyta, czy użyć go jako projektu, a **Użyj tego folderu** zaczyna od niego. Jeśli ten folder jest już projektem z twojej listy, otworzy się od razu, bez pytania.
- **Dodaj folder** (na ekranie Projekty strony głównej: **Użyj istniejącego folderu**): użyj folderu, który już masz. Jego podfoldery też się liczą. Nie można wybrać całego dysku, całego folderu użytkownika ani folderów z danymi logowania lub danymi aplikacji.
- Gdy otworzysz dokument z folderu projektu, którego nie ma na twojej liście, pod polem wpisywania pojawi się „Ten dokument jest w folderze projektu »…«” z przyciskiem **Użyj**. Kliknięcie go działa tak samo jak Dodaj folder.
- Jeśli folder otrzymany od kogoś innego zawiera już instrukcje lub pamięć, `AGENTS.md` albo `CLAUDE.md` czy rozmowy napisane na innym komputerze, aplikacja raz je pokazuje i pyta. **Pokaż wszystko** pozwala najpierw przeczytać całość. **Użyj z instrukcjami** korzysta ze wszystkiego. **Użyj bez instrukcji** nie przekazuje tych instrukcji ani tej pamięci do AI, ukrywa rozmowy z innych komputerów i przestaje dopisywać pamięć; czytanie plików nadal działa. Później możesz to zmienić przyciskiem **Użyj też instrukcji** na stronie projektu. **Anuluj** albo zamknięcie pytania bez wyboru nie dodaje folderu.
- Potem pytanie już nie wraca. Jeśli instrukcje lub pamięć zmienią się poza GenOffice, panel AI raz pokaże „Instrukcje się zmieniły”, a **Pokaż** otworzy tę część strony projektu.

## Instrukcje i pamięć

- **Instrukcje** to zasady tego projektu, na przykład „Pisz raporty w punktach i nigdy nie skracaj nazwy instytucji”. Wpisz je na stronie projektu na stronie głównej i naciśnij **Zapisz**. Jeśli na górze folderu jest `AGENTS.md` lub `CLAUDE.md`, one też są czytane; możesz je wyłączyć na stronie projektu.
- **Pamięć** to notatki, które AI robi w trakcie rozmów: fakty, upodobania i decyzje przydatne później, każda w osobnym wierszu z datą. Za każdym razem, gdy AI coś zapisze, panel AI pokazuje „Zapamiętano: …” z przyciskiem **Usuń**. Jeśli ta notatka została już usunięta, wiersz brzmi „Usunięto z pamięci: …” i nie ma przycisku **Usuń**. AI nie pyta wcześniej o zgodę.
- Gdy pamięć się rozrośnie, panel AI pokazuje „Pamięć robi się długa” z przyciskiem **Uporządkuj**. Naciśnięcie go łączy notatki, które się powtarzają lub są nieaktualne. Poprzednia wersja jest zachowana, a **Cofnij** ją przywraca. Porządkowanie odbywa się tylko po naciśnięciu przycisku i wysyła jedno zapytanie do AI.
- Na stronie projektu możesz usuwać notatki, edytować całą pamięć i ją wyłączyć. Wyłączona pamięć nie zbiera nic nowego, a istniejąca jest dalej czytana.
- Z bardzo długich instrukcji odpada końcówka, a panel AI o tym informuje. Pamięć zawsze jest wysyłana w całości, niezależnie od długości.

## Pliki, które widzi AI

- Przy każdym zapytaniu AI dostaje nazwę projektu, jego instrukcje i pamięć oraz listę nazw plików w folderze. Treść pliku czyta samo, gdy jej potrzebuje, tak samo jak załącznik, więc fragmenty ukryte przed AI pozostają ukryte.
- AI nie czyta otwartych dokumentów z niezapisanymi zmianami, ukrytych plików, których nazwa zaczyna się od kropki, ani folderu `.ieumoffice`.
- Aby ukryć plik przed AI, naciśnij **Ukryj przed AI** w części Pliki na stronie projektu. Można to cofnąć. Plik nadal pojawia się w wynikach wyszukiwania na stronie głównej.
- W folderach synchronizowanych przez OneDrive, Google Drive i podobne usługi pliki niepobrane na ten komputer są oznaczone jako „Nie na tym komputerze”. Gdy AI chce przeczytać taki plik, najpierw padnie pytanie, czy go pobrać.
- Wpisz `@` w polu wpisywania, a po otwartych dokumentach pojawi się „Pliki w tym projekcie”. Wybranie pliku go załącza. Zobacz [Panel asystenta AI](help://ai-panel).
- Nowe dokumenty, które AI tworzy w projekcie, są zapisywane w folderze bieżącego dokumentu albo na górze folderu projektu, gdy prosisz ze strony głównej. Jeśli nazwa jest zajęta, dodawane jest `(2)`, żeby żaden plik nie został zastąpiony.

## Rozmowy

- Panel AI z wybranym projektem pokazuje u góry tytuł bieżącej rozmowy. Kliknij go, aby zobaczyć listę rozmów tego projektu, pole wyszukiwania i **Nowa rozmowa**. Każdą rozmowę z listy można podjąć w dowolnym edytorze.
- To, co zrobiono w innym edytorze, widać w jednym wierszu, np. „Uruchomiono 3 narzędzia w Hangul »raport.hwp«”. AI używa tylko narzędzi edytora, w którym jesteś.
- Po otwarciu dokumentu widać rozmowę używaną w nim ostatnio. Jeśli dwa okna mają otwartą tę samą rozmowę, wiadomość wysłana w jednym od razu pojawia się w drugim.
- Rozmowy napisane na innym komputerze mają oznaczenie **Inny komputer**.
- Na liście możesz zmieniać nazwy rozmów lub je usuwać. Usunięta rozmowa trafia do kosza.
- Rozmowy, które dokument miał przed pojawieniem się tej funkcji, są na dole listy, w części **Wcześniejsze rozmowy w tym dokumencie**.
- Rozmowy **Bez projektu** zapisują się dla każdego dokumentu osobno, jak dawniej. W Ask AI na stronie głównej bez projektu rozmowa kończy się po zamknięciu aplikacji.

## Strona projektu na stronie głównej

**Projekty** na pasku bocznym strony głównej to miejsce, w którym tworzysz **Nowy projekt**, wybierasz **Użyj istniejącego folderu** i otwierasz projekt, aby nim zarządzać.

- **Nagłówek**: nazwa (jej zmiana nie zmienia nazwy folderu), ścieżka folderu, **Otwórz w Eksploratorze plików** (na Macu **Pokaż w Finderze**) i stan. Gdy projekt jest używany bez instrukcji, widać przycisk **Użyj też instrukcji**.
- **Instrukcje**: pole instrukcji oraz `AGENTS.md` i `CLAUDE.md` czytane razem z nim.
- **Pamięć**: lista notatek, **Edytuj całość**, **Uporządkuj**, włączanie i wyłączanie pamięci.
- **Pliki**: pliki widoczne dla AI i te przed nim ukryte. Kliknij nazwę pliku, aby go otworzyć.
- **Rozmowy**: rozmowy tego projektu. Kliknij jedną, aby otworzyć dokument, w którym była używana ostatnio, i kontynuować w tamtym panelu AI.
- Ta strona wczytuje folder od nowa za każdym razem, gdy się pojawia, więc notatka, którą AI właśnie zapamiętało, jest widoczna bez wychodzenia z niej. Jeśli plik instrukcji lub pamięci zmienił się poza GenOffice w trakcie edycji, **Zapisz** najpierw pyta: **Wczytaj ponownie** wczytuje zmieniony plik, a **Zapisz mimo to** nadpisuje go twoimi zmianami.

## Co zostaje w folderze i o czym warto wiedzieć

- Instrukcje, pamięć i rozmowy są przechowywane jako pliki tekstowe w folderze `.ieumoffice` wewnątrz folderu projektu. Gdy przeniesiesz folder lub skopiujesz go na inny komputer, wędrują razem z nim. Na innym komputerze wybierz go raz przez **Dodaj folder** w panelu AI albo **Użyj istniejącego folderu** na ekranie Projekty strony głównej.
- Folder `.ieumoffice` powstaje dopiero wtedy, gdy jest coś do zapisania. Jego pliki możesz otworzyć i edytować w Notatniku.
- To, co wpisujesz w rozmowie, może trafić do pamięci. Aby czegoś tam nie zostawić, usuń to przyciskiem **Usuń** w wierszu „Zapamiętano” albo wyłącz pamięć.
- Jeśli wybierzesz jako projekt folder synchronizowany, jego instrukcje, pamięć i rozmowy też trafią do tej usługi. Aplikacja informuje o tym raz, przy pierwszym wyborze.
- W folderze udostępnionym, z którego korzysta kilka osób, pamięć i rozmowy mogą się wymieszać.
- W folderze, do którego aplikacja nie może zapisywać, na przykład tylko do odczytu, instrukcje i czytanie plików działają, ale rozmowy i pamięć nie są zapisywane. Panel AI o tym informuje.
- Okno agenta nie korzysta jeszcze z projektów. Agent może zmieniać także pliki w folderze `.ieumoffice`, więc w folderze z materiałami, których nie znasz, używaj jednego ze sposobów, które najpierw pytają. Zobacz [Tryb agenta](help://agent-mode).
