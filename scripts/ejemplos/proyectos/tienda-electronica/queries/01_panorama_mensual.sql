-- Panorama mensual: venta, unidades y crecimiento contra el mes anterior.
-- Primera consulta del cierre: si algo raro pasó, se ve aquí.
WITH mensual AS (
    SELECT date_trunc('month', fecha)::DATE AS mes,
           sum(importe)                     AS venta,
           sum(cantidad)                    AS unidades,
           count(*)                         AS lineas
    FROM ventas
    GROUP BY ALL
),
con_crecimiento AS (
    SELECT *,
           lag(venta) OVER (ORDER BY mes)   AS venta_mes_anterior
    FROM mensual
)
SELECT mes,
       round(venta, 2)                                          AS venta,
       unidades,
       lineas,
       round(100 * (venta / venta_mes_anterior - 1), 1)         AS crecimiento_pct
FROM con_crecimiento
ORDER BY mes;
