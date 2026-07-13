# Report Flow

**🌐 English · [Español](../../es/reports/report-flow.md)**

> Build presentations from your analysis: `.amoxdeck` decks of markdown slides with live charts that refresh against current data, edited visually in the Report Flow Studio.

<!-- 📷 CAPTURE: docs/images/reports/report-flow-studio.png — The Report Flow Studio in Design view: toolbar on top (Refresh all, Export PowerPoint, Design/Present/Source, Save), a Slides/Layouts/Charts side panel on the left, and the active slide with prose and an embedded chart on the right. -->

## What it is

**Report Flow** is AmoxSQL's presentation section. A deck is saved as an **`.amoxdeck`** file, which inside is just markdown: a *front-matter* block (title, theme, aspect, variables), slides separated by a `---` line, one layout directive per slide, and charts embedded as ` ```amoxchart ` blocks that **reference an `.amoxvis` file** by path.

But you don't edit that markdown by hand: the **Report Flow Studio** is a visual interface, exactly like Story Flow builds a chart and saves `.amoxvis` underneath. A deck's charts are **live embeds** — each remembers its `.amoxvis` query and re-runs when you click **Refresh all**, so the deck reflects current data without redoing the analysis.

The deck opens in the IDE when you double-click an `.amoxdeck`. From here you can export to editable PowerPoint (see [Export to Office](export-to-office.md)).

## When to use it

- When the analysis ends in a presentation and you want the charts to stay live, not static snapshots.
- To assemble a recurring report: use **variables** in the front-matter (e.g. a region) and refresh the deck when the data changes.
- When you'd rather edit visually slide by slide than write markdown.

## How to use it

### Create and structure a deck
1. Open an `.amoxdeck` file (or create one). It opens in the Report Flow Studio.
2. Start in the **Design** view, which edits **one active slide** at a time.
3. In the **Layouts** panel, choose the active slide's layout; in **Slides**, reorder, move, or delete slides, or click **+ Add slide**.

### Add prose and charts
1. Prose is *click-to-edit* directly on the slide.
2. In the **Charts** panel, pick an `.amoxvis` to place it on the active slide (it replaces that slide's chart; it's never appended to the end of the file).
3. A content-only slide gains its chart slot by being promoted to `content-chart` automatically.

### Refresh the charts
1. Click **Refresh all** in the toolbar.
2. Each chart re-runs its query against the deck's **current variables** (`{{variable}}`), updating the data.

### Review and export
1. The **Present** view renders all slides read-only, for review (and it's the DOM source for exporting charts as images).
2. The **Source** view shows the raw markdown in the editor, for power users.
3. **Export PowerPoint** builds the presentation (see [Export to Office](export-to-office.md)).

## Reference

### Deck front-matter
| Field | What it controls |
|---|---|
| `title` | Deck title (badge in the toolbar) |
| `theme` | Deck visual theme |
| `aspect` | Slide aspect ratio: `16:9` · `4:3` · `1:1` |
| `variables` | Key/value pairs injected into queries as `{{key}}` |

### Slide layouts
| Layout | For |
|---|---|
| `title` | Cover / divider (centered title) |
| `content` | Prose only |
| `content-chart` | Prose + chart in two columns |
| `chart-full` | Full-slide chart |
| `two-col` | Two columns |

The `<!-- layout: X -->` directive is the first line of the slide; it defaults to `content`.

### Studio — views and panels
| Element | What it does |
|---|---|
| Design view | Edits the active slide (click-to-edit prose + chart slot) |
| Present view | All slides read-only (review + source for image export) |
| Source view | Raw markdown in the editor |
| Slides panel | Reorder, move, delete, add slides |
| Layouts panel | Apply a layout to the active slide |
| Charts panel | Insert/replace the active slide's chart |
| Refresh all | Re-runs every query with the deck's variables |

## Tips & gems

- **Charts are live embeds, not images:** an `.amoxchart` block points to an `.amoxvis` by path; change the `.amoxvis` and the deck reflects it on refresh.
- **Variables for templated reports:** define `region: "US"` in the front-matter, use it as `{{region}}` in queries, and change just that line to regenerate the deck.
- **Markdown is the storage, not the interface:** you edit visually; the Source view exists for when you need fine control.
- **Inserting a chart acts on the active slide:** picking a chart places it on the focused slide, not at the end of the file.

## Related formats

- `.amoxdeck` — markdown presentation deck (see [File formats](../reference/file-formats.md)).
- `.amoxvis` — embedded chart, with its query (see [Exporting charts](../visualization/exporting-charts.md)).

## Related

- [Export to Office](export-to-office.md) · [Story Flow](../visualization/story-flow.md)
- [Exporting charts](../visualization/exporting-charts.md) · [Notebooks](../notebooks/notebooks.md)
