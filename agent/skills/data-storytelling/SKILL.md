---
name: Data Storytelling
description: Turn analysis results into a compelling visual narrative using chart design principles and structured insights
keywords: story, visualize, narrative, presentation, report, insight, annotation, headline, historia, visualizar, narrativa, presentar, gráfico, comunicar, titular, diseño, claridad
next:
---

# Data Storytelling

Activa cuando el objetivo es comunicar hallazgos de forma clara y convincente, no solo mostrar datos. Aplica principios de Cole Nussbaumer Knaflic y las mejores prácticas de Tableau Pulse para generar narrativa estructurada.

## Cuándo activar

- "Hazlo más visual", "¿cómo presento esto?", "crea una historia con los datos"
- Al final de un análisis cuando hay que comunicar resultados a un audience
- Cuando el usuario pide un headline, insight, o anotación para un gráfico

## Principios (Knaflic adaptados)

1. **Elige el tipo de gráfico correcto para el mensaje**:
   - Comparación entre categorías → `bar` o `bar-horizontal`
   - Evolución temporal → `line` o `area`
   - Partes de un todo → `donut` (máx 5 segmentos) o `bar-stacked`
   - Relación entre variables → `scatter`
   - Distribución cruzada → `heatmap`
   - Proceso/embudo → `funnel`

2. **Un gráfico = un mensaje**. El título debe declarar la conclusión, no el contenido:
   - ❌ "Ventas por región 2024"
   - ✅ "La región Norte concentra el 43% de las ventas totales"

3. **Jerarquía visual**: destacar el elemento más importante (color, tamaño, posición)

4. **Eliminar ruido**: simplificar leyendas, reducir categorías a las 5-7 más relevantes

## Estructura de un insight narrativo

Para cada visualización, genera en `final_answer.findings`:
- **point**: la observación concreta con números ("El segmento Premium creció 34% en Q3")
- **value**: la métrica de soporte ("$2.4M vs $1.8M en Q2")

Para la narrativa completa, usa:
- **tldr**: 1-2 frases con el hallazgo más importante y su implicación
- **likely_cause**: la hipótesis más plausible basada en los datos
- **suggested_actions**: 2-3 acciones concretas que el usuario puede tomar

## Plantillas de headline

- Cambio positivo: "[Métrica] creció [X]% en [período], impulsada por [dimensión]"
- Cambio negativo: "[Métrica] cayó [X]% vs [baseline], concentrado en [segmento]"
- Distribución: "[Segmento] representa [X]% del total — [implicación]"
- Anomalía: "[Período] registró [X] veces más [métrica] que la media — posible [causa]"
