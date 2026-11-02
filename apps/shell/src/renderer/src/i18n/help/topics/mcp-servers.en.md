# Connecting MCP servers

An MCP server is a service that offers tools the AI can use from outside the app, such as looking up laws or searching material your team runs. Once you connect a server, the AI windows in GenOffice can call its tools during a chat. You decide, tool by tool, what the AI may use and how.

## Adding a server

1. Open **Settings ▸ Integrations** and press **Add a server** on the **MCP servers** card.
2. Choose how to add it.
   - **Paste settings text**: paste the whole settings text from the server's guide and press **Read**. GenOffice fills in the fields. If one text holds several servers, you confirm them one at a time. If the text reads a key or a value from a PC variable (`${NAME}`), that field is left empty for you to fill in.
   - **Enter it**: type a name and the address. If the server's guide gives you a key, put it in the **Key** field.
3. Read the notice above the add button and press **Add**.
4. Once you register, GenOffice checks the connection right away and gets the list of tools. A server that needs a sign-in waits for you instead of opening the browser. Press **Check connection** to see the list of tools the server offers. For a server that needs a sign-in, press **Sign in with the browser** and finish signing in there.

A server name uses letters, digits, `-` and `_`, up to 24 characters. The AI sees this server's tools under names shaped like `mcp__name__tool`. If a skill calls tools by names of that shape, add the server under the same name the skill uses.

## Servers by address and servers on this PC

- A server **by address** is reached through a web address. Internet addresses must start with `https://`. `http://` works only for this PC and for private-network addresses at home or at work, and you confirm first that keys and document content will travel unencrypted.
- A server **on this PC** is a program GenOffice runs on this PC. The add screen shows the exact program, its arguments and the names of the environment variables passed to it. It runs for the first time only after you press **Allow to run**. If the command changes later, the server stays stopped until you allow it again.
- If a server on this PC needs a program this PC does not have (Node.js, or uv for Python servers), GenOffice asks on the server card in Settings whether to download it. It shows the download size, and nothing is downloaded until you press **Download**. Downloaded programs stay inside GenOffice's data folder, and your PC's settings are not changed.
- A server on this PC starts when it is needed and stops after 10 minutes without use. It also stops when you close GenOffice.

## Choosing what each tool may do

- For each tool, choose **Always allow**, **Ask first** or **Don’t use**.
- At first, tools the server marks as only reading are set to **Always allow**, and all others to **Ask first**.
- When the AI calls an **Ask first** tool, a card appears in the AI window. Look at what will be sent and press **Allow this once**, **Always allow in this conversation** or **Block**. Nothing runs until you press one. Stopping the AI or closing the window counts as blocking.
- If the server changes a tool's description or the values it takes, that tool shows **Needs review** and is hidden from the AI until you look at the change and press **Approve the change**. A change in the guidance the server gives the AI is reviewed the same way.
- New tools on a server are turned on with the same first settings, and the card and the button in the AI window show **New tools: n**. The mark goes away when you open that server's tool list in Settings.

## Using servers in an AI window

- Servers work in the editors' AI windows and in Home's Ask AI. While a server is turned on, a **Connected servers** button appears next to the input.
- Press it to see each server's state and to turn a server off or on for this conversation only. A new conversation starts with every server you turned on in Settings. A server whose connection was never checked shows **Not checked yet**; check it in Settings to get its tools.
- Turning off **Let AI use internet tools** under **Settings ▸ AI Media & Search** also removes every MCP server tool.
- When a skill expects a tool from a server you cannot use right now, the AI says in its answer which step it could not do. **Settings ▸ Skills** also shows the server a skill needs next to that skill.
- The Agent window can use the tools of servers that are turned on, too. The same permissions apply, and a session keeps the settings it started with. See [Agent mode](help://agent-mode).

## Protecting what a server returns

Each server has **Protect what this server returns**, on at first. While it is on, once something that server returned is in a chat, tools that send things out of the app stop for that chat: web search, reading a page by address, the tools of other MCP servers and the like. The same server's tools keep working. Start a new conversation to use the others again. You can turn it off for a server that only gives public material.

The Agent window cannot keep this protection. When a session starts with such a server, the window tells you so.

## What goes where

- When the AI calls a tool, text the AI chose goes to that server. It can include content from the open document and from attachments. Parts hidden from the AI stay hidden.
- What the server returns goes to the AI provider you are using. Add only servers whose operators you trust.
- Keys, sign-ins and environment variable values are kept with your operating system's encryption on this PC. If this PC cannot encrypt them, they are remembered only until you close the app.
- Removing a server deletes its keys and sign-in, and asks the server to end the sign-in if it supports that.
