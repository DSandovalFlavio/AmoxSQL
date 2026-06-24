# Guía de gráficos y configuración (Story Flow)

Catálogo de referencia de los tipos de gráfico y **todas** las opciones de configuración que puede aplicar tanto el usuario (panel del DataVisualizer) como el agente de IA (tool `display_chart`).

> **Cómo lo "ve" el agente.** No hay carga progresiva de archivos para la IA: el agente conoce los gráficos por dos superficies que deben mantenerse sincronizadas con este documento:
> 1. La sección **"Chart Selection — reason, don't look up"** del system prompt (`server/ai/prompt/context.js`) → *cómo decidir*.
> 2. El **esquema del tool `display_chart`** (`server/ai/tools.js`) → *qué opciones existen* (cada parámetro está descrito ahí).
>
> Este doc es la fuente canónica para humanos; si añades una capacidad al `ChartRenderer`, actualiza también esas dos superficies.

## Principio de selección (resumen)

Elegir el gráfico es **razonamiento**, no un lookup. Orden: (1) el ÚNICO mensaje → (2) clasificar intención → (3) **la forma de los datos manda** → (4) prueba de los 5 segundos → (5) énfasis y limpieza. Detalle completo y ejemplo resuelto en la skill [`data-storytelling`](../../agent/skills/data-storytelling/SKILL.md).

Trampa clave: **una fecha con 2–3 períodos es comparación, no tendencia** → barras agrupadas, no línea.

## Tipos de gráfico

| Tipo | Úsalo para | Notas |
|------|-----------|-------|
| `bar` | Comparar categorías; con `split_by` → **barras agrupadas** (antes/después por categoría) | El caballo de batalla. Ideal para 2–3 períodos. |
| `bar-stacked` | Composición (partes de un todo) entre categorías | |
| `bar-100` | Distribución porcentual entre categorías | Normaliza a 100%. |
| `bar-horizontal` | Ranking, o nombres de categoría largos / muchas categorías | Categoría a la IZQUIERDA, valor ABAJO. |
| `line` | Serie temporal real (**≥4–5 puntos**) | Guardarraíl: el tool **bloquea** `line`/`area` con ≤2 períodos. |
| `area` | Serie temporal enfatizando volumen | Igual guardarraíl que `line`. |
| `donut` | Proporción (**≤7 segmentos**) | Con >7 → barras. |
| `scatter` | Correlación entre dos variables numéricas | |
| `bubble` | Correlación con un 3er valor (tamaño) | Usa `bubble_size_key`. |
| `combo` | Dos métricas a escalas distintas (barra + línea) | Usa `right_y_axis_key`. |
| `funnel` | Etapas secuenciales con caída | |
| `heatmap` | Patrón en dos dimensiones (p. ej. cohortes) | |
| `treemap` | Proporciones jerárquicas | |

*(El `ChartRenderer` también soporta `pie` y `waterfall`; no están expuestos en el enum del tool de IA, solo en el panel.)*

## Configuración por grupos

### Núcleo y narrativa
- `title` — debe declarar la **conclusión**, no el contenido.
- `subtitle` — un insight de una línea bajo el título.
- `footnote` — fuente o caveat ("Basado en 1.240 transacciones · Ene–Dic 2024").

### Mapeo de datos
- `x_axis_key` — dimensión/categoría del eje X.
- `y_axis_keys[]` — una o más columnas de valor.
- `split_by` — pivota en una serie por valor único (barras agrupadas, líneas múltiples).
- `right_y_axis_key` — segunda escala (combo).
- `bubble_size_key` — radio de burbuja.

### Ejes
- `x_axis_label`, `y_axis_label` — etiquetas (con unidades en el de valores).
- `x_axis_angle` — `0`/`45`/`90` (45–90 para fechas, evita solape).
- `date_aggregation` — `none`/`day`/`week`/`month`/`quarter`/`year`.
- `y_log_scale` — escala logarítmica (datos con órdenes de magnitud).

### Datos
- `number_format` — `compact` (1.2M) / `raw` / `percent`.
- `sort_mode` — `x-asc`/`x-desc`/`y-asc`/`y-desc`/`natural`.
- `limit` — top-N (ranking).
- `cumulative` — total acumulado (line/area).

### Estilo visual
- `color_theme` — cualitativos (`default`, `vivid`, `neon`, `pastel`, `dark2`, `corporate`), secuenciales (`blues`, `greens`, `reds`), divergente (`spectral`), marca (`ocean`, `sunset`).
- `show_data_labels` — etiquetas de valor sobre barras/puntos.
- `legend_position` — `top`/`bottom`/`left`/`right`/`none`.
- `grid_mode` — `both`/`horizontal`/`vertical`/`none`.
- Línea: `line_type` (`monotone`/`linear`/`step`), `show_dots`.
- Barra: `bar_color_mode` (`series`/`dimension`/`intensity`), `bar_radius`.

### Overlays analíticos (énfasis y contexto)
- `highlight` — resalta `max`/`min`/`exact` (la herramienta de **énfasis**: protagonista en color).
- `trend_line` — `linear`/`moving-average`. **Guardarraíl**: solo serie única con ≥5 puntos; nunca con `split_by`/múltiples series (el tool la descarta y avisa).
- `goal_line` — línea de meta/objetivo horizontal.
- `ref_line` — línea de referencia (media, mediana, benchmark).
- `headline_kpi` — KPI grande arriba (`metric` + `compare_with`).

### Donut
- `donut_center_kpi` — `none`/`total`/`average` en el centro.
- `donut_label_content` — `percent`/`value`/`name`/`name_percent`/`name_value`.

## Guardarraíles de datos (capa del tool)

`display_chart` valida los datos, no solo confía en el prompt:
- **Bloquea** `line`/`area` con ≤2 valores distintos en X → obliga a re-llamar con `bar` + `split_by`.
- **Advierte** con 3 puntos (línea borderline).
- **Descarta** `trend_line` cuando hay `split_by` o múltiples series (sería una suma sin sentido) y lo reporta en `warnings`.
