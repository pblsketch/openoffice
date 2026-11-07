# Instalacja GenOffice

Każda wersja jest publikowana na [stronie Releases](https://github.com/pblsketch/openoffice/releases/latest) projektu w serwisie GitHub. Wersja dla systemu Windows jest publikowana razem z wersjami dla Maca i Linuksa, wydawanymi jako beta. Twórca nie może bezpośrednio testować wersji dla Maca i Linuksa; potwierdzają je zgłoszenia użytkowników.

## Wybierz plik dla swojego komputera

| Platforma                               | Wymagania                                  | Plik                              |
| --------------------------------------- | ------------------------------------------ | --------------------------------- |
| **Windows**                             | Windows 10 lub nowszy, 64-bitowy Intel/AMD | `GenOffice-Setup-<version>.exe`   |
| **Mac (beta)**, Apple Silicon           | macOS 12 lub nowszy, układ M1 lub nowszy   | `GenOffice-<version>-arm64.dmg`   |
| **Mac (beta)**, Intel                   | macOS 12 lub nowszy, procesor Intel        | `GenOffice-<version>-x64.dmg`     |
| **Linux (beta)**, dowolna dystrybucja   | 64-bitowy (x86_64)                         | `GenOffice-<version>.AppImage`    |
| **Linux (beta)**, rodzina Ubuntu/Debian | 64-bitowy (x86_64)                         | `ieumoffice_<version>_amd64.deb`  |
| **Linux (beta)**, Fedora/RHEL/openSUSE  | 64-bitowy (x86_64)                         | `ieumoffice-<version>.x86_64.rpm` |

Aby sprawdzić, jakiego Maca masz, otwórz menu Apple ▸ **Ten Mac**. Jeśli przy pozycji „Układ” widnieje Apple M…, pobierz plik kończący się na `-arm64.dmg`; jeśli przy pozycji „Procesor” widnieje Intel …, pobierz plik kończący się na `-x64.dmg`. Pozostałe pliki na stronie Releases (`.zip`, `.yml`, `.blockmap`) służą samej aplikacji do aktualizacji; nie trzeba ich pobierać. Starsze wersje pozostają na stronie Releases.

## W systemie Windows

1. Pobierz plik `GenOffice-Setup-<version>.exe` ze strony Releases.
2. Uruchom go. Instalator nie ma podpisu cyfrowego, więc Windows może najpierw wyświetlić niebieskie okno „System Windows ochronił ten komputer”. Wybierz **Więcej informacji**, a potem **Uruchom mimo to**. Dokładne brzmienie zależy od wersji systemu Windows.
3. Przejdź przez instalator do końca.

Instalator umieszcza GenOffice w menu Start i rejestruje `.docx`, `.xlsx`, `.pptx`, `.pdf` i podobne, więc dwuklik na plik go otwiera.

Ponieważ instalator nie jest podpisany, uruchamiaj tylko taki, który został pobrany z podanej wyżej strony Releases.

## Gdy system Windows blokuje pobieranie lub instalację

### Edge informuje, że plik „nie jest często pobierany”

Microsoft Defender SmartScreen ostrzega w ten sposób przed plikiem, którego nie pobrało jeszcze wiele osób. Według przewodnika Microsoftu plik zachowuje się tak:

1. Otwórz listę pobrań w Edge (**Ctrl+J**), naciśnij **…** obok pliku i wybierz **Zachowaj**.
2. W oknie, które się otworzy, naciśnij **Pokaż więcej**, a potem **Zachowaj mimo to**. Plik zostanie w folderze Pobrane.

To okno ma też przycisk zgłaszający plik jako bezpieczny. Otwiera on tylko stronę zgłoszeń Microsoftu (`feedback.smartscreen.microsoft.com`) i nie zachowuje pliku. Zamknij tę stronę i zamiast tego naciśnij **Pokaż więcej** w oknie.

Jeśli w oknie nie ma przycisku **Pokaż więcej** albo **Zachowaj mimo to**:

- Na komputerze zarządzanym przez szkołę lub firmę administrator może wyłączyć pomijanie tych ostrzeżeń (zasada Edge). Wtedy nikt na tym komputerze nie może zachować pliku; poproś administratora, aby go zainstalował lub na niego zezwolił.
- Pobranie ze strony Releases w innej przeglądarce daje ten sam plik.
- Jeśli żadna z tych metod nie pomoże, a to Twój własny komputer, przewodnik Microsoftu dotyczący rozwiązywania problemów z pobieraniem pozwala w ostateczności na chwilę wyłączyć Microsoft Defender SmartScreen: w Edge otwórz **Ustawienia i nie tylko (…) ▸ Ustawienia ▸ Prywatność, wyszukiwanie i usługi ▸ Zabezpieczenia**, wyłącz **Microsoft Defender SmartScreen**, pobierz plik ponownie, a potem od razu włącz tę funkcję z powrotem. Gdy jest wyłączona, Edge nie ostrzega ani przed pobieranymi plikami, ani przed niebezpiecznymi witrynami, takimi jak strony phishingowe.

### Pojawia się okno „System Windows ochronił ten komputer”

Microsoft Defender SmartScreen wyświetla to okno przy pierwszym spotkaniu z niepodpisanym instalatorem. Naciśnij **Więcej informacji**, a pojawi się przycisk **Uruchom mimo to**. Na komputerze zarządzanym przez szkołę lub firmę ustawienie administratora może ukryć ten przycisk; zwróć się do administratora.

### Blokuje go inteligentna kontrola aplikacji

Gdy w systemie Windows 11 włączona jest inteligentna kontrola aplikacji, zatrzymuje ona niepodpisane instalatory i nie oferuje ścieżki przez **Więcej informacji**. Microsoft podaje, że nie da się zezwolić na pojedynczą aplikację: jedyna możliwość to wyłączenie inteligentnej kontroli aplikacji w **Zabezpieczenia Windows ▸ Kontrola aplikacji i przeglądarki ▸ Ustawienia inteligentnej kontroli aplikacji**. Usuwa to tę ochronę również dla wszystkich innych aplikacji. Po ostatnich aktualizacjach systemu Windows można ją włączyć ponownie bez ponownej instalacji systemu.

## Na Macu (beta)

Potrzebny jest macOS 12 (Monterey) lub nowszy. Wersja dla Maca nie ma podpisu programisty Apple, więc przy pierwszym otwarciu macOS informuje, że nie może sprawdzić, czy aplikacja jest wolna od złośliwego oprogramowania, i jej nie otwiera. Zezwól na nią jednorazowo, jak poniżej.

1. Otwórz plik dmg i przeciągnij `GenOffice.app` do folderu **Programy**.
2. Otwórz GenOffice z folderu Programy. Gdy pojawi się ostrzeżenie, naciśnij **Gotowe**.
3. Otwórz **Ustawienia systemowe ▸ Prywatność i ochrona**. Przy dole, obok wiersza informującego, że GenOffice zablokowano, naciśnij **Otwórz mimo to** i wpisz hasło do Maca. Przycisk jest widoczny przez mniej więcej godzinę od próby otwarcia aplikacji.
4. W oknie, które pojawi się ponownie, naciśnij **Otwórz**. Od tej chwili otwiera się bez ostrzeżenia.

W macOS 12 to miejsce to **Preferencje systemowe ▸ Ochrona i prywatność ▸ Ogólne**, a przycisk nazywa się tam **Otwórz mimo to**.

Jeśli macOS informuje, że aplikacja „jest uszkodzona i nie można jej otworzyć”, nie przenoś jej do Kosza. Wykonaj poniższy wiersz w Terminalu, a potem otwórz aplikację ponownie i zezwól na nią jak wyżej. Usuwa on oznaczenie, które macOS dołącza do plików pobranych z internetu.

```sh
xattr -dr com.apple.quarantine /Applications/GenOffice.app
```

Jeśli macOS informuje, że aplikacja nie jest obsługiwana na tym Macu, sprawdź dwie rzeczy:

- Mac z procesorem Intel nie uruchomi pliku dla Apple Silicon (`-arm64.dmg`). Sprawdź pozycję „Procesor” w oknie **Ten Mac**, usuń zainstalowaną aplikację i zainstaluj zamiast niej plik `-x64.dmg`.
- macOS 11 lub starszy nie uruchomi GenOffice. Okno **Ten Mac** pokazuje też wersję macOS.

Ponadto na Macu:

- Karty połączenia z AI nie mają przycisku instalacji. Aby zainstalować Claude Code lub Codex, skorzystaj z odnośnika do oficjalnego przewodnika instalacji na karcie. Aplikacja desktopowa Claude to nie Claude Code, więc Claude Code trzeba zainstalować osobno, nawet jeśli aplikacja desktopowa już jest.
- Logowanie kończy się w przeglądarce. Jeśli przeglądarka poprosi o wklejenie kodu, samodzielnie uruchom w Terminalu `claude auth login` lub `codex login`. Zobacz [Połączenie z subskrypcją](help://subscription).

## W systemie Linux (beta)

- **AppImage**: nadaj mu uprawnienia do uruchamiania (`chmod +x GenOffice-<version>.AppImage`) i uruchom plik. Nie ma kroku instalacji.
- **deb**: zainstaluj poleceniem `sudo apt install ./ieumoffice_<version>_amd64.deb`.
- **rpm**: zainstaluj poleceniem `sudo dnf install ./ieumoffice-<version>.x86_64.rpm`. W systemie openSUSE użyj polecenia `sudo zypper install ./ieumoffice-<version>.x86_64.rpm`.

Pakiety deb i rpm instalują się w `/opt/GenOffice` i dołączają polecenie terminala `/usr/bin/ieumoffice`. Podobnie jak na Macu, karty połączenia z AI nie mają przycisku instalacji, a gdy logowanie prosi o kod, samodzielnie uruchamiasz w terminalu `claude auth login` lub `codex login`.

## Aktualizacje

- GenOffice szuka nowszej wersji na tej samej stronie Releases w serwisie GitHub. Gdy taka zostanie opublikowana, zaproponuje ją okno **Ustawienia ▸ O aplikacji**: naciśnij **Zaktualizuj do …**, poczekaj na pobranie, a potem naciśnij **Uruchom ponownie i zainstaluj**. W systemie Windows okno pokazuje postęp instalacji; po jej zakończeniu GenOffice otworzy się ponownie z dokumentami, które były otwarte. Na Macu aplikacja zamyka się, zostaje zastąpiona nową wersją i otwiera się ponownie z otwartymi dokumentami. Dotyczy to aplikacji w folderze Aplikacje; aplikacja otwarta bezpośrednio z obrazu dysku wskaże zamiast tego stronę pobierania. Aktualizacja instaluje się tylko po naciśnięciu tego przycisku, nigdy przy zwykłym zamknięciu aplikacji.
- W systemie Linux sam aktualizuje się tylko AppImage. Przy instalacji z pakietu deb lub rpm aplikacja informuje o nowej wersji i otwiera stronę pobierania; zainstaluj nowy plik w ten sam sposób.
- **Menu (☰) ▸ Sprawdź aktualizacje…** sprawdza na żądanie. Na komputerze Mac jest to **Pomoc ▸ Sprawdź aktualizacje…**.
- Gdy sprawdzenie się nie powiedzie — brak sieci albo nic jeszcze nie opublikowano — nic się nie dzieje, a aplikacja działa jak dotąd.
- **Kanał aktualizacji**, również w Ustawienia ▸ O aplikacji, to Stabilny lub Beta. Zmiana działa natychmiast i sprawdza, czy jest aktualizacja; nie cofnie instalacji Beta do kanału Stabilnego.
- Aktualizacje również nie mają podpisu cyfrowego. Przed instalacją aplikacja porównuje pobrany plik z sumą kontrolną opublikowaną razem z danym wydaniem.
- Jeśli **Uruchom ponownie i zainstaluj** zamyka aplikację, ale nowa wersja się nie pojawia, przy następnym uruchomieniu aplikacja o tym poinformuje i ponownie zaproponuje aktualizację. Tym razem instalator otworzy się we własnym oknie, więc można śledzić jego postęp i odpowiedzieć na prośbę o uprawnienia administratora. Jeśli i to nie pomoże, okno aktualizacji wskaże stronę pobierania; instalacja z pobranego tam pliku zachowuje ustawienia i dokumenty. Przebieg aktualizacji jest zapisywany w `update-log.txt` w folderze danych aplikacji (wpisz `%APPDATA%\GenOffice` w pasku adresu Eksploratora plików, aby go otworzyć). Dołącz ten plik, zgłaszając problem.

## Kompilacja, którą uruchamiasz

**Ustawienia ▸ O aplikacji** to miejsce, w którym aplikacja zgłasza posiadaną wersję, kanał, za którym podąża, i to, gdzie mieszka projekt. Podaje też nazwę projektu open source, na którym ta aplikacja jest oparta.

## Wiersz poleceń jest w zestawie

Każda instalacja zawiera polecenie `ieumoffice`, które komunikuje się z tymi samymi silnikami co okno, więc oba nigdy nie różnią się w ocenie pliku. `ieumoffice install-cli` umieszcza je w `PATH`. Co potrafi, dowiesz się w rozdziale [Wiersz poleceń i agenci](help://cli).
