# @genoffice/cli

`ieumoffice` is the IeumOffice command line. It exposes the suite's document engines
to scripts and AI agents without opening a window: the packaged app runs the
bundled CLI on its own Node runtime (`ELECTRON_RUN_AS_NODE`), so nothing extra
has to be installed.

The names registered on a PC are the product's own and are defined once in
`src/names.ts`: the `ieumoffice` command, the `ieumoffice` MCP entry and agent
skill, and the `~/.ieumoffice` folder. Internal names keep the upstream
spelling: this package (`@genoffice/cli`), the bundle (`genoffice.cjs`) and the
`GENOFFICE_*` environment variables. Nothing here reads or changes what an
installed GenOffice registered under its own names.

```
ieumoffice info report.docx
ieumoffice convert scan.pdf --to docx
ieumoffice convert data.csv --to xlsx --out out/data.xlsx
ieumoffice open report.docx
ieumoffice convert scan.pdf --to pptx --json
ieumoffice guide slides                         # op groups; `ieumoffice guide slides insert` for one group, `ieumoffice guide slides setText` for one op
ieumoffice slides read deck.pptx [--full] --json # durable ids + geometry an agent targets ops at; --full: whole text, tables, notes; text elements add `effective` (displayed style of the first run + `src` = the inheritance layer each value comes from)
ieumoffice slides read deck.pptx --units in --json # box and size in inches (or cm, pt, px at 96 dpi) with `unit` named; default emu
ieumoffice slides read deck.pptx --comments --json # each page's stored comments ({authorId, idx, author, dt, text}) and hidden: true, from the saved file
ieumoffice create --type pptx --ops deck.json --out deck.pptx
ieumoffice guide slides templates               # built-in design templates, one line each (id, name, scheme, description, fonts); --json: detail.templates
ieumoffice guide slides templates coral > deck/style.md   # one template's style sheet, saved as the deck's style.md as is
ieumoffice create --type pptx --spec deck/pages --outline deck/outline.json --out deck.pptx   # one page spec file per slide (`ieumoffice guide slides design|spec`)
ieumoffice create --type pptx --spec deck.json --out deck.pptx --render deck/previews --audit   # plus one PNG per slide (detail.previews) and the geometry audit (detail.audit) in the same call
ieumoffice slides check deck/outline.json | deck/pages/03.json   # outline rules (exit 1 on errors) / build + audit one page file
ieumoffice slides replace deck.pptx --slide 2 --spec deck/pages/03.json   # rebuild one slide from its page file
ieumoffice slides apply deck.pptx --ops edit.json [--dry-run] [--out copy.pptx]
ieumoffice slides audit deck.pptx [--slide 0] --json            # out_of_bounds / off_slide / text_overflow / text_overflow_width / overlap / picture_distorted: typed issues with durable ids and a setTransform `suggest` where geometry fixes it
ieumoffice slides render deck.pptx --out shots/ [--scale 2]     # one PNG per slide through the app's PDF export
ieumoffice render report.docx|book.xlsx|page.html|file.pdf --out shots/ [--page 3] [--scale 2]   # one PNG per page of any document, to look at what was made
ieumoffice render deck.pptx --out shots/ --el e_12 [--pad 16]   # plus the page cropped to that element (<stem>-NN-e_12.png)
ieumoffice render deck.pptx --out shots/ --grid [--cols 4] [--tile 320]   # plus <stem>-grid.png: every page on one contact sheet
ieumoffice create --type xlsx --from table.json --out book.xlsx   # 2-D array or {sheets:[{name,rows}]}; "=..." cells are formulas
ieumoffice create --type xlsx --from data.csv --out data.xlsx [--header] [--decimal ,]   # ISO dates become real dates; sep= lines are honoured
ieumoffice sheet read book.xlsx [--sheet Data] [--range A1:D20] [--formats] --json   # values, formulas, sheet features; --formats adds styles, widths, heights
ieumoffice sheet apply book.xlsx --cells cells.json    # [{cell:"B2", value|formula, style?, sheet?}]
ieumoffice sheet apply book.xlsx --ops ops.json [--dry-run]   # workbook DSL: cells, formats, charts, tables, filters, conditional formats, validation, links, notes, panes, page setup, sheets (`ieumoffice guide sheets`)
ieumoffice sheet check book.xlsx --json                # formula errors, missing-sheet references, broken defined names, chart ranges off the data, ### columns (suggest: set_col_width), placeholder text, existing rules; exit 0
ieumoffice create --type docx --from report.md --out report.docx      # or --from fragment.html (restricted HTML)
ieumoffice convert notes.md --to docx|html
ieumoffice convert report.docx --to html               # the Word editor's standalone-HTML export
ieumoffice convert page.html --to docx                 # html2docx, same as the HTML app's Export as Word
ieumoffice convert report.docx --to md                 # GFM via the markdown editor's serializer
ieumoffice convert book.xlsx --to csv [--sheet Data]   # one sheet, cell text as displayed, UTF-8 BOM, CRLF
ieumoffice convert form.odt --to docx|pdf|md|html      # through the ODT bridge docx (pdf/html: a temporary docx the app exports, always deleted)
ieumoffice convert report.docx --to odt                # also md→odt and html→odt; warnings[] odt_converted / odt_dropped + detail.odt_report
ieumoffice capabilities --json                        # which of search, image generation, image/video analysis and the PDF AI jobs work here and by which route (free, key, subscription); no model call
ieumoffice search "electron headless export" [--images] [--max 6] --json
ieumoffice read-url https://example.com/guide.md [--offset 50000] --json   # the readable text of an http(s) page (article, document, skill); the address goes to that site; private GitHub files use the app's read-only token
ieumoffice image "isometric office, soft light" --aspect 16:9 --out hero.png
ieumoffice media photo.jpg --ask "What text is in this picture?" --json
ieumoffice docs read report.docx [--range 0-9] [--html] [--full] [--comments] [--revisions] [--header-footer] --json   # blocks (--full: whole text), comment threads, tracked changes, header/footer text
ieumoffice docs apply report.docx --ops ops.json [--dry-run]           # apply_ops entries + insert_content / replace_blocks / insert_image / insert_chart / edit_chart / set_header_footer / reply_comment / resolve_comment
ieumoffice docs check report.docx --json                               # fields without results, broken bookmark references, stale TOC, missing images, empty charts/headings, heading level skips, placeholder text, pending revisions, open comments; exit 0
ieumoffice docs apply form.odt --ops ops.json         # an .odt is written back as .odt (narrow patch); --out keeps .odt; comment / tracked-change / TOC / equation / chart / text box / column / watermark ops → unsupported, locked cells and locked objects → op_rejected
ieumoffice merge invoice-template.docx --data values.json --out invoice.docx [--force] [--strict]   # fill {{key}} placeholders in a docx/pptx/xlsx template; reports used, unused and unresolved keys (or --data '{"name":"Ada"}')
ieumoffice pdf read scan.pdf [--page 3 | --range 1-5] [--full] --json     # text layer page by page (pages 1-20 by default, 4000 characters each) with page sizes and metadata; headless pdfium, no app process
ieumoffice pdf read book.pdf --structured --range 1-5 --json   # same shape, each page's text from the document tree: headings, lists, tables, captions, footnotes (detail.structured: true)
ieumoffice convert book.pdf --to md [--pages 1-5,8]            # reflowed Markdown, pictures in assets/ beside it
ieumoffice convert book.pdf --to epub --title "Field Notes" [--no-cover]   # EPUB 3; title and author from the PDF unless given
ieumoffice pdf images book.pdf --out pictures/ [--pages 2-4] --json   # the pictures on the pages as <name>-p<page>-<n>.png (detail.images[]: page, file, width, height)
ieumoffice pdf ai-read scan.pdf --pages 1-3 --json             # estimate only: detail.estimate { calls, pages, provider, route, metered }; nothing is sent
ieumoffice pdf ai-read scan.pdf --pages 1-3 --yes [--allow-paid] --json   # send the page images, one request per page; --allow-paid when the route bills per request
ieumoffice pdf translate book.pdf --to ko --format pdf,md --yes --json   # book.ko.pdf + book.ko.md beside the source; progress on stderr
ieumoffice pdf translate book.pdf --to de --format md,epub --bilingual --out out/book --partial --restart --yes --force   # each paragraph followed by its translation; --partial writes what is done when the job stops, --restart starts over (keeping paragraphs edited in the app)
ieumoffice pdf status book.pdf --json                          # what the result store holds: pages read by AI, translations, each with its job
ieumoffice hwp read notice.hwp [--offset 20000] [--full] --json           # text of a Hangul (HWP / HWPX) document, tables as "a | b" rows (first 20000 characters by default); read-only, no app process
ieumoffice guide docs                                                   # op signatures + restricted-HTML rules (`guide <domain> --json` = the catalog with each op's schema and a fingerprint)
ieumoffice selection report.docx --json   # what the user has selected in the editor showing the file
ieumoffice skill list   # coding agents found on this machine and the skill version each has
ieumoffice skill install --dir ./skills --force   # copy the bundled skill into a skills directory
ieumoffice install-cli   # put ieumoffice on the PATH
ieumoffice mcp --http 3000 [--host 127.0.0.1] [--token secret]   # Streamable HTTP for clients on other machines; omit --http for stdio
ieumoffice mcp --compact-schemas   # advertise ops/cells/data as plain arrays instead of the per-op schema (smaller tools/list; also GENOFFICE_MCP_COMPACT_SCHEMAS=1)
ieumoffice mcp install all   # register the stdio server with every coding agent found (or one: claude-code, codex, cursor, gemini, copilot, opencode, windsurf)
ieumoffice mcp list          # each agent's MCP config and whether ieumoffice is registered; `mcp uninstall <agent>` removes the entry
```

