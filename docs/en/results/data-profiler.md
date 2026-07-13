# Data Profiler

**🌐 English · [Español](../../es/results/data-profiler.md)**

> An automatic exploratory analysis of your result: a plain-language verdict, findings ranked by importance, and per-column detail.

<img src="../../../images/12_data_profiler.png" alt="AmoxSQL Data Profiler" width="100%" />

## What it is

The **Data Profiler** (the [results table](results-table.md)'s **Profile** mode) examines your query's result and tells you, in plain language, what story the data tells. Instead of a cold table of statistics, it leads with a one- or two-sentence **verdict**, followed by a **scorecard** and a list of **findings** ranked by severity.

Under the hood it uses DuckDB (`SUMMARIZE` plus a statistics enrichment pass) to compute everything locally and instantly, over the full result set.

## When to use it

- Right after bringing in a table or a query result, to understand it before analyzing it.
- To audit **data quality**: nulls, duplicates, outliers, constant columns.
- To detect each column's **semantic type** (identifier, date, category, email…) and relationships between columns.
- As a step before charting: from here you can jump to a chart of any column.

## How to use it

1. Run a query and, in the results panel, switch to **Profile** mode.
2. Read the **verdict** at the top: it summarizes dimensions, overall cleanliness, and the most important warning.
3. Check the **scorecard**: Rows, Columns, Completeness, Duplicate rows, and the number of Findings (colored by severity).
4. Scan the **Findings**, ordered from critical to informational.
5. In **Columns**, click a row to **expand** that column's detail: a histogram (numeric) or the most frequent values (text), plus its statistics.
6. Look at **Relationships** for the strongest correlations between numeric columns.

### Semantic types
Beyond the SQL type, the profile infers a meaningful type and gives it an icon: **Identifier** (id/uuid/key or nearly all unique), **Date**, **Boolean**, **Number**, **Email**, **Category** (few distinct values), or **Text**.

### Plot a column
When you expand a column, the **Plot** button opens a **new, editable chart** in its own tab, built from a derived, aggregated query (a histogram for numeric, a time series for dates, top-20 for categorical). It doesn't chart the raw million rows: it builds exactly the chart's data.

### Narrate with AI
The **Narrate with AI** button sends the verdict, the findings, and the column summary to the [AI Assistant](../ai/editor-assistant.md) to write a short narrative: what the data tells, what to watch for, and what to explore next.

### Export
- **HTML** — download a self-contained report with verdict, scorecard, findings, and the columns table.
- **PDF** — open a print view ready to save as PDF.
- **Full screen** — expand the profile to full screen.

## Findings reference

| Category | Examples of what it detects |
|---|---|
| **Missing values** | Almost empty (≥95%), mostly empty (>50%), some nulls (>5%) |
| **Duplicates** | Exact repeated rows (inflate counts and averages) |
| **No variation** | Column with a single value (no signal) |
| **Cardinality** | Looks like an identifier · high cardinality (too granular to group) |
| **Distribution** | Highly skewed (use the median) · mostly zeros · unexpected negatives |
| **Outliers** | Values beyond the 1.5×IQR range |
| **Dates** | Date range · possible gaps in the series |
| **Concentration** | Dominated by one value (>80%) |
| **Keys & relationships** | Candidate key (a unique column pair) · strong correlations (r>0.95) |

## Per-column statistics reference

| Numeric | Text |
|---|---|
| Distinct, missing | Distinct, missing |
| Min / Max, Mean, Median | Length min/avg/max |
| Standard deviation, Skewness | Most common value and its % |
| Zeros / Negatives, outliers | Top values |

## Tips & gems

- **Read the verdict first:** it condenses into one sentence what would take you a while to deduce from the table.
- **The colored dot per column** in the Columns view shows its worst finding (red critical, amber warning, green OK) at a glance.
- **High skew → use the median:** when a column is very skewed, the profile warns you the mean is misleading and gives you the median.
- **Correlations ≈ 1** suggest redundant columns: you might keep just one.
- **The profile is local and instant:** it runs on DuckDB on your machine; no waiting on an external service.

## Related

- [Results table](results-table.md) · [Story Flow](../visualization/story-flow.md)
- [AI Assistant](../ai/editor-assistant.md) · [Execution plan](execution-plan.md)
