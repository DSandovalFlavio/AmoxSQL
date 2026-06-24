---
name: EDA — Exploración Inicial
description: First look at a dataset — profiles structure, data quality, and key distributions to build a mental model before any specific analysis. Use when the user wants to understand a new table or asks for an overview without a defined goal.
keywords: explore, eda, overview, analyze, profile, summarize, dataset, explorar, analizar, resumen, exploración, datos, qué hay, entender, primer, vistazo, examinar, describir, overview
next: data-storytelling
---

# EDA — Exploración Inicial

Activa cuando el usuario quiere entender un dataset por primera vez, sin un análisis específico definido. **Objetivo: formar rápido un modelo mental** —estructura, calidad y lo que vale la pena investigar después— en un solo pase eficiente.

Esto es un *workflow* (hay un orden sensato), pero **las queries que ejecutes son decisión de juicio**: deja que lo que descubras guíe la siguiente pregunta, no corras queries por reflejo.

## Cuándo activar

- "Analiza esta tabla", "¿qué hay en estos datos?", "dame un overview"
- Primera vez que el usuario menciona un archivo o tabla nueva
- Petición de resumen o diagnóstico sin dirección específica

## Flujo

1. **Registrar fuente** — Si hay archivos en contexto, `attach_file` con la ruta exacta. Si no, `read_file` con `mode='list'` para descubrir los disponibles.
2. **Inventario** — `list_tables` (nombres exactos) → `describe_table` (tipos, columnas, muestra).
3. **Perfil estadístico** — `profile_data`: null %, únicos, rangos, top values. Reporta problemas de calidad primero.
4. **Razona qué preguntar** (antes de escribir SQL). El perfil te dice dónde mirar:
   - ¿Hay una **métrica dominante**? → su distribución y magnitud.
   - ¿Una **dimensión** con cardinalidad útil (no 1, no = nº filas)? → top-N por esa dimensión.
   - ¿Una **columna de fecha**? → rango temporal y volumen por período.
   - Prioriza la pregunta que **más reduce incertidumbre** sobre el dataset.
5. **Queries diagnósticas (máx 3)** — las que elegiste en el paso 4, no una lista fija.
6. **Visualizar** — `display_chart`, eligiendo el tipo con el **marco de "Chart Selection" / storytelling** (NO por defecto `line` solo porque haya una fecha; con pocos períodos es comparación → barras).
7. **Cerrar** — `final_answer` con: hallazgos de calidad + 3 insights clave + sugerencia del siguiente análisis.

## Reglas

- Máximo 3 queries exploratorias — esta fase es para orientarse, no para profundizar.
- Si hay nulls >20% en columnas clave, menciónalo en `caveats` de `final_answer`.
- Si una columna candidata a dimensión tiene cardinalidad ≈ nº de filas (un id) o = 1, no aporta para agrupar; descártala.
- Si el usuario quiere profundizar, sugiere `time-series`, `metric-investigation` o `data-quality`.
