# PDF: reading, annotating and redacting

The PDF editor has five ribbon tabs: **Home / Annotate / Edit / Page / View**. It reads and writes: text is editable, content can be redacted, signed, and forms can be filled.

## Reading and navigation

- Left sidebar: **thumbnails** (click to jump, visible range highlighted) or **outline** (bookmarks, when present).
- Zoom: the ratio control bottom-right; ctrl+wheel steps the zoom.
- Moving the view: turn on the **Hand tool** (Home and View tabs) and drag to move the page up, down and sideways. While it is on, dragging selects no text and a plain click still follows a link. Dragging with the middle button (wheel) held down moves the view without the tool. Esc or picking another tool turns it off.
- Rotation: per-page or all pages from the Page menu; rotations are written back on save.
- Search: ctrl+F full-text with all hits highlighted.
- Encrypted PDFs: a password prompt (its own small window) opens them; the password is used for this session only. You can edit and save such a document; the save keeps its password. **Annotate → Protect** sets, changes or removes the password and what readers may do.

## Text selection and markup (Annotate)

Try it on any paragraph:

1. **Drag the mouse across a sentence** — on release, an annotation bar floats above it:

![The annotation bar after selecting text](img/pdf-highlight.png)

2. Pick one of the three **highlight** colors, or **underline**, **squiggly** or **strikethrough**. To change a highlight color, right-click it and choose a new one. After an underline, squiggly or strikethrough, a color row opens on the bar: click another color to change it, and the next one is drawn in that color too. **Ask AI** sends the selection with your question to the AI panel.
3. To undo an annotation, drag-select the same passage again and click the active button on the bar (a Word-style toggle), or select it and press Delete.

Reference:

- Drag over text and a popup bar appears: **highlight / underline / strikethrough / copy / Ask AI**.
- Colors come from the palette; **applying the same markup to an already-marked range removes it** (Word-style toggle).
- Markups already saved into the file can be selected and deleted (⋯ menu or Delete).
- **Note**: while a drawing tool is armed the text layer is not selectable — the tool disarms itself after each placement, so you are back in select mode for the next action.

## Drawing tools (Annotate)

Six tools: **ink, rectangle, ellipse, arrow, note**, plus the **redaction box** on the Annotate tab.

- Each tool is a toggle: click to arm; **it disarms itself once a shape lands** (click the tool again to keep going); clicking the armed tool also disarms.
- Ink follows the stroke width; rectangle/ellipse/arrow are dragged out; colors come from the drawing palette.
- Placed shapes can be selected, deleted, dragged, and (rect/ellipse) resized.
- **Redaction, the full workflow** (hiding a line of text):

  1. Annotate tab ▸ click **Redact area** (the tool arms).
  2. **Drag a box over the content** — it gets covered by a hatched mark, and the toolbar gains **clear-marks / apply-redaction** buttons.

  3. Click **Apply redaction** and confirm — the result is a working copy where the covered text and images are physically removed (not covered) and it cannot be undone; the original document stays untouched.

  Made a mistake? The clear-marks button wipes the current marks so you can redraw.

## Sticky notes and comment threads

- The **note tool** drops a pin and opens a margin card for the text (author name configurable); confirming saves it as a standard PDF Text annotation.
- Click a pin to open the thread: **reply** (replies form one flat list, not nested), **edit** your comment, **delete** one comment or a whole thread.
- Edits in flight survive until the save writes the new text back into the same annotation in the file, keeping reply chains intact.

## Editing PDF content (Edit)

- **Edit text**: click text to edit it block by block (pdfium engine; fonts matched best-effort).
- **Insert text**: place searchable text with font/size/color of your choice.
- **Insert image / stamp**.
- Forms: AcroForm fields fill directly; values are written on save.

## Signatures

