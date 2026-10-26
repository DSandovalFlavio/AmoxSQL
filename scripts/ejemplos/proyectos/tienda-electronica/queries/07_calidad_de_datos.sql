-- Revisión rápida antes de entregar: vacíos, negativos, fechas fuera de rango
-- y archivos que no aportaron filas.
SELECT 'Líneas sin producto'        AS revision, count(*) AS casos FROM ventas WHERE producto IS NULL
UNION ALL
SELECT 'Cantidades no positivas',              count(*)          FROM ventas WHERE cantidad <= 0
UNION ALL
SELECT 'Importes en cero',                     count(*)          FROM ventas WHERE importe = 0
UNION ALL
SELECT 'Fechas en el futuro',                  count(*)          FROM ventas WHERE fecha > current_date
UNION ALL
SELECT 'Archivos leídos',                      count(DISTINCT archivo) FROM ventas;
