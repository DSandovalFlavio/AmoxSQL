# Lakes (DuckLake)

**🌐 English · [Español](../../es/data/lakes.md)**

> A lake keeps every change as a version: you query a table as it was yesterday, see what changed between two versions, and maintain it knowing beforehand what will be deleted.

## What it is

A DuckLake lake is a database that lives in the project folder as **a catalog** (one file) and **a folder with the data** (`<catalog>.files/`). Every write leaves a new version; the earlier ones can still be queried until you expire them.

There are two kinds:

| Kind | File | What for |
|---|---|---|
| **Simple** | `<name>.ducklake` | The catalog is a DuckDB file. Only one program writes at a time |
| **Shared with dbt** | `<name>.ducklake.sqlite` | The catalog is SQLite: dbt can write while AmoxSQL has it open |

## When to use it

- When you need to **know how the data was** before a load ("what did this table say on Monday?").
- When a load went wrong and you want to **see exactly what changed**.
- When dbt and AmoxSQL work on the same data at the same time.

## How to use it

### Create and open

1. In the [database explorer](database-explorer.md), click the lake button in the header (**New lake…**).
2. Type the name and choose **Simple** or **Shared with dbt**.
3. Open it like any database, from the database picker.

The first time, the lake extension has to be downloaded, which needs internet.

### Versions

With a lake open, the explorer tree has **Lake versions**: each version, newest first, with its date and what changed in words ("inserted into: main.sales"). On each table of a version:

- **As it was** opens a query with the table in that version (`AT (VERSION => n)`).
- **What changed** opens a query with the rows that changed in that version; an `UPDATE` shows the before and the after.

In a lake table's menu, **As it was…** asks for a version or a date and opens the query.

### Maintenance

The wrench in **Lake versions** opens maintenance. **Before doing anything**, it says what will happen:

- **Compact** joins small data files into bigger ones: queries get faster and nothing is lost.
- **Expire versions older than N days**: how many versions expire and **from which date** you can still query "as it was".
- **Remove data files no version uses any more**: how many files and how many MB are deleted.

If it is going to delete something, the button says **Compact and remove**, in red. There is no recycle bin: an expired version can no longer be queried.

## Tips and gems

- **Small writes don't create files:** they stay inside the catalog until they grow.
- **Expiring doesn't free files today's version still uses:** they are freed when compacting.
- **A file with deletes (after an UPDATE) isn't compacted.**
- **The lake with dbt:** in `profiles.yml`, the dbt target points to the same `.ducklake.sqlite`; AmoxSQL and dbt write without waiting for each other.

## Related

- [Database explorer](database-explorer.md) · [DBT Studio](../dbt/dbt-studio.md) · [DuckDB extensions](duckdb-extensions.md)
