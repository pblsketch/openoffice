# Abonnement-Verbindung

GenOffice nutzt für die KI ein Abonnement, das Sie bereits haben: ein Claude-Abonnement (Anthropic) oder ein Codex-Abonnement (OpenAI). Codex ist das Programm von OpenAI; Sie melden sich dort mit Ihrem ChatGPT-Tarif an. Einen API-Schlüssel brauchen Sie nicht, und bei GenOffice selbst gibt es kein Konto, das Sie anlegen müssten.

## So funktioniert es

- Die KI ist nicht in GenOffice eingebaut. Auf diesem PC ist ein Programm des jeweiligen Unternehmens installiert — **Claude Code** für ein Claude-Abonnement, **Codex** für ein ChatGPT-Abonnement —, und GenOffice bittet dieses Programm um die Antwort.
- Dieses Programm ist mit Ihrem eigenen Konto angemeldet; jede Anfrage zählt also auf Ihren eigenen Tarif.
- GenOffice zeigt nie ein eigenes Anmeldeformular und liest oder speichert Ihre Anmeldedaten nie. Sie melden sich im Programm und auf der Webseite des Unternehmens an.

## Bevor Sie beginnen

Sie brauchen eines von beiden. Beides zu haben ist in Ordnung.

- Ein Claude-Abonnement (ein Pro- oder Max-Tarif; mit einem kostenlosen Claude-Konto ist keine Verbindung möglich) sowie das Programm Claude Code, auf diesem PC installiert und angemeldet.
- Ein ChatGPT-Abonnement sowie das Programm Codex, auf diesem PC installiert und angemeldet.

Ist das Programm noch nicht installiert oder noch nicht angemeldet, erledigen das die Schaltflächen im nächsten Abschnitt.

## Verbinden

1. Öffnen Sie über die Zeile unten links auf der Startseite die **Einstellungen** und wählen Sie **KI**. Unter **Abonnement-Verbindung** gibt es eine Karte für Claude und eine für Codex.
2. Lesen Sie, was auf der Karte steht, und klicken Sie auf ihre Schaltfläche. Die Tabelle unten erklärt jeden Zustand.
3. Kehren Sie zum GenOffice-Fenster zurück. Die Karte prüft von selbst erneut, und **Erneut prüfen** prüft sofort.

Im zweiten Schritt der Willkommensbildschirme beim ersten Start und im KI-Bereich, solange keine KI verbunden ist, kommt zuerst die Frage „Welche KI nutzen Sie bereits?“. Wählen Sie ein bezahltes Claude-Abonnement, ChatGPT oder noch keins von beiden, dann sehen Sie nur die Schritte dieses Wegs (Programm installieren → Anmelden → Verbunden) und die zugehörige Karte. Mit **Anderen Weg wählen** wählen Sie neu, und Sie können alles überspringen und später verbinden. Klappt die Verbindung immer noch nicht, klicken Sie auf **Infos für Hilfe kopieren** und senden Sie das Kopierte an die Person, die Ihnen hilft. Es enthält weder Konto noch Dateipfade.

