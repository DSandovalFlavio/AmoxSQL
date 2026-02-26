<img src="./assets/logo.svg" alt="AmoxSQL Logo" width="300" height="300" align="center"/> 

# AmoxSQL (v1.2.0)

> **The Modern Codex for Local Data Analysis.**
>
> *A high-performance, local-first IDE built from Latin America for the global developer community.*


[![Built for DuckDB](https://img.shields.io/badge/Built%20for-DuckDB-fff000?logo=duckdb&logoColor=black)](https://duckdb.org/)
[![License: Source Available](https://img.shields.io/badge/License-Source%20Available-blue)](./LICENSE)
[![Maintainer](https://img.shields.io/badge/maintainer-@dsandovalflavio-blue)](https://github.com/dsandovalflavio)
[![Official Website](https://img.shields.io/badge/🌐_Official_Website-AmoxSQL-00ffff)](https://dsandovalflavio.github.io/amoxsql-landing-page/)
[![Sponsor](https://img.shields.io/badge/❤️_Sponsor-GitHub_Sponsors-ea4aaa?logo=githubsponsors&logoColor=white)](https://github.com/sponsors/dsandovalflavio)

**AmoxSQL** is a professional, high-performance Local Data IDE built specifically for [DuckDB](https://duckdb.org/). Designed for serious data analysts and engineers who need speed, privacy, and advanced tooling without the cloud overhead.

---

## 📜 The Story Behind the Name

Data is the modern form of recorded knowledge. Our project's identity is rooted in this timeless concept from ancient Mesoamerica.

The name **"Amox"** derives from the Nahuatl word ***Amoxtli***, meaning "book" or "codex". These sacred repositories were used by scribes to record history, astronomical calculations, and knowledge.

**AmoxSQL** is the spiritual successor to those ancient tools—a modern, digital codex designed for the data age.

### The Emblem

The glowing glyph representing AmoxSQL symbolizes the fusion of ancient structure and modern energy.

* **The Structure:** The stylized 'A' evokes the architectural precision of an ancient glyph or a structured data schema.
* **The Light:** The electric cyan glow cuts through the dark environment of the IDE, representing the core promise of the tool: **transforming opaque raw data into luminous, clear visualizations.**

---

## 🚀 Key Features

AmoxSQL is designed for speed, privacy, and a superior developer experience.

### 🧠 Core Workflow & Architecture
* **Project-Centric Workflow**: Organize your work in project folders. The IDE auto-detects existing `.duckdb` or `.db` files upon opening a project.
* **Multi-Tab Architecture**: Work on multiple queries and notebooks simultaneously in a modern tabbed interface.
* **Split View**: Compare code side-by-side or view results alongside your editor.
* **Robust Connection Management**: Implements a "Hard Reset" strategy to ensure clean switching between projects, preventing locked files and "zombie" connections.

### 🤖 AmoxSQL AI (Local & Cloud Intelligence)
*   **100% Offline & Private (Local Mode)**: Powered by a local **Ollama** engine (e.g., Qwen2.5-Coder). Your data never leaves your machine.
*   **Cloud Power (Gemini Mode)**: Seamlessly switch to Google's Gemini API for state-of-the-art reasoning with built-in daily free-tier usage tracking to keep you in control.
*   **Integrated Model Management**: Download new local Ollama models directly from within the IDE's unified Settings Modal.
*   **Natural Language to SQL**: Ask questions like *"Show me the top 5 products by sales in 2023"* and get accurate DuckDB SQL instantly.
*   **Smart Context**: The AI understands your current database schema automatically, optimizing prompts to fit within context limits.
*   **Code Generation**: Supports complex JOINs, CTEs, and Window Functions.

### 💾 Database Management & Inspection
*   **Flexible Connection Modes**:
    *   **In-Memory Mode**: For ultra-fast, ephemeral analysis sessions.
    *   **Persistent Connections**: Attach existing DB files in Read-Only or Read/Write mode.
*   **BigQuery-Style Table Inspector**:
    *   **Right-Click Details**: Access a full-screen deep dive into any table.
    *   **Schema Tab**: View column types, nullability, and keys.
    *   **Data Profile Tab**: Instant statistical summary using `SUMMARIZE`. Visual Sparklines for Null %, Cardinality (Unique values), and Min/Max distributions.
    *   **Preview Tab**: Paginated view of raw data (Top 200 rows).
    *   **DDL Tab**: View the original `CREATE TABLE` statement.
*   **Intuitive Drag & Drop**: Instantly drag tables or individual columns from the sidebar directly into your SQL Editor.
*   **Instant Table Preview**: Quick "Magnifying Glass" feature to peek at the first 50 rows of any table from the sidebar.
*   **Enhanced Results Table**:
    *   **Global Search**: Filter results instantly across all columns.
    *   **Sorting**: Click column headers to sort ascending/descending.

### 📝 SQL Editing & Notebooks
* **Powerful SQL Editor**: Powered by the **Monaco Editor** (the engine behind VS Code) for a familiar experience with robust auto-completion.
* **SQL Notebooks (`.sqlnb`)**: A Jupyter-like experience for SQL. Combine rich Markdown documentation with executable SQL cells in a single document.
    *   **Presentation Mode**: Switch to "Report View" to hide code cells and display only Markdown text, interactive charts, and data tables.
    *   **PDF Export**: Export your full notebook as a clean, professional PDF report directly from Presentation Mode.
    *   **HTML Export**: Generate a self-contained, interactive HTML report with sortable tables and embedded charts — perfect for sharing via email or Slack.
* **Save Queries**: Save your work directly as `.sql` files within your project structure.

### 📊 Data Visualization & IO
* **Instant Visualizations**: Turn query results into charts immediately with an integrated graphing engine (built with Recharts).
    * Supported types: Line, Multi-line, Bar (Horizontal/Vertical), Scatter, and Donut charts.
* **Persistent Chart Configurations (`.amoxvis`)**: Save your advanced visualization designs as `.amoxvis` files directly in your workspace. Edit, load, and keep your charts organized alongside SQL scripts.
* **Advanced Charting Controls**:
    *   **Pivot & Aggregation**: Split series by column, summarize by time (Daily/Monthly/Yearly).
    *   **Customization**: Granular control over colors, line styles, opacity, margins, layout spacing, and data label positioning.
    *   **Axes & Scaling**: Toggle Logarithmic scale, dynamic X/Y bounds, and custom axis titles.
    *   **Reference Indicators**: Add customizable horizontal/vertical reference lines and colored reference areas to highlight targets or thresholds.
    *   **Number Formatting**: Display values in Compact (1.2k), Millions (1.2M), Currency, or Raw formats.
* **High-Quality Export**: Export your charts instantly as high-resolution (up to 4x scale) PNG images.
* **Customizable Accent Palette**: 10 brand colors derived from the AmoxSQL logo gradient, plus Linear Blue.

### 🧩 Extension Management
*   **Extension Gallery**: Browse, search, and install DuckDB extensions from a visual card-based gallery.
*   **Core vs Community badges**: Quickly identify official core extensions from community contributions.
*   **One-click Install**: Install and load extensions directly from the UI.

### 🐛 Advanced Debugging Tools
*   **CTE Debugger**: interactive "Step-Through" for Common Table Expressions. Click the "Play" icon next to any `WITH` clause to inspect intermediate results without rewriting your query.
*   **Query Execution Plan**: Visualize the performance of your SQL.
    *   **Tree Visualization**: Interactive breakdown of query costs.
    *   **Bottleneck Detection**: Automatically highlights high-cost nodes (e.g., expensive Sorts or Scans).
    *   **Split View**: Analyze the plan side-by-side with your code.
* **Seamless Data Import/Export**:
    * **Bulk Import**: Import individual CSV/Parquet files or entire folders directly into DuckDB tables with options for cleaning column names.
    * **Result Export**: Download any query result set as a CSV file.

---

## 🛠️ Tech Stack

This project is built with a modern, performance-oriented stack:

* **Frontend**: [React](https://reactjs.org/), [Vite](https://vitejs.dev/), [Monaco Editor](https://microsoft.github.io/monaco-editor/), [Recharts](https://recharts.org/).
* **Backend**: [Node.js](https://nodejs.org/), [Express](https://expressjs.com/).
* **Database Engine**: [DuckDB](https://duckdb.org/) (via high-performance Node.js bindings).

---

## ⬇️ Installation & Download

### 🎁 v1.2.0 — Free Public Release
This version is available for everyone. Download the source code and build it yourself, or grab the pre-built installer from the releases page.

👉 **[Download v1.2.0 from Releases](https://github.com/DSandovalFlavio/AmoxSQL/releases)**

### 🚀 Future Versions — Sponsors Only
Starting with v1.3+, pre-built installers (`.exe`) will be available exclusively to **GitHub Sponsors** via a private repository. Sponsors get:

- ✅ Ready-to-use Windows installers (no build setup required)
- ✅ Early access to new features and updates
- ✅ Priority bug fixes and support
- ✅ Access to the private releases repository

[![Become a Sponsor](https://img.shields.io/badge/Become_a_Sponsor-ea4aaa?style=for-the-badge&logo=githubsponsors&logoColor=white)](https://github.com/sponsors/dsandovalflavio)

> **Note:** The source code will always remain public. Anyone can build from source at any time.

### 🛠️ Build from Source
If you prefer to compile it yourself:

1.  Clone the repo.
2.  Ensure you have **Node.js 20+** and C++ build tools installed (for DuckDB native bindings).
3.  Run `npm install` at the root.
4.  Run `npm run dev` to run amoxSQL.

---

## 🖥️ Usage Guide

### Getting Started
1.  **Welcome Screen**: Upon launch, enter the **Absolute Path** of your desired project folder.
2.  **Database Selection**: If `.db` files are detected, a modal will prompt you to select one to attach (Read-Only/Read-Write) or to start a fresh in-memory session.

### Core Operations
* **Run SQL**: In a `.sql` file or notebook cell, type your query and press `Ctrl/Cmd + Enter` or click the "Run" button.
* **Import Data**: Right-click a file (CSV, Parquet) or folder in the File Explorer and select "Import to DB".
* **Visualize Results**: After running a query, switch the bottom panel tab from "Results" to "Chart" to configure your visualization.
* **Create Notebook**: Right-click in the File Explorer file list and select "New Notebook" to create a `.sqlnb` file.

---

## 💖 Support the Project

AmoxSQL is built with passion from Latin America. If it's useful to you, consider supporting its development:

[![Sponsor on GitHub](https://img.shields.io/badge/Sponsor_on_GitHub-ea4aaa?style=for-the-badge&logo=githubsponsors&logoColor=white)](https://github.com/sponsors/dsandovalflavio)

Your sponsorship helps fund:
- 🚀 New features and integrations
- 🐛 Bug fixes and performance improvements
- 📚 Documentation and community resources

---

## ⚖️ License

This project is source-available under the **AmoxSQL Community License**.

You are free to view, modify, and compile the source code for personal or educational use.
**Commercial redistribution and SaaS usage are strictly prohibited.**

See the [LICENSE](./LICENSE) file for the full text and terms.

### ®️ Trademark Notice
The "AmoxSQL" name and the AmoxSQL logo (including the SVG, PNG files in this repository) are trademarks of Flavio Sandoval. They are included here for display purposes within the official software distribution. You may not use these logos in derivative works or commercial products without explicit permission.

---

## ❤️ Acknowledgements & Credits

AmoxSQL stands on the shoulders of giants. We deeply appreciate the amazing open-source tools that make this project possible:

* **[DuckDB](https://duckdb.org/)**: For creating the incredible in-process SQL OLAP database engine that powers this entire tool.
* **[Monaco Editor](https://microsoft.github.io/monaco-editor/)**: For providing a world-class editing experience.
* **[Recharts](https://recharts.org/)**: For their composable and reliable charting library for React.
* **[React](https://reactjs.org/) & [Vite](https://vitejs.dev/)**: For the fast and modern frontend development experience.
* **[Node.js](https://nodejs.org/) & [Express](https://expressjs.com/)**: For the robust backend foundation.
* **[react-markdown](https://github.com/remarkjs/react-markdown)**: For enabling the rich text capabilities in our SQL-Notebooks.

---

## 🤝 Contributing

We welcome contributions from everyone! AmoxSQL is a community-driven project.

Whether it's reporting bugs, suggesting features, or submitting pull requests, your help is appreciated. Please check our [Contributing Guide](CONTRIBUTING.md) (coming soon!) for details on how to get started.

> **Note:** By contributing to AmoxSQL, you agree that your contributions will be licensed under the project's [AmoxSQL Community License](./LICENSE).

---

<p align="center">
  <a href="https://dsandovalflavio.github.io/amoxsql-landing-page/">🌐 Official Website</a> · 
  <a href="https://github.com/sponsors/dsandovalflavio">💖 Sponsor</a> · 
  <a href="https://github.com/dsandovalflavio">👤 @dsandovalflavio</a>
  <br><br>
  Created with 💙 from Latin America to the World.
</p>