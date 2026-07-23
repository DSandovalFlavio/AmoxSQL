# DuckDB documentation for the AI

**🌐 English · [Español](../../es/ai/documentacion-duckdb.md)**

> The AI keeps the official DuckDB documentation in its pocket — bundled and offline — to get right the DuckDB-specific syntax models often get wrong (EXCLUDE, QUALIFY, PIVOT, list comprehensions…).

## What it is

DuckDB has its own SQL features that don't exist in other dialects, and models — especially small local ones — sometimes invent them incorrectly. AmoxSQL ships a **full snapshot of DuckDB's SQL documentation** (the ~126 topics under `docs/current/sql`) bundled with the app. When the AI is unsure about a syntax, it consults that doc **offline** and pulls the exact section with examples before writing the SQL.

For example, if you ask *"I want to use EXCLUDE in a SELECT"*, the AI looks up the Star Expression doc, reads the `EXCLUDE` clause with its example, and generates correct SQL on the first try — instead of guessing.

## How it works

- The AI has two tools it calls on its own when unsure of the syntax:
  - **`lookup_duckdb_docs`** — consults the bundled documentation (prose + examples). Returns the relevant section **and the file's table of contents**, so if the answer is in another section it requests it precisely.
  - **`lookup_duckdb_function`** — asks the **live DuckDB engine** (`duckdb_functions()`) for any function's exact signature: parameter types, return type and examples. Because it comes from the engine that runs your queries, it **always matches your DuckDB version and is impossible to hallucinate**.
- Also, before showing you SQL that uses a DuckDB-specific feature, the AI **validates it against the engine** (without executing it) — if it's invalid, it doesn't show it: it looks up the correct syntax and fixes it.
- Everything is **local**: the docs are bundled and the engine is yours; your query and your data are never sent anywhere.
- It returns **only the relevant section** (not the whole manual), so it doesn't overwhelm small models' context.

> Note: the tool is used by tool-calling models (medium tier or higher). Very small (prompt-only) models don't call it.

## Keeping it up to date

In **Settings → AI → DuckDB documentation (offline)** you'll see the **last update date**, how many topics there are, and three modes:

| Mode | What it does |
|---|---|
| **Base only (offline)** | Never downloads anything. Always uses the bundled copy. 100% offline. |
| **Manual** | You decide when, with the **"Update now"** button. |
| **Automatic** | AmoxSQL checks for a newer version every so often (configurable in days) on startup. |

- The **"Update now"** button downloads the latest documentation from DuckDB's official repository and saves it as your updated copy (which takes precedence over the base).
- If you're offline, the update simply doesn't happen and the copy you already have keeps being used — you're never left without documentation.

## Tips & gems

- **Start without touching anything**: the base copy already ships fresh; it works offline from day one.
- **Automatic mode to forget about it**: if you want the docs reasonably current without thinking about it, leave it on Automatic.
- **Base-only for air-gapped setups**: if you work on a machine without internet or with strict policies, "Base only" guarantees zero network calls.
- **When to update manually**: if DuckDB just shipped a new function and you want the AI to know it now, hit "Update now".

## Related

- [AmoxSQL AI](introduction.md) · [Agent tools](agent-tools.md)
- [Providers and models](providers-and-models.md) · [Local AI performance](local-performance.md)
- [Accuracy & guardrails](accuracy-and-guardrails.md)
