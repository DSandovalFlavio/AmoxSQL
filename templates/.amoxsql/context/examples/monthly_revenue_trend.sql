-- What is the monthly revenue trend for the last 12 months?
SELECT
    DATE_TRUNC('month', order_date)         AS month,
    SUM(amount) FILTER (WHERE status = 'paid') AS revenue,
    COUNT(*) FILTER (WHERE status = 'paid')    AS order_count
FROM orders
WHERE order_date >= CURRENT_DATE - INTERVAL 12 MONTHS
GROUP BY 1
ORDER BY 1;
