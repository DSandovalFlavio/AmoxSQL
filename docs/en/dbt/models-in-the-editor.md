# dbt models in the editor

**🌐 English · [Español](../../es/dbt/models-in-the-editor.md)**

> A dbt model open in AmoxSQL is compiled, previewed and run from its own bar. The editor completes `ref()`, `source()`, macros and columns, flags what doesn't exist and goes to the definition with Ctrl+click.

## What it is

When you open a `.sql` inside a dbt project's model, seed, snapshot, test or macro folders, AmoxSQL knows it is dbt. **The model bar** appears above the editor, and completion understands Jinja and the project.

## When to use it

- To **see what a model returns** without building it.
- To **read the SQL dbt generates** (the compiled SQL).
- To run **this model**, what it needs or what depends on it, without typing the `--select`.
- To write models with dbt completion, not just SQL completion.

## How to use it

### The model bar

| Button | What it does |
|---|---|
| **Compiled** | Shows underneath, read-only, the SQL dbt generates for this model |
| **Preview** | Runs the compiled SQL **here**, in AmoxSQL's engine, and shows the rows in the usual table. Builds nothing |
| **Run** | `dbt run --select <model>` |
| **+Upstream** | This model and everything it needs, seeds included: `dbt build --select +<model>` |
| **+Downstream** | This model and what depends on it: `dbt run --select <model>+` |
| **Test** | `dbt test --select <model>` |

When it ends, the bar says in one line how it went, with **Details** (the run's record) and **Stop** while it runs. If the command writes to production and there's another target, it asks you to type its name ([see](dbt-studio.md#3-the-target-the-bar-under-the-header)).

**The preview is fast.** dbt only compiles if the file changed since last time; otherwise the preview takes as long as the query. If the model reads something that isn't built yet, it says so ("stg_orders reads example_orders, which is not built in «prod» yet. Build it first: «+Upstream»") instead of the engine's error.

If the target's database is the one you have open, the preview uses it. If it's another one, AmoxSQL attaches it read-only; dbt can still write to it.

### Go to definition

**Ctrl+click** on `ref('stg_orders')` opens its model (or seed, or snapshot), and on `source('sales', 'orders')`, the source's YAML. It also works for a new model dbt hasn't seen yet.

### dbt completion

It comes from the manifest, the YAML and the database, **without launching dbt**:

- **`ref('`** suggests models, seeds and snapshots; **`source('`**, the sources and then their tables.
- **Macros** from the project and its packages, with their signature and documented arguments. **`config(`** suggests its keys and values (`materialized='incremental'`…).
- **`{{ `** and **`{% `**, **`var('`**, **`target.`** and **`this.`**.
- **Real columns** after `alias.` of a `ref()` or `source()` (also when read in a CTE), and those of everything the model reads, with their type. They come from what is built.
- **Warnings**: a `ref` or `source` that doesn't exist is underlined, with "Did you mean …?".
- **On hover**: a model shows its columns; a macro, its signature.
- **In `schema.yml`**: keys by indentation; `- name:` suggests models, or the columns of that model; generic tests with their arguments.

The catalog refreshes when dbt runs.

### Taking a query to dbt

A loose query (a project `.sql` that isn't a model) has **Promote to dbt model** in its bar. In a notebook inside a dbt project, each cell has a **dbt** button. You pick the layer (staging, intermediate or marts) and the name, and AmoxSQL creates the model:

- each table that is a model becomes `{{ ref('…') }}`;
- each AmoxSQL source (`fuentes."sales"`) becomes `{{ source('amoxsql', 'sales') }}`, and is added to the YAML;
- CTEs and read functions stay; anything it doesn't recognize is marked with a comment;
- **the original query is not touched.**

See [AmoxSQL sources in dbt](amoxsql-sources-in-dbt.md).

## Tips and gems

- **A file is dbt by its folder**, even when empty: dbt completion is there from the first letter.
- **Compiled + Preview** is the way to debug a model: you read what dbt generated and see what it returns, without writing to the database.
- **+Upstream on a new database:** it uses `build`, so it loads the seeds; with `run` it would fail.

## Related

- [DBT Studio](dbt-studio.md) · [Lineage](lineage.md) · [AmoxSQL sources in dbt](amoxsql-sources-in-dbt.md)
- [Autocomplete](../editor/autocomplete.md) · [SQL Editor](../editor/sql-editor.md)
