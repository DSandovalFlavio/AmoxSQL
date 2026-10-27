---
name: Data Storytelling
description: Framework de razonamiento para convertir resultados de análisis en una narrativa visual clara y convincente
keywords: story, visualize, narrative, presentation, report, insight, annotation, headline, chart, graph, visualization, slope, ranking, distribution, small multiples, historia, visualizar, narrativa, presentar, gráfico, grafica, graficar, comunicar, titular, diseño, claridad, storytelling, ranking, distribución
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
   - **Cambio entre 2 momentos por categoría** (p. ej. una región pasa de última a primera) → `slope` (`x_axis_key` = los 2 periodos, `split_by` = categoría, cada línea etiquetada en sus extremos) o `dumbbell` (`y_axis_keys` = [antes, después]). Barras agrupadas si además importa el tamaño absoluto.
   - **Cambio de ranking en ≥3 periodos** → `bump` (`split_by` = categoría): enseña la POSICIÓN, no el valor.
   - **Muchas categorías / nombres largos** → `bar-horizontal` (o `lollipop`, con menos tinta).
   - **>7 partes de un todo** → barras, no `donut`.
   - **Muchas series que se enciman (>4–5 líneas)** → **múltiplos pequeños** con `facet_by`: la misma figura repetida por cada valor, en lugar de un espagueti.
   - **Filas crudas de una medida** (no agregadas) → es una *distribución*: `histogram`, `boxplot`, `density` o `strip`, nunca la suma por categoría.
4. **Prueba de los 5 segundos.** ¿Un lector capta el mensaje en 5 segundos? Si no, **cambia el gráfico, no lo decores**.
5. **Énfasis y limpieza** (ver abajo).

## Catálogo de candidatos (para razonar, no para obedecer)

| Intención | Candidatos a considerar |
|-----------|-------------------------|
| Comparar categorías | `bar`; `bar-horizontal` si los nombres son largos o hay muchas; `lollipop` para un ranking limpio |
| Comparar 2–3 periodos por categoría | `slope` (el cruce de posiciones) · `dumbbell` (la brecha antes/después o plan/real) · `bar` agrupado con `split_by` |
| Evolución temporal (≥4–5 puntos) | `line`; `area` para enfatizar volumen; `combo` si hay dos medidas a distinta escala (o `right_y_axis_key`) |
| Cambio de ranking en ≥3 momentos | `bump` |
| Parte de un todo (≤7) | `donut`; `bar-stacked` / `bar-100` para comparar composición entre categorías; `treemap` con muchas partes jerárquicas |
| Distribución de una medida | `histogram` (con `histogram_stats: ['mean','median']` si está sesgada) · `density` (curvas por grupo) · `boxplot` (dispersión por categoría) · `strip` (cada fila, pocos datos) |
| Valor con incertidumbre | `errorbar` (`error_low_key` / `error_high_key`) |
| Relación entre variables | `scatter` (con `trend_line: loess` si la relación no es recta); `bubble` si hay un 3er valor |
| Patrón en dos dimensiones | `heatmap` |
| Etapas con caída | `funnel` |
| Muchas series o segmentos | cualquiera de arriba con `facet_by` (múltiplos pequeños) |

Elige un candidato, hazle la prueba de los 5 segundos, y si falla prueba otro.

## Énfasis y eliminación de ruido (Knaflic)

- **Un protagonista.** Resalta la serie/categoría clave en color y deja el resto en gris. `highlight` sabe hacer: `max` / `min`, `exact` (una categoría), `below` / `above` un umbral (p. ej. todo lo que tiene ROAS < 1) y `range` (un tramo de una línea, de `value` a `value2`: la semana del incidente). Que el ojo vaya solo a lo que importa.
- **Una referencia que dé contexto.** `ref_line` acepta un número o `"mean"` / `"median"` (se calcula de lo dibujado); `goal_line` es la meta. Una línea así convierte "¿esto es mucho?" en algo obvio.
- **Etiqueta directa.** En líneas, `end_labels: true` pone el nombre de cada serie al final de su línea y quita la leyenda: el ojo no tiene que ir y volver.
- **Elimina lo que no carga el mensaje.** Leyendas redundantes, decimales innecesarios, líneas de cuadrícula de más, overlays que distraen.
- **El título declara la conclusión, no el contenido:**
  - ❌ "Ventas por región 2024"
  - ✅ "Sur pasó de última a líder en 2024 (+88%)"

