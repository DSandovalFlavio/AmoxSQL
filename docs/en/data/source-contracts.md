# A source's contract

**🌐 English · [Español](../../es/data/source-contracts.md)**

> What a source's file has to bring: its columns, the type of each one and a few rules. If the client changes "Importe" to "Monto", the process stops before delivering anything and says what changed.

## What it is

A process that runs on its own every morning has nobody watching. If the client's Excel arrives with a renamed column, or with an "N/A" among the amounts, the process can deliver a file with an empty column and nobody notices. A [source](sources.md)'s **contract** prevents that: before the first step, the process checks that the file brings what it should.

## When to use it

- When a source is read by a **scheduled process**, or one that runs without you.
- When **someone else** makes the file (a client, another team) and its shape can change.
- When a column **can't be empty** or only accepts certain values.

## How to use it

1. In the database explorer, right-click the source → **Add a contract…**
2. Click **Take today's columns**: it fills the contract with the columns the file brings today and their type (text, number, date, yes/no). Remove the ones that don't matter and uncheck **Required** on those that may be missing.
3. Add rules if needed:

   | Rule | What it asks for |
   |---|---|
   | No empty values | The column has no empty cells |
   | No repeated values | No value repeats (an invoice number, a code) |
   | Within a range | Between a minimum and a maximum (a non-negative amount) |
   | Only these values | Only values from a list (the stores that exist) |
   | At least N rows | The file brings at least N rows |

4. Choose what happens when it doesn't match:
   - **Stop the process** (the default): nothing runs, and it says why.
   - **Warn and go on**: it runs and ends "with a warning".
5. **Check now** checks it against today's file, without saving. Then **Save**.

With **Strict**, a column the contract doesn't name is also a failure.

## What it says when it fails

Each failure in one line, with examples:

- `the column "Importe" is missing — "Monto" is new: was it renamed?`
- `"Importe" has 1 value that is not a number: «N/A»`
- `"Tienda" has 2 values that are not allowed: «centro»`
- `it has 0 rows (at least 1 expected)`

That line goes to the system notification, to the run's record (the first step, **Source contract**) and to **Needs attention**, on the welcome screen and in the workspace's page ([see](../data-flow/scheduling.md#when-something-fails-needs-attention)).

## When it's checked

- When a Data Flow process that reads the source runs, through a source node or `fuentes."x"` in a SQL step, **before the first step**.
- When dbt runs from AmoxSQL, if the project uses that AmoxSQL source ([see](../dbt/amoxsql-sources-in-dbt.md)).
- With **Check now**.

A query in the editor does **not** check it: that would mean re-reading the file on every query.

## Numbers and dates, as they are

With a contract, an Excel or a CSV is read **as text** and each column is converted to its type. That avoids two traps of real Excel files:

- **An empty cell in the first row** no longer turns the whole column into text.
- **An "N/A" among numbers** no longer makes the read fail with an engine error: it's counted and named.

A date is recognized written as `2026-10-01` or `01/10/2026`, or as an Excel date. What reaches the next steps has the contract's type: decimal number or date. A Parquet, a JSON or a lake already carry their types: they're only checked.

## Tips and gems

- **Always start with "Take today's columns".** Nobody writes a contract from scratch.
- **The contract travels with the source:** if it's a workspace source, it applies to all its projects.
- **Checking costs little:** in a 50,000-row Excel, under a second.

## Related

- [Data sources](sources.md) · [Scheduling processes](../data-flow/scheduling.md) · [Data Flow](../data-flow/data-flow.md)
