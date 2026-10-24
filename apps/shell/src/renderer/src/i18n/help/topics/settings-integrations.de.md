# Einstellungen, Sprache, Design und MCP-Integrationen

## Einstellungen öffnen

Die Zeile unten links auf der Startseite öffnet den Einstellungsbereich (solange keine KI verbunden ist, steht dort „KI verbinden“). Er hat fünf Abschnitte: Konto, KI, Allgemein, Integrationen und Über.

**Konto** zeigt, wie es um Ihre Claude- und Codex-Abonnements steht, und **Verbindungen verwalten** führt zum Abschnitt KI. Zur KI gibt es eigene Artikel: [Abonnement-Verbindung](help://subscription) und [KI-Modelle und Einstellungen](help://ai-models).

## Sprache

- Die Einstellungen bieten **21 Oberflächensprachen**: Englisch, vereinfachtes Chinesisch, Japanisch, Koreanisch, Französisch, Deutsch, Spanisch, Thai, Indonesisch, Russisch, Arabisch, Portugiesisch, Italienisch, Polnisch, Tschechisch, Niederländisch, Malaiisch, Hebräisch, Hindi, traditionelles Chinesisch, Vietnamesisch.
- Die Umstellung gilt sofort und bleibt erhalten; die native Menüleiste wird in der Sprache neu aufgebaut.

## Design

Hell / Dunkel / System folgen. „System folgen“ richtet sich nach dem Erscheinungsbild des Betriebssystems, und die Editoren wechseln synchron die Darstellung, ohne zu flackern.

## Allgemein

- **Position der KI-Seitenleiste** (links oder rechts), **Textgröße im KI-Bereich** und **Rechtschreibprüfung im KI-Chat**.
- **KI-Panel in neuen Dokumenten öffnen** — aus, ein neues Dokument startet mit eingeklapptem Panel, einen Klick entfernt.
- **Alle Dokumente automatisch speichern** schaltet AutoSave in jedem Editor standardmäßig ein; für ein einzelnes Fenster können Sie es weiterhin abschalten.
- **Speicherort** mit der Schaltfläche **Ändern** und **Standard-App für Office-Dokumente**, um .docx / .xlsx / .pptx für GenOffice zu beanspruchen.

GenOffice erhebt und sendet keine Nutzungsstatistiken; deshalb gibt es dafür auch keinen Schalter.

## KI ▸ Erweitert

Geschlossen, bis Sie den Bereich öffnen; die meisten brauchen ihn nie. Der Tab **KI-Modell** enthält API-Schlüssel und selbst betriebene Server für den Chat. Auf dem Tab **KI-Medien & Suche** wählt jede Fähigkeit den Anbieter, der sie bedient, und Schlüssel und Basis-URL eines Anbieters werden einmal eingetragen und gemeinsam genutzt:

- **Websuche**, **Bildgenerierung**, **Bildanalyse** und **Videoanalyse**, jede mit Anbieter, Modell, Schlüssel und Basis-URL.
- **Lokale Dateisuche** läuft auf diesem Rechner. Darunter ist **Jev-Such-Reranking** **standardmäßig aus**. Ein schaltet es ein, gehen die Auszüge der Top-20-Treffer — bis zu 1.200 Zeichen je Dokument, plus Datei- und Ordnernamen — an den von Ihnen gewählten Entscheidungs-Endpunkt (Jev über OpenRouter oder TypeSafe, Perplexity, Liquid AI d1, Cloudflare, ein lokales Modell oder eine eigene URL) und werden nach Relevanz neu geordnet. Aus bleibt alles auf dem Gerät.
- **Automatische Anfragen dürfen ein Abonnement nutzen** ist **standardmäßig aus**. Der Schalter legt fest, ob eine Anfrage von der Kommandozeile oder von einem angebundenen Coding-Agenten Ihr Claude- oder Codex-Abonnement nutzen darf; siehe [Einen Coding-Agenten anbinden](help://mcp).

## Über

- **Version**, die GitHub-Adresse des Projekts und eine Zeile, die das Open-Source-Projekt nennt, auf dem diese App basiert.
- **Update-Kanal**: Stabil oder Beta. Eine Änderung wirkt sofort und prüft auf ein Update; eine Beta-Installation wird nicht auf Stabil zurückgestuft.

## Standard-App-Zuordnungen

Die Einstellungen können GenOffice als Programm für .docx / .xlsx / .pptx / .pdf und verwandte Formate hinterlegen (Registrierung als Standard-App auf Plattformebene; bestätigen Sie, wenn Sie dazu aufgefordert werden).

## Hinweise zu Drittanbietersoftware und Updates

- Hilfe ▸ Hinweise zu Drittanbietersoftware: das vollständige Verzeichnis der mitgelieferten Open-Source-Lizenzen.
- Menü (☰) ▸ Nach Updates suchen (auf dem Mac Hilfe ▸ Nach Updates suchen): löst eine manuelle Prüfung aus; bei einer neueren Version werden Sie zur Installation aufgefordert.

## MCP-Integration (für erfahrene Anwender / KI-Clients)

**Integrationen** ist der Bereich, der GenOffice mit einem Coding-Agenten verbindet, und er hat einen eigenen Artikel: Einen Coding-Agenten anbinden. Die Kurzfassung — wählen Sie einen Weg (die Kommandozeile oder MCP), folgen Sie dem jeweiligen Abschnitt und starten Sie dann einen neuen Chat.

Unter **Lokaler HTTP-Server** kann die App den Server auch selbst betreiben — ein Schalter zum Aktivieren und ein Port —, während **Erweitert** die Zustandsprüfung-URL und die Protokolldatei hinzufügt, statt ihn dem Assistenten zu überlassen. Er lauscht nur auf localhost.

## Spickzettel für die Kommandozeile

| Befehl              | Was er bewirkt             |
| ------------------- | -------------------------- |
| `ieumoffice <file>` | eine Datei öffnen          |
| `ieumoffice mcp`    | lokalen MCP-Server starten |
| `ieumoffice --help` | alle Befehle und Optionen  |
