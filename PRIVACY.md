# IeumOffice Privacy

Last updated: October 29, 2026

IeumOffice opens, edits and saves documents on your own PC. The project runs
no server of its own: nothing is sent to IeumOffice or to its maintainers, and
the app has no usage analytics or telemetry.

Data leaves your PC only in the situations listed below, and each time it goes
directly from your PC to the service named there. This page describes what the
app does; what each of those services does with what it receives is governed
by that service's own terms and by your account settings there.

## What leaves your PC

| When                                                                                                                                                                                             | What is sent                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Where it goes                                                                                                                                                                                                                                               |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------                 | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------                                                                                                                                                                                                                                                                                                                                                                                                                                                    | -----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------                                           |
| You use AI with a connected Claude or Codex subscription (the default)                                                                                                                           | What you typed, the document content the request works on, the files and images you attached, the conversation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | **Anthropic** (Claude) or **OpenAI** (Codex), under your own account. The app hands the request to the Claude Code or Codex program installed on your PC, and that program sends it with the login you made there                                           |
| You use AI with **ChatGPT connected in the app** (Settings → AI → ChatGPT, no program installed)                                                                                                 | What you typed, the document content the request works on, the files and images you attached, the conversation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | **OpenAI** (ChatGPT), under your own account and plan. The app sends the request itself, from your PC straight to `api.openai.com`, with the sign-in OpenAI gave this app. Signing in opens OpenAI's page in your browser; the app never sees your password |
| You use AI with an API-key provider you set up under Settings → AI → Advanced, or a local AI server you added under Settings → AI → Local AI                                                     | The same content. The Local AI card reads the server's model list and tests the model without sending document content; a chat sends the document content and conversation like any other AI request                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | The company, or your own server, whose key or address you entered. A local AI server is the address you chose on your PC or network; IeumOffice does not operate it and does not send it anywhere else                                                      |
| You use AI with a free connection (Settings → AI → Use for free)                                                                                                                                 | The same content                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | **OpenRouter**, which passes it to the company that runs the free model, or **Google** (Gemini). On free plans these companies may use what you send to improve their AI                                                                                    |
| You press Connect in browser on the OpenRouter card                                                                                                                                              | Your browser opens OpenRouter's sign-in page. After you allow access, the app sends OpenRouter the one-time code it got back, to receive a key                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | **OpenRouter**. The app also asks OpenRouter for its list of free models (no key) and, while connected, how many free requests are left today (with your key)                                                                                               |
| You paste a Gemini key and press Connect                                                                                                                                                         | The key, to check it by listing models (no free requests are used)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | **Google** (`generativelanguage.googleapis.com`)                                                                                                                                                                                                            |
| The app starts, or you save a new key for an API-key provider (Settings → AI → Advanced, or a free connection)                                                                                   | The key, to ask that provider which models it offers to the key (no model is called, nothing you wrote is sent, and it costs nothing). Only providers that have a key are asked, once per start and again when the key changes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | **The provider that key belongs to**, at the same address the chat uses                                                                                                                                                                                     |
| You start **AI page reading** in the PDF editor and confirm it                                                                                                                                   | An image of each page you chose, one page per request, with the reading instruction                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | The AI provider in use, as for chat                                                                                                                                                                                                                         |
| You start **Translate Document** in the PDF editor and confirm it                                                                                                                                | The whole text of the pages you chose (the whole document by default), in batches; link addresses stay on your PC                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | The AI provider in use, as for chat                                                                                                                                                                                                                         |
| In the PDF editor you ask for an **AI explanation** or **AI translation** of selected text (the `E` or `T` key, the chips under **Ask AI**, or **Regenerate** on a passage card)                 | The selected passage, up to 1,500 characters of the text around it on the same page, and the document title, once                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | The AI provider in use, as for chat                                                                                                                                                                                                                         |
| In the PDF editor's **Translation side by side** view you press **Translate this page**, **Translate the rest** or **Translate again** on a paragraph                                            | The text of that page's untranslated paragraphs, or of that one paragraph, as for document translation; link addresses stay on your PC. With a subscription one press sends it; on a route billed by usage the app asks once per tab first                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | The AI provider in use, as for chat                                                                                                                                                                                                                         |
| You start **AI highlights** in the PDF editor and confirm it                                                                                                                                     | The text of the pages you chose, in batches, with each paragraph's identifier and the category names                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | The AI provider in use, as for chat                                                                                                                                                                                                                         |
| You press **Create overview** (or **Regenerate**) in the PDF editor's AI panel                                                                                                                   | The text of the whole document (pages read by AI as read); a long document goes in parts after you confirm, followed by the partial summaries once more to combine them                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | The AI provider in use, as for chat                                                                                                                                                                                                                         |
| You press **Fill with AI** in the EPUB conversion window                                                                                                                                         | The text of the first pages (3 to at most 12 pages, up to 12,000 characters), once                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | The AI provider in use, as for chat                                                                                                                                                                                                                         |
| You start **Translate book** in the EPUB editor and confirm it                                                                                                                                   | The text of the chapters you chose (every chapter by default) with the book's title and table of contents labels, in batches; link addresses and pictures stay on your PC                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | The AI provider in use, as for chat                                                                                                                                                                                                                         |
| A terminal command or an MCP client runs `pdf ai-read`, `pdf translate` or `epub translate` (the MCP tools `pdf_ai_read`, `pdf_translate`, `epub_translate`) with `--yes`                        | The same as AI page reading, document translation or book translation above                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | The AI provider chosen for chat; a subscription only if you allowed automatic requests to use one, and a route billed by usage only with `--allow-paid`                                                                                                     |
| You send any request to AI from an AI panel while some skills are set to **AI decides** (Settings → Skills)                                                                                      | The list of those skills, with every request: each one's identifier (where it is from and its name), title and description (up to 300 characters; past the first 100 skills, identifier and title only). Their text is not sent until it is used (next row)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | The AI provider that chat uses, as for chat                                                                                                                                                                                                                 |
| You call a skill with `/` or `$` in an AI panel, or the AI uses a skill that is turned on                                                                                                        | The skill's text (its `SKILL.md` and the list of its files), and any text file of the skill the AI reads; script files are never run in the AI panel                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | The AI provider that chat uses, as for chat                                                                                                                                                                                                                 |
| You attach files or documents in an AI panel (from this PC, Google Drive, **Attach from IeumOffice documents**, or by typing `@` in the input)                                                   | The attachment list with each attachment's file name, type and size, and an attachment's text when the AI reads it. When two attachments share a file name, the name of the folder each one sits in directly is added to its line (that one folder name only, never the full path; nothing for the app's own Drive copy folders)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | The AI provider that chat uses, as for chat                                                                                                                                                                                                                 |
| You pick a **project** (a folder on your PC) under an AI panel's input, or in Home's Ask AI, and send a request                                                                                  | With every request: the project's name, its instructions and memory (unless you chose **Use without instructions**), the `AGENTS.md` and `CLAUDE.md` at the top of the folder as instructions too (on by default; turn off **Also read AGENTS.md and CLAUDE.md at the top of the folder as instructions** on the project's page), and a list of the folder's files (path inside the folder, type, date changed; up to 500). When the AI searches the folder (in Home's Ask AI as well), each file found with its path and a short excerpt of its text from the home search index (no excerpt from a document open with unsaved changes). When the AI reads a file of the folder, that file's text, read the same way as an attachment (parts hidden from AI stay hidden). Other file contents are not sent unless the AI searches or reads them | The AI provider that chat uses, as for chat                                                                                                                                                                                                                 |
| You add a skill from a GitHub link (Settings → Skills → Add), confirm an install the agent proposes, or press **Check for updates** on a skill installed from GitHub                             | Requests for the public repository's current commit and an archive of it; no cookies and no sign-in data                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | **GitHub** (`github.com`, `api.github.com` and `codeload.github.com` only)                                                                                                                                                                                  |
| You press "Make" in the "Make a new document" window                                                                                                                                             | What you typed (or the default request) and the files listed as material                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | The AI provider in use, through the new document's AI panel like any request there. "Convert without AI" sends nothing                                                                                                                                      |
| The AI, or the `ieumoffice search` command, searches the web or looks for images                                                                                                                 | The search query                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | By default **Parallel**'s free search and **DuckDuckGo**, no key needed. If you chose a key-based search provider under Advanced (Serper, Serply, Tavily, Parallel, Exa or Firecrawl), that provider instead                                                |
| A picture found by a search, or one the AI or an MCP client inserts by address, is put in your document                                                                                          | A download request for that picture                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | The website that hosts the picture                                                                                                                                                                                                                          |
| The AI, or the `ieumoffice read-url` command, reads a web page by address                                                                                                                        | A request for that address. The page text comes back and, in a chat, becomes part of the conversation. For a GitHub `blob` address the app reads the raw file; on a private repository it sends the read-only GitHub token                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | The website you named (for GitHub, `github.com`, `raw.githubusercontent.com` or `api.github.com`); the token only to **GitHub** (`api.github.com`). In a chat, the page text then goes to the AI provider in use, as for chat                               |
| An image is generated (needs a key-based image provider in this version)                                                                                                                         | The description of the image and any reference pictures                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | The image provider whose key you entered                                                                                                                                                                                                                    |
| The AI is asked to look at a picture (one you attached, or one in the open document), a video or a sound file                                                                                    | That picture, video or sound file, and the question about it                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Pictures: the AI provider in use, or the key-based analysis provider you chose. Video and sound: only a key-based provider that can analyse video                                                                                                           |
| The installed app checks for a new version (at launch and every few hours, unless **Check for updates automatically** is off in Settings → About; always when you choose **Check for updates…**) | An ordinary request for the public release list; a new installer is downloaded when you accept an update                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | **GitHub** (the releases of `pblsketch/openoffice`)                                                                                                                                                                                                         |
| You press **Send feedback** (Help menu or Settings → About)                                                                                                                                      | A dialog shows the app version, the operating system and the UI language; the app copies that block to your clipboard and opens the survey in your browser. What you type into the survey is sent by Google. The app itself sends nothing, and document contents, file paths and account details are never included                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | **Google** (the survey form), in your browser under your own Google session                                                                                                                                                                                 |
| You press **See each step on screen** under the AI connect guide (shown while no AI is connected)                                                                                                | Nothing from the app. Your browser opens the connect help page of the IeumOffice website; the app adds only which way to connect you had picked (Claude, Codex or free) as the page section. The page loads like any website visit; it has no analytics                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | The IeumOffice website (`ieumoffice.com`, hosted by **Vercel**) and **Google Fonts** for its typeface, in your browser                                                                                                                                      |
| You set up an image upload host in the Markdown editor                                                                                                                                           | The pictures you paste or drop into a Markdown document                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | The host you configured: S3-compatible storage, SM.MS, or a GitHub repository. Nothing is uploaded when no host is configured; pictures are kept next to the document                                                                                       |
| You switched on reranking for the home screen's file search (off by default)                                                                                                                     | The search query and excerpts of the top 20 local matches                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | The reranking service you chose and entered a key for                                                                                                                                                                                                       |
| You connect Google Drive under Settings → Integrations                                                                                                                                           | Your browser opens Google's sign-in page. After you allow access, the app sends Google the one-time code it got back, with the app's own client identifier, to receive a sign-in token; while connected, the app renews that token with Google                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | **Google** (`accounts.google.com`, `oauth2.googleapis.com`)                                                                                                                                                                                                 |
| You press **Choose from Google Drive** on the home screen, or look at or search the files you chose                                                                                              | Google's file picker opens in your browser; the ids of the files you choose come back to this PC. Your search words, among the files you chose; a file you open is downloaded to this PC                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | **Google** (`accounts.google.com`, Drive at `www.googleapis.com`), under your account                                                                                                                                                                       |
| You save a document you opened from Google Drive                                                                                                                                                 | The saved file, to replace that Drive file, or as a new file beside it (a copy you chose, or the Office file made next to a Google document)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | **Google** Drive, under your account                                                                                                                                                                                                                        |
| The AI searches or reads the Drive files you chose (Settings → Integrations → **Let the AI find and read files in Drive**, on once you connect)                                                  | To Google: the AI's search words, and the files it reads, which are downloaded. To the AI provider: the list of files found and the text of the files read; parts hidden from AI stay hidden. Nothing is read while the AI in use is a free connection                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | **Google**, and the AI provider in use, as for chat                                                                                                                                                                                                         |
| You press **Attach from Google Drive** in an editor's AI panel and choose files                                                                                                                  | Google's file picker opens in your browser; the files you choose (up to 20) are downloaded to this PC. When you send the message, they go to the AI provider like any attached file. Not offered while the AI in use is a free connection                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | **Google**, then the AI provider in use, as for chat                                                                                                                                                                                                        |
| You disconnect Google Drive                                                                                                                                                                      | A request to revoke the app's access                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | **Google** (`oauth2.googleapis.com`)                                                                                                                                                                                                                        |
| You start a session in the **Agent** window and send it a message                                                                                                                                | What you typed, and whatever the program reads while it works: files in the project folder you chose (as they are on disk, hidden parts included), output of commands you allowed, documents open in the app that it reads through the app (hidden parts as their labels), and the skills it was given (the ones turned on in Settings → Skills and those in the project folder): the name and description of each with every message, and the text of those it reads. Commands you allow can also reach other websites on their own (Claude Code; Codex runs them without internet unless you turned on **Internet access for commands** for that project folder)                                                                                                                                                                              | **Anthropic** (Claude Code) or **OpenAI** (Codex), under your own account, as for chat                                                                                                                                                                      |
| In the **Agent** window, Claude Code searches the web or reads a web page (it asks you first), or Codex searches the web (**Saved results** by default; **Live** or **Off** per project folder)  | The search query; for a page read, a request for that address                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | The search goes through **Anthropic** (Claude Code) or **OpenAI** (Codex); a page read goes to that page's site                                                                                                                                             |

