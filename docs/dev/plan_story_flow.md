# Plan de Implementación — Story Flow

> **Estado**: plan de trabajo · **Fecha**: 2026-06-24
> **Contexto**: ver [`auditoria_visualizaciones.md`](./auditoria_visualizaciones.md).
> **Carpeta de trabajo**: `client/src/components/DataVisualizer/`

Este plan convierte el framework Story Flow en fases ejecutables, ordenadas por **riesgo ascendente / valor descendente**. Cada fase es independiente y entregable por sí sola.

## Principios de ejecución
- **No virtualizar** listas/tablas (regla del proyecto).
- **Sin spinners ni caching** de red: DuckDB es local. Render directo.
- Toda config nueva vive en `constants.js → DEFAULT_CONFIG` y se migra en `useChartState.js → LOAD_CONFIG` (preservar retrocompatibilidad con `.amoxvis` antiguos).
- Verificación: no hay tests; validar corriendo la app (`pnpm start`) y ejercitando el panel afectado.
- Cada fase debe dejar los `.amoxvis` existentes funcionando (las migraciones del reducer son el contrato).

---

## Resumen de fases

| Fase | Nombre | Riesgo | Valor | Núcleo |
|---|---|:--:|:--:|---|
| 0 | Pasada de pulido (defaults) | Bajo | Alto | Que se vea pulido sin tocar nada |
| 1 | Reorganización Story Flow (IA de pestañas) | Bajo | Alto | Renombrar/mover paneles |
| 2 | Story layer: títulos, takeaway, tooltip rico | Medio | Alto | Narrativa de texto |
| 3 | Capa de anotaciones libres | Alto | Muy alto | El diferenciador |
| 4 | Style++ (gradiente, light/dark, card, brand, logo) | Medio | Medio | Estética premium |
| 5 | Tipos nuevos (waterfall, bullet/KPI, pie, slope) | Medio | Medio | Cobertura |
| 6 | Export ampliado (SVG, clipboard, PPTX, pestaña) | Medio | Medio | Publicación |

---

## FASE 0 — Pasada de pulido (defaults opinados) ✅ IMPLEMENTADA (2026-06-24)

**Objetivo**: que un gráfico recién creado se vea pulido sin que el usuario toque nada. Casi todo son cambios de defaults y ~30 líneas en el renderer.

> **Nota de implementación**: se hicieron 0.1–0.7. El ítem **0.8 (curva auto-linear en datos densos) se descartó**: la interpolación `monotone` de Recharts no genera overshoot (es monotónica por definición), así que el "wiggle" del screenshot era el dato real, no un artefacto; cambiar la curva según densidad sobrescribiría la intención del usuario. El problema de densidad se resuelve con 0.3 (ocultar dots). Build verificado con `pnpm build`.

**Archivos**: `constants.js`, `renderers/ChartRenderer.jsx`, `utils/numberFormat.js`.

| # | Cambio | Dónde | Detalle |
|---|---|---|---|
| 0.1 | Barras: grosor y aire | `ChartRenderer.jsx` `<BarChart>`/`<Bar>` | Añadir `maxBarSize={48}`, `barCategoryGap="20%"`, `barGap={4}` |
| 0.2 | Gradiente de área | `ChartRenderer.jsx` bloque LINE/AREA | `<defs><linearGradient id={...}>` por serie (color 0.35 → 0 transparente); usar como `fill` en `<Area>` |
| 0.3 | Dots inteligentes | `constants.js` + `CustomizedDot` | Default `showDots: false`; mostrar solo si `processedData.length <= 15`; mantener `activeDot` en hover |
| 0.4 | Labels de eje por nombre de columna | `ChartRenderer.jsx:80-83` | `defaultXLabel`/`defaultYLabel` = `xAxisKey`/`yAxisKeys[0]` (nunca "X Axis"/"Values"/"Categories") |
| 0.5 | Fechas en split-by | `utils/dataProcessing.js` (donde se generan `finalSeriesKeys`) | Pasar nombres de serie de columnas fecha por `formatDateLabel` |
| 0.6 | Declutter de ticks | `ChartRenderer.jsx` `<XAxis>` | Añadir `minTickGap={40}` + `interval="preserveStartEnd"` |
| 0.7 | Grid más sutil | `ChartRenderer.jsx` `<CartesianGrid>` | `strokeDasharray="2 6"` + menor opacidad |
| 0.8 | Curva: evitar wiggle en datos ruidosos | `constants.js` | Heurística: si `processedData.length > 30` default `lineType: 'linear'` |

