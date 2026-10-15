# IeumOffice

[한국어](README.md) · **English**

IeumOffice (이음오피스) is a free, open-source desktop office suite. It opens
and edits Word, Excel, PowerPoint, PDF, Markdown and HTML documents and mind
maps in one window, and its AI works on the document itself instead of
answering in a chat box beside it.

The AI runs on **the Claude or Codex subscription you already pay for**. You
do not create an API key and you do not pay IeumOffice anything. Without a
subscription you can connect a **free AI** (OpenRouter or Google Gemini).

IeumOffice is a modified version of the open-source project
[GenOffice](https://github.com/genspark-ai/genoffice) (see
[License and acknowledgement](#license-and-acknowledgement)).

## Contents

- [What works today](#what-works-today)
- [Connecting your subscription](#connecting-your-subscription)
- [Using it for free, without a subscription](#using-it-for-free-without-a-subscription)
- [What the app never does with your login](#what-the-app-never-does-with-your-login)
- [What it costs](#what-it-costs)
- [Images, pictures and search](#images-pictures-and-search)
- [Terminal command, MCP and agent skill](#terminal-command-mcp-and-agent-skill)
- [Download and install](#download-and-install)
- [macOS (Apple Silicon, internal)](#macos-apple-silicon-internal)
- [Updates](#updates)
- [Building from source](#building-from-source)
- [Known limitations](#known-limitations)
- [Planned, not available yet](#planned-not-available-yet)
- [Privacy](#privacy)
- [Contributing and reporting problems](#contributing-and-reporting-problems)
- [License and acknowledgement](#license-and-acknowledgement)

## What works today

- **Editors in one tabbed window**: Word (`.docx`), Excel (`.xlsx`),
  PowerPoint (`.pptx`), PDF, Markdown, HTML and mind maps. Files are opened
  and saved in their real formats on your own PC; edits are written back as narrow changes
  to the original file, so the parts you did not touch are kept as they were.
- **An AI panel in every editor.** You ask in plain words, and the AI changes
  the document through the app's own editing tools. You see what was changed
  and you can undo it.
- **PDF**: edit text on the page and convert a PDF to Word, Excel or
  PowerPoint on your PC.
- **Slides from a request**: the deck is generated on your PC.
- **Mind maps**: opens and saves XMind files (`.xmind`) in place. Elements the
  editor does not show are kept when you save, and a map you did not change is
  saved byte for byte as it was. Several sheets, themes, export to a picture,
  PDF or Markdown outline, and printing.
- **New documents from your documents**: start "Make a new document" from a
  starred group on the home screen, from files you picked, or from an
  editor's File menu, and the material is turned into a PowerPoint deck, an
  HTML page or a mind map. The AI of the editor for the new document writes
  it. Maps and Markdown convert into each other, and a map into a slide
  outline, without AI. File → View Sources shows which files a document was
  made from; that record stays on your PC.
- **Search across your documents** from the home screen, indexed on your PC.
- **A terminal command (`ieumoffice`), an MCP server and an agent skill**, so a
  coding agent can read, create and edit the same files.
- **21 interface languages.** Korean and English were written by hand; the
  other 19 are machine translations.

Released and verified on **Windows**. An unsigned Apple Silicon disk image is
available from [macOS (Apple Silicon, internal)](#macos-apple-silicon-internal).

## Connecting your subscription

IeumOffice does not sign you in to anything. It starts the Claude Code or
Codex program that is installed on your PC and already signed in by you, hands
it your request, and reads the answer. What you need:

1. A Claude subscription or a ChatGPT subscription of your own.
2. **Claude Code** or **Codex** installed on the PC, and signed in.

The first-run guide and **Settings → AI → Subscription connection** show the
state of each program and offer a button for the step that is missing:

- **Install** runs the vendor's official install command in a terminal window
  you can watch. The app does not download an installer itself.
  - Claude Code: `irm https://claude.ai/install.ps1 | iex`
  - Codex: `winget install OpenAI.Codex`
- **Sign in** starts the program's own sign-in (`claude auth login`,
  `codex login`). The sign-in page that opens belongs to Anthropic or OpenAI,
  not to this app.

With **AI to use** left on _Automatic_, the app uses Claude when it is
connected and Codex otherwise. You can pick one yourself in the same place or
in the model picker of the AI panel. Claude Code 2.1.248 or newer is required;
an older one is reported as needing an update.

## Using it for free, without a subscription

The first-run guide and **Settings → AI → Use for free** connect a free AI.

- **OpenRouter**: press **Connect in browser**, sign up or sign in to
  OpenRouter in the browser that opens, and allow access. There is no key to
  copy. Only free models are used, and the card shows how many free requests
  are left today.
- **Google Gemini**: **Get a key** opens Google AI Studio, where you make a
  key; paste it and press **Connect**. Only for people aged 18 or older. A key
  from a Google project with billing turned on can be charged.

Once connected, that AI becomes the **AI to use**. Free models are weaker than
the subscription ones and have a daily limit (one edit of a document takes
several requests). When it runs out, the app says so and when it frees again.
While you use it for free, what you send may be used to improve that
company's AI, so take care with documents that hold personal information.

The subscription program is only the "brain". Editing the document, showing
the changes and undoing them are done by the app. The program is started in an
empty temporary folder with its own tools switched off, and a Claude run is
refused if the program reports that any tool is still available.

## What the app never does with your login

- It never reads, copies or stores your Claude or Codex login: not
  `~/.codex/auth.json`, not the Claude credential store, not a session token.
- It has no Claude or ChatGPT sign-in form of its own. Signing in always
  happens in the vendor's program and on the vendor's page.
- It never modifies or wraps the vendor programs. They run as distributed.
- It never pays for, resells or relays anyone's AI usage. Your usage is billed
  to your own account by Anthropic or OpenAI.
- It never starts an AI request in the background. A request starts when you
  ask for one.
- It never leaves a vendor program running after you cancel a request or quit
  the app.

## What it costs

IeumOffice itself is free. What the AI costs depends on the connection:

| Connection                                                                                     | Cost                                                                     | When it is used                                                 |
| ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | --------------------------------------------------------------- |
| Claude or Codex signed in with a **subscription**                                              | Nothing beyond the subscription; requests count against its usage limits | By default (_Automatic_)                                        |
| Claude or Codex signed in in a way that is **billed by usage** (an API key, a metered account) | You pay the vendor for what you use                                      | Only after you read the warning and choose **Use anyway**       |
| An **API-key provider** set up under **Settings → AI → Advanced**                              | You pay that provider for what you use                                   | Only while you have chosen it yourself under **AI to use**      |
| OpenRouter or Gemini connected under **Settings → AI → Use for free**                          | Nothing within the free limit                                            | Once connected, or while you have chosen it under **AI to use** |

The app never moves your AI chat to a connection that costs money on its own.
When a subscription runs out of its limit, or a login expires, the request
stops and says why (with the time the limit resets, when the program reports
it). If your other subscription is connected you get a button to continue with
it; nothing switches by itself. From 80% of a usage limit on, the AI panel
shows how much is used and when it resets.

One thing to know before choosing Codex: **using a Codex subscription inside
an app is not a method officially recommended by OpenAI.** Whether and how you
may use a subscription this way is a matter between you and Anthropic or
OpenAI, and their terms can change.

## Images, pictures and search

- **Image generation is key-based only in this version.** It works after you
  enter the key of an image provider under **Settings → AI → Advanced**.
  Generating images with a Codex subscription is not included. Without an
  image provider, slides use pictures found by search instead.
- **Looking at pictures**: a picture you attach is shown to the AI you are
  using, subscription included. Video and sound analysis need a key-based
  provider that supports video.
- **Web and image search are free by default** and need no key: Parallel's
  free search, then DuckDuckGo. A key-based search provider can be chosen
  under Advanced.

## Terminal command, MCP and agent skill

The installer puts an `ieumoffice` command on the PATH (open a new terminal
after installing). It reads, creates, converts and edits the same file types
without opening a window:

```bash
ieumoffice --version
ieumoffice info report.docx --json
ieumoffice convert report.md --to pdf
ieumoffice create --type docx --from notes.md --out notes.docx
ieumoffice docs read report.docx --range 0-9 --json
ieumoffice open report.docx
```

`ieumoffice help` lists every command; the full reference is
[packages/cli/README.md](packages/cli/README.md).

- **Agent skill.** **Settings → Integrations** lists the coding agents found
  on the PC and installs the `ieumoffice` skill into the ones you choose. From
  a terminal: `npx skills add pblsketch/openoffice`.
- **MCP server.** `ieumoffice mcp` serves the same commands as Model Context
  Protocol tools. The same settings page shows ready-made snippets, for
  example `claude mcp add --transport stdio ieumoffice -- ieumoffice mcp`.

Document commands run entirely on your PC. Only `search`, `image` and `media`
send anything out, through the same routes as the app.

**Requests that arrive this way do not use your subscription unless you allow
it.** A terminal command or an MCP tool call is made by a program, not by a
person looking at the screen, and neither Anthropic nor OpenAI recommends
letting a program use a subscription automatically; an account may be
restricted for it. So **Settings → AI → Advanced → Let automatic requests use
a subscription** is off by default. While it is off, these requests use a key
provider if you set one up and are otherwise answered with "unavailable".
While it is on, they run one at a time, with no hourly limit.
`ieumoffice capabilities --json` reports what is available and by which route.

IeumOffice can be installed next to GenOffice. It registers only its own names
(`ieumoffice`, `~/.ieumoffice`) and does not read or change GenOffice's.

## Download and install

Installers are published on the
[Releases page](https://github.com/pblsketch/openoffice/releases) as
`IeumOffice-Setup-<version>.exe`, for 64-bit Windows 10 and 11. If that page
is still empty, no release has been published yet; build from source instead.

**The installer is not code-signed.** Windows will warn that the publisher is
unknown, typically with a "Windows protected your PC" window in which you
choose **More info → Run anyway** (the wording differs between Windows
versions). Download the installer only from the Releases page of this
repository.

## macOS (Apple Silicon, internal)

An unsigned, un-notarized Apple Silicon (arm64) disk image is built by GitHub
Actions. It is for internal use, not the Windows release, and it is not
code-signed.

1. Open the **Actions** tab of this repository and choose the **macOS arm64**
   workflow.
2. Run it with **Run workflow**.
3. When the run finishes, download the **IeumOffice-mac-arm64** artifact. The
   file inside is `IeumOffice-<version>-arm64.dmg`.

Open the disk image and copy `IeumOffice` to the Applications folder. macOS
blocks the first launch because the app is unsigned. Do not double-click it.
In Applications, **right-click IeumOffice and choose Open**, then confirm. Or
clear the quarantine attribute in Terminal:

```bash
xattr -cr /Applications/IeumOffice.app
```

Launched from Finder, the app still finds Claude Code and Codex. It reads the
login shell's PATH and also looks in `/opt/homebrew/bin`, `/usr/local/bin`,
`~/.local/bin` and `~/.npm-global/bin`. The name in the window, the Dock and
the menu bar is IeumOffice.

This disk image is not installed by the in-app updater. Using the app on macOS
still has to be checked after this workflow produces the image.

## Updates

The installed app looks at this repository's GitHub Releases shortly after it
starts and every four hours after that, and offers the new version in an
update window. If there is no release, no network or the check fails, nothing
happens and the app keeps working. To check yourself, use **Help → Check for
Updates…** in the app menu. Pre-release versions are offered only when you
choose the beta channel under **Settings → About**.

## Building from source

You need Node 22.12 or newer (npm 10 or newer) and a Rust toolchain with
`cargo` on the PATH (for the spreadsheet engine).

```bash
git clone https://github.com/pblsketch/openoffice.git
cd openoffice
npm install
npm run dev      # all editors and the shell, against development servers
npm run shell    # or: build everything, then run the app
```

To make the Windows installer (also needs the Windows 10/11 SDK):

```bash
npm run native:build -w @genoffice/sheets
# copy apps/sheets/native/xlsx-engine/target/release/xlsx-sidecar.exe
#   to apps/sheets/native/xlsx-engine/target/x86_64-pc-windows-gnu/release/
npm run dist:win -- -- --publish never
```

To make the Apple Silicon disk image on a Mac (Xcode command-line tools and
the `aarch64-apple-darwin` Rust target):

```bash
rustup target add aarch64-apple-darwin
npm run dist:mac -- -- --publish never
```

The image is `apps/shell/release/IeumOffice-<version>-arm64.dmg`. It is not
signed. An Intel package is not produced.

The Windows installer appears in `apps/shell/release`. The details, including the
checks a change must pass, are in [CONTRIBUTING.md](CONTRIBUTING.md); the
release procedure is in [docs/releasing.ko.md](docs/releasing.ko.md) (Korean).

Package names and environment variables inside the code still say `genoffice`
/ `GENOFFICE_`. That is deliberate: it keeps engine fixes from the upstream
project easy to take.

## Known limitations

- **The verified release is Windows.** An unsigned Apple Silicon disk image
  is built from Actions, as described above. It is not notarized and it is
  not installed by the in-app updater. Linux packages are not built.
- **Unsigned installer**, as described above.
- **A subscription answers a little later than an API key.** Each request
  starts the vendor's program first, so the first words take a few seconds to
  appear (about four seconds with Claude on the development PC).
- **Codex cannot be told to ignore all of your personal Codex settings.** The
  app overrides what it can (your MCP servers, hooks and plugins are switched
  off), but Codex still adds `~/.codex/AGENTS.md` to the conversation, and
  settings the app does not override still apply. The app switches off Codex's
  conversation history, but Codex keeps a diagnostic log of its own.
- **Any ChatGPT login shows as connected**, a free plan included. What it can
  actually do is decided by that plan.
- **Usage display for Codex** appears only when Codex reports a five-hour or
  seven-day limit.
- **Proxies.** The app's own requests (search, key providers, update checks)
  follow the proxy environment variables or the Windows proxy setting. Claude
  Code and Codex are separate programs: they see only the proxy environment
  variables (`HTTPS_PROXY` and the like), not a proxy that is set in Windows
  alone.
- **Image generation needs a key**, as described above.
- **Translations.** 19 of the 21 interface languages are machine-translated
  and have not been reviewed by native speakers.
- **Hiding does not reach everywhere.** Parts you hid from AI in the
  PowerPoint, Markdown and HTML editors stay hidden when the file is attached
  in another editor or asked about on the home screen, but hiding marks in
  Word documents are not recognised, and the terminal command and MCP read
  files as written. Until they are fixed, hidden text can also reach AI in
  these cases: in PowerPoint, hidden text with no character formatting of its
  own can be saved without the mark; in Markdown, inline code inside a hidden
  part is saved outside it; and a Markdown document saved as `.txt` or `.json`
  shows its hidden text to the Markdown editor's AI when reopened there.
  [PRIVACY.md](PRIVACY.md) has the details.
- **Old XMind 8 files** (with only `content.xml` inside) and password-protected
  mind maps do not open.
- **Updating from a real GitHub release had not been exercised end to end**
  when this was written, because no release existed yet.

## Planned, not available yet

These belong to a later stage and are **not in the app today**:

- Making Word and Markdown documents with AI (today: PowerPoint, HTML and mind
  maps).
- Importing old XMind 8 files.
- Showing a theme chosen in XMind with a similar look (today such a map is
  drawn with the default look, and the file's theme is left as it is).
- Mind maps in the terminal command (`ieumoffice`).

## Privacy

IeumOffice has no server of its own and no usage analytics. Your documents
stay on your PC. When you use AI, the document content and the conversation go
to Anthropic or OpenAI under your own account (or to the company whose API key
you entered), and whether they are used for training is decided by your
account settings there. Search queries go to Parallel and DuckDuckGo by
default, and update checks go to GitHub. The full list is in
[PRIVACY.md](PRIVACY.md).

## Contributing and reporting problems

- Bugs and requests:
  [GitHub Issues](https://github.com/pblsketch/openoffice/issues).
- Security problems: report them privately as described in
  [SECURITY.md](SECURITY.md), not as a public issue.
- Code: see [CONTRIBUTING.md](CONTRIBUTING.md) and the
  [Code of Conduct](CODE_OF_CONDUCT.md).

## License and acknowledgement

IeumOffice is licensed under the [Apache License 2.0](LICENSE).

**IeumOffice is based on [GenOffice](https://github.com/genspark-ai/genoffice)**,
the open-source office suite by Genspark (Mainfunc, Inc.), which is also
licensed under Apache-2.0. The document engines and editors come from that
project; IeumOffice changes how the AI is connected, removes the parts tied to
Genspark's services and renames the product. The original copyright notices
are kept, and [NOTICE](NOTICE) records the attribution and the fact that this
is a modified version.

The slide design templates are re-authored from the designs in
[frontend-slides](https://github.com/zarazhangrui/frontend-slides) (MIT
License), and their fonts are all licensed under the SIL Open Font License
1.1; [NOTICE](NOTICE) carries the notice and the font list. The templates'
Korean font pairings referred to [k-slide](https://k-slide.web.app).

IeumOffice is an independent project. It is not affiliated with, sponsored by
or endorsed by Genspark / Mainfunc, Inc., Anthropic or OpenAI. "GenOffice" and
"Genspark", and their logos, are trademarks of their owners; so are "Claude",
"Codex" and "ChatGPT". They are named here only to say what this software is
based on and what it works with.
