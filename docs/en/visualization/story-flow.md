# Story Flow

**🌐 English · [Español](../../es/visualization/story-flow.md)**

> AmoxSQL's visualization section: turn a query result into a chart that says something, guided through six stages — from "what shape tells the story?" to "ship it".

<img src="../../../images/06_data_visualizer.png" alt="Story Flow in AmoxSQL" width="100%" />

## What it is

**Story Flow** is AmoxSQL's visualization layer. It isn't a "pick a chart and go" panel; it's organized as the natural sequence of telling a story with data: six stages, left to right, each doing one job. You edit a chart on top of a query result without leaving the IDE, and the local engine (DuckDB) feeds the chart directly — no data leaves your machine.

The six stages are tabs in the panel's sidebar:

1. **Type** — "What shape tells the story?" Pick the type by what you want to communicate (see [Chart types](chart-types.md)).
2. **Data** — "What goes where?" Map columns onto channels (X, Y, color/split, size, secondary axis) and shape the data (sort, top-N, date aggregation).
3. **Format** — "Make it readable." Axes, number format, grid, legend, labels, and tooltips (see [Format & style](format-and-style.md)).
4. **Style** — "Make it look good." Palettes, per-series colors, typography, card and background.
5. **Story** — "Make it speak." Title/subtitle/takeaway, headline KPI, annotations, goal/reference lines, trend and focus (see [Storytelling & overlays](storytelling-and-overlays.md)).
6. **Export** — "Ship it." PNG at several sizes, copy to clipboard, and save the configuration as `.amoxvis` (see [Exporting charts](exporting-charts.md)).

The figure is drawn with **Vega-Lite**, the open grammar of graphics, and saved as an **`.amoxvis`** file: a valid Vega-Lite spec that **carries its own query** inside. That's why an `.amoxvis` can re-run on its own (when you open it) or inside a [Report Flow](../reports/report-flow.md) deck, refreshing the chart with current data without redoing the analysis.

## When to use it

- When you already have a result on screen and want to see it as a chart instead of a table.
- To prepare a chart you'll reuse: save it as `.amoxvis` and drop it into a deck or refresh it later.
- When you want the AI to propose a chart and then fine-tune it by hand (see the live-update hook below).
- If you only need to explore values row by row, stay in the [Results table](../results/results-table.md); for descriptive statistics, use the [Data Profiler](../results/data-profiler.md).

## How to use it

### Open the chart from a result
1. Run a query in the [SQL editor](../editor/sql-editor.md) or in a [Notebook](../notebooks/notebooks.md).
2. In the results panel, switch from **Table** to **Chart** with the view toggle in the top bar.
3. Story Flow appears with the chart and the six-stage sidebar. AmoxSQL preselects sensible axes from the columns.

### Open an `.amoxvis` file
1. Double-click an `.amoxvis` file in the [File explorer](../data/file-explorer.md).
2. It opens full-screen: it runs the saved query on mount and shows the chart.
3. Use **Reload** to re-read the saved query from disk and re-run, or **Edit SQL** to open the same query as a SQL tab.

### Walk the stages
1. Start at **Type** and pick the shape; then move through **Data → Format → Style → Story → Export**.
2. The order isn't mandatory: each tab is independent and changes render live.
3. Each tab's footer shows a short hint ("What goes where?", etc.) to orient you.

### Panels or code
The sidebar header has a **Panels | Code** switch:

- **Panels** (the default) — you work through the six stages. Each change generates the figure's Vega-Lite.
- **Code** — the sidebar becomes an editor holding the figure's **Vega-Lite**. Write one or paste one; the figure redraws when you stop typing. The editor validates against the Vega-Lite schema and completes as you type.

Rules so nothing surprises you:

- **Once you edit the code, the code is in charge.** The Type, Data and Format stages stop changing the figure (a notice says so). Style, Story and Export keep working: the title, takeaway, source, palette and card apply in both modes.
- **An error doesn't wipe the figure.** If the JSON is half written or Vega-Lite can't read it, the last good figure stays and the error shows under the editor.
- **Going back to the panels** is done from the notice, with **Use the panels again**. It asks first because it discards the code.
- The data arrives under the name `dataset` (`"data": {"name": "dataset"}`). The title and takeaway are not in the code: they live in **Story**.
- **Add layer…** (above the editor) adds a ready-made layer to the spec: **Mean line**, **Median line**, **Value labels**, or **Regression line**. It only offers the ones that make sense for that figure (a regression line needs a numeric or date X).

