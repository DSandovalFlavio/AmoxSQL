# Changelog

All notable changes to AmoxSQL are documented here.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)

---

## [3.2.0] — 2026-06-26

### Snappier UI and a smarter SQL editor

A performance and editor pass: the interface feels instant even with heavy charts open, and SQL completion is faster, better ranked, and understands more of your query.

#### Performance
- **Instant panel switching** — the editor and sidebar panels are memoized, so changing activity-bar tabs no longer re-renders the whole IDE.
- **Smooth scrolling over heavy charts** — sidebar and modal scrollers get their own compositor layer; scrolling no longer repaints a fullscreen chart behind them.
- **No more blur cost** — every backdrop blur was removed in favor of a (slightly darker) dim, eliminating compositing jank on modals and overlays.
- **Fluid AI panel** — the assistant panel now opens by revealing a fixed-width layer instead of reflowing its content frame-by-frame.
- **Steadier charts** — chart redraws are debounced during sidebar animations, and the fullscreen chart no longer forces an oversized GPU layer (fixes scrollbar stutter).

#### SQL completion
- **Faster and better ranked** — completions are filtered and re-ranked in place as you type (no per-keystroke round-trip), so the right item surfaces sooner.
- **Context-aware ranking** — columns and aliases in scope rank above keywords; the item you used last for a prefix is pre-selected; columns already used in the statement are boosted (e.g. a `SELECT` column repeated in `GROUP BY`).
- **Robust clause detection** — recognizes the clause even on DuckDB file-based queries (`FROM 'data.csv'`), so functions no longer leak into `GROUP BY`.
- **CTE & subquery columns** — the editor now resolves the real output columns of CTEs and `FROM`-subqueries through the engine, including derived columns like `SELECT a + b AS total`.
- **Less noise** — dbt/Jinja helpers only appear in templated files; the DuckDB function catalog is prefetched so the first suggestion is complete.

---

## [3.1.0] — 2026-06-26

### Data Flow — new nodes, clearer organization, in-app docs, and studio identity

The visual pipeline studio gains new node types, a reorganized palette, per-node documentation, and a guide with a first-run tour. Documents are still chains (`.sqlchain`); the studio is now presented as **Data Flow**, parallel to Story Flow for visualizations.

#### New nodes
- **Date / Time** — parse, extract, truncate, format, add/subtract, diff and age in a single node.
- **Flatten / Unnest** — JSON fields → columns, or arrays → rows.
- **Cloud Bucket** — read CSV/Parquet/JSON from S3 or GCS storage.
- **Google Sheet** — read a sheet (and optional tab) into a table.
- **AI Enrich** — apply the active AI model per row: classify, extract, summarize, redact PII, or a custom instruction.

#### Enhanced nodes
- **Join** — composite keys (multiple `left = right` column pairs).
- **Group & Aggregate** — `HAVING` plus `COUNT DISTINCT`, percentile, median, stddev, variance, `STRING_AGG`, `LIST`, first/last.
- **Filter** `BETWEEN`, **Clean** regex-extract / split / normalize, **Sample** stratified.
- **Add Column** — no-code expression builder (insert columns and function templates).
- **Export** — write to S3/GCS destinations and partitioned output (`PARTITION_BY`).

#### Organization & in-app documentation
- Palette reorganized into 9 intent-based groups: Data Sources, SQL, Filter & Order, Columns, Clean & Format, Reshape & Aggregate, Combine & Enrich, Output, Quality & Control.
- Every node carries built-in docs — a "?" on each palette item opens a reference popover, and a new **Info** tab in the node config panel shows the same documentation in context.

#### Studio identity
- The visual editor is presented as **Data Flow** (a breadcrumb `Data Flow / <document>` in the toolbar).
- In-app **"What is Data Flow?"** guide + first-run tour, plus a **Settings → Data Flow** reference page — consistent with Story Flow.

---

## [3.0.0] — 2026-06-25

### Deep Dive — full redesign + artifact reference layer

A major overhaul of the Deep Dive experience: the agent now communicates its work step by step, and the user can point at any artifact it produced and converse about it.

#### Deep Dive redesign
- **3-region window**: chat (left, with input + conversation context) · step inspector (center) · fixed right bar (Plan + Artifacts), splitting the remaining space 50/50.
- **Conversations moved to the left sidebar**; Deep Dive opens in its own tab.
- **Inspector grouped by plan step in execution order**, each step showing its conclusion, readable SQL + result table, inline charts, and its reasoning.
- **Final synthesis (NarrativeCard) rendered in the chat**, not the inspector.
- Fixes: "+" no longer opens duplicate conversations; long plans continue correctly; context consolidated to the input.

#### Artifact reference layer ("Ask about this")
- Reference any chart, query, plan step or finding and ask about it — the artifact is packaged as turn context (rehydrated server-side from the query cache by `queryId`).
- `@`/`#` mention autocomplete for session artifacts; quick-actions (Explain · Redo differently · Go deeper · Validate); select text/number → floating "Ask about this".

#### UX & robustness fixes
- `.amoxvis` export now uses the canonical flat shape, so the opened chart matches the preview; chart action renamed to **"Open in Story Flow"**.
- Horizontal bar value labels no longer clipped in the inspector.
- Transcript scroll position remembered per conversation.
- **Stall watchdog in the agentic loop**: a frozen model stream is aborted after 90s of silence and the plan resumes, instead of hanging forever.
- Labeled **"Context for this conversation"** bar docked above the input; consistent spacing in the agent message bubble.

---

## [2.2.0] — 2026-05-06

