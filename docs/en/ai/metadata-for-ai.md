# Metadata for AI

**🌐 English · [Español](../../es/ai/metadata-for-ai.md)**

> No local model or API key, but you do have an AI chat at work? Export your data's context and an AmoxSQL Skill, paste them there, and turn any external chat into a DuckDB analyst.

<!-- 📷 CAPTURE: docs/images/ai/metadata-for-ai.png — "Metadata for AI" modal with the sample-rows slider, the statistical-profile toggle, the size warning and the generated Markdown preview -->

## What it is

**Metadata for AI** is a bridge to external AI assistants. It generates a paste-ready Markdown document describing your data: the **engine** (DuckDB), the **source query or file**, the **schema** (columns and types), a **sample of rows** and, optionally, a **statistical profile** (null %, unique values, min/max, most frequent values). With that context, an AI chat that can't see your data can write you correct DuckDB SQL.

It's paired with the **downloadable Skills**: Markdown files you install as the external assistant's instructions so it behaves like an AmoxSQL analyst. There are two:

- **Basic** — a DuckDB analyst that answers with executable SQL.
- **Advanced** — the above plus **chart configurations for [Story Flow](../visualization/story-flow.md)** in JSON, auto-derived from AmoxSQL's chart-config schema so they stay current.

This is the AI's "third path": you don't need Ollama or a key configured in AmoxSQL. See [AI introduction](introduction.md).

## When to use it

- When you **can't install** a local model or pay for/configure an API, but you have an AI chat at hand.
- When you'd rather use a very powerful external model for a one-off analysis and don't mind the manual copy/paste.
- If you have a local model or a configured key, the [Editor Assistant](editor-assistant.md) and [Deep Dive](deep-dive.md) are more convenient — they work directly on the data, with no pasting.

## How to use it

### Generate the data context
1. Open **Metadata for AI…** from the editor's **Export** menu over a query, or from a file's context menu in the [File explorer](../data/file-explorer.md).
2. Adjust the **sample rows** with the slider (5–200; default 20).
3. Tick **Include statistical profile** if you want nulls, uniques, min/max and top values.
4. If the source is an Excel file, choose the **sheet** in the selector.
5. Click **Generate context**. You'll see a preview with the column count, total rows and estimated size.
6. **Copy** to the clipboard or **download** as `amoxsql-context.md`.

### Download a Skill
1. Go to **Settings → AI → Skills**.
2. Download the **basic** or the **advanced** Skill (a `.md` file).

### Use it in an external chat
1. Paste (or attach) the downloaded Skill as the external assistant's instructions/system prompt.
2. Paste your data's **Metadata for AI** document.
3. Ask your question. The assistant answers with a SQL block (and, with the advanced Skill, a chart JSON block).
4. Copy the SQL into AmoxSQL and run it. For the chart, open Story Flow over the result and use **Paste JSON**.

## Reference

### Modal options

| Option | What it controls | Range / default |
|---|---|---|
| Sample rows | How many example rows are included | 5–200 · default 20 |
| Include statistical profile | Adds null %, uniques, min/max, top values | Off |
| Excel sheet | Which sheet to read (Excel files only) | First sheet |
| Copy / Download | To clipboard or as `amoxsql-context.md` | — |

### What the document contains

| Section | Contents |
|---|---|
| Engine | DuckDB (so the assistant uses its dialect) |
| Source | The executed query or the file/sheet |
| Schema | Column names and types |
| Sample | The example rows |
| Profile (optional) | Null %, uniques, min/max, frequent values |

### Downloadable Skills (Settings → AI → Skills)

| Skill | What it does |
|---|---|
| Basic (*AmoxSQL Data Skill*) | DuckDB analyst: answers with executable SQL |
| Advanced (*AmoxSQL Data & Viz Skill*) | SQL + chart JSON for Story Flow, with the type/palette/field list auto-derived |

## Tips & gems

- **Watch the size warning.** Above ~12 KB the document may exceed some chats' limits. Lower the sample rows or turn off the profile if you go over.
- **The JSON carries only the configuration, not the data.** Story Flow renders the JSON against the result of the SQL you ran, so your data never leaves your machine.
- **The advanced Skill doesn't go stale.** Its list of chart types, palettes and fields is generated from AmoxSQL's own schema every time you download it.
- **Excel: pick the right sheet** before generating — the context describes only the selected sheet.

## Related

- [AI introduction](introduction.md) · [Prompt-only mode](prompt-only-mode.md) · [Story Flow](../visualization/story-flow.md)
- [Exporting data](../data/exporting-data.md) · [File explorer](../data/file-explorer.md)
