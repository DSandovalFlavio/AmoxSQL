-- Mezcla de la venta por categoría en 2024 y su peso en el total.
SELECT categoria,
       round(sum(importe), 2)                                        AS venta,
       sum(cantidad)                                                 AS unidades,
       round(100 * sum(importe) / sum(sum(importe)) OVER (), 1)      AS participacion_pct
FROM ventas
WHERE fecha >= DATE '2024-01-01'
GROUP BY categoria
ORDER BY venta DESC;
