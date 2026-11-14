-- Variables del proyecto (6.0): `$anio` y `$categoria` se declaran una vez en
-- Library › Snippets › Variables y valen en todo el proyecto, con su tipo y sin
-- comillas a mano. Cambia su valor en la barra Variables y vuelve a ejecutar.
SELECT date_trunc('month', fecha)::DATE AS mes,
       round(sum(importe), 2)           AS venta
FROM ventas
WHERE year(fecha) = $anio
  AND categoria = $categoria
GROUP BY ALL
ORDER BY mes;
