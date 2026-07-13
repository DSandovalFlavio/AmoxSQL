# Reports from a notebook

**🌐 English · [Español](../../es/notebooks/reports.md)**

> Turn your notebook into a clean document to read, present, or export to HTML and Word.

## What it is

Every [SQL Notebook](notebooks.md) has, besides the **Edit** mode, a **Report** mode and a **Present** mode that turn it into a polished document: no per-cell toolbars, with prose and results centered on a sheet-like page. From there you can hide the code, print, or **export** to a self-contained HTML file or to Word.

It's how you share the analysis with someone who won't open AmoxSQL: the same notebook you worked in becomes the deliverable.

## When to use it

- To present a notebook's findings to someone else or project them.
- To generate an HTML or Word report you can email or archive.
- When you want a PDF: get it by printing the Report mode.
- For a deliverable with templates and editable slides (native PowerPoint/Word), use [Report Flow](../reports/report-flow.md) instead.

## How to use it

### Switch to report view
1. In the notebook bar, use the **Edit / Report** switch. In **Report**, the document is shown centered, without each cell's editing tools.
2. Press **Present** to enter full screen (presentation mode). Leave with **Esc** or the **Exit** button.

### Show or hide the code
The **Show Code / Code Hidden** button toggles the visibility of the SQL blocks. With code hidden, the report shows only the prose and results (tables and charts) — ideal for a business audience.

### Print / PDF
Press **Print** to open the system print dialog. Choose "Save as PDF" to get a PDF of the report.

### Export to HTML
The **Export HTML** button generates a **self-contained `.html` file** (everything embedded, no external dependencies) that downloads directly. It includes:

- **Table of contents** built from the Markdown headings (with in-page links).
- **Sortable tables**: click a column header to sort (shows up to 200 rows per table).
- **Charts as PNG images**: each chart is captured as it looks and embedded as a high-resolution image (2x), with its title, subtitle, and footnote.
- **Light/dark theme**: the HTML adopts the app's active theme at export time.

### Export to Word
The **Export Word** button generates a **`.docx`** document of the notebook report: it respects the "hide code" setting and includes the prose, tables, and charts with their configuration. It's an editable document, not an image.

> **Scope:** *Export Word* here covers the **notebook report**. For Office presentations and documents with templates and deck-refreshable charts, see [Export to Office](../reports/export-to-office.md).

## Action reference (Report/Present bar)

| Button | What it does | Notes |
|---|---|---|
| **Edit / Report** | Toggle between editing and report view | — |
| **Present** | Full screen | Exit with Esc |
| **Show Code / Code Hidden** | Show or hide the SQL blocks | Also affects exports |
| **Print** | System print dialog | Path to PDF |
| **Export HTML** | Download a self-contained `.html` | TOC, sortable tables, PNG charts, theme |
| **Export Word** | Download a `.docx` of the report | Editable; respects "hide code" |

## Tips & gems

- **"Show/hide code" propagates:** if you hide the code before exporting, the HTML and Word come out without SQL too.
- **Charts export as they look:** tune each chart (type, colors, title) in the cell view before exporting; the export captures that exact state.
- **Row limit in exported tables:** the HTML embeds up to 200 rows per table to keep the file light. For the full set, export the data from the editor or the results table (see [Saving results](../results/saving-results.md)).
- **Reproducibility:** because results are saved inside the `.sqlnb`, you can export a report without re-running the queries.

## Shortcuts & related formats

- **Esc** exits Presentation mode.
- Outputs: `.html` (self-contained) and `.docx` (Word). See [File formats](../reference/file-formats.md).

## Related

- [Notebooks (.sqlnb)](notebooks.md) · [Results table](../results/results-table.md)
- [Report Flow (decks)](../reports/report-flow.md) · [Export to Office](../reports/export-to-office.md)
- [Saving results](../results/saving-results.md)