Word and Markdown commands run the docs and markdown editors under jsdom (installed once per process, loaded lazily). Those modules are imported from the app renderers by relative path until they move into packages of their own.

Workbook writes go through `@genoffice/xlsx-gateway` (the app's save path). The in-memory workbook validates and applies the cell, format and structure ops; ops the snapshot cannot hold (charts, images, tables, filters, conditional formats, validation, hyperlinks, notes, panes, page setup, protection, defined names, tab order) become the gateway's declarative save payloads, as the app's edit journal does. `add_pivot` and `add_sparkline` run headless too; only `refresh_pivot` and edits to objects created in an editor session (`add_table_row` / `add_table_column`, `delete_table_row` / `delete_table_column` / `delete_table`, `edit_shape`, `delete_visual`) are refused headless. After writing formulas ieumoffice evaluates them with the xlsx sidecar and stores the results as cached values, so `sheet read` and plain readers see numbers, not blanks.

`create`/`slides apply` take the same ops the in-app AI uses (`@genoffice/pptx-ops`), as a JSON array or `{ "ops": [...] }`; `--ops -` reads stdin. Image ops accept a local file path in their `bytes` field. A rejected op comes back with the guided error and its usage line so the caller can fix and retry; atomic transactions leave the file untouched.

`create --type pptx --spec` is the CLI end of the app's deck generation pipeline (`@genoffice/pipelines`): the caller's agent does the design work following `ieumoffice guide slides design`, writing the style sheet, the outline and one page spec file per slide (`ieumoffice guide slides spec`), and the same page builder the app uses turns them into a pptx, measuring every text box and growing it to its content. Where the app separates the stages into model calls, the CLI separates them into files: `slides check` validates the outline against the planning rules and builds and audits a single page file, then checks it against its outline entry and the style sheet's palette (both found beside the page files), `create --spec <dir>` runs the same checks on every file and refuses to assemble a deck with pages missing or disagreeing with the outline, and `slides replace` rebuilds one slide from its file. `slides audit` runs the app's deterministic layout audit; `slides render` gives the agent PNGs to look at. No model call happens inside ieumoffice.

In Windows PowerShell 5.1, `>` writes UTF-16, and `slides check` then finds no palette in the saved style sheet. Save it with `ieumoffice guide slides templates coral | Out-File -Encoding utf8 deck/style.md` there, or run the command in a shell that writes UTF-8.

Every command prints a one-line human summary by default or a single JSON
object with `--json` (`{ status, command, summary, output_path?, warnings?, detail? }`);
`warnings[]` (`{ code, message, suggestion? }`) carries advisories about a
result that still succeeded.
Errors are `{ status: "error", code, error, message, suggestion?, detail? }`:
`code` is the exit code, `error` a stable snake_case reason (`unknown_op`,
`target_not_found`, `out_of_range`, `sheet_not_found`, `file_open_in_gui`, …)
and `suggestion` the next step (with `did you mean …?` for one-typo
mistakes); the facts an agent needs to retry (valid
ranges, available ids, sheet names, usage lines) come back as fields in
`detail` rather than only inside the message. Exit codes: `0` ok, `1` usage,
`2` file, `3` conversion failed, `4` app not available.

## Template merge

`ieumoffice merge <template> --data <values> --out <file>` fills `{{key}}`
placeholders in a `.docx`, `.pptx` or `.xlsx` template from a JSON object
(a file, inline JSON or `-` for stdin). Nested objects flatten to dotted keys
(`{{a.b}}`); arrays are not expanded and come back in `detail.ignored_keys`;
whitespace inside the braces is tolerated. The fill runs on the engines' own
find/replace paths: `findReplace` in the docs editor (a table block with a placeholder that has a
value goes through `replace_blocks` on its restricted HTML, since `findReplace`
does not reach cells; a table nothing fills is left untouched), deck-level `findReplace` plus `setNotes` in pptx-ops, and the workbook DSL's `set_cell`,
one per placeholder cell: a cell that is exactly one placeholder takes the
value's type (a number becomes a number cell), every other cell gets its
substituted text as literal text (`type: "text"`, so a value starting with
`=` does not become a formula).

The result lists `used_keys`, `unused_keys` and `unresolved_placeholders`
(`{ placeholder, key, reason, location }` with the block index, slide and
element id, or sheet and cell). `reason: no_key` is a placeholder the data
does not cover; `split_placeholder` is one Word or PowerPoint stored across
runs with different formatting, which run-level replace cannot match (retype
it in one run); `unreachable_nested` sits inside a nested pptx group or a
table in a group, which deck-level `findReplace` does not reach (ungroup it). Unresolved placeholders stay in place and the result carries an
`unresolved_placeholder` warning; `--strict` turns them into an error of the
same name and writes nothing. The output is written atomically, an existing
file needs `--force`, and the GUI-open check and `GENOFFICE_ALLOWED_ROOTS`
apply as for every other write.

## MCP server

`ieumoffice mcp` serves the same commands as Model Context Protocol tools on
stdio, for clients that cannot run a shell or should not (Claude Desktop,
Cursor, sandboxed agents). Nothing else is needed on the machine: the process
runs on the app's Node runtime like every other command, and IeumOffice itself
only starts, hidden, for the conversions that need its renderer.

```bash
claude mcp add --transport stdio ieumoffice -- ieumoffice mcp
```

```json
{ "mcpServers": { "ieumoffice": { "command": "ieumoffice", "args": ["mcp"] } } }
```

`ieumoffice mcp install <agent|all> [--dir <path>] [--force]` writes that entry
for you, pointing at the absolute launcher path so it works without `ieumoffice`
on the PATH (on Windows, where MCP clients spawn without a shell, the entry
runs `IeumOffice.exe` as Node on the bundled `genoffice.cjs` with
`ELECTRON_RUN_AS_NODE=1`, the same entry the app's Settings snippet shows): `~/.claude.json` (Claude Code, user scope; `CLAUDE_CONFIG_DIR`
honoured), `~/.codex/config.toml` (`[mcp_servers.ieumoffice]`; `CODEX_HOME`),
`~/.cursor/mcp.json`, `~/.gemini/settings.json`, `~/.copilot/mcp-config.json`
(Copilot CLI), `~/.config/opencode/opencode.json` and
`~/.codeium/windsurf/mcp_config.json`. Only the `ieumoffice` key is touched; an
entry of that name starting another program is reported as `occupied` and left
alone unless `--force`, a file that cannot be parsed is reported as `manual`
with the snippet to paste. `--dir` names the agent's config folder for one
agent; `mcp uninstall <agent|all>` removes the entry; `mcp list` shows every
agent, detected or not, with its config path and state (`--json` for the
structured rows).

The tool table is `src/mcp/tools.ts`: one tool per command verb
(`docs_read`, `docs_apply`, `sheet_apply`, `slides_render`, `convert`, …),
each parameter taken from the command's own option list, so the two surfaces
cannot drift. Ops, cell lists, specs and Markdown are passed inline and land
in a scratch directory for the length of the call; `render` and
`slides_render` return the PNGs as image content. Results are the same JSON
envelope `--json` prints; an error comes back with `isError` and the same
`error` reason. The `ops`, `cells` and `data` parameters carry the per-op
schema of `guide <domain> --json` (one variant per op with its fields), so a
client sees the fields without reading the guide; `ieumoffice mcp
--compact-schemas` (or `GENOFFICE_MCP_COMPACT_SCHEMAS=1`) advertises them as
plain arrays for clients with a small context budget. The op references are
also resources (`ieumoffice://guide/docs`, `…/sheets`, `…/slides`,
`…/slides/design`, `…/slides/spec`, `…/slides/templates` and one
`…/slides/templates/<id>` per built-in template); the `guide` tool takes the
template id as a third positional, `guide("slides", "templates", "<id>")`.

A new deck goes through `deck_start` (style sheet + outline, returns the
design and spec guides), `deck_page` (one page per call, checked against its
outline entry and the palette), `deck_build` and `deck_replace`
(`src/mcp/deck.ts`). The deck directory is the state, laid out exactly as the
command line's staged flow, so a deck started from either side can be finished
from the other.

Behind a reverse proxy, set `GENOFFICE_TRUST_PROXY_HEADERS=1` so the download
URLs the server hands out use the forwarded host and scheme; by default the
`X-Forwarded-*` headers are ignored.

`ieumoffice mcp --http <port> [--host <addr>] [--token <secret>]` serves the
same tools over Streamable HTTP for clients on other machines (`src/mcp/http.ts`).
Files travel with the calls: `PUT /files/<name>` uploads one and returns a URL,
every path parameter also takes an http(s) URL (fetched into the session's
scratch directory, `src/mcp/files.ts`), and a tool that writes a file returns
`output_url` plus the bytes as an embedded resource when small or a
`resource_link` otherwise (`src/mcp/remote.ts`). Each session has its own
scratch directory, working directory and deck state; `open` and `selection`
are not registered;
with `GENOFFICE_ALLOWED_ROOTS` unset the tools are confined to the server's
file store. A `--host` other than this machine (`127.0.0.1`,
`localhost`, `::1`) is refused unless `--token` or `GENOFFICE_MCP_TOKEN` sets a
token.

## Putting ieumoffice on the PATH

- **macOS**: the app tries to symlink `/usr/local/bin/ieumoffice` (or `/opt/homebrew/bin/ieumoffice`) on every launch until one succeeds. If neither directory is writable it stays silent; run `ieumoffice install-cli` from the launcher, or `sudo mkdir -p /usr/local/bin && sudo ln -sf "/Applications/IeumOffice.app/Contents/Resources/cli/ieumoffice" /usr/local/bin/ieumoffice`.
- **Windows**: the installer appends `<install dir>\resources\cli` to the user PATH (`apps/shell/build/installer.nsh`, REG_EXPAND_SZ preserved, removed on uninstall) and the app re-checks once per version; new terminals see `ieumoffice`. The directory holds `ieumoffice.cmd` for cmd / PowerShell and the extension-less `ieumoffice` for Git Bash.
- **Linux**: the deb/rpm post-install links `/usr/bin/ieumoffice`; the AppImage relies on the first-launch symlink into `/usr/local/bin` when it is writable.

`ieumoffice install-cli` repeats the attempt and prints the manual command when it cannot finish. jsdom (for Word/Markdown) ships beside the bundle as `Resources/cli/node_modules`, collected by `collect-deps.mjs` at build time.

Independently of the PATH, every launch of the packaged app writes the launcher directory to `~/.ieumoffice/launcher` (`GENOFFICE_AUTH_DIR` overrides the directory, as it does for the audit log). The `ieumoffice` agent skill (`skills/ieumoffice/SKILL.md`) reads it when `ieumoffice` is not on the PATH. `ieumoffice --version` prints this package's version, inlined by `build.mjs`.

## Layout

- `src/cli.ts` — argv parsing, dispatch, output; `runCli()` is embeddable.
- `src/registry.ts` — `CommandDef` table (`name`, `usage`, `run`), the single
  place future entry points (in-app AI, MCP) dispatch through.
- `src/commands/` — `info`, `convert`, `create`, `render`, `slides`, `sheet`, `docs`,
  `pdf`, `guide`, `open`, `capabilities`, `search`, `image`, `media`, `install-cli`.
- `src/dom.ts` — the jsdom bootstrap the Word/Markdown paths need.
- `src/formats/` — thin adapters over `@genoffice/pdf2docx`, the xlsx sidecar
  and the sheets CSV importer.
- `src/resources.ts` — locates pdfium wasm, the harfbuzz subsetter wasm (the
  translated-PDF writer embeds fonts with it), the xlsx sidecar and the OCR
  helper in both the packaged `Resources/` layout and the dev checkout.
- `bin/ieumoffice`, `bin/ieumoffice.cmd` — launchers copied next to `genoffice.cjs` in the
  packaged app.

## Path policy and audit log

- `GENOFFICE_ALLOWED_ROOTS` (PATH-style list of directories) confines every file ieumoffice
  reads or writes to those trees; symlinks are resolved before the check. A path
  outside exits 2 with the roots in `detail.allowed_roots`. Unset means
  unrestricted.
- `apply --out` onto another existing file needs `--force`, like `create` / `convert`;
  editing in place never does. Unknown options are rejected instead of ignored.
- A file the running IeumOffice shell has open in a tab is not rewritten in place
  (exit 2, `detail.gui_pid`): the shell publishes its open tabs to
  `userData/open-documents.json` and ieumoffice reads it (`GENOFFICE_USER_DATA`
  overrides the location). `--force` writes anyway; the editor then warns about
  the on-disk change at its next save (Word, Excel) or may overwrite it (PowerPoint).
- Every executed command appends one JSON line (`ts`, `command`, `argv`,
  `status`, `code`, `output_path`, `ms`, `cwd`) to
  `~/.ieumoffice/cli-audit.jsonl`, rotated at 2 MB. `GENOFFICE_AUDIT_LOG=<path>`
  redirects it, `GENOFFICE_AUDIT_LOG=off` disables it.

## Cloud commands

`search`, `image` and `media` reuse the editors' provider routing with the
app's own AI settings (`IeumOffice/ai-settings.json` in the platform config
directory, override with `GENOFFICE_AI_SETTINGS`). The command line only reads
those settings; it has no login of its own and stores no credentials.
`read-url` reads only the GitHub token from the same file. `HTTPS_PROXY` /
`HTTP_PROXY` / `ALL_PROXY` are honoured. Search results, image bytes and
analysis text come back in the JSON `detail`; `image` also writes the file.
These commands, and the PDF document jobs below (`pdf ai-read`,
`pdf translate`), are the only ones that send data off the machine: `read-url`
sends the address it is given to that site, the rest send to the configured
provider.

