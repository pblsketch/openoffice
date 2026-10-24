# Umiejętności

Umiejętność to zestaw instrukcji roboczych dla AI. Zapisz raz to, co robisz wciąż od nowa — kroki porządkowania notatek ze spotkania, ton raportu, punkty do sprawdzenia za każdym razem — a potem wywołasz to w panelu AI albo AI samo po to sięgnie, gdy będzie pasować. Umiejętność to folder z plikiem `SKILL.md` w otwartym formacie, więc umiejętność utworzona w GenOffice działa bez zmian także w Claude Code i Codex.

## Włączanie i wyłączanie umiejętności

**Ustawienia ▸ Umiejętności** pokazuje umiejętności na tym komputerze, pogrupowane według pochodzenia. Każda umiejętność jest pokazana pod swoją nazwą, tak jak w agentach programistycznych. Polem wyszukiwania u góry znajdziesz umiejętność po nazwie lub opisie.

| Pochodzenie                    | Co zawiera                                                              | Na początku |
| ------------------------------ | ----------------------------------------------------------------------- | ----------- |
| **Wbudowane**                  | 5 umiejętności dostarczanych z GenOffice                                | Włączone    |
| **Moje umiejętności**          | Umiejętności dodane lub utworzone przez ciebie (`~/.ieumoffice/skills`) | Włączone    |
| **Folder umiejętności Claude** | Umiejętności z `~/.claude/skills`                                       | Wyłączone   |
| **Wtyczki Claude**             | Umiejętności zainstalowanych wtyczek Claude                             | Wyłączone   |
| **Folder umiejętności Codex**  | Umiejętności z `~/.agents/skills`                                       | Wyłączone   |

- Przełącznik włącza lub wyłącza umiejętność. To samo ustawienie obowiązuje w panelu AI każdego edytora, w Ask AI na stronie głównej i w oknie agenta.
- Dla włączonej umiejętności wybierz **Decyduje AI** lub **Tylko na wezwanie**. Na początku ustawione jest Decyduje AI. Przy Tylko na wezwanie umiejętność jest używana tylko wtedy, gdy sam ją wywołasz.
- Umiejętności z różnych źródeł mogą mieć tę samą nazwę. Rozróżnisz je po etykiecie pochodzenia w każdym wierszu.
- W menu dodatkowych opcji są **Pokaż zawartość**, **Edytuj** (tylko moje umiejętności), **Eksportuj (zip)** (tylko moje umiejętności) i **Otwórz folder**.
- **Przenieś do kosza** przenosi jedną z moich umiejętności do systemowego kosza, skąd można ją przywrócić.
- Wbudowanej umiejętności się nie usuwa, tylko ukrywa: wybierz **Ukryj**. **Pokaż ponownie** na dole listy przywraca ją w stanie początkowym.
- Aby zmienić umiejętność wbudowaną lub pochodzącą z innego programu, wybierz **Kopiuj do moich umiejętności**. Kopia pojawia się w moich umiejętnościach, a oryginał zostaje wyłączony.
- Gdy eksportujesz umiejętność z szablonem, do pliku zip trafia też dokument szablonu. Przed eksportem sprawdź, czy dokument nie zawiera danych osobowych.

## Dodawanie umiejętności

1. W **Ustawienia ▸ Umiejętności** kliknij **Dodaj**.
2. Wybierz **Z folderu**, **Z pliku zip** lub **Z linku GitHub**. W przypadku GitHub wpisz adres publicznego repozytorium albo `owner/repo` i kliknij **Znajdź**.
3. Sprawdź w podglądzie znalezione umiejętności. Podgląd pokazuje liczbę i rozmiar plików, to, czy są skrypty, adresy internetowe w tekście oraz plik licencji.
4. Zaznacz tylko te umiejętności, które chcesz zainstalować, i kliknij **Zainstaluj**. Zainstalowane umiejętności są od razu włączone.

Pod podglądem zawsze widnieje: „Instaluj umiejętności tylko z zaufanych źródeł. Umiejętność przekazuje AI instrukcje, a w oknie agenta może uruchamiać skrypty”. Umiejętność z nieznanego źródła przeczytaj, zanim ją zainstalujesz.

- Jeśli w moich umiejętnościach jest już jedna o tej samej nazwie, wybierz w tym wierszu **Zastąp** lub **Pomiń**.
- Przy pobieraniu z GitHub GenOffice łączy się tylko z `github.com`, `api.github.com` i `codeload.github.com` i nie wysyła żadnych danych logowania. Jeśli archiwum jest za duże albo nie przejdzie kontroli bezpieczeństwa, nic nie zostanie zainstalowane.
- **Nowa umiejętność** otwiera pusty edytor, w którym sam wpisujesz nazwę, opis i instrukcje.

