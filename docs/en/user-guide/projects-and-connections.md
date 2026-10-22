# Projects & connections

**🌐 English · [Español](../../es/user-guide/projects-and-connections.md)**

> AmoxSQL organizes your work by **projects** (folders) and connects to DuckDB databases in three modes. Here's how to open, switch, and connect.

## Projects (work folders)

A **project** is simply a folder on your disk. Everything you create — `.sql` queries, notebooks, `.amoxvis` charts, decks, chains, AI context — lives inside that folder. When you open a project, the [file explorer](../data/file-explorer.md) shows its contents.

- **Open:** on the welcome screen, enter the absolute path; or use a **recent**.
- **Switch projects:** from the project widget in the title bar.
- **Close Project:** returns to the welcome screen.

AmoxSQL recognizes canonical folders by name (queries, notebooks, charts, chains, data, exports, context, agent) and gives them special icons, but it doesn't force you to use them.

## Database connections

DuckDB can work two ways: **in memory** (ephemeral) or by **attaching** a database file (`.duckdb`/`.db`).

### Connection modes

| Mode | What it means |
|---|---|
| **In-Memory** | No database file. Tables live in RAM for the session. Perfect for exploring files (CSV/Parquet/Excel) with `SELECT * FROM 'file'`. |
| **Read-Only** | Attaches an existing database without being able to modify it. Safe for inspecting production. |
| **Read/Write** | Attaches a database and persists changes (create tables, insert, etc.). |

When you open a project with `.db` files, a modal lets you pick which to attach and in which mode. If there are none, you start in memory.

### Switching databases
You can connect, disconnect, or switch databases during a session. AmoxSQL uses a **"hard reset"** strategy for clean switches: on disconnect, it returns to a fresh in-memory state, avoiding corrupt states between projects (important on Windows because of file locks).

Even with a database attached, you can always query loose files from disk directly — DuckDB reads them without importing.

## Querying files vs importing
- **Query directly:** `SELECT * FROM 'data/x.parquet'` — no import, ideal for exploration.
- **Import:** loads the file as a table in the database (persistent in R/W mode). See [Importing data](../data/importing-data.md).

## Where you left off

When you open a project again and something happened since last time, a card above the editor tells you first:

- its **status** and **due date**;
- what **failed or warned with nobody watching** (scheduled, from the command line, a batch), with the reason;
- the **last run** of each process and how many ran since last time;
- in a repository, the **new commits** (and whose) and the unsaved files;
- the **sources** that cannot be read here or arrive stale.

Your tabs come back as they were in **this** project. **Continue** closes the card; **Open <process>** opens the last one that ran.

## A project in one file (`.amoxproject`)

When git is not an option —handing the project to someone, or starting the next client like this one—, in the project menu of the title bar:

- **Export project…**: one file with the processes, queries, notebooks, charts, decks, the assistant's context, sources and destinations. **You choose the data**, unchecked by default except the Excel template an Excel node fills. Credentials never travel (only their names), nor `.git`, `.env`, the work folder or the previous deliveries.
- **Save as template…**: the same without data, to start the next one from it.

In the workspaces view, **From a package…** creates a new project from a package: you choose the folder and the name, it is extracted with its own id and it tells you **what it still needs on this computer** (the credential by name, the extension, the source without its file).

## Related
- [First steps](first-steps.md) · [File explorer](../data/file-explorer.md)
- [Database explorer](../data/database-explorer.md) · [Importing data](../data/importing-data.md)
- [Architecture](../concepts/architecture.md)
- [Workspaces: grouping projects](workspaces.md)
