# Accuracy & guardrails

**🌐 English · [Español](../../es/ai/accuracy-and-guardrails.md)**

> Why you can trust the numbers: AmoxSQL surrounds the AI with automatic checks that catch misleading charts, joins that inflate totals, and made-up figures — and correct or warn before any of it reaches you.

<!-- 📷 CAPTURE: docs/images/ai/guardrails-caveat.png — AI response showing an "unverified figure" caveat and a fan-out warning on a query result -->

## What it is

A language model on its own can be confidently wrong: pick a chart that misleads, sum over a bad join, or cite a number that came from no query. AmoxSQL doesn't trust the AI blindly: it wraps it in a set of **guardrails** that verify its work against the local engine and against your real results.

Some **correct** silently (a trend line that makes no sense is removed before it's drawn). Others **warn** — the AI, so it can fix things, or you, with a visible caveat. The goal is simple: the numbers you see should hold up to a second look.

## When it applies

- In **any** AI conversation (Assistant or Deep Dive) that runs SQL or generates charts.
- You don't need to enable anything: the guardrails run on their own. This page explains **what** they do so you know what the warnings mean when they appear.

## How it works

### Findings verification (made-up figures)
When the AI closes with findings that cite figures ("+41%", "$50k"), AmoxSQL checks that those numbers **actually appear** in the results of the queries it ran (with a rounding tolerance). If a figure can't be verified, a **caveat** is added so you review it before acting. It doesn't block the response — it just flags it.

### Join fan-out detection (inflated totals)
A JOIN whose key isn't unique on the right side duplicates rows and silently **inflates** `SUM`, `AVG` and `COUNT`. After each query with a JOIN, AmoxSQL compares the result's row count against the base tables'; if the result is much larger than expected, it emits a **fan-out warning** suggesting `DISTINCT`, grouping before joining, or verifying key uniqueness.

### Chart linters (misleading visualizations)
When building a chart, AmoxSQL reviews choices that mislead the reader and corrects or flags them:
- **Meaningless trend line:** removed if it would be computed over multiple series (it would average unrelated series).
- **Rainbow ranking:** painting each bar a different color hides the order — it suggests one color with emphasis on the leader.
- **Sequential palette on unsorted bars:** an intensity scale implies ordered magnitude; it warns if the bars aren't sorted by value.
- **Red on a neutral metric:** red reads as alarm; reserve it for loss/churn/below-target, not revenue or volume.
- **Donut with too many slices (>7):** unreadable — it suggests a bar ranking.

### SQL self-correction
If a query fails (say, a misspelled table name), the AI **doesn't give up**: it receives the error and a directive to verify names with `list_tables` and retry. It retries up to 3 times before reporting the problem.

### Stall watchdog
If the AI's stream **freezes** (a provider stops responding), a watchdog detects it after a period of silence, aborts that iteration, and **resumes** the analysis from where it was, instead of leaving you with an endless spinner.

### Rendering context (colors that read)
The AI knows your **active theme and accent color** (light/dark). So it picks chart palettes that read well on your real background and harmonize with your accent, rather than colors that vanish or clash. See [Themes & appearance](../user-guide/themes-and-appearance.md).

### Prompt caching (speed and cost)
With compatible providers (Anthropic), the stable part of the AI's instructions is **cached**, so later turns are faster and cheaper. It doesn't change the answers; only performance.

## Reference

| Guardrail | What it prevents | Corrects or warns |
|---|---|---|
| Findings verification | Figures that came from no query | Warns (visible caveat) |
| Fan-out detection | Totals inflated by duplicating joins | Warns (on the result) |
| Trend-line linter | Trend over unrelated series | Corrects (removes it) |
| Color/format linters | Charts that mislead the reader | Warns (AI fixes it) |
| SQL self-correction | Getting stuck on a query error | Corrects (retries ≤3) |
| Stall watchdog | Frozen streams / endless spinners | Corrects (resumes) |
| Rendering context | Unreadable colors on your theme | Prevents (picks better) |
| Prompt caching | Slow/expensive turns | Optimizes |

## Tips & gems

- **A caveat doesn't mean "it's wrong", it means "check it".** Findings verification is conservative: it flags what it couldn't confirm, not what's false.
- **The fan-out warning is one of the most valuable.** A total inflated by a join is among the hardest errors to spot by eye; having the app catch it saves you wrong conclusions.
- **The chart linters push toward good design**, aligned with [Story Flow](../visualization/story-flow.md): one color for a ranking, red only for the negative, no 12-slice donuts.
- **Pair them with [context as code](context-as-code.md)** for maximum accuracy: guardrails catch mistakes; context stops them from happening by fixing correct metrics and joins.

## Related

- [Agent tools](agent-tools.md) · [Context as code](context-as-code.md) · [Deep Dive](deep-dive.md)
- [Story Flow](../visualization/story-flow.md) · [Themes & appearance](../user-guide/themes-and-appearance.md)
