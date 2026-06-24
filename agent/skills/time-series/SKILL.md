---
name: Análisis de Series Temporales
description: Trend analysis over time — growth rates, seasonality, anomalies, and period comparisons. Use when the question involves how a metric evolves over a date/time dimension.
keywords: trend, time, growth, decline, seasonal, temporal, date, historical, tendencia, tiempo, evolución, crecimiento, mensual, semanal, diario, anual, período, histórico, mes, semana, año
next: data-storytelling
---

# Análisis de Series Temporales

Activa cuando el análisis involucra una dimensión temporal: evolución de métricas, tendencias, comparación de períodos y anomalías temporales.

**Antes de tratar algo como "serie temporal", verifica que de verdad lo sea**: necesitas **varios puntos** en el tiempo. Con 2–3 períodos no hay tendencia que mostrar — es una *comparación* (ver paso de visualización).

## Cuándo activar

- "¿Cómo han evolucionado las ventas?", "muéstrame el trend", "¿qué pasó en marzo?"
- Cualquier pregunta con "por mes", "por semana", "últimos N días/meses"

## Flujo

1. **Identificar la columna de fecha** — `describe_table` y verifica tipo DATE/TIMESTAMP. Si es string, conviértela con `STRPTIME` o `CAST`.
2. **Elegir granularidad** — es un juicio según el rango y la densidad de datos; estas son referencias, no leyes:
   - < 30 días → diario · 1–6 meses → semanal o diario · > 6 meses → mensual o semanal
   - Apunta a tener **suficientes puntos para ver forma** (idealmente ≥8–12) sin que sea ruido.
3. **Serie principal** — `DATE_TRUNC('<gran>', fecha)` agrupando la métrica clave, ordenada por período.
4. **Visualizar** — elige el tipo con el **marco de "Chart Selection" / storytelling**:
   - Muchos puntos (≥4–5) → `line` / `area` (la evolución real).
   - **Pocos períodos (2–3)** → NO es tendencia: usa barras (agrupadas con `split_by` si comparas categorías). Una línea de 2 puntos engaña.
5. **Tasas de cambio** — `LAG()` para % período a período:
   ```sql
   SELECT periodo, metrica,
     ROUND((metrica - LAG(metrica) OVER (ORDER BY periodo))
       / NULLIF(LAG(metrica) OVER (ORDER BY periodo), 0) * 100, 1) AS pct_cambio
   FROM serie
   ```
6. **Anomalías** — compara cada período vs media ± 2·desv. estándar con window functions (`AVG()`, `STDDEV()`).
7. **Cerrar** — `final_answer`: tendencia principal, tasa de crecimiento/caída, períodos anómalos.

## Reglas DuckDB útiles

- `DATE_TRUNC('month', col)` — truncar a inicio de mes · `DATE_PART('week', col)` — número de semana
- `DATEDIFF('day', ini, fin)` — diferencia en días
- Para series con huecos, `GENERATE_SERIES` para rellenar fechas faltantes (evita líneas que "saltan" períodos vacíos).
- Línea de tendencia: solo con **una serie** y **≥5 puntos**; nunca sobre series partidas.