- **Ink signature**: draw it; it can attach to a form signature field.
- **Image signature**: place a picture as the signature.
- Saved signatures can be reused.
- **Certificate sign** (Annotate tab): sign with a certificate from the system store or a .p12/.pfx file; optionally show the signature on the page, and optionally certify the document against later changes.
- Signing writes a **new file** (an incremental update — earlier signatures stay valid) and opens the signed copy in its place. Save first: a signature covers the file as saved on disk.
- A banner above the document lists existing signatures; **View signatures** shows each one's validity, coverage and certificate chain. Revocation (CRL/OCSP) is not checked.

## Page operations (Page)

- **Rotate / delete / reorder**: drag thumbnails to reorder; deletion confirms.
- **Import pages**: pull pages in from another PDF. **Insert blank page** adds an empty one.
- **Replace pages** swaps a range for pages from elsewhere; **Crop pages** trims, with an option to apply to all.
- **Page size** rescales every page to one paper size; **Reverse order** flips the document end to end.
- **Extract pages**: export selected pages into a new PDF.
- **Split**: two shapes of it — by ranges into several files, or each page cut into a grid of smaller pages.
- **Merge**: two shapes of it — append other PDFs, or combine several pages onto one sheet. Sizes are summed **before** anything is read and anything over **1 GiB total is refused** with a readable error (keeps memory bounded).
- Page-level changes write back on the next save; Save As leaves the original untouched.

## Export and print

- **Export as Word… / PowerPoint… / Excel…** in the File menu, or the same three from **PDF Converter** on the ribbon — all local, no upload. The .pptx comes out one slide per page and the .xlsx one worksheet per page. Each asks where to save it.
- **Print**: current order and rotations through the system dialog; page ranges supported.

## Saving

- Regular Save/autosave writes annotations and edits back into the file (atomic). The **Auto save** toggle at the left of the ribbon turns autosave on or off.
- **Redaction goes through its Apply flow** producing a copy, leaving the original untouched so sensitive content does not linger in it.

## Selection bar shortcuts

While the annotation bar is showing over selected text, one key runs an action straight away.

| Key   | Action                                   |
| ----- | ---------------------------------------- |
| H     | Highlight (removes it if already marked) |
| U     | Underline                                |
| S     | Strikethrough                            |
| N     | Add a note at the end of the selection   |
| E     | AI explanation (passage card)            |
| T     | AI translation (passage card)            |
| Enter | Open the Ask AI box                      |

- The keys work the same with a Korean or any other input method switched on. They are ignored while you type in a field or hold Ctrl or Alt.
- In a document that is locked against editing (its owner password forbids changes), H, U, S and N do nothing and show the reason, as the bar's buttons do.

## Passage cards

Press **E** or **T**, or the explain and translate chips in the **Ask AI** box, and the answer appears in a small card beside the selection. Cards are kept, so they are still there when you reopen the document, and you can copy them. Asking about the same passage again opens the existing card instead of sending anything.

- **Keep as note** makes a note at that spot. Its first line says "AI explanation" or "AI translation", and the author is your PC account name. It goes into the file when you save the PDF; until then the card shows "Waiting for save".
- **Ask more in the AI panel** hands the passage and the answer to the AI panel without sending them; **Add to note** puts them at the end of this PDF's note.
- Only **Regenerate** sends the passage to the AI again.
- **Delete** removes the stored card only. A note you already kept stays.
- A faint dotted line marks each passage that has a card; click it to reopen the card. The line is on screen only and is never saved or printed. Switch it with View ▸ **Passage marks**.

## Annotation overview

- View ▸ **Annotations** lists, in the left sidebar, this document's highlights, underlines, strikethroughs, notes and drawings, markups not saved yet, and passage cards. Markups show the text under them.
- Filter by kind, color, page range or text, and sort by page or by creation order.
- Click an item to jump there with a short flash. A note opens its margin thread; a card opens the card.
- The panel menu's **Copy as Markdown**, **Open as Markdown document** and **Open as Word document** use the list as currently filtered. No AI is involved. New documents can only be made from a PDF opened inside GenOffice.

## Translation side by side

