# Results table

**🌐 English · [Español](../../es/results/results-table.md)**

> Where your results land: an explorable table, chart, or profile — with search, filters, sorting, and smart formatting.

<!-- 📷 CAPTURE: docs/images/results/results-table.png — Results panel in Table mode showing the view switcher, search, filter row, and pagination. -->

## What it is

When you run a query — in the [SQL editor](../editor/sql-editor.md) or a [notebook](../notebooks/notebooks.md) cell — the results appear in this panel. It has three view modes:

- **Table** — a paginated grid with search, filters, sorting, and column resizing.
- **Chart** — the [Story Flow](../visualization/story-flow.md) chart builder.
- **Profile** — the [data profiler](data-profiler.md), an automatic exploratory analysis.

This page covers **Table mode**. The view switcher is at the top-left of the panel; next to it, a counter shows how many rows there are and how many milliseconds the query took.

## When to use it

- To inspect specific rows, search for values, or check column types.
- As the starting point before charting (Chart) or diagnosing data quality (Profile).
- When you need to quickly copy or download the rows you're looking at (see [Saving results](saving-results.md)).

## How to use it

### Search and filter
1. **Global search:** type in the **Search** box (top-right) to filter rows across all columns at once.
2. **Per-column filters:** press **Filters** to show a filter row under the headers; type in each to filter that column. The counter reads "Filtered from N" when filters are active.

### Sort
Click a column header to sort ascending; click again for descending. Null values are placed last. You can also sort from the column context menu.

### Resize columns
Drag the right edge of a column header to adjust its width (minimum 50 px). Widths are preserved as you explore.

### Column context menu
**Right-click** a column header to:

- **Copy Column Name** — copies that column's name.
- **Copy All Column Names** — copies all names, comma-separated.
- **Sort Ascending / Sort Descending** — sorts by that column.

### Paginate
At the bottom, move between pages with **‹ ›** and choose how many rows to show per page: **50 / 100 / 500 / 1000**.

### Pop out to a separate window
The **Pop-out** button (when available) sends the results to a standalone window — handy for viewing them on a second monitor while you keep editing.

## Value-formatting reference

The table formats each value by its type for readability; hover a cell to see the full value.

| Value type | How it's shown |
|---|---|
| Integer | With thousands separators (localized) |
| Decimal | Up to 4 decimals; exact value in the tooltip |
| ISO date (`...T00:00:00Z`) | Date part only (`YYYY-MM-DD`) |
| ISO date-time | Date and time with a space, without the `Z` |
| `NULL` | Dimmed **NULL** badge |
| Object / JSON | Serialized with `JSON.stringify` |

## Toolbar reference

| Control | What it does |
|---|---|
| **Table / Chart / Profile** | Switch view mode |
| **Filters** | Show/hide the per-column filter row (Table only) |
| **Search** | Global search across all columns |
| **Store A / Compare** | Store and compare result sets (see [Compare results](compare-results.md)) |
| **Save as table…** | Materialize the full query as a table or view (see [Saving results](saving-results.md)) |
| **Vault** | Save the analysis to the Vault (see [Analysis Vault](../ai/analysis-vault.md)) |
| **Download ▾** | Download the shown rows (CSV/JSON/clipboard) |
| **Pop-out** | Open the results in a separate window |

## Tips & gems

- **Truncation warning:** if your query returns more rows than the "Max Rows" limit (Settings → Editor), you'll see "⚠ first N rows". For the full set, use **Export** in the editor or add your own `LIMIT` (see [Saving results](saving-results.md)).
- **Searching doesn't re-run:** search, filters, and sorting operate **in memory** on the already-loaded rows — they're instant and don't re-query the engine.
- **Download ≠ Export:** **Download** grabs only the rows loaded in the table (already filtered and sorted); the editor's **Export** re-runs the whole query. The distinction is explained in [Saving results](saving-results.md).

## Related

- [Compare results](compare-results.md) · [Saving results](saving-results.md)
- [Data Profiler](data-profiler.md) · [Execution plan](execution-plan.md)
- [Story Flow](../visualization/story-flow.md) · [SQL editor](../editor/sql-editor.md)
