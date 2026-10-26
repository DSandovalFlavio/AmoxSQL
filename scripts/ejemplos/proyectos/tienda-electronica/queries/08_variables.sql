-- Variables del editor: define `anio` (number) y `categoria` (text) en el panel
-- Variables y vuelve a ejecutar sin tocar el SQL. El texto lleva sus comillas aquí.
SELECT date_trunc('month', fecha)::DATE AS mes,
       round(sum(importe), 2)           AS venta
FROM ventas
WHERE year(fecha) = ${anio}
  AND categoria = '${categoria}'
GROUP BY ALL
ORDER BY mes;
