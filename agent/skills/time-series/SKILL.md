---
name: Análisis de Series Temporales
description: Trend analysis over time — growth rates, seasonality, anomalies, and period comparisons
keywords: trend, time, growth, decline, seasonal, temporal, date, historical, tendencia, tiempo, evolución, crecimiento, mensual, semanal, diario, anual, período, histórico, mes, semana, año
next: data-storytelling
---

# Análisis de Series Temporales

Activa cuando el análisis involucra una dimensión temporal: evolución de métricas, detección de tendencias, comparación de períodos, y anomalías temporales.

## Cuándo activar

- "¿Cómo han evolucionado las ventas?", "muéstrame el trend", "¿qué pasó en marzo?"
- Cualquier pregunta con "por mes", "por semana", "últimos N días/meses"

## Secuencia de análisis

1. **Identificar columna de fecha** — `describe_table` y verificar tipo DATE/TIMESTAMP. Si es string, convertir con `STRPTIME` o `CAST`.
2. **Elegir granularidad** según el rango de datos:
   - < 30 días → diario
   - 1-6 meses → semanal o diario
   - > 6 meses → mensual o semanal
3. **Query de serie principal** — `DATE_TRUNC('month', fecha)` o `DATE_PART('week', fecha)` agrupando la métrica clave
4. **Visualizar** — `display_chart` tipo `line` o `area`. El eje X debe ser la fecha truncada.
5. **Tasas de cambio** — Segunda query con `LAG()` o división de períodos para calcular % cambio:
   ```sql
   SELECT periodo, metrica,
     ROUND((metrica - LAG(metrica) OVER (ORDER BY periodo)) / NULLIF(LAG(metrica) OVER (ORDER BY periodo), 0) * 100, 1) AS pct_cambio
   FROM serie
   ```
6. **Detectar anomalías** — Compara cada período vs media ± 2 desvíos estándar usando `AVG()` y `STDDEV()` en window functions
7. **Cierre** — `final_answer` con: tendencia principal, tasa de crecimiento/caída, períodos anómalos identificados

## Reglas DuckDB útiles

- `DATE_TRUNC('month', col)` — truncar a inicio de mes
- `DATE_PART('week', col)` — número de semana
- `DATEDIFF('day', fecha_inicio, fecha_fin)` — diferencia en días
- Para series con gaps, usar `GENERATE_SERIES` para rellenar fechas faltantes
