---
name: Data Storytelling
description: Framework de razonamiento para convertir resultados de análisis en una narrativa visual clara y convincente
keywords: story, visualize, narrative, presentation, report, insight, annotation, headline, chart, graph, visualization, historia, visualizar, narrativa, presentar, gráfico, grafica, graficar, comunicar, titular, diseño, claridad, storytelling
next:
---

# Data Storytelling

Activa cuando el objetivo es **comunicar** un hallazgo de forma clara y convincente, no solo dibujar datos. Esto **no es una tabla de consulta** de "tipo de dato → tipo de gráfico": es un marco para que razones cuál es la mejor opción y la puedas justificar. Inspirado en Cole Nussbaumer Knaflic.

## Principio rector

**Empieza por el mensaje, no por los datos.** El gráfico existe para hacer obvia UNA frase. Si no sabes cuál es esa frase, no sabes qué gráfico hacer todavía.

> El error más común —y el que debes evitar— es mapear mecánicamente una columna a un gráfico: *"hay una fecha → línea"*. Eso ignora el mensaje y la forma real de los datos.

## Proceso de razonamiento (síguelo en orden)

1. **¿Cuál es el ÚNICO mensaje?** La frase que el lector debe llevarse. Escríbela mentalmente antes de elegir nada.
2. **Clasifica la *intención*, no el tipo de columna**:
   - Comparación entre categorías
   - Evolución en el tiempo
   - Parte de un todo / composición
   - Relación entre variables
   - Distribución
   - **Cambio de ranking** (algo reordena su posición entre dos momentos)
3. **Mira la forma de los datos — esto puede invalidar la intención**:
   - **Pocos periodos (2–3 puntos en el tiempo)** → es una *comparación*, NO una tendencia. Una línea entre 2 puntos solo es una pendiente y sugiere una progresión continua que no existe. Usa **barras agrupadas** (`split_by`), no línea. Una línea necesita ≥4–5 puntos para ser honesta.
   - **Cambio de ranking entre 2 periodos** (p. ej. una región pasa de última a primera) → barras agrupadas, o una vista tipo *slope* (línea de 2 puntos por serie, etiquetada en los extremos, **sin** tendencia).
   - **Muchas categorías / nombres largos** → `bar-horizontal`.
   - **>7 partes de un todo** → barras, no `donut`.
4. **Prueba de los 5 segundos.** ¿Un lector capta el mensaje en 5 segundos? Si no, **cambia el gráfico, no lo decores**.
5. **Énfasis y limpieza** (ver abajo).

## Catálogo de candidatos (para razonar, no para obedecer)

| Intención | Candidatos a considerar |
|-----------|-------------------------|
| Comparar categorías | `bar`; `bar-horizontal` si los nombres son largos o hay muchas |
| Comparar 2–3 periodos por categoría | `bar` agrupado con `split_by` (antes/después) |
| Evolución temporal (≥4–5 puntos) | `line`; `area` para enfatizar volumen |
| Cambio de ranking entre 2 momentos | `bar` agrupado, o `line` de 2 puntos (slope) sin tendencia |
| Parte de un todo (≤7) | `donut`; o `bar-stacked` / `bar-100` para comparar composición entre categorías |
| Relación entre variables | `scatter`; `bubble` si hay un 3er valor |
| Patrón en dos dimensiones | `heatmap` |
| Etapas con caída | `funnel` |

Elige un candidato, hazle la prueba de los 5 segundos, y si falla prueba otro.

## Énfasis y eliminación de ruido (Knaflic)

- **Un protagonista.** Resalta la serie/categoría clave en color y deja el resto en gris (`highlight`, o un `color_theme` adecuado). Que el ojo vaya solo a lo que importa.
- **Elimina lo que no carga el mensaje.** Leyendas redundantes, decimales innecesarios, líneas de cuadrícula de más, overlays que distraen.
- **El título declara la conclusión, no el contenido:**
  - ❌ "Ventas por región 2024"
  - ✅ "Sur pasó de última a líder en 2024 (+88%)"

## Guardarraíles duros (no son decisiones, son límites)

- **Línea de tendencia**: solo sobre una **serie única** con **≥5 puntos**. **Nunca** con `split_by` ni múltiples series — sumaría series no relacionadas en una línea sin significado.
- **`donut`**: máximo 7 segmentos; con más, usa barras.
- **Línea**: evítala con ≤3 puntos temporales.

## Ejemplo resuelto

**Datos:** 4 regiones × 2 años (2023, 2024), ventas. **Mensaje:** "Sur pasó de la más baja a líder, +88%".

- ¿Intención? Parece "evolución temporal" → tentación de usar `line`.
- ¿Forma? Solo **2 periodos**. La regla 3 invalida la línea: 2 puntos no son una tendencia, y 4 líneas amontonadas esconden el reordenamiento. Además es un **cambio de ranking**.
- **Decisión:** `bar` agrupado con `x_axis_key=Region`, `split_by=anio` (2 barras por región, antes/después) — o una vista *slope* si el mensaje es puramente el cruce de posiciones.
- **Énfasis:** Sur en color, el resto en gris. Título con la conclusión. **Sin línea de tendencia** (viola el guardarraíl: hay split y solo 2 puntos).

> Por qué un `line` + tendencia fue la elección equivocada: la tendencia sobre series partidas no significa nada (suma regiones), domina visualmente a otra escala, y la línea de 2 puntos no comunica el reordenamiento.

## Estructura del insight narrativo

Para cada visualización, genera en `final_answer.findings`:
- **point**: la observación concreta con números ("El segmento Premium creció 34% en Q3")
- **value**: la métrica de soporte ("$2.4M vs $1.8M en Q2")

Para la narrativa completa:
- **tldr**: 1–2 frases con el hallazgo más importante y su implicación
- **likely_cause**: la hipótesis más plausible basada en los datos
- **suggested_actions**: 2–3 acciones concretas

## Plantillas de headline

- Cambio positivo: "[Métrica] creció [X]% en [período], impulsada por [dimensión]"
- Cambio negativo: "[Métrica] cayó [X]% vs [baseline], concentrado en [segmento]"
- Distribución: "[Segmento] representa [X]% del total — [implicación]"
- Cambio de ranking: "[Categoría] pasó de [posición] a [posición] en [período]"
- Anomalía: "[Período] registró [X] veces más [métrica] que la media — posible [causa]"
