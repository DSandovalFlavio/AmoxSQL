-- Plan de octubre: costo, alcance y costo por clic de cada campaña.
SELECT nombre_campania                              AS campania,
       count(DISTINCT region)                       AS estados,
       sum(impresiones)                             AS impresiones,
       sum(clicks)                                  AS clicks,
       round(sum(costo), 2)                         AS costo,
       round(sum(costo) / nullif(sum(clicks), 0), 2) AS costo_por_clic,
       round(100 * sum(clicks) / sum(impresiones), 2) AS ctr_pct
FROM plan_octubre
GROUP BY ALL
ORDER BY costo DESC;
