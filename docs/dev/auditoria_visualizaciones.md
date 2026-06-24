# Auditoría del Sistema de Visualización + Framework "Story Flow"

> **Estado**: propuesta de diseño · **Fecha**: 2026-06-24
> **Alcance**: `client/src/components/DataVisualizer/` — motor de gráficos, paneles de configuración y experiencia de personalización.
> **Objetivo**: llevar el visualizador de "gráficos correctos" a "gráficos que cuentan una historia", al nivel del estándar de las herramientas de referencia de storytelling de datos.

---

## 1. Inventario actual (estado real del código)

El visualizador organiza ~70 opciones en 6 pestañas. Esto es todo lo que existe hoy:

| Pestaña | Componente | Secciones / opciones |
|---|---|---|
| **Chart** | `panels/ChartTypeSelector.jsx` | 15 tipos en 6 categorías colapsables: Column/Stacked/100%, Bar(h)/Stacked/100%, Line, Stacked Area, Donut, Scatter, Bubble, Combo, Funnel, Heatmap, Treemap |
| **Data** | `panels/DataPanel.jsx` | Data Mapping (X, Y multi, 2º eje Y derecho) · Sort & Limit · Date Aggregation (none/mes/año) · Split By · Bubble Size · Donut Grouping |
| **Detail** | `panels/DetailPanel.jsx` | Data Labels (pos/tamaño/auto-hide, % en tooltip) · Grid & Legend · Line Options (interpolación, area fill, dots, cumulative) · Bar Options (stack, radio, color mode) · Donut Options · Scatter Options · **Highlight Rule** (max/min/exacto) |
| **Axes** | `panels/AxisPanel.jsx` | Number Format (8 modos + decimales) · Vertical Axis (log, min/max) · Axis Titles (X/Y custom + show, rotación) |
| **Theme** | `panels/ThemePanel.jsx` | Palette (20 paletas, 5 grupos) · Series Colors (color + estilo por serie) · Background (tono) · Typography (7 fuentes, escala) · Border |
| **Story** | `panels/AnnotationsPanel.jsx` | Headline KPI + delta · Storytelling (título/subtítulo/footnote, align, **Auto Story IA**) · Goal Line · Trend & Average · Reference Line · Reference Area · Margins |
| *(oculto)* | dropdown en `DataVisualizer.jsx` | Export PNG (5 presets) · Guardar/cargar `.amoxvis` |

**Diagnóstico estructural:**
- La cobertura de *mecánica* (ejes, formatos, paletas, tipos) es muy alta.
- Dos debilidades de fondo:
  1. **No existe una capa de anotaciones libres** (texto/flecha/box anclados a datos).
  2. La organización es **por sustantivo técnico** (Detail, Axes, Theme), no **por momento del flujo narrativo**. Opciones de la misma intención están repartidas por accidente: p.ej. `Highlight` vive en *Detail* pero es narrativa; `Goal`/`Trend` viven en *Story* pero son mecánica analítica.

---

## 2. Capacidades objetivo

Para producir gráficos de alta calidad y storytelling, un visualizador necesita cubrir 6 dimensiones. Calificación de AmoxSQL: ✅ sólido · 🟡 parcial · ❌ ausente.

| Dimensión | Estado | Brecha principal |
|---|:--:|---|
| Cobertura de tipos | 🟡 | Faltan tipos "ejecutivos": waterfall, bullet, KPI card, pie, slope |
| Encoding / modelado de datos | ✅ | Doble eje con dominios **independientes** está limitado (comparten dominio) |
| Capa de anotaciones puntuales | ❌ | No hay callouts/flechas/box anclados a un dato — *gap #1* |
| Texto narrativo | 🟡 | Título plano sin énfasis; no hay bloque de "takeaway" |
| Foco y énfasis visual | 🟡 | Hay highlight, pero no atenuar (gray-out) lo no-focal |
| Números y tooltips | 🟡 | Tooltip básico; falta delta vs. periodo anterior |
| Estética / theming | 🟡 | Sin gradiente de área, estilos de tarjeta ni light/dark por gráfico |
| Composición / dashboards | ❌ | 1 gráfico por archivo (fuera de alcance de esta fase) |
| Export / publicación | 🟡 | Solo PNG; falta SVG, portapapeles, PPTX |
| Asistencia con IA | ✅ | Auto-story existe (ventaja propia); falta auto-anotación de eventos |

---

## 3. Matriz de brechas (vs. estándar de mercado)

`Objetivo` = capacidad esperada en una herramienta de referencia. AmoxSQL: ✅ / 🟡 / ❌.

