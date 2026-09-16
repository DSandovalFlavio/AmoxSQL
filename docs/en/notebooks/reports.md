# Taking the notebook out of AmoxSQL

**🌐 English · [Español](../../es/notebooks/reports.md)**

> Two ways out, and they do different jobs: a Word document that circulates, and a deck that gets projected.

## What it is

Once the analysis is done it has to leave the tool. The [notebook](notebooks.md) has two buttons for that, and the difference between them is not the format but the use:

- **Word** — a document that **circulates**. It gets commented on, signed, attached to an email. The record of an analysis often ends up there.
- **Deck** — a [Report Flow](../reports/report-flow.md) deck, which gets **projected**. Slides, one figure per page, for telling it in front of people.

## Word

The document carries, in the notebook's own order: the text of the text cells, and for each SQL cell its table or its figure.

Before starting it asks one thing: **whether the queries go in**.

| Option | For whom |
|---|---|
| With the queries | For whoever will review the path. The SQL stays as an appendix |
| Text and results only | For whoever reads the conclusions |

Figures are captured **from what is on screen**, so a cell collapsed to "code only" has no figure to capture. The notebook names those cells before exporting, instead of letting you find out in the document — which is where nobody looks twice.

## Deck

Each text cell becomes a prose slide, and each cell **with a chart configured and run** becomes a figure slide. Charts are written as `.amoxvis` files in the project's `charts/` folder, so the slide does not carry a pasted image: it carries a **live reference** that can be reopened and refreshed.

Which cells have a chart is read from the notebook's state, not from what is visible: a collapsed or scrolled-away cell counts just the same.

The deck opens in a new tab and is edited from there with the [Report Flow](../reports/report-flow.md) studio, which exports to native, editable PowerPoint.

## What is gone, and why

The notebook used to have a **Report mode**, a **Present mode** and an **HTML export**. All three were retired: they were a poorer version of what a deck does, and a deck already had its bridge from here. Keeping two paths to the same place forces a choice for no reason, and makes one of them rot.

The notebook's PowerPoint export went for the same reason: a deck exports to PowerPoint better, and the bridge to it is one button away.

## Related

- [Notebooks](notebooks.md) · [Report Flow](../reports/report-flow.md)
- [Export to Office](../reports/export-to-office.md) · [Story Flow](../visualization/story-flow.md)
