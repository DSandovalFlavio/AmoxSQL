# Exporting charts

**🌐 English · [Español](../../es/visualization/exporting-charts.md)**

> Story Flow's Export stage: get the chart out as a PNG in slide- or social-ready sizes, copy it to the clipboard, or save it as `.amoxvis` to reuse and refresh.

<!-- 📷 CAPTURE: docs/images/visualization/export-stage.png — The Export tab with the Clipboard, Canvas size (PowerPoint 16:9, 4:3, Square, Phone Story, Wide Banner, Original presets), and Configuration file sections. -->

## What it is

The **Export** stage ("Ship it") is step ⑥ of [Story Flow](story-flow.md). It has two distinct natures: getting an **image** out (a PNG at a specific size or to the clipboard) and saving the **configuration** as an `.amoxvis` file. The image is the finished result; the `.amoxvis` is the reusable recipe — remember it **carries the query inside**, so the chart can regenerate itself or live inside a [Report Flow](../reports/report-flow.md) deck.

## When to use it

- **PNG** when you need an image to drop into a presentation, document, or social post.
- **Copy to clipboard** when you're about to paste straight into another app.
- **`.amoxvis`** when the chart outlives the moment: you'll reopen it, put it in a deck, or refresh it with new data.
- **Paste JSON from AI** when the assistant hands you a configuration and you want to apply it to the current chart.

## How to use it

### Download as PNG
1. Open the **Export** tab.
2. In **Canvas size**, pick a preset or **Original size** (uses the real on-screen size).
3. The PNG is generated and downloaded instantly. In fullscreen, a **PNG** button does the same at the current size.

### Copy to clipboard
1. In **Clipboard**, click **Copy chart as image**.
2. The chart is copied as a PNG; paste it with Ctrl+V into any app.

### Save and load configuration
1. In **Configuration file**, click **Save as .amoxvis** and name it.
2. It stores the full configuration **plus the query** that feeds the chart.
3. To restore a configuration, use **Load configuration** and pick an `.amoxvis` (or `.json`).

### Paste JSON from the AI
1. Click **Paste JSON from AI** and paste the configuration object.
2. AmoxSQL **validates it against the columns** of the current result before applying, so the axes reference columns that exist.
3. If valid, the configuration is applied to the on-screen chart.

## Reference

### Size presets (PNG)
| Preset | Dimensions | For |
|---|---|---|
| PowerPoint 16:9 | 1920 × 1080 | Widescreen slide |
| PowerPoint 4:3 | 1440 × 1080 | Classic slide |
| Square (1:1) | 1080 × 1080 | Square post |
| Phone Story (9:16) | 1080 × 1920 | Vertical story |
| Wide Banner | 1200 × 628 | Banner / link preview |
| Original size | on-screen size | Export exactly as shown |

### Actions
| Action | What it does |
|---|---|
| Copy chart as image | Copies the chart to the clipboard as PNG |
| Save as .amoxvis | Saves configuration + query to an `.amoxvis` file |
| Load configuration | Loads an `.amoxvis`/`.json` into the current chart |
| Paste JSON from AI | Applies a pasted config, validating it against the columns |

## Tips & gems

- **The `.amoxvis` isn't an image:** it's the live recipe with the query; open it later and it re-runs with current data.
- **Original size respects your layout:** if you tuned margins and proportions, "Original size" exports exactly that.
- **Validation prevents broken axes:** pasting AI JSON won't apply a configuration that points at columns that don't exist.
- **PNG to share, `.amoxvis` to build:** use PNG when the destination is flat; use `.amoxvis` when the chart will go into a Report Flow deck.

## Related formats

- `.amoxvis` — chart configuration with an embedded query (see [File formats](../reference/file-formats.md)).

## Related

- [Story Flow](story-flow.md) · [Format & style](format-and-style.md)
- [Report Flow (decks)](../reports/report-flow.md) · [Export to Office](../reports/export-to-office.md)
