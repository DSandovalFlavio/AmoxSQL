# What's new in 6.0

**🌐 English · [Español](../../es/user-guide/whats-new-6.md)**

> 6.0 moves the engine to **DuckDB 2.0** and tidies the interface: a seven-entry sidebar, tabs and files you can find, an accent per theme, and what the new engine makes possible — typed variables, JSON with no fixed shape, sub-schemas and an execution plan that tells you what it skipped.

## Before you upgrade: coming from 5.x

| What | What happens in 6.0 |
|---|---|
| **Your `.duckdb` databases** | They open as they are, and still open in 5.x even after 6.0 writes to them. **New** databases created by 6.0 use the DuckDB 2 format: 5.x cannot open them. |
| **Moving a database to the new format** | Optional and never automatic: **Upgrade…** in the explorer (see below). The original stays next to it as `<name>.before-6.duckdb`. |
| **Lambdas** | DuckDB 2 writes `lambda x: x + 1` instead of `x -> x + 1`. When it finds an arrow, the editor offers **Rewrite the lambda**. JSON (`j -> 'key'`, `->>`) is unchanged. |
| **Other SQL changes** | `~` looks for a partial match (like `regexp_matches`), dividing by zero with `//` is an error, and a `NULL` carries a type. The Assistant already knows. |
| **DuckLake lakes from 5.x** | Reading them does not change them; AmoxSQL tells you when you open one that the first write makes it 6-only. |
| **dbt** | **Set up dbt…** installs dbt with DuckDB 2.0 and needs Python 3.11 to 3.13. An older environment (with DuckDB 1.x) still runs, but AmoxSQL warns you: it will not open the databases 6.0 creates. |
| **Your theme and accent** | Kept. A new install starts on **Amox Dark**. If you had an accent that no longer exists, it moves to the closest one. |
| **The local server** | It now only answers AmoxSQL's own window (it listens on `127.0.0.1`). If a tool of yours called its API from another machine or a browser, it no longer can. |

## The engine: DuckDB 2.0

- **Project variables with `$name`.** Declared once, with a type and a description, and used in any query, cell, Canvas card or process: `WHERE region = $region`. No quotes by hand, and no value can change the query. See [Variables](../editor/variables.md).
- **JSON with no fixed shape.** When importing a JSON you can keep each record as it is in a `datos` column (VARIANT), even if the records don't share their fields. In the results a nested value opens as a tree; the profile says which keys there are and in how many rows. See [Importing data](../data/importing-data.md).
- **Sub-schemas.** `CREATE SCHEMA sales.raw` works, and the explorer, the ER diagram, Data Flow and the Assistant show them with their path. **New schema inside…** in a schema's menu. See [Database explorer](../data/database-explorer.md).
- **The execution plan says how many blocks of rows it read** out of those there were, and suggests storing the table sorted when a filter skips none. See [Execution plan](../results/execution-plan.md).
- **The Assistant asks before a huge query**: if the engine estimates more than 50 million rows, it says what it would read and asks, or proposes a narrower one.
- **Faster and smaller:** in the example project the database is 20 % smaller after **Upgrade…**, and queries with time zones run 39 % faster.

## The interface

- **A seven-entry sidebar** instead of fifteen icons: Files, Search, Data, Library, dbt, Git and Deep Dive. See [The interface](interface.md).
- **Help** is its own dialog (**Ctrl+Shift+/**), with the shortcuts and the Story Flow and Data Flow guides.
- **Tabs you can tell apart** (*Query 1.sql*, *Notebook 2.sqlnb*), a list of the ones that don't fit, **Close saved**, and **Ctrl+Shift+T** for an unsaved tab too. See [Layout, tabs & panes](../editor/layout-tabs-and-panes.md).
- **The file explorer** searches the whole project and filters by type, can be shown as a tree, shows charts under their query, and has **Open Editors** and **Favorites** on top. See [File explorer](../data/file-explorer.md).
- **Each theme brings its accent**, and there are sixteen more to choose from, a neon red among them. See [Themes & appearance](themes-and-appearance.md).
- **The results bar on one row**, with **Save / Share ▾** gathering save, compare, pop-out and download. See [Results table](../results/results-table.md).
- **The chart gets it right first time:** when it opens, AmoxSQL looks at what each column is and says so ("Suggested: …", with **Undo**). See [Story Flow](../visualization/story-flow.md).
- **Only one tour opens by itself**, the welcome one; the others are offered with a one-line hint.

The full list, with the fixes, is in the [CHANGELOG](../../../CHANGELOG.md).

## Related

- [Installation](installation.md) · [First steps](first-steps.md) · [Example project](example-project.md)
- [Variables](../editor/variables.md) · [Database explorer](../data/database-explorer.md) · [Importing data](../data/importing-data.md)
