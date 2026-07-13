# Google Sheets

**🌐 English · [Español](../../es/data/google-sheets.md)**

> Query your Google spreadsheets directly with SQL: paste the URL, pick a tab, and AmoxSQL scaffolds the `read_gsheet(...)` for you.

<!-- 📷 CAPTURE: docs/images/data/gsheets-section.png — Google Sheets section at the bottom of the file explorer, with a connected sheet expanded showing its tabs as tables -->

## What it is

The Google Sheets section lives at the bottom of the [File explorer](file-explorer.md). It connects Google spreadsheets by URL and treats them as data sources: each **tab** of the sheet shows up as a "table" you can query with SQL.

Under the hood it uses DuckDB's `read_gsheet('<id>', sheet='<tab>')` function, so sheets are read live — no downloading or importing. You need the gsheets setup (a service account key) done once in Settings.

## When to use it

- To analyze data that lives in Google Sheets without exporting it to CSV first.
- To join a sheet with your local tables in a single query.
- If you prefer a persistent local copy, export the sheet to CSV and [import it](importing-data.md) as a table.

## How to use it

### Set up (once)
1. In **Settings**, configure the Google Sheets integration with a **service account key**.
2. Share each sheet you want to read with that service account's email.

The section only appears if the integration is configured or you already have sheets connected.

### Connect a sheet
1. In the **Google Sheets** section, click the **+** (Add) button.
2. Paste the sheet's **URL** and confirm.
3. The sheet appears in the list with its tabs.

### Query a tab
1. Expand the sheet to see its **tabs** (each with a table icon).
2. Click a tab to open a SQL tab with `SELECT * FROM read_gsheet('<id>', sheet='<tab>') LIMIT 100`.
3. Or use the copy button to put the `read_gsheet(...)` snippet on the clipboard and paste it into your own query.

### Manage sheets
Each connected sheet has actions to **open in Google Sheets** (in the browser) and **remove** from the list. The refresh button re-reads status and tabs.

## Reference

| Action | What it does |
|---|---|
| + Add | Connects a sheet by pasting its URL |
| Refresh | Reloads status and tabs |
| Click a tab | Opens a SQL tab with that tab's `read_gsheet(...)` |
| Copy snippet | Copies `read_gsheet('<id>', sheet='<tab>')` |
| Open in Google Sheets | Opens the sheet in the browser |
| Remove | Removes the sheet from the list |

## Tips & gems

- **Live read:** each query reads the sheet as it is at that moment; there's no local copy to go stale.
- **The snippet is reusable:** copy `read_gsheet(...)` and use it inside JOINs or CTEs like any table.
- **Share with the service account:** if a sheet won't load, it's almost always because it isn't shared with the service account's email.
- **Tabs = tables:** each tab of the sheet is a separate source; pick the one you need.

## Related

- [File explorer](file-explorer.md) · [Importing data](importing-data.md) · [DuckDB extensions](duckdb-extensions.md)
- [SQL editor](../editor/sql-editor.md) · [Configuration](../reference/configuration.md)
