# AI Skills

**🌐 English · [Español](../../es/ai/skills.md)**

> Reusable analysis playbooks: each Skill hands the AI a specialized methodology (how to run an EDA, how to investigate a metric drop, how to design a pipeline) so it doesn't improvise the approach every time.

<!-- 📷 CAPTURE: docs/images/ai/skills-panel.png — Skills panel listing the built-in skills, each with name, description and keyword chips; one expanded to show its content -->

## What it is

A **Skill** is a Markdown file with specialized instructions that guide the AI for a specific kind of task. Instead of letting the agent decide on the fly how to tackle "explore this dataset" or "why did revenue drop", a Skill gives it a proven method: what to check, in what order, and with what judgment.

AmoxSQL ships a **built-in set of 14 skills** and you can add your own inside a project. The AI picks the most relevant one **automatically** based on what you type (in [Deep Dive](deep-dive.md)), or you can pin one manually. Only one skill is active per conversation.

Skills are browsed in the **Skills panel** of the AI section: a read-only list where each entry shows its name, description and keywords, and can be expanded to read its full content.

## When to use it

- When you want an analysis to follow a **consistent methodology** (an EDA that's always equally rigorous, a well-structured root-cause investigation).
- When your team repeats a **workflow** and you'd rather codify it once than re-explain it in every chat.
- Let **auto-activation** do the work most of the time; pin a skill manually only when you want to force a different approach than the AI would choose.

## How to use it

### Let it activate on its own
1. Open **Deep Dive** and type your question as usual.
2. The AI compares your message against each skill's keywords and description and activates the best match. For example, "why did sales drop" activates *Metric Investigation*; "give me an overview of this table" activates *EDA — Initial Exploration*.
3. The active skill shows up in the conversation; the rest of the flow (plan, tools, narration) is unchanged.

### Pick one manually
1. In the conversation's skill selector, choose the one you want.
2. That skill stays pinned for the conversation and overrides auto-activation.

### Create a project skill
1. Create the folder `agent/skills/<id>/` at your project root.
2. Inside, create `SKILL.md` with YAML front-matter and a Markdown body:

```markdown
---
name: Explore First
description: Forces careful schema inspection before writing SQL
keywords: explore, schema, describe, columns, verify
scope: analysis
next: data-storytelling
---

# Explore First

Before writing SQL on any table you haven't profiled:
1. `list_tables` — confirm the exact table name.
2. `describe_table` — get exact column names and types.
3. `SELECT * FROM <table> LIMIT 5` — see real values.
4. Only then write your analytical query.
```

3. Save the file. The Skills panel reloads project skills (use the refresh button if needed).

A project skill **overrides** the built-in one with the same `id`, so you can customize a built-in by reusing its `id`.

## Reference

### Built-in skills — analysis scope

| ID | Name | What it's for |
|---|---|---|
| `eda-initial` | EDA — Initial Exploration | First look at a dataset: structure, quality and key distributions |
| `data-quality` | Data Quality | Nulls, duplicates, outliers and integrity issues, ranked by impact |
| `sql-optimization` | SQL Optimization | Diagnose and fix slow queries with `EXPLAIN` and DuckDB tricks |
| `time-series` | Time Series | Trends, seasonality, anomalies and period comparisons |
| `cohort-comparison` | Cohort Analysis | Retention of groups defined by a start event over time |
| `metric-investigation` | Metric Investigation | Root cause: which dimension explains a metric spike or drop |
| `data-storytelling` | Data Storytelling | Turn results into a clear, convincing visual narrative |
| `analysis-planning` | Step-Plan Analysis | Multi-step analysis with visible progress (enables `create_plan`) |

### Built-in skills — engineering scope

These guide pipeline building and **also feed the [Data Flow](../data-flow/data-flow.md) generator**.

| ID | Name | What it's for |
|---|---|---|
| `pipeline-design` | Pipeline Design | Break a goal into a source → transform → sink flow |
| `ingestion-patterns` | Ingestion Patterns | Loading files: single file, folder globs, union of many |
| `data-cleaning-pipeline` | Cleaning Pipeline | Sequence cleaning (trim/nulls/dedup/cast) in the right order |
| `multi-source-merge` | Merge Sources | Decide between stacking rows (UNION) or matching on a key (JOIN) |
| `data-quality-gates` | Quality Gates | Assertion nodes that halt the flow when data is wrong |
| `export-strategy` | Export Strategy | Choose the output format, compression and destination |

### Front-matter fields (`SKILL.md`)

| Field | What it does |
|---|---|
| `name` | Display name in the UI |
| `description` | One-line description; used in the UI and in intent matching |
| `keywords` | Comma-separated list; scores auto-activation |
| `scope` | `analysis` (default) or `engineering` — groups the skill by use case |
| `next` | Skill IDs to suggest when this one finishes |

## Tips & gems

- **Matching uses keywords and the description.** Filling `keywords` well (in both Spanish and English) greatly improves auto-activation of your own skills.
- **`next` chains flows.** Many built-in skills point to `data-storytelling` as a final step to close with a visualization.
- **Version `agent/skills/` in your repo** so your team shares the same playbooks automatically.
- **The panel is read-only:** you edit the `SKILL.md`, not the UI. It's deliberately a text file so it can be reviewed in version control.

## Related

- [Deep Dive](deep-dive.md) · [Agent tools](agent-tools.md) · [Context as code](context-as-code.md)
- [Accuracy & guardrails](accuracy-and-guardrails.md) · [Data Flow](../data-flow/data-flow.md)
