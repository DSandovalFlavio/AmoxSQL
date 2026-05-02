-- Show cohort retention for users by signup month
WITH cohorts AS (
    SELECT
        user_id,
        DATE_TRUNC('month', created_at) AS cohort_month
    FROM users
),
activity AS (
    SELECT DISTINCT
        user_id,
        DATE_TRUNC('month', event_date) AS active_month
    FROM events
    WHERE event_type IN ('page_view', 'purchase')
),
retention AS (
    SELECT
        c.cohort_month,
        DATEDIFF('month', c.cohort_month, a.active_month) AS months_since_signup,
        COUNT(DISTINCT c.user_id)                          AS retained_users
    FROM cohorts c
    JOIN activity a USING (user_id)
    GROUP BY 1, 2
),
cohort_sizes AS (
    SELECT cohort_month, COUNT(DISTINCT user_id) AS cohort_size
    FROM cohorts
    GROUP BY 1
)
SELECT
    r.cohort_month,
    r.months_since_signup,
    r.retained_users,
    cs.cohort_size,
    ROUND(r.retained_users::FLOAT / cs.cohort_size * 100, 1) AS retention_pct
FROM retention r
JOIN cohort_sizes cs USING (cohort_month)
ORDER BY 1, 2;
