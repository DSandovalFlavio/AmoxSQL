# Debugging CTEs

**🌐 English · [Español](../../es/editor/cte-debugging.md)**

> Run a CTE in isolation with one click: see the intermediate result of any step in your query without taking it apart.

## What it is

Common Table Expressions (`WITH name AS (…)`) chain transformation steps, but when the final result comes out wrong it's hard to tell which CTE is to blame. CTE debugging solves exactly that.

Next to every `name AS (` definition, a **▶** glyph appears in the editor's left gutter (the margin where line numbers live). Click it and AmoxSQL runs the query **truncated up to that CTE**, appending `SELECT * FROM <cte> LIMIT 100`, and shows you its intermediate rows in a window. Your actual editor query is left untouched.

It works the same in the [SQL editor](sql-editor.md) and in [Notebook](../notebooks/notebooks.md) cells.

## When to use it

- When a multi-CTE query returns something unexpected and you want to find which step breaks.
- To inspect the result of a join or an intermediate aggregation without commenting out the rest of the SQL.
- When building a layered transformation: verify each CTE the moment you write it.

## How to use it

1. Write a query with at least one CTE:
   ```sql
   WITH base AS (
     SELECT * FROM orders WHERE status = 'paid'
   ),
   by_region AS (
     SELECT region, SUM(amount) AS total
     FROM base GROUP BY region
   )
   SELECT * FROM by_region ORDER BY total DESC;
   ```
2. Notice the **▶** glyph in the gutter, level with each `base AS (` and `by_region AS (` line.
3. Click the ▶ of the CTE you want to inspect.
4. AmoxSQL runs the query cut right after that CTE's closing parenthesis, appending `SELECT * FROM <cte> LIMIT 100`. The rows appear in a modal window, with the execution time.
5. Close the window and keep editing. You can try another CTE right away.

<!-- 📷 CAPTURE: docs/images/editor/cte-debug-glyph.png — ▶ glyph in the gutter next to a CTE definition -->

<!-- 📷 CAPTURE: docs/images/editor/cte-debug-modal.png — window showing a CTE's intermediate result -->

### In Notebook cells
In a Notebook, every code cell with CTEs shows the same ▶ glyphs. The result opens in the same window, without affecting the cell's saved result.

## How the debug query is built

| Part | Source |
|---|---|
| Prefix | All your SQL from the start up to the selected CTE's closing parenthesis |
| Suffix | `SELECT * FROM <cte_name> LIMIT 100` (added automatically) |
| Variables | `${...}` [variables](variables.md) are resolved before running |
| Limit | 100 rows, so the preview is instant |

The editor finds the CTE bounds by counting parentheses, so subqueries nested inside the CTE don't confuse the cut.

## Tips & gems

- **The ▶ appears on any `name AS (`**, so you'll also see it on definitions that aren't top-level CTEs; use it judiciously on the CTEs of your `WITH` block.
- **It doesn't modify your file:** the debug query is built and run on the fly; your buffer and your main result stay intact.
- **Pair it with autocomplete:** the editor already resolves each CTE's output columns (see [Autocomplete](autocomplete.md)), so you can write the next step confidently and then debug it.
- **Hover the glyph** to see a tooltip with the name of the CTE that will run.

## Related

- [SQL editor](sql-editor.md) · [Autocomplete](autocomplete.md) · [Variables](variables.md)
- [Notebooks](../notebooks/notebooks.md) · [Results table](../results/results-table.md)
- [Execution plan](../results/execution-plan.md)
