# Notebooks (.sqlnb)

**🌐 English · [Español](../../es/notebooks/notebooks.md)**

> Interactive documents that mix SQL, prose, and input variables, with sequential execution and reactive re-runs.

<img src="../../../images/05_sql_notebook.png" alt="AmoxSQL SQL Notebook" width="100%" />

## What it is

A **SQL Notebook** (`.sqlnb`) is a living document made of **cells**. Each cell is code (SQL), text (Markdown), or input (a named variable). You interleave explanation and analysis in one file: every code cell carries its **own results** below it (table, chart, or profile), and the prose between them tells the story.

Unlike the [SQL editor](../editor/sql-editor.md) — a single, focused query — the notebook is built for a narrated, multi-step analysis: load data in one cell, transform it in the next, visualize it in another, and describe your findings in Markdown.

Any `.sqlnb` file you open renders as a notebook automatically (AmoxSQL detects it by extension). State — cached results, chart configuration, variable values — is saved **inside the file itself**, so reopening it drops you exactly where you left off.

## When to use it

- For a multi-step exploratory analysis you want to read top to bottom.
- When you want to parameterize a query with **input variables** and recompute as they change.
- To build a reproducible **report** you later export to HTML or Word (see [Reports from a notebook](reports.md)).
- If you only need a one-off query, use the [SQL editor](../editor/sql-editor.md). To chain transformations visually, use [Data Flow](../data-flow/data-flow.md).

## How to use it

### Add and organize cells
1. Use the **+ SQL**, **+ Text**, and **Input** buttons (in the top bar or at the bottom of the notebook) to create cells.
2. Reorder them by dragging the cell body, or with the **Up/Down** arrows in the cell bar.
3. Delete them with the trash button (asks for confirmation).

### Code cell (SQL)
Write SQL with the same editor and autocomplete as the main editor. Run it with the **Run** button or **Ctrl+Enter**; results appear below in Table / Chart / Profile modes (see [Results table](../results/results-table.md)). The results panel is **resizable** (drag the handle at the bottom) and you can **pop it out into a separate window**. The ▶ gutter glyph debugs CTEs just like in the editor.

### Text cell (Markdown)
**Double-click** to edit; write Markdown (GFM is supported: tables, task lists, etc.). Click outside to return to the rendered view.

### Input cell (variable)
Define a variable with a **name** (referenced as `{{name}}`) and a **value** with a type of **Text / Number / Date**. Any code cell containing `{{name}}` receives that value when it runs: strings are inserted quoted, numbers as-is.

> **`{{var}}` vs `${var}`:** notebook input variables use double braces `{{ }}` and live in the `.sqlnb` file. Don't confuse them with the SQL editor's `${...}` variables, managed in their own panel (see [Variables](../editor/variables.md)).

### Run the notebook
| Action | How | What it does |
|---|---|---|
| Run one cell | **Run** button · **Ctrl+Enter** | Runs just that code cell |
| Run all | **Run All** · **Ctrl+Shift+Enter** | Runs every code cell in order |
| Run this & above | ▲▲ button on the cell | From the first cell up to this one, in sequence |
| Run this & below | ▼▼ button on the cell | From this cell to the last, in sequence |

Batch runs are **sequential and stop on the first error**; the **Stop** button shows progress `(current/total)` and lets you cancel.

### Gem: reactive re-execution (DAG)
When you **change an input cell's value**, AmoxSQL automatically re-runs **only** the code cells that reference that `{{variable}}` — not the whole notebook. It's like a mini spreadsheet: nudge a parameter and the steps that depend on it recompute themselves. Dependencies are inferred by scanning each cell's text for `{{variable}}`.

## Cell-type reference

| Type | Content | Editing | Results |
|---|---|---|---|
| **Code** | DuckDB SQL | Monaco editor with autocomplete | Table / Chart / Profile below |
| **Text** | Markdown (GFM) | Double-click to edit | — (renders) |
| **Input** | `{{ }}` variable value | Name + Value + type (text/number/date) | Triggers reactive re-runs |

## Tips & gems

- **Persisted results:** each cell stores its last result (up to 500 rows), its chart configuration, and its view mode inside the `.sqlnb`. Reopening the file requires no re-run.
- **Turn a `.sql` into a notebook:** if an editor file has several `;`-separated statements, AmoxSQL offers to convert it into a notebook (one cell per statement).
- **Backward compatible:** the current format is JSON v3.0; older v2.0 and marker notebooks (`-- !CELL:CODE!`) are migrated automatically on open, including state from the `.sqlnb.state.json` sidecar.

## Shortcuts & related formats

- **Ctrl+Enter** runs the active cell · **Ctrl+Shift+Enter** runs all · **Ctrl+S** saves · **Esc** exits Presentation mode.
- Formats: `.sqlnb` (JSON v3.0 with `cells` + `environment`) and its legacy `.sqlnb.state.json` sidecar. See [File formats](../reference/file-formats.md).

## Related

- [Reports from a notebook](reports.md) · [SQL editor](../editor/sql-editor.md) · [Variables](../editor/variables.md)
- [Results table](../results/results-table.md) · [Data Profiler](../results/data-profiler.md)
- [File formats](../reference/file-formats.md)
