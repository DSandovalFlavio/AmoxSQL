---
name: Optimización SQL
description: Diagnose and fix slow queries using EXPLAIN, rewriting joins, adding filters, and DuckDB-specific optimizations
keywords: slow, performance, optimize, timeout, faster, inefficient, lento, optimizar, rendimiento, tarda, demora, optimización, mejorar, query lenta
next: data-quality
---

# Optimización SQL

Activa cuando una query es lenta, hace timeout, o el usuario pide mejorar el rendimiento de una consulta existente.

## Cuándo activar

- "La query tarda mucho", "hace timeout", "¿cómo puedo hacerla más rápida?"
- Query con JOINs sobre tablas grandes o múltiples subqueries anidados

## Secuencia de diagnóstico

Diagnostica como un médico: **el plan de ejecución es la radiografía** — léelo, forma una hipótesis del cuello de botella, aplica el fix que ataca *esa* causa, y mide. No apliques optimizaciones a ciegas; cada fix debe responder a algo que viste en el plan.

1. **Obtener plan de ejecución** — `validate_sql` con `detailed=true` para ver operadores, estimated rows y join strategies
2. **Identificar el cuello de botella** en el plan:
   - `HASH_JOIN` con estimated_rows muy alto → problema de join
   - `SEQ_SCAN` en tabla grande → falta de particionado o sample
   - `SORT` sin `LIMIT` → ORDER BY sin límite
3. **Aplicar fix según el problema**:
   - **Select * en tabla grande** → especificar columnas necesarias
   - **JOIN sin filtros previos** → añadir WHERE antes del JOIN (push down predicates)
   - **ORDER BY sin LIMIT** → añadir LIMIT N o usar window function con QUALIFY
   - **Subquery correlated** → reescribir como CTE o JOIN
   - **COUNT(DISTINCT col) en tabla enorme** → usar `approx_count_distinct(col)` (~1% error, 10x más rápido)
   - **Tabla muy grande** → añadir `USING SAMPLE 10%` para exploración inicial
4. **Validar la versión optimizada** — `validate_sql` en la query reescrita
5. **Comparar tiempos** — ejecutar ambas versiones con `execute_sql` y comparar `executionTime` en el resultado
6. **Cierre** — `final_answer` con: causa raíz identificada, reescritura aplicada, mejora de tiempo medida

## Tips DuckDB específicos

- `USING SAMPLE 10%` — muestreo estadístico para exploración rápida
- `QUALIFY ROW_NUMBER() OVER (...) = 1` — más eficiente que subquery con MIN/MAX
- `approx_count_distinct(col)` — estimación HyperLogLog, ideal para dashboards
- `CREATE TABLE AS SELECT ...` — materializar CTEs que se reutilizan
- Los JOINs en DuckDB son columnar — filtrar las tablas fuente antes del JOIN es clave
