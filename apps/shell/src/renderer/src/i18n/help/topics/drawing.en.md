# The drawing editor

The drawing editor opens Excalidraw drawings in a tab of their own and saves them back to the same file.

- **What it opens**: drawing notes made with Obsidian's Excalidraw plugin (`.excalidraw.md`, or a `.md` whose front matter has `excalidraw-plugin`) and `.excalidraw` files from the Excalidraw web app.
- **New drawing**: the **Excalidraw Drawing** card on Home, or **File ▸ New**. A new drawing is an Obsidian drawing note (`.excalidraw.md`), and you name it at the first save.
- **Drawing**: shapes, arrows, lines, free drawing and text, with the canvas's own toolbar and shortcuts. ctrl+Z undoes.
- **Saving**: ctrl+S. A file is saved in the format it was opened in. Autosave writes every 30 seconds and when the window loses focus, but skips a drawing that has no file name yet. A drawing you only looked at is saved byte for byte as it was.

## Obsidian drawing notes

- Saving rewrites only the note's text list and drawing data. The front matter, the text you wrote in the note and its links stay as they were, so the note opens the same way in Obsidian.
- Pictures the note points at (`[[picture.png]]` under Embedded Files) are shown when they are inside the note's vault: the nearest folder above the note that has an `.obsidian` folder, or else the note's own folder. Pictures over 20 MB, in hidden folders or outside the vault are not shown.
- You cannot add new pictures to a note yet. The picture tool is off and dropping files onto the canvas is blocked, because a picture kept only inside the note might not show in Obsidian.

## What it does not do yet

- There is no AI panel. The AI cannot read or change drawings.
- There is no export to PNG or SVG.
- The editor stays off the network. Its fonts are built in, and shared libraries, live collaboration and web embeds are off. A link in a drawing opens in the browser only when it is a web or mail address.

## Opening drawings from File Explorer

The installer adds the app to **Open with** for `.excalidraw` files without making it the default program. A drawing note is a `.md` file, so it opens wherever a Markdown file opens in the app and goes to the drawing editor instead of the Markdown editor.