**Verificación**: cargar `01_ventas_mensuales.amoxvis` y una serie temporal densa; confirmar barras delgadas, área con gradiente, sin dots en series largas, ejes legibles.

**Riesgo**: bajo. Los `.amoxvis` con valores explícitos mantienen su look (los defaults solo afectan gráficos nuevos).

---

## FASE 1 — Reorganización Story Flow (IA de pestañas) ✅ IMPLEMENTADA (2026-06-24)

**Objetivo**: pasar de 6 pestañas por sustantivo (Chart, Data, Detail, Axes, Theme, Story) a 6 etapas por flujo (Type, Data, Format, Style, Story, Export). ~80% es mover JSX existente.

> **Nota de implementación**: hecho 1.1–1.5. Nuevos paneles `FormatPanel.jsx` (compone AxisPanel + DetailPanel sin Highlight + Margins), `StoryPanel.jsx` (reemplaza AnnotationsPanel; añade sección Focus—Highlight), `ExportPanel.jsx` (presets + save/load, movidos desde el header). `DetailPanel` ahora acepta `showHighlight`. Tipos reagrupados por intención en `constants.js`. `AnnotationsPanel.jsx` eliminado. Microcopy por pestaña añadida. Build verificado con `pnpm client:build`. Pendiente menor: el reframe completo de Data como canales drag-and-drop (por ahora solo se renombró la sección a "Channels").

**Archivos**: `DataVisualizer.jsx` (array `TABS` + render), nuevos `panels/FormatPanel.jsx` y `panels/ExportPanel.jsx`, renombres.

### 1.1 Nuevo array de pestañas
En `DataVisualizer.jsx`:
```js
const TABS = [
  { key: 'type',   icon: LuChartColumn, title: 'Type',   hint: '¿Qué forma lo cuenta?' },
  { key: 'data',   icon: LuDatabase,    title: 'Data',   hint: '¿Qué va dónde?' },
  { key: 'format', icon: LuSettings2,   title: 'Format', hint: 'Hazlo legible' },
  { key: 'style',  icon: LuPalette,     title: 'Style',  hint: 'Hazlo bello' },
  { key: 'story',  icon: LuPenLine,     title: 'Story',  hint: 'Hazlo que hable' },
  { key: 'export', icon: LuDownload,    title: 'Export', hint: 'Publícalo' },
];
```
Mostrar `hint` como microcopy bajo el header de cada pestaña activa.

### 1.2 Fusión Detail + Axes → FormatPanel
Crear `panels/FormatPanel.jsx` que componga, en este orden:
1. **Axes** (de `AxisPanel`: Vertical Axis, Axis Titles)
2. **Numbers** (de `AxisPanel`: Number Format)
3. **Grid & Legend** (de `DetailPanel`)
4. **Labels & Tooltip** (de `DetailPanel`: Data Labels)
5. **[Tipo] Options** (de `DetailPanel`: Line/Bar/Donut/Scatter Options según `chartType`)

> **NO** incluir aquí `Highlight Rule` — se mueve a Story (Focus).

Recomendado: extraer cada sección de `DetailPanel`/`AxisPanel` en componentes pequeños reutilizables y componerlos en `FormatPanel`. Si se prefiere mínimo esfuerzo: mover los bloques JSX directamente.

### 1.3 Renombrar AnnotationsPanel → StoryPanel
- Renombrar `panels/AnnotationsPanel.jsx` → `panels/StoryPanel.jsx`.
- Añadir sección **Focus** que incluya `Highlight Rule` (movido desde DetailPanel) + Goal + Trend + Reference Line + Reference Area.
- Reordenar secciones: Headline → Titles → Takeaway *(fase 2)* → Focus → Caption & Source.
- Mover `Margins & Spacing` a Format (es mecánica de layout).

### 1.4 Promover Export a pestaña
Crear `panels/ExportPanel.jsx`: mover la lógica del dropdown PNG de `DataVisualizer.jsx` aquí. Secciones: `Canvas size` (presets `EXPORT_PRESETS`) · `Format` (PNG por ahora; SVG/Clipboard/PPTX en fase 6) · `Save .amoxvis` (botón de guardar).