A command, like an MCP tool call, is an **automatic call**: nobody is looking
at a screen when it runs. That decides which route it may take.

- **Search** is free by default and always available: Parallel's free,
  rate-limited Search MCP, then DuckDuckGo. Image search runs on DuckDuckGo.
  A key-based provider (Serper, Serply, Tavily, Parallel, Exa, Firecrawl) is
  used only when it is the one selected in the app's settings and its key is
  there; Parallel, Tavily, Exa and Firecrawl provide web search only. Search
  never uses a subscription.
- **Image generation** is key-based only in this version: it runs on an image
  provider whose key is set up in the app, and answers "unavailable"
  otherwise. `--model` is ignored (a successful result says so in
  `detail.note`) and `--size` has no effect on the key-based providers.
- **Media analysis**: a picture is shown to the AI provider the chat runs on,
  or to the key-based analysis provider chosen in the app. Video and sound
  need a key-based provider that can analyse video.
- **A Claude or Codex subscription is not used by automatic calls unless the
  user allowed it**: Settings → AI → Advanced → "Let automatic requests use a
  subscription", off by default. Neither vendor recommends letting a program
  use a subscription unattended, and an account may be restricted for it.
  Switched off, the commands behave as if no subscription existed: a key
  route is used when there is one, and otherwise the answer is "unavailable"
  together with the place of that setting. Switched on, subscription requests
  run one at a time across every command and MCP process, one request per
  turn, so a long PDF job takes turns with the other callers. There is no
  hourly cap. A switch turned on under the older warning (which promised one)
  reads as off until the user turns it on again. A login billed by usage that
  the user accepted and selected counts as a key route, not as a subscription.

