# Database explorer

**🌐 English · [Español](../../es/data/database-explorer.md)**

> Your database's schema tree: browse schemas, tables, and columns, drag them into the editor, and act on each table (preview, details, quality, DDL) without writing SQL.

<img src="../../../images/03_database_explorer.png" alt="AmoxSQL database explorer" width="100%" />

## What it is

The database explorer shows what's **already loaded** in the DuckDB engine: schemas, tables, views, and their typed columns. Unlike the [File explorer](file-explorer.md) (which lists files on disk), this panel reflects the state of the database.

Each column carries a type icon (integer, number, text, date/time, boolean). You can search tables, views, and column names at once, and drag tables or columns straight into the editor to build queries fast.

When the database has a single schema, tables show as a flat list; with several schemas, they're grouped under collapsible nodes with a count.

## When to use it

- To explore the database structure: which tables and columns exist and their types.
- To insert table/column names into the editor by dragging them.
- To inspect a table (schema, profile, DDL, sample) or run a quality check without writing SQL.
- To see the structure as a diagram with relationships, use the [ER diagram](er-diagram.md); for files not yet imported, the [File explorer](file-explorer.md).

## How to use it

### Navigate and search
1. Click a schema to collapse/expand its tables (in multi-schema databases).
2. Click a table to expand its typed columns.
3. Type in the search box to filter by table, view, or column; column matches auto-expand their table.
4. The copy icon next to each table/column copies its name.

### Drag into the editor
Drag a table or a column into the SQL editor to insert its name at the cursor — ideal for building `SELECT`, `JOIN`, or column lists without typing.

### View the ER diagram
The diagram button (flow icon) opens the schema's [ER diagram](er-diagram.md). In single-schema databases it's in the header; in multi-schema ones, each schema row has its own.

### Act on a table
Right-click a table to open the menu:
- **Select Top 100** — inserts `SELECT * FROM table LIMIT 100` into the editor.
- **Preview Table** — opens a modal with rows from the table.
- **Copy Name** — schema-qualified name to the clipboard.
- **View Details** — opens the details modal (Schema, Profile, Details, Preview, DDL tabs).
- **Quality Check** — opens the data quality report.
- **Drop Table…** — deletes the table (asks for confirmation).

### Table details
The **View Details** modal has five tabs: **Schema** (fields, type, null, key, default), **Profile** (null %, unique, min/max per column via SUMMARIZE), **Details** (name, row count, format), **Preview** (up to 200 rows paginated by 100), and **DDL** (the `CREATE TABLE` to copy).

### Quality check
The **Quality Check** runs automated checks: `SUMMARIZE`, duplicate rows, null %, cardinality (unique count), and likely-ID vs. categorical detection. It returns an overall score and a per-column checks table (completeness and uniqueness).

## Reference

### Table context menu
| Action | What it does |
|---|---|
| Select Top 100 | Inserts `SELECT * FROM <table> LIMIT 100` into the editor |
| Preview Table | Shows rows from the table in a modal |
| Copy Name | Copies the name (schema-qualified when applicable) |
| View Details | Opens the modal with Schema · Profile · Details · Preview · DDL |
| Quality Check | Runs the data quality report |
| Drop Table… | Deletes the table (with confirmation) |

### Column type icons
| Icon | Type |
|---|---|
| # | Integer / number |
| Text (A) | String / text |
| Calendar | Date / time |
| Check | Boolean |

## Tips & gems

- **Column search:** typing a column name reveals which tables contain it, and expands them for you.
- **Cache avoids flicker:** returning to a tab shows the schema instantly from cache while it revalidates in the background.
- **Copy-ready DDL:** a table's DDL tab gives you its exact `CREATE TABLE` to recreate or version it.
- **Views and tables are distinguished** by their icon (an eye for views).

## Related

- [ER diagram](er-diagram.md) · [File explorer](file-explorer.md) · [Importing data](importing-data.md)
- [Data Profiler](../results/data-profiler.md) · [SQL editor](../editor/sql-editor.md)
