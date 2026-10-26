-- El plan por región del país, uniendo el catálogo de estados.
SELECT r.region,
       count(DISTINCT p.region)                     AS estados,
       round(sum(p.costo), 2)                       AS costo,
       sum(p.clicks)                                AS clicks,
       round(sum(p.costo) / nullif(sum(p.clicks), 0), 2) AS costo_por_clic
FROM plan_octubre AS p
JOIN catalogo_regiones AS r ON r.estado = p.region
GROUP BY ALL
ORDER BY costo DESC;