### Reading web pages

`ieumoffice read-url <url> [--offset <n>]` fetches one http(s) page and returns
its readable text (HTML is converted; the address goes to that site, not to an
AI provider). `detail` carries `url` (the final address after redirects),
`title`, `text`, `offset`, `totalChars`, `truncated` and, while the page
continues, `nextOffset` — pass it as `--offset` to read on. A page is cut at
50,000 characters per call. GitHub blob addresses are read as raw text; a
private file uses the read-only GitHub token set under Settings → AI in
IeumOffice. The command uses no provider, subscription or automatic-call
ledger.

A page that is not text (a PDF, image or Office file) is refused: download and
attach it instead. Such a refusal is exit 1, `error: "unsupported"`, with
`detail.reason` `blocked` (a private or loopback address) or `no_text`; the
binary-page message names the reason and asks for an attachment. A fetch that
fails exits 4, `error: "app_unavailable"`, with `detail.errorCode` `network`,
`timeout`, `http_error` (plus `detail.status` when the server gave one) or
`auth` (check the GitHub token). A page over 10 MB exits 4 with
`error: "resource_limit"` and `detail.max_bytes`.

### PDF document jobs

`pdf ai-read` sends page images and `pdf translate` sends the text of the
chosen pages to the AI provider the chat runs on, chosen as above. Both keep
their results in the result store the app uses (`pdf-store` in the app's data
folder), so a second run skips what is done and the PDF editor sees it too.

