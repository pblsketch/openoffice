# Connecting a coding agent

GenOffice speaks the Model Context Protocol, so a coding agent can read, write and render your documents through the same engines the app uses. The agent is not guessing at a file format: it gets the typed op schemas from the same definitions the executor validates against.

## Registering it from the app

**Settings ▸ Integrations** is the place to do this. The pane has two halves, and you can use either or both.

**The skill.** One row per coding agent found on this machine — Claude Code, Codex, Cursor, Gemini CLI, Copilot CLI, OpenCode, Windsurf — each with **Install**, **Update** and **Uninstall**, plus **Install into another folder…**, **Download skill (zip)** and **Copy path**. If your assistant is not listed, point GenOffice at a folder it reads `SKILL.md` from, or save the zip and let the assistant install it. The skill and MCP can sit side by side: the assistant picks one, and they do exactly the same things.

**MCP.** Two routes are offered: **Started by the assistant (recommended)**, where you add the shown config to your client and the assistant launches the server itself, and **Local HTTP server**, which the app runs for you. Either way the assistant ends up talking to GenOffice and you never type a command.

## Registering it from the command line

The same thing from a terminal — this is the advanced path, and the one to reach for when the agent lives somewhere the pane cannot find:

```sh
ieumoffice mcp install all
```

It finds the coding agents on this machine and writes the stdio server entry into each one's own config, leaving the rest of that file as it found it. The entry is named `ieumoffice`. Done by hand for Claude Code, the same registration is `claude mcp add --transport stdio ieumoffice -- ieumoffice mcp`.

```sh
ieumoffice mcp list             # where each agent stands
ieumoffice mcp install cursor    # just one
ieumoffice mcp uninstall cursor  # take it back out
```

An agent you installed somewhere unusual takes `--dir <path>`; `--force` rewrites an entry that is already there.

`ieumoffice mcp --help` puts everything the server takes on one screen: the register, remove and list forms, serving over HTTP, and the two schema flags.

## Running it without an assistant

For a client on another machine, serve it over HTTP instead:

```sh
ieumoffice mcp --http 8765 --token <secret>
```

`--host <addr>` changes where it listens. Pass the same token to the client.

Over HTTP files travel too: `PUT /files/<name>` uploads one, every tool takes an `http(s)` URL in place of a path, and outputs come back as download URLs — and, when they are small enough, as embedded resources. Ops, specs and Markdown are passed inline either way.

## What the agent gets

Every command is a tool. The interesting ones:

- **`docs`, `sheet`, `slides`** — read and edit a file through the app's own write path, one **op** at a time. A new deck goes `deck_start`, `deck_page`, `deck_build`.
- **`render`** — one PNG per page, laid out by the app's renderer, so the agent can look at a slide rather than guess at it.
- **`pdf`** — a PDF's text layer, page by page, with no app process.
- **`info`** — metadata and a structure summary, which is usually the cheapest first call on an unfamiliar file.
- **`search`, `image`, `media`** — web and image search, image generation and media analysis through what is set up in the app, so the agent does not need its own keys. The next section says what they may use.
- **`merge`** — fill a `{{key}}` template.

## Search, images and media: what an agent may use

A request from the `ieumoffice` command or from an MCP client was not typed by you in the app, so GenOffice is careful with it.

- **Search** always works and is free by default. A search provider key is used only if you selected one.
- **Generating a picture** needs an image provider key. In this version a subscription does not generate images.
- **Describing a picture** uses a key provider when one is set up. Your Claude or Codex subscription is **not used unless you allow it**.
- **Video and audio** need a key provider that supports video.

To allow subscription use, open Settings ▸ AI ▸ **Advanced** and turn on **Let automatic requests use a subscription**. A warning comes first — "There is no hourly limit, so a program can send as many requests as it likes, and they may carry the whole text of a document and images of its pages. Neither company recommends letting a program use your subscription automatically, and your account may be restricted." — and the switch goes on only after **Turn on anyway**.

Even with the switch on:

- Requests are handled one at a time. Others wait their turn.
- There is no hourly limit. Turns are taken request by request, not job by job, so a long PDF translation takes turns with other callers instead of holding them up. A switch turned on under the older warning has been switched off: read the new warning and turn it on again.
- A pay-as-you-go login you allowed with **Use anyway** does not count as a subscription here. It is treated like a key: if you chose it as the AI to use, picture descriptions go through it whatever the switch says, and each one is billed.

With the switch off and no key set up, the tool answers that the feature is unavailable and names this setting. An agent can check first with the `capabilities` tool; see [Command line and agents](help://cli).

## Schemas, and a smaller budget

`apply` and `create` advertise their `ops`, `cells` and `data` parameters with the typed per-op schema, generated from `ieumoffice guide <domain> --json`. That is precise and not small. A client with a tight context window can ask for plain arrays instead:

```sh
ieumoffice mcp --compact-schemas
GENOFFICE_MCP_COMPACT_SCHEMAS=1 ieumoffice mcp
```

## Why the skill

An agent that does not know the op vocabulary will guess. The skill carries the reference and the design guides — the same material `ieumoffice guide` prints — so the assistant writes ops whose spec it has actually read. Install it from the pane at the top, or with `ieumoffice skill` from a terminal.

## What it can reach in the app

The server is not limited to files on disk. While GenOffice is running, the agent can also work through the window:

- **`open_in_genoffice`** opens a file in a tab and focuses it.
- **`open_documents`** lists every document you have open — id, type, path, and whether it has unsaved changes — then reads one's live content, saves it in place, or closes it, saving first unless you ask it to discard.
- **The content tools** take that id (or path) as their `document` argument, so an edit lands in the tab you already have open and the window switches to show it.

Two things stay out of reach: there is no AI panel, and the in-app update dialog does not apply.

## The Local HTTP server panel

Under **Local HTTP server** the app can run the server itself instead of leaving it to the assistant: an enable switch, a **Port** field, a **Running / Not running** indicator, **Background generation** (write documents straight to a path without opening the UI), and the **Client configuration example** to copy into your client. Opening **Advanced** adds the two connection URLs — Streamable HTTP and the legacy SSE one — a **Health check** URL, and a **Logging** switch that records server and tool activity to a local file you can **Open**, **Refresh** or **Clear** from there. It listens on localhost only.
