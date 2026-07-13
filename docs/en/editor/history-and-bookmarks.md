# History & bookmarks

**🌐 English · [Español](../../es/editor/history-and-bookmarks.md)**

> Every query you run is logged automatically. Search it, reload it with a click, and star the ones you want to keep.

## What it is

AmoxSQL keeps a persistent **query history**: every query you run is saved for you, along with its date and time. When you need to get back "that query from yesterday," it's there — no need to rewrite it.

History and **bookmarks** live in one view with two tabs: **History** (everything you ran, chronological) and **Bookmarked** (only the ones you starred). Open it with **Ctrl+Shift+H** or from the **History** button in the editor's action bar.

History prunes itself so it doesn't grow forever, and it filters out noise (system statements and internal DDL) so you only see your real queries.

## When to use it

- When you want to return to a query you ran earlier and didn't save to a file.
- To compare two versions of a query you iterated on.
- When you have a handful of "reference" queries you use often: bookmark them and keep them at hand.

## How to use it

### Open history
Press **Ctrl+Shift+H**, or the **History** button in the editor's action bar. It opens with the **History** tab active.

<!-- 📷 CAPTURE: docs/images/editor/history-modal.png — history view with the History and Bookmarked tabs -->

### Search and reload a query
1. (Optional) Type in the search box to filter by the query text.
2. Scan the list: each entry shows its date/time and the SQL.
3. **Click an entry** to load it into the editor.
4. The **copy** icon on each row sends it to the clipboard without loading it.

### Bookmark a query
1. In the **History** tab, click the **star** on the query you want to keep.
2. Switch to the **Bookmarked** tab to see only your starred ones.
3. From **Bookmarked**, the (filled) star removes the bookmark.

Bookmarks don't depend on history pruning: even if the original query drops out of history by age, your bookmark stays.

<!-- 📷 CAPTURE: docs/images/editor/bookmarks-tab.png — Bookmarked tab with starred queries -->

## Reference

| Aspect | Behavior |
|---|---|
| Logging | Automatic on every query run |
| Capacity | Last ~1000 queries |
| Pruning | Records older than 30 days are dropped |
| Filtering | System statements and internal DDL excluded (only your queries show) |
| Tabs | **History** (chronological) · **Bookmarked** (starred) |
| Per-row actions | Load (click) · Bookmark/unbookmark (star) · Copy |
| Persistence | History requires read-write mode on the database |

## Tips & gems

- **History is your safety net:** if you ran a query and closed the tab without saving, it's still in history.
- **Bookmark before it prunes:** if a query is useful long-term, star it; bookmarks survive the 30-day prune.
- **Search by fragment:** the search box filters by the SQL text, so recalling a table or function name is enough to find it again.
- **Loading doesn't run:** clicking loads the query into the editor but doesn't execute it; review it and run it yourself.

## Shortcuts / formats

| Shortcut | Action |
|---|---|
| Ctrl+Shift+H | Open query history |

## Related

- [SQL editor](sql-editor.md) · [Snippets](snippets.md) · [Command palette](command-palette.md)
- [Results table](../results/results-table.md) · [Saving results](../results/saving-results.md)