| Was auf der Karte steht                         | Was es bedeutet                                                                                                                                             | Was zu tun ist                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Wird geprüft…**                               | GenOffice fragt das Programm nach seinem Stand.                                                                                                             | Einen Moment warten.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| **Nicht installiert**                           | Das Programm wurde auf diesem PC nicht gefunden.                                                                                                            | Klicken Sie auf **Installieren**. Der offizielle Installationsbefehl des Unternehmens läuft in einem neuen Terminalfenster, sodass Sie sehen, was er tut. GenOffice lädt von sich aus nichts herunter. Wenn Sie lieber von Hand installieren, öffnet **Offizielle Installationsanleitung** die Anleitung des Unternehmens.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| **Nicht angemeldet**                            | Das Programm ist vorhanden, aber nicht angemeldet.                                                                                                          | Klicken Sie auf **Anmelden**. Die Anmeldeseite des Unternehmens öffnet sich im Browser: Melden Sie sich dort an und erlauben Sie den Zugriff, dann verbindet sich die Karte von selbst. Lassen Sie sich Zeit; die Anmeldung kann eine Weile dauern. Öffnet sich gar kein Browser, klicken Sie auf der Karte auf **Browser nicht geöffnet?** (nach 25 Sekunden wird daraus die Schaltfläche **Anmeldefenster öffnen**). Klicken Sie nicht darauf, solange Sie sich noch im Browser anmelden: Das bricht diese Anmeldung ab und beginnt von vorn. Oben im geöffneten Anmeldefenster steht, was zu tun ist. Um dort einen Code einzufügen, klicken Sie mit der rechten Maustaste in das Fenster und drücken Sie dann die Eingabetaste. Dass der eingefügte Code nicht angezeigt wird, ist normal; erscheint "Invalid code", fügen Sie den Code erneut in dasselbe Fenster ein. Um die Anmeldung zu beenden, klicken Sie auf **Anmeldung abbrechen**. |
| **Verbunden**                                   | Eine Anmeldung mit Abonnement wurde bestätigt. Der Name des Tarifs wird angezeigt, wenn das Programm ihn meldet.                                            | Nichts. Die KI ist einsatzbereit.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| **Angemeldet, aber nicht mit einem Abonnement** | Das Programm ist mit einem API-Schlüssel oder einem Konto mit Abrechnung nach Verbrauch angemeldet, oder die Art der Anmeldung ließ sich nicht feststellen. | Siehe unten „Anmeldungen mit Abrechnung nach Verbrauch“.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| **Die Verbindung konnte nicht geprüft werden**  | Die Prüfung selbst ist fehlgeschlagen. Der Grund steht auf der Karte.                                                                                       | Klicken Sie auf **Erneut prüfen**. Steht dort, das Programm sei zu alt, klicken Sie auf **Aktualisieren**: Das offizielle Update des Unternehmens läuft in einem neuen Fenster. Wenn es dort fertig ist, kehren Sie zu GenOffice zurück.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |

Die Verbindung wird geprüft, wenn die App startet, wenn Sie die Einstellungen öffnen und wenn Sie nach dem Start einer Installation oder Anmeldung zum Fenster zurückkehren.

## Ohne Abonnement: kostenlose KI

Kein Claude- oder ChatGPT-Abonnement? Unter Einstellungen ▸ KI verbindet **Kostenlos nutzen** stattdessen eine kostenlose KI. Wählen Sie im zweiten Schritt der Willkommensbildschirme **Noch keins von beiden**, erscheinen dieselben Karten; wählen Sie es im KI-Bereich, solange nichts verbunden ist, bietet er **Kostenlose KI verbinden** an.

- **OpenRouter**: Klicken Sie auf **Im Browser verbinden**. Ihr Browser öffnet OpenRouter; registrieren Sie sich oder melden Sie sich an, und erlauben Sie den Zugriff. Sobald der Browser meldet, dass die Verbindung steht, schließen Sie den Tab und kehren Sie zurück. Es muss kein Schlüssel kopiert werden, und die Karte zeigt, wie viele kostenlose Anfragen heute noch übrig sind.
- **Google Gemini**: Klicken Sie auf **Schlüssel erstellen**, erstellen Sie in Google AI Studio einen Schlüssel, fügen Sie ihn in die Karte ein und klicken Sie auf **Verbinden**. Nur für Personen ab 18 Jahren. Ein Schlüssel aus einem Google-Projekt mit aktivierter Abrechnung kann Kosten verursachen.
- Nach dem Verbinden wird diese KI unter **Verwendete KI** ausgewählt. Sind beide verbunden, wechselt **Diese KI verwenden** auf einer Karte zwischen ihnen. **Trennen** entfernt den Schlüssel aus GenOffice.
- Kostenlose Modelle sind schwächer als die Modelle eines Abonnements, und pro Tag ist nur eine begrenzte Zahl von Anfragen möglich. Eine einzige Bearbeitung eines Dokuments kann mehrere davon verbrauchen. Ist das heutige Kontingent aufgebraucht, sagt der KI-Bereich das und auch, wann die KI wieder genutzt werden kann.
- Solange Sie die KI kostenlos nutzen, kann das, was Sie senden, zur Verbesserung der KI dieses Unternehmens verwendet werden. Seien Sie vorsichtig mit Dokumenten, die personenbezogene Daten enthalten.

