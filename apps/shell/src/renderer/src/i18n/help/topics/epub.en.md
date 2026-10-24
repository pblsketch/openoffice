# EPUB e-books: reading, editing and translating

The e-book editor opens EPUB books (`.epub`) in a tab. You read the book, correct its text right on the page, ask the AI about it, and translate it into a new EPUB file. There is no screen for editing the code of a chapter.

## Opening a book

- Open a `.epub` file from the open dialog, by dragging it onto the window, from recent files, the folder tree or the Google Drive list. In Windows it is also offered under "Open with". Installing GenOffice does not make it the default program for `.epub` files.
- If the book is already open, its tab comes to the front.
- Copy-protected (DRM) books do not open: open them in the app of the store you bought them from. Damaged files and files that are not EPUB books do not open either, and the reason is shown.
- **Fixed-layout books** (laid out page by page, like picture books and comics) open for reading only. Editing, AI editing, replace and translation are off, and the status line says why. Reading and asking the AI still work.
- A chapter whose file is malformed is shown as well as possible but cannot be edited, and a note at its top says so. It is saved unchanged and stays in the original language in translations.

## Reading

- The **Contents** pane on the left shows the book's table of contents. Click an entry to go there. A book without one gets a list of its chapters.
- Each chapter scrolls up and down. Keep scrolling past the end of a chapter to go to the next one, or past its start to go back. The status line shows which chapter you are in.
- The **View** tab changes the text size and line spacing and switches **Dark view** on and off. These settings change only the screen, never the book, and apply to every book.
- The place where you stopped reading is remembered for each file, in the app's data folder and not in the book.
- **Find in book** (Ctrl+F) searches every chapter. Click a result to go to it.
- A link inside the book moves to that place. Web and email links open in your default browser; other addresses are not opened.
- The book's own scripts never run and nothing is loaded from the internet. Sound and video do not play.

## Editing text

- Click a paragraph and type. Paragraphs, headings, list items, quotes, table cells and picture captions can be edited. Pictures and the layout of tables cannot.
- Pasting inserts plain text only.
- **Enter** splits a paragraph in two and **Shift+Enter** starts a new line inside it. **Backspace** at the start of a paragraph joins it to the one before, and **Delete** at the end joins the next one to it. In table cells, captions and definition lists Enter does nothing: only the text inside changes.
- **Bold** (Ctrl+B) and **Italic** (Ctrl+I) switch on and off. Text that the book's style sheet makes bold or italic stays as it is.
- **Undo** (Ctrl+Z) and **Redo** (Ctrl+Y) keep working after you save. Undoing a change in another chapter takes you there.
- **Replace** (Ctrl+H) works through the whole book, one paragraph at a time: a match never spans two paragraphs. Read-only chapters are skipped, and the number of skipped places is shown. **Replace all** is undone in one step.

## Saving

- Save (Ctrl+S), Save As (Ctrl+Shift+S, `.epub` only), **Auto save** on the ribbon and the question before closing work as in the other editors.
- If nothing changed, the file is not written again. When you save changes, only the paragraphs you changed are rewritten. Pictures, fonts, styles and every other part of the book stay exactly as they were. In an EPUB 3 book the "last modified" date is updated as well.
- If another program changed the file after you opened it, the file is not overwritten.

## AI panel

- Ask about the book, have a chapter summarized, or have its text corrected or rewritten. The AI reads the book's contents and chapters and finds text in it.
- Changes the AI makes appear at once, and one undo (Ctrl+Z) takes back everything it changed in that turn. The AI can make text bold or italic, but cannot add pictures, tables or chapters.
- The text of the book is material for the AI, not instructions to it.
- Ask "Translate this book into French" and the AI opens the translation window with that language filled in. Nothing is sent until you press **Start**.
- EPUB books can also be attached in the AI panel of the other editors, picked with `@`, and found by the file search on Home.

## Translating a book

1. On the **Home** tab, click **Translate book** (or File ▸ Translate Book…).
2. Choose the language, the chapters (all are chosen at first) and the results: a **Translated book**, a **Bilingual book** (original and translation), or both. Choose where each one is saved.
3. Click **Next**. The confirmation shows the estimated number of AI requests, the AI they go to, the parts already translated (not sent again) and, on a connection billed by usage, that it will charge. If the book has unsaved changes, the button is **Save and translate**.
4. Click **Start**. Progress and **Stop** appear at the top. Editing is locked until the translation ends; the AI panel keeps working.
5. At the end a report lists what was translated, what was left in the original language and the result files, each with **Open**.

- The book itself does not change. Each result is a new EPUB file with an identity of its own, so e-book library apps keep it apart from the original.
- The title and the table of contents are translated too. In a bilingual book each paragraph is followed by its translation; in tables, captions and lists the translation goes inside the same cell or item. Its title shows both, as "Original title (Translated title)".
- Chapters you did not choose stay in the original language in the result.
- A book written vertically becomes horizontal, unless it is translated into Japanese, Chinese or Korean. Arabic and Hebrew translations read from right to left.
- What has been translated is kept. If you stop, choose **Export what is translated so far** (the rest stays in the original language) or **Continue later**. When you open a book with an unfinished translation, GenOffice offers to continue it. **Translate again from the start** first deletes the kept translation for that language.
- Kept translations count under Settings ▸ General ▸ **Saved AI results**, together with those of PDF documents, and **Delete all** removes them too.
- The same translation can also run from the [terminal commands](help://cli) as `ieumoffice epub translate`.

## Not supported yet

- Adding, deleting or reordering chapters; changing the title, author or cover; inserting pictures or tables; turning a paragraph into a heading or a list.
- Editing or translating fixed-layout books, and opening copy-protected books.
- Turning pages like a printed book, and creating a new, empty book.
- Comparing the original and the translation side by side inside the editor. Open the bilingual book instead, and correct the translated book like any other book.
- Hiding parts of a book from the AI.
