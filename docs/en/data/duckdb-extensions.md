# DuckDB extensions

**🌐 English · [Español](../../es/data/duckdb-extensions.md)**

> Extend what DuckDB can do: install and load extensions to read the cloud, write real Excel, work with geospatial data, and more — from one panel, no SQL.

<!-- 📷 CAPTURE: docs/images/data/extensions-panel.png — Extensions panel with the filter chips (All, Featured, Loaded, Installed, Community, Core), the search box, and featured cards with Install/Load buttons -->

## What it is

The Extensions panel manages DuckDB extensions: optional pieces that add functions and formats. It shows featured ones, core ones, community ones, and which you have **installed** and **loaded**.

Each extension has two states: **installed** (downloaded to your machine) and **loaded** (active in the current session). Installing from the panel does both; some core extensions load themselves when you use them.

Under the hood, the panel runs `INSTALL` (with `FROM community` when appropriate) and `LOAD`, with an automatic community retry and hints when an extension isn't available for your platform yet.

## When to use it

- To enable capabilities other features need: `httpfs` (cloud), `excel` (`.xlsx`), `spatial` (geo).
- To browse which extensions exist and install one by name.
- To check what's loaded in the current session.

## How to use it

### Search and install
1. Open the **Extensions** panel in the sidebar.
2. Type in the search box to filter by name or description.
3. If the name isn't in the list yet, an **Install** button appears to install it directly.
4. On a card, click **Install** (download + load) or, if already installed, **Load** to activate it.

### Filter
The filter chips narrow the gallery:
- **All** — everything · **Featured** — recommended · **Loaded** — active now · **Installed** — downloaded · **Community** — community repo · **Core** — DuckDB core.

The status bar shows the total, how many are installed, and how many loaded.

### Load and reload
An installed but not loaded extension shows **Load**. Right-click any extension for **Copy name**, **Load/Reload**, **Open docs**, and **Copy SQL commands** (`INSTALL` + `LOAD` ready to paste).

## Reference

### Filters
| Filter | Shows |
|---|---|
| All | Every extension |
| Featured | A recommended selection |
| Loaded | Loaded in the current session |
| Installed | Downloaded on the machine |
| Community | From the community repository |
| Core | From DuckDB core |

### Key extensions
| Extension | What it's for |
|---|---|
| `httpfs` | Read/write in the cloud (S3, GCS) — required for cloud export |
| `excel` | Write real `.xlsx` with `COPY ... (FORMAT xlsx)` |
| `spatial` | Geospatial data and functions |

## Tips & gems

- **Install = install + load:** the button does both; you don't need to run `LOAD` by hand.
- **Community retry:** if an extension isn't in the official repo, the panel automatically retries from community.
- **Platform hints:** if an extension doesn't support your system or DuckDB version yet, you'll see a clear hint instead of a cryptic failure.
- **Core autoloads:** many core extensions (like `json` or `parquet`) load themselves when used; no need to manage them.
- **Copy the commands:** the context menu gives you the exact `INSTALL`/`LOAD` to reproduce the setup in a script.

## Related

- [Exporting data](exporting-data.md) · [Importing data](importing-data.md) · [Google Sheets](google-sheets.md)
- [SQL editor](../editor/sql-editor.md) · [Configuration](../reference/configuration.md)
