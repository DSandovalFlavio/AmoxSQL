# Plan — Compatibilidad con Word/PowerPoint + formato de presentación "Amox Deck"

> Plan de implementación detallado para dos características relacionadas: (1) exportar un Notebook a **Microsoft Word (.docx)** editable, y (2) **Report Flow** — un nuevo formato de **presentación** (archivos `.amoxdeck`: markdown + layout + gráficos referenciados y **refrescables** desde su SQL) con export a **PowerPoint (.pptx)** editable. Incluye veredicto de viabilidad. Fecha: 2026-07-04.

### Decisiones tomadas (2026-07-04)
- **Nombre:** la sección/funcionalidad se llama **"Report Flow"**; los archivos son **`.amoxdeck`**.
- **Orden:** empezar por **Fase 1 (Word de notebooks)**, luego el deck + PPT.
- **Gráficos en PPT:** **nativo editable por defecto** (tipos soportados) **+ toggle "exportar como imagen"** por gráfico para fidelidad exacta.
- **Formato del deck:** markdown-first (recomendado).

---

## 1. Contexto y problema

AmoxSQL es local: los análisis se **presentan/envían**. Hoy la única salida "presentable" es un **HTML autocontenido** (`generateHtmlReport.js`, gráficos como PNG) y un PDF rasterizado. Dos fricciones reales:

1. **Word:** no hay forma de llevar un análisis a un `.docx` editable (texto + tablas + gráficos) que la gente pueda pegar/editar en sus reportes.
2. **PowerPoint:** el problema clásico — se envía un reporte y para actualizar las gráficas hay que **volver a correr todo el análisis**. La idea del usuario: si la presentación guarda las **queries** asociadas a cada gráfico, basta **re-ejecutar el SQL en AmoxSQL** (con las variables actuales) para **refrescar** los gráficos, sin rehacer el análisis. Y luego exportar a PPT **editable**.

---

## 2. Veredicto de viabilidad (TL;DR)

**Ambas son viables, y la de PowerPoint es especialmente fuerte.**

- **Notebook → Word (.docx):** ✅ viable con la librería `docx` (JS puro, OOXML nativo). Texto (celdas markdown) y **tablas** quedan **100% nativos y editables**; los **gráficos van como imagen PNG** de alta resolución (reutilizando el `chart→PNG` que ya existe). Word editable de charts no es práctico vía JS — imagen es la respuesta honesta.
- **Presentación + PowerPoint (.pptx):** ✅ viable con `pptxgenjs` (JS puro). Aquí está lo bueno: **pptxgenjs genera gráficos NATIVOS y editables de PowerPoint** (bar, line, area, pie/donut, scatter, bubble, combo) a partir de los **datos** de la query. Entonces la idea de "traer las queries y refrescar" encaja perfecto: re-ejecutas el SQL → datos nuevos → gráfico nativo editable en el PPT (el destinatario puede tocar los datos en PowerPoint). Los tipos que PPT no soporta nativo (heatmap, treemap, funnel, waterfall) van como imagen. Texto → cuadros de texto nativos; tablas → tablas nativas.

**Diferenciador real:** el modelo "presentación = markdown + gráficos con SQL refrescable → PPT con gráficos nativos" resuelve el dolor de reportes desactualizados y da entregables editables. No conozco muchas herramientas locales que hagan esto bien.

**Caveats honestos** (detallados en §7): la fidelidad markdown→Office cubre el subconjunto común (headings, listas, negritas, código, tablas, imágenes); math (KaTeX) y Mermaid van como imagen; los gráficos nativos de PPT son **buenas aproximaciones editables** pero no reproducen todos los overlays de storytelling de AmoxSQL (anotaciones, líneas de tendencia/meta, KPI headline) — para fidelidad exacta se ofrece la opción "imagen".

---

## 3. Feature 1 — Notebook → Word (.docx)

### 3.1 Diseño
Nuevo `client/src/utils/generateWordReport.js` (paralelo a `generateHtmlReport.js`), cargado **lazy** solo al exportar. Recorre las celdas del notebook (`parseNotebookContent`, `notebookParser.js:11`) y produce un `.docx` con la librería `docx`:

| Celda / elemento | Salida en Word |
|---|---|
| Markdown | Párrafos con estilos (Heading 1–6, negrita/itálica/código, listas, blockquote, links, imágenes) — mapeador **mdast → docx** (remark parsea; recorremos el árbol). |
| Tabla de resultados (`cell.state.result.data`) | **Tabla nativa de Word** (editable), con encabezado y filas (cap configurable, p.ej. 100 filas). |
| Gráfico (`cell.state.chartConfig`) | **Imagen PNG** vía `captureCellChartAsImage()` (`generateHtmlReport.js:57`, html2canvas-pro, scale 2) → `ImageRun`. |
| Código SQL (opcional) | Párrafo monospace (respeta el toggle "hide code" que ya existe). |

### 3.2 Enganche UI
Botón **"Export → Word"** junto al "Export HTML" del toolbar de `SqlNotebook.jsx` (~línea 462). Mismo patrón async (Blob + download link). También un ítem "Export to Word" en el menú del explorador para `.sqlnb`.

### 3.3 Reutilización
- `parseNotebookContent` / `serializeNotebookContent` (`notebookParser.js`).
- `captureCellChartAsImage()` (chart→PNG) — **clave, ya existe**.
- El mapeador markdown que ya tenemos (podemos derivar el mdast con remark, igual que en el preview nuevo).

### 3.4 Caveat
Charts en Word = **imagen** (no editable como datos). Nativo-chart-en-Word vía JS no es maduro; se deja como "futuro/stretch".

---

## 4. Feature 2 — "Report Flow" (`.amoxdeck`) + gráficos refrescables + PPT

### 4.1 Formato (recomendado: **markdown-first**, estilo slides)
Un archivo **`.amoxdeck`** que es **markdown**, con:
- **Front-matter YAML** a nivel deck: `title`, `theme`, `aspect` (16:9), y **`variables:`** (mapa `{{var}}` reutilizando el mecanismo de los notebooks).
- **Slides separados por `---`** (regla horizontal) — modelo simple y conocido; el texto es literalmente markdown (editable, AI-writable, diff-friendly). Justo lo que pediste: "el texto markdown, layout de unos pocos, y referenciar un amoxvis".
- **Layout por slide** vía un mini front-matter o directiva (`<!-- layout: title -->`), con **pocos layouts**: `title`, `content`, `content-chart` (texto izq + gráfico der), `chart-full`, `two-col`.
- **Gráfico embebido** vía bloque cercado explícito:
  ```
  ```amoxchart
  src: charts/ventas_mensuales.amoxvis
  # opcional: overrides de config o de query/variables
  ```
  ```
  (alternativa: `![chart](./charts/x.amoxvis)` — ya tratamos los enlaces `.amoxvis` especial; se puede renderizar inline).

> Por qué markdown-first y no JSON: encaja con tu enunciado, es editable a mano y por la AI, y **reutiliza directamente el `MarkdownPreview` nuevo** (solo añadimos el componente que renderiza el bloque `amoxchart`). Un JSON estructurado (slides array) da más control de layout pero pierde la simpleza; se puede migrar después si hace falta.

### 4.2 Dónde vive
- **Nuevo tipo de archivo `.amoxdeck`** en el ruteo: `App.jsx:629` (detección de `type`) y `EditorPane.jsx:290` (`isDeck`).
- **Nuevo componente `DeckEditor.jsx`** (paralelo a `MarkdownEditor.jsx`) con 3 vistas: **Edit** (Monaco markdown), **Present** (slides renderizados), **Export**. Reutiliza `MarkdownPreview` para el contenido de cada slide + el componente `AmoxChartEmbed`.
- **Creación:** File Explorer → "New → Deck"; y un botón **"Send to Deck"** desde el Notebook / desde Story Flow (arma un slide con el gráfico actual).

