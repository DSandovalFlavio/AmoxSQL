# Notebooks (.sqlnb)

**🌐 English · [Español](../../es/notebooks/notebooks.md)**

> Cells that leave their query in the session under a name, so the next one can read it. With an outline, parameters, and one button that refreshes only what went stale.

## What it is

A **notebook** (`.sqlnb`) is an analysis broken into **cells**. When a SQL cell runs, it leaves its query in the session under the cell's name; the cell below can then write `FROM that_name`. In between, text cells carry the reasoning.

That is the differential part, and it is worth saying plainly: **nobody writes `CREATE OR REPLACE TEMP VIEW`**. An AmoxSQL session was always a live connection where a temp view survives from one query to the next — the notebook simply makes it visible.

Unlike the [SQL Editor](../editor/sql-editor.md) — one focused query — a notebook is for a multi-step analysis that reads top to bottom and that someone has to be able to trust three months from now.

## When to use it

- A multi-step analysis where each step builds on the previous one.
- When the context, the method and **what was discarded** need documenting next to the analysis, not somewhere else.
- When the same analysis will be re-run for another period or threshold — those are [parameters](#parameters).
- For a single query, use the [SQL Editor](../editor/sql-editor.md). To chain transformations visually, [Data Flow](../data-flow/data-flow.md).

## How to use it

### The cell

Editor on the left, result on the right, and **420 px tall, always the same** — about nineteen lines of SQL and fourteen result rows. The fixed height is not an oversight: with cells that grow, a twenty-cell notebook stops being something you can scan. For close work there is full screen.

In each cell's header:

| Control | What it does |
|---|---|
| **Name** | The name of the view the cell leaves behind. Left blank, it gets `paso_N` on run |
| **View badge** | Dim while that view does not actually exist; lit once the engine confirms it is live |
| **Three-way control** | Code and result · code only · result only. Remembered, and with it whether it was a table or a chart |
| **Materialize** | Stores the result instead of recomputing it on every read |
| **Full screen** | The cell takes the whole tab. `Esc` goes back, and back to where you were |

The **leading comment** of the query becomes the view's description, stored in the engine: the view explains itself to anything that reads the catalog.

A cell that cannot be wrapped — several statements, an `INSERT`, a `COPY` — says «no deja vista» without treating it as a failure, because it is not one. If it also writes to disk it says so separately: that does not undo itself when the project closes.

### The text cell

The same three-way control: the source, the rendered text, or both. Its headings (`#`, `##`, `###`) build the outline in the right sidebar on their own. For long prose, full screen.

### The right sidebar

Three sections, saying three different things:

- **Outline** — from the headings of text cells. Nobody maintains an outline by hand.
- **Views** — the only thing here that does not come from the document: it comes from the engine. The document says which cells exist; the engine says **what can be queried**. Reopen the notebook tomorrow and the session is empty — the sidebar says so before anything fails.
- **Parameters** — see below.

Views created outside the notebook — from a `.sql`, from another notebook — show up too, in their own section: there is only one session.

### Parameters

Write `{{desde}}` in a cell and the right sidebar lets you give it a value without touching the query. The values live in the file's front matter, so they travel with it.

**Text goes in quoted and a number goes in raw**, so you write `f >= {{desde}}` and not `f >= '{{desde}}'`. That is also why a parameter cannot name a table.

> **`{{var}}` and `${var}` are not the same.** Double braces belong to notebooks and [Report Flow](../reports/report-flow.md) decks; `${...}` are the query editor's variables, with their own panel (see [Variables](../editor/variables.md)).

### Refresh

The notebook knows **which cell reads which**, wherever they sit in the document: dependencies come from names, not from screen order. Edit a cell that three others hang off and it marks all three; **Refresh** runs them in the right order — which is rarely top to bottom — telling you how many and in what order first.

What is missing counts too: on reopening, Refresh puts back the views the session lost.

Anything that writes to disk is **set aside** and named: re-running an `INSERT` duplicates rows, and that does not undo itself when the project closes.

## How you know something went stale

A view stores no data: reading it re-runs its chain, so if the source data changes it already returns the new result. What does age is **the definition sitting in the session** — if you edit the SQL and do not re-run — and **the number you are looking at**, which is from the last `SELECT`.

The dot on the left of each cell tells them apart:

| Dot | Means |
|---|---|
| Hollow | Never run |
| Green | Up to date |
| Amber | Edited after running, or something it depends on changed |
| Red | Failed |

Changing a parameter's value also turns it amber, even though you did not touch a letter of the cell.

## Tips

- **Turn a `.sql` into a notebook:** if a file has several statements separated by `;`, AmoxSQL offers to convert it, one cell per statement.
- **Older formats:** notebooks in JSON v3.0, v2.0 and marker form (`-- !CELL:CODE!`) still open, and are saved in the new format. «Input» cells become front-matter parameters.
- **Visual state lives apart.** Each cell's mode, its split and its chart configuration are stored in `.sqlnb.state.json`, never in the document: they belong to the viewer, not to the analysis.

## Shortcuts and formats

- **Ctrl+Enter** runs the active cell · **Ctrl+S** saves · **Esc** leaves full screen.
- Formats: `.sqlnb` (markdown with front matter) and its state file `.sqlnb.state.json`. See [File formats](../reference/file-formats.md).

## Related

- [Taking the notebook out of AmoxSQL](reports.md) · [SQL Editor](../editor/sql-editor.md) · [Variables](../editor/variables.md)
- [Results table](../results/results-table.md) · [Data profiler](../results/data-profiler.md)
- [File formats](../reference/file-formats.md)
