# Storytelling & overlays

**🌐 English · [Español](../../es/visualization/storytelling-and-overlays.md)**

> Story Flow's Story stage: what turns a chart into a conclusion — headlines, KPIs, annotations, goal and reference lines, focus and trend — plus an AI narrative generator.

<!-- 📷 CAPTURE: docs/images/visualization/story-stage.png — The Story tab open with the Headline Number, Storytelling, Annotations, Focus, Goal Line, Trend, and Reference sections; on the right a bar chart with a title, takeaway, and a goal line. -->

## What it is

The **Story** stage ("Make it speak") is the narrative layer of [Story Flow](story-flow.md). A well-mapped chart already shows the data; this stage makes the reader *get the point in seconds*. It gathers the text (title, subtitle, takeaway, footnote), a headline number, marks anchored to the data (annotations, goal/reference lines, reference area), a focus rule, and a trend line — plus a button that generates the narrative with AI.

Some overlays depend on the chart type, because they only draw where they make sense (see the support table).

## When to use it

- When the chart is going into a report, deck, or screenshot and needs to **say**, not just show.
- To draw attention to a specific point (a spike, a goal, the leading category).
- When you want a quick narrative head start: **Auto Story** proposes a title, subtitle, footnote, and insight from a sample of the data, which you then edit.

## How to use it

### Text and emphasis
1. In **Storytelling**, write **Title**, **Subtitle**, **Footnote**, and **Takeaway (insight)**.
2. Click **Apply** to push them onto the chart.
3. Wrap text in `**asterisks**` in the title, subtitle, and takeaway to highlight it in the accent color (rich text).
4. **Text Alignment** aligns the whole text block (left/center/right).

### Auto Story (AI)
1. With axes already mapped, click **Auto Story**.
2. The AI receives a sample of the data (up to 500 rows) and returns a title, subtitle, footnote, and insights.
3. The text fills the fields; edit it and click **Apply**.

### Headline KPI
1. Turn on **Show Headline KPI**.
2. Pick the metric: **Total (sum)**, **Average**, **Last Value**, or **First Value**.
3. Under **Compare With**, add a delta against the **first** value or the **previous** one.
4. Set the size (Auto or Custom in px).

### Annotations
1. In **Annotations**, add **+ Text** (mark a point) or **+ Box** (mark a region).
2. Choose the X value (and an end X, for a Box), an optional Y value (auto if left empty), and the color.
3. Available on line, bar, and combo charts.

### Focus (Highlight)
1. In **Focus — Highlight**, choose what to highlight: **Max**, **Min**, or **Specific Category** (type the category).
2. Pick the highlight color. The rest of the chart dims so the protagonist stands out.

### Goal, reference, and area
1. **Goal Line** — enable and set the Y value, label, color, and style (solid/dashed/dotted).
2. **Reference Line** — a horizontal reference line (mean, median, benchmark) with a label and color.
3. **Reference Area** — a rectangular band by X and Y range, with color and opacity.

### Trend and moving average
1. In **Trend & Average**, choose **Linear Trend** or **Moving Average**.
2. For the moving average, set the **window size**.
3. Only available on a single series (line or vertical bar); with multiple series or Split By it doesn't apply.

## Reference

| Section | Option | Values / notes |
|---|---|---|
| Headline Number | Show Headline KPI | On/Off |
| | Metric | Total · Average · Last Value · First Value |
| | Compare With | None · First Value · Previous Value (shows the delta) |
| | Font Size | Auto · Custom (12–72 px) |
| Storytelling | Title · Subtitle · Footnote · Takeaway | Text; `**...**` highlights in accent (title/subtitle/takeaway) |
| | Text Alignment | Left · Center · Right |
| | Auto Story | Generates text with AI from a data sample |
| Annotations | + Text / + Box | Point (X, Y) or region (X→X2, Y→Y2) + color |
| Focus — Highlight | Type | None · Max · Min · Specific Category (+ color) |
| Goal Line | Enabled, Y Value, Label, Color, Style | Style: Solid · Dashed · Dotted |
| Reference Line | Y Value, Label, Color | Horizontal line |
| Reference Area | X Start/End, Y Start/End, Color, Opacity | Rectangular band |
| Trend & Average | Overlay | None · Linear Trend · Moving Average (+ Window Size, + color) |

### Support by chart type
| Overlay | Where it draws |
|---|---|
| Annotations | Line, bar, combo |
| Focus (Highlight) | Line, bar |
| Goal / Reference / Area | Line, bar, combo, scatter, waterfall |
| Trend / Moving average | Line, vertical bar (single series) |

The panel only shows overlays the active type can draw, so you never get a control that would do nothing.

## Tips & gems

- **A headline states, it doesn't describe:** "South leads with 16% of sales", not "Sales by region".
- **Annotate the moment that matters:** call out the spike or event, not every point.
- **Context in the number:** always pair a value with its change or comparison (Headline + delta).
- **Auto Story fills, you decide:** treat the AI text as a draft; the manual **Apply** is what locks it in.
- **Trend is dropped when it doesn't apply:** with multiple series a trend line would be a meaningless sum, so it isn't even offered.

## Related

- [Story Flow](story-flow.md) · [Chart types](chart-types.md)
- [Format & style](format-and-style.md) · [AI Assistant](../ai/editor-assistant.md)
