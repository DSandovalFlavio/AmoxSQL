---
name: Explore First
description: Enforces iterative schema probing before any analytical query — list → describe → sample → profile → query. Reduces column-name errors and produces more accurate SQL on the first try.
---

# Explore First — Iterative Schema Probing

Before writing any analytical SQL on a table, always probe the schema iteratively:

## Required sequence for unfamiliar tables

1. **list_tables** — verify the table exists with its exact name
2. **describe_table** — retrieve exact column names and data types (never guess)
3. **execute_sql** (`SELECT * FROM <table> LIMIT 5`) — inspect real data values and formats
4. **profile_data** — understand distributions, null rates, and data quality
5. Write and execute the analytical query

## Why this matters

- Column name mismatches cause ~40% of first-attempt query failures
- Date formats, NULLs, and encoding issues are invisible until you sample the data
- profile_data reveals skewed distributions that change which aggregation makes sense

## When you can skip steps

- You already described this table earlier in this conversation → skip steps 1-2
- The user explicitly provides column names in their question → skip step 2
- The table has fewer than 1000 rows → profile_data is optional

## Quick reference

```
list_tables
  └→ describe_table("my_table")
       └→ execute_sql("SELECT * FROM my_table LIMIT 5")
            └→ profile_data("my_table")
                 └→ execute_sql("SELECT ...your actual query...")
```

Never jump straight to the analytical query on a table you haven't seen in this session.
