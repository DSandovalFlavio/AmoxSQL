# First steps

**🌐 English · [Español](../../es/user-guide/first-steps.md)**

> From zero to your first query in a minute: open a project, connect (or not) a database, and run SQL.

<img src="../../../images/01_welcome_screen.png" alt="Welcome screen" width="100%" />

## 1. Open a project

On launch, AmoxSQL shows the **welcome screen**. Enter the **absolute path** of your project folder (where your `.sql` files, data, etc. live). AmoxSQL is project-centric: that folder is your workspace.

If you've opened projects before, they appear as **recents** to jump back with one click.

## 2. Choose the database

If the folder contains `.duckdb` or `.db` files, a modal asks how to connect:

<!-- 📷 CAPTURE: docs/images/user-guide/db-selection-modal.png — DB selection modal (In-Memory / Read-Only / Read-Write) -->

| Mode | When to use |
|---|---|
| **In-Memory** | Ephemeral session. Ideal for exploring files (CSV/Parquet/Excel) without a persistent database. |
| **Read-Only** | Open an existing database with no risk of modifying it. |
| **Read/Write** | Work on and persist changes to the database. |

If there are no databases in the folder, you start in **In-Memory** mode automatically. You can connect or switch databases later. See [Projects & connections](projects-and-connections.md).

## 3. Run your first query

1. Create a SQL file: the **+** button in the explorer (or Ctrl+N).
2. Write a query. For example, over a CSV in your folder:
   ```sql
   SELECT * FROM 'data/sales.csv' LIMIT 100;
   ```
3. Press **Ctrl+Enter**. Results appear below.

DuckDB reads CSV, Parquet, JSON, and Excel directly from files — you don't need to import anything to query. To load them as tables, see [Importing data](../data/importing-data.md).

## 4. Explore a bit more

- Switch the results panel from **Results** to **Chart** to plot (see [Story Flow](../visualization/story-flow.md)).
- Right-click a data file in the explorer → **Direct Query** to generate a ready-made query.
- Open the **AI Assistant** and ask in plain language: *"show me sales by month"* (see [AI introduction](../ai/introduction.md)).

## Related
- [The interface](interface.md) · [Projects & connections](projects-and-connections.md)
- [SQL editor](../editor/sql-editor.md) · [Importing data](../data/importing-data.md)
