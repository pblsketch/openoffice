# Diagrams: drawing and editing draw.io files

The diagram editor opens draw.io files in a tab. You draw flowcharts, architecture diagrams and other diagrams, save them in the format they came in, export them as pictures or PDF, and let the AI read, change and draw them. The editor runs entirely on your PC.

## Opening a diagram

- The editor opens `.drawio`, `.dio`, `.drawio.svg` and `.drawio.png` files: from the open dialog, by dragging a file onto the window, from recent files, the folder tree, or (for `.drawio` and `.dio`) the Google Drive list. In Windows, installing GenOffice makes it the program for `.drawio` and `.dio` files.
- A `.drawio.svg` or `.drawio.png` file opens only if the diagram is stored inside the picture. An ordinary SVG or PNG picture is not opened as a diagram. Damaged files do not open either, and the reason is shown.
- A Visio file (`.vsdx`) is imported as a new, untitled diagram. The first save offers a `.drawio` file in the Visio file's folder, and the Visio file itself is not changed. If some pictures in it could not be converted, the editor says how many. In Windows, `.vsdx` files are offered under "Open with" only.
- A new, empty diagram starts from the **Diagram** tile on Home or from New in the File menu.
- If the diagram is already open, its tab comes to the front.

## Editing

- The editing screen is the draw.io screen as it is: the menus at the top, the shapes on the left, the format panel on the right and the page tabs at the bottom.
- Save (Ctrl+S), Save As (Ctrl+Shift+S) and Print (Ctrl+P) go to GenOffice. Switching tabs and the other app-wide shortcuts keep working. Every other shortcut is the editor's own, including undo (Ctrl+Z).
- **Help** (F1) in the editor's menus opens this page.
- The editor uses GenOffice's language. When you change the language, the editor restarts: unsaved changes stay, but the undo history is lost.
- The editor follows GenOffice's theme. In the dark theme the drawing is shown in dark colors too, but the saved file, PNG, PDF and printouts are exactly the same as in the light theme.

## Saving

- Save, Save As, **AutoSave** in the status line and the question before closing work as in the other editors.
- A diagram is saved in the format it was opened in. Save As offers `.drawio`, `.dio`, `.drawio.svg` and `.drawio.png`. A new diagram is first saved as `.drawio`.
- If nothing changed, the file is not written again. Pages stored compressed in the file stay compressed.
- The picture of a `.drawio.png` file shows the first page; the whole diagram is stored inside it.
- While a diagram has unsaved changes, a recovery copy is kept in the app's data folder, so the work survives a crash.

## Exporting and printing

- Choose the PNG, SVG or PDF export in the File menu (the export items in the editor's own menus open the same window). Then choose **All pages** (the default) or **Current page only**.
- With all pages, PNG and SVG give one file per page, named `<name>-p<page number>`. A PDF has one sheet per page, at the page size set in the diagram.
- Print (Ctrl+P) also prints one sheet per page. Exports and printouts always use light colors, whatever the theme.

## AI panel

- Ask the AI to draw a flowchart, a sequence diagram or an org chart, to explain the diagram, to tidy up a page, or to add the next step after the shapes you selected.
- The AI reads the diagram as text: the pages and, for each shape and connector, its id, text, shape, position and connections, plus which shapes you selected. It does not see the diagram as a picture.
- Changes the AI makes appear at once. Each change is one undo step (Ctrl+Z), and the turn list in the panel takes back a whole AI turn. If any part of a change is refused, the diagram stays as it was.
- For a new flowchart, sequence diagram or similar, the AI writes Mermaid and GenOffice turns it into shapes on your PC. The layout can differ a little from what the draw.io website makes.
- Diagrams can also be attached in the AI panel of the other editors, picked with `@`, and found by the file search on Home. The [terminal commands](help://cli) read, edit and create diagrams as well (`ieumoffice diagram read`, `ieumoffice diagram apply`, `ieumoffice create --type drawio`).

## Internet use

- The diagram tab sends nothing to the internet. The editor runs from files installed with GenOffice, and its cloud storage, sharing, plugins and its own AI are switched off.
- Pictures and fonts that a diagram takes from the internet are not loaded; a note says so when the file opens. A web or email link on a shape opens in your default browser only when you click it.
- The scratchpad, the shape libraries you add and recent colors stay on this PC, in the app's data folder. The AI panel sends the diagram's text to the AI you chose, as the other editors do.

## Not available

- Inserting or editing PlantUML. PlantUML shapes in a file are shown as their stored picture.
- Automatic layouts that use ELK, and connectors that route around shapes. Such connectors are drawn as ordinary connectors.
- Old Visio formats (`.vsd`, `.vss`) and saving back to `.vsdx`.
- Cloud storage, sharing, publishing, plugins and the editor's own AI features.
- Hiding parts of a diagram from the AI.
