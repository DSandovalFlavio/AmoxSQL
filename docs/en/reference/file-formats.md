# File formats

**🌐 English · [Español](../../es/reference/file-formats.md)**

> A reference to every file format AmoxSQL reads, writes, or interprets: what it stores, how it's structured, and which studio edits it.

## What it is

AmoxSQL always works on real files in your project — nothing is locked away in an opaque database. Every IDE feature has a file format behind it: the editor edits `.sql`, notebooks are `.sqlnb`, charts are saved as `.amoxvis`, reports as `.amoxdeck`, and visual pipelines as `.sqlchain`. All of them are text (SQL, JSON, Markdown, or YAML), so you can version them with Git, hand-edit them, and share them.

This page is the reference for all of them. For the technical detail of the notebook parser, see `contexto_caracteristicas/formatos_archivo.md` in the developer docs.

## Overview

| Format | Contents | Structure | Edited in |
|---|---|---|---|
| `.sql` | Plain SQL query | SQL text | [SQL editor](../editor/sql-editor.md) |
| `.sqlnb` | Notebook (cells + environment) | JSON v3.0 | [Notebooks](../notebooks/notebooks.md) |
| `.sqlnb.state.json` | Notebook visual state | JSON | Generated (sidecar) |
| `.amoxvis` | A chart's configuration | JSON | [Story Flow](../visualization/story-flow.md) |
| `.amoxdeck` | Presentation deck | Markdown + front-matter | [Report Flow](../reports/report-flow.md) |
| `.sqlchain` | Transformation pipeline | JSON (DAG) | [Data Flow](../data-flow/data-flow.md) |
| `RULES.md` | Project AI rules | Markdown | Text editor |
| `agent/skills/<id>/SKILL.md` | AI skill | Markdown + YAML | [Skills](../ai/skills.md) |
| `context/*` | Domain context for AI | YAML + Markdown | [Context as code](../ai/context-as-code.md) |

## `.sql` — Plain SQL

A text file containing DuckDB SQL. It's the simplest format and the one you open by default in the [SQL editor](../editor/sql-editor.md).

| Aspect | Detail |
|---|---|
| Contents | One or more SQL statements separated by `;` |
| Structure | Plain text (no metadata) |
| Edited in | SQL editor |
| Gem | If it holds several `;`-separated statements, AmoxSQL offers to convert it into a Notebook (one cell per statement) |

## `.sqlnb` — SQL Notebook

A notebook: a sequence of SQL, Markdown, and input cells, plus the environment (database path and variables). It's the format for a step-by-step narrated analysis. See [Notebooks](../notebooks/notebooks.md).

| Aspect | Detail |
|---|---|
| Current format | JSON v3.0 |
| Structure | `{ version, cells[], environment }` |
| Cell types | `code` (SQL), `markdown`, `input` (interactive variable) |
| Embedded state | Each `code` cell can carry `state` (result, `chartConfig`, `viewMode`, height) |
| Environment | `environment.dbPath` and `environment.variables` |
| Compatibility | Also reads v2.0 (`type: "sql"`) and the legacy marker format `-- [CELL:...]`; both migrate to v3.0 on open |
| Limit | Results are truncated to 500 rows on save (`state.result.truncated` flags it) |
| Edited in | Notebook interface |

## `.sqlnb.state.json` — Notebook state sidecar

A sibling file of a `.sqlnb` that stores the visual state (results, chart config, active view) separately, so the notebook itself stays "clean."

| Aspect | Detail |
|---|---|
| Name | `{name}.sqlnb.state.json` (e.g. `analysis.sqlnb` → `analysis.sqlnb.state.json`) |
| Structure | `{ version, cells: { <cellId>: { result, chartConfig, viewMode, resultHeight } }, lastModified }` |
| When it's created | When you run a cell in a notebook already saved to disk |
| Priority | If present, its state wins over the `state` embedded in the `.sqlnb` — you can edit the SQL without losing results |
| Edited in | Auto-generated (not hand-edited) |

## `.amoxvis` — Chart configuration

Everything needed to rebuild a chart: type, axes, titles, color theme, number format, reference lines, and — crucially — the query that feeds it. An `.amoxvis` is self-contained: on open, AmoxSQL re-runs its `query` and redraws.

