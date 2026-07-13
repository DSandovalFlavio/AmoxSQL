# Context as code

**🌐 English · [Español](../../es/ai/context-as-code.md)**

> Your project's semantic layer: a few version-controlled files that teach the AI what your data means, how your tables join, and what "revenue" means in your business — so it answers accurately to *your* reality, not a generic one.

<!-- 📷 CAPTURE: docs/images/ai/context-folder.png — Settings → AI, context tab: status of the context/ folder with metrics.yml, joins.yml, glossary.md and examples marked -->

## What it is

The AI sees your tables' schema (column names, types) but **doesn't know what they mean in business terms**. Without help, "revenue" could be `orders.total`, `payments.amount` or `invoices.value` — and it guesses. A JOIN between `orders` and `customers` might go through `customer_id`, `user_id` or `email`. "MAU" exists as a column nowhere.

**Context as code** solves this with a `context/` folder at your project root where you define metrics, canonical joins and a glossary in YAML/Markdown files. The AI reads them automatically at the start of **every** conversation and uses them as the source of truth. Everything is optional: if the folder doesn't exist, the AI works with no extra context.

Separately, a `RULES.md` file at the root defines **how the AI should behave** in this project (conventions, constraints, preferences). The key distinction: `context/` is *what the data means*; `RULES.md` is *how the AI should act*.

## When to use it

- When you have **your own business terms** ("revenue", "churn", "active user") with an exact definition the AI must always respect.
- When your tables join in a specific way and you don't want the AI to guess the keys.
- When you work as a **team**: version the context in the repo and everyone shares the same definitions without re-explaining them.

## How to use it

### Create the folder from Settings
1. Open **Settings → AI** and go to the context tab (*AI Context*).
2. If `context/` doesn't exist, you'll see the **Create Context Folder** button. Tick which files you want (metrics, joins, glossary, examples) and create them.
3. AmoxSQL generates the structure with commented examples you can edit. If the folder already exists, the button becomes **Add Missing Files**.

### Define metrics — `context/metrics.yml`
Each metric carries its DuckDB SQL expression, a description, and optionally `grain` and `table`. The AI looks it up with the `lookup_metric` tool before calculating.

```yaml
metrics:
  - name: revenue
    sql: "SUM(amount) FILTER (WHERE status = 'paid')"
    description: Total paid revenue. Excludes refunds and test orders.
    grain: order
    table: orders
```

### Define joins — `context/joins.yml`
The correct relationships between tables, so the AI doesn't guess columns. The `on` condition can include filters that always apply.

```yaml
joins:
  - from: orders
    to: customers
    on: "orders.customer_id = customers.id"
    type: LEFT
```

### Define the glossary — `context/glossary.md`
Free-form Markdown with your domain terms and their rules (what "revenue" excludes, what an "active user" is, that `amount` is in cents, etc.). The AI reads all of it.

### Add examples — `context/examples/*.sql`
Question → canonical-SQL pairs. The first comment lines (`--`) are the question; the rest is the reference SQL. The AI finds them with `find_example` when a question looks similar.

```sql
-- What is the monthly revenue trend for the last 12 months?
SELECT DATE_TRUNC('month', created_at) AS month,
       SUM(amount) FILTER (WHERE status = 'paid') AS revenue
FROM orders
WHERE created_at >= CURRENT_DATE - INTERVAL 12 MONTHS
GROUP BY 1 ORDER BY 1;
```

### Define behavior rules — `RULES.md`
At the project root (not inside `context/`). Free-form Markdown with the conventions the AI must follow.

```markdown
## Queries
- Always use the `analytics.*` schema, never `raw.*` unless asked.
- Do not suggest `DROP`, `DELETE` or `TRUNCATE`.
## Business
- `amount` is in cents — divide by 100 in the final presentation.
- Test orders have `customer_id IN (1, 2, 3)` — exclude them.
```

## Reference

| File | Location | Contents | Tool that reads it |
|---|---|---|---|
| `metrics.yml` | `context/` | Business metric definitions | `lookup_metric` |
| `joins.yml` | `context/` | Canonical joins between tables | Prompt context |
| `glossary.md` | `context/` | Domain terms and their rules | Prompt context |
| `examples/*.sql` | `context/examples/` | Question → canonical-SQL pairs | `find_example` |
| `RULES.md` | Project root | AI behavior rules | Prompt context |

### Endpoints (for reference)

| Endpoint | What it does |
|---|---|
| `GET /api/ai/context-status` | Current status of the project's `context/` folder |
| `POST /api/ai/context-setup` | Creates the folder and selected files |

## Tips & gems

- **A metric's `sql` expression must be self-contained** — no aliases or CTEs — because the AI embeds it in its own queries.
- **Check that it loaded:** ask the AI *"what metrics do you know about?"* or *"do you have an example for cohort retention?"*.
- **`context/` answers the "what"; `RULES.md` the "how".** Keeping them separate avoids confusion: data definitions on one side, behavior policy on the other.
- **Commit `context/` and `RULES.md` to the repo.** It's the cheapest way to give the whole team an AI that already understands the business.

## Related

- [Agent tools](agent-tools.md) · [Skills](skills.md) · [Memory](memory.md)
- [Deep Dive](deep-dive.md) · [Accuracy & guardrails](accuracy-and-guardrails.md)
