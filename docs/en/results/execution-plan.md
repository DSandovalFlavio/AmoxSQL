# Execution plan

**🌐 English · [Español](../../es/results/execution-plan.md)**

> See how DuckDB runs your query — step by step, with readable names, the bottleneck flagged, and optimization hints.

<img src="../../../images/11_query_plan.png" alt="AmoxSQL execution plan" width="100%" />

## What it is

The **execution plan** shows the tree of operations DuckDB uses to resolve your SQL: scans, filters, joins, aggregations, sorts. Instead of raw `EXPLAIN` text, AmoxSQL presents it as a **readable tree** with friendly names ("Scan table", "Group & aggregate", "Join (hash)"), per-step timings, per-step row counts, and the **slowest step** highlighted.

It has two modes: **Estimated** (the plan the optimizer *thinks* it will run, without running the query) and **Actual** (actually runs the query and measures real timings and rows).

## When to use it

- When a query is slow and you want to know **where** the time goes.
- To check whether a filter is being "pushed down" to the source, or whether a join uses the right strategy.
- To understand why the optimizer mis-estimates the number of rows.
- Before asking the AI to optimize: here you have the diagnosis and the button to send it.

## How to use it

1. With your query in the [editor](../editor/sql-editor.md), press **Analyze** in the action bar, or **Ctrl+Shift+A**.
2. The plan opens. Use the **Estimated / Actual** switch:
   - **Estimated** — `EXPLAIN`: the predicted plan, **without running** the query. Instant and safe.
   - **Actual** — `EXPLAIN ANALYZE`: **runs** the query and measures real time and rows per operator.
3. Explore the result in the three views (top-right):
   - **Tree** — the operator tree, with time, percentage, and rows per step; the slowest one flagged.
   - **Cost** — horizontal bars per operator, sorted by self-time.
   - **Graph** — a flowchart (DAG) of the plan.
4. Read the **optimization hints** at the top and the **slowest step** banner.
5. If you like, press **Optimize with AI** to send the query and its plan to the [Assistant](../ai/editor-assistant.md).

### Metrics and phases (Actual mode)
In Actual mode, a strip shows **Latency, Rows, Rows scanned, CPU, Peak memory, and Bytes read**. Below it, a **phases** bar splits the time into **Planning**, **Execution** (operators), and **I/O & setup** (reading, CSV sniffing, result collection) — revealing whether the query is compute-bound or I/O-bound.

### Query pane
On the left you see the analyzed SQL; drag the divider to give it more or less room.

## Optimization-hints reference

The plan applies rules and suggests concrete improvements (high / mid / info severity):

| Hint | What it signals |
|---|---|
| Cardinality estimate far off | Stale statistics → poor join order; consider `ANALYZE` |
| Filter discards most rows after a scan | Push the condition into the source (a `WHERE` on the table/file) |
| Full scan with no filter | Add a `WHERE` if you don't need every row |
| Expensive sort that isn't a Top-N | Use `ORDER BY … LIMIT` for a cheaper Top-N |
| Cross product / nested-loop join | A missing equality join key |
| Spilled to disk | Ran out of memory; reduce data or raise `memory_limit` |
| I/O-bound | Convert CSV → Parquet or cache into a table |

## Operator-name reference

Some examples of the friendly names (with DuckDB's technical name shown beneath in the tree):

| Friendly | DuckDB operator |
|---|---|
| Scan table | `SEQ_SCAN` / `TABLE_SCAN` |
| Read CSV / Parquet / JSON | `READ_CSV` / `PARQUET_SCAN` / `READ_JSON` |
| Group & aggregate | `HASH_GROUP_BY` |
| Filter rows | `FILTER` |
| Sort · Top N | `ORDER_BY` · `TOP_N` |
| Join (hash / merge / nested loop) | `HASH_JOIN` / `PIECEWISE_MERGE_JOIN` / `NESTED_LOOP_JOIN` |
| Window functions | `WINDOW` |

## Tips & gems

- **Start in Estimated, confirm in Actual:** Estimated is instant; when you want real numbers, switch to Actual (it runs the query).
- **The tree's "heat map":** the steps that eat the most time are tinted (amber/red) and the slowest one carries a "slowest" label.
- **A far-off estimate is a red flag:** if a step expected ~1,000 rows and 1,000,000 arrived, the optimizer may have chosen poorly; the node flags it.
- **ANALYZE is blocked on writes:** for non-read-only queries (for example a `CREATE`/`INSERT`), Actual mode is restricted and you'll see a note; use Estimated.

## Related shortcuts

- **Ctrl+Shift+A** opens the execution plan. See [Keyboard shortcuts](../reference/keyboard-shortcuts.md).

## Related

- [SQL editor](../editor/sql-editor.md) · [Results table](results-table.md)
- [Data Profiler](data-profiler.md) · [AI Assistant](../ai/editor-assistant.md)