- Without `--yes` nothing is sent: the answer is `detail.started: false` with
  `detail.estimate { calls, pages, provider, route, metered }` (exit 0).
- A route billed per request (`metered: true`: a provider key, or a metered
  login the user accepted) needs `--allow-paid`; without it the answer is
  exit 4, `error: "paid_route_not_allowed"`, `detail.route`, `detail.via`.
- `pdf translate` runs in the foreground with its progress on stderr. When a
  usage limit or failures in a row stop it, it answers exit 4 with
  `detail.errorCode`, `detail.resetsAt` and `detail.done_blocks` /
  `detail.total_blocks` and writes no file; with `--partial` it writes the
  files with what is translated (the rest in the source language) and answers
  `status: "partial"` with `detail.stopped { errorCode, resetsAt? }`. Running
  it again continues from the store; `--restart` starts over, keeping the
  paragraphs a person edited in the app's side-by-side view (they count as
  done and are not sent again). Edited paragraphs are written into the
  output files as edited.
- Arabic, Hebrew and Hindi cannot be written into a PDF, nor can an encrypted
  PDF: `--format pdf` is refused before anything is sent (use `md,epub`).
- One job per document at a time. `pdf status` shows the pages read by AI and
  each translation with its job
  `{ state, last_error?, resetsAt?, outputs, progress? }`.
