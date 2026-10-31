# Google Drive

Connect Google Drive to open the Drive files you choose in GenOffice and edit them. When you save, the file goes back to Drive. GenOffice can open only the files you choose in Google's window; it does not see the rest of your Drive.

## Connecting

1. Open **Settings ▸ Integrations**.
2. Read **Before using Drive files with AI**, turn model training off in the AI accounts you use with Drive files, then tick that item.
   - Claude: in Claude's **Settings ▸ Privacy**, turn off model training.
   - ChatGPT and Codex: in ChatGPT's **Settings ▸ Data controls**, turn off **Improve the model for everyone**.
   - API key providers do not use API data for training by default.
   - Free AI connections (OpenRouter free models, Gemini) are never given Drive files.
3. Press **Connect Google Drive**. Google's sign-in page opens in your browser. Sign in and allow access.
4. Come back to GenOffice. The card shows the account you connected.

Google does not allow Drive files to go to an AI service that uses them to train its models, so you cannot connect or choose files until the item is ticked.

The sign-in is kept on this PC with the encryption your operating system provides for your user account (Windows' own protection, the macOS keychain, or a desktop keyring on Linux). If this PC cannot encrypt it, the connection lasts only until you close the app.

## Opening Drive files

- Press **Google Drive** in the home sidebar, then **Choose from Google Drive**.
- Google's file picker opens in your browser. Choose the files to open (several at once is fine); GenOffice comes back and opens them in the right editor.
- Files you chose once stay in the **Files you chose** list. Open them again from there, or search them by name and content.
- Formats GenOffice can't open are dimmed. Google Docs, Sheets and Slides open as Word, Excel and PowerPoint files.

## Saving back to Drive

- Save as usual. After a moment the file is uploaded to Drive.
- If someone changed the file in Drive after you opened it, you're asked whether to overwrite the Drive file, save a copy to Drive, or keep the change on this PC only.
- A file you can only view is saved to Drive as a copy, or kept on this PC.
- A Google document is left as it is. Your changes are saved as an Office file in the same folder, or in My Drive when that folder can't be written to.
- If an upload fails, your changes stay on this PC and GenOffice tries again, including the next time the app starts.

## AI and Drive

- In the AI panel of the Word, Excel, PowerPoint, HTML, mind map and Hangul editors, press **Attach from Google Drive** next to the attach button to choose files in Google's window in your browser and attach them like files from this PC. Up to 20 at a time.
- While **Let the AI find and read files in Drive** is on (it turns on when you connect), the AI in every editor can search and read the Drive files you chose in GenOffice. For example: "Find last month's meeting notes in my Drive and summarize them." If the file isn't found, choose it on the home screen first.
- What the AI reads goes to the AI provider you're using. Parts hidden from AI stay hidden.
- While the AI in use is a free connection, attaching from Drive and the AI's Drive reading don't run.
- The AI cannot change, delete or share Drive files.
- Once content read from Drive is in a chat, that chat stops using web search, image search, reading pages by web address and inserting pictures by web address. Start a new chat to use them again.

## Disconnecting

Press **Disconnect** under **Settings ▸ Integrations**. GenOffice removes the sign-in from this PC and asks Google to revoke its access. Copies of files already on this PC stay. You can also remove access at any time under **Third-party connections** in your Google Account.
