# Skills

A skill is a set of working instructions for the AI. Write down something you do again and again once — the steps for tidying meeting notes, the tone of a report, the points to check every time — and you can call it in the AI panel, or the AI picks it up by itself when it fits. A skill is a folder with a `SKILL.md` file in an open format, so a skill made in GenOffice also works as it is in Claude Code or Codex.

## Turning skills on and off

**Settings ▸ Skills** lists the skills on this PC, grouped by where they come from. Each skill is shown by its name, the way coding agents show it. Use the search box at the top to find one by name or description.

| Source                   | What it holds                                     | At first |
| ------------------------ | ------------------------------------------------- | -------- |
| **Built-in**             | The 5 skills that come with GenOffice             | On       |
| **My skills**            | Skills you added or made (`~/.ieumoffice/skills`) | On       |
| **Claude skills folder** | The skills in `~/.claude/skills`                  | Off      |
| **Claude plugins**       | The skills of installed Claude plugins            | Off      |
| **Codex skills folder**  | The skills in `~/.agents/skills`                  | Off      |

- The switch turns a skill on or off. The same setting applies to the AI panel of every editor, Ask AI on Home, and the agent window.
- For a skill that is on, choose **AI decides** or **Only when called**. It starts as AI decides. With Only when called, the skill is used only when you call it yourself.
- Skills from different sources can share a name. The source label on each row tells them apart.
- The more menu has **View contents**, **Edit** (my skills only), **Export (zip)** (my skills only) and **Open folder**.
- **Move to trash** moves one of my skills to the system trash, where you can restore it.
- A built-in skill is hidden instead of removed: choose **Hide**. **Show again** at the bottom of the list brings it back as it was at first.
- To change a built-in skill or one from another program, choose **Copy to my skills**. The copy appears in my skills and the original is turned off.
- Exporting a skill with a template puts the template document in the zip too. Check the document holds no personal information before you export it.

## Adding a skill

1. In **Settings ▸ Skills**, click **Add**.
2. Choose **From a folder**, **From a zip file** or **From a GitHub link**. For GitHub, enter the address of a public repository or `owner/repo` and click **Find**.
3. Check the skills found in the preview. It shows the number and size of the files, whether there are scripts, the web addresses in the text, and the license file.
4. Tick only the skills to install and click **Install**. Installed skills start turned on.

Below the preview it always says: "Install skills only from sources you trust. A skill gives the AI instructions, and in the agent window it can run scripts." Read a skill from an unknown source before you install it.

- If my skills already have one with the same name, choose **Replace** or **Skip** on that row.
- When it downloads from GitHub, GenOffice connects only to `github.com`, `api.github.com` and `codeload.github.com`, and sends no sign-in data. If the archive is too large or fails the safety checks, nothing is installed.
- **New skill** opens an empty editor where you write the name, description and instructions yourself.

## Checking for updates

- For a skill installed from GitHub, **Check for updates** in the more menu looks for new content. GitHub is contacted only when you click it.
- If nothing changed, it says "Up to date". If something did, review the changed files and the preview, then click **Update**.
- If you edited the skill yourself after installing it, "Your own edits will be lost" is shown as well.
- Updating keeps the skill's on/off state and its AI decides / Only when called choice.

## Calling a skill in the AI panel

1. Type `/` or `$` at the start of the AI input box or right after a space. The list of skills that are on appears.
2. Keep typing to narrow the list. For example, `/meet` finds `meeting-minutes`. Words in the description work too.
3. Pick one with the arrow keys and press Enter or Tab. The skill becomes a chip above the input box.
4. Write what you want and send. GenOffice adds the skill's contents to the request.

- In the Excel AI panel, `$` opens the list only at the very start of the input box, so it does not get in the way of cell addresses such as `$A$1`.
- You can add several chips and remove one with ×. Esc only closes the list; it does not stop an AI run.
- **Manage skills…** at the bottom of the list opens **Settings ▸ Skills**.
- Chips stay on the message you sent and in the saved chat. When you reopen a chat and send again, the skill's current contents are read again. A skill removed or turned off in the meantime shows as "Unavailable" on its chip.
- If the skill text to send along is too long, "The skills are too large to send along" appears and nothing is sent.

