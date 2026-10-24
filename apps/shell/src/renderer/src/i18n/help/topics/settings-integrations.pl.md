# Ustawienia, język, motyw i integracje MCP

## Otwieranie ustawień

Wiersz w lewym dolnym rogu strony głównej otwiera panel ustawień (dopóki żadne AI nie jest połączone, pokazuje Połącz AI). Ma pięć sekcji: Konto, AI, Ogólne, Integracje i O aplikacji.

**Konto** pokazuje stan twoich subskrypcji Claude i Codex, a **Zarządzaj połączeniami** prowadzi do sekcji AI. AI ma własne artykuły: [Połączenie z subskrypcją](help://subscription) oraz [Modele AI i ustawienia](help://ai-models).

## Język

- Ustawienia oferują **21 języków interfejsu**: angielski, uproszczony chiński, japoński, koreański, francuski, niemiecki, hiszpański, tajski, indonejski, rosyjski, arabski, portugalski, włoski, polski, czeski, niderlandzki, malajski, hebrajski, hindi, tradycyjny chiński, wietnamski.
- Zmiana działa natychmiast i zostaje zapamiętana; natywny pasek menu jest odbudowywany w nowym języku.

## Motyw

Jasny / Ciemny / Zgodnie z systemem. Opcja Zgodnie z systemem podąża za wyglądem systemu operacyjnego, a edytory zmieniają wygląd synchronicznie, bez migotania.

## Ogólne

- **Położenie panelu bocznego AI** (po lewej lub po prawej), **Rozmiar tekstu panelu AI** i **Sprawdzanie pisowni w czacie AI**.
- **Otwieraj panel AI w nowych dokumentach** — wyłączone, nowy dokument zaczyna się ze zwiniętym panelem, jedno kliknięcie stąd.
- **Automatycznie zapisuj wszystkie dokumenty** włącza AutoSave domyślnie w każdym edytorze; nadal można je wyłączyć dla jednego okna.
- **Lokalizacja zapisu** z przyciskiem **Zmień** oraz **Domyślna aplikacja dla dokumentów Office**, aby przejąć .docx / .xlsx / .pptx dla GenOffice.

GenOffice nie zbiera ani nie wysyła statystyk użytkowania, więc nie ma do tego przełącznika.

## AI ▸ Zaawansowane

Ta część pozostaje zwinięta, dopóki jej nie otworzysz; większość osób nigdy jej nie potrzebuje. Karta **Model AI** zawiera klucze API i serwery uruchamiane samodzielnie, używane do czatu. Na karcie **Media i wyszukiwanie AI** każda możliwość wybiera dostawcę, który ją obsługuje, a klucz i bazowy adres URL dostawcy wpisuje się raz i są wspólne:

- **Wyszukiwanie w sieci**, **Generowanie obrazów**, **Analiza obrazów** i **Analiza wideo**, każda z dostawcą, modelem, kluczem i bazowym adresem URL.
- **Lokalne wyszukiwanie plików** działa na tej maszynie. Pod nim **przerankowanie wyszukiwania Jev** jest **domyślnie wyłączone**. Po włączeniu fragmenty top 20 lokalnych trafień — do 1 200 znaków na dokument plus nazwy plików i folderów — idą do wybranego punktu decyzyjnego (Jev przez OpenRouter lub TypeSafe, Perplexity, Liquid AI d1, Cloudflare, lokalny silnik lub własny URL) i są porządkowane według trafności. Wyłączone — nic nie opuszcza urządzenia.
- **Zezwól żądaniom automatycznym na korzystanie z subskrypcji** jest **domyślnie wyłączone**. Decyduje o tym, czy żądanie z wiersza poleceń albo od podłączonego agenta programistycznego może korzystać z twojej subskrypcji Claude lub Codex; zobacz [Podłączenie z agentem programistycznym](help://mcp).

## O aplikacji

- **Wersja**, adres projektu w serwisie GitHub oraz wiersz z nazwą projektu open source, na którym ta aplikacja jest oparta.
- **Kanał aktualizacji**: Stabilny lub Beta. Zmiana działa natychmiast i sprawdza, czy jest aktualizacja; nie cofnie instalacji Beta do kanału Stabilnego.

## Powiązanie z aplikacją domyślną

Ustawienia mogą zarejestrować GenOffice jako obsługę plików .docx / .xlsx / .pptx / .pdf i podobnych (rejestracja aplikacji domyślnej na poziomie systemu; potwierdzenie, gdy aplikacja o to poprosi).

## Informacje o oprogramowaniu innych firm i aktualizacje

- Pomoc ▸ Informacje o oprogramowaniu innych firm: pełny wykaz licencji open source dołączony do aplikacji.
- Menu (☰) ▸ Sprawdź aktualizacje… (na komputerze Mac Pomoc ▸ Sprawdź aktualizacje…): uruchamia ręczne sprawdzenie; nowsza wersja wyświetla monit o instalacji.

## Integracja MCP (dla zaawansowanych użytkowników i klientów AI)

Do **Integracji** łączy GenOffice z agentem programistycznym i ma własny artykuł: Podłączenie z agentem programistycznym. Wersja skrócona — wybierz drogę (wiersz poleceń albo MCP), przejdź tę część, a potem rozpocznij nową rozmowę i zapytaj.

W sekcji **Lokalny serwer HTTP** aplikacja może też sama uruchomić ten serwer — przełącznik włączania i port —, a **Zaawansowane** dodaje adres sprawdzenia stanu i plik dziennika, zamiast zostawiać serwer asystentowi. Nasłuchuje wyłącznie na localhost.

## Ściągawka z poleceń

| Polecenie           | Co robi                      |
| ------------------- | ---------------------------- |
| `ieumoffice <plik>` | otwiera plik                 |
| `ieumoffice mcp`    | uruchamia lokalny serwer MCP |
| `ieumoffice --help` | wszystkie polecenia i opcje  |