## Guardarraíles duros (no son decisiones, son límites)

- **Línea de tendencia**: solo sobre una **serie única** con **≥5 puntos**. **Nunca** con `split_by` ni múltiples series — sumaría series no relacionadas en una línea sin significado. `loess` solo en `scatter`.
- **Distribuciones**: pasa las **filas crudas** (el gráfico cuenta o calcula); si las agregas antes en el SQL, el histograma o la caja mienten.
- **`donut`**: máximo 7 segmentos; con más, usa barras.
- **Línea**: evítala con ≤3 puntos temporales.

## Cuando las opciones no alcanzan: Vega-Lite

`display_chart` acepta `vega_lite`: un spec completo de Vega-Lite v6 con `"data": {"name": "dataset"}` (el resultado de la consulta llega con ese nombre). Úsalo **solo** cuando ningún `chart_type` con sus opciones exprese la figura: capas a medida, transformaciones propias, una vista compuesta. Aun así manda `chart_type`, `x_axis_key` e `y_axis_keys` (describen la figura para los paneles) y deja título y conclusión en `title` / `takeaway`, no dentro del spec. Lo que los paneles no sepan mostrar queda marcado como código propio en Story Flow, y el gráfico sigue siendo un archivo estándar que el usuario puede llevarse.

## Ejemplo resuelto

**Datos:** 4 regiones × 2 años (2023, 2024), ventas. **Mensaje:** "Sur pasó de la más baja a líder, +88%".

- ¿Intención? Parece "evolución temporal" → tentación de usar `line`.
- ¿Forma? Solo **2 periodos**. La regla 3 invalida la línea: 2 puntos no son una tendencia, y 4 líneas amontonadas esconden el reordenamiento. Además es un **cambio de ranking**.
- **Decisión:** `slope` con `x_axis_key=anio`, `y_axis_keys=[ventas]`, `split_by=Region` — el mensaje es el cruce de posiciones. Si además importa cuánto vende cada una, `bar` agrupado con `split_by=anio`.
- **Énfasis:** `highlight` `exact` en Sur, el resto en gris. Título con la conclusión. **Sin línea de tendencia** (viola el guardarraíl: hay split y solo 2 puntos).

> Por qué un `line` + tendencia fue la elección equivocada: la tendencia sobre series partidas no significa nada (suma regiones), domina visualmente a otra escala, y la línea de 2 puntos no comunica el reordenamiento.

## Estructura del insight narrativo

Cada hallazgo es una **frase interpretativa con el número embebido**, NO una etiqueta con un valor suelto. Di la implicación, no el dato pelón. El lector debe poder leer el `point` como una oración completa.
- ✅ "Premium creció 34% en Q3 ($1.8M→$2.4M), ya es el segmento de mayor aceleración."
- ❌ point: "Creció Premium" · value: "$2.4M"  *(esto se lee como un resumen, no como análisis)*

En `final_answer.findings`:
- **point**: la oración interpretativa completa, con el número tejido dentro y el "y qué" implícito.
- **value**: úsalo SOLO para una métrica de soporte adicional — nunca para partir la frase en `etiqueta: valor`.

Regla de oro: si tu respuesta se puede leer como una lista de `etiqueta: valor`, reescríbela como análisis que fluye. "Total de ventas: X" es un resumen; "Las ventas llegaron a X, +Y% impulsadas por Z" es análisis.

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
