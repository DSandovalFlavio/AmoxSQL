# Importing data

**🌐 English · [Español](../../es/data/importing-data.md)**

> Turn CSV, Parquet, JSON, and Excel files into tables in your DuckDB database — a whole folder, several sheets, or query them directly without importing.

<!-- 📷 CAPTURE: docs/images/data/import-modal.png — "Import to Database" dialog showing the table name, optional target schema, and the clean-columns checkbox -->

## What it is

Importing data creates a **persistent table** in the database from a file (or a folder of same-type files). It's what you want when you'll query the same data many times, join it with other tables, or transform it.

AmoxSQL uses DuckDB's native reading under the hood (`SELECT * FROM '<path>'`), so import is fast and type-aware. Excel has a dedicated flow that inspects the sheets before importing.

As an alternative, DuckDB can **read files directly** without creating a table: handy for one-off exploration (see Direct Query below).

## When to use it

- **Import** when you'll reuse the data, do JOINs, or build on it.
- **Direct Query** when you just want a look or a one-off query over a file.
- To export tables or results to file/cloud, see [Exporting data](exporting-data.md).

## How to use it

### Import a file (CSV / Parquet / JSON)
1. In the [File explorer](file-explorer.md), right-click the file → **Import to Database…**.
2. In the dialog, review the **table name** (suggested from the file).
3. Optional: set a **target schema** — if it doesn't exist, it's created.
4. Leave **Clean Column Names** checked to normalize spaces and odd characters to underscores.
5. Click **Import**. The table is created and appears in the [Database explorer](database-explorer.md).

### Import a folder (by type)
1. Right-click a folder → **Import Folder to Database…**.
2. Choose the **file type** (CSV, Parquet, or JSON): all matching that pattern are imported (e.g. `*.csv`).
3. The files are combined into a single table.

### Import Excel (.xlsx / .xls)
Excel uses its own dialog that first **inspects the sheets**:
1. Right-click the `.xlsx` → **Import to Database…**.
2. Check the **sheets** you want to import.
3. Choose the **strategy**:
   - **Merge Sheets** — combines the selected sheets into one table (with a column tagging the source sheet).
   - **Individual Tables** — one table per sheet.
4. Optional: **Clean Column Names**. Click import.

### Direct Query (no import)
From the file's context menu, **Direct Query** opens a SQL tab with the read already written (`SELECT * FROM '<path>'` or `read_xlsx(...)`) plus column comments. For CSV/Parquet/JSON it runs immediately; for Excel it lets you run it yourself.

## Reference

### Import dialog (CSV/Parquet/JSON and folder)
| Option | What it does | Default |
|---|---|---|
| Table name | Name of the table to create | Derived from file |
| Schema (optional) | Target schema; created if missing | `main` |
| Clean Column Names | Spaces and odd characters → underscores | On |
| File type (folder only) | CSV · Parquet · JSON to import by pattern | CSV |

### Excel dialog
| Option | What it does | Default |
|---|---|---|
| Sheet selection | Which sheets to import | All |
| Strategy | Merge (one table) · Individual (one per sheet) | Merge |
| Table name (Merge) | Name of the combined table | Derived from file |
| Clean Column Names | Normalizes the names | On |

## Tips & gems

- **Merge tags the source:** merging Excel sheets adds a column identifying which sheet each row came from.
- **One pattern, many files:** importing a folder uses a glob (`*.csv`), ideal for batches of daily exports.
- **Types come from the engine:** DuckDB infers types on read, so you don't declare them.
- **Just looking?** Don't import: use Direct Query or Quick Preview from the file explorer.

## Related

- [File explorer](file-explorer.md) · [Database explorer](database-explorer.md) · [Exporting data](exporting-data.md)
- [DuckDB extensions](duckdb-extensions.md) · [Google Sheets](google-sheets.md) · [File formats](../reference/file-formats.md)
