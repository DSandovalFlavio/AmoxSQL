# Keyboard shortcuts

**🌐 English · [Español](../../es/reference/keyboard-shortcuts.md)**

> AmoxSQL's complete keyboard-shortcut set, grouped by category. The same list lives in Settings → Shortcuts.

## What it is

AmoxSQL is built to be driven from the keyboard. This page lists every available shortcut, exactly as it appears in the **Shortcuts** tab of the Settings modal (open Settings with **Ctrl+,**). Shortcuts are app-global except those in the **Editor** section, which act when focus is in the code editor.

## General

| Shortcut | Action |
|---|---|
| Ctrl + K | Command palette |
| Ctrl + P | Jump to a file, table or column |
| Ctrl + Shift + P | Command palette (alias) |
| Ctrl + , | Settings |
| Ctrl + Shift + / | This list |

## Files

| Shortcut | Action |
|---|---|
| Ctrl + S | Save |
| Ctrl + Shift + S | Save as… |
| Ctrl + N | New SQL query |
| Ctrl + Shift + N | New notebook |
| Ctrl + Shift + F | Search the whole project |

## Queries

| Shortcut | Action |
|---|---|
| Ctrl + Enter | Run (the selection, or the whole script) |
| F5 | Run |
| Ctrl + Alt + Enter | Run only the statement under the cursor |
| Esc | Stop this tab's query (when nothing else is open) |
| Ctrl + Shift + A | Analyse the execution plan |
| Ctrl + E | Analyse the execution plan (alias) |
| Ctrl + Shift + H | Query history |
| Ctrl + Shift + R | Run both split panes |
| Ctrl + Shift + Enter | Run all cells |

## Tabs

| Shortcut | Action |
|---|---|
| Ctrl + W | Close the tab |
| Ctrl + Shift + T | Reopen the last one you closed |
| Alt + P | Pin or unpin the tab |
| Ctrl + Tab | Go to the most recently used |
| Ctrl + Shift + Tab | The other way round |
| Alt + Left | Back through visited tabs |
| Alt + Right | Forward through visited tabs |
| Ctrl + \\ | Split the screen in two |
| Ctrl + Shift + \\ | Duplicate the tab to the other pane |

## Panels

| Shortcut | Action |
|---|---|
| Ctrl + B | Show or hide the sidebar |
| Ctrl + L | Show or hide Assist; with text selected, ask about it |
| Ctrl + Shift + E | Go to the file explorer |
| Ctrl + Shift + D | Go to the database schema |

## Editor

| Shortcut | Action |
|---|---|
| Ctrl + F | Find |
| Ctrl + H | Find and replace |
| Shift + Alt + F | Format the SQL |
| Ctrl + / | Comment or uncomment the line |
| Ctrl + D | Select the next match (several cursors) |
| Shift + Alt + Down | Duplicate the line |
| Alt + Up | Move the line up (Alt+Down, down) |
| Ctrl + Shift + K | Delete the line |
| Ctrl + Z | Undo (each tab keeps its own history) |
| Ctrl + Shift + Z | Redo |

## View

| Shortcut | Action |
|---|---|
| Ctrl + = | Zoom in |
| Ctrl + - | Zoom out |
| Ctrl + 0 | Reset zoom |
| Escape | Close the dialog on top |

## Tips & gems

- **The command palette rules:** **Ctrl+K** opens searchable quick actions — the one shortcut to remember when you can't recall the rest.
- **Selection = partial run:** with text selected, **Ctrl+Enter** runs just that selection.
- **Global zoom:** **Ctrl +/-/0** scales the whole interface, not only the editor.
- **The reference is always at hand:** **Ctrl+Shift+/** opens this very list inside the app.

## Related

- [SQL editor](../editor/sql-editor.md) · [Command palette](../editor/command-palette.md)
- [Configuration](configuration.md) · [Notebooks](../notebooks/notebooks.md)
