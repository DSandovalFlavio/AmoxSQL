# Command palette

**🌐 English · [Español](../../es/editor/command-palette.md)**

> One keystroke to reach any action in AmoxSQL: type, filter, and run without hunting for a button with the mouse.

## What it is

The command palette is a quick-access menu that appears in the center of the screen with **Ctrl+Shift+P**. Type a few letters, the list filters instantly, and you press Enter on the action you want. It's the fastest way to do anything in the app without remembering where each button lives.

Actions are **grouped by category** (AI Analysis, Query, File, Navigation, Settings, View, DBT, Help & Tours) and, where one exists, each shows its **keyboard shortcut** on the right — so you learn shortcuts as you use it.

## When to use it

- When you know what you want to do but not where the button is.
- For actions without their own shortcut (create a new Data Flow, open DBT Studio, replay a tour).
- When you prefer the keyboard to the mouse and want to move fast between actions.

## How to use it

1. Press **Ctrl+Shift+P** at any time.
2. Start typing: the filter searches by **action name** and **category** (for example, type "query" and you'll see everything in the Query group).
3. Navigate with the **↑ / ↓** arrows (you can also move the cursor with the mouse).
4. Press **Enter** to run the highlighted action, or click it.
5. **Esc** closes the palette without doing anything.

<!-- 📷 CAPTURE: docs/images/editor/command-palette.png — command palette open with actions grouped by category -->

## Category reference

| Category | Example actions |
|---|---|
| **AI Analysis** | Analyze current table (EDA), Verify data quality, Investigate metric drivers, Generate chart story |
| **Query** | Run query (Ctrl+Enter / F5), Analyze plan (Ctrl+Shift+A) |
| **File** | Save (Ctrl+S), Save As (Ctrl+Shift+S), New SQL query (Ctrl+N), New Notebook (Ctrl+Shift+N), New Chain, Close tab (Ctrl+W) |
| **Navigation** | File explorer (Ctrl+Shift+E), Database schema (Ctrl+Shift+D), Extensions, Open/close Assist (Ctrl+L), Next/previous tab |
| **Settings** | Open settings (Ctrl+,), Switch theme, Show keyboard shortcuts |
| **View** | Zoom in / out / reset UI, Toggle minimap, Toggle word wrap |
| **DBT** | Open DBT Studio |
| **Help & Tours** | Replay any onboarding tour from wherever you are |

> **AI Analysis** actions appear when an AI context is available; they launch assistant skills over the current table or analysis (see [Skills](../ai/skills.md)).

## Tips & gems

- **Learn shortcuts for free:** each action shows its shortcut on the right; if you use one often, memorize the shortcut and skip the palette.
- **Filter by category:** typing a group name ("view", "file") is a quick way to narrow the list.
- **Replay any tour:** the Help & Tours group lets you repeat the onboarding walkthroughs at any time.
- **All keyboard:** open (Ctrl+Shift+P), filter, arrow through, Enter — without touching the mouse.

## Shortcuts / formats

| Shortcut | Action |
|---|---|
| Ctrl+Shift+P | Open/close the command palette |
| ↑ / ↓ | Move the selection |
| Enter | Run the highlighted action |
| Esc | Close |

## Related

- [SQL editor](sql-editor.md) · [History & bookmarks](history-and-bookmarks.md) · [Layout, tabs & panes](layout-tabs-and-panes.md)
- [Keyboard shortcuts](../reference/keyboard-shortcuts.md) · [Skills](../ai/skills.md)
