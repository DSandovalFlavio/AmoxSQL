# dbt lineage

**🌐 English · [Español](../../es/dbt/lineage.md)**

> The dbt project's graph with what happened to each model last time: whether it built, how long it took, how many rows it has and which tests fail. From a node, see the rows that break a test or run from there.

## What it is

The **Lineage** section of [DBT Studio](dbt-studio.md) draws the project from its `manifest.json`: sources, seeds, models and snapshots, colored by type. Since 5.12, each node also carries **its last result**. **Open in tab** opens it full screen.

## When to use it

- To know **what failed and where** after a `dbt build`.
- To see **what is slow** and how many rows each model leaves.
- To **see the rows** that break a test, or rebuild from a model.

## How to use it

### What each node says

- **A colored dot**: finished, failed, skipped or not run yet.
- **Time · rows**: how long it took and how many rows it has. AmoxSQL counts the rows (dbt doesn't report them) for tables, incremental models, seeds and snapshots; a view isn't counted, because counting it means running it.
- **Its tests**: "3 tests", "1 failing", "2 warnings".
- **SLOW**: the three slowest, if they take more than a second.

The lineage remembers the last state of **each** node: a `dbt run --select x` updates `x` and doesn't erase what was known about the others.

### A node's panel

A click opens its panel (a double click opens its file):

- The result, when, and the error if there was one.
- Its tests. **See rows** opens a new query with the rows that break that test and runs it. It needs `store_failures` (projects created by AmoxSQL have it); if it's off, the panel says how to turn it on.
- **Open**: the model's file.
- **Run from here**: `dbt build --select <model>+`.
- **Build up to here**: `dbt build --select +<model>`.

These buttons ask for the target's name if they write to production and there's another target, and say how it went when they end.

## Tips and gems

- **No manifest, no graph:** if you see "No manifest found", run `dbt compile` or `dbt build` first.
- **The lineage refreshes itself** when any dbt command ends, wherever it was launched from.

## Related

- [DBT Studio](dbt-studio.md) · [Models in the editor](models-in-the-editor.md)
