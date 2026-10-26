-- Los 10 productos que más venden en 2024, con su lugar y su categoría.
SELECT rank() OVER (ORDER BY sum(v.importe) DESC)  AS lugar,
       v.producto,
       p.categoria,
       sum(v.cantidad)                             AS unidades,
       round(sum(v.importe), 2)                    AS venta,
       round(avg(v.precio_unitario), 2)            AS precio_promedio
FROM ventas AS v
JOIN productos AS p USING (producto)
WHERE v.fecha >= DATE '2024-01-01'
GROUP BY ALL
ORDER BY lugar
LIMIT 10;
