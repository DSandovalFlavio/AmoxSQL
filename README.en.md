<img src="./assets/logo.svg" alt="AmoxSQL Logo" width="220" height="220" align="center"/>

# AmoxSQL

> **The Modern Codex for Local Data Analysis.**
>
> *A high-performance, local-first data IDE — built from Latin America for the global community.*

**🌐 English · [Español](./README.md)**

[![Built for DuckDB](https://img.shields.io/badge/Built%20for-DuckDB-fff000?logo=duckdb&logoColor=black)](https://duckdb.org/)
[![License: Source Available](https://img.shields.io/badge/License-Source%20Available-blue)](./LICENSE)
[![Maintainer](https://img.shields.io/badge/maintainer-@dsandovalflavio-blue)](https://github.com/dsandovalflavio)

**AmoxSQL** is a professional, high-performance desktop data IDE built specifically for [DuckDB](https://duckdb.org/). For analysts and engineers who need speed, privacy, and advanced tooling — without the overhead of the cloud. Your data, the engine, and even the AI live on your machine.

<img src="./images/02_main_ide.png" alt="AmoxSQL IDE" width="100%" />

---

## ✨ Capabilities

| | What it does | Guide |
|---|---|---|
| **SQL editor** | Monaco with schema-aware autocomplete (including CTE columns), CTE debugging, formatting, and one-shortcut execution. | [→](./docs/en/editor/sql-editor.md) |
| **Notebooks** | Jupyter-style `.sqlnb` notebooks for narrated analyses, with reactive input cells and HTML/Word/PDF export. | [→](./docs/en/notebooks/notebooks.md) |
| **Story Flow** | Storytelling visualization: 17 chart types in a 6-stage flow, annotations, KPIs, and narrative. | [→](./docs/en/visualization/story-flow.md) |
| **Report Flow** | `.amoxdeck` presentations with refreshable charts; export to editable PowerPoint and Word. | [→](./docs/en/reports/report-flow.md) |
| **Data Flow** | Visual pipeline builder (DAG) with 33 node types, step execution, and AI enrichment. | [→](./docs/en/data-flow/data-flow.md) |
| **Agentic AI** | Editor assistant + **Deep Dive** that explores your DB on its own. Runs 100% local (Ollama) or in the cloud. | [→](./docs/en/ai/introduction.md) |
| **DBT Studio** | Develop with dbt + DuckDB: models, sources, commands, and a lineage graph. | [→](./docs/en/dbt/dbt-studio.md) |
| **Profiling & plan** | Storytelling EDA and a real execution plan (`EXPLAIN ANALYZE`) with optimization hints. | [→](./docs/en/results/data-profiler.md) |

---

## 📚 Documentation

The full guide (bilingual ES/EN) lives in **[`docs/`](./docs/README.md)**:

- **Get started:** [Introduction](./docs/en/user-guide/introduction.md) · [Installation](./docs/en/user-guide/installation.md) · [First steps](./docs/en/user-guide/first-steps.md) · [The interface](./docs/en/user-guide/interface.md)
- **Editor & data:** [SQL editor](./docs/en/editor/sql-editor.md) · [File explorer](./docs/en/data/file-explorer.md) · [Import](./docs/en/data/importing-data.md) · [Export](./docs/en/data/exporting-data.md)
- **Analysis:** [Results table](./docs/en/results/results-table.md) · [Data Profiler](./docs/en/results/data-profiler.md) · [Execution plan](./docs/en/results/execution-plan.md)
- **Studios:** [Story Flow](./docs/en/visualization/story-flow.md) · [Report Flow](./docs/en/reports/report-flow.md) · [Data Flow](./docs/en/data-flow/data-flow.md) · [DBT](./docs/en/dbt/dbt-studio.md)
- **AI:** [Introduction](./docs/en/ai/introduction.md) · [Deep Dive](./docs/en/ai/deep-dive.md) · [Providers & models](./docs/en/ai/providers-and-models.md) · [Skills](./docs/en/ai/skills.md)
- **Reference:** [File formats](./docs/en/reference/file-formats.md) · [Configuration](./docs/en/reference/configuration.md) · [Shortcuts](./docs/en/reference/keyboard-shortcuts.md) · [Glossary](./docs/en/reference/glossary.md)

---

## ⬇️ Installation

**Download (Windows):** the pre-built installer is on **[GitHub Releases](https://github.com/dsandovalflavio/amoxsql/releases/latest)**.

**Build from source** (always free): requires Node.js 20+, pnpm 11+, and C++ build tools.
```bash
git clone https://github.com/dsandovalflavio/amoxsql.git && cd amoxsql
pnpm install && pnpm --dir client install
pnpm start
```
Full guide: [Installation](./docs/en/user-guide/installation.md).

> Continuous pre-built installers are available to [GitHub Sponsors](https://github.com/sponsors/dsandovalflavio). Building from source is always free.

---

## 🆕 What's new

The current version is **v3.8.3**. Latest: export now belongs to the query (WYSIWYG), exported Excel that actually opens, near-instant file metadata, and a UI-wide button-placement audit. Before that: reimagined Deep Dive (narrative, color-theory charts, MiniMax reasoning), Report Flow and Office export, and the theme-system redesign.

> Full history in **[CHANGELOG.md](./CHANGELOG.md)**.

---

## 📜 The name

**"Amox"** comes from the Nahuatl ***Amoxtli*** ("book" or "codex"). In Mesoamerica, codices recorded knowledge — history, calculations, learning. AmoxSQL is a modern digital codex for the data era: it turns raw, opaque data into clear, luminous visualizations. The luminous glyph fuses ancient structure with modern energy.

---

## 🛠️ Tech stack

Desktop (Electron) · Frontend [React](https://reactjs.org/) + [Vite](https://vitejs.dev/) + [Monaco](https://microsoft.github.io/monaco-editor/) + [Recharts](https://recharts.org/) · Backend [Node.js](https://nodejs.org/) + [Express](https://expressjs.com/) · Engine [DuckDB](https://duckdb.org/) · AI [Ollama](https://ollama.ai/) (local) + cloud (Google Gemini, Anthropic, OpenAI, Google Vertex, MiniMax) via [Vercel AI SDK](https://sdk.vercel.ai/).

More in [Architecture](./docs/en/concepts/architecture.md).

---

## ❤️ Sponsor

AmoxSQL is built and maintained by a solo developer from Latin America. If you find it useful, consider sponsoring. Sponsors get pre-built installers, early access, feature priority, and a direct channel.

👉 **[Become a Sponsor](https://github.com/sponsors/dsandovalflavio)**

---

## ⚖️ License

Source-available under the **AmoxSQL Community License**. You may view, modify, and build the code for personal or educational use. **Commercial redistribution and SaaS use are prohibited.** See [LICENSE](./LICENSE).

"AmoxSQL" and its logo are trademarks of Flavio Sandoval.

---

## 🤝 Contributing

Contributions welcome! See [CONTRIBUTING.md](./CONTRIBUTING.md). By contributing, you agree to license your work under the AmoxSQL Community License.

---

<p align="center">
  <a href="https://dsandovalflavio.github.io/amoxsql-landing-page/">🌐 Website</a> ·
  <a href="./docs/README.md">📚 Docs</a> ·
  <a href="https://github.com/sponsors/dsandovalflavio">💖 Sponsor</a>
  <br><br>
  Built with 💙 from Latin America for the World.
</p>