### 4.3 Gráficos refrescables (el corazón de la idea)
Cada `amoxchart` referencia un `.amoxvis` (config + query). El deck tiene botón **"Refresh all"**:
1. Lee cada `.amoxvis` referenciado (`GET /api/file`).
2. Sustituye `{{var}}` de las **variables del deck** en la query (mismo mecanismo que notebooks, `NotebookCell.jsx:269`).
3. Ejecuta vía `POST /api/query` (ya lo hace `AmoxvisPane.jsx:42`).
4. Re-renderiza el gráfico con los datos nuevos (`DataVisualizer` en `isReportMode`).

Resultado: un deck guardado **siempre muestra datos actuales** sin rehacer el análisis. Exactamente tu insight.

### 4.4 Export a PowerPoint (`pptxgenjs`)
Nuevo `client/src/utils/generatePptxReport.js` (lazy). Por cada slide:
- **Texto markdown** → `slide.addText(...)` con rich text (headings como runs grandes, negrita/itálica, viñetas). **Editable nativo.**
- **Tablas** → `slide.addTable(...)`. **Editable nativo.**
- **Gráficos:**
  - Tipos soportados nativo → `slide.addChart(type, data, opts)` mapeando config (título, series, colores, ejes). **Gráfico nativo editable** con datos embebidos.
  - Tipos no soportados → **imagen PNG** (`captureCellChartAsImage` sobre un render offscreen) via `slide.addImage`.
- **Layout** → los pocos layouts se mapean a coordenadas de pptx (título arriba, contenido izq, gráfico der, etc.).

### 4.5 Export a Word del deck
El mismo deck puede exportarse a `.docx` (reusando Feature 1): slides → secciones; charts como imagen.

---

## 5. Mapa de tipos de gráfico → Office

| Tipo AmoxSQL | PowerPoint (pptxgenjs) | Word (docx) |
|---|---|---|
| bar / bar-stacked / bar-100 | **Nativo** (bar, stacked/percentStacked) | Imagen |
| bar-horizontal / -stacked / -100 | **Nativo** (bar `barDir:'bar'`) | Imagen |
| line | **Nativo** (line) | Imagen |
| area | **Nativo** (area) | Imagen |
| combo (bar+line) | **Nativo** (multi-series) | Imagen |
| donut / pie | **Nativo** (doughnut/pie) | Imagen |
| scatter | **Nativo** (scatter) | Imagen |
| bubble | **Nativo** (bubble) | Imagen |
| heatmap / treemap / funnel / waterfall | **Imagen** (PNG) | Imagen |

Por cada gráfico: default **nativo** si es soportado, con un **toggle "exportar como imagen"** cuando se quiera fidelidad pixel-perfect a los overlays de storytelling de AmoxSQL.

---

## 6. Arquitectura / reutilización

**Se reutiliza (no se reescribe):**
- `captureCellChartAsImage()` — chart→PNG (`generateHtmlReport.js:57`). Se generaliza a un **render offscreen** (montar `DataVisualizer` en un contenedor oculto, capturar, desmontar) para exportar gráficos que no están en pantalla.
- `parseNotebookContent` / `serializeNotebookContent` (`notebookParser.js`).
- `AmoxvisPane` refresh (`.amoxvis` → `/api/query` → datos) (`AmoxvisPane.jsx:42-85`).
- `DataVisualizer` `isReportMode` + `ChartRenderer` (render desde config+data).
- `MarkdownPreview` (nuevo) — base del renderizado de slides.
- Sustitución `{{var}}` de notebooks.

**Nuevo:**
- `client/src/utils/generateWordReport.js`, `generatePptxReport.js`, `officeChartMapper.js` (config AmoxSQL → chart nativo pptx / mdast → docx).
- `client/src/components/deck/DeckEditor.jsx`, `SlidePreview.jsx`, `AmoxChartEmbed.jsx`, `deckParser.js`.
- `client/src/utils/offscreenChartRender.js` (harness de captura).
- Ruteo de `.amoxdeck` en `App.jsx` y `EditorPane.jsx`.

