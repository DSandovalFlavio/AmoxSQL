---
name: Investigación de Métricas
description: Root-cause analysis — identify which dimensions explain a metric spike, drop, or anomaly
keywords: driver, cause, investigate, root cause, breakdown, attribution, por qué, porqué, causa, cayó, bajó, subió, spike, explicar, impacto, dimensión, contribuyó, investigar
next: data-storytelling
---

# Investigación de Métricas

Activa cuando el usuario quiere entender POR QUÉ una métrica cambió. Sigue la metodología de drill-down dimensional: descomponer el cambio total en contribuciones por segmento, al estilo Tableau Pulse.

## Cuándo activar

- "¿Por qué cayeron las ventas en marzo?", "¿qué causó el spike?"
- "¿Qué dimensión explica el cambio?", "¿quién contribuyó más al cambio?"

## Metodología: Drill-down dimensional

**Objetivo**: encontrar la combinación de dimensiones (región, producto, canal, etc.) que explica la mayor parte del cambio entre período A y período B.

**Razona en hipótesis, no en barrido**: antes de medir, lista qué dimensiones *podrían* explicar el cambio y por qué (¿lanzamiento? ¿estacionalidad? ¿un segmento?). Mide para **confirmar o descartar** esas hipótesis, empezando por la más probable — no descompongas todas las dimensiones por inercia.

1. **Definir períodos** — pregunta o infiere período de anomalía vs baseline. Si cuál es "el cambio" es ambiguo, **pregunta** antes de inventar un recorte.
2. **Query de impacto por dimensión** — para cada dimensión candidata:
   ```sql
   SELECT dimension,
     SUM(CASE WHEN periodo = 'actual' THEN metrica ELSE 0 END) AS actual,
     SUM(CASE WHEN periodo = 'baseline' THEN metrica ELSE 0 END) AS baseline,
     SUM(CASE WHEN periodo = 'actual' THEN metrica ELSE 0 END) -
     SUM(CASE WHEN periodo = 'baseline' THEN metrica ELSE 0 END) AS delta,
     ROUND((...delta... / NULLIF(...total_delta..., 0)) * 100, 1) AS pct_contribucion
   FROM tabla
   GROUP BY dimension
   ORDER BY ABS(delta) DESC
   ```
3. **Visualizar top contributors** — `display_chart` tipo `bar-horizontal` con delta por segmento
4. **Correlaciones** — Query con `CORR()` nativo de DuckDB entre dimensiones numéricas y la métrica objetivo
5. **Drill-down** — Si un segmento explica > 50% del cambio, profundizar en ese segmento con sub-dimensiones
6. **Cierre** — `final_answer` con: dimensión principal que explica el cambio, % de contribución, hipótesis causal, acciones sugeridas

## Reglas

- Siempre compara dos períodos concretos — no describas el cambio sin anclar a números
- Si hay > 5 dimensiones candidatas, evalúa las 3 más probables primero
- Usa `NULLIF` en divisiones para evitar division by zero
- Menciona en caveats si el período de análisis es estadísticamente pequeño
