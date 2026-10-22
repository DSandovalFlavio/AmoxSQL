# AmoxSQL sources in dbt

**🌐 English · [Español](../../es/dbt/amoxsql-sources-in-dbt.md)**

> AmoxSQL's named sources ("sales", "goals") are used in dbt as `source('amoxsql', 'sales')`, without copying paths into the YAML. And an AmoxSQL query becomes a dbt model with one click.

## What it is

A [named source](../data/sources.md) knows where its file is **on this computer** and how to read it (an Excel sheet, a CSV delimiter, the newest file in a folder). dbt knows none of that. This bridge gives it to dbt without the dbt project carrying anybody's paths.

## When to use it

- When a dbt model has to read a file AmoxSQL already knows how to read.
- When a query that works in AmoxSQL has to become part of the dbt project.

## How to use it

### Sources in dbt

1. In [DBT Studio](dbt-studio.md) → **Sources**, open **AmoxSQL sources in dbt**.
2. Check the sources you want in dbt and save.

AmoxSQL writes `models/sources/amoxsql.yml` with an `amoxsql` source and one table per source. In a model:

```sql
select * from {{ source('amoxsql', 'goals') }}
```

**How it works.** The YAML carries no paths. When dbt runs **from AmoxSQL** (DBT Studio, a model's bar, a schedule or `AmoxSQL.exe dbt`), AmoxSQL hands it each source's read exactly as AmoxSQL does it, on this computer. Freshness (`dbt source freshness`) comes from the file's date.

**Outside AmoxSQL**, the rest of the project runs as usual; only the models that read an AmoxSQL source fail, and they say why ("only available when dbt runs from AmoxSQL").

Bucket and lake sources don't go through here: their credential goes in `profiles.yml`. Whatever you add by hand to that source is kept.

### A query to a model

Above a project's loose `.sql`, **Promote to dbt model**; in a notebook inside a dbt project, each cell's **dbt** button. You pick the layer and name:

- tables that are models become `{{ ref('…') }}`;
- `fuentes."goals"` becomes `{{ source('amoxsql', 'goals') }}`, and the source is added to the YAML if it wasn't there;
- CTEs and read functions stay; anything unknown is marked with a comment;
- the new model opens in the editor, and **the original query is not touched**.

```sql
-- before, in AmoxSQL
select m.store, sum(m.revenue) as revenue, g.goal
from fct_revenue_monthly m join fuentes."goals" g on g.store = m.store
group by all

-- after, models/marts/revenue_vs_goal.sql
select m.store, sum(m.revenue) as revenue, g.goal
from {{ ref('fct_revenue_monthly') }} m join {{ source('amoxsql', 'goals') }} g on g.store = m.store
group by all
```

## Tips and gems

- **The name in dbt** is the source's name in *snake_case* ("weekly-sales" → `weekly_sales`); the original stays in `meta.amoxsql_fuente`.
- **The project travels clean:** someone else with the same source located on their machine runs the same project without touching anything.

## Related

- [Named sources](../data/sources.md) · [DBT Studio](dbt-studio.md) · [Models in the editor](models-in-the-editor.md)
