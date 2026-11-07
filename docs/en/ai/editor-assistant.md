# Editor Assistant

**🌐 English · [Español](../../es/ai/editor-assistant.md)**

> Your copilot in the editor: a compact sidebar, tied to the open file, that generates, explains, and fixes SQL and proposes charts — all about the query in front of you.

<img src="../../../images/07_ai_sidebar.png" alt="AmoxSQL Editor Assistant" width="100%" />

## What it is

The Assistant is the AI mode with the least autonomy and the most proximity. It lives in a sidebar next to the [SQL editor](../editor/sql-editor.md) or the [notebook](../notebooks/notebooks.md), and it's always **tied to the active file**: it sees your current query, the last result, and the configured chart, so its answers are about what you're doing, not in the abstract.

It's reactive and conversational but compact: it opens with the finding, weaves the numbers into the sentence, and closes with the next step. You drive; it helps. When a question deserves a full analysis over the whole database, promote it to [Deep Dive](deep-dive.md) with a button.

## When to use it

- You're writing SQL and want to generate, explain, or optimize it.
- A query fails or returns something odd and you want to understand why.
- You have a result and want to chart it well in one shot.
- For a narrated, autonomous analysis over the **whole** database, use [Deep Dive](deep-dive.md) instead of the Assistant.

## How to use it

### Open the Assistant
1. Open a file. The **Assist** button is in the SQL editor, the notebook, Markdown and Report Flow; **Ctrl+L** opens it on any file.
2. Type your question and send with **Enter**.

The Assistant knows what file it has in front of it (a query, a notebook, a deck, a chart, a Data Flow…) and treats it as such.
See the table [What it can change in each file](#what-it-can-change-in-each-file).

### Generate, explain, or optimize SQL
1. With the query in the editor, ask *"explain this query"*, *"optimize it"*, or describe what you want to get.
2. The Assistant answers in prose and, when it proposes changing the file, shows the proposal.

### Accept or reject an edit
1. When the Assistant proposes changing your file, a change block appears with **Accept** / **Reject**.
2. **Accept** drops the new content into the editor **without saving to disk** — you review and save (Ctrl+S). In the SQL editor, **Ctrl+Z** undoes it. **Reject** discards it.
3. What you decided is remembered: when you reopen the conversation, the block says **Applied to the editor** or **Rejected**.
4. If the file changed since the proposal was made, accepting it would erase what you wrote afterwards. So it isn't applied: the block says so and offers **Propose again**, which asks for it again on the current version.

### Create a new file
If you ask for something that belongs in another file (*"save this query to a file"*), the Assistant proposes the path and the content. Nothing is written until you click **Create**, which creates the file and opens it. It never overwrites an existing file.

### Insert a query from the chat
Under each SQL block in the chat, **Insert at cursor** puts the query where the editor's cursor is, or over the selected text if there is a selection. The rest of the file is untouched and **Ctrl+Z** undoes it. You also have **Copy** and **Run**.

### Apply a chart
1. On a result of a `.sql`, ask *"chart this by region"* or similar.
2. The Assistant proposes a fully configured chart; click **Apply to chart** to send it to the chart of that query's results, in [Story Flow](../visualization/story-flow.md). Only that chart changes, not the ones in other tabs.

### Add context (drag & drop)
Drag a table from the [database explorer](../data/database-explorer.md) or a file from the [file explorer](../data/file-explorer.md) and drop it on the chat. It stays as conversation context and is sent with every question.

### Choose model and skill
In the chat's bottom bar you pick the **model** (see [Providers & models](providers-and-models.md)) and, if your project ships [Skills](skills.md), the **active skill** that frames the reasoning.

## Reference

### What the Assistant can do

| Capability | What it does |
|---|---|
| Answer questions | About your query, your data, or DuckDB SQL in general |
| Generate / explain / optimize SQL | Writes or rewrites the active file's query |
| Propose edits | Change block with **Accept** / **Reject**; accepting loads it in the editor unsaved |
| Propose new files | Path and content with **Create**; never overwrites |
| Propose charts | Configured chart with **Apply to chart** into Story Flow |
| Cite numbers | Values link back to their source query ("Source Query") |
| Drag-drop context | Tables and files dropped on the chat |

### Context it sees automatically

| Item | Where from |
|---|---|
| Current query | The active editor buffer |
| Last result | The results table on screen |
| Chart config | The active Story Flow chart |
| Schema | All tables in the local database |
| Project rules | `RULES.md` and `context/` (see [Context as code](context-as-code.md)) |

### What it can change in each file

| File | What the Assistant does |
|---|---|
| `.sql`, `.sqlnb` notebook, `.md` Markdown, `.amoxdeck` Report Flow, text (`.yml`, `.json`…) | Explains and proposes changes with **Accept** / **Reject** |
| `.amoxvis` chart, `.sqlchain` Data Flow, `.amoxcanvas` Canvas, `.amoxdiagram` diagram | Explains what to change and where, so you do it in its editor. It doesn't propose changes yet: rewriting the file by hand would break it |
| A very long file | Sees the first part and says so; it doesn't propose rewriting it, since it would lose what it can't see |

### What doesn't leave your computer

- **A Canvas's snapshots** (each card's saved rows) are never sent to the model: it sees the SQL and the shape of the canvas.
- **Credential files** (`profiles.yml`, `.env`, keys) are never sent to a cloud model. With a local model, they are.
- **The workspace's [AI policy](../user-guide/workspaces.md)** applies to the open file too: with "schema only", a data file opened as text or rows written inside a chart don't leave; with "samples", only their first lines do.

## Tips & gems

- **Accept doesn't save:** an accepted edit enters the editor but doesn't touch disk until you press **Ctrl+S** — always review first.
- **Promote it:** did the question grow? The promote button sends it to [Deep Dive](deep-dive.md) while keeping the context.
- **Conversations are remembered per file:** reopen a `.sql` and you get back the Assistant chat tied to that file.
- **Click a cited number:** it jumps to the exact query that produced it.

## Related

- [Deep Dive](deep-dive.md) · [Providers & models](providers-and-models.md) · [Agent tools](agent-tools.md)
- [SQL editor](../editor/sql-editor.md) · [Story Flow](../visualization/story-flow.md)
- [Skills](skills.md) · [Context as code](context-as-code.md)
