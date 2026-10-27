# Co-editing on your network

People on the same network (LAN) can open one document together, edit it at the same time and see each other's cursors and names. There is no server or account: the PC that shares the document runs the session, and only that PC saves the file.

## Sharing a document

1. Open the document and click **Collaborate** in the editor's toolbar.
2. Enter **My name** and pick **My color**. Others see them next to your cursor.
3. Click **Start sharing**. A 6-digit **PIN** and **This PC's address** appear.
4. Tell the people who join the PIN, and the address if they cannot find the document.

Save the document first if it has unsaved changes. Password-protected documents cannot be shared. **New PIN** gives the document a new PIN; people already in stay.

To stop, open **Collaborate** again and click **Stop sharing**. Everyone who joined keeps an unsaved copy on their PC.

## Joining

1. In any editor, click **Collaborate** and switch to **Join**.
2. Pick the document under **Found**, or type the sharing PC's address in **Address**.
3. Enter the PIN and click **Join**. The shared document opens in a new tab.

While you are in, the person sharing saves the file. Your Save does nothing and tells you so, and the tab never asks to be saved when you close it. **Leave** takes you out of the session. When the session ends, the tab stays open as an unsaved copy that you can save anywhere.

## Editing together

- Each person's cursor or selection shows in their color, with their name.
- Undo takes back only your own edits.
- Some features are off during a session, for example ones that change parts of the document other than its content. The editor tells you when it refuses one.
- In the Hangul editor only the person sharing edits. People who join watch the changes live.
- Plain text and JSON files open in the Markdown editor's raw editor and cannot be shared yet.

## Security

- The PIN is never sent over the network. It is checked with a key exchange, and everything after that is encrypted. Others on the network cannot read the document, the edits or the PIN.
- After 5 wrong PINs from one PC, that PC has to wait 10 minutes. After 20 wrong PINs in total, every shared document gets a new PIN and the person sharing is told.
- Up to 16 people can join one document.
- While you share, your name and the document title are announced on the network so that others can find it.
- The first time you share, Windows Firewall may ask for permission. Allow it on private networks. If you block it, other PCs cannot connect.
