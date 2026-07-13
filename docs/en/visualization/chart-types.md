# Chart types

**🌐 English · [Español](../../es/visualization/chart-types.md)**

> Story Flow's 17 chart types, grouped by what you want to communicate — Compare, Trend, Composition, Relationship, and Flow — not by their geometry.

<!-- 📷 CAPTURE: docs/images/visualization/chart-type-selector.png — The Type stage's type selector, with the Compare/Trend/Composition/Relationship/Flow categories expanded showing each type's icon. -->

## What it is

The **Type** stage of [Story Flow](story-flow.md) is a visual grid, not a dropdown. Types are grouped by **narrative intent** (what you want the reader to understand), and within each group they run simple to complex. Picking the right type is the story's first decision: the right shape makes the message read in seconds.

One principle drives the whole catalog: **the shape of the data rules**. A common trap: a date with only 2–3 periods is a *comparison*, not a *trend* — use grouped bars, not a line.

## When to use it

Use this page as a reference when you open the **Type** tab. When in doubt, start from intent: are you comparing magnitudes, showing change over time, breaking down a whole, relating two variables, or following stages of a flow? The group narrows the candidates.

## How to use it

1. In the Story Flow panel, open the **Type** tab.
2. Expand the category that matches your message (Compare, Trend, Composition, Relationship, Flow).
3. Click the type. The chart redraws instantly; adjust channels in **Data** if needed.

> **Stacked variants.** The 100% and stacked variants (vertical or horizontal) are really a bar with a **stack mode**. Choosing "Stacked Column" is the same as vertical bar + stacked; "100% Stacked Bar" is horizontal bar + proportional. You can also change the mode in **Format → Bar Options → Bar Layout**.
>
> **Bubble = scatter + size.** The Bubble type is a scatter with a **size** column (the *Bubble Size* channel in the Data stage). Without a size column, it behaves like a uniform scatter.

## Type reference

### Compare — magnitudes side by side
| Type | UI label | Use it for |
|---|---|---|
| `bar` | Column | Comparing categories with vertical bars. The workhorse; also ideal for 2–3 periods. With Split By → grouped bars. |
| `bar-horizontal` | Bar | Ranking, long category names, or many categories (horizontal bars). |

### Trend — change over a continuum
| Type | UI label | Use it for |
|---|---|---|
| `line` | Line | A real time series (ideally ≥4–5 points). |
| `area` | Stacked Area | A time series emphasizing volume, with stacked areas. |
| `combo` | Combo | Two metrics on different scales (bar + line), using a secondary Y-axis. |

### Composition — parts of a whole
| Type | UI label | Use it for |
|---|---|---|
| `bar-stacked` | Stacked Column | Absolute composition across categories (stacked columns). |
| `bar-100` | 100% Stacked | Percentage distribution across categories (normalizes to 100%). |
| `bar-horizontal-stacked` | Stacked Bar | Absolute composition in horizontal bars. |
| `bar-horizontal-100` | 100% Stacked Bar | Percentage distribution in horizontal bars. |
| `donut` | Donut | Proportion with few segments (≤7); supports a center KPI. |
| `pie` | Pie | Proportion as a full circle (donut usually reads better). |
| `treemap` | Treemap | Hierarchical proportions as nested rectangles. |

### Relationship — how variables relate
| Type | UI label | Use it for |
|---|---|---|
| `scatter` | Scatter | Correlation between two numeric variables. |
| `bubble` | Bubble | Correlation with a third value encoded as size (scatter + size). |
| `heatmap` | Heatmap | A two-dimensional pattern by color intensity (e.g. cohorts). |

### Flow — stages / pipeline
| Type | UI label | Use it for |
|---|---|---|
| `funnel` | Funnel | Sequential stages with drop-off (a conversion funnel). |
| `waterfall` | Waterfall | Cumulative bridge: how components add/subtract up to a total. |

## Tips & gems

- **2–3 periods ⇒ bars, not a line.** A line with few points implies a trend that isn't there. Save `line`/`area` for series with several points.
- **Many segments ⇒ bars, not a donut.** Beyond ~7 parts a donut becomes unreadable; a sorted horizontal bar communicates better.
- **The UI label isn't the internal geometry.** "Column" is a vertical bar and "Bar" is horizontal; the stacked ones are the same bar with a different *Bar Layout*.
- **The AI reasons the type, it doesn't look it up.** When you ask for a chart, the assistant chooses the shape using these same intent criteria.

## Related

- [Story Flow](story-flow.md) · [Format & style](format-and-style.md)
- [Storytelling & overlays](storytelling-and-overlays.md) · [Exporting charts](exporting-charts.md)