## Sprawdzanie aktualizacji

- W przypadku umiejętności zainstalowanej z GitHub polecenie **Sprawdź aktualizacje** w menu dodatkowych opcji szuka nowej treści. GenOffice łączy się z GitHub dopiero po kliknięciu.
- Jeśli nic się nie zmieniło, pojawia się „Aktualna”. Jeśli coś się zmieniło, przejrzyj zmienione pliki i podgląd, a potem kliknij **Aktualizuj**.
- Jeśli po instalacji sam edytowałeś umiejętność, pojawia się też „Twoje zmiany zostaną utracone”.
- Aktualizacja zachowuje stan włączenia umiejętności i wybór między Decyduje AI a Tylko na wezwanie.

## Wywoływanie umiejętności w panelu AI

1. Wpisz `/` lub `$` na początku pola wpisywania AI albo zaraz po spacji. Pojawi się lista włączonych umiejętności.
2. Pisz dalej, aby zawęzić listę. Na przykład `/meet` znajduje `meeting-minutes`. Działają też słowa z opisu, więc znajdzie ją także `/prot`.
3. Wybierz umiejętność strzałkami i naciśnij Enter lub Tab. Umiejętność staje się etykietą nad polem wpisywania.
4. Napisz, czego chcesz, i wyślij. GenOffice dołącza do prośby treść umiejętności.

- W panelu AI Excela `$` otwiera listę tylko na samym początku pola wpisywania, żeby nie przeszkadzać w adresach komórek takich jak `$A$1`.
- Możesz dodać kilka etykiet i usunąć jedną przez ×. Esc tylko zamyka listę; nie zatrzymuje działania AI.
- **Zarządzaj umiejętnościami…** na dole listy otwiera **Ustawienia ▸ Umiejętności**.
- Etykiety zostają przy wysłanej wiadomości i w zapisanej rozmowie. Gdy otworzysz rozmowę ponownie i znów coś wyślesz, aktualna treść umiejętności zostanie odczytana na nowo. Umiejętność, która w międzyczasie została usunięta lub wyłączona, ma na etykiecie napis „Brak”.
- Jeśli tekst umiejętności do wysłania jest za długi, pojawia się „Umiejętności są za duże, by wysłać je razem” i nic nie zostaje wysłane.

## Umiejętności, których AI używa samo

- Nazwy i opisy włączonych umiejętności ustawionych na Decyduje AI trafiają do AI w postaci listy. Gdy któraś pasuje do prośby, AI pobiera jej treść i z niej korzysta.
- Gdy AI użyje umiejętności, w rozmowie pojawia się „Użyto umiejętności 〈nazwa〉”.
- AI decyduje na podstawie opisu, czy użyć umiejętności. Opis, który mówi, kiedy umiejętność ma być używana, pomaga mu dobrze wybrać.

## Tworzenie umiejętności na prośbę

1. W panelu AI napisz na przykład „Zapisz jako umiejętność to, co właśnie zrobiliśmy” albo „Utwórz umiejętność, która pisze raporty w naszym stylu”.
2. AI wyłuskuje kroki i reguły warte powtarzania i pokazuje kartę **Nowa umiejętność**. Wartości użyte tylko ten jeden raz, takie jak imiona i daty, nie trafiają do instrukcji.
3. Sprawdź i popraw na karcie nazwę, opis i instrukcje. Nazwa jest widoczna na liście umiejętności i to ją wpisujesz po `/`: małe litery angielskie, cyfry i łączniki.
4. Kliknij **Zapisz**. Nowa umiejętność trafia do moich umiejętności, zostaje włączona i od razu pojawia się na liście `/`.

- Żaden plik nie zostanie zapisany, dopóki nie klikniesz **Zapisz**. Jeśli klikniesz **Anuluj**, rozmowa zachowa ją tylko jako „Niezapisana propozycja umiejętności”.
- Możesz też poprosić o zmianę istniejącej umiejętności, na przykład „Zmień umiejętność protokołu tak, jak to u nas wygląda”. Karta ma wtedy tytuł **Zmień umiejętność**. Jedna z moich umiejętności zostaje nadpisana przez **Zastąp**; umiejętność wbudowana lub z innego programu jest zapisywana jako kopia w moich umiejętnościach, a oryginał zostaje wyłączony.

## Dodawanie dokumentu jako szablonu