### The guide and the tour
- The **?** button (info icon) in the panel header opens a drawer with the **Story Flow guide**: it explains the six stages and the storytelling principles. The same guide lives in Settings → Story Flow.
- The first time you open Story Flow a **welcome tour** starts (a carousel through the six stages). You can replay it from the guide.

### Live update from the AI
When the [AI Assistant](../ai/editor-assistant.md) draws or adjusts a chart, Story Flow listens for that change and **merges** the AI's configuration into yours without overwriting the axes or fields you already picked. So you can ask for a chart and keep refining it by hand.

### Fullscreen
The maximize button (top-right of the chart area) takes the chart full-screen; in that mode a **PNG** button also appears for an instant download.

## Reference

### The six stages
| Stage | Hint | What it controls | Page |
|---|---|---|---|
| **Type** | What shape tells the story? | Chart type (17, grouped by intent) | [Chart types](chart-types.md) |
| **Data** | What goes where? | X/Y/split/size/2nd-axis channels, sort, top-N, date aggregation | this page |
| **Format** | Make it readable | Axes, number format, grid, legend, labels, tooltips | [Format & style](format-and-style.md) |
| **Style** | Make it look good | Palette, per-series colors, typography, card, background, border | [Format & style](format-and-style.md) |
| **Story** | Make it speak | Title/takeaway, KPI, annotations, goal/reference lines, focus, trend | [Storytelling & overlays](storytelling-and-overlays.md) |
| **Export** | Ship it | PNG by size, clipboard, `.amoxvis`, paste JSON | [Exporting charts](exporting-charts.md) |

### Channels (Data stage)
| Channel | What it does |
|---|---|
| Category (X) | X-axis dimension/category (on donut, the segment label) |
| Values (Y) | One or more value columns (checkboxes; with Split By it becomes a single one) |
| Secondary Y-Axis (Right) | Second right-hand scale for one of the series |
| Split By Column | Pivots into one series per distinct value (grouped bars, multiple lines) |
| Bubble Size | Bubble radius (scatter/bubble only) |
| Sort By · Limit | Order (label/value, asc/desc) and top-N (empty = all) |
| Date Aggregation | Group a date column by month or year |

## Tips & gems

- **The `.amoxvis` is self-contained:** it stores the figure *and* the query, so the chart can regenerate itself — the basis of a Report Flow deck that refreshes.
- **The `.amoxvis` isn't locked in:** it is a valid Vega-Lite spec. What belongs to AmoxSQL (the query, the state of the panels) goes in `usermeta`, a field Vega-Lite reserves for that and every other tool ignores.
- **Totals come from every row:** the editor shows at most the first 10,000 rows of a result. If the result was cut and the chart adds up by X (bars, lines, areas, donut, funnel, waterfall…), DuckDB does that sum over the whole query and the canvas bar says so: **Totals from all rows (DuckDB)**. Scatter, histogram and box plot draw the rows there are.
- **Zoom:** on a scatter, and on a date series with many points, the wheel zooms and dragging pans; double-click resets.
- **Your axes survive re-queries:** when you re-run a query with different columns, Story Flow only fills axes that are missing or no longer valid; your manual pick is kept as long as its column still exists.
- **The AI doesn't clobber your work:** an AI proposal is merged onto your current config, not replaced.
- **The theme follows your settings:** the chart adopts the active theme and accent color.

## Related formats

- `.amoxvis` — a Vega-Lite spec with an embedded query (see [File formats](../reference/file-formats.md)).

## Related

- [Chart types](chart-types.md) · [Storytelling & overlays](storytelling-and-overlays.md)
- [Format & style](format-and-style.md) · [Exporting charts](exporting-charts.md)
- [Report Flow (decks)](../reports/report-flow.md) · [Results table](../results/results-table.md)
