# Data sources

**🌐 English · [Español](../../es/data/sources.md)**

> A source is data that comes from outside — an Excel, a CSV, a Parquet, a folder where it arrives every week, a bucket, a table of a lake — with a stable **name**. You define it once and query it by name everywhere: `SELECT * FROM fuentes."weekly-sales"`.

## What it is

A source has two halves:

- **The definition** — the name, what it is (file, folder, bucket, lake), how it is read (sheet, range, format) — is the same on every machine. It lives in the **workspace** (all its projects see it, and it travels in the `.amoxworkspace`) or in the **project** (`.amoxsql/fuentes/`). With the same name, the project's wins.
- **Where it is on this machine** — `G:\Stores\incoming` here, `D:\Cloud\Stores\incoming` on the next one — is kept by each machine. A file inside the project is saved relative to it and works everywhere; a cloud address (`s3://…`) is the same everywhere and is saved with the source.

Each source is a **view** of the `fuentes` catalog: the data is read from the file every time and nothing is copied into the project database. That is why the editor, notebooks, Data Flow, the assistant and the command line all use it the same way.

## When to use it

- The same file is used by several projects of a client.
- The file lives in a different place on each machine (a synced folder).
- The file arrives every week with a new name (*Sales Week 39.xlsx*, *Sales Week 40.xlsx*…).
- The data lives in a bucket or a lake (Delta, Iceberg, DuckLake).
- A process prepares a file that other projects will read (see **Publishing**).

## How to use it

### Create a source
- From the **database explorer**, **Sources** section, **+** button.
- From the **workspaces view**, in a workspace's page, **New source** (no project needs to be open).

In the form you choose **what it reads**:

| Type | For |
|---|---|
| **One file** | A file that stays put, or is replaced in place |
| **A folder** | A folder where the file arrives: **the newest file** (the newest one that finished arriving) or **all files, combined** (with an `_archivo` column) |
| **Cloud bucket** | Parquet, CSV or JSON in a bucket (or a folder with the same shape), with a path pattern and *hive* partitions (`year=2026/`) |
| **Data lake** | A Delta, Iceberg or DuckLake table. **Explore** finds the tables of a lake |

**Preview** (or **Test connection** in the cloud) really reads it, without saving anything, and says what fails if something does: the credential, the permission, the path, the network, an extension that downloads the first time.

### The name
Lowercase letters, digits and hyphens: `weekly-sales`. Because of the hyphens, in SQL it goes **in quotes**: `fuentes."weekly-sales"`.

### An Excel
For an Excel, the form shows the sheet as it is, with letters and row numbers: **click the row number** where the column names are and, if needed, the **letter** of the last column. `A4:E` reads from row 4 down to the first empty row — the shape of a report with a title on top and notes below. You can also **fill down** merged cells, **clean column names**, and **combine sheets** of the same shape (with a `_hoja` column).

### A folder: the file that just arrived
- A file name **pattern** (`sales*.xlsx`) and, if you want, subfolders.
- Only a file that **finished arriving** counts: one that has not changed for a few seconds — a synced folder writes it in several passes. Never Office temp files (`~$…`) or half-finished downloads.
- With AmoxSQL open, when a new one arrives the source already reads it and a notice says so. With AmoxSQL closed, a Data Flow or command-line run picks the newest when it starts.

### In the cloud and in a lake
For a private bucket, create a **named cloud credential** in **Settings → Credentials → New cloud credential** (S3 or S3-compatible, or Google Cloud Storage) and pick it in the source. It is encrypted with the system keychain and only opens its source's folder, so two buckets with different keys live side by side. Projects only record its **name**.

### Locate it on another machine
When you open a project that uses a source with no location on this machine, a notice says so. In the explorer the source shows a warning: right click → **Set location on this machine…**. Querying it without a location gives a message that says what to do.

### Use it
- **Editor and notebooks:** `SELECT * FROM fuentes."weekly-sales"`. You can drag it from the explorer.
- **Data Flow:** the **Source** node picks it by name; the nodes after it read it in place, without copying it.
- **The assistant** sees the sources, with their description.
- `CREATE TABLE snapshot AS SELECT * FROM fuentes."x"` leaves a table that **remembers where it came from** (see below).

### Where each table came from
A table loaded from a file — by importing it, with Data Flow's Import File or Import Folder, or by materializing a source — remembers which file it was, which sheet and range, when it was read and how many rows it had. The explorer says it when you expand the table and **warns if the file changed after it was loaded**. Import Folder adds an `_archivo` column to every row.

### Publishing
Data Flow's **Publish** node writes a Parquet to a folder (or a bucket) and **registers it as a source** of the workspace: any other project reads it by name.

- **Nobody ever reads half a file:** it is written aside and swapped in at once. If another program has it open, it retries for a few seconds; if it is still open, it says who has it (when Office tells) and the published file stays as it was.
- **It carries its schema, date and origin inside:** whoever uses it on another machine knows without anything else.
- **A change that breaks its readers is not published:** if a column disappears or changes type, it stops and the previous file stays (it can be lowered to a warning). Adding columns is fine.
- **Freshness:** a source can warn when its file is older than N days.
- CSV can be published too, without the schema guarantee.

## Notes and gotchas

- If the project database has a schema called `fuentes`, `fuentes."x"` is ambiguous and the engine says so; use `fuentes.main."x"`. The explorer warns.
- A project view that reads a source only works where that source exists.
- The first time, reading a bucket or a lake may need internet to download an engine extension (`httpfs`, `delta`, `iceberg`, `ducklake`).
- On the command line, a process that uses a source with no location on this machine exits with code **3** before starting; a Publish with a broken schema exits with **1**.
- The first version with sources (5.10) moves AmoxSQL's own database to schema v3: 5.9 can no longer open it.

## See also
- [Importing data](importing-data.md)
- [Database explorer](database-explorer.md)
- [Workspaces](../user-guide/workspaces.md)
- [Data Flow](../data-flow/data-flow.md) · [Node reference](../data-flow/node-reference.md) · [Command line](../data-flow/command-line.md)
