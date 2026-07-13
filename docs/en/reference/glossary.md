# Glossary

**🌐 English · [Español](../../es/reference/glossary.md)**

> AmoxSQL's own terms, one line each, linking to the page that develops them.

## What it is

AmoxSQL has its own vocabulary: the names of its studios (Story Flow, Report Flow, Data Flow), its file formats, and a few data and AI concepts. This glossary defines them briefly and links to the full reference. Sorted alphabetically.

## Terms

| Term | Definition |
|---|---|
| **`.amoxdeck`** | Markdown-first presentation deck (front-matter + slides split by `---` + embedded charts). See [File formats](file-formats.md) and [Report Flow](../reports/report-flow.md). |
| **`.amoxvis`** | JSON file with a chart's configuration; it carries its own query, so it's self-contained. See [File formats](file-formats.md). |
| **`.sqlchain`** | A transformation pipeline saved as a directed acyclic graph (DAG) in JSON. See [Data Flow](../data-flow/data-flow.md). |
| **`.sqlnb`** | SQL Notebook: SQL/Markdown/input cells plus environment, in JSON v3.0. See [Notebooks](../notebooks/notebooks.md). |
| **Analysis Vault** | The vault where the AI stores findings and analyses across conversations. See [Analysis Vault](../ai/analysis-vault.md). |
| **Autocomplete** | Table, column, and function suggestions based on clause context, resolved against the engine. See [Autocomplete](../editor/autocomplete.md). |
| **Context as code** | Domain semantics in files (`metrics.yml`, `joins.yml`, `glossary.md`, `examples/`) fed to the AI. See [Context as code](../ai/context-as-code.md). |
| **Data Flow** | The visual pipeline studio: connected nodes that transform data; saves `.sqlchain`. See [Data Flow](../data-flow/data-flow.md). |
| **Deep Dive** | An AI mode that enters a reasoning loop, running queries until the objective is met. See [Deep Dive](../ai/deep-dive.md). |
| **Direct Query** | Querying a data file (CSV/Parquet/Excel) in place, without importing it into the database. See [Importing data](../data/importing-data.md). |
| **DuckDB** | The local analytical engine that runs all SQL; embedded, fast, and serverless. See [Local-first](../concepts/local-first.md). |
| **Editor Assistant** | The AI assistant built into the editor (the Assist panel). See [Editor Assistant](../ai/editor-assistant.md). |
| **In-memory** | The default mode (`:memory:`): you work without a persistent database file. See [Projects & connections](../user-guide/projects-and-connections.md). |
| **Lane** | One of DuckDB's three connection lanes (`main`, `meta`, `ai`) over a single instance, so autocomplete and the AI don't queue behind your queries. See [Architecture](../concepts/architecture.md). |
| **Stage** | Each of the six stages in Story Flow's flow (Type → Data → Format → Style → Story → Export). See [Story Flow](../visualization/story-flow.md). |
| **Local-first** | AmoxSQL's philosophy: your data and files live on your machine, with no required cloud. See [Local-first](../concepts/local-first.md). |
| **Metadata for AI** | An export of your database's schema/profile as context to paste into another AI tool. See [Metadata for AI](../ai/metadata-for-ai.md). |
| **Prompt-only mode** | The fallback path when the active model can't do tool-calling: it maps virtual tables and extracts SQL blocks. See [Prompt-only mode](../ai/prompt-only-mode.md). |
| **Notebook** | A cell-based narrated analysis (SQL, Markdown, input); a `.sqlnb` file. See [Notebooks](../notebooks/notebooks.md). |
| **Project** | A folder with your SQL files, notebooks, context, and config; the unit of work. See [Projects & connections](../user-guide/projects-and-connections.md). |
| **Read-only / read-write** | The connection mode for a database file: read-only (protected) or read-write. See [Projects & connections](../user-guide/projects-and-connections.md). |
| **Report Flow** | The presentation studio: `.amoxdeck` decks with refreshable charts, exportable to Office. See [Report Flow](../reports/report-flow.md). |
| **`RULES.md`** | A behavior-rules file the AI reads and follows in every conversation. See [Context as code](../ai/context-as-code.md). |
| **Semantic layer** | The set of metrics, joins, and glossary that gives the AI a shared business vocabulary. See [Context as code](../ai/context-as-code.md). |
| **Skill** | A reusable procedure (`agent/skills/<id>/SKILL.md`) the AI activates to follow a method. See [Skills](../ai/skills.md). |
| **Story Flow** | The visualization studio: charts in a six-stage flow with a storytelling layer. See [Story Flow](../visualization/story-flow.md). |
| **Tier (model tier)** | An AI model's capability class (low/medium/high) that gates certain modes. See [Providers & models](../ai/providers-and-models.md). |
| **Workspace** | The active workspace (project, database, context), configurable via its wizard. See [Configuration](configuration.md). |

## Related

- [File formats](file-formats.md) · [Configuration](configuration.md) · [Keyboard shortcuts](keyboard-shortcuts.md)
- [AI introduction](../ai/introduction.md) · [Story Flow](../visualization/story-flow.md) · [Data Flow](../data-flow/data-flow.md)
