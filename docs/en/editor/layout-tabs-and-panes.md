# Layout, tabs & panes

**🌐 English · [Español](../../es/editor/layout-tabs-and-panes.md)**

> Work with several files at once: per-pane tabs, a two-pane split, and drag-and-drop, with your session recovered when you reopen.

## What it is

AmoxSQL's central area organizes your work into **tabs** inside **panes**. You can keep a single pane with several tabs, or **split the view into two side-by-side panes** to compare two files or keep a query in view while you edit another.

Each tab can hold a different kind of content (SQL, Notebook, Markdown, a chart, a diagram…), and state is preserved: when you reopen AmoxSQL, your tabs come back where they were. If the app closed unexpectedly with unsaved changes, it offers to **recover** the draft.

## When to use it

- When you work across several files and want to jump between them quickly.
- To compare two queries or results side by side with the split view.
- When you need a result to stay visible while you edit: pop it out into its own window.

## How to use it

### Tabs
Each open file is a tab in the pane. The active tab is highlighted; a **dot** next to the name means **unsaved changes** (dirty). The **X** closes the tab.

- **New tab:** the **+** button at the start of the bar creates a SQL query. The **chevron** (▾) next to it opens the menu to create a **SQL Query**, **Notebook**, or **Markdown**.
- **Switch tabs:** click, or use **Ctrl+Tab** / **Ctrl+Shift+Tab**.
- **Close:** the tab's X or **Ctrl+W**.

<!-- 📷 CAPTURE: docs/images/editor/tab-bar.png — tab bar with the + button and the new-file menu -->

### Split into two panes
Drag a tab toward the **right edge** (or left) of the window to open a second pane and drop it there. With the split view, each pane has its own tab bar and active tab. When the right pane runs **out of tabs**, the split **collapses by itself** and you're back to a single pane.

### Drag and drop tabs
Drag a tab to reorder it within its pane or move it to the other. As you drag, highlighted **drop zones** appear (edges and halves of the window) showing where the tab will land when you release.

<!-- 📷 CAPTURE: docs/images/editor/drag-drop-zones.png — drop-zone overlay while dragging a tab between panes -->

### Pop the results out into a separate window
The results panel can **open in its own window** (pop-out) so you can keep it on another screen or beside the editor. The window updates itself as the results change. See [Results table](../results/results-table.md).

### Recovery after an unexpected close
As you edit, AmoxSQL saves a local draft of the content. If you reopen a file and there's a draft with unsaved changes, a notice appears with a **Recover** button to restore them; otherwise it's discarded.

### Multiple statements → Notebook
If you run a file with several `;`-separated statements, AmoxSQL offers to **convert it into a Notebook** (one cell per statement) instead of running them blindly, because the results panel tabulates a single query. See [Notebooks](../notebooks/notebooks.md).

## Tab-type reference

| Type | Content | Doc |
|---|---|---|
| `sql` | SQL query in the editor | [SQL editor](sql-editor.md) |
| `sqlnb` | Notebook with cells | [Notebooks](../notebooks/notebooks.md) |
| `sqlchain` | Visual pipeline (Data Flow) | [Data Flow](../data-flow/data-flow.md) |
| `md` | Markdown document | — |
| `amoxdeck` | Presentation deck (Report Flow) | [Report Flow](../reports/report-flow.md) |
| `amoxvis` | Chart configuration (Story Flow) | [Story Flow](../visualization/story-flow.md) |
| `er-diagram` | Entity-relationship diagram | [ER diagram](../data/er-diagram.md) |
| `dbt-lineage` | dbt lineage graph | [DBT Studio](../dbt/dbt-studio.md) |
| `datadiving` | Data exploration session | — |

## Tips & gems

- **The dirty dot** warns you of unsaved changes before you close; save them with **Ctrl+S**.
- **Split auto-merge:** no need to "unsplit" by hand; close the last tab in the right pane and the view returns to a single pane.
- **Your session is restored:** open tabs are remembered and come back when you reopen the app.
- **Pop-out for two screens:** send the results to another window and give the editor the full screen.
- **Let it convert to a Notebook:** for multi-statement scripts, converting to a Notebook gives you an isolated result per cell instead of errors.

## Shortcuts / formats

| Shortcut | Action |
|---|---|
| Ctrl+N · Ctrl+Shift+N | New SQL query · new Notebook |
| Ctrl+W | Close the active tab |
| Ctrl+Tab · Ctrl+Shift+Tab | Next tab · previous tab |
| Ctrl+S | Save the active tab |

## Related

- [SQL editor](sql-editor.md) · [Command palette](command-palette.md) · [The interface](../user-guide/interface.md)
- [Notebooks](../notebooks/notebooks.md) · [Results table](../results/results-table.md)
- [Data Flow](../data-flow/data-flow.md) · [File formats](../reference/file-formats.md)
