-- Rendimiento histórico de las campañas de cursos: tendencia mensual del CTR.
SELECT date_trunc('month', fecha)::DATE              AS mes,
       sum(clicks)                                   AS clicks,
       sum(impresiones)                              AS impresiones,
       round(100 * sum(clicks) / sum(impresiones), 2) AS ctr_pct,
       round(sum(costo) / nullif(sum(clicks), 0), 4)  AS costo_por_clic
FROM historico_campanias
GROUP BY ALL
ORDER BY mes;
