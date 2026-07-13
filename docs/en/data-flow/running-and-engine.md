# Running & engine

**🌐 English · [Español](../../es/data-flow/running-and-engine.md)**

> How a [Data Flow](data-flow.md) pipeline runs: full or partial execution, live per-node status, logs, history, and the export/compile options — plus the engine ideas that make resume and partial runs possible.

<!-- 📷 CAPTURE: docs/images/data-flow/running-status.png — A chain mid-run: nodes with status badges (success in green, running in blue, pending dimmed), the bottom progress bar, and the logs panel open with execution lines. -->

## What it is

When you run a chain, AmoxSQL orders the nodes by dependency (topological order) and runs them step by step, materializing each intermediate result. As it runs, each node shows its **live status** and the logs panel records what's happening. When it finishes (or fails, or pauses at a checkpoint), the run lands in the **history**, from which you can resume.

Besides running, you can **export** the chain to YAML, **compile** it to a runnable SQL script, or **create a `.sql` file** in the project — useful for reviewing, versioning, or taking the pipeline outside the app.

## When to use it

- To run a whole pipeline and get its output tables/files.
- To **iterate fast**: re-run only from the node you changed, without repeating everything upstream.
- For **staged handoffs**: pause at a checkpoint, have someone review, then resume.
- To **audit or export** the logic: compile to SQL, or save the chain as YAML.

## How to use it

### Run all or partial
1. **Run All** runs the whole pipeline in order. It's disabled while there are validation errors.
2. Select a node to enable:
   - **From Here** — runs from that node forward (using the already-materialized results of upstream nodes).
   - **To Here** — runs only up to and including that node.
3. **Cancel** stops a run in progress. **Clear** clears the last run's results from the canvas.

### Follow progress
- Each node shows a status badge: **pending**, **running**, **success**, **failed**, or **skipped**.
- The bottom **progress bar** and status bar show how many nodes are done (e.g. "3 / 7 nodes, 43%").
- The **Logs** panel streams execution events live (via SSE); open it with the **Logs** button. You can clear it anytime.

### History and resume
- **History** opens the panel of previous runs for this chain.
- From a run that **failed** or was **paused at a checkpoint**, you can **resume**: the chain continues from the failed node or the checkpoint, reusing the intermediate results already materialized — it doesn't re-run everything.

### Export, compile, and create SQL
| Action | What it produces |
|---|---|
| **Export** (YAML) | Downloads the chain as a YAML file, to review or share |
| **Import** (YAML) | Rebuilds the canvas from a YAML file (replaces the current one, with confirmation) |
| **SQL** (compile) | Generates a DuckDB SQL script that reproduces the chain's order; steps that resolve only at run time (clean, rename, asserts, notifications, AI) appear as comments |
| Create SQL file | Creates a new `.sql` at the project root and opens it in the editor |

## Status & controls reference

| Node status | Meaning |
|---|---|
| **pending** | Not run yet |
| **running** | Running now |
| **success** | Completed successfully |
| **failed** | Failed — check the logs and the node's error message |
| **skipped** | Skipped in this run (outside the subgraph, or after a failure) |

| Chain status | Meaning |
|---|---|
| **Executing** | Running, with a progress counter |
| **Chain completed** | Finished successfully |
| **Chain failed** | Stopped on an error — check the logs |
| **Paused at checkpoint** | Paused at a Checkpoint node; resume from the history |
| **Cancelled** | Stopped manually |

## Tips & gems

- **Deterministic materialization enables partial runs:** each intermediate node is materialized under a stable, chain-scoped name, so **From Here**, **To Here**, and resume-from-checkpoint can find the results a previous run left behind — without redoing the work.
- **Collision-free intermediate names:** those names live in an internal, chain-scoped namespace, so two chains using the same default name (e.g. `filtered_data`) never collide or pollute your main schema.
- **Views vs. tables:** steps that are pure projections/filters (Filter, Select Columns, Add Column, Clean, Date/Time) materialize as lightweight views when they have a single downstream, so a later filter can push down into the source; if a node feeds several, it materializes as a table.
- **Re-running is idempotent:** output nodes use CREATE OR REPLACE, so re-running replaces the table instead of duplicating it.
- **Checkpoint for planned pauses:** place a Checkpoint where you need an approval or a manual review; upstream results are reused on resume.
- **Compile to SQL to audit:** the compiled script follows the same topological order and the same intermediate names, so it mirrors what a real run would do.

## Shortcuts & related formats

| Shortcut / format | Detail |
|---|---|
| **Ctrl+S** | Save the chain before running |
| `.sqlchain` | The pipeline (JSON) |
| YAML | Export/import the chain |
| `.sql` | Compile the chain to a script, or create a new file |

## Related

- [Data Flow](data-flow.md) · [Node reference](node-reference.md)
- [SQL editor](../editor/sql-editor.md) · [Exporting data](../data/exporting-data.md)
