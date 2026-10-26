-- Pregunta: ¿cuánto vendimos por categoría este año?
SELECT categoria, venta_total(importe) AS venta
FROM ventas
WHERE year(fecha) = year(current_date)
GROUP BY categoria
ORDER BY venta DESC;
