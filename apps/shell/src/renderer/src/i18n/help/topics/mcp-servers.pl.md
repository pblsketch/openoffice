# Łączenie serwerów MCP

Serwer MCP to usługa, która daje AI narzędzia spoza aplikacji, na przykład wyszukiwanie przepisów albo materiałów prowadzonych przez Twój zespół. Po połączeniu serwera okna AI w GenOffice mogą wywoływać jego narzędzia podczas rozmowy. Dla każdego narzędzia sam decydujesz, czego AI może używać i w jaki sposób.

## Dodawanie serwera

1. Otwórz **Ustawienia ▸ Integracje** i na karcie **Serwery MCP** kliknij **Dodaj serwer**.
2. Wybierz sposób dodania.
   - **Wklej tekst ustawień**: wklej cały tekst ustawień z instrukcji serwera i kliknij **Odczytaj**. GenOffice wypełni pola. Jeśli w jednym tekście jest kilka serwerów, potwierdzasz je po kolei. Jeśli tekst odczytuje klucz lub wartość ze zmiennej komputera (`${NAZWA}`), to pole zostaje puste i uzupełniasz je sam.
   - **Wpisz ręcznie**: wpisz nazwę i adres. Jeśli instrukcja serwera podaje klucz, wpisz go w polu **Klucz (opcjonalnie)**.
3. Przeczytaj komunikat nad przyciskiem dodawania i kliknij **Dodaj**.
4. Po dodaniu GenOffice od razu sprawdza połączenie i pobiera listę narzędzi. Serwer, który wymaga logowania, czeka na Ciebie zamiast otwierać przeglądarkę. Kliknij **Sprawdź połączenie**, aby zobaczyć listę narzędzi serwera. Jeśli serwer wymaga logowania, kliknij **Zaloguj się przez przeglądarkę** i dokończ logowanie w przeglądarce.

Nazwa serwera składa się z liter, cyfr, `-` i `_` i ma najwyżej 24 znaki. AI widzi narzędzia tego serwera pod nazwami w postaci `mcp__name__tool`. Jeśli umiejętność wywołuje narzędzia po nazwach takiej postaci, dodaj serwer pod tą samą nazwą, której używa umiejętność.

## Serwery pod adresem i serwery na tym komputerze

- Serwer **pod adresem** łączy się przez adres internetowy. Adresy w internecie muszą zaczynać się od `https://`. `http://` działa tylko dla tego komputera i dla adresów sieci prywatnej w domu lub w pracy, a wcześniej potwierdzasz, że klucze i treść dokumentów będą przesyłane bez szyfrowania.
- Serwer **na tym komputerze** to program, który GenOffice uruchamia na tym komputerze. Ekran dodawania pokazuje dokładny program, jego argumenty i nazwy zmiennych środowiskowych, które mu przekazano. Po raz pierwszy uruchomi się dopiero po kliknięciu **Zezwól na uruchomienie**. Jeśli polecenie później się zmieni, serwer pozostaje zatrzymany, dopóki znowu na to nie zezwolisz.
- Jeśli serwer na tym komputerze potrzebuje programu, którego komputer nie ma (Node.js albo uv dla serwerów w Pythonie), GenOffice pyta na karcie serwera w ustawieniach, czy go pobrać. Pokazuje rozmiar pobierania i nic się nie pobiera, dopóki nie klikniesz **Pobierz**. Pobrane programy zostają tylko w folderze danych GenOffice, a ustawienia komputera nie są zmieniane.
- Serwer na tym komputerze uruchamia się, gdy jest potrzebny, i zatrzymuje się po 10 minutach bez użycia. Zatrzymuje się też po zamknięciu GenOffice.

## Wybór, co może każde narzędzie