## Anmeldungen mit Abrechnung nach Verbrauch

Eine Karte mit **Angemeldet, aber nicht mit einem Abonnement** trägt eine Warnung: „Das ist kein Abonnement: Abgerechnet wird nach Verbrauch.“

- GenOffice verwendet diese Anmeldung erst, wenn Sie auf **Trotzdem verwenden** klicken. Von da an wird jede Anfrage diesem Konto berechnet.
- Auch dann wird sie nie automatisch gewählt. Wählen Sie sie selbst unter **Verwendete KI**; dort ist sie mit **Kostenpflichtig** gekennzeichnet.
- Ihre Erlaubnis gilt nur für dieses eine Programm. Sie erlischt, wenn das Programm abgemeldet wird oder sich seine Anmeldung ändert.
- Möchten Sie stattdessen Ihr Abonnement nutzen, melden Sie das Programm mit dem Konto Ihres Abonnements an und klicken Sie auf **Erneut prüfen**.

## Konto wechseln oder abmelden

Ist das Programm angemeldet, zeigt seine Karte neben dem Namen des Tarifs das angemeldete Konto an, wenn das Programm es meldet. Außerdem hat sie zwei Schaltflächen.

- **Mit anderem Konto anmelden** startet die Anmeldung des Programms erneut. Schließen Sie sie im Fenster, das sich öffnet, mit dem anderen Konto ab.
- **Abmelden** führt die Abmeldung des Programms selbst aus. Danach steht auf der Karte **Nicht angemeldet**.
- Beides gilt für dieses Programm auf dem ganzen PC, nicht nur für GenOffice. Wenn Sie Claude Code oder Codex auch im Terminal verwenden, wird es dort ebenfalls abgemeldet oder auf das andere Konto umgestellt. GenOffice fragt deshalb vorher nach.
- Das Konto und diese beiden Schaltflächen gibt es nur hier, unter Einstellungen ▸ KI. GenOffice zeigt das Konto an und speichert es nirgends.

## Welche KI verwendet wird

**Verwendete KI** unter Einstellungen ▸ KI steht anfangs auf **Automatisch**. Automatisch entscheidet in dieser Reihenfolge:

1. Claude, wenn auf dessen Karte „Verbunden“ steht.
2. Sonst Codex, wenn auf dessen Karte „Verbunden“ steht.
3. Sonst ist keine KI verbunden, und der KI-Bereich zeigt statt einer Fehlermeldung die Verbindungsanleitung.

Automatisch wählt nie etwas, das zusätzlich Geld kostet: keinen API-Schlüssel und keine Anmeldung mit Abrechnung nach Verbrauch. Beides wird nur verwendet, solange Sie es selbst auswählen.

Sie können auch selbst eine KI festlegen, an derselben Stelle oder in der Modellliste unten im KI-Bereich. Wenn die gewählte KI nicht mehr funktioniert, wechselt GenOffice nicht stillschweigend zu einer anderen. Die App sagt Ihnen, was passiert ist, und zeigt, wie Sie die Verbindung wiederherstellen.

Die Modellliste zeigt die Modelle, die das Programm selbst meldet: jedes mit seinem Namen und der genauen Modell-ID daneben, und bei **Standardmodell** steht, für welches Modell es gerade steht. Auch das Feld unten im KI-Bereich und **Verwendete KI** nennen dieses Modell. Das Lesen der Liste stellt der KI keine Frage und zählt deshalb nicht zu Ihrem Tarif. Ist das Programm zu alt, um seine Modelle zu melden, wird stattdessen eine kurze eingebaute Liste angezeigt.

Überall, wo sich Codex auswählen lässt, steht eine Zeile dabei: „Ein Codex-Abonnement in einer App zu nutzen, ist keine von OpenAI offiziell empfohlene Methode.“ Berücksichtigen Sie das bei Ihrer Entscheidung.