Every one of these is a direct connection, so the receiving service sees your
public IP address, as any website you visit does.

Parts of a document that you marked as hidden from AI, in the editors that
offer that marking, are withheld from the request whichever provider is used.

When a local AI server's address is not this PC or a private-network IP
address, the Local AI card says where documents go: over `http://` it warns
that they are sent without encryption, and for a public IP address over
`https://` it notes that they are sent to that server. It only tells you; the
address is saved either way.

## How far hiding reaches

The PowerPoint, Markdown and HTML editors let you hide parts of a document
from AI. The mark is saved in the file, and it is honoured:

- in that editor's own AI panel;
- when the file is read inside the app as material for something else: as an
  attachment in another editor's AI panel, by the home screen's Ask (its
  reads and its search excerpts), in the home screen's search index and the
  excerpts sent for reranking, as material for "Make a new document", and
  by "Convert without AI". A hidden part is read as its label (`{{label}}`),
  hidden text cannot be found by the home screen's search, and a file whose
  marks cannot be processed is not read at all;
- a file open in a tab with unsaved changes is not read for any of these
  until you save it, because a new mark only reaches the file on save.

It does **not** reach:

- **Word documents.** The Word editor does not recognise hiding marks, and a
  `.docx` file read as material (attachment, Ask, search index, "Make") is
  read as written. A Word document whose parts were hidden in the program
  this app is based on sends those parts to the AI provider when you use AI
  on it here. The Word editor's AI panel says it cannot hide anything.