Gdy tworzysz umiejętność w panelu AI edytora, bieżący dokument może dołączyć do niej jako szablon. Zaznacz na karcie **Zapisz też ten dokument jako szablon**, a przycisk zamieni się w dwa.

- **Utwórz pusty szablon**: kopia dokumentu otwiera się w nowej karcie „Podgląd szablonu - 〈tytuł〉”, a AI w tej karcie czyści wpisane wartości, takie jak imiona, daty i dane osobowe. Przejrzyj kartę, popraw resztę ręcznie i kliknij **Zapisz tę kartę jako szablon**; karta w takim stanie, w jakim jest w tej chwili, staje się szablonem.
- **Zapisz dokument bez zmian**: zapisuje bieżący dokument jako szablon bez żadnych zmian. Jeśli dokument ma fragmenty ukryte przed AI, ten przycisk jest zablokowany, żeby ukryta treść nie trafiła do szablonu w niezmienionej postaci.
- Szablon jest przechowywany jako kopia dokumentu w folderze umiejętności. Oryginalny dokument się nie zmienia.

## Używanie umiejętności z szablonem

- Umiejętność z szablonem ma na liście oznaczenie **Zawiera szablon**.
- Wywołaj ją jako etykietę i wyślij, a kopia szablonu otworzy się jako nowy dokument bez tytułu; AI w tej karcie zajmie się twoją prośbą. W pierwotnym panelu zostaje „Praca z szablonem trwa w nowej karcie” i **Przejdź do karty**.
- Gdy AI samo wybierze umiejętność z szablonem, karta nie otwiera się od razu. Zamiast tego rozmowa pokazuje przycisk **Otwórz nowy dokument z tego szablonu**.
- Miejsce nowego dokumentu zwykle wybierasz przy pierwszym zapisie. Edytory Markdown i HTML zapisują jednak jak dotąd do folderu domyślnego. Sam plik szablonu pozostaje bez zmian.

## Umiejętności ze skryptami

- W zwykłym panelu AI i w Ask AI na stronie głównej skrypty umiejętności nigdy nie są uruchamiane. Do AI trafia tylko tekst umiejętności.
- Umiejętność ze skryptami ma oznaczenie **Zawiera skrypty · w pełni działa w oknie agenta**, a po dodaniu jej jako etykiety pojawia się „Skrypty tej umiejętności nie są uruchamiane w zwykłym panelu AI”. Wysyłanie nie jest blokowane.
- Aby skorzystać też ze skryptów, wywołaj umiejętność w oknie agenta. Zobacz [Tryb agenta](help://agent-mode).

## Wbudowane umiejętności

| Umiejętność       | Co robi                                                                                 |
| ----------------- | --------------------------------------------------------------------------------------- |
| `meeting-minutes` | Zamienia notatki ze spotkania w protokół z decyzjami i zadaniami do wykonania           |
| `internal-comms`  | Pisze ogłoszenia, biuletyny, raporty z postępów, FAQ i inne teksty wewnętrzne           |
| `humanizer`       | Wyszukuje sformułowania brzmiące jak pisane przez AI i wygładza je                      |
| `copy-editing`    | Przechodzi przez napisany przez ciebie tekst angielski, by był jaśniejszy i zwięźlejszy |
| `find-skills`     | Znajduje w oknie agenta potrzebne umiejętności i proponuje ich instalację               |

`copy-editing` jest przeznaczona do angielskich tekstów marketingowych. `find-skills` działa tylko w oknie agenta.

## W oknie agenta

- Okno agenta stosuje te same ustawienia włączenia z **Ustawienia ▸ Umiejętności**, a umiejętności wywołujesz w jego polu wpisywania tak samo, przez `/` lub `$`.
- Umiejętności z `.claude/skills` i `.agents/skills` w folderze projektu są używane w tej sesji bez włączania.
- Lista umiejętności zostaje ustalona na początku sesji. Jeśli w trakcie sesji włączysz lub wyłączysz umiejętności, pojawi się „Zmienione umiejętności obowiązują od następnej sesji”.
- Gdy agent tworzy umiejętność, w oknie pojawia się ta sama karta. Jako szablon wybierz jeden z dokumentów otwartych w kartach albo plik z folderu projektu.
- Gdy agent znajdzie umiejętność wartą zainstalowania, pojawia się propozycja instalacji. Otwórz ją przez **Otwórz podgląd** i sam kliknij **Zainstaluj**; w przeciwnym razie nic nie zostanie zainstalowane. Zainstalowana umiejętność jest dostępna od następnej sesji.
