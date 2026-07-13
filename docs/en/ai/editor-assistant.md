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
1. Open a `.sql` or `.sqlnb` file.
2. Click the **Assist** button in the editor's action bar, or press **Ctrl+L**.
3. Type your question and send with **Enter**.

### Generate, explain, or optimize SQL
1. With the query in the editor, ask *"explain this query"*, *"optimize it"*, or describe what you want to get.
2. The Assistant answers in prose and, when it proposes changing the file, shows the proposal.

### Accept or reject an edit
1. When the Assistant proposes rewriting your file, a change block appears with **Accept** / **Reject**.
2. **Accept** drops the new content into the editor **without saving to disk** — you review and save (Ctrl+S). **Reject** discards it.

### Apply a chart
1. On a result, ask *"chart this by region"* or similar.
2. The Assistant proposes a fully configured chart; click **Apply to chart** to send it to [Story Flow](../visualization/story-flow.md).

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
| Project rules | `RULES.md` and `.amoxsql/context/` (see [Context as code](context-as-code.md)) |

## Tips & gems

- **Accept doesn't save:** an accepted edit enters the editor but doesn't touch disk until you press **Ctrl+S** — always review first.
- **Selection = scope:** if you have text selected in the editor, the Assistant works on that selection.
- **Promote it:** did the question grow? The promote button sends it to [Deep Dive](deep-dive.md) while keeping the context.
- **Conversations are remembered per file:** reopen a `.sql` and you get back the Assistant chat tied to that file.
- **Click a cited number:** it jumps to the exact query that produced it.

## Related

- [Deep Dive](deep-dive.md) · [Providers & models](providers-and-models.md) · [Agent tools](agent-tools.md)
- [SQL editor](../editor/sql-editor.md) · [Story Flow](../visualization/story-flow.md)
- [Skills](skills.md) · [Context as code](context-as-code.md)