- **The terminal command, its MCP server and the app's own MCP server.**
  `ieumoffice` commands and MCP tools read PowerPoint, Markdown and HTML files
  as written, hidden parts included. What an agent does with that text is
  up to the agent you run.
- **Agent mode.** The program reads files of the project folder straight from
  disk, so hidden parts of those files are sent as they are; so is anything a
  command you allowed reads. Only documents open in the app, read through the
  app's own tools, show hidden parts as their labels, and a PowerPoint
  document with hidden parts is not edited by the agent. The Agent window
  says this before your first session.
- **Three known faults where a mark is lost or not read.** These apply until
  they are fixed:
  - In the PowerPoint editor, if you hide a piece of text that has no
    character formatting of its own, it can be saved without the mark. It
    looks hidden in the open tab, but once you reopen the file, or the file
    is read elsewhere in the app (attachment, Ask, search index, "Make"),
    the text is visible and can be sent to an AI provider.
  - In the Markdown editor, if a part you hide contains inline code, the code
    is saved outside the hidden part. After reopening, or when the file is
    read elsewhere in the app, that code is visible and can be sent to an AI
    provider.
  - A Markdown document saved as `.txt` or `.json` keeps its marks in the
    file, but when you open it again in the Markdown editor, the editor does
    not recognise them and its AI panel sees the hidden text. Read elsewhere
    in the app, the same file stays hidden.

