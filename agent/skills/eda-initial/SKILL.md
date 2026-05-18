---
name: EDA — Exploración Inicial
description: First look at a dataset — profile structure, data quality, and key distributions
keywords: explore, eda, overview, analyze, profile, summarize, dataset, explorar, analizar, resumen, exploración, datos, qué hay, entender, primer, vistazo, examinar, describir, overview
next: data-storytelling
---

# EDA — Exploración Inicial

Activa cuando el usuario quiere entender un dataset por primera vez, sin un análisis específico definido. Cubre estructura, calidad y distribuciones clave en un solo pase eficiente.

## Cuándo activar

- "Analiza esta tabla", "¿qué hay en estos datos?", "dame un overview"
- Primera vez que el usuario menciona un archivo o tabla nueva
- Petición de resumen o diagnóstico sin dirección específica

## Secuencia de análisis

1. **Registrar fuente** — Si hay archivos en contexto, `attach_file` con la ruta exacta. Si no, `read_file` con `mode='list'` para descubrir archivos disponibles.
2. **Verificar tablas** — `list_tables` para confirmar nombres exactos
3. **Describir estructura** — `describe_table` para tipos, columnas y muestra
4. **Perfil estadístico** — `profile_data`: null %, únicos, rangos, top values. Reporta problemas de calidad primero.
5. **Queries diagnósticas** (máx 3):
   - Distribución de la variable/métrica principal
   - Top-N por dimensión más relevante
   - Rango temporal si existe columna de fecha
6. **Visualizar** — `display_chart` (bar para categóricas, line para temporales)
7. **Cerrar** — `final_answer` con: hallazgos de calidad de datos + 3 insights clave + sugerencia de siguiente análisis

## Reglas

- Máximo 3 queries exploratorias — no hagas análisis profundo en esta fase
- Si hay nulls >20% en columnas clave, mencionarlo en caveats de `final_answer`
- Si el usuario quiere profundizar, sugiere activar `time-series`, `metric-investigation` o `data-quality`