## Wenn eine Anfrage gestoppt wird

Eine Anfrage stoppt, wenn das Limit des Tarifs aufgebraucht ist, wenn die Anmeldung abgelaufen ist oder wenn das Programm nicht mehr vorhanden ist. GenOffice wechselt nicht von sich aus zu einer anderen KI.

- Der Grund steht dort, wo die Antwort abgebrochen ist. Bei einem aufgebrauchten Limit steht auch der Zeitpunkt der Zurücksetzung dabei, sofern das Programm ihn meldet.
- Ist Ihr anderes Abonnement verbunden, erscheint eine Schaltfläche **Mit … fortfahren**, zum Beispiel **Mit Codex fortfahren**. Ein Klick macht dieses Abonnement zur verwendeten KI — die Modellliste zeigt den Wechsel — und führt die Anfrage erneut aus.
- Ist die einzige andere Verbindung eine von Ihnen freigegebene Anmeldung mit Abrechnung nach Verbrauch, trägt dieselbe Schaltfläche einen Hinweis auf die Kosten.
- Eine Schaltfläche, die Sie zu einem API-Schlüssel wechseln lässt, gibt es nie.

## Die Verbrauchsanzeige

Sobald Sie 80 % oder mehr eines Limits verbraucht haben, zeigt der KI-Bereich eine Zeile wie „85 % verbraucht · Zurücksetzung um 15:00“. Claude meldet ein 5-Stunden-Limit und ein 7-Tage-Limit, und Codex wird genauso angezeigt, wenn es diese Werte meldet. Unter 80 % oder wenn das Programm nichts meldet, erscheint keine Zeile.

## Was gesendet wird und wohin

Wenn ein Abonnement zum ersten Mal genutzt werden kann, zeigt GenOffice einmalig einen Hinweis. Um ihn erneut zu lesen, gehen Sie zu Einstellungen ▸ KI ▸ **Hinweis zur ersten Verbindung** und klicken Sie auf **Erneut anzeigen**. Er besagt drei Dinge:

- Dokumentinhalte und Ihre Unterhaltung werden über Ihr eigenes Konto an Anthropic oder OpenAI gesendet.
- Ob diese Inhalte zum Training von KI verwendet werden, bestimmen die Einstellungen Ihres eigenen Kontos bei dem jeweiligen Unternehmen, nicht GenOffice.
- GenOffice schaltet das Speichern des Unterhaltungsverlaufs in Codex ab, Codex kann jedoch weiterhin eigene Diagnoseprotokolle auf diesem PC speichern.

Was Sie mit **Auswahl vor der KI verbergen** verborgen haben, wird nicht gesendet, gleich welche KI Sie verwenden.

## Gut zu wissen

- **Geschwindigkeit.** Eine Antwort über ein Abonnement beginnt ein paar Sekunden später als eine über einen API-Schlüssel, weil erst das Programm des Unternehmens starten muss.
- **Kostenloser ChatGPT-Tarif.** Er wird als „Verbunden“ angezeigt, hat aber knappe Limits; Anfragen stoppen also früher. Die Verbrauchsanzeige erscheint dafür nicht.
- **Bildgenerierung.** In dieser Version erzeugt ein Abonnement keine Bilder, in keinem Tarif. Dafür ist der Schlüssel eines Bildanbieters nötig; siehe [KI-Modelle und Einstellungen](help://ai-models).
- **Proxys.** Claude Code und Codex übernehmen keine Proxy-Einstellungen von GenOffice. Sie nutzen den für diesen PC eingerichteten Proxy, zum Beispiel die Umgebungsvariable `HTTPS_PROXY`, genau wie beim Aufruf im Terminal. Können sie sich im Terminal nicht verbinden, können sie es von hier aus auch nicht.
- **Befehle und andere Programme.** Eine Anfrage, die vom Befehl `ieumoffice` oder von einem angebundenen Coding-Agenten kommt, nutzt Ihr Abonnement nur, wenn Sie das erlauben. Siehe [Einen Coding-Agenten anbinden](help://mcp).