- Turn on View ▸ **Translation side by side** and a translation column appears to the right of every page, scrolling with it. Turning it on sends nothing to the AI. A document you already translated with **Translate Document** shows its translation at once; paragraphs without one appear as dimmed source text.
- **Translate this page** (or **Translate the rest** when part of the page is done) sends that page with one press while you use a subscription; the name of the AI it goes to is shown beside the button. On a connection billed by usage, the first press in a tab asks "‹AI name› will charge for this · Translate / Cancel" first.
- Double-click a translated paragraph to edit it. Edited paragraphs are stored as plain text and are used as they are in translated PDF, Markdown and EPUB files. **Translate again** on a paragraph sends only that paragraph, and asks first if you edited it.
- Hovering a translated paragraph outlines its place in the source page. The column's width and text size can be changed. **Translate all pages…** opens the **Translate Document** window, whose **Store only (no file)** format keeps the translation without writing a file.
- Newly translated paragraphs are linked sentence by sentence. Hovering a translated sentence highlights that sentence on the source page, and hovering a source sentence lights up its translation. Where the sentence cannot be found on the page, and for paragraphs translated earlier or edited by you, the link stays paragraph by paragraph.
- The bar above the column switches between **Translation** and **Plain language**. A plain-language explanation rewrites the text in everyday words and short sentences, for children, older readers or people learning the language; facts, numbers and names stay as they are. The choice is remembered, and switching sends nothing. While the explanation is shown, the page and paragraph buttons and editing work on it.
- In plain language, **Explain all pages simply…** opens the **Translate Document** window with **Plain-language explanation** as its mode. An explanation runs longer than the original, so it cannot become a translated PDF; it is written as Markdown or EPUB. With **Source then explanation** on, each source paragraph is followed by its explanation; off, the file holds the explanation only. The language starts as the screen language and may be the document’s own.

## AI highlights

- Under Home ▸ **AI highlights**, pick a category set (Research & reports, Contracts & terms, Textbooks & manuals, or Your own) and the pages. Nothing is sent until you check the estimated number of calls and the AI it goes to and press **Start**.
- The sentences the AI picks are previewed as translucent colored boxes on the page. The preview is never saved; switch it with View ▸ **Highlight preview**.
- In the **Annotations** panel, **Accept** or **Dismiss** suggestions one by one, or accept a whole category. A sentence that could not be found in the page text cannot be accepted.
- An accepted suggestion becomes a highlight in its category's color, and the category name is saved as the annotation's subject, so other PDF viewers show it in their comment lists. It goes into the file when you save the PDF.
- AI highlights cannot start in a document locked against editing. Sentences the AI made up that are not in the text are dropped, and the end report says how many were received and dropped.

## Document overview and paragraph citations

- At the top of the AI panel, **Document overview** ▸ **Create overview** makes a three-line summary, a summary and key terms (with their meaning and first page). A long document is summarized in parts, so you confirm the estimated number of calls first.
- The overview is kept and is there when you reopen the document; only **Regenerate** sends again. Click a term to find it in the document; each section can be copied or added to the note.
- When the conversation is empty, the AI panel offers three suggested questions. Clicking one sends it once.
- Clicking a page link (p.N) the AI gives as evidence jumps to that page and highlights the quoted sentence for two seconds. If the sentence cannot be found, it only goes to the page.

## A note for each PDF

- The first time you press **Open note** (View tab or the **Annotations** panel), a save dialog opens, by default in the PDF's folder with the name "PDF name note.md". After that, the note opens straight away in a Markdown tab.
- If you pick a file that already exists, Windows may ask whether to replace it, but the file is not overwritten: it is linked as the note as it is.
- **Add to note** (on cards, panel items and the document overview) puts a quote and a page link at the end of the note's tab and leaves it unsaved; you save it in the note tab yourself. The link opens the PDF at that page in other programs such as a browser.
- A PDF that was never saved shows "Save the PDF first". Notes only work for PDFs opened inside GenOffice.
