# Instalacja GenOffice

Każda wersja jest publikowana na [stronie Releases](https://github.com/pblsketch/openoffice/releases/latest) projektu w serwisie GitHub. Ta wersja jest wydawana dla systemu Windows.

## Wybierz plik dla swojego komputera

| Platforma   | Wymagania                                  | Plik                            |
| ----------- | ------------------------------------------ | ------------------------------- |
| **Windows** | Windows 10 lub nowszy, 64-bitowy Intel/AMD | `GenOffice-Setup-<version>.exe` |

Starsze wersje pozostają na stronie Releases.

## W systemie Windows

1. Pobierz plik `GenOffice-Setup-<version>.exe` ze strony Releases.
2. Uruchom go. Instalator nie ma podpisu cyfrowego, więc Windows może najpierw wyświetlić niebieskie okno „System Windows ochronił ten komputer”. Wybierz **Więcej informacji**, a potem **Uruchom mimo to**. Dokładne brzmienie zależy od wersji systemu Windows.
3. Przejdź przez instalator do końca.

Instalator umieszcza GenOffice w menu Start i rejestruje `.docx`, `.xlsx`, `.pptx`, `.pdf` i podobne, więc dwuklik na plik go otwiera.

Ponieważ instalator nie jest podpisany, uruchamiaj tylko taki, który został pobrany z podanej wyżej strony Releases.

## Aktualizacje

- GenOffice szuka nowszej wersji na tej samej stronie Releases w serwisie GitHub. Gdy taka zostanie opublikowana, zaproponuje ją okno **Ustawienia ▸ O aplikacji**: naciśnij **Zaktualizuj do …**, poczekaj na pobranie, a potem naciśnij **Uruchom ponownie i zainstaluj**.
- **Menu (☰) ▸ Sprawdź aktualizacje…** sprawdza na żądanie. Na komputerze Mac jest to **Pomoc ▸ Sprawdź aktualizacje…**.
- Gdy sprawdzenie się nie powiedzie — brak sieci albo nic jeszcze nie opublikowano — nic się nie dzieje, a aplikacja działa jak dotąd.
- **Kanał aktualizacji**, również w Ustawienia ▸ O aplikacji, to Stabilny lub Beta. Zmiana działa natychmiast i sprawdza, czy jest aktualizacja; nie cofnie instalacji Beta do kanału Stabilnego.
- Aktualizacje również nie mają podpisu cyfrowego. Przed instalacją aplikacja porównuje pobrany plik z sumą kontrolną opublikowaną razem z danym wydaniem.

## Kompilacja, którą uruchamiasz

**Ustawienia ▸ O aplikacji** to miejsce, w którym aplikacja zgłasza posiadaną wersję, kanał, za którym podąża, i to, gdzie mieszka projekt. Podaje też nazwę projektu open source, na którym ta aplikacja jest oparta.

## Wiersz poleceń jest w zestawie

Każda instalacja zawiera polecenie `ieumoffice`, które komunikuje się z tymi samymi silnikami co okno, więc oba nigdy nie różnią się w ocenie pliku. `ieumoffice install-cli` umieszcza je w `PATH`. Co potrafi, dowiesz się w rozdziale [Wiersz poleceń i agenci](help://cli).
