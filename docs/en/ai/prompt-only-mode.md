# Prompt-only mode

**🌐 English · [Español](../../es/ai/prompt-only-mode.md)**

> The mode that makes small local models useful: they write SQL as text, AmoxSQL intercepts it, runs it with the same guards, and asks them to summarize.

<!-- 📷 CAPTURE: docs/images/ai/prompt-only-badge.png — The model selector showing a low-tier model and the signal that the conversation runs in prompt-only mode. -->

## What it is

Very small language models (under ~3B parameters) can't reliably use tools. Rather than leave them out, AmoxSQL gives them an alternative path: **prompt-only mode**. It's a **two-pass** strategy that turns a 1-2B model into a real, if modest, analyst.

This mode kicks in **automatically** when the chosen model is [low tier](providers-and-models.md). There's nothing to configure: if your model is small, AmoxSQL switches strategy for you.

## When it applies

- You run a small local model due to limited hardware or for speed.
- You want full privacy with the lightest model that still gives decent results.
- For full tool-calling, charts, and notebooks, pick a medium-tier model or higher (see [Providers & models](providers-and-models.md)).

## How it works

Prompt-only mode replaces the tool loop with two coordinated passes:

1. **Pass 1 — the model writes SQL.** AmoxSQL gives it the schema of your tables and files under **virtual names** that are easy to reference, and the model replies with SQL embedded in text blocks.
2. **Interception.** AmoxSQL extracts the SQL, replaces the virtual names with the real references (file paths, table names), and fixes common mistakes.
3. **Execution with guards.** The corrected SQL runs on DuckDB with the **same limits** as normal mode (row cap, timeout).
4. **Pass 2 — the model summarizes.** AmoxSQL hands the result back and asks for a plain-language explanation.

This way the small model never has to "call" a tool: it just writes SQL and reads results, which is what it can actually do.

## How to know you're in it

- The **model selector** marks the model as **low** tier.
- You won't see chained tool-call blocks or AI-generated charts (those capabilities are medium+ tier).
- Responses are simpler: SQL + a summary, with no visible plan or NarrativeCard.

## Reference

### Prompt-only vs. tool mode

| Aspect | Prompt-only (low) | With tools (medium+) |
|---|---|---|
| Tool-calling | No | Yes |
| Strategy | 2 passes (SQL → summary) | Tool loop |
| AI-generated charts | No | Yes |
| Notebooks | No | Yes |
| Visible plan / NarrativeCard | No | Yes (Deep Dive) |
| SQL guards | Yes (same limits) | Yes |
| Best for | Local 1-2B models | Medium, large, and cloud models |

### What happens under the hood

| Step | Action |
|---|---|
| Virtual mapping | Each table/file gets a simple name the model references |
| Extraction | ` ```sql ` blocks (or loose SELECTs) are pulled from the text |
| Rewriting | Virtual names → real DuckDB references |
| Execution | On DuckDB, with row cap and timeout |
| Summary | The model explains the result in the second pass |

## Tips & gems

- **No need to turn it on:** the model tier decides; pick a small model and you're in prompt-only.
- **Level up to unlock:** if you want charts, notebooks, or the Deep Dive plan, switch to a medium+ model.
- **The guards are still there:** even with a tiny model, the SQL runs with the same safety limits.
- **Drag in context anyway:** files and tables you drop are mapped to virtual names for the model.

## Related

- [Providers & models](providers-and-models.md) · [Agent tools](agent-tools.md)
- [AmoxSQL AI](introduction.md) · [Editor Assistant](editor-assistant.md)