### 1.5 ChartTypeSelector → agrupar por intención
En `constants.js`, añadir campo `intent` a cada `CHART_TYPES` (`compare`/`trend`/`composition`/`relation`/`flow`/`kpi`) y cambiar `CHART_CATEGORIES` a esas 6 intenciones. Renombrar la pestaña a "Type".

**Verificación**: navegar las 6 pestañas; confirmar que ninguna sección se perdió y que Highlight aparece en Story, no en Format.

**Riesgo**: bajo (refactor de presentación). El estado (`state`/`setField`) no cambia.

---

## FASE 2 — Story layer: títulos con énfasis, takeaway, tooltip rico ✅ IMPLEMENTADA (2026-06-24)

**Objetivo**: texto narrativo de calidad. La IA ya calcula los insights ([`server/ai/chartStory.js`](../../server/ai/chartStory.js)); solo falta renderizarlos.

> **Nota de implementación**: 2.1 énfasis `**texto**` vía `utils/richText.jsx` (título, subtítulo y takeaway). 2.2 bloque Takeaway (campo `takeaway`, render con borde de acento, textarea + autollenado por IA desde `key_insights`). 2.3 `RichTooltip.jsx` (valor + Δ vs punto anterior) con toggle `tooltipMode` en Format. 2.4 doble eje independiente (`rightYAxisDomain` + UI en Axes). Build verificado.

**Archivos**: `constants.js`, `DataVisualizer.jsx` (render de títulos/footnote), `renderers/ChartRenderer.jsx` (tooltip), `panels/StoryPanel.jsx`.

### 2.1 Título con énfasis de color
- `DEFAULT_CONFIG`: el render de título en `DataVisualizer.jsx:433` debe interpretar **markdown ligero**: `**texto**` → `<span style={{color: accent}}>`. Parser mínimo (split por `**`).
- Alternativa/complemento: auto-resaltar números/porcentajes detectados por regex en color de acento.

### 2.2 Bloque Takeaway
- `DEFAULT_CONFIG`: `takeaway: ''`.
- Render: bloque estilizado (no italic como footnote) entre el gráfico y el footnote, con tipografía de párrafo y borde-izquierdo de acento.
- En `StoryPanel`: `<textarea>` multilínea + botón **"Auto"** que llama a `/api/ai/chart-story` (ya existe `handleGenerateStory`) y rellena `takeaway` con `key_insights.join(' ')`.

### 2.3 Tooltip rico
- `DEFAULT_CONFIG`: `tooltipMode: 'standard' | 'rich'`.
- Crear `renderers/RichTooltip.jsx`: muestra label + valor grande + **delta vs punto anterior** (reutilizar lógica de `computeHeadline` en `utils/dataProcessing.js`) con flecha ▲/▼ y color success/error.
- Conectar como `content={<RichTooltip .../>}` en los `<Tooltip>` de line/area/bar/combo cuando `tooltipMode === 'rich'`.

### 2.4 Fix: doble eje con dominios independientes
- `DEFAULT_CONFIG`: `rightYAxisDomain: ['auto','auto']`.
- En `ChartRenderer.jsx` (line/combo): el `<YAxis yAxisId="right">` debe usar su propio `domain`/`scale`, no `yDomain`. Habilita combos tipo "monto absoluto + % crecimiento".

**Verificación**: título con `**5x**` resaltado; takeaway autollenado por IA; tooltip rico con delta; combo de 2 series en escalas distintas legible.

**Riesgo**: medio (parser de título, tooltip custom). Acotado.

---

## FASE 3 — Capa de anotaciones libres *(el diferenciador)* ✅ v1 IMPLEMENTADA (2026-06-24)

**Objetivo**: texto/flecha/box/difference anclados a datos, colocables con click en el gráfico.

> **Nota de implementación (v1)**: campo `annotations: []`. Render vía `ReferenceDot` (text/point callout, con Y auto-resuelto desde la serie si se deja vacío) y `ReferenceArea` (box etiquetado) en line/area/bar(vertical)/combo. Editor completo en el panel Story (añadir/editar/borrar, selección de X desde categorías, color). Soporta orientación: en barras horizontales se intercambian las coordenadas (categoría→Y, valor→X) y se apunta al y-axis id por defecto. **Pendiente para v2**: colocación por click directo en el gráfico, tipos `arrow` y `difference`. Build verificado.

