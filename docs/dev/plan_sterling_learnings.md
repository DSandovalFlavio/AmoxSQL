# Plan: Aprendizajes de Sterling → AmoxSQL

> **Estado**: propuesto (2026-07-22) · **Iniciativa**: integrar aprendizajes del design system [Sterling](https://github.com/LaMatemaga/sterling) de **La Matemaga** en el theming de AmoxSQL y en Story Flow (visualización + storytelling), con crédito visible a su proyecto.
>
> **Crédito**: Sterling — *"A palette and plug-and-play React/MDX figure system for editorial data stories"* — fue concebido, dirigido artísticamente y revisado por [La Matemaga](https://www.lamatemaga.com/sterling). Licencia MIT (© 2026 La Matemaga). Todo lo que se adopte aquí debe llevar atribución visible en UI y docs.

---

## Parte 1 — Auditoría de Sterling (qué hace y por qué es bueno)

Repo auditado completo (≈2,700 líneas de fuente TS/TSX/CSS). Hallazgos por área:

### 1.1 Sistema de color (src/palette.ts, src/styles.css)

- **8 categóricos con nombre** (Violet, Teal, Orchid, Amber, Blue, Coral, Moss, Payne) × **3 modos**: light, dark y **print**. No es "una paleta": cada color existe en tres calibraciones.
- **Paleta paralela de leyendas** (la gran idea): cada categórico tiene un gemelo "texto" — más oscuro en light, más claro en dark — para que las etiquetas de leyenda sean legibles como texto. La marca usa `--sterling-cat-N`, el texto de su leyenda usa `--sterling-legend-N`. Marca ≠ texto.
- **Rampas**: secuencial mono-hue (10 stops), divergente (11 stops, violeta ↔ teal **con semántica de marca**: violeta=positivo, teal=negativo), heat multi-hue (11), y **una rampa secuencial por familia categórica** (8 × 7 stops).
- **Decisiones documentadas en el código**: la banda de rampas va de 200–800 y no 100–950 porque el extremo 900–950 es casi plano en luminancia (Δ 0.014) y el 100 casi desaparece contra la superficie (contraste 1.11). Este nivel de justificación es el estándar a imitar.
- **Todo se expone como CSS variables** (`--sterling-*`) scoped al figure — un mismo SVG responde al cambio de tema sin re-render.
- **Accesibilidad cromática como contrato**: la paleta completa pasa simulaciones de protanomalía/deuteranomalía/tritanomalía/acromatomalía; para dicromacia total hay **subconjuntos validados** (6 colores protanopia, 7 deuteranopia/tritanopia, 4 acromatopsia). Regla editorial: color nunca como única pista — acompañar con forma, posición, etiqueta directa o leyenda clara.

### 1.2 Figure shell editorial (src/SterlingFigure.tsx, styles.css)

El gráfico solo dibuja datos; `SterlingFigure` es dueño del **contrato editorial**:
- **Labels** superiores en mono uppercase: `labelPrimary` (tipo de gráfico) / `labelSecondary` (rol de lectura/encoding). Tags editoriales, no hashtags.
- **Título como afirmación** en serif display, con **punto final "QED" en color de acento** (el título se escribe sin punto; el sistema lo aporta — opcionalmente como link a home).
- **Subtítulo factual** (qué se calculó, alcance) que además hospeda la leyenda inline.
- **Caption estructurado**: `Fuente: X` (label localizado ES/EN) + **firma** portable `Hecho por <autor> con Sterling ✦` (helper `sterlingCredit`, removible — "attribution default, not a lock-in").
- **Tamaños de lectura**: compact / medium / wide / full (max-width según el ritmo editorial).
- Header / área de chart / caption viven en **superficies distintas** (paper vs surface) separadas por borde — jerarquía visual sin pesos tipográficos gritones.

### 1.3 Leyenda inline (src/SterlingLegend.tsx)

La leyenda **vive dentro de la frase del subtítulo**, tejida con `Intl.ListFormat` ("…comparando ●Setosa, ●Versicolor y ●Virginica"). Cada ítem: marca SVG (círculo/cuadrado/triángulo/línea — **forma como pista redundante**) + label en su color de leyenda (el gemelo legible). Regla de AGENTS.md: "keep categorical legends in the subtitle; do not add a detached legend unless explicitly requested".

### 1.4 Tokens ópticos compartidos (src/visualStyle.ts)

Una sola escala de grosores y opacidades con **nombres semánticos** para todo el catálogo:
- Strokes: `grid 1 → detail 1.5 → mark 2 → series 2.25 → emphasis 2.5` (+ especiales: interval 7, halo 3).
- Opacidades: `ghost .04 → contour .08 → area .24 → relationship .42 → secondaryMark .66 → guide .7 → signal .84`.
- Filosofía explícita: *"data marks lead, axes and construction lines recede"*. Un cambio de token propaga consistencia a todos los charts.

### 1.5 Gramática de ejes unificada (src/plot.tsx)

Un único fundamento cartesiano: ticks en **fuente mono 11px color muted**, títulos de eje 12px, gridlines del token de tema, dominios `nice()`, **anclaje a cero para magnitudes** (`zero: true` en barras), padding 5% para dispersiones, ticks de tiempo adaptativos (~1 cada 96px — nunca colisionan). Regla del repo: "keep all chart geometry inside primitives, and keep editorial decisions in the figure".

### 1.6 Tipografía editorial

Tres roles: **display serif** (Fraunces SemiBold) para títulos, sans para subtítulo, **mono (JetBrains Mono) para TODO lo que es dato** — ticks, labels, valores, captions, tags. El mono-para-datos es una firma editorial fuerte y práctica (números tabulares, alineación). Fuentes bundled bajo OFL con NOTICE.

### 1.7 Integridad de datos y export (src/dataExport.ts, SterlingFigureActions.tsx)

- `dataExport={{ rows }}` = las **filas procesadas exactas** que renderiza la figura, descargables como CSV — "inspectable without asking readers to reverse-engineer pixels". Nunca pretende ser el dataset fuente original.
- Acciones compactas: Copy image (siempre visible) + menú (PNG, CSV, Web Share).
- Workflow determinista para assets de decks (fixture + render route + Playwright pinneado) en docs/agent-workflows.md.

### 1.8 Contrato para agentes de IA (AGENTS.md)

Reglas editoriales para que una IA genere figuras sin inventar: preguntar **tarea de lectura** / procedencia de datos / encoding / copy / medio final ANTES de elegir gráfico; título = claim sin punto final; subtítulo factual (nunca relleno decorativo); jamás inventar claims, fuentes ni significados de categoría; color nunca como única pista; declarar defaults cuando una pregunta no es bloqueante.

---

## Parte 2 — Qué aplica a AmoxSQL (análisis cruzado)

Mapa del estado actual (auditado): temas UI en `client/src/index.css` (bloques por clase en `<body>`, doble capa modo+tema), registro en `SettingsModal.jsx:31-42` + `App.jsx:230-246` + `theme.js`; paletas de Story Flow en `DataVisualizer/constants.js:2-32` (`COLOR_PALETTES`, 19 paletas planas sin conciencia de modo); leyenda = solo posición (`legendPosition`, píldoras custom en `ChartRenderer.jsx:146-189`); storytelling ya fuerte (title/subtitle/takeaway/footnote/annotations/headline/goal-ref-trend lines en `StoryPanel.jsx`); export PNG/clipboard/.amoxvis (`exportChart.js`); "figure" inline en `DataVisualizer.jsx:433-525`.

| Idea de Sterling | Estado en AmoxSQL | Encaje |
|---|---|---|
| Temas de superficie violeta light/dark | No existen | **Directo** — 2 temas nuevos (pedido explícito) |
| Paletas categóricas light/dark + rampas | 19 paletas planas, ninguna con par light/dark ni crédito | **Directo** — grupo "Sterling" en el picker |
| Criterios de calidad de paleta (calibración por modo, banda útil, contraste contra superficie, CVD) | Las 19 paletas existentes son listas de hex sin validación documentada | **Alto valor** — auditar y mejorar TODO el catálogo con los criterios Sterling |
| Paleta de leyenda (gemelo legible) | Leyenda usa el mismo color de la marca | **Alto valor** — legibilidad inmediata |
| Leyenda inline en el subtítulo | Solo top/bottom/left/right/none | **Alto valor** — nueva opción `inline` |
| Figure shell (fuente + firma + tags + QED) | Hay title/subtitle/takeaway/footnote; no hay campo "fuente" dedicado, ni firma, ni tags | **Alto valor** — eleva el export a nivel publicación |
| CSV de filas procesadas del chart | Export de datos existe a nivel query, no a nivel figura | **Medio** — botón en ExportPanel |
| Tokens ópticos semánticos | Valores ad-hoc dispersos en ChartRenderer | **Medio** — refactor de consistencia |
| Contrato IA editorial | `chartStory.js` genera títulos/insights sin reglas editoriales explícitas | **Medio** — endurecer el prompt |
| Modo print de paleta | No existe concepto | Backlog |
| Subconjuntos daltonismo | No documentado por paleta | Backlog (documentar en la guía) |

**Principio rector** (de Sterling, adoptable tal cual): *el chart dibuja datos; el marco es dueño de la editorial*. Story Flow ya separa stages — esto refuerza esa arquitectura.

---

## Parte 3 — Plan de implementación

### Fase 1 — Temas de UI: Sterling Dark + Sterling Light

Los 4 sitios exactos: (1) bloques nuevos en `index.css` (patrón `.theme-amoxdark:852` / `.theme-amoxlight:1476`), (2) `'sterlinglight'` en `LIGHT_THEMES` (`theme.js:13`), (3) lista de limpieza `App.jsx:234`, (4) entradas en `THEMES` (`SettingsModal.jsx:31-42`). Monaco se ajusta solo (lee CSS vars). El tema light entra también a los selectores de accent-claro (`index.css:1566-1661`).

**Mapeo propuesto** (afinable al verlo en vivo):

| Token AmoxSQL | Sterling Dark | Sterling Light |
|---|---|---|
| `--surface-base` | `#120d1f` (paper) | `#f6f3fb` (paper) |
| `--surface-raised` | `#1d1530` (surface) | `#fbf9fe` (surface) |
| `--surface-overlay` | `#271c40` (surface-2) | `#ffffff` |
| `--surface-inset` | `#0c0817` | `#e2dbf0` (surface-2) |
| `--border-subtle` | `#36284e` (grid) | `#d9d1e6` (grid) |
| `--border-default` | `#3a2b55` (edge) | `#cfc5de` (edge) |
| `--border-strong` | `#4d357a` | `#b9aed0` |
| `--text-primary` | `#ede9f5` | `#241a3d` |
| `--text-secondary` | `#a99fc4` (muted) | `#5c5178` (muted) |
| `--text-tertiary` / `-disabled` | `#8b7fa8` / `#5c5178` | `#7d719c` / `#a99fc4` |
| accent default (`:not([class*="accent-"])`) | `#c4b5fd` (period) | `#7c5ce0` (period) |

**Sintaxis** desde la paleta categórica (dark usa `cat` dark; light usa la paleta *legend* light — los gemelos oscurecidos legibles): keyword violet (`#b69af2`/`#6945b8`), string teal (`#5ec9ae`/`#147568`), number amber (`#f2c46d`/`#855700`), function blue (`#86a8e8`/`#365da5`), type orchid (`#e88bdd`/`#a43a99`), constant coral (`#f29a88`/`#a94230`), operator payne (`#b7c8d1`/`#445762`), comment muted. Feedback: success=teal, error=coral, warning=amber, info=blue (familias × `-bg/-border/-text`). `--type-*` desde las mismas familias. En `THEMES`: `desc: 'Sterling · by La Matemaga'` — **crédito visible en el selector**.

### Fase 2 — Paletas Sterling en Story Flow

- Añadir a `COLOR_PALETTES` (`constants.js:2`): `sterling` (8 categóricos light), `sterlingDark` (8 dark), `sterlingSequential` (10), `sterlingDiverging` (11), `sterlingHeat` (11). Hex exactos de `src/styles.css` de Sterling (capturados en Parte 1 / commit).
- Nuevo grupo en `paletteGroups` (`ThemePanel.jsx:39-45`): **"Sterling — by La Matemaga"**, con nota/tooltip de crédito y link al repo en la guía de Story Flow (`StoryFlowGuide.jsx`).
- Registrar también la **paleta de leyendas** Sterling (par marca→texto) como dato interno para la Fase 3 (no como paleta seleccionable).
- Nota `.amoxvis`: `colorTheme` guarda solo el nombre → los nuevos nombres son estables desde el día 1; un `.amoxvis` viejo no se ve afectado.

### Fase 3 — Leyendas editoriales

1. **Colores de texto de leyenda** (gemelo legible): para paletas con par definido (las Sterling), `CustomLegend` (`ChartRenderer.jsx:146-189`) usa el color-texto para el label y el color-marca para el punto. Para paletas sin par, fallback actual.
2. **Leyenda inline**: nueva opción `legendPosition: 'inline'` (`DetailPanel.jsx:137-148`) — la leyenda se teje en la línea del subtítulo (`DataVisualizer.jsx:463-472`) con marcas de color + `Intl.ListFormat` (locale del usuario). Sin subtítulo escrito, genera solo la frase de leyenda.
3. **Forma como pista redundante** (opcional, checkbox): marcas círculo/cuadrado/triángulo/línea por serie, tanto en leyenda inline como en píldoras.

### Fase 4 — Mejorar las paletas existentes con los criterios Sterling

Aplicar la vara de calidad de Sterling al catálogo actual de 19 paletas (`COLOR_PALETTES`), no solo añadir las nuevas. Sub-pasos:

1. **Gemelos de leyenda para todas las paletas**: generar el par "texto legible" de cada color (mismo hue, luminancia ajustada en OKLCH: ~más oscuro para superficies claras, ~más claro para oscuras), usando el mecanismo de la Fase 3. Generación asistida por script + **revisión visual a mano** (el criterio Sterling: los valores se justifican, no solo se calculan). Estructura propuesta: `LEGEND_PAIRS = { paletteName: { light: [...], dark: [...] } }` junto a `COLOR_PALETTES`; fallback al color de marca si una paleta no tiene par.
2. **Auditoría de contraste contra superficie**: verificar cada color categórico contra las superficies de chart reales de los temas dark y light (`--surface-base`/`--chart-bg`). Colores que caigan por debajo de un umbral (~1.3:1 tipo Sterling para marcas de área; texto de leyenda ≥4.5:1) se recalibran o se documenta su limitación.
3. **Recorte de bandas muertas en rampas secuenciales** (`blues`, `greens`, `reds`, `purples`, `ylorbr`): aplicar la lección 200–800 — eliminar/ajustar stops extremos casi blancos que desaparecen contra la superficie o stops finales con Δ de luminancia casi nulo entre sí. Documentar el razonamiento en comentario, al estilo Sterling.
4. **Divergentes con centro honesto** (`spectral`, `rdylbu`, `rdylgn`, `piyg`): asegurar que el stop central neutro funcione en ambos modos y documentar la semántica del punto medio (qué significa "cero" en cada rampa).
5. **Pase de accesibilidad CVD sobre las categóricas** (`default`, `vivid`, `set1`, `set2`, `pastel`, `dark2`, `neon`, brand): simular protanopia/deuteranopia/tritanopia; **reordenar** cada paleta para que sus primeros 4–6 colores sean máximamente distinguibles (la mayoría de charts usan pocas series), y documentar subsets seguros en la guía. Ojo: reordenar cambia el render de `.amoxvis` existentes — evaluar si se reordena in-place o se documenta orden recomendado sin romper compatibilidad (decisión en implementación; default conservador: no romper).
6. **Guía de uso por propósito** en `ThemePanel`/`StoryFlowGuide`: cuándo categórica (grupos distintos), secuencial (magnitud ordenada), divergente (alrededor de un punto medio con significado), neutral+highlight (una serie destacada) — el criterio del helper de Tailwind de Sterling, aplicado como texto de ayuda en el picker.

Tooling: script auxiliar de una sola vez (Node, en `scripts/`) para cálculos OKLCH + contraste; los valores finales viven hardcodeados y comentados en `constants.js` (sin dependencia runtime nueva).

**Estado de F4 (implementado):** sub-pasos 1 (gemelos de leyenda para las 19 paletas, `scripts/gen_twins.mjs` → `LEGEND_PAIRS`), 2 (contraste ≥4.5:1 contra superficie, incorporado en la generación) y 6 (guía de propósito en el picker, `PALETTE_PURPOSE`) HECHOS y verificados. Sub-pasos 3 (recorte de bandas muertas en secuenciales), 4 (centro honesto en divergentes) y 5 (reorden CVD) DIFERIDOS a propósito: mutar los hex de las paletas de marca cambiaría la apariencia de charts `.amoxvis` ya guardados por el usuario — contra el principio Sterling de no romper el contrato de lectura. El trabajo de gemelos ya entrega la mayor ganancia de legibilidad sin ese riesgo. Quedan como backlog (idea: exponerlos como paletas nuevas o un toggle "orden CVD-safe" que no altere las guardadas).

### Fase 5 — Figure shell editorial (fuente, firma, tags)

En `DEFAULT_CONFIG` + `StoryPanel.jsx` + render `DataVisualizer.jsx:433-525`:
1. **Campo `chartSource`** dedicado (separado del footnote): caption "Fuente: X" al pie, estilo mono muted — el footnote queda para notas metodológicas.
2. **Firma** configurable: `signature: {visible, author}` → "Hecho por <autor> con AmoxSQL" (patrón `sterlingCredit`; removible, como en Sterling).
3. **Tags editoriales** opcionales sobre el título (mono uppercase): tipo de gráfico / rol de lectura.
4. **Marca de título "QED"** opcional: punto final en color accent (el usuario escribe el título sin punto).
5. **CSV de filas procesadas**: botón en `ExportPanel.jsx` que descarga las filas exactas que el chart renderiza (post agregación/pivot) — no la query original.
Todo entra al `chartRef` → sale en el PNG y en los decks de Report Flow gratis.

### Fase 6 — Tokens ópticos compartidos (DIFERIDA a backlog)

> Decisión (2026-07-22): diferida a propósito. Es un refactor de consistencia de bajo valor visible y alto riesgo de regresión en 15+ tipos de gráfico. Se retoma como su propio PR cuando haya ancho de banda para validar cada tipo en light y dark.

`DataVisualizer/constants.js` (o módulo nuevo `visualStyle.js`): escala semántica de strokes/opacidades estilo Sterling adaptada a Recharts (grid/mark/series/emphasis; ghost→signal). Refactor de `ChartRenderer.jsx` para consumirla en vez de valores ad-hoc. Objetivo: los 15+ tipos de chart leen como un solo sistema.

### Fase 7 — Contrato editorial para la IA

En `server/ai/chartStory.js` (+ prompt de `display_chart` en `ai/tools.js`): reglas estilo AGENTS.md — título = afirmación (sin punto final si la marca QED está activa); subtítulo factual con la leyenda cuando hay encoding categórico; nunca inventar fuentes (si no hay procedencia, dejar `chartSource` vacío); sugerir highlight/neutral en vez de categórico cuando la lectura es "una serie destacada".

### Backlog (registrar en `docs/dev/pendientes.md`)

- Paletas conscientes de modo (par light/dark que conmuta con el tema de la app).
- Modo "print" de paleta ligado a los presets de export PNG.
- Subconjuntos validados para daltonismo por paleta (documentar en StoryFlowGuide; opcionalmente exponerlos como paletas reducidas).
- Fraunces como opción de `FONT_OPTIONS` para display (OFL, vía @fontsource si existe).
- Export HTML de figura (no existe hoy; idea Sterling de figura auto-contenida).

### Orden y entrega

F1 (temas — pedido explícito, riesgo bajo) → F2 (paletas Sterling + crédito) → F3 (leyendas: mecanismo gemelo-texto + inline) → F4 (mejora del catálogo existente — usa el mecanismo de F3) → F5 (figure shell) → F6 (tokens ópticos) → F7 (IA). F1+F2 pueden ir en un mismo PR ("Sterling arrives to AmoxSQL"); F3+F4 son la pareja natural del segundo PR (mecanismo + aplicarlo a todo el catálogo); F5–F7 en PRs separados. Cada fase con verificación en la app (no hay tests).

### Atribución (obligatoria en cada fase)

- En UI: grupo de paletas "Sterling — by La Matemaga"; `desc` de los temas; nota en StoryFlowGuide con link a https://github.com/LaMatemaga/sterling y https://www.lamatemaga.com/sterling.
- En código: comentario de cabecera en los bloques de tema y paletas ("Palette values from Sterling (MIT) © La Matemaga — https://github.com/LaMatemaga/sterling").
- En docs: entrada de CHANGELOG con crédito; mención en README si se considera destacable.
- Los valores/conceptos se **re-implementan** sobre el stack de AmoxSQL (CSS vars propias, Recharts); no se copia código TSX de Sterling. MIT lo permitiría, pero la re-implementación mantiene limpio el árbol de dependencias y el crédito explícito es la moneda real.

---

## Apéndice — Valores exactos de las paletas Sterling (de src/styles.css y src/palette.ts, MIT © La Matemaga)

**Categórica light** (orden: Violet, Teal, Orchid, Amber, Blue, Coral, Moss, Payne):
`#9A79E7 #25A08D #D45AC7 #E4A43A #5A83D7 #E87864 #96AB51 #536B78`

**Categórica dark**:
`#B69AF2 #5EC9AE #E88BDD #F2C46D #86A8E8 #F29A88 #B7C974 #B7C8D1`

**Categórica print**:
`#8E68D8 #218C7C #C653BC #D39A32 #4F73C6 #DC6A55 #879347 #607986`

**Leyenda (texto) light** — gemelos oscurecidos legibles:
`#6945B8 #147568 #A43A99 #855700 #365DA5 #A94230 #5D6F19 #445762`

**Leyenda (texto) dark** — gemelos aclarados:
`#C7B3F7 #78D8C1 #F0A0E7 #F5CB7C #9BB9EF #F6AA9A #C5D486 #C6D5DC`

**Secuencial (10 stops, light; en dark se invierte el orden)**:
`#F1ECFA #D5C3F6 #B69AF2 #A889ED #9A79E7 #8E68D8 #7B59BC #684AA1 #563C87 #4D357A`

**Divergente (11 stops, light; violeta=positivo ↔ teal=negativo)**:
`#4D357A #7B59BC #9A79E7 #B69AF2 #F1ECFA #F6F3FB #E4F4EF #5EC9AE #25A08D #1E796C #164D47`

**Heat (11 stops, light)**:
`#4D357A #684AA1 #4666AF #4F73C6 #218C7C #4E9670 #879347 #B0953A #D39A32 #E4B85C #F5DEA0`

**Heat (11 stops, dark)**:
`#271C40 #4D357A #6A4EAC #5A83D7 #3B97B1 #25A08D #78AE65 #B7C974 #E6C45C #F2C46D #FAE4AE`

**Superficies light**: paper `#F6F3FB` · surface `#FBF9FE` · surface-2 `#E2DBF0` · text `#241A3D` · muted `#5C5178` · grid `#D9D1E6` · edge `#CFC5DE` · period/accent `#7C5CE0`

**Superficies dark**: paper `#120D1F` · surface `#1D1530` · surface-2 `#271C40` · text `#EDE9F5` · muted `#A99FC4` · grid `#36284E` · edge `#3A2B55` · period/accent `#C4B5FD`

**Tokens ópticos** (visualStyle.ts): strokes grid 1 / detail 1.5 / mark 2 / series 2.25 / emphasis 2.5 / interval 7 / halo 3 · opacidades ghost .04 / contour .08 / surface .1 / area .24 / ridge .34 / interval .28 / relationship .42 / secondaryMark .66 / guide .7 / signal .84 / mutedMark .34

(Las 8 rampas por familia — 7 stops c/u en ambos modos — están en `src/styles.css` del repo Sterling si se necesitan para la fase de rampas; no se transcriben aquí por volumen.)
