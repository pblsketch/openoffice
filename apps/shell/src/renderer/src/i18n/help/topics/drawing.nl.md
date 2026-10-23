# De tekeningeditor

De tekeningeditor opent Excalidraw-tekeningen in een eigen tabblad en slaat ze weer op in hetzelfde bestand.

- **Wat hij opent**: tekeningnotities die met de Excalidraw-plug-in van Obsidian zijn gemaakt (`.excalidraw.md`, of een `.md` met `excalidraw-plugin` in de front matter) en `.excalidraw`-bestanden uit de webapp van Excalidraw.
- **Nieuwe tekening**: de kaart **Excalidraw-tekening** op Start, of **Bestand ▸ Nieuw**. Een nieuwe tekening is een Obsidian-tekeningnotitie (`.excalidraw.md`), en u geeft haar een naam bij de eerste keer opslaan.
- **Tekenen**: vormen, pijlen, lijnen, vrij tekenen en tekst, met de eigen werkbalk en sneltoetsen van het canvas. ctrl+Z maakt ongedaan.
- **Opslaan**: ctrl+S. Een bestand wordt opgeslagen in de indeling waarin het is geopend. Automatisch opslaan schrijft elke 30 seconden en wanneer het venster de focus verliest, maar slaat een tekening zonder bestandsnaam over. Een tekening die u alleen hebt bekeken, wordt byte voor byte opgeslagen zoals ze was.

## Obsidian-tekeningnotities

- Bij opslaan worden alleen de tekstlijst en de tekeninggegevens van de notitie herschreven. De front matter, de tekst die u in de notitie schreef en de koppelingen blijven zoals ze waren, zodat de notitie in Obsidian net zo opent als voorheen.
- Afbeeldingen waarnaar de notitie verwijst (`[[afbeelding.png]]` onder Embedded Files) worden getoond als ze in de kluis van de notitie staan: de eerste map boven de notitie met een map `.obsidian`, anders de map van de notitie zelf. Afbeeldingen groter dan 20 MB, in verborgen mappen of buiten de kluis worden niet getoond.
- U kunt nog geen nieuwe afbeeldingen aan een notitie toevoegen. Het afbeeldingsgereedschap staat uit en bestanden op het canvas neerzetten is geblokkeerd, omdat een afbeelding die alleen in de notitie zit misschien niet in Obsidian verschijnt.

## Wat hij nog niet doet

- Er is geen AI-paneel. De AI kan tekeningen niet lezen of wijzigen.
- Er is geen export naar PNG of SVG.
- De editor gebruikt het netwerk niet. De lettertypen zijn ingebouwd, en gedeelde bibliotheken, live samenwerken en webinsluitingen staan uit. Een koppeling in een tekening opent alleen in de browser als het een web- of e-mailadres is.

## Tekeningen openen vanuit Verkenner

Het installatieprogramma zet de app bij **Openen met** voor `.excalidraw`-bestanden, zonder er het standaardprogramma van te maken. Een tekeningnotitie is een `.md`-bestand, dus ze opent overal waar de app een Markdown-bestand opent, en komt dan in de tekeningeditor terecht in plaats van in de Markdown-editor.
