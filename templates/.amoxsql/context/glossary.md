# Domain Glossary

**Revenue**: Paid order amounts only (`status = 'paid'`). Never include pending or refunded orders.

**Active User**: Any user who triggered at least one `page_view` or `purchase` event in the analysis period.

**Churn**: A subscription that moved to `status = 'cancelled'` without reactivating within 30 days.

**Cohort**: A group of users who signed up in the same calendar month. Always use `DATE_TRUNC('month', created_at)` for cohort assignment.

**MRR (Monthly Recurring Revenue)**: Sum of active subscription amounts normalized to a monthly rate. Use the `subscriptions` table, filter `status = 'active'`, and divide annual plans by 12.

**Conversion**: A `trial` user who upgrades to a paid plan within 14 days. Use `users.converted_at IS NOT NULL` as the flag.
