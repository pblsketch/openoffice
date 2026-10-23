# Tabs and window management

Every open file shares one window; the tab strip at the top switches between them, browser-style.

![The tab strip: Home plus two documents](img/tabs.png)

## Basics

- **Switch**: click a tab, press **Ctrl+Tab** (next) / **Ctrl+Shift+Tab** (previous), or scroll the wheel over the strip.
- **Close**: the × on the tab, or ⌘W/ctrl+W. Unsaved changes ask first.
- **New**: the + at the right end of the strip.
- **Activation is immediate**: pressing a tab switches as soon as it is pressed, without waiting for the click to finish.

## Rename: double-click a tab

**Double-click any file tab** and the title turns into an inline input: Enter commits, Escape cancels, blur commits; the Enter that confirms an IME candidate is not mistaken for a commit. The rename goes through the same safety checks as Home's row rename (illegal characters, name conflicts), renames the file on disk and refreshes the recents list.

## Drag to reorder

Hold and drag a tab sideways to reorder; neighbours slide aside live and the order settles on release. A 4-pixel dead zone keeps plain clicks from wiggling tabs.

## Context menu

Right-click a tab for **Open in New Window** — offered on every document tab that can be torn off — and **Close**, greyed out on a tab that cannot be closed. Both follow the app language.

## Tear off into a window

**Drag a tab out of the strip** (or use Open in new window) and it becomes its own window carrying the live document; drag it back to dock it into the strip again. A detached window is a full peer — keep editing and saving there.

## The all-tabs list

When tabs overflow, the small tab-bar icon at the right end of the strip opens the full list (a native menu, never covered by the content area); pick with the arrow keys.

## The toolbar row inside every editor

Each editor tab has a toolbar row at the top (exact layout varies a little per editor):

- **Save** (⌘S/ctrl+S) and **Save As**.
- **Undo / Redo**: multi-level; each editor keeps its own history.
- **Find** (ctrl+F): opens that editor's find panel.
- **AutoSave** toggle: when on, changes are written to disk on a timer; when off, only manual saves write (the unsaved marker on the tab/title reminds you).

## The Home tab

The leftmost Home tab cannot be closed; to get back from any editor, click it or use File ▸ **Back to Home**.

## Split view: two panes

**Drag a tab to the right edge of the window**: the tab follows as a small floating copy while a "Split here" hint appears near the edge, and dropping it gives two side-by-side panes. Drop it on the bottom edge instead to get two stacked ones. The tab's right-click menu does the same with **Split Right** and **Split Down**, and on a tab that lives in a pane it also offers **Unsplit**.

- The dragged tab lands in the pane you dropped it on; the other pane keeps the document you were viewing a moment before.
- When it is the only document open, the same document is placed in both panes as a copy, so you can look at the beginning and the end together. A new document that has never been saved splits the same way.
- Drag the **divider** between the panes to change their share, double-click it for an even split, or push it all the way to one end to close that pane; the document stays open as a tab.

## One AI window that follows the focus

- Only one AI window is visible. The pane you are working in shows its AI window; the other pane's folds into a rail, and clicking a pane brings that pane's AI window forward.
- While folded, that pane's conversation and any AI work still running stay alive. Conversations are kept per document.
- **Two copies of the same document**: after saving in one pane, saving from the other asks "This document has changed elsewhere" before writing. AutoSave waits quietly instead.
- Starting the app with no file brings back the last pair of split documents exactly as it was left; starting it with a file opens just that file.
- Home, help and present (preview) tabs cannot enter a pane; while one of them is up the panes hide for the moment and come back when you return to a document tab.

Three or more panes, splitting inside a detached window, and keeping the two copies in live sync are left for later.
