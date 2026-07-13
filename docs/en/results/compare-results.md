# Compare results

**🌐 English · [Español](../../es/results/compare-results.md)**

> Snapshot one result and compare it with another to see which rows were added, removed, or unchanged.

<!-- 📷 CAPTURE: docs/images/results/compare-results.png — Compare modal showing the key-column selector and the Added/Removed/Unchanged tabs. -->

## What it is

**Compare results** lets you take a **snapshot** of the current result and, after running another query, diff it against the new one. AmoxSQL computes the **diff by a key column** and splits the rows into three groups: **Added**, **Removed**, and **Unchanged** (rows whose key exists on both sides).

It lives in the [results table](results-table.md), in the toolbar's **Store A** and **Compare** buttons.

## When to use it

- To see what changed between two versions of a query (before/after a `WHERE`, a `JOIN`, or a transformation).
- To compare two periods, two filters, or two tables with the same schema.
- To validate a migration or a cleanup: which rows disappeared or appeared?

It's not a cell-by-cell diff: it compares **row presence** by the key column you choose.

## How to use it

1. Run the first query. In the results bar, press **Store A** — a snapshot of the current rows is stored (a toast confirms it).
2. Run the second query (or change the filter and re-run).
3. Press **Compare**. The compare modal opens.
4. Choose the **key column** in the dropdown. This is the column that identifies each row (for example `id`). With "— No key (show all) —" all rows from each side are shown without pairing.
5. Switch between **Added / Removed / Unchanged** to review each group. Each tab shows its count.
6. To discard the snapshot, press the **✕** next to Compare.

## Reference

| Element | What it does |
|---|---|
| **Store A** | Takes a snapshot of the current result (already filtered and sorted) |
| **Compare** | Opens the diff between the snapshot (A) and the current result (B) |
| **✕** (clear) | Discards the stored snapshot |
| **Key Column** | Column that pairs rows between A and B |
| **Added** | Rows present in B but not in A (by key) |
| **Removed** | Rows present in A but not in B |
| **Unchanged** | Rows whose key exists on both sides |

## Tips & gems

- **Pick the key wisely:** the diff is based on it. A unique column (an `id`) gives crisp results; a repeated column may pair rows you didn't intend.
- **Compare apples to apples:** it works best when both results share the schema (same columns). You can compare two different queries as long as the key column exists in both.
- **The snapshot is the view, not the query:** **Store A** stores the rows as they are (with your filter and sort applied); it doesn't re-run anything.
- **Bounded preview:** each group shows up to 100 rows in the modal, with a note of how many more there are; for the full detail, export each result separately (see [Saving results](saving-results.md)).

## Related

- [Results table](results-table.md) · [Saving results](saving-results.md)
- [Data Profiler](data-profiler.md) · [SQL editor](../editor/sql-editor.md)
