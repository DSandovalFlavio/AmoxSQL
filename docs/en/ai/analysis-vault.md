# Analysis Vault

**🌐 English · [Español](../../es/ai/analysis-vault.md)**

> A library of saved analyses: useful queries, with their result and chart, tagged and searchable — that survive even if you delete the original file.

<!-- 📷 CAPTURE: docs/images/ai/analysis-vault.png — Analysis Vault panel with several entries: title, SQL preview, tags and "Open in Editor", edit and delete buttons -->

## What it is

The **Analysis Vault** is a persistent store of analyses you want to reuse. Each entry saves the **SQL query**, a **result snapshot**, the **chart configuration** (if any), some **tags**, and the **source file**. Unlike a loose `.sql` file, a Vault entry lives in the project database and **survives deletion of the file** that produced it.

It's managed in the **Analysis Vault panel**: you can search by text, filter by tag, rename and re-tag inline, open the SQL in the editor, and delete entries. It's where the analyses worth keeping land — whether they came from your own work or from the AI.

## When to use it

- When a query was hard to build and you'll **need it again** (a recurring report, a fine-grained definition).
- When you want a **curated collection** of analyses by topic, searchable by tags, rather than digging through history.
- To keep an analysis **beyond the life of the file** — if you reorganize the project or delete the `.sql`, the Vault keeps it.
- For throwaway result snapshots you only want to glance at quickly, the [query history](../editor/history-and-bookmarks.md) may be enough; the Vault is for what you want to curate and reuse.

## How to use it

### Save from results
1. Run a query and look at its [results table](../results/results-table.md).
2. In the table toolbar, use **Save to Vault**.
3. Give it a **title** and, optionally, comma-separated **tags**. Confirm. The query is saved together with the result snapshot. See [Saving results](../results/saving-results.md).

### Saved by the agent
During a [Deep Dive](deep-dive.md), the AI can save an analysis to the Vault on its own (via the `save_to_vault` tool) when it produces something worth keeping. It shows up in the panel as another entry, with its source file.

### Browse and reuse
1. Open the **Analysis Vault** panel.
2. Type in **Search** to filter by title/content, or in **Filter by tag** to narrow by tag. You can also click a tag chip on any entry to filter by it.
3. Click **Open in Editor** to load the entry's SQL into a new editor and re-run it.
4. **Load more** brings the next page when there are many entries.

### Edit or delete
1. **Double-click** the title (or the pencil icon) to edit title and tags inline; **Enter** saves, **Esc** cancels.
2. The trash icon asks for confirmation before deleting.

## Reference

### What an entry stores

| Field | Contents |
|---|---|
| Title | Visible name of the entry (editable) |
| SQL | The saved query (a 2-line preview is shown) |
| Result snapshot | Sample of the rows at save time |
| Chart configuration | The associated chart, if there was one |
| Tags | Comma-separated list, clickable to filter |
| Source file | Where the analysis came from |
| Date | When it was saved (shown as relative time) |

### Panel actions

| Action | What it does |
|---|---|
| Search | Filters by title/content |
| Filter by tag | Filters by tag (or click a chip) |
| Open in Editor | Loads the SQL into a new editor |
| Edit (pencil / double-click) | Change title and tags inline |
| Delete (trash) | Removes the entry after confirmation |
| Load more | Loads the next page |

## Tips & gems

- **Tag deliberately.** Tags are the main way to find things again; a chip filters with one click. Think in topics ("finance", "cohorts", "monthly").
- **It survives the file.** Saving to the Vault is how you avoid losing a good query when you clean up or reorganize the project.
- **It's local.** Entries live in the project's DuckDB database (`amoxsql_ai` schema), on your machine. See [Local-first](../concepts/local-first.md).
- **From Vault to editor and back.** *Open in Editor* re-opens the SQL; run it, tweak it, and save a new version if it evolves.

## Related

- [Saving results](../results/saving-results.md) · [Results table](../results/results-table.md)
- [Deep Dive](deep-dive.md) · [History & bookmarks](../editor/history-and-bookmarks.md)
