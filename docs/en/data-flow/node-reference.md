# Node reference

**🌐 English · [Español](../../es/data-flow/node-reference.md)**

> The complete catalog of [Data Flow](data-flow.md)'s 33 node types, organized by intent exactly as they appear in the palette.

<!-- 📷 CAPTURE: docs/images/data-flow/node-palette.png — The expanded Data Flow node palette, showing the intent groups (Data Sources, SQL, Filter & Order, Columns, Clean & Format, Reshape & Aggregate, Combine & Enrich, Output, Quality & Control) with their nodes. -->

## What it is

Every step in a pipeline is a **node**. The left palette groups them by *intent*, ordered the way a pipeline flows (from source to output): first you bring data in, then filter and transform it, then combine it, and finally write it out or validate it.

This page lists all 33 nodes by group. Each node also carries its own in-app documentation: select a node and open the **info** tab in its config panel, or click the help icon in the palette.

## When to use it

- As a quick reference while building a pipeline: which node does what.
- When you're unsure between two similar nodes (Pivot vs. Unpivot, Join vs. Merge, Filter vs. a SQL query).
- To discover less-obvious capabilities (window functions, AI enrichment, cloud-bucket reads).

For the flow of building, connecting, and running, see [Data Flow](data-flow.md) and [Running & engine](running-and-engine.md).

## How to use it

1. Drag a node from the palette onto the canvas, or drag a table/file from the explorers to create a source node automatically.
2. Select the node and fill in its fields on the **basic** tab.
3. Check the **info** tab for that specific node's options, examples, and tips.

## Node reference

### Data Sources
Starting nodes: no input, they produce a table.

| Node | What it does |
|---|---|
| **Import File** | Loads a local file (CSV, TSV, Parquet, JSON, Excel) into a table; types are auto-detected |
| **Import Folder** | Loads and stacks every file matching a pattern (e.g. `*.csv`) from a folder into one table, unioned by column name |
| **Table Source** | References an existing table or view as a source, with no copy |
| **HTTP Fetch** | Reads a file (CSV, JSON, Parquet) directly from a public URL |
| **Cloud Bucket** | Reads CSV/Parquet/JSON from an S3 or GCS bucket (credentials in Settings); supports glob patterns |
| **Google Sheet** | Reads a Google Sheets tab into a table (service account in Settings) |

### SQL
For what the visual nodes don't cover.

| Node | What it does |
|---|---|
| **SQL Query** | Runs any DuckDB SQL you type; the result is the node's output |
| **SQL File** | Runs a project `.sql` file as-is (reusable and version-controllable) |

### Filter & Order

| Node | What it does |
|---|---|
| **Filter** | Keeps only rows that match your conditions (comparisons, LIKE, IN, BETWEEN, nulls), combined with AND/OR — no SQL |
| **Deduplicate** | Removes duplicate rows; with key columns, keeps the first or last per key |
| **Sample** | Takes a subset of rows: a fixed count, a percentage, or stratified by group |
| **Sort** | Orders rows by one or more columns, ascending or descending |

### Columns

| Node | What it does |
|---|---|
| **Select Columns** | Pick which columns to keep and, optionally, rename them |
| **Add Column** | Create computed columns from expressions, via a no-code builder |
| **Rename Table** | Renames the output table to a new name |
| **Type Cast** | Converts columns to a different data type (VARCHAR, INTEGER, DATE, etc.) |

### Clean & Format

| Node | What it does |
|---|---|
| **Clean / Replace** | Standardizes text: trim, lower/upper, replace, regex, fill nulls, normalize accents… |
| **Date / Time** | Date toolkit: parse text→date, extract parts, truncate, format, add/subtract, diff, and age |
| **Flatten / Unnest** | Extracts nested JSON fields into columns, or explodes an array into rows |

### Reshape & Aggregate

| Node | What it does |
|---|---|
| **Group & Aggregate** | Summarizes rows into groups with SUM, COUNT, AVG, MEDIAN, PERCENTILE, STRING_AGG…, with optional HAVING |
| **Window Functions** | Applies ROW_NUMBER, RANK, LAG, running totals over partitions — without collapsing rows |
| **Pivot** | Turns row values into columns (long → wide), like a spreadsheet pivot table |
| **Unpivot** | Turns columns into rows (wide → long), the inverse of pivot |

### Combine & Enrich

| Node | What it does |
|---|---|
| **Join Tables** | Joins two tables on one or more key columns (LEFT, INNER, RIGHT, FULL; composite keys) |
| **Merge Tables** | Stacks two or more tables of the same shape (UNION ALL keeps duplicates; UNION removes them) |
| **AI Enrich** | Applies an LLM to each row: classify, extract, summarize, or redact PII |

### Output

| Node | What it does |
|---|---|
| **Create Table** | Materializes the result as a persistent table in the database |
| **Export File** | Writes the result to a file (CSV/Parquet/Excel/JSON), local or cloud, optionally partitioned |

### Quality & Control

| Node | What it does |
|---|---|
| **Assert** | Validates data quality (not empty, row count, no nulls, uniqueness, or a custom query) and **stops the chain** if it fails |
| **Schema Validation** | Checks that the data has the expected columns and types; strict mode also rejects extra columns |
| **Checkpoint** | Pauses execution here to inspect and **resume** later (handy for reviews or team handoffs) |
| **Notification** | Sends a notification when the step runs: in-app toast, a line to a log file, or an HTTP webhook |

## Tips & gems

- **Filter early:** placing a Filter near the source shrinks everything downstream.
- **Windows vs. aggregation:** Group & Aggregate collapses rows into one per group; Window Functions adds columns and **keeps every row**.
- **Join vs. Merge:** Join combines tables *side by side* on a key; Merge stacks them *end to end* (same columns). If your inputs are many files in one folder, use Import Folder instead of Merge.
- **Sort + Deduplicate (keep last):** sort by date descending and deduplicate keeping last to get the most recent record per key.
- **Unpivot for charting:** long format is usually what the Story Flow visualizer prefers.
- **AI Enrich is one call per row:** keep *Max rows* modest on large tables; it uses the provider/model set in Settings → AI.
- **Assert before Output:** place assertions right before writing to catch bad data before it ships.
- **Excel, HTTP, and cloud use DuckDB extensions** (spatial, httpfs, gsheets) that auto-install on first use; cloud sources require credentials in Settings.

## Related

- [Data Flow](data-flow.md) · [Running & engine](running-and-engine.md)
- [SQL editor](../editor/sql-editor.md) · [Importing data](../data/importing-data.md) · [Exporting data](../data/exporting-data.md)
