# The Home screen: where your files live

Home is GenOffice's start page: a navigation sidebar on the left, file lists and quick-create cards on the right.

## Sidebar navigation

- **Recent**: files you opened recently. Each row is stamped with when — today, yesterday, or the date.
- **Starred**: files you starred. Hover a file row and click the star to add or remove it. The ⋯ menu's **Move to group** sorts starred files into named groups; the Starred view filters by them.
- **User Guide**: opens this manual.
- **Ask AI**: the knowledge-base panel — ask questions and get answers cited from your starred files (see below).
- **Projects**: the folders (projects) the AI can work with. Create a project or use an existing folder, and open one to manage its instructions, memory, files and chats. See [Projects](help://projects).
- **Folders**: directories you add to the sidebar with **Add folder…**, or drag in from the file manager. Each becomes a root you can open, create subfolders in, rename and remove; one that goes offline shows as unavailable and can be taken off the list. **New folder** makes another one.
- **The row at the bottom**: shows whether AI is connected — **Connect AI**, or the name of the connected subscription — and opens Settings.

There is no Trash entry here. Deleted files go to the system trash, and restoring one is the OS's business.

## The file list

Each row shows an icon, the file name, modification time and more. The row's **⋯ menu** offers:

- **Open**, and **Reveal in folder** to locate the file in your file manager.
- **Copy path**.
- **Move to folder…**: opens a folder picker and actually moves the file, offering skip / overwrite / rename when the destination already has a file of that name.
- **Rename**: inline, extension preserved automatically.
- **Star / Unstar** — stars persist across restarts, and follow a file when you rename it.
- **Duplicate**: creates a copy in the same folder.
- **Delete**: moves the file to the system trash — not a permanent delete.
- **Remove from list**, in the top-level Recent view, to drop an entry without touching the file.

### Several files at once

Tick the checkbox on a row, or ⌘/ctrl-click, to build a selection; the header checkbox selects everything currently listed, and a bar above the list reports how many are selected with **Move to folder…** and **Delete files** for the whole set. You can also drag a multi-selection onto a folder in the sidebar.

## Search

The search box at the top matches two things at once:

- **File names**: quick filtering by name.
- **File contents**: GenOffice indexes your files in the background (text inside docx/odt/xlsx/pptx/pdf/md/html), so searching body text finds files too. Scope and toggles live in the search settings.

## Quick start cards

The cards above the lists create a new document in one step. Clicking a card creates a file of that type and opens its editor — start writing right away, or let the AI draft for you (every editor has an **AI button** in its ribbon, and **Ask AI** in the selection context menu).

The new file lands in the folder currently selected in the sidebar; with no selection it goes to the default folder.

What each card does:

- **AI Docs** (.docx): a blank text document in the Docs editor. The file is only written to disk on **first save**; new documents open with the AI panel expanded (choose Off or Collapsed under Settings → "AI panel" if you would rather not).
- **AI Sheets** (.xlsx): a blank spreadsheet in the Sheets editor. Until you save, no file exists on disk — the name is reserved for the first save; after the first AI generation the file can also be renamed automatically from its content.
- **AI Slides** (.pptx): a blank presentation in the Slides editor.
- **AI Markdown** (.md): a blank Markdown document in the Markdown editor.
- **AI HTML** (.html): a blank web page in the HTML editor.
- **AI PDF** (.pdf): different from the rest — it **immediately** creates a real blank single-page PDF in the target folder and opens it as a regular file (the PDF editor works on real files). Good for annotating, redacting or adding text; the file can be renamed automatically from its content on first save.
- **Open local files**: a system file picker for Word (.docx/.doc/.odt), Excel (.xlsx/.xlsm/.xls/.csv/.tsv), PowerPoint (.pptx/.ppt), PDF, Markdown (.md/.markdown) and web pages (.html/.htm). Multi-select works; each file gets its own tab. Plain-text files (.txt, .json) open here too — they land in the Markdown editor's source view.

> Tip: File ▸ New in the menu bar creates the same document types (⌘N/Ctrl+N defaults to a text document); dragging a file into the window opens it.

## Ask your knowledge base

- Star files first (any type the app reads); the panel header counts the corpus, and an empty knowledge base tells you to go star something.
- Answers cite the files they came from; click a citation to open the file in its editor.
- Needs a connected AI; see [Subscription connection](help://subscription). The conversation lives in memory only — closing the app ends it.
- Pick a project below the input and the folder's files are searched and read as well, and the chat is kept in that folder so you can carry on in another editor. Without a project, the chat lives in memory only, as above.
- Search runs on the local file index, like Home search; files that have disappeared quietly drop out of the corpus.
- Groups organise the Starred list only — the knowledge base always spans every starred file.