- The MCP tools `pdf_ai_read` and `pdf_translate` start the job inside the MCP
  server and answer at once with `detail.started: true`; `pdf_status` follows
  it. When the server ends, its jobs stop as `interrupted`.

### `capabilities`

`ieumoffice capabilities --json` reports, without calling a model, what the
commands above would do right now. Agents read it once before planning work
that needs photos, web facts or a PDF job. `detail` holds:

- `search`, `image_search`, `image_generation`, `image_analysis`,
  `video_analysis`, `media_analysis`: each
  `{ available, via, route, metered?, message? }`. `via` names who answers (a
  search backend, a key provider, or the AI provider the chat runs on);
  `route` is how it is paid for: `free`, `key` or `subscription` (`null` when
  unavailable); `metered: true` marks a login billed by usage; `message`
  appears only when unavailable and is the exact text the command would
  answer with. `media_analysis` is kept for compatibility: it repeats
  `image_analysis`, or `video_analysis` when only video works.
- `pdf_ai_read`, `pdf_translation`: the same shape, for the PDF document
  jobs (the AI provider the chat runs on; page reading needs a model that
  reads images).
- `automatic_calls`: `{ subscription_enabled }`, plus
  `{ used, limit: null, remaining: null }` while the setting is on (`used`
  counts the automatic subscription requests of the last hour, for
  information only).