**Dependencias (lazy-load al exportar):** `docx`, `pptxgenjs`. (`html2canvas-pro`, `remark`, `recharts` ya están.)

---

## 7. Caveats / riesgos (honesto)

1. **Fidelidad markdown→Office:** cubrimos el subconjunto común. Casos que van como **imagen**: fórmulas KaTeX, diagramas Mermaid, y cualquier bloque complejo. Listas anidadas y tablas complejas requieren cuidado en el mapeador.
2. **Gráficos nativos de PPT ≠ 100% fidelidad visual:** pptxgenjs reproduce el gráfico base (tipo, series, colores, ejes, título) pero **no** todos los overlays de storytelling de AmoxSQL (anotaciones, ref/goal/trend lines, KPI headline, temas de color avanzados). Por eso el toggle "exportar como imagen" para fidelidad exacta. Es un tradeoff editable-vs-fiel, no una limitación oculta.
3. **Render offscreen:** capturar gráficos que no están en pantalla necesita montarlos temporalmente en el DOM (oculto) y esperar a que Recharts pinte antes de `html2canvas`. Añade complejidad y algo de latencia en export.
4. **Tamaño de bundle:** `docx`+`pptxgenjs` ~ varios cientos de KB; **lazy-load** obligatorio (solo al exportar).
5. **Word charts = imagen** (no editable como datos). Es la respuesta honesta hoy.
6. **Variables/refresh:** requiere que las queries usen `{{var}}` para ser parametrizables; queries hardcodeadas se refrescan igual pero sin variar parámetros.

---

## 8. Plan por fases

**Fase 1 — Notebook → Word (rápida, alto valor, independiente):**
- `generateWordReport.js` (mdast→docx + tablas nativas + charts imagen) + botón en `SqlNotebook`.
- Entrega: `.docx` editable de cualquier notebook.

**Fase 2 — Cimientos del deck:**
- `deckParser.js` (front-matter + split por `---` + directivas de layout + bloques `amoxchart`).
- `DeckEditor.jsx` (Edit/Present) reusando `MarkdownPreview` + `AmoxChartEmbed` (render live del `.amoxvis`).
- Ruteo `.amoxdeck`. Creación desde File Explorer.

**Fase 3 — Refresh de gráficos:**
- "Refresh all" (leer `.amoxvis` → sustituir `{{var}}` → `/api/query` → re-render). Variables del deck en front-matter.
- `offscreenChartRender.js`.

**Fase 4 — Export a PowerPoint:**
- `officeChartMapper.js` (config → chart nativo pptxgenjs) + `generatePptxReport.js` (texto/tablas/charts nativos + imagen fallback + layouts).

**Fase 5 — Pulido:**
- Export del deck a Word; toggle nativo/imagen por gráfico; "Send to Deck" desde Notebook/Story Flow; plantillas de layout.

---

## 9. Decisiones (resueltas)

1. **Nombre:** ✅ **"Report Flow"**, archivos **`.amoxdeck`**. (Distinto de Story Flow = viz y Data Flow = chains.)
2. **Formato:** ✅ markdown-first.
3. **Gráficos en PPT:** ✅ nativo-editable por defecto + toggle a imagen por gráfico.
4. **Orden:** ✅ Fase 1 (Word de notebooks) primero, luego el deck + PPT.

Pendiente menor a decidir en implementación: layouts concretos del deck (título, content, content-chart, chart-full, two-col) y la sintaxis final del bloque `amoxchart`.

---

## 10. Recomendación
- **Empezar por Fase 1 (Word de notebooks):** valor inmediato, riesgo bajo, y construye el mapeador markdown→Office y el pipeline de charts→imagen que el deck también usa.
- **Luego el deck (Fases 2–4)** con el modelo markdown-first + gráficos refrescables + PPT nativo. Es la parte diferenciadora y la que resuelve el dolor de "reportes desactualizados".
- Diseñar el mapeador de charts (config → pptx nativo) y el harness offscreen como piezas compartidas desde el inicio.
