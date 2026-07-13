# Introduction to AmoxSQL

**🌐 English · [Español](../../es/user-guide/introduction.md)**

> AmoxSQL is a high-performance, **local-first** data IDE built specifically for DuckDB. Speed, privacy, and advanced tooling — without the overhead of the cloud.

<img src="../../../images/02_main_ide.png" alt="AmoxSQL IDE" width="100%" />

## What AmoxSQL is

AmoxSQL is a desktop application for data analysts and engineers who want to explore, transform, visualize, and document data with SQL — all on their own machine. The engine is [DuckDB](https://duckdb.org/), an extremely fast in-process analytical database, so there's no server to manage and no network latency: queries run locally and instantly.

Around that engine, AmoxSQL adds what a modern data IDE needs:

- A **SQL editor** with autocomplete that understands your real schema.
- **Notebooks** for narrated analyses.
- **Story Flow** for storytelling visualization, **Report Flow** for presentations, and **Data Flow** for visual pipelines.
- An **agentic AI system** that runs locally (with Ollama) or in the cloud, able to explore your data on its own.
- **DBT** integration, statistical profiling, execution plans, and more.

## Philosophy: local-first

Your data never has to leave your machine. The engine is local, storage is local, and even the AI can run 100% offline with local models. That means **privacy** (nothing is uploaded to an external service unless you choose to), **speed** (no network round-trips), and **control**. See [Local-first](../concepts/local-first.md).

## Who it's for

- **Data analysts** who live in SQL and want to iterate fast over CSVs, Parquet, Excel, or DuckDB databases.
- **Data engineers** building transformations, pipelines, and DBT models locally.
- **Anyone** who wants to explore data with AI help without sending it to the cloud.

## The name

**"Amox"** comes from the Nahuatl ***Amoxtli***: "book" or "codex." In ancient Mesoamerica, codices were repositories of knowledge — history, calculations, learning. AmoxSQL is a modern digital codex for the data era: it turns raw, opaque data into clear, luminous visualizations.

## Next steps

1. [Installation](installation.md) — download the installer or build from source.
2. [First steps](first-steps.md) — open your first project and run your first query.
3. [The interface](interface.md) — a tour of the app's areas.

## Related
- [Installation](installation.md) · [First steps](first-steps.md) · [The interface](interface.md)
- [Architecture](../concepts/architecture.md) · [Local-first](../concepts/local-first.md)
