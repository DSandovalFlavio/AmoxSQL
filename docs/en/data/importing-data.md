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

### Import Excel (.xlsx)
A client's Excel rarely starts at A1: it has a title, a "generated on…" line, the headers in row 4 and notes below. The Excel dialog shows the sheet **as it is**, with letters and row numbers:
1. Right-click the `.xlsx` → **Import to Database…**.
2. Check the **sheets** to import; click a sheet's name to see it.
3. **Click the row number** where the column names are (and, if needed, the **letter** of the last column). `A4:E` reads from row 4 down to the first empty row. Below, you see right away what will be read, with its types.
4. Optional: **fill down** columns with merged cells, **clean column names**.
5. With several sheets: **one table with a `_hoja` column** (for sheets of the same shape, one per month) or **one table per sheet**. Click import.

Your choices are **remembered in the project**: next time they come pre-selected, and Data Flow's Import File node reads that file the same way. What is not a workbook says what it is: an old `.xls` or a password-protected file (save it as `.xlsx`), a damaged one, or a **CSV with an `.xlsx` extension**, which you can import as CSV. The table remembers which file, sheet and range it came from (see [Data sources](sources.md)).

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
| Sheet selection | Which sheets to import | The first one (or last time's) |
| Range | From the header row to the last column; with no end row, down to the first empty row | Whole sheet |
| The first row holds the column names | Whether the range's first row is the column names | On |
| Clean column names | Lowercase, no spaces | Off |
| Fill down | Columns whose empty cells take the value above (merged cells) | None |
| Strategy (several sheets) | One table with `_hoja` · One table per sheet | One table |
| Table name | Name of the table | Derived from file |

## Tips & gems

- **Merge tags the source:** combining Excel sheets adds a `_hoja` column with each row's sheet (until 5.9 it was called `source_duck`; tables already imported don't change).
- **A file you use in several projects** is better defined as a [source](sources.md): it is read by name and not copied.
- **One pattern, many files:** importing a folder uses a glob (`*.csv`), ideal for batches of daily exports.
- **Types come from the engine:** DuckDB infers types on read, so you don't declare them.
- **Just looking?** Don't import: use Direct Query or Quick Preview from the file explorer.

## Related

- [File explorer](file-explorer.md) · [Database explorer](database-explorer.md) · [Exporting data](exporting-data.md)
- [DuckDB extensions](duckdb-extensions.md) · [Google Sheets](google-sheets.md) · [File formats](../reference/file-formats.md)