### 3.1 Tipos de gráfico
| Tipo | Objetivo | AmoxSQL |
|---|:--:|:--:|
| Column/Bar (+stacked/100%/horizontal), Line, Area | ✅ | ✅ |
| Donut, Scatter, Bubble, Combo, Funnel, Heatmap, Treemap | ✅ | ✅ |
| Pie | ✅ | ❌ *(solo donut)* |
| Waterfall | ✅ | ❌ |
| Bullet (actual vs meta) | ✅ | ❌ |
| KPI card / Sparkline | ✅ | 🟡 *(headline suelto)* |
| Slope / Dumbbell | ✅ | ❌ |
| Mekko / Marimekko | ✅ | ❌ |
| Map (geo) | ✅ | ❌ |

### 3.2 Encoding / datos
| Capacidad | Objetivo | AmoxSQL |
|---|:--:|:--:|
| X / Y / multi-Y, Split-by, Sort, Top-N | ✅ | ✅ |
| Size-by (canal tamaño) | ✅ | 🟡 *(solo bubble)* |
| Doble eje con dominios independientes | ✅ | ❌ *(comparten dominio — `ChartRenderer.jsx:417`)* |
| "Otros" al agrupar Top-N (no solo donut) | ✅ | 🟡 |
| Agregación (sum/avg/count) | ✅ | 🟡 *(solo fecha)* |

### 3.3 Formato / legibilidad
| Capacidad | Objetivo | AmoxSQL |
|---|:--:|:--:|
| Formato número / decimales / moneda | ✅ | ✅ |
| Ejes (log, dominio, títulos, rotación), grid, leyenda | ✅ | ✅ |
| Tooltip rico (valor + delta + contexto) | ✅ | 🟡 *(solo % del total)* |
| Labels selectivos (solo primer/último, valor+%Δ) | ✅ | 🟡 *(todo o nada)* |
| Declutter de ticks (`minTickGap`) | ✅ | ❌ |
| `maxBarSize` / gaps de barra | ✅ | ❌ |

### 3.4 Estética
| Capacidad | Objetivo | AmoxSQL |
|---|:--:|:--:|
| Paletas preset + color por serie | ✅ | ✅ |
| Brand palette guardada | ✅ | ❌ |
| Gradiente de área | ✅ | ❌ *(fill plano)* |
| Light/Dark por gráfico | ✅ | 🟡 *(tono filtro)* |
| Estilos de tarjeta (fondo gradiente, sombra, glow, radio) | ✅ | ❌ |
| Logo / marca de agua | ✅ | ❌ |
| Tipografía / tamaño | ✅ | ✅ |

### 3.5 Narrativa / anotaciones — *la brecha grande*
| Capacidad | Objetivo | AmoxSQL |
|---|:--:|:--:|
| Título / subtítulo / caption-source | ✅ | ✅ |
| Título con énfasis de color | ✅ | ❌ |
| Headline KPI + delta | ✅ | ✅ |
| Takeaway / bloque de insight | ✅ | ❌ *(footnote 1 línea)* |
| Goal / reference line / area, Trend / media móvil | ✅ | ✅ |
| Highlight (resaltar dato) | ✅ | ✅ |
| Gray-out (atenuar lo no-focal) | ✅ | ❌ |
| Texto libre anclado a un dato | ✅ | ❌ |
| Flecha / connector | ✅ | ❌ |
| Box / región etiquetada | ✅ | 🟡 *(ref area sin label)* |
| Difference (Δ entre 2 puntos) | ✅ | ❌ |
| Auto-story con IA | 🟡 | ✅ *(ventaja propia)* |

### 3.6 Export / publicación
| Capacidad | Objetivo | AmoxSQL |
|---|:--:|:--:|
| Presets de tamaño (social/slides) | ✅ | ✅ (5) |
| PNG | ✅ | ✅ |
| SVG / copiar al portapapeles | ✅ | ❌ |
| PPTX / Slides | ✅ | ❌ |
| Embed / interactivo | ✅ | 🟡 *(HTML report)* |

### Resumen de brechas priorizadas
1. **Capa de anotaciones libres** (texto/flecha/box/difference anclados) — *crítico*
2. **Título con énfasis + bloque de takeaway** — *crítico*
3. **Tooltip rico con delta** y **labels selectivos**
4. **Gray-out / foco selectivo**
5. **Gradiente de área + estilos de tarjeta + light/dark**
6. **Doble eje independiente** (fix técnico)
7. **Tipos**: Waterfall, Bullet/KPI card, Pie, Slope
8. **Export**: SVG, clipboard, PPTX
9. **Organización por flujo** (renombrar/reordenar pestañas)

---

## 4. Framework de diseño: **"Story Flow"**

La edición debe seguir la **secuencia mental de contar una historia con datos**, no la estructura técnica del código. Se reorganizan las 6 pestañas actuales en **6 etapas-verbo ordenadas**, cada una con una microcopy que hace el paso obvio.

