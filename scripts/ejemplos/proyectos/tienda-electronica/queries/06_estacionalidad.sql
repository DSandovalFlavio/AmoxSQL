-- Estacionalidad: venta por día de la semana y mes (para un mapa de calor).
SELECT strftime(fecha, '%m') || ' ' || monthname(fecha)   AS mes,
       dayname(fecha)                                     AS dia,
       isodow(fecha)                                      AS dia_n,
       round(sum(importe), 2)                             AS venta
FROM ventas
WHERE year(fecha) = 2023
GROUP BY ALL
ORDER BY mes, dia_n;
