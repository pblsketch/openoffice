# The Markdown editor

The Markdown editor opens .md / .markdown — and .txt / .json, straight into source view — with a source + rendered-preview experience.

- **Open**: from Home or File ▸ Open; the CLI works too.
- **Edit**: plain-text editing; GFM extensions (tables, task lists, strikethrough, autolinks) render in the preview.
- **Preview**: live; relative assets like images resolve next to the document.
- **Saving**: byte-faithful — BOM, CRLF and the presence of a trailing newline are preserved; an unmodified save does not rewrite the file.
- **Find & replace**: ctrl+F searches the source; Replace All writes back.
- **AI**: preset buttons let the assistant rewrite, extend or translate the document. A selection can be hidden from the AI (see the AI panel chapter).

## The toolbar

One row of buttons above the editor (hover for tooltips):

- **File & history**: Save, Save As, Undo, Redo, Find; the **AutoSave** toggle on the right writes changes to disk on a timer.
- **AI button**: opens the AI panel; next to it are the rewrite / extend / translate presets.
- **Paragraph style** (dropdown): switch between body text and heading levels.
- **Inline formatting**: **bold**, _italic_, ~~strikethrough~~, `inline code`, link.
- **Lists**: bullet, numbered, task list.
- **Insert**: table, image, horizontal rule.
- **Properties**: insert or jump to the YAML front matter block at the top of the file.
- **Outline**: jump by heading hierarchy.
- **Spellcheck**: toggle spellcheck for this document.
- **Image host settings**: send pasted and dropped pictures to your own storage first — S3-compatible (R2/OSS/COS/MinIO), SM.MS or GitHub — with the local assets copy as the fallback.

Three quick examples:

- **Heading**: put the cursor on the line ▸ paragraph-style dropdown ▸ "Heading 1".
- **Table**: click **Insert table** ▸ drag the row/column count ▸ type into the cells; the preview renders it immediately.
- **Task list**: select a few lines ▸ click **Task list** ▸ each line becomes `- [ ]`, rendered as checkboxes in the preview.

## Links between notes

Links in a note are followed with **Ctrl+click** (**⌘+click** on a Mac). A plain click still edits the text.

- **Headings**: `[text](#heading)` and `[[#Heading]]` jump to that heading in the same note.
- **Other files**: `[text](other.md)` or `[text](../folder/report.pdf)` opens the file in its own tab, relative to the note's folder. A link to a heading in another Markdown note opens that note at the heading.
- **Wiki links**: `[[Note]]`, `[[Note#Heading]]` and `[[Note|shown text]]` are found anywhere in the note's vault — the nearest folder above the note that holds `.obsidian`, otherwise the note's own folder. When two files share a name, the one closer to the note wins.
- **Completion**: type `[[` and pick a note of the vault from the list; it is written as `[[Name]]`.
- **Pictures**: `![[picture.png]]` shows the picture under its text, and `![[picture.png|300]]` sets the width. Only pictures inside the vault, up to 20 MB, are shown.
- **What does not change**: wiki links stay plain text in the file, so a save never rewrites them. Web links open in your browser. Network paths (`\\server\share`), links in source view and the AI never open anything.

## Exporting

File menu, all local and all asking where to put the result:

- **Export as Word…** and **Export as PDF…** write a real .docx or .pdf.
- **Export as ODT…** writes an .odt (OpenDocument text) through the same conversion as the Word export; if something changes or is dropped on the way, you see the list and confirm first.
- **Export as Images…** writes a PNG per content element into a directory you pick.
- **Convert and Open in Docs** converts to .docx and opens it in the built-in Docs tab here in the app — it is not a hand-off to anything in the cloud, and the converted copy lives in a cache folder that is cleaned up after about a week.

## Source view

The ribbon carries a **Source** toggle (localized with the app). Turn it on and the editor is replaced by the raw Markdown: exactly the text a save writes, nothing prettified, nothing normalised underneath you.

- **Editing is byte-faithful.** A save from source view produces the same bytes a save from the editor does — BOM, CRLF and the presence of a trailing newline all survive.
- **It is the same document.** Toggle back and forth freely; the source is the editor's own text, not a copy that has to be merged.
- **The formatting toolbar is unavailable** while it is open, because most of those buttons insert editor constructs that only mean something in the rendered side. It comes back when you close the view.
- **.txt and .json** open here directly in source view: there is nothing to render, so the source _is_ the document.
