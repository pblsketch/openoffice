# Contributing to IeumOffice

Thanks for your interest in contributing. This document covers the local
setup, the checks a change must pass, and the conventions used in this
repository.

## How changes land here

Development happens in this repository,
[pblsketch/openoffice](https://github.com/pblsketch/openoffice). Pull requests,
issues and feature requests are all handled here.

IeumOffice is a modified version of GenOffice (see
[License and acknowledgement](README.en.md#license-and-acknowledgement)) and
keeps taking engine fixes from it, which shapes two rules:

- **Keep the difference from upstream small.** No reformatting, reordering or
  renaming of code you are not changing, and no drive-by cleanups. Delete what
  has to go and leave the rest byte-identical, so the next upstream fix still
  applies.
- **Internal names stay as they are.** Package names (`@genoffice/*`),
  environment variables (`GENOFFICE_*`), code symbols and file names keep the
  upstream spelling. Only names a user sees or that are registered on a PC are
  the product's own: the product name comes from `packages/i18n/src/product.ts`
  and the command, MCP entry, skill and home folder from
  `packages/cli/src/names.ts` (`ieumoffice`). Identifiers written into saved
  documents, and the names of sidecar files stored beside them, never change.

A bug in code the two projects share (the document engines, for example) is
worth reporting to the upstream project as well.

## Repository layout

- `apps/*` — the seven Electron apps (docs, sheets, slides, pdf, markdown, html, shell).
  Each app is an npm workspace with its own `src/main` (Electron main
  process), `src/renderer` (React UI), and `tests/`.
- `packages/*` — pure TypeScript engine and shared packages (no Electron
  dependency, unit-tested): docx/pptx engines, AI agent core, providers,
  i18n, UI kit.
- `apps/sheets/native/xlsx-engine` — Rust xlsx engine (runs as a sidecar process) for xlsx import/export.

## Engine packages

All pure TypeScript, no Electron dependency, unit-tested (except the UI kit):

- `packages/docx-engine` — docx parsing → block tree (with `docxIndex`
  anchors and passthrough), OOXML fragment generation, byte-level paragraph
  patching.
- `packages/pptx-engine` / `packages/pptx-render` — pptx model and rendering.
- `packages/pdf2docx` — local PDF → DOCX conversion: PDFium character-level
  extraction, pure-geometry layout analysis, rebuild through `docx-engine`;
  the same analysis drives the PDF app's PowerPoint and Excel exports.
- `packages/html2docx` — local HTML → DOCX conversion: the page is rendered in
  the app's own Chromium, reduced in-browser to a document intent tree, and
  written as native OOXML with the `docx` library; only visuals with no Word
  counterpart are screenshotted. Drives the HTML app's Export as Word.
- `packages/file-parse` — text extraction for AI attachments (office formats,
  text formats).
- `packages/agent-core` — the AI agent loop and skill composition shared by
  every app.
- `packages/ai-provider` — provider abstraction and streaming for the model
  backends, including the bridges to the Claude Code and Codex programs
  (`src/subscription`, `claude-code-cli.ts`, `codex-app-server.ts`).
- `packages/ai-search` — web/image search, image generation and media analysis
  tools, and the routing between the free, key and subscription routes.
- `packages/cli` — the `ieumoffice` command line and MCP server
  ([packages/cli/README.md](packages/cli/README.md)).
- `packages/i18n`, `packages/ui`, `packages/project-store`,
  `packages/electron-utils` — shared i18n core, React UI kit, recent-files
  store, and Electron main-process helpers.

### Architecture notes (docx round trip)

```
open docx ─► archive original by hash (never touched)
          ─► docx-engine parses word/document.xml top-level elements (w:p / w:tbl / …)
          ─► Block tree, each block anchored by docxIndex + original XML slice
          ─► Tiptap streaming editor (manual + AI editing, dirty tracking)
save      ─► dirty blocks → OOXML fragments (referencing existing styles only)
          ─► splice into original document.xml (untouched blocks keep original bytes)
          ─► repack zip; all other entries copied byte-for-byte
```

The same philosophy holds in sheets and slides: the original file is the
source of truth, edits are applied as narrow patches, and everything the
editor didn't touch survives the round trip untouched.

## Getting started

Prerequisites: Node 22.12+, npm 10+, and a Rust toolchain (`cargo` on PATH,
needed only for the sheets xlsx sidecar). A Rust install on Windows does not
always put `cargo` on the PATH; if `cargo --version` is not found, prepend
`%USERPROFILE%\.cargo\bin` in the terminal you build from.

```bash
npm install
npm run fixtures     # generate test .docx fixtures (one-time, and after docx-engine changes)
npm run dev          # all editors + shell against Vite dev servers
npm run dev:docs     # or run a single app
```

No AI account is needed to build, run or test. To try the AI features in a
development run, connect a Claude or Codex subscription under Settings → AI,
exactly as in the installed app.

## Checks every change must pass

CI runs these on every PR; please run them locally first:

```bash
npm run format:check # Prettier check for uncommitted changed/new files
npm run lint         # ESLint across the repo (0 errors required; warnings allowed)
npm run typecheck    # tsc --noEmit across every workspace
npm test             # engine + app unit tests (also runs the Rust sidecar tests)
npm run licenses     # production dependency licenses within the permissive allowlist
```

CI also runs the repository check scripts:

```bash
npm run check:theme-colors      # no raw colors in changed renderer CSS (see CLAUDE.md)
npm run check:english-comments  # no Chinese text in code comments or docs
npm run check:help-langs        # every language of the in-app manual matches the English structure
npm run check:skill-version     # a changed skills/*/SKILL.md body bumps its metadata.version
npm run check:no-genspark       # nothing tied to the removed vendor's services is back (allowlist in the tool)
```

CI runs on Linux. On Windows a number of tests inherited from upstream fail
for reasons unrelated to your change (path separators, a missing Chrome,
timeouts on a busy machine); compare against an untouched checkout before
treating one as yours.

Formatting is intentionally incremental: existing files are not reformatted
unless they are part of your change. Run these exact commands before committing:

```bash
npm run format                              # format uncommitted changed/new files
npm run format:check                        # verify uncommitted changed/new files
npm run format:check -- --base origin/main  # verify committed files on your branch
```

CI supplies the PR or push base automatically and checks only files changed from
that base. This keeps the formatter gate useful without creating a repository-wide
formatting diff.

## Building installers

Windows is the only platform this project builds, releases and verifies. Run
the build from the repository root — it regenerates the third-party notices
and builds all seven apps before packaging:

```bash
npm run dist:win -- -- --publish never   # nsis installer, in apps/shell/release
```

The double `--` is required (the script calls another npm script), and
`--publish never` keeps electron-builder from trying to upload: the builder
configuration names this repository's GitHub Releases as the update source.
The installer is unsigned on purpose; this project has no signing certificate.
The full release procedure, from the version bump to the GitHub release, is in
[docs/releasing.ko.md](docs/releasing.ko.md) (Korean).

`dist:win` expects the xlsx sidecar at the MinGW cross-compilation path.
Building on Windows leaves it under the MSVC target instead, so stage it
first:

```bash
cargo build --release --target x86_64-pc-windows-gnu   # from apps/sheets/native/xlsx-engine
```

or copy an existing `target/release/xlsx-sidecar.exe` to
`target/x86_64-pc-windows-gnu/release/`. Packaging also compiles the OCR
helper (`win-ocr.exe`), which needs the Windows 10/11 SDK.

The macOS and Linux build scripts (`npm run dist:mac`, `npm run dist:linux`)
and their packaging files are inherited from upstream and kept, but this
project does not build or test them, and parts of the Linux packaging still
carry upstream's names. Two inherited notes for anyone who tries: without
signing credentials the macOS build skips code signing and notarization with
a warning, and packaging from a repository on an exFAT/FAT32 volume fails on
macOS because of the hidden `._` AppleDouble files the OS writes next to the
build output — point the output directory at an APFS path:

```bash
BUILD_DIR=/tmp/ieumoffice-release npm run dist:mac
```

## Environment variables

None are required — the apps run with all of these unset. They exist for
testing and local overrides:

| Variable                                                                                                     | Effect                                                                                                       |
| ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| `BUILD_DIR`                                                                                                  | Override the electron-builder output directory (default `apps/shell/release`)                                |
| `GENOFFICE_USER_DATA`                                                                                        | Override the Electron userData directory (test isolation)                                                    |
| `GENOFFICE_LANG`                                                                                             | Force the UI language instead of following the OS locale                                                     |
| `GENOFFICE_FAKE_UPDATE`                                                                                      | Exercise the updater UI without a real release feed                                                          |
| `GENOFFICE_AI_SETTINGS`, `GENOFFICE_APP_BIN`                                                                 | Point the command line at another AI settings file / app executable                                          |
| `SERPER_API_KEY`, `SERPLY_API_KEY`, `TAVILY_API_KEY`, `PARALLEL_API_KEY`, `EXA_API_KEY`, `FIRECRAWL_API_KEY` | Stand in for the stored key of the search provider selected in Settings; never change which provider is used |
| `XLSX_SIDECAR_PATH`, `XLSX_OPEN_PATH`, `XLSX_DEBUG_PORT`                                                     | Point at a locally built xlsx sidecar and its debug port                                                     |
| `*_DEV_PORT`, `*_RENDERER_URL`                                                                               | Per-app Vite dev server ports and renderer URLs (set by `npm run dev`)                                       |

The variable names keep upstream's `GENOFFICE_` prefix on purpose (see "How
changes land here"). The command line's own variables (allowed roots, audit
log, MCP options) are listed in [packages/cli/README.md](packages/cli/README.md).

AI features degrade rather than break without a connection: with no Claude or
Codex subscription connected and no key provider chosen, a request shows the
connect prompt instead of an error, and web search runs on keyless backends by
default (Parallel's free Search MCP, then DuckDuckGo).

## Coding conventions

- **English only** in code, comments, commit messages, and docs. User-facing
  strings go through the i18n resources (`src/renderer/i18n/`, plus the inline
  main-process dictionaries in `src/main/`), which are the only places
  non-English text belongs (plus test fixture text). The two documents written
  for Korean readers, [README.md](README.md) and
  [docs/releasing.ko.md](docs/releasing.ko.md), are the exception;
  [README.en.md](README.en.md) is the English README.
- The UI has 21 languages (`LANGS` in `packages/i18n/src/index.ts`). A new or
  changed UI string has to exist in all of them, as a real translation rather
  than a copy of the English text.
- Never read, copy or store subscription login material (`~/.codex/auth.json`,
  the Claude credential store), not even in a test or while debugging, and
  never start the Claude Code or Codex program through a shell. The rules are
  in [SECURITY.md](SECURITY.md#subscription-programs-claude-code-codex).
- A test that reaches the `claude-code` or `codex` provider without mocking
  the bridge starts the real program and spends the developer's own quota.
  Mock it.
- TypeScript everywhere; avoid adding new `any` surfaces where a precise type
  is cheap.
- Tests live in `apps/*/tests` and `packages/*/tests` (vitest). New engine
  behavior needs a unit test; renderer-only UI tweaks generally don't.
- Playwright/Electron acceptance drivers and Office-app comparison scripts
  (anything that drives the built app or Word/Excel/PowerPoint on your
  machine) are local, on-demand tools: keep them out of the tree (they are
  gitignored) and never wire them into CI.
- Keep files from growing without bound: if you are adding a substantial new
  concern to an already-large file, prefer a new module.

## Commit and PR guidelines

- Small, focused commits with English
  [Conventional Commits](https://www.conventionalcommits.org/) subject lines
  (e.g. `fix(docx-engine): keep table borders on round trip`,
  `feat(slides): parse chart legends`).
- A PR should explain _why_ the change is needed, and mention which of the
  checks above you ran.
- File format fidelity is the core product promise: for changes touching
  open/save paths (docx/xlsx/pptx), include a round-trip test proving
  untouched content survives byte-for-byte.

## Recognition

Contributors are listed in [CONTRIBUTORS.md](CONTRIBUTORS.md) and in release
notes. We list GitHub handles only, not real names or email addresses; tell us
if you would rather not be listed.

## Reporting bugs and requesting features

Use the issue templates. For suspected security issues, do **not** open a
public issue — follow [SECURITY.md](SECURITY.md).

## Code of conduct

All community spaces follow the
[Contributor Covenant](CODE_OF_CONDUCT.md); participation implies acceptance.

## License and CLA

There is no CLA (contributor license agreement). By contributing, you agree
that your contributions are licensed under the
[Apache License 2.0](LICENSE) that covers this project — inbound = outbound,
per Apache-2.0 §5. The whole repository is under that one license.

Because this is a modified version of GenOffice, keep the existing copyright
notices, [LICENSE](LICENSE) and [NOTICE](NOTICE) intact; changes to those
files need a maintainer review (see [CODEOWNERS](.github/CODEOWNERS)).
