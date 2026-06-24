---
name: Calidad de Datos
description: Detect nulls, duplicates, outliers, and integrity issues in a table, prioritized by downstream impact. Use when auditing data before a business analysis or when the user suspects problems in the data.
keywords: quality, null, duplicate, outlier, validate, integrity, calidad, nulos, duplicados, limpieza, limpiar, inconsistente, anomalía, faltantes, errores, validar
next: eda-initial
---

# Calidad de Datos

Activa cuando el objetivo es auditar la integridad del dataset antes de un análisis de negocio, o cuando el usuario sospecha de problemas en los datos.

## Cuándo activar

- "¿Los datos están limpios?", "¿hay duplicados?", "¿cuántos nulls hay?"
- Antes de un análisis crítico donde la calidad importa
- Si `profile_data` en EDA muestra indicadores sospechosos

## Razona antes de medir: ¿qué calidad importa AQUÍ?

"Calidad" no es absoluta — depende del uso. Antes de correr checks, pregúntate qué rompería el análisis que viene, y prioriza por ahí:

- **Claves / joins**: nulls o duplicados en una PK o en columnas de join → corrompen conteos y cruces. Máxima prioridad.
- **Métricas**: nulls, ceros o negativos imposibles en columnas que se van a sumar/promediar.
- **Dimensiones**: categorías inconsistentes (mayúsculas, espacios, sinónimos) que fragmentan agrupaciones.
- **Fechas**: fuera de rango, futuras, o formatos mezclados.

Las queries de abajo son herramientas; **elige y ordena los checks por ese impacto**, no las corras todas mecánicamente.

## Secuencia de análisis

1. **Perfil base** — `profile_data` para visión general de nulls, únicos y distribuciones
2. **Análisis de nulls por columna**:
   ```sql
   SELECT column_name,
     COUNT(*) - COUNT(column_name) AS nulls,
     ROUND((COUNT(*) - COUNT(column_name)) * 100.0 / COUNT(*), 1) AS pct_null
   FROM tabla UNPIVOT ...
   -- O más simple:
   SELECT COUNT(*) AS total,
     COUNT(col_a) AS col_a_ok, COUNT(*) - COUNT(col_a) AS col_a_null
   FROM tabla
   ```
3. **Detección de duplicados**:
   ```sql
   SELECT col_clave1, col_clave2, COUNT(*) AS duplicados
   FROM tabla
   GROUP BY col_clave1, col_clave2
   HAVING COUNT(*) > 1
   ORDER BY duplicados DESC
   LIMIT 20
   ```
4. **Outliers en columnas numéricas** (método IQR):
   ```sql
   WITH stats AS (
     SELECT PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY metrica) AS q1,
            PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY metrica) AS q3
     FROM tabla
   )
   SELECT * FROM tabla, stats
   WHERE metrica < q1 - 1.5*(q3-q1) OR metrica > q3 + 1.5*(q3-q1)
   LIMIT 50
   ```
5. **Consistencia de valores** — Verificar rangos lógicos (fechas futuras, valores negativos donde no deben, etc.)
6. **Visualizar** — `display_chart` (bar) con distribución de nulls por columna
7. **Cierre** — `final_answer` con: resumen de issues críticos, tabla de nulls/duplicados, recomendaciones de limpieza

## Reglas

- Prioriza issues que afectarían análisis de negocio (nulls en columnas de join, duplicados en PK)
- Si hay duplicados en la PK, es un issue crítico — mencionarlo primero en tldr
