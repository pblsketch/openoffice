# Settings, language, theme and MCP integrations

## Opening settings

The row at the bottom left of Home opens the settings panel (it reads Connect AI until an AI is connected). It has five sections: Account, AI, General, Integrations and About.

**Account** shows where your Claude and Codex subscriptions stand, and **Manage connections** leads to the AI section. AI has its own articles: [Subscription connection](help://subscription) and [AI models and settings](help://ai-models).

## Language

- The settings offer **21 UI languages**: English, Simplified Chinese, Japanese, Korean, French, German, Spanish, Thai, Indonesian, Russian, Arabic, Portuguese, Italian, Polish, Czech, Dutch, Malay, Hebrew, Hindi, Traditional Chinese, Vietnamese.
- Switching applies immediately and persists; the native menu bar rebuilds with the language.

## Theme

Light / Dark / System. System follows the OS appearance, and the editors re-skin in sync without flashing.

## General

- **AI sidebar position** (left or right), **AI panel text size**, and **Spell check in AI chat**.
- **Open the AI panel in new documents** — off, a new document starts with the panel collapsed and one click away.
- **Auto-save all documents** turns AutoSave on by default in every editor; you can still switch it off for one window.
- **Save Location** with a **Change** button, and **Default app for Office documents** to claim .docx / .xlsx / .pptx for GenOffice.

GenOffice does not collect or send usage statistics, so there is no switch for it.

## AI ▸ Advanced

Closed until you open it; most people never need it. The **AI Model** tab holds API keys and servers you run yourself, for chat. On the **AI Media & Search** tab each capability picks the vendor that serves it, and a vendor's key and base URL are entered once and shared:

- **Web search**, **Image generation**, **Image analysis** and **Video analysis**, each with a provider, a model, a key and a base URL.
- **Local file search** runs on this machine. Under it, **Jev search reranking** is **off by default**. Switch it on and the excerpts of the top 20 local hits — up to 1,200 characters of each document, plus the file and folder names — go to the decision endpoint you pick (Jev via OpenRouter or TypeSafe, Perplexity, Liquid AI d1, Cloudflare, a local engine, or a custom URL) to be reordered by relevance. With it off, nothing leaves the device.
- **Let automatic requests use a subscription** is **off by default**. It decides whether a request from the command line or from a connected coding agent may use your Claude or Codex subscription; see [Connecting a coding agent](help://mcp).

## About

- **Version**, the project's GitHub address, and a line naming the open-source project this app is based on.
- **Update Channel**: Stable or Beta. Changing it takes effect at once and checks for an update; it will not downgrade a Beta install back to Stable.

## Default app bindings

Settings can register GenOffice as the handler for .docx / .xlsx / .pptx / .pdf and friends (platform-level default-app registration; confirm when prompted).

## Third-party notices and updates

- Help ▸ Third-party notices: the full OSS license inventory shipped with the app.
- Menu (☰) ▸ Check for updates (Help ▸ Check for updates on a Mac): triggers a manual check; a newer version prompts to install.

## MCP integration (for advanced users / AI clients)

**Integrations** is the pane that connects GenOffice to a coding agent, and it has its own article: Connecting a coding agent. The short version — pick a route (the command line, or MCP), follow that section, then start a new chat and ask.

Under **Local HTTP server** the app can run the server itself — an enable switch, a port — and **Advanced** adds the health-check URL and the log file. It listens on localhost only.

## Command-line cheat sheet

| Command             | What it does               |
| ------------------- | -------------------------- |
| `ieumoffice <file>` | open a file                |
| `ieumoffice mcp`    | start the local MCP server |
| `ieumoffice --help` | every command and flag     |