Three more things can cause network traffic that is not a request made by the
app's own features:

- **Install and Sign in buttons.** Install runs the vendor's official install
  command in a terminal window you can see (`irm https://claude.ai/install.ps1 | iex`
  for Claude Code, `winget install OpenAI.Codex` for Codex); the download is
  done by that command, not by the app. Sign in starts the vendor program's
  own sign-in, which opens the vendor's page in your browser.
- **Claude Code and Codex themselves.** They are separate programs from
  Anthropic and OpenAI. The app controls what it hands to them, not what else
  they exchange with their makers; their own terms and privacy policies apply.
- **Documents that point at online content.** An HTML document is a web page:
  when it is shown, it loads whatever online resources its own code refers
  to. Exporting a Markdown document that contains pictures by web address
  downloads those pictures from where they are hosted. The spell checker of
  the Word editor is the one built into the app's browser engine, which may
  download dictionary files from a Google server.

## What IeumOffice never does

- It has no usage analytics and no telemetry: no launch counts, no file
  statistics, and no install identifier that is sent anywhere. To tell which
  PC wrote a project chat, the app makes one random value per installation;
  it is written only in `app-settings.json` and in the chat files of your
  project folders (see **Project folders** below).
- It never reads, copies or stores your Claude or Codex login: not
  `~/.codex/auth.json`, not the Claude credential store, not a session token.
  It has no Claude or ChatGPT sign-in form of its own. It only starts the
  vendor's unmodified program, which signs in by itself. The one sign-in the
  app keeps is its own ChatGPT connection, if you make one: OpenAI's page in
  your browser hands this app a sign-in of its own (OpenAI's "Sign in with
  ChatGPT"), limited to using your ChatGPT plan. It is not the Codex
  program's login, and disconnecting it leaves other programs signed in.
- When it asks those programs whether you are signed in, it keeps only the
  program's version, the kind of login (subscription or billed by usage) and
  the plan name. The account e-mail address the programs report is shown on
  the connection card under Settings → AI and nowhere else, so you can see
  which account is signed in. It is held in memory while the app runs and is
  never stored: not in a settings file, a log or a record, and not in the
  output of a terminal command or an MCP tool. The organisation name the
  programs report is discarded.
- The connection card can sign the vendor's program out, or sign it in with
  another account. Both run the vendor's own command and apply to that
  program on the whole PC, so the app asks you first. It still never sees the
  login itself.
- It asks those programs which models they offer, to show their real names in
  the model list. That question goes to the program on your PC; it is not an
  AI request and sends none of your content.
- It never moves your AI chat to a connection that costs money on its own.
  API-key providers, and a Claude or Codex login that is billed by usage, are
  used only after you choose them yourself.
- It does not start AI requests in the background. A request starts when you
  ask for it on screen: in the AI window, or with a button such as AI page
  reading or document translation, which first shows how many requests will be
  sent, to which provider, and whether you will be charged, and sends nothing
  until you press Start. An unfinished job is never resumed by itself; when
  you open the document again, the app only offers to continue. Requests made
  by a terminal command or an MCP client are requests you (or the agent you
  run) made; those can use a subscription only after you switch that on under
  Settings → AI → Advanced. That switch has no hourly cap: an agent can use as
  much of your subscription as it asks for, including whole documents and
  page images.
- It asks before the AI fetches a web address that has not appeared in the
  conversation, and you can turn the AI's internet tools off altogether.
  Text hidden in a document or a web page could otherwise steer the AI into
  putting your content into an address it fetches. In an editor's AI window,
  an address the AI wants to read or take a picture from is fetched without
  asking only if it already stands, exactly, in your messages or in what a
  tool returned (search results, a page or file it read). Any other address
  is shown to you first, and nothing is fetched unless you press **Allow**.
  Settings → AI Media & Search → **Let AI use internet tools** turns off web
  and image search, image generation and analysis, and fetching by address
  in the editors. Searches are not asked about: a search query goes only to
  the search service.

## Google Drive

Connecting Google Drive is optional and starts only when you press **Connect
Google Drive**. The app asks Google only for the files you choose in Google's
own file picker (`drive.file`), so that it can open them and save your changes
back in place. It cannot see the rest of your Drive. File lists and contents go
directly between this PC and Google; they do not pass through any server of
the project.

Google does not allow Drive data to go to an AI service that uses it to train
its models. Before you can connect, the app therefore asks you to confirm that
model training is off in the AI accounts you use with Drive files, and says
where to turn it off (Claude: Settings → Privacy; ChatGPT and Codex: Settings
→ Data controls → "Improve the model for everyone"). Free AI connections
(Gemini, OpenRouter free models) cannot turn training off, so they are never
given Drive files: attaching from Drive and the AI's Drive reading do not run,
and an AI request from a tab holding a document opened from Drive is refused.

Things the app does with Drive only because you asked: opening a file you
picked, saving a document you opened from Drive, and, while the AI switch is
on, letting the AI in an editor search the files you chose and read them to
answer your request. The AI cannot change, delete, move or share Drive files. Once
content read from Drive is in a chat, the AI stops using web search, image
search, pictures fetched by address and reading a page by address (`read_url`)
in that chat, so that text from a Drive file cannot be carried to those
services.

IeumOffice's use and transfer of information received from Google APIs to
any other app will adhere to the
[Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy),
including the Limited Use requirements. The use of raw or derived user data
received from Google Workspace APIs will adhere to the
[Google Workspace API User Data and Developer Policy](https://developers.google.com/workspace/workspace-api-user-data-developer-policy),
including the Limited Use requirements. The app does not use Drive content to
train AI models, does not sell it, and does not use it for advertising. What
the AI reads from Drive goes to the AI provider you use, under your account
there, as everything else you send to the AI does.

You can remove the app's access at any time with **Disconnect**, or from your
Google Account's security settings.

## Project folders

A project is a folder on your PC that you pick under an AI panel's input
(**Add folder** or **New project**). Picking one is up to you; with **No
project** the AI panel works as before.

What is sent with a project request is in the table above. The app reads the
project's files only inside that folder, never a file you listed in its
`ignore` file, never hidden files, and never a document open with unsaved
changes.

What the app writes into the project folder, in a `.ieumoffice` folder inside
it, and nowhere else in your folders:

- `project.json` (the project's name and identifier), `instructions.md` (the
  instructions you write), `memory.md` (the memory), up to three backups of
  the memory from before you pressed **Tidy up**, `ignore` (files the AI should
  not see), and `chats/` (the project's chats: what you typed, the AI's
  answers, the tools used, and which editor and which PC wrote each one).
- New documents the AI makes in a project are saved in that folder, without
  replacing any file.
- The `.ieumoffice` folder is created only when something has to be written,
  not when you merely pick the folder. Moving or copying the folder takes all
  of this with it. Anyone who can open the folder can read it.

Things to know:

- **What you type can end up in the memory.** The AI writes facts, choices
  and decisions from the chat into `memory.md` on its own, without asking.
  Each time it does, the AI panel shows what it wrote with a **Remove**
  button, and you can see and edit the whole memory in the project's page on
  Home or in any text editor. Parts hidden from AI never reach the AI, so it
  can only write their labels; text you typed into the chat yourself can be
  written down. You can turn memory off per project.
- **Synced folders upload it.** If the project folder is inside OneDrive,
  Google Drive for desktop or a similar synced folder, that service uploads
  the instructions, memory and chats along with your other files. The app
  says so once, the first time you pick such a folder. Files that are only
  online are not downloaded by the app on its own: when the AI wants to read
  one, the app asks you first, and the download is done by that service.
- **A folder from someone else is checked once.** When you add a folder that
  already holds instructions, memory, `AGENTS.md` or `CLAUDE.md` this
  installation did not write, or chats written on another PC, the app shows
  them and asks whether to use them. With **Use without instructions**, none
  of them is sent and chats from other PCs are not listed. After that it does
  not ask again; when instructions or memory change outside the app, the AI
  panel says so once.
- **A folder the app cannot write to** (read-only, removed drive, no
  permission) is still read, but its chats and memory are not saved, and the
  app does not save them anywhere else instead. The AI panel says so.
- **Agent mode** can change files in its project folder, the `.ieumoffice`
  folder included.

What stays on this PC only, in `app-settings.json` in the data folder: the
list of your projects (paths, pinned, last used), your answer to the check
above with fingerprints of the instructions and memory the app last saw,
which project each document uses, and the random installation value.

## Whether your content is used for AI training

IeumOffice does not decide this. When you use a subscription, your content is
sent under your own Anthropic or OpenAI account, and whether it may be used to
train models is set by **your account settings at that company**. Check them
there. The same holds for any API-key provider you add.

## What Claude Code and Codex keep on your PC

- **Agent mode** gives Claude Code and Codex a copy of the skills turned on in
  Settings → Skills and of the project folder's skills, kept in
  `%LOCALAPPDATA%\IeumOffice\agent-skills`, and a temporary folder per session that
  is deleted when the session ends. The program can create and change files in
  the project folder you chose; those are your files and stay there.

- **Claude Code** is started without session persistence, so it does not save
  the conversation to its session files.
- **Codex** is started with conversation-history saving switched off and with
  throw-away (ephemeral) threads. Codex still keeps a diagnostic log database
  of its own on your PC; the project could not inspect what it contains.

## What stays on your PC

Nothing in this list is uploaded by the app.

- **Your documents**, wherever you save them, together with the helper files
  some editors keep next to a document.
- **AI chat history**, kept in the app's data folder
  (`%APPDATA%\IeumOffice`). Chats in a project are kept in that project folder
  instead (see **Project folders**); a synced project folder is uploaded by
  its sync service.
- **Your Google Drive sign-in**, if you connected Drive (`google-drive.json`
  in the data folder), encrypted with the system's protection for your user
  account (Windows' own protection, the macOS keychain, or on Linux a desktop
  keyring such as GNOME Keyring or KWallet). It is deleted when you
  disconnect. If this PC cannot encrypt it (on Linux, also when no keyring
  holds the key), it is not saved and the connection lasts until the app
  closes.
- **Drive files you attached to an AI chat**, in a temporary folder
  (`ieumoffice-drive-attach`), deleted after a week.
- **Copies of the Drive files you opened** (`drive-cache` in the data
  folder), with a list linking each copy to its Drive file. They are your
  document content, as plain files. A copy you have not opened for a month
  and that holds no change still to be uploaded is deleted when the app
  starts.
- **Your ChatGPT connection**, if you connected ChatGPT in the app
  (`chatgpt-connection.json` in the data folder): the sign-in OpenAI gave this
  app, encrypted the same way as the API keys below, plus an ID for this
  installation and for your account at OpenAI. No e-mail address is stored.
  Disconnecting asks OpenAI to end the sign-in and deletes it here. You can
  also see and limit what the app uses, or disconnect it, in ChatGPT's
  settings (Usage).
- **Settings, including any API keys you entered**
  (`ai-settings.json` in the same folder). On Windows the keys are encrypted
  with your Windows account (DPAPI), and on Linux with your desktop keyring
  (GNOME Keyring or KWallet), so a copy of the file on another PC or another
  account does not show them; programs running under your own account can
  still open them. On macOS, and on Linux without a keyring, they are stored
  as plain text, so anyone who can read your user profile can read them. The read-only GitHub
  token used to read private GitHub files is stored the same way and is sent
  only to `api.github.com`.
- **The record that you accepted a login billed by usage**, kept in the same
  folder. It is cleared when the kind of login changes or you sign out.
- **The automatic-call ledger**: the times of subscription requests made by
  terminal commands and MCP clients during the last hour, shown as a count by
  the `capabilities` command. It holds no content.
- **The PDF result store** (`pdf-store` in the data folder): the text the AI
  read from PDF pages, translations together with the provider and model that
  made them (and your own edits of translated paragraphs), passage cards (the
  passage you selected, where it is, and the AI's explanation or translation),
  AI highlight suggestions with their categories and whether you accepted or
  dismissed them, document overviews, and the progress of unfinished jobs, so
  that a stopped job can continue, the editor can show them again and
  conversions can use them. This is document content, kept as plain,
  unencrypted files until you delete it; terminal commands use the same
  folder. Translations of EPUB books (the translated text of their chapters,
  title and contents labels, with the provider and model) are kept in the same
  folder, keyed by a fingerprint of the book file. Delete it all under
  Settings → General → **Saved AI results** → **Delete all**, or one
  document's share with **Delete this document's stored AI results** in the
  PDF editor.
- **The links between PDFs and their notes** (`note-links.json` in the
  `pdf-store` folder): for each PDF you linked to a Markdown note, the PDF's
  file path, the note's file path, a fingerprint of the PDF's content and a
  time. It is keyed by the PDF's path so that the note is found again after
  you save the PDF. **Delete all** above removes it as well; deleting one
  document's stored AI results does not. The notes themselves are ordinary
  files where you saved them and are never deleted by the app.
- **View settings of the PDF editor's reading tools** (whether passage marks,
  the highlight preview and the overview section are shown, and the width and
  text size of the translation column), kept by the editor. They hold no
  document content.
- **Recovery copies of documents you have not saved**, so that unsaved work
  survives a crash, a power cut or the PC shutting down. While a document has
  unsaved changes, every editor (Word, Excel, PowerPoint, PDF, Markdown,
  HTML, mind map and HWP) keeps one latest copy of it in a folder of the data
  folder named after the editor (`docs-autosave`, `sheets-autosave`,
  `slides-autosave`, `pdf-autosave`, `markdown-autosave`, `html-autosave`,
  `mindmap-autosave`, `hwp-autosave`). A copy holds what saving the document
  at that moment would have written, so it is your document content, kept as
  a plain file. Next to it is a small note with the document's file path, its
  tab title and when the copy was made. Documents you have never saved get
  their copies there as well; the app does not create files in your own
  folders for them. Your original file is not changed until you save. A copy
  is deleted when you save the document, close it with **Don't Save**, choose
  **Discard** when the app offers it back, or close the document with no
  unsaved changes, and any copy left untouched for 30 days is deleted when
  the app starts. Password-protected Word and PowerPoint documents get a copy
  locked with the same password; password-protected Excel, HWP and PDF files
  get no copy at all, so no unlocked content of them is kept. The PDF editor
  works on a file, so when it brings back a PDF that was never saved it also
  places the restored copy as a working file in the operating system's
  temporary folder (`genoffice-pdf-recovery`). That file is your document
  content as well, kept as a plain file; it is removed when the tab closes or
  the document is saved, and leftovers older than a day are removed when the
  app starts.
- **The session record** (`session-record.json` in the data folder): the
  kind, file path and title of each open document tab, their order, which tab
  was in front, the split view, and whether the app was closed normally or
  restarted to install an update, so that the tabs can come back after the app
  or the PC shuts off unexpectedly, and after an update.
  It holds no document content and is never sent anywhere.
- **The search index** of the folders you added to the home screen,
  recent-file lists and local diagnostic logs, also in the data folder.
- **Records of which documents were made from which files**
  (`document-links.json` in the data folder), written when a document made
  with "Make a new document" is first saved, and only if its tab actually
  made something: an AI run started there with at least one of the handed-over
  files attached, or a conversion without AI was done there. They hold the
  file paths, the
  time and whether AI was used, not your request. Nothing is written into
  the documents themselves, and the records do not travel with a file to
  another PC.
- **The crash record** (`crash-log.jsonl` in the data folder): one line each
  time an editor's page process, the graphics process or another helper
  process ends abnormally, or the app meets an unexpected error, and one line
  when the PC runs short of memory while an AI request is running (at most
  every 10 minutes). A line holds the time, what ended, the reason word
  Chromium reports (such as `crashed` or `oom`), the exit code, which editor it
  was (such as `docs`), and memory figures in whole megabytes: the app's own
  memory use, the PC's free and total memory, and how many AI requests and AI
  programs were running. It holds no document text, file names, paths or
  error messages, and it is kept under
  64 KB by dropping the oldest lines. The app never sends it anywhere; if you
  report a problem, you can attach it yourself. No crash dumps are written.
- **The spreadsheet save-failure record** (`sheets-save-failures.jsonl` in
  the data folder): one line each time a spreadsheet save could not be opened
  back and your file was therefore left as it was. A line holds the time, the
  app version, what kind of file the tab was opened from (such as `xlsx` or
  `csv`), the size of the result that failed, and the reason in a few words
  (such as which part of the workbook the engine could not read), with any
  file path replaced by `<path>`. It holds no cell contents, and it is kept
  under 64 KB by dropping its older half. The app never sends it anywhere; if
  you report a save problem, you can attach it yourself. The same short reason
  is shown at the end of the save error message.
- **The update record** (`update-log.txt` in the data folder): what the
  installed app's updater did, one line each time — the checks, downloads and
  the installer it started (silently or in the installer's own window). A line
  holds the time, version numbers, the release download addresses and the
  paths of the downloaded installer and of the app, which include your Windows
  user name. It holds no document content. It is kept under 256 KB by dropping
  its older half, and the app never sends it anywhere. Next to it,
  `update-install-attempt.json` remembers the last installer start (the
  version it was for, the version that started it, how, and how many tries in
  a row it was) so the next launch can tell you when an update did not install.
- **Your skills** (`~/.ieumoffice/skills`): the skills you added or made.
  A template you save with a skill is a copy of your document, kept in the
  skill's folder (`assets/`); it holds whatever that document held, so use
  **Make a blank template** to clear names and other filled-in values first.
  A skill exported as a zip carries its template documents with it. Removing
  a skill moves it to the system trash. Which skills are on is kept in
  `app-settings.json` in the data folder.
- **The command-line audit log** (`~/.ieumoffice/cli-audit.jsonl`): one line
  per `ieumoffice` command with the time, the arguments, the result and the
  output path. Set `GENOFFICE_AUDIT_LOG=off` to disable it.

Uninstalling the app does not necessarily delete these folders; remove them
yourself if you want them gone.

## Builds from source and forks

This page describes the code in this repository. A build that someone else
made from modified code can behave differently; the party that distributes it
is responsible for saying so.

## Questions

Open an issue at
[github.com/pblsketch/openoffice/issues](https://github.com/pblsketch/openoffice/issues).
For a suspected security problem, follow [SECURITY.md](SECURITY.md) instead.