- Dla każdego narzędzia wybierz **Zawsze zezwalaj**, **Najpierw pytaj** albo **Nie używaj**.
- Na początku narzędzia, które serwer oznaczył jako tylko odczytujące, mają ustawione **Zawsze zezwalaj**, a wszystkie pozostałe **Najpierw pytaj**.
- Gdy AI wywoła narzędzie z ustawieniem **Najpierw pytaj**, w oknie AI pojawi się karta. Zobacz, co zostanie wysłane, i kliknij **Zezwól tylko tym razem**, **Zawsze zezwalaj w tej rozmowie** albo **Zablokuj**. Dopóki nie klikniesz, nic się nie wykona. Zatrzymanie AI lub zamknięcie okna liczy się jako zablokowanie.
- Jeśli serwer zmieni opis narzędzia albo przyjmowane przez nie wartości, przy tym narzędziu pojawi się **Wymaga sprawdzenia** i będzie ukryte przed AI, dopóki nie obejrzysz zmiany i nie klikniesz **Zatwierdź zmianę**. Zmiana we wskazówkach, które serwer daje AI, jest sprawdzana tak samo.
- Nowe narzędzia na serwerze są włączane z tymi samymi ustawieniami początkowymi, a karta i przycisk w oknie AI pokazują **Nowe narzędzia: n**. Znacznik znika, gdy otworzysz listę narzędzi tego serwera w ustawieniach.

## Używanie serwerów w oknie AI

- Serwery działają w oknach AI edytorów i w Ask AI na stronie głównej. Gdy serwer jest włączony, obok pola wpisywania pojawia się przycisk **Połączone serwery**.
- Kliknij go, aby zobaczyć stan każdego serwera oraz wyłączyć lub włączyć serwer tylko dla tej rozmowy. Nowa rozmowa zaczyna się ze wszystkimi serwerami, które włączyłeś w ustawieniach. Serwer, którego połączenia nigdy nie sprawdzono, ma stan **Jeszcze nie sprawdzono**; sprawdź je w Ustawieniach, aby dostać jego narzędzia.
- Wyłączenie opcji **Pozwól AI używać narzędzi internetowych** w **Ustawienia ▸ Media i wyszukiwanie AI** usuwa też wszystkie narzędzia serwerów MCP.
- Gdy umiejętność oczekuje narzędzia z serwera, którego teraz nie możesz użyć, AI w odpowiedzi powie, którego kroku nie mogło wykonać. **Ustawienia ▸ Umiejętności** pokazują też przy każdej umiejętności serwer, którego potrzebuje.
- Okno agenta również może używać narzędzi włączonych serwerów. Obowiązują te same uprawnienia, a sesja zachowuje ustawienia, z którymi się zaczęła. Zobacz [Tryb agenta](help://agent-mode).

## Ochrona tego, co zwraca serwer

Każdy serwer ma opcję **Chroń to, co zwraca ten serwer**, na początku włączoną. Gdy jest włączona, to po pojawieniu się w rozmowie czegoś, co zwrócił ten serwer, narzędzia wysyłające dane poza aplikację przestają w tej rozmowie działać: wyszukiwanie w sieci, czytanie strony pod adresem, narzędzia innych serwerów MCP i tym podobne. Narzędzia tego samego serwera nadal działają. Aby znów używać pozostałych, zacznij nową rozmowę. Możesz wyłączyć tę opcję dla serwera, który udostępnia tylko materiały publiczne.

Okno agenta nie potrafi utrzymać tej ochrony. Gdy sesja zaczyna się z takim serwerem, okno informuje o tym.

## Co dokąd trafia

- Gdy AI wywołuje narzędzie, na ten serwer trafia tekst wybrany przez AI. Może zawierać treść otwartego dokumentu i załączników. Części ukryte przed AI pozostają ukryte.
- To, co zwraca serwer, trafia do dostawcy AI, z którego korzystasz. Dodawaj tylko serwery, których operatorom ufasz.
- Klucze, dane logowania i wartości zmiennych środowiskowych są przechowywane na tym komputerze z szyfrowaniem systemu operacyjnego. Jeśli komputer nie może ich zaszyfrować, są pamiętane tylko do zamknięcia aplikacji.
- Usunięcie serwera kasuje jego klucze i dane logowania oraz prosi serwer o zakończenie logowania, jeśli to obsługuje.