## Skills the AI uses on its own

- For skills that are on and set to AI decides, the names and descriptions are given to the AI as a list. When one fits the request, the AI takes its contents and uses it.
- When the AI uses a skill, the chat says "Used the 〈name〉 skill".
- The AI decides from the description whether to use a skill. A description that says when the skill is meant to be used helps it choose well.

## Making a skill by asking

1. In the AI panel, say something like "Save what we just did as a skill" or "Make a skill that writes reports in our house style".
2. The AI picks out the steps and rules worth repeating and shows a **New skill** card. Values used only this once, such as names and dates, stay out of the instructions.
3. Check and edit the name, description and instructions on the card. The name is what the skill list shows and what you type after `/`: lowercase English letters, digits and hyphens.
4. Click **Save**. The new skill is added to my skills, turned on, and appears in the `/` list right away.

- No file is written until you click **Save**. If you click **Cancel**, the chat keeps it only as an "Unsaved skill proposal".
- You can also ask to change an existing skill, such as "Change the meeting minutes skill to the way we do it". The card is then titled **Change skill**. One of my skills is overwritten with **Replace**; a built-in skill or one from another program is saved as a copy in my skills and the original is turned off.

## Adding a document as a template

When you make a skill in an editor's AI panel, the current document can go along as a template. Tick **Save this document along as a template** on the card, and the button becomes two.

- **Make a blank template**: a copy of the document opens in a new tab, "Template preview - 〈title〉", and the AI in that tab clears the filled-in values such as names, dates and personal information. Look the tab over, change more by hand, then click **Save this tab as the template**; the tab as it is at that moment becomes the template.
- **Save the document as it is**: saves the current document as the template unchanged. If the document has parts you hid from the AI, this button is blocked, so hidden content does not end up in the template as it is.
- The template is kept as a copy of the document inside the skill folder. The original document does not change.

## Using a skill with a template

- A skill with a template shows **Has a template** in the list.
- Call it as a chip and send, and a copy of the template opens as a new untitled document; the AI in that tab carries on with your request. The original panel keeps "Working with the template in a new tab" and **Go to the tab**.
- When the AI picks a template skill by itself, no tab opens at once. The chat shows an **Open a new document from this template** button instead.
- You usually choose where the new document goes the first time you save it. The Markdown and HTML editors save to the default folder as they always do. The template file itself stays as it was.

## Skills with scripts

- In the regular AI panel and in Ask AI on Home, a skill's scripts never run. Only the skill's text reaches the AI.
- A skill with scripts shows **Has scripts · works fully in the agent window**, and adding it as a chip shows "This skill's scripts do not run in the regular AI panel". Sending is not blocked.
- To use the scripts too, call the skill in the agent window. See [Agent mode](help://agent-mode).

## Built-in skills

| Skill             | What it does                                                                          |
| ----------------- | ------------------------------------------------------------------------------------- |
| `meeting-minutes` | Turns meeting notes into minutes that show the decisions and action items             |
| `internal-comms`  | Writes announcements, newsletters, progress updates, FAQs and other internal messages |
| `humanizer`       | Finds phrasing that sounds AI-written and makes it natural                            |
| `copy-editing`    | Goes over English text you have written and makes it clearer and tighter              |
| `find-skills`     | Finds skills you need in the agent window and suggests installing them                |

`copy-editing` is made for English marketing text. `find-skills` works only in the agent window.

## In the agent window

- The agent window follows the same on/off settings in **Settings ▸ Skills**, and you call skills in its input box with `/` or `$` the same way.
- Skills in the project folder's `.claude/skills` and `.agents/skills` are used in that session without being turned on.
- The skill list is fixed when the session starts. If you turn skills on or off during a session, "Changed skills apply from the next session" appears.
- When the agent makes a skill, the same card appears in the window. For the template, choose among the documents open in tabs and the files in the project folder.
- When the agent finds a skill worth installing, an install proposal appears. Open it with **Open preview** and click **Install** yourself; nothing is installed otherwise. An installed skill is available from the next session.
