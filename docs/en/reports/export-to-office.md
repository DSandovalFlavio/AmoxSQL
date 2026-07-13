# Export to Office

**🌐 English · [Español](../../es/reports/export-to-office.md)**

> Get your work out to PowerPoint and Word as native, editable content: a Report Flow deck becomes a `.pptx` presentation, and a notebook's report becomes a `.docx` document.

<!-- 📷 CAPTURE: docs/images/reports/export-to-office-menu.png — The Report Flow Studio's Export PowerPoint dropdown showing the two options: "Native charts (editable)" and "Image charts", with the second greyed out when not in Present view. -->

## What it is

AmoxSQL exports to the two most common Office formats, each from a different section:

- **PowerPoint (`.pptx`)** from a [Report Flow](report-flow.md) deck: each slide becomes a native slide with text, tables, and charts.
- **Word (`.docx`)** from a [Notebook](../notebooks/notebooks.md) report: the markdown text, result tables, and charts become native Word content.

In both cases, charts are **re-queried at export time** — the result reflects current data, not a stale render. Text and tables are native, editable content, not images.

## When to use it

- **PowerPoint** when the destination is a presentation and you want charts that can be edited in PowerPoint (or, for types with no equivalent, a faithful image).
- **Word** when the destination is a report document built from a narrated notebook.
- If you only need a single standalone image of a chart, use the PNG from [Exporting charts](../visualization/exporting-charts.md).

## How to use it

### PowerPoint — native charts (editable)
1. In the Report Flow Studio, open the menu next to **Export PowerPoint** and choose **Native charts (editable)**.
2. Types with a native mapping (bar, line, area, donut, pie, combo, and the bar variants) export as **real PowerPoint charts**: double-clicking them in PowerPoint opens the data grid.
3. Types with no native mapping fall back to an image automatically.

### PowerPoint — image charts
1. Switch to the **Present** view (required: it's where each chart is mounted in the DOM to be captured).
2. In the export menu, choose **Image charts**.
3. Each chart is captured as a PNG and inserted into the slide. Outside Present view, this option is disabled.

### Word — notebook report
1. From a notebook, launch the Word export.
2. AmoxSQL walks the cells: markdown becomes native text, result tables become Word tables, and charts are inserted as PNG.
3. Charts are always captured in light theme (Word is read on a white page), restoring your theme afterwards.

## Reference

### PowerPoint: chart modes
| Mode | What it produces | Requirement |
|---|---|---|
| Native charts (editable) | Native PowerPoint charts where a mapping exists | — |
| Image charts | PNG snapshot of the mounted chart | **Present view active** |

### Types with a native PowerPoint chart
| Native (editable) | Image only |
|---|---|
| bar, bar-stacked, bar-100 | scatter |
| bar-horizontal (+ stacked, + 100%) | bubble |
| line, area | heatmap |
| donut, pie | treemap |
| combo | funnel, waterfall |

### Word (from the notebook)
| Element | How it exports |
|---|---|
| Markdown text | Native Word text (headings, bold, lists, links) |
| Result tables | Native Word tables (up to 200 rows per table) |
| Charts | PNG image (captured in light theme) |
| SQL code | Monospaced blocks (can be hidden) |

## Tips & gems

- **Native drops the storytelling overlays.** In native mode, the PowerPoint chart keeps the type, series, labels, and base colors, but **drops** annotations, goal/reference lines, trend, and the headline KPI — they have no equivalent in PowerPoint's chart API. If you need those overlays faithfully, export that chart as an image.
- **Image requires Present view.** Image export captures the already-mounted chart; only Present view has all slides in the DOM, so switch to Present first.
- **Word exports the notebook, not the deck.** The `.docx` comes from the notebook report (text + tables + charts), not from a Report Flow deck.
- **Always fresh data.** Both PowerPoint and Word re-run the queries at export.

## Related formats

- `.amoxdeck` — source deck for the PowerPoint export (see [Report Flow](report-flow.md)).
- `.sqlnb` — source notebook for the Word export (see [Notebooks](../notebooks/notebooks.md)).

## Related

- [Report Flow (decks)](report-flow.md) · [Exporting charts](../visualization/exporting-charts.md)
- [Notebooks](../notebooks/notebooks.md) · [Reports from a notebook](../notebooks/reports.md)