**Archivos nuevos**: `overlays/AnnotationLayer.jsx`, `panels/sections/AnnotationsSection.jsx`. **Tocar**: `constants.js`, `useChartState.js`, `renderers/ChartRenderer.jsx`, `DataVisualizer.jsx`.

### 3.1 Modelo de datos
En `DEFAULT_CONFIG`:
```js
annotations: [],   // array de objetos:
// {
//   id: string,
//   type: 'text' | 'arrow' | 'box' | 'difference',
//   anchor:    { mode: 'data'|'pixel', x, y },      // x = valor de xAxisKey; y = valor numérico
//   anchorEnd: { mode: 'data'|'pixel', x, y } | null, // 2º punto para arrow/box/difference
//   text: string,
//   offset: { dx: number, dy: number },             // desplazamiento de la etiqueta
//   style: { color, fontSize, background, borderStyle, handDrawn: bool },
//   connector: { show: bool, arrowHead: bool },
// }
```
Migración en `useChartState.js → LOAD_CONFIG`: si `cfg.annotations` no existe, default `[]`.

### 3.2 Conversión data → pixel (clave técnica)
Recharts expone el componente `<Customized component={fn} />`, que recibe el estado interno del chart incluyendo `xAxisMap` e `yAxisMap` (con sus funciones `scale`). Estrategia:
- Renderizar `<AnnotationLayer>` dentro de cada chart vía `<Customized>`.
- Para cada anotación con `anchor.mode === 'data'`: `px = xAxisMap[0].scale(anchor.x)`, `py = yAxisMap['left'].scale(anchor.y)`.
- Dibujar en SVG: `text` (etiqueta + connector opcional), `arrow` (línea + marker), `box` (rect + label), `difference` (corchete entre 2 puntos + Δ calculado).

### 3.3 Colocación por click
- En los charts, añadir `onClick={handleChartClick}`. Recharts entrega `{ activeLabel, activePayload, chartX, chartY }`.
- Cuando el modo "añadir anotación" está activo (toggle en el panel), el click crea una anotación nueva anclada a `activeLabel` (x) y al valor de la serie (y), y abre un editor inline para el texto.

### 3.4 Panel UI (en Story → Annotations)
- Botones de tipo: `Text` · `Arrow` · `Box` · `Difference` (estilo freeform).
- Lista de anotaciones existentes con edición (texto, color, hand-drawn, mover, borrar).
- Para `difference`: seleccionar 2 puntos → calcula y muestra el delta automáticamente.

### 3.5 Integración IA (opcional, alto valor)
- `chartStory.js` ya detecta outliers (IQR) y picos. Extender la respuesta con `suggested_annotations: [{x, y, text}]`.
- Botón "Sugerir anotaciones" que las inserta como `type: 'text'`.

### 3.6 Export
- `html2canvas-pro` (en `exportChart.js`) ya captura el DOM/SVG; verificar que la capa SVG de anotaciones se incluye en el PNG (debe, al ser parte del `chartRef`).

**Verificación**: colocar un callout sobre un pico haciendo click; flecha apuntando a un punto; difference entre dos meses mostrando Δ%; exportar PNG y confirmar que las anotaciones salen.

**Riesgo**: alto (coordenadas + interacción). Mitigación: empezar solo con `type: 'text'` ancltado por click; añadir arrow/box/difference después.

---

## FASE 4 — Style++ (estética premium) ✅ PARCIAL (2026-06-24)

**Objetivo**: gradiente, light/dark por gráfico, estilos de tarjeta, brand palette, logo.

> **Nota de implementación**: hecho **4.1** (toggle `fillStyle` gradient/solid para área) y **4.3** (estilos de tarjeta: `cardStyle` con sombra, radio y fondo en gradiente, vía `cardCss` en DataVisualizer + sección Card en el panel Style). **Pendientes**: 4.2 light/dark por gráfico (requiere override de variables CSS), 4.4 brand palette (toca backend `~/.amoxsql/config.json`), 4.5 logo. Build verificado.

**Archivos**: `constants.js`, `panels/StylePanel.jsx` (ex-ThemePanel), `DataVisualizer.jsx` (contenedor), `renderers/ChartRenderer.jsx` (fill).

