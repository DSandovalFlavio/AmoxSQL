# File explorer

**🌐 English · [Español](../../es/data/file-explorer.md)**

> Your project's file tree: create, rename, move, and open files, and import data into the database — all from the sidebar, without leaving AmoxSQL.

<!-- 📷 CAPTURE: docs/images/data/file-explorer.png — File explorer panel showing the action header, search box, breadcrumb, and the file list with per-type icons and git badges -->

## What it is

The file explorer is the left-hand panel that browses your project folder (the workspace). It shows your `.sql` scripts, `.sqlnb` notebooks, `.amoxvis` charts, `.amoxdeck` decks, data (CSV, Parquet, JSON, Excel), and any other file, each with a color-coded icon by type.

It's your entry point to data: from here you open files, import them into the database, query them directly, or copy their column names. It also manages the file lifecycle (create, rename, move, duplicate, delete) without touching your operating system's explorer.

Database files (`.duckdb`, `.db`) are hidden on purpose: you connect them from the project screen, you don't open them as text. If your project is a git repository, each file shows its status with a badge.

## When to use it

- To open any project file, or create a new one.
- To bring a CSV/Parquet/JSON/Excel into the database as a table (see [Importing data](importing-data.md)) or query it in place without importing.
- To reorganize the project: move, rename, duplicate, or bulk-delete files.
- For the schema already loaded in the database, use the [Database explorer](database-explorer.md); this panel is for files on disk.

## How to use it

### Navigate
1. Click a folder to enter it; use the top **breadcrumb** or the **Up** button (arrow) to go back.
2. Type in **Search files…** to filter the current folder by name.
3. The **Refresh** button re-reads the folder from disk.

### Open a file
Opening behavior depends on type:
- `.sql`, `.sqlnb`, `.md`, `.amoxdeck` → open in the editor/notebook/deck.
- `.amoxvis` → opens the chart editor.
- `.xlsx`/`.xls` → **always** open as a Direct Query.
- `.csv`, `.parquet`, `.json` → follow your default-data-file-action setting (preview or direct query).

### Create files and folders
The panel header has buttons for **New SQL**, **New Notebook**, **New Markdown**, **New Report Flow Deck**, and **New Folder**. On a folder, the context menu adds **New File Here** and **New Folder Here**.

### Sort and group
The sort button **cycles** through five modes: default (folders first), by name, by category, by extension, and by size. In category/extension mode, files are grouped under headers with a count.

### File operations
Right-click (or the three-dots button) opens the context menu:
- **Cut / Copy / Paste** (also `Ctrl+X` / `Ctrl+C` / `Ctrl+V`).
- **Duplicate**, **Move To…** (folder picker), **Rename** (`F2`).
- **Add to .gitignore**, **Delete** (bulk-deletes if several are selected).
- **Reveal in Explorer** (opens the folder in your OS), **Copy Relative Path**, **Copy Name**.

You can **drag** a file onto a folder to move it. Select several with `Ctrl+click` or `Shift+click` to act in bulk.

### Actions on data files
For CSV/TSV/Parquet/JSON/Excel, the menu adds data actions:
- **Import to Database…** — creates a table (see [Importing data](importing-data.md)).
- **Quick Preview** — 100 rows in a modal (CSV/Parquet/JSON).
- **Direct Query** — opens a SQL tab with the `SELECT * FROM '<path>'` (or `read_xlsx(...)` for Excel) plus column comments; for CSV/Parquet/JSON it runs immediately.
- **Copy Column Names** — to the clipboard as a SQL comment (per sheet for Excel).
- **Metadata for AI…** — generates file context (see [Metadata for AI](../ai/metadata-for-ai.md)).

On a `.sql`, the menu offers **Export results…**, which reads the file's query and opens the export dialog (see [Saving results](../results/saving-results.md)).

## Reference

### Header and context menu
| Action | What it does |
|---|---|
| New SQL / Notebook / Markdown / Deck / Folder | Creates a file of that type in the current folder |
| Sort (cycles) | default · name · category · extension · size |
| Search | Filters the current folder by name |
| Cut / Copy / Paste | Move or copy files (`Ctrl+X/C/V`) |
| Duplicate · Move To… · Rename | Copy with suffix · pick destination folder · `F2` |
| Add to .gitignore | Adds the file/folder pattern to `.gitignore` |
| Reveal in Explorer | Opens the location in your operating system |
| Copy Relative Path · Copy Name | Copies the path (with `/`) or just the name |
| Delete | Deletes the file or the whole selection (with confirmation) |

### Git status badges
| Badge | Meaning |
|---|---|
| M | Modified |
| A | Added |
| D | Deleted |
| ? | Untracked |

## Tips & gems

- **Excel is always a Direct Query:** opening an `.xlsx` doesn't import it; it scaffolds a `read_xlsx(...)` query so you decide.
- **File size shows inline** next to each file (can be hidden in Editor settings).
- **Copy Column Names is sheet-aware:** on an Excel file it copies each sheet's columns labeled by name.
- **The Google Sheets section** lives at the bottom of the panel; connect sheets by URL (see [Google Sheets](google-sheets.md)).

## Shortcuts and related formats

| Shortcut | Action |
|---|---|
| F2 | Rename the selected file |
| Delete | Delete the selection |
| Ctrl+C · Ctrl+X · Ctrl+V | Copy · Cut · Paste |
| Ctrl+click · Shift+click | Multi-select (individual · range) |

## Related

- [Database explorer](database-explorer.md) · [Importing data](importing-data.md) · [Google Sheets](google-sheets.md)
- [Saving results](../results/saving-results.md) · [Metadata for AI](../ai/metadata-for-ai.md)
- [File formats](../reference/file-formats.md) · [Configuration](../reference/configuration.md)
