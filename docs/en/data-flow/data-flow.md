# Data Flow

**🌐 English · [Español](../../es/data-flow/data-flow.md)**

> AmoxSQL's visual pipeline studio: build a data transformation as a diagram of connected nodes — no hand-written SQL per step — and run it end to end.

<!-- 📷 CAPTURE: docs/images/data-flow/data-flow-editor.png — The Data Flow editor with the node palette on the left, a multi-node DAG on the canvas (Import File → Filter → Group & Aggregate → Export File), and the selected node's config panel on the right. -->

## What it is

**Data Flow** is the visual studio where you design data pipelines as a directed graph (DAG): each **node** is a step (import, filter, group, join, export…) and each **connection** defines where the next step gets its data. Instead of chaining SQL by hand, you drag nodes, wire them up, and AmoxSQL generates and runs the DuckDB SQL for you.

Each pipeline is saved as a `.sqlchain` file (JSON). You open one from the file explorer, or create a new one with the **New Execution Chain** button in the sidebar (or **New Chain** in the command palette). The document opens in its own tab, just like a `.sql` file or a notebook.

The canvas has three zones: the **node palette** on the left (grouped by intent), the **canvas** in the middle with the nodes and their connections, and the **config panel** on the right when you select a node. The toolbar on top gathers the run controls and file actions.

Data Flow validates the pipeline live as you build it: nodes with problems are flagged, and running is blocked while there are errors — so you fix things before you run, not after.

## When to use it

- When a transformation has **several steps** and you want to see and reorder them visually (clean → cast → aggregate → export).
- For **repeatable processes**: a pipeline you run each month over fresh files, with data-quality checkpoints.
- When you combine **multiple sources** (local files, folders, existing tables, URLs, S3/GCS buckets, Google Sheets) into one flow.
- For a single focused query, use the [SQL editor](../editor/sql-editor.md). For a narrated analysis with prose and charts, use a [Notebook](../notebooks/notebooks.md). Data Flow is for the *process* that produces the data.

## How to use it

### Start a pipeline
1. Create or open a `.sqlchain`. If it's empty, the **template gallery** appears with ready-made starting points (see below). Pick one, or close it to start blank.
2. Add nodes in two ways:
   - **Drag from the palette:** grab a node type from the left palette and drop it on the canvas.
   - **Drag from the explorers:** drag a **table** from the Database Explorer, or a **file/folder** from the File Explorer, straight onto the canvas — the matching source node (Table Source, Import File, or Import Folder) is created and pre-configured for you.
3. **Connect** the nodes: drag from a node's output handle to the next node's input handle. Data Flow **blocks cycles**: if a connection would create a loop, it's rejected.

### Configure a node
1. Click a node to open the **config panel** on the right.
2. The panel has tabs: **basic** (the node's fields), **schema** (the columns arriving from upstream), **preview** (a preview of the data this node produces), **validation** (errors and warnings), and **info** (the node's in-app documentation).
3. In fields that ask for columns, **column autocomplete** suggests the real columns coming from the upstream nodes.

### Run
1. Hit **Run All** in the toolbar to run the whole pipeline (or **Ctrl+S** first to save).
2. Select a node to enable **From Here** (from that node forward) and **To Here** (up to that node).
3. Execution details — per-node status, logs, history, cancel, export/compile — are in [Running & engine](running-and-engine.md).

### Auto-layout and variables
- **Layout** automatically reorganizes the nodes into a clean left-to-right arrangement.
- **Variables** opens a panel to define reusable values. Reference them in any field with `${name}` (for example, a base path or a year) and change them in one place.

### Template gallery
Opening an empty chain shows the gallery of starter templates:

| Template | What it builds |
|---|---|
| **CSV Cleanup** | Import a CSV, clean/normalize columns, and export the result |
| **Data Quality Check** | Load data and validate it with assertion nodes before continuing |
| **Excel → Parquet** | Convert an Excel file to Parquet |
| **Multi-Source Merge** | Combine several sources into a single table |

### Generate with AI
The canvas's AI panel turns a natural-language description into a pipeline. Type what you want ("import sales.csv, filter to 2025, group by region, and export to Parquet") and Data Flow proposes the flow. Before applying it, it shows a **preview** of the nodes so you can confirm. If the canvas already has nodes, the AI **extends/edits** the existing pipeline (replacing the canvas after your confirmation).

## Toolbar reference

| Control | What it does |
|---|---|
| **Save** | Saves the `.sqlchain` (**Ctrl+S**). Data Flow also auto-saves (debounced) as you edit |
| **Run All** | Runs the whole pipeline. Disabled while there are validation errors |
| **From Here / To Here** | With a node selected: run from that node forward, or up to that node |
| **Cancel** | Stops a run in progress |
| **Clear** | Clears the last run's results from the canvas |
| **Layout** | Auto-reorganizes the nodes |
| **Variables** | Opens the `${...}` variables panel |
| **Export** | Exports the chain as a YAML file |
| **SQL** | Compiles the chain to a runnable SQL script |
| **Import** | Imports a chain from a YAML file (replaces the canvas, with confirmation) |
| **Logs** | Shows/hides the execution log panel |
| **History** | Opens the run history |
| Validation badge | Shows the number of errors/warnings; hover for the detail |

## Tips & gems

- **Drag data, don't hand-configure sources:** dropping a table or file from the explorers creates the source node already filled in — the fastest way to start.
- **Validation blocks, warnings don't:** errors (red) prevent running; warnings (yellow) are informational. Fix the errors and **Run All** enables itself.
- **Cycles are impossible:** the editor rejects any connection that would close a loop, so the graph is always a valid DAG.
- **The `info` tab is living documentation:** every node type carries its own explanation, options, and examples inside the app — no leaving the editor.
- **`${variables}` for parameterized pipelines:** define the base path or the year once and use it across every node; changing the value re-points the whole flow.
- **YAML to version or share:** export to YAML to review it in version control or hand it to a teammate; import it to rebuild the canvas.

## Shortcuts & related formats

| Shortcut / format | Detail |
|---|---|
| **Ctrl+S** | Save the chain |
| `.sqlchain` | The pipeline, as JSON (debounced auto-save) |
| YAML | Interchange format for exporting/importing chains |

## Related

- [Node reference](node-reference.md) · [Running & engine](running-and-engine.md)
- [SQL editor](../editor/sql-editor.md) · [Notebooks](../notebooks/notebooks.md)
- [File explorer](../data/file-explorer.md) · [Database explorer](../data/database-explorer.md)
