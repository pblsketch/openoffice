# Headless PDF export

Every "export to PDF" path in IeumOffice can be driven without a visible
editor window, behind one entry point:

```
<app binary> --headless-export <input-file> --to pdf --out <path> [--json]
```

The app creates no visible window, hides the macOS dock icon, writes exactly
one line to stdout and exits. It does **not** take the single-instance lock,
so it runs happily alongside a GUI instance.

```
$ IeumOffice --headless-export report.docx --to pdf --out report.pdf --json
{"status":"ok","summary":"Exported /w/report.docx to /w/report.pdf","output_path":"/w/report.pdf"}
```

Without `--json` the same line is a plain sentence. Both `--flag value` and
`--flag=value` are accepted.

## Exit codes

| code | meaning                                                                         |
| ---- | ------------------------------------------------------------------------------- |
| 0    | the PDF was written                                                             |
| 1    | bad arguments (missing `--out`, a target other than `pdf`, no output directory) |
| 2    | input file problem (missing, not a file, extension no module can render)        |
| 3    | conversion failure (unreadable document, renderer crash, timeout)               |

On failure the JSON envelope is
`{"status":"error","summary":…,"error":…}` — one line, newlines folded out.

## Supported inputs

| extension                                    | module   |
| -------------------------------------------- | -------- |
| `.docx`                                      | docs     |
| `.xlsx` `.xlsm` `.xls` `.csv`                | sheets   |
| `.pptx`                                      | slides   |
| `.md` `.markdown`                            | markdown |
| `.html` `.htm`                               | html     |
| `.drawio` `.dio` `.drawio.svg` `.drawio.png` | diagram  |

## Diagrams

Diagrams take more targets and three more switches:

```
<app binary> --headless-export <diagram> --to pdf|png|svg --out <path> [--page <n>] [--json]
<app binary> --headless-export <diagram> --to drawio|dio|drawio.svg|drawio.png --out <path>
             [--ops <ops.json>] [--batch all-or-nothing|best-effort|stop-on-error] [--page <n>] [--json]
```

- `pdf` is one file, one sheet per page at that page's own size, made the
  way the export menu makes it. `png` and `svg` write one file per page,
  `<out name>-p<n>.<ext>` beside `--out` (a one-page diagram too), unless
  `--page` (1-based) picks one page; then `--out` is the file.
- A diagram file target runs the JSON ops of `--ops` on the diagram with the
  AI panel's executor (Mermaid included, converted by draw.io) and writes the
  result with draw.io's own serialization, as Save does; `--out` must end in
  that format. `--page` is the page ops without `page` work on. A rejected
  batch, or one that changed nothing in a file already of that format, writes
  nothing.
- The envelope names every file written in `output_paths` (none, one or one
  per page), and a batch's per-op results in `detail.batch`
  (`{ status, changed, results, created }`). A batch the planner rejected is
  still exit 0: the job ran and wrote nothing; the caller reads the reasons.
- The job runs in a hidden window of the diagram tab's own session, so the
  tab's request refusal holds: nothing leaves the PC. The page opens the file
  as saved (no recovery question) and never saves, autosaves or copies for
  recovery; the app writes the files from the page's report and writes a
  diagram file only when its bytes open as a diagram.
- `--page`, `--ops` and `--batch` on any other input are bad arguments (exit 1).

`ieumoffice convert <diagram> --to pdf|png|svg`, `ieumoffice diagram apply`
(Mermaid, `.drawio.svg` / `.drawio.png`) and `ieumoffice create --type drawio`
are the callers.

## How it works

The grammar, the exit codes and the renderer-side waiting helpers live in
`packages/electron-utils/src/headless-export.ts`; the renderer half is
imported through the `@genoffice/electron-utils/headless-export` subpath so a
renderer bundle never pulls in `node:` builtins.

`apps/shell/src/main/headless-export.ts` validates the paths and routes by
extension to one hidden-window exporter per module
(`exportDocsPdfHeadless`, `exportSheetsPdfHeadless`, …). Each exporter:

1. creates a `show: false` BrowserWindow with that module's normal preload,
   sandbox and `backgroundThrottling: false`;
2. queues the input through the module's existing pending-open path, so the
   renderer runs its ordinary load pipeline;
3. lets the renderer wait until the document has settled (docs: pagination
   slice count stable twice in a row; slides: every picture decoded and the
   private Office fonts registered; sheets: the workbook fully preloaded) and
   then call **the same export function the File menu calls**, with the CLI's
   path in place of the save dialog;
4. resolves on the renderer's report, and destroys the window.

There is one export function per module — the GUI passes no path and gets a
dialog, headless passes one and does not — so GUI and CLI output cannot
drift. Measured on four documents, the two paths produce PDFs that differ
only in the embedded creation timestamp.

`isHeadlessMode()` (`packages/electron-utils/src/headless-mode.ts`) is set
before any editor module boots; it suppresses everything that would surface
UI after a successful write (opening the export in a tab, revealing it in the
file manager) and the slides recent-files entry.

## Behaviour worth knowing

- **An unreadable input is an error, not a blank page.** docs and slides
  answer a corrupt file with an untitled blank document; headless treats "a
  document is mounted but it never came from disk" as exit 3.
- **Password-protected documents** cannot be answered without a user. Workbooks
  and decks are not opened at all (no prompt), so they fail as an unreadable
  input; Word documents fail on the readiness timeout rather than immediately.
- **Large workbooks** normally wait for the user's "Full Load" click before
  PDF export is allowed. Headless makes that call itself.
- **Only the active sheet** is exported for spreadsheets, exactly as in the
  GUI.
