# Security Policy

## Reporting a Vulnerability

Please report suspected vulnerabilities privately via GitHub's
[private vulnerability reporting](https://github.com/pblsketch/openoffice/security/advisories/new)
on this repository. Do not open public issues for security reports. IeumOffice
is maintained by volunteers, so reports are handled on a best-effort basis.

IeumOffice is a modified version of GenOffice (see
[License and acknowledgement](README.en.md#license-and-acknowledgement)). If a
problem is in code the two projects share (the document engines, for example),
please consider reporting it to the upstream project as well.

## Verifying a Download

The Windows installer, like the Mac and Linux packages, is built by GitHub
Actions from this repository. A Windows installer built that way carries a
build provenance attestation, so you can check that it was made from this
repository's source by its own workflow:

```
gh attestation verify IeumOffice-Setup-<version>.exe --repo pblsketch/openoffice
```

The installer is not code-signed, so Windows shows an "unknown publisher"
warning the first time you run it.

## Trademark and Copyright Reports

Send trademark or copyright infringement reports and licensing questions to
pblsketch@gmail.com. The same address is in the app under Settings → About.

## Process Security Posture

All application windows run with the full Electron renderer lockdown:

- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true` for every
  document window and tab view (docs, sheets, slides, pdf, markdown, shell, updater).
- Renderers reach the main process only through typed, validated IPC channels
  (payloads are schema-checked in the main process; sheets uses zod end to end).
- Every `shell.openExternal` call goes through a single shared gate
  (`@genoffice/electron-utils` → `safeExternalUrl`) that parses the URL and
  enforces a protocol allowlist (http/https; pdf link annotations and the
  rights-contact button in Settings → About additionally allow mailto). `file:`, `javascript:`, and custom schemes are always rejected.
- No API keys are hardcoded and the project runs no AI service of its own. By
  default AI requests run through the Claude Code or Codex program installed on
  the PC, under the login the user made there (see the next section).
  User-supplied API keys and tokens are kept in the app's settings file
  (`ai-settings.json` in the app's user-data folder). On Windows (DPAPI) and
  on Linux with a desktop keyring (GNOME Keyring, KWallet) they are sealed with
  the operating system's encryption through Electron safeStorage, which ties
  them to the user account; the `ieumoffice` command asks the app, started
  hidden, to open them. On macOS, and on Linux without a keyring, they are
  still plain JSON, protected only by the permissions of the user account:
  the Mac build is not Developer ID signed, and sealing there would ask for
  Keychain access after every update.

## Subscription Programs (Claude Code, Codex)

The app starts the vendor's own, unmodified command-line program as a child
process and uses it only as the model: every document edit is still carried out
by the app's own tools. The rules the bridges are built to
(`packages/ai-provider/src/subscription`, `claude-code-cli.ts`,
`codex-app-server.ts`):

- **Login material is never touched.** The app does not read, copy or store
  `~/.codex/auth.json`, the Claude credential store, or any session token, and
  it has no Claude or ChatGPT sign-in form of its own. Signing in happens in
  the vendor's program and the vendor's own page. The connection state shown
  in the app comes from the programs' own status commands, and the account
  e-mail address they report is discarded.
- **No shell.** AI runs and status checks start the program's real executable
  directly, never through a shell, and nothing the user typed or a document
  contains is placed on the command line: prompts travel over standard input.
  The one exception is the Install button, which runs the vendor's fixed,
  literal install command in a visible terminal window.
- **No silent switch to a paid route.** Environment variables that would move
  the program from the subscription to another billing route (API keys, base
  URLs, cloud-platform switches; `SUBSCRIPTION_STRIPPED_ENV_VARS`) are removed
  from the child's environment. A login that is billed by usage is never used
  until the user accepts it explicitly.
- **No tools of their own.** The programs run in an empty temporary folder
  with hooks, plugins and MCP servers switched off and, as far as each program
  allows, the user's personal configuration ignored. A Claude run goes ahead
  only when the program reports zero available tools and zero MCP servers; a
  Codex thread is refused when any MCP server or tool is attached. A refused
  run ends with an `unsafe-tools` error.
- **No orphan processes.** Cancelling a run and quitting the app end the whole
  process tree of every program the app started. If the app itself is killed,
  its next start ends whatever was left behind.

Known limits, stated plainly:

- Claude Code announces its tool list only after the first message has been
  written to its input, so the zero-tools check necessarily runs at that
  point. A failed check kills the process tree and none of the model's output
  is used, but on Windows the kill is asynchronous.
- Codex has no supported switch that ignores the whole user configuration when
  it runs as an app server. The app overrides what it can; `~/.codex/AGENTS.md`
  is still added to the conversation by Codex, and settings the app does not
  override (for example other feature toggles) still apply.
- The app turns off Codex's conversation-history files, but Codex keeps a
  diagnostic log database of its own whose contents the project could not
  inspect.

A way around any of the rules above is a vulnerability — please report it.

## Threat Model: AI-Generated Layout Scripts (slides)

The slides AI can adjust slide layouts by emitting a small script that is
parsed with Acorn and evaluated by a constrained AST interpreter
(`apps/slides/src/renderer/ai/layout-script-interpreter.ts`). The source looks
like a small, synchronous subset of JavaScript for model compatibility, but it
is not passed to `eval`, `Function`, a VM context, a worker, or the JavaScript
engine as executable source.

**What the script can do by design:** read prototype-free JSON copies of
`els`/`canvas`, perform bounded arithmetic/control flow, use explicitly
implemented string/array/regular-expression/Math helpers, and call
`setBox/moveBy/resizeBy/setText/setStyle/setFill/setStroke/log`. Every edit
primitive validates its arguments (element existence, read-only flags, finite
numbers, hex colors) and writes only into an op buffer that is applied through
the same command pipeline as manual edits.

**Interpreter boundary:**

1. Identifiers resolve only in interpreter-owned lexical scopes seeded with the
   documented data and callables. There are no ambient globals, module loader,
   DOM, network, IPC bridge, timers, process APIs, or dynamic code primitives.
2. Property reads are dispatched by value type. Data objects expose own JSON
   fields only; arrays, strings, and regexes expose a small method allowlist.
   Host prototypes and function properties are never traversed, including
   through computed property names.
3. Calls accept only interpreter-created functions or explicit builtins. A host
   function obtained through a constructor/prototype chain cannot be
   represented.
4. Inputs and values crossing into edit primitives are recursively copied as
   JSON-like, prototype-free data. Errors discard all buffered operations;
   logs are capped.
5. Execution has statement/expression and call-depth limits to bound runaway
   loops or recursion. Regular expressions run on an interpreter-owned matcher
   with its own step budget (a supported subset; no native backtracking), so a
   catastrophic pattern cannot stall the renderer past those limits.

The Electron renderer sandbox remains defense in depth, but it is not the
layout-script security boundary. The interpreter is designed so a layout
script cannot obtain renderer capabilities in the first place.

If you find a way for a layout script to reach anything beyond the injected
primitives (network, storage, IPC channels not reachable by design, or the
main process), that is a vulnerability — please report it.

## Threat Model: Rendering AI-Generated HTML

Three pipelines render AI-generated or untrusted HTML in a hidden
`BrowserWindow`. Every window is treated as hostile content: full renderer
lockdown (`sandbox: true`, `contextIsolation: true`, `nodeIntegration: false`),
no preload script, no IPC surface. The slides hidden windows only load the
app's own renderer and print HTML (PDF export, print, headless export); the
AI-HTML-to-pptx conversion runs inside the slides renderer, never in a hidden
window. The HTML app's DOCX export and the docs altChunk conversion drive their
windows exclusively through `executeJavaScript` under a watchdog timeout
(`Promise.race` against a fixed timeout, then `destroy()`), so a page whose
scripts never yield cannot strand the hidden window. HTML→DOCX
conversion renders the page with scripts enabled and does not sanitize the
markup before conversion — the output is a document, not a sandbox escape;
report it as a vulnerability if you find a way from the converted page into
the main process.

## Out of Scope

- The AI services this client talks to, and the Claude Code and Codex programs
  it starts, are made and operated by other companies and are not part of this
  repository; issues with them should be reported through their own channels.
- Vulnerabilities that require an already-compromised machine or a modified
  binary. This includes the deliberate environment-variable override points
  for local development (`GENOFFICE_APP_BIN`, `XLSX_SIDECAR_PATH`): setting them
  requires control of the process environment, which is equivalent to code
  execution on the machine.
