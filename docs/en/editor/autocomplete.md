# Autocomplete

**🌐 English · [Español](../../es/editor/autocomplete.md)**

> Table, column, and function suggestions that understand where your cursor is and what columns your own query produces — including those of CTEs and subqueries.

## What it is

The editor's autocomplete doesn't guess: it combines **three layers** that work together as you type.

1. A **background worker** parses your SQL into a real syntax tree (AST) and figures out which clause you're in (`SELECT`, `FROM`, `WHERE`, `JOIN`, `GROUP BY`, `ORDER BY`, `HAVING`…), which tables and aliases are in scope, and whether you're after a dot (`alias.`).
2. A **global schema cache** holds every table and column in your database, ready to answer instantly.
3. The **DuckDB backend** fills in what the cache lacks: the schema of data files you reference and — the gem — the output columns of CTEs and subqueries, resolved with an on-demand `DESCRIBE`.

Everything is local and deterministic. No AI is involved: the result depends only on your schema and the SQL structure.

## When to use it

- Whenever you write SQL: it's automatic as you type and on demand with `Ctrl+Space`.
- On a long query when you can't recall exact column names — especially after a multi-table `JOIN`.
- When chaining CTEs and you want to see the columns each intermediate step exposes without running it.

## How to use it

### Clause-aware completion
Just type. Depending on the cursor position, the editor filters what it offers:

- In `FROM` / `JOIN` you'll see tables and table functions, not loose columns.
- In `SELECT`, `WHERE`, `GROUP BY`, `HAVING`, `ORDER BY` you'll see columns with their alias.
- **DuckDB functions** are filtered by clause: no aggregates inside a `WHERE`, and table functions appear in the `FROM`.

When several tables are in scope, the editor prefixes columns with their alias (`u.id`, `o.id`) to avoid the "ambiguous column" error.

### Dot-access columns
Type `alias.` or `table.` and only the columns of that resolved table appear. The dot is a trigger character, so the list opens by itself.

<!-- 📷 CAPTURE: docs/images/editor/autocomplete-dot-access.png — column popup after typing an alias followed by a dot -->

### CTE and subquery columns (the gem)
A purely syntactic analyzer can't know which columns `SELECT a + b AS total` produces. AmoxSQL can: when you type `my_cte.` or request completion inside a query that uses a CTE, the editor asks DuckDB to `DESCRIBE` that expression and returns its real columns — derived names, expressions, and renames included.

```sql
WITH sales AS (
  SELECT region, SUM(amount) AS total_sales
  FROM orders GROUP BY region
)
SELECT sales.   -- ← offers: region, total_sales
FROM sales
```

### File paths inside quotes
Type a quote (`'` or `"`) in a `FROM` and the editor completes **file paths** from your project instead of SQL. When you reference a `.csv`, `.parquet`, `.json`, or `.xlsx`, AmoxSQL scans its schema in the background and adds its columns to the cache, so the rest of the query autocompletes as if it were a table.

### Function hover
Hover over a DuckDB function to see a card with its **signature**, **category**, and **description**, plus a parameter table where applicable.

<!-- 📷 CAPTURE: docs/images/editor/autocomplete-hover-doc.png — hover card with a function's signature and description -->

### Snippets and dbt/Jinja helpers
The popup also includes smart snippets (for example `LEFT JOIN`, a CTE template). dbt/Jinja helpers (`ref`, `source`, `config`, `var`, `macro`) appear only in templated files, where they're useful — they never clutter a plain `.sql`.

## Behavior reference

| Cursor clause | Offers tables | Offers columns | Functions |
|---|---|---|---|
| Start (ROOT) | No | No | No (keywords only: SELECT, WITH…) |
| FROM / JOIN | Yes | No | Table / macro |
| SELECT | No | Yes (scoped) | Scalar, aggregate, window, macro |
| WHERE | No | Yes (scoped) | Scalar, macro (no aggregates) |
| GROUP BY | No | Yes (scoped) | No |
| ORDER BY | No | Yes (scoped) | Scalar, aggregate, window |
| HAVING | No | Yes (scoped) | Aggregate, scalar, macro |

| Trigger character | What it activates |
|---|---|
| `.` | Columns of the resolved table/alias/CTE |
| `'` `"` | File paths and quoted identifiers |
| `/` | File paths inside a string |
| `{` | Jinja/dbt variables (`{{ ref('…') }}`) |

## Tips & gems

- **Scope isolation:** columns from an outer query don't leak into a subquery. The editor narrows the current statement before suggesting.
- **Auto-quoting:** if an identifier has spaces, accents, starts with a digit, or is a reserved word, the editor quotes it for you (`"user name"`).
- **Fallback for half-written SQL:** if the AST has errors while you type fast, the editor falls back to a global column list instead of going blank.
- **The cache tracks your schema:** when you import or create tables, the new columns show up in suggestions without a reload.

## Shortcuts

| Shortcut | Action |
|---|---|
| Ctrl+Space | Open suggestions on demand |
| `.` `'` `"` `/` `{` | Automatic triggers |
| Enter · Tab | Accept suggestion |
| Esc | Close the popup |

## Related

- [SQL editor](sql-editor.md) · [Debugging CTEs](cte-debugging.md) · [Snippets](snippets.md)
- [Database explorer](../data/database-explorer.md) · [Importing data](../data/importing-data.md)
- [DBT Studio](../dbt/dbt-studio.md)