| # | Feature | Config nueva | Render |
|---|---|---|---|
| 4.1 | Fill sólido/gradiente | `fillStyle: 'solid'\|'gradient'` | `<defs><linearGradient>` (ya en fase 0 para área; exponer como opción) |
| 4.2 | Light/Dark por gráfico | `themeMode: 'inherit'\|'light'\|'dark'` | Override de variables de tema en el contenedor del chart |
| 4.3 | Estilos de tarjeta | `cardStyle: { background, gradient, shadow, radius }` | Extender `bgStyle`/`borderCss` en `DataVisualizer.jsx:133-151` |
| 4.4 | Brand palette | `brandColors: []` persistida en `~/.amoxsql/config.json` vía `/api/settings` | Nuevo tab "Brand" en el selector de paleta |
| 4.5 | Logo / marca de agua | `logo: { src, position, opacity }` | `<img>` absoluto en una esquina del `chartRef` |

**Riesgo**: medio. 4.4 toca backend (settings); el resto es CSS/SVG.

---

## FASE 5 — Tipos de gráfico nuevos ✅ PARCIAL (2026-06-24)

**Objetivo**: cobertura ejecutiva. Orden por valor narrativo.

> **Nota de implementación**: hecho **5.1 Waterfall** (bridge acumulativo con barra base transparente + barra de delta, color por signo, tooltip propio) y **5.3 Pie** (donut con `innerRadius=0`). **Pendientes**: 5.2 KPI card / Bullet y 5.4 Slope (componentes custom mayores). Build verificado.

**Archivos**: `constants.js` (registro `CHART_TYPES`), `renderers/ChartRenderer.jsx` (nuevos bloques), `panels/ChartTypeSelector.jsx` (iconos).

| # | Tipo | Notas de implementación |
|---|---|---|
| 5.1 | **Waterfall** | `ComposedChart` con barras invisibles de base + barras de delta; color por signo (verde sube / rojo baja). El más pedido para storytelling financiero. |
| 5.2 | **KPI card / Bullet** | Componente propio (no Recharts): número grande + sparkline + barra actual-vs-meta. Reutiliza `HeadlineOverlay` + mini `LineChart`. |
| 5.3 | **Pie** | Caso de `donut` con `innerRadius=0`. Trivial: exponer en el selector. |
| 5.4 | **Slope** | `LineChart` de 2 categorías X con labels directos en ambos extremos. |

**Riesgo**: medio (waterfall y bullet son custom). 5.3 es trivial.

---

## FASE 6 — Export ampliado ✅ PARCIAL (2026-06-24)

**Objetivo**: SVG, portapapeles, PPTX, dentro de la pestaña Export de la fase 1.

> **Nota de implementación**: hecho **6.2 Clipboard** (`copyChartToClipboard` vía html2canvas → `ClipboardItem`, copia la tarjeta completa con título/takeaway; botón "Copy chart as image" + feedback de éxito). **Pendientes**: 6.1 SVG (requiere inlinear estilos porque el SVG de Recharts usa variables CSS que no resuelven en un archivo standalone) y 6.3 PPTX (dependencia `pptxgenjs` sujeta a la cuarentena de 24h de pnpm). Build verificado.

**Archivos**: `utils/exportChart.js`, `panels/ExportPanel.jsx`.

| # | Feature | Implementación |
|---|---|---|
| 6.1 | SVG | Serializar el `<svg>` de Recharts (vectorial, escalable) en vez de rasterizar |
| 6.2 | Clipboard | `navigator.clipboard.write([new ClipboardItem({'image/png': blob})])` desde el canvas existente |
| 6.3 | PPTX | Lib `pptxgenjs` (revisar cuarentena pnpm 24h + `allowBuilds`); 1 slide con la imagen + título/takeaway como texto |

**Riesgo**: medio. PPTX añade dependencia (validar política de seguridad pnpm del proyecto).

---

## Orden recomendado de ejecución

1. **Fase 0** (pulido) → impacto visual inmediato, sin riesgo.
2. **Fase 1** (reorg) → mejora la UX de edición, base para todo lo demás.
3. **Fase 2** (story text) → narrativa con lo que la IA ya genera.
4. **Fase 3** (anotaciones) → el diferenciador (entregar primero solo `text`).
5. **Fases 4–6** según prioridad de negocio.

Las fases 0–3 cubren ~80% del salto de calidad percibida.

## Cambios acumulados a `DEFAULT_CONFIG`
```
takeaway, tooltipMode, rightYAxisDomain, annotations,
fillStyle, themeMode, cardStyle, brandColors, logo
```
Todos con migración de default en `useChartState.js → LOAD_CONFIG` para no romper `.amoxvis` existentes.