```
 ①  TYPE   →  ②  DATA   →  ③  FORMAT   →  ④  STYLE   →  ⑤  STORY   →  ⑥  EXPORT
  Tipo        Datos        Formato        Estilo        Historia      Exportar
"¿Qué forma  "¿Qué va     "Hazlo        "Hazlo        "Hazlo que    "Publícalo"
 lo cuenta?"  dónde?"      legible"      bello"        hable"
```

### Mapeo: pestaña actual → etapa propuesta

| Hoy | → | Etapa nueva | Qué cambia |
|---|---|---|---|
| Chart | → | **① Type** | + Waterfall, Bullet, Pie, KPI card; agrupar por intención narrativa |
| Data | → | **② Data** | Reformular como **canales** (X, Y, Color/Split, Size, 2º eje) |
| Detail + Axes | → | **③ Format** *(fusión)* | Todo lo mecánico junto: Axes · Numbers · Grid & Legend · Labels & Tooltip · Mark options |
| Theme | → | **④ Style** | + gradiente, light/dark, card styles, brand palette, logo |
| Story | → | **⑤ Story** | + capa de anotaciones libres, título con énfasis, takeaway. Mover aquí `Highlight` |
| dropdown PNG | → | **⑥ Export** | Promover a pestaña: presets + SVG + clipboard + PPTX |

> **Recategorización clave**: todo lo que **dirige la atención del lector** = Story (Highlight, Gray-out, Goal, Trend, Annotations). Todo lo que **hace legible el dato** = Format (Axes, Numbers, Grid, Labels).

### Detalle de cada etapa

**① TYPE — "¿Qué forma lo cuenta?"**
Grid por **intención narrativa**, no por geometría: `Comparar` (bar/column) · `Tendencia` (line/area) · `Composición` (stacked/donut/pie/treemap/mekko) · `Relación` (scatter/bubble/heatmap) · `Flujo` (funnel/waterfall) · `KPI` (card/bullet/sparkline).

**② DATA — "¿Qué va dónde?"** *(modelo de canales)*
- **Channels**: `Eje X` · `Eje Y` · `Color / Split` · `Tamaño` · `Eje secundario`. Cada uno un slot donde se suelta una columna.
- **Shape**: Sort · Top-N (+ "agrupar resto en Otros") · Agregación.

**③ FORMAT — "Hazlo legible"** *(= Detail + Axes fusionados)*
`Axes` · `Numbers` · `Grid & Legend` · `Labels & Tooltip` (incl. tooltip rico + labels selectivos) · `[Tipo] Options` (opciones específicas del mark actual).

**④ STYLE — "Hazlo bello"** *(= Theme++)*
`Theme` (Light/Dark) · `Palette` (Preset / Brand / Freestyle) · `Series colors` · `Fill` (sólido/gradiente) · `Background & Card` (tono, gradiente, sombra, radio) · `Typography` · `Border` · `Logo`.

**⑤ STORY — "Hazlo que hable"** *(el corazón nuevo)*
- `Headline` (KPI + delta) · `Titles` (título con énfasis de color + subtítulo) · `Takeaway` (bloque de insight, alimentado por la IA) · `Caption & Source`.
- `Annotations` (capa nueva): `Text`, `Arrow`, `Box`, `Difference`, anclados a datos vía click en el gráfico.
- `Focus`: `Highlight` (movido aquí) + `Gray-out` + `Goal / Reference / Trend`.

**⑥ EXPORT — "Publícalo"**
`Canvas size` (presets + custom) · `Format` (PNG / SVG / Clipboard / PPTX) · `Save .amoxvis`.

### Principios del lenguaje de diseño

1. **Orden = flujo de autoría.** Las pestañas se leen de izquierda a derecha como los pasos de crear el gráfico.
2. **Una intención por pestaña.** Mecánica (Format) ≠ estética (Style) ≠ narrativa (Story).
3. **Verbos, no sustantivos.** Las microcopys convierten cada pestaña en un paso obvio.
4. **Canales como modelo mental** en Data: soltar campos en slots nombrados.
5. **Divulgación progresiva.** Mostrar el 20% usado el 80% del tiempo; "Más opciones" expande el resto.
6. **Manipulación directa.** Anotar/resaltar haciendo click en el gráfico, no solo desde el panel.
7. **Defaults opinados.** El gráfico sale bonito antes de tocar nada.
8. **Story-first.** Headline + Takeaway tan accesibles como elegir colores.

---

## 5. Resumen ejecutivo

El motor ya tiene casi paridad de *mecánica* con el estándar de mercado. Lo que falta es una **capa narrativa** (anotaciones libres, títulos con énfasis, takeaways, tooltips ricos) y **reorganizar lo existente en un flujo por intención** (Type → Data → Format → Style → Story → Export). El reordenamiento es ~80% mover código existente; lo verdaderamente nuevo es la capa de anotaciones, el gradiente/card-styles y el export ampliado.

Ver el plan de implementación detallado en [`plan_story_flow.md`](./plan_story_flow.md).
