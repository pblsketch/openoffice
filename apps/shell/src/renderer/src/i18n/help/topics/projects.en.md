# Projects

A project is one folder on your PC. Pick a project in an AI panel and the AI works knowing that folder's files, instructions, memory and chats. Keep the documents for one piece of work in one folder, and a chat started in Docs can carry on in Hangul or Slides, without explaining the background again in every document.

## Picking a project

- In every editor's AI panel and in Home's **Ask AI**, the name of the current project sits at the left, below the input. With none picked it reads **No project**.
- Click it to open the list: **Pinned** and **Recent** projects, **New project**, **Add folder** and **No project**. Type in the box at the top to search; when no project matches, you can create a new one with that name.
- Hover a row for pin, **Open folder** and **Remove from list**. Removing a project from the list leaves the folder and its files as they are.
- A project whose folder was moved or deleted shows dimmed as **Folder missing**. Click it and pick the moved folder to carry on with the same project.
- Open a document inside a project folder and that project is already picked. Switch that document to **No project** and it stays that way the next time you open it. A project you pick for a document outside the folder is remembered for that document too.
- The project you pick applies from that panel's next request. Changing it in the middle of a chat starts a new chat; the chat you were in stays where it was.

## New project and Add folder

- **New project**: type a name and a folder of that name is made in your default save folder (`Documents\GenOffice` at first; you can change it in Settings). **Create somewhere else…** lets you choose another place. If a folder of that name already exists, you are asked whether to use it as the project, and **Use this folder** starts with it. If that folder is already a project on your list, it just opens, without asking.
- **Add folder** (**Use an existing folder** on Home's Projects screen): use a folder you already have. Its subfolders are included. A whole drive, your whole user folder, and folders that hold sign-in data or the app's data cannot be chosen.
- Open a document inside a project folder that is not on your list and "This document is in the project folder '…'" appears below the input with a **Use** button. Clicking it is the same as Add folder.
- When a folder you got from someone else already holds instructions or memory, `AGENTS.md` or `CLAUDE.md`, or chats written on another PC, the app shows them once and asks. **View all** lets you read everything first. **Use with instructions** uses all of it. **Use without instructions** keeps those instructions and that memory away from the AI, hides chats from other PCs, and stops adding memory; reading files still works. You can switch later with **Use instructions too** on the project's page. **Cancel**, or closing the question without choosing, does not add the folder.
- After that it does not ask again. If the instructions or memory change outside GenOffice, the AI panel shows "Instructions changed" once, and **View** opens that part of the project's page.

## Instructions and memory

- **Instructions** are the rules for this project, such as "Write reports as bullet points, and never shorten the organisation's name". Write them on the project's page on Home and press **Save**. If the top of the folder has `AGENTS.md` or `CLAUDE.md`, they are read as well, and you can turn them off on the project's page.
- **Memory** is notes the AI writes during chats: facts, preferences and decisions that will help later, one line each with the date. Each time it writes one, the AI panel shows "Remembered: …" with a **Delete** button. If that note has already been deleted, the line reads "Memory removed: …" and has no **Delete** button. It does not ask you first.
- When the memory grows long, the AI panel shows "Memory is getting long" with **Tidy up**. Pressing it merges notes that overlap or are out of date. The earlier version is kept, and **Undo** brings it back. Tidying happens only when you press the button, and it sends one AI request.
- On the project's page you can delete notes, edit the whole memory, and turn memory off. Turned off, nothing new is written and the existing memory is still read.
- Very long instructions lose their end part, and the AI panel tells you so. Memory is always sent in full, however long.

## Files the AI sees

- With every request the AI gets the project's name, its instructions and memory, and a list of the names of the files in the folder. It reads a file's contents itself when it needs them, the same way as an attachment, so parts hidden from AI stay hidden.
- It does not read open documents with unsaved changes, hidden files whose names start with a dot, or the `.ieumoffice` folder.
- To keep a file away from the AI, press **Hide from AI** in the Files part of the project's page. You can undo it. The file still shows in Home search results.
- In folders synced by OneDrive, Google Drive and the like, files that are not downloaded to this PC show as "Not on this PC". When the AI wants to read one, you are asked first whether to download it.
- Type `@` in the input and "Files in this project" appears after the open documents. Picking one attaches it. See [The AI assistant panel](help://ai-panel).
- New documents the AI makes in a project are saved in the folder of the current document, or at the top of the project folder when you ask from Home. If the name is taken, `(2)` is added so no file is replaced.

## Chats

- An AI panel with a project picked shows the current chat's title at the top. Click it for this project's chat list, a search box and **New chat**. Any chat in the list can be picked up again in any editor.
- What was done in another editor shows as one line, such as "Ran 3 tools in Hangul 'report.hwp'". The AI only uses the tools of the editor you are in.
- Opening a document shows the chat last used in that document. If two windows have the same chat open, a message sent in one shows up in the other right away.
- Chats written on another PC are marked **Other PC**.
- You can rename or delete chats in the list. A deleted chat goes to the trash.
- Chats a document had from before this feature are at the bottom of the list, under **Earlier chats in this document**.
- Chats with **No project** are saved per document as before. In Home's Ask AI without a project, the chat ends when you close the app.

## The project's page on Home

**Projects** in Home's sidebar is where you make a **New project** or **Use an existing folder**, and open one to manage it.

- **Header**: the name (renaming it does not rename the folder), the folder path, **Open in File Explorer** (**Show in Finder** on a Mac), and the status. When the project is used without instructions, **Use instructions too** appears.
- **Instructions**: the instructions box, and the `AGENTS.md` and `CLAUDE.md` read with it.
- **Memory**: the list of notes, **Edit all**, **Tidy up**, memory on or off.
- **Files**: the files the AI sees and the ones kept from it. Click a file name to open the file.
- **Chats**: this project's chats. Click one to open the document it was last used in and carry on in that AI panel.
- This screen reads the folder again each time it is shown, so a note the AI has just remembered appears without leaving it. If the instructions or memory file changed outside GenOffice while you were editing it, **Save** asks first: **Reload** reads the changed file, and **Save anyway** overwrites it with your edits.

## What stays in the folder, and things to know

- Instructions, memory and chats are kept as text files in a `.ieumoffice` folder inside the project folder. Move the folder or copy it to another PC and they go along. On another PC, pick it once with **Add folder** in an AI panel or **Use an existing folder** on Home's Projects screen.
- The `.ieumoffice` folder is made only when there is something to write. You can open and edit its files in Notepad.
- What you type in a chat can end up in the memory. To keep something out, delete it with **Delete** on the "Remembered" line, or turn memory off.
- If you pick a synced folder as a project, its instructions, memory and chats are uploaded to that service too. The app tells you once, the first time you pick it.
- In a shared folder used by several people, memory and chats can get mixed.
- In a folder the app cannot write to, such as a read-only one, instructions and file reading still work but chats and memory are not saved. The AI panel tells you so.
- The Agent window does not use projects yet. An agent can change the files in a folder's `.ieumoffice` too, so in a folder with material you do not know, use one of the ways that ask first. See [Agent mode](help://agent-mode).