### Data Diving — Agentic Loop v2

The biggest update to Data Diving since its introduction. The agent now behaves like a real analyst partner instead of a rigid script executor.

#### New Features

**Agentic Loop v2**
- **Dynamic iteration budget**: plan complexity drives the max iterations ceiling (steps × 3, clamped to [15–50]). A 10-step analysis no longer hits the 15-iteration wall mid-way.
- **Continue button on loop exhaustion**: when the agent runs out of iterations inside an active plan, it pauses instead of silently warning. The user sees a banner with plan progress and can continue with one click, preserving all context.
- **Plan persistence across turns**: plans survive follow-up messages and continuation requests. The agent picks up from the last completed step, not from zero.
- **build_notebook update mode**: `build_notebook` now supports `mode="update"` to append new sections to an existing `.sqlnb` file. The agent can build the analysis document incrementally across multiple turns.

**DataDiving Agent Behavior**
- **Conversation State Awareness**: the agent now explicitly distinguishes NEW analysis requests from FOLLOW-UPs. On follow-ups it skips re-profiling, re-attaching files already in context, and re-running the full EDA — it jumps directly to the relevant query or chart and references prior findings.
- **Flexible Analysis Patterns**: EDA playbooks rewritten as descriptive guides (not rigid step sequences). Each pattern declares what questions it answers, which tools are relevant, what to skip if already done, and key decisions — giving smaller models room to adapt instead of mechanically following scripts.
- **build_notebook on demand only**: `build_notebook` is no longer auto-called at the end of every EDA. Notebooks are created only on explicit user request ("create a notebook", "save this analysis").
- **create_plan threshold**: default is always "plan for analyses requiring 3+ steps"; only two explicit exceptions (conversational follow-ups, single query+chart answers). Removes the ambiguous "rule of thumb" that caused smaller models to skip planning for full EDAs.

**Infrastructure**
- **Dynamic port assignment**: the Express server prefers port 3001 but automatically falls back to an OS-assigned port if 3001 is busy. No more startup failures in multi-app environments. The actual port is communicated to the renderer at runtime via `process.parentPort`.
- **AI schema initialized at startup**: `amoxsql_ai` schema is created on the server's default in-memory DB at startup, not only when a project DB is connected. DataDiving conversations now persist from the first message regardless of whether a project is open.
- **ConversationList auto-refresh**: the conversation list in the left panel updates immediately when a new conversation is created, without requiring a search change or page reload.

#### Bug Fixes
- Fixed `ReferenceError` in `buildContinuationPrompt` after a rename — the `maxIterations` parameter was renamed but body reference wasn't updated, silently breaking plan execution.
- Fixed unescaped backticks inside template literal in `modes.js` that caused `SyntaxError: Unexpected identifier 'path'` at server startup.
- Fixed malformed template literals in `SettingsModal` after `API_BASE` migration.
- Added `strictPort: true` to Vite dev config to surface port conflicts immediately instead of silently switching ports.

---

## [2.1.1–2.1.5] — 2026-03

### Major Features (since 2.1.1)

**Chains v2 — Visual DAG Builder**
- 7 new node types added (SQL Exec, Notebook, DDL Table, Data Quality, Visualization, Transform, Export)
- SSE-based execution logs with real-time streaming per node
- Schema validation on connections, node preview panel, template library
- File picker integration for data source nodes

**AI Improvements**
- `source_query_id` on findings — every AI finding is now linked to the query that produced it, enabling verification and preventing hallucinated metrics
- Join sanity-check: warns when a JOIN produces unexpected row expansion (fanout detection)
- SQL self-correction loop: agent retries failed queries with error hints before surfacing to the user
- Vertex AI ADC support: Google Cloud Application Default Credentials for enterprise Gemini usage
- MiniMax provider added (M2.7, M2.5, M2-Her)
- Improved analytical communication style and notebook quality in DataDiving

**Design System**
- Full oklch-based CSS token architecture (30+ design tokens, consistent color math)
- Dark Islands theme + Islands Blue accent color
- 8 themes total: Obsidian, Onyx, Carbon, Graphite, Nord Dark, Ivory, Mist, Light

**DataDiving**
- Fixed notebook redirect loop: switching back to the DataDiving tab no longer re-opens the last notebook
- `processedArtifactsRef` pre-populated on mount to prevent re-opening existing artifacts

**Other**
- Project management API: backend endpoints + frontend for project open/switch/Git operations
- AI context handling: drag tables/files into DataDiving context panel, persisted per conversation

---

## [2.1.0] — 2026-01

- Data Diving mode introduced: full 3-column agentic analysis panel
- AI Assistant sidebar separated from Data Diving
- AgentPlanPanel: real-time plan progress visible to user
- Session artifacts (notebooks, charts, vault entries) tracked per conversation
- Conversation history with search, star, delete, pagination
- Agentic loop v1: create_plan → execute → update_plan → final_answer protocol
- NarrativeCard: structured final_answer rendered as analysis card with findings, tldr, suggestions

---

## [2.0.0] — 2025-10

- Initial public release
- Electron + React + Express + DuckDB architecture
- Monaco Editor SQL IDE with autocomplete, CTE debugger, execution plan
- SQL Notebooks (.sqlnb) with markdown + code cells
- DataVisualizer: 12+ chart types via Recharts
- DataProfiler: statistical profiling, null rates, distributions, correlation heatmap
- DBT integration: model editor, schema.yml generator, DAG lineage view
- AI sidebar: Ollama + Gemini provider support, tool-calling, conversation history
