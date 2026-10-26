-- ¿Llegamos a la meta? Venta real de 2024 contra las metas que mandó Finanzas
-- (datos/metas_2024.xlsx), por mes y categoría.
WITH real AS (
    SELECT date_trunc('month', fecha)::DATE AS mes,
           categoria,
           sum(importe)                     AS venta
    FROM ventas
    WHERE year(fecha) = 2024
    GROUP BY ALL
)
SELECT m.mes,
       m.categoria,
       round(r.venta, 2)                        AS venta,
       m.meta,
       round(100 * r.venta / m.meta, 1)         AS cumplimiento_pct,
       CASE
           WHEN r.venta >= m.meta       THEN 'Cumplida'
           WHEN r.venta >= 0.9 * m.meta THEN 'Cerca'
           ELSE 'Por debajo'
       END                                      AS resultado
FROM metas_2024 AS m
LEFT JOIN real AS r USING (mes, categoria)
ORDER BY m.mes, m.categoria;
