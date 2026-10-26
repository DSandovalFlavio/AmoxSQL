-- Dónde se vende: venta, clientes atendidos (líneas) y ticket promedio por ciudad.
SELECT ciudad,
       estado,
       count(*)                                AS lineas,
       round(sum(importe), 2)                  AS venta,
       round(sum(importe) / count(*), 2)       AS ticket_promedio
FROM ventas
GROUP BY ALL
ORDER BY venta DESC;
