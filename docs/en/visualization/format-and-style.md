# Format & style

**🌐 English · [Español](../../es/visualization/format-and-style.md)**

> The two stages that make a chart readable and then good-looking: Format tunes axes, numbers, grid, legend, labels, and tooltips; Style applies palettes, typography, and card finish.

<!-- 📷 CAPTURE: docs/images/visualization/format-style-tabs.png — Story Flow's Format and Style tabs side by side: on the left the Format sections (Number Format, Axis Labels, Grid & Legend), on the right the Style sections (Color Palette, Typography, Card). -->

## What it is

**Format** ("Make it readable") and **Style** ("Make it look good") are stages ③ and ④ of [Story Flow](story-flow.md). Format is the mechanics: making values effortless to read. Style is the finish: a clean visual identity. The options shown adapt to the active chart type — a donut hides axis controls, a scatter adds quadrants, and so on.

## When to use it

- **Format**: when numbers overlap, the scale misleads, labels are missing, or the tooltip doesn't say enough.
- **Style**: when the chart is going into a report or deck and needs a palette, typography, and frame consistent with the rest.

## How to use it

### Format — readability
1. Open the **Format** tab.
2. In **Number Format**, pick the abbreviation (compact, currency, thousands, millions, percent…) and the decimals.
3. In **Axis Labels**, adjust the size, intensity, gap, max length (truncation), and rotation of the labels.
4. In **Vertical Axis**, turn on a log scale or manually pin Y Min/Max; if you use a secondary axis, set its range.
5. In **Data Labels**, turn on value labels, choose the tooltip style (Standard or **Rich**, with Δ vs. previous), and the label position.
6. In **Grid & Legend**, choose the grid, axis lines, and legend position.
7. Adjust **Margins & Spacing** if content is crowding the edges.

### Style — appearance
1. Open the **Style** tab.
2. Pick a **palette** from the five groups, or set **per-series colors** one by one.
3. In **Typography**, choose the font, text scale, and label intensity.
4. Adjust **Background** (canvas tone), **Card** (shadow, radius, gradient background), and **Border**.

## Reference — Format stage

### Numbers and axes
| Section | Option | Values |
|---|---|---|
| Number Format | Abbreviation | Auto (compact) · Standard · Currency · Thousands · Millions · Billions · Percentage · Raw (8 options) |
| | Decimal Places | Auto · 0 · 1 · 2 · 3 · 4 |
| Axis Labels | Label Size | 8–24 px |
| | Label Intensity | 20–100% (opacity of ticks, titles, and legend) |
| | Gap from Axis | 0–30 px |
| | Max Length | 0 = auto; >0 truncates to N characters |
| | Label Rotation | 0° · 45° · 90° (line/bar/area/combo/waterfall) |
| Vertical Axis | Logarithmic Scale | On/Off (data spanning orders of magnitude) |
| | Y Min / Y Max | Manual domain (empty = auto) |
| Secondary Axis (Right) | Min / Max | Appears when a secondary Y-axis is assigned |
| Axis Titles | Category / Value Axis Title | Text + show toggle |

### Mark detail
| Section | Option | Values |
|---|---|---|
| Data Labels | Show Data Labels | On/Off |
| | Tooltip Style | Standard · **Rich (value + Δ vs. previous)** |
| | Show % of Total in Tooltip | On/Off (Standard tooltip only) |
| | Label Position | Outside · Inside Center · Inside Start · Inside End |
| | Label Size · Hide if space < | 8–20 px · px threshold to hide cramped labels |
| Grid & Legend | Grid Lines | Both · Horizontal · Vertical · None |
| | Show Axis Lines & Ticks | On/Off |
| | Legend Position | Top · Bottom · Left · Right · Hidden |
| Line Options | Interpolation | Smooth · Linear · Step · Step Before · Step After |
| | Fill Area · Show Points · Cumulative Sum | Area fill · points · running total |
| Bar Options | Bar Layout | Grouped · Stacked · 100% Stacked |
| | Corner Radius | 0–20 px |
| | Color Mode | By Series · By Category · **Intensity by Value** (grouped only) |
| Donut Options | Inner Radius (Thickness) | 0–90 |
| | Center Metric | None · Total · Average |
| Scatter Options | Automatic Quadrants | Crosshairs at the means |
| Combo Options | Line series toggles | Pick which series are lines; the rest are bars |
| Margins & Spacing | Title Gap · Top · Bottom · Left · Right | Margins in px |

## Reference — Style stage

| Section | Option | Values |
|---|---|---|
| Color Palette | Groups | **Modern** (default, vivid, neon) · **Qualitative** (set1, set2, pastel, dark2) · **Sequential** (blues, greens, reds, purples, ylorbr) · **Diverging** (spectral, rdylbu, rdylgn, piyg) · **Brand** (ocean, sunset, corporate) |
| Series Colors | Per-series color | Individual color; on line/combo, also a style (Solid/Dashed/Dotted); on donut, color per segment |
| Background | Canvas Tone | Default · Darker · Lighter · Warm · Cool · Custom (color) |
| Typography | Font Family | System · Inter · Lato · IBM Plex Sans · Manrope · Space Grotesk · Lora · JetBrains Mono (8) |
| | Text Size Scale · Label Intensity | 75–200% · 20–100% |
| Fill (line/area) | Area Fill | Gradient (fades out) · Solid |
| Card | Drop shadow · Corner Radius · Gradient background | On/Off · 0–28 px · From → To gradient |
| Border | Border Style | None · Solid · Dashed · Subtle (+ color) |

## Tips & gems

- **Rich tooltip = value + delta:** it automatically shows the change from the previous point, with nothing else to configure.
- **Color by intensity:** on grouped bars, "Intensity by Value" tints each bar by its value — a free 1D heatmap.
- **KPI in the donut center:** "Center Metric" puts the total or the average in the central hole.
- **Scatter quadrants:** turn on "Automatic Quadrants" to split the plot by the means and classify points into four zones.
- **Pin the Y domain to compare:** if you're building several charts that will be read together, pin Y Min/Max so the scales match.

## Related

- [Story Flow](story-flow.md) · [Chart types](chart-types.md)
- [Storytelling & overlays](storytelling-and-overlays.md) · [Exporting charts](exporting-charts.md)