| Aspect | Detail |
|---|---|
| Structure | JSON with `chartType`, `xAxisKey`, `yAxisKeys[]`, titles, `colorTheme`, formatting, reference lines, and `query` |
| Carries its query | Yes — the `query` field makes the file standalone |
| Chart types | `bar`, `bar-stacked`, `bar-horizontal`, `bar-100`, `line`, `area`, `donut`, `scatter`, `bubble`, `combo`, `funnel`, `heatmap`, `treemap` |
| Usage | Standalone, embedded in a notebook cell (`state.chartConfig`), or referenced from a deck |
| Edited in | [Story Flow](../visualization/story-flow.md) |

## `.amoxdeck` — Report Flow deck

A markdown-first presentation: a YAML front-matter block, followed by slides split on `---` lines, with layout directives and embedded charts.

| Aspect | Detail |
|---|---|
| Structure | YAML front-matter (`title`, `theme`, `aspect`, variables) + slides |
| Slide separator | A line containing only `---` (ignored inside code blocks) |
| Per-slide layout | `<!-- layout: NAME -->` directive on the first line (`title`, `content`, `content-chart`, `chart-full`, `two-col`; default `content`) |
| Charts | Fenced ` ```amoxchart ` blocks referencing an `.amoxvis` by path (`src: charts/foo.amoxvis`) |
| Exports to | Editable PowerPoint and Word |
| Edited in | [Report Flow Studio](../reports/report-flow.md) |

## `.sqlchain` — Data Flow pipeline

A transformation pipeline as a directed acyclic graph (DAG): nodes (sources, transforms, outputs) connected by edges. See [Data Flow](../data-flow/data-flow.md).

| Aspect | Detail |
|---|---|
| Structure | JSON `{ version, name, description, nodes[], edges[], variables }` |
| Node | `{ id, type, label, description, position, config }` |
| Edge | `{ id, source, target }` |
| Model | DAG (no cycles; validated on run) |
| Edited in | [Data Flow Studio](../data-flow/data-flow.md) |

## `RULES.md` — Project AI rules

A Markdown file at the project root with behavior instructions the AI reads at the start of every conversation and follows strictly (schema conventions, business rules, prohibitions).

| Aspect | Detail |
|---|---|
| Location | Project root |
| Format | Free-form Markdown (a list of rules) |
| Purpose | AI behavior (unlike `context/`, which supplies domain semantics) |
| Edited in | Text editor · see [Context as code](../ai/context-as-code.md) |

## `agent/skills/<id>/SKILL.md` — AI skills

A skill is a reusable procedure the AI can activate. Each skill lives in its own `agent/skills/<id>/` folder with a `SKILL.md` of YAML front-matter + a Markdown body injected into the system prompt.

| Aspect | Detail |
|---|---|
| Location | `agent/skills/<id>/SKILL.md` (project) or the system's starter set |
| Front-matter | `name`, `description`, and optionally `keywords`, `next` |
| Body | Markdown with the procedure; injected when the skill is active |
| Edited in | Text editor · see [Skills](../ai/skills.md) |

## `context/` — Domain context for AI

An optional folder (`context/` at the project root, or `.amoxsql/context/`) that teaches the AI your business semantics: metrics, joins, glossary, and examples.

| File | Contents |
|---|---|
| `metrics.yml` | Named metrics: `name`, `sql`, `description`, `grain`, `table` |
| `joins.yml` | Table relationships: `from`, `to`, `on`, `type` |
| `glossary.md` | Domain terms in free-form Markdown |
| `examples/*.sql` | Question → SQL pairs (the first comment block is the question) |

Edited with any text editor. See [Context as code](../ai/context-as-code.md).

## Tips & gems

- **Everything is text and versionable:** `.sqlnb`, `.amoxvis`, `.amoxdeck`, and `.sqlchain` are JSON/Markdown/YAML — great for Git and diff review.
- **The `.amoxvis` is portable:** because it carries its own `query`, you can move it between projects and it still works as long as the table it queries exists.
- **The sidecar protects you:** editing a notebook's SQL doesn't wipe your results because they live in the `.sqlnb.state.json`.
- **`RULES.md` vs `context/`:** the former says *how to behave*; the latter says *what things mean*.

## Related

- [SQL editor](../editor/sql-editor.md) · [Notebooks](../notebooks/notebooks.md) · [Story Flow](../visualization/story-flow.md)
- [Report Flow](../reports/report-flow.md) · [Data Flow](../data-flow/data-flow.md)
- [Context as code](../ai/context-as-code.md) · [Skills](../ai/skills.md) · [Configuration](configuration.md)