- `app`: `{ available }` (whether the app binary the renderer-backed
  conversions need was found) and `settings_path`.

`summary` reads `available: …; unavailable: …`. Web and image search are
always reported available with route `free` unless a key provider is selected.

### Failures

A cloud command that cannot run exits 4 with `error: "app_unavailable"`.
`detail.errorCode` says why: `unavailable` (nothing is set up for it; do not
retry, change the settings) or the kind of a failed run, such as `rate-limit`
or `signed-out`. `detail.resetsAt` (epoch milliseconds) accompanies
`rate-limit` when the provider names the time. `headless-limit` is no longer
raised. The MCP tools return the same fields.

## Build and run in a checkout

```
npm run build -w @genoffice/cli       # esbuild → dist/genoffice.cjs
packages/cli/bin/ieumoffice info file.docx  # falls back to the system node
```

Conversions that need an app renderer (Word/PowerPoint/Excel/HTML/Markdown → PDF,
Word → HTML, HTML → Word, `create --type pdf`) run inside the IeumOffice binary
through its hidden `--headless-export` mode: ieumoffice spawns it (Dock hidden, no
window), reads the JSON envelope it prints and maps its exit code. Set
`GENOFFICE_APP_BIN` to point at a specific executable; in a checkout the dev Electron
plus `apps/shell` is used, so `npm run build:all` first.
