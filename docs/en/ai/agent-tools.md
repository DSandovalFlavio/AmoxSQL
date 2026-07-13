# Agent tools

**🌐 English · [Español](../../es/ai/agent-tools.md)**

> The AI's hands: how it queries your data, draws charts, writes notebooks, and validates its own SQL — all with safety guards.

<!-- 📷 CAPTURE: docs/images/ai/agent-tools-inspector.png — The Deep Dive inspector showing an execute_sql tool call with its SQL, result, and execution time. -->

## What it is

When AmoxSQL AI works with a capable model (medium tier or higher), it doesn't just write text: it **uses tools**. Each tool is a concrete action — run SQL, describe a table, draw a chart — that the agent chains together to answer your question. You see every call in the [Deep Dive](deep-dive.md) inspector or in the [Assistant](editor-assistant.md)'s collapsible blocks.

The tools come with built-in **guards**: `execute_sql` caps rows and has a timeout, `display_chart` corrects bad chart choices with linters, and `read_file`/`write_file` block paths outside the project.

## When it matters

- When you want to **understand what** the AI did: each step is an auditable tool call.
- When an answer looks off: open the tool call and inspect the exact SQL and its result.
- Low-tier models don't use tools; see [Prompt-only mode](prompt-only-mode.md).

## How to use it

You don't invoke tools directly — the agent picks them. But you can:

1. **Inspect every call:** in Deep Dive, the inspector shows the readable SQL and the table; in the Assistant, expand the tool call block.
2. **Correct course:** if the agent chose poorly, ask it to redo the step or use **Ask about this** on that step.
3. **Trust the guards:** warnings (a *join fan-out*, or a poorly chosen chart) show up in the tool result.

## Reference

### Data tools

| Tool | What it does |
|---|---|
| `execute_sql` | Runs DuckDB SQL. Row-capped, 30 s timeout, *join fan-out* warning if a JOIN inflates rows |
| `list_tables` | Lists tables with column and row counts |
| `describe_table` | Columns, types, and sample rows of a table |
| `attach_file` | Registers a CSV/JSON/Parquet/Excel file as a queryable view |
| `profile_data` | Statistical profile of a table (nulls, uniques, min/max, top values) |
| `read_file` | Reads a text file or lists a project directory (max 50 KB) |
| `validate_sql` | Validates a query without running it (EXPLAIN); handy before an expensive query |

### Output tools

| Tool | What it does |
|---|---|
| `display_chart` | Renders a fully configured chart (overlays, storytelling, color reasoning); server-side linters correct bad choices |
| `build_notebook` | Builds a `.sqlnb` notebook with cells and charts (Deep Dive) |
| `write_file` | Proposes an edit to the active file, or writes/appends a file (Assistant) |

### Control tools

| Tool | What it does |
|---|---|
| `create_plan` / `update_plan` | Creates and updates the visible step plan |
| `final_answer` | Closes the analysis with the structured NarrativeCard (Deep Dive) |
| `ask_user` | Pauses to ask you a clarifying question when it can't continue |
| `suggest_followups` | Proposes 2-4 follow-up questions (Assistant) |

### Notable guards

| Guard | What it prevents |
|---|---|
| Row cap + timeout on `execute_sql` | Freezing the engine with a giant `SELECT *` |
| *Join fan-out* warning | Trusting rows inflated by non-unique keys |
| `display_chart` linters | 2-point lines, rainbow bars, red on neutral metrics, donuts with >7 slices |
| Path blocking in `read_file`/`write_file` | Reading or writing outside the project |

## Tips & gems

- **Tools run on a dedicated DB lane:** the agent's queries don't block yours.
- **`display_chart` thinks like a data journalist:** it picks the type by the message and data shape, not by column type.
- **`validate_sql` touches no data:** it only plans, ideal before a heavy query.
- **The *join-fanout* is your friend:** if it appears, add `DISTINCT` or `GROUP BY` — the JOIN produced more rows than expected.
- **`write_file` in overwrite mode doesn't save to disk:** it loads the proposal into the editor for you to review.

## Related

- [Deep Dive](deep-dive.md) · [Editor Assistant](editor-assistant.md) · [Providers & models](providers-and-models.md)
- [Story Flow](../visualization/story-flow.md) · [Notebooks](../notebooks/notebooks.md)
- [Accuracy & guardrails](accuracy-and-guardrails.md) · [Prompt-only mode](prompt-only-mode.md)
