# Saving results

**🌐 English · [Español](../../es/results/saving-results.md)**

> Four ways to get your results out of the table: download what you see, export the full query, materialize it as a table, or save it to the Vault.

## What it is

AmoxSQL offers several ways to keep or share a result, and it matters to tell them apart because **they don't all save the same thing**. The key difference: some operate on the **rows already loaded in the table** (fast, in memory) and others **re-run the full query** against the engine.

## When to use each

| You want to… | Use | Scope |
|---|---|---|
| Quickly copy/download what you're seeing | **Download** (table) | Loaded rows (filtered/sorted) |
| Export the full result to a file or the cloud | **Export** (editor) | Full query, re-run |
| Keep the result as a queryable object in the DB | **Save as table…** | Full query, materialized |
| Archive the analysis for the AI and your history | **Vault** | Metadata + SQL |

## How to use it

### 1. Download — the rows you see (instant)
In the [results table](results-table.md) bar, the **Download ▾** menu grabs **only the rows loaded in the table** (with your filters and sort applied), without re-querying the engine:

- **Export CSV** — CSV with a BOM mark and headers.
- **Export JSON** — all rows as JSON.
- **Copy to Clipboard** — copies as TSV (pasteable into a spreadsheet).

The work runs in a *Web Worker* so the UI doesn't freeze. It's the fastest way to grab a sample.

### 2. Export — the full query (to file or cloud)
The **Export** button in the [editor](../editor/sql-editor.md) bar **re-runs the full query** and writes it to a file (CSV, Parquet, Excel) or a cloud destination. Unlike Download, it isn't limited to the shown rows: it exports **everything** the query returns. The details are in [Exporting data](../data/exporting-data.md).

### 3. Save as table — materialize into the database
The **Save as table…** button opens a dialog to create a new DuckDB object from the **full query**:

1. Type a **name**.
2. Choose **Table** (materializes the rows) or **View** (stores the definition, recomputed when queried).
3. Save. The schema refreshes and the new object appears in the [Database explorer](../data/database-explorer.md).

Under the hood it runs `CREATE TABLE|VIEW "name" AS <your query>`.

### 4. Vault — save to the Analysis Vault
The **Vault** button saves the analysis (title, tags, the SQL, and a summary of the result) to the **Analysis Vault**, your searchable history that's also available to the AI. See [Analysis Vault](../ai/analysis-vault.md).

## Reference

| Action | Where | Re-runs the query | Output |
|---|---|---|---|
| **Download → CSV** | Results table | No | `.csv` (shown rows) |
| **Download → JSON** | Results table | No | `.json` (shown rows) |
| **Download → Clipboard** | Results table | No | TSV to clipboard |
| **Export** | Editor bar | Yes | File (CSV/Parquet/Excel) or cloud |
| **Save as table…** | Results table | Yes | Table or view in DuckDB |
| **Vault** | Results table | No | Vault entry |

## Tips & gems

- **Download vs Export is the classic mix-up:** if you filtered or the table is truncated ("first N rows"), **Download** grabs only those rows; for the whole set use **Export** (re-runs) or add your own `LIMIT`.
- **Table vs View:** a **table** freezes the data now; a **view** always reflects the current data when queried, but recomputes each time.
- **CSV with BOM:** the CSV includes a BOM mark so accented characters render correctly when opened in spreadsheets.
- **The Vault doesn't store all rows:** it keeps the SQL and a summary (row count and columns), meant for rediscovering and reusing analyses, not as a data copy.

## Related

- [Results table](results-table.md) · [Exporting data](../data/exporting-data.md)
- [Analysis Vault](../ai/analysis-vault.md) · [Database explorer](../data/database-explorer.md)
- [Compare results](compare-results.md)
