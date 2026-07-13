# Variables

**🌐 English · [Español](../../es/editor/variables.md)**

> Define reusable `${var}` values once and AmoxSQL substitutes them into your SQL every time you run, analyze, or export.

## What it is

Session variables let you parameterize a query without editing the SQL by hand. You write `${name}` wherever you want a value, define it once in the editor's **Variables** panel, and AmoxSQL resolves it right before the query runs.

Each variable has three fields: **name**, **value**, and **type** (`text`, `date`, or `number`). Variables live in the editor session and apply to every action that runs SQL from that tab.

Note: these editor `${...}` variables are **distinct** from a [Notebook](../notebooks/notebooks.md)'s `{{var}}` environment variables, which belong to each `.sqlnb` file.

## When to use it

- When you test the same query with different parameters: change the value of `${start_date}` and re-run, without touching the SQL.
- For dates, thresholds, or IDs that repeat across several clauses of the same query.
- When you want to share a "template" query and let someone else change only the values.

## How to use it

### Open the panel
In the editor action bar, click **Variables**. The button shows a badge with how many variables you've defined. The **+** button next to it adds a new variable directly.

<!-- 📷 CAPTURE: docs/images/editor/variables-bar.png — variables panel expanded below the action bar -->

### Define a variable
1. Click **+** to add a row.
2. Type the **name** (letters, numbers, and underscore only).
3. Type the **value**. If the type is `date`, a date picker appears.
4. Choose the **type** from the dropdown: `text`, `date`, or `number`.
5. The trash icon removes the variable.

### Use the variable in SQL
Write `${name}` anywhere in your query:

```sql
SELECT *
FROM orders
WHERE date >= ${start_date}
  AND region = ${region}
  AND amount > ${threshold};
```

On run, AmoxSQL replaces each `${...}` with its value before sending the query to the engine.

### When they resolve
Substitution happens on any action that triggers SQL from the editor: **Run**, **Analyze** (execution plan), [data export](../data/exporting-data.md), and also [CTE debugging](cte-debugging.md).

## Type reference

| Type | How it's substituted | Example (value → SQL) |
|---|---|---|
| `text` | Raw value, no quotes. **You** decide whether to quote in the SQL | `north` → `north` (use `'${region}'` to quote) |
| `date` | Value wrapped in single quotes automatically | `2026-01-01` → `'2026-01-01'` |
| `number` | Raw value, no quotes | `1000` → `1000` |

> For text that must be quoted in SQL, wrap the placeholder yourself: `WHERE region = '${region}'`. Dates already quote themselves, so write `WHERE date >= ${start_date}` with no quotes around it.

## Tips & gems

- **Reuse the same `${name}`** as many times as you like in the query: every occurrence is replaced.
- **The button badge** reminds you at a glance how many variables are active.
- **Different from Notebooks:** if your workflow needs variables that persist with the file and are shared across cells, use the [Notebook](../notebooks/notebooks.md) `{{var}}` environment instead of these.
- **Raw number for expressions:** because `number` doesn't quote, you can use it inside calculations (`amount * ${factor}`).

## Shortcuts / formats

- SQL syntax: `${variable_name}`.
- No dedicated keyboard shortcut; managed from the **Variables** button in the action bar.

## Related

- [SQL editor](sql-editor.md) · [Debugging CTEs](cte-debugging.md) · [Snippets](snippets.md)
- [Notebooks](../notebooks/notebooks.md) · [Exporting data](../data/exporting-data.md)
