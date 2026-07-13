# Snippets

**🌐 English · [Español](../../es/editor/snippets.md)**

> A library of ready-to-insert SQL patterns — window functions, PIVOT, outlier detection, dbt models — plus your own saved snippets.

## What it is

The **Snippets** panel is a sidebar of proven SQL templates you drop into the editor with a click. Instead of recalling the exact syntax of a `PIVOT` or an IQR outlier detection, you search for it, insert it, and fill in the blanks.

Each snippet ships with `${placeholder}` markers at the spots you need to customize (table name, column, period…), so inserting it leaves you only those parts to replace.

The built-in library is grouped by theme, and you can save your own snippets under **"My Snippets"**, which persist on the local server across sessions.

## When to use it

- When you need a pattern you don't have memorized: running total, year-over-year, date spine, and so on.
- To standardize how your team writes a transformation (for example, a dbt staging model).
- When you repeat the same base query often: save it as your own snippet.

## How to use it

### Open the panel
Open the Snippets sidebar. You'll see a search box at the top and collapsible categories below, each with a snippet count.

<!-- 📷 CAPTURE: docs/images/editor/snippets-panel.png — snippets panel with categories expanded -->

### Insert a snippet
1. (Optional) Type in the search box to filter by name, description, or SQL content.
2. Expand a category and locate the snippet.
3. Click it to **insert it into the active editor** at the cursor position.
4. Replace the `${placeholder}` markers with your real tables and columns.

Each snippet also shows a **copy** icon if you'd rather send it to the clipboard than insert it.

### Save your own snippet
1. Click the **+** button in the panel header.
2. Give it a **name** and paste the **SQL**.
3. Click **Save Snippet**. It appears under the **"My Snippets"** category and is stored on the local server.
4. The trash icon on each of your snippets deletes it.

## Built-in library reference

| Category | What it includes |
|---|---|
| **Window Functions** | ROW_NUMBER, Running Total, LAG/LEAD, Percentile Rank |
| **Aggregation Patterns** | PIVOT (crosstab), UNPIVOT, Year over Year |
| **Date Operations** | Date Spine (continuous date range), Date Truncate by period |
| **Data Quality** | Null Check, Duplicate Finder, Outlier Detection (IQR) |
| **DuckDB Specific** | Read CSV, Read Parquet, SUMMARIZE, Export to Parquet |
| **DBT Models** | Staging, Intermediate, Mart, Incremental, Snapshot (SCD2), Custom Test, Macro, Source Config |
| **My Snippets** | Your saved snippets (appears only if you have any) |

## Tips & gems

- **The `${...}` placeholders** mark what you need to change. Step through them and substitute table, column, or period as needed.
- **Search looks inside the SQL**, not just the name: search "quantile" and you'll find the IQR outlier detection even if you don't recall its title.
- **Outlier detection** uses the interquartile range (Q1/Q3 with `QUANTILE_CONT`) — a robust pattern you don't have to rewrite each time.
- **dbt snippets:** the DBT Models category ships patterns with `{{ config(...) }}`, `ref()`, and `source()` already in place; use them as a starting point for your models in [DBT Studio](../dbt/dbt-studio.md).
- **Copy vs insert:** the copy icon is handy when you want to paste the pattern into another tool or a comment.

## Shortcuts / formats

- Placeholder syntax: `${blank_name}`.
- Your snippets are saved via the local snippets endpoint and persist across restarts.

## Related

- [SQL editor](sql-editor.md) · [Autocomplete](autocomplete.md) · [Variables](variables.md)
- [DBT Studio](../dbt/dbt-studio.md) · [DuckDB extensions](../data/duckdb-extensions.md)
- [Data Profiler](../results/data-profiler.md)
