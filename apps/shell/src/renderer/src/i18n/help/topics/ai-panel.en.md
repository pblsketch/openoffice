# The AI assistant panel

Every editor can summon the AI panel: select something, give an instruction, watch the streamed result.

## Opening and using it

- The panel needs a connected AI. With none connected it shows the connect cards instead of an error; see [Subscription connection](help://subscription).
- Entries: the **AI button** in each editor's ribbon, **Ask AI** in context menus, or Ask AI on the markup bar.
- Describe the task in plain language (rewrite this / make this column percentages / re-layout this page...) and press Enter.
- Replies render **streamed**; when the AI needs tools (read the document, edit it) it executes and continues until done.
- **Stop**: interrupt the current turn at any time.
- **Queueing**: while a reply is streaming, Enter queues your message instead — a strip above the input counts them; open it to edit, remove, reorder, pause or clear. The next message sends itself when the turn ends; Esc still stops the turn.

## Which AI answers

- The model list at the bottom of the panel shows the AI in use and lets you choose another: your subscriptions first, then the key providers you have set up.
- Once you have used 80% or more of a subscription limit, a line such as "85% used · resets at 3:00 PM" appears in the panel.
- If a request is stopped — the limit is used up, or the login has expired — the panel says why and does not switch to another AI by itself. When your other subscription is connected, a **Continue with …** button offers it.

## What it can do

- **Docs**: rewrite/expand/translate/summarize, insert tables and pictures, adjust formatting; every turn snapshots first.
- **Sheets**: formulas, data fill, bulk transforms, formatting.
- **Slides**: whole-deck generation, layout adjustment, copy rewriting.
- **PDF**: Q&A and summaries against selected text or pages.
- **Markdown / HTML**: rewrite, extend, translate.
- **Home ▸ Ask AI** answers from your starred files and cites them — the knowledge-base panel has its own section on Home, and the Docs AI panel carries the same skill.

## Attaching open documents

In the AI panel of the Docs, Sheets, Slides, Hangul, HTML and mind map editors you can attach other documents you have open in GenOffice, or opened recently, as material. An attached document is handled exactly like a file picked from your PC.

- **`@` in the input**: type `@` at the start of the input or after a space to open a list of documents. If the window is split, the document in the other pane comes first, then other open documents and recent ones; the document you are in is left out. Narrow it with a few letters of the name (spaces are fine) and pick with Enter or a click: `@document name` goes into the input and the document is attached. **Find more…** at the bottom opens the document picker below.
- **Attach from GenOffice documents**: this button beside the attach button opens the same list in a window, where you can tick several documents and attach them at once.
- Documents with unsaved changes and new documents that were never saved appear dimmed and can't be picked. Save them and pick again — the AI reads the saved file.
- When two documents share a name but sit in different folders, the name of the folder directly above is added, as in `@plan.docx(Term 2)`, and that folder name is also given to the AI.
- The PDF and Markdown editors have no attachments yet, so neither way is available there.

## Projects

- Click the project name at the left, below the input, to pick a project (one folder on your PC). The AI then answers knowing that folder's files, instructions and memory, and the chat is kept in the folder so you can carry on in another editor. See [Projects](help://projects).
- With a project picked, the current chat's title appears at the top of the panel. Click it for this project's chat list and **New chat**.
- The `@` list in the input shows "Files in this project" after the open documents.
- A request with a project picked also sends that project's instructions (with `AGENTS.md` and `CLAUDE.md` at the top of the folder, which you can turn off on the project's page), memory and list of file names, a short excerpt of each file the AI finds when it searches the folder, and the text of any file the AI reads, to the AI you are using.

## Rollback and safety

- The Docs panel keeps a **version list**: one snapshot per turn, roll back to any of them, and the rollback itself is Ctrl+Z-able. Snapshots survive reopening the document.
- AI edits go through the same editing pipeline as manual ones (undoable, save-gated) — nothing bypasses your save confirmation.

## Hiding a selection from the AI

- In Slides, HTML and Markdown a selection can be kept out of the model's eyes: right-click it ▸ **Hide the selection from AI**, name the placeholder, and the model reads `{{name}}` in its place. (Markdown arms the item with the eye-off toggle on its ribbon; HTML's item lives in the source panel.)
- The file keeps the real text — saving, export and print are untouched, and the mark survives reopen. The same item unhides (Markdown gets a separate **Show the selection to AI again** entry).
- HTML hides element contents, attribute values and script string literals; the rendered page never changes.
- Slides also hides whole pictures, videos and audio, and a slide with hidden content is never sent as a screenshot: the automatic layout check skips the page and says so.
- This is for the in-app AI only — the CLI, MCP tools and headless export read the file directly and still see the text.

## Privacy

- Instructions and the relevant document content go to the **AI you are using**: to Anthropic or OpenAI under your own account when you use a subscription, or to the provider whose key you entered. With no AI connected, nothing is sent.
- Whether a subscription's content is used to train AI is decided by your own account settings at that company.
- Local files are uploaded nowhere else; API keys are stored in the app's settings file on this machine and sent only in request headers.
