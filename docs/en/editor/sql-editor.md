# SQL Editor

**🌐 English · [Español](../../es/editor/sql-editor.md)**

> The code editor at the heart of AmoxSQL: write, run, and debug DuckDB SQL with schema-aware autocomplete, syntax highlighting, and one-shortcut execution.

## What it is

The SQL editor is the core of the IDE. It's built on a professional code editor with DuckDB-specific syntax highlighting, and it talks live to the local engine to give you real autocomplete and validation — not guesses.

Every `.sql` file you open is edited here, inside a **tab** in a pane. You can keep several tabs open and split the view into two panes (see [Layout, tabs & panes](layout-tabs-and-panes.md)). The **results** panel appears below the editor when you run a query (see [Results table](../results/results-table.md)).

Highlighting understands the full DuckDB syntax — including `PIVOT`/`UNPIVOT`, `QUALIFY`, and `JOIN` modifiers — as well as Jinja/dbt template blocks (`{{ }}`, `{% %}`, `{# #}`) when you edit dbt models.

## When to use it

- To write and run any SQL query against your database or against data files.
- When you want a single, focused query. For a narrated analysis with multiple cells and prose, use a [Notebook](../notebooks/notebooks.md); to chain transformation steps visually, use [Data Flow](../data-flow/data-flow.md).

## How to use it

### Run a query
1. Type your SQL in the editor.
2. Press **Ctrl+Enter** (or the **Run** button in the action bar). If you have text **selected**, only the selection runs; otherwise the whole buffer runs.
3. Results appear in the bottom panel. A **Stop** button cancels a running query.

> If your file contains several `;`-separated statements, AmoxSQL offers to convert it into a Notebook (one cell per statement) instead of running them blindly.

### Editor action bar
| Action | What it does |
|---|---|
| **Run / Stop** | Run the query (selection or all) · cancel a running query |
| **Analyze** | Open the [execution plan](../results/execution-plan.md) (EXPLAIN / ANALYZE) |
| **Save** ▾ | Save the file · **Save As…** to save under a new name |
| **Export** ▾ | **Export data to file…** (re-runs the full query to CSV/Parquet/Excel/cloud) · **Metadata for AI…** (see [Metadata for AI](../ai/metadata-for-ai.md)) |
| **History** | Open the [query history](history-and-bookmarks.md) |
| **Variables** | Show/hide the [variables](variables.md) `${...}` panel |
| **Assist** | Open the panel's [AI Assistant](../ai/editor-assistant.md) |

The bar also shows "Edited Xs ago · Ran Xs ago" for orientation.

> **Export belongs to the query.** The editor's **Export** button exports the full result of the **current editor query** (re-running it), whereas the **Download** button in the results panel downloads only the rows already loaded in the table. See [Saving results](../results/saving-results.md).

### Autocomplete
As you type, the editor suggests DuckDB tables, columns, and functions based on the clause context (for example, it won't offer aggregates inside a `WHERE`). It even resolves the output columns of CTEs and subqueries by asking the engine itself. It's a topic of its own: see [Autocomplete](autocomplete.md).

### Debugging CTEs
Every `name AS (` definition shows a ▶ glyph in the gutter: click it to run the query truncated up to that CTE and inspect its intermediate result. See [Debugging CTEs](cte-debugging.md).

### Format SQL
Press **Ctrl+K** (or **Shift+Alt+F**) to format the selection or the whole document. The style (tab width, keyword case, lines between queries) is set in Settings → Editor.

### Find and replace
**Ctrl+F** opens find; **Ctrl+H** opens find & replace within the editor.

### Inline errors
When a query fails, AmoxSQL highlights the error's line/column directly in the editor and reveals it. The marker clears as you edit.

## Editor options reference

Configurable in **Settings → Editor** (see [Configuration](../reference/configuration.md)):

| Option | What it controls |
|---|---|
| Font family & size | Code typography (6 bundled families) |
| Minimap | Navigation map on the right |
| Word wrap | Line wrapping |
| Line numbers | Show/hide |
| Tab size | Indentation width |
| Mouse-wheel zoom | Ctrl + wheel to zoom in/out |
| Bracket-pair colorization | Color matched brackets |
| Indent guides | Vertical indentation lines |
| Cursor style/blink | Cursor appearance |

The view state (cursor and scroll) is remembered per tab, so switching away and back leaves you where you were.

## Tips & gems

- **Run only part of a query:** select a fragment and **Ctrl+Enter** runs just that selection.
- **Derived columns in autocomplete:** the editor resolves columns like `SELECT a + b AS total` from a CTE by asking DuckDB for its real schema — something a purely syntactic analyzer can't do.
- **Function hover:** hover over a DuckDB function to see its signature, category, and description.
- **The theme follows your settings:** the editor adopts the active theme and accent color live (see [Themes & appearance](../user-guide/themes-and-appearance.md)).

## Keyboard shortcuts

| Shortcut | Action |
|---|---|
| Ctrl+Enter · F5 | Run (selection or all) |
| Ctrl+S · Ctrl+Shift+S | Save · Save As |
| Ctrl+Shift+A | Analyze plan |
| Ctrl+K · Shift+Alt+F | Format SQL |
| Ctrl+F · Ctrl+H | Find · Find & replace |
| Ctrl+Shift+H | Query history |
| Ctrl+/ · Ctrl+D · Ctrl+Shift+K | Comment · duplicate line · delete line |

Full set in [Keyboard shortcuts](../reference/keyboard-shortcuts.md).

## Related

- [Autocomplete](autocomplete.md) · [Debugging CTEs](cte-debugging.md) · [Variables](variables.md)
- [Results table](../results/results-table.md) · [Execution plan](../results/execution-plan.md)
- [Notebooks](../notebooks/notebooks.md) · [Layout, tabs & panes](layout-tabs-and-panes.md)
